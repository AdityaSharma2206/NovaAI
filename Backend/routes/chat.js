import express from "express";
import Thread from "../models/Thread.js";
import Analytics from "../models/Analytics.js";
import UserMemory from "../models/UserMemory.js";
import { getOpenAIAPIResponse, getOpenAIStreamingResponse, getOpenAIEmbedding } from "../utils/openai.js";

const router = express.Router();

const SUMMARY_THRESHOLD = 14;
const RECENT_WINDOW = 6;

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
const generateTitle = async (message) => {
    const title = await getOpenAIAPIResponse([
        { role: "system", content: "Generate a short 3-5 word chat title only. No quotes." },
        { role: "user",   content: message }
    ]);
    return title.replace(/["']/g, "");
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

        const summaryText = await getOpenAIAPIResponse([
            { role: "system", content: "Summarize this conversation in 3-5 concise sentences. Capture key facts, questions, conclusions, and context needed to continue naturally." },
            { role: "user",   content: conversationText }
        ]);

        thread.summary = {
            content: summaryText,
            builtFromMessageCount: summarizableCount,
            createdAt: new Date()
        };
        await thread.save();
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

    const updated = await getOpenAIAPIResponse([
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

    memory.profile = updated;
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
        const thread = await Thread.findOne({ threadId: req.params.threadId, userId: req.user.userId });
        if (!thread) return res.status(404).json({ error: "Thread not found" });
        const visibleMessages = thread.messages.filter(m => m.role !== "system");
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
    const { threadId, message } = req.body;
    if (!threadId || !message) return res.status(400).json({ error: "Missing required fields" });

    try {
        // 1. Embed the user's message (enables RAG retrieval)
        const messageEmbedding = await getOpenAIEmbedding(message);

        // 2. Create or load the thread
        let thread = await Thread.findOne({ threadId, userId: req.user.userId });
        if (!thread) {
            const title = await generateTitle(message);
            thread = new Thread({
                threadId,
                userId: req.user.userId,
                title,
                messages: [
                    { role: "system", content: "You are a helpful AI assistant." },
                    { role: "user",   content: message, embedding: messageEmbedding }
                ]
            });
        } else {
            thread.messages.push({ role: "user", content: message, embedding: messageEmbedding });
        }

        // 3. Cross-thread RAG — search ALL of the user's past messages for relevant context
        let ragContext = "";

        const allThreads = await Thread.find({ userId: req.user.userId }, "messages threadId");
        const allUserMessages = allThreads.flatMap(t =>
            t.messages
                .filter(m => m.role === "user")
                .map(m => ({ content: m.content, embedding: m.embedding }))
        );

        const topMatches = allUserMessages
            .filter(m => m.embedding?.length > 0 && m.content !== message)
            .map(m => ({ content: m.content, score: cosineSimilarity(m.embedding, messageEmbedding) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .filter(m => m.score > 0.4);

        if (topMatches.length > 0) {
            ragContext = `\n\nRelevant context from past conversations:\n` +
                topMatches.map(m => `- "${m.content}"`).join("\n");
            console.log(`[RAG] Injected ${topMatches.length} semantic matches`);
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
        thread.messages[0].content = systemPrompt;

        // 5. Stream the AI response via SSE
        const recentMessages = [
            thread.messages[0],
            ...thread.messages.slice(-RECENT_WINDOW).map(m => ({ role: m.role, content: m.content }))
        ];

        const ragUsed = ragContext !== "";
        const requestStart = Date.now();
        let ttftMs = null;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        await getOpenAIStreamingResponse(
            recentMessages,
            (token) => {
                if (ttftMs === null) ttftMs = Date.now() - requestStart;
                res.write(`data: ${JSON.stringify({ token })}\n\n`);
            },
            async (fullReply, usage) => {
                const latencyMs = Date.now() - requestStart;
                try {
                    const replyEmbedding = await getOpenAIEmbedding(fullReply);
                    thread.messages.push({ role: "assistant", content: fullReply, embedding: replyEmbedding });
                    thread.updatedAt = new Date();
                    await thread.save();

                    // Background: summarize long threads, then update user profile
                    maybeSummarize(thread)
                        .then(() => updateUserProfile(req.user.userId, thread))
                        .catch(err => console.log("[Background] Error:", err));

                    // Analytics — fire and forget
                    Analytics.create({
                        userId:           req.user.userId,
                        threadId,
                        promptTokens:     usage?.prompt_tokens     || 0,
                        completionTokens: usage?.completion_tokens  || 0,
                        totalTokens:      usage?.total_tokens       || 0,
                        estimatedCostUsd: ((usage?.prompt_tokens || 0) * 0.00000015) +
                                          ((usage?.completion_tokens || 0) * 0.0000006),
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
            }
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
