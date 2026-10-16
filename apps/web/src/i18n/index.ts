import { useSyncExternalStore } from 'react';
import { translate, type Key, type Lang } from './translate';

export type { Key, Lang };

/** Language and text size live in a tiny external store so every component re-renders together. */
const LANG_KEY = 'fev-lang';
const SIZE_KEY = 'fev-large-text';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just will not persist */
  }
};

function initialLang(): Lang {
  const saved = read(LANG_KEY);
  if (saved === 'en' || saved === 'hi') return saved;
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

let lang: Lang = initialLang();
let large = read(SIZE_KEY) === '1';
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((l) => l());

function applyToDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.style.fontSize = large ? '21px' : '';
}
applyToDocument();

export function setLang(next: Lang) {
  lang = next;
  write(LANG_KEY, next);
  applyToDocument();
  emit();
}

export function setLargeText(on: boolean) {
  large = on;
  write(SIZE_KEY, on ? '1' : '0');
  applyToDocument();
  emit();
}

export function useI18n() {
  const current = useSyncExternalStore(subscribe, () => lang, () => lang);
  const isLarge = useSyncExternalStore(subscribe, () => large, () => large);
  return {
    lang: current,
    t: (key: Key, vars?: Record<string, string | number>) => translate(current, key, vars),
    setLang,
    large: isLarge,
    setLargeText,
  };
}
