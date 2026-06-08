# 06 — MongoDB Complete Guide

**Purpose:** NovaAI stores everything — user accounts, all conversation threads, AI-extracted profiles, long-term user memory, and analytics — in MongoDB. This file explains MongoDB from scratch: how it differs from traditional databases, how Mongoose works, and every data model in the project. The database design choices here are strong interview talking points.

**Learning Value:** ⭐⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐
**Estimated Reading Time:** 65–80 minutes
**Prerequisites:** 04-nodejs-complete-guide.md

---

## Table of Contents

1. [What MongoDB Is — Databases from First Principles](#1-what-mongodb-is)
2. [SQL vs NoSQL — The Fundamental Difference](#2-sql-vs-nosql)
3. [Documents and Collections](#3-documents-and-collections)
4. [Mongoose — The ODM Layer](#4-mongoose)
5. [NovaAI's Four Data Models](#5-novaais-four-data-models)
6. [The Thread Model Deep Dive](#6-the-thread-model-deep-dive)
7. [CRUD Operations in NovaAI](#7-crud-operations)
8. [MongoDB Indexes](#8-mongodb-indexes)
9. [The Analytics Aggregation Pipeline](#9-the-analytics-aggregation-pipeline)
10. [Data Relationships in NovaAI](#10-data-relationships)
11. [The ParallelSaveError — A Real Bug We Fixed](#11-the-parallelsaveerror)
12. [Summary](#12-summary)
13. [Interview Questions and Answers](#13-interview-questions-and-answers)

---

## 1. What MongoDB Is — Databases from First Principles

### Why Applications Need Databases

When a user logs into NovaAI, registers an account, and sends a message, where do those details go? You could store them in a JavaScript variable — but the moment the server restarts, everything is gone. Databases solve the **persistence** problem: data survives restarts, crashes, and deployments.

A database also solves **querying**: you can ask "give me all threads for user X" without scanning every file on disk. And **concurrency**: multiple users can read and write simultaneously without corrupting data.

### What MongoDB Is

MongoDB is a **database management system** — a program that runs as a separate service (or in the cloud, on MongoDB Atlas) and responds to queries. Your Node.js backend connects to it over a network connection.

MongoDB is a **document database**. Instead of tables and rows, it stores **documents** — JSON-like objects. A document can contain nested objects, arrays, and any structure you need.

### MongoDB Atlas

NovaAI uses **MongoDB Atlas** — MongoDB's cloud hosting service. Instead of running a MongoDB server on your own machine, Atlas runs it for you in the cloud. Your backend connects using a connection string (stored in `.env`):

```
mongodb+srv://username:password@cluster.mongodb.net/novaai
```

---

## 2. SQL vs NoSQL — The Fundamental Difference

Understanding why MongoDB was chosen requires understanding what traditional SQL databases look like.

### SQL Databases (PostgreSQL, MySQL)

SQL databases store data in **tables** — like spreadsheets with fixed columns:

```
Users table:
┌─────────┬───────────────────┬──────────────────────────────┐
│ user_id │ email             │ password_hash                │
├─────────┼───────────────────┼──────────────────────────────┤
│ 1       │ aditya@email.com  │ $2b$10$abc...                │
│ 2       │ priya@email.com   │ $2b$10$def...                │
└─────────┴───────────────────┴──────────────────────────────┘

Messages table:
┌────────────┬─────────┬────────────┬─────────────────────────┐
│ message_id │ user_id │ role       │ content                 │
├────────────┼─────────┼────────────┼─────────────────────────┤
│ 1          │ 1       │ user       │ Hello                   │
│ 2          │ 1       │ assistant  │ Hi there!               │
│ 3          │ 1       │ user       │ What is RAG?            │
└────────────┴─────────┴────────────┴─────────────────────────┘
```

Every row has **exactly** the same columns. To store embeddings (1,536 numbers per message), you'd need a separate table with a foreign key. To get a user's messages, you'd join two tables.

### MongoDB (Document Database)

MongoDB stores **documents** — JSON objects that can have any structure:

```json
// Thread document in MongoDB:
{
  "_id": "ObjectId(507f1f77...)",
  "threadId": "abc-123-def",
  "userId": "ObjectId(507f1f77...)",
  "title": "Planning Japan trip",
  "messages": [
    {
      "role": "user",
      "content": "I want to visit Japan",
      "embedding": [0.021, -0.054, 0.178, ...],
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Great choice! Here are the best times...",
      "embedding": [0.019, -0.061, 0.182, ...],
      "timestamp": "2024-01-15T10:00:02Z"
    }
  ],
  "profile": {
    "userFacts": ["Planning Japan trip"],
    "preferences": ["Prefers detailed itineraries"],
    "activeContext": "Travel planning"
  }
}
```

All the messages are **embedded** directly inside the thread document. No joins needed. Fetching a thread gives you everything at once.

### When to Choose MongoDB vs SQL

| Scenario | MongoDB | SQL |
|----------|---------|-----|
| Flexible, evolving schema | ✅ | ❌ (requires migrations) |
| Embedding arrays in documents | ✅ | ❌ (separate table) |
| Complex joins across many tables | ❌ | ✅ |
| Strong consistency guarantees | ❌ | ✅ |
| Financial data (strict integrity) | ❌ | ✅ |

For NovaAI, MongoDB was the right choice: messages are naturally nested inside threads, and the schema evolved as features were added (adding `profile`, then `summary`, then embeddings to messages) without any migrations.

---

## 3. Documents and Collections

### What a Document Is

A **document** is a JSON-like object stored in MongoDB. In code it looks exactly like a JavaScript object:

```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),  // auto-generated unique ID
  email: "aditya@example.com",
  passwordHash: "$2b$10$abc...",
  createdAt: new Date("2024-01-15"),
  updatedAt: new Date("2024-01-15")
}
```

Every document has an `_id` field — a unique identifier automatically assigned by MongoDB.

### What a Collection Is

A **collection** is a group of documents — equivalent to a table in SQL. All documents in a collection are related (same type of data), but they don't need to have identical structures.

NovaAI has four collections:
- `users` — one document per user account
- `threads` — one document per conversation (with messages embedded)
- `analytics` — one document per message sent
- `usermemories` — one document per user (long-term profile)

(Mongoose pluralizes and lowercases collection names automatically: `User` model → `users` collection)

### BSON — MongoDB's Internal Format

MongoDB stores documents in **BSON** (Binary JSON) format, which extends JSON with additional types:
- `ObjectId` — MongoDB's 12-byte unique ID type
- `Date` — proper date type (not a string)
- `Binary` — raw binary data

When you use Mongoose, BSON is handled automatically. You work with JavaScript objects and Mongoose translates to/from BSON.

---

## 4. Mongoose — The ODM Layer

### What Mongoose Is

Mongoose is an **ODM** (Object-Document Mapper) — a library that provides a structured way to work with MongoDB from JavaScript. Without Mongoose, you'd use the raw MongoDB driver, which has no schema validation or type checking.

Mongoose adds:
1. **Schemas** — define the structure and types of your documents
2. **Models** — JavaScript classes for creating, reading, updating, deleting documents
3. **Validation** — ensure required fields are present, unique constraints, etc.
4. **Middleware** — pre/post hooks for save, find, delete operations
5. **Query helpers** — chainable `.find()`, `.where()`, `.sort()` API

### Connecting to MongoDB

```javascript
// In server.js:
import mongoose from "mongoose";

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas");
    app.listen(8080, () => console.log("Server running on port 8080"));
  })
  .catch(err => console.log("Connection failed:", err));
```

The server only starts listening for requests after the MongoDB connection is established.

### Defining a Schema

A schema defines the shape of documents in a collection:

```javascript
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  }
}, { timestamps: true }); // adds createdAt and updatedAt automatically
```

### Creating a Model

A model is the interface for creating and querying documents:

```javascript
const User = mongoose.model("User", UserSchema);
// "User" → collection named "users" in MongoDB

export default User;
```

---

## 5. NovaAI's Four Data Models

### Model 1: User

```javascript
// models/User.js
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,      // cannot be empty
    unique: true,        // no two users with same email
    lowercase: true,     // stored in lowercase ("ADITYA@..." → "aditya@...")
    trim: true           // removes leading/trailing whitespace
  },
  passwordHash: {
    type: String,
    required: true       // the bcrypt hash of the password
  }
}, { timestamps: true }); // adds createdAt, updatedAt
```

**Why `lowercase: true`?** Prevents duplicate accounts like "Aditya@" and "aditya@" — both would be stored as "aditya@".

**Why store `passwordHash` not `password`?** Never store plaintext passwords. bcrypt hashes passwords one-way — you can verify a password against the hash but cannot reverse the hash to get the password.

### Model 2: Analytics

```javascript
// models/Analytics.js
const AnalyticsSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  threadId:    { type: String, required: true },
  promptTokens:     { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens:      { type: Number, default: 0 },
  estimatedCostUsd: { type: Number, default: 0 },
  latencyMs:   { type: Number, default: 0 }, // total response time
  ttftMs:      { type: Number, default: 0 }, // time to first token
  ragUsed:     { type: Boolean, default: false },
  timestamp:   { type: Date, default: Date.now }
});

AnalyticsSchema.index({ userId: 1, timestamp: -1 });
```

**One document per message.** Every time the AI responds, a new Analytics document is created. This allows historical analysis and the aggregation pipeline to compute averages over all messages.

**`ref: "User"`** — declares a reference to the User collection. Mongoose can use this for `.populate()` to join data if needed.

### Model 3: UserMemory

```javascript
// models/UserMemory.js
const TopicSchema = new mongoose.Schema({
  topic: String,
  count: { type: Number, default: 0 },
  lastDiscussed: Date
}, { _id: false }); // no separate _id for subdocuments

const HighlightSchema = new mongoose.Schema({
  type: { type: String, enum: ["interest", "goal", "project", "challenge", "preference", "objective"] },
  content: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const UserMemorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true    // exactly one UserMemory per user
  },
  interests:           [String],
  goals:               [String],
  lifeEvents:          [String],
  ongoingProjects:     [String],
  preferences:         [String],
  challenges:          [String],
  longTermObjectives:  [String],
  topicFrequency:      [TopicSchema],
  memoryHighlights:    [HighlightSchema],
  profileSummary:      String,
  lastUpdated:         Date
});
```

**`unique: true` on `userId`** — ensures only one UserMemory document per user. If you try to create a second one for the same user, MongoDB throws a duplicate key error.

**`_id: false` on subdocuments** — TopicSchema and HighlightSchema are embedded subdocuments. By default, Mongoose adds an `_id` to every subdocument. `_id: false` turns that off since we don't need separate IDs for these small objects.

**`enum`** — the `type` field in HighlightSchema can only be one of those six values. Any other value will fail validation.

---

## 6. The Thread Model Deep Dive

This is the most complex model in NovaAI:

```javascript
// models/Thread.js
const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["system", "user", "assistant"], required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], default: undefined }, // optional: 1,536 floats
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const ThreadSchema = new mongoose.Schema({
  threadId: { type: String, required: true, unique: true }, // UUID generated by browser
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:    { type: String, default: "New Chat" },
  messages: [MessageSchema],
  profile: {
    userFacts:     [String],
    preferences:   [String],
    activeContext: String,
    lastUpdated:   Date
  },
  summary: {
    content:               String,
    builtFromMessageCount: Number,
    createdAt:             Date
  }
}, { timestamps: true });

ThreadSchema.index({ userId: 1, updatedAt: -1 });
```

### Why Messages Are Embedded Inside Thread

In SQL, you'd have a separate `messages` table. In MongoDB, the messages array is inside the thread document. The advantages:

1. **One database read** to get a thread with all its messages
2. **Atomic updates** — adding a message and updating the thread happen as one operation
3. **Natural data locality** — messages always belong to exactly one thread

The tradeoff: the thread document grows with every message. Very long conversations (hundreds of messages) become large documents. The conversation summarization feature (compressing old messages) partially mitigates this.

### Storing Embeddings: `[Number]`

```javascript
embedding: { type: [Number], default: undefined }
```

A `[Number]` field stores an array of JavaScript numbers. An OpenAI `text-embedding-3-small` embedding has **1,536 dimensions** — so this field stores an array of 1,536 floating-point numbers for each message.

`default: undefined` means the field is omitted (not stored) when not provided — new messages without embeddings don't waste storage with an empty array.

### The `profile` Sub-Document

The `profile` field is an embedded object (not a separate collection). It stores the AI-extracted thread context: what the current conversation is about, what facts were extracted, what preferences were detected. This is updated after every message by `extractProfileData()`.

### The `summary` Sub-Document

The `summary` field stores the compressed conversation history when the thread gets long. `builtFromMessageCount` tracks how many messages were included when the summary was built, so `maybeSummarize()` knows when to rebuild it.

---

## 7. CRUD Operations in NovaAI

### Create — `new Model()` + `.save()`

```javascript
// Creating a new thread (in chat.js):
thread = new Thread({
  threadId,                 // UUID from browser
  userId: req.user.userId,  // from JWT
  title: generatedTitle,    // from GPT
  messages: [
    {
      role: "system",
      content: dynamicSystemPrompt + historicalContext
    }
  ]
});
await thread.save(); // writes to MongoDB
```

Alternative one-liner for simple creates:
```javascript
const analytics = await Analytics.create({
  userId, threadId, promptTokens, completionTokens, ...
});
```

### Read — `findOne()` and `find()`

```javascript
// Find one user by email:
const user = await User.findOne({ email: req.body.email });
// Returns the document, or null if not found

// Find one thread by threadId AND userId (security: can't read another user's thread):
const thread = await Thread.findOne({ threadId, userId: req.user.userId });

// Find all threads for a user, sorted by updatedAt descending:
const threads = await Thread.find({ userId: req.user.userId })
  .sort({ updatedAt: -1 })
  .select("threadId title"); // only return these fields
```

### Update — `findOneAndUpdate()` with upsert

```javascript
// In extractUserMemory() — update or create UserMemory:
const updatedMemory = await UserMemory.findOneAndUpdate(
  { userId },            // filter: find the document where userId matches
  {
    $set: {
      interests: mergedInterests,
      goals: mergedGoals,
      profileSummary: newSummary,
      lastUpdated: new Date()
    },
    $push: {
      memoryHighlights: {
        $each: newHighlights,
        $slice: -20        // keep only the last 20 highlights
      }
    }
  },
  { upsert: true, new: true }  // create if doesn't exist, return updated document
);
```

**`upsert: true`** — If no document matches the filter, create a new one. Without this, if the user has no UserMemory document yet, the update would silently do nothing.

**`new: true`** — Return the updated document (not the original).

**MongoDB Update Operators:**
- `$set` — set specific fields
- `$push` — add to an array
- `$push.$each` — add multiple items
- `$push.$slice` — limit array to last N items (negative = from end)

### Delete — `findOneAndDelete()`

```javascript
// In the DELETE /api/thread/:threadId route:
const deletedThread = await Thread.findOneAndDelete({
  threadId: req.params.threadId,
  userId: req.user.userId  // security: can only delete your own threads
});

if (!deletedThread) {
  return res.status(404).json({ error: "Thread not found" });
}

res.json({ success: true });
```

`findOneAndDelete()` atomically finds and deletes in one operation — no risk of deleting a document that another request just created.

### Modifying a Document and Saving

For updating a specific field on an already-loaded document:

```javascript
// In extractProfileData() — update the thread's profile:
const thread = await Thread.findOne({ threadId, userId });
thread.profile = {
  userFacts: extractedFacts,
  preferences: extractedPreferences,
  activeContext: extractedContext,
  lastUpdated: new Date()
};
await thread.save(); // saves the entire document back to MongoDB
```

---

## 8. MongoDB Indexes

An **index** is a data structure that makes certain queries fast. Without indexes, MongoDB scans every document in a collection to find matches — like searching a book by reading every page. With an index, it jumps directly to the matching documents — like using the book's index.

### Unique Index on User Email

```javascript
email: { type: String, unique: true }
```

This creates a unique index on the `email` field. Two effects:
1. Fast lookups by email (login query: `User.findOne({ email })`)
2. Prevents duplicate registrations (MongoDB throws an error if you try to insert with an existing email)

### Unique Index on UserMemory userId

```javascript
userId: { type: mongoose.Schema.Types.ObjectId, unique: true }
```

Ensures exactly one UserMemory per user. Fast lookup: `UserMemory.findOne({ userId })`.

### Compound Index on Thread

```javascript
ThreadSchema.index({ userId: 1, updatedAt: -1 });
```

This creates a compound index on two fields:
- `userId: 1` — ascending sort by userId
- `updatedAt: -1` — descending sort by updatedAt (newest first)

This optimizes the most common query: "give me all threads for user X, newest first":
```javascript
Thread.find({ userId }).sort({ updatedAt: -1 })
```

Without this index, MongoDB scans every thread for every user, then sorts. With it, it directly reads the pre-sorted index for that user.

### Compound Index on Analytics

```javascript
AnalyticsSchema.index({ userId: 1, timestamp: -1 });
```

Optimizes the analytics aggregation query: "aggregate analytics for user X":
```javascript
Analytics.aggregate([{ $match: { userId } }, { $group: {...} }])
```

---

## 9. The Analytics Aggregation Pipeline

### What Aggregation Is

MongoDB aggregation is a powerful framework for computing statistics over many documents — similar to SQL's `GROUP BY`. Instead of reading all documents into JavaScript and computing totals, you push the computation into the database, which is much faster.

### The NovaAI Aggregation Pipeline

```javascript
// In analytics.js:
const [agg, totalConversations] = await Promise.all([
  Analytics.aggregate([
    // Stage 1: $match — filter to this user's analytics only
    { $match: { userId: new mongoose.Types.ObjectId(req.user.userId) } },
    
    // Stage 2: $group — compute statistics over all matching documents
    {
      $group: {
        _id: null,  // group ALL documents together (not sub-grouped)
        totalMessages:         { $sum: 1 },           // count documents
        totalPromptTokens:     { $sum: "$promptTokens" },    // sum a field
        totalCompletionTokens: { $sum: "$completionTokens" },
        totalTokens:           { $sum: "$totalTokens" },
        estimatedTotalCostUsd: { $sum: "$estimatedCostUsd" },
        avgLatencyMs:          { $avg: "$latencyMs" },       // average a field
        avgTtftMs:             { $avg: "$ttftMs" },
        ragUsedCount:          {
          $sum: { $cond: ["$ragUsed", 1, 0] }  // conditional sum
        }
      }
    }
  ]),
  Thread.countDocuments({ userId: req.user.userId })
]);
```

### Breaking Down Each Stage

**`$match`** — Filters documents, like SQL `WHERE`. Without this, we'd aggregate ALL users' analytics. `new mongoose.Types.ObjectId(req.user.userId)` converts the string userId to MongoDB's ObjectId type for proper comparison.

**`$group`** — Groups documents. `_id: null` means group everything into one result (no sub-grouping).

**`$sum: 1`** — Counts every document (adds 1 for each).

**`$sum: "$promptTokens"`** — Adds up the `promptTokens` field from every document. `$` prefix means "the value of this field."

**`$avg: "$latencyMs"`** — Computes the mean of `latencyMs` across all documents.

**`$sum: { $cond: ["$ragUsed", 1, 0] }`** — For each document, if `ragUsed` is `true`, add 1; else add 0. This counts how many messages used RAG.

### Computing the RAG Rate

```javascript
// After aggregation:
const stats = agg[0] || {};
const ragUsageRate = stats.totalMessages > 0
  ? parseFloat((stats.ragUsedCount / stats.totalMessages).toFixed(2))
  : 0;
// ragUsageRate = 0.36 means 36% of messages used RAG
```

### Why This Is Better Than JavaScript Computation

Instead of:
```javascript
const allAnalytics = await Analytics.find({ userId });  // fetch ALL documents
const totalTokens = allAnalytics.reduce((sum, a) => sum + a.totalTokens, 0);
const avgLatency = allAnalytics.reduce((sum, a) => sum + a.latencyMs, 0) / allAnalytics.length;
```

The aggregation approach:
- Computes everything **inside MongoDB** — no need to transfer thousands of documents to Node.js
- One network round-trip instead of fetching a large array
- Scales to millions of documents without memory issues

---

## 10. Data Relationships in NovaAI

MongoDB is not relational, but data is still related through `userId` references.

### User → Thread (One-to-Many)

One user can have many threads. Each thread stores `userId` as a reference:

```
User { _id: "507f..." }
  │
  ├── Thread { userId: "507f...", title: "Japan trip" }
  ├── Thread { userId: "507f...", title: "Quantum Computing" }
  └── Thread { userId: "507f...", title: "Budget Planning" }
```

All thread queries include `userId: req.user.userId` to ensure you only see your own threads.

### User → UserMemory (One-to-One)

One user has exactly one UserMemory document (`unique: true` on `userId`). If it doesn't exist yet (first conversation), `upsert: true` creates it.

### User → Analytics (One-to-Many)

One analytics document per message sent. A user who sends 100 messages has 100 analytics documents. The aggregation pipeline groups all of them into one result.

### Messages Inside Thread (Embedded)

Messages are not a separate collection — they're an array inside Thread. This is the "embedded document" pattern. Advantages: one read to get all messages, no joins needed.

---

## 11. The ParallelSaveError — A Real Bug We Fixed

This is one of the best interview stories from this project.

### What Happened

The background task chain originally ran three operations in parallel using `Promise.all()`:

```javascript
// OLD CODE — caused a bug:
await Promise.all([
  extractProfileData(thread),   // saves thread.profile → thread.save()
  maybeSummarize(thread),       // saves thread.summary → thread.save()
  extractUserMemory(thread, userId) // saves UserMemory → different document
]);
```

Both `extractProfileData` and `maybeSummarize` modify the **same** Mongoose `thread` document and call `thread.save()`. When both run simultaneously, they trigger a race condition:

```
Time →

extractProfileData:
  thread.profile = { ... }  → thread.save() starts...
  
maybeSummarize:
  thread.summary = { ... }  → thread.save() starts...

Both saves conflict → Mongoose throws ParallelSaveError
```

Mongoose detects this conflict because it tracks which documents are currently being saved using an internal `$__saveState`. Two simultaneous saves of the same document are rejected.

### The Fix

Chain them sequentially with `.then()`:

```javascript
// NEW CODE — fixed:
extractProfileData(thread)
  .then(() => maybeSummarize(thread))
  .then(() => extractUserMemory(thread, userId))
  .catch(err => console.log("Background task error:", err));
```

Now:
1. `extractProfileData` runs first, saves thread
2. After it completes, `maybeSummarize` runs, saves thread  
3. After that, `extractUserMemory` runs — different document, no conflict

Sequential chaining is slightly slower (operations don't overlap) but eliminates the race condition. For background tasks that run after the user already has their response, this tradeoff is acceptable.

`extractUserMemory` saves a UserMemory document (different from thread), so even if we ran it in parallel with one of the others, there'd be no conflict — but keeping them all sequential is simpler and safer.

### Why This Is a Great Interview Story

It demonstrates:
- You understand async concurrency (two operations racing on shared state)
- You understand Mongoose internals (save state tracking)
- You know how to fix it (sequential `.then()` chaining)
- You thought about the tradeoff (sequential = slightly slower, but correct)

---

## 12. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| MongoDB | Document database (JSON-like storage) | All four collections |
| Atlas | MongoDB's cloud hosting | `MONGODB_URI` connection string |
| Document | JSON-like object stored in MongoDB | Thread, User, Analytics, UserMemory |
| Collection | Group of related documents | `threads`, `users`, `analytics`, `usermemories` |
| Mongoose | ODM — structure for working with MongoDB | `models/` directory |
| Schema | Defines document structure and types | `ThreadSchema`, `UserSchema`, etc. |
| Model | Interface for CRUD operations | `Thread.findOne()`, `User.create()` |
| `unique: true` | Prevents duplicate values | User email, UserMemory userId |
| `required: true` | Field cannot be omitted | email, passwordHash, role, content |
| `timestamps: true` | Auto-adds createdAt + updatedAt | User, Thread models |
| Embedded documents | Sub-objects inside a document | Messages inside Thread |
| `findOne()` | Read one matching document | Thread lookup, User lookup |
| `find()` | Read all matching documents | All threads for a user |
| `findOneAndDelete()` | Delete one document | Thread deletion |
| `findOneAndUpdate()` | Update one document | UserMemory update with upsert |
| `upsert: true` | Create if not exists | UserMemory first creation |
| Index | Pre-sorted structure for fast queries | Thread by userId+updatedAt |
| Compound index | Index on multiple fields | `{ userId: 1, updatedAt: -1 }` |
| Aggregation pipeline | Multi-stage data transformation | Analytics: `$match` + `$group` |
| `$match` | Filter stage | Only this user's analytics |
| `$group` | Aggregate stage | Sum tokens, average latency |
| `$cond` | Conditional in aggregation | Count RAG-used messages |
| ParallelSaveError | Two saves of same document conflict | Fixed by sequential `.then()` chaining |

---

## 13. Interview Questions and Answers

---

**Q: What is the difference between MongoDB and a SQL database like PostgreSQL?**

A: SQL databases (PostgreSQL, MySQL) store data in tables with fixed columns and require a predefined schema. Related data across tables is joined using foreign keys. MongoDB stores data as documents — JSON-like objects that can have nested arrays and sub-objects, with no required fixed schema. In NovaAI, I chose MongoDB because messages naturally belong inside their thread document (embedded array), which would require a separate table and join queries in SQL. The schema also evolved throughout development (adding embeddings, profile, summary) without any migrations. The tradeoff is that MongoDB offers weaker consistency guarantees than SQL and is less suited for complex multi-table queries.

---

**Q: What is an index and why do you use it?**

A: An index is a pre-sorted data structure that makes database queries fast. Without an index, MongoDB performs a full collection scan — reading every document — which is slow as data grows. In NovaAI, I have a compound index on Thread: `{ userId: 1, updatedAt: -1 }`. This optimizes the most common query — "get all threads for user X sorted by most recent" — because MongoDB can jump directly to that user's threads in sorted order without scanning all threads from all users. I also have a unique index on `userId` in UserMemory, which both ensures data integrity (one memory per user) and makes the lookup fast.

---

**Q: What is an aggregation pipeline?**

A: An aggregation pipeline is MongoDB's system for computing statistics over many documents through a sequence of stages. Data flows through each stage like water through pipes. In NovaAI's analytics route, the pipeline has two stages: `$match` filters to the current user's analytics documents only, and `$group` computes totals, averages, and conditional counts over all those documents in one database operation. This produces nine metrics (total tokens, average latency, RAG usage rate, etc.) from a single database round-trip, rather than fetching all documents into JavaScript and computing everything there. The aggregation runs inside MongoDB, which is much faster for large datasets.

---

**Q: Why are messages stored inside the Thread document instead of a separate collection?**

A: This is the embedded document pattern in MongoDB. Messages are always accessed in the context of their thread — you never need messages from multiple threads at once. Embedding them inside Thread means one database read fetches the entire conversation. With a separate Messages collection (the SQL approach), every page load would require a query for the thread AND a query for all its messages. The tradeoff is document size — very long conversations create large Thread documents. I mitigate this with conversation summarization (compressing old messages into a text summary) and the RECENT_WINDOW limit on what's actually sent to the AI.

---

**Q: What is Mongoose and what does it add on top of MongoDB?**

A: Mongoose is an ODM (Object-Document Mapper) that provides a structured way to interact with MongoDB from JavaScript. The raw MongoDB Node.js driver has no schema validation — you can insert any random object into any collection. Mongoose adds schemas (defining field types, required/optional, unique constraints), models (JavaScript classes with methods like `findOne`, `save`, `findOneAndDelete`), and validation (required fields are checked before saving). In NovaAI, Mongoose schemas define exactly what a Thread or User document looks like, which catches bugs early and provides autocomplete in code editors. It also adds helpful features like `timestamps: true` which automatically manages `createdAt` and `updatedAt` fields.

---

**Q: Tell me about a bug you fixed in the database layer.**

A: The ParallelSaveError was the most interesting bug. After each AI response, I ran three background tasks: extracting thread-level profile data, summarizing the conversation if it was long enough, and updating the user's long-term memory profile. I initially ran all three in parallel with `Promise.all()`. Both `extractProfileData` and `maybeSummarize` modified and saved the same Mongoose Thread document simultaneously. Mongoose internally tracks save state on documents, and when two saves overlap on the same document, it throws a `ParallelSaveError`. The fix was chaining them sequentially with `.then()` — `extractProfileData` runs first, and only after it completes does `maybeSummarize` start. This adds a small delay to the background tasks, but since these run after the user already has their response (fire-and-forget after `res.end()`), the performance impact is invisible to the user. The `extractUserMemory` call saves a different document (UserMemory, not Thread) so it could theoretically run in parallel, but keeping all three sequential is simpler and safer.
