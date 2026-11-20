import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chalkTalkAt, sceneFor, buildMap } from '../lib/map.mjs';
import { tempRoot, bookingRepo, sampleData, repoSnapshot, chalkDir } from './helpers.mjs';

const setup = t => { const root = tempRoot(t); const repo = bookingRepo(root); return { root, repo, d: sampleData(repo) }; };

test('one step per stop, titled by the stop', t => {
  const { d } = setup(t);
  d.stops[0].map_step.say = 'words the stop card already carries';
  const steps = sceneFor(d).steps;
  assert.equal(steps.length, 3);
  steps.forEach((s, i) => assert.equal(s.title, d.stops[i].name));
  assert.ok(steps.every(s => s.say === ''));
  assert.deepEqual(steps[0], { flow: ['e1'], focus: ['form'], title: 'The form sends the booking', say: '' });
  d.stops[1].map_step.title = 'Dock day';
  assert.equal(sceneFor(d).steps[1].title, 'Dock day');
});

test('studio unless the data says otherwise', t => {
  const { d } = setup(t);
  delete d.map.style;
  assert.equal(sceneFor(d).style, 'studio');
  d.map.style = 'iso';
  assert.equal(sceneFor(d).style, 'iso');
});

test('one repo: root is the repo and nodes are copied unchanged', t => {
  const { repo, d } = setup(t);
  const s = sceneFor(d);
  assert.equal(s.root, repo.path);
  assert.deepEqual(s.nodes, d.map.nodes);
  assert.deepEqual(s.edges, d.map.edges);
  assert.deepEqual(s.groups, d.map.groups);
  assert.equal(s.title, d.journey);
  assert.equal(s.lang, 'en');
  assert.equal(s.proof, true);
});

test('two repos: one root, paths rewritten', t => {
  const root = tempRoot(t);
  const two = {
    format: 1, journey: 'Across two repos', stops: [],
    repos: [{ name: 'a', path: path.join(root, 'a') }, { name: 'b', path: path.join(root, 'b') }],
    map: {
      nodes: [
        { id: 'x', label: 'X', at: [0, 0], code: { repo: 'b', file: 'x.js', lines: [1, 3] } },
        { id: 'y', label: 'Y', at: [1, 0], code: { repo: 'a', file: 'src/y.js', lines: [2, 9], mark: [4, 4] } },
      ],
      edges: [], groups: [],
    },
  };
  const s = sceneFor(two);
  assert.equal(s.root, root);
  assert.deepEqual(s.nodes[0].code, { file: 'b/x.js', lines: [1, 3] });
  assert.deepEqual(s.nodes[1].code, { file: 'a/src/y.js', lines: [2, 9], mark: [4, 4] });
  assert.deepEqual(two.map.nodes[0].code, { repo: 'b', file: 'x.js', lines: [1, 3] });

  two.map.edges = [{ id: 'go', from: 'x', to: 'y', code: 'x.js:1-3', calls: 'go(' }];
  const out = path.join(root, 'out');
  const r = buildMap(two, { chalk: path.join(root, 'no-chalk-talk'), out, slug: 'two' });
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].where, 'map arrow go');
  assert.match(r.failures[0].why, /name its repo/);
  assert.equal(r.html, null);
  assert.equal(fs.existsSync(out), false);
});

test('bad map data is a plain failure', t => {
  const { root, repo, d } = setup(t);
  const out = path.join(root, 'out');
  const run = data => buildMap(data, { chalk: path.join(root, 'no-chalk-talk'), out, slug: 'bad' });
  const noMap = { ...d, map: undefined };
  assert.deepEqual(run(noMap).failures, [{ where: 'map', why: 'the data has no map' }]);
  const unknown = sampleData(repo);
  unknown.map.nodes[0].code = { repo: 'nowhere', file: 'web/form.ts', lines: [1, 12] };
  assert.deepEqual(run(unknown).failures, [{ where: 'map block form', why: 'its code names an unknown repo, nowhere' }]);
  const noArrows = sampleData(repo);
  noArrows.map.edges = 'e1, e2';
  assert.equal(run(noArrows).failures[0].where, 'map');
  assert.equal(fs.existsSync(out), false);
});

test('chalk-talk missing', t => {
  assert.equal(chalkTalkAt('none'), null);
  assert.equal(chalkTalkAt(tempRoot(t)), null);
});

// A stand-in chalk-talk whose build and check scripts misbehave in a set way.
function standIn(root, { build, check = 'process.exit(0);' }) {
  const dir = path.join(root, 'stand-in');
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'build.mjs'), `import fs from 'node:fs';\n${build}\n`);
  fs.writeFileSync(path.join(dir, 'scripts', 'check.mjs'), `${check}\n`);
  return dir;
}

test('chalk-talk trouble is a plain failure', t => {
  const { root, d } = setup(t);
  const out = path.join(root, 'out');
  const run = stand => { const r = buildMap(d, { chalk: stand, out, slug: 'trouble' }); fs.rmSync(path.join(root, 'stand-in'), { recursive: true }); return r; };
  const earlier = [path.join(out, 'trouble.map.html'), path.join(out, 'trouble-snaps', 'step-1.png')];
  for (const f of earlier) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'an earlier run'); }

  const died = run(standIn(root, { build: "console.error('build: no such scene file: x'); process.exit(1);" }));
  assert.deepEqual(died.failures, [{ where: 'map', why: 'chalk-talk could not build the map: no such scene file: x' }]);
  assert.equal(died.html, null);
  assert.equal(died.layout.checked, false);
  assert.ok(earlier.every(f => !fs.existsSync(f)), 'the earlier map is cleared');

  const empty = run(standIn(root, { build: "fs.writeFileSync(process.argv[3], '<html></html>');" }));
  assert.deepEqual(empty.failures, [{ where: 'map', why: 'chalk-talk built a page with no readable map in it' }]);

  const page = '<script id="scene" type="application/json">\\n{"edges":[{"id":"e1","proof":{"status":"verified"}}]}\\n</script>';
  const stand = standIn(root, { build: `fs.writeFileSync(process.argv[3], '${page}');`, check: "console.error('check: the page did not produce a report'); process.exit(1);" });
  assert.equal(chalkTalkAt(stand).commit, null);
  const noReport = run(stand);
  assert.equal(noReport.traced, 1);
  assert.deepEqual(noReport.failures, [{ where: 'map layout', why: 'chalk-talk could not check the map: the page did not produce a report' }]);
  assert.equal(noReport.layout.checked, false);
});

const chalk = chalkDir();
const needsChalk = { skip: !chalk && 'chalk-talk not installed' };
const SLUG = 'booking-flow';

function buildIn(root, change) {
  const repo = bookingRepo(root);
  const d = sampleData(repo);
  change(d);
  const snap = repoSnapshot(repo.path);
  const out = path.join(root, 'out');
  return { repo, snap, out, r: buildMap(d, { chalk, out, slug: SLUG }) };
}
const built = (t, change) => buildIn(tempRoot(t), change);

// The sample map is built once and shared by the two tests that only read it.
let sample;
after(() => { if (sample) fs.rmSync(sample.root, { recursive: true, force: true }); });
function sampleMap() {
  if (!sample) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
    sample = { root, ...buildIn(root, () => {}) };
  }
  return sample;
}

function untouched({ repo, snap, out }) {
  assert.deepEqual(repoSnapshot(repo.path), snap);
  for (const dir of [out, repo.path, process.cwd()]) assert.equal(fs.existsSync(path.join(dir, 'chalk-talks')), false, `chalk-talks folder under ${dir}`);
}

test('pinned commit is read', needsChalk, t => {
  const { root, repo } = setup(t);
  const snap = repoSnapshot(repo.path);
  assert.equal(chalkTalkAt(chalk).commit, '4f88ead');
  untouched({ repo, snap, out: path.join(root, 'out') });
});

test('sample map builds and counts arrows', needsChalk, () => {
  const s = sampleMap();
  const { arrows, traced, guesses, broken, unproven, failures } = s.r;
  assert.deepEqual({ arrows, traced, guesses, broken, unproven, failures }, { arrows: 2, traced: 1, guesses: 1, broken: 0, unproven: 0, failures: [] });
  assert.ok(s.r.html.includes('id="scene"'));
  untouched(s);
});

test('a wrong calls string fails the map', needsChalk, t => {
  const b = built(t, d => { d.map.edges[0].calls = 'retry(3)'; });
  assert.equal(b.r.broken, 1);
  assert.equal(b.r.failures.length, 1);
  assert.equal(b.r.failures[0].where, 'map arrow e1');
  assert.match(b.r.failures[0].why, /retry\(3\)/);
  assert.deepEqual(b.r.layout.errors, []);
  untouched(b);
});

test('an arrow with no code and no reason fails', needsChalk, t => {
  const b = built(t, d => { delete d.map.edges[1].inferred; });
  assert.equal(b.r.unproven, 1);
  assert.equal(b.r.failures.length, 1);
  assert.equal(b.r.failures[0].where, 'map arrow e2');
  untouched(b);
});

test('proof is on even when no arrow cites code', needsChalk, t => {
  const b = built(t, d => {
    for (const x of [...d.map.nodes, ...d.map.edges]) { delete x.code; delete x.calls; delete x.inferred; }
  });
  assert.equal(b.r.arrows, 2);
  assert.equal(b.r.unproven, 2);
  assert.deepEqual(b.r.failures.map(f => f.where), ['map arrow e1', 'map arrow e2']);
  untouched(b);
});

test('layout check runs or says why not', needsChalk, () => {
  const s = sampleMap();
  const snaps = path.join(s.out, `${SLUG}-snaps`);
  if (s.r.layout.checked) assert.ok(fs.existsSync(path.join(snaps, 'step-1.png')));
  else assert.equal(fs.existsSync(snaps), false);
  assert.deepEqual(s.r.layout.errors, []);
  untouched(s);
});
