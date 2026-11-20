import test from 'node:test';
import assert from 'node:assert/strict';
import { pageModel, foldRows } from '../lib/page.mjs';
import { builtLine, checksShort, reasonsLine } from '../lib/words.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';

const build = t => {
  const repo = bookingRepo(tempRoot(t));
  const data = sampleData(repo);
  data.built = '2026-11-11';
  data.repos[0].commit = repo.head;
  data.repos[0].uncommitted = ['api/Dock.java'];
  data.checks = { code: { blocks: 4 }, quotes: { quotes: 3, saved: 0, savedOf: [] }, map: { built: true, arrows: 2, traced: 1, guesses: 1, broken: 0, layoutChecked: true } };
  return data;
};
const model = t => pageModel(build(t));

test('model mirrors the sample', t => {
  const m = model(t);
  assert.equal(m.stops.length, 3);
  assert.equal(m.stops[1].firstFile, 'api/Dock.java:1-30');
  assert.equal(m.stops[1].more, 0);
  assert.equal(m.stops[2].more, 1);
  assert.equal(m.extend[0].where, 'api/Dock.java:5-6');
  assert.equal(m.extend[0].stopN, 2);
  assert.equal(m.mapMissing, false);
});

test('model carries the finished header text', t => {
  const data = build(t);
  const m = pageModel(data);
  assert.equal(m.title, 'Saving a booking, from the form to the dock check');
  assert.equal(m.built, builtLine(data));
  assert.match(m.built, /^Built from `booking-mini` at commit `[0-9a-f]{7}` plus uncommitted changes in 1 file on 2026-11-11$/);
  assert.deepEqual(m.uncommittedFiles, ['api/Dock.java']);
  assert.equal(m.checks, checksShort(data));
  assert.equal(m.reasons, reasonsLine(data));
  assert.equal(m.reasons, '3 recorded, 1 not recorded');
});

test('left-out row reads plainly', t => {
  const rows = model(t).stops[1].blocks[0].rows;
  const gap = rows.find(r => r.gap);
  assert.deepEqual(gap.gap, [12, 20]);
  assert.equal(gap.label, 'lines 12–20 left out');
});

test('short blocks are not folded', t => {
  const b = model(t).stops[0].blocks[0];
  assert.equal(b.folded, false);
  assert.equal(b.rows.some(r => r.fold || r.hidden), false);
});

test('long blocks fold like the mockup', t => {
  const b = model(t).stops[1].blocks[0];
  assert.equal(b.folded, true);
  assert.equal(b.total, 21);
  assert.equal(b.showAll, 'Show all 21 lines');
  const seq = b.rows.map(r => r.fold ? `fold ${r.fold}` : r.gap ? 'gap' : r.hidden ? `hidden ${r.n}` : `row ${r.n}`);
  assert.deepEqual(seq, [
    ...[1, 2, 3, 4, 5, 6].map(n => `row ${n}`), 'fold 4', ...[7, 8, 9, 10].map(n => `hidden ${n}`),
    'row 11', 'gap', 'row 21', 'fold 8', ...[22, 23, 24, 25, 26, 27, 28, 29].map(n => `hidden ${n}`), 'row 30',
  ]);
  assert.deepEqual(b.rows.filter(r => r.fold).map(f => f.label), ['⋯ 4 more lines', '⋯ 8 more lines']);
});

test('guesses never enter the Why list', t => {
  const m = model(t);
  assert.equal(m.stops[0].why.length, 1);
  assert.equal(m.stops[0].why[0].notRecorded, true);
  assert.equal(m.stops[0].guesses.length, 1);
  assert.equal(m.stops[1].why.length, 2);
  assert.deepEqual(m.stops[1].guesses, []);
  for (const s of m.stops) for (const w of s.why) assert.ok(!/^Guess/.test(w.text));
});

test('thin stops do not crash', () => {
  const m = pageModel({ journey: 'j', repos: [], stops: [{ id: 'a', name: 'A' }], checks: {} });
  assert.deepEqual(m.extend, []);
  assert.deepEqual(m.stops[0].notes, []);
  assert.equal(m.mapMissing, true);
});

test('plain words only', t => {
  assert.doesNotMatch(JSON.stringify(model(t)), /data file|scene|map_step|left_out|key_lines|not-recorded|vault-note|design-doc|build-note|pull-request|code-comment/);
});

test('model carries the words the page shows', t => {
  const m = model(t);
  const [s1, s2, s3] = m.stops;
  assert.equal(s2.kicker, 'Stop 2 of 3');
  assert.equal(s2.label, 'Stop 2 of 3 — The API checks the dock day');
  assert.equal(s2.prevLabel, '← 1. The form sends the booking');
  assert.equal(s2.nextLabel, '3. The yard service hears about it →');
  assert.deepEqual([s1.prevLabel, s3.nextLabel], ['', '']);
  assert.equal(s1.notesLabel, 'Notes on the code (1)');
  assert.deepEqual([s2.moreLabel, s3.moreLabel], ['', '+1 more']);
  assert.equal(m.outOf, 'of 3 stops');
  assert.equal(m.extend[0].link, '2. The API checks the dock day →');
  assert.deepEqual(m.stops.map(s => s.why.map(w => w.tone)), [['none'], ['comment', 'doc'], ['commit']]);
});

test('every source kind has a chip colour', () => {
  const kinds = { 'vault-note': 'doc', 'design-doc': 'doc', 'build-note': 'doc', ticket: 'doc', commit: 'commit', 'pull-request': 'commit', 'code-comment': 'comment', 'not-recorded': 'none' };
  const reasons = Object.keys(kinds).map(kind => ({ text: kind, quote: 'q', source: { kind, ref: kind === 'commit' ? { hash: 'abc1234' } : kind === 'pull-request' ? { number: 4 } : 'x' } }));
  const m = pageModel({ journey: 'j', repos: [], stops: [{ id: 'a', name: 'A', reasons }], checks: {} });
  assert.deepEqual(m.stops[0].why.map(w => w.tone), Object.values(kinds));
});

test('one stop reads in the singular', () => {
  const m = pageModel({ journey: 'j', repos: [], stops: [{ id: 'a', name: 'A', notes: ['x', 'y'] }], checks: {} });
  assert.equal(m.outOf, 'of 1 stop');
  assert.equal(m.stops[0].label, 'Stop 1 of 1 — A');
  assert.equal(m.stops[0].notesLabel, 'Notes on the code (2)');
  assert.deepEqual([m.stops[0].prevLabel, m.stops[0].nextLabel, m.stops[0].moreLabel], ['', '', '']);
});

test('the fold limit is 14 numbered lines', () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ n: i + 1, text: 'x', key: i + 1 === 8 }));
  assert.equal(foldRows(rows(14)).length, 14);
  const f = foldRows(rows(15));
  assert.ok(f.some(r => r.fold));
  assert.ok(f.length > 15);
});
