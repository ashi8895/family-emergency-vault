import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { ensureEmergencyForExistingUsers } from './services/emergency.js';
import { startScheduler } from './services/scheduler.js';

async function main() {
  await connectDb();
  await ensureEmergencyForExistingUsers();
  createApp().listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}`));
  startScheduler();
}

main().catch((err) => {
  console.error('Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
