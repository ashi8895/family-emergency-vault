import { useEffect, useRef, useState } from 'react';
import VaultDial from './VaultDial';

const STEPS = [
  { title: 'Write it down', body: 'Notes and scans are locked inside your browser before they leave it. The server only ever holds scrambled data.' },
  { title: 'Split the key', body: 'The key is cut into pieces and each trusted person holds one. One piece alone opens nothing.' },
  { title: 'We check on you', body: 'Regular check-in emails. If you go quiet, your people are asked to approve, and a waiting period starts. You can stop it with one click.' },
  { title: 'Family opens it together', body: 'Big type, English and Hindi, one step at a time. The pieces come together and the vault opens for them.' },
];

/** Where the key pieces are, for a given scroll progress p (0..1): together, apart, apart, together again. */
export function pieceDistance(p: number): number {
  if (p < 0.2) return 0;
  if (p < 0.45) return (p - 0.2) / 0.25;
  if (p < 0.7) return 1;
  return Math.max(0, (1 - p) / 0.3);
}

export const stepForProgress = (p: number) => Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length)));

/**
 * Scroll-driven story. The section is tall; inside it a panel sticks to the screen. While you scroll, the dial turns
 * and the key pieces split and rejoin. The scroll handler writes CSS variables straight to the element (no React
 * re-render per frame) and only touches React state when the step changes, which keeps it smooth.
 */
export default function ScrollStory({ onStart }: { onStart: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      el.style.setProperty('--p', p.toFixed(4));
      el.style.setProperty('--d', pieceDistance(p).toFixed(4));
      const idx = stepForProgress(p);
      setActive((a) => (a === idx ? a : idx));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="how" ref={ref} className="relative h-[320vh]" aria-label="How it works">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex justify-center lg:justify-start">
            <div className="w-[58vw] max-w-[420px] lg:w-full">
              <VaultDial mode="scroll" step={active} size={420} />
            </div>
          </div>

          <div>
            <p className="mb-6 font-semibold text-brass-bright">How it works</p>
            <ol className="space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="story-step border-l-2 border-white/15 pl-5 transition-colors duration-300 data-[active=true]:border-brass-bright" data-active={i === active}>
                  <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
                    <span className="mr-3 text-brass-bright">{i + 1}</span>
                    {s.title}
                  </h2>
                  <div className="story-body">
                    <div>
                      <p className="max-w-md pt-2 text-lg text-white/80">{s.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button className="btn-brass mt-8" onClick={onStart}>
              Create your vault
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
