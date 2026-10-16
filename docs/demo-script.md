# Five-minute demo script

## Before you start (10 minutes earlier)

- Server and web running. In `apps/server/.env`: `TIME_UNIT_MS=60000` and `SCHEDULER_TICK_MS=10000`.
- An account with four fake items, three accepted trusted people (fake emails) and key pieces created. Safety switch timing: check-in 1 day, reminder gap 1 day, waiting 1 day (that is minutes in demo mode).
- Three private windows ready for the trusted people, each with their access link and passphrase written on a note.
- The Atlas collection `vaultitems` open in another tab.
- Screenshots of every step saved, in case the network or the live demo fails.

**Fake data:** LIC Jeevan Anand policy (Insurance), SBI salary account (Bank), Mutual funds (Investments), Flat registry papers (Property). Never real numbers.

## The script

| Time | You do | You say |
|---|---|---|
| 0:00 | Show the sign-in page | "If the person who earns for a family dies, the family often does not know what exists or where. I built a vault for exactly that, and the server cannot read it." |
| 0:30 | Add one item with a file | "This is encrypted in the browser before it is sent." Switch to Atlas and show the ciphertext. "This is everything the server has." |
| 1:15 | Trusted people tab, show verification codes | "Each person's browser makes its own key. I check the code by phone so a malicious server cannot swap it." Press **Create key pieces**. "The key is split. One piece alone opens nothing." |
| 2:00 | Safety switch tab | "This watches over me. If I stop answering check-ins, my trusted people are asked to approve." Show the server console printing the emails. |
| 2:45 | Open two approval links, approve | "It needs two of three people, and then a waiting period. I can stop it with one click until it opens." Show the red banner and press **I am okay** on one run if time allows. |
| 3:45 | Open an access link, switch to Hindi | "The family opens the vault together. Each person unlocks their piece with their own passphrase and passes a short code." Paste the second code. Show the items and the checklist. |
| 4:30 | Security tab | "Every step is in a tamper-evident log, and I can turn on two-step sign-in." Press **Check the log**. |
| 4:50 | Close | "47 and 48 automated tests, including the official test vectors for the authenticator algorithm. The limitations are written in the README." |

## If something breaks

- Say what you expect to see, show the screenshot, and move on. Calm is more convincing than a perfect run.
- A wrong passphrase or a typo in a code is a good moment to show the friendly error and the checksum.

## Questions you will probably get

Use [the interview guide](interview-guide.md). The three most common: "What stops the server from reading it?", "What if the trusted people are dishonest?", "What happens if I forget my password?"
