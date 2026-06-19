import express from "express";
import mongoose from "mongoose";
import Analytics from "../models/Analytics.js";
import Usage from "../models/Usage.js";
import Thread from "../models/Thread.js";

const router = express.Router();

router.get("/analytics", async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.userId);

        const [agg, usageAgg, totalConversations] = await Promise.all([
            // Performance + token counts for the main reply (one row per message)
            Analytics.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: null,
                        totalMessages:         { $sum: 1 },
                        totalPromptTokens:     { $sum: "$promptTokens" },
                        totalCompletionTokens: { $sum: "$completionTokens" },
                        totalTokens:           { $sum: "$totalTokens" },
                        avgLatencyMs:          { $avg: "$latencyMs" },
                        avgTtftMs:             { $avg: "$ttftMs" },
                        ragUsedCount:          { $sum: { $cond: ["$ragUsed", 1, 0] } }
                    }
                }
            ]),
            // True cost across every OpenAI call, grouped by type
            Usage.aggregate([
                { $match: { userId } },
                { $group: { _id: "$type", costUsd: { $sum: "$costUsd" } } }
            ]),
            Thread.countDocuments({ userId: req.user.userId })
        ]);

        const stats = agg[0] || {};

        // Sum the per-type costs into a true total + an itemized breakdown
        const totalCostUsd = usageAgg.reduce((sum, u) => sum + u.costUsd, 0);
        const costByType = usageAgg.reduce((acc, u) => {
            acc[u._id] = parseFloat(u.costUsd.toFixed(6));
            return acc;
        }, {});

        res.json({
            totalConversations,
            totalMessages:          stats.totalMessages         || 0,
            totalPromptTokens:      stats.totalPromptTokens     || 0,
            totalCompletionTokens:  stats.totalCompletionTokens || 0,
            totalTokens:            stats.totalTokens           || 0,
            estimatedTotalCostUsd:  parseFloat(totalCostUsd.toFixed(6)),
            costByType,  // { embedding, reply, title, summary, profile }
            avgLatencyMs:           Math.round(stats.avgLatencyMs || 0),
            avgTtftMs:              Math.round(stats.avgTtftMs    || 0),
            ragUsageRate:           stats.totalMessages > 0
                ? parseFloat((stats.ragUsedCount / stats.totalMessages).toFixed(2))
                : 0,
            avgCostPerMessage:      stats.totalMessages > 0
                ? parseFloat((totalCostUsd / stats.totalMessages).toFixed(6))
                : 0
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

export default router;
