import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageModel, embedJson, prepareMap, assemblePage } from '../lib/page.mjs';
import { builtLine, chipLabel, chipDetail } from '../lib/words.mjs';
import { expectedText } from '../lib/code.mjs';
import { chalkTalkAt, buildMap } from '../lib/map.mjs';
import { CODE_PANEL } from '../lib/settings.mjs';
import { tempRoot, bookingRepo, sampleData, chalkDir, findChrome, dumpDom } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', '..', 'assets', 'page.html');
const SELFTEST = path.join(HERE, 'sync-selftest.js');

// The JSON unicode escape for "<", built in code so no editor can turn it back into "<".
const LT = String.fromCharCode(92) + 'u003c';
const LINE_SEP = String.fromCharCode(0x2028), PARA_SEP = String.fromCharCode(0x2029);

const noChrome = !findChrome() && 'no Chrome';
const needsChrome = { skip: noChrome };
const needsMap = { skip: noChrome || (!chalkTalkAt(chalkDir() ?? 'none') && 'chalk-talk not installed') };

// One fixture repo and one built map, shared by every test that only reads them.
let shared = null;
after(() => { if (shared) fs.rmSync(shared.root, { recursive: true, force: true }); });
function fixture() {
  if (!shared) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
    shared = { root, repo: bookingRepo(root), map: null };
  }
  return shared;
}
function sampleMap() {
  const f = fixture();
  if (!f.map) {
    const built = buildMap(sampleData(f.repo), { chalk: chalkDir(), out: path.join(f.root, 'out'), slug: 'booking-flow' });
    assert.deepEqual(built.failures, []);
    f.map = built.html;
  }
  return f.map;
}

// sampleData with the checks a build writes (Task 7's shape), filled by hand.
function withChecks(d, repo, { dirty = [], mapBuilt = true } = {}) {
  d.built = '2026-11-11';
  d.repos[0].commit = repo.head;
  d.repos[0].uncommitted = dirty;
  d.checks = {
    code: { blocks: 4 },
    quotes: { quotes: 3, saved: 0, savedOf: { ticket: [], 'pull-request': [] } },
    map: mapBuilt ? { built: true, arrows: 2, traced: 1, guesses: 1, broken: 0, layoutChecked: true } : { built: false },
  };
  return d;
}
const sample = opts => { const { repo } = fixture(); return withChecks(sampleData(repo), repo, opts); };

function block(page, id) {
  const open = `<script type="application/json" id="${id}">`;
  const at = page.indexOf(open);
  assert.ok(at >= 0, `no ${id} block`);
  return page.slice(at + open.length, page.indexOf('</script>', at));
}

// ---- running a page in Chrome ----

const HEAD = `<script>
window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
</script>`;

const BREAK_STORAGE = `<script>
for (const name of ['localStorage', 'sessionStorage'])
  Object.defineProperty(window, name, { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
</script>`;

// Tools the in-page test functions get as their second argument.
const KIT = `{
  html: document.documentElement,
  model: JSON.parse(document.getElementById('walk-data').textContent),
  $: (s, root) => (root || document).querySelector(s),
  $$: (s, root) => Array.from((root || document).querySelectorAll(s)),
  text: el => (el ? el.textContent : null),
  wait: ms => new Promise(r => setTimeout(r, ms)),
  visible: el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0,
  key: (target, key, win) => target.dispatchEvent(new (win || window).KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
  // the map's window and document, once its own load has run and chalk.ready has resolved
  map: () => new Promise((resolve, reject) => {
    const frame = document.getElementById('map-frame');
    if (!frame) return reject(new Error('no #map-frame'));
    const loaded = () => {
      try {
        const w = frame.contentWindow;
        return w && w.chalk && w.document.getElementById('board') && w.document.readyState === 'complete' ? w : null;
      } catch (_) { return null; }
    };
    const ready = w => w.chalk.ready.then(() => setTimeout(() => resolve({ win: w, doc: w.document }), 0), reject);
    if (loaded()) return ready(loaded());
    const onLoad = () => { const w = loaded(); if (w) { frame.removeEventListener('load', onLoad); ready(w); } };
    frame.addEventListener('load', onLoad);
  }),
}`;

const actScript = (fn, arg) => `<script>
(async () => {
  const kit = ${KIT};
  const report = {};
  try { await (${fn})(report, kit, ${JSON.stringify(arg ?? null).split('<').join(LT)}); }
  catch (e) { report.thrown = String(e && e.stack || e); }
  report.errors = window.__errors;
  const node = document.createElement('script');
  node.type = 'application/json';
  node.id = 'test-report';
  node.textContent = JSON.stringify(report).split('<').join(String.fromCharCode(92) + 'u003c');
  document.body.appendChild(node);
})();
</script>`;

function reportOf(dom) {
  const m = dom.match(/<script type="application\/json" id="test-report">([^<]*)<\/script>/);
  assert.ok(m, `the page wrote no report; the dump ends: ${dom.slice(-300)}`);
  return JSON.parse(m[1]);
}

// Writes the page, runs `fn(report, kit, arg)` in it (or a whole script as `body`), and returns the report.
async function run(t, page, fn, { arg, head = '', body, ...opts } = {}) {
  const file = path.join(tempRoot(t), 'page.html');
  fs.writeFileSync(file, page);
  const r = reportOf(await dumpDom(file, { ...opts, head: HEAD + head, body: body ?? actScript(fn, arg) }));
  assert.equal(r.thrown, undefined, r.thrown);
  assert.deepEqual(r.errors, []);
  return r;
}

// ---- assembly, no browser ----

test('embedJson hides every < and the line separators', () => {
  const value = { code: '</script><!-- <script>', seps: `a${LINE_SEP}b${PARA_SEP}c`, dollars: "$& $' $1" };
  const s = embedJson(value);
  assert.equal(s.includes('<'), false);
  assert.equal(s.includes(LINE_SEP) || s.includes(PARA_SEP), false);
  assert.ok(s.includes(LT));
  assert.deepEqual(JSON.parse(s), value);
  assert.equal(embedJson(null), 'null');
});

// page.js goes inline into a <script> block, where "<!--" followed later by "<script" changes how the block ends.
test('the page script holds no comment opener or script tag', () => {
  const js = fs.readFileSync(path.join(HERE, '..', '..', 'assets', 'page.js'), 'utf8');
  const at = js.search(/<!--|<script/i);
  assert.equal(at, -1, `page.js line ${js.slice(0, at).split('\n').length}: ${js.slice(at, at + 12)}`);
});

test('the map page loses its caption bar and nothing else', () => {
  const page = '<html><head><title>m</title></head><body><p>x</p></body></html>';
  assert.equal(prepareMap(page), '<html><head><title>m</title><style>.bar{display:none!important}</style></head><body><p>x</p></body></html>');
  assert.throws(() => prepareMap('<html><body></body></html>'), /no <\/head>/);
});

test('code with script tags and dollar signs survives the page', needsChrome, async t => {
  const lines = ["const end = '</script>';", '// <!-- <script>', `const s = "$& $' $1 $$";`];
  const root = tempRoot(t);
  const repo = bookingRepo(root);
  fs.writeFileSync(path.join(repo.path, 'web', 'tricky.ts'), lines.join('\n') + '\n');
  const d = withChecks(sampleData(repo), repo);
  const text = expectedText(fs.readFileSync(path.join(repo.path, 'web', 'tricky.ts'), 'utf8'), [1, 3]).text;
  d.stops[0].code = [{ file: 'web/tricky.ts', lines: [1, 3], function: 'tricky', text, key_lines: [2], left_out: [] }];
  d.stops[0].name = 'Tricky </script> $& stop';
  d.journey = 'Saving </title> & <b>a</b> booking $&';
  const model = pageModel(d);
  const fakeMap = `<!doctype html><html><head><title>map</title></head><body><script>var s = "$& $' <!-- ${LINE_SEP}";</script></body></html>`;

  const page = assemblePage(model, fakeMap);
  const closes = s => s.split('</script>').length - 1;
  assert.equal(closes(page), closes(fs.readFileSync(TEMPLATE, 'utf8')));
  assert.deepEqual(JSON.parse(block(page, 'walk-data')), JSON.parse(JSON.stringify(model)));
  assert.equal(JSON.parse(block(page, 'map-page')), prepareMap(fakeMap));
  assert.ok(page.includes('<title>Saving &lt;/title&gt; &amp; &lt;b&gt;a&lt;/b&gt; booking $&amp;</title>'));

  const r = await run(t, page, (r, k) => {
    r.rows = k.$$('#stop .row[data-n]').map(x => x.querySelector('.tx').textContent);
    r.label = k.text(k.$('#map-label'));
    r.title = [document.title, k.text(k.$('#head h1'))];
  });
  assert.deepEqual(r.rows, lines);
  assert.equal(r.label, 'Stop 1 of 3 — Tricky </script> $& stop');
  assert.deepEqual(r.title, [d.journey, d.journey]);
});

// ---- the page in Chrome ----

test('read view shows the stop', needsChrome, async t => {
  const d = sample({ dirty: ['api/Dock.java'] });
  const r = await run(t, assemblePage(pageModel(d), null), (r, k) => {
    r.ready = k.html.dataset.ready;
    r.view = k.html.dataset.view;
    r.stop = k.html.dataset.stop;
    r.title = document.title;
    r.h1 = k.text(k.$('#head h1'));
    r.built = k.text(k.$('#head .built'));
    r.builtCode = k.$$('#head .built code').map(c => c.textContent);
    r.files = k.$$('#head .files li').map(li => li.textContent);
    r.checks = k.text(k.$('#head .checks'));
    r.reasons = k.text(k.$('#head .reasons'));
    r.views = k.$$('[data-view-btn]').map(b => [b.dataset.viewBtn, b.textContent]);
    r.label = k.text(k.$('#map-label'));
    r.where = k.text(k.$('#stop .where'));
    r.first = k.$('#stop .row[data-n]').dataset.n;
    r.key = k.$$('#stop .row.key').map(x => [x.dataset.n, x.querySelector('.tx').textContent]);
    const notes = k.$('#stop details.notes');
    r.notes = [notes.open, k.text(notes.querySelector('summary'))];
  });
  const m = pageModel(d);
  assert.deepEqual([r.ready, r.view, r.stop], ['1', 'read', '1']);
  assert.equal(r.title, m.title);
  assert.equal(r.h1, m.title);
  assert.equal(r.built, builtLine(d).replaceAll('`', ''));
  assert.deepEqual(r.builtCode, ['booking-mini', d.repos[0].commit]);
  assert.deepEqual(r.files, ['api/Dock.java']);
  assert.equal(r.checks, m.checks);
  assert.equal(r.reasons, '3 recorded, 1 not recorded');
  assert.deepEqual(r.views, [['read', 'Read'], ['lookup', 'Look up'], ['extend', 'Where to extend']]);
  assert.equal(r.label, 'Stop 1 of 3 — The form sends the booking');
  assert.match(r.where, /web\/form\.ts:1-12.*saveBooking/);
  assert.equal(r.first, '1');
  assert.deepEqual(r.key, [['6', '  retry(2);']]);
  assert.deepEqual(r.notes, [false, 'Notes on the code (1)']);
});

test('left-out and folded lines', needsChrome, async t => {
  const r = await run(t, assemblePage(pageModel(sample()), null), (r, k) => {
    const hidden = () => k.$$('#stop .row[data-n]').filter(x => !k.visible(x)).length;
    r.stop = k.html.dataset.stop;
    r.gaps = k.$$('#stop .row.gap').map(x => x.textContent);
    r.folds = k.$$('#stop .row.fold').map(x => x.textContent);
    r.hiddenBefore = hidden();
    const showAll = k.$('#stop .show-all');
    r.showAll = showAll.textContent;
    showAll.click();
    r.hiddenAfter = hidden();
    r.shownAfter = k.$$('#stop .row[data-n]').filter(k.visible).length;
    r.foldsShownAfter = k.$$('#stop .row.fold').filter(k.visible).length;
    r.showAllLeft = !!k.$('#stop .show-all');
  }, { hash: 'stop=2' });
  assert.equal(r.stop, '2');
  assert.deepEqual(r.gaps, ['lines 12–20 left out']);
  assert.deepEqual(r.folds, ['⋯ 4 more lines', '⋯ 8 more lines']);
  assert.equal(r.hiddenBefore, 12);
  assert.equal(r.showAll, 'Show all 21 lines');
  assert.deepEqual([r.hiddenAfter, r.shownAfter, r.foldsShownAfter, r.showAllLeft], [0, 21, 0, false]);
});

test('tabs show what it does, data in and out, and why', needsChrome, async t => {
  const d = sample();
  const m = pageModel(d);
  const r = await run(t, assemblePage(m, null), (r, k) => {
    const tab = name => k.$(`#stop [data-tab="${name}"]`);
    r.tabs = k.$$('#stop [data-tab]').map(b => [b.dataset.tab, b.textContent]);
    r.first = k.$('#stop [data-tab][aria-selected="true"]').dataset.tab;
    r.what = k.text(k.$('#stop .tab-panel'));
    tab('data').click();
    r.io = k.$$('#stop .tab-panel .io-v').map(x => x.textContent);
    tab('why').click();
    r.stops = k.$$('#pips button').map(pip => {
      pip.click();
      return {
        selected: k.$('#stop [data-tab][aria-selected="true"]').dataset.tab,
        whyTab: k.text(tab('why')),
        items: k.$$('#stop .why li').length,
        chips: k.$$('#stop .why .chip').map(c => c.textContent),
        notRecorded: k.$$('#stop .why li.not-recorded').map(li => li.textContent),
        guesses: k.$$('#stop .guess').map(g => g.textContent),
      };
    });
  });
  assert.deepEqual(r.tabs, [['what', 'What it does'], ['data', 'Data in → out'], ['why', m.stops[0].whyLabel]]);
  assert.equal(r.first, 'what');
  assert.equal(r.what, d.stops[0].what);
  assert.deepEqual(r.io, [d.stops[0].data.in, d.stops[0].data.out]);
  r.stops.forEach((s, i) => {
    assert.equal(s.selected, 'why');
    assert.equal(s.whyTab, m.stops[i].whyLabel);
    assert.equal(s.items, d.stops[i].reasons.length);
    assert.deepEqual(s.chips, d.stops[i].reasons.map(x => chipLabel(x.source)));
  });
  assert.equal(r.stops[0].notRecorded.length, 1);
  assert.ok(r.stops[0].notRecorded[0].startsWith('Why does the form retry twice?'));
  assert.deepEqual(r.stops[0].guesses, ['Guess The retries may cover a slow first call.']);
  assert.deepEqual([r.stops[1].notRecorded, r.stops[1].guesses], [[], []]);
});

test('a chip shows the exact quote', needsChrome, async t => {
  const d = sample();
  const r = await run(t, assemblePage(pageModel(d), null), (r, k) => {
    const chips = k.$$('#stop .why .chip');
    const detail = chip => chip.closest('li').querySelector('.chip-detail');
    r.hiddenFirst = chips.map(c => k.visible(detail(c)));
    chips[0].click();
    r.shown = [k.visible(detail(chips[0])), k.text(detail(chips[0])), chips[0].getAttribute('aria-expanded')];
    chips[1].click();
    r.second = k.text(detail(chips[1]));
    chips[0].click();
    r.closed = k.visible(detail(chips[0]));
  }, { hash: 'stop=2&tab=why' });
  assert.deepEqual(r.hiddenFirst, [false, false]);
  assert.deepEqual(r.shown, [true, chipDetail(d.stops[1].reasons[0], d), 'true']);
  assert.equal(r.shown[1], '“Docks close on Sundays for cleaning.” — code comment, api/Dock.java:5');
  assert.equal(r.second, chipDetail(d.stops[1].reasons[1], d));
  assert.equal(r.closed, false);
});

test("prev and next carry the neighbours' names and move", needsChrome, async t => {
  const d = sample();
  const r = await run(t, assemblePage(pageModel(d), null), (r, k) => {
    const stop = () => k.html.dataset.stop;
    r.start = [k.text(k.$('#prev')), k.$('#prev').disabled, k.text(k.$('#next'))];
    k.$('#next').click();
    r.afterNext = [stop(), k.text(k.$('#prev')), k.text(k.$('#next'))];
    k.key(document, 'ArrowLeft');
    r.afterLeft = stop();
    k.key(document, 'ArrowRight');
    k.key(document, 'ArrowRight');
    r.afterRights = [stop(), k.$('#next').disabled, k.text(k.$('#next'))];
    k.key(document, 'ArrowRight');
    r.pastEnd = stop();
    k.$$('#pips button')[0].click();
    r.pip = [stop(), k.$$('#pips button.cur').map(b => b.textContent)];
    k.$('[data-view-btn="lookup"]').click();
    const filter = k.$('#filter');
    filter.focus();
    r.focused = document.activeElement === filter;
    k.key(filter, 'ArrowRight');
    r.inFilter = stop();
    filter.blur();
    k.key(document, 'ArrowRight');
    r.inLookup = [stop(), k.$$('.outline-row.cur').map(x => x.dataset.n)];
  });
  const name = i => d.stops[i].name;
  assert.equal(r.start[0], '← Prev');
  assert.equal(r.start[1], true);
  assert.ok(r.start[2].includes(name(1)));
  assert.equal(r.afterNext[0], '2');
  assert.ok(r.afterNext[1].includes(name(0)));
  assert.ok(r.afterNext[2].includes(name(2)));
  assert.equal(r.afterLeft, '1');
  assert.deepEqual(r.afterRights, ['3', true, 'Next →']);
  assert.equal(r.pastEnd, '3');
  assert.deepEqual(r.pip, ['1', ['1']]);
  assert.equal(r.focused, true);
  assert.equal(r.inFilter, '1');
  assert.deepEqual(r.inLookup, ['2', ['2']]);
});

test('look-up view filters', needsChrome, async t => {
  const d = sample();
  const m = pageModel(d);
  const r = await run(t, assemblePage(m, null), (r, k) => {
    const count = () => k.text(k.$('#count'));
    const shown = () => k.$$('.outline-row').filter(k.visible).map(x => x.dataset.n);
    const filter = k.$('#filter');
    const type = v => { filter.value = v; filter.dispatchEvent(new Event('input', { bubbles: true })); return [count(), shown()]; };
    k.$('[data-view-btn="lookup"]').click();
    r.view = k.html.dataset.view;
    r.readHidden = getComputedStyle(k.$('#read')).visibility;
    const rows = k.$$('.outline-row');
    r.rows = rows.length;
    r.heads = rows.map(x => ({
      n: k.text(x.querySelector('.on')), name: k.text(x.querySelector('.ot')), file: k.text(x.querySelector('.of')),
      summary: k.text(x.querySelector('.os')), badge: k.text(x.querySelector('.gapb')),
    }));
    r.all = count();
    r.byName = type(k.model.stops[0].name);
    r.byFile = type('Dock.java');
    r.byFunction = type('CHECKDAY');
    r.bySummary = type('passes the booking on');
    r.none = [...type('nothing like this'), k.visible(k.$('#no-match'))];
    type('');
    k.$('#only-gaps').click();
    r.gaps = [count(), shown()];
    k.$('#only-gaps').click();
    const head = n => rows[n - 1].querySelector('.outline-head');
    const open = () => rows.filter(x => x.classList.contains('open')).map(x => x.dataset.n);
    head(2).click();
    r.open1 = [open(), !!rows[1].querySelector('.block'), head(2).getAttribute('aria-expanded')];
    head(3).click();
    r.open2 = [open(), !!rows[1].querySelector('.block')];
    head(3).click();
    r.closed = open();
    head(3).click();
    rows[2].querySelector('.read-from-here').click();
    r.after = [k.html.dataset.view, k.html.dataset.stop, k.visible(k.$('#lookup'))];
  });
  assert.equal(r.view, 'lookup');
  assert.equal(r.readHidden, 'hidden');
  assert.equal(r.rows, 3);
  assert.deepEqual(r.heads[2], { n: '3', name: d.stops[2].name, file: 'api/Dock.java:25-30 +1 more', summary: d.stops[2].summary, badge: null });
  assert.deepEqual(r.heads[0].badge, m.stops[0].badge);
  assert.equal(r.all, '3 of 3 stops');
  assert.deepEqual(r.byName, ['1 of 3 stops', ['1']]);
  assert.deepEqual(r.byFile, ['2 of 3 stops', ['2', '3']]);
  assert.deepEqual(r.byFunction, ['1 of 3 stops', ['2']]);
  assert.deepEqual(r.bySummary, ['1 of 3 stops', ['3']]);
  assert.deepEqual(r.none, ['0 of 3 stops', [], true]);
  assert.deepEqual(r.gaps, ['1 of 3 stops', ['1']]);
  assert.deepEqual(r.open1, [['2'], true, 'true']);
  assert.deepEqual(r.open2, [['3'], false]);
  assert.deepEqual(r.closed, []);
  assert.deepEqual(r.after, ['read', '3', false]);
});

test('where to extend links to its stop', needsChrome, async t => {
  const r = await run(t, assemblePage(pageModel(sample()), null), (r, k) => {
    k.$('[data-view-btn="extend"]').click();
    r.view = k.html.dataset.view;
    const items = k.$$('.extend-item');
    r.items = items.map(x => x.textContent);
    const link = items[0].querySelector('a[data-stop]');
    r.link = [link.dataset.stop, link.getAttribute('href'), link.textContent];
    link.click();
    r.after = [k.html.dataset.view, k.html.dataset.stop];
  });
  assert.equal(r.view, 'extend');
  assert.equal(r.items.length, 1);
  assert.ok(r.items[0].includes('api/Dock.java:5-6'));
  assert.ok(r.items[0].includes('Add a new closed day here.'));
  assert.deepEqual(r.link, ['2', null, '2. The API checks the dock day →']);
  assert.deepEqual(r.after, ['read', '2']);
});

test('page without the map', needsChrome, async t => {
  const m = pageModel(sample({ mapBuilt: false }));
  const r = await run(t, assemblePage(m, null), (r, k) => {
    r.frame = !!k.$('#map-frame');
    r.hideMap = !!k.$('#hide-map');
    r.map = k.html.dataset.map;
    r.checks = k.text(k.$('#head .checks'));
    r.label = k.text(k.$('#map-label'));
    k.$('#next').click();
    r.next = [k.html.dataset.stop, k.text(k.$('#map-label'))];
    k.$('#prev').click();
    r.prev = k.html.dataset.stop;
  });
  assert.deepEqual([r.frame, r.hideMap, r.map], [false, false, 'none']);
  assert.ok(r.checks.endsWith('Map not built, because chalk-talk is not installed'), r.checks);
  assert.equal(r.label, 'Stop 1 of 3 — The form sends the booking');
  assert.deepEqual(r.next, ['2', 'Stop 2 of 3 — The API checks the dock day']);
  assert.equal(r.prev, '1');
});

test('thin stops render', needsChrome, async t => {
  const m = pageModel({
    journey: 'One thin stop', built: '2026-11-11', repos: [{ name: 'r', path: '/nowhere', commit: 'abc1234', uncommitted: [] }],
    stops: [{ id: 'a', name: 'Only stop', code: [{ file: 'a.js', lines: [1, 1], text: 'x();', key_lines: [], left_out: [] }] }],
    checks: { code: { blocks: 1 }, quotes: { quotes: 0, saved: 0, savedOf: {} }, map: { built: false } },
  });
  const r = await run(t, assemblePage(m, null), (r, k) => {
    r.ready = k.html.dataset.ready;
    r.rows = k.$$('#stop .row[data-n]').map(x => x.textContent);
    r.notes = !!k.$('#stop details.notes');
    r.nav = [k.$('#prev').disabled, k.$('#next').disabled];
    r.tabs = ['what', 'data', 'why'].map(name => { k.$(`#stop [data-tab="${name}"]`).click(); return k.text(k.$('#stop .tab-panel')); });
    k.$('[data-view-btn="lookup"]').click();
    r.count = k.text(k.$('#count'));
    k.$('.outline-head').click();
    r.opened = !!k.$('.outline-row.open .block');
    k.$('[data-view-btn="extend"]').click();
    r.extend = [k.$$('.extend-item').length, k.visible(k.$('#no-extend'))];
    k.$('[data-view-btn="read"]').click();
    r.view = k.html.dataset.view;
  });
  assert.equal(r.ready, '1');
  assert.deepEqual(r.rows, ['1x();']);
  assert.equal(r.notes, false);
  assert.deepEqual(r.nav, [true, true]);
  assert.deepEqual(r.tabs, ['', '', '']);
  assert.equal(r.count, '1 of 1 stop');
  assert.equal(r.opened, true);
  assert.deepEqual(r.extend, [0, true]);
  assert.equal(r.view, 'read');
});

// ---- with the real map ----

test('narrow and short frames', needsMap, async t => {
  const page = assemblePage(pageModel(sample()), sampleMap());
  const layout = (r, k) => {
    const grid = k.$('#stop .stop-grid').getBoundingClientRect();
    const code = k.$('#stop .code-col').getBoundingClientRect();
    const side = k.$('#stop .side').getBoundingClientRect();
    r.narrow = k.html.dataset.narrow;
    r.map = k.html.dataset.map;
    r.codeFullWidth = Math.abs(code.width - grid.width) < 2;
    r.sideBelow = side.top >= code.bottom;
    r.frame = Math.round(k.$('#map-frame').getBoundingClientRect().height);
  };
  const small = await run(t, page, layout, { size: [800, 700] });
  assert.deepEqual([small.narrow, small.map, small.codeFullWidth, small.sideBelow], ['1', 'strip', true, true]);

  const toggle = (r, k) => {
    k.$('#hide-map').click();
    r.hidden = [k.html.dataset.map, k.text(k.$('#hide-map')), localStorage.getItem('code-walkthrough:map'), Math.round(k.$('#map-frame').getBoundingClientRect().height)];
    k.$('#hide-map').click();
    r.shown = [k.html.dataset.map, k.text(k.$('#hide-map')), localStorage.getItem('code-walkthrough:map')];
  };
  const big = await run(t, page, `(r, k) => { (${layout})(r, k); (${toggle})(r, k); }`);
  assert.deepEqual([big.narrow, big.map, big.codeFullWidth, big.sideBelow], ['0', 'full', false, false]);
  assert.deepEqual(big.hidden.slice(0, 3), ['strip', 'Show map', 'strip']);
  assert.ok(big.hidden[3] < big.frame / 2, `strip ${big.hidden[3]}px, full ${big.frame}px`);
  assert.equal(big.hidden[3], small.frame);
  assert.deepEqual(big.shown, ['full', 'Hide map', 'full']);
});

test('storage that throws', needsMap, async t => {
  const r = await run(t, assemblePage(pageModel(sample()), sampleMap()), (r, k) => {
    r.throws = (() => { try { return !window.localStorage; } catch (e) { return e.name; } })();
    r.ready = k.html.dataset.ready;
    const theme = k.html.dataset.theme;
    k.$('#theme-toggle').click();
    r.theme = [theme, k.html.dataset.theme];
    k.$('#hide-map').click();
    r.map = k.html.dataset.map;
    k.$('#hide-map').click();
    r.mapAgain = k.html.dataset.map;
  }, { head: BREAK_STORAGE });
  assert.equal(r.throws, 'SecurityError');
  assert.equal(r.ready, '1');
  assert.notEqual(r.theme[0], r.theme[1]);
  assert.deepEqual([r.map, r.mapAgain], ['strip', 'full']);
});

test('light and dark', needsMap, async t => {
  const r = await run(t, assemblePage(pageModel(sample()), sampleMap()), async (r, k) => {
    const { doc } = await k.map();
    const root = doc.documentElement;
    const both = () => [k.html.dataset.theme, root.dataset.theme];
    // every value the map's theme leaves, to see chalk-talk's own change and the page's answer
    const left = [];
    new MutationObserver(ms => ms.forEach(m => left.push(m.oldValue))).observe(root, { attributes: true, attributeFilter: ['data-theme'], attributeOldValue: true });
    // chalk-talk's own theme switch runs the code that re-applies its theme when the system setting changes
    const mapOwn = async () => {
      await k.wait(0);   // let the records of earlier changes arrive first
      const n = left.length;
      doc.getElementById('theme').click();
      await k.wait(0);
      return [...both(), left.slice(n)];
    };
    r.system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    r.start = both();
    r.label = k.text(k.$('#theme-toggle'));
    r.mapOwnAtStart = await mapOwn();
    k.$('#theme-toggle').click();
    r.toggled = [...both(), k.text(k.$('#theme-toggle')), localStorage.getItem('code-walkthrough:theme')];
    r.mapOwnToggled = await mapOwn();
    k.$('#theme-toggle').click();
    r.back = both();
  });
  // The page starts on the viewer's setting, whichever it is where the test runs.
  const a = r.system, b = a === 'dark' ? 'light' : 'dark';
  const word = t => (t === 'dark' ? 'Dark' : 'Light');
  assert.deepEqual(r.start, [a, a]);
  assert.equal(r.label, word(b));
  assert.deepEqual(r.mapOwnAtStart, [a, a, [a, b]]);
  assert.deepEqual(r.toggled, [b, b, word(a), b]);
  assert.deepEqual(r.mapOwnToggled, [b, b, [b, a]]);
  assert.deepEqual(r.back, [a, a]);
});

test('no requests of its own', needsMap, async t => {
  const page = assemblePage(pageModel(sample()), sampleMap());
  const open = '<script type="application/json" id="map-page">';
  const at = page.indexOf(open);
  const outside = page.slice(0, at) + page.slice(page.indexOf('</script>', at));
  assert.doesNotMatch(outside, /(src|href)=["']?https?:|url\(\s*["']?https?:|@import/);

  const r = await run(t, page, async (r, k) => {
    const { win } = await k.map();
    await k.wait(1000);
    r.page = performance.getEntriesByType('resource').map(e => e.name);
    r.map = win.performance.getEntriesByType('resource').map(e => e.name);
  });
  assert.deepEqual(r.page, []);
  const hosts = r.map.map(u => new URL(u).host);
  assert.ok(hosts.every(h => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'), hosts.join(', '));
});

test('keys inside the map move the stop and the map together', needsMap, async t => {
  const d = sample();
  const r = await run(t, assemblePage(pageModel(d), sampleMap()), async (r, k) => {
    const { win, doc } = await k.map();
    const now = () => [k.html.dataset.stop, doc.getElementById('h').textContent];
    const press = key => k.key(doc.body, key, win);
    r.theme = doc.documentElement.dataset.theme;
    r.start = now();
    press('ArrowRight');
    r.right = now();
    press('ArrowRight');
    r.right2 = now();
    press('ArrowLeft');
    r.left = now();
    r.others = [];
    for (const key of [' ', 'j', 'k', 'Home', 'End', 'p', '1', '3', 't', 'v', 'c', 'Escape', 'PageDown', 'PageUp']) {
      press(key);
      await k.wait(100);
      r.others.push([key, ...now(), doc.documentElement.dataset.theme]);
    }
  });
  const at = n => [String(n), d.stops[n - 1].name];
  assert.deepEqual(r.start, at(1));
  assert.deepEqual(r.right, at(2));
  assert.deepEqual(r.right2, at(3));
  assert.deepEqual(r.left, at(2));
  for (const [key, ...rest] of r.others) assert.deepEqual(rest, [...at(2), r.theme], `after ${JSON.stringify(key)}`);
});

test('map and stop stay together', needsMap, async t => {
  const r = await run(t, assemblePage(pageModel(sample()), sampleMap()), null, {
    body: `<script>\n${fs.readFileSync(SELFTEST, 'utf8')}\n</script>`,
  });
  assert.equal(r.status, 'done');
  assert.equal(r.error, null);
  assert.equal(r.actions, 50);
  assert.equal(r.matched, 50, JSON.stringify(r.mismatches));
  assert.equal(r.codePanel, CODE_PANEL);
  assert.deepEqual(r.codeClose, { button: true, secondTap: true });
  assert.equal(r.theme, true);
  assert.equal(r.captionBar, 'hidden');
  assert.deepEqual(r.badRequests, []);
});
