import type { CSSProperties } from 'react';

/**
 * The one memorable thing: the combination dial of a tijori. Two rings of ticks turn, and the key (a ring) is
 * drawn as three arcs: the Shamir pieces. In "auto" mode it turns slowly by itself; in "scroll" mode the parent sets
 * --p (progress) and --d (distance between the pieces) while the page scrolls.
 */
const TICKS = Array.from({ length: 60 }, (_, i) => i);

export default function VaultDial({
  mode = 'auto',
  step,
  size = 320,
  className = '',
}: {
  mode?: 'auto' | 'scroll';
  step?: number;
  size?: number;
  className?: string;
}) {
  const style = { '--size': `${size}px` } as CSSProperties;
  return (
    <div className={`dial ${className}`} data-mode={mode} data-step={step} style={style} aria-hidden="true">
      {/* door */}
      <svg viewBox="0 0 320 320">
        <defs>
          <linearGradient id="fev-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E7BE5F" />
            <stop offset="1" stopColor="#A87B1F" />
          </linearGradient>
        </defs>
        <circle cx="160" cy="160" r="156" style={{ fill: 'rgb(var(--c-vault-deep))', stroke: 'rgb(var(--c-vault-rim))' }} strokeWidth="2" />
        <circle cx="160" cy="160" r="126" fill="none" style={{ stroke: 'rgb(var(--c-vault-rim))' }} strokeWidth="1" />
      </svg>

      {/* outer ring of ticks */}
      <svg viewBox="0 0 320 320" className="dial-outer">
        {TICKS.map((i) => {
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              x1="160"
              y1={major ? 12 : 14}
              x2="160"
              y2={major ? 30 : 24}
              stroke="#C9962D"
              strokeWidth={major ? 2.4 : 1.2}
              strokeOpacity={major ? 1 : 0.55}
              transform={`rotate(${i * 6} 160 160)`}
            />
          );
        })}
      </svg>

      {/* inner dotted ring, turns the other way */}
      <svg viewBox="0 0 320 320" className="dial-inner">
        <circle cx="160" cy="160" r="112" fill="none" style={{ stroke: 'rgb(var(--c-seal-glow))' }} strokeWidth="2" strokeDasharray="1.5 7" strokeLinecap="round" />
        <circle cx="160" cy="48" r="4" style={{ fill: 'rgb(var(--c-seal-glow))' }} />
      </svg>

      {/* check-in pulse (story step 3) */}
      <svg viewBox="0 0 320 320">
        <circle className="dial-pulse" cx="160" cy="160" r="98" fill="none" style={{ stroke: 'rgb(var(--c-seal-glow))' }} strokeWidth="2" />
      </svg>

      {/* the key, as three arcs */}
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 320 320" className="dial-piece" style={{ '--i': i } as CSSProperties}>
          <circle
            cx="160"
            cy="160"
            r="84"
            fill="none"
            stroke="url(#fev-brass)"
            strokeWidth="15"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="30 70"
            transform="rotate(-144 160 160)"
          />
        </svg>
      ))}

      {/* keyhole and the fixed marker */}
      <svg viewBox="0 0 320 320">
        <circle cx="160" cy="160" r="52" style={{ fill: 'rgb(var(--c-vault))' }} stroke="#C9962D" strokeWidth="2" />
        <circle cx="160" cy="152" r="10" fill="#C9962D" />
        <path d="M154 158h12l4 24h-20z" fill="#C9962D" />
        <path d="M151 3h18l-9 15z" fill="#E7BE5F" />
      </svg>
    </div>
  );
}
