import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { sealFile, type Category, type PlainAttachment } from '../crypto/vault';
import { CATEGORIES, formatBytes } from '../types';
import { useUi } from '../ui/UiProvider';

export interface EditorValue {
  category: Category;
  title: string;
  notes: string;
  instructions: string;
  attachments: PlainAttachment[];
}

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  vk: CryptoKey;
  initial: EditorValue;
  isNew: boolean;
  onSave: (v: EditorValue) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onDownload: (a: PlainAttachment) => Promise<void>;
  /** 'drawer': no card border and no heading, because the drawer supplies both */
  variant?: 'card' | 'drawer';
}

export default function ItemEditor({ vk, initial, isNew, onSave, onDelete, onCancel, onDownload, variant = 'card' }: Props) {
  const { confirm } = useUi();
  const [v, setV] = useState<EditorValue>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EditorValue>(k: K, val: EditorValue[K]) => setV((p) => ({ ...p, [k]: val }));

  async function addFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) return setError('That file is over 10 MB. Choose a smaller one.');
    if (v.attachments.length >= 10) return setError('You can attach up to 10 files to one item.');
    setBusy(true);
    try {
      // Encrypt in the browser; only ciphertext is uploaded.
      const { ct, iv } = await sealFile(vk, new Uint8Array(await file.arrayBuffer()));
      const form = new FormData();
      form.append('iv', iv); // text field first so the server sees it before the file stream
      form.append('file', new Blob([ct as BlobPart], { type: 'application/octet-stream' }), 'blob');
      const { fileId } = await api.upload<{ fileId: string }>('/vault/files', form);
      set('attachments', [...v.attachments, { fileId, name: file.name, size: file.size }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) return setError('Give this item a title so your family can find it.');
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...v, title: v.title.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setBusy(false);
    }
  }

  const hint = CATEGORIES.find((c) => c.id === v.category)?.hint;

  return (
    <form onSubmit={submit} className={variant === 'card' ? 'space-y-5 panel p-6' : 'space-y-5'}>
      {variant === 'card' && <h2 className="text-2xl font-extrabold">{isNew ? 'Add an item' : 'Edit item'}</h2>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-semibold">Drawer</span>
          <select className="field" value={v.category} onChange={(e) => set('category', e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">Title</span>
          <input className="field" value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={150} placeholder="e.g. LIC Jeevan Anand policy" required />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block font-semibold">What it is and where to find it</span>
        <textarea className="field min-h-28" value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={20000} placeholder="Policy papers are in the green file, top shelf of the almirah." />
      </label>

      <label className="block">
        <span className="mb-1 block font-semibold">What the family should do</span>
        <textarea className="field min-h-24" value={v.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={20000} placeholder="Call the agent first. Nominee is Mummy. Claim within 30 days." />
        <span className="mt-1 block text-sm text-muted">Who to call, who the nominee is, what to bring.</span>
      </label>

      <div>
        <span className="mb-1 block font-semibold">Files</span>
        <p className="mb-2 text-sm text-muted">Scans or photos, up to 10 MB each. They are encrypted before upload.</p>
        {v.attachments.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-md border border-line">
            {v.attachments.map((a) => (
              <li key={a.fileId} className="flex items-center justify-between gap-3 px-3 py-2">
                <button type="button" className="truncate text-left font-semibold text-seal underline-offset-4 hover:underline" onClick={() => onDownload(a).catch((e) => setError(e.message))}>
                  {a.name}
                </button>
                <span className="shrink-0 text-sm text-muted">{formatBytes(a.size)}</span>
                <button type="button" className="shrink-0 text-sm font-semibold text-brass hover:underline" onClick={() => set('attachments', v.attachments.filter((x) => x.fileId !== a.fileId))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileInput} type="file" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2 file:font-semibold" disabled={busy} onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])} />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sm text-sindoor">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Working…' : 'Save item'}
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn-danger ml-auto"
            disabled={busy}
            onClick={async () => {
              const yes = await confirm({ title: 'Delete this item?', message: 'Its files are deleted too. This cannot be undone.', confirmLabel: 'Delete item', danger: true });
              if (!yes) return;
              setBusy(true);
              try {
                await onDelete();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not delete');
                setBusy(false);
              }
            }}
          >
            Delete item
          </button>
        )}
      </div>
    </form>
  );
}
