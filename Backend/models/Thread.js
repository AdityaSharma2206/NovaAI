import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ["system","user", "assistant"],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    embedding: {
        type: [Number], // NEW: Stores the 1536-dimensional vector for RAG
        default: []
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const ThreadSchema = new mongoose.Schema({
    threadId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        default: "New Chat"
    },
    messages: [MessageSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    profile: {
        // NEW: Generalist Enterprise Schema
        userFacts: [String],
        preferences: [String],
        activeContext: String,
        lastUpdated: Date
    },
});

export default mongoose.model("Thread", ThreadSchema);