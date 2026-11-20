import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { repoByName } from './data.mjs';
import { gitEnv } from './git.mjs';

const TEN_MINUTES = 10 * 60 * 1000;
const SCENE_TAG = '<script id="scene" type="application/json">';
const NAME_ITS_REPO = 'with several repos, its code must name its repo, as { repo, file, lines }';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

export function chalkTalkAt(dir) {
  if (typeof dir !== 'string' || !dir || dir === 'none') return null;
  const abs = path.resolve(dir);
  if (!isFile(path.join(abs, 'scripts', 'build.mjs'))) return null;
  let commit = null;
  try { commit = fs.readFileSync(path.join(abs, 'PINNED.txt'), 'utf8').match(/^commit:\s*(\S+)/m)?.[1] ?? null; } catch {}
  return { dir: abs, commit };
}

function commonParent(dirs) {
  const parts = dirs.map(d => d.split(path.sep));
  let n = 0;
  while (n < parts[0].length && parts.every(p => p[n] === parts[0][n])) n++;
  return parts[0].slice(0, n).join(path.sep) || path.sep;
}

// The scene, and every reason it cannot stand for the data's map.
function makeScene(data) {
  const failures = [];
  const fail = (where, why) => failures.push({ where, why });

  const map = isObject(data.map) ? data.map : null;
  if (!map) fail('map', 'the data has no map');
  const list = (key, word) => {
    const v = map?.[key];
    if (!map || (v === undefined && key === 'groups')) return [];
    if (Array.isArray(v) && v.every(isObject)) return v;
    fail('map', `the map needs its ${word} as a list`);
    return [];
  };

  const repos = (Array.isArray(data.repos) ? data.repos : []).map(r => {
    try { const x = repoByName(data, r?.name); return { name: x.name, path: path.resolve(x.path) }; } catch { return null; }
  });
  if (!repos.length) fail('map', 'the data names no repo');
  else if (repos.includes(null)) fail('map', 'every repo needs a name and a folder');
  const known = repos.filter(Boolean);
  const several = known.length > 1;
  const root = !known.length ? undefined : several ? commonParent(known.map(r => r.path)) : known[0].path;

  const withCode = (x, where) => {
    const c = x.code;
    if (typeof c === 'string') { if (several) fail(where, NAME_ITS_REPO); return x; }
    if (!isObject(c)) return x;
    if (c.repo === undefined) { if (several) fail(where, NAME_ITS_REPO); return x; }
    const repo = known.find(r => r.name === c.repo);
    if (!repo) { fail(where, `its code names an unknown repo, ${c.repo}`); return x; }
    if (!several) return x;
    if (typeof c.file !== 'string') { fail(where, 'its code has no file name'); return x; }
    const code = { file: path.join(path.relative(root, repo.path), c.file).split(path.sep).join('/') };
    if (c.lines !== undefined) code.lines = c.lines;
    if (c.mark !== undefined) code.mark = c.mark;
    return { ...x, code };
  };
  const nodes = list('nodes', 'blocks').map((n, i) => withCode(n, `map block ${n.id || `n${i + 1}`}`));
  const edges = list('edges', 'arrows').map((e, i) => withCode(e, `map arrow ${e.id || `e${i + 1}`}`));
  const groups = list('groups', 'groups');

  const steps = (Array.isArray(data.stops) ? data.stops : []).map(stop => {
    const step = isObject(stop?.map_step) ? stop.map_step : {};
    return { ...step, title: step.title || stop?.name, say: '' };
  });

  const scene = { title: data.journey, lang: 'en', style: map?.style || 'studio', root, proof: true, nodes, edges, groups, steps };
  return { scene, failures };
}

export const sceneFor = data => makeScene(data).scene;

// The line of a child's stderr that says what went wrong, without the tool's own prefix.
function reason(stderr, fallback) {
  const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
  const said = lines.filter(l => /^(build|check): (?!warn )|^\w*Error\b/.test(l)).pop() || lines.pop() || fallback || 'no reason given';
  return said.replace(/^(build|check): /, '');
}

function readPage(file) {
  try {
    const html = fs.readFileSync(file, 'utf8');
    const at = html.indexOf(SCENE_TAG);
    const end = html.indexOf('</script>', at);
    if (at < 0 || end < 0) return null;
    const { edges } = JSON.parse(html.slice(at + SCENE_TAG.length, end));
    return Array.isArray(edges) ? { html, edges } : null;
  } catch { return null; }
}

export function buildMap(data, { chalk, out, slug } = {}) {
  for (const [name, v] of Object.entries({ chalk, out, slug })) if (typeof v !== 'string' || !v) throw new Error(`buildMap needs ${name}`);
  if (/[\\/]/.test(slug)) throw new Error(`buildMap: slug ${slug} must be a plain file name`);

  const dir = path.resolve(out);
  const scenePath = path.join(dir, `${slug}.scene.json`);
  const page = path.join(dir, `${slug}.map.html`);
  const snaps = path.join(dir, `${slug}-snaps`);
  // A failed run must not leave an earlier run's map looking current.
  for (const f of [scenePath, page, snaps]) fs.rmSync(f, { recursive: true, force: true });

  const { scene, failures } = makeScene(data);
  const result = { html: null, arrows: 0, traced: 0, guesses: 0, broken: 0, unproven: 0, failures, layout: { checked: false, errors: [] } };
  if (failures.length) return result;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2) + '\n');
  const run = { cwd: dir, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: TEN_MINUTES };

  try { execFileSync(process.execPath, [path.join(chalk, 'scripts', 'build.mjs'), scenePath, page], run); }
  catch (e) {
    failures.push({ where: 'map', why: e.code === 'ETIMEDOUT' ? 'chalk-talk did not finish building the map in 10 minutes' : `chalk-talk could not build the map: ${reason(e.stderr, e.message)}` });
    return result;
  }

  // Proof comes from the built page: the build exits 0 with broken arrows, and its stderr
  // counts only the arrows a step uses.
  const built = readPage(page);
  if (!built) { failures.push({ where: 'map', why: 'chalk-talk built a page with no readable map in it' }); return result; }
  result.html = built.html;
  result.arrows = built.edges.length;
  built.edges.forEach((e, i) => {
    const where = `map arrow ${e?.id || `e${i + 1}`}`;
    const status = e?.proof?.status;
    if (status === 'verified' || status === 'cited') result.traced++;
    else if (status === 'inferred') result.guesses++;
    else if (status === 'broken') { result.broken++; failures.push({ where, why: e.proof.why || 'its cited code was not found' }); }
    else if (status === 'unproven') { result.unproven++; failures.push({ where, why: 'it points at no code and is not marked as a guess' }); }
    else failures.push({ where, why: 'chalk-talk did not check it' });
  });

  // check.mjs exits 0 when clean, 1 with errors to fix, 2 when no Chrome is found. It also
  // exits 1 when the page gives no report, so only a printed report counts as a check.
  const c = spawnSync(process.execPath, [path.join(chalk, 'scripts', 'check.mjs'), page, snaps], run);
  if (c.status === 2) return result;
  const report = c.status === 0 || c.status === 1 ? c.stdout.split('\n') : [];
  if (!report.some(l => l.startsWith('steps: '))) {
    failures.push({ where: 'map layout', why: c.error?.code === 'ETIMEDOUT' ? "chalk-talk's layout check did not finish in 10 minutes" : `chalk-talk could not check the map: ${reason(c.stderr, c.error?.message)}` });
    return result;
  }
  result.layout.checked = true;
  for (const line of report) {
    const error = line.match(/^ {2}ERROR (.*)$/)?.[1];
    if (!error) continue;
    const sep = error.indexOf(': ');
    if ((sep < 0 ? error : error.slice(sep + 2)).startsWith('proof:')) continue; // already counted from its arrow
    result.layout.errors.push(error);
    failures.push({ where: 'map layout', why: error });
  }
  return result;
}
