import "./Chat.css";
import { useContext, useEffect, useRef } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function Chat() {
    const { newChat, prevChats, streamingReply } = useContext(MyContext);
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
                    <img src="src/assets/blacklogo.png" alt="SigmaGPT Logo" className="empty-logo" />
                    <h1>How can I help you today?</h1>
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