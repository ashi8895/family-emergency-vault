import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { formatDateTime, type AuditEntry } from '../types';

export default function SecurityPanel() {
  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-extrabold">Security and activity</h2>
        <p className="mt-1 max-w-2xl text-muted">Protect sign-in with a second step, and see everything that happened with your vault.</p>
      </header>
      <TwoFactor />
      <Activity />
    </div>
  );
}

// ---------------------------------------------------------------- two-step sign-in
interface Status {
  enabled: boolean;
  recoveryCodesLeft: number;
  serverTime?: string;
}

function TwoFactor() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; serverTime?: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<Status>('/2fa/status'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => setSetup(await api.post('/2fa/setup')));

  const enable = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const res = await api.post<{ recoveryCodes: string[] }>('/2fa/enable', { code: code.replace(/\s/g, '') });
      setCodes(res.recoveryCodes);
      setSetup(null);
      setCode('');
      await load();
    });
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await api.post('/2fa/disable', { code: code.trim() });
      setDisabling(false);
      setCode('');
      await load();
    });
  };

  return (
    <section className="panel p-6" aria-labelledby="twofa-h">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="twofa-h" className="text-lg font-extrabold">
          Two-step sign-in
        </h3>
        {status && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.enabled ? 'bg-seal-tint text-seal-dark' : 'bg-brass-tint text-brass'}`}>
            {status.enabled ? 'On' : 'Off'}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-muted">
        After your password, you also enter a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Someone who learns your password still cannot sign in.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sm text-sindoor">
          <p>{error}</p>
          {setup && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Delete any older "Family Emergency Vault" entries in your authenticator app and use only the newest one. Every press of "Set up" makes a new key.</li>
              <li>Set the phone's date and time to Automatic, and check this computer's clock is correct.</li>
              <li>Wait for the code to change, then type the fresh one.</li>
            </ul>
          )}
        </div>
      )}

      {codes && (
        <div className="mt-5 rounded-lg border-2 border-seal bg-seal-tint p-5">
          <h4 className="text-lg font-extrabold">Save your recovery codes now</h4>
          <p className="mt-1 text-sm">
            If you lose your phone, each code lets you sign in once. They are shown only this one time. Keep them somewhere safe, such as on paper.
          </p>
          <ul className="mt-3 grid gap-2 font-mono text-lg font-bold sm:grid-cols-2">
            {codes.map((c) => (
              <li key={c} className="select-all rounded bg-white px-3 py-1">
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-quiet" onClick={() => navigator.clipboard.writeText(codes.join('\n'))}>
              Copy all
            </button>
            <button className="btn-quiet" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I have saved these codes.</span>
          </label>
          <button
            className="btn-primary mt-3"
            disabled={!saved}
            onClick={() => {
              setCodes(null);
              setSaved(false);
            }}
          >
            Done
          </button>
        </div>
      )}

      {status && !status.enabled && !setup && !codes && (
        <button className="btn-primary mt-5" onClick={start} disabled={busy}>
          Set up two-step sign-in
        </button>
      )}

      {setup && (
        <form onSubmit={enable} className="mt-5 grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="panel p-3">
            <QRCodeSVG value={setup.otpauthUri} size={168} marginSize={2} />
          </div>
          <div>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                On your phone, install an <span className="font-semibold">authenticator app</span> (Google Authenticator or Microsoft Authenticator, free on Play Store and App Store). Open it, tap{' '}
                <span className="font-semibold">+</span>, choose <span className="font-semibold">Scan a QR code</span> and scan the square. Do not use the phone camera or Google Lens: they only show a link, not a code.
                If you cannot scan, choose "Enter a setup key" and type this key:
              </li>
              <li className="list-none">
                <p className="select-all break-all rounded-md bg-paper px-3 py-2 font-mono text-base font-bold tracking-wider">
                  {setup.secret.match(/.{1,4}/g)?.join(' ')}
                </p>
              </li>
              <li>The app now shows a 6-digit code that changes every 30 seconds. Type the code it shows now:</li>
            </ol>
            <p className="mt-3 text-sm text-muted">
              Codes are checked against this app's clock
              {setup.serverTime ? <> (now: <span className="font-semibold text-ink">{new Date(setup.serverTime).toLocaleTimeString()}</span>)</> : null}. Your phone's date and time must be on <span className="font-semibold">Automatic</span> and match within about a minute.
            </p>
            <input
              className="field mt-3 max-w-xs text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
            />
            <div className="mt-3 flex gap-3">
              <button className="btn-primary" disabled={busy}>
                Turn on
              </button>
              <button type="button" className="btn-quiet" onClick={() => setSetup(null)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {status?.enabled && !codes && (
        <div className="mt-5">
          <p className="text-muted">{status.recoveryCodesLeft} recovery code(s) left.</p>
          {!disabling ? (
            <button className="btn-danger mt-3" onClick={() => setDisabling(true)}>
              Turn off
            </button>
          ) : (
            <form onSubmit={disable} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Current 6-digit code, or a recovery code</span>
                <input className="field max-w-xs tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
              </label>
              <button className="btn-danger" disabled={busy}>
                Turn off
              </button>
              <button type="button" className="btn-quiet" onClick={() => setDisabling(false)}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- activity log
const VERB: Record<string, string> = { vault_created: 'added', item_created: 'added', item_updated: 'changed', item_deleted: 'deleted' };

/** Plain-language line for one log entry. */
export function describe(e: AuditEntry): string {
  const who = e.actorType === 'owner' ? 'You' : e.actorType === 'system' ? 'The system' : e.actorLabel;
  const m = e.meta;
  switch (e.action) {
    case 'account.created': return 'You created your account';
    case 'login': return `You signed in${m.twoFactor ? ' with two-step sign-in' : ''}${m.usedRecoveryCode ? ' using a recovery code' : ''}`;
    case 'login.failed': return 'A sign-in attempt failed';
    case 'login.locked': return 'The account was locked after repeated failed attempts';
    case 'vault.item_created':
    case 'vault.item_updated':
    case 'vault.item_deleted': return `You ${VERB[e.action.split('.')[1]]} an item in ${m.category}`;
    case 'vault.file_uploaded': return 'You uploaded a file';
    case 'contact.invited': return `You invited ${m.name} (${m.relation})`;
    case 'contact.link_resent': return `You made a new invitation link for ${m.name}`;
    case 'contact.accepted': return `${who} accepted the invitation`;
    case 'contact.removed': return `You removed ${m.name}`;
    case 'contact.permissions_changed': return `You changed what ${m.name} can see`;
    case 'shares.created': return `You created key pieces (any ${m.threshold} of ${m.total} can open the vault)`;
    case 'settings.changed': return `You changed the safety switch timing (every ${m.checkInDays} days)`;
    case 'switch.checkin': return `You checked in${m.source === 'email_link' ? ' from an email link' : m.source === 'arming' ? ' (switch turned on)' : ''}`;
    case 'switch.checkin_email': return 'A check-in email was sent to you';
    case 'switch.reminder_email': return `Reminder ${m.n} was sent to you`;
    case 'switch.escalated': return 'Your trusted people were asked to approve';
    case 'approval.given': return `${who} approved opening the vault`;
    case 'switch.waiting_started': return 'Enough people approved. The waiting period started';
    case 'switch.cancelled': return 'You stopped the request';
    case 'switch.approvals_lost': return 'Approvals fell below the number needed';
    case 'switch.unlocked': return 'The vault was opened for your trusted people';
    case 'access.opened': return `${who} opened the access page`;
    case 'access.items_listed': return `${who} opened the vault (${m.count} item(s))`;
    case 'access.file_downloaded': return `${who} downloaded a file`;
    case 'access.closed': return 'You closed access to the vault';
    case '2fa.enabled': return 'You turned on two-step sign-in';
    case '2fa.disabled': return 'You turned off two-step sign-in';
    default: return e.action;
  }
}

type Verify = { ok: true; count: number; headHash: string } | { ok: false; brokenAtSeq: number; reason: string };

function Activity() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: number) => {
    try {
      const res = await api.get<{ entries: AuditEntry[]; hasMore: boolean }>(`/audit?limit=30${before ? `&before=${before}` : ''}`);
      setEntries((prev) => (before && prev ? [...prev, ...res.entries] : res.entries));
      setMore(res.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the activity log');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setVerify(await api.get<Verify>('/audit/verify'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the log');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-6" aria-labelledby="activity-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="activity-h" className="text-lg font-extrabold">
          Activity
        </h3>
        <button className="btn-quiet" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'Check the log has not been changed'}
        </button>
      </div>
      <p className="mt-1 max-w-2xl text-muted">
        Every entry is chained to the one before it. If anyone edits, removes or re-orders an entry, the check below fails.
      </p>

      {verify && (
        <p
          role="status"
          className={`mt-4 rounded-md px-4 py-3 ${verify.ok ? 'bg-seal-tint text-seal-dark' : 'border border-brass/40 bg-brass-tint text-brass'}`}
        >
          {verify.ok ? (
            <>
              All {verify.count} entries are intact. Latest fingerprint: <span className="font-mono font-bold">{verify.headHash.slice(0, 16)}</span>. Note it down: if it ever
              changes without new activity, entries were removed from the end.
            </>
          ) : (
            <>
              Problem at entry {verify.brokenAtSeq}: {verify.reason}.
            </>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sm text-sindoor">
          {error}
        </p>
      )}

      {entries === null ? (
        <p className="mt-4 text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {entries.map((e) => (
            <li key={e.seq} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
              <span className="w-44 shrink-0 text-sm text-muted">{formatDateTime(e.ts)}</span>
              <span className="min-w-0 flex-1">{describe(e)}</span>
              <span className="text-xs text-muted">#{e.seq}</span>
            </li>
          ))}
        </ul>
      )}
      {more && entries && (
        <button className="btn-quiet mt-4" onClick={() => load(entries[entries.length - 1].seq)}>
          Show older
        </button>
      )}
    </section>
  );
}
