import express from "express";
import UserMemory from "../models/UserMemory.js";

const router = express.Router();

router.get("/user-memory", async (req, res) => {
    try {
        const memory = await UserMemory.findOne({ userId: req.user.userId });
        if (!memory) {
            return res.json({
                personalFacts: [], interests: [], goals: [], lifeEvents: [], ongoingProjects: [],
                preferences: [], challenges: [], longTermObjectives: [],
                topicFrequency: [], memoryHighlights: [], profileSummary: null
            });
        }
        res.json(memory);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch user memory" });
    }
});

export default router;
