# 17 — Interview Preparation Guide

**Purpose:** This file contains the key technical interview questions that come from this project, organized by topic, with complete model answers. It also covers behavioral questions, system design, and how to handle questions you're unsure about.

**Learning Value:** ⭐⭐⭐⭐⭐ (Pure interview prep)
**Interview Importance:** ⭐⭐⭐⭐⭐ (The most directly useful file before an interview)
**Estimated Reading Time:** 90–120 minutes
**Prerequisites:** 16-project-explanation.md

---

## Table of Contents

1. [JavaScript Questions](#1-javascript-questions)
2. [React Questions](#2-react-questions)
3. [Node.js and Express Questions](#3-nodejs-and-express-questions)
4. [MongoDB Questions](#4-mongodb-questions)
5. [Authentication Questions](#5-authentication-questions)
6. [SSE and Streaming Questions](#6-sse-and-streaming-questions)
7. [AI and LLM Questions](#7-ai-and-llm-questions)
8. [System Design Questions](#8-system-design-questions)
9. [Behavioral Questions](#9-behavioral-questions)
10. [Questions to Ask the Interviewer](#10-questions-to-ask-the-interviewer)
11. [Handling Questions You Don't Know](#11-handling-questions-you-dont-know)
12. [Last 24 Hours Before the Interview](#12-last-24-hours)

---

## 1. JavaScript Questions

**Q: What is the event loop?**
> Node.js runs on a single thread. The event loop is the mechanism that allows it to handle many operations concurrently without blocking. When you call an async operation like `fs.readFile()` or `fetch()`, Node.js registers the callback and hands the work to the OS or thread pool. The event loop continuously checks the call stack — when it's empty, it takes callbacks from the task queue (I/O callbacks, setTimeout callbacks) and pushes them onto the stack for execution. Microtasks (Promise `.then()` callbacks) have priority over macrotasks (setTimeout, I/O). This is why `await` gives back control to the event loop while waiting for I/O — it doesn't block other requests from being handled.

**Q: What is async/await and how does it work?**
> `async/await` is syntactic sugar over Promises. An `async` function always returns a Promise. `await` pauses execution of the async function until the awaited Promise resolves, then resumes with the resolved value. Under the hood, the function is transformed into a state machine by the JavaScript engine. `await` doesn't block the thread — it schedules the rest of the function as a microtask. In NovaAI, every database call (`Thread.findOne()`, `UserMemory.findOne()`), every OpenAI call, and every file read uses `async/await`. The key mental model: `await` suspends the current async function but lets other code run in the meantime.

**Q: What is a closure? Give an example from your code.**
> A closure is a function that retains access to variables from its enclosing scope even after that scope has finished executing. In `getReply()` in ChatWindow.jsx, `isFirstMessage` and `currentPrompt` are captured in the closure: `const isFirstMessage = newChat; const currentPrompt = prompt;`. By the time the SSE stream starts, `newChat` and `prompt` React state may have changed (the user might start typing again). But `isFirstMessage` and `currentPrompt` correctly hold the values from when the button was clicked — they're closed over. Without this capture, race conditions would occur.

**Q: What is the difference between `const`, `let`, and `var`?**
> `var` is function-scoped and hoisted to the top of its function. `let` and `const` are block-scoped. `const` cannot be reassigned (though objects and arrays declared with `const` can still be mutated). In modern JavaScript, you should use `const` by default, `let` when you need to reassign, and never `var`. In NovaAI, all variables use `const` or `let` — no `var`.

**Q: How does `Promise.all()` work? Where did you use it?**
> `Promise.all()` takes an array of Promises and returns a single Promise that resolves when ALL of them resolve, or rejects when ANY of them reject. It runs the Promises in parallel. In NovaAI's analytics route, I use `Promise.all([Analytics.aggregate([...]), Thread.countDocuments({userId})])` to run two independent database queries simultaneously, cutting the response time roughly in half compared to sequential `await` calls. Importantly, I chose NOT to use `Promise.all` for the background task chain — because `extractProfileData` and `maybeSummarize` both save the same Thread document, causing a `ParallelSaveError`.

**Q: What is the spread operator and why do you use it for state updates?**
> The spread operator `...` expands an iterable into individual elements. For array state updates in React, you must create a new array (not mutate the existing one) to trigger re-render. `setPrevChats(prev => [...prev, newMessage])` creates a new array containing all previous messages plus the new one. Without spread, `prev.push(newMessage)` would mutate the existing array — React wouldn't detect the change because the array reference hasn't changed.

**Q: What is optional chaining (`?.`) and why is it useful?**
> Optional chaining (`?.`) short-circuits property access if the left side is `null` or `undefined`, returning `undefined` instead of throwing a TypeError. `parsed.choices[0]?.delta?.content` — if `choices` is an empty array (as in the usage chunk OpenAI sends), `choices[0]` is `undefined`, and without `?.` accessing `.delta` would throw. With `?.`, it returns `undefined` safely. `thread.profile?.userFacts` — if the thread has no profile yet, this returns `undefined` rather than crashing.

**Q: What are Set operations and how did you use them?**
> A JavaScript `Set` is a collection of unique values — duplicates are automatically removed. In NovaAI, I merge new extracted data with existing arrays using: `[...new Set([...(existing || []), ...incoming])]`. This deduplicates without manual checks: if "hiking" is already in `memory.interests` and GPT extracts it again, the Set removes the duplicate. The spread inside creates a Set from the combined array; the outer spread converts it back to an array.

---

## 2. React Questions

**Q: Explain the difference between `useState` and `useEffect`.**
> `useState` holds a piece of reactive data. When you call its setter (`setState(newValue)`), React schedules a re-render with the new value. `useEffect` runs side effects: code that should happen after a render, like fetching data, subscribing to events, or updating the DOM. The key difference: `useState` is about data that drives the UI; `useEffect` is about actions that happen because of a render. In NovaAI, `useState` holds `prevChats`, `streamingReply`, `currThreadId` etc. `useEffect` in Sidebar loads the thread list on mount and in AnalyticsDrawer fetches analytics when the drawer opens.

**Q: What is the React Context API and when would you use it?**
> Context provides a way to share values across the component tree without explicitly passing props through every level. You create a context with `createContext()`, wrap a subtree with `Context.Provider value={data}`, and read it in any descendant with `useContext(Context)`. Use it when: (1) many components need the same data, and (2) passing it as props would require drilling through many intermediate components. In NovaAI, `MyContext` provides 13 state values to Sidebar, ChatWindow, Chat, AnalyticsDrawer, and PersonalInsightsDrawer — without any prop drilling. The alternative (Redux, Zustand) would be overkill for this scale.

**Q: What does the dependency array in `useEffect` do?**
> The dependency array controls when the effect re-runs. `[]` — runs once after mount, never again. `[dep]` — runs after mount and whenever `dep` changes. No array — runs after every render (dangerous, usually a bug). The bug I fixed: `useEffect(() => getAllThreads(), [currThreadId])` re-ran `getAllThreads()` every time `currThreadId` changed (including when creating a new chat). This overwrote the optimistic new thread entry with the server's list. Fix: `useEffect(() => getAllThreads(), [])` — load once on mount.

**Q: What is React batching? How did it help you fix a bug?**
> React 18 batches multiple state updates from the same event handler into a single render. This was critical for the new chat sidebar bug: when the user's first message is sent, two things happen in the same function: `setNewChat(false)` (which removes the fake "New Chat" li from the sidebar JSX) and `setAllThreads(prev => [{ threadId, title: "New Chat" }, ...prev])` (which adds the real entry with the correct threadId). Because React 18 batches these into one render, the fake entry disappears and the real entry appears in the same frame — zero flicker, seamless transition.

**Q: What is the Virtual DOM?**
> The Virtual DOM is an in-memory representation of the actual DOM. When state changes, React creates a new Virtual DOM tree and diffs it against the previous one (reconciliation). Only the actual DOM elements that changed are updated — not the entire page. This is more efficient than directly manipulating the DOM on every state change. In NovaAI, calling `setStreamingReply(assembled)` 50 times per second only updates the one streaming div, not the entire chat window.

**Q: What is `e.stopPropagation()` and when did you need it?**
> DOM events bubble up through the element hierarchy — a click on a child triggers `onClick` handlers on all parent elements too. `e.stopPropagation()` stops that bubbling. In NovaAI's Sidebar, the delete zone (trash icon + "Delete?" label) is inside the `<li>` element that has an `onClick={() => changeThread(threadId)}`. Without `stopPropagation`, clicking the delete zone would also trigger `changeThread()` — switching threads when you were trying to confirm deletion. I added `e.stopPropagation()` to the delete zone's `onClick` to prevent this.

---

## 3. Node.js and Express Questions

**Q: What is middleware in Express?**
> Middleware is a function with signature `(req, res, next)` that runs in the request pipeline before the route handler. It can read/modify `req` and `res`, call `next()` to pass control forward, or send a response early (ending the chain). Express executes middleware in the order they're registered with `app.use()`. In NovaAI, `express.json()` parses JSON bodies, `cors()` adds CORS headers, and `verifyToken` validates JWTs — all before any route handler runs.

**Q: What is CORS and how did you configure it?**
> CORS (Cross-Origin Resource Sharing) is a browser security policy that blocks requests from one origin (e.g., `localhost:5173`) to a different origin (e.g., `localhost:8080`) unless the server explicitly permits it. The browser sends a preflight OPTIONS request; the server must respond with appropriate `Access-Control-Allow-*` headers. In NovaAI, I use the `cors()` middleware from the `cors` npm package with default settings, which allows all origins. In production, I'd configure it to only allow the specific frontend domain.

**Q: How do you handle async errors in Express?**
> Express 5 (which NovaAI uses) automatically catches errors thrown inside `async` route handlers and forwards them to error-handling middleware. In Express 4, you'd need `try/catch` with `next(err)`. The route handlers in NovaAI wrap all database and API calls in `try/catch` — on error, they log and return an appropriate HTTP status code. For the SSE route specifically, there's special handling: if headers have already been sent (the SSE channel is open), we can't send a 500 JSON response — instead we `res.write({ error })` and `res.end()`.

**Q: What is the difference between `req.body`, `req.params`, `req.query`?**
> `req.body` — data from the request body, typically JSON for POST/PUT requests. Requires `express.json()` middleware. Example: `{ message: "Hello", threadId: "abc" }`. `req.params` — path parameters from the URL. Example: for route `/thread/:threadId`, `req.params.threadId` extracts the value. `req.query` — query string parameters. Example: for `/search?q=react`, `req.query.q` is `"react"`.

**Q: How does `res.write()` differ from `res.json()`?**
> `res.json()` serializes a JavaScript object to JSON, sets `Content-Type: application/json`, and closes the connection. It can only be called once. `res.write()` sends a chunk of data to the client without closing the connection — the response stays open for more data. It can be called many times. In NovaAI's SSE implementation, I call `res.write()` once per token (potentially hundreds of times) and `res.end()` once at the end. `res.json()` would close the connection immediately — incompatible with streaming.

---

## 4. MongoDB Questions

**Q: What is the difference between MongoDB and a SQL database?**
> SQL databases store data in tables with fixed, predefined columns. Relationships between tables are expressed via foreign keys and JOIN queries. MongoDB stores data as documents — JSON-like objects that can have nested arrays and subdocuments, with no required fixed structure. I chose MongoDB for NovaAI because: messages are naturally nested inside threads (embedded documents — no JOIN needed), the schema evolved during development without migrations, and the document model maps directly to JavaScript objects. SQL would be better for highly relational data, complex multi-table queries, or strict consistency requirements (like financial data).

**Q: What is Mongoose and what does it add?**
> Mongoose is an ODM (Object-Document Mapper) for MongoDB. The raw MongoDB Node.js driver has no schema — any object can go into any collection. Mongoose adds: schemas (field types, required, unique, enum), models (JavaScript classes with `findOne`, `save`, `findOneAndDelete`), validation (enforced before save), and middleware hooks. In NovaAI, schemas define exactly what a Thread or User document looks like — field types, which fields are required, which must be unique. This catches bugs at the schema level and provides autocomplete in editors.

**Q: What is an aggregation pipeline?**
> A pipeline is a sequence of stages applied to documents. Each stage transforms the data and passes the result to the next. In NovaAI: Stage 1 `$match { userId }` filters to the current user's analytics documents only. Stage 2 `$group { _id: null }` collapses all remaining documents into one result, computing: `$sum: 1` to count messages, `$sum: "$fieldName"` to total tokens and cost, `$avg` for latency and TTFT, and `$sum: { $cond }` to count RAG-triggered messages. The computation happens inside MongoDB — no need to fetch thousands of documents to JavaScript and compute there.

**Q: What is the ParallelSaveError and how did you fix it?**
> Mongoose internally tracks which documents are currently being saved with a `$__saveState` flag. If you call `thread.save()` twice on the same document object at the same time (two overlapping save operations), Mongoose throws a `ParallelSaveError` because the second save would conflict with the first's in-flight state. I triggered this by running `extractProfileData(thread)` and `maybeSummarize(thread)` in parallel via `Promise.all()` — both modified and saved the same Thread object simultaneously. The fix: sequential `.then()` chaining so each save completes before the next starts.

**Q: Why did you embed messages inside Thread vs a separate collection?**
> Messages always belong to exactly one thread and are always accessed in the context of that thread — you never need messages from multiple threads at once. Embedding them gives: one database read to get a thread with all its messages (no JOIN or second query), and atomic updates (adding a message and updating the thread happen as one operation). The tradeoff is document size — very long conversations create large documents. I mitigate this with conversation summarization (keeping messages shorter over time) and the RECENT_WINDOW limit on what's sent to the AI.

---

## 5. Authentication Questions

**Q: How does JWT authentication work?**
> After login, the server creates a JWT: a base64url-encoded header (algorithm), base64url-encoded payload (userId, email, expiry), and an HMAC-SHA256 signature of header+payload using a server secret. The JWT is sent to the client, stored in localStorage, and included in the `Authorization: Bearer <token>` header on every subsequent request. The `verifyToken` middleware re-computes the expected signature using the server secret and compares — if they match and the token isn't expired, `req.user` is populated with the decoded payload. No database lookup needed to verify identity.

**Q: Why is bcrypt preferred over SHA256 for passwords?**
> SHA256 is fast — billions of hashes per second on modern hardware — making brute-force attacks feasible. bcrypt is intentionally slow (cost factor controls work iterations — ~100ms per hash at factor 10). bcrypt also automatically generates a unique random salt per password, so two users with the same password have different hashes, defeating precomputed rainbow tables. SHA256 has neither: no salt, no work factor. Never use a general-purpose hash function for passwords.

**Q: What are the three parts of a JWT?**
> Header: base64url-encoded `{"alg":"HS256","typ":"JWT"}`. Payload: base64url-encoded claims — in NovaAI: `{"userId":"507f...","email":"...","iat":timestamp,"exp":timestamp}`. Signature: HMAC-SHA256 of (encoded-header + "." + encoded-payload) using the JWT_SECRET. The payload is NOT encrypted — anyone can decode it with `atob()`. The signature is what provides tamper-proofing: if an attacker changes the payload, the signature no longer matches.

**Q: What is the risk of storing JWTs in localStorage?**
> localStorage is accessible by any JavaScript running on the page. If there's an XSS vulnerability (malicious script injection), an attacker can read the JWT and make authenticated requests. The alternative is httpOnly cookies, which JavaScript cannot read. For a personal project, localStorage is acceptable. For production, I'd use short-lived access tokens (15 minutes) in memory plus long-lived refresh tokens in httpOnly cookies, with a server-side token denylist for instant revocation.

---

## 6. SSE and Streaming Questions

**Q: What is SSE and how does it differ from WebSockets?**
> SSE (Server-Sent Events) is a one-directional persistent HTTP connection where the server pushes data to the client. WebSockets are full-duplex: both client and server can send messages at any time over a persistent connection. I chose SSE because AI text streaming is inherently one-directional — the client sends one message, the server streams one response. WebSockets add complexity (special handshake, stateful connection) without adding capability for this use case. SSE runs over regular HTTP, works through proxies, and is simpler to implement and debug.

**Q: Why can't you use `EventSource` for POST requests?**
> The browser's native `EventSource` API only supports GET requests — the connection is initiated with a GET and the server streams data. My chat endpoint must be POST because the user's message needs to be in the request body (URL query strings have length limits and are logged in server access logs — bad for user privacy). I use `fetch()` with `response.body.getReader()` instead, which supports POST and gives me a ReadableStream to read from. I implement the same SSE parsing logic (buffer-split, JSON parsing) manually.

**Q: What is the buffer-split pattern and why is it necessary?**
> TCP delivers data in chunks that don't align with SSE message boundaries. A single `reader.read()` might return half a JSON object or two complete messages and part of a third. Without handling this, JSON.parse throws on partial lines. The pattern: `buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop();` — split on newlines, pop the potentially-incomplete last element back to the buffer, only process complete lines. Applied identically on the backend (reading from OpenAI) and frontend (reading from my server).

---

## 7. AI and LLM Questions

**Q: What is RAG and why did you implement it?**
> RAG (Retrieval-Augmented Generation) is a pattern where relevant information is retrieved from a knowledge base and injected into the LLM's context before generating a response. I implemented it because I only send the last 6 messages to OpenAI per request (to control costs), which means important context from earlier in the conversation is invisible. RAG recovers that context semantically: embed every message as a 1536-dim vector, compute cosine similarity against the current query embedding, inject the top 3 matches above 0.4 similarity threshold. 36% of messages in my testing triggered RAG — it's actively contributing.

**Q: How does cosine similarity work? Walk me through the math.**
> Cosine similarity measures the angle between two vectors: `(A · B) / (|A| × |B|)`. The dot product `A · B = Σ(A[i] × B[i])` gives a measure of directional alignment. Dividing by the product of magnitudes (the square root of sum-of-squares for each vector) normalizes for length, so we're measuring direction, not magnitude. Result is -1 to 1. I chose cosine over Euclidean distance because longer text produces larger vectors — Euclidean distance would penalize long passages just for being long, even if meaning is similar.

**Q: What is JSON mode in the OpenAI API?**
> `response_format: { type: "json_object" }` forces the model to respond with only valid JSON — no prose, no markdown, no explanation text. I use it for profile extraction and user memory extraction, where I need structured data back. Without it, the model might say "Here are the user's interests: hiking, travel" — hard to parse. With JSON mode and a schema in the prompt, it returns `{"interests": ["hiking", "travel"]}` — directly usable in JavaScript.

**Q: What is conversation summarization and when does it trigger?**
> When a thread exceeds 14 messages, older messages are compressed into a 3–5 sentence summary by a non-streaming GPT call and stored in `thread.summary`. On each subsequent request, the summary is injected into the system prompt as "Summary of earlier conversation" — so the AI retains the thread's key facts even for messages outside the sliding window of 6 recent messages. The summary rebuilds every 4 new messages (not every message) to amortize the extra API call. Cost impact: ~67% reduction in prompt tokens for long conversations.

**Q: What are text embeddings?**
> An embedding is a fixed-size array of numbers that represents the semantic meaning of text. OpenAI's `text-embedding-3-small` model maps any text to a 1536-dimensional vector. Semantically similar text maps to nearby vectors — "hiking" and "trekking" are close in embedding space; "hiking" and "tax law" are far apart. This is used in NovaAI's RAG pipeline: compute the embedding of the current question, find past messages whose embeddings are nearby (cosine similarity > 0.4), inject those as additional context.

---

## 8. System Design Questions

**Q: Design a chat application with AI responses.**

> Start with the data model: User (auth), Thread (conversation + embedded messages), Message (role, content, timestamp). For AI integration: proxy OpenAI's API from your backend so the API key stays server-side. For streaming: SSE is the right protocol for one-directional AI text streaming — simpler than WebSockets. For context management: maintain a sliding window of recent messages (the last N) to control costs; add summarization for long threads. For personalization: extract structured user data after each response and inject into the system prompt. For observability: log token counts and latency per message for cost monitoring. For auth: stateless JWTs (7-day expiry) allow horizontal scaling.

**Q: How would you scale this to 10,000 concurrent users?**

> The backend is already stateless (JWTs, no server-side sessions), so add more Node.js instances behind a load balancer. For SSE specifically: SSE connections are long-lived, so each instance holds open connections for its users — sticky sessions or a Redis pub-sub layer ensures messages reach the right client even across instances. MongoDB Atlas handles read scaling with replica sets. The main bottleneck: OpenAI API rate limits and costs. Mitigate with a queue (Redis + BullMQ) that rate-limits requests to OpenAI. The linear-scan RAG would need MongoDB Atlas Vector Search at this scale.

**Q: Design the analytics system for an AI chatbot.**

> Append-only event log: create one document per completed AI response with: userId, sessionId, promptTokens, completionTokens, estimatedCost, latencyMs, ttftMs, ragUsed, timestamp. Don't update — only append. For querying: aggregation pipeline with `$match userId` + `$group` to compute totals and averages. Index on `{ userId: 1, timestamp: -1 }` for fast per-user aggregations. For alerting: a periodic job checks if avgCostPerUser > threshold or avgLatencyMs > threshold. For dashboarding: expose a GET endpoint that runs the aggregation on demand — no pre-computation needed at this scale.

---

## 9. Behavioral Questions

**Q: Tell me about a bug that was hard to find.**
> Use the ParallelSaveError story from section 6 of file 16.

**Q: Tell me about a technical decision you made and why.**
> "I chose SSE over WebSockets for the streaming feature. My first instinct was WebSockets — I'd heard they were the 'real-time' technology. But when I thought through the actual data flow, I realized AI text streaming is one-directional: the client sends one message, the server streams one response. WebSockets provide bidirectional communication — a feature I don't need, with additional complexity (custom handshake, stateful connection management). SSE runs over plain HTTP, works through any proxy, and requires no special server setup. It was a clearer fit for the problem."

**Q: Tell me about something you built that you're proud of.**
> "The RAG pipeline. Not because it's impressive-sounding — but because I built it from scratch without using any vector database library. Just `text-embedding-3-small` for embeddings, a 15-line cosine similarity function, sorting, and slicing. Understanding the math (dot product, vector magnitude, why cosine instead of Euclidean) rather than just importing a library made it feel like real learning. When I saw RAG fire in 36% of test messages — actually retrieving relevant context from earlier in the conversation — that was satisfying."

**Q: What tradeoffs did you make in this project?**
> "Several. I used `localStorage` for JWT storage instead of `httpOnly` cookies — simpler, but XSS-vulnerable. Acceptable for a personal project, not for production. I chose linear scan for RAG instead of a vector index — correct at this scale, but wouldn't work for millions of messages. I used no tests — faster development, but regressions go undetected. I chose JavaScript over TypeScript — easier to get started, but type errors surface at runtime. Each of these is a real tradeoff I can articulate and defend."

---

## 10. Questions to Ask the Interviewer

**Questions that show genuine curiosity:**
- "What does the tech stack look like here, and how did those choices evolve over time?"
- "What's the biggest technical challenge the team is working on right now?"
- "How do you approach observability and monitoring in production?"

**Questions that reveal engineering maturity:**
- "How does the team handle breaking API changes — do you have a formal versioning strategy?"
- "What does the testing culture look like? What's your coverage philosophy?"
- "How does the code review process work here?"

**Questions that show you care about the team:**
- "What would you say is the thing that makes this team different to work on?"
- "What does a successful first 90 days look like for someone in this role?"

---

## 11. Handling Questions You Don't Know

**The "I haven't encountered that, but here's how I'd reason through it" approach:**

1. Acknowledge you're not sure — don't bluff
2. Reason from what you DO know: "I know X, which suggests..."
3. Connect to something from this project: "This is similar to Y that I did in NovaAI..."
4. State what you'd do to learn: "I'd check the documentation for..."

**Example:**
> "I haven't used Redis before — but I understand the concept: it's an in-memory key-value store used for caching and pub-sub. In NovaAI I use MongoDB for persistent storage, but for something that needs sub-millisecond reads (like a JWT denylist or session cache), Redis would be the right tool. I'd look at the `ioredis` npm package and start with a basic get/set pattern."

**What NOT to say:**
- "I don't know" and stop (shows no problem-solving instinct)
- Confidently bullshit an answer (experienced interviewers will detect it)
- "We didn't cover that in my course" (doesn't show self-teaching ability)

---

## 12. Last 24 Hours Before the Interview

**What to review:**
- Read files 16 (How to Explain) and this file (17) fully — out loud if possible
- Re-read the actual code: `chat.js`, `openai.js`, `ChatWindow.jsx`, `App.jsx`
- Know these numbers cold: 749ms TTFT, $0.0005/msg, 36% RAG rate, 74/26 token split, 7-day JWT, 14-message summary threshold, 1536 dimensions, 0.4 cosine threshold

**What to practice out loud:**
- The 30-second pitch (time it — it should be about 30 seconds)
- The ParallelSaveError story (practice with STAR: Situation/Task/Action/Result)
- The RAG cosine similarity explanation
- "How does JWT auth work?" — draw the flow on paper first

**What to prepare on paper:**
- The full request lifecycle diagram (from section 5 of file 14)
- The 4-layer system prompt structure
- The background task chain

**Day-of mindset:**
- "I built this from scratch. I know every line of this code."
- "Every interview question about MERN, JWT, SSE, or RAG is a question I can answer with specific code from my project."
- When uncertain: connect to the project. "In NovaAI, I handled this by..."
