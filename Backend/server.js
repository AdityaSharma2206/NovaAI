import express from "express";
import "dotenv/config";
import cors from "cors";
import mongoose from "mongoose";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";
import analyticsRoutes from "./routes/analytics.js";
import userMemoryRoutes from "./routes/userMemory.js";
import verifyToken from "./middleware/auth.js";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());

// Public: register and login — no token required
app.use("/api/auth", authRoutes);

// Protected: all /api/* routes require a valid JWT
app.use("/api", verifyToken, chatRoutes);
app.use("/api", verifyToken, analyticsRoutes);
app.use("/api", verifyToken, userMemoryRoutes);

app.listen(PORT, () => {
    console.log(`server running on ${PORT}`);
    connectDB();
});

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected with Database!");
    } catch (err) {
        console.log("Failed to connect with Db", err);
    }
};
