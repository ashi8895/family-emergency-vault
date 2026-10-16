import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './lib/themes';
import { readPref, writePref } from './lib/safeStorage';

/**
 * Colour theme and "reduce motion", kept in a tiny external store so every component re-renders together.
 * Both are written onto <html> (data-theme, data-motion); the CSS does the rest. Larger text lives in the i18n store.
 */
const THEME_KEY = 'fev-theme';
const MOTION_KEY = 'fev-motion';

function initialTheme(): ThemeId {
  const saved = readPref(THEME_KEY);
  return isThemeId(saved) ? saved : DEFAULT_THEME;
}

function initialReduceMotion(): boolean {
  const saved = readPref(MOTION_KEY);
  if (saved === 'reduced') return true;
  if (saved === 'full') return false;
  // no choice yet: follow the operating system
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let theme: ThemeId = initialTheme();
let reduceMotion = initialReduceMotion();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((l) => l());

function applyToDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full';
}
applyToDocument();

export function setTheme(next: ThemeId) {
  theme = next;
  writePref(THEME_KEY, next);
  applyToDocument();
  emit();
}

export function setReduceMotion(on: boolean) {
  reduceMotion = on;
  writePref(MOTION_KEY, on ? 'reduced' : 'full');
  applyToDocument();
  emit();
}

export function useAppearance() {
  const t = useSyncExternalStore(subscribe, () => theme, () => theme);
  const m = useSyncExternalStore(subscribe, () => reduceMotion, () => reduceMotion);
  return { theme: t, setTheme, reduceMotion: m, setReduceMotion };
}
