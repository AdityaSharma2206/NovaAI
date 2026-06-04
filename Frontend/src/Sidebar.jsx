import "./Sidebar.css";
import { useContext, useEffect } from "react";
import { MyContext } from "./MyContext.jsx";
import {v1 as uuidv1} from "uuid";

function Sidebar() {
    // Only ONE useContext declaration here! We added setThreadProfile to it.
    const {allThreads, setAllThreads, currThreadId, setNewChat, setPrompt, setReply, setCurrThreadId, setPrevChats, setThreadProfile} = useContext(MyContext);

    const getAllThreads = async () => {
        try {
            const response = await fetch("http://localhost:8080/api/thread");
            const res = await response.json();
            const filteredData = res.map(thread => ({threadId: thread.threadId, title: thread.title}));
            setAllThreads(filteredData);
        } catch(err) {
            console.log(err);
        }
    };

    useEffect(() => {
        getAllThreads();
    }, [currThreadId])

    const createNewChat = () => {
        setNewChat(true);
        setPrompt("");
        setReply(null);
        setCurrThreadId(uuidv1());
        setPrevChats([]);
    }

    // Updated changeThread with the new AI Profile logic
    const changeThread = async (newThreadId) => {
        setCurrThreadId(newThreadId);
        try {
            const response = await fetch(`http://localhost:8080/api/thread/${newThreadId}`);
            const res = await response.json();
            
            // Handle the updated backend object
            setPrevChats(res.messages || res); 
            setThreadProfile(res.profile || null); // Save the AI Insights
            
            setNewChat(false);
            setReply(null);
        } catch(err) {
            console.log(err);
        }
    }   

    const deleteThread = async (threadId) => {
        try {
            await fetch(`http://localhost:8080/api/thread/${threadId}`, {method: "DELETE"});
            
            // Updated threads re-render
            setAllThreads(prev => prev.filter(thread => thread.threadId !== threadId));

            if(threadId === currThreadId) {
                createNewChat();
            }
        } catch(err) {
            console.log(err);
        }
    }

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
 
            <div className="sign">
                <p>NovaAI </p>
            </div>
        </section>
    )
}

export default Sidebar;