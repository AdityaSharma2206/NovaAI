import mongoose from "mongoose";

const UserMemorySchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    profile:     { type: String, default: "" },
    lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model("UserMemory", UserMemorySchema);
