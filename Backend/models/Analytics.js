import mongoose from "mongoose";

const AnalyticsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    threadId: {
        type: String,
        required: true
    },
    promptTokens:     { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens:      { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    latencyMs:        { type: Number, default: 0 },
    ttftMs:           { type: Number, default: 0 },
    ragUsed:          { type: Boolean, default: false },
    timestamp:        { type: Date, default: Date.now }
});

AnalyticsSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("Analytics", AnalyticsSchema);
