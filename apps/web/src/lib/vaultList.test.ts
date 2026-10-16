import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterAndSort, highlight, matches, type ListItem } from './vaultList';
import { loadPins, pinKey, prunePins, savePins, togglePin, type PrefStore } from './pins';

const mk = (id: string, over: Partial<ListItem> = {}): ListItem => ({
  id, category: 'other', title: id, notes: '', instructions: '', attachments: [], updatedAt: '2026-01-01T00:00:00Z', ...over,
});
const items: ListItem[] = [
  mk('lic', { category: 'insurance', title: 'LIC Jeevan Anand', notes: 'Green folder, top shelf', instructions: 'Call agent Ramesh', updatedAt: '2026-03-01T00:00:00Z' }),
  mk('sbi', { category: 'bank', title: 'SBI salary account', notes: 'Passbook in the second drawer', attachments: [{ name: 'Passbook.pdf' }], updatedAt: '2026-05-01T00:00:00Z' }),
  mk('mf', { category: 'investments', title: 'Mutual funds', notes: 'Groww app', updatedAt: '2026-04-01T00:00:00Z' }),
  mk('hi', { category: 'medical', title: 'बीमा कार्ड', notes: 'अलमारी में रखा है', updatedAt: '2026-02-01T00:00:00Z' }),
];
const ids = (xs: ListItem[]) => xs.map((x) => x.id);
const opts = { query: '', sort: 'recent' as const, pinned: new Set<string>(), category: 'all' as const };

test('search looks in title, notes, instructions and file names, ignoring case and spaces around the query', () => {
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'lic' })), ['lic']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'TOP SHELF' })), ['lic']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'ramesh' })), ['lic']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'passbook' })).sort(), ['sbi']); // note and file name both match, one item
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: '  groww  ' })), ['mf']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'nothing like this' })), []);
});

test('search works for Hindi text', () => {
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'अलमारी' })), ['hi']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, query: 'बीमा' })), ['hi']);
});

test('an empty query keeps everything; a drawer filter narrows it; both combine', () => {
  assert.equal(filterAndSort(items, opts).length, 4);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, category: 'bank' })), ['sbi']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, category: 'bank', query: 'lic' })), []);
});

test('sorting: recent first, title A to Z (numbers sort naturally), by drawer', () => {
  assert.deepEqual(ids(filterAndSort(items, opts)), ['sbi', 'mf', 'lic', 'hi']);
  const titles = [mk('b', { title: 'Item 10' }), mk('a', { title: 'item 2' }), mk('c', { title: 'Apple' })];
  assert.deepEqual(ids(filterAndSort(titles, { ...opts, sort: 'title' })), ['c', 'a', 'b']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, sort: 'drawer' })), ['lic', 'sbi', 'mf', 'hi']); // insurance, bank, investments, medical
});

test('pinned items come first in every sort order, and keep that order among themselves', () => {
  const pinned = new Set(['hi', 'lic']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, pinned })), ['lic', 'hi', 'sbi', 'mf']);
  assert.deepEqual(ids(filterAndSort(items, { ...opts, pinned, sort: 'title' })).slice(0, 2).sort(), ['hi', 'lic']);
});

test('items that could not be decrypted always go last, even if pinned', () => {
  const withBroken = [...items, mk('bad', { broken: true, title: '', updatedAt: '2030-01-01T00:00:00Z' })];
  assert.equal(ids(filterAndSort(withBroken, { ...opts, pinned: new Set(['bad']) })).at(-1), 'bad');
});

test('sorting does not change the original list', () => {
  const before = ids(items);
  filterAndSort(items, { ...opts, sort: 'title' });
  assert.deepEqual(ids(items), before);
});

test('matches() on its own', () => {
  assert.equal(matches(items[0], ''), true);
  assert.equal(matches(items[0], 'agent'), true);
  assert.equal(matches(items[0], 'zzz'), false);
});

test('highlight splits text around every match, and treats the query as plain text (no regex)', () => {
  assert.deepEqual(highlight('Policy and policy', 'policy'), [
    { text: 'Policy', hit: true }, { text: ' and ', hit: false }, { text: 'policy', hit: true },
  ]);
  assert.deepEqual(highlight('no match here', 'xyz'), [{ text: 'no match here', hit: false }]);
  assert.deepEqual(highlight('anything', ''), [{ text: 'anything', hit: false }]);
  assert.deepEqual(highlight('cost (a+b)* ok', '(a+b)*'), [
    { text: 'cost ', hit: false }, { text: '(a+b)*', hit: true }, { text: ' ok', hit: false },
  ]);
  assert.deepEqual(highlight('<b>x</b>', '<b>'), [{ text: '<b>', hit: true }, { text: 'x</b>', hit: false }]); // stays text
  assert.equal(highlight('अलमारी में', 'में').filter((p) => p.hit).length, 1);
  assert.equal(highlight('Ünïcode', 'ünï').map((p) => p.text).join(''), 'Ünïcode'); // text is never lost
});

test('highlight never loses or duplicates text, whatever the query', () => {
  for (const q of ['a', 'an', 'ana', 'banana', 'x', ' ']) assert.equal(highlight('banana bandana', q).map((p) => p.text).join(''), 'banana bandana');
});

// ---------------------------------------------------------------- pins
const memory = (): PrefStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

test('pins: toggle, save and load per account', () => {
  const store = memory();
  let pins = togglePin(new Set(), 'a');
  pins = togglePin(pins, 'b');
  pins = togglePin(pins, 'a'); // un-pin
  assert.deepEqual([...pins], ['b']);
  savePins(store, 'u1', pins);
  assert.deepEqual([...loadPins(store, 'u1')], ['b']);
  assert.deepEqual([...loadPins(store, 'u2')], []); // another account sees nothing
  assert.ok(store.data.has(pinKey('u1')));
});

test('pins: toggling does not mutate the old set', () => {
  const a = new Set(['x']);
  togglePin(a, 'y');
  assert.deepEqual([...a], ['x']);
});

test('pins: corrupt or wrong-shaped stored data gives an empty set instead of crashing', () => {
  const store = memory();
  for (const bad of ['{not json', '123', '"str"', '{"a":1}', 'null']) {
    store.set(pinKey('u'), bad);
    assert.deepEqual([...loadPins(store, 'u')], []);
  }
  store.set(pinKey('u'), JSON.stringify(['ok', 5, null, 'also ok']));
  assert.deepEqual([...loadPins(store, 'u')], ['ok', 'also ok']);
});

test('pins: a storage that throws is survived', () => {
  const broken: PrefStore = { get: () => { throw new Error('blocked'); }, set: () => undefined };
  assert.deepEqual([...loadPins(broken, 'u')], []);
});

test('pins: stale ids are pruned when items disappear', () => {
  assert.deepEqual([...prunePins(new Set(['a', 'b', 'c']), ['b', 'c', 'd'])].sort(), ['b', 'c']);
});
