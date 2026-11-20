import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tempRoot, bookingRepo, sampleData, makeVault, makeRepo, commitAll, makeIndexStale, repoSnapshot } from './helpers.mjs';
import { lookUp } from '../lib/look.mjs';

const BUILD = new URL('../walkthrough-build.mjs', import.meta.url).pathname;
const LOOK = new URL('../walkthrough-look.mjs', import.meta.url).pathname;
const DAY = '2026-11-11';
const NOTE = 'Walkthrough - booking flow.md';
const LINE = '[[Walkthrough - booking flow]]';

function setup(t, change = () => {}) {
  const root = tempRoot(t);
  const repo = bookingRepo(root);
  const vault = makeVault(root, { 'README.md': 'a vault\n' });
  const dataFile = path.join(root, 'in', 'booking.json');
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const data = sampleData(repo);
  change(data, repo);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  const b = spawnSync(process.execPath, [BUILD, dataFile, '--out', path.join(root, 'work'), '--vault', vault, '--folder', 'Walkthroughs',
    '--chalk', 'none', '--date', DAY, '--write'], { encoding: 'utf8', env: { ...process.env, CW_GH: '0' }, cwd: root });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  return { root, repo, vault, folder: path.join(vault, 'Walkthroughs') };
}

// Called after the fixture's own edits, so only what the look-up does is measured.
function arm(ctx) {
  makeIndexStale(ctx.repo.path);
  ctx.snapshot = repoSnapshot(ctx.repo.path);
  ctx.vaultBefore = vaultBytes(ctx.vault);
  return ctx;
}

function vaultBytes(dir) {
  const out = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
  } };
  walk(dir);
  return out;
}

function finish(ctx) {
  const now = repoSnapshot(ctx.repo.path);
  assert.equal(now.porcelain, ctx.snapshot.porcelain);
  assert.deepEqual(now.index, ctx.snapshot.index);
  assert.deepEqual(vaultBytes(ctx.vault), ctx.vaultBefore);
}

function look(ctx, extra = [], { args, env = {} } = {}) {
  const a = args || ['--vault', ctx.vault, '--folder', 'Walkthroughs', '--repo', 'booking-mini', '--repo-path', ctx.repo.path, ...extra];
  const r = spawnSync(process.execPath, [LOOK, ...a], { encoding: 'utf8', cwd: ctx.root, env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.split('\n').filter(Boolean) };
}

const editData = (ctx, fn) => {
  const f = path.join(ctx.folder, 'booking-flow.walkthrough.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(d);
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
};

const editNote = (ctx, fn, name = NOTE) => {
  const f = path.join(ctx.folder, name);
  fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
};

test('finds the walkthrough for the repo', t => {
  const ctx = arm(setup(t));
  const r = look(ctx);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(r.lines, [`${LINE} · commit ${ctx.repo.head} · built ${DAY} · its cited files have not changed since`]);
  finish(ctx);
});

test('counts files changed since its commit', t => {
  const ctx = setup(t);
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  arm(ctx);
  const r = look(ctx);
  assert.deepEqual(r.lines, [`${LINE} · commit ${ctx.repo.head} · built ${DAY} · 1 of 2 cited files changed since`]);
  assert.deepEqual(lookUp({ vault: ctx.vault, folder: 'Walkthroughs', repo: 'booking-mini', repoPath: ctx.repo.path }),
    [{ note: 'Walkthrough - booking flow', commit: ctx.repo.head, date: DAY, cited: 2, changed: 1, missingCommit: false, unchecked: false, noCommit: false }]);
  finish(ctx);
});

test('uncommitted and untracked changes count', t => {
  const ctx = setup(t);
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const more = 1;\n');
  fs.writeFileSync(path.join(ctx.repo.path, 'notes.txt'), 'not cited\n');
  arm(ctx);
  assert.match(look(ctx).lines[0], /· 2 of 2 cited files changed since$/);
  finish(ctx);
});

test('an untracked cited file counts', t => {
  const ctx = setup(t);
  editData(ctx, d => { d.cited_files['booking-mini'].push('web/new file.ts'); });
  fs.writeFileSync(path.join(ctx.repo.path, 'web/new file.ts'), 'const fresh = 1;\n');
  arm(ctx);
  assert.match(look(ctx).lines[0], /· 1 of 3 cited files changed since$/);
  finish(ctx);
});

test('a file changed twice, committed and dirty, counts once', t => {
  const ctx = setup(t);
  fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const a = 1;\n');
  commitAll(ctx.repo.path, 'Edit the form');
  fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const b = 2;\n');
  arm(ctx);
  assert.match(look(ctx).lines[0], /· 1 of 2 cited files changed since$/);
  finish(ctx);
});

test('a deleted and a staged cited file count', t => {
  const ctx = setup(t);
  fs.rmSync(path.join(ctx.repo.path, 'web/form.ts'));
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  const added = spawnSync('git', ['add', 'api/Dock.java'], { cwd: ctx.repo.path, encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  assert.match(execFileSync('git', ['status', '--porcelain'], { cwd: ctx.repo.path, encoding: 'utf8' }), /^M  api\/Dock\.java$/m);
  arm(ctx);
  assert.match(look(ctx).lines[0], /· 2 of 2 cited files changed since$/);
  finish(ctx);
});

test('a commit that is gone', t => {
  const ctx = setup(t);
  editNote(ctx, s => s.replace(`booking-mini@${ctx.repo.head}`, 'booking-mini@deadbee'));
  arm(ctx);
  const r = look(ctx);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(r.lines, [`${LINE} · commit deadbee · built ${DAY} · its commit is no longer in the repo`]);
  assert.equal(lookUp({ vault: ctx.vault, folder: 'Walkthroughs', repo: 'booking-mini', repoPath: ctx.repo.path })[0].missingCommit, true);
  finish(ctx);
});

test('a hash that could be an option is never given to git', t => {
  const ctx = setup(t);
  const target = path.join(ctx.repo.path, 'pwned');
  for (const bad of ['--output=' + target, '-q', '--no-index', 'zzzzzzz', 'HEAD', 'abc1234^{commit}']) {
    editNote(ctx, s => s.replace(/^  - "booking-mini@.*"$/m, `  - "booking-mini@${bad}"`));
    arm(ctx);
    const r = look(ctx);
    assert.equal(r.status, 0, r.err);
    assert.match(r.lines[0], /· its commit is no longer in the repo$/, bad);
    assert.equal(fs.existsSync(target), false, bad);
    finish(ctx);
  }
});

test('file filter', t => {
  const ctx = arm(setup(t));
  assert.equal(look(ctx, ['--file', 'api/Other.java']).out, 'none\n');
  assert.deepEqual(look(ctx, ['--file', 'api/Dock.java']).lines, [`${LINE} · commit ${ctx.repo.head} · built ${DAY} · its cited files have not changed since`]);
  assert.ok(look(ctx, ['--file', 'api/Other.java', '--file', './web/form.ts']).lines[0].startsWith(LINE));
  finish(ctx);
});

test('file filter still counts all cited files', t => {
  const ctx = setup(t);
  fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const more = 1;\n');
  arm(ctx);
  assert.match(look(ctx, ['--file', 'api/Dock.java']).lines[0], /· 1 of 2 cited files changed since$/);
  finish(ctx);
});

test('skips notes of other types and repos', t => {
  const ctx = setup(t);
  const note = fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8');
  fs.writeFileSync(path.join(ctx.folder, 'Reference - booking.md'), note.replace('type: code-walkthrough', 'type: reference'));
  fs.writeFileSync(path.join(ctx.folder, 'Walkthrough - other.md'), note.replaceAll('booking-mini', 'other-app'));
  fs.writeFileSync(path.join(ctx.folder, 'Sample.md'), '# no frontmatter\n');
  fs.writeFileSync(path.join(ctx.folder, 'Broken.md'), '---\ntype: code-walkthrough\nrepos: [[[\n');
  arm(ctx);
  const r = look(ctx);
  assert.equal(r.lines.length, 1, r.out);
  assert.ok(r.lines[0].startsWith(LINE));
  finish(ctx);
});

test('inline lists, quotes, BOM and Windows line endings', t => {
  const ctx = setup(t);
  const front = ['---', 'type: code-walkthrough', 'created: "2026-11-01"', 'repos: ["[[booking-mini]]", "[[other]]"]',
    `commits: ['booking-mini@${ctx.repo.head}', other@abc1234]`, '---', '', '# Hand written', '', '![[booking-flow.html|height: 1100px]]', ''].join('\r\n');
  fs.writeFileSync(path.join(ctx.folder, 'Walkthrough - by hand.md'), '﻿' + front);
  arm(ctx);
  const rows = lookUp({ vault: ctx.vault, folder: 'Walkthroughs', repo: 'booking-mini', repoPath: ctx.repo.path });
  assert.deepEqual(rows.map(r => r.note), ['Walkthrough - booking flow', 'Walkthrough - by hand']);
  assert.deepEqual(rows[1], { note: 'Walkthrough - by hand', commit: ctx.repo.head, date: '2026-11-01', cited: 2, changed: 0, missingCommit: false, unchecked: false, noCommit: false });
  finish(ctx);
});

test('newest first', t => {
  const ctx = setup(t);
  const note = fs.readFileSync(path.join(ctx.folder, NOTE), 'utf8');
  fs.writeFileSync(path.join(ctx.folder, 'Walkthrough - booking flow 2.md'), note.replace(`created: ${DAY}`, 'created: 2026-12-01'));
  arm(ctx);
  assert.deepEqual(look(ctx).lines.map(l => l.split(' · ')[2]), ['built 2026-12-01', `built ${DAY}`]);
  finish(ctx);
});

test('a missing, unreadable or empty data file skips the note', t => {
  const ctx = setup(t);
  const dataFile = path.join(ctx.folder, 'booking-flow.walkthrough.json');
  const good = fs.readFileSync(dataFile, 'utf8');
  arm(ctx);
  for (const content of [null, '{ not json', '[]', '{}', '{"cited_files":{"other":["a"]}}', '{"cited_files":{"booking-mini":"api/Dock.java"}}']) {
    if (content === null) fs.rmSync(dataFile); else fs.writeFileSync(dataFile, content);
    ctx.vaultBefore = vaultBytes(ctx.vault);
    const r = look(ctx);
    assert.deepEqual(vaultBytes(ctx.vault), ctx.vaultBefore);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, 'none\n', String(content));
  }
  fs.writeFileSync(dataFile, good);
  ctx.vaultBefore = vaultBytes(ctx.vault);
  look(ctx);
  finish(ctx);
});

test('a missing walkthroughs folder prints none', t => {
  const ctx = arm(setup(t));
  const r = look(ctx, [], { args: ['--vault', ctx.vault, '--folder', 'Nowhere', '--repo', 'booking-mini', '--repo-path', ctx.repo.path] });
  assert.equal(r.status, 0);
  assert.equal(r.out, 'none\n');
  finish(ctx);
});

test('a path that is not a repo says so', t => {
  const ctx = arm(setup(t));
  const plain = path.join(ctx.root, 'plain');
  fs.mkdirSync(plain);
  const r = look(ctx, [], { args: ['--vault', ctx.vault, '--folder', 'Walkthroughs', '--repo', 'booking-mini', '--repo-path', plain] });
  assert.equal(r.status, 1);
  assert.match(r.err, /is not a git repo/);
  assert.doesNotMatch(r.err, /\n\s+at /);
  finish(ctx);
});

test('bad arguments exit 2 with a usage line', t => {
  const ctx = arm(setup(t));
  for (const args of [[], ['--vault', ctx.vault], ['--bogus'], ['--vault'], ['--vault', ctx.vault, '--folder', 'W', '--repo', 'r', '--repo-path', ctx.repo.path, '--file'],
    ['--vault', ctx.vault, '--folder', 'W', '--repo', 'r', '--repo-path', ctx.repo.path, 'stray']]) {
    const r = look(ctx, [], { args });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.err, /usage: walkthrough-look\.mjs/);
  }
  finish(ctx);
});

test('a leading ~ is the home folder', t => {
  const ctx = arm(setup(t));
  const args = ['--vault', '~/vault', '--folder', 'Walkthroughs', '--repo', 'booking-mini', '--repo-path', '~/booking-mini'];
  const r = spawnSync(process.execPath, [LOOK, ...args], { encoding: 'utf8', cwd: ctx.root, env: { ...process.env, HOME: ctx.root } });
  assert.equal(r.stdout.split('\n').filter(Boolean).length, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.startsWith(LINE), r.stdout);
  finish(ctx);
});

test('an ambiguous short hash is resolved, not guessed', t => {
  const ctx = setup(t);
  const short = ctx.repo.head.slice(0, 4);
  // grind a blob whose id starts like the commit's, so a bare short hash is ambiguous to `git diff`
  for (let i = 0; ; i++) {
    const body = `filler ${i}\n`;
    const id = createHash('sha1').update(`blob ${Buffer.byteLength(body)}\0${body}`).digest('hex');
    if (id.startsWith(short)) { execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: ctx.repo.path, input: body }); break; }
  }
  editNote(ctx, s => s.replace(`booking-mini@${ctx.repo.head}`, `booking-mini@${short}`));
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  arm(ctx);
  const r = look(ctx);
  assert.match(r.lines[0], new RegExp(`commit ${short} · .* · 1 of 2 cited files changed since$`), r.out + r.err);
  finish(ctx);
});

test('a cited path git refuses is reported, never counted as unchanged', t => {
  const ctx = setup(t);
  editData(ctx, d => { d.cited_files['booking-mini'].push('../outside.txt', '/etc/hosts'); });
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  arm(ctx);
  const r = look(ctx);
  assert.equal(r.status, 0, r.err);
  assert.match(r.lines[0], /· its cited files could not be checked$/);
  assert.doesNotMatch(r.out, /have not changed/);
  const row = lookUp({ vault: ctx.vault, folder: 'Walkthroughs', repo: 'booking-mini', repoPath: ctx.repo.path })[0];
  assert.equal(row.unchecked, true);
  finish(ctx);
});

test('a subfolder of the repo is refused, naming the top folder', t => {
  const ctx = arm(setup(t));
  const r = look(ctx, [], { args: ['--vault', ctx.vault, '--folder', 'Walkthroughs', '--repo', 'booking-mini', '--repo-path', path.join(ctx.repo.path, 'web')] });
  assert.equal(r.status, 1);
  assert.match(r.err, /top folder/);
  assert.ok(r.err.includes(fs.realpathSync(ctx.repo.path)), r.err);
  finish(ctx);
});

test('a list with no indent is read', t => {
  const ctx = setup(t);
  editNote(ctx, s => s.replace(/^  - /gm, '- '));
  arm(ctx);
  assert.equal(look(ctx).lines[0], `${LINE} · commit ${ctx.repo.head} · built ${DAY} · its cited files have not changed since`);
  finish(ctx);
});

test('a note with an empty commit says so', t => {
  const ctx = setup(t);
  editNote(ctx, s => s.replace(`booking-mini@${ctx.repo.head}`, 'booking-mini@'));
  arm(ctx);
  assert.match(look(ctx).lines[0], /· its commit was not recorded$/);
  finish(ctx);
});

test('a git failure while counting is reported', t => {
  const ctx = setup(t);
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/none'], { cwd: ctx.repo.path });
  arm(ctx);
  const r = look(ctx);
  assert.match(r.lines[0], /· its cited files could not be checked$/, r.out + r.err);
  finish(ctx);
});

const UNCHECKED = /· its cited files could not be checked$/;
function inexact(t, cited, plant = () => {}) {
  const ctx = setup(t);
  plant(ctx);
  editData(ctx, d => { d.cited_files['booking-mini'] = ['web/form.ts', cited]; });
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  arm(ctx);
  const r = look(ctx);
  assert.equal(r.status, 0, r.err);
  assert.match(r.lines[0], UNCHECKED, r.out);
  assert.doesNotMatch(r.out, /have not changed/);
  finish(ctx);
}

test('a doubled slash in a cited path is not trusted', t => inexact(t, 'api//Dock.java'));
test('a ./ segment in a cited path is not trusted', t => inexact(t, 'api/./Dock.java'));

test('wrong letter case in a cited path is not trusted', t => {
  const probe = path.join(tempRoot(t), 'Case.txt');
  fs.writeFileSync(probe, 'x');
  if (!fs.existsSync(probe.replace('Case', 'case'))) return t.skip('this disk respects letter case, so git cannot be fooled this way');
  inexact(t, 'api/dock.java');
});

test('a path through a committed symlink is not trusted', t => inexact(t, 'link/Dock.java',
  ctx => fs.symlinkSync('api', path.join(ctx.repo.path, 'link'))));

test('an ignored, never-committed cited file is not trusted', t => inexact(t, 'ignored.txt', ctx => {
  fs.writeFileSync(path.join(ctx.repo.path, '.gitignore'), 'ignored.txt\n');
  fs.writeFileSync(path.join(ctx.repo.path, 'ignored.txt'), 'edited after the build\n');
}));

test('a file inside an embedded repo is not trusted', t => inexact(t, 'sub/file.ts', ctx => {
  const inner = path.join(ctx.repo.path, 'sub');
  fs.mkdirSync(inner);
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
  fs.writeFileSync(path.join(inner, 'file.ts'), 'const inner = 1;\n');
  for (const a of [['init', '-q'], ['add', '.'], ['commit', '-q', '-m', 'inner']]) execFileSync('git', a, { cwd: inner, env, stdio: 'ignore' });
}));

test('a symlink to a file, cited by the link name, is not trusted', t => inexact(t, 'lnk.java',
  ctx => fs.symlinkSync('api/Dock.java', path.join(ctx.repo.path, 'lnk.java'))));
test('a folder as a cited path is not trusted', t => inexact(t, 'api'));

for (const [flag, label] of [['--assume-unchanged', 'assume-unchanged'], ['--skip-worktree', 'skip-worktree']]) {
  test(`a ${label} cited file with a local edit is not trusted`, t => {
    const ctx = setup(t);
    execFileSync('git', ['update-index', flag, 'web/form.ts'], { cwd: ctx.repo.path });
    fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const hidden = 1;\n');
    arm(ctx);
    const r = look(ctx);
    assert.match(r.lines[0], UNCHECKED, r.out);
    assert.doesNotMatch(r.out, /have not changed/);
    finish(ctx);
  });
}

// The build lists such files as uncommitted; the look-up, which compares against the commit, cannot vouch for them.
test('a walkthrough built over an ignored or flagged cited file is never reported unchanged', t => {
  const cases = {
    ignored: (d, repo) => {
      fs.writeFileSync(path.join(repo.path, '.gitignore'), 'gen/\n');
      commitAll(repo.path, 'Ignore generated code');
      fs.mkdirSync(path.join(repo.path, 'gen'));
      fs.writeFileSync(path.join(repo.path, 'gen', 'out.js'), 'const generated = 1;\n');
      d.extend.push({ stop: 's1', file: 'gen/out.js', lines: [1, 1], text: 'Generated code.' });
    },
    flagged: (d, repo) => execFileSync('git', ['update-index', '--assume-unchanged', 'web/form.ts'], { cwd: repo.path }),
  };
  for (const [name, change] of Object.entries(cases)) {
    const ctx = arm(setup(t, change));
    const r = look(ctx);
    assert.equal(r.status, 0, r.err);
    assert.match(r.lines[0], UNCHECKED, `${name}: ${r.out}`);
    assert.doesNotMatch(r.out, /have not changed/);
    finish(ctx);
  }
});

const objectNames = repo => {
  const out = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else out.push(path.relative(repo, p));
  } };
  walk(path.join(repo, '.git', 'objects'));
  return out.sort();
};

test('a blobless clone is not written to, and the line is honest', t => {
  const ctx = setup(t);
  execFileSync('git', ['config', 'uploadpack.allowFilter', 'true'], { cwd: ctx.repo.path });
  fs.appendFileSync(path.join(ctx.repo.path, 'api/Dock.java'), 'int extra = 31;\n');
  commitAll(ctx.repo.path, 'Change the dock check');
  const clone = path.join(ctx.root, 'clone');
  const c = spawnSync('git', ['clone', '-q', '--filter=blob:none', `file://${ctx.repo.path}`, clone], { encoding: 'utf8' });
  if (c.status !== 0) return t.skip(`this git cannot make a blobless clone from a local remote: ${c.stderr.trim()}`);
  ctx.repo = { ...ctx.repo, path: clone };
  arm(ctx);
  const before = objectNames(clone);
  const r = look(ctx);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(objectNames(clone), before);
  assert.doesNotMatch(r.out, /have not changed/);
  assert.match(r.lines[0], /· (\d of \d cited files changed since|its cited files could not be checked)$/, r.out);
  finish(ctx);
});

test('a GIT_DIR in the caller\'s environment does not move the look-up to another repo', t => {
  const ctx = setup(t);
  const other = makeRepo(path.join(ctx.root, 'other'), { files: { 'other.txt': 'another repo\n' }, message: 'Another repo' });
  arm(ctx);
  const r = look(ctx, [], { env: { GIT_DIR: path.join(other.path, '.git') } });
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(r.lines, [`${LINE} · commit ${ctx.repo.head} · built ${DAY} · its cited files have not changed since`]);
  finish(ctx);
});

test('a note with no recorded commit says so', t => {
  const ctx = setup(t);
  editNote(ctx, s => s.replace(/^commits:\n(  - .*\n)+/m, ''));
  arm(ctx);
  assert.match(look(ctx).lines[0], /· its commit was not recorded$/);
  finish(ctx);
});

test('read only', t => {
  const ctx = setup(t);
  fs.appendFileSync(path.join(ctx.repo.path, 'web/form.ts'), 'const more = 1;\n');
  arm(ctx);
  look(ctx);
  finish(ctx);
});
