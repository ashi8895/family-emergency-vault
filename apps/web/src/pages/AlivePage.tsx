import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { api, ApiError } from '../api/client';

interface AliveInfo {
  status: 'ready' | 'used' | 'unlocked';
  ownerName: string;
  requestRunning: boolean;
}

/** Opened from the "are you okay?" email. Looking at the page changes nothing; the button does. */
export default function AlivePage({ token }: { token: string }) {
  const [info, setInfo] = useState<AliveInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<AliveInfo>(`/links/alive/${token}`)
      .then(setInfo)
      .catch((e) => setProblem(e instanceof ApiError ? e.message : 'Could not open this link'));
  }, [token]);

  async function confirm() {
    setBusy(true);
    try {
      await api.post(`/links/alive/${token}`);
      setDone(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Logo />

      {problem && (
        <div className="mt-6 rounded-lg border border-brass/40 bg-brass-tint p-6">
          <h1 className="text-2xl font-extrabold text-brass">This link does not work</h1>
          <p className="mt-2">{problem}</p>
        </div>
      )}

      {!problem && !info && <p className="mt-6 text-muted">Opening…</p>}

      {info && done && (
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold">Thank you. You are marked as okay.</h1>
          <p className="mt-4 text-lg text-muted">
            Your vault stays closed{info.requestRunning ? ', and the request your trusted people received has been cancelled' : ''}. We will check in again later.
          </p>
        </div>
      )}

      {info && !done && info.status === 'ready' && (
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold leading-tight">Hello {info.ownerName}, are you okay?</h1>
          <p className="mt-4 text-lg text-muted">
            {info.requestRunning
              ? 'Your trusted people have been asked to open your vault. Pressing the button stops that right away.'
              : 'Press the button to confirm. That is all we need.'}
          </p>
          <button className="btn-primary mt-6 w-full py-4 text-xl" onClick={confirm} disabled={busy}>
            {busy ? 'Saving…' : 'I am okay'}
          </button>
        </div>
      )}

      {info && info.status === 'used' && (
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold">This link was already used</h1>
          <p className="mt-4 text-lg text-muted">Nothing more is needed. If a newer email asks you to confirm, use the link in that one.</p>
        </div>
      )}

      {info && info.status === 'unlocked' && (
        <div className="mt-2 rounded-lg border border-brass/40 bg-brass-tint p-6">
          <h1 className="text-2xl font-extrabold text-brass">Too late to stop this</h1>
          <p className="mt-2">
            The waiting period has ended and the vault has already been opened for your trusted people. Please contact them directly.
          </p>
        </div>
      )}
    </main>
  );
}
