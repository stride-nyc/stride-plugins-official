import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expectedText } from '../lib/code.mjs';
import { gitEnv } from '../lib/git.mjs';
import { BUDGET_MS } from '../lib/settings.mjs';

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test Author', GIT_AUTHOR_EMAIL: 'author@example.com',
  GIT_COMMITTER_NAME: 'Test Author', GIT_COMMITTER_EMAIL: 'author@example.com',
};
// gitEnv: a caller's GIT_DIR or GIT_INDEX_FILE (a git hook sets them) would send fixture commits into another repo.
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...gitEnv(), ...IDENTITY }, stdio: ['ignore', 'pipe', 'pipe'] });

export function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const put = (dir, files) => {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
};

export function commitAll(repoPath, message) {
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-q', '-m', message]);
  return git(repoPath, ['rev-parse', '--short=7', 'HEAD']).trim();
}

export function makeRepo(dir, { files, message, dirty = {}, untracked = {} }) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  put(dir, files);
  const head = commitAll(dir, message);
  put(dir, dirty);
  put(dir, untracked);
  return { path: dir, head };
}

// Moves a tracked file's mtime forward so a plain `git status` would rewrite .git/index.
export function makeIndexStale(repoPath) {
  const file = git(repoPath, ['ls-files']).split('\n')[0];
  const when = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(repoPath, file), when, when);
}

export function repoSnapshot(repoPath) {
  const porcelain = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repoPath, encoding: 'utf8', env: gitEnv() });
  const idx = path.join(repoPath, '.git', 'index');
  return { porcelain, index: fs.existsSync(idx) ? fs.readFileSync(idx) : null };
}

export function chalkDir() {
  if (process.env.CW_CHALK) return process.env.CW_CHALK;
  const dir = path.join(os.homedir(), '.claude', 'skills', 'chalk-talk');
  return fs.existsSync(path.join(dir, 'scripts', 'build.mjs')) ? dir : null;
}

const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

// Our own copy of chalk-talk's findChrome (scripts/check.mjs), so page tests run without chalk-talk.
// Copied from chalk-talk, MIT licence: https://github.com/oztrkemree/chalk-talk (commit 4f88ead).
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const env = process.env, cands = [];
  if (process.platform === 'win32') {
    const bases = [env.LOCALAPPDATA, env.PROGRAMFILES || 'C:/Program Files', env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'].filter(Boolean);
    for (const app of ['Google/Chrome/Application/chrome.exe', 'Chromium/Application/chrome.exe',
      'Microsoft/Edge/Application/msedge.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe'])
      for (const b of bases) cands.push(path.join(b, app));
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  }
  const found = cands.find(isFile);
  if (found) return found;
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser', 'chrome', 'msedge'])
    for (const dir of (env.PATH || '').split(path.delimiter)) for (const x of exts) if (dir && isFile(path.join(dir, name + x))) return path.join(dir, name + x);
  return null;
}

// check.mjs gives each Chrome run about 30 s of real time before it stops waiting.
const WATCHDOG_MS = 30_000;

// Copied from chalk-talk's killTree (scripts/check.mjs), MIT licence: https://github.com/oztrkemree/chalk-talk (commit 4f88ead).
function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

// Runs a copy of `file`, with `head` just after <head> and `body` just before </body>, in headless
// Chrome the way chalk-talk's check.mjs does, and resolves to the DOM Chrome dumps. The copy and the
// Chrome profile live in their own temp folder, removed afterwards.
export async function dumpDom(file, { query = '', hash = '', size = [1280, 900], budgetMs = BUDGET_MS, head = '', body = '' } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('dumpDom: no Chrome found');
  const page = fs.readFileSync(file, 'utf8');
  const h = page.indexOf('<head>'), b = page.lastIndexOf('</body>');
  if (h < 0 || b < h) throw new Error(`dumpDom: ${file} has no <head> or no </body> after it`);
  const at = h + '<head>'.length;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-chrome-'));
  try {
    const copy = path.join(dir, path.basename(file));
    fs.writeFileSync(copy, page.slice(0, at) + head + page.slice(at, b) + body + page.slice(b));
    const url = pathToFileURL(copy).href + (query ? `?${query}` : '') + (hash ? `#${hash}` : '');
    const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--virtual-time-budget=${budgetMs}`, `--user-data-dir=${path.join(dir, 'profile')}`, `--window-size=${size[0]},${size[1]}`, '--dump-dom', url];
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.setEncoding('utf8');
    let out = '', failed = null, watchdog;
    const closed = new Promise(resolve => child.on('close', resolve));
    // Stop as soon as the dump is whole: the document's own </html> ends it.
    await new Promise(resolve => {
      child.stdout.on('data', d => { out += d; if (/<\/html>\s*$/.test(out)) resolve(); });
      child.on('close', resolve);
      child.on('error', e => { failed = e; resolve(); });
      watchdog = setTimeout(resolve, WATCHDOG_MS);
    });
    clearTimeout(watchdog);
    if (failed) throw new Error(`dumpDom: could not start ${chrome}: ${failed.message}`);
    killTree(child);
    await Promise.race([closed, new Promise(r => { const t = setTimeout(r, 2000); closed.then(() => clearTimeout(t)); })]);
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

export function makeVault(dir, notes) {
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault, { recursive: true });
  put(vault, notes);
  return vault;
}

const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

export function bookingRepo(root) {
  const form = lines(12, n => n === 6 ? '  retry(2);' : `const form${n} = ${n};`);
  const dock = lines(30, n =>
    n === 3 ? '\tint indented = 3;' :
    n === 5 ? '// Docks close on Sundays for cleaning.' :
    n === 9 ? 'int spaced = 9;  ' : `int dock${n} = ${n};`);
  return makeRepo(path.join(root, 'booking-mini'), {
    files: {
      'web/form.ts': form,
      'api/Dock.java': dock,
      'docs/adr.md': 'Every booking must reach the yard service, so the API sends each one on.\n',
    },
    message: 'Add the booking flow\n\nEvery booking goes through the API so the yard service hears about it.',
  });
}

export function sampleData(repo) {
  const read = f => fs.readFileSync(path.join(repo.path, f), 'utf8');
  const text = (file, lines, leftOut = []) => expectedText(read(file), lines, leftOut).text;
  return {
    format: 1,
    journey: 'Saving a booking, from the form to the dock check',
    short_name: 'booking flow',
    summary: 'A booking leaves the form, reaches the API and is checked against dock days.',
    client: 'acme',
    repos: [{ name: 'booking-mini', path: repo.path }],
    stops: [
      {
        id: 's1', name: 'The form sends the booking', summary: 'Collects the fields and posts them.',
        code: [{ file: 'web/form.ts', lines: [1, 12], function: 'saveBooking', text: text('web/form.ts', [1, 12]), key_lines: [6], left_out: [] }],
        what: 'The form gathers the fields and sends them to the API.',
        data: { in: 'The form fields.', out: 'A request to the API.' },
        notes: ['retry(2) tries the send again, up to two more times.'],
        reasons: [{ text: 'Why does the form retry twice?', source: { kind: 'not-recorded' } }],
        guesses: ['The retries may cover a slow first call.'],
        map_step: { flow: ['e1'], focus: ['form'] },
      },
      {
        id: 's2', name: 'The API checks the dock day', summary: 'Rejects days the dock is closed.',
        code: [{ file: 'api/Dock.java', lines: [1, 30], function: 'checkDay', text: text('api/Dock.java', [1, 30], [[12, 20]]), key_lines: [5], left_out: [[12, 20]] }],
        what: 'The API looks up the dock day and refuses closed days.',
        data: { in: 'A booking with a day.', out: 'Accepted, or refused with a reason.' },
        notes: [],
        reasons: [
          { text: 'Docks are closed on Sundays for cleaning.', quote: 'Docks close on Sundays for cleaning.', source: { kind: 'code-comment', ref: { file: 'api/Dock.java', line: 5 } } },
          { text: 'Every booking must reach the yard service.', quote: 'Every booking must reach the yard service', source: { kind: 'design-doc', ref: { path: 'docs/adr.md' } } },
        ],
        guesses: [],
        map_step: { focus: ['api'] },
      },
      {
        id: 's3', name: 'The yard service hears about it', summary: 'The API passes the booking on.',
        code: [
          { file: 'api/Dock.java', lines: [25, 30], function: 'sendOn', text: text('api/Dock.java', [25, 30]), key_lines: [], left_out: [] },
          { file: 'web/form.ts', lines: [6, 6], function: 'saveBooking', text: text('web/form.ts', [6, 6]), key_lines: [6], left_out: [] },
        ],
        what: 'The API sends the saved booking on to the yard service.',
        data: { in: 'The saved booking.', out: 'A message to the yard service.' },
        notes: [],
        reasons: [{ text: 'Every booking goes through the API so the yard service hears about it.', quote: 'Every booking goes through the API so the yard service hears about it.', source: { kind: 'commit', ref: { hash: repo.head } } }],
        guesses: [],
        map_step: { flow: ['e2'], focus: ['yard'] },
      },
    ],
    map: {
      style: 'studio',
      nodes: [
        { id: 'form', kind: 'browser', label: 'Booking form', sub: 'web/form.ts', at: [0, 0], code: 'web/form.ts:1-12' },
        { id: 'api', kind: 'box', label: 'Booking API', sub: 'api/Dock.java', at: [1, 0], code: 'api/Dock.java:1-30' },
        { id: 'yard', kind: 'db', label: 'Yard service', at: [2, 0] },
      ],
      edges: [
        { id: 'e1', from: 'form', to: 'api', label: 'send booking', code: 'web/form.ts:1-12', calls: 'retry(2)' },
        { id: 'e2', from: 'api', to: 'yard', label: 'pass it on', inferred: 'the API hands the booking to the yard service over the network' },
      ],
      groups: [{ id: 'backend', label: 'backend', members: ['api', 'yard'] }],
    },
    extend: [{ stop: 's2', file: 'api/Dock.java', lines: [5, 6], text: 'Add a new closed day here.' }],
    sources: [],
  };
}
