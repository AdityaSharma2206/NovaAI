// Single source of truth for the backend URL.
// In development: VITE_API_URL is not set, so it falls back to localhost.
// In production (Vercel): set VITE_API_URL to your Render backend URL.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default API_BASE;
