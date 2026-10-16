/**
 * Debug helper for two-step sign-in. Prints the codes the SERVER expects right now for a setup key.
 * Compare with your phone: if CURRENT matches the phone, the server is fine. If a different line matches, the clocks
 * are out of step. If none match, the phone has a different (older) entry for this app.
 *
 *   npx tsx scripts/totp-now.ts JBSW Y3DP EHPK 3PXP ...           (spaces in the setup key are fine)
 *   npx tsx scripts/totp-now.ts --watch JBSW Y3DP EHPK 3PXP ...   (live code that refreshes every second)
 *
 * --watch is also a stand-in authenticator app for testing on a computer without a phone.
 */
import { base32Decode, hotp, STEP_SECONDS, stepAt } from '../src/utils/totp.js';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const key = args.filter((a) => a !== '--watch').join('');
if (!key) {
  console.log('Usage: npx tsx scripts/totp-now.ts [--watch] YOUR-SETUP-KEY');
  process.exit(1);
}

let secret: Buffer;
try {
  secret = base32Decode(key);
} catch {
  console.log('That does not look like a setup key (only letters A-Z and digits 2-7 are allowed).');
  process.exit(1);
}


if (watch) {
  // Live display: the code, and how many seconds until it changes. Press Ctrl+C to stop.
  const show = () => {
    const t = Date.now();
    const left = STEP_SECONDS - Math.floor((t / 1000) % STEP_SECONDS);
    process.stdout.write(`\rCurrent code: ${hotp(secret, stepAt(t))}    changes in ${String(left).padStart(2, ' ')} s    `);
  };
  console.log('Live code (Ctrl+C to stop). Type the code into the app before it changes.');
  show();
  setInterval(show, 500);
} else {
  const now = Date.now();
  const step = stepAt(now);
  console.log('Time on this computer :', new Date(now).toString());
  console.log('Seconds left for CURRENT code:', STEP_SECONDS - Math.floor((now / 1000) % STEP_SECONDS));
  console.log('');
  console.log('Previous code (30 s ago):', hotp(secret, step - 1));
  console.log('CURRENT code            :', hotp(secret, step));
  console.log('Next code (in 30 s)     :', hotp(secret, step + 1));
  console.log('');
  console.log('The app accepts any of these three.');
}
