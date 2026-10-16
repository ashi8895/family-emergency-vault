# Family Emergency Vault

A zero-knowledge vault that tells your family **where everything is** (insurance, bank accounts, investments, property papers) if something happens to you, and opens only when enough people you trust agree.

> **Prototype.** Use fake data only. Do not enter real passwords, card numbers, CVVs or bank credentials.

## The problem

When the person who earns for a family dies or cannot respond, the family often has no idea which policies exist, which bank accounts to claim, or where the papers are. Existing tools (Google Inactive Account Manager, Apple Digital Legacy, password-manager emergency access) are built for tech-savvy people and ignore India-specific needs: LIC and other policies, EPF, FDs, demat, property papers, nominees. The biggest gap is **discovery**: the family does not know what exists.

This project stores **what exists, where it is and what to do**, encrypted so that even the server cannot read it, and hands it over safely.

## How it works

![Architecture](docs/img/architecture.png)

1. **You write notes and attach scans.** Everything is encrypted in your browser (AES-256-GCM) before it is sent. The server stores ciphertext only.
2. **You choose 2 to 5 trusted people.** Your vault key is split with **Shamir's Secret Sharing**. Each person gets one piece, encrypted to their own key. One piece alone opens nothing.
3. **A safety switch watches over you.** If you stop answering check-in emails, your trusted people are asked to approve.
4. **Enough approvals, then a waiting period.** You can stop it with one click at any time. Nothing opens early.
5. **The family opens the vault together.** Each person unlocks their piece with their own passphrase and passes a short code to whoever is opening it. The page works in English and Hindi.

## Features

| Area | What it does |
|---|---|
| Zero-knowledge storage | One master password becomes two keys (HKDF): one to sign in, one to encrypt. The server can log you in but never decrypt. |
| Encrypted items and files | Notes, instructions and attachments (10 MB) encrypted per field, bound to the field name so ciphertexts cannot be swapped. |
| Trusted contacts | Invite by single-use link (email or WhatsApp). Contacts need no account: their browser makes an RSA key pair. Fingerprint check stops a malicious server from swapping keys. |
| Shamir key pieces | Own implementation over GF(256). Any k of n pieces rebuild the key. A built-in key check detects wrong or mismatched pieces. |
| Dead-man's switch | Pure state machine: `ACTIVE, WARNING, PENDING_APPROVAL, WAITING_PERIOD, UNLOCKED`. Cancel at every stage before UNLOCKED. |
| Family access page | Large type, step-by-step checklist, print button, English and Hindi. |
| Drawer permissions | Each person only reads the drawers you allow. |
| Audit log | Hash-chained, tamper-evident, readable in plain language. |
| Two-step sign-in | TOTP (RFC 6238, no library) with recovery codes. |

![Safety switch states](docs/img/states.png)

## Tech stack

React 18, TypeScript, Tailwind (web) · Node 22, Express, TypeScript, Mongoose (API) · MongoDB · Web Crypto API in the browser, Node `crypto` on the server · Zod validation · Nodemailer · tsx test runner

## Run it locally

You need Node 20+ and a MongoDB (local or Atlas).

```bash
# 1. API
cd apps/server
cp .env.example .env        # Windows CMD: copy .env.example .env
# open .env and fill the three secrets (the command is written inside the file)
npm install
npm run dev                 # http://localhost:4000

# 2. Web (a second terminal)
cd apps/web
npm install
npm run dev                 # http://localhost:5173
```

Emails are printed in the **server console** when `SMTP_URL` is empty, so you can try everything with fake addresses.

**Fast demo mode:** add `TIME_UNIT_MS=60000` and `SCHEDULER_TICK_MS=10000` to `apps/server/.env`. Now "1 day" lasts 1 minute and the whole timeline runs in a few minutes. The server refuses this setting in production.

## Tests

```bash
npm run test         # from the repository root: runs both suites
npm run typecheck    # TypeScript strict checks for both apps
```

| Suite | Tests | Covers |
|---|---|---|
| `apps/server` | 47 | state machine, signed links, TOTP (RFC 6238 and 4226 vectors), audit hash chain, secret box, recovery codes, file storage adapters, key validation |
| `apps/web` | 48 | AES and KDF, GF(256) arithmetic (AES test vector), Shamir (every subset), RSA contact keys, end-to-end 2-of-3 recovery, key piece codes, English and Hindi dictionaries in sync, setup-progress logic |

**Also run during development, not part of `npm test`:** the real service code against an in-memory stand-in for MongoDB (24 end-to-end scenarios) and a server-side render of every screen in both languages (77 checks). **Not yet run:** against a real MongoDB, or in a real browser. See [Roadmap](#limitations-and-roadmap).

## Troubleshooting

| Problem | Fix |
|---|---|
| **Scanning the two-step QR "gives no code"** | The QR must be scanned inside an **authenticator app** (Google Authenticator, Microsoft Authenticator or Authy): tap *+*, then *Scan a QR code*. The phone camera and Google Lens only show a link. No phone? Run `npx tsx scripts/totp-now.ts --watch YOUR-SETUP-KEY` in `apps/server`; it shows a live code you can type into the app. |
| **Two-step code is always "wrong"** | Delete older "Family Emergency Vault" entries in your authenticator app and use only the newest (every press of *Set up* makes a new key). Set the phone's date and time to Automatic and check the computer's clock. To see what the server expects right now: `cd apps/server` then `npx tsx scripts/totp-now.ts YOUR-SETUP-KEY` and compare the CURRENT code with your phone. |
| **Safety switch says "Not switched on yet"** | The switch only starts once two people have accepted and key pieces exist. The **Set up your safety net** card under the header shows exactly which step is missing. |
| **Server says it cannot connect to MongoDB Atlas** | In Atlas open *Security, Network Access* and add your current IP (or `0.0.0.0/0` for a demo). Also check the cluster is not paused and that `MONGODB_URI` has no `<password>` placeholder left. |
| **Link or code printed in the server console is cut in two** | Make the console window wider before copying. |

## Project layout

```
apps/server/src   config/ models/ routes/ services/ middleware/ validators/ utils/ tests/
apps/web/src      crypto/ i18n/ api/ pages/ components/
docs/             architecture, threat model, deploy, demo script, interview guide, build log
```
The browser holds all cryptography (`apps/web/src/crypto`). The server has **no decryption code**.

## Documentation

- [Architecture and design decisions](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Deploying](docs/deploy.md)
- [Design notes](docs/design.md)
- [Five-minute demo script](docs/demo-script.md)
- [Interview guide and study plan](docs/interview-guide.md)
- [Build log, phase by phase](docs/phases.md)

## Limitations and roadmap

Honest list; the threat model explains each one.

- **Not yet tested against a real MongoDB or in a browser.** Highest priority: integration tests with `mongodb-memory-server` and end-to-end tests with Playwright.
- A forgotten master password means a lost vault (that is what zero-knowledge means). Next step: recover through the trusted people's pieces, and a change-password flow.
- Drawer permissions are enforced by the server, not by separate keys per drawer.
- Closing access after an emergency cannot take back what was already seen; the vault key is not rotated yet.
- Key piece codes travel between people (read aloud, WhatsApp). A relay encrypted to the person opening the vault would remove the typing.
- Email only. WhatsApp and SMS fit behind the existing `Notifier` interface.
- Hindi covers the pages families use in an emergency; the owner screens are English.
- Emails are not retried on failure (needs an outbox table).
