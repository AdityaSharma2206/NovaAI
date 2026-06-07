import './App.css';
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import Login from "./Login.jsx";
import Register from "./Register.jsx";
import { MyContext } from "./MyContext.jsx";
import { useState, useEffect } from 'react';
import { v1 as uuidv1 } from "uuid";
import { setUnauthorizedHandler } from "./utils/authFetch.js";

// JWT payloads are base64url encoded — replace url-safe chars before decoding
function decodeToken(token) {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

// Called once on mount: reads localStorage and validates expiry without a server round-trip
function getStoredUser() {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const decoded = decodeToken(token);
    if (!decoded || decoded.exp * 1000 < Date.now()) {
        localStorage.removeItem("token");
        return null;
    }
    return { id: decoded.userId, email: decoded.email };
}

function App() {
    const [user, setUser] = useState(() => getStoredUser());
    const [showRegister, setShowRegister] = useState(false);

    const [prompt, setPrompt] = useState("");
    const [streamingReply, setStreamingReply] = useState("");
    const [currThreadId, setCurrThreadId] = useState(uuidv1());
    const [prevChats, setPrevChats] = useState([]);
    const [newChat, setNewChat] = useState(true);
    const [allThreads, setAllThreads] = useState([]);
    const [threadProfile, setThreadProfile] = useState(null);

    const handleLogout = () => {
        localStorage.removeItem("token");
        setUser(null);
        setPrompt("");
        setStreamingReply("");
        setCurrThreadId(uuidv1());
        setPrevChats([]);
        setAllThreads([]);
        setThreadProfile(null);
        setNewChat(true);
    };

    // Register the logout handler with authFetch so any 401 auto-logs out
    useEffect(() => {
        setUnauthorizedHandler(handleLogout);
    }, []);

    const handleLogin = (userData) => {
        setUser(userData);
    };

    const providerValues = {
        prompt, setPrompt,
        streamingReply, setStreamingReply,
        currThreadId, setCurrThreadId,
        newChat, setNewChat,
        prevChats, setPrevChats,
        allThreads, setAllThreads,
        threadProfile, setThreadProfile,
        user,
        handleLogout
    };

    if (!user) {
        return showRegister
            ? <Register onLogin={handleLogin} switchToLogin={() => setShowRegister(false)} />
            : <Login onLogin={handleLogin} switchToRegister={() => setShowRegister(true)} />;
    }

    return (
        <div className='app'>
            <MyContext.Provider value={providerValues}>
                <Sidebar />
                <ChatWindow />
            </MyContext.Provider>
        </div>
    );
}

export default App;
