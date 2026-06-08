# 01 — Web Development Overview

**Purpose:** Before you can understand NovaAI, you need to understand how the web works. This file explains the internet, HTTP, APIs, the client-server model, and the full-stack architecture — all from scratch. Every concept is connected back to NovaAI so you can see exactly where it lives in the project you built.

**Learning Value:** ⭐⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐
**Estimated Reading Time:** 50–60 minutes
**Prerequisites:** None

---

## Table of Contents

1. [What Happens When You Open a Website](#1-what-happens-when-you-open-a-website)
2. [The Client-Server Model](#2-the-client-server-model)
3. [HTTP — The Language of the Web](#3-http-the-language-of-the-web)
4. [HTTPS — The Secure Version](#4-https-the-secure-version)
5. [What is an API?](#5-what-is-an-api)
6. [The Three Layers: Frontend, Backend, Database](#6-the-three-layers-frontend-backend-database)
7. [The MERN Stack](#7-the-mern-stack)
8. [Ports and Localhost](#8-ports-and-localhost)
9. [Environment Variables](#9-environment-variables)
10. [How NovaAI Fits Into All of This](#10-how-novaai-fits-into-all-of-this)
11. [Summary](#11-summary)
12. [Interview Questions and Answers](#12-interview-questions-and-answers)

---

## 1. What Happens When You Open a Website

Let's start with something you do dozens of times a day — typing a URL into your browser and pressing Enter. It looks instant, but an enormous amount happens in the background. Understanding this sequence is the foundation of all web development.

### Step 1: You Type a URL

A URL (Uniform Resource Locator) like `https://www.google.com/search?q=hello` has several parts:

```
https://www.google.com/search?q=hello
│       │              │      │
│       │              │      └── Query parameter: q=hello
│       │              └───────── Path: /search
│       └──────────────────────── Domain name: google.com
└──────────────────────────────── Protocol: https
```

Your browser reads this URL and figures out where to go and what to ask for.

### Step 2: DNS Resolution — "What is Google's Address?"

Your browser knows `google.com` but doesn't know where that actually is on the internet. Computers communicate using **IP addresses** — numerical addresses like `142.250.80.46`. Domain names are just human-readable aliases.

To find the IP address, your browser asks a **DNS server** (Domain Name System). Think of DNS like a phone book — you look up "Google" and it gives you the number.

```
Your Browser                DNS Server
     │                           │
     │  "What is google.com?"    │
     │ ─────────────────────────>│
     │                           │
     │  "It is 142.250.80.46"    │
     │ <─────────────────────────│
     │                           │
```

This usually takes a few milliseconds. Your operating system also caches (saves) recent DNS results, so repeated visits are faster.

### Step 3: TCP Connection — "Establishing a Channel"

Now your browser knows the IP address. Before it can send any data, it needs to establish a **connection** — like picking up a telephone before you speak. This happens via TCP (Transmission Control Protocol) using a process called the **three-way handshake**:

```
Your Browser          Google's Server
     │                      │
     │  SYN ("Hello?")      │
     │ ────────────────────>│
     │                      │
     │  SYN-ACK ("Hello!")  │
     │ <────────────────────│
     │                      │
     │  ACK ("Got it!")     │
     │ ────────────────────>│
     │                      │
     │  [Connection Open]   │
```

SYN, SYN-ACK, and ACK are low-level signals. You don't need to memorize the names — just understand that a connection must be established before any data can flow.

### Step 4: HTTP Request — "What Are You Asking For?"

With the connection open, your browser sends an **HTTP request**. This is a structured text message that says: "Please give me the main page at `/`":

```
GET / HTTP/1.1
Host: www.google.com
Accept: text/html
User-Agent: Chrome/120.0
```

This is literally just text. HTTP is a text protocol. Every HTTP request has:
- A **method** (`GET` — asking for data)
- A **path** (`/` — the homepage)
- A **protocol version** (`HTTP/1.1`)
- **Headers** — extra metadata (what kind of response you accept, your browser name, etc.)

### Step 5: HTTP Response — "Here's What You Asked For"

Google's server receives your request, finds the homepage, and sends back a **response**:

```
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 45623

<!DOCTYPE html>
<html>
  <head>...</head>
  <body>...</body>
</html>
```

The response has:
- A **status code** (`200 OK` means success)
- **Headers** (type of content, how big it is)
- A **body** (the actual HTML of the page)

### Step 6: Browser Rendering — "Turning Code into a Page"

Your browser receives the HTML and starts rendering it — converting the code into what you see on screen. As it reads the HTML, it discovers it also needs CSS files (for styling) and JavaScript files (for interactivity). It makes additional HTTP requests to fetch those too.

```
Full journey: URL → DNS → TCP → HTTP Request → HTTP Response → Render
Total time: typically 100ms–2,000ms
```

### In NovaAI

When you open NovaAI in your browser, this exact process happens:
- Your browser fetches the React app files (HTML, JavaScript, CSS) from the Vite development server running at `http://localhost:5173`
- React takes over and renders the login page
- When you log in, React makes an HTTP request to `http://localhost:8080/api/auth/login`
- The Express server responds with a JWT token
- React stores the token and shows you the chat interface

---

## 2. The Client-Server Model

The most fundamental concept in web development is the **client-server model**. Almost everything in NovaAI is built on top of it.

### What is a Client?

A **client** is any device or program that makes requests. In NovaAI, the client is your browser running the React application. When you type a message and press send, the React app (running in your browser) sends a request to the server.

Clients are "dumb" in one specific sense: they ask for things, but they rely on the server to do the real work. The client doesn't know your password hash, doesn't run the AI, and doesn't read the database directly.

### What is a Server?

A **server** is a program that listens for requests and responds to them. In NovaAI, the server is the Express.js application running on Node.js. It:
- Receives messages from the browser
- Checks if you're logged in
- Calls the OpenAI API
- Reads and writes to MongoDB
- Sends back responses (usually JSON, sometimes a stream)

Servers run 24/7, waiting for clients to connect.

### The Request-Response Cycle

Every interaction in NovaAI follows this pattern:

```
CLIENT (Browser / React)          SERVER (Node.js / Express)
         │                                  │
         │  1. User does something          │
         │     (types message, clicks btn)  │
         │                                  │
         │  2. React sends HTTP Request ──> │
         │                                  │
         │                                  │  3. Server processes:
         │                                  │     - Validates JWT
         │                                  │     - Reads from MongoDB
         │                                  │     - Calls OpenAI
         │                                  │
         │  4. Server sends Response  <───  │
         │                                  │
         │  5. React updates the UI         │
         │                                  │
```

This cycle repeats for every action in the application.

### Why the Separation?

You might wonder: why not just do everything in the browser? The reasons are:
1. **Security**: Secret keys (OpenAI API key, MongoDB password) cannot be in the browser — anyone could read them. They must stay on the server.
2. **Database access**: The database cannot be directly accessible from the internet — only the server talks to it.
3. **Shared data**: Multiple users can share the same data because it all goes through one central server.
4. **Processing power**: Complex operations (AI calls, vector math) run on the server, not the user's laptop.

---

## 3. HTTP — The Language of the Web

HTTP (HyperText Transfer Protocol) is the language clients and servers use to communicate. Every interaction in NovaAI — logging in, sending a message, loading thread history — is an HTTP request and response.

### HTTP Methods

Methods tell the server what type of action you want to perform. Think of them like verbs:

| Method | What it means | Used in NovaAI for |
|--------|---------------|-------------------|
| `GET` | Retrieve data | Load thread list, load analytics, load user memory |
| `POST` | Send new data / trigger an action | Send a chat message, register, login |
| `DELETE` | Remove something | Delete a conversation thread |
| `PUT` | Replace something entirely | (not used in NovaAI) |
| `PATCH` | Partially update something | (not used in NovaAI) |

**Example from NovaAI:** When you send a chat message, the browser sends:
```
POST /api/chat HTTP/1.1
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{ "message": "Hello!", "threadId": "abc-123" }
```

When you delete a thread:
```
DELETE /api/thread/abc-123 HTTP/1.1
Authorization: Bearer eyJhbGci...
```

### HTTP Status Codes

The server's response always starts with a status code — a three-digit number that tells the client whether the request worked:

| Code | Meaning | When it happens in NovaAI |
|------|---------|--------------------------|
| `200 OK` | Success | Thread loaded, analytics fetched |
| `201 Created` | Something was created successfully | (register returns 200 in this project) |
| `400 Bad Request` | You sent invalid data | Missing email or password |
| `401 Unauthorized` | You're not logged in (or token is expired) | Accessing `/api/chat` without a valid JWT |
| `404 Not Found` | The resource doesn't exist | Deleting a thread that doesn't exist |
| `500 Internal Server Error` | The server crashed | An unexpected bug on the backend |

**In NovaAI's `authFetch` utility:** When the server returns `401`, the utility automatically logs the user out — because a 401 means the JWT token is invalid or expired. This is how the automatic logout feature works.

### HTTP Headers

Headers are key-value pairs that provide metadata about the request or response. They travel alongside the body but are not part of it.

**Common request headers in NovaAI:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

- `Authorization`: Sends the JWT token to prove identity. The server's `verifyToken` middleware reads this.
- `Content-Type: application/json`: Tells the server that the request body is JSON.

**Common response headers in NovaAI:**
```
Content-Type: application/json
Content-Type: text/event-stream    ← used for SSE streaming
Cache-Control: no-cache
```

For the streaming chat response, the server sets `Content-Type: text/event-stream`. This tells the browser: "keep this connection open, I'll keep sending you data."

### Request Body vs URL Parameters

There are different ways to send data to a server:

**URL Parameter** — embedded in the URL path:
```
GET /api/thread/abc-123-def
                 ^^^^^^^^^^^
                 This is the threadId, accessed as req.params.threadId
```

**Query Parameter** — appended after `?` in the URL:
```
GET /api/search?q=hello&limit=10
```
(Not used in NovaAI but common in many applications.)

**Request Body** — sent in the body of a POST/PUT request:
```javascript
// In ChatWindow.jsx
body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
```
The body carries the user's message. Accessed on the server as `req.body.message` and `req.body.threadId`.

---

## 4. HTTPS — The Secure Version

HTTPS is HTTP with an added security layer called **TLS** (Transport Layer Security). Without HTTPS:
- Anyone on the same Wi-Fi network as you can read your HTTP traffic
- This means they could steal your password when you log in
- Or read every message you send

With HTTPS:
- All data is **encrypted** before it leaves your browser
- Even if someone intercepts it, they see gibberish
- The server proves its identity with a **certificate**

In development (running on your laptop), NovaAI uses plain `http://localhost`. This is safe because `localhost` traffic never leaves your machine. In production (a real deployment), you would always use HTTPS.

---

## 5. What is an API?

API stands for **Application Programming Interface**. The word sounds complicated but the idea is simple:

> An API is a defined set of rules for how one program can talk to another.

Imagine a restaurant. You (the client) sit at a table. You cannot walk into the kitchen and cook your own food. Instead, you use the **menu** (the API) — a defined list of things you can order. You ask the waiter (the HTTP request) and the kitchen (the server) prepares it and sends it back.

### REST API

NovaAI uses a **REST API** (Representational State Transfer). REST is a style of designing APIs that uses standard HTTP methods (`GET`, `POST`, `DELETE`) and organizes everything around **resources** (things like threads, users, analytics).

In REST, a URL represents a resource:
- `/api/thread` → the collection of all threads
- `/api/thread/abc-123` → one specific thread
- `/api/analytics` → the analytics data
- `/api/user-memory` → the user's long-term memory

The HTTP method tells the server what to do with that resource:
```
GET    /api/thread           → Get all threads
GET    /api/thread/abc-123   → Get one thread
DELETE /api/thread/abc-123   → Delete one thread
POST   /api/chat             → Send a message (create a new AI response)
```

### JSON — The Universal Data Format

APIs almost always exchange data as **JSON** (JavaScript Object Notation). JSON is a text format that looks exactly like a JavaScript object:

```json
{
  "threadId": "abc-123",
  "title": "Planning my trip to Japan",
  "messages": [
    { "role": "user", "content": "I want to visit Japan" },
    { "role": "assistant", "content": "Great choice! Here's what to know..." }
  ]
}
```

**In NovaAI:**
- When the browser sends a message, it converts the data to a JSON string using `JSON.stringify()`
- When the server sends back thread data, it calls `res.json(data)` which automatically converts the object to JSON
- When the browser receives a response, it calls `response.json()` to convert it back to a JavaScript object

---

## 6. The Three Layers: Frontend, Backend, Database

Every modern web application has three distinct layers. NovaAI has all three, and understanding where each one lives is crucial.

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Browser                            │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │           FRONTEND (React)           │                   │
│  │                                      │                   │
│  │  • What the user sees and clicks     │                   │
│  │  • Renders chat messages             │                   │
│  │  • Manages local state               │                   │
│  │  • Calls the backend API             │                   │
│  └──────────────────────────────────────┘                   │
│                        │ HTTP Requests                       │
└────────────────────────┼────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Your Server (Port 8080)                   │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │         BACKEND (Node + Express)     │                   │
│  │                                      │                   │
│  │  • Receives HTTP requests            │                   │
│  │  • Validates JWTs                    │                   │
│  │  • Calls OpenAI API                  │                   │
│  │  • Calls MongoDB                     │                   │
│  │  • Sends responses                   │                   │
│  └──────────────────────────────────────┘                   │
│                        │                                    │
└────────────────────────┼────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  MongoDB Atlas (Cloud)                      │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │           DATABASE (MongoDB)         │                   │
│  │                                      │                   │
│  │  • Users collection                  │                   │
│  │  • Threads collection                │                   │
│  │  • Analytics collection              │                   │
│  │  • UserMemory collection             │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Frontend

The frontend is everything that runs in the **browser**. In NovaAI, this is the React application located in the `Frontend/` folder.

The frontend:
- Shows the login screen, chat interface, and sidebar
- Captures user input (messages, clicks)
- Makes HTTP requests to the backend
- Displays the AI's streaming response
- Never directly reads from the database

**The browser cannot keep secrets.** If you put an API key in your React code, anyone can open the browser's developer tools and read it. This is why all secret keys live on the server.

### Layer 2: Backend

The backend is a program running on a **server** — a computer that is always on and listening for requests. In NovaAI, this is the Node.js + Express application in the `Backend/` folder, running on port 8080.

The backend:
- Verifies JWTs (authentication)
- Reads and writes to MongoDB
- Calls the OpenAI API (using a secret key the browser never sees)
- Computes RAG similarity scores
- Streams the AI response back to the browser

### Layer 3: Database

The database permanently stores all data. In NovaAI, this is **MongoDB Atlas** — a cloud-hosted MongoDB service. The database never talks to the browser directly. All communication goes through the backend.

The database stores:
- User accounts (email and hashed password)
- All conversation threads and messages
- Extracted AI profiles and summaries
- Analytics data (tokens, cost, latency)
- Long-term user memory (interests, goals, projects)

---

## 7. The MERN Stack

NovaAI is built on the **MERN stack**. This is a specific combination of four technologies that work very well together:

```
M — MongoDB      (Database)
E — Express.js   (Backend web framework)
R — React        (Frontend UI library)
N — Node.js      (JavaScript runtime for the backend)
```

The key advantage of MERN: **everything is JavaScript**. You write JavaScript in the browser (React), JavaScript on the server (Node.js + Express), and JavaScript-like queries for the database (Mongoose). You don't need to learn multiple languages.

### Why Each Technology Was Chosen

**MongoDB** instead of a SQL database like PostgreSQL:
- Messages need a flexible structure (some have embeddings, some don't)
- Storing an array of messages inside a conversation document is natural in MongoDB
- Schema can evolve as the application adds features

**Express.js** instead of writing raw Node.js:
- Raw Node.js HTTP handling is verbose and repetitive
- Express adds routing, middleware, and request parsing in a clean way
- It's the most widely used Node.js web framework — every employer knows it

**React** instead of vanilla JavaScript or another framework:
- Manages complex UI state (current thread, streaming reply, all threads) cleanly
- The Context API makes sharing state across components easy
- Component-based architecture makes the code organized and reusable

**Node.js** instead of Python or Java for the backend:
- Same language as the frontend — one language across the entire stack
- Non-blocking I/O is ideal for handling streaming responses from OpenAI
- Massive npm ecosystem for JWT, bcrypt, Mongoose, etc.

---

## 8. Ports and Localhost

### What is localhost?

`localhost` is a special hostname that always means "this computer." When you run NovaAI on your laptop and open `http://localhost:5173`, you are telling your browser to connect to a server running on **your own machine**.

The number after the colon (`:5173`) is the **port number**.

### What is a Port?

A port is like an apartment number in a building. The building's address (your computer's IP, which is `127.0.0.1` for localhost) tells you which building. The port tells you which apartment.

Your computer has 65,535 ports. Different programs listen on different ports:

```
Port 80    → Standard HTTP
Port 443   → Standard HTTPS
Port 5173  → Vite development server (NovaAI frontend)
Port 8080  → Express backend (NovaAI backend)
Port 27017 → MongoDB default port
```

### In NovaAI

When you run the project locally:
- The **React app** runs at `http://localhost:5173` (Vite's default)
- The **Express server** runs at `http://localhost:8080`
- The **database** is on MongoDB Atlas in the cloud (not localhost)

When the browser's React app calls the backend, it sends requests to `http://localhost:8080/api/...`. This is hardcoded in the frontend files — for example, in `authFetch.js` and throughout the component files.

### CORS — Why Port-Crossing Needs Permission

Here's a problem: the React app runs on port 5173. The backend runs on port 8080. By default, browsers block requests from one "origin" (domain+port) to another. This is the **Same-Origin Policy** — a security rule.

A request from `localhost:5173` to `localhost:8080` crosses origins, so the browser would block it.

**CORS** (Cross-Origin Resource Sharing) is how the server tells the browser: "It's okay, I allow requests from this origin."

In `Backend/server.js`:
```javascript
app.use(cors());
```

This tells Express to add special response headers that say: "I accept requests from any origin." Without this one line, the React frontend could not talk to the Express backend at all.

In production, you would restrict CORS to specific origins instead of allowing everyone.

---

## 9. Environment Variables

### The Problem

Your backend needs secrets:
- The OpenAI API key (costs money if someone steals it)
- The MongoDB connection string (contains your database password)
- The JWT secret (used to sign authentication tokens — if stolen, anyone can fake being any user)

You cannot put these directly in your code:

```javascript
// NEVER DO THIS
const OPENAI_KEY = "sk-proj-abc123..."; // ← anyone who reads your code gets this
```

If you ever push code with secrets to GitHub, you must immediately rotate (regenerate) those keys, because bots scan public repositories for exposed credentials within seconds.

### The Solution: Environment Variables

**Environment variables** are values that live outside your code — in your operating system's environment or in a `.env` file that is never committed to Git.

In NovaAI's `Backend/.env` file (which is in `.gitignore`):
```
OPENAI_API_KEY=sk-proj-...
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/...
JWT_SECRET=9e1fd4a5c2b3...
JWT_EXPIRES_IN=7d
```

In the backend code, you access these values through `process.env`:
```javascript
const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
});
```

The `dotenv` npm package loads the `.env` file into `process.env` when the server starts:
```javascript
// At the top of server.js
import dotenv from "dotenv";
dotenv.config();
```

**The `.gitignore` file** lists files that Git should never track. The `.env` file is always in `.gitignore`. When you clone the repository, the `.env` file is not included — each developer or server creates their own.

---

## 10. How NovaAI Fits Into All of This

Now that you understand the concepts, here is exactly how they all fit together in NovaAI. Let's trace one complete user action: **sending a chat message**.

```
STEP 1: User types "Explain quantum computing" and presses Enter
        ↓ (Browser / React frontend)

STEP 2: React captures the input from the textarea
        Sets: loading=true, newChat=false
        Adds user message to prevChats (optimistic UI)
        Calls authFetch with POST + JWT token
        ↓ (HTTP Request leaves browser)

STEP 3: HTTP POST to http://localhost:8080/api/chat
        Headers: { Authorization: "Bearer eyJ...", Content-Type: "application/json" }
        Body:    { "message": "Explain quantum computing", "threadId": "abc-123" }
        ↓ (Express backend receives it)

STEP 4: verifyToken middleware runs first
        Reads Authorization header
        Verifies JWT signature and expiry
        Attaches req.user = { userId: "...", email: "..." }
        Calls next() → proceeds to route handler
        ↓

STEP 5: Chat route handler runs:
        a) Embeds the message (OpenAI API call → 1,536 numbers)
        b) Finds or creates Thread document in MongoDB
        c) Fetches UserMemory document for personalization
        d) Runs RAG: scores past messages by cosine similarity
        e) Builds 4-layer system prompt
        f) Generates title if this is the first message
        ↓

STEP 6: res.flushHeaders() — opens the SSE connection
        Content-Type: text/event-stream sent to browser
        ↓

STEP 7: Streams OpenAI tokens back to browser
        Each token: res.write('data: {"token":"quan"}\n\n')
        ↓ (Browser receives each chunk)

STEP 8: React reads each chunk
        Builds assembled string token by token
        Calls setStreamingReply(assembled) → React re-renders → word appears
        ↓

STEP 9: OpenAI finishes generating
        Backend saves reply to MongoDB
        Saves Analytics document
        Sends { done: true, title: "Quantum Computing Explained" }
        res.end() — closes HTTP connection
        ↓

STEP 10: React receives done event
         Moves assembled reply from streamingReply to prevChats
         Updates thread title in sidebar
         Starts 3-second timer to fetch updated thread profile
         ↓

STEP 11: Background tasks run (non-blocking, after res.end()):
         - extractProfileData() — updates thread-level AI profile
         - maybeSummarize() — compresses old messages if threshold met
         - extractUserMemory() — updates cross-conversation memory
```

Every concept in this file appears in this trace:
- **DNS, TCP, HTTP** → Step 3
- **Client-server model** → Steps 1–11
- **HTTP method (POST)** → Step 3
- **HTTP headers (Authorization)** → Step 3–4
- **Status codes** → Any step can return 401, 404, 500
- **API (REST)** → `/api/chat` is a REST endpoint
- **JSON** → Body is JSON, responses are JSON (or SSE stream)
- **Frontend layer** → Steps 1–2, 8, 10
- **Backend layer** → Steps 4–9
- **Database layer** → Steps 5, 9, 11
- **Ports** → `localhost:8080`
- **CORS** → Required for the browser to reach port 8080
- **Environment variables** → OpenAI key and MongoDB URI used in Step 5

---

## 11. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| DNS | Translates domain names to IP addresses | Happens when you access any URL |
| TCP | Establishes a connection before data flows | Underneath every HTTP request |
| HTTP | Text protocol for request-response communication | All API calls |
| HTTPS | Encrypted HTTP | Used in production; localhost uses HTTP |
| Status Codes | Numbers that indicate success/failure | 200 (ok), 401 (not logged in), 404 (not found) |
| Request Headers | Metadata sent with requests | Authorization: Bearer JWT |
| Request Body | Data payload in POST requests | `{ message, threadId }` in `/api/chat` |
| API | Defined interface for program-to-program communication | All 8 endpoints in NovaAI |
| REST | API style using HTTP methods + resources | All NovaAI routes |
| JSON | Text format for exchanging data | All request/response bodies |
| Frontend | Code running in the browser | React app in `Frontend/` |
| Backend | Server-side code processing requests | Node/Express in `Backend/` |
| Database | Persistent storage | MongoDB Atlas |
| MERN | MongoDB + Express + React + Node | This entire project |
| localhost | "This machine" address | Development URLs |
| Port | Specific channel on a machine | 5173 (React), 8080 (Express) |
| CORS | Permission for cross-origin requests | `app.use(cors())` in server.js |
| Environment Variables | Secrets stored outside code | `.env` file with API keys |

---

## 12. Interview Questions and Answers

---

**Q: What is the difference between HTTP and HTTPS?**

A: HTTP (HyperText Transfer Protocol) is a text-based protocol for sending requests and responses between clients and servers. HTTPS adds a TLS encryption layer on top. With HTTPS, all data is encrypted in transit — even if someone intercepts the packets, they cannot read the content. In NovaAI, we use HTTP locally during development (localhost traffic never leaves the machine) and would use HTTPS in any real deployment to protect user messages and JWT tokens.

---

**Q: What is a REST API?**

A: REST (Representational State Transfer) is a design style for APIs that uses standard HTTP methods to perform operations on resources. A resource is a "thing" in your application — in NovaAI, threads and users are resources. GET retrieves them, POST creates/triggers actions, DELETE removes them. NovaAI's backend exposes eight REST endpoints — for example, `GET /api/thread` returns all threads and `DELETE /api/thread/:threadId` removes one.

---

**Q: What is CORS and why does it exist?**

A: CORS stands for Cross-Origin Resource Sharing. Browsers have a Same-Origin Policy that blocks requests from one origin (domain + port) to a different origin. This protects users from malicious websites making requests to their bank on their behalf. In NovaAI, the React frontend runs on `localhost:5173` and the backend on `localhost:8080` — different ports means different origins. The backend adds CORS headers to its responses to tell the browser it accepts cross-origin requests. Without `app.use(cors())` in `server.js`, every API call from the frontend would be blocked by the browser.

---

**Q: What is the difference between the frontend and the backend?**

A: The frontend is code that runs in the user's browser — it handles what the user sees and interacts with. In NovaAI, this is the React application. The backend is code that runs on a server — it handles business logic, database access, and secrets. In NovaAI, this is the Node.js + Express server. The key reason for the separation is security: secrets like the OpenAI API key and MongoDB password live only on the server and are never exposed to the browser.

---

**Q: Why do you use environment variables instead of hardcoding secrets?**

A: If you put an API key directly in your code and commit it to GitHub, anyone who can read the repository can steal it. Bots actively scan GitHub for exposed credentials. Environment variables live outside the codebase in a `.env` file that is never committed (it's in `.gitignore`). The code accesses them through `process.env.VARIABLE_NAME`. This way, the same code can be deployed in different environments (development, staging, production) each with their own separate credentials.

---

**Q: What happens when a server returns a 401 status code?**

A: A 401 status code means "Unauthorized" — the request lacks valid authentication credentials. In NovaAI, this happens when someone sends a request to a protected route without a JWT token, or with an expired or tampered one. The `verifyToken` middleware returns `res.status(401).json({ message: "Unauthorized" })` in those cases. On the frontend, the `authFetch` utility watches for 401 responses and calls the logout handler, which removes the token from localStorage and redirects to the login page. The user is automatically signed out if their token expires.

---

**Q: What is JSON and why is it used?**

A: JSON (JavaScript Object Notation) is a text format for representing structured data. It looks like a JavaScript object: `{ "key": "value", "array": [1, 2, 3] }`. It's used as the standard data exchange format for web APIs because it is human-readable, easy to parse in any programming language, and maps directly to JavaScript objects (since JavaScript invented it). In NovaAI, every API request body and response body is JSON — thread data, user data, analytics, errors — all represented as JSON.

---

**Q: What is the client-server model?**

A: In the client-server model, a client (usually a browser) makes requests, and a server responds to them. The client is responsible for the user interface and initiating actions. The server is responsible for processing logic, database access, and maintaining secrets. They communicate over HTTP. In NovaAI, the React app is the client and the Express server is the server. The client never directly touches the database — all data access goes through the server, which enforces authentication and authorization on every request.

---

**Q: If you were explaining this project to a non-technical person, what would you say?**

A: "I built an AI assistant similar to ChatGPT. When you type a message, it gets sent to my server, which passes it to OpenAI's AI and streams the response back to you word by word — so you see the answer appear in real time instead of waiting. What makes it special is that it remembers things about you — your interests, goals, and ongoing projects — across different conversations, not just within one chat. It also gets smarter the longer you use it by finding relevant things you've discussed before and automatically including that context in each answer."
