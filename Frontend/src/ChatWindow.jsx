import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useEffect, useRef } from "react";
import authFetch from "./utils/authFetch.js";
import { ScaleLoader } from "react-spinners";

function ChatWindow() {
    const { prompt, setPrompt, reply, setReply, currThreadId, setPrevChats, newChat, setThreadProfile, setNewChat, setAllThreads, threadProfile } = useContext(MyContext);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    
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
        const fallbackTitle = prompt; 

        setLoading(true);
        setNewChat(false);

        const options = {
            method: "POST",
            body: JSON.stringify({ message: prompt, threadId: currThreadId })
        };

        try {
            const response = await authFetch("http://localhost:8080/api/chat", options);
            const res = await response.json();
            
            setReply(res.reply);
            setTimeout(() => {
                fetchLatestProfile();
            }, 3000);

            if (isFirstMessage) {
                setAllThreads(prevThreads => [
                    { threadId: currThreadId, title: res.title || fallbackTitle },
                    ...prevThreads
                ]);
            }
        } catch(err) {
            console.log(err);
        }
        setLoading(false);
    }

    useEffect(() => {
        if(prompt && reply) {
            setPrevChats(prevChats => (
                [...prevChats, { role: "user", content: prompt },{ role: "assistant", content: reply }]
            ));
        }
        setPrompt("");
        
        // NEW: Reset textarea height back to default after message sends
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [reply]);

    return (
        <div className="chatWindow">
            <div className="navbar">
                <span className="brand">NovaAI <i className="fa-solid fa-chevron-down"></i></span>
                <div className="userIconDiv" onClick={() => { fetchLatestProfile(); setIsOpen(true); }} title="View AI Memory">
                    <span className="userIcon"><i className="fa-solid fa-brain"></i></span>
                </div>
            </div>

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