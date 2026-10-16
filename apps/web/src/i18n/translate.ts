import { en, type Key } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';
export type { Key };
const dicts: Record<Lang, Record<Key, string>> = { en, hi };

/** Pure: no React, no browser. Missing keys fall back to English, then to the key itself, so a gap never crashes a page. */
export function translate(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  const template = dicts[lang][key] || en[key] || key;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
