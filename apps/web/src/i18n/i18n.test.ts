import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './en';
import { hi } from './hi';
import { translate } from './translate';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Hindi has exactly the same keys as English', () => {
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(en).sort());
});

test('no empty strings in either language', () => {
  for (const [k, v] of [...Object.entries(en), ...Object.entries(hi)]) assert.ok(v.trim().length > 0, `empty: ${k}`);
});

test('every key uses the same {placeholders} in both languages (a missing one would show a blank name)', () => {
  for (const k of Object.keys(en) as (keyof typeof en)[]) assert.deepEqual(placeholders(hi[k]), placeholders(en[k]), `placeholder mismatch in ${k}`);
});

test('Hindi strings really are Devanagari, not English left in by mistake', () => {
  const allowedEnglish = new Set(['brand']);
  for (const [k, v] of Object.entries(hi)) if (!allowedEnglish.has(k)) assert.match(v, /[\u0900-\u097F]/, `no Devanagari in ${k}`);
});

test('translate fills placeholders, keeps unknown ones visible, and works for both languages', () => {
  assert.equal(translate('en', 'access.title', { owner: 'Ashi' }), "Open Ashi's vault");
  assert.equal(translate('hi', 'access.title', { owner: 'आशी' }), 'आशी की तिजोरी खोलें');
  assert.equal(translate('en', 'access.step2.body', {}), en['access.step2.body']); // {n} left visible, never silently blank
});
