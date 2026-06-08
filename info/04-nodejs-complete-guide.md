# 04 — Node.js Complete Guide

**Purpose:** The NovaAI backend runs on Node.js — a JavaScript runtime that lets you run JavaScript outside the browser, on a server. This file explains what Node.js is, why it's fast, and every Node.js-specific concept that appears in the codebase.

**Learning Value:** ⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐
**Estimated Reading Time:** 45–60 minutes
**Prerequisites:** 02-javascript-fundamentals.md

---

## Table of Contents

1. [What Node.js Is](#1-what-nodejs-is)
2. [The Event Loop — Node's Core Superpower](#2-the-event-loop)
3. [Non-Blocking I/O in Practice](#3-non-blocking-io)
4. [Streams in Node.js](#4-streams-in-nodejs)
5. [Node.js Modules](#5-nodejs-modules)
6. [npm — Node Package Manager](#6-npm)
7. [Environment and process](#7-environment-and-process)
8. [How the NovaAI Backend Starts](#8-how-the-backend-starts)
9. [Summary](#9-summary)
10. [Interview Questions and Answers](#10-interview-questions-and-answers)

---

## 1. What Node.js Is

### JavaScript Was Born in the Browser

JavaScript was created in 1995 specifically to run inside web browsers. Browsers have a JavaScript engine — Chrome uses **V8**, Firefox uses SpiderMonkey — that reads and executes JavaScript code.

For 15 years, JavaScript could only run inside a browser. If you wanted to write a server, you used Java, Python, Ruby, or PHP.

### Node.js: JavaScript Everywhere

In 2009, Ryan Dahl took Chrome's **V8 engine** — just the engine, extracted from the browser — and wrapped it with a set of tools for building servers: file system access, network sockets, HTTP server functionality. He called this **Node.js**.

Now JavaScript could run anywhere: in the browser, on a server, in a desktop app, even on microcontrollers.

```
Without Node.js:
  Browser → JavaScript
  Server  → Python / Java / PHP

With Node.js:
  Browser → JavaScript
  Server  → JavaScript ← same language!
```

### Why JavaScript on the Server?

**One language for everything.** In NovaAI, you write JavaScript in React (frontend), JavaScript in Express (backend), and JavaScript-like syntax in Mongoose (database). You don't need to switch mental models.

**Massive ecosystem.** The npm package registry has millions of packages. Need JWT? `npm install jsonwebtoken`. Need bcrypt? `npm install bcryptjs`. Need a MongoDB client? `npm install mongoose`.

**Non-blocking I/O.** This is the technical reason Node.js is popular for APIs. Explained in detail in the next section.

### What Node.js Is NOT

Node.js is not a web framework. It's a runtime — a platform for executing JavaScript. The web framework running on top of Node.js in NovaAI is **Express.js**.

Think of it this way:
- Node.js is the engine
- Express.js is the car

---

## 2. The Event Loop — Node's Core Superpower

This is the most important concept for understanding why Node.js works the way it does. Everything else in Node flows from this.

### The Problem: Traditional Servers Are Slow When Waiting

Imagine a traditional web server (like Apache with PHP). For every incoming request, it creates a **thread** — a unit of execution. While that thread is waiting for a database query to return, it is blocked. It cannot do anything else.

```
Traditional Server (Thread-Per-Request):

Request 1 arrives → Thread 1 starts
  Thread 1: "SELECT * FROM users..." ← WAITING 50ms
  Thread 1: (blocked, doing nothing)
  Thread 1: Got result, now processing
  
Request 2 arrives → Thread 2 starts (different thread, parallel)
Request 3 arrives → Thread 3 starts
...
Request 1000 arrives → Need 1000 threads
                        Each thread uses ~1MB of RAM
                        = 1GB RAM just for threads
```

Under high load, you run out of threads or memory. This is called the **C10K problem** — handling 10,000 concurrent connections on a traditional server was very difficult.

### Node's Solution: One Thread + Non-Blocking I/O

Node.js uses a completely different model. It runs on a **single thread** but handles concurrency through **asynchronous I/O** — when Node starts an I/O operation (database query, HTTP request, file read), it does not wait for it to complete. It registers a callback and moves on to handle the next request.

```
Node.js Server (Event Loop):

Request 1 arrives
  Node: "I need a DB query" → starts query, moves on immediately
  
Request 2 arrives
  Node: "I need another DB query" → starts query, moves on immediately
  
Request 3 arrives
  Node: "Calling OpenAI API" → starts call, moves on immediately
  
DB query from Request 1 completes → Node handles the result, sends response
DB query from Request 2 completes → Node handles the result, sends response
OpenAI from Request 3 responds   → Node forwards the data
```

One thread handles thousands of requests — not by processing them simultaneously, but by interleaving their waiting periods.

### The Event Loop in Detail

The event loop is the mechanism that makes this work. It continuously cycles through phases:

```
┌─────────────────────────────────────────────┐
│                  Event Loop                  │
│                                             │
│  ┌─────────┐   ┌──────────┐   ┌─────────┐  │
│  │ Timers  │──>│   I/O    │──>│  Check  │  │
│  │         │   │ Callbacks│   │(setImm) │  │
│  └─────────┘   └──────────┘   └─────────┘  │
│       │                             │       │
│       └─────────────────────────────┘       │
│              (loops forever)                │
└─────────────────────────────────────────────┘
```

**Timers phase:** Runs `setTimeout` and `setInterval` callbacks whose time has expired.

**I/O callbacks phase:** Runs callbacks for completed I/O operations (database results, HTTP responses, file reads).

**Check phase:** Runs `setImmediate` callbacks.

Between each iteration, Node checks the **microtask queue** — this is where Promise callbacks (`.then()`, `await` continuations) go. Microtasks are processed before moving to the next phase.

### Why This Matters for NovaAI

NovaAI's main request handler (`POST /api/chat`) does many async operations in sequence:

```javascript
// 1. Embed the message (OpenAI API — ~100ms)
const embedding = await getEmbedding(message);

// 2. Find or create the thread (MongoDB — ~30ms)
let thread = await Thread.findOne({ threadId, userId });

// 3. Fetch user memory (MongoDB — ~20ms)
const userMemory = await UserMemory.findOne({ userId });

// 4. Stream the response from OpenAI (~3000ms total)
await getOpenAIStreamingResponse(messages, onChunk, onDone);
```

During each `await`, Node.js does NOT sit idle. It registers the completion callback and handles other incoming requests. This is why Node can stream AI responses to multiple users simultaneously without one blocking another.

### setTimeout in NovaAI

`setTimeout` is used in the delete confirmation and in the post-stream profile fetch:

```javascript
// In Sidebar.jsx — auto-cancel delete confirmation after 3 seconds:
setTimeout(() => setPendingDelete(p => p === thread.threadId ? null : p), 3000);
```

```javascript
// In ChatWindow.jsx — wait 3 seconds after stream before fetching updated profile:
setTimeout(() => fetchLatestProfile(), 3000);
```

Both of these use the timer phase of the event loop.

---

## 3. Non-Blocking I/O in Practice

### What "Blocking" Means

Blocking code prevents anything else from running while it executes:

```javascript
// BLOCKING (don't use this)
const data = fs.readFileSync("huge-file.txt"); // ← freezes Node for entire duration
console.log("This only runs after the file is fully read");
```

### What "Non-Blocking" Means

Non-blocking code starts an operation and immediately continues:

```javascript
// NON-BLOCKING
fs.readFile("huge-file.txt", (err, data) => {
  // This callback runs when the file is ready
  console.log("File is ready");
});
console.log("This runs IMMEDIATELY, before the file is read");
```

### With async/await

With async/await, non-blocking code looks synchronous but behaves non-blocking:

```javascript
// NON-BLOCKING — even though it looks synchronous
const data = await Thread.findOne({ threadId });
// Node is NOT frozen during the await.
// It processes other events while waiting for MongoDB.
```

### The Background Task Chain in NovaAI

One of the most important non-blocking patterns in NovaAI is the background task chain:

```javascript
// In chat.js — after res.end() closes the HTTP connection to the browser:
extractProfileData(thread)
  .then(() => maybeSummarize(thread))
  .then(() => extractUserMemory(thread, req.user.userId))
  .catch(err => console.log("Background task error:", err));
```

These three operations happen **after** the response is already sent to the user. The user sees the full AI reply immediately. Meanwhile, Node.js continues running these three tasks in the background, updating the database without the user waiting for them.

This is possible because Node.js is non-blocking — even after `res.end()`, Node is still running and can execute the `.then()` chain.

---

## 4. Streams in Node.js

Streams are how Node.js processes data in chunks, rather than loading everything into memory at once.

### What a Stream Is

Imagine reading a book:
- **Without streams:** Copy the entire book onto paper, then read it all at once (uses lots of paper)
- **With streams:** Read one page at a time (uses minimal memory)

For large data — like an AI response that takes 3 seconds to generate — streams let you send data to the user as it's produced instead of waiting for everything.

### Types of Streams

- **Readable:** Data flows out — reading a file, receiving an HTTP response from OpenAI
- **Writable:** Data flows in — writing to a file, the HTTP response to the browser (`res` is writable)
- **Duplex:** Both ways simultaneously

### Streams in NovaAI

The chat endpoint uses Node.js writable streams to send SSE data to the browser:

```javascript
// In chat.js — res is a Writable stream
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("X-Accel-Buffering", "no");
res.flushHeaders(); // sends headers immediately, opens the persistent connection

// Write a token to the browser:
res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);

// Close the connection:
res.end();
```

On the other side, reading OpenAI's SSE response uses a Readable stream:

```javascript
// In openai.js — reading OpenAI's streaming response
const reader = response.body.getReader(); // Readable stream reader
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read(); // read one chunk
  if (done) break;
  // process the chunk...
}
```

This is a stream-to-stream proxy: Node.js reads from OpenAI's stream and writes to the browser's stream, token by token.

### `res.flushHeaders()` — Why It Matters

Normally, Express buffers the response and sends it all at once with `res.json()`. For SSE, you need to send headers immediately and keep the connection open. `res.flushHeaders()` does exactly that — it writes the headers to the network right now, without waiting for a body.

Without `res.flushHeaders()`, the browser would wait for the entire response before receiving any data — defeating the purpose of streaming.

---

## 5. Node.js Modules

### What Modules Are

A module is a separate file that exports specific functionality. This keeps code organized and allows sharing code between files.

### ES Modules (What NovaAI Uses)

NovaAI uses modern ES Module syntax throughout:

```javascript
// Exporting from openai.js:
export const getOpenAIAPIResponse = async (messages) => { ... };
export const getOpenAIStreamingResponse = async (messages, onChunk, onDone) => { ... };

// Importing in chat.js:
import { getOpenAIAPIResponse, getOpenAIStreamingResponse } from "../utils/openai.js";
```

```javascript
// Default export for an Express Router:
const router = express.Router();
// ... route definitions ...
export default router;

// Importing the router in server.js:
import chatRoutes from "./routes/chat.js";
app.use("/api", verifyToken, chatRoutes);
```

### Enabling ES Modules in Node.js

By default, Node.js uses CommonJS (`require`/`module.exports`). To use `import`/`export`, you add one line to `package.json`:

```json
{
  "type": "module"
}
```

Without this, Node.js would throw an error when it sees `import`.

### Why the `.js` Extension Is Required

In ES Modules in Node.js, you must include the file extension:

```javascript
import { getOpenAIEmbedding } from "../utils/openai.js"; // ✅ must have .js
import { getOpenAIEmbedding } from "../utils/openai";    // ❌ Error in Node.js
```

Browsers and bundlers like Vite can resolve extensions automatically, but Node.js (running ES Modules) cannot.

---

## 6. npm — Node Package Manager

### What npm Is

npm is the package manager for Node.js. It lets you:
- Install third-party libraries
- Manage dependencies
- Run scripts

### `package.json`

Every Node.js project has a `package.json` that describes the project and its dependencies:

```json
// Backend/package.json
{
  "name": "novaai-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^5.1.0",
    "mongoose": "^8.16.1",
    "jsonwebtoken": "^9.0.3",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "openai": "^5.5.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.10"
  }
}
```

**`dependencies`**: Libraries required to run the application in production.
**`devDependencies`**: Libraries only needed during development (like Nodemon — you wouldn't run that in production).

### Semantic Versioning

The `^` in front of version numbers means "compatible with this version":
```
"express": "^5.1.0"
```
This means: install Express 5.1.0 or any later **compatible** version. Compatible = same major version (5.x.x), any minor or patch.

- Major (5): Breaking changes — incompatible with older major versions
- Minor (1): New features — backwards compatible
- Patch (0): Bug fixes — always backwards compatible

### `node_modules`

When you run `npm install`, npm downloads all packages into `node_modules/`. This folder is in `.gitignore` because:
1. It can be hundreds of megabytes
2. Anyone who clones your repo can run `npm install` to regenerate it

### npm Scripts

The `scripts` section in `package.json` defines shortcuts:

```bash
npm run dev    # runs: nodemon server.js (auto-restarts on file change)
npm run start  # runs: node server.js (production)
```

### Nodemon — Auto-Restart on File Change

`nodemon` watches your files and automatically restarts the Node.js server whenever you save a change. Without it, you'd have to `Ctrl+C` and re-run `node server.js` every time you change a line of backend code.

```bash
# Instead of:
node server.js
# (change a file)
# Ctrl+C
node server.js  ← annoying

# With nodemon:
nodemon server.js
# (change a file)
# → Server automatically restarts ✓
```

---

## 7. Environment and process

### `process.env`

`process` is a global object in Node.js that provides information about the current process. `process.env` is an object containing all environment variables:

```javascript
// Access in any Node.js file:
const apiKey = process.env.OPENAI_API_KEY;
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRES_IN; // "7d"
```

### `dotenv` Package

The `dotenv` package loads values from a `.env` file into `process.env`:

```javascript
// At the very top of server.js:
import dotenv from "dotenv";
dotenv.config(); // loads .env into process.env

// Now anywhere in the backend:
process.env.OPENAI_API_KEY // contains the key from .env
```

The `.env` file lives at the root of the backend directory:
```
OPENAI_API_KEY=sk-proj-...
MONGODB_URI=mongodb+srv://...
JWT_SECRET=supersecretkey123
JWT_EXPIRES_IN=7d
```

---

## 8. How the NovaAI Backend Starts

Here is exactly what happens when you run `npm run dev` in the Backend directory:

```javascript
// server.js — the entry point

// 1. Load environment variables first
import dotenv from "dotenv";
dotenv.config();

// 2. Import dependencies
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// 3. Import route handlers
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import analyticsRoutes from "./routes/analytics.js";
import userMemoryRoutes from "./routes/userMemory.js";

// 4. Import middleware
import { verifyToken } from "./middleware/auth.js";

// 5. Create Express app
const app = express();

// 6. Register global middleware
app.use(cors());            // allows cross-origin requests from React
app.use(express.json());    // parse JSON request bodies into req.body

// 7. Register routes
app.use("/api/auth", authRoutes);                       // public
app.use("/api", verifyToken, chatRoutes);               // protected
app.use("/api", verifyToken, analyticsRoutes);          // protected
app.use("/api", verifyToken, userMemoryRoutes);         // protected

// 8. Connect to MongoDB, then start listening
const PORT = 8080;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.log("MongoDB connection error:", err));
```

The key design decision: **connect to MongoDB first, then start listening for requests**. If the database connection fails, the server won't start. This prevents serving requests when the database is unavailable.

---

## 9. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| Node.js | JavaScript runtime built on V8 engine | Runs the entire backend |
| Event Loop | Single-thread mechanism for handling concurrency | All async operations run through it |
| Non-blocking I/O | Starting operations without waiting | Every MongoDB query, every OpenAI call |
| Streams | Processing data in chunks | SSE streaming to browser, reading OpenAI response |
| `res.write()` | Sending a chunk without ending response | Each SSE token sent to browser |
| `res.flushHeaders()` | Send headers immediately | Opens the SSE connection |
| ES Modules | `import`/`export` syntax | All files in NovaAI use `import` |
| `"type": "module"` | Enables ES Modules in Node.js | In `package.json` |
| npm | Package manager | Install Express, Mongoose, jwt, etc. |
| `package.json` | Project manifest with dependencies | Lists all npm packages used |
| `node_modules` | Downloaded packages | Never committed to git |
| `process.env` | Access environment variables | API keys, MongoDB URI, JWT secret |
| `dotenv` | Load `.env` file into `process.env` | At the top of `server.js` |
| `nodemon` | Auto-restart on file change | `npm run dev` in development |

---

## 10. Interview Questions and Answers

---

**Q: What is Node.js and how is it different from JavaScript in the browser?**

A: Node.js is a JavaScript runtime built on Chrome's V8 engine that allows JavaScript to run outside the browser, typically on a server. Both use the same JavaScript language, but they have different built-in APIs. Browsers provide `document`, `window`, `fetch`, and DOM manipulation. Node.js provides `fs` (file system), `http`, `path`, and `process`. Node.js also allows importing third-party packages via npm. In NovaAI, I use Node.js to run the backend server that handles authentication, calls the OpenAI API, and reads/writes to MongoDB.

---

**Q: What is the event loop and why does it matter?**

A: The event loop is the mechanism that allows Node.js to handle many concurrent connections with a single thread. Instead of blocking and waiting for I/O operations (database queries, HTTP requests) to complete, Node.js starts them and moves on. When an operation completes, its callback is placed in the event queue, and the event loop picks it up when the call stack is empty. This is why Node.js scales well for I/O-heavy applications like APIs — a single Node.js process can handle thousands of concurrent streaming connections without running out of threads. In NovaAI, when I stream an AI response to one user, other users' requests are still handled simultaneously.

---

**Q: What is the difference between blocking and non-blocking code?**

A: Blocking code prevents the program from doing anything else while it waits for an operation to complete. For example, `fs.readFileSync()` freezes Node.js for as long as the file read takes. Non-blocking code starts an operation and immediately continues — when the operation is done, a callback or Promise resolves. All database and HTTP operations in NovaAI are non-blocking (`await Thread.findOne()`, `await authFetch()`). During the `await`, Node.js handles other events. Without non-blocking I/O, NovaAI's server would freeze for 3+ seconds while generating an AI response, unable to serve any other requests.

---

**Q: What is the difference between `dependencies` and `devDependencies` in package.json?**

A: `dependencies` are packages required to run the application — they're needed in production. `devDependencies` are only needed during development. In NovaAI, `express`, `mongoose`, `jsonwebtoken`, and `bcryptjs` are `dependencies` because the server needs them to run. `nodemon` is a `devDependency` — it auto-restarts the server on file changes, which is only useful during development. In production, you'd start the server with `node server.js` directly, and nodemon would never be invoked.

---

**Q: What are Node.js streams and how did you use them?**

A: Streams are objects that let you read or write data in chunks instead of all at once. This is critical for handling large data efficiently. In NovaAI's chat endpoint, I use streams to implement SSE: I open a persistent HTTP connection with `res.flushHeaders()`, then call `res.write()` for each token as it arrives from OpenAI, rather than buffering the entire response and sending it at once. This is what gives users the word-by-word appearance of the AI's response. On the other side, I read OpenAI's streaming response using `response.body.getReader()` — a Readable stream — and forward each chunk to the browser.
