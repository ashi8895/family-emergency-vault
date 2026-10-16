# Interview guide and study plan

## 0. Read this first: ownership

A project helps you in an interview only if you can **explain it and change it**. Interviewers ask "why did you do it this way?" and "how would you add X?", and they notice quickly when someone is reciting.

- Be open about how it was built. If an AI assistant wrote much of the code, say so plainly and say what *you* did: chose the problem, decided the requirements, ran it, tested it, read every file in the study plan below, and can change it. Something like: "I defined the problem and the security goals and built it step by step with an AI coding assistant. I can walk through every part."
- Never claim what is not true: do not say "deployed" until it is, and do not say "audited" or "production-ready". The README already lists what is untested.
- The study plan in section 6 is not optional. Seven short sessions make the difference between a project you own and one you show.

## 1. The 30-second pitch

> "When the person who earns for a family dies, the family often does not know which policies and accounts exist. I built a vault for that. Everything is encrypted in the browser, so even the server cannot read it. A safety switch emails you regularly, and if you stop answering, your trusted people are asked to approve. The key is split with Shamir's secret sharing, so no single person can open it, and there is a waiting period where you can stop it with one click."

## 2. "Isme naya kya hai?" (the clone question)

Companies often ask: "this already exists, what did *you* solve?" Answer with the **problem you chose**, the **hard parts**, and the **evidence**:

- Problem: families do not know **what exists and where**, and existing tools target tech-savvy people and ignore Indian assets (LIC, EPF, FDs, demat, nominees).
- Hard parts: zero-knowledge encryption, splitting trust across people, a time-based emergency flow that is safe against races and abuse.
- Evidence: 95 automated tests including official RFC test vectors, a written threat model with its own limits listed, and a diagram of every design choice.

Also say what you would do next. Interviewers like people who know where their project is weak.

## 3. Resume bullets

Pick three or four. Replace the placeholders. Only include what is true.

- Built **Family Emergency Vault**, a zero-knowledge web app (React, TypeScript, Node, Express, MongoDB): data is encrypted in the browser with AES-256-GCM, so the server stores only ciphertext.
- Implemented **Shamir's Secret Sharing** over GF(256) with RSA-OAEP key wrapping, so any *k* of *n* trusted people (and nobody else, including the server) can open the vault.
- Designed the **dead-man's switch** as a pure state machine with a lease-based scheduler and one-click cancellation at every stage; handled races with conditional updates.
- Wrote **95 automated tests**, including RFC 6238 test vectors for a hand-written TOTP implementation and exhaustive subset tests for Shamir.
- Added a **tamper-evident audit log** (hash chain), TOTP two-step sign-in, and an accessible **English and Hindi** page for families.
- Live demo: `<your-link>` · Code: `github.com/ashi8895/<repo>`

## 4. Questions and model answers

Say them in your own words. The answers are short on purpose.

### Problem and product
**Why not just use Google's Inactive Account Manager?** It covers a Google account. Families need to know about policies, banks and property that live elsewhere, in their own language, and the access must need several people to agree and have a waiting period.

**What if the user never finishes setup?** The switch only arms when enough trusted people hold a current key piece. Until then no check-in emails are sent, because nobody could open anything anyway.

### Cryptography
**How can the server log me in but not read my data?** The password goes through PBKDF2, then HKDF with two different labels. One output (`authKey`) is sent to the server. The other (the key-encryption key) never leaves the browser. The two are independent, so knowing one gives nothing about the other.

**Why PBKDF2 in the browser and scrypt on the server?** PBKDF2 is built into Web Crypto. The server hashes `authKey` again with scrypt, so a leaked database hash cannot be replayed as a login.

**Why AES-GCM and what is AAD?** GCM gives encryption and tamper detection. The additional authenticated data is not encrypted but is bound into the tag. I use the field name as AAD, so a malicious server cannot move the "notes" ciphertext into the "title" slot. Weak spot: the item id is not in the AAD yet.

**How does Shamir's Secret Sharing work?** The secret is the constant term of a random polynomial of degree k-1. Each person gets one point on it. Any k points determine the polynomial by Lagrange interpolation, so they give the secret. With k-1 points every possible secret is still equally likely, so they reveal nothing. I do it per byte over GF(256).

**Why GF(256)?** Bytes map directly to field elements, addition is XOR, and there is no overflow or rounding. I checked my multiplication against the known AES test vector (0x57 times 0x83 is 0xC1).

**How do you know the rebuilt key is right?** Shamir returns a wrong value, not an error, for wrong or too few pieces. So I store a "key check": a known sentence encrypted with the real vault key. After rebuilding I try to decrypt it.

**How do you stop a malicious server swapping a trusted person's public key?** The owner's screen shows a fingerprint (SHA-256 of the key) and the contact's screen shows the same. The owner compares them by phone before pieces are created. It is like Signal's safety number.

**Where does zero-knowledge stop?** The server also serves the JavaScript. A compromised host could ship altered code that steals the password. Client-side crypto cannot defend against the page it runs in. Metadata such as the drawer names is also visible.

### Backend and concurrency
**Why a pure state machine?** It has no database, clock or email, so rules are easy to read and I can test a 39-day timeline in milliseconds. A thin service layer applies each transition.

**How do you avoid sending an email twice?** Before processing an account the scheduler claims it by pushing its next-run time forward in one atomic update (a lease). Then every state change is a conditional update filtered on the old state and a cycle id. If the owner checked in a moment earlier, the update matches nothing and no email goes out.

**Why MongoDB polling instead of Redis and BullMQ?** Nothing extra to install, and the work is idempotent. At larger scale I would move to a queue; only `scheduler.ts` would change, because the rules live in the pure state machine.

**Why does opening a link not do anything?** Email scanners and link previews open links automatically. If a GET approved something, a scanner could approve for a person. So GET only shows a page and a button sends a POST.

**How do signed links work?** `base64url(parts) + "." + HMAC-SHA256`. The signature stops forging. Whether a link is still usable is decided by the database: the owner's cycle id rotates on every check-in, so all older links die, and approvals only work while a case is pending.

**How does the audit log detect tampering?** Each entry stores the hash of the previous one. Editing, deleting or re-ordering any entry breaks every hash after it. Limits: cutting entries off the end is not visible unless you keep the latest fingerprint, and someone who controls the whole database can rewrite the chain.

**How does a TOTP code work only once?** Each accepted code's time step is stored with a conditional update ("only if the new step is greater"). Two requests with the same code at once: exactly one wins. Wrong codes count toward the same lockout as wrong passwords.

### Frontend and design
**How do trusted people open the vault with no account?** A signed link proves they control the email, and their passphrase unlocks their own private key in the browser. The server only ever sends ciphertext.

**Why codes with a checksum for key pieces?** The server must not see pieces, so people pass them to each other. Crockford base32 avoids look-alike letters and a 16-bit checksum catches most typos.

**Why English and Hindi, large text, a checklist?** The people opening the vault are stressed, may be older, and may not read English comfortably. The page is built for them first.

### Testing
**How did you test time-based logic?** The state machine takes the time as an argument, so tests use a fake clock. For manual demos a `TIME_UNIT_MS` setting makes one day last a minute, and the server refuses it in production.

**What is not tested?** I tested the real service code against an in-memory stand-in for MongoDB, but not against a real MongoDB, and there are no browser end-to-end tests. That is my first next step (`mongodb-memory-server` and Playwright).

**Tell me about a bug you found.** Good story: concurrent audit writes. Under a burst of more than six simultaneous events some entries were lost, because writers raced for the same sequence number and gave up after a few retries. The fix was a per-owner queue inside the process plus a unique index and retry for multiple processes, and a test with ten simultaneous writers.

### Judgement
**What would you improve?** Integration and end-to-end tests; account recovery through trusted people; vault key rotation; separate keys per drawer so permissions are cryptographic; an email outbox with retries; strict CSP; an external review of the crypto.

**What would you do differently?** Put the item id into the AAD from the start, and add a change-password flow earlier.

## 5. Whiteboard: trace one request

"Saving an item": browser derives the key at sign-in, encrypts each field with its own AAD, sends ciphertext → `PUT /api/vault/items/:id` → `requireAuth` checks the 15-minute access token and `tokenVersion` → Zod validates the shape → the route checks that attachments belong to this user → Mongo stores ciphertext → an audit entry is appended to the hash chain → the response is ciphertext again.

## 6. Study plan: seven sessions

| Session | Read | Do |
|---|---|---|
| 1 | README, `docs/architecture.md`, run the app and the demo script | Break one test on purpose and watch it fail, then fix it |
| 2 | `crypto/aes.ts`, `kdf.ts`, `vault.ts` | Explain the key diagram without looking. Why two keys from one password? |
| 3 | `crypto/shamir.ts`, `keypair.ts`, `recovery.ts` | On paper, split the number 7 into 3 shares (any 2 rebuild) over a small field. Change a test to 3-of-5 |
| 4 | `services/emergencyStateMachine.ts` and its test | Change the number of reminders from 2 to 3 and fix the tests |
| 5 | `services/emergency.ts`, `routes/links.ts` | Trace one approval request from link to database. Add a new audit event |
| 6 | `pages/AccessPage.tsx`, `i18n/` | Add a new drawer (server list, web list, Hindi and English names) and make the tests pass |
| 7 | This guide | Record yourself giving the 30-second pitch and the 2-minute walkthrough, then answer five questions aloud |

Stretch: write one `mongodb-memory-server` integration test for the approval flow. It is the best next step for the project and a good story for an interview.
