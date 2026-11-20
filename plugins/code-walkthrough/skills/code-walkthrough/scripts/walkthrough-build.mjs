#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadData, shapeErrors, repoByName } from './lib/data.mjs';
import { repoFacts, topFolderAbove } from './lib/git.mjs';
import { checkCode } from './lib/code.mjs';
import { checkQuotes } from './lib/quotes.mjs';
import { chalkTalkAt, buildMap } from './lib/map.mjs';
import { pageModel, assemblePage } from './lib/page.mjs';
import { replyLines, questionLines } from './lib/words.mjs';
import { slugOf, noteBaseOf, chooseNames } from './lib/names.mjs';
import { noteText } from './lib/note.mjs';

const USAGE = 'usage: walkthrough-build.mjs <data.json> --out <working folder> --vault <vault> --folder <walkthroughs folder> --chalk <chalk-talk folder | none> [--work-root <dir>]... [--write] [--same-day keep|replace] [--date YYYY-MM-DD]';

class Refused extends Error {}
const refuse = msg => { throw new Refused(msg); };

const home = p => p.replace(/^~(?=\/|$)/, os.homedir());

function parseArgs(argv) {
  const a = { workRoots: [], write: false };
  const needs = new Set(['--out', '--vault', '--folder', '--chalk', '--work-root', '--same-day', '--date']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') { a.write = true; continue; }
    if (needs.has(arg)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) refuse(`${arg} needs a value`);
      const value = ['--out', '--vault', '--chalk', '--work-root'].includes(arg) ? home(v) : v;
      if (arg === '--work-root') a.workRoots.push(value);
      else a[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
      continue;
    }
    if (arg.startsWith('--')) refuse(`unknown option ${arg}`);
    if (a.dataFile !== undefined) refuse(`only one data file is allowed, got ${a.dataFile} and ${arg}`);
    a.dataFile = home(arg);
  }
  if (a.dataFile === undefined) refuse('no data file given');
  for (const k of ['out', 'vault', 'folder', 'chalk']) if (a[k] === undefined) refuse(`--${k} is needed`);
  if (a.sameDay !== undefined && !['keep', 'replace'].includes(a.sameDay)) refuse('--same-day must be keep or replace');
  if (a.date === undefined) a.date = new Date().toLocaleDateString('en-CA');
  const d = new Date(`${a.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== a.date) refuse('--date must be a real date as YYYY-MM-DD');
  return a;
}

// Real path of p: its nearest folder that exists, resolved through links by the system (so a ".."
// after a link goes where the system goes), with the part that does not exist yet put back on.
// A missing part holding ".." cannot be judged, so it is refused.
function realOf(p) {
  const raw = path.isAbsolute(p) ? p : `${process.cwd()}${path.sep}${p}`;
  const segs = raw.split(path.sep);
  const tail = [];
  while (segs.length > 1) {
    const here = segs.join(path.sep) || path.sep;
    try { return path.join(fs.realpathSync.native(here), ...tail.reverse()); }
    catch { const last = segs.pop(); if (last !== '') tail.push(last); }
    if (tail.includes('..')) refuse(`${p} goes through a folder that does not exist and then ".."; give a plain path`);
  }
  return path.join(path.sep, ...tail.reverse());
}

// Whether the disk holding p ignores letter case, probed on its nearest existing folder with a letter in its name.
function ignoresCase(p) {
  const segs = p.split(path.sep);
  for (let n = segs.length; n > 1; n--) {
    const here = segs.slice(0, n).join(path.sep);
    const name = segs[n - 1];
    const flipped = name.replace(/[a-z]/gi, c => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    if (flipped === name || !fs.existsSync(here)) continue;
    return fs.existsSync(segs.slice(0, n - 1).concat(flipped).join(path.sep) || path.sep);
  }
  return false;
}
const inside = (child, parent) => {
  const fold = ignoresCase(parent) ? s => s.toLowerCase() : s => s;
  const c = fold(child), p = fold(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
};

// The data file's own rules, before any check can rely on it.
function dataProblem(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'is not a walkthrough';
  for (const k of ['journey', 'short_name', 'summary', 'client']) if (typeof data[k] !== 'string' || !data[k].trim()) return `has no ${k}`;
  if (!Array.isArray(data.repos) || !data.repos.length) return 'has no repos';
  if (!data.repos.every(r => r && typeof r.name === 'string' && r.name && typeof r.path === 'string' && r.path)) return 'needs every repo to have a name and a path';
  if (!Array.isArray(data.stops) || !data.stops.every(s => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string')) return 'needs stops, each with an id and a name';
  return null;
}

const failLine = f => `FAIL ${f.where}: ${f.why}`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  // `none` is a word, not a folder. Any other value must hold chalk-talk, or the map and its check would quietly go.
  let chalk = null;
  if (args.chalk !== 'none') {
    const dir = path.resolve(args.chalk);
    chalk = chalkTalkAt(dir);
    if (!chalk) refuse(`no chalk-talk at ${dir}; pass the folder that holds scripts/build.mjs, or none`);
  }
  let dataReal;
  try { dataReal = fs.realpathSync.native(args.dataFile); } catch { refuse(`${args.dataFile} cannot be read`); }
  args.dataFile = dataReal;
  // No path check can see a second name (a hard link) for the data file, and rewriting it would change that file too.
  const dataStat = fs.statSync(dataReal);
  if (dataStat.isFile() && dataStat.nlink > 1) refuse(`${dataReal} has another name on disk (a hard link), and the build rewrites its data file; copy the data file to a new file and build from the copy`);
  const loaded = loadData(args.dataFile);
  if (loaded.error) refuse(loaded.error);
  const data = loaded.data;
  const problem = dataProblem(data);
  if (problem) refuse(`${args.dataFile} ${problem}`);

  let vault;
  try { vault = fs.realpathSync.native(args.vault); if (!fs.statSync(vault).isDirectory()) throw new Error(); }
  catch { refuse(`the vault folder ${args.vault} does not exist`); }
  if (args.folder.split(/[\\/]/).includes('..')) refuse(`--folder ${args.folder} must not use ".."`);
  const folderPath = path.resolve(args.vault, args.folder);
  if (!inside(realOf(folderPath), vault) || realOf(folderPath) === vault) refuse(`--folder ${args.folder} is not a folder inside the vault`);

  const out = realOf(args.out);
  const outReal = out;
  const keepOut = [['the vault', vault], ...data.repos.map(r => [`the repo ${r.name}`, realOf(repoByName(data, r.name).path)]), ...args.workRoots.map(w => [`the work folder ${w}`, realOf(w)])];
  for (const [what, p] of keepOut) if (inside(outReal, p)) refuse(`--out ${args.out} is inside ${what}; use a working folder outside the vault, the repos and the work folders`);

  for (const [what, p] of keepOut) if (inside(dataReal, p)) refuse(`${args.dataFile} is inside ${what}, and the build rewrites its data file; copy the data file to the working folder and build from the copy`);

  // Cited paths are named from the top folder, as git and the look-up name them.
  for (const r of data.repos) {
    const repoPath = repoByName(data, r.name).path;
    const top = topFolderAbove(repoPath);
    if (top !== null) refuse(`the repo ${r.name} is given as ${repoPath}, which is inside a repo, not its top folder; set its path to the top folder${top ? `, ${top}` : ''}`);
  }

  const shape = shapeErrors(data);
  if (shape.length) { console.log(shape.map(e => `FAIL the walkthrough: ${e}`).join('\n')); return 1; }

  const slug = slugOf(data.short_name);
  const failures = [];
  data.built = args.date;
  const cited = {};
  for (const r of data.repos) cited[r.name] = new Set();
  for (const b of [...data.stops.flatMap(s => s.code || []), ...(data.extend || [])]) cited[repoByName(data, b.repo).name].add(b.file);
  data.cited_files = {};
  const misnamedIn = {};
  for (const r of data.repos) {
    const files = [...cited[r.name]].sort();
    data.cited_files[r.name] = files;
    try {
      const { misnamed, ...facts } = repoFacts(repoByName(data, r.name).path, files);
      Object.assign(r, facts);
      misnamedIn[r.name] = new Set(misnamed);
    } catch (e) { failures.push({ where: r.name, why: e.message.split('\n')[0] }); }
  }

  const code = checkCode(data, { misnamed: (repo, file) => misnamedIn[repo]?.has(file) === true });
  failures.push(...code.failures);
  const { failures: quoteFailures, ...quotes } = checkQuotes(data, { vault, gh: process.env.CW_GH !== '0' });
  failures.push(...quoteFailures);

  let map = { built: false };
  let mapHtml = null;
  if (chalk) {
    try {
      const m = buildMap(data, { chalk: chalk.dir, out, slug });
      failures.push(...m.failures);
      mapHtml = m.html;
      map = { built: m.html != null, arrows: m.arrows, traced: m.traced, guesses: m.guesses, broken: m.broken, layoutChecked: m.layout.checked };
    } catch (e) { failures.push({ where: 'map', why: e.message }); }
    data.map_tool = { name: 'chalk-talk', commit: chalk.commit };
  } else {
    delete data.map_tool;
    // chalk-talk installed where SKILL.md step 2 looks (the home folder, then the project the command runs in): the command left the map out.
    if ([os.homedir(), process.cwd()].some(d => chalkTalkAt(path.join(d, '.claude', 'skills', 'chalk-talk')))) map.leftOut = true;
  }
  data.checks = { code: { blocks: code.blocks }, quotes, map };

  const writeData = () => fs.writeFileSync(args.dataFile, JSON.stringify(data, null, 2) + '\n');
  writeData();
  if (failures.length) { console.log(failures.map(failLine).join('\n')); return 1; }

  const names = chooseNames({ folderPath, slug, noteBase: noteBaseOf(data.short_name), date: args.date, sameDay: args.sameDay });
  console.log([...replyLines(data), ...questionLines(data)].join('\n'));
  if (names.clash) { console.log(`SAME DAY ${names.clash.join(', ')}`); return 3; }
  if (names.earlier) data.earlier = names.earlier; else delete data.earlier;
  writeData();

  const files = { page: assemblePage(pageModel(data), mapHtml), note: noteText(data, names) };
  fs.mkdirSync(out, { recursive: true });
  // Each name is removed first, so a link planted at it is replaced, never written through.
  const put = (name, content) => { const p = path.join(out, name); fs.rmSync(p, { force: true }); fs.writeFileSync(p, content, { flag: 'wx' }); };
  put(names.page, files.page);
  put(names.note, files.note);
  // The input may already be this very file: never copy it onto itself.
  const outData = path.join(out, names.data);
  if (outData !== dataReal) put(names.data, fs.readFileSync(args.dataFile));

  if (args.write) {
    const copies = [names.page, names.data, names.note];
    const flag = names.replace ? 0 : fs.constants.COPYFILE_EXCL;
    if (!names.replace) for (const n of copies) if (fs.existsSync(path.join(folderPath, n))) { console.log(failLine({ where: n, why: 'it is already in the vault, so nothing was written' })); return 1; }
    fs.mkdirSync(folderPath, { recursive: true });
    for (const n of copies) {
      fs.copyFileSync(path.join(out, n), path.join(folderPath, n), flag);
      console.log(`WROTE ${path.join(folderPath, n)}`);
    }
  }
  return 0;
}

try { process.exitCode = main(); }
catch (e) {
  if (e instanceof Refused) { console.error(`walkthrough-build: ${e.message}\n${USAGE}`); process.exitCode = 2; }
  else { console.log(`FAIL build: ${e.message.split('\n')[0]}`); process.exitCode = 1; }
}
