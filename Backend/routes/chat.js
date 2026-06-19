import express from "express";
import Thread from "../models/Thread.js";
import Analytics from "../models/Analytics.js";
import UserMemory from "../models/UserMemory.js";
import { getOpenAIAPIResponse, getOpenAIStreamingResponse, getOpenAIEmbedding } from "../utils/openai.js";
import { logUsage } from "../utils/cost.js";

const router = express.Router();

const SUMMARY_THRESHOLD = 14;
const RECENT_WINDOW = 6;
const RAG_TOP_K = 3;      // how many of the highest-scoring memories we consider
const RAG_THRESHOLD = 0.4; // minimum cosine similarity for a memory to be injected

// ── Cosine similarity ────────────────────────────────────────────────────────
const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot   += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ── Title generation ─────────────────────────────────────────────────────────
const generateTitle = async (message, userId) => {
    const res = await getOpenAIAPIResponse([
        { role: "system", content: "Generate a short 3-5 word chat title only. No quotes." },
        { role: "user",   content: message }
    ]);
    logUsage(userId, "title", res);
    if (!res.content) return "New Chat"; // degrade gracefully instead of crashing/persisting an error
    return res.content.replace(/["']/g, "");
};

// ── Conversation summarization ───────────────────────────────────────────────
const maybeSummarize = async (thread) => {
    if (thread.messages.length <= SUMMARY_THRESHOLD) return;

    const summarizableCount = thread.messages.length - 1 - RECENT_WINDOW;
    const lastSummarizedCount = thread.summary?.builtFromMessageCount || 0;

    if (!thread.summary || (summarizableCount - lastSummarizedCount) >= 4) {
        const messagesToSummarize = thread.messages.slice(1, 1 + summarizableCount);
        const conversationText = messagesToSummarize
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n\n");

        const summaryRes = await getOpenAIAPIResponse([
            { role: "system", content: "Summarize this conversation in 3-5 concise sentences. Capture key facts, questions, conclusions, and context needed to continue naturally." },
            { role: "user",   content: conversationText }
        ]);
        logUsage(thread.userId, "summary", summaryRes);
        if (!summaryRes.content) return; // summarization failed — skip this cycle, retry on next message

        thread.summary = {
            content: summaryRes.content,
            builtFromMessageCount: summarizableCount,
            createdAt: new Date()
        };
        // Atomic field update — never re-save the whole document (would clobber concurrent message writes)
        await Thread.updateOne({ _id: thread._id }, { $set: { summary: thread.summary } });
        console.log(`[Summary] Thread ${thread.threadId}: compressed ${summarizableCount} messages`);
    }
};

// ── Long-term user profile (single paragraph, always injected) ───────────────
const updateUserProfile = async (userId, thread) => {
    const recentUserMessages = thread.messages
        .filter(m => m.role === "user")
        .slice(-4)
        .map(m => m.content)
        .join("\n");

    let memory = await UserMemory.findOne({ userId });
    if (!memory) memory = new UserMemory({ userId });

    const updatedRes = await getOpenAIAPIResponse([
        {
            role: "system",
            content: `You maintain a short factual profile about a user based on what they share in conversations.
Current profile: "${memory.profile || "No information yet."}"
Read the new messages below and return an updated profile (2-4 sentences max).
Always write in third person (e.g. "Alex is a 22-year-old..."). Never use "you" or "your".
Only include facts the user explicitly stated: name, age, occupation, location, goals, projects, interests.
If nothing new was shared, return the current profile unchanged. Never add assumptions.`
        },
        { role: "user", content: recentUserMessages }
    ]);
    logUsage(userId, "profile", updatedRes);
    if (!updatedRes.content) return; // profile update failed — keep the existing profile unchanged

    memory.profile = updatedRes.content;
    memory.lastUpdated = new Date();
    await memory.save();
    console.log(`[UserMemory] Profile updated for user ${userId}: "${updated.slice(0, 80)}..."`);
};

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/thread", async (req, res) => {
    try {
        const threads = await Thread.find({ userId: req.user.userId }).sort({ updatedAt: -1 });
        res.json(threads.map(t => ({ threadId: t.threadId, title: t.title })));
    } catch {
        res.status(500).json({ error: "Failed to fetch threads" });
    }
});

router.get("/thread/:threadId", async (req, res) => {
    try {
        // Exclude embeddings at the DB level — the client only needs role/content,
        // and the 1536-float vectors would bloat the payload by megabytes.
        const thread = await Thread.findOne(
            { threadId: req.params.threadId, userId: req.user.userId },
            { "messages.embedding": 0 }
        ).lean();
        if (!thread) return res.status(404).json({ error: "Thread not found" });
        const visibleMessages = thread.messages
            .filter(m => m.role !== "system")
            .map(m => ({ role: m.role, content: m.content }));
        res.json({ messages: visibleMessages });
    } catch {
        res.status(500).json({ error: "Failed to fetch thread" });
    }
});

router.delete("/thread/:threadId", async (req, res) => {
    try {
        const deleted = await Thread.findOneAndDelete({ threadId: req.params.threadId, userId: req.user.userId });
        if (!deleted) return res.status(404).json({ error: "Thread not found" });
        res.json({ success: "Thread deleted" });
    } catch {
        res.status(500).json({ error: "Failed to delete thread" });
    }
});

// ── Main chat endpoint ───────────────────────────────────────────────────────
router.post("/chat", async (req, res) => {
    const { threadId, message, debug, regenerate } = req.body;
    if (!threadId || (!regenerate && !message)) return res.status(400).json({ error: "Missing required fields" });

    try {
        // 1 & 2. Resolve the query + ensure the thread/messages are in the right state.
        //    Normal turn: embed the new message and append it atomically ($push so concurrent
        //    requests can't clobber the array). Regenerate: reuse the last user message, drop
        //    the stale assistant reply, and don't append a new turn.
        let thread = await Thread.findOne({ threadId, userId: req.user.userId });
        let messageEmbedding;
        let queryText;

        if (regenerate) {
            if (!thread || thread.messages.length === 0) {
                return res.status(400).json({ error: "Nothing to regenerate" });
            }
            // Remove the previous assistant reply so we don't keep a stale answer.
            if (thread.messages[thread.messages.length - 1].role === "assistant") {
                await Thread.updateOne({ _id: thread._id }, { $pop: { messages: 1 } });
                thread.messages.pop();
            }
            const lastUser = [...thread.messages].reverse().find(m => m.role === "user");
            if (!lastUser) return res.status(400).json({ error: "No user message to regenerate from" });

            queryText = lastUser.content;
            if (lastUser.embedding?.length > 0) {
                messageEmbedding = lastUser.embedding; // reuse stored embedding — no extra cost
            } else {
                const embeddingRes = await getOpenAIEmbedding(queryText);
                messageEmbedding = embeddingRes.embedding;
                logUsage(req.user.userId, "embedding", embeddingRes);
            }
        } else {
            const embeddingRes = await getOpenAIEmbedding(message);
            messageEmbedding = embeddingRes.embedding;
            logUsage(req.user.userId, "embedding", embeddingRes);
            queryText = message;

            const userMessage = { role: "user", content: message, embedding: messageEmbedding };
            if (!thread) {
                const title = await generateTitle(message, req.user.userId);
                try {
                    thread = await Thread.create({
                        threadId,
                        userId: req.user.userId,
                        title,
                        messages: [
                            { role: "system", content: "You are a helpful AI assistant." },
                            userMessage
                        ]
                    });
                } catch (err) {
                    // Another request created this thread first (concurrent first message).
                    if (err.code !== 11000) throw err;
                    await Thread.updateOne(
                        { threadId, userId: req.user.userId },
                        { $push: { messages: userMessage }, $set: { updatedAt: new Date() } }
                    );
                    thread = await Thread.findOne({ threadId, userId: req.user.userId });
                }
            } else {
                await Thread.updateOne(
                    { _id: thread._id },
                    { $push: { messages: userMessage }, $set: { updatedAt: new Date() } }
                );
                thread.messages.push(userMessage);
            }
        }

        // 3. Cross-thread RAG — search ALL of the user's past messages for relevant context
        const allThreads = await Thread.find({ userId: req.user.userId }, "messages threadId");
        const candidates = allThreads.flatMap(t =>
            t.messages
                .filter(m => m.role === "user")
                .map(m => ({ content: m.content, embedding: m.embedding }))
        ).filter(m => m.embedding?.length > 0 && m.content !== queryText);

        // Score every candidate against the query, then rank by similarity
        const scored = candidates
            .map(m => ({ content: m.content, score: cosineSimilarity(m.embedding, messageEmbedding) }))
            .sort((a, b) => b.score - a.score);

        // Selected = the top-K that also clear the similarity threshold
        const topMatches = scored.slice(0, RAG_TOP_K).filter(m => m.score > RAG_THRESHOLD);

        let ragContext = "";
        if (topMatches.length > 0) {
            ragContext = `\n\nRelevant context from past conversations:\n` +
                topMatches.map(m => `- "${m.content}"`).join("\n");
            console.log(`[RAG] Injected ${topMatches.length} semantic matches`);
        }

        // Optional retrieval trace for the RAG Debug View (only built when requested)
        let ragTrace = null;
        if (debug) {
            const reasonFor = (rank, score) => {
                if (rank <= RAG_TOP_K && score > RAG_THRESHOLD) return `Selected — top-${RAG_TOP_K} & ≥ ${RAG_THRESHOLD}`;
                if (rank <= RAG_TOP_K) return `Rejected — in top-${RAG_TOP_K} but below ${RAG_THRESHOLD}`;
                return `Rejected — outside top-${RAG_TOP_K}`;
            };
            const ranked = scored.map((m, i) => ({
                rank: i + 1,
                score: parseFloat(m.score.toFixed(3)),
                content: m.content,
                selected: i < RAG_TOP_K && m.score > RAG_THRESHOLD,
                reason: reasonFor(i + 1, m.score)
            }));
            ragTrace = {
                query: queryText,
                params: { topK: RAG_TOP_K, threshold: RAG_THRESHOLD },
                candidatesScored: scored.length,
                selected: ranked.filter(r => r.selected),
                rejected: ranked.filter(r => !r.selected).slice(0, 3), // a few near-misses
                injectedContext: ragContext.trim(),
                ragUsed: topMatches.length > 0
            };
        }

        // 4. Build system prompt: base + user profile + optional summary + RAG
        const userMemory = await UserMemory.findOne({ userId: req.user.userId });

        let systemPrompt = "You are a highly personalized AI assistant. Use what you know about the user to give relevant, tailored responses.";

        if (userMemory?.profile) {
            systemPrompt += `\n\nWhat you know about this user:\n${userMemory.profile}`;
        }

        if (thread.summary?.content) {
            systemPrompt += `\n\nSummary of earlier conversation:\n${thread.summary.content}`;
        }

        systemPrompt += ragContext;

        // 5. Stream the AI response via SSE.
        //    The dynamic system prompt is assembled in-memory only — it is rebuilt every
        //    request, so there is no need to persist it back onto the document.
        const recentMessages = [
            { role: "system", content: systemPrompt },
            ...thread.messages
                .filter(m => m.role !== "system")
                .slice(-RECENT_WINDOW)
                .map(m => ({ role: m.role, content: m.content }))
        ];

        const ragUsed = ragContext !== "";
        const requestStart = Date.now();
        let ttftMs = null;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // Abort the upstream OpenAI request if the client disconnects mid-stream,
        // so we stop spending tokens/CPU and don't write to a dead socket.
        const upstreamController = new AbortController();
        let clientGone = false;
        req.on("close", () => {
            if (!res.writableEnded) {
                clientGone = true;
                upstreamController.abort();
            }
        });

        // Send the retrieval trace first, so the client can show it alongside the reply
        if (ragTrace && !clientGone) {
            res.write(`data: ${JSON.stringify({ rag: ragTrace })}\n\n`);
        }

        await getOpenAIStreamingResponse(
            recentMessages,
            (token) => {
                if (clientGone) return;
                if (ttftMs === null) ttftMs = Date.now() - requestStart;
                res.write(`data: ${JSON.stringify({ token })}\n\n`);
            },
            async (fullReply, usage, model) => {
                if (clientGone) return; // client disconnected — don't write or persist a partial reply

                // Stream failed or produced nothing — don't persist an empty assistant message.
                // The user's message was already saved before streaming, so it is not lost.
                if (!fullReply || !fullReply.trim()) {
                    res.write(`data: ${JSON.stringify({ error: "No response was generated. Please try again." })}\n\n`);
                    res.end();
                    return;
                }
                const latencyMs = Date.now() - requestStart;
                try {
                    // Atomic append so concurrent requests can't clobber the messages array.
                    // Assistant replies are stored without an embedding — retrieval only searches user messages.
                    await Thread.updateOne(
                        { _id: thread._id },
                        {
                            $push: { messages: { role: "assistant", content: fullReply } },
                            $set:  { updatedAt: new Date() }
                        }
                    );

                    // Background: summarize long threads, then update user profile.
                    // Re-read a fresh copy so these jobs operate on the latest persisted state.
                    Thread.findOne({ _id: thread._id })
                        .then(async (fresh) => {
                            if (!fresh) return;
                            await maybeSummarize(fresh);
                            await updateUserProfile(req.user.userId, fresh);
                        })
                        .catch(err => console.log("[Background] Error:", err));

                    // Record the reply's cost (Usage owns all cost; Analytics owns performance)
                    logUsage(req.user.userId, "reply", { usage, model });

                    // Analytics — fire and forget (latency / TTFT / RAG / tokens)
                    Analytics.create({
                        userId:           req.user.userId,
                        threadId,
                        promptTokens:     usage?.prompt_tokens     || 0,
                        completionTokens: usage?.completion_tokens  || 0,
                        totalTokens:      usage?.total_tokens       || 0,
                        latencyMs,
                        ttftMs:           ttftMs || 0,
                        ragUsed
                    }).catch(err => console.log("[Analytics] Error:", err));

                    res.write(`data: ${JSON.stringify({ done: true, title: thread.title })}\n\n`);
                } catch (err) {
                    console.log("[Chat] Save error:", err);
                    res.write(`data: ${JSON.stringify({ error: "Failed to save reply" })}\n\n`);
                } finally {
                    res.end();
                }
            },
            upstreamController.signal
        );

    } catch (err) {
        console.log(err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Something went wrong" });
        } else {
            res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
            res.end();
        }
    }
});

export default router;
