# Analytics & Observability — Design Document

## What Is Observability

Observability is the practice of understanding what is happening inside a system by looking at the data it produces. The word comes from control theory: a system is "observable" if you can determine its internal state by watching its outputs.

In software, observability typically means answering three questions:

1. **What happened?** — Events and logs
2. **How often and how fast?** — Metrics (counts, averages, percentiles)
3. **Why did it happen?** — Traces (following a request through the system)

For NovaAI, this means being able to answer questions like:
- How many messages has the user sent total?
- How much has the app cost in OpenAI tokens?
- Is the AI getting faster or slower over time?
- What is the typical time before the user sees the first word?

This is not enterprise monitoring. There are no dashboards with 50 panels, no alerting pipelines, no distributed tracing. It is a single MongoDB collection that records one row per message, and a simple aggregation endpoint that summarizes it.

---

## Why Analytics Matters for This Project

### For Resume Value
Every job posting for a software engineering role mentions "scalability", "performance", and "observability." Most portfolio projects have none of these. Adding even a simple analytics layer lets you say:

- "I track real token usage and OpenAI API costs"
- "I measure time-to-first-token across all conversations"
- "I built an observability layer that logs latency per request and surfaces it in a dashboard"

These are specific, measurable claims. They stand out against "I built a CRUD app."

### For Interview Value
Interviewers ask: "How would you monitor this in production?" Most freshers say "I'd add logging." A candidate who has actually built a metrics collection layer, knows what TTFT means, and can explain the difference between p50 and p95 latency is memorable.

### For Your Own Understanding
Once analytics is running, you can see how much each conversation actually costs, measure whether SSE streaming improved perceived latency, and understand the relationship between prompt length and token cost. These are real backend engineering skills.

---

## Current Architecture

```
User → POST /api/chat → verifyToken → chat.js route handler
                                        ↓
                              1. Embed user message (OpenAI)
                              2. Find/create Thread (MongoDB)
                              3. RAG retrieval (cosine similarity)
                              4. Profile injection (dynamic system prompt)
                              5. getOpenAIStreamingResponse
                                   ↓ onChunk → res.write (SSE token)
                                   ↓ onDone  → embed reply, save Thread, close
```

**What is currently invisible:**
- How many tokens each message uses
- How long the OpenAI call takes end-to-end
- How long until the first token arrives (TTFT)
- What the cumulative cost is across all conversations
- Any per-user usage summary

---

## Proposed Analytics Architecture

```
User → POST /api/chat → verifyToken → chat.js route handler
                                        ↓
                              [existing steps 1–4 unchanged]
                                        ↓
                              ┌─────────────────────────┐
                              │ Record requestStart time │
                              └─────────────────────────┘
                                        ↓
                              5. getOpenAIStreamingResponse  ← modified:
                                   stream_options.include_usage: true
                                   ↓ onChunk(token, isFirst)
                                        if isFirst → record ttftMs
                                        res.write(SSE token)
                                   ↓ onDone(fullReply, usage)
                                        record latencyMs
                                        save Analytics record (MongoDB)
                                        save Thread (existing)
                                        close SSE

GET /api/analytics → analyticsRoute → MongoDB aggregation → dashboard JSON

Frontend Analytics Drawer → fetches /api/analytics → renders metric cards
```

The analytics record is a **fire-and-save** — it writes to MongoDB after the stream closes, completely non-blocking. If it fails, the chat continues unaffected.

---

## What Gets Tracked (Per Message Exchange)

| Field | Type | How It's Captured |
|---|---|---|
| `userId` | ObjectId | From `req.user.userId` (JWT) |
| `threadId` | String | From request body |
| `promptTokens` | Number | From OpenAI `usage.prompt_tokens` (real count) |
| `completionTokens` | Number | From OpenAI `usage.completion_tokens` (real count) |
| `totalTokens` | Number | `promptTokens + completionTokens` |
| `estimatedCostUsd` | Number | Token counts × GPT-4o-mini pricing |
| `latencyMs` | Number | `Date.now()` difference from request start to `onDone` |
| `ttftMs` | Number | `Date.now()` difference from request start to first token |
| `ragUsed` | Boolean | Whether cosine similarity found matches above threshold |
| `timestamp` | Date | `new Date()` when record is saved |

---

## How Token Counts Are Captured

OpenAI's streaming API supports a parameter `stream_options: { include_usage: true }`. When this is set, OpenAI appends one extra chunk before `[DONE]` that looks like:

```
data: {"choices":[],"usage":{"prompt_tokens":47,"completion_tokens":183,"total_tokens":230}}
```

This is parsed in `getOpenAIStreamingResponse` and passed to the `onDone` callback alongside the assembled reply. These are the **actual token counts from OpenAI's tokenizer** — not estimates.

The current `onDone(fullReply)` signature becomes `onDone(fullReply, usage)` where:
```javascript
usage = { prompt_tokens: 47, completion_tokens: 183, total_tokens: 230 }
```

---

## How Cost Is Estimated

GPT-4o-mini pricing (as of June 2026):
- Input tokens: $0.150 per 1,000,000 tokens = $0.00000015 per token
- Output tokens: $0.600 per 1,000,000 tokens = $0.0000006 per token

```javascript
const estimatedCostUsd =
    (usage.prompt_tokens * 0.00000015) +
    (usage.completion_tokens * 0.0000006);
```

A typical conversation message costs roughly $0.00002–$0.00010 (tiny). But across hundreds of messages the total becomes measurable and resume-worthy.

---

## How TTFT Is Captured

In the existing SSE implementation, `onChunk` is called for every token. We add a first-call check in the route handler:

```javascript
const requestStart = Date.now();
let ttftMs = null;

getOpenAIStreamingResponse(
    recentMessages,
    (token) => {
        if (ttftMs === null) ttftMs = Date.now() - requestStart;  // ← first token only
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
    },
    async (fullReply, usage) => {
        const latencyMs = Date.now() - requestStart;  // ← total stream duration
        // save Analytics record with ttftMs, latencyMs, usage
    }
);
```

TTFT and total latency are captured with zero extra API calls. Both fall out of timers already embedded in the existing streaming flow.

---

## New Files

| File | Purpose |
|---|---|
| `Backend/models/Analytics.js` | Mongoose schema for per-request metric records |
| `Backend/routes/analytics.js` | GET /api/analytics — aggregates and returns dashboard data |
| `Frontend/src/AnalyticsDrawer.jsx` | Dashboard UI component |
| `Frontend/src/AnalyticsDrawer.css` | Styles for the dashboard |

---

## Modified Files

| File | Change |
|---|---|
| `Backend/utils/openai.js` | Add `stream_options.include_usage: true`; parse usage chunk; pass `usage` to `onDone` |
| `Backend/routes/chat.js` | Add `requestStart` timer, `ttftMs` capture, save Analytics record in `onDone` |
| `Backend/server.js` | Mount `analyticsRoutes` under `/api` (protected by existing verifyToken) |
| `Frontend/src/ChatWindow.jsx` | Add analytics drawer button + open/close state |

**Total: 4 new files, 4 modified files.**

---

## Analytics Dashboard — Proposed UI

A drawer panel that opens when the user clicks a chart icon in the navbar (same pattern as the existing "Agent Memory" drawer). No routing changes needed.

```
┌─────────────────────────────────────────────┐
│  📊 Usage Analytics                    [✕]  │
│                                             │
│  ┌───────────────┐  ┌───────────────┐       │
│  │ Conversations │  │   Messages    │       │
│  │      42       │  │     387       │       │
│  └───────────────┘  └───────────────┘       │
│                                             │
│  ┌───────────────┐  ┌───────────────┐       │
│  │ Total Tokens  │  │  Est. Cost    │       │
│  │   214,000     │  │   $0.087      │       │
│  └───────────────┘  └───────────────┘       │
│                                             │
│  ┌───────────────┐  ┌───────────────┐       │
│  │  Avg Latency  │  │   Avg TTFT    │       │
│  │   2,340 ms    │  │    387 ms     │       │
│  └───────────────┘  └───────────────┘       │
│                                             │
│  Token Breakdown                            │
│  Prompt:     125,000  (58%)   ████████░░   │
│  Completion:  89,000  (42%)   ██████░░░░   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## GET /api/analytics — Response Shape

```json
{
  "totalConversations": 42,
  "totalMessages": 387,
  "totalPromptTokens": 125000,
  "totalCompletionTokens": 89000,
  "totalTokens": 214000,
  "estimatedTotalCostUsd": 0.0872,
  "avgLatencyMs": 2340,
  "avgTtftMs": 387,
  "avgCompletionTokens": 230,
  "ragUsageRate": 0.34
}
```

All values are scoped to `req.user.userId` — each user sees only their own analytics. The backend uses a single MongoDB aggregation pipeline (`$match` → `$group`) to compute all values in one database round-trip.

---

## MongoDB Analytics Schema

```javascript
{
  _id: ObjectId,
  userId: ObjectId,     // ref to users — for scoping queries
  threadId: String,     // which conversation this belongs to
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  estimatedCostUsd: Number,
  latencyMs: Number,    // request start → stream close
  ttftMs: Number,       // request start → first token
  ragUsed: Boolean,     // whether RAG retrieved context for this message
  timestamp: Date
}

Indexes:
  { userId: 1, timestamp: -1 }   // for user-scoped queries sorted by time
```

---

## What Is NOT Included (Deliberate Simplifications)

| Excluded | Reason |
|---|---|
| Daily/weekly breakdowns | Adds complexity; aggregate totals are sufficient for portfolio |
| Percentile latency (p95, p99) | Requires sorting large arrays; totals and averages are enough |
| Per-thread analytics | Thread model already captures message count; redundant |
| Alerting / thresholds | Out of scope for this project |
| Admin view (all users) | Privacy concern; per-user view is appropriate |
| Chart visualisations | CSS progress bars are sufficient; charting libraries add bundle size |

---

## Metrics Explained

### Total Conversations
Count of distinct threadIds in the Analytics collection for this user. Equivalent to "how many chat sessions the user has started."

### Total Messages
Count of Analytics records for this user. Each record = one complete message exchange (one user message + one AI reply).

### Total Tokens
`SUM(totalTokens)` across all records. The raw number of tokens processed on behalf of this user. Demonstrates scale.

### Estimated Cost
`SUM(estimatedCostUsd)`. Not perfectly accurate (pricing changes, embedding calls not counted) but directionally correct. Good for interviews — shows you understand LLM economics.

### Average Latency
`AVG(latencyMs)`. The mean time from sending a message to receiving the last token. Measured in milliseconds.

### Average TTFT
`AVG(ttftMs)`. The mean time to first visible token. This is the metric most directly affected by the SSE implementation. Before SSE: TTFT ≈ latency. After SSE: TTFT ≈ 200–500ms regardless of total latency.

### RAG Usage Rate
`COUNT(ragUsed=true) / COUNT(*)`. The percentage of messages where the semantic search found relevant past context. Shows that the RAG pipeline is actively contributing.

---

## Resume Bullets (After Implementation)

- Built a lightweight observability layer tracking 8 metrics per request (token counts, cost, latency, TTFT) using a MongoDB aggregation pipeline and a zero-dependency implementation
- Measured 200–400ms average TTFT post-SSE implementation vs 2–4s pre-streaming, providing quantitative proof of the streaming improvement
- Tracked real OpenAI API costs using `stream_options.include_usage: true` to capture exact token counts from the model's tokenizer — not estimates
- Built a single-query analytics dashboard using MongoDB `$group` aggregation, surfacing 9 live metrics with no additional API calls

---

## Interview Questions and Answers

**"What is observability and how did you implement it here?"**

Observability is the ability to understand a system's internal state from its external outputs. I implemented it by recording a metrics document to MongoDB after every chat message — capturing token counts from OpenAI's streaming API, total latency measured with `Date.now()`, time-to-first-token captured on the first SSE chunk, and an estimated cost based on the model's published token pricing. A single GET endpoint uses a MongoDB `$group` aggregation to summarise all of a user's records into dashboard metrics. It's lightweight — one extra MongoDB write per message, one aggregation query when the dashboard opens.

**"How do you get token counts from a streaming response?"**

The OpenAI Chat Completions API accepts a parameter `stream_options: { include_usage: true }`. When set, OpenAI sends one additional SSE chunk before `[DONE]` that contains the full usage object: `{ prompt_tokens, completion_tokens, total_tokens }`. I parse this chunk in the stream reader and pass the usage data to the `onDone` callback alongside the assembled reply text. These are actual token counts from OpenAI's tokenizer — not character-based estimates.

**"What's the difference between latency and TTFT?"**

Latency (or total response latency) is the time from when the request is sent to when the last token arrives. It measures the full end-to-end duration of a message exchange. TTFT — Time To First Token — is the time from when the request is sent to when the first character of the AI's reply appears on screen. For non-streaming responses these are the same. With SSE streaming, TTFT drops to 200–400ms while total latency stays at 2–5 seconds. TTFT is the metric that determines perceived responsiveness; latency determines how long until the full answer is readable.

**"Why use MongoDB for metrics instead of a dedicated time-series database?"**

For this project, MongoDB is already the persistence layer. Adding a separate time-series database (InfluxDB, TimescaleDB) would mean operating two databases, adding connection management, and deploying extra infrastructure for a portfolio project. MongoDB handles the aggregate queries I need — totals and averages — in a single `$group` pipeline. The trade-offs are: no built-in time-bucketing, no automatic downsampling, and performance degrades at very high write rates. For a portfolio project with hundreds of records (not millions), MongoDB is completely appropriate. I'd switch to a purpose-built solution at production scale.

**"What would you add next to the analytics layer?"**

Three improvements in order of value: First, daily breakdowns — a `$dateToString` grouping in the aggregation pipeline to show usage per day. Second, percentile latency — the p95 latency tells you about tail performance and is much more useful than the mean alone. Third, cost forecasting — given current usage rate and date, project the monthly cost. All three are backend changes only, no new infrastructure.

**"How does the analytics write not slow down the chat response?"**

The Analytics record is saved inside the `onDone` callback, which runs after the stream has already closed and `res.end()` has been called. The HTTP response is complete before the analytics write starts. Even if the MongoDB write fails, the user has already received their full reply — the error is logged server-side only. This is the same pattern used for profile extraction in the existing RAG pipeline.

---

## Implementation Plan Summary

The full implementation touches 8 files. No architectural changes to existing features. All changes are additive. The SSE streaming and JWT auth layers are untouched in their logic — only new timing variables and one extra MongoDB write are added to the existing chat handler.

**Approval required before implementation begins.**
