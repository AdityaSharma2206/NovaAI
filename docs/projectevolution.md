# NovaAI — Project Architecture & Interview Guide

## What Is This Project

NovaAI is a full-stack AI chat application with per-user authentication, semantic memory, and a lightweight RAG (Retrieval-Augmented Generation) pipeline. Users register, log in, and maintain isolated conversation threads. The AI personalises its responses using a dynamically updated profile extracted from each conversation.

**Stack:** React (Vite) · Node.js · Express · MongoDB (Mongoose) · OpenAI API

---

## Current Architecture

### Directory Structure

```
SigmaGPT-main/
├── Backend/
│   ├── server.js                  — Express app, middleware mounting, DB connection
│   ├── routes/
│   │   ├── auth.js                — POST /api/auth/register, POST /api/auth/login
│   │   └── chat.js                — Thread CRUD + RAG chat endpoint
│   ├── middleware/
│   │   └── auth.js                — verifyToken (JWT validation)
│   ├── models/
│   │   ├── User.js                — email + passwordHash
│   │   └── Thread.js              — messages[], profile{}, userId ref
│   └── utils/
│       └── openai.js              — getOpenAIAPIResponse, getOpenAIJSONResponse, getOpenAIEmbedding
└── Frontend/
    └── src/
        ├── App.jsx                — Auth state, token decode, conditional render
        ├── Login.jsx              — Login form
        ├── Register.jsx           — Registration form
        ├── Sidebar.jsx            — Thread list, logout button, user email
        ├── ChatWindow.jsx         — Chat UI, RAG profile drawer, message input
        ├── Chat.jsx               — Message rendering
        ├── MyContext.jsx          — Shared React context
        ├── utils/
        │   └── authFetch.js       — fetch wrapper: injects Bearer token, handles 401
        └── *.css
```

---

### Backend Data Flow (POST /api/chat)

```
Client sends:  POST /api/chat  { message, threadId }
               Authorization: Bearer <JWT>

1. verifyToken middleware
   → jwt.verify(token, JWT_SECRET)
   → attaches req.user = { userId, email }

2. Embed the user message
   → OpenAI text-embedding-3-small
   → returns float[1536]

3. Find or create Thread
   → Thread.findOne({ threadId, userId: req.user.userId })
   → if new: generate title via GPT-4o-mini, create Thread with userId stamped

4. Semantic RAG retrieval
   → cosineSimilarity(currentEmbedding, pastMessageEmbedding) for all stored messages
   → sort descending, take top 3 with score > 0.4
   → if found: inject as [SYSTEM DIRECTIVE] block into the system prompt

5. Profile injection
   → read thread.profile { userFacts, preferences, activeContext }
   → if populated: append to system prompt as personalisation context

6. Call OpenAI GPT-4o-mini
   → send [system, ...last 6 messages] (context window trimming)
   → receive assistantReply

7. Embed the reply (so it's searchable in future turns)
   → store in thread.messages[]

8. Save thread, respond to client
   → res.json({ reply, title })

9. Background profile extraction (non-blocking)
   → extractProfileData(thread) fires after response is sent
   → GPT-4o-mini extracts JSON { userFacts[], preferences[], activeContext }
   → merges with existing profile, saves thread again
```

---

### MongoDB Schemas

**users collection**
```
{
  _id:          ObjectId
  email:        String  (unique, lowercase, trimmed)
  passwordHash: String  (bcrypt, 10 rounds)
  createdAt:    Date    (auto)
  updatedAt:    Date    (auto)
}
```

**threads collection**
```
{
  _id:       ObjectId
  threadId:  String   (UUID v1, unique — generated client-side)
  userId:    ObjectId (ref → users._id, required — enforces data ownership)
  title:     String
  messages:  [
    {
      role:      "system" | "user" | "assistant"
      content:   String
      embedding: [Number]   (float[1536], empty for system messages)
      timestamp: Date
    }
  ]
  profile:   {
    userFacts:     [String]
    preferences:   [String]
    activeContext: String
    lastUpdated:   Date
  }
  createdAt: Date
  updatedAt: Date
}

Index: { userId: 1, updatedAt: -1 }
```

---

### Authentication Flow

```
Register
  → POST /api/auth/register { email, password }
  → bcrypt.hash(password, 10) → passwordHash
  → User.create({ email, passwordHash })
  → jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" })
  → return { token, user: { id, email } }
  → client: localStorage.setItem("token", token)

Login
  → POST /api/auth/login { email, password }
  → User.findOne({ email })
  → bcrypt.compare(password, user.passwordHash)
  → same JWT sign + return (same error message for bad email OR bad password)

Page Reload
  → App.jsx reads localStorage on mount (useState lazy initializer)
  → decodes JWT payload (base64url → JSON)
  → checks exp claim vs Date.now() — no server round-trip needed
  → if valid: show chat UI; if expired: show login

Every Protected Request
  → authFetch.js injects Authorization: Bearer <token>
  → verifyToken middleware validates signature + expiry
  → attaches req.user → route handlers scope all DB queries to userId

401 Auto-Logout
  → authFetch.js detects 401 response
  → clears localStorage token
  → calls registered unauthorizedHandler (set from App.jsx useEffect)
  → setUser(null) → React re-renders to login screen — no page reload

Logout
  → localStorage.removeItem("token")
  → setUser(null), reset all chat state
  → no server call — JWT is stateless
```

---

### Frontend State

All shared state lives in App.jsx and is passed through MyContext.Provider:

| State | Type | Purpose |
|---|---|---|
| user | `{ id, email }` | null = show login, truthy = show chat |
| prompt | String | Current textarea value |
| reply | String | Latest AI response |
| currThreadId | UUID | Active thread (changes on new chat or sidebar click) |
| prevChats | Array | Messages rendered in ChatWindow |
| allThreads | Array | Sidebar thread list |
| threadProfile | Object | RAG profile shown in the memory drawer |

---

## Features Built

### 1. JWT Authentication
Stateless auth. Token contains userId + email + expiry signed with HMAC-SHA256. Server never stores session state. Client-side token decode skips a server round-trip on page load.

### 2. Data-Isolated Threads
Every MongoDB query includes `userId: req.user.userId`. Users cannot access each other's threads even if they know the threadId. Enforced at DB query level, not application logic.

### 3. Semantic RAG (Retrieval-Augmented Generation)
Each message is embedded via `text-embedding-3-small` (1536 dimensions). On each new message, cosine similarity is computed against all stored message embeddings. Top 3 matches above 0.4 threshold are injected into the system prompt. Implemented in pure math — no vector DB dependency.

### 4. Dynamic User Profiling
After each AI response, `extractProfileData` runs non-blocking via `.catch()`. GPT-4o-mini reads the last 6 messages and extracts structured JSON (`userFacts`, `preferences`, `activeContext`). Facts are merged with existing profile using Set deduplication. Injected into the system prompt on the next turn.

### 5. Context Window Management
Only the last 6 messages are sent to OpenAI (`thread.messages.slice(-6)`), plus the dynamic system prompt. Prevents unbounded token growth while RAG retrieval compensates for the truncated history.

---

## Interview Q&A

**"Walk me through what NovaAI does."**

NovaAI is a personalised AI chatbot. Users register and log in with JWT authentication. Each user has isolated conversation threads stored in MongoDB. When a user sends a message, the backend embeds it into a 1536-dimensional vector using OpenAI's embedding model, runs cosine similarity against all previous messages in the thread to find semantically relevant context, injects that context into the system prompt alongside a learned user profile, and calls GPT-4o-mini to generate a response. After the response is sent, a background process extracts structured facts and preferences from the conversation to personalise future replies.

---

**"What is JWT and why did you use it instead of sessions?"**

JWT stands for JSON Web Token. It's a self-contained token with three parts: a header, a payload (containing userId, email, and expiry), and a signature (HMAC-SHA256 using a secret key). The server signs it on login. On every subsequent request, the client sends it in the Authorization header. The server verifies the signature without touching a database — there's no session table, no session store. This is called stateless authentication. The trade-off is that you can't invalidate a token before it expires unless you build a denylist, but for this project the 7-day expiry and client-side logout are sufficient.

---

**"How does your RAG pipeline work?"**

When a user sends a message, I convert it to a vector embedding using OpenAI's `text-embedding-3-small` model, which produces 1536 numbers representing the semantic meaning of the text. I do the same for every previous message when it's first stored. On each new message, I compute cosine similarity between the new embedding and all stored embeddings. Cosine similarity measures the angle between two vectors — a score of 1 means identical meaning, 0 means unrelated. I take the top 3 results with a score above 0.4 and inject them into the system prompt as context. This lets the AI recall relevant earlier parts of a long conversation even when those messages aren't in the current context window.

---

**"What is cosine similarity and how did you implement it?"**

Cosine similarity = dot product of two vectors divided by the product of their magnitudes. It ranges from -1 to 1. I implemented it in pure JavaScript with a for-loop — no library. The formula is: sum(A[i] * B[i]) / (sqrt(sum(A[i]^2)) * sqrt(sum(B[i]^2))). I chose this over Euclidean distance because cosine similarity is direction-sensitive, not magnitude-sensitive — two embeddings pointing in the same direction are semantically similar even if they have different scales.

---

**"How does the background profile extraction work?"**

After the HTTP response is sent to the client, `extractProfileData(thread)` is called without `await` — it runs in the Node.js event loop without blocking the response. It sends the last 6 messages to GPT-4o-mini with a prompt asking for a JSON object containing userFacts, preferences, and activeContext. The extracted data is merged with the existing profile using Set-based deduplication so facts don't repeat. On the next message, this profile is injected into the system prompt, so the AI knows things like the user's job, skill level, or stated preferences without being told again.

---

**"How do you prevent one user from accessing another user's data?"**

Every protected route goes through the `verifyToken` middleware, which decodes the JWT and attaches `req.user.userId` to the request. Every single MongoDB query in the chat routes includes `userId: req.user.userId` as a filter condition. So even if a user knows another user's threadId, the query returns null because the threadId exists but belongs to a different userId. The compound index `{ userId: 1, updatedAt: -1 }` also means these filtered queries are served entirely from the index without a collection scan.

---

**"What happens when a JWT expires while the user is actively using the app?"**

The authFetch utility wraps every protected API call. If a response comes back with status 401, it clears the token from localStorage and calls a registered callback. That callback is `handleLogout` from App.jsx, registered via `setUnauthorizedHandler` in a useEffect. Setting `user` to null triggers a React re-render that replaces the chat UI with the login screen — no page reload, no jarring flash. The user sees the login form and can authenticate again.

---

**"What would you add next if you had more time?"**

The two highest-value additions would be SSE streaming and MongoDB Atlas Vector Search. Streaming (Server-Sent Events) would replace the current request-response model so tokens appear word-by-word like ChatGPT, which dramatically improves perceived performance. Atlas Vector Search would replace the in-process cosine similarity loop with a database-level ANN (approximate nearest neighbour) index — it scales to millions of embeddings with sub-millisecond latency, whereas the current approach runs in O(n) on every message. For production I'd also add rate limiting, input sanitisation, and HTTPS.

---

## Metrics You Can Cite

- Embedding dimension: 1536 (OpenAI text-embedding-3-small)
- RAG threshold: cosine similarity > 0.4
- Context retrieved: top 3 semantically relevant messages per query
- Context window sent to model: system prompt + last 6 messages
- Profile extraction: every message, non-blocking, merges with Set deduplication
- Auth token TTL: 7 days (HMAC-SHA256 signed)
- Password hashing: bcrypt, 10 salt rounds (~100ms intentional delay)
- MongoDB index: compound `{ userId, updatedAt }` for O(log n) thread retrieval
