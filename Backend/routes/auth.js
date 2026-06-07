import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

router.post("/register", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: "Email and password are required" });

    if (password.length < 8)
        return res.status(400).json({ error: "Password must be at least 8 characters" });

    try {
        const existing = await User.findOne({ email });
        if (existing)
            return res.status(409).json({ error: "Email already registered" });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, passwordHash });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(201).json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: "Email and password are required" });

    try {
        const user = await User.findOne({ email });
        if (!user)
            return res.status(401).json({ error: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch)
            return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
