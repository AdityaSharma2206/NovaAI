import { useState } from "react";
import "./Auth.css";

function Register({ onLogin, switchToLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("http://localhost:8080/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Registration failed");
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
                <h2>Create account</h2>
                <p className="auth-sub">Join NovaAI</p>
                <form onSubmit={handleRegister}>
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
                        placeholder="Password (min 8 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                    {error && <p className="auth-error"><i className="fa-solid fa-circle-exclamation"></i> {error}</p>}
                    <button type="submit" disabled={loading}>
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>
                <p className="auth-switch">
                    Already have an account?{" "}
                    <span onClick={switchToLogin}>Sign in</span>
                </p>
            </div>
        </div>
    );
}

export default Register;
