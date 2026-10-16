# Threat model

A threat model says who could attack the system, what they could gain, and what stops them. This one is written for a **prototype**. It lists what is protected, what is only reduced, and what is not covered, so nobody is surprised.

## 1. What we protect

| Asset | Why it matters |
|---|---|
| Vault contents (notes, instructions, files) | They describe where a family's money and papers are |
| The vault key and the key pieces | Whoever holds the key reads everything |
| The owner's account | Controls check-ins, trusted people and permissions |
| The decision to open the vault | Opening it early or never are both harmful |
| The audit log | Evidence of who did what |

## 2. Who could attack

| Actor | What they can do |
|---|---|
| **A. Database or server leak** | Read every stored byte. May also be a curious or malicious operator. |
| **B. Network attacker** | Watch or alter traffic between browser and server |
| **C. One malicious trusted person** | Has one key piece, one email inbox, and wants the vault early |
| **D. Someone who controls the owner's email inbox** | Can press "I am okay" links and see check-in emails |
| **E. Someone who learns the owner's password** | Can sign in as the owner |
| **F. Malware or a malicious browser extension on a device** | Reads the screen, memory and keystrokes |
| **G. Someone with write access to the database** | Can edit or delete rows, including audit entries |

## 3. Threats, defences and what remains

| # | Threat | Defence in this project | Residual risk |
|---|---|---|---|
| A1 | Leaked database reveals vault contents | Client-side AES-256-GCM. The server has no decryption code and never gets the key. | The attacker still learns metadata: accounts, item counts, **drawer names**, timestamps. |
| A2 | Leaked login hash is replayed | The server stores scrypt of the browser-derived `authKey`, not a password | An attacker can still brute-force the master password offline against PBKDF2 (600k rounds). Choose a strong password. |
| A3 | Server swaps ciphertext between fields | Per-field AAD makes decryption fail | Two items' titles can still be swapped, because the item id is not in the AAD (planned) |
| A4 | Server substitutes its own public key for a trusted person | Owner compares a key fingerprint by phone before any piece is encrypted | Relies on the owner doing the check. The UI forces the tick box but cannot prove a call took place. |
| A5 | Server serves wrong script to the browser | none in this prototype | **A compromised or malicious host can ship altered JavaScript and steal the password.** Client-side crypto cannot defend against the page it runs in. Needs a strict CSP, subresource integrity and trust in the host. |
| B1 | Traffic is read or changed | HTTPS (host), Bearer tokens in memory, `SameSite=Strict` httpOnly refresh cookie | Depends on correct deployment |
| C1 | One person opens the vault alone | Shamir: any k-1 pieces reveal nothing. k approvals are required. | Collusion of k people is by design allowed (after the waiting period) |
| C2 | A trusted person approves early or maliciously | Waiting period; owner is emailed at every step and can stop it; contacts are asked to try to reach the owner first | If the owner is genuinely unreachable and k people collude, the vault opens. That is the point of the feature. |
| C3 | A removed person still holds a piece | Their piece, keys and link are deleted; the set is marked stale; re-creating pieces uses a **new random polynomial** | **The vault key itself is not rotated.** An old piece plus another old piece from before removal could rebuild the key. Needs vault-key rotation. |
| C4 | Contact reads drawers they should not | Server returns only allowed drawers and files | **Server-enforced, not cryptographic.** Whoever rebuilds the key can decrypt any ciphertext they obtain. |
| D1 | Email takeover abuses links | A link only proves email control. Approvals still need k people and a waiting period. Owner alerts at every step. | A hijacked owner inbox can press "I am okay" and keep postponing, so a real emergency would be delayed |
| D2 | Link scanners trigger actions | GET never changes state; a button sends a POST | none |
| D3 | Links are forged, edited or replayed | HMAC signature, `cycleId` rotation, atomic and idempotent approvals, invites stored as hashes and single-use | Rotating the server secret invalidates all links |
| E1 | Password guessing | 5 failures lock the account for 15 minutes; rate limits; identical errors for unknown email and wrong password | Distributed guessing is only slowed |
| E2 | Stolen password gives access | TOTP second step with replay protection; recovery codes stored as hashes; wrong codes count toward the same lockout | 2FA protects **sign-in**, not the encryption. The password still derives the keys. |
| E3 | Stolen session | Access token lives 15 minutes in memory; refresh cookie is httpOnly | The refresh token can be stolen with the device |
| F1 | Malware or XSS reads the unlocked vault | React escapes content (checked in a smoke test); no `dangerouslySetInnerHTML` | **Not defended.** Anything running in the page sees the key. Add CSP and keep dependencies updated. |
| G1 | Audit entries edited, deleted or re-ordered | Hash chain, verified on demand | A full chain rewrite, or cutting entries off the end, is not detectable unless the head fingerprint is stored elsewhere |
| H1 | Two events race (double approval, two schedulers) | Conditional updates, lease on the timer, unique index and queue for the audit chain | Not proven against a real MongoDB yet |
| H2 | Owner returns after the vault opened | "I am back" closes access and restarts the switch | What was already seen cannot be taken back |
| H3 | Forgotten master password | none, by design | **The vault is lost.** Recovery through trusted people is planned. |

## 4. Out of scope

Physical coercion, a trusted person who is simply untrustworthy, legal questions about access to someone's accounts and papers, denial of service at scale, and anything about the real bank or insurer systems the notes describe.

## 5. Before this could hold real data

1. Integration tests against a real MongoDB and end-to-end browser tests.
2. A strict Content-Security-Policy and HSTS at the host, and a dependency audit (`npm audit`).
3. An independent review of the cryptography, in particular the hand-written Shamir and TOTP code.
4. Vault-key rotation, per-drawer keys, an email outbox with retries, backups.
5. A privacy policy, data-retention rules, and a decision about IP addresses in audit entries.
