# 13 — Personal AI Assistant and Long-Term Memory Guide

**Purpose:** The most unique feature of NovaAI is that it remembers you across conversations. After every message, NovaAI extracts your interests, goals, ongoing projects, challenges, and objectives — and stores them in a persistent profile that's injected into every future conversation. This file explains the complete UserMemory system: the data model, the extraction process, the four-layer context injection, and the Personal Insights UI.

**Learning Value:** ⭐⭐⭐⭐⭐ (The feature that makes this project stand out)
**Interview Importance:** ⭐⭐⭐⭐⭐ (AI personalization is a major talking point)
**Estimated Reading Time:** 55–70 minutes
**Prerequisites:** 09-openai-and-llm-guide.md, 06-mongodb-complete-guide.md

---

## Table of Contents

1. [The Core Problem: LLMs Have No Memory Between Conversations](#1-the-core-problem)
2. [The UserMemory Data Model](#2-the-usermemory-data-model)
3. [The `extractUserMemory()` Function](#3-the-extractusermemory-function)
4. [The Four-Layer Personalization System](#4-the-four-layer-personalization-system)
5. [Thread-Level Profile Extraction](#5-thread-level-profile-extraction)
6. [The Personal Insights Drawer UI](#6-the-personal-insights-drawer-ui)
7. [Design Decisions and Tradeoffs](#7-design-decisions-and-tradeoffs)
8. [Summary](#8-summary)
9. [Interview Questions and Answers](#9-interview-questions-and-answers)

---

## 1. The Core Problem: LLMs Have No Memory Between Conversations

### The Blank Slate Problem

By default, every new conversation with an LLM starts completely fresh. The model has no memory of previous sessions:

```
Session 1: "I'm preparing for FAANG interviews, focusing on system design"
Session 2: "What should I study?" → AI has no idea about FAANG, starts generic
```

ChatGPT has a "Memory" feature that was added in 2024 — explicitly acknowledging this is a real UX problem that users care about.

### NovaAI's Approach: Structured Extraction

Rather than storing raw conversation snippets (which would be expensive to inject wholesale), NovaAI uses GPT-4o-mini to **extract structured data** from each conversation and store it in an organized schema.

```
Conversation: "I love hiking and I'm working on a mobile app in React Native..."
→ GPT extracts: { interests: ["hiking"], ongoingProjects: ["mobile app in React Native"] }
→ Stored in UserMemory document
→ Injected in ALL future conversations: "User is interested in hiking, working on React Native app"
```

This turns unstructured conversation text into a compact, reusable profile that can be injected in just a few hundred tokens.

---

## 2. The UserMemory Data Model

### The Full Schema

```javascript
// Backend/models/UserMemory.js

const TopicSchema = new mongoose.Schema({
    topic: String,
    count: { type: Number, default: 0 },
    lastDiscussed: Date
}, { _id: false });

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
        unique: true          // exactly one UserMemory per user
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

### The Eight Extraction Categories

| Field | What It Captures | Example |
|-------|-----------------|---------|
| `interests` | Hobbies, passions | "hiking", "machine learning", "jazz guitar" |
| `goals` | Short-medium term aims | "get a software engineering internship" |
| `lifeEvents` | Significant personal events | "just graduated college", "moved to Bangalore" |
| `ongoingProjects` | Active work | "building a React Native app" |
| `preferences` | Style/workflow preferences | "prefers concise explanations with code examples" |
| `challenges` | Difficulties or struggles | "struggling with system design interview prep" |
| `longTermObjectives` | 1–5 year ambitions | "work at a FAANG company", "start a startup" |
| `discussedTopics` | Predefined category tracking | "Career", "Technology", "Travel" |

### `topicFrequency` — Predefined Topic Tracking

8 predefined topics with occurrence counts:

```javascript
const PREDEFINED_TOPICS = ["Travel", "Fitness", "Relationships", "Finance", "Career", "Education", "Entertainment", "Technology"];
```

Each time a topic from this list appears in a conversation, its count increments:

```javascript
{ topic: "Career", count: 15, lastDiscussed: Date }
{ topic: "Technology", count: 12, lastDiscussed: Date }
{ topic: "Travel", count: 3, lastDiscussed: Date }
```

**Why predefined?** Free-form topics would be inconsistent: "programming", "coding", "software development", and "tech" all mean the same thing but would appear as separate entries. Constraining to 8 categories ensures clean, displayable data.

### `memoryHighlights` — Timeline (Capped at 20)

Each time a genuinely new piece of information is extracted (not already in the arrays), it's added to `memoryHighlights` as a timestamped entry:

```javascript
{ type: "interest", content: "hiking", createdAt: "2024-01-15" }
{ type: "goal",     content: "get a SWE internship", createdAt: "2024-01-16" }
{ type: "project",  content: "React Native mobile app", createdAt: "2024-01-18" }
```

Capped at 20 entries (older ones are dropped) to prevent unbounded growth.

### `profileSummary` — Template-Based, No API Cost

```javascript
const generateProfileSummary = (memory) => {
    const parts = [];
    if (memory.interests?.length)          parts.push(`Interested in ${memory.interests.slice(0, 3).join(", ")}.`);
    if (memory.goals?.length)              parts.push(`Working toward: ${memory.goals.slice(0, 2).join(" and ")}.`);
    if (memory.ongoingProjects?.length)    parts.push(`Currently working on ${memory.ongoingProjects[0]}.`);
    if (memory.longTermObjectives?.length) parts.push(`Long-term: ${memory.longTermObjectives[0]}.`);
    return parts.length ? parts.join(" ") : null;
};
```

This generates a natural-language summary like: "Interested in hiking, machine learning, jazz guitar. Working toward: getting a SWE internship and learning system design. Currently working on React Native mobile app."

**Why template-based instead of another GPT call?** Adding a GPT call to generate the summary would add ~$0.0002 per extraction call, and the template produces perfectly adequate results for a 1–2 sentence overview. This is an example of cost-conscious engineering — only use AI where it's genuinely needed.

---

## 3. The `extractUserMemory()` Function

### When It Runs

Third in the background task chain, after `extractProfileData` and `maybeSummarize`:

```javascript
extractProfileData(thread)
    .then(() => maybeSummarize(thread))
    .then(() => extractUserMemory(thread, req.user.userId))  // ← third
    .catch(err => console.log("Background task error:", err));
```

### The Extraction Prompt

```javascript
const prompt = [
    {
        role: "system",
        content: `You are a long-term user profiling agent. Extract personal information from this conversation into this exact JSON format. Use empty arrays if nothing is found. Do not invent information.
{
  "interests": [],
  "goals": [],
  "lifeEvents": [],
  "ongoingProjects": [],
  "preferences": [],
  "discussedTopics": [],
  "challenges": [],
  "longTermObjectives": []
}
For "discussedTopics", only return values from this exact list: Travel, Fitness, Relationships, Finance, Career, Education, Entertainment, Technology.`
    },
    { role: "user", content: chatHistory }  // last 6 messages
];

const extracted = await getOpenAIJSONResponse(prompt);
```

### Merging New Data With Existing Data

The key merge logic uses JavaScript `Set` for deduplication:

```javascript
const mergeArrays = (existing, incoming) => {
    if (!incoming?.length) return existing || [];
    return [...new Set([...(existing || []), ...incoming])];
};

memory.interests = mergeArrays(memory.interests, extracted.interests);
memory.goals     = mergeArrays(memory.goals,     extracted.goals);
// etc...
```

If `memory.interests = ["hiking", "machine learning"]` and `extracted.interests = ["hiking", "photography"]`:

```javascript
[...new Set(["hiking", "machine learning", "hiking", "photography"])]
→ ["hiking", "machine learning", "photography"]  ← no duplicate "hiking"
```

`Set` removes duplicates automatically. The spread operator converts back to array.

### Building Memory Highlights

Only **new** items (not already in the existing array) get added to highlights:

```javascript
const trackNew = (type, existing, incoming) => {
    if (!incoming?.length) return;
    incoming.forEach(item => {
        if (!(existing || []).includes(item)) {
            newHighlights.push({ type, content: item, createdAt: new Date() });
        }
    });
};

trackNew("interest",   memory.interests,  extracted.interests);
trackNew("goal",       memory.goals,      extracted.goals);
// etc...
```

If "hiking" is already known, it doesn't create a new highlight. Only genuinely new discoveries create timeline entries.

### Topic Frequency Update

```javascript
if (extracted.discussedTopics?.length) {
    const now = new Date();
    extracted.discussedTopics.forEach(topic => {
        const entry = memory.topicFrequency.find(t => t.topic === topic);
        if (entry) {
            entry.count += 1;
            entry.lastDiscussed = now;
        } else {
            memory.topicFrequency.push({ topic, count: 1, lastDiscussed: now });
        }
    });
}
```

`.find()` on an array — O(N) where N is at most 8 predefined topics. Effectively O(1).

### Saving With `memory.save()`

```javascript
memory.profileSummary = generateProfileSummary(memory);
memory.lastUpdated = new Date();
await memory.save();
```

This saves the entire UserMemory document back to MongoDB. Unlike the Thread document (which uses `findOneAndUpdate`), UserMemory is loaded, mutated, and saved. Why? Because we need to read the existing data first (to detect new items for highlights), so loading the document first is necessary.

---

## 4. The Four-Layer Personalization System

Every AI response is shaped by four layers of context, assembled into the system prompt in the `/api/chat` route:

### Layer 1: UserMemory — Cross-Conversation Profile (Broadest)

```javascript
if (userMemory && (userMemory.interests?.length || userMemory.goals?.length || ...)) {
    dynamicSystemPrompt += `\n\nLong-term profile of this user:\n`;
    if (userMemory.profileSummary) dynamicSystemPrompt += `${userMemory.profileSummary}\n`;
    if (userMemory.interests?.length) dynamicSystemPrompt += `- Interests: ${userMemory.interests.slice(0, 5).join(", ")}\n`;
    if (userMemory.goals?.length)     dynamicSystemPrompt += `- Goals: ${userMemory.goals.slice(0, 3).join(", ")}\n`;
    if (userMemory.ongoingProjects?.length) dynamicSystemPrompt += `- Active projects: ${userMemory.ongoingProjects.slice(0, 3).join(", ")}\n`;
    if (userMemory.challenges?.length) dynamicSystemPrompt += `- Recurring challenges: ${userMemory.challenges.slice(0, 3).join(", ")}\n`;
}
```

**Slices applied:** Interests limited to 5, goals to 3, projects to 3, challenges to 3. Prevents the system prompt from becoming thousands of tokens long if the user has accumulated many items.

**Effect:** The AI knows who you are across all conversations. If you mentioned you're a CS student 10 conversations ago, today's conversation knows that.

### Layer 2: Thread Summary — Compressed History

```javascript
if (thread.summary?.content) {
    dynamicSystemPrompt += `\n\nSummary of earlier conversation:\n${thread.summary.content}`;
}
```

**Effect:** AI remembers what happened earlier in this specific conversation, even for messages outside the recent 6.

### Layer 3: Thread Profile — Real-Time Extracted Context

```javascript
if (thread.profile && (thread.profile.userFacts?.length || thread.profile.activeContext)) {
    dynamicSystemPrompt += `\n\nTailor your responses using this learned context:\n`;
    if (thread.profile.activeContext) dynamicSystemPrompt += `- Current Focus: ${thread.profile.activeContext}\n`;
    if (thread.profile.userFacts?.length) dynamicSystemPrompt += `- Known Facts: ${thread.profile.userFacts.join(" | ")}\n`;
    if (thread.profile.preferences?.length) dynamicSystemPrompt += `- Preferences: ${thread.profile.preferences.join(" | ")}\n`;
}
```

**Effect:** AI knows specific details extracted from this conversation — "user is preparing for a Google interview on Monday," "user prefers TypeScript over JavaScript."

### Layer 4: RAG — Semantically Relevant Specific Messages

```javascript
thread.messages[0].content = dynamicSystemPrompt + historicalContext;
// historicalContext = "[SYSTEM DIRECTIVE: Utilize these relevant past conversation snippets...]"
```

**Effect:** The most specific and targeted layer — exact messages from the past that are semantically relevant to the current question.

### Why Broadest to Narrowest

The ordering (global → thread-level → specific messages) mirrors how a human would organize memory:
1. "I know this person cares about ML and interviews" (general)
2. "In this conversation we've been talking about system design" (session)
3. "They specifically asked about load balancers 15 minutes ago" (specific)

Each layer narrows the focus. The AI's responses are shaped by all four simultaneously.

---

## 5. Thread-Level Profile Extraction

### The `extractProfileData()` Function

```javascript
const extractProfileData = async (thread) => {
    const chatHistory = thread.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");

    const extractionPrompt = [
        {
            role: "system",
            content: `You are a background AI profiling agent. Extract data from the conversation into this exact JSON format:
{ "userFacts": ["fact 1"], "preferences": ["preference 1"], "activeContext": "A brief 1-sentence summary of what the user is currently trying to achieve" }.
If you don't find anything for a category, leave the array empty. Do not invent information.`
        },
        { role: "user", content: chatHistory }
    ];

    const extractedData = await getOpenAIJSONResponse(extractionPrompt);

    if (extractedData) {
        const mergeArrays = (oldArr, newArr) => [...new Set([...(oldArr || []), ...(newArr || [])])];
        thread.profile = {
            userFacts: mergeArrays(thread.profile?.userFacts, extractedData.userFacts),
            preferences: mergeArrays(thread.profile?.preferences, extractedData.preferences),
            activeContext: extractedData.activeContext || thread.profile?.activeContext,
            lastUpdated: new Date()
        };
        await thread.save();
    }
};
```

### Thread Profile vs UserMemory

| | Thread Profile | UserMemory |
|-|----------------|------------|
| Scope | This conversation only | All conversations |
| Updated | After every message | After every message |
| Content | userFacts, preferences, activeContext | 7 categories, topic frequency, highlights |
| Persistence | Clears when thread is deleted | Permanent user profile |
| Size | Small | Grows over time |

The thread profile captures "what's happening right now in this specific conversation." UserMemory captures "who this user is across their entire history."

### The Agent Memory Drawer

The thread profile is displayed in the "Memory" drawer (opened via the brain icon in the navbar):

```jsx
<div className="insight-section">
    <h5>Active Context</h5>
    <div className="context-card">
        {threadProfile?.activeContext ? threadProfile.activeContext : "Monitoring conversation..."}
    </div>
</div>
<div className="insight-section">
    <h5>Known Facts</h5>
    <div className="chip-container">
        {threadProfile?.userFacts?.map((fact, index) => (
            <span key={index} className="ui-chip fact-chip">{fact}</span>
        ))}
    </div>
</div>
```

---

## 6. The Personal Insights Drawer UI

Opened via the astronaut icon in the navbar. Fetches `/api/user-memory` on open.

### What It Shows

**Profile Summary Card** — the template-generated overview sentence.

**Chip Sections** — one section per category (Interests, Goals, Projects, Challenges, Objectives, Life Events), each item displayed as a colored chip:

```jsx
{memory.interests?.map((item, i) => (
    <span key={i} className="ui-chip interest-chip">{item}</span>
))}
```

**Topic Frequency Bars** — horizontal progress bars for each predefined topic, scaled relative to the most-discussed topic.

**Memory Highlights Timeline** — chronological list of when new items were first extracted, with type-based color coding:

```
● Jan 15 — Interested in: hiking
● Jan 16 — Goal: get a software engineering internship
● Jan 18 — Project: React Native mobile app
```

**`timeAgo(date)` Utility** — converts timestamps to human-readable relative time:
```javascript
const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};
```

---

## 7. Design Decisions and Tradeoffs

### Why a Separate Collection (Not Embedded in User)

The UserMemory document could have been embedded in the User document:
```javascript
// Could have been:
const UserSchema = { email, passwordHash, memory: UserMemorySchema }
```

It's a separate collection because:
1. **Different read patterns:** The User document is read on every authenticated request (for the `userId`). UserMemory is only read at chat time. Separating them keeps the User document small.
2. **Document size:** UserMemory grows with usage. A User document with embedded memory could become megabytes over time.
3. **Isolation:** Deleting a User's memory can be done independently of deleting the user account (GDPR right to be forgotten).

### Why Extraction Happens After Response (Not Before)

Running extraction before streaming would add 500–1000ms to TTFT — a terrible user experience tradeoff. The extraction data is used in the *next* message, not the current one, so there's no reason to block the current response. Fire-and-forget after `res.end()` is the right call.

### The 20-Highlight Cap

```javascript
if (memory.memoryHighlights.length > 20) {
    memory.memoryHighlights = memory.memoryHighlights.slice(-20);
}
```

Without a cap, a user with hundreds of conversations would accumulate hundreds of highlights. The UI only has room to display a handful meaningfully. Keeping the last 20 (most recent) provides a useful "recent activity" timeline without unbounded growth.

---

## 8. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| UserMemory | Per-user cross-conversation profile | `models/UserMemory.js` |
| 7 categories | interests, goals, lifeEvents, projects, preferences, challenges, objectives | UserMemory fields |
| `extractUserMemory()` | Background GPT extraction + DB update | After every message |
| JSON mode | Forces structured extraction output | `getOpenAIJSONResponse` |
| `mergeArrays` | Deduplication via Set | Merges new with existing |
| `trackNew` | Detects genuinely new items | Builds highlight entries |
| `memoryHighlights` | Timeline of first-extracted items | Capped at 20 |
| `topicFrequency` | Count per predefined topic | 8 topics, incremented per extraction |
| `generateProfileSummary` | Template-based summary string | No API call needed |
| Layer 1 injection | UserMemory in system prompt | `dynamicSystemPrompt +=` |
| Thread profile | Conversation-scoped extraction | `extractProfileData()` |
| `activeContext` | Current conversation focus | Thread profile field |
| Agent Memory drawer | Shows thread profile in UI | Brain icon in navbar |
| Personal Insights drawer | Shows UserMemory in UI | Astronaut icon in navbar |
| `unique: true` on userId | One UserMemory per user | Schema constraint |
| Background chain | Extraction is non-blocking | `.then(() => extractUserMemory(...))` |

---

## 9. Interview Questions and Answers

---

**Q: How does NovaAI remember the user across conversations?**

A: After every AI response, a background function called `extractUserMemory()` runs. It takes the last 6 messages of the conversation, sends them to GPT-4o-mini with a JSON-mode extraction prompt, and gets back a structured object with up to 7 categories: interests, goals, life events, ongoing projects, preferences, challenges, and long-term objectives. This extracted data is merged with the existing UserMemory document (using JavaScript Sets for deduplication), and a `topicFrequency` counter tracks which of 8 predefined topics are being discussed most. In the next conversation — even a completely new thread — this UserMemory is fetched and injected into the system prompt as Layer 1 of the 4-layer context. The AI "knows" who you are before you say anything.

---

**Q: Why use structured extraction instead of just storing conversation history?**

A: Storing raw conversation history would be expensive to inject. A user with 50 conversations might have 2,000 messages — thousands of tokens injected into every request. Structured extraction compresses that into a few sentences: "Interested in hiking, machine learning. Goal: SWE internship. Working on React Native app." That's ~50 tokens. The tradeoff is that structured extraction might miss nuance or context — but for the purpose of personalizing responses ("the user cares about software engineering"), structured data is sufficient. If the user asks a question that requires a specific past detail, RAG (Layer 4) retrieves the exact original message. The two systems complement each other: long-term structured memory for broad context, RAG for specific recall.

---

**Q: What happens if extraction fails for a message?**

A: `getOpenAIJSONResponse` has a try-catch that returns `null` on failure. The `extractUserMemory` function checks `if (!extracted) return` — so extraction failure causes a silent skip. The existing UserMemory is unchanged. This is intentional: the background task should degrade gracefully. A failed extraction for one message doesn't corrupt the profile, doesn't throw an error to the user, and doesn't retry (retrying a flaky network call in a background task could loop forever). The next message's extraction will pick up whatever the previous one missed.

---

**Q: How do you prevent the profile from growing unboundedly?**

A: Three mechanisms. First, slices are applied when injecting into the system prompt: only 5 interests, 3 goals, 3 projects, 3 challenges — so even if the profile accumulates 50 interests, only 5 are injected per request. Second, the `memoryHighlights` timeline is capped at 20 entries with `memory.memoryHighlights.slice(-20)` — the oldest entries are dropped. Third, `topicFrequency` is constrained to 8 predefined topics — it can never grow beyond 8 entries. The core arrays (interests, goals, etc.) do grow unboundedly in theory, but deduplication via `Set` prevents the same item appearing twice, and the practical limit for a personal user is a few dozen items per category — small for MongoDB.
