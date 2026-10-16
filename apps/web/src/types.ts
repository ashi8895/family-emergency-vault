import type { Category } from './crypto/vault';

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'insurance', label: 'Insurance', hint: 'LIC, health, vehicle, term plans' },
  { id: 'bank', label: 'Bank accounts', hint: 'Which bank, branch, who is nominee' },
  { id: 'investments', label: 'Investments', hint: 'FDs, mutual funds, demat, EPF, PPF' },
  { id: 'property', label: 'Property', hint: 'Registry, loan papers, rent agreements' },
  { id: 'medical', label: 'Medical', hint: 'Reports, doctors, ongoing medicines' },
  { id: 'legal', label: 'Legal', hint: 'Will, power of attorney, court papers' },
  { id: 'other', label: 'Other', hint: 'Anything the family should know' },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export interface Session {
  user: { id: string; email: string; name: string };
  vk: CryptoKey; // vault key: exists only in memory, gone on refresh or lock
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// ---------- Phase 2: trusted contacts ----------
export interface ContactDto {
  id: string;
  name: string;
  email: string;
  relation: string;
  status: 'INVITED' | 'ACCEPTED';
  publicKey?: string;
  allowedCategories: string[];
  hasShare: boolean;
  shareGeneration?: number;
  inviteExpiresAt?: string;
  acceptedAt?: string;
}

export interface SharesInfo {
  generation: number;
  threshold: number;
  total: number;
  stale: boolean;
  updatedAt: string;
}

// ---------- Phase 3: safety switch ----------
export type SwitchState = 'ACTIVE' | 'WARNING' | 'PENDING_APPROVAL' | 'WAITING_PERIOD' | 'UNLOCKED';

export interface SwitchSettings {
  checkInIntervalDays: number;
  reminderGapDays: number;
  waitingPeriodDays: number;
}

export interface SwitchStatus {
  state: SwitchState;
  armed: boolean;
  armedReason: string | null;
  lastCheckInAt: string;
  nextActionAt: string | null;
  remindersSent: number;
  maxReminders: number;
  settings: SwitchSettings;
  case: { state: string; needed: number; approvals: { name: string; approvedAt: string }[]; unlocksAt: string | null } | null;
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- Phase 4 ----------
export interface AuditEntry {
  seq: number;
  ts: string;
  actorType: 'owner' | 'contact' | 'system';
  actorLabel: string;
  action: string;
  meta: Record<string, string | number | boolean | null>;
}
