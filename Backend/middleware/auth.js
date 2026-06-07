import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

    if (!token)
        return res.status(401).json({ error: "No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { userId: decoded.userId, email: decoded.email };
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};

export default verifyToken;
