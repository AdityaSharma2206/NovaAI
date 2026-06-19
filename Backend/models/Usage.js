import mongoose from "mongoose";

// One row per OpenAI call, so total spend = sum of costUsd across all rows.
// Decoupled from Analytics (which owns latency/TTFT/RAG) so background calls
// (summary, profile) can self-report whenever they finish.
const UsageSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type:             { type: String, enum: ["embedding", "reply", "title", "summary", "profile"], required: true },
    model:            { type: String, required: true },
    promptTokens:     { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costUsd:          { type: Number, default: 0 },
    timestamp:        { type: Date, default: Date.now }
});

UsageSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("Usage", UsageSchema);
