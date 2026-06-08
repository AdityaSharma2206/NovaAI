# 09 — OpenAI API and Large Language Models Guide

**Purpose:** NovaAI makes four distinct types of OpenAI API calls — streaming chat, non-streaming chat, JSON-mode extraction, and embeddings. This file explains what Large Language Models are, how the OpenAI API works, what tokens are, how embeddings work, and why each API call in this project was designed the way it was.

**Learning Value:** ⭐⭐⭐⭐⭐ (Core differentiator — makes this more than a CRUD app)
**Interview Importance:** ⭐⭐⭐⭐⭐ (AI integration is a major hiring signal in 2025)
**Estimated Reading Time:** 60–75 minutes
**Prerequisites:** 02-javascript-fundamentals.md

---

## Table of Contents

1. [What Large Language Models Are](#1-what-large-language-models-are)
2. [Tokens — The Currency of LLMs](#2-tokens)
3. [The OpenAI API](#3-the-openai-api)
4. [The Four OpenAI Functions in NovaAI](#4-the-four-openai-functions)
5. [The Messages Array and Conversation History](#5-the-messages-array)
6. [JSON Mode — Structured Extraction](#6-json-mode)
7. [Text Embeddings](#7-text-embeddings)
8. [Title Generation](#8-title-generation)
9. [Conversation Summarization](#9-conversation-summarization)
10. [Prompt Engineering in NovaAI](#10-prompt-engineering)
11. [Summary](#11-summary)
12. [Interview Questions and Answers](#12-interview-questions-and-answers)

---

## 1. What Large Language Models Are

### The Core Idea: Next Token Prediction

A Large Language Model (LLM) does one thing at its core: **predict the most likely next token** given all the tokens before it.

```
Input:  "The capital of France is"
Output: " Paris"   (highest probability next token)
```

This seems simple, but when trained on hundreds of billions of words across the entire internet, these models develop remarkable emergent abilities: reasoning, coding, creative writing, question answering.

### Training: Exposure to Billions of Examples

GPT-4o-mini was trained on a massive corpus of text. During training, the model sees text, predicts the next word, compares its prediction to the actual next word, and adjusts its billions of internal parameters to be more accurate next time. After enough iterations across enough data, the model "knows" language, facts, reasoning patterns, and code.

### Why It's a Probability Distribution, Not a Lookup Table

The model doesn't memorize every possible response. It learns a probability distribution over tokens. Given "What is 2+2?", the model assigns high probability to "4" and low probability to "17" — not because "2+2=4" is stored somewhere, but because that pattern appeared consistently in training data.

### Temperature — Controlling Randomness

OpenAI's API has a `temperature` parameter (0 to 2, default ~1):
- `temperature: 0` — always picks the highest-probability token. Deterministic, predictable.
- `temperature: 1` — samples from the probability distribution. Some creativity, some variation.
- `temperature: 2` — very random. Unpredictable, often incoherent.

NovaAI uses the default temperature, which works well for a general assistant.

### Why GPT-4o-mini Specifically

| Model | Cost (input) | Cost (output) | Speed | Capability |
|-------|-------------|---------------|-------|-----------|
| GPT-4o | $2.50/M tokens | $10.00/M tokens | Medium | Highest |
| GPT-4o-mini | $0.15/M tokens | $0.60/M tokens | Fast | Strong |
| GPT-3.5-turbo | $0.50/M tokens | $1.50/M tokens | Fast | Moderate |

GPT-4o-mini hits the sweet spot: 94% cheaper than GPT-4o, fast (low latency), and fully capable for a personal assistant use case. The analytics confirm: 45 messages cost only $0.0238 total (~$0.0005/message).

---

## 2. Tokens — The Currency of LLMs

### What Is a Token?

LLMs don't process words — they process **tokens**. A token is roughly 3/4 of a word. Some examples:

```
"Hello world"          → 2 tokens
"Hello, world!"        → 4 tokens (comma and ! are separate)
"JavaScript"           → 2 tokens: "Java" + "Script"
"hello"                → 1 token
"HELLO"                → 2 tokens (capitalization changes tokenization)
"unconscious"          → 2 tokens: "un" + "conscious"
```

The OpenAI tokenizer (`tiktoken`) splits text using a byte-pair encoding (BPE) algorithm trained on a large corpus. Common words are one token; rare words may be many tokens.

### Why Token Count Determines Cost

OpenAI charges per token consumed:

```
GPT-4o-mini:
  Input:  $0.15 per million tokens  ($0.00000015 per token)
  Output: $0.60 per million tokens  ($0.00000060 per token)
```

Every token sent to OpenAI (your messages + system prompt) costs input price. Every token in the AI's reply costs output price. Long conversations cost more.

### Prompt Tokens vs Completion Tokens

- **Prompt tokens** — everything you send: system prompt, conversation history, user message
- **Completion tokens** — what the AI generates in reply

In NovaAI's 45-message test:
- 74% of tokens were prompt (66,223 tokens)
- 26% were completion (23,054 tokens)

This 74/26 split is expected. The 4-layer system prompt alone is 300–500 tokens, paid on every message. The conversation history grows with each exchange. AI replies tend to be concise.

### The Context Window

Every LLM has a **context window** — the maximum number of tokens it can process in one call (both input and output combined). GPT-4o-mini's context window is 128,000 tokens.

For a simple chat app, you'd never hit 128K. But if you included the entire conversation history from message 1, it would grow indefinitely:

- Message 1: 200 tokens
- After 20 messages: 4,000 tokens
- After 100 messages: 20,000 tokens
- Eventually expensive and slow

This is why NovaAI uses a **sliding window** (last 6 messages verbatim) combined with **conversation summarization** (compressing older messages) and **RAG** (retrieving only relevant past messages).

---

## 3. The OpenAI API

### Authentication

All API calls include an Authorization header:

```javascript
headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
}
```

The API key is stored in `.env` on the server and never sent to the frontend. This is critical — if the frontend had the key, any user could extract it and make API calls at your expense.

### Why NovaAI Uses Native `fetch` Instead of the OpenAI SDK

OpenAI publishes an official `openai` npm package. NovaAI uses native `fetch` instead. Why?

1. **Fewer dependencies** — the SDK is hundreds of KBs
2. **More control** — native fetch lets you read `response.body.getReader()` directly for streaming
3. **Educational** — understanding the raw HTTP interface is more valuable for learning
4. **Streaming simplicity** — the SDK's streaming API adds an abstraction layer that obscures what's actually happening

The tradeoff: you handle error cases and response parsing manually. For a project this size, the tradeoff is worth it.

### The Chat Completions Endpoint

All text generation calls go to:
```
POST https://api.openai.com/v1/chat/completions
```

The request body contains:
```javascript
{
    model: "gpt-4o-mini",
    messages: [                    // array of role/content pairs
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is RAG?" },
        { role: "assistant", content: "RAG stands for..." },
        { role: "user", content: "Can you explain more?" }
    ],
    stream: true,                  // optional — enables streaming
    response_format: { type: "json_object" }  // optional — forces JSON output
}
```

---

## 4. The Four OpenAI Functions in NovaAI

All four are in `Backend/utils/openai.js`.

### Function 1: `getOpenAIAPIResponse()` — Standard Non-Streaming Chat

```javascript
const getOpenAIAPIResponse = async (messages) => {
    const options = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: messages
        })
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", options);
    const data = await response.json();
    return data.choices[0].message.content;  // returns full reply as string
}
```

**Used for:** Title generation, conversation summarization.

**Why non-streaming here?** Title generation (3–5 words) and summarization happen in the background — users don't see them in real-time. Streaming a 5-word title to nowhere would be pointless.

**Response structure:**
```json
{
    "choices": [{
        "message": {
            "role": "assistant",
            "content": "Planning Japan Trip"
        }
    }]
}
```

### Function 2: `getOpenAIJSONResponse()` — Structured JSON Output

```javascript
const getOpenAIJSONResponse = async (messages) => {
    const options = {
        body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },   // ← the key addition
            messages: messages
        })
    };
    const response = await fetch("...", options);
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);  // returns parsed object
}
```

**Used for:** `extractProfileData()`, `extractUserMemory()`.

**Why JSON mode?** These functions ask GPT to extract structured data from a conversation. Without JSON mode, the model might reply:

```
Here are the user's interests: coding, travel, machine learning.
Their goals include: getting a job, learning React.
```

This free text is hard to parse programmatically. With `response_format: { type: "json_object" }`, OpenAI **guarantees** valid JSON output:

```json
{
  "interests": ["coding", "travel", "machine learning"],
  "goals": ["getting a job", "learning React"]
}
```

The function also calls `JSON.parse()` automatically, so callers receive a JavaScript object.

### Function 3: `getOpenAIEmbedding()` — Vector Representation

```javascript
const getOpenAIEmbedding = async (text) => {
    const options = {
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text
        })
    };
    const response = await fetch("https://api.openai.com/v1/embeddings", options);
    const data = await response.json();
    return data.data[0].embedding; // Returns array of 1536 numbers
}
```

**Used for:** Embedding user messages and assistant replies for RAG.

**Note:** This uses a different endpoint (`/v1/embeddings`) and a different model (`text-embedding-3-small`). It doesn't generate text — it generates a vector that represents the meaning of text. Covered in depth in file 10.

### Function 4: `getOpenAIStreamingResponse()` — Real-Time Token Streaming

Covered in depth in file 08. Used for the main chat response — the only user-facing call.

---

## 5. The Messages Array and Conversation History

### How OpenAI Understands Context

OpenAI's API is **stateless** — it has no memory of previous API calls. You provide the entire conversation history every time:

```javascript
[
    { role: "system",    content: "You are a helpful AI assistant. [+ 4-layer context]" },
    { role: "user",      content: "What is RAG?" },
    { role: "assistant", content: "RAG stands for Retrieval-Augmented Generation..." },
    { role: "user",      content: "How does cosine similarity work?" }
]
```

The model sees all of this at once and generates the next `assistant` message.

### The Three Roles

- **`system`** — instructions for the AI. Appears first, never shown to the user. This is where NovaAI injects the 4-layer personalization context.
- **`user`** — the human's messages.
- **`assistant`** — the AI's previous replies.

### The Four-Layer System Prompt

NovaAI's system message is dynamically assembled from four layers:

```javascript
let dynamicSystemPrompt = "You are a highly personalized AI assistant.";

// Layer 1: Cross-conversation long-term user profile
if (userMemory && ...) {
    dynamicSystemPrompt += `\n\nLong-term profile of this user:\n`;
    dynamicSystemPrompt += `- Interests: ${userMemory.interests.slice(0, 5).join(", ")}\n`;
    dynamicSystemPrompt += `- Goals: ${userMemory.goals.slice(0, 3).join(", ")}\n`;
    // ...
}

// Layer 2: Compressed conversation history
if (thread.summary?.content) {
    dynamicSystemPrompt += `\n\nSummary of earlier conversation:\n${thread.summary.content}`;
}

// Layer 3: Thread-level extracted context
if (thread.profile && ...) {
    dynamicSystemPrompt += `\n\nTailor your responses using this learned context:\n`;
    dynamicSystemPrompt += `- Current Focus: ${thread.profile.activeContext}\n`;
    // ...
}

// Layer 4: RAG — injected as part of the system message
thread.messages[0].content = dynamicSystemPrompt + historicalContext;
```

Then only the last 6 messages are sent (not the entire history):

```javascript
const recentMessages = [
    thread.messages[0],           // system message with all 4 layers
    ...thread.messages.slice(-6)  // last 6 user+assistant messages
        .map(m => ({ role: m.role, content: m.content }))
    // embeddings are stripped — OpenAI doesn't need them
];
```

### Why Slicing to Last 6 Messages

Sending the entire message history would:
- Grow linearly with conversation length (100 messages × avg 200 tokens = 20,000 prompt tokens just for history)
- Eventually hit context limits
- Cost more on every message

The last 6 messages capture the immediate conversation context. Older important details are handled by: the summary (Layer 2) and RAG (Layer 4).

---

## 6. JSON Mode — Structured Extraction

### The Problem with Free-Text Extraction

When you ask an LLM to extract data, it naturally replies in prose:

```
System: Extract the user's interests from this conversation.
User: I love hiking and photography.
→ GPT replies: "The user appears to be interested in hiking and photography."
```

You'd need regex or NLP to extract the actual values from that sentence — fragile and error-prone.

### JSON Mode: Guaranteed Valid JSON

With `response_format: { type: "json_object" }`, OpenAI forces the model to output only valid JSON. The model cannot respond with prose.

**The extraction prompt in NovaAI:**

```javascript
{
    role: "system",
    content: `You are a long-term user profiling agent. Extract personal information from this conversation into this exact JSON format. Use empty arrays if nothing is found. Do not invent information.
{
  "interests": [],
  "goals": [],
  "lifeEvents": [],
  "ongoingProjects": [],
  "preferences": [],
  "discussedTopics": [],
  "challenges": [],
  "longTermObjectives": []
}
For "discussedTopics", only return values from this exact list: Travel, Fitness, Relationships, Finance, Career, Education, Entertainment, Technology.`
}
```

**Key prompt engineering choices:**
1. "Use empty arrays if nothing is found" — prevents hallucination (making things up)
2. "Do not invent information" — explicit instruction against hallucination
3. Fixed JSON schema in the prompt — model knows exactly what structure to produce
4. Enum list for `discussedTopics` — forces controlled vocabulary, prevents free-form topic names

### Why This Doesn't Return Token Counts

`getOpenAIJSONResponse()` uses non-streaming mode and doesn't pass `stream_options: { include_usage: true }`. The token count is in the response (`data.usage`) but isn't extracted. This is acceptable because extraction calls are background tasks — their cost is tracked in aggregate through the main streaming call's usage data.

---

## 7. Text Embeddings

### What an Embedding Is

An embedding is a fixed-size array of numbers that represents the **semantic meaning** of text. Semantically similar text produces similar vectors (small angle between them); unrelated text produces dissimilar vectors (large angle).

```
"I love hiking"      → [0.021, -0.054, 0.178, ..., 0.093]  (1536 numbers)
"I enjoy trekking"   → [0.019, -0.061, 0.182, ..., 0.091]  (similar!)
"Tax law changes"    → [0.847, 0.201, -0.344, ..., -0.521] (very different)
```

### The `text-embedding-3-small` Model

This is a different OpenAI model than GPT-4o-mini — its only job is to produce embeddings, not to generate text. It outputs a **1536-dimensional vector** for any input text.

1536 dimensions means each embedding is an array of 1536 floating-point numbers. More dimensions = more nuance in representing meaning = better search quality.

**Cost:** Text embeddings are very cheap — roughly $0.02 per million tokens. For NovaAI's usage (embedding each user message + assistant reply), the embedding cost is negligible compared to the main GPT-4o-mini cost.

### What Gets Embedded in NovaAI

```javascript
// In the /api/chat route:

// BEFORE streaming — embed the user's message:
const messageEmbedding = await getOpenAIEmbedding(message);
thread.messages.push({ role: "user", content: message, embedding: messageEmbedding });

// AFTER streaming (in onDone) — embed the assistant's reply:
const replyEmbedding = await getOpenAIEmbedding(fullReply);
thread.messages.push({ role: "assistant", content: fullReply, embedding: replyEmbedding });
```

Both user messages and assistant replies get embedded. This means RAG can retrieve relevant AI responses too — if the user asks about something the AI previously explained, that explanation can be retrieved and used as context.

### Storage

Embeddings are stored in the Thread document:

```javascript
// Thread model:
embedding: { type: [Number], default: undefined }
```

1536 numbers × 4 bytes (float32) = ~6KB per message. A thread with 50 messages would have ~300KB of embedding data. For a personal app, this is fine.

---

## 8. Title Generation

### What It Does

When a user sends their first message in a new thread, NovaAI generates a 3–5 word title:

```javascript
const generateTitle = async (message) => {
    const titlePrompt = [
        { role: "system", content: "Generate a short 3-5 word chat title only. No quotes." },
        { role: "user", content: message }
    ];
    const title = await getOpenAIAPIResponse(titlePrompt);
    return title.replace(/["']/g, "");  // clean any quotes the model adds
};
```

### When It Runs

Title generation happens **before** streaming starts — while the backend is constructing the thread:

```javascript
if (!thread) {
    const generatedTitle = await generateTitle(message);  // ← blocks here ~300ms
    thread = new Thread({
        threadId,
        userId: req.user.userId,
        title: generatedTitle,
        messages: [...]
    });
}
```

### The Cost: TTFT Impact

Title generation adds ~300–500ms to TTFT for first messages because it's a synchronous OpenAI call in the critical path. An optimization would be to start streaming first, then update the title afterward. For the current scale, this tradeoff is acceptable — the title is meaningful and immediately visible in the sidebar.

### Sent to Frontend on `parsed.done`

The title is included in the final SSE event:
```javascript
res.write(`data: ${JSON.stringify({ done: true, title: thread.title })}\n\n`);
```

Frontend uses it to update the sidebar:
```javascript
setAllThreads(prev => prev.map(t =>
    t.threadId === currThreadId
        ? { ...t, title: parsed.title || currentPrompt }
        : t
));
```

---

## 9. Conversation Summarization

### What It Does

When a thread exceeds 14 messages, `maybeSummarize()` compresses the older messages into a 3–5 sentence summary:

```javascript
const summaryPrompt = [
    {
        role: "system",
        content: "Summarize this conversation history in 3-5 concise sentences. Capture the key facts, questions asked, conclusions reached, and context needed to continue the conversation naturally."
    },
    { role: "user", content: conversationText }  // older messages formatted as text
];

const summaryText = await getOpenAIAPIResponse(summaryPrompt);
```

### When It Triggers

```javascript
const SUMMARY_THRESHOLD = 14;
const RECENT_WINDOW = 6;

const maybeSummarize = async (thread) => {
    if (thread.messages.length <= SUMMARY_THRESHOLD) return;  // not enough messages yet

    const summarizableCount = thread.messages.length - 1 - RECENT_WINDOW;
    const lastSummarizedCount = thread.summary?.builtFromMessageCount || 0;
    const newSinceLastSummary = summarizableCount - lastSummarizedCount;

    if (!thread.summary || newSinceLastSummary >= 4) {
        await generateSummary(thread, summarizableCount);
    }
};
```

The summary is only rebuilt when 4+ new messages have accumulated since the last summary. This amortizes the extra API call — the summarization doesn't run on every message after the threshold.

### Token Savings

The summary replaces potentially thousands of characters of old conversation with a few sentences. Each request that uses the summary instead of the raw history saves an estimated 500–2,000 prompt tokens depending on conversation length. At $0.15/M tokens, this is a genuine cost optimization at scale.

---

## 10. Prompt Engineering in NovaAI

**Prompt engineering** is writing clear, specific instructions to get reliable, structured outputs from LLMs.

### Key Techniques Used

**1. Role specification:** "You are a background AI profiling agent." Sets the model's persona and task frame.

**2. Explicit output format:** Provide the exact JSON schema the model should follow. The model fills it in rather than inventing structure.

**3. Preventing hallucination:** "Do not invent information." + "Use empty arrays if nothing is found." Without these guardrails, the model might add plausible-sounding but invented interests.

**4. Controlled vocabulary:** `discussedTopics` is constrained to exactly 8 predefined values. Free-form topic names would be inconsistent ("hiking" vs "Hiking" vs "outdoor activities").

**5. Brevity instruction for titles:** "Generate a short 3-5 word chat title only. No quotes." The "only" and specific word count prevent verbose responses.

**6. Summarization framing:** "Capture the key facts, questions asked, conclusions reached, and context needed to continue the conversation naturally." Tells the model exactly what to include and why — produces more useful summaries than just "summarize this."

---

## 11. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| LLM | Predicts next token from context | GPT-4o-mini for all text generation |
| Token | ~3/4 of a word; unit of LLM cost | All API calls charge per token |
| Temperature | Controls randomness in generation | Default used in NovaAI |
| Context window | Max tokens in one API call | 128K for GPT-4o-mini |
| `gpt-4o-mini` | Fast, cheap, capable model | All text generation |
| `text-embedding-3-small` | Embedding model, 1536 dimensions | All RAG embeddings |
| `getOpenAIAPIResponse` | Non-streaming text generation | Title, summarization |
| `getOpenAIJSONResponse` | Guaranteed JSON output | Profile extraction, memory extraction |
| `getOpenAIEmbedding` | Text → 1536-number vector | User message + assistant reply |
| `getOpenAIStreamingResponse` | Token-by-token streaming | Main chat response |
| `response_format: json_object` | Forces model to output valid JSON | Both extraction functions |
| `stream: true` | Enables SSE from OpenAI | Main streaming function |
| `include_usage: true` | Returns token counts in streaming | Main streaming function |
| Messages array | Full conversation sent each API call | Constructed in chat.js |
| System role | Instructions, not shown to user | 4-layer personalization prompt |
| Prompt tokens | Everything sent to OpenAI | 74% of total tokens |
| Completion tokens | What the AI generates | 26% of total tokens |
| Prompt engineering | Writing effective AI instructions | Extraction prompts, system prompt |
| Hallucination prevention | "Do not invent information" | All extraction prompts |
| Sliding window | Only last 6 messages sent verbatim | `recentMessages = messages.slice(-6)` |

---

## 12. Interview Questions and Answers

---

**Q: What is an LLM and how does it work at a high level?**

A: A Large Language Model is a neural network trained to predict the next token given a sequence of tokens. During training, it's exposed to hundreds of billions of words and adjusts its parameters to minimize prediction error. The result is a model that has implicitly learned language, facts, reasoning, and code from patterns in training data. When you call the OpenAI API, you provide a sequence of messages (the conversation history) and the model generates the most likely next tokens to continue the conversation. It's fundamentally a probability distribution over vocabulary — not a rule-based system or a lookup table.

---

**Q: What are tokens and why do they matter?**

A: Tokens are the atomic units LLMs process — roughly 3/4 of a word. OpenAI charges per token: $0.15/M for input and $0.60/M for output with GPT-4o-mini. In NovaAI, every message sends the system prompt (300–500 tokens), the conversation history (last 6 messages), and the user's current message as prompt tokens. The AI's reply is charged as completion tokens. From my 45-message test, 74% of tokens were prompt and 26% completion — typical for an app with a rich system prompt. Tokens matter because they directly control cost and because the model's context window (128K for GPT-4o-mini) limits how much history you can include.

---

**Q: What is JSON mode in the OpenAI API and why did you use it?**

A: JSON mode (`response_format: { type: "json_object" }`) forces OpenAI to return valid JSON and nothing else. I used it for two background extraction tasks: `extractProfileData()` which extracts thread-level user facts and preferences, and `extractUserMemory()` which extracts long-term interests, goals, and challenges. Without JSON mode, the model might return prose like "The user seems to be interested in hiking," which is hard to parse programmatically. With JSON mode, it returns `{ "interests": ["hiking"] }` which I can directly use in JavaScript. I also include the exact JSON schema in my prompt so the model knows the expected field names, and I include "Do not invent information" to prevent the model from hallucinating plausible-sounding but false data.

---

**Q: Why did you use `fetch()` instead of the OpenAI SDK?**

A: The official `openai` npm package is a large dependency that wraps the same HTTP API. I chose native `fetch()` for three reasons: it eliminates a dependency and its transitive dependencies; it gives me direct access to `response.body.getReader()` for implementing the streaming reader exactly as I need it; and it forces a deeper understanding of the actual API contract — which is more educational and makes me a better candidate to explain what's happening at every level. The tradeoff is more manual error handling, but for a project this size, that's manageable.

---

**Q: How does the 4-layer system prompt work?**

A: Every API call includes a `system` role message that acts as instructions to the AI. In NovaAI, this message is dynamically assembled from four layers before each request. Layer 1 is the user's long-term profile from `UserMemory` — their interests, goals, and challenges extracted across all conversations. Layer 2 is the compressed summary of this thread's earlier messages, if the thread is long enough to have been summarized. Layer 3 is the thread-level profile — facts and preferences extracted from the current conversation. Layer 4 is the RAG context — semantically relevant past messages retrieved via cosine similarity. The layers go from broadest (cross-conversation) to most specific (semantically matched moments), so the AI gets progressively more targeted context. This assembly runs on every message, so the context is always current.
