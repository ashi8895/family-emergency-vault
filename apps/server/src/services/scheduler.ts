import { env } from '../config/env.js';
import { processDue } from './emergency.js';

/**
 * A small polling loop backed by MongoDB. Chosen over BullMQ/Redis for this prototype so there is nothing extra
 * to install, and because the work is idempotent: every step is a conditional update, and an account is "leased"
 * before being processed, so two server processes (or a slow tick) cannot send the same email twice.
 */
let timer: NodeJS.Timeout | undefined;
let running = false;

export function startScheduler() {
  const tick = async () => {
    if (running) return; // never overlap two ticks in one process
    running = true;
    try {
      await processDue(new Date());
    } catch (e) {
      console.error('Scheduler tick failed:', e instanceof Error ? e.message : 'unknown');
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, env.SCHEDULER_TICK_MS);
  timer.unref?.();
  void tick();
  console.log(`Safety-switch scheduler running (checks every ${env.SCHEDULER_TICK_MS / 1000}s, 1 day = ${env.TIME_UNIT_MS / 1000}s)`);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
}
