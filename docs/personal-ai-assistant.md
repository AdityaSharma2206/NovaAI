# Personal AI Assistant with Long-Term Memory — Implementation Reference

## What This Feature Does

Every previous feature in NovaAI (RAG, profile extraction, conversation summaries) stored context at the **thread level** — once you start a new conversation, the AI has no memory of who you are. This feature adds a **user-level persistent profile** that accumulates across every conversation, indefinitely.

The AI now knows your interests, goals, ongoing projects, recurring challenges, and long-term objectives — from the very first message of a new chat. This transforms NovaAI from a contextual chatbot into a personal AI assistant that grows smarter about you over time.

---

## The Core Problem Being Solved

### Before: per-thread memory (everything forgotten between conversations)

```
Thread A: "I'm training for a marathon. Help me plan my diet."
           → thread.profile.userFacts = ["training for marathon"]
           → thread.profile.activeContext = "planning marathon diet"

Thread B (new conversation): "What's a good recovery workout?"
           → AI has no idea you're a runner. Responds generically.
```

### After: cross-conversation long-term memory

```
Thread A: "I'm training for a marathon."
           → UserMemory.interests = ["running", "fitness"]
           → UserMemory.goals = ["complete a marathon"]

Thread B (new conversation): "What's a good recovery workout?"
           → System prompt includes: "Interests: running, fitness. Goals: complete a marathon."
           → AI answers as your personal trainer, not a stranger.
```

---

## Architecture: Four Layers of Context

Every chat request now builds the system prompt from four layers, from broadest to most specific:

```
"You are a highly personalized AI assistant."
│
├─ Layer 1: Long-term user profile (UserMemory — cross-conversation)
│     "Interested in running, cooking. Working toward: complete a marathon."
│     "Active projects: NovaAI chatbot. Challenges: time management."
│
├─ Layer 2: Conversation summary (thread.summary — this thread's history)
│     "User has been asking about marathon training. Discussed diet and rest."
│
├─ Layer 3: Thread-level profile (thread.profile — this thread's extracted context)
│     "Active context: planning marathon training schedule."
│     "Facts: prefers evening runs, lives in a cold climate."
│
└─ Layer 4: RAG context (semantic search — semantically relevant past messages)
      "Previous message about interval training (score: 0.72)"
```

Each layer is narrower and more recent than the one above it. Together, they give the model a rich, layered view of who the user is and what they're doing.

---

## Data Model: UserMemory

One document per user in a new `usermemories` MongoDB collection. It grows with every conversation.

```javascript
{
  userId:             ObjectId,         // unique ref to User — one document per user
  interests:          [String],         // hobbies, passions, subjects the user talks about
  goals:              [String],         // things the user is trying to achieve
  lifeEvents:         [String],         // recent or notable life events mentioned
  ongoingProjects:    [String],         // active work the user is doing
  preferences:        [String],         // how the user likes to work, communicate, learn
  challenges:         [String],         // recurring difficulties the user faces
  longTermObjectives: [String],         // big-picture aspirations (5-year+ scale)
  topicFrequency: [{                    // how often each topic area comes up
    topic:         String,              // one of 8 predefined categories
    count:         Number,
    lastDiscussed: Date
  }],
  memoryHighlights: [{                  // log of newly learned facts (last 20)
    type:      String,                  // 'interest' | 'goal' | 'project' | 'challenge' | 'preference' | 'objective'
    content:   String,
    createdAt: Date
  }],
  profileSummary: String,               // auto-generated 2-3 sentence paragraph
  lastUpdated:    Date
}
```

**Index:** `{ userId: 1 }` — unique, ensures one document per user and fast lookup.

---

## Extraction Pipeline

The new `extractUserMemory` function runs as the third step in the background task chain after each chat reply:

```
extractProfileData(thread)          — updates thread.profile (per-thread)
    .then(() => maybeSummarize(thread))  — updates thread.summary (per-thread)
    .then(() => extractUserMemory(thread, userId))  ← NEW: updates UserMemory (per-user)
    .catch(err => console.log(...));
```

All three steps are sequential (no parallel saves), fire after `res.end()`, and never block the response the user sees.

### How extraction works

1. Takes the last 6 messages from the thread (same window as `extractProfileData`)
2. Sends them to `getOpenAIJSONResponse` with a structured extraction prompt
3. The model returns a JSON object with 8 arrays
4. New items are identified (not already in UserMemory) → added to `memoryHighlights`
5. Arrays are merged using Set-based deduplication (same pattern as `extractProfileData`)
6. Topic frequency counts are incremented
7. `profileSummary` is regenerated from a template (no extra API call)
8. `UserMemory.save()` — always a different document from Thread, so no ParallelSaveError

### Extraction prompt schema

```json
{
  "interests":          ["running", "cooking"],
  "goals":              ["finish a marathon", "learn to cook Japanese food"],
  "lifeEvents":         ["recently graduated from college"],
  "ongoingProjects":    ["building a MERN stack chatbot for portfolio"],
  "preferences":        ["prefers concise bullet-point answers"],
  "discussedTopics":    ["Fitness", "Career"],
  "challenges":         ["struggles with time management"],
  "longTermObjectives": ["become a senior software engineer within 3 years"]
}
```

`discussedTopics` is constrained to this exact list: **Travel, Fitness, Relationships, Finance, Career, Education, Entertainment, Technology**. The prompt instructs the model to only return values from this list.

### Profile summary generation (template-based, zero extra API calls)

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

Example output: *"Interested in running, cooking, fitness. Working toward: finish a marathon and learn Japanese cooking. Currently working on building a MERN stack chatbot for portfolio. Long-term: become a senior software engineer within 3 years."*

---

## System Prompt Injection

At the top of the POST /api/chat handler, UserMemory is fetched with a single indexed lookup before building the system prompt:

```javascript
const userMemory = await UserMemory.findOne({ userId: req.user.userId });
```

If the user has no memory yet (first few conversations), `userMemory` is null and the injection is skipped gracefully. On subsequent conversations, the prompt includes:

```
Long-term profile of this user:
Interested in running, cooking, fitness. Working toward: finish a marathon.
- Interests: running, cooking, fitness, technology, software development
- Goals: finish a marathon, learn Japanese cooking
- Active projects: building a MERN stack chatbot for portfolio
- Recurring challenges: time management
```

The injection is capped (interests: 5, goals: 3, projects: 3, challenges: 3) to avoid bloating the prompt. Total added tokens: ~50–150 per request.

---

## Files Changed

| File | Change |
|---|---|
| `Backend/models/UserMemory.js` | New Mongoose model — one document per user |
| `Backend/routes/userMemory.js` | New `GET /api/user-memory` — returns UserMemory for current user |
| `Backend/routes/chat.js` | Import UserMemory; add `PREDEFINED_TOPICS`, `generateProfileSummary`, `extractUserMemory`; fetch userMemory in handler; inject into system prompt (Layer 1); extend background chain |
| `Backend/server.js` | Mount `userMemoryRoutes` under `/api` (protected by existing verifyToken) |
| `Frontend/src/PersonalInsightsDrawer.jsx` | New Personal Profile drawer component |
| `Frontend/src/PersonalInsightsDrawer.css` | Chip colour variants + highlight timeline styles |
| `Frontend/src/ChatWindow.jsx` | Import PersonalInsightsDrawer; add `isProfileOpen` state; add 3rd navbar icon (user-astronaut); render drawer |

**New files: 4. Modified files: 3. Total: 7.**

---

## Personal Insights Dashboard (UI)

A drawer panel that opens when the user clicks the astronaut icon in the navbar. Fetches `GET /api/user-memory` on each open to always show current data.

```
┌─────────────────────────────────────────────┐
│  🧑‍🚀 Personal Profile                  [✕]  │
│                                             │
│  ABOUT YOU                                  │
│  ┌─────────────────────────────────────┐   │
│  │ Interested in running, cooking.     │   │
│  │ Working toward: finish a marathon.  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  INTERESTS                                  │
│  [running] [cooking] [fitness]              │
│                                             │
│  GOALS                                      │
│  [finish a marathon] [learn Japanese...]    │
│                                             │
│  ONGOING PROJECTS                           │
│  [building a MERN stack chatbot]            │
│                                             │
│  FREQUENT TOPICS                            │
│  Fitness  ████████░░  8×                   │
│  Career   █████░░░░░  5×                   │
│  Tech     ███░░░░░░░  3×                   │
│                                             │
│  MEMORY HIGHLIGHTS                          │
│  🎯 New goal: finish a marathon             │
│  ⭐ New interest: running                   │
│  📁 New project: MERN chatbot               │
│                                             │
└─────────────────────────────────────────────┘
```

Sections are hidden when they have no data. The empty state shows: *"Your long-term profile is being built. Chat more and NovaAI will learn your interests, goals, and projects across all conversations."*

---

## Testing Steps

### Setup

```bash
cd Backend && npm run dev
cd Frontend && npm run dev
```

### Test 1: First conversation — empty profile

1. Log in and start a new chat
2. Open Personal Profile drawer (astronaut icon)
3. **Expected:** Empty state message: "Your long-term profile is being built."

### Test 2: Profile populates after a few messages

1. Chat about yourself: "I'm a software engineering student working on a React portfolio project. My goal is to get a full-stack internship this year."
2. Wait 3–5 seconds for background extraction to run
3. Open Personal Profile drawer
4. **Expected:** Sections appear — Interests (software engineering, React), Goals (get full-stack internship), Projects (React portfolio)
5. **Expected backend log:** `[UserMemory] Updated long-term profile for user <id>`

### Test 3: Profile persists across new conversations

1. Note what's in your profile
2. Click "New Chat" to start a fresh conversation
3. Send a message on a completely unrelated topic
4. **Expected:** AI references your profile naturally (e.g., recognises you're a developer) even in a brand-new thread

### Test 4: Topic frequency tracking

1. Have several conversations about careers, coding, and job interviews
2. Open Personal Profile drawer
3. **Expected:** Career and Technology appear in Frequent Topics with the correct count

### Test 5: Memory Highlights — new items appear

1. Mention a new interest or goal you haven't mentioned before
2. Open Personal Profile drawer
3. **Expected:** Memory Highlights shows the newly learned item at the top

### Test 6: System prompt injection visible in personalization

1. Tell the AI you prefer bullet points in one conversation
2. Start a new conversation
3. Ask a question — **Expected:** AI uses bullet points without you asking

### Test 7: MongoDB verification

Check `usermemories` collection directly:
```
db.usermemories.find({ userId: ObjectId("...") }).pretty()
```
Verify interests, goals, topicFrequency, memoryHighlights are all populated.

---

## Resume Bullets

- Built a cross-conversation long-term memory system using a dedicated MongoDB `UserMemory` collection — extracted user interests, goals, projects, and challenges from conversations using GPT-4o-mini, then injected them into the system prompt for every subsequent chat, making the AI aware of who the user is across all threads
- Designed a four-layer personalisation architecture: long-term user profile → conversation summary → thread-level profile → RAG semantic context — each layer narrower and more recent than the last, giving the model layered context at zero extra latency for the user
- Implemented topic frequency tracking across 8 predefined categories (Career, Technology, Fitness, etc.), incrementing counts per conversation and surfacing them in a Personal Insights dashboard
- Built a Memory Highlights log that tracks newly-learned facts about the user (interest, goal, project, challenge) and displays them in a chronological timeline — giving users visibility into what the AI has learned about them
- Generated a dynamic user profile summary using a template-based approach (zero extra API calls) — updated after each conversation as new information accumulates
- Extended the background task chain from 2 to 3 sequential steps: `extractProfileData → maybeSummarize → extractUserMemory` — all non-blocking, chained with `.then()` to prevent Mongoose ParallelSaveError

---

## Interview Questions and Answers

**"What's the difference between thread-level profile and long-term memory?"**

Thread-level profile (`thread.profile`) stores facts extracted from the current conversation only. It lives in the Thread document and is reset for each new chat. Long-term memory (`UserMemory`) is a separate document, one per user, that accumulates across every conversation ever. When you start a new thread, the thread profile is empty — but the long-term memory already knows who you are. The two work at different scopes: thread-level for immediate context, long-term for identity.

**"Why a separate UserMemory collection instead of just adding fields to the User model?"**

Separation of concerns. The User model handles authentication — email, password hash. Mixing personal AI memory into it would conflate authentication data with application data, making the model harder to reason about and test. A dedicated collection also makes queries cleaner (no projection needed to exclude sensitive auth fields), easier to delete or reset independently, and simpler to scale separately if memory gets large.

**"How do you prevent the long-term memory from growing unbounded?"**

Two caps: memoryHighlights is capped at 20 entries (oldest dropped when the array exceeds 20). The string arrays (interests, goals, etc.) use Set-based deduplication so the same item is only stored once. For a portfolio project, there is no hard cap on unique items — the practical limit is how many distinct things a user actually talks about. In production, you'd add a max-size constraint and a periodic relevance decay (down-weighting rarely mentioned interests over time).

**"How does long-term memory affect response latency?"**

One extra MongoDB query — `UserMemory.findOne` with a unique userId index — runs before the stream starts. In practice this adds 1–5ms per request, which is invisible relative to the 700ms+ TTFT already measured. The memory extraction itself runs non-blocking after the response is complete, so it never affects the user-facing latency at all.

**"How is the profile summary generated without an extra API call?"**

Template-based string construction. After each extraction, I build a 2–4 sentence paragraph by concatenating the top entries from each memory category: "Interested in {top 3 interests}. Working toward: {top 2 goals}..." and so on. It's deterministic, instant, and free. An alternative would be a GPT-4o-mini call to write a natural-sounding paragraph — that would read better but add 500ms and cost to every background extraction. For a portfolio project, the template approach is the right call.

**"What would you improve with more time?"**

Three things: First, memory decay — facts learned a year ago should carry less weight than recent ones. A `confidence` score that decays with time would make the profile more accurate. Second, user-controlled memory — let the user view, edit, and delete specific entries from the dashboard. Right now it's a black box. Third, embedding the UserMemory for semantic search — instead of injecting the full profile as text, embed it and retrieve the most relevant facts per request, similar to the existing RAG pipeline. This would reduce prompt bloat as the profile grows large.
