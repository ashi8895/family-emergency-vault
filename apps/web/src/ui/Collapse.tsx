import type { ReactNode } from 'react';
import { usePresence } from './usePresence';

/** Height animates open and closed (grid-rows 0fr to 1fr), no measuring needed. */
export default function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const { mounted, visible } = usePresence(open, 300);
  if (!mounted) return null;
  return (
    <div className="collapse-grid" data-open={visible}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
