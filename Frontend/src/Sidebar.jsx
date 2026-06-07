import "./Sidebar.css";
import { useContext, useEffect } from "react";
import { MyContext } from "./MyContext.jsx";
import { v1 as uuidv1 } from "uuid";
import authFetch from "./utils/authFetch.js";

function Sidebar() {
    const { allThreads, setAllThreads, currThreadId, setNewChat, setPrompt, setStreamingReply, setCurrThreadId, setPrevChats, setThreadProfile, user, handleLogout } = useContext(MyContext);

    const getAllThreads = async () => {
        try {
            const response = await authFetch("http://localhost:8080/api/thread");
            if (!response.ok) return;
            const res = await response.json();
            setAllThreads(res.map(thread => ({ threadId: thread.threadId, title: thread.title })));
        } catch (err) {
            console.log(err);
        }
    };

    useEffect(() => {
        getAllThreads();
    }, [currThreadId]);

    const createNewChat = () => {
        setNewChat(true);
        setPrompt("");
        setStreamingReply("");
        setCurrThreadId(uuidv1());
        setPrevChats([]);
        setThreadProfile(null);
    };

    const changeThread = async (newThreadId) => {
        setCurrThreadId(newThreadId);
        setStreamingReply("");
        try {
            const response = await authFetch(`http://localhost:8080/api/thread/${newThreadId}`);
            if (!response.ok) return;
            const res = await response.json();
            setPrevChats(res.messages || res);
            setThreadProfile(res.profile || null);
            setNewChat(false);
        } catch (err) {
            console.log(err);
        }
    };

    const deleteThread = async (threadId) => {
        try {
            await authFetch(`http://localhost:8080/api/thread/${threadId}`, { method: "DELETE" });
            setAllThreads(prev => prev.filter(thread => thread.threadId !== threadId));
            if (threadId === currThreadId) createNewChat();
        } catch (err) {
            console.log(err);
        }
    };

    return (
        <section className="sidebar">
            <div className="sidebar-header">
                <button className="new-chat-btn" onClick={createNewChat}>
                    <div className="btn-left">
                        <img src="src/assets/blacklogo.png" alt="logo" className="logo" />
                        <span className="btn-text">New Chat</span>
                    </div>
                    <i className="fa-solid fa-pen-to-square"></i>
                </button>
            </div>

            <ul className="history">
                {allThreads?.map((thread) => (
                    <li key={thread.threadId}
                        onClick={() => changeThread(thread.threadId)}
                        className={thread.threadId === currThreadId ? "highlighted" : ""}
                    >
                        <span className="thread-title">{thread.title}</span>
                        <i className="fa-solid fa-trash"
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteThread(thread.threadId);
                            }}
                        ></i>
                    </li>
                ))}
            </ul>

            <div className="sidebar-footer">
                <span className="user-email">
                    <i className="fa-solid fa-circle-user"></i>
                    {user?.email}
                </span>
                <button className="logout-btn" onClick={handleLogout} title="Sign out">
                    <i className="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        </section>
    );
}

export default Sidebar;
