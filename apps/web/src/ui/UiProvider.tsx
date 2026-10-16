import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trapTab } from '../lib/focus';

export type ToastKind = 'success' | 'error' | 'info';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Ui {
  /** A short message that fades away. Errors stay a little longer. */
  toast: (text: string, kind?: ToastKind) => void;
  /** An in-page confirmation (instead of the browser's blocking confirm box). Resolves true or false. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

/** Without a provider (tests, previews) toasts do nothing and confirm falls back to the browser's box. */
const fallback: Ui = {
  toast: () => undefined,
  confirm: async (o) => (typeof window !== 'undefined' ? window.confirm(o.message ? `${o.title}\n\n${o.message}` : o.title) : false),
};

const Ctx = createContext<Ui>(fallback);
export const useUi = () => useContext(Ctx);

interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const ICON: Record<ToastKind, string> = { success: 'M3 8.5l3.2 3.2L13 4.8', error: 'M4 4l8 8M12 4l-8 8', info: 'M8 4v5M8 11.5v.5' };
const TONE: Record<ToastKind, string> = { success: 'bg-vault text-white', error: 'bg-sindoor text-white', info: 'bg-ink text-white' };

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => window.clearTimeout(t));
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (text: string, kind: ToastKind = 'success') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, text, kind }]); // at most three on screen
      const timer = window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
      timers.current.add(timer);
    },
    [dismiss],
  );

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ options, resolve })), []);
  const answer = (value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 shadow-xl ${TONE[t.kind]}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
              <path d={ICON[t.kind]} fill="none" stroke={t.kind === 'success' ? '#C9962D' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold">{t.text}</span>
            <button className="ml-1 text-sm text-white/70 hover:text-white" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        ))}
      </div>

      {dialog && <ConfirmDialog options={dialog.options} onAnswer={answer} />}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (v: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // For a destructive action the safe button gets the focus, so a stray Enter cancels instead of deleting
    (options.danger ? cancel.current : ok.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onAnswer(false);
      } else trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [options.danger, onAnswer]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="dialog-backdrop absolute inset-0 bg-ink/50" onClick={() => onAnswer(false)} aria-hidden="true" />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? 'confirm-message' : undefined}
        className="dialog-in relative w-full max-w-md rounded-2xl bg-white p-6 text-ink shadow-2xl"
      >
        <h2 id="confirm-title" className="text-xl font-extrabold">
          {options.title}
        </h2>
        {options.message && (
          <p id="confirm-message" className="mt-2 text-muted">
            {options.message}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancel} className="btn-quiet" onClick={() => onAnswer(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={ok} className={options.danger ? 'btn-danger' : 'btn-primary'} onClick={() => onAnswer(true)}>
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
