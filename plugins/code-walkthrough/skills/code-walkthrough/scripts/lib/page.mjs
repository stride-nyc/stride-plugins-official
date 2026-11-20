import fs from 'node:fs';
import { codeRows } from './code.mjs';
import { builtLine, checksShort, reasonsLine, stopBadge, whyLabel, chipLabel, chipDetail } from './words.mjs';
import { CAPTION_BAR, CODE_PANEL } from './settings.mjs';

export const FOLD_AT = 14;

const label = r => `${r[0]}–${r[1]}`;
const hiddenCopy = r => ({ ...r, hidden: true });

export function foldRows(rows) {
  const numbered = rows.filter(r => !r.gap).length;
  if (numbered <= FOLD_AT) return rows;
  const keep = rows.map(() => false);
  const mark = i => { if (i >= 0 && i < rows.length) keep[i] = true; };
  rows.forEach((r, i) => { if (r.key || r.gap) { mark(i - 1); mark(i); mark(i + 1); } });
  mark(0); mark(rows.length - 1);
  for (let i = 0; i < rows.length;) {
    if (keep[i]) { i++; continue; }
    let j = i;
    while (j < rows.length && !keep[j]) j++;
    if (j - i < 3) for (let k = i; k < j; k++) keep[k] = true;
    i = j;
  }
  const out = [];
  for (let a = 0; a < rows.length;) {
    if (keep[a]) { out.push(rows[a]); a++; continue; }
    let z = a;
    while (z < rows.length && !keep[z]) z++;
    out.push({ fold: z - a, label: `⋯ ${z - a} more lines` });
    for (let q = a; q < z; q++) out.push(hiddenCopy(rows[q]));
    a = z;
  }
  return out;
}

const range = o => `${o.file}:${o.lines[0]}-${o.lines[1]}`;

function blockModel(block) {
  const all = codeRows(block).map(r => r.gap ? { ...r, label: `lines ${label(r.gap)} left out` } : r);
  const total = all.filter(r => !r.gap).length;
  const rows = foldRows(all);
  return { label: range(block), fn: block.function, rows, total, folded: rows.length !== all.length, showAll: `Show all ${total} lines` };
}

// The chip's colour: written sources, commits and pull requests, comments in the code, and gaps.
const TONE = {
  'vault-note': 'doc', 'design-doc': 'doc', 'build-note': 'doc', ticket: 'doc',
  commit: 'commit', 'pull-request': 'commit', 'code-comment': 'comment',
};

const stopWord = n => (n === 1 ? 'stop' : 'stops');
const linkTo = s => `${s.n}. ${s.name}`;

export function pageModel(data) {
  const stops = data.stops || [];
  const names = new Map(stops.map((s, i) => [s.id, { n: i + 1, name: s.name }]));
  const multi = (data.repos || []).length > 1;
  const uncommittedFiles = (data.repos || []).flatMap(r => (r.uncommitted || []).map(f => multi ? `${r.name}: ${f}` : f));
  const at = i => (i >= 0 && i < stops.length ? { n: i + 1, name: stops[i].name } : null);
  return {
    title: data.journey,
    built: builtLine(data),
    uncommittedFiles,
    checks: checksShort(data),
    reasons: reasonsLine(data),
    mapMissing: !data.checks?.map?.built,
    outOf: `of ${stops.length} ${stopWord(stops.length)}`,
    stops: stops.map((s, i) => {
      const code = s.code || [];
      const notes = s.notes || [];
      const kicker = `Stop ${i + 1} of ${stops.length}`;
      const prev = at(i - 1), next = at(i + 1);
      return {
        n: i + 1, id: s.id, name: s.name, summary: s.summary,
        kicker, label: `${kicker} — ${s.name}`,
        prevLabel: prev ? `← ${linkTo(prev)}` : '',
        nextLabel: next ? `${linkTo(next)} →` : '',
        badge: stopBadge(s),
        firstFile: code.length ? range(code[0]) : '',
        more: Math.max(0, code.length - 1),
        moreLabel: code.length > 1 ? `+${code.length - 1} more` : '',
        blocks: code.map(blockModel),
        what: s.what, dataIn: s.data?.in, dataOut: s.data?.out,
        notes,
        notesLabel: `Notes on the code (${notes.length})`,
        whyLabel: whyLabel(s),
        why: (s.reasons || []).map(r => ({
          text: r.text, chip: chipLabel(r.source), detail: chipDetail(r, data),
          notRecorded: r.source.kind === 'not-recorded', tone: TONE[r.source.kind] || 'none',
        })),
        guesses: s.guesses || [],
      };
    }),
    extend: (data.extend || []).map(e => {
      const to = names.get(e.stop);
      return { where: range(e), text: e.text, stopN: to?.n, stopName: to?.name, link: to ? `${linkTo(to)} →` : '' };
    }),
  };
}

// ---- the page: one self-contained HTML file ----

const ASSETS = new URL('../../assets/', import.meta.url);
const asset = name => fs.readFileSync(new URL(name, ASSETS), 'utf8');

// Inside a <script> block a raw "<" can end it ("</script>") or open a comment ("<!--"), and
// U+2028/U+2029 break older script parsers. Each becomes its JSON escape, a backslash then uXXXX,
// built in code so no editor can turn the escape back into the character.
const BACKSLASH = String.fromCharCode(92);
const ESCAPES = ['<', String.fromCharCode(0x2028), String.fromCharCode(0x2029)]
  .map(ch => [ch, BACKSLASH + 'u' + ch.charCodeAt(0).toString(16).padStart(4, '0')]);

export function embedJson(value) {
  return ESCAPES.reduce((s, [ch, esc]) => s.split(ch).join(esc), JSON.stringify(value));
}

const CAPTION_STYLE = '<style>.bar{display:none!important}</style>';

// The map page as the frame gets it, one line per verified setting.
export function prepareMap(mapHtml) {
  const head = mapHtml.indexOf('</head>');
  if (head < 0) throw new Error('the map page has no </head>');
  let page = mapHtml;
  // caption_bar hidden: a style before </head> hides the map's own caption bar.
  if (CAPTION_BAR === 'hidden') page = page.slice(0, head) + CAPTION_STYLE + page.slice(head);
  // map_input blocked: nothing here; page.js stops the map's own keys and taps from the frame's window.
  return page;
}

const htmlText = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// Every marker is found in the template before anything goes in, so text that is filled in
// (cited code can hold a marker, "$&" or "</script>") is never searched or rewritten.
function fill(template, values) {
  const spots = Object.entries(values).map(([marker, value]) => {
    const at = template.indexOf(marker);
    if (at < 0 || template.indexOf(marker, at + 1) >= 0) throw new Error(`page.html must hold ${marker} exactly once`);
    return { at, end: at + marker.length, value };
  }).sort((a, b) => a.at - b.at);
  let out = '', from = 0;
  for (const s of spots) { out += template.slice(from, s.at) + s.value; from = s.end; }
  return out + template.slice(from);
}

export function assemblePage(model, mapHtml) {
  return fill(asset('page.html'), {
    __TITLE__: htmlText(model.title),
    '/*__PAGE_CSS__*/': asset('page.css'),
    '//__PAGE_JS__': `const CODE_PANEL = ${JSON.stringify(CODE_PANEL)};\n${asset('page.js')}`,
    __WALK_DATA__: embedJson(model),
    __MAP_PAGE__: mapHtml == null ? 'null' : embedJson(prepareMap(mapHtml)),
  });
}
