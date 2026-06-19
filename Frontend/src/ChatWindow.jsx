import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import AnalyticsDrawer from "./AnalyticsDrawer.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef, useEffect } from "react";
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
    const [isStreaming, setIsStreaming]       = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [debugMode, setDebugMode]           = useState(() => localStorage.getItem("ragDebug") === "true");

    const toggleDebug = () => {
        setDebugMode(prev => {
            const next = !prev;
            localStorage.setItem("ragDebug", String(next));
            return next;
        });
    };

    const textareaRef = useRef(null);
    const abortRef = useRef(null);
    const manualStopRef = useRef(false); // true when the user clicks Stop (vs. an abort from thread switch)

    // Abort any in-flight stream when the active thread changes (switch thread / new chat)
    // or when the component unmounts (logout). Prevents a reply landing in the wrong thread.
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, [currThreadId]);

    // Shared streaming routine used by both a normal send and a regenerate.
    const runChatStream = async (body, { isFirstMessage = false, fallbackTitle = "" } = {}) => {
        setLoading(true);
        setIsStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        let assembled = "";
        let ragTrace = null;

        try {
            const response = await authFetch(`${API_BASE}/api/chat`, {
                method: "POST",
                body: JSON.stringify(body),
                signal: controller.signal
            });
            setLoading(false);

            // A non-streaming error response (400/401/500) arrives as JSON, not SSE.
            // Surface it instead of feeding an error body into the stream parser.
            if (!response.ok) {
                let errMsg = "Something went wrong. Please try again.";
                try {
                    const data = await response.json();
                    if (data?.error) errMsg = data.error;
                } catch { /* non-JSON error body */ }
                setStreamingReply("");
                setPrevChats(prev => [...prev, { role: "assistant", content: `⚠️ ${errMsg}` }]);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

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

                        if (parsed.rag) {
                            ragTrace = parsed.rag;
                        } else if (parsed.token !== undefined) {
                            assembled += parsed.token;
                            setStreamingReply(assembled);
                        } else if (parsed.done) {
                            setPrevChats(prev => [...prev, { role: "assistant", content: assembled, rag: ragTrace }]);
                            setStreamingReply("");
                            if (isFirstMessage) {
                                setAllThreads(prev => prev.map(t =>
                                    t.threadId === currThreadId
                                        ? { ...t, title: parsed.title || fallbackTitle }
                                        : t
                                ));
                            }
                        } else if (parsed.error) {
                            setStreamingReply("");
                            setPrevChats(prev => [...prev, { role: "assistant", content: `⚠️ ${parsed.error}` }]);
                        }
                    } catch { /* malformed SSE line */ }
                }
            }
        } catch (err) {
            // An abort (thread switch / unmount) is expected — not a real error to surface.
            if (err.name !== "AbortError") console.log(err);
            // If the user clicked Stop, keep whatever streamed so far as the reply.
            if (manualStopRef.current && assembled) {
                setPrevChats(prev => [...prev, { role: "assistant", content: assembled, rag: ragTrace }]);
            }
            setStreamingReply("");
        } finally {
            manualStopRef.current = false;
            if (abortRef.current === controller) abortRef.current = null;
            setLoading(false);
            setIsStreaming(false);
        }
    };

    const getReply = async () => {
        if (!prompt.trim() || isStreaming) return;

        const isFirstMessage = newChat;
        const currentPrompt = prompt;

        setNewChat(false);
        setPrompt("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);
        if (isFirstMessage) {
            setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
        }

        await runChatStream(
            { message: currentPrompt, threadId: currThreadId, debug: debugMode },
            { isFirstMessage, fallbackTitle: currentPrompt }
        );
    };

    // Cancel the in-flight reply, keeping whatever has streamed so far (see runChatStream catch).
    const handleStop = () => {
        manualStopRef.current = true;
        abortRef.current?.abort();
    };

    // Re-run the last user message for a fresh answer. The backend drops the stale reply.
    const handleRegenerate = async () => {
        if (isStreaming) return;
        setPrevChats(prev => {
            const copy = [...prev];
            if (copy.length && copy[copy.length - 1].role === "assistant") copy.pop();
            return copy;
        });
        await runChatStream(
            { threadId: currThreadId, regenerate: true, debug: debugMode },
            { isFirstMessage: false }
        );
    };

    return (
        <div className="chatWindow">
            <div className="navbar">
                <span className="brand">NovaAI <i className="fa-solid fa-chevron-down"></i></span>
                <div className="navbar-right">
                    <div
                        className="userIconDiv"
                        onClick={toggleDebug}
                        style={{ color: debugMode ? "var(--accent-primary)" : undefined }}
                        title="Show what the retrieval system is doing"
                    >
                        <span className="userIcon"><i className="fa-solid fa-magnifying-glass"></i></span>
                        <span className="nav-tool-label">RAG Debug{debugMode ? " · ON" : ""}</span>
                    </div>
                    <div className="userIconDiv" onClick={() => setIsAnalyticsOpen(true)}>
                        <span className="userIcon"><i className="fa-solid fa-chart-line"></i></span>
                        <span className="nav-tool-label">Analytics</span>
                    </div>
                </div>
            </div>

            <AnalyticsDrawer isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />

            <div className="chat-content">
                <Chat debugMode={debugMode} isStreaming={isStreaming} onRegenerate={handleRegenerate} />
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
                                if (prompt.trim() && !loading && !isStreaming) getReply();
                            }
                        }}
                    />
                    {isStreaming ? (
                        <button id="submit" className="stop-btn" onClick={handleStop} title="Stop generating">
                            <i className="fa-solid fa-stop"></i>
                        </button>
                    ) : (
                        <button id="submit" onClick={getReply} disabled={!prompt.trim() || loading}>
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    )}
                </div>
                <p className="info">NovaAI uses semantic search to remember context across all your conversations.</p>
            </div>
        </div>
    );
}

export default ChatWindow;
