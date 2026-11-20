// The walkthrough page. Every word about the walkthrough comes from the model in #walk-data;
// this file adds only the fixed labels in WORDS. CODE_PANEL is set by assemblePage just before it.
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const M = JSON.parse($('walk-data').textContent);
  const MAP_HTML = JSON.parse($('map-page').textContent);
  const STOPS = M.stops;
  const N = STOPS.length;

  const KEY_MAP = 'code-walkthrough:map';
  const KEY_THEME = 'code-walkthrough:theme';
  const SHORT = 800;   // px high: in a shorter frame the map starts as its strip
  const WORDS = {
    prev: '← Prev', next: 'Next →', hideMap: 'Hide map', showMap: 'Show map', toDark: 'Dark', toLight: 'Light',
    what: 'What it does', data: 'Data in → out', in: 'In', out: 'Out', guess: 'Guess', readHere: 'Read from here', map: 'Map',
  };

  // Browser storage can be missing or throw (private windows, blocked site data, some frames).
  const store = {
    get(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch (_) { /* the choice lasts until the page closes */ } },
  };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    el.append(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));
    return el;
  }
  const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));

  // Prose may mark code with backticks; those parts show as code, everything else as plain text.
  function md(text) {
    const parts = String(text ?? '').split('`');
    const paired = parts.length % 2 === 1;
    return parts.map((p, i) => (i % 2 === 0 ? p : paired || i < parts.length - 1 ? h('code', null, p) : '`' + p));
  }

  /* ---------- where the page starts ---------- */

  // `?` or `#stop=N&view=…&tab=…`, read once at start.
  const params = new URLSearchParams();
  try {
    for (const part of [location.search.slice(1), location.hash.slice(1)]) new URLSearchParams(part).forEach((v, k) => params.set(k, v));
  } catch (_) { /* no address to read inside some frames */ }
  const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
  const clampStop = k => Math.min(N, Math.max(1, Number.isFinite(k) ? Math.trunc(k) : 1));

  const DARK = matchMedia('(prefers-color-scheme: dark)');
  const NARROW = matchMedia('(max-width: 899.98px)');
  const savedTheme = oneOf(store.get(KEY_THEME), ['light', 'dark'], null);
  const savedMap = oneOf(store.get(KEY_MAP), ['full', 'strip'], null);
  let themeChosen = !!savedTheme;

  const state = {
    view: oneOf(params.get('view'), ['read', 'lookup', 'extend'], 'read'),
    stop: clampStop(parseInt(params.get('stop'), 10)),
    tab: oneOf(params.get('tab'), ['what', 'data', 'why'], 'what'),
    mapState: MAP_HTML == null ? 'none' : savedMap || (window.innerHeight < SHORT ? 'strip' : 'full'),
    theme: savedTheme || (DARK.matches ? 'dark' : 'light'),
  };

  /* ---------- header ---------- */

  function renderHead() {
    $('title').textContent = M.title;
    put(document.querySelector('#head .built'), md(M.built));
    const files = document.querySelector('#head .files');
    put(files, M.uncommittedFiles.map(f => h('li', null, h('code', null, f))));
    files.hidden = !M.uncommittedFiles.length;
    document.querySelector('#head .checks').textContent = M.checks;
    document.querySelector('#head .reasons').textContent = M.reasons;
  }

  /* ---------- one stop: code, notes, and what, data and why ---------- */

  const COMMENT = /^\s*(\/\/|#(\s|$)|\/\*|\*(\s|\/|$)|--\s|[<]!--)/; // [<]: no comment opener in an inline script

  function codeRow(r, expand) {
    if (r.gap) return h('div', { class: 'row gap' }, h('span', { class: 'no' }), h('span', { class: 'tx' }, r.label));
    if (r.fold) {
      const onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); expand(); } };
      return h('div', { class: 'row fold', role: 'button', tabindex: '0', onclick: expand, onkeydown }, h('span', { class: 'no' }), h('span', { class: 'tx' }, r.label));
    }
    const cls = ['row', r.key && 'key', r.hidden && 'hid', COMMENT.test(r.text) && 'cm'].filter(Boolean).join(' ');
    return h('div', { class: cls, 'data-n': r.n }, h('span', { class: 'no' }, String(r.n)), h('span', { class: 'tx' }, r.text));
  }

  function codeBlock(b) {
    const block = h('div', { class: b.folded ? 'block collapsed' : 'block' });
    const expand = () => { block.classList.remove('collapsed'); if (showAll) showAll.remove(); };
    const showAll = b.folded ? h('button', { type: 'button', class: 'linkbtn show-all', onclick: expand }, b.showAll) : null;
    block.append(
      h('div', { class: 'code-head' }, h('span', { class: 'path' }, b.label), b.fn ? h('span', { class: 'fn' }, b.fn) : null, showAll),
      h('div', { class: 'code' }, h('div', { class: 'lines' }, b.rows.map(r => codeRow(r, expand)))));
    return block;
  }

  const codeColumn = s => h('div', { class: 'code-col' },
    s.blocks.map(codeBlock),
    s.notes.length ? h('details', { class: 'notes' }, h('summary', null, s.notesLabel), h('ul', null, s.notes.map(n => h('li', null, md(n))))) : null);

  const whereLine = s => h('div', { class: 'where' },
    s.blocks.map((b, i) => [i ? ', ' : null, h('code', null, b.label), b.fn ? [' ', h('span', { class: 'fn' }, b.fn)] : null]));

  const whatBody = s => (s.what ? h('p', null, md(s.what)) : null);

  const dataBody = s => (s.dataIn || s.dataOut ? h('div', { class: 'io' },
    s.dataIn ? [h('span', { class: 'io-k' }, WORDS.in), h('span', { class: 'io-v' }, md(s.dataIn))] : null,
    s.dataIn && s.dataOut ? h('span', { class: 'io-arrow', 'aria-hidden': 'true' }, '→') : null,
    s.dataOut ? [h('span', { class: 'io-k' }, WORDS.out), h('span', { class: 'io-v' }, md(s.dataOut))] : null) : null);

  function reason(w) {
    const detail = h('div', { class: 'chip-detail', hidden: true }, w.detail);
    const chip = h('button', {
      type: 'button', class: `chip chip-${w.tone}`, 'aria-expanded': 'false',
      onclick: () => { detail.hidden = !detail.hidden; chip.setAttribute('aria-expanded', String(!detail.hidden)); },
    }, w.chip);
    return h('li', { class: w.notRecorded ? 'not-recorded' : null }, md(w.text), ' ', chip, detail);
  }

  const whyBody = s => [
    s.why.length ? h('ul', { class: 'why' }, s.why.map(reason)) : null,
    s.guesses.map(g => h('p', { class: 'guess' }, h('span', { class: 'guess-tag' }, WORDS.guess), ' ', md(g))),
  ];

  const tabBody = (s, tab) => (tab === 'what' ? whatBody(s) : tab === 'data' ? dataBody(s) : whyBody(s));

  // "Why 3 · 1 not recorded": the gap count keeps its own colour, so it is never lost in a label.
  function whyTabLabel(label) {
    const at = label.indexOf(' · ');
    return at < 0 ? label : [label.slice(0, at), h('span', { class: 'gapn' }, label.slice(at))];
  }

  function sideColumn(s) {
    const tabs = [['what', WORDS.what], ['data', WORDS.data], ['why', whyTabLabel(s.whyLabel)]];
    return h('div', { class: 'side' },
      h('div', { class: 'ctabs', role: 'tablist' }, tabs.map(([key, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'ctab', 'data-tab': key, 'aria-selected': String(key === state.tab), onclick: () => setTab(key) }, label))),
      h('div', { class: 'tab-panel', role: 'tabpanel' }, tabBody(s, state.tab)));
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#stop [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    put(document.querySelector('#stop .tab-panel'), tabBody(STOPS[state.stop - 1], tab));
  }

  /* ---------- Read ---------- */

  const pips = STOPS.map(s => h('button', { type: 'button', class: 'pip', title: s.label, 'aria-label': s.label, onclick: () => go(s.n) }, String(s.n)));
  put($('pips'), pips);
  $('prev').addEventListener('click', () => go(state.stop - 1));
  $('next').addEventListener('click', () => go(state.stop + 1));

  function navButton(button, label, plain) {
    button.disabled = !label;
    button.textContent = label || plain;
    button.title = label;
  }

  function renderStop() {
    const s = STOPS[state.stop - 1];
    html.dataset.stop = String(s.n);
    pips.forEach((b, i) => {
      b.classList.toggle('cur', i + 1 === s.n);
      if (i + 1 === s.n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    outlineRows.forEach((row, i) => row.classList.toggle('cur', i + 1 === s.n));
    put($('map-label'), h('span', { class: 'cnt' }, s.kicker), h('span', { class: 'sep' }, ' — '), h('b', null, s.name));
    navButton($('prev'), s.prevLabel, WORDS.prev);
    navButton($('next'), s.nextLabel, WORDS.next);
    put($('stop'), h('div', { class: 'stop-in' },
      h('div', { class: 'stop-head' }, h('div', { class: 'kicker' }, s.kicker), h('h2', { class: 'stop-title' }, s.name), whereLine(s)),
      h('div', { class: 'stop-grid' }, codeColumn(s), sideColumn(s))));
    $('stop').scrollTop = 0;
  }

  // The one way the stop moves: the stop card, the pips, the label and the map together.
  function go(k) {
    const next = clampStop(k);
    if (next !== state.stop) { state.stop = next; renderStop(); }
    if (map) map.win.chalk.go(state.stop);
  }

  /* ---------- Look up ---------- */

  const haystacks = STOPS.map(s => [s.name, s.summary, ...s.blocks.flatMap(b => [b.label, b.fn])].filter(Boolean).join('\n').toLowerCase());
  let openRow = 0;

  const outlineRows = STOPS.map(s => h('div', { class: 'outline-row', 'data-n': s.n },
    h('button', { type: 'button', class: 'outline-head', 'aria-expanded': 'false', onclick: () => toggleRow(s.n) },
      h('span', { class: 'on' }, String(s.n)),
      h('span', { class: 'ot' }, s.name),
      h('span', { class: 'of' }, s.firstFile, s.moreLabel ? [' ', h('span', { class: 'more' }, s.moreLabel)] : null),
      h('span', { class: 'os' }, md(s.summary)),
      h('span', { class: 'gapcell' }, s.badge ? h('span', { class: 'gapb' }, s.badge) : null),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
  put($('outline'), outlineRows);

  const card = (kind, title, body) => h('section', { class: `card k-${kind}` }, h('h3', null, title), body);

  function rowBody(s) {
    return h('div', { class: 'outline-body' },
      h('div', { class: 'body-top' }, whereLine(s), h('button', { type: 'button', class: 'btn read-from-here', onclick: () => readAt(s.n) }, WORDS.readHere)),
      codeColumn(s),
      h('div', { class: 'cards' }, card('what', WORDS.what, whatBody(s)), card('data', WORDS.data, dataBody(s)), card('why', whyTabLabel(s.whyLabel), whyBody(s))));
  }

  // One row open at a time; a click on the open row closes it.
  function toggleRow(n) {
    openRow = openRow === n ? 0 : n;
    outlineRows.forEach((row, i) => {
      const open = i + 1 === openRow;
      row.classList.toggle('open', open);
      row.firstChild.setAttribute('aria-expanded', String(open));
      if (row.childNodes[1]) row.childNodes[1].remove();
      if (open) row.append(rowBody(STOPS[i]));
    });
  }

  function renderLookup() {
    const q = $('filter').value.trim().toLowerCase();
    const gapsOnly = $('only-gaps').checked;
    let shown = 0;
    outlineRows.forEach((row, i) => {
      row.hidden = Boolean((q && !haystacks[i].includes(q)) || (gapsOnly && !STOPS[i].badge));
      if (!row.hidden) shown++;
    });
    $('count').textContent = `${shown} ${M.outOf}`;
    $('no-match').hidden = shown > 0;
  }
  $('filter').addEventListener('input', renderLookup);
  $('only-gaps').addEventListener('change', renderLookup);

  /* ---------- Where to extend ---------- */

  function renderExtend() {
    const open = n => ev => { if (ev.type === 'click' || ev.key === 'Enter') { ev.preventDefault(); readAt(n); } };
    put($('extend-list'), M.extend.map(e => h('li', { class: 'extend-item' },
      h('code', { class: 'ex-where' }, e.where),
      h('div', { class: 'ex-text' }, md(e.text)),
      // No href: inside a note the page sits under the vault's <base>, so a link must never navigate.
      e.stopN ? h('a', { class: 'ex-link', 'data-stop': e.stopN, role: 'link', tabindex: '0', onclick: open(e.stopN), onkeydown: open(e.stopN) }, e.link) : null)));
    $('no-extend').hidden = M.extend.length > 0;
  }

  /* ---------- views, theme, map size, narrow ---------- */

  function setView(view) {
    state.view = view;
    html.dataset.view = view;
    $('lookup').hidden = view !== 'lookup';
    $('extend').hidden = view !== 'extend';
    document.querySelectorAll('[data-view-btn]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.viewBtn === view)));
  }
  document.querySelectorAll('[data-view-btn]').forEach(b => b.addEventListener('click', () => setView(b.dataset.viewBtn)));

  function readAt(n) { setView('read'); go(n); }

  let mapRoot = null;   // the map page's <html>, from its load on

  // The map follows the page.
  function setTheme(theme) {
    state.theme = theme;
    html.dataset.theme = theme;
    $('theme-toggle').textContent = theme === 'dark' ? WORDS.toLight : WORDS.toDark;
    if (mapRoot) mapRoot.dataset.theme = theme;
  }
  $('theme-toggle').addEventListener('click', () => {
    const theme = state.theme === 'dark' ? 'light' : 'dark';
    themeChosen = true;
    store.set(KEY_THEME, theme);
    setTheme(theme);
  });
  // Light and dark follow the viewer until the toggle is used.
  DARK.addEventListener('change', () => { if (!themeChosen) setTheme(DARK.matches ? 'dark' : 'light'); });

  function setMapState(mapState) {
    state.mapState = mapState;
    html.dataset.map = mapState;
    if (mapState !== 'none') $('hide-map').textContent = mapState === 'strip' ? WORDS.showMap : WORDS.hideMap;
  }
  $('hide-map').addEventListener('click', () => {
    const mapState = state.mapState === 'full' ? 'strip' : 'full';
    store.set(KEY_MAP, mapState);
    setMapState(mapState);
  });

  const setNarrow = () => { html.dataset.narrow = NARROW.matches ? '1' : '0'; };
  NARROW.addEventListener('change', setNarrow);

  /* ---------- keys: ← and → move the stop, but not while typing ---------- */

  const typing = el => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.defaultPrevented) return;
    if (typing(ev.target) || typing(document.activeElement)) return;
    ev.preventDefault();
    go(state.stop + (ev.key === 'ArrowRight' ? 1 : -1));
  });

  /* ---------- the map: chalk-talk's page in a frame, moved only by this page ---------- */

  let map = null;   // { win, doc } once the map's chalk.ready has resolved

  // The map's own keys, taps and swipes would move it without the stop, so its input is
  // stopped before chalk-talk sees it. ← and → move both; a tap on a block with code still
  // opens chalk-talk's code panel, which closes by its button or a second tap on the block.
  function blockInput(win, doc) {
    const board = doc.getElementById('board');
    const onBoard = t => !!(board && t && board.contains(t));
    const codeHit = t => {
      if (CODE_PANEL !== 'kept') return null;
      const hit = t && t.closest ? t.closest('.has-code[data-id]') : null;
      return hit && !hit.closest('.off') ? hit : null;
    };
    const halt = ev => ev.stopImmediatePropagation();
    const NO_DEFAULT = new Set(['ArrowRight', 'ArrowLeft', ' ', 'PageUp', 'PageDown', 'Home', 'End']);
    win.addEventListener('keydown', ev => {
      halt(ev);
      if (NO_DEFAULT.has(ev.key)) ev.preventDefault();
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      if (ev.key === 'ArrowRight') go(state.stop + 1);
      else if (ev.key === 'ArrowLeft') go(state.stop - 1);
    }, true);
    let down = null;   // where a press on a block with code was let through
    win.addEventListener('pointerdown', ev => {
      if (!onBoard(ev.target)) return;
      if (codeHit(ev.target)) { down = [ev.clientX, ev.clientY]; return; }
      down = null;
      halt(ev);
    }, true);
    win.addEventListener('pointerup', ev => {
      if (!onBoard(ev.target)) { down = null; return; }
      const d = down;
      down = null;
      if (d && Math.abs(ev.clientX - d[0]) < 6 && Math.abs(ev.clientY - d[1]) < 6 && codeHit(ev.target)) return;
      halt(ev);
    }, true);
    win.addEventListener('hashchange', halt, true);
  }

  // chalk-talk re-applies its own theme when the system's light or dark setting changes;
  // the page's theme wins.
  function followPageTheme(root) {
    mapRoot = root;
    const keep = () => { if (root.dataset.theme !== state.theme) root.dataset.theme = state.theme; };
    new MutationObserver(keep).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    keep();
  }

  function startMap() {
    const frame = h('iframe', { id: 'map-frame', title: WORDS.map });
    const onLoad = () => {
      let win, doc;
      try { win = frame.contentWindow; doc = frame.contentDocument; } catch (_) { return; }
      if (!win || !doc || !win.chalk || !doc.getElementById('board')) return;   // not the map yet
      frame.removeEventListener('load', onLoad);
      blockInput(win, doc);
      followPageTheme(doc.documentElement);
      win.chalk.ready.then(() => {
        map = { win, doc };
        doc.documentElement.dataset.theme = state.theme;
        win.chalk.go(state.stop);
      });
    };
    frame.addEventListener('load', onLoad);
    $('map-wrap').append(frame);
    frame.srcdoc = MAP_HTML;
  }

  /* ---------- start ---------- */

  if (MAP_HTML == null) { $('map-wrap').remove(); $('hide-map').remove(); }
  renderHead();
  renderExtend();
  setNarrow();
  setTheme(state.theme);
  setMapState(state.mapState);
  setView(state.view);
  renderStop();
  renderLookup();
  if (MAP_HTML != null) startMap();
  html.dataset.ready = '1';
})();
