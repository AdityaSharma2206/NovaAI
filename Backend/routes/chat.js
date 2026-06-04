import express from "express";
import Thread from "../models/Thread.js";
import { getOpenAIAPIResponse, getOpenAIJSONResponse, getOpenAIEmbedding } from "../utils/openai.js";

const router = express.Router();

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
    // Commented out so it extracts immediately for your testing purposes!
    // if (thread.messages.length % 4 !== 0) return; 

    const chatHistory = thread.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");

    const extractionPrompt = [
        { 
            role: "system", 
            content: `You are a background AI profiling agent. Extract data from the conversation into this exact JSON format:
            { "userFacts": ["fact 1"], "preferences": ["preference 1"], "activeContext": "A brief 1-sentence summary of what the user is currently trying to achieve" }.
            If you don't find anything for a category, leave the array empty. Do not invent information.`
        },
        { role: "user", content: chatHistory }
    ];

    const extractedData = await getOpenAIJSONResponse(extractionPrompt);

    if (extractedData) {
        const mergeArrays = (oldArr, newArr) => [...new Set([...(oldArr || []), ...(newArr || [])])];
        thread.profile = {
            userFacts: mergeArrays(thread.profile?.userFacts, extractedData.userFacts),
            preferences: mergeArrays(thread.profile?.preferences, extractedData.preferences),
            activeContext: extractedData.activeContext || thread.profile?.activeContext,
            lastUpdated: new Date()
        };
        await thread.save();
        console.log(`[AI Insights] Updated dynamic profile for thread ${thread.threadId}`);
    }
};

router.get("/thread", async(req, res) => {
    try {
        const threads = await Thread.find({}).sort({updatedAt: -1});
        const filteredThreads = threads.map(thread => ({ threadId: thread.threadId, title: thread.title }));
        res.json(filteredThreads);
    } catch(err) { res.status(500).json({ error: "Failed to fetch threads" }); }
});

router.get("/thread/:threadId", async(req, res) => {
    const {threadId} = req.params;
    try {
        const thread = await Thread.findOne({threadId});
        if(!thread) return res.status(404).json({ error: "Thread not found" });
        res.json({ messages: thread.messages, profile: thread.profile || {} });
    } catch(err) { res.status(500).json({ error: "Failed to fetch chat" }); }
});

router.delete("/thread/:threadId", async(req, res) => {
    const {threadId} = req.params;
    try {
        const deletedThread = await Thread.findOneAndDelete({threadId});
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
        let thread = await Thread.findOne({threadId});

        // 2. CREATE OR UPDATE THREAD
        if(!thread) {
            const generatedTitle = await generateTitle(message);
            thread = new Thread({
                threadId,
                title: generatedTitle,
                messages: [
                    { role: "system", content: "You are a helpful AI assistant." },
                    { role: "user", content: message, embedding: messageEmbedding }
                ]
            });
        } else {
            thread.messages.push({ role: "user", content: message, embedding: messageEmbedding });
        }

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

        // 4. CONTEXT AWARE MEMORY LAYER (Profile Injection)
        let dynamicSystemPrompt = "You are a highly personalized AI assistant.";
        
        if (thread.profile && (thread.profile.userFacts?.length || thread.profile.activeContext)) {
            dynamicSystemPrompt += `\n\nTailor your responses using this learned context about the user:\n`;
            if (thread.profile.activeContext) dynamicSystemPrompt += `- Current Focus: ${thread.profile.activeContext}\n`;
            if (thread.profile.userFacts?.length) dynamicSystemPrompt += `- Known Facts: ${thread.profile.userFacts.join(" | ")}\n`;
            if (thread.profile.preferences?.length) dynamicSystemPrompt += `- Preferences: ${thread.profile.preferences.join(" | ")}\n`;
        }
        
        // Combine Profile Data + Semantic Vector Data
        thread.messages[0].content = dynamicSystemPrompt + historicalContext;

        // 5. GET AI RESPONSE
        const recentMessages = [thread.messages[0], ...thread.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))];
        const assistantReply = await getOpenAIAPIResponse(recentMessages);

        // Generate embedding for AI reply so the user can search for it later
        const replyEmbedding = await getOpenAIEmbedding(assistantReply);

        thread.messages.push({ role: "assistant", content: assistantReply, embedding: replyEmbedding });
        thread.updatedAt = new Date();
        await thread.save();

        extractProfileData(thread).catch(err => console.log("Extraction Error:", err));

        res.json({ reply: assistantReply, title: thread.title });

    } catch(err) {
        console.log(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

export default router;