# 05 — Express.js Complete Guide

**Purpose:** Express.js is the web framework that runs NovaAI's backend. It handles routing (which code runs for which URL), middleware (code that runs before the route handler), and the entire request-response cycle. This file explains every Express concept in the codebase, and shows exactly how a request travels from the browser through Express to the database and back.

**Learning Value:** ⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐
**Estimated Reading Time:** 50–65 minutes
**Prerequisites:** 04-nodejs-complete-guide.md

---

## Table of Contents

1. [What Express.js Is and Why It Exists](#1-what-expressjs-is-and-why-it-exists)
2. [The Request-Response Cycle in Express](#2-the-request-response-cycle)
3. [Routing — Matching URLs to Code](#3-routing)
4. [Middleware — The Most Powerful Concept](#4-middleware)
5. [CORS — Cross-Origin Resource Sharing](#5-cors)
6. [Request Object: req.body, req.params, req.query](#6-request-object)
7. [Response Object: Sending Different Types of Data](#7-response-object)
8. [The NovaAI Auth Middleware in Detail](#8-the-novaai-auth-middleware)
9. [Async Route Handlers and Error Handling](#9-async-route-handlers)
10. [NovaAI's Complete Route Map](#10-novaais-complete-route-map)
11. [Summary](#11-summary)
12. [Interview Questions and Answers](#12-interview-questions-and-answers)

---

## 1. What Express.js Is and Why It Exists

### Raw Node.js HTTP Is Painful

Node.js has a built-in `http` module for creating servers. Here's what it looks like without Express:

```javascript
// Raw Node.js — painful
import http from "http";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/thread") {
    // Manually parse headers
    const auth = req.headers.authorization;
    // Manually read body
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const data = JSON.parse(body);
      // Manually write response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ threads: [] }));
    });
  } else if (req.method === "POST" && req.url === "/api/chat") {
    // another huge block...
  }
  // ... hundreds more if/else blocks
});

server.listen(8080);
```

Every route is an `if/else` branch. Parsing the request body, sending JSON, handling errors — all manual.

### Express Makes This Clean

Express adds routing, middleware, and convenient request/response helpers:

```javascript
// With Express — clean
import express from "express";
const app = express();
app.use(express.json()); // automatic body parsing

app.get("/api/thread", async (req, res) => {
  const threads = await Thread.find({ userId: req.user.userId });
  res.json(threads); // automatic JSON serialization
});

app.listen(8080);
```

Express is one of the oldest and most widely used Node.js frameworks. If you know Express, you can read any Node.js backend quickly.

---

## 2. The Request-Response Cycle in Express

Every interaction follows this path:

```
Browser sends HTTP Request
        │
        ▼
Express receives Request
        │
        ▼
Global Middleware runs (cors, express.json)
        │
        ▼
Route-level Middleware runs (verifyToken)
        │
        ▼
Route Handler runs (the actual business logic)
        │
        ▼
Route Handler sends Response (res.json, res.write, res.end)
        │
        ▼
Browser receives HTTP Response
```

This is not a loop — each HTTP request goes through this path once and ends with a response. For the SSE streaming endpoint, the "response" stays open and data is written to it multiple times before `res.end()` closes it.

### The req and res Objects

Every route handler and middleware receives two objects:

**`req` (Request)** — Everything about the incoming request:
- `req.method` — GET, POST, DELETE, etc.
- `req.url` — the path, like `/api/thread/abc-123`
- `req.params` — URL parameters (`:threadId` → `req.params.threadId`)
- `req.body` — the parsed request body (JSON)
- `req.headers` — all request headers, including `Authorization`
- `req.user` — added by `verifyToken` middleware (not built-in to Express)

**`res` (Response)** — Methods for sending a response:
- `res.json(data)` — send JSON response
- `res.status(404).json(...)` — set status code then send JSON
- `res.write(data)` — write a chunk (streaming)
- `res.end()` — close the response
- `res.setHeader(name, value)` — set a response header
- `res.flushHeaders()` — immediately send headers

---

## 3. Routing — Matching URLs to Code

### Basic Route Definition

```javascript
// app.METHOD(path, handler)

app.get("/api/thread", async (req, res) => {
  // This runs when the browser sends GET /api/thread
});

app.post("/api/chat", async (req, res) => {
  // This runs when the browser sends POST /api/chat
});

app.delete("/api/thread/:threadId", async (req, res) => {
  // This runs when the browser sends DELETE /api/thread/abc-123
  const { threadId } = req.params; // extracts "abc-123"
});
```

### Route Parameters — Dynamic Path Segments

When a URL segment starts with `:`, it's a **route parameter** — a placeholder that matches any value:

```javascript
app.get("/api/thread/:threadId", async (req, res) => {
  const threadId = req.params.threadId;
  // If the request was GET /api/thread/abc-123-def
  // req.params.threadId = "abc-123-def"

  const thread = await Thread.findOne({ threadId, userId: req.user.userId });
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
});
```

### `express.Router()` — Organizing Routes

Instead of defining all routes in `server.js`, Express lets you group related routes into a **Router** in separate files:

```javascript
// routes/chat.js
import express from "express";
const router = express.Router();

router.get("/thread", async (req, res) => { ... });
router.get("/thread/:threadId", async (req, res) => { ... });
router.delete("/thread/:threadId", async (req, res) => { ... });
router.post("/chat", async (req, res) => { ... });

export default router;
```

```javascript
// server.js
import chatRoutes from "./routes/chat.js";

// Mount the router under /api — all routes in chatRoutes are prefixed with /api
app.use("/api", verifyToken, chatRoutes);
```

Now `router.get("/thread", ...)` matches `GET /api/thread`.

**NovaAI's route files:**
- `routes/auth.js` — register and login (public)
- `routes/chat.js` — threads and chat (protected by `verifyToken`)
- `routes/analytics.js` — usage metrics (protected)
- `routes/userMemory.js` — long-term memory (protected)

---

## 4. Middleware — The Most Powerful Concept

### What Middleware Is

Middleware is a function that runs in the middle of the request-response cycle. It has access to `req`, `res`, and a `next` function.

```
Request → Middleware 1 → Middleware 2 → Route Handler → Response
```

Every middleware must either:
- Call `next()` to pass control to the next middleware/route handler
- Send a response (`res.json()`, `res.end()`) to end the cycle

### The `next()` Function

```javascript
const myMiddleware = (req, res, next) => {
  console.log("A request came in:", req.method, req.url);
  next(); // pass to the next middleware or route handler
};

// If you don't call next(), the request hangs and the browser gets no response
const badMiddleware = (req, res, next) => {
  console.log("Request received");
  // Forgot to call next() — browser waits forever
};
```

### Built-In Middleware

**`express.json()`** — Parses incoming requests with a JSON body:

```javascript
app.use(express.json());
// Without this, req.body would be undefined for POST requests with JSON bodies
```

When a POST request arrives with:
```
Content-Type: application/json
Body: {"message": "Hello", "threadId": "abc-123"}
```

`express.json()` reads the raw body text, parses it into a JavaScript object, and attaches it to `req.body`. Without this middleware, `req.body` would be `undefined`.

### Third-Party Middleware: cors

```javascript
import cors from "cors";
app.use(cors());
```

This middleware adds headers to every response:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,DELETE,...
```

These headers tell the browser: "I accept requests from any origin." Without this, the browser would block the React app's requests to Express because they're on different ports (5173 vs 8080).

### Custom Middleware: The Middleware Stack in NovaAI

```javascript
// server.js — middleware applied to ALL routes:
app.use(cors());
app.use(express.json());

// Middleware applied only to protected routes:
app.use("/api/auth", authRoutes);                     // public — no verifyToken
app.use("/api", verifyToken, chatRoutes);             // protected
app.use("/api", verifyToken, analyticsRoutes);        // protected
app.use("/api", verifyToken, userMemoryRoutes);       // protected
```

`verifyToken` is passed as a second argument to `app.use()`. Express runs it **before** the route handler for every `/api/*` route (except `/api/auth`).

### Middleware Execution Order Matters

```
POST /api/chat arrives
    │
    ▼
cors() middleware — adds CORS headers
    │
    ▼
express.json() middleware — parses request body into req.body
    │
    ▼
verifyToken middleware — validates JWT, adds req.user
    │
    ▼
chat route handler — uses req.body.message and req.user.userId
```

If you reversed the order (route handler before `express.json()`), `req.body` would be `undefined` in the handler.

---

## 5. CORS — Cross-Origin Resource Sharing

### The Same-Origin Policy

Browsers enforce a security rule called the **Same-Origin Policy**: a web page can only make requests to the same origin (protocol + domain + port) it was loaded from.

```
Page at:          http://localhost:5173
Request to:       http://localhost:8080/api/chat
                  ^^^^^^^^^^^^^^^^^^^^
                  Different port = different origin = BLOCKED by default
```

### CORS Headers Override This

The server can explicitly allow cross-origin requests by sending CORS headers:

```
Response headers:
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

When the browser sees these, it lifts the restriction.

### Preflight Requests

For "non-simple" requests (like POST with `Authorization` header), the browser first sends an **OPTIONS** preflight request to ask: "Is this allowed?"

```
Browser: OPTIONS /api/chat HTTP/1.1
Origin: http://localhost:5173

Server: Access-Control-Allow-Origin: *
        Access-Control-Allow-Methods: POST
        Access-Control-Allow-Headers: Authorization, Content-Type

Browser: "Permission granted"
Browser: POST /api/chat HTTP/1.1  ← the actual request
```

`app.use(cors())` in NovaAI handles preflight requests automatically.

---

## 6. Request Object: req.body, req.params, req.query

### `req.params` — URL Parameters

```javascript
// Route: DELETE /api/thread/:threadId
// Request: DELETE /api/thread/abc-123-def

router.delete("/thread/:threadId", async (req, res) => {
  const threadId = req.params.threadId; // "abc-123-def"
  await Thread.findOneAndDelete({ threadId, userId: req.user.userId });
  res.json({ success: true });
});
```

### `req.body` — Request Body

```javascript
// Route: POST /api/chat
// Request body: {"message": "Hello", "threadId": "abc-123"}

router.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;
  // message = "Hello"
  // threadId = "abc-123"
});
```

Requires `app.use(express.json())` to be set up.

### `req.user` — Custom Property Added by Middleware

```javascript
// Added by verifyToken middleware:
router.get("/thread", async (req, res) => {
  const userId = req.user.userId;
  // Not a built-in Express property — added by verifyToken
  const threads = await Thread.find({ userId });
  res.json(threads);
});
```

### `req.headers` — All Request Headers

```javascript
// In verifyToken middleware:
const authHeader = req.headers.authorization;
// "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 7. Response Object: Sending Different Types of Data

### `res.json()` — JSON Response

```javascript
// Automatically sets Content-Type: application/json
// Automatically calls JSON.stringify()
res.json({ threads: [], totalCount: 0 });
res.json(threadDocument); // works with Mongoose documents too
```

### `res.status().json()` — Status Code + JSON

```javascript
if (!thread) {
  return res.status(404).json({ error: "Thread not found" });
}
// Status: 404
// Body: {"error":"Thread not found"}
```

Always use `return` when sending an error response inside an async function — otherwise code execution continues to the next `res.json()` call (you can't send two responses).

### `res.write()` and `res.end()` — Streaming Responses

For the SSE chat endpoint:

```javascript
// Open the SSE connection:
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
res.flushHeaders(); // send headers immediately

// Write tokens as they arrive:
res.write(`data: ${JSON.stringify({ token: "quan" })}\n\n`);
res.write(`data: ${JSON.stringify({ token: "tum" })}\n\n`);
res.write(`data: ${JSON.stringify({ token: " comput" })}\n\n`);

// When done:
res.write(`data: ${JSON.stringify({ done: true, title: "Quantum Computing" })}\n\n`);
res.end(); // close the HTTP connection
```

The `\n\n` at the end of each write is required by the SSE protocol — it marks the end of one event.

The difference between `res.json()` and `res.write()`:
- `res.json()` sends the response and **closes** the connection
- `res.write()` sends data and **keeps** the connection open
- `res.end()` closes the connection

---

## 8. The NovaAI Auth Middleware in Detail

This is one of the most interview-worthy pieces of the backend. Let's trace through it completely:

```javascript
// middleware/auth.js
import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  // Step 1: Get the Authorization header
  const authHeader = req.headers.authorization;
  // "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI..."

  // Step 2: Check it exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  // Step 3: Extract just the token (remove "Bearer " prefix)
  const token = authHeader.split(" ")[1];
  // "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI..."

  // Step 4: Verify the token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // If the token is invalid or expired, this throws an error
    // If valid, decoded = { userId: "...", email: "...", iat: ..., exp: ... }

    // Step 5: Attach the user info to the request object
    req.user = { userId: decoded.userId, email: decoded.email };
    // Now any route handler that runs after this can use req.user

    // Step 6: Pass control to the next handler
    next();
  } catch (err) {
    // Token was invalid or expired
    return res.status(401).json({ message: "Invalid token" });
  }
};
```

### What Happens at Each Step

**Step 1:** The browser sends `Authorization: Bearer <token>` in the request header. `authFetch.js` adds this automatically.

**Step 2:** We validate the format before doing anything else.

**Step 3:** `"Bearer eyJ...".split(" ")` gives `["Bearer", "eyJ..."]`. Index `[1]` is the token.

**Step 4:** `jwt.verify()` does two things simultaneously:
- Checks the signature (proves the token wasn't tampered with)
- Checks the expiry (`exp` field in the payload)
If either fails, it throws an error.

**Step 5:** `req.user` is our custom addition to the request object. Any route handler that runs after `verifyToken` can access `req.user.userId` and `req.user.email`. This is how every database query is scoped to the current user:

```javascript
// In every protected route:
const threads = await Thread.find({ userId: req.user.userId }); // only this user's threads
await Thread.findOneAndDelete({ threadId, userId: req.user.userId }); // only this user's thread
```

**Step 6:** `next()` passes control to the route handler.

---

## 9. Async Route Handlers and Error Handling

### The Problem with async/await in Express 4

In Express 4, if an async route handler throws an error, Express doesn't catch it:

```javascript
// Express 4 — this error would crash the server:
app.get("/api/thread", async (req, res) => {
  const thread = await Thread.findOne({}); // if this throws, Express ignores it
  res.json(thread);
});
```

You had to wrap every handler in try/catch manually.

### Express 5 — Automatic Async Error Handling

NovaAI uses **Express 5** (`"express": "^5.1.0"` in package.json). Express 5 automatically catches errors from async route handlers and forwards them to error-handling middleware:

```javascript
// Express 5 — errors are automatically caught
app.get("/api/thread", async (req, res) => {
  const thread = await Thread.findOne({}); // if this throws, Express handles it
  res.json(thread);
});
```

### try/catch for Business Logic Errors

You still use try/catch for errors you want to handle explicitly:

```javascript
router.post("/chat", async (req, res) => {
  try {
    const { message, threadId } = req.body;

    if (!message || !threadId) {
      return res.status(400).json({ error: "message and threadId required" });
    }

    const thread = await Thread.findOne({ threadId, userId: req.user.userId });
    // ... rest of the handler
  } catch (err) {
    console.log("Chat error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});
```

The `return` before `res.status(400).json(...)` is important — without it, code would continue executing after sending the error response, eventually calling `res.json()` again, which would throw another error.

---

## 10. NovaAI's Complete Route Map

```
Public Routes (no JWT required):

POST /api/auth/register
  Body:     { email, password }
  Action:   Hash password, create User, sign JWT
  Returns:  { token, user: { userId, email } }

POST /api/auth/login
  Body:     { email, password }
  Action:   Find User by email, compare password hash, sign JWT
  Returns:  { token, user: { userId, email } }


Protected Routes (JWT required — verifyToken runs first):

GET /api/thread
  Action:   Find all Threads for req.user.userId, sorted by updatedAt desc
  Returns:  [ { threadId, title }, ... ]

GET /api/thread/:threadId
  Params:   threadId
  Action:   Find Thread, filter out system message, return messages + profile
  Returns:  { messages: [...], profile: { userFacts, preferences, activeContext } }

DELETE /api/thread/:threadId
  Params:   threadId
  Action:   findOneAndDelete where threadId AND userId match
  Returns:  { success: true } or 404

POST /api/chat
  Body:     { message, threadId }
  Action:   Embed message → find/create Thread → fetch UserMemory →
            run RAG → build system prompt → generate title (if new) →
            open SSE connection → stream OpenAI response →
            onDone: save reply + analytics → send done event → close
  Returns:  SSE stream of { token } events + final { done, title } event

GET /api/analytics
  Action:   MongoDB aggregation over Analytics collection for this user
  Returns:  { totalConversations, totalMessages, totalTokens,
              totalPromptTokens, totalCompletionTokens,
              estimatedTotalCostUsd, avgCostPerMessage,
              avgLatencyMs, avgTtftMs, ragUsageRate }

GET /api/user-memory
  Action:   Find UserMemory document for req.user.userId
  Returns:  { interests, goals, lifeEvents, ongoingProjects,
              preferences, challenges, longTermObjectives,
              topicFrequency, memoryHighlights, profileSummary, lastUpdated }
```

---

## 11. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| Express app | The main server object | `const app = express()` in server.js |
| Routing | Matching URLs + methods to handlers | 8 routes across 4 route files |
| Route parameters | `:threadId` in URL | `/api/thread/:threadId` |
| `express.Router()` | Grouping routes in separate files | auth.js, chat.js, analytics.js, userMemory.js |
| `app.use(path, router)` | Mounting a router at a path prefix | `app.use("/api", chatRoutes)` |
| Middleware | Function that runs before route handlers | `cors()`, `express.json()`, `verifyToken` |
| `next()` | Pass control to next handler | Called at end of every middleware |
| `express.json()` | Parse JSON request bodies | Required for `req.body` to work |
| `cors()` | Add CORS headers to all responses | Required for browser to reach Express from React |
| `res.json()` | Send JSON response + close | All non-streaming responses |
| `res.status(n)` | Set HTTP status code | `res.status(401)`, `res.status(404)` |
| `res.write()` | Send chunk without closing | Each SSE token |
| `res.flushHeaders()` | Send headers immediately | Opening the SSE stream |
| `res.end()` | Close the connection | After the stream completes |
| `req.body` | Parsed request body | `req.body.message`, `req.body.threadId` |
| `req.params` | URL parameters | `req.params.threadId` |
| `req.user` | Custom: added by verifyToken | `req.user.userId` in every protected route |

---

## 12. Interview Questions and Answers

---

**Q: What is middleware in Express? Give a real example.**

A: Middleware is a function that runs in the middle of the request-response cycle. It receives `req`, `res`, and `next`. It can read or modify the request, send a response early, or call `next()` to continue to the next middleware or route handler. In NovaAI, I have three layers of middleware: `cors()` which adds CORS headers to allow the React frontend to make requests, `express.json()` which parses JSON request bodies so `req.body` is available, and `verifyToken` which reads the `Authorization` header, validates the JWT, and attaches `req.user` to the request. Every protected route depends on `req.user` to know which user is making the request.

---

**Q: What is the difference between `req.body`, `req.params`, and `req.query`?**

A: `req.params` contains named segments of the URL path — in `/api/thread/:threadId`, if the request is to `/api/thread/abc-123`, then `req.params.threadId` is `"abc-123"`. `req.body` contains the parsed request body — for a POST request with `Content-Type: application/json`, `req.body` is the parsed JavaScript object. It requires `express.json()` middleware. `req.query` contains URL query parameters — in `/api/search?q=hello&page=2`, `req.query.q` is `"hello"`. In NovaAI, I use `req.params` for thread IDs in URL paths and `req.body` for chat messages in POST requests. I don't use query parameters.

---

**Q: What is CORS and why do you need it?**

A: CORS (Cross-Origin Resource Sharing) is a browser security mechanism based on the Same-Origin Policy — browsers block requests between different origins (protocol + domain + port combinations) by default. In NovaAI, the React frontend runs on `localhost:5173` and the Express backend on `localhost:8080`. Different ports make them different origins, so the browser would block every API request without CORS configuration. The Express backend adds `Access-Control-Allow-Origin` and related headers via the `cors()` middleware, which tells the browser "I accept cross-origin requests." Without `app.use(cors())`, the React app could not communicate with the backend at all.

---

**Q: How does Express route matching work?**

A: Express tries routes in the order they are defined. When a request arrives, Express goes through each registered route and checks if the HTTP method and URL path match. The first matching route runs its handler. Route parameters (`:name`) match any value. `app.use(path, router)` mounts a router so all its routes are prefixed with `path`. In NovaAI, `app.use("/api", verifyToken, chatRoutes)` means every route in `chatRoutes` gets `/api` prepended, and `verifyToken` runs before the route handler. The order matters — if `authRoutes` were mounted with `verifyToken`, even login and register would require a JWT, which would be a bug.

---

**Q: What is the difference between `res.json()` and `res.write()`?**

A: `res.json()` serializes a JavaScript object to JSON, sends it as the complete response body, and closes the HTTP connection — one shot. `res.write()` sends a chunk of data without closing the connection — you can call it multiple times. In NovaAI, I use `res.json()` for all standard API responses (loading threads, deleting, analytics), and `res.write()` + `res.end()` for the SSE streaming chat endpoint. The key difference is that SSE needs to keep the connection open and send data repeatedly as each AI token is generated. `res.json()` cannot do this — it closes the connection after one call.
