/** A tijori door: green steel, a brass dial and a handle. Small enough for a header. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" style={{ fill: 'rgb(var(--c-seal))' }} stroke="#C9962D" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#C9962D" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.2" fill="#C9962D" />
      <path d="M16 8.5v2.6M16 20.9v2.6M8.5 16h2.6M20.9 16h2.6" stroke="#C9962D" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const DEFAULT_LABEL = 'Family Emergency Vault';

export default function Logo({ label = DEFAULT_LABEL, tone = 'light' }: { label?: string; tone?: 'light' | 'dark' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-display text-base font-extrabold leading-tight sm:text-lg ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>
        {label === DEFAULT_LABEL ? (
          <>
            <span className="sm:hidden">Emergency Vault</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
    </span>
  );
}
