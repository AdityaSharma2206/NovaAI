import "./PersonalInsightsDrawer.css";
import { useState, useEffect } from "react";
import authFetch from "./utils/authFetch.js";
import API_BASE from "./utils/api.js";

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
            <h5><i className={`fa-solid ${icon}`}></i> {label}</h5>
            <div className="chip-container">
                {items.map((item, i) => (
                    <span key={i} className={`ui-chip ${chipClass}`}>{item}</span>
                ))}
            </div>
        </div>
    );
}

function PersonalInsightsDrawer({ isOpen, onClose }) {
    const [memory, setMemory] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        authFetch(`${API_BASE}/api/user-memory`)
            .then(r => r.json())
            .then(data => { setMemory(data); setLoading(false); })
            .catch(err => { console.log(err); setLoading(false); });
    }, [isOpen]);

    const hasAnyData = memory && (
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

    return (
        <>
            {isOpen && <div className="drawer-overlay" onClick={onClose}></div>}

            <div className={`insights-drawer ${isOpen ? "open" : ""}`}>
                <div className="drawer-header">
                    <h4><i className="fa-solid fa-user-astronaut"></i> Personal Profile</h4>
                    <button className="close-drawer" onClick={onClose}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="drawer-body">
                    {loading && <p className="insight-sub">Loading your profile…</p>}

                    {!loading && !hasAnyData && (
                        <div className="memory-empty">
                            <p>Your long-term profile is being built.</p>
                            <p>Chat more and NovaAI will learn your interests, goals, and projects across all conversations.</p>
                        </div>
                    )}

                    {!loading && hasAnyData && (
                        <>
                            <p className="insight-sub">
                                Your personal profile, built across all conversations.
                                {memory.lastUpdated && (
                                    <span style={{ opacity: 0.6 }}> · Updated {timeAgo(memory.lastUpdated)}</span>
                                )}
                            </p>

                            {memory.profileSummary && (
                                <div className="insight-section">
                                    <h5><i className="fa-solid fa-id-card"></i> About You</h5>
                                    <div className="context-card">{memory.profileSummary}</div>
                                </div>
                            )}

                            <ChipGroup label="Interests"          icon="fa-star"             items={memory.interests}          chipClass="interest-chip" />
                            <ChipGroup label="Goals"              icon="fa-bullseye"         items={memory.goals}              chipClass="goal-chip" />
                            <ChipGroup label="Ongoing Projects"   icon="fa-folder"           items={memory.ongoingProjects}    chipClass="project-chip" />
                            <ChipGroup label="Challenges"         icon="fa-triangle-exclamation" items={memory.challenges}    chipClass="challenge-chip" />
                            <ChipGroup label="Long-term Objectives" icon="fa-flag"           items={memory.longTermObjectives} chipClass="objective-chip" />
                            <ChipGroup label="Life Events"        icon="fa-calendar-star"    items={memory.lifeEvents}         chipClass="life-chip" />

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
                </div>
            </div>
        </>
    );
}

export default PersonalInsightsDrawer;
