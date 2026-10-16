import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDateTime, type SwitchStatus } from '../types';

/** Shown on every owner screen while a request is running, so it can never be missed. */
export default function EmergencyBanner() {
  const [status, setStatus] = useState<SwitchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<SwitchStatus>('/emergency/status'));
    } catch {
      /* the banner is best effort; the Safety switch tab shows real errors */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (!status || !['PENDING_APPROVAL', 'WAITING_PERIOD', 'UNLOCKED'].includes(status.state)) return null;

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.post<SwitchStatus>('/emergency/checkin'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop the request');
    } finally {
      setBusy(false);
    }
  }

  async function closeAccess() {
    if (!confirm('Close access for your trusted people? Anything they already saw cannot be taken back.')) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.post<SwitchStatus>('/emergency/close-access'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close access');
    } finally {
      setBusy(false);
    }
  }

  const unlocked = status.state === 'UNLOCKED';
  return (
    <div role="alert" className="border-b border-sindoor/30 bg-sindoor-tint">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
        <p className="min-w-[16rem] flex-1 font-semibold text-sindoor">
          {unlocked
            ? 'Your vault has been opened for your trusted people.'
            : status.state === 'WAITING_PERIOD' && status.case?.unlocksAt
              ? `Your trusted people asked to open your vault. It opens on ${formatDateTime(status.case.unlocksAt)} unless you stop it.`
              : 'Your trusted people have been asked to open your vault because you did not answer your check-ins.'}
        </p>
        {!unlocked && (
          <button className="btn-primary ml-auto" onClick={stop} disabled={busy}>
            {busy ? 'Stopping…' : 'I am okay, stop this'}
          </button>
        )}
        {unlocked && (
          <button className="btn-primary ml-auto" onClick={closeAccess} disabled={busy}>
            {busy ? 'Closing…' : 'I am back, close access'}
          </button>
        )}
        {error && <span className="w-full text-sm text-sindoor">{error}</span>}
      </div>
    </div>
  );
}
