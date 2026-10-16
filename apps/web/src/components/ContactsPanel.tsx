import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { fingerprint } from '../crypto/keypair';
import { createShareSet } from '../crypto/recovery';
import { CATEGORIES, type ContactDto, type SharesInfo } from '../types';

const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Lawyer', 'Other'];

interface Listing {
  contacts: ContactDto[];
  shares: SharesInfo | null;
}

export default function ContactsPanel({ vk }: { vk: CryptoKey }) {
  const [data, setData] = useState<Listing | null>(null);
  const [prints, setPrints] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(2);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingPerms, setEditingPerms] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('Spouse');

  const load = useCallback(async () => {
    try {
      setData(await api.get<Listing>('/contacts'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trusted people');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accepted = useMemo(() => data?.contacts.filter((c) => c.status === 'ACCEPTED' && c.publicKey) ?? [], [data]);

  // Fingerprints are computed in the browser from the public key the server returned.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(accepted.map(async (c) => [c.id, await fingerprint(c.publicKey!)] as const));
      if (!cancelled) setPrints(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [accepted]);

  useEffect(() => {
    setThreshold((t) => Math.min(Math.max(t, 2), Math.max(accepted.length, 2)));
  }, [accepted.length]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ contact: ContactDto; inviteUrl: string }>('/contacts/invite', { name, email, relation });
      setLink({ name: res.contact.name, url: res.inviteUrl });
      setName('');
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  }

  async function resend(c: ContactDto) {
    setError(null);
    try {
      const res = await api.post<{ inviteUrl: string }>(`/contacts/${c.id}/resend`);
      setLink({ name: c.name, url: res.inviteUrl });
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a new link');
    }
  }

  async function remove(c: ContactDto) {
    if (!confirm(`Remove ${c.name}? Their key piece and invite link stop working.`)) return;
    setError(null);
    try {
      await api.delete(`/contacts/${c.id}`);
      setVerified((v) => {
        const n = new Set(v);
        n.delete(c.id);
        return n;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this person');
    }
  }

  async function savePermissions(c: ContactDto) {
    setError(null);
    if (draft.length === 0) return setError('Choose at least one drawer.');
    try {
      await api.patch(`/contacts/${c.id}/permissions`, { allowedCategories: draft });
      setEditingPerms(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  async function createPieces() {
    setError(null);
    setBusy(true);
    try {
      // Everything happens in this browser: split the vault key, encrypt each piece to its owner's public key.
      const set = await createShareSet(
        vk,
        accepted.map((c) => ({ id: c.id, publicKey: c.publicKey! })),
        threshold,
      );
      await api.post('/contacts/shares', { threshold, keyCheck: set.keyCheck, shares: set.shares });
      setVerified(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key pieces');
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  const shares = data?.shares ?? null;
  const allVerified = accepted.length >= 2 && accepted.every((c) => verified.has(c.id));
  const outOfDate = !!shares && (shares.stale || accepted.some((c) => !c.hasShare || c.shareGeneration !== shares.generation));

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-extrabold">Trusted people</h2>
        <p className="mt-1 max-w-2xl text-muted">
          Choose 2 to 5 people. Your vault key is split into pieces and each person gets one. A piece alone opens nothing, so no single person can
          open your vault.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sindoor">
          {error}
        </p>
      )}

      {shares && !outOfDate && (
        <p className="rounded-md bg-seal-tint px-4 py-3 font-semibold text-seal-dark">
          Key pieces are in place: any {shares.threshold} of your {shares.total} trusted people together can open the vault.
        </p>
      )}
      {outOfDate && (
        <p className="rounded-md border border-brass/40 bg-brass-tint px-4 py-3 text-brass">
          Your trusted people have changed since the key pieces were made. Create the key pieces again below so everyone holds a current one.
        </p>
      )}

      {link && (
        <section className="rounded-lg border-2 border-seal bg-seal-tint p-5">
          <h3 className="text-lg font-extrabold">Invitation link for {link.name}</h3>
          <p className="mt-1 text-sm">If email is not set up, send this link yourself. It works once and expires in 7 days.</p>
          <p className="mt-3 select-all break-all rounded-md bg-white px-3 py-2 font-mono text-sm">{link.url}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => copy(link.url)}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              className="btn-quiet"
              target="_blank"
              rel="noreferrer noopener"
              href={`https://wa.me/?text=${encodeURIComponent(`I would like you to be one of my trusted people. Please open this link: ${link.url}`)}`}
            >
              Share on WhatsApp
            </a>
            <button className="btn-quiet" onClick={() => setLink(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="invite-heading" className="panel p-6">
        <h3 id="invite-heading" className="text-lg font-extrabold">
          Invite someone
        </h3>
        <form onSubmit={invite} className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block font-semibold">Name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">Email</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">Who are they to you?</span>
            <select className="field" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {RELATIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <button className="btn-primary" disabled={busy}>
              Create invitation
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="people-heading">
        <h3 id="people-heading" className="mb-3 text-lg font-extrabold">
          Your list
        </h3>
        {data === null ? (
          <p className="text-muted">Loading…</p>
        ) : data.contacts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-6 text-muted">
            Nobody yet. Start with your spouse or a sibling, then add one more person you trust.
          </div>
        ) : (
          <ul className="space-y-3">
            {data.contacts.map((c) => (
              <li key={c.id} className="panel p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-lg font-extrabold">{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.relation} · {c.email}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-3 py-1 text-sm font-semibold ${c.status === 'ACCEPTED' ? 'bg-seal-tint text-seal-dark' : 'bg-brass-tint text-brass'}`}
                  >
                    {c.status === 'ACCEPTED' ? (c.hasShare && c.shareGeneration === shares?.generation ? 'Holds a key piece' : 'Accepted') : 'Waiting for reply'}
                  </span>
                </div>

                {c.status === 'INVITED' && (
                  <p className="mt-2 text-sm text-muted">
                    {c.name} must open their invitation link and choose a passphrase. Press <span className="font-semibold">New invitation link</span> below to get a link you can copy or send on WhatsApp.
                    Testing on your own? Open the link in a private window (Ctrl+Shift+N) and use a different passphrase for each person.
                  </p>
                )}

                {c.status === 'ACCEPTED' && (
                  <div className="mt-3 rounded-md bg-paper p-3">
                    <p className="text-sm text-muted">Verification code (ask {c.name} to read theirs aloud):</p>
                    <p className="mt-1 select-all break-words font-mono text-lg font-extrabold tracking-wide">{prints[c.id] ?? '…'}</p>
                    <label className="mt-2 flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={verified.has(c.id)}
                        onChange={(e) =>
                          setVerified((v) => {
                            const n = new Set(v);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                      <span>I heard {c.name} read out the same code, on a call or in person.</span>
                    </label>
                  </div>
                )}

                <div className="mt-3">
                  {editingPerms === c.id ? (
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-sm font-semibold">{c.name} can read these drawers once the vault is open:</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {CATEGORIES.map((cat) => (
                          <label key={cat.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={draft.includes(cat.id)}
                              onChange={(e) => setDraft((d) => (e.target.checked ? [...d, cat.id] : d.filter((x) => x !== cat.id)))}
                            />
                            {cat.label}
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-3">
                        <button className="btn-primary" onClick={() => savePermissions(c)}>
                          Save
                        </button>
                        <button className="btn-quiet" onClick={() => setEditingPerms(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Can read:{' '}
                      <span className="font-semibold text-ink">
                        {c.allowedCategories.length >= CATEGORIES.length
                          ? 'everything'
                          : c.allowedCategories.map((id) => CATEGORIES.find((x) => x.id === id)?.label ?? id).join(', ')}
                      </span>{' '}
                      <button
                        className="font-semibold text-seal underline-offset-4 hover:underline"
                        onClick={() => {
                          setEditingPerms(c.id);
                          setDraft(c.allowedCategories);
                        }}
                      >
                        Change
                      </button>
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-3">
                  {c.status === 'INVITED' && (
                    <button className="btn-quiet" onClick={() => resend(c)}>
                      New invitation link
                    </button>
                  )}
                  <button className="btn-danger" onClick={() => remove(c)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accepted.length >= 2 && (
        <section aria-labelledby="pieces-heading" className="panel p-6">
          <h3 id="pieces-heading" className="text-lg font-extrabold">
            {shares ? 'Create the key pieces again' : 'Create the key pieces'}
          </h3>
          <p className="mt-1 max-w-2xl text-muted">
            Check the verification code of every person above first. This confirms the server did not swap anyone's key for its own.
          </p>

          <label className="mt-4 block max-w-xs">
            <span className="mb-1 block font-semibold">People needed to open the vault</span>
            <select className="field" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {Array.from({ length: accepted.length - 1 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  Any {n} of {accepted.length}
                </option>
              ))}
            </select>
          </label>

          <button className="btn-primary mt-5" disabled={!allVerified || busy} onClick={createPieces}>
            {busy ? 'Working…' : 'Create key pieces'}
          </button>
          {!allVerified && <p className="mt-2 text-sm text-muted">Tick the verification box for all {accepted.length} people to continue.</p>}
        </section>
      )}
    </div>
  );
}
