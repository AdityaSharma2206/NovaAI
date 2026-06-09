import "./ChatWindow.css";
import "./PersonalInsightsDrawer.css";
import Chat from "./Chat.jsx";
import AnalyticsDrawer from "./AnalyticsDrawer.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef, useEffect } from "react";
import authFetch from "./utils/authFetch.js";
import API_BASE from "./utils/api.js";
import { ScaleLoader } from "react-spinners";

// ── Profile tab helpers ──────────────────────────────────────────────────────

const timeAgo = (date) => {
    if (!date) return null;
    const seconds = Math.round((Date.now() - new Date(date)) / 1000);
    if (seconds < 60)  return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60)  return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24)    return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
};

const TYPE_META = {
    interest:   { icon: "fa-star",                 label: "New interest",   className: "type-interest" },
    goal:       { icon: "fa-bullseye",             label: "New goal",       className: "type-goal" },
    project:    { icon: "fa-folder",               label: "New project",    className: "type-project" },
    challenge:  { icon: "fa-triangle-exclamation", label: "New challenge",  className: "type-challenge" },
    preference: { icon: "fa-sliders",              label: "New preference", className: "type-preference" },
    objective:  { icon: "fa-flag",                 label: "New objective",  className: "type-objective" },
};

function ChipGroup({ label, icon, items, chipClass }) {
    if (!items?.length) return null;
    return (
        <div className="insight-section">
            <h5>
                <i className={`fa-solid ${icon}`}></i> {label}
                <span className="cat-count">{items.length}</span>
            </h5>
            <div className="chip-container">
                {items.map((item, i) => (
                    <span key={i} className={`ui-chip ${chipClass}`}>{item}</span>
                ))}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────

function ChatWindow() {
    const {
        prompt, setPrompt, setStreamingReply,
        currThreadId, setPrevChats, newChat,
        setThreadProfile, setNewChat, setAllThreads, threadProfile
    } = useContext(MyContext);

    const [loading, setLoading]                   = useState(false);
    const [isMemoryOpen, setIsMemoryOpen]         = useState(false);
    const [memoryTab, setMemoryTab]               = useState("chat");
    const [isAnalyticsOpen, setIsAnalyticsOpen]   = useState(false);
    const [memory, setMemory]                     = useState(null);
    const [memoryLoading, setMemoryLoading]       = useState(false);

    const textareaRef = useRef(null);

    // Fetch cross-thread UserMemory when the profile tab becomes active
    useEffect(() => {
        if (!isMemoryOpen || memoryTab !== "profile") return;
        setMemoryLoading(true);
        authFetch(`${API_BASE}/api/user-memory`)
            .then(r => r.json())
            .then(data => { setMemory(data); setMemoryLoading(false); })
            .catch(err => { console.log(err); setMemoryLoading(false); });
    }, [isMemoryOpen, memoryTab]);

    const fetchLatestProfile = async () => {
        try {
            const response = await authFetch(`${API_BASE}/api/thread/${currThreadId}`);
            const res = await response.json();
            if (res.profile) setThreadProfile(res.profile);
        } catch(err) {
            console.log("Failed to fetch background profile:", err);
        }
    };

    const openMemory = () => {
        setIsAnalyticsOpen(false);
        fetchLatestProfile();
        setIsMemoryOpen(true);
    };

    const getReply = async () => {
        if (!prompt.trim()) return;

        const isFirstMessage = newChat;
        const currentPrompt = prompt;

        setLoading(true);
        setNewChat(false);
        setPrompt("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

        if (isFirstMessage) {
            setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
        }

        const options = {
            method: "POST",
            body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
        };

        try {
            const response = await authFetch(`${API_BASE}/api/chat`, options);
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
                            setPrevChats(prev => [...prev, { role: "assistant", content: assembled }]);
                            setStreamingReply("");
                            setTimeout(() => fetchLatestProfile(), 3000);
                            if (isFirstMessage) {
                                setAllThreads(prev => prev.map(t =>
                                    t.threadId === currThreadId
                                        ? { ...t, title: parsed.title || currentPrompt }
                                        : t
                                ));
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

    // Profile tab derived state
    const hasAnyProfileData = memory && (
        memory.interests?.length || memory.goals?.length || memory.ongoingProjects?.length ||
        memory.challenges?.length || memory.longTermObjectives?.length || memory.lifeEvents?.length ||
        memory.topicFrequency?.length || memory.memoryHighlights?.length
    );

    const sortedTopics = memory?.topicFrequency
        ? [...memory.topicFrequency].sort((a, b) => b.count - a.count).slice(0, 6)
        : [];
    const maxCount = sortedTopics[0]?.count || 1;

    const recentHighlights = memory?.memoryHighlights
        ? [...memory.memoryHighlights].reverse().slice(0, 10)
        : [];

    const totalStored = memory
        ? (memory.interests?.length || 0) + (memory.goals?.length || 0) +
          (memory.ongoingProjects?.length || 0) + (memory.preferences?.length || 0) +
          (memory.challenges?.length || 0) + (memory.longTermObjectives?.length || 0)
        : 0;

    const activeCategoryCount = memory
        ? [memory.interests, memory.goals, memory.ongoingProjects,
           memory.challenges, memory.longTermObjectives]
            .filter(arr => arr?.length > 0).length
        : 0;

    return (
        <div className="chatWindow">
            <div className="navbar">
                <span className="brand">NovaAI <i className="fa-solid fa-chevron-down"></i></span>
                <div className="navbar-right">
                    <div className="userIconDiv" onClick={() => { setIsMemoryOpen(false); setIsAnalyticsOpen(true); }}>
                        <span className="userIcon"><i className="fa-solid fa-chart-line"></i></span>
                        <span className="nav-tool-label">Analytics</span>
                    </div>
                    <div className="userIconDiv" onClick={openMemory}>
                        <span className="userIcon"><i className="fa-solid fa-brain"></i></span>
                        <span className="nav-tool-label">Memory</span>
                    </div>
                </div>
            </div>

            <AnalyticsDrawer isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />

            {isMemoryOpen && <div className="drawer-overlay" onClick={() => setIsMemoryOpen(false)}></div>}
            <div className={`insights-drawer ${isMemoryOpen ? "open" : ""}`}>
                <div className="drawer-header">
                    <h4><i className="fa-solid fa-brain"></i> Memory</h4>
                    <button className="close-drawer" onClick={() => setIsMemoryOpen(false)}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="drawer-tabs">
                    <button
                        className={`drawer-tab ${memoryTab === "chat" ? "active" : ""}`}
                        onClick={() => setMemoryTab("chat")}
                    >
                        This Chat
                    </button>
                    <button
                        className={`drawer-tab ${memoryTab === "profile" ? "active" : ""}`}
                        onClick={() => setMemoryTab("profile")}
                    >
                        Your Profile
                    </button>
                </div>

                <div className="drawer-body">

                    {/* ── This Chat tab ───────────────────────────────── */}
                    {memoryTab === "chat" && (
                        <>
                            <p className="insight-sub">Real-time context extracted for this conversation.</p>

                            <div className="insight-section">
                                <h5><i className="fa-solid fa-crosshairs"></i> Active Context</h5>
                                <div className="context-card">
                                    {threadProfile?.activeContext || "Monitoring conversation to determine focus..."}
                                </div>
                            </div>

                            <div className="insight-section">
                                <h5><i className="fa-solid fa-database"></i> Known Facts</h5>
                                <div className="chip-container">
                                    {threadProfile?.userFacts?.length > 0 ? (
                                        threadProfile.userFacts.map((fact, i) => (
                                            <span key={i} className="ui-chip fact-chip">{fact}</span>
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
                                        threadProfile.preferences.map((pref, i) => (
                                            <span key={i} className="ui-chip pref-chip">{pref}</span>
                                        ))
                                    ) : (
                                        <span className="empty-text">Using standard behavior.</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Your Profile tab ────────────────────────────── */}
                    {memoryTab === "profile" && (
                        <>
                            {memoryLoading && <p className="insight-sub">Loading your profile…</p>}

                            {!memoryLoading && !hasAnyProfileData && (
                                <div className="memory-empty">
                                    <p>Your long-term profile is being built.</p>
                                    <p>Chat more and NovaAI will learn your interests, goals, and projects across all conversations.</p>
                                </div>
                            )}

                            {!memoryLoading && hasAnyProfileData && (
                                <>
                                    <p className="insight-sub">
                                        Personal profile built across all conversations.
                                        {memory.lastUpdated && (
                                            <span style={{ opacity: 0.6 }}> · Updated {timeAgo(memory.lastUpdated)}</span>
                                        )}
                                    </p>

                                    <div className="profile-health">
                                        <strong>{totalStored} facts</strong> stored across {activeCategoryCount} {activeCategoryCount === 1 ? "category" : "categories"}
                                        <span style={{ opacity: 0.6 }}> · Only durable personal facts are kept</span>
                                    </div>

                                    {memory.profileSummary && (
                                        <div className="insight-section">
                                            <h5><i className="fa-solid fa-id-card"></i> Summary</h5>
                                            <div className="context-card">{memory.profileSummary}</div>
                                        </div>
                                    )}

                                    <ChipGroup label="Interests"            icon="fa-star"                 items={memory.interests}          chipClass="interest-chip" />
                                    <ChipGroup label="Goals"                icon="fa-bullseye"             items={memory.goals}              chipClass="goal-chip" />
                                    <ChipGroup label="Ongoing Projects"     icon="fa-folder"               items={memory.ongoingProjects}    chipClass="project-chip" />
                                    <ChipGroup label="Challenges"           icon="fa-triangle-exclamation" items={memory.challenges}         chipClass="challenge-chip" />
                                    <ChipGroup label="Long-term Objectives" icon="fa-flag"                 items={memory.longTermObjectives} chipClass="objective-chip" />
                                    <ChipGroup label="Life Events"          icon="fa-calendar-star"        items={memory.lifeEvents}         chipClass="life-chip" />

                                    {sortedTopics.length > 0 && (
                                        <div className="insight-section">
                                            <h5><i className="fa-solid fa-chart-bar"></i> Frequent Topics</h5>
                                            {sortedTopics.map((t, i) => (
                                                <div key={i} className="token-bar-row">
                                                    <span className="token-bar-label">{t.topic}</span>
                                                    <div className="token-bar-track">
                                                        <div
                                                            className="token-bar-fill topic-fill"
                                                            style={{ width: `${Math.round((t.count / maxCount) * 100)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="token-bar-value">{t.count}×</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {recentHighlights.length > 0 && (
                                        <div className="insight-section">
                                            <h5><i className="fa-solid fa-clock-rotate-left"></i> Memory Highlights</h5>
                                            <div className="highlight-timeline">
                                                {recentHighlights.map((h, i) => {
                                                    const meta = TYPE_META[h.type] || { icon: "fa-circle", label: "Learned", className: "" };
                                                    return (
                                                        <div key={i} className="highlight-item">
                                                            <div className={`highlight-icon ${meta.className}`}>
                                                                <i className={`fa-solid ${meta.icon}`}></i>
                                                            </div>
                                                            <div className="highlight-body">
                                                                <span className="highlight-label">{meta.label}</span>
                                                                <span className="highlight-text">{h.content}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

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
    );
}

export default ChatWindow;
