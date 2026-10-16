import { useState, type FormEvent } from 'react';
import { api, ApiError, setAccessToken } from '../api/client';
import Logo from '../components/Logo';
import ScrollStory from '../components/ScrollStory';
import AppearanceMenu from '../ui/AppearanceMenu';
import VaultDial from '../components/VaultDial';
import type { Sealed } from '../crypto/aes';
import type { KdfParams } from '../crypto/kdf';
import { createAccountMaterial, deriveLoginKeys, unwrapVaultKey } from '../crypto/vault';
import type { Session } from '../types';

type Mode = 'login' | 'register';

interface LoginResponse {
  accessToken: string;
  user: Session['user'];
  wrappedVK: Sealed;
}
type LoginReply = LoginResponse | { twoFactorRequired: true };

/** Keys derived from the password. Kept in memory between the password step and the code step of a two-step sign-in. */
interface Pending {
  authKey: string;
  kek: CryptoKey;
}

const GUARANTEES = [
  'Your password never leaves your browser.',
  'Store locations and instructions, not card numbers or CVVs.',
  'Prototype: use sample data only for now.',
];

export default function AuthPage({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  async function signIn(p: Pending, extra: Record<string, string> = {}) {
    setBusy('Signing in…');
    const res = await api.post<LoginReply>('/auth/login', { email, authKey: p.authKey, ...extra });
    if ('twoFactorRequired' in res) {
      setPending(p);
      setBusy(null);
      return;
    }
    setAccessToken(res.accessToken);
    setBusy('Unlocking your vault…');
    const vk = await unwrapVaultKey(res.wrappedVK, p.kek);
    onSignedIn({ user: res.user, vk });
  }

  async function login() {
    setBusy('Preparing your keys on this device…');
    const pre = await api.post<{ kdfSalt: string; kdfParams: KdfParams }>('/auth/prelogin', { email });
    const { authKey, kek } = await deriveLoginKeys(password, pre.kdfSalt, pre.kdfParams);
    await signIn({ authKey, kek });
  }

  async function register() {
    if (password.length < 12) throw new Error('Use at least 12 characters. A short phrase of 3-4 words works well.');
    if (password !== confirm) throw new Error('The two passwords do not match.');
    if (!understood) throw new Error('Please confirm that you understand we cannot recover a forgotten password.');

    setBusy('Creating your encryption keys on this device…');
    const m = await createAccountMaterial(password);

    setBusy('Creating your account…');
    await api.post('/auth/register', {
      email,
      name,
      authKey: m.authKey,
      kdfSalt: m.kdfSalt,
      kdfParams: m.kdfParams,
      wrappedVK: m.wrappedVK,
    });

    // Sign in with the authKey we already derived (no second 600k-iteration PBKDF2 run).
    setBusy('Signing in…');
    const res = await api.post<LoginReply>('/auth/login', { email, authKey: m.authKey });
    if ('twoFactorRequired' in res) throw new Error('Unexpected response. Please sign in again.');
    setAccessToken(res.accessToken);
    onSignedIn({ user: res.user, vk: m.vk });
  }

  function showError(err: unknown) {
    setError(
      err instanceof ApiError || err instanceof Error
        ? err.name === 'OperationError'
          ? 'Could not unlock the vault with that password.'
          : err.message
        : 'Something went wrong.',
    );
    setBusy(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'login') await login();
      else await register();
    } catch (err) {
      showError(err);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    try {
      await signIn(pending, useRecovery ? { recoveryCode: code.trim() } : { totpCode: code.replace(/\s/g, '') });
    } catch (err) {
      showError(err);
    }
  }

  function backToPassword() {
    setPending(null);
    setCode('');
    setError(null);
    setUseRecovery(false);
  }

  const start = () => {
    setMode('register');
    setPending(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-lg border border-sindoor/30 bg-sindoor-tint px-3.5 py-2.5 text-sm text-sindoor">
      {error}
    </p>
  );

  return (
    <div className="bg-vault text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Logo tone="dark" />
        <div className="flex items-center gap-4">
          <a href="#how" className="whitespace-nowrap font-semibold text-white/75 transition-colors hover:text-white">
            How it works
          </a>
          <AppearanceMenu />
        </div>
      </header>

      <div className="relative overflow-clip">
      <main className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-6 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[1.1fr_1fr]">
        <section className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-[1.04] sm:text-5xl lg:text-6xl">
            Tell your family <span className="text-brass-bright">where everything is</span>, before they need to ask.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-white/80">
            Note down where your policies, accounts and papers are. Everything is locked on this device before it is sent, so not even we can read it.
          </p>
          <ul className="mt-8 max-w-lg space-y-2.5">
            {GUARANTEES.map((g) => (
              <li key={g} className="flex items-start gap-3 text-white/85">
                <svg width="20" height="20" viewBox="0 0 20 20" className="mt-1 shrink-0" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" fill="none" stroke="#C9962D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {g}
              </li>
            ))}
          </ul>
        </section>

        <div className="relative">
          {/* the form sits in the middle of the vault door; the dial is decoration only */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden w-[700px] -translate-x-1/2 -translate-y-1/2 opacity-60 lg:block">
            <VaultDial size={700} />
          </div>
        <div className="relative rounded-2xl border-t-4 border-brass-bright bg-white p-7 text-ink shadow-[0_30px_70px_-25px_rgba(0,0,0,0.65)]">
          {pending ? (
            <form onSubmit={onSubmitCode} aria-busy={!!busy}>
              <h2 className="text-2xl font-extrabold">Two-step sign-in</h2>
              <p className="mt-2 text-muted">
                {useRecovery ? 'Enter one of your recovery codes. Each works once.' : 'Open your authenticator app and enter the 6-digit code.'}
              </p>

              <label className="mt-5 block">
                <span className="mb-1 block font-semibold">{useRecovery ? 'Recovery code' : '6-digit code'}</span>
                <input
                  className="field text-lg tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>

              {errorBox}

              <button className="btn-primary mt-6 w-full" disabled={!!busy}>
                {busy ?? 'Continue'}
              </button>
              <div className="mt-4 flex justify-between text-sm font-semibold text-seal">
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(null); }}>
                  {useRecovery ? 'Use the authenticator app' : 'Use a recovery code'}
                </button>
                <button type="button" className="underline-offset-4 hover:underline" onClick={backToPassword}>
                  Back
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onSubmit} aria-busy={!!busy}>
              <h2 className="text-2xl font-extrabold">{mode === 'login' ? 'Open your vault' : 'Create your vault'}</h2>

              <div className="mt-5 space-y-4">
                {mode === 'register' && (
                  <label className="block">
                    <span className="mb-1 block font-semibold">Your name</span>
                    <input className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block font-semibold">Email</span>
                  <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-semibold">Master password</span>
                  <input
                    className="field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </label>
                {mode === 'register' && (
                  <>
                    <label className="block">
                      <span className="mb-1 block font-semibold">Repeat master password</span>
                      <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                    </label>
                    <label className="flex items-start gap-3 rounded-lg bg-brass-tint p-3 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-seal" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                      <span>I understand that if I forget this password, nobody can recover my vault, including the people who run this app.</span>
                    </label>
                  </>
                )}
              </div>

              {errorBox}

              <button className="btn-primary mt-6 w-full" disabled={!!busy}>
                {busy && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {busy ?? (mode === 'login' ? 'Open vault' : 'Create vault')}
              </button>

              <button
                type="button"
                className="mt-4 w-full text-center text-sm font-semibold text-seal underline-offset-4 hover:underline"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                }}
              >
                {mode === 'login' ? 'New here? Create a vault' : 'Already have a vault? Open it'}
              </button>
            </form>
          )}
        </div>
        </div>
      </main>
      </div>

      <ScrollStory onStart={start} />

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-white/55">
        Prototype. Use sample data only. Never enter real passwords, card numbers or bank credentials.
      </footer>
    </div>
  );
}
