import express from "express";
import Thread from "../models/Thread.js";
import Analytics from "../models/Analytics.js";
import UserMemory from "../models/UserMemory.js";
import { getOpenAIAPIResponse, getOpenAIJSONResponse, getOpenAIEmbedding, getOpenAIStreamingResponse } from "../utils/openai.js";

const router = express.Router();

const SUMMARY_THRESHOLD = 14; // 1 system + 13 user/assistant messages (~6-7 full exchanges)
const RECENT_WINDOW = 6;      // mirrors the existing slice(-6) context window

const PREDEFINED_TOPICS = ["Travel", "Fitness", "Relationships", "Finance", "Career", "Education", "Entertainment", "Technology"];

// ==============================
// Mathematical Cosine Similarity Function
// ==============================
const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const generateTitle = async(message) => {
    const titlePrompt = [
        { role: "system", content: "Generate a short 3-5 word chat title only. No quotes." },
        { role: "user", content: message }
    ];
    const title = await getOpenAIAPIResponse(titlePrompt);
    return title.replace(/["']/g, "");
};

// ==============================
// Background Knowledge Extractor (Generalist Schema)
// ==============================
const extractProfileData = async (thread) => {
    const userMsgCount = thread.messages.filter(m => m.role === 'user').length;
    if (userMsgCount % 4 !== 0) return;

    const chatHistory = thread.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");

    const extractionPrompt = [
        {
            role: "system",
            content: `You are a session context tracker. Extract only what is relevant to THIS specific conversation — not long-term personal traits.

Respond in this exact JSON format:
{ "userFacts": [], "preferences": [], "activeContext": "" }

- "userFacts": Concrete things the user is working on or needs help with RIGHT NOW in this session (max 4 items, e.g. "debugging a React hook", "writing a cover letter").
- "preferences": Format or communication preferences expressed in THIS conversation only (e.g. "wants short answers", "prefers code examples"). Leave empty if none stated.
- "activeContext": One sentence: what is the user currently trying to achieve in this conversation?

Do NOT extract career goals, general interests, life events, or long-term identity facts.`
        },
        { role: "user", content: chatHistory }
    ];

    const extractedData = await getOpenAIJSONResponse(extractionPrompt);

    if (extractedData) {
        // Newest facts first so the most recent session context stays at the front.
        // Cap at 6 so thread-level facts don't grow across a long conversation.
        const mergeFresh = (recent, old, limit) =>
            [...new Set([...(recent || []), ...(old || [])])].slice(0, limit);
        thread.profile = {
            userFacts:    mergeFresh(extractedData.userFacts,    thread.profile?.userFacts,    6),
            preferences:  mergeFresh(extractedData.preferences,  thread.profile?.preferences,  4),
            activeContext: extractedData.activeContext || thread.profile?.activeContext,
            lastUpdated: new Date()
        };
        await thread.save();
        console.log(`[AI Insights] Updated dynamic profile for thread ${thread.threadId}`);
    }
};

// ==============================
// Conversation Summarization
// ==============================
const generateSummary = async (thread, summarizableCount) => {
    const messagesToSummarize = thread.messages.slice(1, 1 + summarizableCount);
    const conversationText = messagesToSummarize
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

    const summaryPrompt = [
        {
            role: "system",
            content: "Summarize this conversation history in 3-5 concise sentences. Capture the key facts, questions asked, conclusions reached, and context needed to continue the conversation naturally."
        },
        { role: "user", content: conversationText }
    ];

    const summaryText = await getOpenAIAPIResponse(summaryPrompt);

    const rawChars = messagesToSummarize.reduce((sum, m) => sum + m.content.length, 0);
    const summaryChars = summaryText.length;
    const tokensSaved = Math.round((rawChars - summaryChars) / 4);
    console.log(`[Summary] Thread ${thread.threadId}: ${messagesToSummarize.length} messages (${rawChars} chars) → ${summaryChars} chars (~${tokensSaved} tokens saved/request)`);

    thread.summary = {
        content: summaryText,
        builtFromMessageCount: summarizableCount,
        createdAt: new Date()
    };
    await thread.save();
};

const maybeSummarize = async (thread) => {
    if (thread.messages.length <= SUMMARY_THRESHOLD) return;

    const summarizableCount = thread.messages.length - 1 - RECENT_WINDOW;
    const lastSummarizedCount = thread.summary?.builtFromMessageCount || 0;
    const newSinceLastSummary = summarizableCount - lastSummarizedCount;

    if (!thread.summary || newSinceLastSummary >= 4) {
        await generateSummary(thread, summarizableCount);
    }
};

// ==============================
// Long-Term Memory Extractor (Cross-Conversation, Per-User)
// ==============================
const generateProfileSummary = (memory) => {
    const segments = [];
    if (memory.ongoingProjects?.length)
        segments.push(`building ${memory.ongoingProjects.slice(0, 2).join(" and ")}`);
    if (memory.goals?.length)
        segments.push(memory.goals[0]);
    if (memory.interests?.length)
        segments.push(`enjoys ${memory.interests.slice(0, 3).join(", ")}`);
    if (memory.challenges?.length)
        segments.push(`challenge: ${memory.challenges[0]}`);
    if (!segments.length && memory.longTermObjectives?.length)
        segments.push(memory.longTermObjectives[0]);

    if (!segments.length) return null;
    const sentence = segments.join("; ");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
};

const extractUserMemory = async (thread, userId) => {
    const userMsgCount = thread.messages.filter(m => m.role === 'user').length;
    if (userMsgCount % 4 !== 0) return;

    // Fetch memory FIRST so we can show the model what is already stored.
    // This gives the model the context needed to skip semantic duplicates and
    // avoid adding project technologies as personal interests.
    let memory = await UserMemory.findOne({ userId });
    if (!memory) memory = new UserMemory({ userId });

    const existingContext = [
        memory.goals?.length           ? `Goals: ${memory.goals.join("; ")}` : null,
        memory.ongoingProjects?.length  ? `Projects: ${memory.ongoingProjects.join("; ")}` : null,
        memory.interests?.length        ? `Interests: ${memory.interests.join("; ")}` : null,
        memory.challenges?.length       ? `Challenges: ${memory.challenges.join("; ")}` : null,
        memory.preferences?.length      ? `Preferences: ${memory.preferences.join("; ")}` : null,
        memory.longTermObjectives?.length ? `Long-term objectives: ${memory.longTermObjectives.join("; ")}` : null,
    ].filter(Boolean).join("\n");

    const chatHistory = thread.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");

    const prompt = [
        {
            role: "system",
            content: `You are a long-term user profiling agent. Extract only NEW durable personal facts not already captured.

EXISTING PROFILE — do not re-add, rephrase, or paraphrase anything already here:
${existingContext || "None yet."}

Rules:
1. Only extract information the user explicitly stated about themselves ("I am...", "I'm building...", "I want to...", "I enjoy...").
2. Do NOT extract topics they merely asked about, technologies they asked to explain, or educational questions.
3. For "interests": only genuine personal hobbies and passions (e.g. hiking, fitness, music, reading). Do NOT include programming languages, frameworks, databases, or tools — even ones used in their projects.
4. If a new item is semantically equivalent to something already in the profile (same meaning, different wording), skip it.
5. Ask: "Would this fact still be true in 3 months?" Only include it if clearly yes.
6. Return empty arrays if nothing genuinely new qualifies — that is the correct output when the profile is already complete.

Return this exact JSON:
{
  "interests": [],
  "goals": [],
  "lifeEvents": [],
  "ongoingProjects": [],
  "preferences": [],
  "discussedTopics": [],
  "challenges": [],
  "longTermObjectives": []
}

For "discussedTopics" only use: ${PREDEFINED_TOPICS.join(", ")}. Leave empty if none clearly apply.`
        },
        { role: "user", content: chatHistory }
    ];

    const extracted = await getOpenAIJSONResponse(prompt);
    if (!extracted) return;

    const mergeArrays = (existing, incoming) => {
        if (!incoming?.length) return existing || [];
        return [...new Set([...(existing || []), ...incoming])];
    };

    // Track new items before merging so we can build highlights
    const newHighlights = [];
    const trackNew = (type, existing, incoming) => {
        if (!incoming?.length) return;
        incoming.forEach(item => {
            if (!(existing || []).includes(item)) {
                newHighlights.push({ type, content: item, createdAt: new Date() });
            }
        });
    };

    trackNew("interest",   memory.interests,          extracted.interests);
    trackNew("goal",       memory.goals,              extracted.goals);
    trackNew("project",    memory.ongoingProjects,    extracted.ongoingProjects);
    trackNew("challenge",  memory.challenges,         extracted.challenges);
    trackNew("preference", memory.preferences,        extracted.preferences);
    trackNew("objective",  memory.longTermObjectives, extracted.longTermObjectives);

    memory.interests          = mergeArrays(memory.interests,          extracted.interests);
    memory.goals              = mergeArrays(memory.goals,              extracted.goals);
    memory.lifeEvents         = mergeArrays(memory.lifeEvents,         extracted.lifeEvents);
    memory.ongoingProjects    = mergeArrays(memory.ongoingProjects,    extracted.ongoingProjects);
    memory.preferences        = mergeArrays(memory.preferences,        extracted.preferences);
    memory.challenges         = mergeArrays(memory.challenges,         extracted.challenges);
    memory.longTermObjectives = mergeArrays(memory.longTermObjectives, extracted.longTermObjectives);

    // Per-category caps — goals is tightest because it's most prone to paraphrase variants
    memory.interests          = memory.interests.slice(0, 15);
    memory.goals              = memory.goals.slice(0, 5);
    memory.lifeEvents         = memory.lifeEvents.slice(0, 10);
    memory.ongoingProjects    = memory.ongoingProjects.slice(0, 10);
    memory.preferences        = memory.preferences.slice(0, 10);
    memory.challenges         = memory.challenges.slice(0, 10);
    memory.longTermObjectives = memory.longTermObjectives.slice(0, 10);

    // Increment topic frequency counts
    if (extracted.discussedTopics?.length) {
        const now = new Date();
        extracted.discussedTopics.forEach(topic => {
            const entry = memory.topicFrequency.find(t => t.topic === topic);
            if (entry) {
                entry.count += 1;
                entry.lastDiscussed = now;
            } else {
                memory.topicFrequency.push({ topic, count: 1, lastDiscussed: now });
            }
        });
    }

    if (newHighlights.length) {
        memory.memoryHighlights.push(...newHighlights);
        if (memory.memoryHighlights.length > 20) {
            memory.memoryHighlights = memory.memoryHighlights.slice(-20);
        }
    }

    memory.profileSummary = generateProfileSummary(memory);
    memory.lastUpdated = new Date();
    await memory.save();
    console.log(`[UserMemory] Updated long-term profile for user ${userId}`);
};

router.get("/thread", async(req, res) => {
    try {
        const threads = await Thread.find({ userId: req.user.userId }).sort({ updatedAt: -1 });
        const filteredThreads = threads.map(thread => ({ threadId: thread.threadId, title: thread.title }));
        res.json(filteredThreads);
    } catch(err) { res.status(500).json({ error: "Failed to fetch threads" }); }
});

router.get("/thread/:threadId", async(req, res) => {
    const {threadId} = req.params;
    
    try {
        const thread = await Thread.findOne({ threadId, userId: req.user.userId });
        
        if(!thread) {
            return res.status(404).json({ error: "Thread not found" });
        }

        // THE FIX: Filter out the system message before sending to React!
        const visibleMessages = thread.messages.filter(msg => msg.role !== "system");

        res.json({
            messages: visibleMessages, 
            profile: thread.profile || {} 
        });

    } catch(err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch chat" });
    }
});

router.delete("/thread/:threadId", async(req, res) => {
    const {threadId} = req.params;
    try {
        const deletedThread = await Thread.findOneAndDelete({ threadId, userId: req.user.userId });
        if(!deletedThread) return res.status(404).json({ error: "Thread not found" });
        res.status(200).json({ success: "Thread deleted successfully" });
    } catch(err) { res.status(500).json({ error: "Failed to delete thread" }); }
});

// ==============================
// CHAT ROUTE (With RAG and Profile Injection)
// ==============================
router.post("/chat", async(req, res) => {
    const {threadId, message} = req.body;
    if(!threadId || !message) return res.status(400).json({ error: "Missing required fields" });

    try {
        // 1. Convert user message into a Vector Embedding
        const messageEmbedding = await getOpenAIEmbedding(message);
        let thread = await Thread.findOne({ threadId, userId: req.user.userId });

        // 2. CREATE OR UPDATE THREAD
        if(!thread) {
            const generatedTitle = await generateTitle(message);
            thread = new Thread({
                threadId,
                userId: req.user.userId,
                title: generatedTitle,
                messages: [
                    { role: "system", content: "You are a helpful AI assistant." },
                    { role: "user", content: message, embedding: messageEmbedding }
                ]
            });
        } else {
            thread.messages.push({ role: "user", content: message, embedding: messageEmbedding });
        }

        // Fetch long-term user memory for personalised system prompt context
        const userMemory = await UserMemory.findOne({ userId: req.user.userId });

        // 3. SEMANTIC VECTOR SEARCH (Lightweight RAG)
        let historicalContext = "";
        if (thread.messages.length > 3) {
            const pastMessages = thread.messages.slice(1, -2); // Exclude System msg and Current msg
            
            // Score past messages against the current question using Math
            const scoredMessages = pastMessages
                .filter(m => m.embedding && m.embedding.length > 0)
                .map(m => ({
                    content: m.content,
                    role: m.role,
                    score: cosineSimilarity(m.embedding, messageEmbedding)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3); // Grab the top 3 most relevant matches

            // If we find a strong contextual match (score > 0.4), inject it
            if (scoredMessages.length > 0 && scoredMessages[0].score > 0.4) {
                historicalContext = `\n\n[SYSTEM DIRECTIVE: Utilize these relevant past conversation snippets via Vector Search if necessary:]\n`;
                scoredMessages.forEach(m => {
                    historicalContext += `- (${m.role}): ${m.content}\n`;
                });
                console.log(`[RAG] Retrieved ${scoredMessages.length} relevant memories via semantic search.`);
            }
        }

        // 4. CONTEXT AWARE MEMORY LAYER (Long-Term + Summary + Thread Profile)
        let dynamicSystemPrompt = "You are a highly personalized AI assistant.";

        // Layer 1: Cross-conversation long-term profile — inject compact summary only
        if (userMemory?.profileSummary) {
            dynamicSystemPrompt += `\n\nUser profile: ${userMemory.profileSummary}`;
        } else if (userMemory) {
            // Fallback for new users before a summary has been generated
            const profileParts = [];
            if (userMemory.goals?.length)           profileParts.push(`goal: ${userMemory.goals[0]}`);
            if (userMemory.ongoingProjects?.length) profileParts.push(`project: ${userMemory.ongoingProjects[0]}`);
            if (userMemory.interests?.length)       profileParts.push(`interests: ${userMemory.interests.slice(0, 2).join(", ")}`);
            if (profileParts.length) dynamicSystemPrompt += `\n\nUser profile: ${profileParts.join("; ")}.`;
        }

        // Layer 2: Conversation summary (this thread's compressed history)
        if (thread.summary?.content) {
            dynamicSystemPrompt += `\n\nSummary of earlier conversation:\n${thread.summary.content}`;
        }

        // Layer 3: Thread-level profile (this conversation's extracted context)
        if (thread.profile && (thread.profile.userFacts?.length || thread.profile.activeContext)) {
            dynamicSystemPrompt += `\n\nTailor your responses using this learned context about the user:\n`;
            if (thread.profile.activeContext) dynamicSystemPrompt += `- Current Focus: ${thread.profile.activeContext}\n`;
            if (thread.profile.userFacts?.length) dynamicSystemPrompt += `- Known Facts: ${thread.profile.userFacts.slice(0, 4).join(" | ")}\n`;
            if (thread.profile.preferences?.length) dynamicSystemPrompt += `- Preferences: ${thread.profile.preferences.join(" | ")}\n`;
        }
        
        // Combine Profile Data + Semantic Vector Data
        thread.messages[0].content = dynamicSystemPrompt + historicalContext;

        // 5. GET AI RESPONSE — via SSE streaming
        const recentMessages = [thread.messages[0], ...thread.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))];
        const ragUsed = historicalContext !== "";
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
                    // Chained sequentially — both mutate and save the same thread document,
                    // so running them in parallel causes a Mongoose ParallelSaveError.
                    extractProfileData(thread)
                        .then(() => maybeSummarize(thread))
                        .then(() => extractUserMemory(thread, req.user.userId))
                        .catch(err => console.log("Background task error:", err));

                    // Fire-and-forget analytics write — never blocks or delays the response
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
                    }).catch(err => console.log("[Analytics] Save error:", err));

                    res.write(`data: ${JSON.stringify({ done: true, title: thread.title })}\n\n`);
                } catch (saveErr) {
                    console.log("Save error after stream:", saveErr);
                    res.write(`data: ${JSON.stringify({ error: "Failed to save reply" })}\n\n`);
                } finally {
                    res.end();
                }
            }
        );

    } catch(err) {
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