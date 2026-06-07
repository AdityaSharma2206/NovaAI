import { useState } from "react";
import "./Auth.css";

function Login({ onLogin, switchToRegister }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("http://localhost:8080/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Login failed");
            } else {
                localStorage.setItem("token", data.token);
                onLogin(data.user);
            }
        } catch {
            setError("Network error. Is the server running?");
        }

        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <div className="auth-logo">
                    <i className="fa-solid fa-robot"></i>
                </div>
                <h2>Welcome back</h2>
                <p className="auth-sub">Sign in to NovaAI</p>
                <form onSubmit={handleLogin}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    {error && <p className="auth-error"><i className="fa-solid fa-circle-exclamation"></i> {error}</p>}
                    <button type="submit" disabled={loading}>
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>
                <p className="auth-switch">
                    Don&apos;t have an account?{" "}
                    <span onClick={switchToRegister}>Create one</span>
                </p>
            </div>
        </div>
    );
}

export default Login;
