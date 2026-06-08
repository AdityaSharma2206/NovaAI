# 19 — Project Achievements and Metrics

**Purpose:** This file documents every measurable achievement in NovaAI with precise numbers — real TTFT measurements, average latency, cost per message, token breakdown, RAG threshold justification, and architectural scale numbers. These numbers make your resume bullets specific and credible. Never quote numbers you don't understand — this file explains where every number comes from.

**Learning Value:** ⭐⭐⭐⭐ (Turns vague claims into credible facts)
**Interview Importance:** ⭐⭐⭐⭐⭐ (Quantified achievements are 2–3× stronger than unquantified ones)
**Estimated Reading Time:** 25–35 minutes
**Prerequisites:** 12-analytics-guide.md

---

## Table of Contents

1. [Performance Metrics](#1-performance-metrics)
2. [Cost Metrics](#2-cost-metrics)
3. [Token Economics](#3-token-economics)
4. [RAG Performance](#4-rag-performance)
5. [Technical Scale Numbers](#5-technical-scale-numbers)
6. [Code Quality and Feature Count](#6-code-quality-and-feature-count)
7. [How These Numbers Appear on Your Resume](#7-how-these-numbers-appear-on-your-resume)
8. [What You Can Honestly Say vs Exaggerating](#8-honesty-calibration)

---

## 1. Performance Metrics

### TTFT — Time to First Token: ~749ms

**What it measures:** Time from when the backend starts processing the request until the first token is written to the SSE response. This is what the user actually feels — how long until something appears.

**How it was measured:** `const requestStart = Date.now()` at the top of the route handler. On the first `onChunk(token)` callback: `ttftMs = Date.now() - requestStart`. Stored in the Analytics collection per message. Averaged via `{ $avg: "$ttftMs" }` in the aggregation pipeline.

**Measured value:** ~749ms average across 45 messages (11 conversations), with the full feature set active: UserMemory fetch, 4-layer system prompt construction, message embedding call, RAG scoring, and (for new threads) title generation.

**What it includes:**
- ~100ms: `getOpenAIEmbedding(message)` call
- ~50ms: MongoDB queries (Thread, UserMemory)
- ~50ms: RAG scoring (linear scan in JavaScript)
- ~300–400ms: OpenAI's own warm-up before generating first token
- ~50ms: (new threads only) `generateTitle()` adds more — older threads are faster

**What it means in context:** Without streaming, users would wait this entire 749ms PLUS the full generation time (4–8 seconds) before seeing anything. With streaming, they see the first word at 749ms and read while the rest generates.

**How to quote it:** "I measured an average TTFT of 749ms — users see the first word in under a second."

---

### Average Latency: ~7,330ms

**What it measures:** Total time from request processing start until `onDone` fires (the stream completes). This is NOT the perceived wait — it's the total duration of the entire response generation.

**How it was measured:** `Date.now() - requestStart` in the `onDone` callback.

**Measured value:** ~7,330ms average across 45 messages.

**Why it's higher than expected:** The full feature set adds substantial overhead. A simple OpenAI call with no context overhead might complete in 2–3 seconds. The 4-layer system prompt adds hundreds of tokens; long AI responses take longer to generate; the embedding call before streaming adds ~100ms. The 7,330ms is total stream duration including long, detailed AI responses.

**How to frame it:** "The total stream duration averaged 7,330ms — but users are reading tokens the entire time. The perceived wait is the 749ms TTFT, not the 7,330ms total."

**Don't misquote this as "latency" without context** — an interviewer might think you have 7 seconds of unresponsive UI. Clarify it's total generation time with streaming active throughout.

---

## 2. Cost Metrics

### GPT-4o-mini Pricing

```
Input tokens:  $0.15 per 1,000,000 tokens = $0.00000015 per token
Output tokens: $0.60 per 1,000,000 tokens = $0.00000060 per token
```

These are OpenAI's published prices (current as of testing). Prices may change.

### Total Cost: $0.0238 Across 45 Messages

**Context:** 11 conversations, 45 messages, full feature set active (UserMemory, RAG, 4-layer prompt, conversation summarization). This represents realistic heavy usage.

**How it was calculated:** Each message's estimated cost = `(promptTokens × 0.00000015) + (completionTokens × 0.0000006)`. Summed across all 45 messages by the analytics aggregation.

### Average Cost Per Message: $0.0005

$0.0238 ÷ 45 messages = $0.000529 ≈ $0.0005

**Practical translation:**
- 100 messages (one active month) = $0.05
- 1,000 messages (heavy user, one month) = $0.50
- 10,000 messages (very heavy or multiple users) = $5.00

The app is extremely affordable at personal scale.

### Projected Monthly Cost for Hypothetical Users

| Users | Messages/User/Month | Total Messages | Monthly Cost |
|-------|--------------------|--------------:|-------------|
| 1 | 200 | 200 | $0.10 |
| 10 | 100 | 1,000 | $0.50 |
| 100 | 100 | 10,000 | $5.00 |
| 1,000 | 50 | 50,000 | $25.00 |

Even at 1,000 users, the API cost is $25/month. Compute costs (hosting) would be the main expense at that scale.

---

## 3. Token Economics

### Measured Token Split: 74% Prompt / 26% Completion

**Measured values:**
- Total tokens: 89,277
- Prompt tokens: 66,223 (74.2%)
- Completion tokens: 23,054 (25.8%)

**Why prompt > completion:**

The 4-layer system prompt contributes ~300–500 tokens on every single message:
```
Base instruction: ~30 tokens
UserMemory (if populated): ~100–200 tokens
Conversation summary (if exists): ~100–150 tokens
Thread profile (if populated): ~80–150 tokens
RAG context (if triggered): ~100–300 tokens
Total system message: 410–830 tokens
```

Plus the last 6 messages (~100 tokens each × 6 = ~600 tokens).

So prompt is consistently 600–1,400 tokens per message just for context, regardless of how short the user's question is. AI replies average ~200–500 tokens. The 74/26 split reflects this prompt-heavy architecture.

**What this means for costs:** Input tokens cost 4× less than output tokens ($0.15 vs $0.60 per million). The prompt-heavy split is actually favorable from a cost perspective — you pay less for the large context injection than you would for the same number of output tokens.

### Token Savings From Conversation Summarization

For a 30-message thread (messages 1-24 compressed):
- Without summarization: ~4,000 tokens of history per request
- With summarization: ~300-token summary per request
- Savings: ~3,700 prompt tokens per message
- Cost savings: 3,700 × $0.00000015 = ~$0.0006 per message
- Over 20 subsequent messages: ~$0.012 saved just for that thread

Summarization more than pays for itself (the summarization call costs ~1,000 prompt + 200 completion tokens ≈ $0.00027).

---

## 4. RAG Performance

### RAG Usage Rate: 36%

**What it means:** RAG was triggered (at least one past message scored above 0.4 cosine similarity) in 36% of the 45 test messages.

**How it was measured:** `ragUsed = historicalContext !== ""` (a boolean set before calling OpenAI). `ragUsedCount: { $sum: { $cond: ["$ragUsed", 1, 0] } }` in the aggregation. `ragUsageRate = ragUsedCount / totalMessages`.

**What 36% means:** A rate above ~25–30% indicates the system is genuinely helping — context from past messages is meaningfully relevant to the new questions. A rate below 10% would suggest either the threshold is too high or the conversations aren't building on earlier context. 36% is a strong result.

### The 0.4 Similarity Threshold

**What 0.4 means intuitively for `text-embedding-3-small`:**
- < 0.3: Essentially unrelated text
- 0.3–0.4: Weak topical overlap
- 0.4–0.6: Meaningfully semantically related
- 0.6–0.8: Strongly related, clearly same topic
- > 0.8: Near-identical meaning

The 0.4 cutoff was chosen empirically — low enough to catch relevant context, high enough to exclude noise.

### Embedding Vector Dimensions: 1,536

`text-embedding-3-small` produces 1,536-dimensional vectors. What this means in practice:

- **Storage:** 1,536 floats × 4 bytes = ~6,144 bytes = ~6KB per message embedding
- **A 50-message thread:** ~300KB of embedding data stored in MongoDB
- **Computation per cosine similarity:** 1,536 multiplications + 1,536 additions = ~3,000 FLOPs — essentially instant

Why 1,536? More dimensions = more nuance in representing meaning. OpenAI's model was trained to pack semantic information into exactly 1,536 numbers for this model size. Their larger embedding models use 3,072 dimensions.

---

## 5. Technical Scale Numbers

Every number on this list should be memorized and explainable:

| Parameter | Value | Why |
|-----------|-------|-----|
| Embedding dimensions | 1,536 | `text-embedding-3-small` output size |
| JWT expiry | 7 days | Balance of UX (stay logged in) vs security risk |
| bcrypt cost factor | 10 | ~100ms per hash — imperceptible to user, expensive to brute-force |
| Summary threshold | 14 messages | When summarization starts |
| Recent window | 6 messages | Messages always sent verbatim to OpenAI |
| Summary rebuild cadence | 4 new messages | Amortizes extra API call cost |
| RAG top-K | 3 results | Enough context, not too much token overhead |
| RAG threshold | 0.4 cosine similarity | Empirically calibrated for `text-embedding-3-small` |
| UserMemory highlight cap | 20 entries | Prevents unbounded growth |
| Topic categories | 8 predefined | Travel, Fitness, Relationships, Finance, Career, Education, Entertainment, Technology |
| UserMemory injection limits | 5 interests, 3 goals, 3 projects, 3 challenges | Prevents runaway prompt token cost |
| API endpoints | 8 | See file 14 section 10 |
| OpenAI function types | 4 | Standard, JSON mode, Embedding, Streaming |
| MongoDB collections | 4 | users, threads, analytics, usermemories |

---

## 6. Code Quality and Feature Count

### Feature Count: 20+ distinct features

See file 15 for the complete list. Highlights:
- 3 advanced AI features (RAG, summarization, long-term memory)
- Real-time streaming with SSE
- Analytics dashboard with 9 metrics
- JWT auth with auto-logout
- 3 slide-out drawers (Analytics, Memory, Insights)
- Optimistic UI updates
- Auto-expanding textarea
- Markdown + syntax highlighting
- Two-click delete confirmation
- Background task chain

### API Endpoint Count: 8

```
POST /api/auth/register
POST /api/auth/login
GET  /api/thread
GET  /api/thread/:threadId
DEL  /api/thread/:threadId
POST /api/chat           ← SSE streaming endpoint
GET  /api/analytics
GET  /api/user-memory
```

### MongoDB Collections: 4

`users`, `threads`, `analytics`, `usermemories`

### OpenAI API Call Types: 4 distinct

`getOpenAIAPIResponse` (non-streaming), `getOpenAIJSONResponse` (JSON mode), `getOpenAIEmbedding` (embeddings), `getOpenAIStreamingResponse` (SSE streaming)

---

## 7. How These Numbers Appear on Your Resume

### Bullet formulas that work:

**Pattern 1: Achieved [metric] by [method]**
> "Achieved 749ms average TTFT by streaming tokens via SSE as they're generated, rather than buffering the complete response"

**Pattern 2: Implemented [feature] reducing/increasing [metric] by [amount]**
> "Implemented sliding-window conversation summarization reducing prompt token consumption by ~67% for threads exceeding 14 messages"

**Pattern 3: Built [feature] tracking [N] metrics via [method]**
> "Built an analytics observability layer tracking 7 metrics per message — TTFT, latency, token counts, estimated cost, and RAG usage — aggregated via MongoDB `$match` + `$group` pipeline"

**Pattern 4: Measured [metric] across [N] test cases**
> "Measured $0.0005 average inference cost per message across 45 test messages using GPT-4o-mini at $0.15/M input + $0.60/M output"

### How to Verify Any Number If Asked in an Interview

| Number | Where to find it |
|--------|-----------------|
| 749ms TTFT | Open app, send 5 messages, check Analytics drawer `avgTtftMs` |
| $0.0005/msg | Analytics drawer `avgCostPerMessage` |
| 74/26 token split | Analytics drawer prompt/completion token counts |
| 36% RAG rate | Analytics drawer `ragUsageRate` |
| 7,330ms avg latency | Analytics drawer `avgLatencyMs` |
| $0.00000015/token | OpenAI pricing page |
| 1,536 dimensions | OpenAI `text-embedding-3-small` documentation |
| 0.4 threshold | `chat.js` line: `scoredMessages[0].score > 0.4` |
| 14 summary threshold | `chat.js` line: `const SUMMARY_THRESHOLD = 14` |

---

## 8. Honesty Calibration

### Fair Claims (Fully Supported by Evidence)

✅ "749ms average TTFT" — directly measured, 45-message sample, Analytics dashboard shows this

✅ "$0.0005 average cost per message" — calculated from real token counts and OpenAI pricing

✅ "36% RAG usage rate" — measured in Analytics, 45 messages

✅ "1,536-dimensional embeddings" — `text-embedding-3-small` documented spec

✅ "74/26 prompt/completion token split" — directly from OpenAI usage data

✅ "Real-time streaming via SSE" — implemented, not theoretical

✅ "Cross-conversation memory extraction via GPT-4o-mini in JSON mode" — implemented

### Claims That Need Caveats

⚠️ "~67% reduction in prompt tokens" — this is an *estimate* for a 30-message thread. Actual savings vary by conversation length and content. Say: "approximately 67% for long threads" or "up to 67%."

⚠️ "$0.50 per 1,000 messages" — extrapolation from $0.0005/msg. Actual cost depends on message length and AI response verbosity. Say: "estimated at $0.50/1,000 messages based on measured average."

⚠️ "Reduces perceived latency from 4–8s to 749ms" — the "4–8s without streaming" is a reasonable estimate for GPT-4o-mini response time, not a direct measurement in this app. Say: "users see the first token in 749ms instead of waiting for the complete response."

### How to Be Accurate Without Underselling

The word "approximately" is your friend:
- "approximately 749ms" — more defensible than just "749ms"
- "measured across 45 messages" — shows you know the sample size
- "estimated at" — for derived/extrapolated numbers

Never invent precision you don't have. But also don't hide real numbers behind vagueness. You measured these numbers. Be proud of that and stand behind them.
