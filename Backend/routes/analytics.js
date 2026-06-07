import express from "express";
import mongoose from "mongoose";
import Analytics from "../models/Analytics.js";
import Thread from "../models/Thread.js";

const router = express.Router();

router.get("/analytics", async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.userId);

        const [agg, totalConversations] = await Promise.all([
            Analytics.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: null,
                        totalMessages:         { $sum: 1 },
                        totalPromptTokens:     { $sum: "$promptTokens" },
                        totalCompletionTokens: { $sum: "$completionTokens" },
                        totalTokens:           { $sum: "$totalTokens" },
                        estimatedTotalCostUsd: { $sum: "$estimatedCostUsd" },
                        avgLatencyMs:          { $avg: "$latencyMs" },
                        avgTtftMs:             { $avg: "$ttftMs" },
                        ragUsedCount:          { $sum: { $cond: ["$ragUsed", 1, 0] } }
                    }
                }
            ]),
            Thread.countDocuments({ userId: req.user.userId })
        ]);

        const stats = agg[0] || {};

        res.json({
            totalConversations,
            totalMessages:          stats.totalMessages         || 0,
            totalPromptTokens:      stats.totalPromptTokens     || 0,
            totalCompletionTokens:  stats.totalCompletionTokens || 0,
            totalTokens:            stats.totalTokens           || 0,
            estimatedTotalCostUsd:  parseFloat((stats.estimatedTotalCostUsd || 0).toFixed(6)),
            avgLatencyMs:           Math.round(stats.avgLatencyMs || 0),
            avgTtftMs:              Math.round(stats.avgTtftMs    || 0),
            ragUsageRate:           stats.totalMessages > 0
                ? parseFloat((stats.ragUsedCount / stats.totalMessages).toFixed(2))
                : 0
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

export default router;
