import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { slugOf, noteBaseOf, chooseNames } from '../lib/names.mjs';
import { noteText } from '../lib/note.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';

const BAD = /[*"\\/<>:|?#^\[\]]/;

test('slugs', () => {
  assert.equal(slugOf('booking an appointment'), 'booking-an-appointment');
  assert.equal(slugOf('Save/Cancel: dock #4 | yard'), 'save-cancel-dock-4-yard');
  assert.equal(slugOf('Café déjà vu'), 'cafe-deja-vu');
  const jp = slugOf('日本語');
  assert.match(jp, /^walkthrough-[0-9a-f]{6}$/);
  assert.equal(slugOf('日本語'), jp);
  assert.ok(slugOf('word '.repeat(40)).length <= 60);
  assert.ok(!slugOf('word '.repeat(40)).endsWith('-'));
});

test('awkward journey names', t => {
  const short = 'Save/Cancel: dock #4 | yard [beta] "x"';
  const journey = 'Save/Cancel: dock #4 | yard [beta] "x" — and a: colon';
  assert.equal(noteBaseOf(short), 'Walkthrough - Save Cancel dock 4 yard beta x');
  const data = sampleData(bookingRepo(tempRoot(t)));
  data.short_name = short;
  data.journey = journey;
  data.built = '2026-11-11';
  data.repos[0].commit = 'abc1234';
  data.checks = { code: { blocks: 4 }, quotes: { quotes: 3, saved: 0, savedOf: { ticket: [], 'pull-request': [] } }, map: { built: false } };
  const dir = path.join(tempRoot(t), 'none');
  const names = chooseNames({ folderPath: dir, slug: slugOf(short), noteBase: noteBaseOf(short), date: '2026-11-11' });
  for (const n of [names.page, names.data, names.note]) assert.ok(!BAD.test(n.replace(/\.[a-z.]+$/, '')), n);
  const text = noteText(data, { ...names, earlier: 'Walkthrough - Save Cancel dock 4 yard beta x 2026-11-10' });
  const line = text.split('\n').find(l => l.startsWith('journey:'));
  assert.equal(JSON.parse(line.slice('journey:'.length).trim()), journey);
  const ok = new Set([names.page, names.note.replace(/\.md$/, ''), 'Walkthrough - Save Cancel dock 4 yard beta x 2026-11-10']);
  const links = [...text.matchAll(/\[\[([^\]|]+)[\]|]/g)].map(m => m[1]).filter(l => l !== 'booking-mini');
  assert.ok(links.length >= 2);
  for (const l of links) assert.ok(ok.has(l), l);
});

const note = (dir, name, created) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `---\ntype: code-walkthrough\ncreated: ${created}\n---\n\n# x\n`);
};
const ask = (dir, extra = {}) => chooseNames({ folderPath: dir, slug: 'booking-flow', noteBase: 'Walkthrough - booking flow', date: '2026-11-11', ...extra });

test('fresh folder', t => {
  const root = tempRoot(t);
  const base = { page: 'booking-flow.html', data: 'booking-flow.walkthrough.json', note: 'Walkthrough - booking flow.md', earlier: null, replace: false };
  assert.deepEqual(ask(path.join(root, 'missing')), base);
  fs.mkdirSync(path.join(root, 'empty'));
  assert.deepEqual(ask(path.join(root, 'empty')), base);
});

test('rebuild on a later day', t => {
  const dir = path.join(tempRoot(t), 'W');
  note(dir, 'Walkthrough - booking flow.md', '2026-11-10');
  assert.deepEqual(ask(dir), {
    page: 'booking-flow-2026-11-11.html', data: 'booking-flow-2026-11-11.walkthrough.json',
    note: 'Walkthrough - booking flow 2026-11-11.md', earlier: 'Walkthrough - booking flow', replace: false,
  });
});

test('names already on disk are never reused', t => {
  const dir = path.join(tempRoot(t), 'W');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'booking-flow.html'), 'x');
  const n = ask(dir);
  assert.notEqual(n.page, 'booking-flow.html');
  assert.equal(n.earlier, null);
});

test('same-day rebuild stops and asks', t => {
  const dir = path.join(tempRoot(t), 'W');
  note(dir, 'Walkthrough - booking flow.md', '2026-11-11');
  assert.deepEqual(ask(dir), { clash: ['booking-flow.html', 'booking-flow.walkthrough.json', 'Walkthrough - booking flow.md'] });
  const keep = ask(dir, { sameDay: 'keep' });
  assert.deepEqual(keep, {
    page: 'booking-flow-2026-11-11.html', data: 'booking-flow-2026-11-11.walkthrough.json',
    note: 'Walkthrough - booking flow 2026-11-11.md', earlier: 'Walkthrough - booking flow', replace: false,
  });
  note(dir, keep.note, '2026-11-11');
  assert.deepEqual(ask(dir), { clash: [keep.page, keep.data, keep.note] });
  const again = ask(dir, { sameDay: 'keep' });
  assert.deepEqual(again, {
    page: 'booking-flow-2026-11-11-2.html', data: 'booking-flow-2026-11-11-2.walkthrough.json',
    note: 'Walkthrough - booking flow 2026-11-11 (2).md', earlier: 'Walkthrough - booking flow 2026-11-11', replace: false,
  });
  const rep = ask(dir, { sameDay: 'replace' });
  assert.deepEqual(rep, { page: keep.page, data: keep.data, note: keep.note, earlier: 'Walkthrough - booking flow', replace: true });
});

test('replace on the first note of the day keeps its names', t => {
  const dir = path.join(tempRoot(t), 'W');
  note(dir, 'Walkthrough - booking flow.md', '2026-11-11');
  assert.deepEqual(ask(dir, { sameDay: 'replace' }), {
    page: 'booking-flow.html', data: 'booking-flow.walkthrough.json', note: 'Walkthrough - booking flow.md', earlier: null, replace: true,
  });
});
