import express from "express";
import "dotenv/config";
import cors from "cors";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";
import analyticsRoutes from "./routes/analytics.js";
import verifyToken from "./middleware/auth.js";

// Fail fast on misconfiguration instead of throwing confusing errors at request time.
const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET", "OPENAI_API_KEY"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Throttle auth attempts to blunt brute-force / credential-stuffing
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,                // max attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." }
});

// Public: register and login — no token required
app.use("/api/auth", authLimiter, authRoutes);

// Protected: all /api/* routes require a valid JWT
app.use("/api", verifyToken, chatRoutes);
app.use("/api", verifyToken, analyticsRoutes);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected with Database!");
    } catch (err) {
        console.error("Failed to connect with Db", err);
        process.exit(1); // fail fast so the orchestrator restarts us instead of serving 500s
    }
};

// Connect to the database before accepting any traffic.
await connectDB();
app.listen(PORT, () => {
    console.log(`server running on ${PORT}`);
});
