import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useEffect } from "react";
import { ScaleLoader } from "react-spinners";

function ChatWindow() {
    const { prompt, setPrompt, reply, setReply, currThreadId, setPrevChats, newChat, setNewChat, setAllThreads, threadProfile } = useContext(MyContext);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false); // Controls the new side-drawer

    const getReply = async () => {
        if (!prompt.trim()) return;

        const isFirstMessage = newChat;
        const fallbackTitle = prompt; 

        setLoading(true);
        setNewChat(false);

        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, threadId: currThreadId })
        };

        try {
            const response = await fetch("http://localhost:8080/api/chat", options);
            const res = await response.json();
            
            setReply(res.reply);

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
    }, [reply]);

    return (
        <div className="chatWindow">
            <div className="navbar">
                <span className="brand">NovaAI <i className="fa-solid fa-chevron-down"></i></span>
                {/* Toggle Drawer Button */}
                <div className="userIconDiv" onClick={() => setIsOpen(true)} title="View AI Memory">
                    <span className="userIcon"><i className="fa-solid fa-brain"></i></span>
                </div>
            </div>

            {/* AI INSIGHTS SLIDING DRAWER */}
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
                    
                    {/* Active Context Card */}
                    <div className="insight-section">
                        <h5><i className="fa-solid fa-crosshairs"></i> Active Context</h5>
                        <div className="context-card">
                            {threadProfile?.activeContext ? threadProfile.activeContext : "Monitoring conversation to determine focus..."}
                        </div>
                    </div>

                    {/* User Facts (Rendered as Chips) */}
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

                    {/* Preferences (Rendered as Chips) */}
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
                    <input 
                        placeholder="Ask anything..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' ? getReply() : ''}
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