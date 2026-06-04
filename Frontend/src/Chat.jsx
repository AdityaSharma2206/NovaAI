import "./Chat.css";
import React, { useContext, useState, useEffect, useRef } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function Chat() {
    const { newChat, prevChats, reply } = useContext(MyContext);
    const [latestReply, setLatestReply] = useState(null);
    const chatEndRef = useRef(null);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch(err) {
            console.log(err);
        }
    }

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [prevChats, latestReply]);

    useEffect(() => {
        if(reply === null) {
            setLatestReply(null); 
            return;
        }

        if(!prevChats?.length) return;

        const content = reply.split(" "); 

        let idx = 0;
        const interval = setInterval(() => {
            setLatestReply(content.slice(0, idx+1).join(" "));

            idx++;
            if(idx >= content.length) clearInterval(interval);
        }, 40);

        return () => clearInterval(interval);

    }, [prevChats, reply]);

    return (
        <div className="chats-container">
            {newChat && (
                <div className="empty-state">
                    <img src="src/assets/blacklogo.png" alt="SigmaGPT Logo" className="empty-logo" />
                    <h1>How can I help you today?</h1>
                </div>
            )}
            
            <div className="chats">
                {prevChats?.slice(0, -1).map((chat, idx) => 
                    <div className={`message-wrapper ${chat.role === "user" ? "user" : "ai"}`} key={idx}>
                        <div className="message-content">
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
                                    {/* THE FIX: Wrapped ReactMarkdown in a div */}
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
                )}

                {prevChats.length > 0 && (
                    <div className="message-wrapper ai" key="typing-indicator">
                        <div className="message-content ai-markdown">
                            <>
                                {/* THE FIX: Wrapped ReactMarkdown in a div */}
                                <div className="markdown-wrapper">
                                    <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                        {latestReply === null
                                            ? prevChats[prevChats.length-1].content
                                            : latestReply}
                                    </ReactMarkdown>
                                </div>

                                <button
                                    className="copy-btn"
                                    onClick={() =>
                                        copyToClipboard(
                                            latestReply === null
                                                ? prevChats[prevChats.length-1].content
                                                : latestReply
                                        )
                                    }
                                    title="Copy reply"
                                >
                                    <i className="fa-regular fa-copy"></i>
                                </button>
                            </>
                        </div>
                    </div>
                )}
                
                <div ref={chatEndRef} />
            </div>
        </div>
    )
}

export default Chat;