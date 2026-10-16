import { useEffect, useRef, type ReactNode } from 'react';
import { focusables, trapTab } from '../lib/focus';
import { usePresence } from './usePresence';

/**
 * A panel that slides in from the right and keeps the page behind it visible, so adding or editing an item does not
 * throw you out of the list. Esc or a click outside closes it; Tab stays inside; focus returns to where it was.
 */
export default function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { mounted, visible } = usePresence(open, 280);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => {
      const first = focusables(panel.current).find((el) => el.tagName !== 'BUTTON' || el.dataset.close === undefined);
      first?.focus();
    }, 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-ink/45 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-paper shadow-2xl transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 py-4">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button data-close="" className="btn-quiet px-3 py-1.5 text-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
