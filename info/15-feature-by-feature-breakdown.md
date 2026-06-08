# 15 — Feature-by-Feature Breakdown

**Purpose:** This file lists every user-facing and technical feature in NovaAI and explains each one completely — what it does from the user's perspective, how it works technically, which files implement it, and what you would say about it in an interview. Use this as your reference when asked "Tell me about a feature you built."

**Learning Value:** ⭐⭐⭐⭐⭐ (Your go-to reference for any "tell me about X" interview question)
**Interview Importance:** ⭐⭐⭐⭐⭐ (Essential for behavioral and technical questions)
**Estimated Reading Time:** 70–90 minutes
**Prerequisites:** 14-complete-project-architecture.md

---

## Table of Contents

1. [Feature 1: Real-Time AI Streaming](#feature-1-real-time-ai-streaming)
2. [Feature 2: Multi-Turn Conversation History](#feature-2-multi-turn-conversation-history)
3. [Feature 3: Thread Management](#feature-3-thread-management)
4. [Feature 4: JWT Authentication](#feature-4-jwt-authentication)
5. [Feature 5: RAG — Semantic Memory](#feature-5-rag-semantic-memory)
6. [Feature 6: Conversation Summarization](#feature-6-conversation-summarization)
7. [Feature 7: AI-Extracted Thread Profile](#feature-7-ai-extracted-thread-profile)
8. [Feature 8: Long-Term Personal Memory](#feature-8-long-term-personal-memory)
9. [Feature 9: Personal Insights Drawer](#feature-9-personal-insights-drawer)
10. [Feature 10: Usage Analytics Dashboard](#feature-10-usage-analytics-dashboard)
11. [Feature 11: Markdown Rendering with Syntax Highlighting](#feature-11-markdown-rendering)
12. [Feature 12: Typing Cursor Animation](#feature-12-typing-cursor-animation)
13. [Feature 13: Suggestion Chips on Empty State](#feature-13-suggestion-chips)
14. [Feature 14: Auto-Expanding Textarea](#feature-14-auto-expanding-textarea)
15. [Feature 15: Navbar with Three Drawers](#feature-15-navbar-drawers)
16. [Feature 16: Token Breakdown Bar Chart](#feature-16-token-breakdown-bar-chart)
17. [Feature 17: Two-Click Delete Confirmation](#feature-17-two-click-delete)
18. [Feature 18: Background Task Chain](#feature-18-background-task-chain)
19. [Feature 19: Automatic 401 Logout](#feature-19-automatic-401-logout)
20. [Feature 20: Optimistic UI Updates](#feature-20-optimistic-ui-updates)

---

## Feature 1: Real-Time AI Streaming

**User experience:** The AI's response appears word-by-word as it's generated, just like ChatGPT. A blinking cursor shows the AI is still "typing."

**Technical implementation:**
- Backend: SSE headers + `res.flushHeaders()` opens channel before any data
- OpenAI call with `stream: true` proxied via `res.write()` per token
- Frontend: `fetch().body.getReader()` + `TextDecoder` + buffer-split pattern
- Each token → `setStreamingReply(assembled)` → React re-renders

**Files:** `Backend/routes/chat.js`, `Backend/utils/openai.js`, `Frontend/src/ChatWindow.jsx`, `Frontend/src/Chat.jsx`

**One-line for interview:** "I implemented real-time streaming using Server-Sent Events, proxying OpenAI's token stream through Node.js to the browser with a line-buffering pattern that handles partial JSON lines — achieving an average TTFT of 749ms."

---

## Feature 2: Multi-Turn Conversation History

**User experience:** The AI remembers everything said earlier in the current conversation.

**Technical implementation:**
- All messages stored in the Thread document's `messages` array
- On thread load: `GET /api/thread/:threadId` returns all messages (system msg filtered out)
- Frontend sets `prevChats` from the response
- On each AI call: last 6 messages sent verbatim as context (sliding window)
- Full history preserved in MongoDB regardless of window size

**Files:** `Backend/routes/chat.js`, `Frontend/src/Sidebar.jsx`, `Frontend/src/Chat.jsx`

**Key design choice:** Messages are embedded in Thread (not a separate collection) — one DB read fetches the entire conversation.

---

## Feature 3: Thread Management

**User experience:** Users can create new chats, switch between past conversations, and delete threads. The sidebar shows all threads sorted by most recent.

**Technical implementation:**

**Creating a new thread:**
- `createNewChat()` in Sidebar: sets `currThreadId` to a new UUID, `setPrevChats([])`, `setNewChat(true)`
- UUID generated client-side via `uuid v1`
- Thread only created in DB when first message is sent

**Switching threads:**
- `changeThread(threadId)`: calls `GET /api/thread/:threadId`, sets `prevChats`, `setThreadProfile`
- `setCurrThreadId(threadId)`, `setNewChat(false)`

**Deleting threads:**
- Two-click confirmation: first click sets `pendingDelete` state, 3-second auto-cancel via `setTimeout`
- Second click: `DELETE /api/thread/:threadId`, then `setAllThreads(filter)`
- If deleting current thread: calls `createNewChat()`
- `e.stopPropagation()` on the delete zone prevents click bubbling to `changeThread`

**The sidebar bug we fixed:**
- **Bug 1 — Delete:** The "Delete?" label was inside `.delete-zone` but outside `<i>`, so clicking it bubbled up to `<li onClick=changeThread>` instead of confirming delete. Fixed by moving `onClick` to `.delete-zone` with `e.stopPropagation()`.
- **Bug 2 — New thread:** `useEffect([currThreadId])` refetched thread list whenever `currThreadId` changed, overwriting the optimistic new thread entry. Fixed by changing to `useEffect([], [])` (mount only).

**Files:** `Frontend/src/Sidebar.jsx`, `Backend/routes/chat.js`

---

## Feature 4: JWT Authentication

**User experience:** Users register and log in with email/password. The session lasts 7 days. Token expiry shows the login screen automatically.

**Technical implementation:**
- Registration: `bcrypt.hash(password, 10)` → save User → `jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" })`
- Login: `User.findOne({ email })` → `bcrypt.compare(password, hash)` → new JWT
- Frontend: token in `localStorage`, decoded on startup via `atob()` to check `exp`
- `authFetch` wrapper adds `Authorization: Bearer <token>` to every request
- `verifyToken` middleware validates JWT, attaches `req.user` to request object
- Every DB query uses `req.user.userId` — never `req.body.userId` (IDOR prevention)

**The auto-logout pattern:**
- `authFetch.js` exports `setUnauthorizedHandler()` at module level
- `App.jsx` calls `setUnauthorizedHandler(handleLogout)` on mount
- Any 401 response triggers `handleLogout()` globally — no component needs to handle it individually

**Files:** `Backend/routes/auth.js`, `Backend/middleware/auth.js`, `Frontend/src/utils/authFetch.js`, `Frontend/src/App.jsx`

---

## Feature 5: RAG — Semantic Memory

**User experience:** The AI recalls relevant things from earlier in the conversation without the user having to repeat themselves. If you mentioned being a CS student in message 5 and ask something 20 messages later, the AI still knows.

**Technical implementation:**
- Every user message and assistant reply is embedded via `text-embedding-3-small` (1536-dim vector)
- On each new message: embed the incoming message, compute cosine similarity against all past embedded messages
- Top 3 matches with score > 0.4 are injected into the system prompt as Layer 4
- `ragUsed` boolean tracked in Analytics — 36% usage rate measured

**The cosine similarity function:**
```javascript
const cosineSimilarity = (vecA, vecB) => {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
```

**Files:** `Backend/routes/chat.js` (cosineSimilarity, RAG pipeline), `Backend/utils/openai.js` (getOpenAIEmbedding)

---

## Feature 6: Conversation Summarization

**User experience:** Invisible to the user. Long conversations don't become slower or more expensive — the AI maintains full context awareness without the cost growing linearly.

**Technical implementation:**
- `SUMMARY_THRESHOLD = 14` messages minimum
- `RECENT_WINDOW = 6` messages always kept verbatim
- `maybeSummarize()` runs in background after each message
- Rebuilt every 4 new messages after threshold (cadence control via `builtFromMessageCount`)
- Non-streaming GPT call: "Summarize in 3–5 sentences. Capture key facts, questions asked, conclusions."
- Stored as `thread.summary.content`
- Injected as Layer 2 of system prompt

**Cost impact:** ~67% reduction in prompt tokens for a 30+ message thread.

**Files:** `Backend/routes/chat.js` (`maybeSummarize`, `generateSummary`)

---

## Feature 7: AI-Extracted Thread Profile

**User experience:** Visible via the "Memory" drawer (brain icon). Shows the AI's extracted understanding of: current focus, known facts about the user, and inferred preferences.

**Technical implementation:**
- `extractProfileData()` runs as first background task after each response
- Sends last 6 messages to GPT in JSON mode: extracts `{ userFacts, preferences, activeContext }`
- Merged with existing `thread.profile` using Set deduplication
- Injected as Layer 3 of system prompt on next request
- Displayed in the Agent Memory drawer

**Files:** `Backend/routes/chat.js` (`extractProfileData`), `Frontend/src/ChatWindow.jsx` (drawer render)

---

## Feature 8: Long-Term Personal Memory

**User experience:** The AI knows who you are across all conversations. Interests, goals, and projects you mentioned weeks ago still inform its responses today.

**Technical implementation:**
- `extractUserMemory()` runs as third background task
- JSON mode extraction: 7 categories + 8 predefined topic names
- Merged with existing UserMemory using Set deduplication (no duplicates)
- New items tracked in `memoryHighlights` (capped at 20)
- Topic frequency counters incremented per predefined topic
- `generateProfileSummary()` generates summary string without API call
- Injected as Layer 1 (broadest) of system prompt

**Files:** `Backend/routes/chat.js` (`extractUserMemory`, `generateProfileSummary`), `Backend/models/UserMemory.js`

---

## Feature 9: Personal Insights Drawer

**User experience:** Users can open a drawer (astronaut icon) to see their accumulated profile: interests, goals, projects, challenges, topic frequency bars, and a timeline of when each new item was first discovered.

**Technical implementation:**
- `PersonalInsightsDrawer.jsx` fetches `GET /api/user-memory` on open
- Chip UI: one chip per item per category
- Frequency bars: `width: (count / maxCount * 100)%` in CSS
- Timeline: `memoryHighlights` sorted by `createdAt`, formatted with `timeAgo()`
- Color-coded by type: interest (blue), goal (green), project (purple), etc.

**Files:** `Frontend/src/PersonalInsightsDrawer.jsx`, `Backend/routes/userMemory.js`

---

## Feature 10: Usage Analytics Dashboard

**User experience:** Users can see exactly how much they've spent, average response times, token usage breakdown, and how often the AI is using past context (RAG rate).

**Technical implementation:**
- `AnalyticsDrawer.jsx` fetches `GET /api/analytics` on open
- Backend: 2-stage MongoDB aggregation (`$match userId` → `$group` all metrics)
- Computed: sum tokens, sum cost, average latency, average TTFT, RAG rate
- Runs in parallel with `Thread.countDocuments()` via `Promise.all`
- UI: 6 stat cards + token breakdown bar + RAG activity message

**Real numbers from testing:** $0.0238 total, $0.0005/msg, 749ms TTFT, 36% RAG rate, 74/26 token split.

**Files:** `Frontend/src/AnalyticsDrawer.jsx`, `Backend/routes/analytics.js`, `Backend/models/Analytics.js`

---

## Feature 11: Markdown Rendering with Syntax Highlighting

**User experience:** AI responses render as formatted markdown — headers, bold text, bullet lists, code blocks with syntax highlighting by language.

**Technical implementation:**
- `react-markdown` renders markdown to React elements
- `rehype-highlight` plugin applies syntax highlighting via `highlight.js`
- Applied to both completed messages in `prevChats` and the live streaming bubble
- Streaming markdown renders correctly even when partially received (react-markdown is forgiving of incomplete markdown)

**Files:** `Frontend/src/Chat.jsx`

**Interview talking point:** Streaming partial markdown is a subtle challenge — a code block might start on token 50 and close on token 200. react-markdown handles this gracefully by treating incomplete markdown as best-effort.

---

## Feature 12: Typing Cursor Animation

**User experience:** While the AI is generating a response, a blinking cursor appears at the end of the text — the classic "typewriter" effect.

**Technical implementation:**
```css
.typing-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background-color: var(--accent-primary);
    animation: cursor-blink 0.8s step-end infinite;
}

@keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
}
```

`step-end` — instant toggle, not a smooth fade. Matches a real terminal cursor.

The cursor only renders when `streamingReply` is non-empty. When `setStreamingReply("")` is called at stream end, the streaming div disappears entirely and the cursor goes with it.

**Files:** CSS file (ChatWindow.css or App.css), `Frontend/src/Chat.jsx`

---

## Feature 13: Suggestion Chips on Empty State

**User experience:** When a new chat is started and no messages exist, suggestion chips appear: "Explain quantum computing", "Help me prepare for an interview", etc. Clicking one pre-fills the input.

**Technical implementation:**
- `Chat.jsx` renders chips when `prevChats.length === 0 && !streamingReply`
- `onClick`: `setPrompt(suggestion)` fills the textarea
- The user can then edit or send directly

**Files:** `Frontend/src/Chat.jsx`

---

## Feature 14: Auto-Expanding Textarea

**User experience:** The input textarea grows as you type multiple lines and shrinks back after sending. Caps at 150px height.

**Technical implementation:**
```javascript
const textareaRef = useRef(null);

// In onChange:
e.target.style.height = 'auto';  // reset to auto
e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;  // set to content height

// After send:
textareaRef.current.style.height = "auto";  // reset
```

`scrollHeight` is the content height — how tall the textarea would be with no height restriction. Setting `height = 'auto'` first is critical — without it, `scrollHeight` reflects the current height, not the content height.

**Files:** `Frontend/src/ChatWindow.jsx`

---

## Feature 15: Navbar Drawers

**User experience:** Three icons in the top-right navbar open slide-out drawers:
- Chart icon → Analytics Dashboard
- Brain icon → Agent Memory (thread profile)
- Astronaut icon → Personal Insights (UserMemory)

**Technical implementation:**
- Three boolean states: `isAnalyticsOpen`, `isOpen` (agent memory), `isProfileOpen`
- Opening one closes the others: `setIsAnalyticsOpen(false); setIsProfileOpen(false); setIsOpen(true)`
- Drawers slide in via CSS transition on `.insights-drawer.open` class
- Overlay click closes: `<div className="drawer-overlay" onClick={() => setIsOpen(false)}>`

**Files:** `Frontend/src/ChatWindow.jsx`, `Frontend/src/AnalyticsDrawer.jsx`, `Frontend/src/PersonalInsightsDrawer.jsx`

---

## Feature 16: Token Breakdown Bar Chart

**User experience:** In the Analytics drawer, a horizontal bar shows what percentage of tokens were prompt vs completion.

**Technical implementation:**
```jsx
<div className="token-bar">
    <div className="bar-prompt" style={{ width: `${promptPercent}%` }}>
        {promptPercent}% Prompt
    </div>
    <div className="bar-completion" style={{ width: `${completionPercent}%` }}>
        {completionPercent}% Completion
    </div>
</div>
```

Where:
```javascript
const promptPercent = Math.round(totalPromptTokens / totalTokens * 100);
const completionPercent = 100 - promptPercent;
```

The result from the 45-message test: 74% prompt, 26% completion — visually representing why prompt engineering and context management matter for costs.

**Files:** `Frontend/src/AnalyticsDrawer.jsx`

---

## Feature 17: Two-Click Delete Confirmation

**User experience:** Clicking the trash icon once shows "Delete?" text. Clicking again within 3 seconds deletes. Auto-cancels if you click elsewhere or wait.

**Technical implementation:**
```javascript
const [pendingDelete, setPendingDelete] = useState(null);

// In delete-zone onClick:
if (isPending) {
    deleteThread(thread.threadId);
    setPendingDelete(null);
} else {
    setPendingDelete(thread.threadId);
    setTimeout(() => setPendingDelete(p => p === thread.threadId ? null : p), 3000);
}
```

The `setTimeout` callback uses the functional form `p => p === thread.threadId ? null : p` — it only clears `pendingDelete` if it's still the same thread (prevents accidentally canceling a second delete confirmation that started before the timeout fired).

**The stopPropagation fix:** The entire delete-zone div (not just the trash icon) has `e.stopPropagation()` — so clicking "Delete?" doesn't bubble to the `<li>` handler which would call `changeThread()`.

**Files:** `Frontend/src/Sidebar.jsx`

---

## Feature 18: Background Task Chain

**User experience:** Invisible. After every AI response, three AI-powered analysis tasks run silently — updating your profile, summarizing the conversation, and updating your long-term memory — without delaying the response you just received.

**Technical implementation:**
```javascript
// After res.end() — connection already closed:
extractProfileData(thread)
    .then(() => maybeSummarize(thread))
    .then(() => extractUserMemory(thread, req.user.userId))
    .catch(err => console.log("Background task error:", err));
```

**Why sequential:** `extractProfileData` and `maybeSummarize` both call `thread.save()`. Running them in parallel would cause a Mongoose `ParallelSaveError`.

**Why not `await`:** The chain is fire-and-forget. The user's HTTP connection is already closed at this point.

**Files:** `Backend/routes/chat.js`

---

## Feature 19: Automatic 401 Logout

**User experience:** If the user's token expires while they're using the app, they're automatically redirected to the login screen without needing to manually log out or refresh.

**Technical implementation:**
```javascript
// authFetch.js — module-level callback:
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (handler) => { unauthorizedHandler = handler; };

const authFetch = async (url, options = {}) => {
    // ...
    if (response.status === 401) {
        localStorage.removeItem("token");
        if (unauthorizedHandler) unauthorizedHandler();
    }
    return response;
};

// App.jsx — registers the handler once on mount:
useEffect(() => {
    setUnauthorizedHandler(handleLogout);
}, []);
```

**The module-level pattern:** `unauthorizedHandler` is a module-level variable (not React state). This means any component that calls `authFetch` triggers the same logout handler — registered once at app startup, available everywhere without prop drilling or context.

**Files:** `Frontend/src/utils/authFetch.js`, `Frontend/src/App.jsx`

---

## Feature 20: Optimistic UI Updates

**User experience:** Your message appears instantly after pressing Enter, before the server confirms anything. The new thread appears in the sidebar immediately.

**Technical implementation:**
```javascript
// Show user message before any network request:
setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

// Show thread in sidebar before server creates it:
if (isFirstMessage) {
    setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);
}
```

**The fake→real swap (React 18 batching):** When `setNewChat(false)` (removes the fake "New Chat" li) and `setAllThreads(push)` (adds the real entry) happen in the same event handler, React 18 batches them into a single render. The fake entry disappears and the real entry appears in the same frame — no flicker.

**Files:** `Frontend/src/ChatWindow.jsx`, `Frontend/src/Sidebar.jsx`
