import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitRead, repoFacts, gitEnv } from '../lib/git.mjs';
import { tempRoot, makeRepo, makeIndexStale, repoSnapshot } from './helpers.mjs';

const files = { 'api/Dock.java': 'a\n', 'web/form.ts': 'b\n' };
const repoIn = (t, extra = {}) => makeRepo(path.join(tempRoot(t), 'r'), { files, message: 'first', ...extra });

test('facts on a clean repo', t => {
  const r = repoIn(t);
  const want = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: r.path, encoding: 'utf8' }).trim();
  assert.deepEqual(repoFacts(r.path, ['api/Dock.java']), { commit: want, uncommitted: [], misnamed: [] });
});

test('modified cited file is uncommitted', t => {
  const r = repoIn(t, { dirty: { 'api/Dock.java': 'changed\n', 'web/form.ts': 'changed\n' } });
  assert.deepEqual(repoFacts(r.path, ['api/Dock.java']).uncommitted, ['api/Dock.java']);
});

test('untracked and spaced paths count as uncommitted', t => {
  const r = repoIn(t, { untracked: { 'api/New Rule.java': 'x\n' } });
  assert.deepEqual(repoFacts(r.path, ['api/New Rule.java']).uncommitted, ['api/New Rule.java']);
});

test('a path that is not a repo is an error', t => {
  assert.throws(() => repoFacts(tempRoot(t), []), /not a git repo/);
});

test('writing subcommands are refused', t => {
  const r = repoIn(t);
  for (const args of [['checkout', 'main'], ['stash'], ['worktree', 'add', 'x']]) {
    assert.throws(() => gitRead(r.path, args), /read only/);
  }
});

test('facts leave the repo untouched', t => {
  const r = repoIn(t);
  makeIndexStale(r.path);
  const before = repoSnapshot(r.path);
  repoFacts(r.path, ['api/Dock.java', 'web/form.ts']);
  const after = repoSnapshot(r.path);
  assert.equal(after.porcelain, before.porcelain);
  assert.ok(before.index.equals(after.index));
});

test('git is never given the caller\'s GIT_DIR and the like', () => {
  const listed = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const saved = Object.fromEntries(listed.map(k => [k, process.env[k]]));
  let env;
  try {
    for (const k of listed) process.env[k] = '/nowhere';
    env = gitEnv();
  } finally {
    for (const k of listed) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  assert.deepEqual(listed.filter(k => k in env), []);
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(env.PATH, process.env.PATH);
});

test('cited paths are literal, not wildcards', t => {
  const f = { 'app/[id]/page.ts': 'a\n', 'app/i/page.ts': 'b\n' };
  const r = makeRepo(path.join(tempRoot(t), 'r'), { files: f, message: 'first', dirty: { 'app/[id]/page.ts': 'x\n', 'app/i/page.ts': 'y\n' } });
  assert.deepEqual(repoFacts(r.path, ['app/[id]/page.ts']).uncommitted, ['app/[id]/page.ts']);
});
