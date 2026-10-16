const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusables = (root: HTMLElement | null): HTMLElement[] =>
  root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [];

/** Keep Tab inside a modal: from the last control wrap to the first, and the other way round. */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== 'Tab') return;
  const items = focusables(root);
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !root?.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root?.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}
