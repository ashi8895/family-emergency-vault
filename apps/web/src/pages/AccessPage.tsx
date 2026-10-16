import { useEffect, useState, type FormEvent } from 'react';
import Logo from '../components/Logo';
import LangToggle from '../components/LangToggle';
import { api } from '../api/client';
import type { Sealed } from '../crypto/aes';
import { decryptShare, unwrapContactPrivateKey } from '../crypto/keypair';
import type { KdfParams } from '../crypto/kdf';
import { decodePiece, encodePiece, PieceCodeError } from '../crypto/pieceCode';
import { recoverVaultKey } from '../crypto/recovery';
import { openFile, openItem, type Category, type ItemDto, type PlainAttachment, type PlainItem } from '../crypto/vault';
import { useI18n, type Key } from '../i18n';
import { formatBytes } from '../types';

interface Bundle {
  ownerName: string;
  contactName: string;
  wrappedPrivateKey: Sealed;
  kdfSalt: string;
  kdfParams: KdfParams;
  encryptedShare: string;
  keyCheck: Sealed;
  threshold: number;
  total: number;
  allowedCategories: Category[];
}

export type OpenedItem = PlainItem & { id: string; updatedAt: string; broken?: boolean };

const ORDER: Category[] = ['insurance', 'bank', 'investments', 'property', 'medical', 'legal', 'other'];
const catKey = (c: Category) => `cat.${c}` as Key;

/** Same page for everyone: big type, plain words, one step at a time. Works in English and Hindi. */
function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Logo label={t('brand')} />
        <LangToggle />
      </header>
      {children}
    </main>
  );
}

function Checklist({ owner }: { owner: string }) {
  const { t } = useI18n();
  const steps = [t('access.checklist.1'), t('access.checklist.2', { owner }), t('access.checklist.3'), t('access.checklist.4')];
  const [done, setDone] = useState<boolean[]>(steps.map(() => false));
  return (
    <section className="rounded-lg border-2 border-seal bg-seal-tint p-6" aria-labelledby="checklist-h">
      <h2 id="checklist-h" className="text-2xl font-extrabold text-seal-dark">
        {t('access.checklist.title')}
      </h2>
      <ol className="mt-4 space-y-3">
        {steps.map((text, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-3 text-lg">
              <input
                type="checkbox"
                className="mt-1.5 h-6 w-6 shrink-0"
                checked={done[i]}
                onChange={(e) => setDone((d) => d.map((x, j) => (j === i ? e.target.checked : x)))}
              />
              <span className={done[i] ? 'text-muted line-through' : ''}>{text}</span>
            </label>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Presentational: everything the family reads once the vault is open. Exported so it can be rendered without a network. */
export function VaultViewer({
  owner,
  items,
  onDownload,
}: {
  owner: string;
  items: OpenedItem[];
  onDownload: (a: PlainAttachment) => Promise<void>;
}) {
  const { t } = useI18n();
  const [fileError, setFileError] = useState<string | null>(null);
  const groups = ORDER.map((c) => ({ c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold leading-tight">{t('access.vaultTitle', { owner })}</h1>
        <button className="btn-quiet print:hidden" onClick={() => window.print()}>
          {t('access.print')}
        </button>
      </div>

      <Checklist owner={owner} />

      {fileError && (
        <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-lg text-sindoor">
          {fileError}
        </p>
      )}

      {groups.length === 0 && <p className="rounded-lg border border-dashed border-line bg-white p-6 text-lg text-muted">{t('access.noItems')}</p>}

      {groups.map((g) => (
        <section key={g.c} aria-labelledby={`cat-${g.c}`} className="space-y-4">
          <h2 id={`cat-${g.c}`} className="border-b-2 border-ink pb-1 text-2xl font-extrabold">
            {t(catKey(g.c))}
          </h2>
          {g.items.map((i) => (
            <article key={i.id} className="panel p-6">
              {i.broken ? (
                <p className="text-lg text-brass">{t('access.broken')}</p>
              ) : (
                <>
                  <h3 className="text-2xl font-extrabold">{i.title}</h3>
                  {i.notes && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-muted">{t('access.where')}</p>
                      <p className="mt-1 whitespace-pre-wrap text-lg">{i.notes}</p>
                    </div>
                  )}
                  {i.instructions && (
                    <div className="mt-4 rounded-md bg-paper p-4">
                      <p className="text-sm font-semibold text-muted">{t('access.instructions')}</p>
                      <p className="mt-1 whitespace-pre-wrap text-lg font-semibold">{i.instructions}</p>
                    </div>
                  )}
                  {i.attachments.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-muted">{t('access.files')}</p>
                      <ul className="mt-1 space-y-2">
                        {i.attachments.map((a) => (
                          <li key={a.fileId} className="flex flex-wrap items-center gap-3 text-lg">
                            <span className="font-semibold">{a.name}</span>
                            <span className="text-sm text-muted">{formatBytes(a.size)}</span>
                            <button
                              className="btn-quiet print:hidden"
                              onClick={() => {
                                setFileError(null);
                                onDownload(a).catch(() => setFileError(t('access.downloadFail')));
                              }}
                            >
                              {t('access.download')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function AccessPage({ token }: { token: string }) {
  const { t } = useI18n();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [invalid, setInvalid] = useState(false);

  const [passphrase, setPassphrase] = useState('');
  const [piece, setPiece] = useState<Uint8Array | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [others, setOthers] = useState<string[]>([]);

  const [vk, setVk] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<OpenedItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Bundle>(`/access/${token}`)
      .then((b) => {
        setBundle(b);
        setOthers(Array.from({ length: Math.max(b.threshold - 1, 1) }, () => ''));
      })
      .catch(() => setInvalid(true));
  }, [token]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const priv = await unwrapContactPrivateKey(bundle, passphrase);
      const p = await decryptShare(priv, bundle.encryptedShare);
      setPiece(p);
      setMyCode(await encodePiece(p));
    } catch {
      setError(t('access.wrongPass'));
    } finally {
      setBusy(false);
    }
  }

  async function openVault(e: FormEvent) {
    e.preventDefault();
    if (!bundle || !piece) return;
    setError(null);
    const needed = Math.max(bundle.threshold - 1, 1);
    const filled = others.map((o) => o.trim()).filter(Boolean);
    if (filled.length < needed) return setError(t('access.notEnough', { n: needed }));

    setBusy(true);
    try {
      let others32: Uint8Array[];
      try {
        others32 = await Promise.all(filled.map(decodePiece));
      } catch (err) {
        return setError(err instanceof PieceCodeError ? t('access.badCode') : t('access.wrongPieces'));
      }

      let key: CryptoKey;
      try {
        key = await recoverVaultKey([piece, ...others32], bundle.keyCheck);
      } catch {
        return setError(t('access.wrongPieces'));
      }

      const dtos = await api.get<ItemDto[]>(`/access/${token}/items`);
      const opened = await Promise.all(
        dtos.map(async (d): Promise<OpenedItem> => {
          try {
            return await openItem(key, d);
          } catch {
            return { id: d.id, updatedAt: d.updatedAt, category: d.category, title: '', notes: '', instructions: '', attachments: [], broken: true };
          }
        }),
      );
      setVk(key);
      setItems(opened);
    } catch {
      setError(t('access.wrongPieces'));
    } finally {
      setBusy(false);
    }
  }

  async function download(a: PlainAttachment) {
    if (!vk) return;
    const res = await api.raw(`/access/${token}/files/${a.fileId}`);
    const iv = res.headers.get('X-File-IV');
    if (!iv) throw new Error('missing iv');
    const plain = await openFile(vk, new Uint8Array(await res.arrayBuffer()), iv);
    const url = URL.createObjectURL(new Blob([plain as BlobPart]));
    const link = document.createElement('a');
    link.href = url;
    link.download = a.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (invalid) {
    return (
      <Shell>
        <p className="rounded-lg border border-brass/40 bg-brass-tint p-6 text-xl text-brass">{t('access.invalid')}</p>
      </Shell>
    );
  }
  if (!bundle) {
    return (
      <Shell>
        <p className="text-lg text-muted">{t('common.loading')}</p>
      </Shell>
    );
  }
  if (items) {
    return (
      <Shell>
        <VaultViewer owner={bundle.ownerName} items={items} onDownload={download} />
      </Shell>
    );
  }

  const needed = Math.max(bundle.threshold - 1, 1);
  return (
    <Shell>
      <h1 className="text-3xl font-extrabold leading-tight">{t('access.title', { owner: bundle.ownerName })}</h1>
      <p className="mt-3 text-lg text-muted">{t('access.intro', { owner: bundle.ownerName })}</p>

      <section className="mt-8 panel p-6" aria-labelledby="step1">
        <h2 id="step1" className="text-2xl font-extrabold">
          {t('access.step1.title')}
        </h2>
        <p className="mt-2 text-lg">{t('access.step1.body')}</p>

        {!piece ? (
          <form onSubmit={unlock} className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-lg font-semibold">{t('access.passphrase')}</span>
              <input className="field py-3 text-lg" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="current-password" required />
            </label>
            <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
              {busy ? t('access.unlocking') : t('access.unlock')}
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-lg font-semibold">{t('access.yourCode')}</p>
            <p className="mt-2 select-all break-words rounded-lg border-2 border-seal bg-seal-tint p-4 text-center font-mono text-xl font-extrabold tracking-wider text-seal-dark">
              {myCode}
            </p>
            <p className="mt-2 text-base text-muted">{t('access.yourCode.hint')}</p>
            <button
              className="btn-quiet mt-3"
              onClick={async () => {
                if (myCode) await navigator.clipboard.writeText(myCode);
                setCopied(true);
              }}
            >
              {copied ? t('access.copied') : t('access.copy')}
            </button>
          </div>
        )}
      </section>

      {!piece && error && (
        <p role="alert" className="mt-4 rounded-md border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-lg text-sindoor">
          {error}
        </p>
      )}

      {piece && (
        <section className="mt-6 panel p-6" aria-labelledby="step2">
          <h2 id="step2" className="text-2xl font-extrabold">
            {t('access.step2.title')}
          </h2>
          <p className="mt-2 text-lg">{t('access.step2.body', { n: bundle.threshold })}</p>

          <form onSubmit={openVault} className="mt-4 space-y-4">
            {others.map((value, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-lg font-semibold">{t('access.otherCode', { i: i + 1 })}</span>
                <textarea
                  className="field min-h-20 py-3 font-mono text-lg"
                  value={value}
                  onChange={(e) => setOthers((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                  spellCheck={false}
                  autoCapitalize="characters"
                />
              </label>
            ))}
            {error && (
              <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-lg text-sindoor">
                {error}
              </p>
            )}
            <button className="btn-primary w-full py-3 text-lg" disabled={busy || needed < 1}>
              {busy ? t('access.opening') : t('access.open')}
            </button>
          </form>
          <p className="mt-4 text-base text-muted">{t('access.onlyGive')}</p>
        </section>
      )}
    </Shell>
  );
}
