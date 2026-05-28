import express from "express";
import Thread from "../models/Thread.js";
import getOpenAIAPIResponse from "../utils/openai.js";

const router = express.Router();


// ==============================
// Generate Chat Title
// ==============================

const generateTitle = async(message) => {

    const titlePrompt = [
        {
            role: "system",
            content: "Generate a short 3-5 word chat title only. No quotes."
        },
        {
            role: "user",
            content: message
        }
    ];

    const title = await getOpenAIAPIResponse(titlePrompt);

    return title.replace(/["']/g, "");
};


// ==============================
// TEST ROUTE
// ==============================

router.post("/test", async(req, res) => {

    try {

        const thread = new Thread({
            threadId: "abc",
            title: "Testing New Thread"
        });

        const response = await thread.save();

        res.send(response);

    } catch(err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to save in DB"
        });
    }
});


// ==============================
// GET ALL THREADS
// ==============================

router.get("/thread", async(req, res) => {

    try {

        const threads = await Thread
            .find({})
            .sort({updatedAt: -1});

        const filteredThreads = threads.map(thread => ({
            threadId: thread.threadId,
            title: thread.title
        }));

        res.json(filteredThreads);

    } catch(err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to fetch threads"
        });
    }
});


// ==============================
// GET SINGLE THREAD
// ==============================

router.get("/thread/:threadId", async(req, res) => {

    const {threadId} = req.params;

    try {

        const thread = await Thread.findOne({threadId});

        if(!thread) {
            return res.status(404).json({
                error: "Thread not found"
            });
        }

        res.json(thread.messages);

    } catch(err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to fetch chat"
        });
    }
});


// ==============================
// DELETE THREAD
// ==============================

router.delete("/thread/:threadId", async(req, res) => {

    const {threadId} = req.params;

    try {

        const deletedThread =
            await Thread.findOneAndDelete({threadId});

        if(!deletedThread) {
            return res.status(404).json({
                error: "Thread not found"
            });
        }

        res.status(200).json({
            success: "Thread deleted successfully"
        });

    } catch(err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to delete thread"
        });
    }
});


// ==============================
// CHAT ROUTE
// ==============================

router.post("/chat", async(req, res) => {

    const {threadId, message} = req.body;

    if(!threadId || !message) {

        return res.status(400).json({
            error: "Missing required fields"
        });
    }

    try {

        let thread = await Thread.findOne({threadId});

        // ==============================
        // CREATE NEW THREAD
        // ==============================

        if(!thread) {

            const generatedTitle =
                await generateTitle(message);

            thread = new Thread({

                threadId,

                title: generatedTitle,

                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful AI assistant."
                    },
                    {
                        role: "user",
                        content: message
                    }
                ]
            });

        } else {

            // ==============================
            // EXISTING THREAD
            // ==============================

            thread.messages.push({
                role: "user",
                content: message
            });
        }


        // ==============================
        // LIMIT CONTEXT WINDOW
        // Keep system prompt + recent msgs
        // ==============================

        const recentMessages = [
            thread.messages[0],
            ...thread.messages.slice(-10)
        ];


        // ==============================
        // GET AI RESPONSE
        // ==============================

        const assistantReply =
            await getOpenAIAPIResponse(recentMessages);


        // ==============================
        // SAVE AI MESSAGE
        // ==============================

        thread.messages.push({
            role: "assistant",
            content: assistantReply
        });

        thread.updatedAt = new Date();

        await thread.save();


        // ==============================
        // SEND RESPONSE
        // ==============================

        res.json({
            reply: assistantReply,
            title: thread.title
        });

    } catch(err) {

        console.log(err);

        res.status(500).json({
            error: "Something went wrong"
        });
    }
});

export default router;