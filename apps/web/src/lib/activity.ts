import type { AuditEntry } from '../types';

export type ActivityGroup = 'account' | 'vault' | 'people' | 'switch' | 'access' | 'other';
export type ActivityFilter = 'all' | Exclude<ActivityGroup, 'other'>;

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'account', label: 'Sign-in and security' },
  { id: 'vault', label: 'Vault items' },
  { id: 'people', label: 'Trusted people' },
  { id: 'switch', label: 'Safety switch' },
  { id: 'access', label: 'Opened by trusted people' },
];

export function groupOf(action: string): ActivityGroup {
  if (action === 'account.created' || action === 'login' || action.startsWith('login.') || action.startsWith('2fa.')) return 'account';
  if (action.startsWith('vault.')) return 'vault';
  if (action.startsWith('contact.') || action.startsWith('shares.')) return 'people';
  if (action.startsWith('switch.') || action.startsWith('approval.') || action === 'settings.changed') return 'switch';
  if (action.startsWith('access.')) return 'access';
  return 'other';
}

export const filterEntries = (entries: readonly AuditEntry[], filter: ActivityFilter): AuditEntry[] =>
  filter === 'all' ? [...entries] : entries.filter((e) => groupOf(e.action) === filter);

export function countByFilter(entries: readonly AuditEntry[]): Record<ActivityFilter, number> {
  const counts: Record<ActivityFilter, number> = { all: entries.length, account: 0, vault: 0, people: 0, switch: 0, access: 0 };
  for (const e of entries) {
    const g = groupOf(e.action);
    if (g !== 'other') counts[g]++;
  }
  return counts;
}
