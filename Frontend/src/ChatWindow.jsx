import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import AnalyticsDrawer from "./AnalyticsDrawer.jsx";
import PersonalInsightsDrawer from "./PersonalInsightsDrawer.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef } from "react";
import authFetch from "./utils/authFetch.js";
import { ScaleLoader } from "react-spinners";

function ChatWindow() {
    const { prompt, setPrompt, setStreamingReply, currThreadId, setPrevChats, newChat, setThreadProfile, setNewChat, setAllThreads, threadProfile } = useContext(MyContext);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    
    // NEW: Reference for the auto-expanding textarea
    const textareaRef = useRef(null);

    const fetchLatestProfile = async () => {
        try {
            const response = await authFetch(`http://localhost:8080/api/thread/${currThreadId}`);
            const res = await response.json();
            if (res.profile) {
                setThreadProfile(res.profile);
            }
        } catch(err) {
            console.log("Failed to fetch background profile:", err);
        }
    };

    const getReply = async () => {
        if (!prompt.trim()) return;

        const isFirstMessage = newChat;
        const currentPrompt = prompt;

        setLoading(true);
        setNewChat(false);
        setPrompt("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        // Show the user message immediately before any network round-trip
        setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

        const options = {
            method: "POST",
            body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
        };

        try {
            const response = await authFetch("http://localhost:8080/api/chat", options);
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
                            // Stream complete: commit the full reply and clear the live bubble
                            setPrevChats(prev => [...prev, { role: "assistant", content: assembled }]);
                            setStreamingReply("");
                            setTimeout(() => fetchLatestProfile(), 3000);
                            if (isFirstMessage) {
                                setAllThreads(prev => [
                                    { threadId: currThreadId, title: parsed.title || currentPrompt },
                                    ...prev
                                ]);
                            }
                        } else if (parsed.error) {
                            console.log("Stream error from server:", parsed.error);
                            setStreamingReply("");
                        }
                    } catch { /* malformed SSE line, skip */ }
                }
            }
        } catch(err) {
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
                    <div className="userIconDiv" onClick={() => { setIsOpen(false); setIsProfileOpen(false); setIsAnalyticsOpen(true); }}>
                        <span className="userIcon"><i className="fa-solid fa-chart-line"></i></span>
                        <span className="nav-tool-label">Analytics</span>
                    </div>
                    <div className="userIconDiv" onClick={() => { setIsAnalyticsOpen(false); setIsProfileOpen(false); fetchLatestProfile(); setIsOpen(true); }}>
                        <span className="userIcon"><i className="fa-solid fa-brain"></i></span>
                        <span className="nav-tool-label">Memory</span>
                    </div>
                    <div className="userIconDiv" onClick={() => { setIsOpen(false); setIsAnalyticsOpen(false); setIsProfileOpen(true); }}>
                        <span className="userIcon"><i className="fa-solid fa-user-astronaut"></i></span>
                        <span className="nav-tool-label">Profile</span>
                    </div>
                </div>
            </div>

            <AnalyticsDrawer isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />
            <PersonalInsightsDrawer isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

            {isOpen && <div className="drawer-overlay" onClick={() => setIsOpen(false)}></div>}
            <div className={`insights-drawer ${isOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <h4><i className="fa-solid fa-microchip"></i> Agent Memory</h4>
                    <button className="close-drawer" onClick={() => setIsOpen(false)}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                
                <div className="drawer-body">
                    <p className="insight-sub">Real-time context extracted via RAG pipeline.</p>
                    
                    <div className="insight-section">
                        <h5><i className="fa-solid fa-crosshairs"></i> Active Context</h5>
                        <div className="context-card">
                            {threadProfile?.activeContext ? threadProfile.activeContext : "Monitoring conversation to determine focus..."}
                        </div>
                    </div>

                    <div className="insight-section">
                        <h5><i className="fa-solid fa-database"></i> Known Facts</h5>
                        <div className="chip-container">
                            {threadProfile?.userFacts?.length > 0 ? (
                                threadProfile.userFacts.map((fact, index) => (
                                    <span key={index} className="ui-chip fact-chip">{fact}</span>
                                ))
                            ) : (
                                <span className="empty-text">No facts extracted yet.</span>
                            )}
                        </div>
                    </div>

                    <div className="insight-section">
                        <h5><i className="fa-solid fa-sliders"></i> Preferences</h5>
                        <div className="chip-container">
                            {threadProfile?.preferences?.length > 0 ? (
                                threadProfile.preferences.map((pref, index) => (
                                    <span key={index} className="ui-chip pref-chip">{pref}</span>
                                ))
                            ) : (
                                <span className="empty-text">Using standard behavior.</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="chat-content">
                <Chat />
                <div className="loader-container">
                    <ScaleLoader color="var(--accent-primary)" loading={loading} height={20} />
                </div>
            </div>
            
            <div className="chatInputWrapper">
                <div className="inputBox">
                    {/* NEW: Auto-expanding textarea replaces standard input */}
                    <textarea 
                        ref={textareaRef}
                        placeholder="Ask anything... (Shift + Enter for new line)"
                        value={prompt}
                        rows={1}
                        onChange={(e) => {
                            setPrompt(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (prompt.trim() && !loading) getReply();
                            }
                        }}
                    />
                    <button id="submit" onClick={getReply} disabled={!prompt.trim() || loading}>
                        <i className="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
                <p className="info">NovaAI dynamically adapts to your semantic context.</p>
            </div>
        </div>
    )
}

export default ChatWindow;