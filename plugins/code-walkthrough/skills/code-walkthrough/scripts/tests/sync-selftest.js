// Protocol P from plan Task 1 Step 3, run against the walkthrough page with the real map.
// page.test.mjs puts this script before </body>; it writes its result to #test-report.
//  1. wait for the frame's chalk.ready;
//  2. make 50 actions drawn with mulberry32(20261111);
//  3. after each, wait 300 ms and compare the page's stop name with the map's #h;
//  4. check 3: tap the first visible block with code; kept, off or broken;
//  5. check 4: the map follows the page's dark, then light; read the caption bar's display;
//  6. check 5: every resource the page and the map loaded is a Google Fonts file;
//  7. report.
(() => {
  'use strict';
  const LT = String.fromCharCode(92) + 'u003c';
  const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  const MAP_KEYS = ['ArrowRight', 'ArrowLeft', ' ', 'j', 'k', 'Home', 'End', 'p', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const html = document.documentElement;
  const STOPS = JSON.parse($('#walk-data').textContent).stops;
  const N = STOPS.length;
  const stopNow = () => Number(html.dataset.stop);

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function writeReport(rep) {
    let node = document.getElementById('test-report');
    if (!node) {
      node = document.createElement('script');
      node.type = 'application/json';
      node.id = 'test-report';
      document.body.appendChild(node);
    }
    node.textContent = JSON.stringify(rep).split('<').join(LT);
  }

  // The map's window once its load has run (the page wires the map there) and chalk.ready has resolved.
  function mapReady() {
    return new Promise((resolve, reject) => {
      const frame = $('#map-frame');
      if (!frame) return reject(new Error('no #map-frame'));
      const loaded = () => {
        try {
          const w = frame.contentWindow;
          return w && w.chalk && w.document.getElementById('board') && w.document.readyState === 'complete' ? w : null;
        } catch (_) { return null; }
      };
      const ready = w => w.chalk.ready.then(() => resolve(w), reject);
      if (loaded()) return ready(loaded());
      const onLoad = () => { const w = loaded(); if (w) { frame.removeEventListener('load', onLoad); ready(w); } };
      frame.addEventListener('load', onLoad);
    });
  }

  function pointer(win, target, type, x, y) {
    target.dispatchEvent(new win.PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
    }));
  }
  function tap(win, target, x, y) { pointer(win, target, 'pointerdown', x, y); pointer(win, target, 'pointerup', x, y); }
  function tapMiddle(win, el) {
    const r = el.getBoundingClientRect();
    tap(win, el, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  }
  function boardView(win, board) {
    const r = board.getBoundingClientRect();
    return { x0: Math.max(r.left, 0), y0: Math.max(r.top, 0), x1: Math.min(r.right, win.innerWidth), y1: Math.min(r.bottom, win.innerHeight) };
  }
  // A spot on the board with nothing drawn under it; the scan starts where the action's random value says.
  function emptySpot(win, doc, board, r) {
    const v = boardView(win, board), COLS = 16, ROWS = 10, total = COLS * ROWS;
    const start = Math.floor(r * total);
    for (let j = 0; j < total; j++) {
      const idx = (start + j) % total;
      const x = Math.round(v.x0 + (v.x1 - v.x0) * ((idx % COLS) + 0.5) / COLS);
      const y = Math.round(v.y0 + (v.y1 - v.y0) * (Math.floor(idx / COLS) + 0.5) / ROWS);
      const t = doc.elementFromPoint(x, y);
      if (t && board.contains(t) && !t.closest('.el') && !t.closest('.has-code')) return { x, y, target: t };
    }
    return { x: Math.round(v.x0 + 2), y: Math.round(v.y0 + 2), target: board, fallback: true };
  }
  function targetAt(doc, board, x, y) { const t = doc.elementFromPoint(x, y); return t && board.contains(t) ? t : board; }

  // One outline row's "Read from here", the way a reader gets there: Look up, open the row, click.
  function readFromRow(k) {
    $('[data-view-btn="lookup"]').click();
    const row = $$('.outline-row')[k - 1];
    if (!row.classList.contains('open')) row.querySelector('.outline-head').click();
    row.querySelector('.read-from-here').click();
  }

  async function protocolP() {
    const rep = {
      status: 'running', actions: 0, matched: 0, mismatches: [], codePanel: null, codeClose: null,
      theme: null, themeSeen: null, captionBar: null, requests: [], badRequests: [], kinds: [], log: [], error: null,
    };
    writeReport(rep);
    try {
      // 1. wait for the frame's chalk.ready
      const win = await Promise.race([mapReady(), wait(20000).then(() => { throw new Error('the map was not ready after 20 s'); })]);
      await wait(300);
      const doc = win.document;
      const board = doc.getElementById('board');
      const bar = doc.querySelector('section.bar');
      const barVisible = !!bar && win.getComputedStyle(bar).display !== 'none';
      const kinds = ['next', 'prev', 'arrow', 'pip', 'row', 'mapkey', 'tap', 'swipe'];
      if (barVisible) kinds.push('mapbutton');
      rep.kinds = kinds.slice();
      const rnd = mulberry32(20261111);

      // 2-3. fifty actions, each compared after 300 ms
      for (let i = 1; i <= 50; i++) {
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        const r2 = rnd();
        let desc = kind;
        switch (kind) {
          case 'next': desc = 'page Next'; $('#next').click(); break;
          case 'prev': desc = 'page Prev'; $('#prev').click(); break;
          case 'arrow': {
            const key = r2 < 0.5 ? 'ArrowRight' : 'ArrowLeft';
            desc = 'page key ' + key;
            document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            break;
          }
          case 'pip': { const k = 1 + Math.floor(r2 * N); desc = 'pip ' + k; $$('#pips button')[k - 1].click(); break; }
          case 'row': { const k = 1 + Math.floor(r2 * N); desc = 'outline row ' + k + ' Read from here'; readFromRow(k); break; }
          case 'mapkey': {
            const key = MAP_KEYS[Math.floor(r2 * MAP_KEYS.length)];
            desc = 'map key ' + JSON.stringify(key);
            doc.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            break;
          }
          case 'tap': {
            const p = emptySpot(win, doc, board, r2);
            desc = 'map tap at ' + p.x + ',' + p.y + (p.fallback ? ' (fallback spot)' : '');
            tap(win, p.target, p.x, p.y);
            break;
          }
          case 'swipe': {
            const v = boardView(win, board);
            const x = Math.round(v.x0 + 130 + r2 * Math.max(0, v.x1 - v.x0 - 140));
            const y = Math.round((v.y0 + v.y1) / 2);
            desc = 'map swipe from ' + x + ',' + y + ' to ' + (x - 120) + ',' + y;
            pointer(win, targetAt(doc, board, x, y), 'pointerdown', x, y);
            pointer(win, targetAt(doc, board, x - 120, y), 'pointerup', x - 120, y);
            break;
          }
          case 'mapbutton': {
            const btns = [doc.getElementById('next'), doc.getElementById('prev'), ...doc.querySelectorAll('.progress button')];
            const b = btns[Math.floor(r2 * btns.length)];
            desc = 'map button ' + (b.id || b.title);
            b.click();
            break;
          }
        }
        rep.actions = i;
        await wait(300);
        const page = STOPS[stopNow() - 1].name, map = doc.getElementById('h').textContent;
        rep.log.push(i + ' ' + desc + ' -> ' + stopNow());
        if (page === map) rep.matched++;
        else rep.mismatches.push({ i, action: desc, page, map });
        writeReport(rep);
      }

      // 4. check 3: tap the first block with code that a reader can see
      const code = doc.getElementById('code');
      const first = Array.from(board.querySelectorAll('.has-code[data-id]')).find(el => !el.closest('.off') && el.getClientRects().length > 0);
      if (!first) { rep.codePanel = 'untested'; throw new Error('no visible block with code on the board at stop ' + stopNow()); }
      const before = { page: stopNow(), map: doc.getElementById('h').textContent };
      const openBefore = code.classList.contains('open');
      tapMiddle(win, first);
      await wait(300);
      const moved = () => stopNow() !== before.page || doc.getElementById('h').textContent !== before.map;
      rep.codePanel = moved() ? 'broken' : !openBefore && code.classList.contains('open') ? 'kept' : 'off';
      if (rep.codePanel === 'kept') {
        // with the map's keys blocked, the panel closes by its own button or a second tap on the same block
        doc.getElementById('code-close').click();
        await wait(300);
        const button = !code.classList.contains('open');
        tapMiddle(win, first);
        await wait(300);
        const reopened = code.classList.contains('open');
        tapMiddle(win, first);
        await wait(300);
        rep.codeClose = { button, secondTap: reopened && !code.classList.contains('open') && !moved() };
      }

      // 5. check 4: the map follows the page's light or dark
      const toggle = $('#theme-toggle');
      const setTheme = t => { if (html.dataset.theme !== t) toggle.click(); return doc.documentElement.dataset.theme; };
      const startTheme = html.dataset.theme;
      const sawDark = setTheme('dark');
      const sawLight = setTheme('light');
      rep.themeSeen = { dark: sawDark, light: sawLight };
      rep.theme = sawDark === 'dark' && sawLight === 'light';
      setTheme(startTheme);
      rep.captionBar = bar && win.getComputedStyle(bar).display === 'none' ? 'hidden' : 'stop name';

      // 6. check 5: no requests besides the map's fonts
      rep.requests = [
        ...performance.getEntriesByType('resource').map(e => ({ from: 'page', url: e.name })),
        ...win.performance.getEntriesByType('resource').map(e => ({ from: 'map', url: e.name })),
      ];
      rep.badRequests = rep.requests.filter(e => { try { return !FONT_HOSTS.includes(new URL(e.url).host); } catch (_) { return true; } });
    } catch (e) {
      rep.error = String(e && e.message || e);
    }
    // 7. report
    rep.status = 'done';
    rep.errors = window.__errors || [];
    writeReport(rep);
  }

  protocolP();
})();
