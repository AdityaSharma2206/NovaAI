# 02 — JavaScript Fundamentals

**Purpose:** NovaAI is written entirely in JavaScript — the React frontend, the Node.js backend, and even the database queries via Mongoose. This file covers every JavaScript concept that actually appears in this codebase. Every section shows both what the concept is and exactly where it appears in NovaAI's code.

**Learning Value:** ⭐⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐⭐
**Estimated Reading Time:** 70–90 minutes
**Prerequisites:** 01-web-development-overview.md

---

## Table of Contents

1. [Variables: const, let, var](#1-variables-const-let-var)
2. [Data Types](#2-data-types)
3. [Functions and Arrow Functions](#3-functions-and-arrow-functions)
4. [Arrays and Array Methods](#4-arrays-and-array-methods)
5. [Objects and Destructuring](#5-objects-and-destructuring)
6. [The Spread Operator](#6-the-spread-operator)
7. [Optional Chaining and Nullish Coalescing](#7-optional-chaining-and-nullish-coalescing)
8. [Template Literals](#8-template-literals)
9. [Asynchronous JavaScript — The Most Important Topic](#9-asynchronous-javascript)
10. [The Fetch API and Reading Streams](#10-the-fetch-api-and-reading-streams)
11. [Modules: import and export](#11-modules-import-and-export)
12. [JSON](#12-json)
13. [Error Handling](#13-error-handling)
14. [Closures and Scope](#14-closures-and-scope)
15. [The Set Data Structure](#15-the-set-data-structure)
16. [Summary](#16-summary)
17. [Interview Questions and Answers](#17-interview-questions-and-answers)

---

## 1. Variables: const, let, var

JavaScript has three ways to declare a variable. You will see `const` and `let` throughout NovaAI. You will almost never see `var` in modern code.

### `const` — Constant Reference

Use `const` when the variable will not be reassigned.

```javascript
const SUMMARY_THRESHOLD = 14;
const RECENT_WINDOW = 6;
const router = express.Router();
```

"Constant" does **not** mean the value is frozen forever — it means the variable cannot be **reassigned** to point at something else.

```javascript
const user = { name: "Aditya" };
user.name = "Alex";   // ✅ This is fine — modifying the object
user = { name: "Bob" }; // ❌ Error — trying to reassign the variable
```

In NovaAI, almost every variable is `const` because we rarely need to reassign — we update state through React's setter functions instead.

### `let` — Reassignable Variable

Use `let` when you need to reassign the variable:

```javascript
// In openai.js streaming function
let buffer = "";
let assembled = "";

// buffer and assembled grow as tokens arrive:
buffer += decoder.decode(value, { stream: true });
assembled += parsed.token;
```

### `var` — The Old Way (Avoid)

`var` exists for historical reasons. It has confusing scoping rules (`var` is function-scoped, not block-scoped). Modern JavaScript uses `const` and `let` exclusively.

**The rule of thumb:** Use `const` by default. Use `let` only when you know you'll reassign. Never use `var`.

---

## 2. Data Types

JavaScript has several built-in data types. Understanding them is essential for reading NovaAI's code.

### Primitive Types

```javascript
// String — text
const email = "aditya@example.com";
const message = "Hello, how are you?";

// Number — integers and decimals
const THRESHOLD = 14;
const cost = 0.0005;
const ttft = 749;

// Boolean — true or false
const ragUsed = true;
const isStreaming = false;

// null — intentional absence of value
const threadProfile = null; // before any thread is loaded

// undefined — variable declared but not assigned
let streamingReply; // value is undefined until set
```

### Arrays — Ordered Lists

Arrays are one of the most used data structures in NovaAI:

```javascript
// Array of strings
const interests = ["programming", "travel", "fitness"];

// Array of objects
const messages = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there!" }
];

// Array of numbers (embedding vector)
const embedding = [0.021, -0.054, 0.178, /* 1533 more numbers */];

// Access by index (starts at 0)
messages[0]         // { role: "user", content: "Hello" }
interests[1]        // "travel"
interests.length    // 3
```

### Objects — Key-Value Pairs

Objects are everywhere in NovaAI. Every user, thread, message, and analytics record is an object:

```javascript
// A user object
const user = {
  userId: "507f1f77bcf86cd799439011",
  email: "aditya@example.com"
};

// A message object (from Thread schema)
const message = {
  role: "user",
  content: "What is RAG?",
  embedding: [0.012, -0.045, ...],
  timestamp: new Date()
};

// Accessing properties
user.email;          // "aditya@example.com"
user["email"];       // same thing, bracket notation
message.role;        // "user"
```

---

## 3. Functions and Arrow Functions

Functions are blocks of reusable code. NovaAI uses two styles.

### Regular Function Declaration

```javascript
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

This is the cosine similarity function from `chat.js`. It takes two vectors (arrays of numbers), computes a similarity score, and returns it.

### Arrow Functions

Arrow functions are the modern, shorter syntax. NovaAI uses them almost exclusively:

```javascript
// Regular function
function double(x) {
  return x * 2;
}

// Same thing as an arrow function
const double = (x) => x * 2;

// Arrow function with a body (multiple statements)
const getReply = async () => {
  if (!prompt.trim()) return;
  setLoading(true);
  // ...
};
```

Arrow functions and regular functions behave identically for most purposes. The two meaningful differences:
1. Arrow functions have no `this` binding (relevant in classes, not much in React hooks)
2. Arrow functions are always anonymous expressions — they cannot be "hoisted" (called before they appear in code)

### Parameters and Return Values

```javascript
// Function with multiple parameters
const generateProfileSummary = (memory) => {
  const parts = [];
  if (memory.interests.length) {
    parts.push(`Interested in: ${memory.interests.slice(0, 3).join(", ")}`);
  }
  return parts.join(". ");
};

// Called with an argument
const summary = generateProfileSummary(userMemoryDocument);
```

### Higher-Order Functions

A function that takes another function as an argument, or returns a function. This is how JavaScript's array methods work:

```javascript
// .map() takes a function — applies it to each item, returns new array
const titles = allThreads.map(thread => thread.title);
// titles = ["Planning Japan trip", "Quantum Computing", ...]

// .filter() takes a function — keeps items where function returns true
const recentThreads = allThreads.filter(t => t.updatedAt > lastWeek);
```

---

## 4. Arrays and Array Methods

Array methods are used constantly throughout NovaAI, especially for managing thread lists and message history.

### `.map()` — Transform Every Item

Creates a **new array** by applying a function to every item:

```javascript
// In getAllThreads() in Sidebar.jsx:
const threads = res.map(thread => ({
  threadId: thread.threadId,
  title: thread.title
}));
// Takes the raw server response and picks only the fields we need
```

```javascript
// In ChatWindow.jsx, when updating thread title on parsed.done:
setAllThreads(prev => prev.map(t =>
  t.threadId === currThreadId
    ? { ...t, title: parsed.title || currentPrompt }  // update this one
    : t                                                // keep others unchanged
));
```

**Key fact:** `.map()` never modifies the original array — it returns a brand new one. This is crucial in React, where you must not mutate state directly.

### `.filter()` — Keep Only Matching Items

Creates a new array with only the items where the function returns `true`:

```javascript
// In deleteThread() in Sidebar.jsx:
setAllThreads(prev => prev.filter(thread => thread.threadId !== threadId));
// Keeps all threads EXCEPT the deleted one
```

```javascript
// In RAG pipeline in chat.js:
const messagesWithEmbeddings = thread.messages.filter(msg => msg.embedding?.length > 0);
// Only score messages that have an embedding vector
```

### `.find()` — Get the First Match

Returns the first item where the function returns `true` (not an array — just the item):

```javascript
// Hypothetical: finding a specific thread
const thread = allThreads.find(t => t.threadId === currThreadId);
```

### `.some()` — Does Any Item Match?

Returns `true` if at least one item satisfies the condition:

```javascript
// Checking if UserMemory has any data worth injecting
const hasMemory = userMemory.interests?.length ||
                  userMemory.goals?.length ||
                  userMemory.ongoingProjects?.length;
```

### `.slice()` — Take a Portion

Returns a portion of the array without modifying it:

```javascript
// In system prompt construction:
userMemory.interests.slice(0, 5).join(", ")
// Takes up to 5 interests to avoid overwhelming the prompt

userMemory.goals.slice(0, 3).join(", ")
// Takes up to 3 goals
```

### `.join()` — Array to String

```javascript
["React", "Node.js", "MongoDB"].join(", ")
// "React, Node.js, MongoDB"
```

### `.push()` — Add to the End (Mutates)

```javascript
const parts = [];
parts.push("Interested in: programming, travel");
parts.push("Goals: learn Japanese, build a startup");
// parts = ["Interested in: programming, travel", "Goals: learn Japanese, build a startup"]
```

Note: `.push()` **modifies** the array. In React state, you never use `.push()` directly on state arrays — use the spread operator instead.

### `.sort()` — Reorder

```javascript
// In RAG pipeline: sort by similarity score (highest first)
const sorted = scored.sort((a, b) => b.score - a.score);
```

---

## 5. Objects and Destructuring

### Object Destructuring

Instead of writing `object.property` over and over, you can extract values in one line:

```javascript
// Without destructuring:
const allThreads = context.allThreads;
const setAllThreads = context.setAllThreads;
const currThreadId = context.currThreadId;

// With destructuring (what NovaAI uses everywhere):
const {
  allThreads, setAllThreads, currThreadId,
  newChat, setNewChat, prompt, setPrompt
} = useContext(MyContext);
```

```javascript
// Destructuring function parameters:
const deleteThread = async (threadId) => {
  // threadId comes in as a single value — no destructuring needed
};

// Destructuring an object parameter:
const formatUser = ({ email, userId }) => {
  return `User ${userId}: ${email}`;
};
```

### Array Destructuring

```javascript
// useState returns [currentValue, setterFunction]
const [loading, setLoading] = useState(false);
const [pendingDelete, setPendingDelete] = useState(null);

// Equivalent to:
const loadingArray = useState(false);
const loading = loadingArray[0];
const setLoading = loadingArray[1];
```

### Shorthand Property Names

When a variable name matches the key you want in an object:

```javascript
const threadId = "abc-123";
const title = "My conversation";

// Longhand:
const thread = { threadId: threadId, title: title };

// Shorthand:
const thread = { threadId, title };   // same thing
```

Used in NovaAI when constructing objects for MongoDB saves.

---

## 6. The Spread Operator

The spread operator (`...`) is one of the most-used tools in NovaAI, especially in React state management.

### Spreading Arrays

Creates a new array that includes all items from another:

```javascript
const existing = ["planning", "fitness"];
const new_interests = ["programming", "travel"];

const merged = [...existing, ...new_interests];
// ["planning", "fitness", "programming", "travel"]
```

Used in NovaAI for adding new threads to the sidebar:
```javascript
// ChatWindow.jsx — adding a new thread at the top of the list
setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
// New thread first, then all the existing ones
```

And for adding new messages:
```javascript
// Adding a user message to prevChats
setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);
// All existing messages, plus the new one at the end
```

### Spreading Objects

Creates a new object that includes all properties from another:

```javascript
const original = { threadId: "abc", title: "My Chat" };
const updated = { ...original, title: "New Title" };
// { threadId: "abc", title: "New Title" }
// — title was overwritten, threadId was preserved
```

Used in NovaAI when updating a thread's title:
```javascript
setAllThreads(prev => prev.map(t =>
  t.threadId === currThreadId
    ? { ...t, title: parsed.title }  // copy all fields, override title
    : t
));
```

### Why Spread Instead of Mutating?

React requires you to never directly modify state. Instead, you create a new value.

```javascript
// ❌ WRONG — mutating state directly (React won't detect the change)
prevChats.push({ role: "user", content: "Hello" });
setPrevChats(prevChats);

// ✅ CORRECT — creating a new array
setPrevChats(prev => [...prev, { role: "user", content: "Hello" }]);
```

---

## 7. Optional Chaining and Nullish Coalescing

### Optional Chaining (`?.`)

Safely access nested properties that might not exist:

```javascript
// Without optional chaining — crashes if threadProfile is null:
const facts = threadProfile.userFacts;  // ❌ TypeError if threadProfile is null

// With optional chaining — returns undefined instead of crashing:
const facts = threadProfile?.userFacts;  // ✅ safely returns undefined

// Chain multiple levels:
const firstFact = threadProfile?.userFacts?.[0];
```

Used extensively in NovaAI because thread profiles and user memories start as `null` or empty:

```javascript
// In Chat.jsx (rendering profile data):
{threadProfile?.userFacts?.length > 0 ? (
  threadProfile.userFacts.map(...)
) : (
  <span>No facts yet</span>
)}
```

```javascript
// In the system prompt construction:
if (userMemory.interests?.length) {
  // only add if interests array exists and is non-empty
}
```

### Nullish Coalescing (`??`)

Returns the right side if the left side is `null` or `undefined`:

```javascript
// If parsed.title is null/undefined, use currentPrompt instead:
const title = parsed.title ?? currentPrompt;

// Equivalent to:
const title = parsed.title !== null && parsed.title !== undefined
  ? parsed.title
  : currentPrompt;
```

**Difference from `||`:** The `||` operator also triggers on `0`, `""`, and `false`. The `??` operator only triggers on `null` and `undefined`:

```javascript
0 || "default"    // "default"  — 0 is falsy
0 ?? "default"    // 0          — 0 is not null/undefined
```

---

## 8. Template Literals

Template literals use backticks (`` ` ``) instead of quotes and allow embedding expressions with `${}`:

```javascript
// String concatenation (old way):
const msg = "User " + userId + " has " + count + " messages";

// Template literal (modern way):
const msg = `User ${userId} has ${count} messages`;
```

Used throughout NovaAI, especially in building the system prompt:

```javascript
// In chat.js — building Layer 1 of the system prompt:
dynamicSystemPrompt += `\n\nLong-term profile of this user:\n`;
dynamicSystemPrompt += `- Interests: ${userMemory.interests.slice(0, 5).join(", ")}\n`;
dynamicSystemPrompt += `- Goals: ${userMemory.goals.slice(0, 3).join(", ")}\n`;
```

```javascript
// In Sidebar.jsx — building the auth fetch URL:
const response = await authFetch(`http://localhost:8080/api/thread/${newThreadId}`);
//                                                                  ^^^^^^^^^^^^^^^
//                                                                  Variable embedded in URL
```

Template literals also support **multi-line strings**:
```javascript
const prompt = `You are a helpful assistant.
Please be concise and clear.
Always respond in plain text.`;
```

---

## 9. Asynchronous JavaScript — The Most Important Topic

This is the single most important concept for understanding NovaAI's backend code. If you understand async/await, the entire chat handler in `chat.js` becomes readable.

### Why Async Exists

JavaScript runs on a single thread. This means it can only do one thing at a time. If it had to wait for operations to complete before moving on, the entire program would freeze:

```
Problem without async:
[Start]
Wait 2 seconds for MongoDB...  ← Everything frozen for 2 seconds
Get response
Wait 1 second for OpenAI...    ← Everything frozen for 1 second
Get response
[Done] — total: 3 seconds, blocked the whole time
```

The solution: **non-blocking** operations. JavaScript starts an operation (like a network request) and then moves on to other work. When the operation completes, JavaScript comes back to handle the result.

### Callbacks — The Old Way

The original solution was **callbacks** — functions you pass to be called when an operation completes:

```javascript
// Reading a file with a callback (old Node.js style)
fs.readFile("data.txt", function(error, data) {
  if (error) {
    console.log("Error:", error);
    return;
  }
  console.log("File contents:", data);
});
console.log("This runs BEFORE the file is read");
```

Callbacks get messy fast — "callback hell":
```javascript
fetchUser(userId, function(user) {
  fetchThreads(user.id, function(threads) {
    fetchMessages(threads[0].id, function(messages) {
      // Three levels deep and it's already hard to read
    });
  });
});
```

### Promises — The Middle Step

Promises represent an eventual result. They have three states: **pending**, **fulfilled**, or **rejected**:

```javascript
const promise = fetch("http://localhost:8080/api/thread");
// promise is pending...

promise
  .then(response => response.json())    // runs when fetch succeeds
  .then(data => console.log(data))      // runs when .json() succeeds
  .catch(error => console.log(error));  // runs if any step fails
```

In NovaAI, the background task chain uses `.then()`:
```javascript
// In chat.js — after the response stream closes:
extractProfileData(thread)
  .then(() => maybeSummarize(thread))
  .then(() => extractUserMemory(thread, req.user.userId))
  .catch(err => console.log("Background task error:", err));
```

This chains three async operations sequentially (each waits for the previous to finish), which prevents the Mongoose ParallelSaveError.

### async/await — The Modern Way

`async/await` is syntax sugar on top of Promises. It makes async code look synchronous and is the primary style used in NovaAI:

```javascript
// Without async/await (using .then):
Thread.findOne({ threadId })
  .then(thread => {
    return thread.save();
  })
  .then(() => {
    console.log("Saved");
  })
  .catch(err => console.log(err));

// With async/await (what NovaAI uses):
const thread = await Thread.findOne({ threadId });
await thread.save();
console.log("Saved");
```

The `await` keyword pauses execution of the current function until the Promise resolves, then gives you the resolved value. It looks like synchronous code but doesn't block other operations.

The function containing `await` must be marked `async`:

```javascript
// ✅ Valid — async function can use await
const getReply = async () => {
  const response = await authFetch("http://localhost:8080/api/chat", options);
  const reader = response.body.getReader();
  // ...
};

// ❌ Invalid — cannot use await outside async function
const response = await fetch("...");  // SyntaxError
```

### try/catch with async/await

```javascript
const deleteThread = async (threadId) => {
  try {
    const response = await authFetch(`http://localhost:8080/api/thread/${threadId}`, {
      method: "DELETE"
    });
    if (!response.ok) return;
    setAllThreads(prev => prev.filter(t => t.threadId !== threadId));
  } catch (err) {
    console.log(err);
    // Network failure would end up here
  }
};
```

If an `await`ed operation throws (rejects), execution jumps to the `catch` block. This is exactly like synchronous try/catch.

### Promise.all() — Parallel Execution

When you have multiple independent async operations that don't depend on each other, you can run them in **parallel** using `Promise.all()`:

```javascript
// In analytics.js — running two DB operations at the same time:
const [agg, totalConversations] = await Promise.all([
  Analytics.aggregate([...]),          // aggregation query
  Thread.countDocuments({ userId })    // count query
]);
// Both run simultaneously — total time = time of the slower one
// Instead of: time of agg + time of count
```

`Promise.all()` takes an array of Promises and returns a single Promise that resolves when **all** of them resolve. The result is an array of results in the same order.

---

## 10. The Fetch API and Reading Streams

### Basic Fetch

```javascript
// GET request
const response = await fetch("http://localhost:8080/api/thread");
const data = await response.json();
```

### POST with a body

```javascript
const response = await fetch("http://localhost:8080/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({ message: "Hello", threadId: "abc-123" })
});
```

### The `authFetch` Wrapper in NovaAI

Every API call in NovaAI uses `authFetch` instead of raw `fetch`. It automatically adds the JWT token:

```javascript
// Frontend/src/utils/authFetch.js
const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  if (response.status === 401) {
    localStorage.removeItem("token");
    if (unauthorizedHandler) unauthorizedHandler(); // triggers logout
  }
  return response;
};
```

### Reading a Streaming Response

For the chat endpoint, the response is not a single JSON object — it's a stream of chunks. This requires a different reading approach:

```javascript
const response = await authFetch("http://localhost:8080/api/chat", options);

const reader = response.body.getReader();  // get a stream reader
const decoder = new TextDecoder();         // converts binary to text
let buffer = "";
let assembled = "";

while (true) {
  const { done, value } = await reader.read();  // read one chunk
  if (done) break;                              // stream ended

  buffer += decoder.decode(value, { stream: true }); // chunk to text
  const lines = buffer.split("\n");
  buffer = lines.pop(); // save incomplete last line for next iteration

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload) continue;

    const parsed = JSON.parse(payload);
    if (parsed.token !== undefined) {
      assembled += parsed.token;
      setStreamingReply(assembled); // update UI with each token
    } else if (parsed.done) {
      // Stream finished
    }
  }
}
```

The `buffer = lines.pop()` line is the critical insight: network chunks can split in the middle of a line. By saving the last (incomplete) line as a buffer, you ensure you never parse half a JSON object.

---

## 11. Modules: import and export

Modern JavaScript breaks code into **modules** — separate files that explicitly share only what they choose to.

### Named Exports

```javascript
// utils/openai.js — exporting multiple functions:
export const getOpenAIAPIResponse = async (messages) => { ... };
export const getOpenAIJSONResponse = async (messages) => { ... };
export const getOpenAIEmbedding = async (text) => { ... };
export const getOpenAIStreamingResponse = async (...) => { ... };
```

```javascript
// Importing named exports:
import { getOpenAIAPIResponse, getOpenAIEmbedding } from "../utils/openai.js";
```

### Default Exports

```javascript
// Sidebar.jsx — exporting the component as default:
function Sidebar() {
  // ...
}
export default Sidebar;
```

```javascript
// Importing a default export:
import Sidebar from "./Sidebar.jsx";
```

### The Difference

- **Named exports**: Exported with a name, imported with `{ name }`. A file can have many.
- **Default export**: Exported without a specific name, imported with any name you choose. A file can have only one.

### ES Modules vs CommonJS

NovaAI uses **ES Modules** (`import`/`export`) in both the frontend and backend. The backend's `package.json` has `"type": "module"` which enables ES Module syntax in Node.js.

Older Node.js code uses **CommonJS** (`require`/`module.exports`). You might see this in old tutorials:

```javascript
// CommonJS (old style — not used in NovaAI)
const express = require("express");
module.exports = router;

// ES Modules (what NovaAI uses)
import express from "express";
export default router;
```

---

## 12. JSON

JSON (JavaScript Object Notation) is how NovaAI transmits data between the browser and the server.

### JSON.stringify() — Object to String

```javascript
const data = {
  message: "Hello",
  threadId: "abc-123"
};

const jsonString = JSON.stringify(data);
// '{"message":"Hello","threadId":"abc-123"}'
// This string is what gets sent in the HTTP request body
```

```javascript
// In ChatWindow.jsx:
body: JSON.stringify({ message: currentPrompt, threadId: currThreadId })
```

### JSON.parse() — String to Object

```javascript
const jsonString = '{"token":"Hello","done":false}';
const parsed = JSON.parse(jsonString);
parsed.token; // "Hello"
parsed.done;  // false
```

```javascript
// In ChatWindow.jsx's stream reader:
const parsed = JSON.parse(payload);
// payload is a string like '{"token":"quan"}'
// parsed is the object { token: "quan" }
```

### What JSON Cannot Contain

JSON is a strict format. It cannot contain:
- JavaScript functions
- `undefined` values
- Circular references (objects that reference themselves)
- Comments

Dates in JSON are usually stored as ISO strings: `"2024-01-15T10:30:00.000Z"`.

---

## 13. Error Handling

### try/catch/finally

```javascript
try {
  // Code that might throw an error
  const response = await authFetch("http://localhost:8080/api/thread");
  const data = await response.json();
} catch (err) {
  // If anything in the try block throws, we land here
  console.log("Request failed:", err);
} finally {
  // Runs whether or not there was an error
  setLoading(false);
}
```

### Errors in NovaAI

The backend uses try/catch around all database and OpenAI operations:

```javascript
// In chat.js route handler:
try {
  const thread = await Thread.findOne({ threadId, userId: req.user.userId });
  // ...
} catch (err) {
  console.log(err);
  res.status(500).json({ error: "Something went wrong" });
}
```

The frontend uses try/catch around all API calls:

```javascript
// In Sidebar.jsx:
const getAllThreads = async () => {
  try {
    const response = await authFetch("http://localhost:8080/api/thread");
    if (!response.ok) return; // check HTTP status before trying to parse
    const res = await response.json();
    setAllThreads(res.map(thread => ({ threadId: thread.threadId, title: thread.title })));
  } catch (err) {
    console.log(err); // network failure
  }
};
```

Note the `if (!response.ok) return` pattern: `fetch` only throws for network failures. A 404 or 500 response does NOT throw — you must explicitly check `response.ok` (which is `true` for 200–299 status codes).

---

## 14. Closures and Scope

A **closure** is a function that "remembers" the variables from the scope where it was created, even after that scope has finished.

### The Classic Example

```javascript
function makeCounter() {
  let count = 0;  // This variable is in makeCounter's scope

  return function() {
    count += 1;   // This inner function "remembers" count
    return count;
  };
}

const counter = makeCounter();
counter(); // 1
counter(); // 2
counter(); // 3
```

The inner function retains access to `count` even though `makeCounter` has already returned. This is a closure.

### In NovaAI: The `isFirstMessage` Closure

This is a real and important example in `ChatWindow.jsx`:

```javascript
const getReply = async () => {
  const isFirstMessage = newChat;  // ← CAPTURES the value of newChat RIGHT NOW
  const currentPrompt = prompt;    // ← CAPTURES prompt RIGHT NOW

  setLoading(true);
  setNewChat(false);               // newChat changes to false...
  setPrompt("");                   // prompt changes to ""...

  // ... later, after the entire SSE stream finishes:
  if (isFirstMessage) {
    // isFirstMessage still refers to what newChat WAS when getReply was called
    // Even though newChat is now false, isFirstMessage captured the original value
    setAllThreads(prev => prev.map(t =>
      t.threadId === currThreadId
        ? { ...t, title: parsed.title || currentPrompt }  // currentPrompt also remembered
        : t
    ));
  }
};
```

`isFirstMessage` and `currentPrompt` are closures. They capture the values of `newChat` and `prompt` at the moment `getReply()` is called. Even though those values change milliseconds later (setting them to `false` and `""`), the captured values remain accessible throughout the entire async operation.

Without this pattern, by the time the SSE stream ends, `prompt` would be `""` and you couldn't use the original message as a title fallback.

---

## 15. The Set Data Structure

A `Set` is a collection that contains **no duplicates**. Unlike an array, adding the same value twice just keeps one copy.

```javascript
const arr = [1, 2, 2, 3, 3, 3];
const set = new Set(arr);
console.log(set); // Set {1, 2, 3}

// Convert back to array:
const unique = [...new Set(arr)]; // [1, 2, 3]
```

### In NovaAI: Deduplicating User Memory

When `extractUserMemory()` runs after each message, it extracts new interests/goals from the conversation and merges them with the existing ones. To avoid duplicates, it uses Set:

```javascript
// In chat.js extractUserMemory():
const mergeArrays = (oldArr, newArr) => [...new Set([...oldArr, ...newArr])];

// Example:
const existingInterests = ["programming", "travel"];
const newInterests = ["travel", "fitness"]; // "travel" already exists

const merged = mergeArrays(existingInterests, newInterests);
// ["programming", "travel", "fitness"]
// "travel" appears only once because Set removes duplicates
```

This ensures that after 100 conversations, the interests array doesn't have "programming" listed 50 times.

---

## 16. Summary

| Concept | What It Is | Key Example in NovaAI |
|---------|-----------|----------------------|
| `const` | Variable that can't be reassigned | `const SUMMARY_THRESHOLD = 14` |
| `let` | Variable that can be reassigned | `let assembled = ""; assembled += token` |
| Arrow function | Shorter function syntax | `const getReply = async () => { }` |
| `.map()` | Transform every array item | Updating thread title in sidebar |
| `.filter()` | Keep items matching a condition | Removing deleted thread from list |
| `.slice()` | Take a portion of an array | `interests.slice(0, 5)` in system prompt |
| Destructuring | Extract values from objects/arrays | `const { prompt, setPrompt } = useContext(MyContext)` |
| Spread `...` | Copy+extend arrays and objects | `[...prev, newMessage]` in `setPrevChats` |
| `?.` Optional chaining | Safe access to nested properties | `threadProfile?.userFacts?.length` |
| Template literal | String with embedded expressions | `` `http://localhost:8080/api/thread/${id}` `` |
| `async/await` | Write async code that looks synchronous | Every API call and database operation |
| `try/catch` | Handle errors gracefully | All fetch and database operations |
| `Promise.all()` | Run multiple async tasks in parallel | Analytics query + conversation count |
| `.then()` | Chain Promises sequentially | Background task chain after streaming |
| `JSON.stringify` | Object → JSON string | POST request bodies |
| `JSON.parse` | JSON string → Object | SSE stream parsing |
| Closure | Function remembering outer scope values | `isFirstMessage` and `currentPrompt` in `getReply` |
| `Set` | Collection with no duplicates | Deduplicating interests/goals in UserMemory |

---

## 17. Interview Questions and Answers

---

**Q: What is the difference between `const` and `let`?**

A: Both are block-scoped variable declarations. `const` cannot be reassigned after its initial value is set — the variable always points to the same value (or object reference). `let` can be reassigned. However, `const` does not make objects immutable — you can still modify an object's properties. In NovaAI, I use `const` by default for nearly everything and `let` only where I explicitly need to reassign, like the `buffer` and `assembled` strings in the SSE stream reader that grow as tokens arrive.

---

**Q: What is async/await and how does it work?**

A: `async/await` is syntax on top of Promises that makes asynchronous code look and read like synchronous code. When you `await` a Promise, execution of that function pauses until the Promise resolves, then continues with the resolved value. The function must be declared `async`. Under the hood, it's still Promises — `await` just eliminates the `.then()` chaining. In NovaAI, every database call (MongoDB), HTTP call (OpenAI API), and network request uses async/await because they all return Promises.

---

**Q: What is the difference between `.map()` and `.filter()`?**

A: Both iterate over arrays without modifying the original. `.map()` transforms every element and returns a new array of the same length. `.filter()` keeps only elements that pass a condition and returns a (potentially shorter) new array. In NovaAI, I use `.map()` to update a thread's title in the sidebar (transforming one specific element), and `.filter()` to remove a deleted thread from the thread list (removing the one that matches the deleted ID).

---

**Q: What is a closure? Give a real example.**

A: A closure is a function that retains access to variables from the scope it was defined in, even after that outer scope has finished executing. In NovaAI's `getReply()` function in `ChatWindow.jsx`, I capture `const isFirstMessage = newChat` and `const currentPrompt = prompt` at the moment the function is called. Then I immediately call `setNewChat(false)` and `setPrompt("")`. Later, after the entire SSE stream finishes — potentially several seconds later — I still use `isFirstMessage` and `currentPrompt`. They're closures: they remember the values they captured at the start of the function, even though those values have since changed.

---

**Q: What is the spread operator and why is it needed in React?**

A: The spread operator (`...`) creates a shallow copy of an array or object. In React, state must never be mutated directly — you must create a new value. Instead of `prevChats.push(newMessage)` (mutation), I write `[...prevChats, newMessage]` (creates a new array). React uses reference equality to detect changes; if you mutate the same array, React sees the same reference and doesn't re-render. Spread ensures we always hand React a brand-new array or object, which it correctly identifies as changed.

---

**Q: What is `Promise.all()` and when would you use it?**

A: `Promise.all()` takes an array of Promises and returns a new Promise that resolves when all of them have resolved. It runs them in parallel rather than sequentially. I use it in NovaAI's analytics route to run two database operations simultaneously: the aggregation query over all analytics documents AND the thread count. Running them sequentially would mean one has to finish before the other starts. With `Promise.all()`, both start at the same time and the total wait is only as long as the slower one — not the sum of both.

---

**Q: What is optional chaining (`?.`) and why is it useful?**

A: Optional chaining safely accesses nested properties that might be `null` or `undefined`. Without it, accessing `threadProfile.userFacts` when `threadProfile` is `null` throws a `TypeError: Cannot read properties of null`. With `threadProfile?.userFacts`, JavaScript returns `undefined` instead of throwing. In NovaAI, thread profiles start as `null` when a new chat is opened, so all accesses use optional chaining to prevent crashes during the moments before any profile data exists.

---

**Q: What is the difference between `null` and `undefined`?**

A: Both represent "no value" but with different semantics. `undefined` means a variable was declared but never assigned — it's the default. `null` is an intentional empty value — you explicitly set it to signal "nothing here." In NovaAI, `setThreadProfile(null)` explicitly clears the profile when navigating to a new chat. The `??` operator (nullish coalescing) treats both `null` and `undefined` as "empty" and returns the fallback, while `||` also treats `0`, `""`, and `false` as falsy.
