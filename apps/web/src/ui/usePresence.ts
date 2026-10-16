import { useEffect, useState } from 'react';

/**
 * Lets a panel animate OUT before it is removed. `mounted` says whether to render it at all; `visible` flips a frame
 * after mounting (so the entrance transition runs) and flips back at the start of the exit.
 */
export function usePresence(open: boolean, ms = 240) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);

  return { mounted, visible };
}
