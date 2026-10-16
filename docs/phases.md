# Build log: what each phase added

This file is the detailed record of how the project was built, phase by phase. For the overview see the main [README](../README.md).

A zero-knowledge vault where a family's "what exists and where" is encrypted in the browser before it reaches the server. Later phases add trusted contacts (Shamir 2-of-3), a dead-man's switch, an audit log and a family-friendly access page.

## What Phase 1 contains
- Sign-up / login with **one master password -> two derived keys** (PBKDF2 600k, then HKDF): `authKey` goes to the server, the key-encryption key (KEK) never leaves the browser.
- A random 256-bit **vault key (VK)**, wrapped by the KEK and stored on the server as ciphertext.
- Vault items (title, notes, instructions) encrypted with **AES-256-GCM**, plus encrypted file attachments (max 10 MB, stored on local disk).
- Category stays in plaintext so the server can enforce per-category permissions in Phase 4.
- Login hardening: scrypt on the server over the authKey, account lockout (5 failures -> 15 min), rate limits, uniform errors, fake salt for unknown emails.

## Run it
Needs Node 20+ and a MongoDB instance.

```bash
# 1. API
cd apps/server
cp .env.example .env     # fill the three secrets (command is inside the file)
npm install
npm run dev              # http://localhost:4000

# 2. Web (second terminal)
cd apps/web
npm install
npm run dev              # http://localhost:5173  (proxies /api to :4000)
```

## Tests
```bash
cd apps/web    && npm test   # 12 crypto tests (round-trip, tamper, wrong key, AAD swap, KDF, files)
cd apps/server && npm test   # password hashing + fake-salt tests
```

## Layout
```
apps/server/src  config/ models/ routes/ middleware/ validators/ utils/ tests/
apps/web/src     crypto/ api/ pages/ components/
```
`crypto/` exists only in the web app. The server has no decrypt code at all.

## Threat notes for this phase
| Threat | Handling |
|---|---|
| Database / server leak | Only ciphertext, IVs, salts and an scrypt hash of authKey are stored |
| Server swaps ciphertext between fields | Per-field AAD makes decryption fail |
| Tampered ciphertext | GCM auth tag rejects it |
| Online password guessing | Rate limit + lockout + scrypt |
| Email enumeration at login | Uniform error, deterministic fake salt, dummy hash check |
| Stolen access token | 15 min lifetime, held in memory only; refresh token is httpOnly + SameSite=Strict |

## Known limits (honest list)
- Forgot master password = vault is unrecoverable (zero-knowledge). Phase 2's trusted-contact shares become the recovery path.
- Reloading the page locks the vault (the VK lives only in memory). You sign in again.
- Registration reveals whether an email is taken (409). Acceptable for a prototype.
- Orphan uploads (uploaded but never saved into an item) are not cleaned up yet; Phase 3's job queue will handle it.
- If the browser itself is compromised (XSS, malicious extension), client-side encryption cannot help. Strict CSP is planned for Phase 4.
- `crypto.subtle` needs HTTPS or `localhost`.


---

# Phase 2: trusted contacts, invite flow, Shamir sharing

## What it adds
- Owner invites 2-5 people. A single-use, 7-day invite link is created (only its SHA-256 is stored). It is emailed if `SMTP_URL` is set; otherwise it is printed in the server console (dev only) and shown in the UI with Copy / WhatsApp buttons.
- The invited person has **no account**. They open `/invite/<token>`, pick a passphrase, and their browser creates an **RSA-3072 key pair**. The public key goes to the server; the private key is encrypted with their passphrase first.
- The page shows a **verification code** (fingerprint of the public key). The owner checks it with the contact by phone before anything is encrypted to that key. This stops a malicious server from swapping in its own key.
- The owner's browser splits the **vault key** with **Shamir's Secret Sharing** (own GF(256) implementation, `crypto/shamir.ts`), encrypts each piece to one contact's public key (RSA-OAEP) and uploads only those ciphertexts. Threshold is chosen by the owner: any k of n (2 <= k <= n <= 5).
- A **key check** (a known sentence encrypted with the vault key) lets a client verify that rebuilt pieces are correct, because Shamir returns garbage, not an error, when pieces are wrong or too few.
- Removing a person deletes their link, keys and piece, and marks the set stale so the owner re-creates pieces.

## New endpoints
| Method | Path | Who |
|---|---|---|
| GET | `/api/contacts` | owner |
| POST | `/api/contacts/invite` | owner |
| POST | `/api/contacts/:id/resend` | owner (new link, old one dies) |
| DELETE | `/api/contacts/:id` | owner |
| POST | `/api/contacts/shares` | owner (uploads encrypted pieces + keyCheck) |
| GET | `/api/invites/:token` | public, token = credential |
| POST | `/api/invites/:token/accept` | public, token = credential |

## Try it (you need 3 browser identities)
1. Sign in as the owner in a normal window. Open **Trusted people** and invite two fake emails.
2. Copy each invite link (UI, or the server console). Open each in its **own incognito window / another browser**. Accept with a passphrase and note the code shown.
3. Back in the owner window, tick the verification box for each person (after comparing the codes) and press **Create key pieces**.
4. In MongoDB, `trustedcontacts` now has `publicKey`, `wrappedPrivateKey` and `encryptedShare` (all unreadable) per contact, and `users.shares` holds generation/threshold/keyCheck.

## Tests
```bash
cd apps/web    && npm test   # 31 tests: AES/KDF, GF(256), Shamir (all subsets), RSA contact keys, end-to-end 2-of-3 recovery
cd apps/server && npm test   # 6 tests: invite tokens, RSA public key validation, password hashing
```

## Threat notes added in Phase 2
| Threat | Handling |
|---|---|
| Server swaps a contact's public key (MITM) | Owner verifies the key fingerprint out of band before sharing |
| One contact is malicious | Piece alone reveals nothing (k-1 pieces are information-theoretically useless) |
| Invite link leaked or replayed | 256-bit token, hashed at rest, atomic single use, 7-day expiry, `Referrer-Policy: no-referrer` |
| DB leak | Only encrypted private keys and RSA-encrypted pieces; offline guessing of one passphrase yields one useless piece |
| Weak/junk public key uploaded | Server accepts only real RSA keys of >= 3072 bits |
| Old and new pieces mixed | Pieces carry a generation; the key check rejects mixed sets |

## Known limits (honest list)
- Pieces are **not released to anyone yet**. Phase 3 adds the check-in, approval and waiting-period flow that does that.
- Removing a person does not rotate the vault key itself. A removed person who somehow kept an old piece plus another old piece could rebuild the key. Full revocation needs vault-key rotation (re-encrypting every item). Planned as future work.
- Whoever holds the vault key can decrypt every category. Per-category permissions in Phase 4 are enforced by the server withholding ciphertext, not by separate keys.
- Whoever has the invite link can accept it, so a hijacked email inbox is a risk. Phase 3's waiting period and owner alerts limit the damage.
- The pieces-and-contacts update is two database writes without a transaction (local MongoDB has none). A crash in between is fixed by pressing Create key pieces again.


---

# Phase 3: safety switch (dead-man's switch), approvals, waiting period, cancel

## What it adds
- **Check-in emails.** Every N days (default 30) the owner gets an "are you okay?" email with a link. Two reminders follow, one gap apart (default 3 days). Still no answer: the trusted people are emailed an approval link.
- **State machine** (`services/emergencyStateMachine.ts`, pure, no database): `ACTIVE -> WARNING -> PENDING_APPROVAL -> WAITING_PERIOD -> UNLOCKED`.
- **Approvals.** `threshold` trusted people (the same k used for the key pieces) must approve via their emailed link. Then a waiting period (default 7 days) starts. The owner is emailed at every step.
- **Cancel at any stage before UNLOCKED**: the emailed "I am okay" link, the "I am okay" button, or the red banner on every screen while a request runs. Signing in counts as a check-in (but never silently cancels a running request).
- **Safe by construction.** The switch only arms once enough trusted people hold a current key piece (otherwise nobody could open the vault, so nagging would be pointless). Removing a person during the wait re-checks approvals at the last moment and refuses to open if they fell below the threshold.
- **Owner UI**: new **Safety switch** tab (status, timing, check-in button) and an `EmergencyBanner`.
- **Public pages** (no account): `/alive/<token>` and `/approve/<token>`. Opening a link only *shows* a page; a button press sends the POST. Email scanners and link previews open links automatically, so a GET must never change anything.

## New endpoints
| Method | Path | Who |
|---|---|---|
| GET | `/api/emergency/status` | owner |
| PUT | `/api/emergency/settings` | owner (only while ACTIVE/WARNING; counts as a check-in) |
| POST | `/api/emergency/checkin` | owner ("I am okay", cancels a running request) |
| GET / POST | `/api/links/alive/:token` | public, signed link |
| GET / POST | `/api/links/approve/:token` | public, signed link |

## Design decisions worth knowing
- **MongoDB-backed scheduler instead of BullMQ/Redis.** Redis is one more thing to install (hard on Windows) and not needed here. A `setInterval` loop finds due accounts; each one is *leased* (`nextActionAt` pushed forward atomically) before it is processed, and every state change is a conditional update (filter on the old state and cycle id). Two server processes cannot send the same email twice. The pure state machine does not care how it is triggered, so swapping in BullMQ later only changes `scheduler.ts`.
- **Signed stateless links** (`utils/signedToken.ts`): `base64url(parts) + "." + HMAC-SHA256`. Whether a link is still usable lives in the database: the owner's `cycleId` rotates on every check-in (all old links die), and approval links work only while the case is pending.
- **State first, email second** (at-most-once). If an email fails, the step is not repeated. A production system would use an outbox table; noted below.

## Try it fast (demo mode: 1 "day" = 1 minute)
Add to `apps/server/.env` and restart the server (never in production, the server refuses to start with it when `NODE_ENV=production`):
```
TIME_UNIT_MS=60000
SCHEDULER_TICK_MS=10000
```
1. Make sure the **Trusted people** tab shows "Key pieces are in place".
2. **Safety switch** tab: set check-in `1 day`, reminders `1 day`, waiting `1 day`, press **Save timing** (this restarts the clock).
3. Watch the **server console**. Emails are printed there when `SMTP_URL` is empty. About 1 min later: check-in email. Then reminder 1, reminder 2, then the escalation: you see the owner email and one approval email per contact, each with a link.
4. Open two contacts' approval links in separate incognito windows. Tick the box, press **Approve**. After the second approval the waiting period starts and a banner appears on the owner screen.
5. Either press **I am okay, stop this** (cancel) or wait: after the waiting period the state becomes `UNLOCKED`.
Remove those two lines from `.env` when done.

## Tests
```bash
cd apps/server && npm test   # 21 tests: state machine (timeline, cancel at every stage, removal during wait), signed links, tokens, key validation, hashing
cd apps/web    && npm test   # 31 crypto tests (unchanged)
```
Beyond these, the real `services/emergency.ts` was run against an in-memory stand-in for MongoDB in 12 end-to-end scenarios (full 39-day timeline, double-click approvals, cancel during pending and waiting, removal during the wait, concurrent scheduler runs, forged links). It has not been run against a real MongoDB.

## Threat notes added in Phase 3
| Threat | Handling |
|---|---|
| Attacker hijacks a contact's email and approves | Needs `threshold` people, then a waiting period; the owner is emailed at every step and can cancel |
| Owner is fine but misses emails | Two reminders, a long default timeline, and the vault never opens without human approvals |
| Link scanner "clicks" the email link | GET never changes state, a button press does |
| Replayed or forged links | HMAC signature; owner links die when `cycleId` rotates; approval is idempotent per contact |
| Two servers or a slow tick send twice | Lease on `nextActionAt` plus conditional updates |
| Someone removed during the wait | Approvals are re-counted against currently accepted contacts at unlock time |
| Re-sharing key pieces during an emergency | Blocked (409) until the request is stopped |

## Known limits (honest list)
- Unlocking only changes state and sends emails. **Opening the vault** (the contacts combining their pieces and reading items) is Phase 4.
- Email failure is logged and not retried (state is written first). Needs an outbox table for production.
- Only the owner's login e-mail receives check-ins. WhatsApp/SMS plug into the `Notifier` interface later.
- Whoever controls the owner's email inbox can also press "I am okay". Two-factor sign-in (Phase 4) and a second contact channel reduce this.
- Interval changes restart the check-in clock (settings changes count as a check-in).


---

# Phase 4: opening the vault, family page (English + Hindi), permissions, audit log, two-step sign-in

## What it adds
- **Opening the vault after UNLOCKED.** Each trusted person gets an emailed link (`/access/<token>`). They enter their own passphrase, which unlocks their key piece **in their browser** and shows it as a **key piece code** (56 characters in 14 groups, with a checksum). The person opening the vault collects `k-1` codes from the others (read aloud, WhatsApp, paper), pastes them in, and the browser rebuilds the vault key and decrypts. The server only ever sends ciphertext and never sees a piece or the vault key.
- **Family page.** Large type, one step at a time, a "what to do now" checklist, a print button, **English / हिन्दी** toggle and a larger-text switch. The approval page is bilingual too.
- **Per-drawer permissions.** The owner chooses which drawers (Insurance, Bank, Medical, ...) each person may read. The server only returns items and files from allowed drawers.
- **"I am back".** If the owner returns after UNLOCKED they can close access: every access link dies and the switch restarts.
- **Tamper-evident audit log.** Every important event (sign-ins, edits, invitations, check-ins, approvals, unlock, every access by a trusted person) is appended to a per-owner **hash chain**. The Security tab shows it in plain language and can verify the whole chain.
- **Two-step sign-in (TOTP).** Authenticator app (QR code) plus 8 one-time recovery codes. Implemented from RFC 6238 with no library; replay-protected; wrong codes count toward the same lockout as wrong passwords.

## New endpoints
| Method | Path | Who |
|---|---|---|
| GET | `/api/access/:token` | trusted person (signed link, only while UNLOCKED): their own encrypted piece + key check |
| GET | `/api/access/:token/items` | same: encrypted items from allowed drawers |
| GET | `/api/access/:token/files/:id` | same: encrypted file, only from an allowed drawer |
| PATCH | `/api/contacts/:id/permissions` | owner |
| POST | `/api/emergency/close-access` | owner |
| GET | `/api/audit`, `/api/audit/verify` | owner |
| GET | `/api/2fa/status` | owner |
| POST | `/api/2fa/setup`, `/enable`, `/disable` | owner |
| POST | `/api/auth/login` | now returns `{twoFactorRequired:true}` after a correct password when 2FA is on, then accepts `totpCode` or `recoveryCode` |

## Try it
Update, then in `apps/web` run `npm install` (new package: `qrcode.react`).

1. **Security tab**: set up two-step sign-in, scan the QR code, enter the code, **save the recovery codes**. Sign out and in again to see the code step.
2. **Trusted people**: press **Change** next to a person and limit their drawers.
3. Run the demo-mode timeline from Phase 3 until the state is `UNLOCKED`. The server console prints one email per trusted person with an `/access/...` link.
   If the state is already `UNLOCKED` from an earlier test, use **I am back, close access** first, then run the timeline again.
4. Open **two** access links in separate incognito windows. In each, enter that person's passphrase and copy the key piece code.
5. In the first window, paste the other person's code(s) and press **Open the vault**. Switch language with the toggle.
6. Back as owner, the **Security** tab shows everything that happened. Press **Check the log has not been changed**.

## Tests
```bash
cd apps/server && npm test   # 43 tests: state machine, links, TOTP (RFC 6238/4226 vectors), secret box, audit chain, recovery codes
cd apps/web    && npm test   # 42 tests: crypto, Shamir, piece codes, English/Hindi dictionaries stay in sync
```
Also run during development (not shipped): the real services against an in-memory stand-in for MongoDB in 24 end-to-end scenarios (full timeline, approvals, cancel at every stage, access and permissions, files, closing access, audit chain tampering and concurrent writers, TOTP replay and recovery codes), and a server-side render of every screen in both languages with a cross-check that the Activity screen can describe every audit action the server emits. None of this has been run against a real MongoDB or in a real browser.

## Threat notes added in Phase 4
| Threat | Handling |
|---|---|
| Server or database leak after unlock | Contacts receive only ciphertext; decrypting needs their passphrase and `k` pieces, entered in the browser |
| Someone gets an access link | Still needs that person's passphrase and `k-1` other codes |
| Link works before it should | Valid only while the case is UNLOCKED and the person is still an accepted contact with a current piece |
| Attacker edits or deletes log entries | Hash chain: any change, deletion or re-order breaks verification at that entry |
| Stolen password | Second step (TOTP); 6-digit codes cannot be brute-forced (shared lockout), and each code works once |
| Lost phone | One-time recovery codes (stored only as hashes) |
| TOTP seed in a database leak | Sealed with AES-256-GCM using a key derived from a server secret |
| Typos when passing key piece codes | Crockford base32 (no look-alike letters) plus a 16-bit checksum |
| Malicious text inside an item (XSS) | React escapes it; verified in the smoke test |

## Known limits (honest list)
- **Drawer permissions are enforced by the server, not by cryptography.** Everyone who rebuilds the vault key could decrypt any ciphertext they manage to obtain. Real enforcement needs a separate key per drawer.
- **Key piece codes travel between people.** Treat them like keys. A relay that encrypts pieces to the person opening the vault would remove the typing but needs more coordination.
- **The audit chain cannot detect entries cut off the end**, and someone with full database control could rewrite the whole chain. Writing down the fingerprint shown after verification is the defence; emailing it periodically would be better.
- **Closing access cannot take back what was already seen.** The vault key is not rotated (re-encrypting every item) yet.
- **2FA protects signing in, not the encryption.** The master password still derives the keys. A lost master password is still a lost vault.
- Rotating `JWT_REFRESH_SECRET` invalidates all emailed links and stored 2FA seeds.
- Hindi covers the pages families use in an emergency (access, approval). The owner screens and the invite and "are you okay" pages are English only; `i18n/` shows how to add more.
- Audit events are written after the action, so a crash in between can lose one entry.
