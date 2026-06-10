import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import AnalyticsDrawer from "./AnalyticsDrawer.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef } from "react";
import authFetch from "./utils/authFetch.js";
import API_BASE from "./utils/api.js";
import { ScaleLoader } from "react-spinners";

function ChatWindow() {
    const {
        prompt, setPrompt, setStreamingReply,
        currThreadId, setPrevChats, newChat,
        setNewChat, setAllThreads
    } = useContext(MyContext);

    const [loading, setLoading]               = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

    const textareaRef = useRef(null);

    const getReply = async () => {
        if (!prompt.trim()) return;

        const isFirstMessage = newChat;
        const currentPrompt = prompt;

        setLoading(true);
        setNewChat(false);
        setPrompt("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

        if (isFirstMessage) {
            setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
        }

        try {
            const response = await authFetch(`${API_BASE}/api/chat`, {
                method: "POST",
                body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
            });
            setLoading(false);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assembled = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (!payload) continue;

                    try {
                        const parsed = JSON.parse(payload);

                        if (parsed.token !== undefined) {
                            assembled += parsed.token;
                            setStreamingReply(assembled);
                        } else if (parsed.done) {
                            setPrevChats(prev => [...prev, { role: "assistant", content: assembled }]);
                            setStreamingReply("");
                            if (isFirstMessage) {
                                setAllThreads(prev => prev.map(t =>
                                    t.threadId === currThreadId
                                        ? { ...t, title: parsed.title || currentPrompt }
                                        : t
                                ));
                            }
                        } else if (parsed.error) {
                            console.log("Stream error:", parsed.error);
                            setStreamingReply("");
                        }
                    } catch { /* malformed SSE line */ }
                }
            }
        } catch (err) {
            console.log(err);
            setStreamingReply("");
        }
        setLoading(false);
    };

    return (
        <div className="chatWindow">
            <div className="navbar">
                <span className="brand">NovaAI <i className="fa-solid fa-chevron-down"></i></span>
                <div className="navbar-right">
                    <div className="userIconDiv" onClick={() => setIsAnalyticsOpen(true)}>
                        <span className="userIcon"><i className="fa-solid fa-chart-line"></i></span>
                        <span className="nav-tool-label">Analytics</span>
                    </div>
                </div>
            </div>

            <AnalyticsDrawer isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />

            <div className="chat-content">
                <Chat />
                <div className="loader-container">
                    <ScaleLoader color="var(--accent-primary)" loading={loading} height={20} />
                </div>
            </div>

            <div className="chatInputWrapper">
                <div className="inputBox">
                    <textarea
                        ref={textareaRef}
                        placeholder="Ask anything... (Shift + Enter for new line)"
                        value={prompt}
                        rows={1}
                        onChange={(e) => {
                            setPrompt(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (prompt.trim() && !loading) getReply();
                            }
                        }}
                    />
                    <button id="submit" onClick={getReply} disabled={!prompt.trim() || loading}>
                        <i className="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
                <p className="info">NovaAI uses semantic search to remember context across all your conversations.</p>
            </div>
        </div>
    );
}

export default ChatWindow;
