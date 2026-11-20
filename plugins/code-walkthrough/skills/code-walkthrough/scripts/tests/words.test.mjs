import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkQuotes } from '../lib/quotes.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';
import { reasonCounts, builtLine, checksShort, reasonsLine, replyLines, questionLines, stopBadge, outlineTail, whyLabel, chipLabel, chipDetail } from '../lib/words.mjs';

const mk = (over = {}) => ({
  built: '2026-11-11',
  repos: [{ name: 'booking-mini', commit: 'abc1234', uncommitted: [] }],
  stops: [],
  sources: [],
  checks: { code: { blocks: 31 }, quotes: { quotes: 22, saved: 0, savedOf: { ticket: [], 'pull-request': [] } }, map: { built: true, arrows: 15, traced: 12, guesses: 3, broken: 0, layoutChecked: true } },
  ...over,
});
const withReasons = (n, gaps) => ({ reasons: Array.from({ length: n }, (_, i) => ({ text: 'x', source: { kind: i < gaps ? 'not-recorded' : 'commit', ref: { hash: 'abcdef123' } } })) });
const quotes = (q) => mk({ checks: { ...mk().checks, quotes: { quotes: 22, ...q } } });

test('built line', () => {
  assert.equal(builtLine(mk()), 'Built from `booking-mini` at commit `abc1234` on 2026-11-11');
  const dirty = n => mk({ repos: [{ name: 'booking-mini', commit: 'abc1234', uncommitted: Array.from({ length: n }, (_, i) => `f${i}`) }] });
  assert.equal(builtLine(dirty(1)), 'Built from `booking-mini` at commit `abc1234` plus uncommitted changes in 1 file on 2026-11-11');
  assert.equal(builtLine(dirty(3)), 'Built from `booking-mini` at commit `abc1234` plus uncommitted changes in 3 files on 2026-11-11');
  assert.equal(builtLine(mk({ repos: [{ name: 'a', commit: '1111111', uncommitted: ['x'] }, { name: 'b', commit: '2222222', uncommitted: [] }] })),
    'Built from `a` at commit `1111111` and `b` at commit `2222222` plus uncommitted changes in 1 file on 2026-11-11');
});

test('reply lines', () => {
  const d = mk({ repos: [{ name: 'r', commit: '3f2a9c1', uncommitted: ['x'] }] });
  const l = replyLines({ ...d, checks: { ...d.checks, quotes: { quotes: 22, saved: 2, savedOf: { ticket: ['PFD-1'], 'pull-request': [] } } } });
  assert.deepEqual(l, [
    'Code: all 31 blocks match the files as built (commit `3f2a9c1` plus uncommitted changes in 1 file).',
    'Reasons: all 22 quotes were found word for word in their sources (2 in saved copies of a ticket).',
    'Map: 12 of 15 arrows are traced to a line of code. 3 are marked as guesses. None are broken.',
  ]);
  const reasons = q => replyLines(quotes(q))[1];
  assert.equal(reasons({ saved: 3, savedOf: { ticket: ['A-1', 'B-2'], 'pull-request': [] } }), 'Reasons: all 22 quotes were found word for word in their sources (3 in saved copies of 2 tickets).');
  assert.equal(reasons({ saved: 1, savedOf: { ticket: [], 'pull-request': ['#412'] } }), 'Reasons: all 22 quotes were found word for word in their sources (1 in a saved copy of a pull request).');
  assert.equal(reasons({ saved: 2, savedOf: { ticket: ['A-1'], 'pull-request': ['r#4'] } }), 'Reasons: all 22 quotes were found word for word in their sources (2 in saved copies of tickets and pull requests).');
  assert.equal(reasons({ saved: 0, savedOf: { ticket: [], 'pull-request': [] } }), 'Reasons: all 22 quotes were found word for word in their sources.');
  const map = m => replyLines(mk({ checks: { ...mk().checks, map: { built: true, arrows: 15, traced: 12, guesses: 3, broken: 0, layoutChecked: true, ...m } } }))[2];
  assert.equal(map({ guesses: 1 }), 'Map: 12 of 15 arrows are traced to a line of code. 1 is marked as a guess. None are broken.');
  assert.equal(map({ guesses: 0 }), 'Map: 12 of 15 arrows are traced to a line of code. None are marked as guesses. None are broken.');
});

test('map not built and not checked by eye', () => {
  const nb = replyLines(mk({ checks: { ...mk().checks, map: { built: false } } }));
  assert.equal(nb.length, 3);
  assert.equal(nb[2], 'Map: not built, because chalk-talk is not installed. Get it from github.com/oztrkemree/chalk-talk and put it in ~/.claude/skills/chalk-talk.');
  const un = replyLines(mk({ checks: { ...mk().checks, map: { ...mk().checks.map, layoutChecked: false } } }));
  assert.equal(un.length, 4);
  assert.equal(un[3], 'Map: not checked by eye, because Chrome was not found.');
});

test('a map the command left out, while chalk-talk is installed, says so', () => {
  const left = mk({ checks: { ...mk().checks, map: { built: false, leftOut: true } } });
  assert.deepEqual(replyLines(left).slice(2), ['Map: left out by the command.']);
  assert.equal(checksShort(left), 'Code matches the files · 22 quotes found · Map left out by the command');
});

// A build where chalk-talk was missing stores only { built: false }, as every older data file does.
test('a map not built, with nothing saying it was left out, keeps the not-installed lines', () => {
  const old = mk({ checks: { ...mk().checks, map: { built: false } } });
  assert.deepEqual(replyLines(old).slice(2), ['Map: not built, because chalk-talk is not installed. Get it from github.com/oztrkemree/chalk-talk and put it in ~/.claude/skills/chalk-talk.']);
  assert.equal(checksShort(old), 'Code matches the files · 22 quotes found · Map not built, because chalk-talk is not installed');
});

test('not-recorded questions are numbered across the walkthrough, in stop order, one per line', () => {
  const gap = text => ({ text, source: { kind: 'not-recorded' } });
  const rec = { text: 'x', quote: 'x', source: { kind: 'commit', ref: { hash: 'abcdef1' } } };
  const data = { stops: [{ reasons: [rec, gap('Why does the form retry twice?')] }, { reasons: [rec] }, { reasons: [gap('Why does the API send it on at once?'), gap('Why is the limit\n500?')] }] };
  assert.deepEqual(questionLines(data), ['1. Why does the form retry twice?', '2. Why does the API send it on at once?', '3. Why is the limit 500?']);
  assert.equal(questionLines(data).length, reasonCounts(data).notRecorded);
  assert.deepEqual(questionLines({ stops: [{ reasons: [rec] }] }), []);
  assert.deepEqual(questionLines({}), []);
});

test('header line', () => {
  assert.equal(checksShort(quotes({ saved: 2, savedOf: { ticket: ['A-1'], 'pull-request': [] } })), 'Code matches the files · 22 quotes found (2 in saved copies) · 12 of 15 map arrows traced, 3 guesses');
  assert.equal(checksShort(mk({ checks: { ...mk().checks, map: { built: false } } })), 'Code matches the files · 22 quotes found · Map not built, because chalk-talk is not installed');
});

test('reasons line', () => {
  const d = mk({ stops: [withReasons(3, 1), withReasons(2, 0)] });
  assert.deepEqual(reasonCounts(d), { recorded: 4, notRecorded: 1 });
  assert.equal(reasonsLine(mk({ stops: Array.from({ length: 11 }, () => withReasons(3, 1)) })), '22 recorded, 11 not recorded');
});

test('stop badge and outline tail', () => {
  assert.deepEqual([stopBadge(withReasons(3, 0)), outlineTail(withReasons(3, 0))], ['', 'Reasons recorded.']);
  assert.deepEqual([stopBadge(withReasons(3, 1)), outlineTail(withReasons(3, 1))], ['1 not recorded', '1 reason not recorded.']);
  assert.equal(outlineTail(withReasons(3, 2)), '2 reasons not recorded.');
  assert.deepEqual([stopBadge(withReasons(3, 3)), outlineTail(withReasons(3, 3))], ['nothing recorded', 'Nothing recorded.']);
});

test('why label', () => {
  assert.equal(whyLabel(withReasons(3, 1)), 'Why 3 · 1 not recorded');
  assert.equal(whyLabel(withReasons(3, 0)), 'Why 3');
});

test('chip labels', () => {
  const l = (kind, ref) => chipLabel({ kind, ref });
  assert.equal(l('vault-note', 'Notes/a.md'), 'vault note');
  assert.equal(l('design-doc', { path: 'x' }), 'design doc');
  assert.equal(l('commit', { hash: '545220f9abc' }), 'commit 545220f');
  assert.equal(l('pull-request', { number: 412 }), 'pull request #412');
  assert.equal(l('ticket', 'PFD-1'), 'ticket PFD-1');
  assert.equal(l('code-comment', { file: 'a', line: 1 }), 'code comment');
  assert.equal(l('build-note'), 'build note');
  assert.equal(l('not-recorded'), 'not recorded');
});

test('chip detail is the exact quote and where it comes from', () => {
  const q = 'every booking must reach the yard service';
  const d = mk({ sources: [{ kind: 'ticket', ref: 'PFD-1', fetched: '2026-11-11', text: q }] });
  d.checks.quotes.savedOf = { ticket: ['PFD-1'], 'pull-request': [] };
  assert.equal(chipDetail({ quote: q, source: { kind: 'commit', ref: { hash: '545220f1' } } }, d), `“${q}” — commit 545220f`);
  assert.equal(chipDetail({ quote: q, source: { kind: 'ticket', ref: 'PFD-1' } }, d), `“${q}” — ticket PFD-1, saved copy fetched 2026-11-11`);
  assert.equal(chipDetail({ quote: q, source: { kind: 'ticket', ref: 'PFD-2' } }, d), `“${q}” — ticket PFD-2`);
  assert.equal(chipDetail({ quote: q, source: { kind: 'code-comment', ref: { file: 'api/Dock.java', line: 5 } } }, d), `“${q}” — code comment, api/Dock.java:5`);
});

test('a saved copy is claimed only when the check used it', () => {
  const q = 'a quote';
  const copies = [{ kind: 'ticket', ref: 'PFD-1', fetched: '2026-11-11', text: q }, { kind: 'pull-request', ref: { number: 412 }, fetched: '2026-11-10', text: q }];
  const used = mk({ sources: copies });
  used.checks.quotes.savedOf = { ticket: [], 'pull-request': ['#412'] };
  assert.equal(chipDetail({ quote: q, source: { kind: 'ticket', ref: 'PFD-1' } }, used), `“${q}” — ticket PFD-1`);
  assert.equal(chipDetail({ quote: q, source: { kind: 'pull-request', ref: { number: 412 } } }, used), `“${q}” — pull request #412, saved copy fetched 2026-11-10`);
  const none = mk({ sources: copies });
  delete none.checks.quotes.savedOf;
  assert.equal(chipDetail({ quote: q, source: { kind: 'ticket', ref: 'PFD-1' } }, none), `“${q}” — ticket PFD-1`);
  assert.doesNotThrow(() => replyLines(none));
  assert.doesNotThrow(() => checksShort(none));
});

test('build note detail names the file only', () => {
  assert.equal(chipDetail({ quote: 'x', source: { kind: 'build-note', ref: '/a/b/task-4-report.md' } }, mk()), '“x” — build note, task-4-report.md');
});

test('singular and zero forms', () => {
  const one = (q, over = {}) => mk({ checks: { ...mk().checks, code: { blocks: over.blocks ?? 31 }, quotes: { quotes: q, saved: 0, savedOf: { ticket: [], 'pull-request': [] }, ...(over.quotes || {}) }, map: { ...mk().checks.map, ...(over.map || {}) } } });
  assert.match(replyLines(one(22, { blocks: 1 }))[0], /^Code: the 1 block matches the file as built \(/);
  assert.equal(replyLines(one(1))[1], 'Reasons: the 1 quote was found word for word in its source.');
  assert.equal(replyLines(one(1, { quotes: { saved: 1, savedOf: { ticket: ['A-1'], 'pull-request': [] } } }))[1], 'Reasons: the 1 quote was found word for word in its source (in a saved copy of a ticket).');
  assert.equal(replyLines(one(1, { quotes: { saved: 1, savedOf: { ticket: [], 'pull-request': ['#4'] } } }))[1], 'Reasons: the 1 quote was found word for word in its source (in a saved copy of a pull request).');
  assert.equal(replyLines(one(0))[1], 'Reasons: no reasons are recorded, so there are no quotes to check.');
  assert.equal(replyLines(one(22, { map: { arrows: 1, traced: 1, guesses: 0, broken: 0 } }))[2], 'Map: the 1 arrow is traced to a line of code. It is not marked as a guess. It is not broken.');
  assert.equal(replyLines(one(22, { map: { arrows: 1, traced: 0, guesses: 1, broken: 1 } }))[2], 'Map: 0 of 1 arrow is traced to a line of code. It is marked as a guess. It is broken.');
  assert.equal(replyLines(one(22, { map: { arrows: 0, traced: 0, guesses: 0, broken: 0 } }))[2], 'Map: there are no arrows to trace.');
  assert.equal(checksShort(one(1)), 'Code matches the files · 1 quote found · 12 of 15 map arrows traced, 3 guesses');
  assert.equal(checksShort(one(0)), 'Code matches the files · no quotes to check · 12 of 15 map arrows traced, 3 guesses');
  assert.equal(checksShort(one(22, { quotes: { saved: 1, savedOf: { ticket: ['A-1'], 'pull-request': [] } } })), 'Code matches the files · 22 quotes found (1 in a saved copy) · 12 of 15 map arrows traced, 3 guesses');
});

test('what checkQuotes writes feeds the words unchanged', t => {
  const repo = bookingRepo(tempRoot(t));
  const data = sampleData(repo);
  const quote = 'Retries stay at two.';
  data.stops[0].reasons.push({ text: 'Retries stay at two.', quote, source: { kind: 'ticket', ref: 'PFD-1' } });
  data.sources = [{ kind: 'ticket', ref: 'PFD-1', fetched: '2026-11-11', text: `Note: ${quote}` }];
  const vault = tempRoot(t);
  const result = checkQuotes(data, { vault });
  assert.deepEqual(result.failures, []);
  assert.equal(result.saved, 1);
  const { failures, ...q } = result;
  data.built = '2026-11-11';
  data.repos[0].commit = repo.head;
  data.checks = { code: { blocks: 4 }, quotes: q, map: { built: false } };
  assert.match(replyLines(data)[1], /\(1 in a saved copy of a ticket\)\.$/);
  assert.match(checksShort(data), /\(1 in a saved copy\)/);
  assert.equal(chipDetail(data.stops[0].reasons[1], data), `“${quote}” — ticket PFD-1, saved copy fetched 2026-11-11`);
});
