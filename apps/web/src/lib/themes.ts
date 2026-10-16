/**
 * The themes the Appearance menu offers. The real colour values live in index.css as CSS variables (a test checks that
 * these swatches match them). A theme changes the PRIMARY and DARK surface colours; brass (hardware) and sindoor
 * (danger) stay the same everywhere so their meaning never changes.
 */
export type ThemeId = 'tijori' | 'midnight' | 'peacock' | 'charcoal';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  note: string;
  swatch: { seal: string; vault: string };
}

export const THEMES: ThemeInfo[] = [
  { id: 'tijori', label: 'Tijori', note: 'Almirah green', swatch: { seal: '#1F5C4E', vault: '#0E2F28' } },
  { id: 'midnight', label: 'Midnight', note: 'Deep blue', swatch: { seal: '#2C4F8A', vault: '#0E1B33' } },
  { id: 'peacock', label: 'Peacock', note: 'Teal', swatch: { seal: '#0F6B7A', vault: '#0A2F36' } },
  { id: 'charcoal', label: 'Charcoal', note: 'Quiet grey', swatch: { seal: '#3B4452', vault: '#1A1F27' } },
];

export const DEFAULT_THEME: ThemeId = 'tijori';
export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
