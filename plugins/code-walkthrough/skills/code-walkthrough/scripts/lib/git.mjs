import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const READ_ONLY_GIT = ['rev-parse', 'status', 'log', 'show', 'diff', 'cat-file', 'ls-files'];

// What `git rev-parse --local-env-vars` lists (git 2.50): the variables that point git at another repo,
// index, object store or config, over `-C`. Written out here so no git has to run before the first call.
const LOCAL_ENV_VARS = ['GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR'];

// The environment for git and for whatever runs git (gh, chalk-talk): the caller's, without those variables, optional locks off.
export function gitEnv() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const k of LOCAL_ENV_VARS) delete env[k];
  return env;
}

export function gitRead(repoPath, args) {
  if (!READ_ONLY_GIT.includes(args[0])) throw new Error(`git ${args[0]} is refused: this tool is read only`);
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    env: { ...gitEnv(), GIT_LITERAL_PATHSPECS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// A path git can be given: relative, and never stepping out of the repo.
export const plainRelative = f => !f.startsWith('/') && !/^[A-Za-z]:/.test(f) && !f.split('/').includes('..');

// The repo's top folder, when repoPath is a folder below it; null at the top folder, or outside any repo.
export function topFolderAbove(repoPath) {
  let prefix;
  try { prefix = gitRead(repoPath, ['rev-parse', '--show-prefix']).trim(); } catch { return null; }
  if (!prefix) return null;
  try { return gitRead(repoPath, ['rev-parse', '--show-toplevel']).trim(); } catch { return ''; }
}

// { commit, uncommitted, misnamed } for the cited files of a repo, given from its top folder.
// uncommitted: the files that differ from the commit, or whose edits git would not show: changed, staged,
// deleted, untracked (ignored or not), or flagged assume-unchanged or skip-worktree.
// misnamed: the files on disk that git does not list under exactly that name (`./`, `//`, `..`, another
// letter case, a link, a folder, a file of an embedded repo). A file not on disk is left to the code check.
export function repoFacts(repoPath, files) {
  let commit;
  try { commit = gitRead(repoPath, ['rev-parse', '--short=7', 'HEAD']).trim(); }
  catch { throw new Error(`${repoPath} is not a git repo`); }
  const tags = new Map();
  const asked = files.filter(plainRelative);
  if (asked.length) {
    // No --exclude-standard, so ignored files are listed too, tagged `?` like any untracked file.
    for (const l of gitRead(repoPath, ['ls-files', '-v', '-z', '--cached', '--others', '--', ...asked]).split('\0')) if (l.length > 2) tags.set(l.slice(2), l[0]);
  }
  const misnamed = [], named = [], differ = new Set();
  for (const f of files) {
    const tag = tags.get(f);
    let onDisk = null;
    try { onDisk = fs.lstatSync(path.join(repoPath, f)); } catch { /* not there: the code check says the file is gone */ }
    if (onDisk && (!onDisk.isFile() || tag === undefined)) { misnamed.push(f); continue; }
    if (tag === undefined) continue;
    named.push(f);
    if (tag === '?' || tag === 'S' || /[a-z]/.test(tag)) differ.add(f);
  }
  if (named.length) {
    const parts = gitRead(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...named]).split('\0');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (entry.length < 4) continue;
      differ.add(entry.slice(3));
      if (/[RC]/.test(entry.slice(0, 2))) i++;
    }
  }
  return { commit, uncommitted: files.filter(f => differ.has(f)), misnamed };
}

export const isCommitHash = s => typeof s === 'string' && /^[0-9a-f]{4,40}$/i.test(s);
