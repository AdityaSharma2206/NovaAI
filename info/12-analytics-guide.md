# 12 — Analytics and Observability Guide

**Purpose:** NovaAI tracks nine performance and cost metrics for every message sent — tokens, cost, latency, TTFT, and RAG usage. These are aggregated in MongoDB and displayed in a live dashboard. This file explains what each metric means, how it's measured, how the MongoDB aggregation pipeline computes it, and why building observability into an AI system is a sign of production-level thinking.

**Learning Value:** ⭐⭐⭐⭐ (Shows engineering maturity beyond "make it work")
**Interview Importance:** ⭐⭐⭐⭐ (Observability is a major topic in senior/mid-level interviews)
**Estimated Reading Time:** 35–45 minutes
**Prerequisites:** 06-mongodb-complete-guide.md, 09-openai-and-llm-guide.md

---

## Table of Contents

1. [Why Analytics Matter in AI Applications](#1-why-analytics-matter)
2. [The Analytics Data Model](#2-the-analytics-data-model)
3. [How Each Metric Is Measured](#3-how-each-metric-is-measured)
4. [The Cost Calculation](#4-the-cost-calculation)
5. [The Aggregation Pipeline](#5-the-aggregation-pipeline)
6. [The Analytics Dashboard UI](#6-the-analytics-dashboard-ui)
7. [NovaAI's Real Measured Numbers](#7-novaais-real-measured-numbers)
8. [Summary](#8-summary)
9. [Interview Questions and Answers](#9-interview-questions-and-answers)

---

## 1. Why Analytics Matter in AI Applications

### The "Black Box" Problem

Without instrumentation, you'd have no answer to:
- "How much am I spending per message?"
- "Is the app getting slower as conversations get longer?"
- "Is RAG actually being triggered, or is it a dead feature?"
- "Why did that message feel slow?"

Analytics turn the AI from a black box into an observable system. You can make data-driven decisions about performance and cost.

### The Production Mindset

Most beginner projects just make things work. Building analytics shows you've thought about:
- **Cost control:** Token usage directly translates to money. If you don't measure it, you can't manage it.
- **Performance:** TTFT and latency are user experience problems when bad. You need baselines.
- **Feature validation:** The RAG usage rate proves the feature is actively helping users, not just sitting dormant.

This mindset is what interviewers at product-focused companies want to see.

---

## 2. The Analytics Data Model

### One Document Per Message

```javascript
// Backend/models/Analytics.js
const AnalyticsSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    threadId:         { type: String, required: true },
    promptTokens:     { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens:      { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    latencyMs:        { type: Number, default: 0 },
    ttftMs:           { type: Number, default: 0 },
    ragUsed:          { type: Boolean, default: false },
    timestamp:        { type: Date, default: Date.now }
});

AnalyticsSchema.index({ userId: 1, timestamp: -1 });
```

A new Analytics document is created after every AI response — never modified, only appended to. This is an **append-only log pattern**: each event is an immutable record of what happened. To get current stats, you aggregate over the log.

### Why Separate From the Thread Document

Messages are stored in the Thread document. Analytics could theoretically be added to each message subdocument. Why separate?

1. **Different query patterns:** Analytics queries aggregate across all threads; chat queries read one thread at a time. Keeping them separate enables different indexes.
2. **Write patterns:** Analytics records are written once (after each reply) and never updated. Chat messages might be read frequently. Separate documents prevent contention.
3. **Future deletion:** You might want to delete analytics (GDPR) while keeping chat history.
4. **Append-only log:** A separate collection makes it clear this is observability data, not operational data.

---

## 3. How Each Metric Is Measured

### TTFT — Time to First Token

```javascript
// In chat.js route:
const requestStart = Date.now();  // timestamp when backend starts processing
let ttftMs = null;

// In onChunk callback — first token arrives:
(token) => {
    if (ttftMs === null) ttftMs = Date.now() - requestStart;
    // ↑ only captures the FIRST token — subsequent tokens don't overwrite
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
}
```

`ttftMs` measures: time from when the backend starts processing until the first `onChunk` call. This includes:
- Time to embed the user message
- Time to run RAG scoring
- Time to build the 4-layer system prompt
- (For new threads) time for title generation
- OpenAI's own warm-up before generating the first token

**Measured result:** ~749ms average across 45 messages.

### Latency — Total Stream Duration

```javascript
// In onDone callback — stream complete:
async (fullReply, usage) => {
    const latencyMs = Date.now() - requestStart;  // total time from start to stream end
    // ...
}
```

`latencyMs` measures: total time from request processing start until `onDone` fires. This includes everything in TTFT plus the entire generation time of the AI's response. Longer responses = higher latency.

**Measured result:** ~7,330ms average — high because the 4-layer system prompt is substantial overhead and the AI generates detailed responses. Users don't feel this as a wait because they're reading tokens as they arrive.

### Token Counts — From OpenAI

```javascript
// In openai.js — usage chunk is captured:
if (parsed.usage) usage = parsed.usage;
// usage = { prompt_tokens: 342, completion_tokens: 87, total_tokens: 429 }
```

The `include_usage: true` stream option makes OpenAI send a final chunk with actual token counts before `[DONE]`. These are the real numbers — not estimates.

### RAG Usage — Boolean Flag

```javascript
const ragUsed = historicalContext !== "";
// True if at least one past message scored above 0.4 cosine similarity
```

Simple boolean: was RAG triggered for this message? The aggregation can then count how many messages used RAG and compute a usage rate.

---

## 4. The Cost Calculation

### GPT-4o-mini Pricing

```
Input (prompt) tokens:  $0.15 per million = $0.00000015 per token
Output (completion) tokens: $0.60 per million = $0.00000060 per token
```

### The Calculation in Code

```javascript
estimatedCostUsd: ((usage?.prompt_tokens || 0) * 0.00000015) +
                  ((usage?.completion_tokens || 0) * 0.0000006),
```

For a message with 342 prompt tokens and 87 completion tokens:
```
cost = (342 × 0.00000015) + (87 × 0.0000006)
     = 0.0000513 + 0.0000522
     = 0.0001035 USD
     ≈ $0.0001 per message
```

### Why Prompt Costs 4× Less Than Completion

Output tokens are 4× more expensive ($0.60 vs $0.15 per million) because generating tokens is more computationally intensive than reading them. The model has to run a full forward pass through billions of parameters for each output token. Reading input tokens is processed in one parallel pass.

This creates an economic incentive to have concise AI responses — completion tokens are where the money goes.

---

## 5. The Aggregation Pipeline

### The Full Pipeline Code (from `analytics.js`)

```javascript
const [agg, totalConversations] = await Promise.all([
    Analytics.aggregate([
        // Stage 1: filter to this user only
        { $match: { userId: new mongoose.Types.ObjectId(req.user.userId) } },
        
        // Stage 2: compute all metrics in one pass
        {
            $group: {
                _id: null,                                                    // group all together
                totalMessages:         { $sum: 1 },                           // count documents
                totalPromptTokens:     { $sum: "$promptTokens" },             // sum a field
                totalCompletionTokens: { $sum: "$completionTokens" },
                totalTokens:           { $sum: "$totalTokens" },
                estimatedTotalCostUsd: { $sum: "$estimatedCostUsd" },
                avgLatencyMs:          { $avg: "$latencyMs" },                // average a field
                avgTtftMs:             { $avg: "$ttftMs" },
                ragUsedCount:          { $sum: { $cond: ["$ragUsed", 1, 0] } } // conditional count
            }
        }
    ]),
    Thread.countDocuments({ userId: req.user.userId })  // runs in parallel
]);
```

### Post-Processing

```javascript
const stats = agg[0] || {};
const ragUsageRate = stats.totalMessages > 0
    ? parseFloat((stats.ragUsedCount / stats.totalMessages).toFixed(2))
    : 0;

const avgCostPerMessage = stats.totalMessages > 0
    ? parseFloat(((stats.estimatedTotalCostUsd || 0) / stats.totalMessages).toFixed(6))
    : 0;
```

`toFixed(2)` — RAG usage rate as a decimal (0.36 = 36%). `toFixed(6)` — cost per message with 6 decimal places of precision (e.g., 0.000523).

### Why `Promise.all()` Here

```javascript
const [agg, totalConversations] = await Promise.all([
    Analytics.aggregate([...]),
    Thread.countDocuments({ userId })
]);
```

These are two independent database queries. Running them in parallel with `Promise.all` halves the database round-trips. No ParallelSaveError risk here — these are reads, not writes on the same document.

### The Response JSON

```javascript
res.json({
    totalConversations,        // from Thread.countDocuments
    totalMessages,             // from $sum: 1
    totalPromptTokens,         // from $sum: "$promptTokens"
    totalCompletionTokens,     // from $sum: "$completionTokens"
    totalTokens,               // from $sum: "$totalTokens"
    estimatedTotalCostUsd,     // from $sum: "$estimatedCostUsd"
    avgLatencyMs,              // from $avg: "$latencyMs"
    avgTtftMs,                 // from $avg: "$ttftMs"
    ragUsageRate,              // computed: ragUsedCount / totalMessages
    avgCostPerMessage          // computed: totalCost / totalMessages
});
```

Nine metrics computed in two database queries. Efficient.

---

## 6. The Analytics Dashboard UI

The analytics are displayed in `AnalyticsDrawer.jsx`, opened via the chart icon in the navbar.

### The Six Stat Cards

Each card shows a metric with a label and sub-label:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  11                 │  │  45                 │  │  89,277             │
│  Conversations      │  │  Messages           │  │  Total Tokens       │
│                     │  │                     │  │  66,223 prompt      │
│                     │  │                     │  │  23,054 completion  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  $0.0238            │  │  749 ms             │  │  7,330 ms           │
│  Total Cost         │  │  Avg TTFT           │  │  Avg Latency        │
│  $0.0005/msg        │  │  Time to 1st token  │  │  Total stream time  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### The Token Breakdown Bar Chart

A visual horizontal bar showing the prompt/completion token split:

```
[████████████████████████████████████░░░░░░░░░]
 74% Prompt Tokens              26% Completion Tokens
```

Implemented in CSS using `flexbox` and `width` percentages computed from `totalPromptTokens / totalTokens`.

### The RAG Activity Card

A contextual message based on the RAG usage rate:

```javascript
const getRagMessage = (rate) => {
    if (rate >= 0.4) return "Semantic context is actively shaping responses";
    if (rate >= 0.2) return "Past conversations are improving your answers";
    if (rate > 0)    return "RAG system is warming up";
    return "No semantic context retrieved yet";
};
```

At 36% rate (0.36), the card shows: "Past conversations are actively improving your answers — semantic context retrieved in 36% of messages."

### Why Fetch on Every Open (Not Cached)

The analytics are fetched fresh every time the drawer opens:

```javascript
useEffect(() => {
    if (isOpen) fetchAnalytics();
}, [isOpen]);
```

If cached, the stats shown wouldn't reflect messages sent during the current session. Since analytics queries are fast (single aggregation pipeline), there's no need to cache.

---

## 7. NovaAI's Real Measured Numbers

From the 45-message test (11 conversations):

| Metric | Value | Context |
|--------|-------|---------|
| Avg TTFT | **749ms** | From send to first visible token |
| Avg Latency | **7,330ms** | Total stream duration (includes long AI responses) |
| Total Cost | **$0.0238** | Across 45 messages (full feature set active) |
| Avg Cost/Message | **$0.0005** | ($0.05 per 100 messages) |
| Token Split | **74% prompt / 26% completion** | Expected for prompt-heavy app |
| RAG Usage Rate | **36%** | RAG was triggered in 36% of messages |

### How to Quote These in an Interview

**TTFT (749ms):** "The TTFT I measured was ~749ms. For context, without streaming the user would wait 4–8 seconds seeing nothing. With streaming, they see the first word in under a second."

**Latency (7,330ms):** "The total stream duration averaged 7,330ms, but this is total generation time including long AI responses — not perceived wait time. Users are reading tokens the entire time."

**Cost ($0.0005/msg):** "Each message costs about half a cent. Running 1,000 messages (a heavy user for a month) would cost about $0.50."

**RAG (36%):** "RAG fired in 36% of messages. A rate above 30% indicates the feature is genuinely helping, not just dormant code."

---

## 8. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| Analytics document | One per message, append-only | `models/Analytics.js` |
| `ttftMs` | Time to first token (backend start → first chunk) | `Date.now() - requestStart` on first `onChunk` |
| `latencyMs` | Total stream time (backend start → stream close) | `Date.now() - requestStart` in `onDone` |
| `promptTokens` | Tokens sent to OpenAI | From `usage.prompt_tokens` |
| `completionTokens` | Tokens generated by AI | From `usage.completion_tokens` |
| `estimatedCostUsd` | Calculated per-message cost | `prompt × $0.00000015 + completion × $0.0000006` |
| `ragUsed` | Was RAG triggered? | `historicalContext !== ""` |
| `$match` | Filter analytics to this user | First aggregation stage |
| `$group` | Compute totals and averages | Second aggregation stage |
| `$sum: 1` | Count documents | `totalMessages` field |
| `$avg` | Average a numeric field | `avgLatencyMs`, `avgTtftMs` |
| `$cond` | Conditional in aggregation | Count RAG-used messages |
| `Promise.all` | Run two DB queries in parallel | Analytics + Thread.countDocuments |
| Compound index | `{ userId: 1, timestamp: -1 }` | Optimizes analytics queries |
| Dashboard | Opened via chart icon in navbar | `AnalyticsDrawer.jsx` |

---

## 9. Interview Questions and Answers

---

**Q: How did you track performance metrics in NovaAI?**

A: After every AI response, I create an Analytics document in MongoDB with seven metrics: prompt tokens, completion tokens, total tokens, estimated cost in USD, total latency (request start to stream end), TTFT (request start to first token), and a boolean for whether RAG was triggered. The token and usage data comes directly from OpenAI via the `stream_options: { include_usage: true }` option, which adds a final chunk with real token counts before the `[DONE]` sentinel. Latency and TTFT are measured with `Date.now()` timestamps on the server. The Analytics collection is append-only — one document per message, never modified. A MongoDB aggregation pipeline computes totals and averages across all documents for the dashboard.

---

**Q: How does your MongoDB aggregation work?**

A: The analytics route uses a two-stage aggregation pipeline. Stage 1 is `$match` which filters to only the current user's documents — essential for data isolation. Stage 2 is `$group` with `_id: null` to collapse all documents into one result. Within `$group`, I use `$sum: 1` to count messages, `$sum: "$fieldName"` to total numeric fields like tokens and cost, `$avg` for latency and TTFT, and `$sum: { $cond: ["$ragUsed", 1, 0] }` to conditionally count RAG-triggered messages. The aggregation runs in the database — no need to fetch thousands of documents into JavaScript. The `Thread.countDocuments` query runs in parallel via `Promise.all`. The full dashboard is computed in two database round-trips.

---

**Q: What did you discover from looking at your analytics data?**

A: Several things. The 74%/26% prompt-to-completion split confirmed that the 4-layer system prompt is the dominant cost driver — every message pays to send user memory, the conversation summary, thread profile, and RAG context. This justified the conversation summarization system: reducing old message history saves real money. The 749ms TTFT confirmed that SSE streaming genuinely improves perceived performance — without streaming, users would wait that long before seeing anything, then a wall of text. The 36% RAG usage rate validated that the feature is active, not dormant. And the $0.0005 per message cost means the app is extremely cheap to run — $0.50 for a heavy user's entire month of usage.

---

**Q: Why did you build analytics into this project?**

A: Two reasons. First, AI API costs are non-zero and directly proportional to usage — without observability you're flying blind on what's costing money. Second, TTFT and latency are user experience metrics: if they degrade as conversations get longer, you need to know. I also wanted to validate that features like RAG are actually being triggered and contributing. Building analytics is the difference between "I think this works" and "I know this works and have the numbers." For an interview, it shows I think about systems in production terms, not just "make it work on my machine." This is what distinguishes a serious engineering project from a tutorial follow-along.
