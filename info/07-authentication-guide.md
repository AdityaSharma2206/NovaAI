# 07 — Authentication: JWT, Passwords, and Security

**Purpose:** Every NovaAI request passes through the authentication layer. Before the AI can respond to your message, the backend verifies who you are, that your session is still valid, and that you can only access your own data. This file explains how authentication works from first principles — from hashing passwords to generating and verifying tokens — with every step grounded in NovaAI's actual code.

**Learning Value:** ⭐⭐⭐⭐⭐
**Interview Importance:** ⭐⭐⭐⭐⭐
**Estimated Reading Time:** 55–70 minutes
**Prerequisites:** 05-express-complete-guide.md, 06-mongodb-complete-guide.md

---

## Table of Contents

1. [The Authentication Problem](#1-the-authentication-problem)
2. [Passwords — How Not to Store Them](#2-passwords)
3. [bcrypt — Hashing Passwords Safely](#3-bcrypt)
4. [Sessions vs Tokens — Two Approaches](#4-sessions-vs-tokens)
5. [JWT — JSON Web Tokens](#5-jwt)
6. [The NovaAI Auth Flow — Registration](#6-registration-flow)
7. [The NovaAI Auth Flow — Login](#7-login-flow)
8. [The verifyToken Middleware](#8-verifytoken-middleware)
9. [The Frontend Auth Layer](#9-frontend-auth-layer)
10. [Security Considerations](#10-security-considerations)
11. [Summary](#11-summary)
12. [Interview Questions and Answers](#12-interview-questions-and-answers)

---

## 1. The Authentication Problem

### What Authentication Is

**Authentication** answers one question: *Who are you?*

When a user sends a message to NovaAI, the backend needs to know: which user is this? Which threads belong to them? What's their long-term memory profile?

Without authentication, any person could query any user's data — or the backend would have no idea whose data to retrieve.

### The Stateless Web Problem

HTTP is **stateless** — each request arrives with no memory of previous requests. When your browser sends a request to `GET /api/thread/list`, the server receives raw bytes with no built-in concept of "this is Aditya's request."

You need a mechanism to prove your identity with every request.

### Three Common Approaches

1. **Send credentials every request** — include username + password with every API call. Simple, but insecure (password travels the wire constantly) and bad UX (user would need to enter password for every action).

2. **Server-side sessions** — after login, the server assigns you a session ID, stores your identity in a database keyed by that ID, and gives you the ID to include in future requests. The server looks up your identity from the database on every request.

3. **Tokens (JWT)** — after login, the server generates a cryptographically signed token containing your identity. You include the token in every request. The server verifies the signature without a database lookup.

NovaAI uses **JWTs** — approach 3.

---

## 2. Passwords — How Not to Store Them

### Plaintext Storage (Never Do This)

The most naive approach: store the password exactly as the user typed it.

```
users table:
┌──────────────────────┬────────────────┐
│ email                │ password       │
├──────────────────────┼────────────────┤
│ aditya@example.com   │ mypassword123  │
└──────────────────────┴────────────────┘
```

**Why this is catastrophic:** If your database is ever breached (SQL injection, misconfigured permissions, insider threat), every user's password is exposed. Worse, most people reuse passwords — a breach of your small app hands attackers access to users' email, banking, and social media accounts.

### Encryption (Still Wrong)

You might think: encrypt the passwords before storing them. Encryption is reversible — if attackers get the encryption key (also stored on your server), they decrypt everything instantly. Same outcome as plaintext.

### Hashing (Correct Direction)

A **hash function** transforms input into a fixed-size output, and it's a **one-way function** — you cannot reverse it:

```
SHA-256("mypassword123") → "ef92b778bafe771207869..."
SHA-256("mypassword123") → "ef92b778bafe771207869..."  (always same output)
SHA-256("mypassword124") → "c2b0b62a14e5daf2b4a8..."  (completely different)
```

To verify a password at login: hash what the user typed, compare to the stored hash. They match → correct password. Never store or compare the plaintext.

**But plain hashing isn't enough.** Attackers have precomputed **rainbow tables** — databases of millions of common passwords and their hashes. If your hashed password is in their table, it's cracked instantly. They can also attack multiple stolen hashes in parallel since two users with the same password have the same hash.

---

## 3. bcrypt — Hashing Passwords Safely

bcrypt solves the rainbow table problem with two mechanisms:

### 1. Salting

A **salt** is a random string added to the password before hashing:

```
salt = "x8Kp3mNqR7"   (randomly generated, stored with the hash)
hash = bcrypt(password + salt)
```

Because the salt is random and unique per user, two users with the same password produce different hashes. Rainbow tables (precomputed hashes) are useless because they'd need a separate table for every possible salt.

### 2. Cost Factor (Work Factor)

bcrypt is intentionally **slow**. The cost factor (also called work factor or rounds) controls how many iterations the algorithm runs:

```
cost factor 10 → ~100ms per hash
cost factor 12 → ~400ms per hash  ← NovaAI's default
cost factor 14 → ~1600ms per hash
```

For a user logging in, 100ms is imperceptible. For an attacker trying billions of password guesses, it makes brute force computationally infeasible.

### bcrypt in NovaAI

```javascript
import bcrypt from "bcrypt";

// During registration — hash the user's password:
const saltRounds = 10;
const passwordHash = await bcrypt.hash(req.body.password, saltRounds);
// passwordHash looks like: "$2b$10$X8Kp3mNqR7...long string..."
// The hash contains: algorithm version ($2b$), cost factor ($10$), salt, and hash — all in one string

// Save the hash, never the plaintext password:
const user = new User({ email, passwordHash });
await user.save();
```

```javascript
// During login — verify the entered password:
const isMatch = await bcrypt.compare(req.body.password, user.passwordHash);
// bcrypt extracts the salt from the stored hash, re-hashes the input, and compares
// Returns true if password is correct, false otherwise

if (!isMatch) {
  return res.status(401).json({ error: "Invalid credentials" });
}
```

`bcrypt.compare()` does not require you to separately extract the salt — it's embedded in the hash string (`$2b$10$[22-char-salt][31-char-hash]`).

---

## 4. Sessions vs Tokens — Two Approaches

Understanding why NovaAI uses JWTs requires seeing both approaches clearly.

### Server-Side Sessions

```
1. User logs in
2. Server creates session:
   sessions["sess_abc123"] = { userId: "507f...", email: "aditya@..." }
3. Server sends cookie: Set-Cookie: session_id=sess_abc123
4. Browser stores cookie, sends it automatically with every request
5. For each request, server:
   a. Reads session_id from cookie
   b. Looks up sessions["sess_abc123"] in memory (or database)
   c. Gets the user's identity
```

**Advantages:** Instant revocation — delete the session entry and the user is logged out immediately.

**Disadvantages:**
- Requires shared session storage across multiple server instances (if you scale to 3 servers, they all need access to the same session store)
- Database lookup on every request adds latency
- Memory usage grows with concurrent users

### Token-Based Auth (JWT)

```
1. User logs in
2. Server creates signed token containing: { userId: "507f...", email: "aditya@..." }
3. Server sends token in response body (not a cookie)
4. Browser stores token in localStorage or memory
5. For each request, browser sends: Authorization: Bearer <token>
6. Server verifies signature — no database lookup needed
```

**Advantages:**
- Stateless — any server instance can verify any token with just the secret key
- No database lookup on every request
- Scales horizontally with zero coordination

**Disadvantages:**
- Cannot instantly revoke — if a token is stolen, it's valid until it expires
- Token must be stored securely on the client (XSS risk with localStorage)

NovaAI chose JWTs because it's a single-server app with no session storage infrastructure, and the 7-day expiry provides a reasonable security window.

---

## 5. JWT — JSON Web Tokens

### What a JWT Looks Like

A JWT is a string of three base64url-encoded parts separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJlbWFpbCI6ImFkaXR5YUBleGFtcGxlLmNvbSIsImlhdCI6MTcwNTMyODAwMCwiZXhwIjoxNzA1OTMyODAwfQ.K8gZpMZ0V7Y8A6b2mF3xB9cN1pQ4rT5sH7lJ6wE2vU0
    ^ Header                                        ^ Payload                                                                                                        ^ Signature
```

### Part 1: Header

Decoded: `{"alg":"HS256","typ":"JWT"}`

- `alg: "HS256"` — HMAC-SHA256 algorithm (explained below)
- `typ: "JWT"` — this is a JSON Web Token

### Part 2: Payload (the Claims)

Decoded: `{"userId":"507f1f77...","email":"aditya@example.com","iat":1705328000,"exp":1705932800}`

- `userId` — the MongoDB `_id` of the user (custom claim)
- `email` — the user's email (custom claim)
- `iat` — "issued at" — Unix timestamp when the token was created
- `exp` — "expiration" — Unix timestamp after which the token is invalid (7 days after `iat` in NovaAI)

This payload is visible to anyone who has the token — it's base64 encoded, not encrypted. Never put sensitive data (passwords, credit cards) in a JWT payload.

### Part 3: Signature

```
HMAC-SHA256(
  base64url(header) + "." + base64url(payload),
  SECRET_KEY
)
```

The signature is created by running the header + payload through HMAC-SHA256 using the server's secret key. The server can verify this signature on any future request:

1. Re-compute: `HMAC-SHA256(header + "." + payload, SECRET_KEY)`
2. Compare to the signature in the token
3. If they match → the token hasn't been tampered with → the payload can be trusted

If an attacker modifies the payload (e.g., changes `userId` to steal another user's data), the signature won't match → token rejected.

### Why It's Secure

The secret key (`JWT_SECRET` environment variable) never leaves the server. Without the secret key, you cannot create a valid signature. Modifying the payload invalidates the signature. The only way to forge a token is to know the secret key.

---

## 6. Registration Flow

Here's what happens when a new user registers:

```
Browser                              Backend                          MongoDB
   │                                    │                                │
   │─── POST /api/user/register ────────>│                                │
   │    { email, password }              │                                │
   │                                    │─── User.findOne({ email }) ───>│
   │                                    │<── null (email not taken) ─────│
   │                                    │                                │
   │                                    │  bcrypt.hash(password, 10)     │
   │                                    │  (takes ~100ms)                │
   │                                    │                                │
   │                                    │─── new User({ email,       ───>│
   │                                    │    passwordHash }).save()       │
   │                                    │<── { _id: "507f...", ... } ────│
   │                                    │                                │
   │                                    │  jwt.sign({ userId, email },   │
   │                                    │    JWT_SECRET, { expiresIn: "7d" })
   │                                    │  → token = "eyJ..."            │
   │                                    │                                │
   │<── { token, user } ───────────────│                                │
   │                                    │                                │
   │  localStorage.setItem("token", token)
   │  (stored for future requests)
```

### The Route Code

```javascript
// routes/user.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Check for duplicate email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ error: "Email already registered" });
  }

  // Hash password (never store plaintext)
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = new User({ email, passwordHash });
  await user.save();

  // Generate JWT
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({
    token,
    user: { id: user._id, email: user.email }
  });
});
```

**HTTP 201** (Created) — more specific than 200 (OK), signals a new resource was created.

**HTTP 409** (Conflict) — signals that the request conflicts with existing state (email already taken). More accurate than 400 (Bad Request).

---

## 7. Login Flow

```
Browser                              Backend                          MongoDB
   │                                    │                                │
   │─── POST /api/user/login ───────────>│                                │
   │    { email, password }              │                                │
   │                                    │─── User.findOne({ email }) ───>│
   │                                    │<── user document ──────────────│
   │                                    │                                │
   │                                    │  bcrypt.compare(               │
   │                                    │    password, user.passwordHash)│
   │                                    │  → true or false               │
   │                                    │                                │
   │                                    │  If false → 401 Unauthorized   │
   │                                    │                                │
   │                                    │  jwt.sign({ userId, email },   │
   │                                    │    JWT_SECRET, { expiresIn: "7d" })
   │<── { token, user } ───────────────│                                │
   │                                    │                                │
   │  localStorage.setItem("token", token)
```

### The Route Code

```javascript
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Find user (case-insensitive because email is stored lowercase)
  const user = await User.findOne({ email });
  if (!user) {
    // Intentionally vague: don't reveal whether the email exists
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Generate fresh JWT
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: { id: user._id, email: user.email }
  });
});
```

**Why "Invalid credentials" for both "email not found" and "wrong password"?** Never reveal which part of the credentials was wrong. If you say "email not found," an attacker learns which emails are registered, enabling targeted attacks. The vague message forces them to guess both.

---

## 8. The verifyToken Middleware

Every protected route (anything that isn't login/register) runs through `verifyToken` before the route handler executes.

### The Middleware Code

```javascript
// middleware/auth.js
import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  // Step 1: Extract token from Authorization header
  const authHeader = req.headers["authorization"];
  // authHeader = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  const token = authHeader.split(" ")[1];
  // Split on space → ["Bearer", "eyJ..."] → take index 1 → "eyJ..."

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  // Step 2: Verify the token's signature and expiry
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // If signature is invalid → throws JsonWebTokenError
    // If token is expired → throws TokenExpiredError
    // If valid → decoded = { userId: "507f...", email: "...", iat: ..., exp: ... }

    // Step 3: Attach user info to the request
    req.user = decoded;
    // Now any route handler can access req.user.userId

    // Step 4: Pass control to the next handler
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
```

### The Middleware in the Request Pipeline

```
Incoming request: GET /api/thread/list
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

1. Express routing matches /api/thread/list
2. verifyToken runs:
   - Extracts token from header
   - jwt.verify(token, JWT_SECRET) → decoded payload
   - req.user = { userId: "507f...", email: "aditya@..." }
   - next() is called
3. Route handler runs:
   const threads = await Thread.find({ userId: req.user.userId });
   // Uses req.user.userId that verifyToken attached
```

### Applying verifyToken to Routes

```javascript
// In server.js or router:
import { verifyToken } from "./middleware/auth.js";

// Apply to every route in this router:
app.use("/api/thread", verifyToken, threadRouter);
app.use("/api/chat", verifyToken, chatRouter);

// Registration and login do NOT use verifyToken — you can't require a token to get a token
app.use("/api/user", userRouter);
```

---

## 9. The Frontend Auth Layer

### Storing the Token

After login/register, the token is stored in `localStorage`:

```javascript
// After successful login:
localStorage.setItem("token", response.token);
```

`localStorage` persists across browser tabs and page refreshes until explicitly cleared — so the user stays logged in for 7 days (or until they log out).

### The `authFetch` Helper

Every protected API call must include the token in the `Authorization` header. Rather than manually adding the header to every `fetch()` call, NovaAI uses an `authFetch` wrapper:

```javascript
// In App.jsx — creates an authFetch function:
const token = localStorage.getItem("token");

const authFetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
};
```

Then across the codebase:
```javascript
// In ChatWindow.jsx, Sidebar.jsx, Analytics, etc.:
const response = await authFetch("http://localhost:8080/api/thread/list");
// Authorization header is automatically included
```

### Client-Side Expiry Check

NovaAI checks the token expiry **before** making API calls, to avoid wasting a network round-trip:

```javascript
// In App.jsx:
const checkTokenExpiry = () => {
  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    // JWT payload is the second part (index 1), base64url-encoded
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp is a Unix timestamp in seconds
    const isExpired = Date.now() / 1000 > payload.exp;

    if (isExpired) {
      localStorage.removeItem("token");
      return false;
    }
    return true;
  } catch {
    return false;
  }
};
```

**Why base64url decode in the browser?** The JWT payload is not encrypted — it's just base64-encoded. Decoding it in the browser lets you read the expiry time (`exp`) without making a server request. `atob()` is the browser's built-in base64 decoder. Note: this only checks expiry, not signature — you cannot verify the signature in the browser since you don't have the server's `JWT_SECRET`.

### The Logout Flow

```javascript
// In Sidebar.jsx / App.jsx:
const handleLogout = () => {
  localStorage.removeItem("token");  // remove token from storage
  setUser(null);                     // clear user state in React context
  setCurrThreadId(null);             // clear current thread
  // React re-renders → user sees login screen
};
```

Logout is purely client-side in NovaAI — the server never invalidates the token (JWT limitation). The token could still be used by anyone who copied it until it expires in 7 days. For higher security, you'd implement a token denylist (store invalidated tokens in Redis until they naturally expire).

### The Unauthorized Handler

When `authFetch` gets a 401 response (token expired or invalid):

```javascript
// In App.jsx — setUnauthorizedHandler:
const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

// When a 401 is received anywhere in the app:
const handleUnauthorized = () => {
  localStorage.removeItem("token");
  setUser(null);
  navigate("/login");
  // User is taken back to login page
};
```

---

## 10. Security Considerations

### What NovaAI Does Well

**bcrypt for password hashing** — industry standard, includes salt and cost factor.

**JWT for stateless auth** — no session storage needed, scales horizontally.

**`userId` from token, not from request body** — routes use `req.user.userId` (from the verified token), not `req.body.userId` or `req.query.userId`. This prevents privilege escalation: an attacker cannot send `{ userId: "other-user-id" }` in the body to access another user's data.

```javascript
// SECURE — userId comes from verified token:
const threads = await Thread.find({ userId: req.user.userId });

// INSECURE — would let anyone access any user's data:
const threads = await Thread.find({ userId: req.body.userId });
```

**Ownership checks on every data operation** — every Thread query includes `userId: req.user.userId`, so you can only read/modify your own threads even if you know another user's `threadId`.

**Vague error messages on login** — "Invalid credentials" rather than "Email not found" prevents user enumeration.

### Known Limitations

**Token stored in localStorage** — susceptible to XSS (Cross-Site Scripting) attacks. If a malicious script runs on the page, it can read `localStorage` and steal the token. Cookies with `httpOnly` and `SameSite=Strict` flags are more secure (not accessible to JavaScript), but more complex to implement. For a personal project, localStorage is acceptable.

**No server-side token revocation** — once a token is issued, it cannot be invalidated until expiry. If a user's device is stolen, their token remains valid for up to 7 days. Production apps mitigate this with short token lifetimes (15 minutes) plus refresh tokens, or a Redis-backed token denylist.

**JWT_SECRET in environment variable** — anyone with access to the server's environment can sign their own tokens. This is standard practice, but the secret must be rotated if compromised.

---

## 11. Summary

| Concept | What It Is | Where in NovaAI |
|---------|-----------|-----------------|
| Authentication | Verifying user identity | Every protected API route |
| Password hashing | One-way transformation; cannot reverse | `bcrypt.hash()` at registration |
| bcrypt | Hashing algorithm with salt + cost factor | `models/User.js`, `/register` route |
| Salt | Random string mixed into hash before hashing | Auto-generated by bcrypt |
| Cost factor | Controls how many iterations bcrypt runs | `saltRounds = 10` |
| `bcrypt.compare()` | Verify input against stored hash | `/login` route |
| JWT | Signed token containing user identity | Issued at login, sent with every request |
| Header | Algorithm declaration (HS256) | First part of token |
| Payload | Claims (userId, email, exp) | Second part — base64-encoded, readable |
| Signature | HMAC-SHA256 of header+payload with secret | Third part — proves authenticity |
| `jwt.sign()` | Creates a JWT | `/login`, `/register` routes |
| `jwt.verify()` | Validates signature and expiry | `verifyToken` middleware |
| `verifyToken` | Express middleware applied to protected routes | Applied via `app.use()` |
| `req.user` | Decoded token payload, attached by middleware | All route handlers |
| `authFetch` | Frontend wrapper adding Authorization header | All protected API calls |
| `JWT_SECRET` | Server-side secret for signing tokens | `process.env.JWT_SECRET` |
| Token expiry | `exp` claim — 7 days in NovaAI | Set in `jwt.sign({ expiresIn: "7d" })` |
| Logout | Remove token from localStorage | `handleLogout()` in Sidebar |
| Unauthorized handler | 401 response → clear token + redirect | `setUnauthorizedHandler` in App.jsx |
| Privilege escalation | Using another user's ID to access their data | Prevented by using `req.user.userId` |

---

## 12. Interview Questions and Answers

---

**Q: How does NovaAI handle user authentication?**

A: NovaAI uses JWT (JSON Web Token) based authentication. When a user registers or logs in, the backend verifies credentials, creates a signed JWT containing the user's ID and email, and returns it. The JWT is signed with HMAC-SHA256 using a server-side secret key. The frontend stores this token in localStorage and attaches it to every subsequent request via the Authorization header. A `verifyToken` Express middleware runs before every protected route, calls `jwt.verify()` to validate the signature and check expiry, then attaches the decoded payload to `req.user`. Route handlers use `req.user.userId` — which came from the verified token, not the request body — to ensure users can only access their own data.

---

**Q: How are passwords stored in the database?**

A: Passwords are never stored in plaintext. At registration, bcrypt hashes the password with a cost factor of 10 and a randomly generated salt. The resulting hash (which embeds the algorithm version, cost factor, salt, and hash in one string) is stored in the `passwordHash` field. At login, `bcrypt.compare()` is called with the entered password and the stored hash — bcrypt extracts the salt from the hash, re-hashes the input, and compares. If they match, the password is correct. This approach means even if the database is breached, attackers get only hashes — bcrypt's cost factor makes brute-force guessing computationally expensive, and the random salt per user defeats precomputed rainbow tables.

---

**Q: What is a JWT and what are its three parts?**

A: A JWT (JSON Web Token) is a compact, URL-safe string for transmitting claims between parties. It has three parts separated by dots:

1. **Header** — base64url-encoded JSON declaring the algorithm (`{"alg":"HS256","typ":"JWT"}`)
2. **Payload** — base64url-encoded JSON containing the claims (in NovaAI: `userId`, `email`, `iat`, `exp`)
3. **Signature** — HMAC-SHA256 of the encoded header and payload, using the server's secret key

The signature is what makes JWTs trustworthy. If an attacker modifies the payload to change the `userId`, the signature won't match when verified, and the token is rejected. The payload is base64-encoded (not encrypted), so it's readable by anyone with the token — it should never contain sensitive data.

---

**Q: What is middleware and how does verifyToken work?**

A: Middleware is a function that runs between the incoming request and the route handler. Express executes middleware in order, and each middleware calls `next()` to pass control to the next function or returns a response to stop the chain. `verifyToken` runs before every protected route: it extracts the token from the `Authorization: Bearer <token>` header, calls `jwt.verify()` with the server's secret key, and if validation passes, attaches the decoded payload to `req.user`. If the token is missing, malformed, or expired, it returns a 401 response and the route handler never runs. The route handler then uses `req.user.userId` — injected by the middleware — to scope database queries to the authenticated user.

---

**Q: Why is `req.user.userId` used instead of something from `req.body`?**

A: `req.user.userId` comes from the verified JWT — it's what the server cryptographically confirmed about the requester. `req.body.userId` is what the client claims to be — it can be set to anything. If route handlers used `req.body.userId` for database queries, an attacker could send any user's ID and read or modify their data. This is called a privilege escalation or IDOR (Insecure Direct Object Reference) vulnerability. By always using `req.user.userId` from the verified token, the server enforces that users can only access their own data, regardless of what's in the request body.

---

**Q: What are the limitations of JWT-based auth and what would you do differently for a production app?**

A: The main limitations are: (1) No instant revocation — a stolen JWT remains valid until expiry (7 days in NovaAI). (2) Storing the token in localStorage exposes it to XSS attacks. For production I'd improve this in two ways: First, use short-lived access tokens (15 minutes) combined with longer-lived refresh tokens stored in httpOnly cookies (inaccessible to JavaScript). The access token expiring frequently limits the damage window if stolen. Second, implement a token denylist in Redis — on logout or password change, store the token's JTI (unique JWT ID) in Redis until its expiry. The `verifyToken` middleware checks this denylist before accepting any token, enabling immediate revocation without making the entire system stateful.

---

**Q: How does the frontend know if a user's token has expired without making a server request?**

A: The JWT payload is base64url-encoded and can be decoded in the browser using `atob()` (no crypto library needed). The `exp` claim is a Unix timestamp in seconds. By splitting the token on ".", taking the second segment, base64-decoding it, and comparing `exp` to `Date.now() / 1000`, the app can check expiry client-side before making any API call. This avoids wasting a network round-trip when the token is clearly expired. Note that this only checks expiry — it doesn't verify the signature, which requires the server's secret key. A client could construct a fake token with a future `exp` date, but `jwt.verify()` on the server would reject it when the signature doesn't match.
