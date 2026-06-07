import mongoose from "mongoose";

const HighlightSchema = new mongoose.Schema({
    type:      { type: String },
    content:   { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const TopicSchema = new mongoose.Schema({
    topic:         { type: String, required: true },
    count:         { type: Number, default: 1 },
    lastDiscussed: { type: Date, default: Date.now }
}, { _id: false });

const UserMemorySchema = new mongoose.Schema({
    userId:             { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    interests:          [String],
    goals:              [String],
    lifeEvents:         [String],
    ongoingProjects:    [String],
    preferences:        [String],
    challenges:         [String],
    longTermObjectives: [String],
    topicFrequency:     [TopicSchema],
    memoryHighlights:   [HighlightSchema],
    profileSummary:     String,
    lastUpdated:        Date
});

UserMemorySchema.index({ userId: 1 });

export default mongoose.model("UserMemory", UserMemorySchema);
