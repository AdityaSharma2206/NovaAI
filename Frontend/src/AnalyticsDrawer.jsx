import "./AnalyticsDrawer.css";
import { useState, useEffect } from "react";
import authFetch from "./utils/authFetch.js";

function AnalyticsDrawer({ isOpen, onClose }) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        authFetch("http://localhost:8080/api/analytics")
            .then(r => r.json())
            .then(data => { setMetrics(data); setLoading(false); })
            .catch(err => { console.log(err); setLoading(false); });
    }, [isOpen]);

    const fmt         = (n) => (n ?? 0).toLocaleString();
    const fmtMs       = (n) => n ? `${n.toLocaleString()} ms` : "—";
    const fmtCost     = (n) => `$${(n ?? 0).toFixed(4)}`;
    const fmtPct      = (n) => `${((n ?? 0) * 100).toFixed(0)}%`;
    const fmtCostPer  = (n) => n ? `$${n.toFixed(4)}/msg` : null;

    const total       = metrics?.totalTokens || 0;
    const promptPct   = total > 0 ? Math.round((metrics.totalPromptTokens / total) * 100) : 0;
    const completePct = 100 - promptPct;

    return (
        <>
            {isOpen && <div className="drawer-overlay" onClick={onClose}></div>}

            <div className={`insights-drawer ${isOpen ? "open" : ""}`}>
                <div className="drawer-header">
                    <h4><i className="fa-solid fa-chart-line"></i> Usage Analytics</h4>
                    <button className="close-drawer" onClick={onClose}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="drawer-body">
                    {loading && (
                        <p className="insight-sub">Loading metrics…</p>
                    )}

                    {!loading && !metrics && (
                        <p className="insight-sub">No data yet. Send a message to start tracking.</p>
                    )}

                    {!loading && metrics && (
                        <>
                            <p className="insight-sub">
                                Live usage metrics from your conversations.
                            </p>

                            <div className="analytics-grid">
                                <div className="analytics-card">
                                    <span className="analytics-label">Conversations</span>
                                    <span className="analytics-value">{fmt(metrics.totalConversations)}</span>
                                </div>
                                <div className="analytics-card">
                                    <span className="analytics-label">Messages</span>
                                    <span className="analytics-value">{fmt(metrics.totalMessages)}</span>
                                </div>
                                <div className="analytics-card">
                                    <span className="analytics-label">Total Tokens</span>
                                    <span className="analytics-value">{fmt(metrics.totalTokens)}</span>
                                </div>
                                <div className="analytics-card">
                                    <span className="analytics-label">Est. Cost</span>
                                    <span className="analytics-value accent">{fmtCost(metrics.estimatedTotalCostUsd)}</span>
                                    {fmtCostPer(metrics.avgCostPerMessage) && (
                                        <span className="analytics-sub">{fmtCostPer(metrics.avgCostPerMessage)}</span>
                                    )}
                                </div>
                                <div className="analytics-card">
                                    <span className="analytics-label">Avg Latency</span>
                                    <span className="analytics-value">{fmtMs(metrics.avgLatencyMs)}</span>
                                </div>
                                <div className="analytics-card">
                                    <span className="analytics-label">Avg TTFT</span>
                                    <span className="analytics-value accent">{fmtMs(metrics.avgTtftMs)}</span>
                                </div>
                            </div>

                            <div className="insight-section" style={{ marginTop: "24px" }}>
                                <h5><i className="fa-solid fa-chart-bar"></i> Token Breakdown</h5>
                                <div className="token-bar-row">
                                    <span className="token-bar-label">Prompt</span>
                                    <div className="token-bar-track">
                                        <div className="token-bar-fill prompt-fill" style={{ width: `${promptPct}%` }}></div>
                                    </div>
                                    <span className="token-bar-value">{fmt(metrics.totalPromptTokens)} ({promptPct}%)</span>
                                </div>
                                <div className="token-bar-row">
                                    <span className="token-bar-label">Completion</span>
                                    <div className="token-bar-track">
                                        <div className="token-bar-fill completion-fill" style={{ width: `${completePct}%` }}></div>
                                    </div>
                                    <span className="token-bar-value">{fmt(metrics.totalCompletionTokens)} ({completePct}%)</span>
                                </div>
                            </div>

                            <div className="insight-section">
                                <h5><i className="fa-solid fa-database"></i> RAG Activity</h5>
                                <div className="context-card">
                                    {metrics.ragUsageRate >= 0.3 ? (
                                        <>Past conversations are <strong>actively improving your answers</strong> — semantic context retrieved in <strong>{fmtPct(metrics.ragUsageRate)}</strong> of messages.</>
                                    ) : (
                                        <>Semantic search contributed context in <strong>{fmtPct(metrics.ragUsageRate)}</strong> of messages — more conversations will improve retrieval accuracy.</>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

export default AnalyticsDrawer;
