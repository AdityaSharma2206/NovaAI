import "./RagDebugPanel.css";

function ScoreBar({ score, selected }) {
    const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
    return (
        <div className="rag-bar-track">
            <div className={`rag-bar-fill ${selected ? "selected" : ""}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

function Row({ item }) {
    return (
        <li className={`rag-row ${item.selected ? "selected" : "rejected"}`}>
            <span className="rag-badge">{item.selected ? "✅" : "⬜"}</span>
            <span className="rag-rank">#{item.rank}</span>
            <span className="rag-score">{item.score.toFixed(3)}</span>
            <ScoreBar score={item.score} selected={item.selected} />
            <span className="rag-content" title={item.content}>"{item.content}"</span>
            <span className="rag-reason">{item.reason}</span>
        </li>
    );
}

// Renders the retrieval trace emitted by the backend's RAG Debug View.
function RagDebugPanel({ trace }) {
    if (!trace) return null;
    const { query, params, candidatesScored, selected, rejected, injectedContext, ragUsed } = trace;
    const rows = [...selected, ...rejected];

    return (
        <details className="rag-panel">
            <summary>
                <span>🔍 Retrieval details</span>
                <span className="rag-summary-meta">
                    {selected.length} used · {candidatesScored} scored · k={params.topK} · ≥{params.threshold}
                </span>
            </summary>

            <div className="rag-body">
                <div className="rag-query">Query: <em>"{query}"</em></div>

                {candidatesScored === 0 ? (
                    <div className="rag-empty">No past memories to retrieve from yet.</div>
                ) : (
                    <ul className="rag-list">
                        {rows.map((item) => <Row key={item.rank} item={item} />)}
                    </ul>
                )}

                {ragUsed ? (
                    <div className="rag-injected">
                        <div className="rag-injected-label">Injected into prompt:</div>
                        <pre>{injectedContext}</pre>
                    </div>
                ) : (
                    candidatesScored > 0 && (
                        <div className="rag-empty">
                            Nothing scored above {params.threshold} — no context was injected.
                        </div>
                    )
                )}
            </div>
        </details>
    );
}

export default RagDebugPanel;
