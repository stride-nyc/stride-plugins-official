import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkCode, codeRows, splitLines, expectedText } from '../lib/code.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';

const setup = t => { const repo = bookingRepo(tempRoot(t)); return { repo, d: sampleData(repo) }; };
const s2 = d => d.stops[1].code[0];

test('sample blocks match', t => {
  const { d } = setup(t);
  const r = checkCode(d);
  assert.deepEqual(r.failures, []);
  assert.equal(r.blocks, 4);
});

test('tabs and trailing spaces must match exactly', t => {
  const { d } = setup(t);
  s2(d).text = s2(d).text.replace('\t', '    ');
  const r = checkCode(d);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].where, 's2 api/Dock.java:1-30');
  const d2 = setup(t).d;
  s2(d2).text = s2(d2).text.replace('spaced = 9;  ', 'spaced = 9;');
  assert.equal(checkCode(d2).failures.length, 1);
});

test('crlf, cr and no-final-newline files match', t => {
  const { repo, d } = setup(t);
  const file = path.join(repo.path, 'web/form.ts');
  const plain = fs.readFileSync(file, 'utf8');
  for (const variant of [plain.replace(/\n/g, '\r\n'), plain.replace(/\n/g, '\r'), plain.replace(/\n$/, '')]) {
    fs.writeFileSync(file, variant);
    assert.deepEqual(checkCode(d).failures, []);
  }
  assert.deepEqual(splitLines('a\n\n'), ['a', '']);
  assert.deepEqual(splitLines('a\r\nb'), ['a', 'b']);
});

test('left-out lines must be declared', t => {
  const { d } = setup(t);
  s2(d).left_out = [];
  assert.equal(checkCode(d).failures.length, 1);
  s2(d).left_out = [[12, 20]];
  assert.deepEqual(checkCode(d).failures, []);
});

test('key lines and left-out ranges sit inside the range', t => {
  const { d } = setup(t);
  s2(d).key_lines = [31];
  let r = checkCode(d);
  assert.equal(r.failures.length, 1);
  assert.ok(r.failures[0].why.includes('line 31 is outside 1-30'), r.failures[0].why);
  s2(d).key_lines = [5];
  s2(d).left_out = [[25, 35]];
  r = checkCode(d);
  assert.equal(r.failures.length, 1);
  assert.ok(r.failures[0].why.includes('outside 1-30'));
});

test('range past the end fails that stop', t => {
  const { d } = setup(t);
  s2(d).lines = [25, 40];
  const r = checkCode(d);
  assert.equal(r.failures.length, 1);
  assert.ok(r.failures[0].why.includes('the file has 30 lines'), r.failures[0].why);
});

test('deleted file fails that stop', t => {
  const { repo, d } = setup(t);
  fs.rmSync(path.join(repo.path, 'api/Dock.java'));
  const r = checkCode(d);
  assert.ok(r.failures.length >= 1);
  assert.ok(r.failures.every(f => f.why.includes('the file is gone')));
  assert.ok(r.failures.some(f => f.where.startsWith('s2 ')));
});

test('a block or extend point git names differently fails, unread', t => {
  const { d } = setup(t);
  const read = [];
  const readFile = (f, enc) => { read.push(path.basename(f)); return fs.readFileSync(f, enc); };
  const r = checkCode(d, { readFile, misnamed: (repo, file) => repo === 'booking-mini' && file === 'api/Dock.java' });
  const why = 'git names this file differently; use the path as git names it, copied from git ls-files. If the file is in a repo inside this one, such as a submodule, list that repo as its own repos entry';
  assert.deepEqual(r.failures, [
    { where: 's2 api/Dock.java:1-30', why }, { where: 's3 api/Dock.java:25-30', why }, { where: 'extend 1', why }]);
  assert.deepEqual(read, ['form.ts', 'form.ts']);
});

test('extend point lines must exist', t => {
  const { d } = setup(t);
  d.extend[0].lines = [29, 31];
  const r = checkCode(d);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].where, 'extend 1');
});

test('expectedText skips left-out lines', () => {
  assert.deepEqual(expectedText('a\nb\nc\nd\n', [1, 4], [[2, 3]]), { text: 'a\nd' });
  assert.deepEqual(expectedText(null, [1, 1], []), { error: 'the file is gone' });
});

test('codeRows rebuilds real numbers', t => {
  const { d } = setup(t);
  const rows = codeRows(s2(d));
  assert.equal(rows[0].n, 1);
  const g = rows.findIndex(r => r.gap);
  assert.deepEqual(rows[g].gap, [12, 20]);
  assert.equal(rows[g - 1].n, 11);
  assert.equal(rows[g + 1].n, 21);
  assert.equal(rows.at(-1).n, 30);
  assert.deepEqual(rows.filter(r => r.key).map(r => r.n), [5]);
  assert.equal(rows[2].text, '\tint indented = 3;');
});

for (const [name, mutate] of [
  ['missing text', b => { delete b.text; }],
  ['missing lines', b => { delete b.lines; }],
  ['missing file', b => { delete b.file; }],
  ['reversed range', b => { b.lines = [3, 1]; b.text = ''; }],
  ['zero-based range', b => { b.lines = [0, 2]; b.text = '\nl1\nl2'; }],
]) {
  test(`malformed block does not throw: ${name}`, t => {
    const { d } = setup(t);
    mutate(d.stops[0].code[0]);
    const r = checkCode(d);
    assert.equal(r.failures.length, 1);
    assert.ok(r.failures[0].where.startsWith('s1'), r.failures[0].where);
  });
}

test('malformed extend point and unknown repo do not throw', t => {
  const { d } = setup(t);
  d.extend[0].lines = [0, 2];
  d.stops[1].code[0].repo = 'nope';
  const r = checkCode(d);
  assert.equal(r.failures.length, 2);
});

test('codeRows splits text the way the check does', t => {
  const { d } = setup(t);
  const b = d.stops[0].code[0];
  b.lines = [1, 3]; b.key_lines = [2];
  for (const text of ['x\r\ny\r\nz', 'x\ry\rz']) {
    b.text = text;
    const rows = codeRows(b);
    assert.deepEqual(rows.map(r => r.text), ['x', 'y', 'z']);
    assert.deepEqual(rows.filter(r => r.key).map(r => r.n), [2]);
  }
});
