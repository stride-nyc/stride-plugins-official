import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { tempRoot, bookingRepo, sampleData, makeVault, makeRepo, commitAll, repoSnapshot, chalkDir, findChrome } from './helpers.mjs';

const SCRIPT = new URL('../walkthrough-build.mjs', import.meta.url).pathname;
const DAY1 = '2026-11-11';
const NOTE = 'Walkthrough - booking flow.md';

function setup(t, change = d => d, { dirty = false } = {}) {
  const root = tempRoot(t);
  const repo = bookingRepo(root);
  // a line after the cited ones: Dock.java now differs from the commit, and no cited text moves
  if (dirty) fs.appendFileSync(path.join(repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  const vault = makeVault(root, { 'README.md': 'a vault\n' });
  const data = sampleData(repo);
  change(data, repo);
  const dataFile = path.join(root, 'in', 'booking.json');
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  // A home folder with no chalk-talk in it, so the real one cannot change what a --chalk none build says.
  const noChalkHome = path.join(root, 'no-chalk-home');
  fs.mkdirSync(noChalkHome);
  const ctx = { root, repo, vault, data, dataFile, noChalkHome, out: path.join(root, 'work'), folder: path.join(vault, 'Walkthroughs') };
  ctx.snapshot = repoSnapshot(repo.path);
  return ctx;
}

function run(ctx, extra = [], { chalk = 'none', file = ctx.dataFile, out = ctx.out, date = DAY1, env = {} } = {}) {
  const args = [SCRIPT, file, '--out', out, '--vault', ctx.vault, '--folder', 'Walkthroughs', '--chalk', chalk, '--date', date, ...extra];
  const home = chalk === 'none' ? { HOME: ctx.noChalkHome } : {};
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, CW_GH: '0', ...home, ...env }, cwd: ctx.root });
  return { status: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.split('\n') };
}

// D11: the walked repo is untouched and chalk-talk made no folder of its own.
function finish(ctx) {
  const now = repoSnapshot(ctx.repo.path);
  assert.equal(now.porcelain, ctx.snapshot.porcelain);
  assert.deepEqual(now.index, ctx.snapshot.index);
  for (const dir of [ctx.root, ctx.repo.path, process.cwd()]) assert.equal(fs.existsSync(path.join(dir, 'chalk-talks')), false, dir);
}

const vaultFiles = ctx => (fs.existsSync(ctx.folder) ? fs.readdirSync(ctx.folder).sort() : []);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

test('passing build writes three files', t => {
  const ctx = setup(t);
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines[0].startsWith('Code: all 4 blocks match the files as built'), r.out);
  assert.ok(r.lines.includes('Reasons: all 3 quotes were found word for word in their sources.'), r.out);
  assert.ok(r.lines.some(l => l.startsWith('Map: not built, because chalk-talk is not installed.')), r.out);
  assert.deepEqual(vaultFiles(ctx), [NOTE, 'booking-flow.html', 'booking-flow.walkthrough.json']);
  for (const n of vaultFiles(ctx)) assert.ok(r.lines.includes(`WROTE ${path.join(ctx.folder, n)}`), r.out);
  assert.deepEqual(fs.readdirSync(ctx.out).filter(f => !f.startsWith('.')).sort(), [NOTE, 'booking-flow.html', 'booking-flow.walkthrough.json']);
  assert.match(fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8'), /^---\ntype: code-walkthrough\n/);
  finish(ctx);
});

test('without --write nothing reaches the vault', t => {
  const ctx = setup(t);
  assert.equal(run(ctx).status, 0);
  assert.deepEqual(vaultFiles(ctx), []);
  assert.ok(fs.existsSync(path.join(ctx.out, NOTE)));
  finish(ctx);
});

test('the not-recorded questions print numbered, in stop order, right after the reply lines', t => {
  const ctx = setup(t, d => { d.stops[2].reasons.push({ text: 'Why does the API send it on at once?', source: { kind: 'not-recorded' } }); });
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 0, r.out + r.err);
  const map = r.lines.findLastIndex(l => l.startsWith('Map: '));
  assert.deepEqual(r.lines.slice(map + 1, map + 3), ['1. Why does the form retry twice?', '2. Why does the API send it on at once?'], r.out);
  assert.ok(r.lines[map + 3].startsWith('WROTE '), r.out);
  finish(ctx);
});

test('with every reason recorded, the build prints no question lines', t => {
  const ctx = setup(t, (d, repo) => {
    const quote = 'Every booking goes through the API so the yard service hears about it.';
    d.stops[0].reasons = [{ text: quote, quote, source: { kind: 'commit', ref: { hash: repo.head } } }];
  });
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines[r.lines.findLastIndex(l => l.startsWith('Map: ')) + 1].startsWith('WROTE '), r.out);
  assert.ok(!r.lines.some(l => /^\d+\. /.test(l)), r.out);
  finish(ctx);
});

test('the data file gets what the build learned', t => {
  const ctx = setup(t);
  assert.equal(run(ctx).status, 0);
  const d = readJson(ctx.dataFile);
  assert.deepEqual(d.cited_files['booking-mini'], ['api/Dock.java', 'web/form.ts']);
  assert.equal(d.repos[0].commit, ctx.repo.head);
  assert.deepEqual(d.repos[0].uncommitted, []);
  assert.equal(d.checks.code.blocks, 4);
  assert.deepEqual(d.checks.quotes, { quotes: 3, saved: 0, savedOf: { ticket: [], 'pull-request': [] } });
  assert.deepEqual(d.checks.map, { built: false });
  assert.equal(d.built, DAY1);
  assert.equal(d.map_tool, undefined);
  assert.equal(d.earlier, undefined);
  finish(ctx);
});

test('uncommitted cited files are listed', t => {
  const ctx = setup(t, d => d, { dirty: true });
  const r = run(ctx);
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(readJson(ctx.dataFile).repos[0].uncommitted, ['api/Dock.java']);
  assert.match(r.out, /plus uncommitted changes in 1 file\)\./);
  assert.match(fs.readFileSync(path.join(ctx.out, NOTE), 'utf8'), /uncommitted:\n  - "booking-mini: api\/Dock\.java"\n/);
  finish(ctx);
});

test('the input may be the very file left in the working folder', t => {
  const ctx = setup(t);
  fs.mkdirSync(ctx.out, { recursive: true });
  const same = path.join(ctx.out, 'booking-flow.walkthrough.json');
  fs.copyFileSync(ctx.dataFile, same);
  const r = run(ctx, ['--write'], { file: same });
  assert.equal(r.status, 0, r.out + r.err);
  const d = readJson(same);
  assert.equal(d.checks.code.blocks, 4);
  assert.deepEqual(readJson(path.join(ctx.folder, 'booking-flow.walkthrough.json')), d);
  finish(ctx);
});

test('failing build writes nothing to the vault', t => {
  const ctx = setup(t);
  fs.rmSync(path.join(ctx.repo.path, 'web/form.ts'));
  ctx.snapshot = repoSnapshot(ctx.repo.path);
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(r.lines.includes('FAIL s1 web/form.ts:1-12: the file is gone'), r.out);
  assert.doesNotMatch(r.out, /^Code: all/m);
  assert.deepEqual(vaultFiles(ctx), []);
  assert.doesNotMatch(r.err, /\n\s+at /);
  finish(ctx);
});

test('a paraphrased quote fails', t => {
  const ctx = setup(t, d => { d.stops[1].reasons[1].quote = 'Every booking has to reach the yard service'; });
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.lines.some(l => /^FAIL s2 reason 2 \(design doc docs\/adr\.md\): /.test(l)), r.out);
  assert.deepEqual(vaultFiles(ctx), []);
  finish(ctx);
});

test('shape errors fail before anything else', t => {
  const ctx = setup(t, d => { d.stops[0].reasons = [];});
  fs.rmSync(path.join(ctx.repo.path, 'web/form.ts'));
  ctx.snapshot = repoSnapshot(ctx.repo.path);
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.lines.some(l => l.startsWith('FAIL ') && /stop s1 has no Why entry/.test(l)), r.out);
  assert.doesNotMatch(r.out, /the file is gone/);
  assert.deepEqual(vaultFiles(ctx), []);
  assert.equal(readJson(ctx.dataFile).checks, undefined);
  finish(ctx);
});

test('same-day rebuild stops and asks', t => {
  const ctx = setup(t);
  assert.equal(run(ctx, ['--write']).status, 0);
  const first = fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8');
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 3, r.out + r.err);
  assert.ok(r.lines.includes(`SAME DAY booking-flow.html, booking-flow.walkthrough.json, ${NOTE}`), r.out);
  assert.equal(vaultFiles(ctx).length, 3);

  const keep = run(ctx, ['--write', '--same-day', 'keep']);
  assert.equal(keep.status, 0, keep.out + keep.err);
  assert.deepEqual(vaultFiles(ctx), [
    NOTE, `Walkthrough - booking flow ${DAY1}.md`, 'booking-flow-2026-11-11.html', 'booking-flow-2026-11-11.walkthrough.json',
    'booking-flow.html', 'booking-flow.walkthrough.json'].sort());
  assert.equal(fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8'), first);
  assert.match(fs.readFileSync(path.join(ctx.folder, `Walkthrough - booking flow ${DAY1}.md`), 'utf8'), /Earlier walkthrough of this journey: \[\[Walkthrough - booking flow\]\]\./);

  finish(ctx);
});

test('same-day replace rewrites today\'s three files and nothing else', t => {
  const ctx = setup(t);
  assert.equal(run(ctx, ['--write']).status, 0);
  const d = readJson(ctx.dataFile);
  d.summary = 'A changed summary.';
  fs.writeFileSync(ctx.dataFile, JSON.stringify(d));
  const rep = run(ctx, ['--write', '--same-day', 'replace']);
  assert.equal(rep.status, 0, rep.out + rep.err);
  assert.deepEqual(vaultFiles(ctx), [NOTE, 'booking-flow.html', 'booking-flow.walkthrough.json']);
  assert.match(fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8'), /A changed summary\./);
  assert.equal(readJson(path.join(ctx.folder, 'booking-flow.walkthrough.json')).summary, 'A changed summary.');
  finish(ctx);
});

test('rebuild on a later day', t => {
  const ctx = setup(t);
  assert.equal(run(ctx, ['--write']).status, 0);
  const r = run(ctx, ['--write'], { date: '2026-11-12' });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(vaultFiles(ctx), [NOTE, 'Walkthrough - booking flow 2026-11-12.md', 'booking-flow-2026-11-12.html',
    'booking-flow-2026-11-12.walkthrough.json', 'booking-flow.html', 'booking-flow.walkthrough.json'].sort());
  assert.equal(readJson(ctx.dataFile).earlier, 'Walkthrough - booking flow');
  assert.match(fs.readFileSync(path.join(ctx.folder, 'Walkthrough - booking flow 2026-11-12.md'), 'utf8'), /Earlier walkthrough of this journey: \[\[Walkthrough - booking flow\]\]\./);
  finish(ctx);
});

test('working folder in the wrong place is refused', t => {
  const ctx = setup(t);
  const workRoot = path.join(ctx.root, 'roots');
  fs.mkdirSync(workRoot);
  fs.symlinkSync(ctx.vault, path.join(ctx.root, 'link-to-vault'));
  const cases = [
    [path.join(ctx.repo.path, 'sub'), []],
    [ctx.repo.path, []],
    [path.join(ctx.vault, 'x'), []],
    [path.join(ctx.root, 'link-to-vault', 'x'), []],
    [path.join(workRoot, 'x'), ['--work-root', workRoot]],
  ];
  for (const [out, extra] of cases) {
    const existed = fs.existsSync(out);
    const r = run(ctx, ['--write', ...extra], { out });
    assert.equal(r.status, 2, `${out}: ${r.out}${r.err}`);
    assert.equal(fs.existsSync(out), existed, out);
    assert.doesNotMatch(r.err + r.out, /\n\s+at /);
  }
  assert.deepEqual(vaultFiles(ctx), []);
  assert.deepEqual(fs.readdirSync(ctx.vault), ['README.md']);
  assert.equal(readJson(ctx.dataFile).checks, undefined);
  finish(ctx);
});

test('a data file inside the vault, a repo or a work root is refused and left alone', t => {
  const ctx = setup(t);
  const workRoot = path.join(ctx.root, 'roots');
  fs.mkdirSync(workRoot);
  fs.mkdirSync(ctx.folder, { recursive: true });
  const homes = [
    [path.join(ctx.folder, 'booking-flow.walkthrough.json'), []],
    [path.join(ctx.repo.path, 'copy.json'), []],
    [path.join(workRoot, 'copy.json'), ['--work-root', workRoot]],
  ];
  for (const [file] of homes) fs.copyFileSync(ctx.dataFile, file);
  ctx.snapshot = repoSnapshot(ctx.repo.path);
  for (const [file, extra] of homes) {
    const before = fs.readFileSync(file);
    const r = run(ctx, ['--write', ...extra], { file });
    assert.equal(r.status, 2, `${file}: ${r.out}${r.err}`);
    assert.match(r.err, /copy the data file to the working folder/);
    assert.deepEqual(fs.readFileSync(file), before, file);
    assert.equal(fs.existsSync(ctx.out), false);
  }
  assert.deepEqual(vaultFiles(ctx), ['booking-flow.walkthrough.json']);
  finish(ctx);
});

test('a data file reached through a link and .. is judged where it really is', t => {
  const ctx = setup(t);
  fs.mkdirSync(ctx.folder, { recursive: true });
  fs.mkdirSync(path.join(ctx.root, 'in'), { recursive: true });
  fs.symlinkSync(ctx.folder, path.join(ctx.root, 'in', 'link'));
  const real = path.join(ctx.vault, 'x.json');
  fs.copyFileSync(ctx.dataFile, real);
  const before = fs.readFileSync(real);
  const r = run(ctx, [], { file: `${ctx.root}/in/link/../x.json` });
  assert.equal(r.status, 2, r.out + r.err);
  assert.deepEqual(fs.readFileSync(real), before);
  assert.deepEqual(fs.readdirSync(ctx.vault).sort(), ['README.md', 'Walkthroughs', 'x.json']);
  finish(ctx);
});

test('a link planted at an output name in the working folder is replaced, never written through', t => {
  const ctx = setup(t);
  fs.mkdirSync(ctx.out, { recursive: true });
  const soft = path.join(ctx.root, 'soft-target.txt'), hard = path.join(ctx.root, 'hard-target.txt');
  fs.writeFileSync(soft, 'keep me\n');
  fs.writeFileSync(hard, 'keep me too\n');
  fs.symlinkSync(soft, path.join(ctx.out, 'booking-flow.html'));
  fs.symlinkSync(soft, path.join(ctx.out, 'booking-flow.walkthrough.json'));
  fs.linkSync(hard, path.join(ctx.out, NOTE));
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 0, r.out + r.err);
  assert.equal(fs.readFileSync(soft, 'utf8'), 'keep me\n');
  assert.equal(fs.readFileSync(hard, 'utf8'), 'keep me too\n');
  for (const n of [NOTE, 'booking-flow.html', 'booking-flow.walkthrough.json']) {
    const st = fs.lstatSync(path.join(ctx.out, n));
    assert.ok(st.isFile() && st.nlink === 1, n);
    assert.deepEqual(fs.readFileSync(path.join(ctx.folder, n)), fs.readFileSync(path.join(ctx.out, n)), n);
  }
  assert.match(fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8'), /^---\ntype: code-walkthrough\n/);
  finish(ctx);
});

test('a data file with a second name on disk (a hard link) is refused and left alone', t => {
  const ctx = setup(t);
  fs.mkdirSync(ctx.folder, { recursive: true });
  const twin = path.join(ctx.folder, 'booking-flow.walkthrough.json');
  fs.linkSync(ctx.dataFile, twin);
  const before = fs.readFileSync(ctx.dataFile);
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 2, r.out + r.err);
  assert.match(r.err, /has another name on disk \(a hard link\)/);
  assert.deepEqual(fs.readFileSync(twin), before);
  assert.equal(fs.existsSync(ctx.out), false);
  assert.deepEqual(vaultFiles(ctx), ['booking-flow.walkthrough.json']);
  finish(ctx);
});

test('a missing folder reached through .. is refused', t => {
  const ctx = setup(t);
  const r = run(ctx, [], { out: `${ctx.root}/nope/../vault/x` });
  assert.equal(r.status, 2, r.out + r.err);
  assert.deepEqual(fs.readdirSync(ctx.vault), ['README.md']);
  const r2 = run(ctx, [], { out: `${ctx.root}/missing/../elsewhere` });
  assert.equal(r2.status, 2, r2.out + r2.err);
  finish(ctx);
});

test('a work root that does not exist yet, typed in another letter case, still guards', t => {
  const ctx = setup(t);
  fs.mkdirSync(path.join(ctx.root, 'probe'));
  if (!fs.existsSync(path.join(ctx.root, 'PROBE'))) return t.skip('this disk tells letter cases apart');
  const out = path.join(ctx.root, 'LATER', 'x');
  const r = run(ctx, ['--work-root', path.join(ctx.root, 'later')], { out });
  assert.equal(r.status, 2, r.out + r.err);
  assert.equal(fs.existsSync(path.join(ctx.root, 'later')), false);
  finish(ctx);
});

test('the same folder typed in another letter case is still inside', t => {
  const ctx = setup(t);
  fs.mkdirSync(path.join(ctx.root, 'probe'));
  const blind = fs.existsSync(path.join(ctx.root, 'PROBE'));
  if (!blind) return t.skip('this disk tells letter cases apart');
  const out = path.join(ctx.root, 'VAULT', 'work');
  const r = run(ctx, ['--write'], { out });
  assert.equal(r.status, 2, r.out + r.err);
  assert.deepEqual(fs.readdirSync(ctx.vault), ['README.md']);
  const lower = run(ctx, [], { out: path.join(ctx.root, 'REPOS-NOT', 'x'), file: ctx.dataFile });
  assert.equal(lower.status, 0, lower.out + lower.err);
  const repoCase = run(ctx, [], { out: path.join(ctx.root, 'BOOKING-MINI', 'x') });
  assert.equal(repoCase.status, 2, repoCase.out + repoCase.err);
  finish(ctx);
});

test('a leading ~ means the home folder, even in a work root that does not exist yet', t => {
  const ctx = setup(t);
  const home = path.join(ctx.root, 'home');
  fs.mkdirSync(home);
  const r = run(ctx, ['--work-root', '~/later'], { out: path.join(home, 'later', 'x'), env: { HOME: home } });
  assert.equal(r.status, 2, r.out + r.err);
  assert.equal(fs.existsSync(path.join(home, 'later')), false);
  const ok = run(ctx, ['--work-root', '~/later'], { env: { HOME: home } });
  assert.equal(ok.status, 0, ok.out + ok.err);
  finish(ctx);
});

test('a folder that only shares a prefix is not inside', t => {
  const ctx = setup(t);
  const r = run(ctx, [], { out: ctx.vault + '-old' });
  assert.equal(r.status, 0, r.out + r.err);
  finish(ctx);
});

test('bad input is a plain message, never a stack trace', t => {
  const ctx = setup(t);
  const bad = path.join(ctx.root, 'bad.json');
  fs.writeFileSync(bad, '{ nope');
  const notRepo = setup(t);
  const plain = path.join(notRepo.root, 'plain');
  fs.mkdirSync(plain);
  const nd = readJson(notRepo.dataFile);
  nd.repos[0].path = plain;
  fs.writeFileSync(notRepo.dataFile, JSON.stringify(nd));
  const cases = [
    [run(ctx, [], { file: path.join(ctx.root, 'missing.json') }), 2],
    [run(ctx, [], { file: bad }), 2],
    [run(ctx, ['--same-day', 'maybe']), 2],
    [run(ctx, ['--date', '11/11/2026']), 2],
    [run(ctx, ['--bogus']), 2],
    [run({ ...ctx, vault: path.join(ctx.root, 'no-vault') }), 2],
    [run(notRepo), 1],
  ];
  const notRepoRun = cases[6][0];
  for (const [r, status] of cases) {
    assert.equal(r.status, status, r.out + r.err);
    assert.doesNotMatch(r.err + r.out, /\n\s+at |Error:/);
    assert.ok((r.err + r.out).trim().length > 0);
  }
  assert.ok(notRepoRun.lines.some(l => /^FAIL booking-mini: .*not a git repo/.test(l)), notRepoRun.out);
  const none = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  finish(ctx);
});

// A cited path git does not name exactly fails its block, the way the look-up will not trust it (look.test.mjs, `inexact`).
const MISNAMED = 'git names this file differently; use the path as git names it, copied from git ls-files. If the file is in a repo inside this one, such as a submodule, list that repo as its own repos entry';
function misnamed(t, cited, plant = () => {}) {
  const ctx = setup(t, (d, repo) => { plant(repo.path); d.stops[2].code[0].file = cited; });
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(r.lines.includes(`FAIL s3 ${cited}:25-30: ${MISNAMED}`), r.out);
  assert.doesNotMatch(r.out + r.err, /Command failed|\n\s+at /);
  assert.deepEqual(vaultFiles(ctx), []);
  finish(ctx);
  return r;
}
const dockCopy = (repoPath, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(repoPath, 'api/Dock.java'), to); };

test('a doubled slash in a cited path fails', t => misnamed(t, 'api//Dock.java'));
test('a ./ segment in a cited path fails', t => misnamed(t, 'api/./Dock.java'));
test('a cited path that leaves the repo fails', t => misnamed(t, '../outside.java', repo => dockCopy(repo, path.join(repo, '..', 'outside.java'))));

test('wrong letter case in a cited path fails', t => {
  const probe = path.join(tempRoot(t), 'Case.txt');
  fs.writeFileSync(probe, 'x');
  if (!fs.existsSync(probe.replace('Case', 'case'))) return t.skip('this disk respects letter case, so git cannot be fooled this way');
  misnamed(t, 'api/dock.java');
});

test('a path through a committed symlink fails', t => misnamed(t, 'link/Dock.java', repo => {
  fs.symlinkSync('api', path.join(repo, 'link'));
  commitAll(repo, 'Link the api folder');
}));
test('a symlink to a file, cited by the link name, fails', t => misnamed(t, 'lnk.java', repo => {
  fs.symlinkSync('api/Dock.java', path.join(repo, 'lnk.java'));
  commitAll(repo, 'Link the dock file');
}));
test('a folder as a cited path fails', t => misnamed(t, 'api'));
test('a file inside an embedded repo fails, saying to list that repo on its own', t => {
  const r = misnamed(t, 'sub/file.java', repo => {
    makeRepo(path.join(repo, 'sub'), { files: { 'file.java': fs.readFileSync(path.join(repo, 'api/Dock.java'), 'utf8') }, message: 'inner' });
    commitAll(repo, 'Add the inner repo');
  });
  assert.match(r.out, /If the file is in a repo inside this one, such as a submodule, list that repo as its own repos entry/);
});

// The same accented name typed in another byte form (decomposed) looks the same on screen but is not git's name.
test('an accented name in another byte form fails, saying to copy the path from git ls-files', t => {
  const name = 'api/café résumé.java';
  const probe = path.join(tempRoot(t), 'café'.normalize('NFC'));
  fs.writeFileSync(probe, 'x');
  if (!fs.existsSync(path.join(path.dirname(probe), 'café'.normalize('NFD')))) return t.skip('this disk tells the two byte forms apart, so the file is simply not found');
  const r = misnamed(t, name.normalize('NFD'), repo => {
    dockCopy(repo, path.join(repo, name.normalize('NFC')));
    commitAll(repo, 'Add an accented name');
  });
  assert.match(r.out, /use the path as git names it, copied from git ls-files/);
});

test('ignored cited files are listed as uncommitted', t => {
  const ctx = setup(t, (d, repo) => {
    fs.writeFileSync(path.join(repo.path, '.gitignore'), 'local.txt\ngen/\n');
    commitAll(repo.path, 'Ignore local and generated files');
    fs.writeFileSync(path.join(repo.path, 'local.txt'), 'a local setting\n');
    fs.mkdirSync(path.join(repo.path, 'gen'));
    fs.writeFileSync(path.join(repo.path, 'gen', 'out.js'), 'const generated = 1;\n');
    d.extend.push({ stop: 's1', file: 'local.txt', lines: [1, 1], text: 'A local setting.' }, { stop: 's1', file: 'gen/out.js', lines: [1, 1], text: 'Generated code.' });
  });
  const r = run(ctx);
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(readJson(ctx.dataFile).repos[0].uncommitted, ['gen/out.js', 'local.txt']);
  assert.match(r.out, /plus uncommitted changes in 2 files\)\./);
  finish(ctx);
});

for (const flag of ['--assume-unchanged', '--skip-worktree']) {
  test(`a cited file flagged ${flag.slice(2)} is listed as uncommitted`, t => {
    const ctx = setup(t, (d, repo) => execFileSync('git', ['update-index', flag, 'web/form.ts'], { cwd: repo.path }));
    const r = run(ctx);
    assert.equal(r.status, 0, r.out + r.err);
    assert.deepEqual(readJson(ctx.dataFile).repos[0].uncommitted, ['web/form.ts']);
    finish(ctx);
  });
}

test('an untracked cited file is listed as uncommitted', t => {
  const ctx = setup(t, (d, repo) => {
    fs.writeFileSync(path.join(repo.path, 'web', 'new rule.ts'), 'const fresh = 1;\n');
    d.extend.push({ stop: 's1', file: 'web/new rule.ts', lines: [1, 1], text: 'A new rule.' });
  });
  const r = run(ctx);
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(readJson(ctx.dataFile).repos[0].uncommitted, ['web/new rule.ts']);
  finish(ctx);
});

test('a repo path below its top folder is refused, naming the top folder', t => {
  const ctx = setup(t, (d, repo) => { d.repos[0].path = path.join(repo.path, 'web'); });
  const before = fs.readFileSync(ctx.dataFile);
  const r = run(ctx, ['--write']);
  assert.equal(r.status, 2, r.out + r.err);
  assert.match(r.err, /not its top folder/);
  assert.ok(r.err.includes(fs.realpathSync(ctx.repo.path)), r.err);
  assert.deepEqual(fs.readFileSync(ctx.dataFile), before);
  assert.equal(fs.existsSync(ctx.out), false);
  assert.deepEqual(vaultFiles(ctx), []);
  finish(ctx);
});

test('a GIT_DIR in the caller\'s environment does not move the checks to another repo', t => {
  const ctx = setup(t);
  const other = makeRepo(path.join(ctx.root, 'other'), { files: { 'other.txt': 'another repo\n' }, message: 'Another repo' });
  const r = run(ctx, [], { env: { GIT_DIR: path.join(other.path, '.git') } });
  assert.equal(r.status, 0, r.out + r.err);
  const d = readJson(ctx.dataFile);
  assert.equal(d.repos[0].commit, ctx.repo.head);
  assert.deepEqual(d.repos[0].uncommitted, []);
  finish(ctx);
});

// A stand-in chalk-talk whose build stops at once, saying so: its failure line proves the build used the folder.
const standInChalk = dir => {
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'build.mjs'), "console.error('build: the stand-in ran'); process.exit(1);\n");
  return dir;
};

test('--chalk none is the word none, never a folder of that name', t => {
  const ctx = setup(t);
  standInChalk(path.join(ctx.root, 'none'));
  const r = run(ctx, [], { chalk: 'none' });
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines.some(l => l.startsWith('Map: not built, because chalk-talk is not installed.')), r.out);
  assert.equal(readJson(ctx.dataFile).map_tool, undefined);
  finish(ctx);
});

// chalk-talk is installed where SKILL.md step 2 looks: under the home folder, or under the project the command runs in.
// The stand-in fails if it runs, so a passing build also shows --chalk none never ran it.
function saysLeftOut(ctx, r) {
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines.includes('Map: left out by the command.'), r.out);
  assert.doesNotMatch(r.out, /not installed/);
  const d = readJson(ctx.dataFile);
  assert.deepEqual(d.checks.map, { built: false, leftOut: true });
  assert.equal(d.map_tool, undefined);
  assert.ok(fs.readFileSync(path.join(ctx.out, 'booking-flow.html'), 'utf8').includes('Map left out by the command'));
  finish(ctx);
}

test('--chalk none while chalk-talk is in the home folder says the command left the map out', t => {
  const ctx = setup(t);
  const home = path.join(ctx.root, 'chalk-home');
  standInChalk(path.join(home, '.claude', 'skills', 'chalk-talk'));
  saysLeftOut(ctx, run(ctx, [], { env: { HOME: home } }));
});

test('--chalk none while chalk-talk is in the project says the command left the map out', t => {
  const ctx = setup(t);
  standInChalk(path.join(ctx.root, '.claude', 'skills', 'chalk-talk'));
  saysLeftOut(ctx, run(ctx));
});

function saysNotInstalled(ctx, r) {
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines.includes('Map: not built, because chalk-talk is not installed. Get it from github.com/oztrkemree/chalk-talk and put it in ~/.claude/skills/chalk-talk.'), r.out);
  assert.deepEqual(readJson(ctx.dataFile).checks.map, { built: false });
  assert.ok(fs.readFileSync(path.join(ctx.out, 'booking-flow.html'), 'utf8').includes('Map not built, because chalk-talk is not installed'));
  finish(ctx);
}

test('--chalk none while chalk-talk is in neither place keeps the not-installed lines', t => {
  const ctx = setup(t);
  saysNotInstalled(ctx, run(ctx));
});

test('a rebuild where chalk-talk is missing drops the left-out mark an earlier build stored', t => {
  const ctx = setup(t, d => { d.checks = { code: { blocks: 4 }, quotes: { quotes: 3 }, map: { built: false, leftOut: true } }; });
  saysNotInstalled(ctx, run(ctx));
});

test('a --chalk that is not a chalk-talk folder is refused, before anything is written', t => {
  const ctx = setup(t);
  const stand = standInChalk(path.join(ctx.root, 'stand-in'));
  const empty = path.join(ctx.root, 'empty');
  fs.mkdirSync(empty);
  const before = fs.readFileSync(ctx.dataFile);
  for (const chalk of [empty, path.join(stand, 'scripts', 'build.mjs'), path.join(ctx.root, 'missing')]) {
    const r = run(ctx, ['--write'], { chalk });
    assert.equal(r.status, 2, `${chalk}: ${r.out}${r.err}`);
    assert.ok(r.err.includes(`no chalk-talk at ${chalk}; pass the folder that holds scripts/build.mjs, or none`), r.err);
    assert.doesNotMatch(r.err, /\n\s+at /);
    assert.deepEqual(fs.readFileSync(ctx.dataFile), before);
    assert.equal(fs.existsSync(ctx.out), false);
  }
  assert.deepEqual(vaultFiles(ctx), []);
  finish(ctx);
});

test('a --chalk folder that holds scripts/build.mjs is used, even given relative to the working directory', t => {
  const ctx = setup(t);
  standInChalk(path.join(ctx.root, 'stand-in'));
  const r = run(ctx, ['--write'], { chalk: 'stand-in' });
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(r.lines.includes('FAIL map: chalk-talk could not build the map: the stand-in ran'), r.out);
  assert.equal(readJson(ctx.dataFile).map_tool.name, 'chalk-talk');
  assert.deepEqual(vaultFiles(ctx), []);
  finish(ctx);
});

test('plain words in the note', t => {
  const ctx = setup(t);
  assert.equal(run(ctx).status, 0);
  const note = fs.readFileSync(path.join(ctx.out, NOTE), 'utf8');
  assert.doesNotMatch(note, /data file|scene|map_step|left_out|key_lines|not-recorded|vault-note|design-doc|build-note|pull-request|code-comment/);
  finish(ctx);
});

const chalk = chalkDir();
test('with chalk-talk the page carries the map', { skip: !chalk || !findChrome() }, t => {
  const ctx = setup(t);
  const r = run(ctx, ['--write'], { chalk });
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.lines.includes('Map: 1 of 2 arrows are traced to a line of code. 1 is marked as a guess. None are broken.'), r.out);
  const page = fs.readFileSync(path.join(ctx.out, 'booking-flow.html'), 'utf8');
  assert.match(page, /id="map-page"[^>]*>[^<]{200,}/);
  const d = readJson(ctx.dataFile);
  assert.equal(d.map_tool.name, 'chalk-talk');
  assert.equal(d.map_tool.commit, '4f88ead');
  assert.deepEqual(Object.keys(d.checks.map).sort(), ['arrows', 'broken', 'built', 'guesses', 'layoutChecked', 'traced']);
  assert.equal(d.checks.map.built, true);
  assert.ok(fs.existsSync(path.join(ctx.out, 'booking-flow-snaps')));
  finish(ctx);
});
