import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { buildSteps, nextStep, progress, type SetupFacts, type Tab } from '../lib/setupSteps';
import type { ContactDto, SwitchStatus } from '../types';

/**
 * Shows, in plain words, what is still missing before the safety net really works.
 * "full" on the Vault tab (finished steps shrink to chips, open steps are cards); "bar" elsewhere so it never pushes
 * the real content off the screen.
 */
export default function SetupChecklist({
  refreshKey,
  onGo,
  variant = 'full',
}: {
  refreshKey: string;
  onGo: (t: Tab) => void;
  variant?: 'full' | 'bar';
}) {
  const [facts, setFacts] = useState<SetupFacts | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [items, contacts, sw, tf] = await Promise.all([
          api.get<unknown[]>('/vault/items'),
          api.get<{ contacts: ContactDto[] }>('/contacts'),
          api.get<SwitchStatus>('/emergency/status'),
          api.get<{ enabled: boolean }>('/2fa/status'),
        ]);
        if (cancelled) return;
        setFacts({
          items: items.length,
          contactsTotal: contacts.contacts.length,
          contactsAccepted: contacts.contacts.filter((c) => c.status === 'ACCEPTED').length,
          armed: sw.armed,
          armedReason: sw.armedReason,
          twoFactor: tf.enabled,
        });
      } catch {
        /* best effort: the screens show real errors */
      }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  if (!facts || hidden) return null;
  return <SetupChecklistView facts={facts} onGo={onGo} onHide={() => setHidden(true)} variant={variant} />;
}

const Tick = ({ className = '' }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={className}>
    <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Presentational: renders from plain data, so it can be tested without a network. */
export function SetupChecklistView({
  facts,
  onGo,
  onHide,
  variant = 'full',
}: {
  facts: SetupFacts;
  onGo: (t: Tab) => void;
  onHide: () => void;
  variant?: 'full' | 'bar';
}) {
  const steps = buildSteps(facts);
  const { done, total } = progress(steps);
  const next = nextStep(steps);
  if (!next) return null; // everything done: get out of the way

  const bar = (
    <div className="h-2 w-32 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-full rounded-full bg-seal transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );

  if (variant === 'bar') {
    return (
      <section aria-label="Setup progress" className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5">
          <span className="font-semibold">Safety net</span>
          <span className="text-sm font-semibold text-muted">
            {done} of {total} done
          </span>
          {bar}
          <span className="hidden min-w-0 truncate text-muted md:inline">Next: {next.title}</span>
          <button className="btn-primary ml-auto px-3 py-1 text-sm" onClick={() => onGo(next.tab)}>
            {next.cta}
          </button>
          <button className="text-sm font-semibold text-muted underline-offset-4 hover:underline" onClick={onHide}>
            Hide
          </button>
        </div>
      </section>
    );
  }

  const finished = steps.filter((s) => s.done);
  const open = steps.filter((s) => !s.done);
  return (
    <section aria-labelledby="setup-h" className="border-b border-line bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="setup-h" className="text-lg font-extrabold">
            Set up your safety net
          </h2>
          <span className="text-sm font-semibold text-muted">
            {done} of {total} done
          </span>
          {bar}
          <button className="ml-auto text-sm font-semibold text-muted underline-offset-4 hover:underline" onClick={onHide}>
            Hide
          </button>
        </div>

        {finished.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Finished steps">
            {finished.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-seal-tint px-3 py-1 text-sm font-semibold text-seal-dark">
                <Tick /> {s.short}
              </li>
            ))}
          </ul>
        )}

        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {open.map((s) => (
            <li key={s.id} className={`flex items-start gap-3 rounded-lg p-3 ${s.id === next.id ? 'bg-seal-tint' : 'bg-paper'}`}>
              <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line bg-white" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.title}
                  {s.optional && <span className="ml-2 text-xs font-semibold text-muted">recommended</span>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{s.hint}</p>
                <button className={`${s.id === next.id ? 'btn-primary' : 'btn-quiet'} mt-2 px-3 py-1 text-sm`} onClick={() => onGo(s.tab)}>
                  {s.cta}
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
