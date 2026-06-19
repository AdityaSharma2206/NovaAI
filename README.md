# NovaAI

A full-stack **MERN + AI** chat application with a personalized assistant that remembers context across conversations. Built as a hands-on project to learn how modern LLM applications are actually put together — streaming, retrieval, memory, observability, and cost tracking — not just calling a chat API.

> **Stack:** MongoDB · Express · React · Node.js · OpenAI API

---

## ✨ Features

- **Streaming chat (SSE)** — responses render token-by-token using hand-written Server-Sent Events parsing, with time-to-first-token measured.
- **Cross-conversation memory (RAG)** — every message is embedded; new questions are matched against your past messages via cosine similarity and the most relevant ones are injected into the prompt.
- **RAG Debug View** — an optional toggle that shows exactly what the retrieval system did: which memories were scored, their similarity scores, why each was selected or rejected, and the final context injected into the prompt.
- **Long-term user profile** — the assistant maintains a short, self-updating factual profile about you, distilled by the model from what you share.
- **Conversation summarization** — long threads are automatically compressed into a rolling summary so context survives without resending the whole history.
- **Usage analytics & cost tracking** — per-message token counts, latency, TTFT, RAG-usage rate, and **accurate cost across every OpenAI call** (chat, embeddings, title, summary, profile) with a per-type breakdown.
- **JWT authentication** — register/login with hashed passwords, protected API routes, and auto-logout on token expiry.

---

## 🧠 AI concepts demonstrated

| Concept | Where it lives |
|---|---|
| Token streaming (SSE) | `Backend/utils/openai.js`, `Frontend/src/ChatWindow.jsx` |
| Embeddings & semantic search | `getOpenAIEmbedding`, `cosineSimilarity` |
| Retrieval-Augmented Generation | `routes/chat.js` (scoring → threshold → top-K → inject) |
| Context-window management | rolling summarization + bounded recent-message window |
| LLM-as-memory (profile distillation) | `updateUserProfile` |
| Prompt / context assembly | system prompt = base + profile + summary + retrieved context |
| LLM observability & cost modeling | `models/Analytics.js`, `models/Usage.js`, `utils/cost.js` |

---

## 🏗️ Architecture

```
Frontend (React + Vite)                Backend (Express + Node)             Data
─────────────────────────             ──────────────────────────           ──────────────
 ChatWindow ── SSE stream ───────────▶  POST /api/chat                       MongoDB
   │  (token-by-token UI)                 ├─ embed query                      ├─ users
   │                                       ├─ RAG: score past messages         ├─ threads (+ embeddings)
   ├─ Sidebar (threads)  ── REST ───────▶  ├─ assemble context prompt          ├─ usermemories (profile)
   ├─ AnalyticsDrawer    ── REST ───────▶  ├─ stream reply (OpenAI)            ├─ analytics (perf)
   └─ RagDebugPanel  ◀── rag SSE event ──  └─ log usage / analytics            └─ usage (cost per call)
                                          GET /api/analytics  ── aggregates ──▶
                                          /api/auth (register, login, JWT)
```

- **Auth split:** `/api/auth` is public; all other `/api` routes sit behind JWT middleware.
- **Concurrency-safe writes:** messages are appended with atomic `$push` (no read-modify-write races).
- **Abortable streams:** switching threads or disconnecting cancels the in-flight OpenAI request.

---

## 📂 Project structure

```
NovaAI/
├── Backend/
│   ├── server.js            # app entry: env checks, DB connect, route mounting
│   ├── middleware/auth.js   # JWT verification
│   ├── models/              # User, Thread, UserMemory, Analytics, Usage
│   ├── routes/              # auth, chat, analytics
│   └── utils/               # openai.js (API helpers), cost.js (pricing + usage logging)
└── Frontend/
    └── src/
        ├── App.jsx          # auth gate + shared state (Context)
        ├── ChatWindow.jsx   # streaming, RAG-debug toggle
        ├── Chat.jsx         # message rendering (markdown)
        ├── Sidebar.jsx      # thread list / switching
        ├── AnalyticsDrawer.jsx
        ├── RagDebugPanel.jsx
        └── utils/           # api base URL, authFetch wrapper
```

---

## 🚀 Getting started

### Prerequisites
- Node.js 18+
- A MongoDB connection string (local or Atlas)
- An OpenAI API key

### 1. Backend

```bash
cd Backend
npm install
# create a .env file (see below)
npm run dev        # starts on http://localhost:8080
```

**`Backend/.env`**

```env
MONGODB_URI=your-mongodb-connection-string   # required
JWT_SECRET=your-long-random-secret           # required
OPENAI_API_KEY=sk-...                        # required
OPENAI_MODEL=gpt-4o-mini                     # optional (default: gpt-4o-mini)
PORT=8080                                    # optional
JWT_EXPIRES_IN=7d                            # optional
FRONTEND_URL=http://localhost:5173           # optional (CORS allow-origin)
```

> The server validates the three required variables on boot and exits if any are missing.

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev        # starts on http://localhost:5173
```

**`Frontend/.env`** (only needed if the backend isn't on `localhost:8080`)

```env
VITE_API_URL=http://localhost:8080
```

---

## 🔌 API overview

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account, returns JWT |
| POST | `/api/auth/login` | — | Log in, returns JWT |
| POST | `/api/chat` | ✅ | Stream a reply (SSE); accepts `{ threadId, message, debug? }` |
| GET | `/api/thread` | ✅ | List the user's threads |
| GET | `/api/thread/:id` | ✅ | Fetch a thread's messages |
| DELETE | `/api/thread/:id` | ✅ | Delete a thread |
| GET | `/api/analytics` | ✅ | Aggregated usage, performance & cost |

---

## 📚 What I learned

- Implementing **SSE streaming** end-to-end (parsing the token stream and the usage chunk by hand).
- The full **RAG loop** — embeddings, cosine similarity, thresholding, top-K selection, and prompt injection — implemented from scratch rather than via a vector-DB library.
- **Context-window management**: balancing a system prompt, a rolling summary, retrieved memories, and a bounded recent window.
- **LLM observability**: measuring TTFT/latency and tracking real token cost across *every* model call, not just the visible reply.
- Practical backend concerns: **atomic MongoDB writes** to avoid concurrent-write data loss, **abortable upstream requests**, and **fail-fast configuration**.

---

## ⚠️ Known limitations & future ideas

- **Retrieval scans all of a user's messages in-process.** This is intentional (so the cosine-similarity logic is visible and understandable) but won't scale to large histories — a production version would use a vector index (e.g. MongoDB Atlas Vector Search). The retrieval threshold (`0.4`) is a tunable starting point, not a tuned value.
- **No automated tests yet.**
- **Possible next features:** tool/function calling, an evaluation harness, and a stop/regenerate control.

---

*Built as a learning project to understand modern LLM application architecture.*
