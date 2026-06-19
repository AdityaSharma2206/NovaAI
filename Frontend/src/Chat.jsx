import "./Chat.css";
import { useContext, useEffect, useRef } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import logo from "./assets/blacklogo.png";
import RagDebugPanel from "./RagDebugPanel.jsx";

const SUGGESTIONS = [
    "What are you working on right now?",
    "Help me plan my week",
    "Explain something complex, simply",
    "What should I focus on today?",
];

function Chat({ debugMode, isStreaming, onRegenerate }) {
    const { newChat, prevChats, streamingReply, setPrompt } = useContext(MyContext);
    const chatEndRef = useRef(null);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch(err) {
            console.log(err);
        }
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [prevChats, streamingReply]);

    return (
        <div className="chats-container">
            {newChat && !streamingReply && (
                <div className="empty-state">
                    <img src={logo} alt="NovaAI Logo" className="empty-logo" />
                    <h1>How can I help you today?</h1>
                    <div className="suggestion-chips">
                        {SUGGESTIONS.map((s, i) => (
                            <button key={i} className="suggestion-chip" onClick={() => setPrompt(s)}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="chats">
                {prevChats?.map((chat, idx) => (
                    <div className={`message-wrapper ${chat.role === "user" ? "user" : "ai"}`} key={idx}>
                        <div className={`message-content ${chat.role !== "user" ? "ai-markdown" : ""}`}>
                            {chat.role === "user" ? (
                                <>
                                    <p className="user-text">{chat.content}</p>
                                    <button
                                        className="copy-btn user-copy"
                                        onClick={() => copyToClipboard(chat.content)}
                                        title="Copy prompt"
                                    >
                                        <i className="fa-regular fa-copy"></i>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="markdown-wrapper">
                                        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                            {chat.content}
                                        </ReactMarkdown>
                                    </div>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(chat.content)}
                                        title="Copy reply"
                                    >
                                        <i className="fa-regular fa-copy"></i>
                                    </button>
                                    {onRegenerate && idx === prevChats.length - 1 && !isStreaming && (
                                        <button
                                            className="copy-btn regen-btn"
                                            onClick={onRegenerate}
                                            title="Regenerate response"
                                        >
                                            <i className="fa-solid fa-rotate-right"></i>
                                        </button>
                                    )}
                                    {debugMode && chat.rag && <RagDebugPanel trace={chat.rag} />}
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {streamingReply && (
                    <div className="message-wrapper ai">
                        <div className="message-content ai-markdown">
                            <div className="markdown-wrapper">
                                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {streamingReply}
                                </ReactMarkdown>
                                <span className="typing-cursor" />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>
        </div>
    );
}

export default Chat;