import test from 'node:test';
import assert from 'node:assert/strict';
import { noteText } from '../lib/note.mjs';
import { builtLine, outlineTail } from '../lib/words.mjs';
import { EMBED_HEIGHT } from '../lib/settings.mjs';
import { tempRoot, bookingRepo, sampleData } from './helpers.mjs';

const NAMES = { page: 'booking-flow.html', data: 'booking-flow.walkthrough.json', note: 'Walkthrough - booking flow.md', earlier: null, replace: false };

const built = (t, change = d => d) => {
  const repo = bookingRepo(tempRoot(t));
  const data = sampleData(repo);
  data.built = '2026-11-11';
  data.repos[0].commit = repo.head;
  data.repos[0].uncommitted = ['api/Dock.java'];
  data.checks = { code: { blocks: 4 }, quotes: { quotes: 3, saved: 0, savedOf: { ticket: [], 'pull-request': [] } }, map: { built: false } };
  change(data);
  return { data, repo };
};

test('frontmatter matches the schema', t => {
  const { data, repo } = built(t);
  const text = noteText(data, NAMES);
  const head = text.slice(0, text.indexOf('\n---\n', 4) + 5);
  assert.equal(head, `---
type: code-walkthrough
client: acme
created: 2026-11-11
repos:
  - "[[booking-mini]]"
commits:
  - "booking-mini@${repo.head}"
uncommitted:
  - "booking-mini: api/Dock.java"
journey: "Saving a booking, from the form to the dock check"
stops: 3
reasons_recorded: 3
reasons_not_recorded: 1
---
`);
});

test('uncommitted and jira are left out when empty, jira is a block list when present', t => {
  const { data } = built(t, d => { d.repos[0].uncommitted = []; });
  const text = noteText(data, NAMES);
  assert.doesNotMatch(text, /^uncommitted:/m);
  assert.doesNotMatch(text, /^jira:/m);
  const { data: withJira } = built(t, d => { d.jira = ['PFD-1', 'PFD-2']; });
  assert.match(noteText(withJira, NAMES), /reasons_not_recorded: 1\njira:\n  - PFD-1\n  - PFD-2\n---\n/);
});

test('body, outcome 1', t => {
  const { data } = built(t);
  const text = noteText(data, NAMES);
  const body = text.slice(text.indexOf('\n---\n', 4) + 5);
  const lines = body.split('\n');
  assert.deepEqual(lines.slice(0, 11), [
    '',
    '# Saving a booking, from the form to the dock check',
    '',
    data.summary,
    '',
    builtLine(data) + ' (`api/Dock.java`). The code may have changed since.',
    '',
    `![[booking-flow.html|height: ${EMBED_HEIGHT}px]]`,
    '',
    'Not showing, or too small? Open [[booking-flow.html]], or use the "open in external browser" button on the page above.',
    '',
  ]);
});

test('no uncommitted files: the built line has no file list', t => {
  const { data } = built(t, d => { d.repos[0].uncommitted = []; });
  assert.match(noteText(data, NAMES), new RegExp(`${builtLine(data)}\\. The code may have changed since\\.\\n`));
});

test('body, outcome 2', t => {
  const { data } = built(t);
  const link = noteText(data, NAMES, { outcome: 2, openLink: 'wikilink' }).split('\n');
  const i = link.indexOf('# Saving a booking, from the form to the dock check');
  assert.equal(link[i + 2], 'Open [[booking-flow.html]] in your browser to read this walkthrough.');
  assert.ok(link.includes(`![[booking-flow.html|height: ${EMBED_HEIGHT}px]]`));
  const button = noteText(data, NAMES, { outcome: 2, openLink: 'button' }).split('\n');
  assert.equal(button[i + 2], 'Use the "open in external browser" button on the page below to read this walkthrough.');
  assert.ok(button.includes(`![[booking-flow.html|height: ${EMBED_HEIGHT}px]]`));
  const fallback = 'Not showing, or too small? Open [[booking-flow.html]], or use the "open in external browser" button on the page above.';
  assert.ok(link.includes(fallback) && button.includes(fallback));
  for (const lines of [link, button]) assert.ok(lines.indexOf(fallback) > lines.indexOf(`![[booking-flow.html|height: ${EMBED_HEIGHT}px]]`));
});

test('stops outline', t => {
  const text = noteText(built(t).data, NAMES);
  assert.match(text, /\n## Stops\n\n1\. \*\*The form sends the booking\*\* · `web\/form\.ts:1-12` · Collects the fields and posts them\. Nothing recorded\.\n/);
  assert.equal(outlineTail({ reasons: [{ source: { kind: 'commit' } }, { source: { kind: 'not-recorded' } }] }), '1 reason not recorded.');
  assert.match(text, /\n2\. \*\*The API checks the dock day\*\* · `api\/Dock\.java:1-30` · Rejects days the dock is closed\. Reasons recorded\.\n/);
  assert.match(text, /\n3\. \*\*The yard service hears about it\*\* · `api\/Dock\.java:25-30` \(\+1 more\) · The API passes the booking on\. Reasons recorded\.\n/);
});

test('where to extend', t => {
  const text = noteText(built(t).data, NAMES);
  assert.match(text, /\n## Where to extend\n\n- `api\/Dock\.java:5-6` \(stop 2\): Add a new closed day here\.\n/);
  const { data } = built(t, d => { d.extend = []; });
  assert.doesNotMatch(noteText(data, NAMES), /Where to extend/);
});

test('earlier link', t => {
  const text = noteText(built(t).data, { ...NAMES, earlier: 'Walkthrough - booking flow' });
  assert.match(text, /on the page above\.\n\nEarlier walkthrough of this journey: \[\[Walkthrough - booking flow\]\]\.\n/);
  assert.doesNotMatch(noteText(built(t).data, NAMES), /Earlier walkthrough/);
});
