import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadData, shapeErrors } from '../lib/data.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';

const fresh = t => { const repo = bookingRepo(tempRoot(t)); return sampleData(repo); };
const one = (d, id, text) => {
  const e = shapeErrors(d);
  assert.equal(e.length, 1, JSON.stringify(e));
  assert.ok(e[0].includes(id), e[0]);
  if (text) assert.ok(e[0].includes(text), e[0]);
};

test('sample data has no shape errors', t => assert.deepEqual(shapeErrors(fresh(t)), []));
test('a stop with no Why entry', t => { const d = fresh(t); d.stops[1].reasons = []; one(d, 's2', 'no Why entry'); });
test('a recorded reason without a quote', t => { const d = fresh(t); delete d.stops[2].reasons[0].quote; one(d, 's3', 'needs a quote'); });
test('a recorded reason without a source', t => { const d = fresh(t); delete d.stops[2].reasons[0].source; one(d, 's3', 'needs a source'); });
test('a not-recorded entry that is not a question', t => { const d = fresh(t); d.stops[0].reasons[0].text = 'Nobody wrote this down.'; one(d, 's1', 'question'); });
test('a not-recorded entry with a quote', t => { const d = fresh(t); d.stops[0].reasons[0].quote = 'something'; one(d, 's1', 'quote'); });
test('a guess in the Why list', t => { const d = fresh(t); d.stops[2].reasons[0].text = 'GUESS: it was easy.'; one(d, 's3', 'guess'); });
test('a stop with no map step', t => { const d = fresh(t); delete d.stops[1].map_step; one(d, 's2', 'map step'); });
test('an unknown source kind', t => { const d = fresh(t); d.stops[1].reasons[0].source.kind = 'rumour'; one(d, 's2', 'rumour'); });
test('two stops with the same id', t => { const d = fresh(t); d.stops[2].id = 's1'; one(d, 's1', 'twice'); });
test('an extend point naming no stop', t => { const d = fresh(t); d.extend[0].stop = 's9'; one(d, 's9'); });

test('two repos and a block without repo', t => {
  const d = fresh(t);
  d.repos.push({ name: 'second', path: '/nowhere' });
  const name = d.repos[0].name;
  for (const s of d.stops) {
    for (const b of s.code) b.repo = name;
    for (const r of s.reasons) if (r.source.ref && typeof r.source.ref === 'object') r.source.ref.repo = name;
  }
  d.extend[0].repo = name;
  assert.deepEqual(shapeErrors(d), []);
  delete d.stops[0].code[0].repo;
  one(d, 's1', 'needs a repo');
});

test('bad JSON is an error, not a throw', t => {
  const f = path.join(tempRoot(t), 'bad.json');
  fs.writeFileSync(f, '{');
  const r = loadData(f);
  assert.ok(r.error.includes('not valid JSON'), r.error);
});

test('format 2 is refused', t => {
  const f = path.join(tempRoot(t), 'two.json');
  fs.writeFileSync(f, JSON.stringify({ format: 2 }));
  assert.ok(loadData(f).error.includes('format 2'));
});

for (const [name, mutate, text] of [
  ['missing text', b => { delete b.text; }, 'no text'],
  ['missing lines', b => { delete b.lines; }, 'lines'],
  ['missing file', b => { delete b.file; }, 'file name'],
  ['reversed range', b => { b.lines = [3, 1]; }, 'lines'],
  ['zero-based range', b => { b.lines = [0, 2]; }, 'lines'],
]) {
  test(`malformed block: ${name}`, t => { const d = fresh(t); mutate(d.stops[0].code[0]); one(d, 's1', text); });
}

test('malformed extend point', t => { const d = fresh(t); d.extend[0].lines = [0, 2]; one(d, 'extend point 1', 'lines'); });
