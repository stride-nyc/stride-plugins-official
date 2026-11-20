import path from 'node:path';
import { findSavedCopy } from './quotes.mjs';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const all = data => (data.stops || []).flatMap(s => s.reasons || []);
const isGap = r => r.source?.kind === 'not-recorded';

export function reasonCounts(data) {
  const rs = all(data);
  const notRecorded = rs.filter(isGap).length;
  return { recorded: rs.length - notRecorded, notRecorded };
}

const uncommittedOf = r => (Array.isArray(r.uncommitted) ? r.uncommitted : []);
const dirtyCount = data => (data.repos || []).reduce((n, r) => n + uncommittedOf(r).length, 0);
const commitList = data => (data.repos || []).map(r => `\`${r.name}\` at commit \`${r.commit}\``);
const andJoin = xs => xs.join(' and ');
const plus = data => { const n = dirtyCount(data); return n ? ` plus uncommitted changes in ${plural(n, 'file', 'files')}` : ''; };

export function builtLine(data) {
  return `Built from ${andJoin(commitList(data))}${plus(data)} on ${data.built}`;
}

const savedKeys = (q, kind) => new Set((q.savedOf && q.savedOf[kind]) || []);

function savedPhrase(q) {
  const n = q.saved || 0;
  if (!n) return '';
  const tickets = savedKeys(q, 'ticket'), prs = savedKeys(q, 'pull-request');
  const what = (set, one, many) => set.size === 1 ? `a ${one}` : `${set.size} ${many}`;
  let tail = '';
  if (tickets.size && prs.size) tail = ' of tickets and pull requests';
  else if (tickets.size) tail = ` of ${what(tickets, 'ticket', 'tickets')}`;
  else if (prs.size) tail = ` of ${what(prs, 'pull request', 'pull requests')}`;
  const copy = n === 1 ? 'a saved copy' : 'saved copies';
  return q.quotes === 1 ? ` (in ${copy}${tail})` : ` (${n} in ${copy}${tail})`;
}

const count = (n, one, many) => n === 1 ? one : many;
const brokenCount = m => (Array.isArray(m.broken) ? m.broken.length : m.broken || 0);
const NOT_BUILT = 'not built, because chalk-talk is not installed';
// The build sets leftOut only when --chalk none was given while chalk-talk is installed; older data files never have it.
const LEFT_OUT = 'left out by the command';
const leftOut = m => m.leftOut === true;

export function checksShort(data) {
  const { quotes = {}, map = { built: false } } = data.checks || {};
  const q = quotes.quotes;
  const found = q === 0 ? 'no quotes to check' : `${plural(q, 'quote', 'quotes')} found`;
  const saved = quotes.saved ? ` (${quotes.saved} in ${quotes.saved === 1 ? 'a saved copy' : 'saved copies'})` : '';
  const arrows = map.arrows === 0 ? 'no map arrows' : `${map.traced} of ${map.arrows} map ${count(map.arrows, 'arrow', 'arrows')} traced, ${plural(map.guesses, 'guess', 'guesses')}`;
  const m = map.built ? arrows : `Map ${leftOut(map) ? LEFT_OUT : NOT_BUILT}`;
  return `Code matches the files · ${found}${saved} · ${m}`;
}

export function reasonsLine(data) {
  const { recorded, notRecorded } = reasonCounts(data);
  return `${recorded} recorded, ${notRecorded} not recorded`;
}

export function replyLines(data) {
  const { code = {}, quotes = {}, map = { built: false } } = data.checks || {};
  const repos = data.repos || [];
  const where = repos.length === 1 ? `commit \`${repos[0].commit}\`` : andJoin(commitList(data));
  const b0 = code.blocks;
  const codeLine = b0 === 1 ? `Code: the 1 block matches the file as built (${where}${plus(data)}).`
    : b0 === 0 ? `Code: there are no code blocks to check (${where}${plus(data)}).`
    : `Code: all ${b0} blocks match the files as built (${where}${plus(data)}).`;
  const q0 = quotes.quotes;
  const reasonLine = q0 === 0 ? 'Reasons: no reasons are recorded, so there are no quotes to check.'
    : q0 === 1 ? `Reasons: the 1 quote was found word for word in its source${savedPhrase(quotes)}.`
    : `Reasons: all ${q0} quotes were found word for word in their sources${savedPhrase(quotes)}.`;
  const lines = [codeLine, reasonLine];
  if (!map.built) {
    lines.push(leftOut(map) ? `Map: ${LEFT_OUT}.` : 'Map: not built, because chalk-talk is not installed. Get it from github.com/oztrkemree/chalk-talk and put it in ~/.claude/skills/chalk-talk.');
    return lines;
  }
  const g = map.guesses, br = brokenCount(map), n = map.arrows;
  if (n === 0) lines.push('Map: there are no arrows to trace.');
  else if (n === 1) lines.push(`Map: ${map.traced === 1 ? 'the 1 arrow is' : '0 of 1 arrow is'} traced to a line of code. ${g ? 'It is marked as a guess.' : 'It is not marked as a guess.'} ${br ? 'It is broken.' : 'It is not broken.'}`);
  else lines.push(`Map: ${map.traced} of ${n} arrows are traced to a line of code. ${g ? `${g} ${count(g, 'is', 'are')} marked as ${count(g, 'a guess', 'guesses')}` : 'None are marked as guesses'}. ${br ? `${br} ${count(br, 'is', 'are')} broken` : 'None are broken'}.`);
  if (map.layoutChecked === false) lines.push('Map: not checked by eye, because Chrome was not found.');
  return lines;
}

// The reply's not-recorded questions, ready to copy: numbered across the walkthrough, in stop order, one per line.
export function questionLines(data) {
  return all(data).filter(isGap).map((r, i) => `${i + 1}. ${String(r.text).replace(/\s+/g, ' ').trim()}`);
}

const gaps = stop => (stop.reasons || []).filter(isGap).length;

export function stopBadge(stop) {
  const n = gaps(stop), total = (stop.reasons || []).length;
  if (!n) return '';
  return n === total ? 'nothing recorded' : `${n} not recorded`;
}

export function outlineTail(stop) {
  const n = gaps(stop), total = (stop.reasons || []).length;
  if (!n) return 'Reasons recorded.';
  return n === total ? 'Nothing recorded.' : `${plural(n, 'reason', 'reasons')} not recorded.`;
}

export function whyLabel(stop) {
  const n = gaps(stop);
  return `Why ${(stop.reasons || []).length}${n ? ` · ${n} not recorded` : ''}`;
}

const prNumber = ref => (typeof ref === 'object' && ref ? ref.number : ref);

export function chipLabel(source) {
  const { kind, ref } = source;
  switch (kind) {
    case 'vault-note': return 'vault note';
    case 'design-doc': return 'design doc';
    case 'commit': return `commit ${String(ref?.hash ?? '').slice(0, 7)}`;
    case 'pull-request': return `pull request #${prNumber(ref)}`;
    case 'ticket': return `ticket ${ref}`;
    case 'code-comment': return 'code comment';
    case 'build-note': return 'build note';
    default: return 'not recorded';
  }
}

export function chipDetail(reason, data) {
  const { source } = reason;
  const { kind, ref } = source;
  if (kind === 'not-recorded') return 'Not recorded: no source gives this reason.';
  let where = chipLabel(source);
  if (kind === 'vault-note') where += `, ${ref}`;
  if (kind === 'design-doc') where += `, ${ref?.path}`;
  if (kind === 'code-comment') where += `, ${ref?.file}:${ref?.line}`;
  if (kind === 'build-note') where += `, ${path.basename(String(ref))}`;
  if (kind === 'ticket' || kind === 'pull-request') {
    const pr = typeof ref === 'object' && ref ? ref : { number: ref };
    const key = kind === 'ticket' ? String(ref) : `${pr.repo ?? ''}#${pr.number}`;
    const copy = savedKeys(data.checks?.quotes || {}, kind).has(key) ? findSavedCopy(data, kind, kind === 'ticket' ? ref : pr) : null;
    if (copy) where += `, saved copy fetched ${copy.fetched}`;
  }
  return `“${reason.quote}” — ${where}`;
}
