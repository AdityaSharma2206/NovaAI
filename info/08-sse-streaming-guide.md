# 08 — Server-Sent Events (SSE) Streaming Guide

**Purpose:** The most impressive technical feature of NovaAI is its real-time streaming — you see the AI's response appear word-by-word as it's generated, just like ChatGPT. This is implemented with Server-Sent Events (SSE). This file explains SSE from first principles, traces the exact code path from the OpenAI API response to your browser, and explains why this approach was chosen over alternatives.

**Learning Value:** ⭐⭐⭐⭐⭐ (Advanced — a genuine differentiator on your resume)
**Interview Importance:** ⭐⭐⭐⭐⭐ (Rarely seen in junior projects — guaranteed to impress)
**Estimated Reading Time:** 55–70 minutes
**Prerequisites:** 05-express-complete-guide.md, 04-nodejs-complete-guide.md

---

## Table of Contents

1. [The Problem: Why Streaming Exists](#1-the-problem-why-streaming-exists)
2. [Three Approaches to Real-Time Communication](#2-three-approaches-to-real-time-communication)
3. [How SSE Works](#3-how-sse-works)
4. [The Backend SSE Implementation in NovaAI](#4-the-backend-sse-implementation)
5. [The Frontend SSE Reader in NovaAI](#5-the-frontend-sse-reader)
6. [The Complete Token Journey](#6-the-complete-token-journey)
7. [What Happens After the Stream Ends](#7-what-happens-after-the-stream-ends)
8. [The Blinking Cursor UX](#8-the-blinking-cursor-ux)
9. [Measuring TTFT](#9-measuring-ttft)
10. [Summary](#10-summary)
11. [Interview Questions and Answers](#11-interview-questions-and-answers)

---

## 1. The Problem: Why Streaming Exists

### Without Streaming — The Painful Wait

Imagine sending a message and waiting in silence for 5–8 seconds while the server:
1. Embeds your message (OpenAI API call)
2. Runs RAG scoring
3. Builds the 4-layer system prompt
4. Calls OpenAI and waits for the **entire** response to be generated
5. Sends you everything at once

You'd see nothing, then a wall of text. This is how most naive AI chatbots work.

### With Streaming — Instant Feedback

With streaming, the very first word appears as soon as the model starts generating — typically within 700–800ms. The user reads as the AI "types." A 5-second response feels far shorter because you're getting value the whole time.

### TTFT — Time to First Token

**TTFT** (Time to First Token) is the metric that matters for user experience. It's the time from when you hit send to when the first character appears on screen.

```
Without streaming:
Send → [======silence======] → Response appears (4–8s perceived wait)

With streaming:
Send → [=short wait=] → H → He → Hel → Hello → Hello, → ...
              ↑ TTFT (~749ms in NovaAI)
```

NovaAI's measured TTFT is **~749ms** — less than one second from send to first character. The total stream duration averages ~7,330ms, but users perceive it as much shorter because they're reading content immediately.

---

## 2. Three Approaches to Real-Time Communication

### Option A: Polling

The client asks the server "are you done yet?" every N seconds:

```
Browser          Server
   │── GET /status ──▶│ "still generating..."
   │◀─ 202 pending ──│
   │  (wait 1 sec)    │
   │── GET /status ──▶│ "still generating..."
   │◀─ 202 pending ──│
   │  (wait 1 sec)    │
   │── GET /status ──▶│ "done!"
   │◀─ 200 + data ───│
```

**Disadvantages:** Wasteful — most requests get "still working." Introduces up to 1-second delay. Not truly real-time.

### Option B: WebSockets

A full-duplex, persistent connection where both client and server can send messages at any time:

```
Browser ←→ Server  (bidirectional, persistent connection)
```

**Advantages:** True real-time, bidirectional (client can interrupt).

**Disadvantages:** More complex to set up. Requires special server infrastructure for horizontal scaling. Overkill for one-way AI streaming — the client sends one message, the server responds. The bidirectional feature isn't needed.

### Option C: Server-Sent Events (SSE) — NovaAI's Choice

SSE is a one-directional, persistent HTTP connection where the server pushes data to the client:

```
Browser ──── POST (message) ────▶ Server
Browser ◀────── stream ─────────── Server (keeps connection open, sends tokens)
```

**Advantages:**
- Simple — just a special HTTP response. No new protocol.
- Works over standard HTTP/1.1. Proxy-friendly.
- Native browser support via `EventSource` API (though NovaAI uses `fetch` for POST support)
- Perfect for one-way AI streaming: client sends message once, server streams response

**Why SSE over WebSocket for this project:** Streaming AI text is inherently one-directional. The added complexity of WebSockets provides no benefit here. SSE is a better fit.

---

## 3. How SSE Works

### The SSE Protocol

SSE is just a regular HTTP response with special properties:

1. The `Content-Type` is `text/event-stream`
2. The connection stays open (doesn't close immediately)
3. The server sends data in a specific text format
4. Each message ends with a blank line

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"token": "Hello"}\n\n
data: {"token": " there"}\n\n
data: {"token": "!"}\n\n
data: {"done": true, "title": "Greeting"}\n\n
```

### The SSE Message Format

Every SSE message is:
```
data: <payload>\n\n
```

- `data:` — the field name (always "data" in NovaAI)
- `<payload>` — the content (JSON in NovaAI)
- `\n\n` — double newline signals end of the message

### Why NovaAI Uses JSON Payloads

The SSE spec allows any text as the payload. NovaAI uses JSON objects because different events carry different data:

```
data: {"token": "Hello"}           ← normal token event
data: {"done": true, "title": "..."}  ← stream complete event
data: {"error": "Something went wrong"}  ← error event
```

Parsing JSON lets the frontend distinguish event types with `if (parsed.token)`, `if (parsed.done)`, `if (parsed.error)`.

### The Three Critical HTTP Headers

```javascript
res.setHeader("Content-Type", "text/event-stream");  // tells browser this is SSE
res.setHeader("Cache-Control", "no-cache");           // don't buffer — forward immediately
res.setHeader("Connection", "keep-alive");            // don't close the connection
res.flushHeaders();                                   // send headers immediately
```

**`res.flushHeaders()`** is critical: Express normally buffers headers until you call `res.json()` or `res.send()`. Calling `flushHeaders()` sends them immediately, opening the SSE channel before any data is ready.

**`Cache-Control: no-cache`** prevents proxy servers and nginx from buffering the response. Without it, your reverse proxy might accumulate tokens and batch-send them, destroying the streaming effect.

---

## 4. The Backend SSE Implementation in NovaAI

### The `getOpenAIStreamingResponse()` Function

Here's the actual code from `Backend/utils/openai.js`:

```javascript
const getOpenAIStreamingResponse = async (messages, onChunk, onDone) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages,
            stream: true,
            stream_options: { include_usage: true }
        })
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", options);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let usage = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // CRITICAL — keep partial line

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
                onDone(assembled, usage);
                return;
            }
            const parsed = JSON.parse(payload);
            if (parsed.usage) usage = parsed.usage;
            const token = parsed.choices[0]?.delta?.content || "";
            if (token) {
                assembled += token;
                onChunk(token);
            }
        }
    }
    onDone(assembled, usage);
};
```

### The Callback Pattern — `onChunk` and `onDone`

`getOpenAIStreamingResponse` takes two callbacks:

- **`onChunk(token)`** — called for every token received. The route passes each token forward to the browser:
  ```javascript
  (token) => {
      if (ttftMs === null) ttftMs = Date.now() - requestStart;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }
  ```

- **`onDone(fullReply, usage)`** — called when `[DONE]` is received. The route saves the reply, creates analytics, and sends the final event:
  ```javascript
  async (fullReply, usage) => {
      // save to DB, create analytics...
      res.write(`data: ${JSON.stringify({ done: true, title: thread.title })}\n\n`);
      res.end();
  }
  ```

This callback pattern cleanly separates the streaming mechanics (in `openai.js`) from the business logic (in the route handler).

### The Buffer-Split Pattern — Why It's Critical

OpenAI sends data in **chunks** — but chunks don't align with SSE message boundaries. A single `reader.read()` call might deliver:

```
"data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}...}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"}...}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"!\"}...}]}\n\ndata: {\"choi"
```

Notice: the last message is **cut off mid-JSON**. If you try to parse it, `JSON.parse` throws.

The buffer-split pattern handles this:

```javascript
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split("\n");
buffer = lines.pop(); // Save the last (possibly incomplete) line for next iteration
```

- `split("\n")` — splits on newlines
- `lines.pop()` — removes and saves the last element (which may be a partial line)
- Next iteration: `buffer` starts with the leftover partial line, and new data is appended to it
- This guarantees every line we process is complete

**Without this pattern:** You'd get `JSON.parse` errors on partial lines. The stream would break intermittently.

### `stream: true` and `stream_options: { include_usage: true }`

```javascript
stream: true,
stream_options: { include_usage: true }
```

`stream: true` enables streaming — instead of one JSON response, OpenAI sends many SSE events.

`stream_options: { include_usage: true }` is a non-default option that tells OpenAI to send a final extra chunk with token counts **before** `[DONE]`. Without it, streaming mode gives you no token count — you can't compute cost or track usage.

The usage chunk looks like:
```json
{"id":"...","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":342,"completion_tokens":87,"total_tokens":429}}
```

It has empty `choices` but a populated `usage`. The code captures it:
```javascript
if (parsed.usage) usage = parsed.usage;
```

### What OpenAI Sends Token-by-Token

Each token event from OpenAI looks like:
```json
{
  "id": "chatcmpl-abc",
  "object": "chat.completion.chunk",
  "choices": [{
    "delta": { "content": "Hello" },
    "index": 0,
    "finish_reason": null
  }]
}
```

The text is in `choices[0].delta.content`. This is why the code uses:
```javascript
const token = parsed.choices[0]?.delta?.content || "";
```

The `?.` (optional chaining) handles the usage chunk where `choices` is an empty array.

---

## 5. The Frontend SSE Reader in NovaAI

### Why Not `EventSource`?

The browser has a built-in `EventSource` API for SSE — but it only supports GET requests. The chat route requires POST (to send the message in the body). So NovaAI uses `fetch()` with a streaming body reader instead.

### The Frontend Reader — `getReply()` in ChatWindow.jsx

```javascript
const response = await authFetch("http://localhost:8080/api/chat", options);
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
    buffer = lines.pop(); // same buffer-split pattern as the backend

    for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        const parsed = JSON.parse(payload);

        if (parsed.token !== undefined) {
            assembled += parsed.token;
            setStreamingReply(assembled);        // ← React state update
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
    }
}
```

### How `setStreamingReply` Drives the UI

`streamingReply` is a React context value. The Chat component reads it:

```jsx
// Chat.jsx — renders the streaming bubble:
{streamingReply && (
    <div className="response streaming">
        <ReactMarkdown>{streamingReply}</ReactMarkdown>
        <span className="typing-cursor" />
    </div>
)}
```

Every time `setStreamingReply(assembled)` is called (once per token), React re-renders this div with the new text. This is what creates the word-by-word appearance.

### What Happens on `parsed.done`

When the final event arrives:
1. `setPrevChats(prev => [...prev, { role: "assistant", content: assembled }])` — moves the full reply into the permanent chat history
2. `setStreamingReply("")` — clears the streaming bubble (it's now in prevChats)
3. `setTimeout(() => fetchLatestProfile(), 3000)` — polls for the thread profile 3 seconds later (background tasks need time to finish)
4. If first message: updates the thread title in the sidebar

---

## 6. The Complete Token Journey

Every token travels this path from OpenAI to your screen:

```
OpenAI servers
   │  [generates "H"]
   │  sends: data: {"choices":[{"delta":{"content":"H"}}]}\n\n
   │
   ▼
Node.js backend (openai.js)
   │  reader.read() → receives binary chunk
   │  TextDecoder decodes to string
   │  buffer-split extracts complete line
   │  JSON.parse → token = "H"
   │  onChunk("H") is called
   │
   ▼
Express route handler (chat.js)
   │  ttftMs captured on first token
   │  res.write('data: {"token":"H"}\n\n')
   │  HTTP/1.1 chunk is flushed
   │
   ▼
Browser network layer
   │  Receives TCP packet
   │  reader.read() returns the chunk
   │
   ▼
ChatWindow.jsx
   │  TextDecoder + buffer-split → line
   │  JSON.parse → parsed.token = "H"
   │  assembled += "H"  →  assembled = "H"
   │  setStreamingReply("H")
   │
   ▼
React re-render
   │  streamingReply = "H"
   │  <ReactMarkdown>{"H"}</ReactMarkdown> renders
   │
   ▼
Screen: "H" appears
```

Total time from OpenAI generating "H" to "H" appearing on screen: roughly 50–100ms (network latency). The 749ms TTFT is dominated by pre-stream work: embedding, RAG, system prompt construction, and OpenAI's own warm-up time.

---

## 7. What Happens After the Stream Ends

When `onDone(assembled, usage)` is called:

```javascript
async (fullReply, usage) => {
    const latencyMs = Date.now() - requestStart;  // total time

    // 1. Generate embedding for the assistant's reply (for future RAG)
    const replyEmbedding = await getOpenAIEmbedding(fullReply);

    // 2. Save assistant message to Thread document
    thread.messages.push({
        role: "assistant",
        content: fullReply,
        embedding: replyEmbedding
    });
    thread.updatedAt = new Date();
    await thread.save();

    // 3. Start background tasks (fire-and-forget — won't delay res.end())
    extractProfileData(thread)
        .then(() => maybeSummarize(thread))
        .then(() => extractUserMemory(thread, req.user.userId))
        .catch(err => console.log("Background task error:", err));

    // 4. Save analytics (fire-and-forget)
    Analytics.create({
        userId: req.user.userId,
        threadId,
        promptTokens:     usage?.prompt_tokens     || 0,
        completionTokens: usage?.completion_tokens  || 0,
        totalTokens:      usage?.total_tokens       || 0,
        estimatedCostUsd: ((usage?.prompt_tokens || 0) * 0.00000015) +
                          ((usage?.completion_tokens || 0) * 0.0000006),
        latencyMs,
        ttftMs: ttftMs || 0,
        ragUsed
    }).catch(err => console.log("[Analytics] Save error:", err));

    // 5. Send final SSE event
    res.write(`data: ${JSON.stringify({ done: true, title: thread.title })}\n\n`);

    // 6. Close the HTTP connection
    res.end();
}
```

Note: Steps 3 and 4 are fire-and-forget (not `await`ed). The `.catch()` prevents unhandled rejection errors, but neither blocks `res.end()`. The user's stream closes the moment step 5 and 6 run — background tasks finish independently afterward.

---

## 8. The Blinking Cursor UX

While the AI is streaming, a blinking cursor appears after the text to indicate "still typing":

```css
/* In ChatWindow.css or Chat.css */
.typing-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background-color: var(--accent-primary);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: cursor-blink 0.8s step-end infinite;
}

@keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
}
```

`step-end` — not a smooth fade. Makes the cursor instantly appear/disappear like a real text cursor.

The cursor only renders when `streamingReply` is non-empty:

```jsx
{streamingReply && (
    <div className="response streaming">
        <ReactMarkdown>{streamingReply}</ReactMarkdown>
        <span className="typing-cursor" />  {/* visible only during streaming */}
    </div>
)}
```

When `setStreamingReply("")` is called at stream end, the streaming div disappears entirely. The message is now in `prevChats` and renders in the permanent message list — no cursor.

---

## 9. Measuring TTFT

```javascript
// In the /api/chat route:
const requestStart = Date.now();    // timestamp when request processing starts
let ttftMs = null;

// In onChunk callback:
(token) => {
    if (ttftMs === null) ttftMs = Date.now() - requestStart;
    // ↑ only captures time on FIRST token — ttftMs is then locked
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
}
```

`ttftMs === null` check ensures we only record the first token's arrival. Subsequent tokens overwrite nothing.

This `ttftMs` is then saved to the Analytics document and aggregated by the dashboard:

```
avgTtftMs: { $avg: "$ttftMs" }  // averages across all messages
```

**NovaAI's measured result:** ~749ms average TTFT across 45 messages. This includes:
- ~100ms: embedding the user's message
- ~50ms: RAG scoring
- ~200ms: system prompt construction
- ~400ms: OpenAI's own warm-up before first token

---

## 10. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| SSE | HTTP response that stays open and streams data | `/api/chat` route |
| `text/event-stream` | Content-Type that signals SSE | `res.setHeader(...)` |
| `res.flushHeaders()` | Send headers immediately, open channel | Before `getOpenAIStreamingResponse` |
| `res.write()` | Send a chunk without closing connection | In `onChunk` callback |
| `res.end()` | Close the HTTP connection | End of `onDone` callback |
| Buffer-split pattern | Keep partial lines for next iteration | Both backend and frontend readers |
| `stream: true` | Enable OpenAI token-by-token streaming | `getOpenAIStreamingResponse` options |
| `include_usage: true` | Get real token counts from OpenAI streaming | `stream_options` field |
| `onChunk(token)` | Callback — called for each token | Forwards token via `res.write` |
| `onDone(reply, usage)` | Callback — called when stream ends | Saves to DB, sends `{ done: true }` |
| `TextDecoder` | Converts binary stream data to string | Both backend and frontend |
| `setStreamingReply` | React state — drives live text rendering | `ChatWindow.jsx` |
| TTFT | Time to first token — ~749ms in NovaAI | Measured with `Date.now() - requestStart` |
| Typing cursor | CSS animation shown during streaming | `span.typing-cursor` |
| `parsed.done` | Final SSE event — commits reply to chat | Frontend reader, `if (parsed.done)` |

---

## 11. Interview Questions and Answers

---

**Q: What is SSE and why did you use it instead of WebSockets?**

A: SSE (Server-Sent Events) is a technology where a regular HTTP connection stays open and the server continuously pushes data to the browser — one direction, server to client. I chose SSE over WebSockets because AI text streaming is inherently one-directional: the user sends one message, and the server streams the response. WebSockets provide bidirectional communication, which adds complexity (special handshake, stateful connections) without providing any benefit for this use case. SSE runs over plain HTTP/1.1, works through proxies, and is simpler to implement and debug.

---

**Q: What is TTFT and why does it matter?**

A: TTFT stands for Time to First Token — it's the time from when a user sends a message to when they see the first character appear on screen. This is the metric that determines perceived responsiveness. Total stream duration (how long until the full reply is complete) matters less because the user is reading while the AI generates. In NovaAI I measured an average TTFT of ~749ms across 45 messages. I implemented TTFT measurement by recording `Date.now()` when the request starts, then capturing `Date.now() - startTime` when the first `onChunk` callback fires. This value is stored in the Analytics collection and averaged via MongoDB aggregation.

---

**Q: What is the buffer-split pattern and why is it necessary?**

A: OpenAI's API sends data in binary TCP chunks that don't align with SSE message boundaries. A single `reader.read()` call might receive parts of multiple messages, or a message cut off mid-JSON. Without handling this, `JSON.parse` throws on partial lines. The buffer-split pattern solves it: after decoding each chunk, I split on newlines and call `lines.pop()` to save the last element — which may be incomplete — back to `buffer`. The next iteration prepends that partial line to new data. This guarantees every line I process is a complete SSE message. I implemented the same pattern on both the backend (reading from OpenAI) and the frontend (reading from my server).

---

**Q: How do you get token counts from OpenAI's streaming API?**

A: By default, streaming mode does not include usage data — you only get `choices` with `delta.content` tokens. To get real token counts, I pass `stream_options: { include_usage: true }` in the API request body. This tells OpenAI to send an extra chunk before `[DONE]` that has empty `choices` but a populated `usage` object with `prompt_tokens`, `completion_tokens`, and `total_tokens`. My code detects this with `if (parsed.usage) usage = parsed.usage` and passes it to the `onDone` callback. Without this, I'd either have no token data or I'd have to estimate from text length, which is inaccurate.

---

**Q: Why can't you use the browser's `EventSource` API?**

A: The `EventSource` API is the browser's native SSE client — it handles reconnection, parsing, and event dispatching automatically. However, it only supports GET requests. The chat endpoint needs to be a POST because the user's message is in the request body (it would be a security issue and URL-length violation to put it in a query string). Instead, I use `fetch()` and read `response.body.getReader()` to get a `ReadableStream` reader. I then implement the same parsing logic manually — the buffer-split pattern, `TextDecoder`, and line parsing. This gives me SSE semantics with POST support.

---

**Q: What's the difference between `res.write()` and `res.end()` in the context of SSE?**

A: `res.write()` sends a chunk of data to the client without closing the HTTP connection. I call it once per token: `res.write('data: {"token":"Hello"}\n\n')`. The connection stays open for more data. `res.end()` sends any remaining buffered data and then closes the connection, signaling to the browser that the response is complete. In NovaAI, `res.end()` is only called after everything is done — the reply is saved to MongoDB, the analytics document is created, and the final `{ done: true }` event is sent. The browser's `reader.read()` returns `{ done: true }` on its next call after `res.end()`, breaking the while loop in the frontend reader.
