#!/usr/bin/env node
import { lookUp, lookLine, home } from './lib/look.mjs';

const USAGE = 'usage: walkthrough-look.mjs --vault <vault> --folder <walkthroughs folder> --repo <name> --repo-path <path> [--file <path>]...';

class Refused extends Error {}
const refuse = msg => { throw new Refused(msg); };

function parseArgs(argv) {
  const a = { files: [] };
  const needs = new Set(['--vault', '--folder', '--repo', '--repo-path', '--file']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!needs.has(arg)) refuse(arg.startsWith('--') ? `unknown option ${arg}` : `unexpected ${arg}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) refuse(`${arg} needs a value`);
    if (arg === '--file') a.files.push(v);
    else a[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = ['--vault', '--repo-path'].includes(arg) ? home(v) : v;
  }
  for (const k of ['vault', 'folder', 'repo', 'repoPath']) if (a[k] === undefined) refuse(`--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())} is needed`);
  return a;
}

try {
  const a = parseArgs(process.argv.slice(2));
  const rows = lookUp({ vault: a.vault, folder: a.folder, repo: a.repo, repoPath: a.repoPath, files: a.files });
  console.log(rows.length ? rows.map(lookLine).join('\n') : 'none');
} catch (e) {
  if (e instanceof Refused) { console.error(`walkthrough-look: ${e.message}\n${USAGE}`); process.exitCode = 2; }
  else { console.error(`walkthrough-look: ${String(e.message).split('\n')[0]}`); process.exitCode = 1; }
}
