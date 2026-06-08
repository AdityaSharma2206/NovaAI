# 11 — Conversation Summarization Guide

**Purpose:** As conversations grow longer, sending the entire history to OpenAI becomes expensive and eventually hits context window limits. NovaAI solves this by automatically compressing older messages into a summary while keeping recent messages verbatim. This file explains how the summarization system works, when it triggers, what it saves, and how the summary is injected back into the context.

**Learning Value:** ⭐⭐⭐⭐ (Demonstrates systems thinking)
**Interview Importance:** ⭐⭐⭐⭐ (Shows cost awareness and production thinking)
**Estimated Reading Time:** 35–45 minutes
**Prerequisites:** 09-openai-and-llm-guide.md

---

## Table of Contents

1. [The Context Window Cost Problem](#1-the-context-window-cost-problem)
2. [NovaAI's Summarization Strategy](#2-novaais-summarization-strategy)
3. [The `maybeSummarize()` Function](#3-the-maybesummarize-function)
4. [How the Summary Is Used](#4-how-the-summary-is-used)
5. [The Background Task Chain](#5-the-background-task-chain)
6. [Token and Cost Impact](#6-token-and-cost-impact)
7. [Summary](#7-summary)
8. [Interview Questions and Answers](#8-interview-questions-and-answers)

---

## 1. The Context Window Cost Problem

### Every Message in History = More Tokens = More Cost

When you send a message to NovaAI, the backend sends OpenAI a `messages` array containing the entire context. In a naive implementation, this grows with every exchange:

```
Message 5:   context = [system] + 4 pairs  = ~800 tokens
Message 20:  context = [system] + 19 pairs = ~3,000 tokens
Message 100: context = [system] + 99 pairs = ~15,000 tokens
```

At $0.15/M input tokens, 15,000 tokens per request × 100 requests = 1.5M tokens × $0.15 = $0.225 just for that one thread. Costs grow quadratically — each new message is processed alongside an ever-growing history.

### The Hard Limit: Context Window Overflow

GPT-4o-mini supports a 128,000 token context window. A very long conversation could eventually hit this limit. The system would either error or truncate messages unpredictably.

### Two Solutions: Truncation vs Summarization

**Truncation:** Only keep the last N messages, discard everything before. Simple, but the AI loses context — if you discussed your goals in message 1, they're gone by message 20.

**Summarization:** Compress old messages into a summary paragraph. The AI retains the key information from the entire conversation in a compact form, plus sees recent messages verbatim.

NovaAI uses summarization.

---

## 2. NovaAI's Summarization Strategy

### The Sliding Window with Compression

```
SUMMARY_THRESHOLD = 14   ← minimum messages before summarization starts
RECENT_WINDOW = 6        ← messages always kept verbatim
```

When the thread has more than 14 messages:

```
All messages in thread:
[0] system (dynamic)
[1] user    ←────────────────────┐
[2] assistant                    │  summarized into
[3] user                         │  thread.summary.content
...                              │
[N-7] user  ←────────────────────┘
[N-6] assistant  ←──────────────┐
[N-5] user                      │  sent verbatim
[N-4] assistant                 │  as recentMessages
[N-3] user                      │
[N-2] assistant                 │
[N-1] user   (current)  ←───────┘
```

What gets sent to OpenAI:
1. System message (with summary injected as Layer 2)
2. Last 6 messages verbatim

The summary replaces all the compressed messages in the context.

### The Visual Diagram

```
Without summarization (message 30):
┌──────────────────────────────────────────────────────────┐
│ [System: 500 tokens]                                     │
│ [msg 1-24: ~4,000 tokens] ← expensive, mostly redundant │
│ [msg 25-30: ~1,000 tokens] ← recent context             │
└──────────────────────────────────────────────────────────┘
Total: ~5,500 tokens per request

With summarization (message 30):
┌──────────────────────────────────────────────────────────┐
│ [System + summary: 800 tokens] ← compressed old msgs    │
│ [msg 25-30: ~1,000 tokens] ← recent context             │
└──────────────────────────────────────────────────────────┘
Total: ~1,800 tokens per request  (67% reduction!)
```

---

## 3. The `maybeSummarize()` Function

### When It Fires

```javascript
const SUMMARY_THRESHOLD = 14;
const RECENT_WINDOW = 6;

const maybeSummarize = async (thread) => {
    // Only start summarizing once thread has more than 14 messages
    if (thread.messages.length <= SUMMARY_THRESHOLD) return;

    // How many messages CAN be summarized (everything except system + recent 6)
    const summarizableCount = thread.messages.length - 1 - RECENT_WINDOW;
    
    // How many were already in the last summary
    const lastSummarizedCount = thread.summary?.builtFromMessageCount || 0;
    
    // How many NEW messages have accumulated since last summary
    const newSinceLastSummary = summarizableCount - lastSummarizedCount;

    // Only rebuild summary if: no summary exists OR 4+ new messages accumulated
    if (!thread.summary || newSinceLastSummary >= 4) {
        await generateSummary(thread, summarizableCount);
    }
};
```

### Why the 4-Message Refresh Cadence

Rebuilding the summary on every message after the threshold would mean an extra API call for every single message — doubling the cost. Instead, the summary is rebuilt every 4 new messages:

```
Message 15: summarize messages 1–9 (9 summarizable, 6 recent)
Message 16: 10 summarizable, last summary had 9 → 1 new — no rebuild
Message 17: 11 summarizable, last summary had 9 → 2 new — no rebuild
Message 18: 12 summarizable, last summary had 9 → 3 new — no rebuild
Message 19: 13 summarizable, last summary had 9 → 4 new → REBUILD
```

The summary is never more than 4 messages stale, at 1/4 the cost of rebuilding every time.

### The `generateSummary()` Function

```javascript
const generateSummary = async (thread, summarizableCount) => {
    // Get all messages that should be compressed (skip system msg at index 0)
    const messagesToSummarize = thread.messages.slice(1, 1 + summarizableCount);
    
    const conversationText = messagesToSummarize
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

    const summaryPrompt = [
        {
            role: "system",
            content: "Summarize this conversation history in 3-5 concise sentences. Capture the key facts, questions asked, conclusions reached, and context needed to continue the conversation naturally."
        },
        { role: "user", content: conversationText }
    ];

    const summaryText = await getOpenAIAPIResponse(summaryPrompt);

    // Log the compression ratio for debugging
    const rawChars = messagesToSummarize.reduce((sum, m) => sum + m.content.length, 0);
    const summaryChars = summaryText.length;
    const tokensSaved = Math.round((rawChars - summaryChars) / 4);
    console.log(`[Summary] Thread ${thread.threadId}: ${messagesToSummarize.length} messages (${rawChars} chars) → ${summaryChars} chars (~${tokensSaved} tokens saved/request)`);

    // Save to the thread document
    thread.summary = {
        content: summaryText,
        builtFromMessageCount: summarizableCount,  // track how many were included
        createdAt: new Date()
    };
    await thread.save();
};
```

### The Summarization Prompt

```
"Summarize this conversation history in 3-5 concise sentences. 
Capture the key facts, questions asked, conclusions reached, 
and context needed to continue the conversation naturally."
```

**Why this specific prompt:**
- "3-5 concise sentences" — prevents runaway summary length (an LLM might write 10 paragraphs if not constrained)
- "key facts, questions asked, conclusions reached" — explicit list of what to include
- "context needed to continue the conversation naturally" — frames the purpose: not for archiving, but for enabling coherent future conversation

### What Gets Stored

```javascript
thread.summary = {
    content: "User is studying for FAANG interviews. We discussed binary search trees and their traversal algorithms. The user prefers concise explanations with code examples. We covered time complexity of BST operations.",
    builtFromMessageCount: 12,    // messages 1-12 are compressed
    createdAt: new Date()
};
```

`builtFromMessageCount` is critical — it's what `maybeSummarize` reads to determine whether enough new messages have accumulated to warrant rebuilding.

---

## 4. How the Summary Is Used

### Layer 2 of the System Prompt

```javascript
// In chat.js — building the dynamic system prompt:
if (thread.summary?.content) {
    dynamicSystemPrompt += `\n\nSummary of earlier conversation:\n${thread.summary.content}`;
}
```

This injects the summary as the second layer, after UserMemory (Layer 1) but before thread profile (Layer 3) and RAG (Layer 4).

### The Full Message Array Sent to OpenAI

```javascript
const recentMessages = [
    thread.messages[0],                          // system message (with all 4 layers including summary)
    ...thread.messages.slice(-6)                 // last 6 messages verbatim
        .map(m => ({ role: m.role, content: m.content }))  // strip embeddings
];
```

So the AI sees:
1. System message containing: base instructions + user memory + **summary of old messages** + thread profile + RAG context
2. The last 6 messages of the actual conversation

The summary serves as the AI's "memory" of the older conversation, allowing it to answer "What did we talk about earlier?" or maintain context from the beginning of a long session.

---

## 5. The Background Task Chain

### Why Summarization Happens After the Response

```javascript
// In the onDone callback — AFTER streaming to user is complete:
extractProfileData(thread)
    .then(() => maybeSummarize(thread))
    .then(() => extractUserMemory(thread, req.user.userId))
    .catch(err => console.log("Background task error:", err));
```

The user has already received their answer. Summarization runs in the background — it will be ready for the **next** message, not the current one. There's no point delaying the user's response to compute a summary they won't see until later.

### Why Sequential, Not Parallel

Both `extractProfileData` and `maybeSummarize` modify and save the same `thread` Mongoose document. Running them simultaneously causes a `ParallelSaveError` — Mongoose rejects two saves of the same document in flight simultaneously.

The `.then()` chain ensures:
1. `extractProfileData` runs, saves thread, completes
2. Then `maybeSummarize` runs, saves thread, completes
3. Then `extractUserMemory` runs, saves a different document (UserMemory)

Each step has the most up-to-date version of the thread.

---

## 6. Token and Cost Impact

### Estimating the Savings

For a 30-message conversation, without summarization:
- System prompt: ~500 tokens
- Messages 1–24 history: ~4,000 tokens
- Recent 6 messages: ~1,000 tokens
- **Total per request: ~5,500 tokens**

With summarization:
- System prompt + summary: ~800 tokens (summary adds ~300 tokens)
- Recent 6 messages: ~1,000 tokens
- **Total per request: ~1,800 tokens**
- **Savings: ~3,700 tokens per request = 67% reduction**

At $0.15/M input tokens:
- 3,700 tokens saved × $0.00000015 = ~$0.0006 saved per message
- Across 100 messages in a long thread: ~$0.06 saved

The summarization itself costs about 1,000–3,000 prompt tokens + 200 completion tokens per rebuild, amortized across 4 messages = ~750 tokens per message attributable to summarization. Net savings remain large.

### The Compression Ratio Logged

The code logs: `[Summary] Thread abc: 12 messages (3400 chars) → 380 chars (~755 tokens saved/request)`

This gives a real-time view of how effective the summarization is for each thread.

---

## 7. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| `SUMMARY_THRESHOLD` | Messages required before summarization starts | `const SUMMARY_THRESHOLD = 14` |
| `RECENT_WINDOW` | Messages always sent verbatim | `const RECENT_WINDOW = 6` |
| `maybeSummarize()` | Decides if summary should be rebuilt | Called in background task chain |
| `generateSummary()` | Calls OpenAI to compress messages | Non-streaming, `getOpenAIAPIResponse` |
| `builtFromMessageCount` | How many messages were compressed | Stored in `thread.summary` |
| 4-message cadence | Summary only rebuilt every 4 new messages | `newSinceLastSummary >= 4` |
| Layer 2 injection | Summary inserted into system prompt | `dynamicSystemPrompt += summary.content` |
| Sliding window | Recent 6 verbatim + older compressed | `recentMessages = [system, ...slice(-6)]` |
| Background chain | Runs after `res.end()` — non-blocking | `.then(() => maybeSummarize(thread))` |
| Token savings | ~67% reduction in prompt tokens at message 30 | Estimated from compression ratio |
| `.then()` chaining | Sequential execution to prevent ParallelSaveError | Background task ordering |

---

## 8. Interview Questions and Answers

---

**Q: Why do you need conversation summarization? Doesn't GPT-4o-mini have a huge context window?**

A: GPT-4o-mini has a 128K token context window — enough for hundreds of messages. But the issue isn't hitting the limit, it's cost. Sending 30 messages of history costs roughly 3× more than sending just the last 6 plus a summary. In NovaAI's 45-message test, the average message cost $0.0005. Without summarization, a 100-message conversation might cost $0.05–0.10 per message as the history grows. The summarization system keeps costs predictable regardless of conversation length — the prompt token count stays approximately constant after the threshold is reached. It's not a technical necessity but an engineering decision about cost efficiency.

---

**Q: How does the summarization trigger? When does it rebuild?**

A: The trigger is `SUMMARY_THRESHOLD = 14` messages. Until then, all messages are sent verbatim. Once past the threshold, `maybeSummarize()` runs after every message. It doesn't rebuild on every message — that would double the API calls. Instead, it tracks `builtFromMessageCount` (how many messages were included in the last summary) and only rebuilds when 4 or more new messages have accumulated since the last summary. So for a 30-message thread, the summary is rebuilt at messages 15, 19, 23, 27 — four times total across 15 messages, not 15 times. This amortizes the summarization cost across 4 messages, making it negligible compared to the token savings.

---

**Q: What happens to the old messages after they're summarized? Are they deleted?**

A: No — the original messages stay in the MongoDB Thread document. The summary is stored separately in `thread.summary.content`. What changes is what gets **sent to OpenAI**: instead of including the raw old messages in the `messages` array, the system prompt is augmented with `"Summary of earlier conversation: [summary text]"`. The original messages remain in the database for completeness (RAG still embeds and searches them), and the summary is purely a prompt-level optimization. This means if the summarization quality is bad or the threshold parameters change, you can change the logic without losing any conversation history.

---

**Q: Could the summary itself become too long?**

A: In theory, yes — if a conversation covers many distinct topics, the 3–5 sentence summary might not capture everything. In practice, "3-5 concise sentences" in the prompt constrains the output length. For very long conversations (50+ messages), the summary might miss nuance. This is an acceptable tradeoff — the summary serves as an approximation, and RAG (Layer 4) provides a fallback: if a specific past detail is needed, cosine similarity can retrieve the exact original message even if it's not in the summary. The two systems complement each other: summary for broad continuity, RAG for specific recall.
