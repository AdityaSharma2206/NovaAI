# 14 — Complete Project Architecture

**Purpose:** This file gives you the full picture of how every component in NovaAI connects to every other. It covers the folder structure, data flow diagrams, the request lifecycle for every endpoint, the background task chain, and the state management architecture on the frontend. After reading this, you should be able to draw the entire system from memory.

**Learning Value:** ⭐⭐⭐⭐⭐ (Essential for system design questions)
**Interview Importance:** ⭐⭐⭐⭐⭐ (Interviewers always ask "walk me through your architecture")
**Estimated Reading Time:** 50–65 minutes
**Prerequisites:** All files 01–13

---

## Table of Contents

1. [Project Overview in One Paragraph](#1-project-overview)
2. [Folder Structure](#2-folder-structure)
3. [The Technology Stack](#3-the-technology-stack)
4. [System Architecture Diagram](#4-system-architecture-diagram)
5. [The Complete Request Lifecycle: Sending a Chat Message](#5-the-complete-request-lifecycle)
6. [Frontend State Architecture](#6-frontend-state-architecture)
7. [The Four-Layer System Prompt Architecture](#7-the-four-layer-system-prompt-architecture)
8. [The Background Task Chain](#8-the-background-task-chain)
9. [Database Architecture](#9-database-architecture)
10. [API Design — All Endpoints](#10-api-design)
11. [Security Architecture](#11-security-architecture)
12. [Performance Architecture](#12-performance-architecture)

---

## 1. Project Overview in One Paragraph

NovaAI is a full-stack personal AI assistant built on the MERN stack (MongoDB, Express, React, Node.js). Users authenticate via JWT, then interact with a streaming chat interface powered by OpenAI's GPT-4o-mini via Server-Sent Events. Each message triggers a four-layer personalization pipeline: the user's long-term profile (extracted from all past conversations), a compressed summary of the current conversation, real-time extracted thread context, and semantically retrieved past messages via cosine similarity over 1536-dimensional text embeddings (RAG). After streaming the response, background tasks fire and forget: profile extraction, conversation summarization, and long-term memory updates. Nine performance and cost metrics are tracked per message and displayed in an analytics dashboard via MongoDB aggregation. The result is an AI that genuinely learns and adapts to the user over time — not just within a session, but across all conversations.

---

## 2. Folder Structure

### Backend Directory Tree

```
Backend/
├── server.js                   ← Entry point: Express setup, MongoDB connection, route mounting
├── middleware/
│   └── auth.js                 ← verifyToken middleware
├── models/
│   ├── User.js                 ← { email, passwordHash, timestamps }
│   ├── Thread.js               ← { threadId, userId, title, messages[], profile, summary }
│   ├── Analytics.js            ← { userId, threadId, tokens, cost, latency, ttft, ragUsed }
│   └── UserMemory.js           ← { userId, interests[], goals[], topicFrequency[], ... }
├── routes/
│   ├── auth.js                 ← POST /register, POST /login
│   ├── chat.js                 ← GET/DELETE /thread, POST /chat (the main route)
│   ├── analytics.js            ← GET /analytics
│   └── userMemory.js           ← GET /user-memory
└── utils/
    └── openai.js               ← 4 OpenAI functions (API, JSON, Embedding, Streaming)
```

### Frontend Directory Tree

```
Frontend/src/
├── main.jsx                    ← React app entry point
├── App.jsx                     ← Auth state machine, MyContext.Provider
├── MyContext.jsx               ← createContext() — 13 shared state values
├── Sidebar.jsx                 ← Thread list, navigation, delete
├── ChatWindow.jsx              ← SSE reader, textarea, navbar, drawers
├── Chat.jsx                    ← Message rendering, markdown, streaming bubble
├── Login.jsx                   ← Login form
├── Register.jsx                ← Registration form
├── AnalyticsDrawer.jsx         ← Analytics dashboard slide-out
├── PersonalInsightsDrawer.jsx  ← UserMemory visualization
└── utils/
    └── authFetch.js            ← fetch wrapper with JWT + 401 handler
```

---

## 3. The Technology Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Frontend framework | React | 19 | Component model, hooks, context API |
| Frontend build tool | Vite | 6 | Fast HMR, instant dev server |
| Backend runtime | Node.js | 22+ | JavaScript everywhere, async I/O |
| Backend framework | Express | 5 | Minimal HTTP framework |
| Database | MongoDB Atlas | Cloud | Document model fits embedded messages |
| ODM | Mongoose | 8+ | Schema, models, validation |
| AI model | GPT-4o-mini | Latest | Fast, cheap, capable |
| Embedding model | text-embedding-3-small | Latest | 1536-dim semantic vectors |
| Auth | jsonwebtoken | 9 | Stateless JWT, 7-day expiry |
| Passwords | bcrypt | 5 | Salt + cost factor hashing |
| Markdown | react-markdown + rehype-highlight | Latest | AI response formatting |
| Unique IDs | uuid v1 | Latest | Thread IDs generated client-side |
| HTTP client | Native `fetch` | Built-in | No SDK overhead, direct streaming |

---

## 4. System Architecture Diagram

### High-Level View

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Sidebar  │  │ ChatWindow   │  │ Drawers                  │  │
│  │ (threads)│  │ (SSE reader) │  │ (Analytics/Memory/Agent) │  │
│  └──────────┘  └──────────────┘  └──────────────────────────┘  │
│         └──────────────┬──────────────────┘                     │
│                   MyContext (shared state)                       │
└───────────────────────┼─────────────────────────────────────────┘
                        │  HTTP/SSE (port 8080)
┌───────────────────────▼─────────────────────────────────────────┐
│                      EXPRESS SERVER                              │
│  ┌──────────┐  ┌─────────────────────────────────────────────┐ │
│  │ auth.js  │  │ verifyToken middleware → chat, analytics,    │ │
│  │ (public) │  │ userMemory routes                           │ │
│  └──────────┘  └─────────────────────────────────────────────┘ │
│       ↓                        ↓                        ↓       │
│  /api/auth         /api/chat + /api/thread     /api/analytics   │
└───────────────────────┬────────────────┬────────────────────────┘
                        │                │
              ┌─────────▼────┐    ┌──────▼──────────┐
              │  MongoDB     │    │  OpenAI API      │
              │  Atlas       │    │  GPT-4o-mini     │
              │  4 collections│    │  text-embedding  │
              └──────────────┘    └─────────────────┘
```

### Data Flow for a Chat Message

```
User types message and hits Enter
         │
         ▼
ChatWindow.jsx: getReply()
  - captures isFirstMessage
  - setNewChat(false), setPrevChats (optimistic user msg)
  - setAllThreads (optimistic new thread entry)
  - authFetch POST /api/chat { message, threadId }
         │
         ▼ (JWT in Authorization header)
Express: verifyToken middleware
  - extracts token from header
  - jwt.verify() → req.user.userId
         │
         ▼
chat.js route handler
  ① getOpenAIEmbedding(message) → 1536-dim vector
  ② Thread.findOne() or create new thread
  ③ UserMemory.findOne() → long-term profile
  ④ cosineSimilarity() × all past messages → top 3 > 0.4
  ⑤ Build 4-layer system prompt
  ⑥ generateTitle() [first message only]
  ⑦ res.setHeader SSE headers + res.flushHeaders()
  ⑧ getOpenAIStreamingResponse()
         │
         ▼ (SSE stream open)
OpenAI → Node.js → res.write() → Browser
Each token:
  - backend: buffer-split → JSON → onChunk → res.write()
  - frontend: buffer-split → JSON → assembled += token → setStreamingReply()
         │
         ▼ (stream ends, onDone fires)
  ⑨ getOpenAIEmbedding(fullReply) → reply vector
  ⑩ thread.messages.push(assistant msg + embedding)
  ⑪ thread.save()
  ⑫ Analytics.create() [fire-and-forget]
  ⑬ background chain: extractProfileData → maybeSummarize → extractUserMemory
  ⑭ res.write({ done: true, title })
  ⑮ res.end()
         │
         ▼
Frontend: parsed.done
  - setPrevChats (commit assembled reply)
  - setStreamingReply("")
  - update thread title in allThreads
  - setTimeout fetchLatestProfile
```

---

## 5. The Complete Request Lifecycle: Sending a Chat Message

### Phase 1: Frontend Pre-Processing

In `ChatWindow.jsx`, `getReply()` runs before any network request:

```javascript
const isFirstMessage = newChat;          // capture before state changes
const currentPrompt = prompt;            // capture before clearing

setLoading(true);
setNewChat(false);                       // new chat state cleared
setPrompt("");                           // input cleared
textareaRef.current.style.height = "auto";  // textarea reset

// Optimistic updates (no server round-trip):
setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

if (isFirstMessage) {
    setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
}
```

**Why optimistic updates?** The user should see their message immediately — not wait for a network round-trip. The UI is updated before the request is even sent.

### Phase 2: Network Request

```javascript
const response = await authFetch("http://localhost:8080/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
});
// authFetch injects: Authorization: Bearer <token>
```

The server receives the request, `verifyToken` validates the JWT and attaches `req.user.userId`.

### Phase 3: Backend Pre-Processing

```javascript
// 1. Embed the message
const messageEmbedding = await getOpenAIEmbedding(message);

// 2. Find or create thread
let thread = await Thread.findOne({ threadId, userId: req.user.userId });
if (!thread) {
    const generatedTitle = await generateTitle(message);  // ~300ms
    thread = new Thread({ threadId, userId, title: generatedTitle, messages: [...] });
} else {
    thread.messages.push({ role: "user", content: message, embedding: messageEmbedding });
}

// 3. Fetch long-term memory
const userMemory = await UserMemory.findOne({ userId: req.user.userId });

// 4. RAG scoring
// (score past messages, get top 3 above 0.4)

// 5. Build 4-layer system prompt
```

### Phase 4: Streaming Response

```javascript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.flushHeaders();  // opens the SSE channel

await getOpenAIStreamingResponse(
    recentMessages,
    (token) => { /* capture ttft, res.write(token) */ },
    async (fullReply, usage) => { /* onDone */ }
);
```

### Phase 5: Post-Stream Tasks

In the `onDone` callback:
1. Embed the full reply
2. Save assistant message to thread
3. Start background chain (fire-and-forget)
4. Save analytics (fire-and-forget)
5. `res.write({ done: true, title })`
6. `res.end()`

### Phase 6: Background Tasks

After `res.end()`, sequentially:
1. `extractProfileData(thread)` → updates `thread.profile`, saves
2. `maybeSummarize(thread)` → maybe updates `thread.summary`, saves
3. `extractUserMemory(thread, userId)` → updates UserMemory, saves

---

## 6. Frontend State Architecture

### The Context Values (MyContext.jsx)

All state lives in App.jsx and is shared via React Context:

```javascript
const providerValues = {
    prompt, setPrompt,                   // current input text
    streamingReply, setStreamingReply,   // live streaming text (empty when not streaming)
    currThreadId, setCurrThreadId,       // current conversation UUID
    newChat, setNewChat,                 // is this a new (unsaved) thread?
    prevChats, setPrevChats,             // array of { role, content } for current thread
    allThreads, setAllThreads,           // array of { threadId, title } for sidebar
    threadProfile, setThreadProfile,     // { userFacts, preferences, activeContext }
    user,                                // { id, email } or null
    handleLogout                         // clears all state + localStorage
};
```

### App.jsx: Auth State Machine

```
No token / expired token
    → render <Login /> or <Register />
    → on successful auth: setUser(userData)

Valid token (checked without server round-trip via decodeToken):
    → render <MyContext.Provider><Sidebar /><ChatWindow /></MyContext.Provider>
    → on any 401 response: setUnauthorizedHandler(handleLogout) auto-logs out
    → on explicit logout: handleLogout() → setUser(null) → login screen
```

**`getStoredUser()`** runs once at startup with `useState(() => getStoredUser())` — a lazy initializer. It reads localStorage, decodes the JWT payload, checks the `exp` claim against `Date.now()`. No server call needed to restore session state.

### Sidebar: Thread List + Navigation

- `useEffect([], [])` — mounts once, calls `getAllThreads()` to load thread list from server
- `allThreads` drives the thread list render
- `newChat` drives the fake "New Chat" entry (shows while a first message is in flight)
- `changeThread(threadId)` — loads a thread's messages and sets `currThreadId`
- `deleteThread(threadId)` — two-click confirmation pattern with 3-second auto-cancel

### ChatWindow: The Central Hub

- Reads `prompt`, `currThreadId`, `newChat`, `threadProfile` from context
- Writes: `setPrompt`, `setStreamingReply`, `setPrevChats`, `setAllThreads`, `setNewChat`
- Contains the SSE reader (the while loop in `getReply()`)
- Contains the auto-expanding textarea (via `useRef`)
- Opens three drawers: Analytics, PersonalInsights, AgentMemory

### Chat: Message Rendering

- Reads `prevChats` and `streamingReply` from context
- Renders each message in `prevChats` via `<ReactMarkdown>`
- Renders `streamingReply` in a separate streaming bubble with the blinking cursor
- Shows suggestion chips when `prevChats` is empty (empty state)

---

## 7. The Four-Layer System Prompt Architecture

Every OpenAI streaming call sends a messages array where `messages[0]` is the system message:

```
"You are a highly personalized AI assistant.

[Layer 1 — UserMemory, if non-empty]
Long-term profile of this user:
Interested in hiking, machine learning, jazz guitar.
Working toward: SWE internship and learning system design.
- Interests: hiking, machine learning, jazz guitar, photography, travel
- Goals: SWE internship, learn system design
- Active projects: React Native mobile app
- Recurring challenges: system design interview prep

[Layer 2 — Conversation Summary, if thread.summary exists]
Summary of earlier conversation:
User is preparing for software engineering interviews at top tech companies...

[Layer 3 — Thread Profile, if non-empty]
Tailor your responses using this learned context:
- Current Focus: Preparing for a Google system design round on Monday
- Known Facts: User knows JavaScript well | Has limited experience with distributed systems
- Preferences: Concise explanations | Code examples preferred

[Layer 4 — RAG context, if cosine score > 0.4]
[SYSTEM DIRECTIVE: Utilize these relevant past conversation snippets via Vector Search if necessary:]
- (user): My name is Aditya, I'm studying for FAANG interviews
- (assistant): For system design, focus on: load balancing, caching, databases...
"
```

Then followed by:
```javascript
[...thread.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))]
```

The last 6 messages verbatim (embeddings stripped — OpenAI doesn't need them).

---

## 8. The Background Task Chain

### The Pattern

```javascript
extractProfileData(thread)
    .then(() => maybeSummarize(thread))
    .then(() => extractUserMemory(thread, req.user.userId))
    .catch(err => console.log("Background task error:", err));
```

**Non-blocking:** Not `await`ed. The chain starts and the function returns immediately. `res.end()` has already been called — the user's connection is closed before any background task runs.

**Sequential:** `.then()` chains ensure each task completes before the next starts. Both `extractProfileData` and `maybeSummarize` modify and save the same Thread document. Parallel execution would cause a Mongoose `ParallelSaveError`.

**Error-isolated:** The single `.catch()` at the end logs any error without crashing the server or affecting the user. If `extractProfileData` throws, `maybeSummarize` and `extractUserMemory` don't run — but the main response was already delivered successfully.

**Fire-and-forget:** If the background tasks fail, the user doesn't know. The system degrades gracefully: profiles are slightly less up-to-date, but conversation history and core functionality are unaffected.

---

## 9. Database Architecture

### Four Collections

| Collection | Documents | Purpose |
|-----------|----------|---------|
| `users` | One per account | Authentication |
| `threads` | One per conversation | Messages, profile, summary |
| `analytics` | One per message | Metrics and cost tracking |
| `usermemories` | One per user | Cross-conversation profile |

### Indexes

| Collection | Index | Purpose |
|-----------|-------|---------|
| `users` | `{ email: 1 }` (unique) | Login lookup, prevents duplicates |
| `usermemories` | `{ userId: 1 }` (unique) | Memory lookup, one-per-user |
| `threads` | `{ userId: 1, updatedAt: -1 }` | Sidebar list: user's threads, newest first |
| `analytics` | `{ userId: 1, timestamp: -1 }` | Analytics aggregation filter |

### Embedded vs Referenced

- **Messages embedded in Thread** — always accessed together, natural nested relationship
- **UserMemory referenced by userId** — separate collection (grows independently, different access patterns)
- **Analytics referenced by userId + threadId** — append-only log, separate from operational data

---

## 10. API Design — All Endpoints

| Method | Path | Auth | Request Body | Response |
|--------|------|------|-------------|----------|
| POST | `/api/auth/register` | None | `{ email, password }` | `{ token, user }` |
| POST | `/api/auth/login` | None | `{ email, password }` | `{ token, user }` |
| GET | `/api/thread` | JWT | — | `[{ threadId, title }]` |
| GET | `/api/thread/:threadId` | JWT | — | `{ messages, profile }` |
| DELETE | `/api/thread/:threadId` | JWT | — | `{ success }` |
| POST | `/api/chat` | JWT | `{ message, threadId }` | SSE stream |
| GET | `/api/analytics` | JWT | — | `{ totalMessages, avgTtft, ... }` |
| GET | `/api/user-memory` | JWT | — | UserMemory document |

**8 endpoints total.** Auth routes are public (`/api/auth`). All others require JWT via `verifyToken` middleware.

### The One Non-REST Endpoint: `/api/chat`

POST `/api/chat` is technically REST (POST to create a message) but the response is an SSE stream — not standard JSON. The client reads `response.body.getReader()` rather than `response.json()`. This hybrid approach (REST request body, SSE response) is a pragmatic design: POST is needed to send data securely in the body, SSE is needed for streaming.

---

## 11. Security Architecture

### JWT Auth End to End

```
Registration/Login:
  1. bcrypt.hash(password, 10)
  2. jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" })
  3. Return token to frontend
  4. Frontend stores in localStorage

Subsequent requests:
  5. authFetch adds: Authorization: Bearer <token>
  6. verifyToken: jwt.verify(token, JWT_SECRET) → req.user
  7. Route handler uses req.user.userId (never req.body.userId)

Token expiry:
  8. Frontend checks exp claim (base64 decode) on startup
  9. If expired: clear localStorage, show login
  10. If 401 received: unauthorizedHandler() → handleLogout()
```

### Data Isolation

Every database query includes `userId: req.user.userId`:

```javascript
Thread.findOne({ threadId, userId: req.user.userId })
Thread.find({ userId: req.user.userId })
Thread.findOneAndDelete({ threadId, userId: req.user.userId })
```

Even if an attacker knows another user's `threadId`, the query also checks `userId` — the server won't return a thread that doesn't belong to the authenticated user.

---

## 12. Performance Architecture

### SSE Streaming: Perceived Latency

Without streaming: 5–8 seconds of silence, then a wall of text.
With streaming: first token in ~749ms, reading continues during generation.

**Impact:** Identical total latency, vastly better perceived performance.

### Optimistic UI Updates: Frontend Doesn't Wait

User message appears immediately (before any server round-trip). New thread appears in sidebar immediately. The UI feels instant.

### Background Task Offloading: User Doesn't Wait

Profile extraction, summarization, and memory updates run after `res.end()`. These add 0ms to user-perceived response time.

### Conversation Summarization: Token Savings at Scale

For a 30-message thread: ~67% reduction in prompt tokens per request. Keeps costs flat as conversations grow.

### MongoDB Aggregation: Single Query for Nine Metrics

One aggregation pipeline replaces what would be nine separate queries or a full collection fetch + JavaScript computation. Database does the work where the data lives.
