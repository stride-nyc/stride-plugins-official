import fs from 'node:fs';
import os from 'node:os';

export const SOURCE_KINDS = ['vault-note', 'design-doc', 'commit', 'pull-request', 'ticket', 'code-comment', 'build-note', 'not-recorded'];

const NEEDS_REPO = ['design-doc', 'commit', 'pull-request', 'code-comment'];

export function loadData(path) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (e) { return { error: `${path} is not valid JSON: ${e.message}` }; }
  if (data?.format !== 1) return { error: `${path} has format ${data?.format}; only format 1 is supported` };
  return { data };
}

export function repoByName(data, name) {
  const repos = data.repos || [];
  const r = name === undefined ? (repos.length === 1 ? repos[0] : undefined) : repos.find(x => x.name === name);
  if (!r) throw new Error(name === undefined ? 'a repo name is needed when there are several repos' : `no repo named ${name}`);
  return { name: r.name, path: r.path.replace(/^~(?=\/|$)/, os.homedir()) };
}

export function fieldProblem(o, withText) {
  if (typeof o?.file !== 'string' || !o.file) return 'has no file name';
  const l = o.lines;
  if (!Array.isArray(l) || l.length !== 2 || !l.every(Number.isInteger) || l[0] < 1 || l[0] > l[1]) return 'needs lines as two whole numbers, first line 1 or more and not after the last';
  if (withText && typeof o.text !== 'string') return 'has no text';
  return null;
}

export function shapeErrors(data) {
  const errors = [];
  const repos = data.repos || [];
  const names = new Set(repos.map(r => r.name));
  const repoProblem = (obj, what) => {
    if (obj.repo === undefined) return repos.length > 1 ? `${what} needs a repo, because there are several repos` : null;
    return names.has(obj.repo) ? null : `${what} names an unknown repo, ${obj.repo}`;
  };
  const seen = new Set();
  for (const s of data.stops || []) {
    const id = s.id;
    if (seen.has(id)) errors.push(`stop ${id} appears twice`);
    seen.add(id);
    if (!s.map_step) errors.push(`stop ${id} has no map step`);
    (s.code || []).forEach((b, i) => {
      const p = repoProblem(b, `stop ${id} code block ${i + 1}`);
      if (p) errors.push(p);
      const f = fieldProblem(b, true);
      if (f) errors.push(`stop ${id} code block ${i + 1} ${f}`);
    });
    const reasons = s.reasons || [];
    if (!reasons.length) errors.push(`stop ${id} has no Why entry`);
    reasons.forEach((r, i) => {
      const at = `stop ${id} Why entry ${i + 1}`;
      if (/^guess/i.test(r.text || '')) { errors.push(`${at} is a guess; guesses go in the guesses list`); return; }
      const kind = r.source?.kind;
      if (!r.source) { errors.push(`${at} needs a source`); return; }
      if (!SOURCE_KINDS.includes(kind)) { errors.push(`${at} has an unknown source kind, ${kind}`); return; }
      if (kind === 'not-recorded') {
        if (!String(r.text || '').trim().endsWith('?')) errors.push(`${at} is not recorded, so its text must be a question`);
        if (r.quote !== undefined) errors.push(`${at} is not recorded, so it cannot have a quote`);
        return;
      }
      if (!r.quote) errors.push(`${at} needs a quote`);
      if (NEEDS_REPO.includes(kind)) {
        const p = repoProblem(r.source.ref || {}, at);
        if (p) errors.push(p);
      }
    });
  }
  (data.extend || []).forEach((e, i) => {
    if (!seen.has(e.stop)) errors.push(`extend point ${i + 1} names stop ${e.stop}, which does not exist`);
    const p = repoProblem(e, `extend point ${i + 1} (stop ${e.stop})`);
    if (p) errors.push(p);
    const f = fieldProblem(e, false);
    if (f) errors.push(`extend point ${i + 1} (stop ${e.stop}) ${f}`);
  });
  return errors;
}
