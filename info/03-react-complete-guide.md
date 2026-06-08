# 03 — React Complete Guide

**Purpose:** The entire NovaAI frontend is built with React 19. This file explains every React concept used in the project — components, state, props, hooks, context, and rendering — with real examples from the code. By the end, you should be able to trace exactly how a user's message flows from the textarea to the screen.

**Learning Value:** ⭐⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐⭐
**Estimated Reading Time:** 90–120 minutes
**Prerequisites:** 02-javascript-fundamentals.md

---

## Table of Contents

1. [What React Is and Why It Exists](#1-what-react-is-and-why-it-exists)
2. [Components — The Building Blocks](#2-components)
3. [JSX — HTML Inside JavaScript](#3-jsx)
4. [Props — Passing Data Down](#4-props)
5. [State — Making Things Change](#5-state)
6. [The Context API — Global State](#6-the-context-api)
7. [useEffect — Side Effects and Lifecycle](#7-useeffect)
8. [useRef — Direct DOM Access](#8-useref)
9. [Event Handling](#9-event-handling)
10. [Rendering Lists and Conditional Rendering](#10-rendering-lists-and-conditional-rendering)
11. [React Markdown and Syntax Highlighting](#11-react-markdown-and-syntax-highlighting)
12. [Optimistic UI Updates](#12-optimistic-ui-updates)
13. [React Batching and the New Chat Bug Fix](#13-react-batching)
14. [How App.jsx Bootstraps the Application](#14-how-appjsx-bootstraps)
15. [NovaAI's Complete Component Tree](#15-novaais-complete-component-tree)
16. [Summary](#16-summary)
17. [Interview Questions and Answers](#17-interview-questions-and-answers)

---

## 1. What React Is and Why It Exists

### The Problem with Vanilla JavaScript

Before frameworks like React, developers built UIs with plain JavaScript and directly manipulated the DOM (the tree structure of HTML elements):

```javascript
// Vanilla JS — manually updating the DOM
const list = document.getElementById("messages");
const li = document.createElement("li");
li.textContent = "Hello!";
list.appendChild(li);

// When the message changes, you have to find it and update it manually:
const allItems = document.querySelectorAll("li");
allItems[2].textContent = "Updated message";
```

This becomes a nightmare for complex applications:
- You have to manually track which elements need updating and when
- State (your data) and the UI can drift out of sync
- Code becomes a tangled mess of DOM queries and event listeners

### React's Core Idea: UI = f(state)

React's insight is elegant: **the UI is a function of your state**.

```
UI = f(state)
```

You describe **what** the UI should look like given the current data. React figures out **how** to update the DOM to match. You never manually touch the DOM.

```javascript
// React — you describe what to show
function MessageList({ messages }) {
  return (
    <ul>
      {messages.map(msg => <li key={msg.id}>{msg.content}</li>)}
    </ul>
  );
}
```

When `messages` changes, React automatically re-renders `MessageList` and updates only the parts of the DOM that changed.

### The Virtual DOM

Directly touching the real DOM is slow. React maintains a **Virtual DOM** — a lightweight JavaScript representation of the real DOM. When state changes:

1. React creates a new Virtual DOM tree
2. It **diffs** the new tree against the previous one (finds what changed)
3. It applies only the minimal set of changes to the real DOM

This is why React is fast — instead of rebuilding the entire page, it surgically updates only what changed.

### React 19

NovaAI uses React 19 (the latest version). The changes in React 19 are mostly under-the-hood improvements. The core concepts you'll learn here (components, hooks, context) are the same as React 16/17/18.

---

## 2. Components

A **component** is a reusable piece of UI. Every piece of NovaAI's interface is a component.

### What a Component Looks Like

A component in modern React is just a JavaScript function that returns JSX (HTML-like syntax):

```javascript
function Sidebar() {
  return (
    <section className="sidebar">
      <button>New Chat</button>
      <ul>
        {/* thread list goes here */}
      </ul>
    </section>
  );
}
```

Components:
- Start with a capital letter (React uses this to distinguish components from HTML tags)
- Return JSX
- Can use hooks (like `useState`, `useEffect`)
- Can be imported and used inside other components

### NovaAI's Component Structure

```
App.jsx
├── Login.jsx          (shown when not logged in)
├── Register.jsx       (shown when registering)
└── Main Layout        (shown when logged in)
    ├── Sidebar.jsx
    │   └── (thread list items, rendered inline)
    └── ChatWindow.jsx
        ├── AnalyticsDrawer.jsx
        ├── PersonalInsightsDrawer.jsx
        ├── (Agent Memory drawer — rendered inline)
        └── Chat.jsx
```

`App.jsx` decides which top-level component to show based on whether the user is logged in. `ChatWindow.jsx` contains the main chat interface and the navigation drawers.

---

## 3. JSX

JSX is what makes React components readable. It looks like HTML inside JavaScript, but it is neither — it's a syntax extension that compiles to plain JavaScript function calls.

### JSX Basics

```jsx
// JSX:
<div className="sidebar">
  <h1>Hello, {user.name}!</h1>
  <button onClick={handleClick}>Click me</button>
</div>
```

This compiles to:
```javascript
React.createElement("div", { className: "sidebar" },
  React.createElement("h1", null, "Hello, ", user.name, "!"),
  React.createElement("button", { onClick: handleClick }, "Click me")
);
```

You write JSX, the build tool (Vite) compiles it to `createElement` calls, which React uses to build the Virtual DOM.

### JSX Rules

**1. Return one root element.** Every component can only return one top-level element:

```jsx
// ❌ Error — two root elements
return (
  <div>Hello</div>
  <div>World</div>
);

// ✅ Wrap in a container:
return (
  <div>
    <div>Hello</div>
    <div>World</div>
  </div>
);

// ✅ Or use a Fragment (no extra DOM element):
return (
  <>
    <div>Hello</div>
    <div>World</div>
  </>
);
```

**2. Use `className` instead of `class`** (because `class` is a reserved JavaScript keyword):
```jsx
<div className="sidebar">...</div>   // ✅
<div class="sidebar">...</div>       // ❌ in JSX
```

**3. Embed JavaScript expressions with `{}`:**
```jsx
<span>{user.email}</span>
<li className={thread.threadId === currThreadId ? "highlighted" : ""}>
```

**4. Self-close elements with no children:**
```jsx
<input type="text" />
<img src="logo.png" alt="logo" />
<i className="fa-solid fa-trash" />
```

---

## 4. Props

Props (short for "properties") are how you pass data from a parent component to a child component. They flow in one direction: parent → child.

### Passing Props

```jsx
// Parent component passes props:
<AnalyticsDrawer isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />
```

```jsx
// Child component receives props:
function AnalyticsDrawer({ isOpen, onClose }) {
  if (!isOpen) return null;  // don't render if not open

  return (
    <div className="insights-drawer open">
      <button onClick={onClose}>Close</button>
      {/* ... */}
    </div>
  );
}
```

`isOpen` controls whether the drawer is visible. `onClose` is a function prop — when the close button is clicked, it calls `onClose()`, which runs `() => setIsAnalyticsOpen(false)` in the parent, changing the parent's state.

### Props Are Read-Only

A child component **cannot modify its props**. Props flow one way. If the child needs to change something in the parent, it does so by calling a function passed down as a prop.

### Children as Prop

The special `children` prop contains anything you put between a component's tags:

```jsx
<Button>Click me!</Button>
// "Click me!" is props.children inside Button
```

---

## 5. State

State is data that belongs to a component and can change over time. When state changes, React automatically re-renders the component.

### useState Hook

```javascript
const [value, setValue] = useState(initialValue);
```

- `value` — the current state value
- `setValue` — function to update it
- `initialValue` — what it starts as

```javascript
// In ChatWindow.jsx:
const [loading, setLoading] = useState(false);
const [isOpen, setIsOpen] = useState(false);
const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
```

### How Re-Renders Work

When you call a setter function, React:
1. Schedules a re-render of that component (and its children)
2. Runs the component function again with the new state value
3. Diffs the new Virtual DOM against the old one
4. Updates only what changed in the real DOM

```javascript
// Before: loading = false → spinner is hidden
setLoading(true);
// After: loading = true → component re-renders → spinner appears
```

### The Functional Update Pattern

When the new state depends on the previous state, use the functional form to avoid stale state bugs:

```javascript
// ❌ Potentially wrong — prevChats might be stale:
setPrevChats([...prevChats, newMessage]);

// ✅ Always correct — React guarantees this receives the latest value:
setPrevChats(prev => [...prev, newMessage]);
```

This is used extensively in NovaAI:

```javascript
// Adding a user message before the API call:
setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

// Removing a deleted thread:
setAllThreads(prev => prev.filter(t => t.threadId !== threadId));

// Adding new thread at top of list:
setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]);

// Updating a thread's title:
setAllThreads(prev => prev.map(t =>
  t.threadId === currThreadId ? { ...t, title: parsed.title } : t
));
```

### State Lives in App.jsx and Flows Down

The major state variables in NovaAI are declared in `App.jsx` and shared via Context:

```javascript
// App.jsx
const [prompt, setPrompt] = useState("");           // current input text
const [streamingReply, setStreamingReply] = useState(""); // live AI response
const [currThreadId, setCurrThreadId] = useState(uuidv1()); // active thread
const [newChat, setNewChat] = useState(true);       // are we in a new unsaved thread?
const [prevChats, setPrevChats] = useState([]);     // loaded message history
const [allThreads, setAllThreads] = useState([]);   // sidebar thread list
const [threadProfile, setThreadProfile] = useState(null); // AI-extracted context
const [user, setUser] = useState(null);             // logged-in user info
```

---

## 6. The Context API

### The Problem: Prop Drilling

If you have deeply nested components, passing data through every level becomes tedious:

```
App → ChatWindow → Chat → MessageBubble → CopyButton
                                           ↑
                              needs user.email for attribution
```

You'd have to pass `userEmail` through `ChatWindow`, `Chat`, `MessageBubble`, and finally to `CopyButton` — even though the middle components don't use it. This is called **prop drilling** and it's a maintainability problem.

### The Solution: Context

Context creates a "shared space" that any component in the tree can read directly, without props:

```javascript
// MyContext.jsx — creating the context:
import { createContext } from "react";
export const MyContext = createContext();
```

```javascript
// App.jsx — providing values to all children:
const providerValues = {
  prompt, setPrompt,
  streamingReply, setStreamingReply,
  currThreadId, setCurrThreadId,
  newChat, setNewChat,
  prevChats, setPrevChats,
  allThreads, setAllThreads,
  threadProfile, setThreadProfile,
  user, handleLogout
};

return (
  <MyContext.Provider value={providerValues}>
    <Sidebar />
    <ChatWindow />
  </MyContext.Provider>
);
```

```javascript
// Sidebar.jsx — consuming context directly:
const {
  allThreads, setAllThreads,
  currThreadId, newChat, setNewChat,
  // ...
} = useContext(MyContext);
```

```javascript
// Chat.jsx — also consuming context:
const { prevChats, streamingReply, prompt, setPrompt } = useContext(MyContext);
```

No props needed. Any component inside the `Provider` can access `allThreads`, `setPrompt`, `user`, or any other value directly.

### What Each Context Value Does in NovaAI

| Value | Type | Purpose |
|-------|------|---------|
| `prompt` / `setPrompt` | string | The current text in the input box |
| `streamingReply` / `setStreamingReply` | string | The in-progress AI response being assembled token by token |
| `currThreadId` / `setCurrThreadId` | string (UUID) | Which conversation is currently active |
| `newChat` / `setNewChat` | boolean | Whether we're in an unsaved new thread |
| `prevChats` / `setPrevChats` | array | Messages in the current thread |
| `allThreads` / `setAllThreads` | array | The sidebar's list of `{ threadId, title }` |
| `threadProfile` / `setThreadProfile` | object | AI-extracted context from the current thread |
| `user` | object | `{ userId, email }` of the logged-in user |
| `handleLogout` | function | Logs the user out |

---

## 7. useEffect — Side Effects and Lifecycle

A **side effect** is anything that reaches outside the component — network requests, DOM manipulation, timers, subscriptions. React keeps side effects separate from rendering by putting them in `useEffect`.

### Basic Syntax

```javascript
useEffect(() => {
  // side effect code here
}, [dependencies]);
```

The `useEffect` hook takes:
1. A function to run (the effect)
2. A dependency array — controls when the effect runs

### The Three Dependency Array Patterns

**Empty array `[]` — runs once on mount:**
```javascript
// In Sidebar.jsx — load threads when sidebar first appears:
useEffect(() => {
  getAllThreads();
}, []);
// getAllThreads() runs once when Sidebar mounts. Never again.
```

**Array with values `[value]` — runs when those values change:**
```javascript
// Hypothetical — refetch data when a specific ID changes:
useEffect(() => {
  fetchThreadDetails(currThreadId);
}, [currThreadId]);
// Runs on mount AND whenever currThreadId changes
```

**No array — runs after every render:**
```javascript
useEffect(() => {
  document.title = `${messages.length} messages`;
});
// Runs after every render — usually a performance problem, use sparingly
```

### The useEffect Bug We Fixed

The original `Sidebar.jsx` had:
```javascript
useEffect(() => {
  getAllThreads();
}, [currThreadId]); // ← Bug: fires on every thread switch
```

Every time `currThreadId` changed — including when the user created a new chat — `getAllThreads()` fired, fetched the server's thread list, and **overwrote `allThreads`** with it. Since the new thread isn't saved to the server yet, it would disappear from the sidebar.

The fix: changed to `[]` (mount only). The sidebar now manages its thread list entirely through client-side updates — adding threads on first message, removing on delete, updating titles on stream complete. No server refetch needed on every thread switch.

### The AnalyticsDrawer useEffect

```javascript
// AnalyticsDrawer.jsx:
useEffect(() => {
  if (!isOpen) return;       // don't fetch if drawer is closed
  setLoading(true);
  authFetch("http://localhost:8080/api/analytics")
    .then(r => r.json())
    .then(data => { setMetrics(data); setLoading(false); })
    .catch(err => { console.log(err); setLoading(false); });
}, [isOpen]); // ← re-fetches every time the drawer is opened
```

When `isOpen` changes from `false` to `true` (user opens the drawer), this effect fires and fetches fresh metrics. This ensures the data is always current.

### Cleanup Functions

Effects can return a cleanup function that runs before the next effect or when the component unmounts:

```javascript
useEffect(() => {
  const timer = setTimeout(() => {
    setPendingDelete(null);
  }, 3000);

  return () => clearTimeout(timer); // cleanup: cancel timer if component unmounts
}, []);
```

NovaAI uses `setTimeout` for the delete confirmation auto-cancel:
```javascript
// In Sidebar.jsx — the two-click delete confirmation:
setTimeout(() => setPendingDelete(p => p === thread.threadId ? null : p), 3000);
// If the user doesn't confirm within 3 seconds, the confirmation is cancelled
```

---

## 8. useRef

`useRef` lets you:
1. Access a DOM element directly
2. Store a mutable value that doesn't trigger re-renders

### The Auto-Expanding Textarea

```javascript
// In ChatWindow.jsx:
const textareaRef = useRef(null);

// Attached to the textarea element:
<textarea
  ref={textareaRef}
  onChange={(e) => {
    setPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  }}
/>
```

`textareaRef.current` is a direct reference to the textarea DOM node. When the user types:
1. `e.target.style.height = "auto"` resets the height
2. `e.target.scrollHeight` is the height the content needs to be fully visible
3. `Math.min(..., 150)` caps it at 150px (scrolls beyond that)

The textarea grows as you type and is capped at 150px. After sending, the height is reset:
```javascript
if (textareaRef.current) {
  textareaRef.current.style.height = "auto";
}
```

### Why useRef Instead of useState?

If you stored the height in `useState`, every keystroke would trigger a re-render. `useRef` lets you manipulate the DOM directly without React being involved, which is more efficient for this use case.

---

## 9. Event Handling

React handles events with inline functions in JSX.

### Basic Click Handler

```javascript
<button onClick={() => setIsAnalyticsOpen(true)}>
  Analytics
</button>
```

The function is called when the button is clicked. Note: you pass the function reference, not call it:
```jsx
onClick={handleClick}      // ✅ passes the function
onClick={handleClick()}    // ❌ calls it immediately during render
onClick={() => handleClick()} // ✅ wraps it when you need to pass arguments
```

### onKeyDown — The Enter Key Shortcut

```javascript
<textarea
  onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();          // prevent new line
      if (prompt.trim() && !loading) getReply(); // send message
    }
  }}
/>
```

- `e.key === "Enter"` — the Enter key was pressed
- `!e.shiftKey` — but not with Shift held down (Shift+Enter adds a new line)
- `e.preventDefault()` — stops the default Enter behavior (which is a new line in a textarea)

### Event Propagation and stopPropagation

Events "bubble up" — when you click something, the click event fires on that element, then its parent, then its grandparent, all the way to the root.

In NovaAI's delete confirmation, this matters:

```javascript
// The li has an onClick that navigates to the thread:
<li onClick={() => changeThread(thread.threadId)}>
  <div className="delete-zone"
    onClick={(e) => {
      e.stopPropagation(); // ← PREVENTS the li's onClick from firing
      if (isPending) {
        deleteThread(thread.threadId);
      } else {
        setPendingDelete(thread.threadId);
      }
    }}
  >
    <i className="fa-solid fa-trash" />
  </div>
</li>
```

Without `e.stopPropagation()`, clicking the trash icon would:
1. Fire the delete-zone's onClick (which we want)
2. **Bubble** up to the `li`'s onClick (which we don't want — we don't want to navigate to the thread while deleting it)

`stopPropagation()` prevents step 2.

### onChange — Controlled Inputs

```javascript
<textarea
  value={prompt}           // controlled: value is always from state
  onChange={(e) => setPrompt(e.target.value)} // update state on every keystroke
/>
```

This is a **controlled component** — React owns the value of the input. The `value` prop makes the textarea display whatever is in state, and `onChange` updates state on every keystroke. This is the React way of handling forms.

---

## 10. Rendering Lists and Conditional Rendering

### Rendering a List with `.map()`

```jsx
// In Sidebar.jsx — rendering all threads:
<ul className="history">
  {allThreads?.map((thread) => {
    const isPending = pendingDelete === thread.threadId;
    return (
      <li key={thread.threadId}
          onClick={() => changeThread(thread.threadId)}
          className={thread.threadId === currThreadId ? "highlighted" : ""}
      >
        <span className="thread-title">{thread.title}</span>
      </li>
    );
  })}
</ul>
```

The `key` prop is **required** when rendering lists. React uses it to track which items changed between renders. Without it, React cannot efficiently update the list — it would re-render everything. Use a unique, stable identifier (not the array index).

### Conditional Rendering

**With `&&` operator:**
```jsx
// Only render the drawer when isOpen is true:
{isOpen && <div className="drawer">...</div>}

// Only show the fake "New Chat" entry when in new chat mode:
{newChat && (
  <li className="highlighted">
    <span className="thread-title">New Chat</span>
  </li>
)}
```

If the left side is falsy, the `&&` short-circuits and nothing is rendered.

**With ternary `? :`:**
```jsx
// Show different text based on RAG usage rate:
{metrics.ragUsageRate >= 0.3 ? (
  <>Past conversations are <strong>actively improving your answers</strong></>
) : (
  <>More conversations will improve retrieval accuracy.</>
)}
```

**With early return:**
```jsx
// In AnalyticsDrawer.jsx — don't render anything while loading:
{loading && <p className="insight-sub">Loading metrics…</p>}
{!loading && !metrics && <p className="insight-sub">No data yet.</p>}
{!loading && metrics && (
  <div className="analytics-grid">...</div>
)}
```

---

## 11. React Markdown and Syntax Highlighting

AI responses often contain markdown — `**bold**`, `# headers`, `\`\`\`code blocks\`\`\``. To render these properly, NovaAI uses `react-markdown` with a syntax highlighting plugin.

```jsx
// In Chat.jsx — rendering an AI response:
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

<ReactMarkdown rehypePlugins={[rehypeHighlight]}>
  {message.content}
</ReactMarkdown>
```

Without `react-markdown`, the AI's response would appear as raw text with `**` and `#` symbols. With it, those symbols are converted to actual bold text and headings.

`rehype-highlight` adds syntax highlighting to code blocks using the Highlight.js library. Code like:
````
```javascript
const x = 5;
```
````
...gets rendered with colored syntax highlighting, just like in VS Code.

### Streaming Markdown

During streaming, the response is partially assembled. React Markdown handles this gracefully — it renders whatever partial markdown exists and updates as more content arrives. The typing cursor is added after the ReactMarkdown component:

```jsx
{/* In Chat.jsx — during streaming: */}
<ReactMarkdown rehypePlugins={[rehypeHighlight]}>
  {streamingReply}
</ReactMarkdown>
<span className="typing-cursor" />
```

The cursor disappears when `streamingReply` becomes empty (stream complete).

---

## 12. Optimistic UI Updates

An **optimistic update** means updating the UI immediately, before the server confirms the action. This makes the app feel much faster.

### The User Message

In NovaAI, when you hit send:

```javascript
// 1. Show the message immediately (optimistic):
setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);

// 2. THEN make the network request (this takes time):
const response = await authFetch("http://localhost:8080/api/chat", options);
```

The user sees their message appear instantly, before waiting for the server to acknowledge it. If the request fails, the message would remain (NovaAI doesn't handle this rollback, which is a tradeoff).

### Thread Deletion

```javascript
const deleteThread = async (threadId) => {
  const response = await authFetch(`http://localhost:8080/api/thread/${threadId}`, {
    method: "DELETE"
  });
  if (!response.ok) return;  // server confirmed the delete succeeded

  // Only then update the UI:
  setAllThreads(prev => prev.filter(t => t.threadId !== threadId));
};
```

For deletion, we wait for the server to confirm before updating the UI. This avoids showing a thread as deleted when it wasn't.

### The New Thread — The Fake Entry Approach

When the user clicks "New Chat", the thread doesn't exist in the database yet. NovaAI uses a clever approach:

```jsx
// In Sidebar.jsx — a fake "New Chat" entry appears immediately:
{newChat && (
  <li className="highlighted">
    <span className="thread-title">New Chat</span>
  </li>
)}
```

When `newChat` is `true`, a visually highlighted entry appears at the top of the sidebar. When the user sends the first message:
1. `setNewChat(false)` — the fake entry disappears
2. `setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev])` — a real entry is added

Both happen in the same React render batch, so there is no flicker.

---

## 13. React Batching

### What Batching Is

React 18+ automatically **batches** multiple state updates from the same event handler or async function into a single re-render:

```javascript
// These three updates happen in ONE re-render, not three:
setLoading(true);
setNewChat(false);
setPrompt("");
```

Without batching, each `set...` call would trigger a separate re-render — three renders for three updates. With batching, React waits until all the synchronous calls are done, then renders once.

### Why This Fixed the "New Chat" Sidebar Bug

When the user sends their first message:

```javascript
// In ChatWindow.jsx's getReply():
setNewChat(false);  // ← removes the fake "New Chat" entry from sidebar
// ...
setAllThreads(prev => [{ threadId: currThreadId, title: "New Chat" }, ...prev]); // ← adds real entry
```

Because React batches these updates, both happen in the same render cycle. The fake entry disappears and the real entry appears **simultaneously** — no gap, no flicker. If they were separate renders, you'd briefly see the sidebar with no new chat entry between the two renders.

---

## 14. How App.jsx Bootstraps the Application

`App.jsx` is the root component that decides what to show based on authentication state:

```javascript
function App() {
  const [user, setUser] = useState(null);

  // On mount: check if there's a valid token in localStorage
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Decode the JWT payload (base64url) without calling the server:
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp * 1000 < Date.now()) {
        // Token has expired — remove it
        localStorage.removeItem("token");
        return;
      }
      // Token is valid — set the user
      setUser({ userId: payload.userId, email: payload.email });
    } catch {
      localStorage.removeItem("token");
    }
  }, []);

  // Register the logout handler with authFetch
  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem("token");
      setUser(null);
    });
  }, []);

  // Render based on auth state:
  if (!user) return <Login onLogin={setUser} />;
  return (
    <MyContext.Provider value={providerValues}>
      <Sidebar />
      <ChatWindow />
    </MyContext.Provider>
  );
}
```

The clever part: the token expiry is checked client-side by decoding the JWT's base64url-encoded payload. No server round-trip is needed to know if the token is expired. This is an optimization — the server will still verify on every API call, but at least we don't show the app UI for a split second before a 401 comes back.

---

## 15. NovaAI's Complete Component Tree

```
App.jsx
│ State: user, prompt, streamingReply, currThreadId, newChat,
│        prevChats, allThreads, threadProfile
│ Provides: MyContext.Provider with all state
│
├── [if !user] Login.jsx
│   State: email, password, error
│   Makes: POST /api/auth/login
│
├── [if !user] Register.jsx
│   State: email, password, confirmPassword, error
│   Makes: POST /api/auth/register
│
└── [if user] MyContext.Provider
    ├── Sidebar.jsx
    │   State: pendingDelete
    │   Context: allThreads, setAllThreads, currThreadId,
    │            newChat, setNewChat, prompt, setPrompt,
    │            streamingReply, setStreamingReply, setCurrThreadId,
    │            setPrevChats, setThreadProfile, user, handleLogout
    │   Makes: GET /api/thread (on mount)
    │          GET /api/thread/:id (on thread switch)
    │          DELETE /api/thread/:id (on delete confirm)
    │
    └── ChatWindow.jsx
        State: loading, isOpen, isAnalyticsOpen, isProfileOpen
        Ref: textareaRef
        Context: prompt, setPrompt, setStreamingReply, currThreadId,
                 setPrevChats, newChat, setNewChat, setAllThreads,
                 threadProfile, setThreadProfile
        Makes: POST /api/chat (on send)
               GET /api/thread/:id (fetchLatestProfile, 3s after stream)
        │
        ├── AnalyticsDrawer.jsx
        │   State: metrics, loading
        │   Makes: GET /api/analytics (on open)
        │
        ├── PersonalInsightsDrawer.jsx
        │   State: memory, loading
        │   Makes: GET /api/user-memory (on open)
        │
        ├── (Agent Memory inline drawer — JSX in ChatWindow)
        │   Shows: threadProfile.userFacts, threadProfile.preferences,
        │          threadProfile.activeContext
        │
        └── Chat.jsx
            Context: prevChats, streamingReply, prompt, setPrompt
            Renders: all prevChats as message bubbles
                     streamingReply as the live streaming bubble
                     suggestion chips on empty state
```

---

## 16. Summary

| Concept | What It Is | Key Example in NovaAI |
|---------|-----------|----------------------|
| Component | Reusable function that returns JSX | `Sidebar`, `ChatWindow`, `Chat` |
| JSX | HTML-like syntax in JavaScript | `<li className="highlighted">` |
| Props | Data passed parent → child | `isOpen` and `onClose` in `AnalyticsDrawer` |
| State (`useState`) | Data that triggers re-renders when changed | `loading`, `allThreads`, `newChat` |
| Context API | Global state without prop drilling | `MyContext` shared across all components |
| `useEffect` | Side effects tied to lifecycle | Fetch threads on mount, fetch analytics on open |
| `useRef` | Direct DOM access without re-rendering | Auto-expanding textarea height |
| Event handling | User interaction callbacks in JSX | `onClick`, `onChange`, `onKeyDown` |
| Conditional rendering | Show/hide based on state | `{newChat && <li>New Chat</li>}` |
| List rendering | `.map()` with `key` prop | Thread list, message bubbles |
| Optimistic update | Update UI before server confirms | Show user message before API responds |
| React batching | Multiple setState = one render | New chat fake→real entry swap without flicker |

---

## 17. Interview Questions and Answers

---

**Q: What is React and why would you use it instead of plain JavaScript?**

A: React is a library for building user interfaces by organizing code into reusable components. The key benefit over plain JavaScript is that React automatically keeps the UI in sync with the data. Instead of manually finding DOM elements and updating them when data changes, you declare what the UI should look like given the current state, and React handles all the updates. This is especially valuable for complex, dynamic interfaces like a chat application where many parts of the UI change simultaneously — the sidebar thread list, the chat messages, the streaming response, and the analytics drawer can all update without you manually coordinating DOM operations.

---

**Q: What is the difference between state and props?**

A: Props are data passed from a parent component to a child — they flow downward and the child cannot modify them. State is data that belongs to a component itself — it's local, can be changed with the setter function, and triggers a re-render when it changes. In NovaAI, `allThreads` is state that lives in `App.jsx` and is passed down through Context — any component can read it (like Context-delivered props) but only updates go through `setAllThreads`. Props like `isOpen` and `onClose` on the drawers are a simpler form of this: the parent owns the state, passes the current value and a way to change it.

---

**Q: What is the Context API and why is it useful?**

A: The Context API is React's built-in solution for sharing state across many components without passing props through every intermediate level (called prop drilling). You create a context, wrap your component tree with a Provider that holds the values, and any component in that tree can `useContext()` to access those values directly. In NovaAI, I use one context (`MyContext`) to share all the major application state — the thread list, the current prompt, the streaming reply, the user data — across `Sidebar`, `ChatWindow`, and `Chat`, which are siblings, not parent-child. Without Context, I would need to lift all this state to a common ancestor and thread every prop through every intermediate component.

---

**Q: What does useEffect do? What is the dependency array?**

A: `useEffect` runs side effects — things that reach outside the component, like network requests, timers, or DOM manipulation — after React finishes rendering. The dependency array controls when it runs: an empty `[]` means once on mount, `[value]` means whenever `value` changes, and no array means after every render. In NovaAI, I use `useEffect([], [])` in `Sidebar.jsx` to load the thread list once when the app starts. In `AnalyticsDrawer.jsx`, I use `useEffect([isOpen])` to refetch metrics every time the user opens the drawer, ensuring the data is always current.

---

**Q: What is prop drilling and how do you solve it?**

A: Prop drilling is when you pass data through multiple layers of components just to get it to a deeply nested one that actually needs it. The intermediate components don't use the data at all — they're just passing it along. The standard solutions are the Context API (React's built-in) or a state management library like Redux or Zustand. In NovaAI, I chose Context because the application has one clear global state (current thread, messages, user data) that many components need simultaneously, and Context is simpler than Redux for a project of this size.

---

**Q: What is an optimistic update? What are the tradeoffs?**

A: An optimistic update means updating the UI before the server confirms the action, on the assumption that it will succeed. The benefit is that the app feels instant — the user sees their message appear the moment they hit send, not after a 750ms round-trip. The tradeoff is consistency: if the request fails, the UI shows state that doesn't match the server. In NovaAI, I use optimistic updates for showing user messages immediately. For thread deletion, I wait for the server to confirm because the cost of a false optimistic delete (showing a thread as deleted when it isn't) is worse than a 300ms delay.

---

**Q: What is the Virtual DOM?**

A: The Virtual DOM is a JavaScript representation of the real DOM that React maintains in memory. When state changes, React creates a new Virtual DOM tree and compares it against the previous one — this is called "diffing." It then calculates the minimal set of changes needed and applies only those changes to the real DOM. This is faster than re-rendering the entire page for every state change. Direct DOM manipulation (like `document.getElementById().innerHTML = ...`) is slow because it triggers browser reflow and repaint. React's approach minimizes those expensive operations.

---

**Q: Why do list items need a key prop?**

A: React uses the `key` prop to track which items in a list correspond to which DOM elements between renders. Without keys, if an item is deleted from the middle of a list, React might incorrectly re-use DOM nodes, causing bugs like wrong content being shown or animations firing on the wrong element. With keys, React knows exactly which element was removed, added, or moved. In NovaAI, I use `thread.threadId` as the key for the thread list — it's unique and stable (it doesn't change when the thread is renamed). Using array indexes as keys causes bugs when the list reorders.
