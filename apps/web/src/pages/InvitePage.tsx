import { useEffect, useState, type FormEvent } from 'react';
import Logo from '../components/Logo';
import { api, ApiError } from '../api/client';
import { createContactKeyMaterial, fingerprint } from '../crypto/keypair';

interface InviteInfo {
  ownerName: string;
  contactName: string;
  relation: string;
  expiresAt: string;
}

type Stage = { name: 'loading' } | { name: 'invalid'; message: string } | { name: 'form'; info: InviteInfo } | { name: 'done'; info: InviteInfo; code: string };

/** Public page opened from an invite link. The invited person has no account: they only choose a passphrase. */
export default function InvitePage({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<InviteInfo>(`/invites/${token}`)
      .then((info) => setStage({ name: 'form', info }))
      .catch((e) => setStage({ name: 'invalid', message: e instanceof ApiError ? e.message : 'Could not open this invitation' }));
  }, [token]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (stage.name !== 'form') return;
    setError(null);
    if (passphrase.length < 12) return setError('Use at least 12 characters. A short phrase of 3-4 words works well.');
    if (passphrase !== confirm) return setError('The two passphrases do not match.');
    if (!understood) return setError('Please confirm that you understand the passphrase cannot be recovered.');

    try {
      setBusy('Creating your key on this device. This can take a few seconds…');
      const m = await createContactKeyMaterial(passphrase);
      const code = await fingerprint(m.publicKey);

      setBusy('Saving…');
      await api.post(`/invites/${token}/accept`, {
        publicKey: m.publicKey,
        wrappedPrivateKey: m.wrappedPrivateKey,
        kdfSalt: m.kdfSalt,
        kdfParams: m.kdfParams,
      });
      setStage({ name: 'done', info: stage.info, code });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Logo />

      {stage.name === 'loading' && <p className="mt-6 text-muted">Opening your invitation…</p>}

      {stage.name === 'invalid' && (
        <div className="mt-6 rounded-lg border border-brass/40 bg-brass-tint p-6">
          <h1 className="text-2xl font-extrabold text-brass">This link does not work</h1>
          <p className="mt-2">{stage.message}. Ask the person who invited you to send a new link.</p>
        </div>
      )}

      {stage.name === 'form' && (
        <>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">
            {stage.info.ownerName} has asked you to be one of their trusted people
          </h1>
          <p className="mt-4 text-lg text-muted">
            Hello {stage.info.contactName}. You are listed as their {stage.info.relation.toLowerCase()}.
          </p>

          <div className="mt-6 space-y-3 panel p-5">
            <p className="font-semibold">What this means</p>
            <ul className="space-y-2 text-base">
              <li className="border-l-4 border-seal pl-3">You will hold one piece of a key. On its own it opens nothing.</li>
              <li className="border-l-4 border-seal pl-3">In an emergency, a set number of trusted people must come together to open the vault.</li>
              <li className="border-l-4 border-seal pl-3">You can only use your piece with the passphrase you choose now. Nobody, including us, can reset it.</li>
            </ul>
          </div>

          <form onSubmit={accept} className="mt-6 space-y-4 panel p-6" aria-busy={!!busy}>
            <label className="block">
              <span className="mb-1 block font-semibold">Choose a passphrase</span>
              <input className="field" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Repeat the passphrase</span>
              <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="flex items-start gap-3 rounded-md bg-brass-tint p-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand that if I forget this passphrase, my key piece cannot be recovered. I will write it down somewhere safe.</span>
            </label>

            {error && (
              <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sm text-sindoor">
                {error}
              </p>
            )}

            <button className="btn-primary w-full" disabled={!!busy}>
              {busy ?? 'Accept and create my key'}
            </button>
            <p className="text-center text-sm text-muted">If you do not know {stage.info.ownerName}, close this page.</p>
          </form>
        </>
      )}

      {stage.name === 'done' && (
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold leading-tight">Thank you, {stage.info.contactName}. You are almost done.</h1>
          <p className="mt-4 text-lg">
            Please call or message {stage.info.ownerName} and read out this code. They will check that it matches before giving you your key
            piece.
          </p>
          <p className="mt-6 select-all break-words rounded-lg border-2 border-seal bg-seal-tint p-5 text-center font-mono text-2xl font-extrabold tracking-wider text-seal-dark" aria-label="Verification code">
            {stage.code}
          </p>
          <p className="mt-4 text-muted">
            This protects you both: it proves the key {stage.info.ownerName} sees is really yours. Keep this page open until you have read the code
            out.
          </p>
          <p className="mt-6 rounded-md bg-brass-tint p-3 text-sm">
            Remember your passphrase. Write it down and keep it somewhere safe. It cannot be reset.
          </p>
        </div>
      )}
    </main>
  );
}
