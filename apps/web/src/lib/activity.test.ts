import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuditEntry } from '../types';
import { ACTIVITY_FILTERS, countByFilter, filterEntries, groupOf } from './activity';

const e = (seq: number, action: string): AuditEntry => ({ seq, ts: '', actorType: 'owner', actorLabel: 'owner', action, meta: {} });

test('every action the server writes belongs to a visible filter', () => {
  const known = [
    'account.created', 'login', 'login.failed', 'login.locked', '2fa.enabled', '2fa.disabled',
    'vault.item_created', 'vault.item_updated', 'vault.item_deleted', 'vault.file_uploaded',
    'contact.invited', 'contact.link_resent', 'contact.accepted', 'contact.removed', 'contact.permissions_changed', 'shares.created',
    'settings.changed', 'switch.checkin', 'switch.checkin_email', 'switch.reminder_email', 'switch.escalated', 'approval.given',
    'switch.waiting_started', 'switch.cancelled', 'switch.approvals_lost', 'switch.unlocked',
    'access.opened', 'access.items_listed', 'access.file_downloaded', 'access.closed',
  ];
  for (const a of known) assert.notEqual(groupOf(a), 'other', `${a} has no filter`);
});

test('groups are what a person would expect', () => {
  assert.equal(groupOf('login'), 'account');
  assert.equal(groupOf('2fa.enabled'), 'account');
  assert.equal(groupOf('vault.item_created'), 'vault');
  assert.equal(groupOf('shares.created'), 'people');
  assert.equal(groupOf('approval.given'), 'switch');
  assert.equal(groupOf('access.opened'), 'access');
  assert.equal(groupOf('something.new'), 'other');
});

test('filtering and counting', () => {
  const entries = [e(1, 'login'), e(2, 'vault.item_created'), e(3, 'login'), e(4, 'access.opened'), e(5, 'weird')];
  assert.deepEqual(filterEntries(entries, 'account').map((x) => x.seq), [1, 3]);
  assert.equal(filterEntries(entries, 'all').length, 5);
  assert.deepEqual(countByFilter(entries), { all: 5, account: 2, vault: 1, people: 0, switch: 0, access: 1 });
  assert.equal(ACTIVITY_FILTERS[0].id, 'all');
});
