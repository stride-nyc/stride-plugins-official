import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitRead, isCommitHash, plainRelative } from './git.mjs';

// Our own copy of the build command's `home`: that file runs its main when imported.
export const home = p => p.replace(/^~(?=\/|$)/, os.homedir());

const unquote = s => {
  const v = s.trim();
  return v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) ? v.slice(1, -1) : v;
};

// The frontmatter block as { key: string | string[] }; reads block and inline lists. Null when there is none.
export function frontmatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return null;
  const out = {};
  let key = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s*(.*)$/.exec(line);
    if (item && key && Array.isArray(out[key])) { out[key].push(unquote(item[1])); continue; }
    const kv = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!kv) { key = null; continue; }
    key = kv[1];
    const v = kv[2].trim();
    if (v === '') out[key] = [];
    else if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      // split on commas outside quotes
      const parts = inner.match(/"[^"]*"|'[^']*'|[^,]+/g) || [];
      out[key] = parts.map(unquote).filter(s => s !== '');
    } else out[key] = unquote(v);
  }
  return out;
}

const bodyOf = text => {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return (end < 0 ? lines : lines.slice(end + 1)).join('\n');
};

const asList = v => (Array.isArray(v) ? v : v ? [v] : []);
const cleanPath = f => f.replace(/\\/g, '/').replace(/^(\.\/)+/, '');

function citedFilesOf(notePath, noteText, repo) {
  const link = /\[\[([^\]|#]+?\.html)(?:[|#][^\]]*)?\]\]/i.exec(bodyOf(noteText));
  if (!link) return null;
  const dataPath = path.join(path.dirname(notePath), path.basename(link[1]).replace(/\.html$/i, '.walkthrough.json'));
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const files = data && data.cited_files && data.cited_files[repo];
    if (!Array.isArray(files)) return null;
    return [...new Set(files.filter(f => typeof f === 'string' && f !== '').map(cleanPath))];
  } catch { return null; }
}

// The full id of the commit, or null when the note's hash is not a commit in this repo.
function fullCommit(repoPath, hash) {
  if (!isCommitHash(hash)) return null;
  try { return gitRead(repoPath, ['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`]).trim() || null; } catch { return null; }
}

// A cited path is checkable only when git names it exactly: it was in the commit under that name, or it is
// new since and listed (tracked or untracked, not ignored). Anything else could be hidden from the counts.
function checkable(repoPath, full, file) {
  try {
    if (!fs.lstatSync(path.join(repoPath, file)).isFile()) return false; // a link or a folder: git tracks something else
  } catch (e) { if (e.code !== 'ENOENT') return false; }
  let entry;
  try {
    const listed = gitRead(repoPath, ['ls-files', '-v', '-z', '--cached', '--others', '--exclude-standard', '--', file]).split('\0');
    entry = listed.find(l => l.slice(2) === file);
  } catch { return false; }
  if (entry && (/[a-z]/.test(entry[0]) || entry[0] === 'S')) return false; // assume-unchanged or skip-worktree hides edits
  try { gitRead(repoPath, ['cat-file', '-e', `${full}:${file}`]); return true; } catch { /* maybe new since */ }
  return entry !== undefined;
}

// { changed, unchecked }: unchecked is true when any cited path could not be given to git or git failed.
function changedFiles(repoPath, full, cited) {
  const safe = cited.filter(plainRelative);
  let unchecked = safe.length < cited.length;
  if (!safe.length) return { changed: 0, unchecked: true };
  if (!safe.every(f => checkable(repoPath, full, f))) return { changed: 0, unchecked: true };
  const set = new Set(safe);
  const hit = new Set();
  try {
    const diff = gitRead(repoPath, ['diff', '--name-only', '-z', '--end-of-options', full, 'HEAD', '--', ...safe]).split('\0');
    for (const f of diff) if (set.has(f)) hit.add(f);
    const status = gitRead(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...safe]).split('\0');
    for (let i = 0; i < status.length; i++) {
      const entry = status[i];
      if (entry.length < 4) continue;
      if (set.has(entry.slice(3))) hit.add(entry.slice(3));
      if (/[RC]/.test(entry.slice(0, 2))) { i++; if (set.has(status[i])) hit.add(status[i]); }
    }
  } catch { unchecked = true; }
  return { changed: hit.size, unchecked };
}

// Throws a plain Error only when repoPath is not the top folder of a git repo; every other problem skips that note.
export function lookUp({ vault, folder, repo, repoPath, files = [] }) {
  let prefix;
  try { prefix = gitRead(repoPath, ['rev-parse', '--show-prefix']).trim(); }
  catch { throw new Error(`${repoPath} is not a git repo`); }
  if (prefix) {
    let top = '';
    try { top = gitRead(repoPath, ['rev-parse', '--show-toplevel']).trim(); } catch {}
    throw new Error(`${repoPath} is inside a repo, not its top folder${top ? `; pass the top folder, ${top}` : ''}`);
  }
  const dir = path.join(vault, folder);
  let names;
  try { names = fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.md')); } catch { return []; }
  const wanted = files.map(cleanPath);
  const rows = [];
  for (const name of names) {
    const notePath = path.join(dir, name);
    let text, front;
    try { text = fs.readFileSync(notePath, 'utf8'); front = frontmatter(text); } catch { continue; }
    if (!front || front.type !== 'code-walkthrough' || !asList(front.repos).includes(`[[${repo}]]`)) continue;
    const cited = citedFilesOf(notePath, text, repo);
    if (!cited) continue;
    if (wanted.length && !wanted.some(f => cited.includes(f))) continue;
    const entry = asList(front.commits).find(c => c.startsWith(`${repo}@`));
    const commit = entry ? entry.slice(repo.length + 1) : '';
    const full = fullCommit(repoPath, commit);
    const { changed, unchecked } = full ? changedFiles(repoPath, full, cited) : { changed: 0, unchecked: false };
    rows.push({ note: name.replace(/\.md$/i, ''), commit, date: typeof front.created === 'string' ? front.created : '', cited: cited.length, changed, missingCommit: !full, unchecked, noCommit: !commit });
  }
  return rows.sort((a, b) => (a.date === b.date ? (a.note < b.note ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export function lookLine(r) {
  const tail = r.noCommit ? 'its commit was not recorded'
    : r.missingCommit ? 'its commit is no longer in the repo'
    : r.unchecked ? 'its cited files could not be checked'
    : r.changed === 0 ? 'its cited files have not changed since'
    : `${r.changed} of ${r.cited} cited files changed since`;
  return `[[${r.note}]] · commit ${r.commit || 'not recorded'} · built ${r.date || 'date not recorded'} · ${tail}`;
}
