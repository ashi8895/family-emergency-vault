import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { openFile, openItem, sealItem, type Category, type ItemDto, type PlainAttachment, type PlainItem } from '../crypto/vault';
import ContactsPanel from '../components/ContactsPanel';
import EmergencyBanner from '../components/EmergencyBanner';
import ItemEditor, { type EditorValue } from '../components/ItemEditor';
import Logo from '../components/Logo';
import SecurityPanel from '../components/SecurityPanel';
import SetupChecklist from '../components/SetupChecklist';
import SwitchPanel from '../components/SwitchPanel';
import { loadPins, prunePins, savePins, togglePin, type PrefStore } from '../lib/pins';
import { readPref, writePref } from '../lib/safeStorage';
import { filterAndSort, highlight, SORT_OPTIONS, type SortKey } from '../lib/vaultList';
import { CATEGORIES, categoryLabel, type Session } from '../types';
import AppearanceMenu from '../ui/AppearanceMenu';
import Drawer from '../ui/Drawer';
import { useUi } from '../ui/UiProvider';

type Item = PlainItem & { id: string; updatedAt: string; broken?: boolean };
type Editing = { mode: 'new'; category: Category } | { mode: 'edit'; item: Item } | null;

const prefs: PrefStore = { get: readPref, set: writePref };

/** Text with the searched words marked. Built from plain pieces, never from HTML. */
function Hl({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-brass-tint px-0.5 text-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

const typingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export default function VaultPage({ session, onLock }: { session: Session; onLock: () => void }) {
  const { vk, user } = session;
  const { toast } = useUi();
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [editing, setEditing] = useState<Editing>(null);
  const [view, setView] = useState<'vault' | 'people' | 'switch' | 'security'>('vault');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [pins, setPins] = useState<Set<string>>(() => loadPins(prefs, user.id));
  const searchRef = useRef<HTMLInputElement>(null);

  // keep what the drawer shows while it slides out, so it does not go blank first
  const lastEditing = useRef<Editing>(null);
  if (editing) lastEditing.current = editing;
  const shown = editing ?? lastEditing.current;

  const load = useCallback(async () => {
    try {
      const dtos = await api.get<ItemDto[]>('/vault/items');
      const opened = await Promise.all(
        dtos.map(async (d): Promise<Item> => {
          try {
            return await openItem(vk, d);
          } catch {
            // Wrong key or tampered data: show it instead of hiding it.
            return { id: d.id, updatedAt: d.updatedAt, category: d.category, title: 'Could not decrypt this item', notes: '', instructions: '', attachments: [], broken: true };
          }
        }),
      );
      setItems(opened);
      setPins((p) => {
        const pruned = prunePins(p, opened.map((i) => i.id));
        if (pruned.size !== p.size) savePins(prefs, user.id, pruned);
        return pruned;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your vault');
    }
  }, [vk, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // keyboard: "/" searches, "n" adds an item (only when you are not typing and nothing is open)
  useEffect(() => {
    if (view !== 'vault' || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'n') {
        e.preventDefault();
        setEditing({ mode: 'new', category: filter === 'all' ? 'insurance' : filter });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, editing, filter]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items?.forEach((i) => m.set(i.category, (m.get(i.category) ?? 0) + 1));
    return m;
  }, [items]);

  const visible = useMemo(() => filterAndSort(items ?? [], { query, sort, pinned: pins, category: filter }), [items, query, sort, pins, filter]);

  function pin(id: string) {
    setPins((p) => {
      const next = togglePin(p, id);
      savePins(prefs, user.id, next);
      return next;
    });
  }

  async function save(v: EditorValue) {
    const wasEdit = editing?.mode === 'edit';
    const body = await sealItem(vk, v);
    if (editing?.mode === 'edit') await api.put(`/vault/items/${editing.item.id}`, body);
    else await api.post('/vault/items', body);
    setEditing(null);
    await load();
    toast(wasEdit ? 'Item saved' : 'Item added');
  }

  async function remove(id: string) {
    await api.delete(`/vault/items/${id}`);
    setEditing(null);
    await load();
    toast('Item deleted');
  }

  async function download(a: PlainAttachment) {
    const res = await api.raw(`/vault/files/${a.fileId}`);
    const iv = res.headers.get('X-File-IV');
    if (!iv) throw new Error('This file is missing its encryption data');
    const plain = await openFile(vk, new Uint8Array(await res.arrayBuffer()), iv);
    const url = URL.createObjectURL(new Blob([plain as BlobPart]));
    const link = document.createElement('a');
    link.href = url;
    link.download = a.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const initial: EditorValue =
    shown?.mode === 'edit'
      ? { category: shown.item.category, title: shown.item.title, notes: shown.item.notes, instructions: shown.item.instructions, attachments: shown.item.attachments }
      : { category: shown?.mode === 'new' ? shown.category : 'insurance', title: '', notes: '', instructions: '', attachments: [] };

  const newItem = () => setEditing({ mode: 'new', category: filter === 'all' ? 'insurance' : filter });
  const searching = query.trim().length > 0;

  return (
    <div className="app-shell min-h-screen" data-page={view}>
      <header className="sticky top-0 z-30 bg-vault text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-6">
          <div className="py-3">
            <Logo tone="dark" />
          </div>
          <nav
            aria-label="Sections"
            className="order-3 flex w-full gap-6 overflow-x-auto sm:order-none sm:ml-2 sm:w-auto"
          >
            {(
              [
                ["vault", "Vault"],
                ["people", "Trusted people"],
                ["switch", "Safety switch"],
                ["security", "Security"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className="tab whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 py-3">
            <AppearanceMenu />
            <span className="hidden text-sm text-white/70 lg:inline">
              {user.name}
            </span>
            <button
              className="btn border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              onClick={onLock}
            >
              Lock vault
            </button>
          </div>
        </div>
      </header>
      <EmergencyBanner />
      <SetupChecklist
        refreshKey={view}
        onGo={setView}
        variant={view === "vault" ? "full" : "bar"}
      />

      <div key={view} className="tab-pane">
        {view === "people" ? (
          <div className="mx-auto max-w-4xl px-6 py-8">
            <ContactsPanel vk={vk} />
          </div>
        ) : view === "switch" ? (
          <div className="mx-auto max-w-4xl px-6 py-8">
            <SwitchPanel />
          </div>
        ) : view === "security" ? (
          <div className="mx-auto max-w-4xl px-6 py-8">
            <SecurityPanel />
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 md:grid-cols-[220px_1fr]">
            <nav aria-label="Drawers">
              <ul className="space-y-1">
                {[
                  { id: "all" as const, label: "Everything" },
                  ...CATEGORIES,
                ].map((c) => {
                  const n =
                    c.id === "all"
                      ? (items?.length ?? 0)
                      : (counts.get(c.id) ?? 0);
                  const active = filter === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setFilter(c.id)}
                        aria-current={active}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-semibold transition-colors duration-200 ${active ? "bg-vault text-white" : "hover:bg-white"}`}
                      >
                        {c.label}
                        <span
                          className={`text-sm ${active ? "text-white/70" : "text-muted"}`}
                        >
                          {n}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <main>
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-md border border-sindoor/30 bg-sindoor-tint px-3 py-2 text-sindoor"
                >
                  {error}
                </p>
              )}

              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-extrabold">
                  {filter === "all"
                    ? "Everything you have noted"
                    : categoryLabel(filter)}
                </h2>
                <button className="btn-primary" onClick={newItem}>
                  Add item
                </button>
              </div>

              {items !== null && items.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[14rem] flex-1">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M10.5 10.5L14 14"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                      <input
                        ref={searchRef}
                        type="search"
                        className="field pl-10 pr-12"
                        placeholder="Search your items"
                        aria-label="Search your items"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setQuery("");
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      {query ? (
                        <button
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-muted hover:text-ink"
                          aria-label="Clear search"
                          onClick={() => setQuery("")}
                        >
                          ✕
                        </button>
                      ) : (
                        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-xs text-muted sm:block">
                          /
                        </kbd>
                      )}
                    </div>
                    <label className="sr-only" htmlFor="sort-items">
                      Sort items
                    </label>
                    <select
                      id="sort-items"
                      className="field w-auto py-2.5"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-2 text-sm text-muted" aria-live="polite">
                    {searching
                      ? `${visible.length} of ${filter === "all" ? items.length : (counts.get(filter) ?? 0)} items. `
                      : ""}
                    Search runs on this device, so what you look for stays
                    private. Press{" "}
                    <kbd className="rounded border border-line px-1">n</kbd> to
                    add an item.
                  </p>
                </div>
              )}

              {items === null ? (
                <ul className="space-y-3" aria-label="Loading your items">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="skeleton h-20" />
                  ))}
                </ul>
              ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-white p-8">
                  <p className="text-lg font-semibold">Nothing here yet.</p>
                  <p className="mt-1 max-w-md text-muted">
                    Start with the one thing your family would struggle to find:
                    a life insurance policy or the main bank account.
                  </p>
                  <button className="btn-primary mt-4" onClick={newItem}>
                    Add your first item
                  </button>
                </div>
              ) : visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-white p-8">
                  <p className="text-lg font-semibold">
                    {searching
                      ? `No items match “${query.trim()}”.`
                      : "Nothing in this drawer yet."}
                  </p>
                  <div className="mt-4 flex gap-3">
                    {searching && (
                      <button
                        className="btn-quiet"
                        onClick={() => setQuery("")}
                      >
                        Clear search
                      </button>
                    )}
                    {!searching && (
                      <button className="btn-primary" onClick={newItem}>
                        Add an item here
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <ul className="space-y-3">
                  {visible.map((i) => {
                    const pinned = pins.has(i.id);
                    return (
                      <li
                        key={i.id}
                        className="panel relative transition-colors duration-200 hover:border-seal"
                      >
                        <button
                          disabled={i.broken}
                          onClick={() => setEditing({ mode: "edit", item: i })}
                          className="block w-full p-4 pr-14 text-left disabled:cursor-not-allowed"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-lg font-extrabold">
                              <Hl text={i.title} query={query} />
                            </span>
                            <span className="shrink-0 text-sm text-muted">
                              {categoryLabel(i.category)}
                            </span>
                          </span>
                          {i.notes && (
                            <span className="mt-1 line-clamp-2 block text-muted">
                              <Hl text={i.notes} query={query} />
                            </span>
                          )}
                          {i.attachments.length > 0 && (
                            <span className="mt-2 block text-sm font-semibold text-seal">
                              {i.attachments.length}{" "}
                              {i.attachments.length === 1 ? "file" : "files"}{" "}
                              attached
                            </span>
                          )}
                        </button>
                        {!i.broken && (
                          <button
                            aria-pressed={pinned}
                            aria-label={
                              pinned
                                ? `Unpin ${i.title}`
                                : `Pin ${i.title} to the top`
                            }
                            title={pinned ? "Unpin" : "Pin to the top"}
                            onClick={() => pin(i.id)}
                            className={`absolute right-3 top-3 rounded-md p-1.5 transition-colors duration-200 ${pinned ? "text-brass-bright" : "text-line hover:text-brass-bright"}`}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                            >
                              <path
                                d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z"
                                fill={pinned ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </main>
          </div>
        )}
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={shown?.mode === "edit" ? "Edit item" : "Add an item"}
      >
        {shown && (
          <ItemEditor
            key={shown.mode === "edit" ? shown.item.id : "new"}
            variant="drawer"
            vk={vk}
            initial={initial}
            isNew={shown.mode === "new"}
            onSave={save}
            onDelete={
              shown.mode === "edit" ? () => remove(shown.item.id) : undefined
            }
            onCancel={() => setEditing(null)}
            onDownload={download}
          />
        )}
      </Drawer>
    </div>
  );
}
