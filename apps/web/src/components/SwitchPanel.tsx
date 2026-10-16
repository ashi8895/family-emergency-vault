import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDateTime, type SwitchSettings, type SwitchStatus } from '../types';

const INTERVALS = [1, 7, 14, 30, 60, 90];
const GAPS = [1, 2, 3, 5, 7];
const WAITS = [1, 3, 7, 14];

const HEADLINE: Record<SwitchStatus['state'], string> = {
  ACTIVE: 'Everything is normal',
  WARNING: 'We asked if you are okay and have not heard back',
  PENDING_APPROVAL: 'Your trusted people have been asked to approve',
  WAITING_PERIOD: 'Enough people approved. The waiting period is running',
  UNLOCKED: 'The vault has been opened for your trusted people',
};

export default function SwitchPanel() {
  const [status, setStatus] = useState<SwitchStatus | null>(null);
  const [form, setForm] = useState<SwitchSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<SwitchStatus>('/emergency/status');
      setStatus(s);
      setForm((f) => f ?? s.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the safety switch');
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    const s = await run(() => api.post<SwitchStatus>('/emergency/checkin'));
    if (s) setStatus(s);
  }

  async function closeAccess() {
    if (!confirm('Close access for your trusted people? Anything they already saw cannot be taken back.')) return;
    const s = await run(() => api.post<SwitchStatus>('/emergency/close-access'));
    if (s) setStatus(s);
  }

  async function save() {
    const s = await run(() => api.put<SwitchStatus>('/emergency/settings', form));
    if (s) {
      setStatus(s);
      setSaved(true);
    }
  }

  if (!status || !form) return <p className="text-muted">{error ?? 'Loading…'}</p>;

  const running = status.state === 'PENDING_APPROVAL' || status.state === 'WAITING_PERIOD';
  const onDark = !(running || status.state === 'UNLOCKED'); // calm = dark filled panel; attention = brass
  const canEdit = status.state === 'ACTIVE' || status.state === 'WARNING';
  const totalDays = form.checkInIntervalDays + (status.maxReminders + 1) * form.reminderGapDays;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-extrabold">Safety switch</h2>
        <p className="mt-1 max-w-2xl text-muted">
          We email you every so often to ask if you are okay. If you do not answer, your trusted people are asked to help, and the vault opens only after
          enough of them approve and a waiting period passes. You can stop it with one click at any time before it opens.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sindoor">
          {error}
        </p>
      )}

      {!status.armed && (
        <section className="rounded-lg border border-brass/40 bg-brass-tint p-5">
          <h3 className="text-lg font-extrabold text-brass">Not switched on yet</h3>
          <p className="mt-1">{status.armedReason}</p>
          <p className="mt-1 text-sm text-muted">Until then no check-in emails are sent, because nobody could open the vault anyway.</p>
        </section>
      )}

      <section className={`rounded-xl p-6 ${onDark ? 'bg-vault text-white' : 'border border-brass/40 bg-brass-tint'}`}>
        <p className={`font-semibold ${onDark ? 'text-brass-bright' : 'text-brass'}`}>Right now</p>
        <h3 className="mt-1 text-xl font-extrabold">{HEADLINE[status.state]}</h3>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-base sm:grid-cols-2">
          <div>
            <dt className={`text-sm ${onDark ? 'text-white/60' : 'text-muted'}`}>Last check-in</dt>
            <dd className="font-semibold">{formatDateTime(status.lastCheckInAt)}</dd>
          </div>
          {status.nextActionAt && status.armed && (
            <div>
              <dt className={`text-sm ${onDark ? 'text-white/60' : 'text-muted'}`}>{status.state === 'ACTIVE' ? 'Next check-in email' : status.state === 'WARNING' ? 'Next step' : 'Opens'}</dt>
              <dd className="font-semibold">{formatDateTime(status.nextActionAt)}</dd>
            </div>
          )}
          {status.state === 'WARNING' && (
            <div>
              <dt className={`text-sm ${onDark ? 'text-white/60' : 'text-muted'}`}>Reminders sent</dt>
              <dd className="font-semibold">
                {status.remindersSent} of {status.maxReminders}
              </dd>
            </div>
          )}
          {status.case && (
            <div className="sm:col-span-2">
              <dt className={`text-sm ${onDark ? 'text-white/60' : 'text-muted'}`}>Approvals</dt>
              <dd className="font-semibold">
                {status.case.approvals.length} of {status.case.needed} needed
                {status.case.approvals.length > 0 && ` (${status.case.approvals.map((a) => a.name).join(', ')})`}
              </dd>
            </div>
          )}
        </dl>

        {status.state === 'UNLOCKED' && (
          <div className="mt-5">
            <p className="max-w-xl">
              If you are back and well, close access. Your trusted people lose the link and the safety switch restarts. What they already opened cannot be taken back, so
              consider updating sensitive details afterwards.
            </p>
            <button className="btn-primary mt-3" onClick={closeAccess} disabled={busy}>
              {busy ? 'Working…' : 'I am back, close access'}
            </button>
          </div>
        )}
        {status.state !== 'UNLOCKED' && (
          <button className={`${running ? 'btn-primary' : 'btn-brass'} mt-5`} onClick={checkIn} disabled={busy}>
            {busy ? 'Working…' : running ? 'I am okay, stop this request' : 'I am okay, check in now'}
          </button>
        )}
      </section>

      <section className="panel p-6">
        <h3 className="text-lg font-extrabold">Timing</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block font-semibold">Check in every</span>
            <select className="field" disabled={!canEdit} value={form.checkInIntervalDays} onChange={(e) => setForm({ ...form, checkInIntervalDays: Number(e.target.value) })}>
              {INTERVALS.map((n) => (
                <option key={n} value={n}>
                  {n} day{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">Gap between reminders</span>
            <select className="field" disabled={!canEdit} value={form.reminderGapDays} onChange={(e) => setForm({ ...form, reminderGapDays: Number(e.target.value) })}>
              {GAPS.map((n) => (
                <option key={n} value={n}>
                  {n} day{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">Waiting period</span>
            <select className="field" disabled={!canEdit} value={form.waitingPeriodDays} onChange={(e) => setForm({ ...form, waitingPeriodDays: Number(e.target.value) })}>
              {WAITS.map((n) => (
                <option key={n} value={n}>
                  {n} day{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm text-muted">
          If you never reply, your trusted people are asked about {totalDays} days after your last check-in ({form.checkInIntervalDays} days, then the email and{' '}
          {status.maxReminders} reminders {form.reminderGapDays} day(s) apart). After enough of them approve, the vault opens {form.waitingPeriodDays} day(s) later.
          Signing in to this app also counts as a check-in.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy || !canEdit}>
            Save timing
          </button>
          {saved && <span className="font-semibold text-seal">Saved. Your check-in clock restarted.</span>}
          {!canEdit && <span className="text-sm text-muted">Timing is locked while a request is running.</span>}
        </div>
      </section>
    </div>
  );
}
