import { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../appearance';
import { useI18n } from '../i18n';
import { THEMES } from '../lib/themes';

const Switch = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="font-semibold">{label}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-seal' : 'bg-line'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

/** Colour theme, larger text and reduced motion. Saved on this device. */
export default function AppearanceMenu({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { theme, setTheme, reduceMotion, setReduceMotion } = useAppearance();
  const { large, setLargeText } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trigger = tone === 'dark' ? 'border border-white/25 text-white hover:bg-white/10' : 'border border-line bg-white text-ink hover:border-seal';

  return (
    <div ref={box} className="relative">
      <button ref={button} className={`btn px-3 py-1.5 text-sm ${trigger}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 1.8a6.2 6.2 0 100 12.4c1 0 1.4-.7 1.1-1.5-.3-.9.2-1.6 1.1-1.6h1.2a2.6 2.6 0 002.6-2.6C14 5 11.4 1.8 8 1.8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="7" r="1" fill="currentColor" />
          <circle cx="8" cy="5" r="1" fill="currentColor" />
          <circle cx="11" cy="7" r="1" fill="currentColor" />
        </svg>
        <span className="hidden sm:inline">Appearance</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Appearance" className="dialog-in absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl">
          <p className="font-extrabold">Colour theme</p>
          <div role="radiogroup" aria-label="Colour theme" className="mt-3 grid grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={theme === t.id}
                onClick={() => setTheme(t.id)}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors duration-200 ${theme === t.id ? 'border-seal bg-seal-tint' : 'border-line hover:border-seal'}`}
              >
                <span className="relative h-8 w-8 shrink-0" aria-hidden="true">
                  <span className="absolute left-0 top-0 h-6 w-6 rounded-full border border-white" style={{ background: t.swatch.vault }} />
                  <span className="absolute bottom-0 right-0 h-5 w-5 rounded-full border border-white" style={{ background: t.swatch.seal }} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-tight">{t.label}</span>
                  <span className="block text-xs text-muted">{t.note}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4 border-t border-line pt-4">
            <Switch checked={large} onChange={setLargeText} label="Larger text" hint="Easier to read" />
            <Switch checked={reduceMotion} onChange={setReduceMotion} label="Reduce motion" hint="Fewer animations" />
          </div>
          <p className="mt-4 text-xs text-muted">Saved on this device only.</p>
        </div>
      )}
    </div>
  );
}
