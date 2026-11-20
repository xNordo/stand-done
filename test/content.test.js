// Smoke test of content.js against a simplified Meet-like DOM.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');

function setup() {
  const dom = new JSDOM(`<body>
    <div id="tiles">
      <div data-participant-id="p/1" id="tile1"><div data-participant-id="p/1"></div><span class="notranslate">Ala</span></div>
      <div data-participant-id="p/2" id="tile2"><span class="notranslate">Bob</span></div>
      <div data-participant-id="p/9" id="tileMe"><div jslog="188492;"></div><span class="notranslate">Kuba</span></div>
      <div data-participant-id="p/3" id="tile3"><span class="notranslate">Cezary (PM)</span></div>
    </div>
    <div role="list">
      <div role="listitem" data-participant-id="p/1" aria-label="Ala" id="row1"><div id="av1"><img></div><span>Ala</span></div>
      <div role="listitem" data-participant-id="p/2" aria-label="Bob" id="row2"><div><img></div><span>Bob</span></div>
      <div role="listitem" data-participant-id="p/9" aria-label="Kuba" id="rowMe"><div><img></div><div><span>Kuba</span><span>(Ty)</span></div></div>
      <div role="listitem" data-participant-id="p/8" aria-label="Kuba" id="rowMe2"><div><img></div><div><span>Kuba</span><span>(You)</span></div></div>
      <div role="listitem" data-participant-id="p/3" aria-label="Cezary (PM)" id="row3"><div><img></div><div><span>Cezary (PM)</span></div></div>
    </div></body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(script);
  return dom.window;
}

const tick = (w, id) => w.document.querySelector(`#${id} .stand-done-tick`);
const frame = (w) => new Promise((r) => w.requestAnimationFrame(() => r()));

test('decorates outermost host only, once per element', () => {
  const w = setup();
  assert.strictEqual(w.document.querySelectorAll('.stand-done-tick').length, 6);
  assert.strictEqual(tick(w, 'row1').nextElementSibling, w.document.getElementById('av1'), 'panel tick sits left of avatar');
  assert.ok(w.document.querySelector('#rowMe .stand-done-spacer'), 'own row keeps alignment spacer');
  assert.ok(tick(w, 'row1').classList.contains('stand-done-panel'));
  assert.ok(tick(w, 'tile1').classList.contains('stand-done-tile'));
});

test('ticking a tile syncs the panel row and vice versa', () => {
  const w = setup();
  tick(w, 'tile1').click();
  assert.strictEqual(tick(w, 'row1').getAttribute('aria-pressed'), 'true');
  assert.ok(w.document.getElementById('row1').classList.contains('stand-done-checked'));
  assert.strictEqual(tick(w, 'row2').getAttribute('aria-pressed'), 'false');
  tick(w, 'row1').click();
  assert.strictEqual(tick(w, 'tile1').getAttribute('aria-pressed'), 'false');
});

test('click does not propagate to Meet handlers', () => {
  const w = setup();
  let reached = false;
  w.document.getElementById('tile2').addEventListener('click', () => { reached = true; });
  tick(w, 'tile2').click();
  assert.strictEqual(reached, false);
});

test('newly joined participant gets current state', async () => {
  const w = setup();
  tick(w, 'row2').click();
  const t = w.document.createElement('div');
  t.id = 'tile2b';
  t.setAttribute('data-participant-id', 'p/2');
  w.document.getElementById('tiles').append(t);
  await frame(w);
  await frame(w);
  assert.strictEqual(tick(w, 'tile2b').getAttribute('aria-pressed'), 'true');
});

test('own participant detected language-independently and excluded by id', () => {
  const w = setup();
  // tile with self-view controls -> its id (p/9) is excluded on tile and panel row
  assert.strictEqual(tick(w, 'tileMe'), null);
  assert.strictEqual(tick(w, 'rowMe'), null);
  // panel-only fallback: "<span>name</span><span>(...)</span>" structure
  assert.strictEqual(tick(w, 'rowMe2'), null);
  // names with parentheses are not mistaken for self
  assert.ok(tick(w, 'row3'));
  assert.ok(tick(w, 'tile3'));
});

// Full scans query the whole document; count them via document.querySelectorAll.
function countScans(w) {
  const orig = w.document.querySelectorAll.bind(w.document);
  const counter = { n: 0 };
  w.document.querySelectorAll = (sel) => {
    if (sel === '[data-participant-id]') counter.n++;
    return orig(sel);
  };
  return counter;
}

test('mutations outside participants do not trigger a rescan', async () => {
  const w = setup();
  const scans = countScans(w);
  const captions = w.document.createElement('div');
  captions.textContent = 'caption line';
  w.document.body.append(captions);
  captions.append(w.document.createElement('span'));
  await frame(w);
  await frame(w);
  assert.strictEqual(scans.n, 0);
});

test('own decoration does not cause a follow-up rescan', async () => {
  const w = setup();
  const scans = countScans(w);
  const t = w.document.createElement('div');
  t.id = 'tile4';
  t.setAttribute('data-participant-id', 'p/4');
  w.document.getElementById('tiles').append(t);
  await frame(w);
  await frame(w);
  await frame(w);
  assert.ok(tick(w, 'tile4'));
  assert.strictEqual(scans.n, 1, 'one scan for the new tile, none for our inserted button');
});

test('button removed by Meet re-render is re-added', async () => {
  const w = setup();
  tick(w, 'tile2').remove();
  await frame(w);
  await frame(w);
  assert.ok(tick(w, 'tile2'));
});

test('self-view controls rendered later still exclude own tile', async () => {
  const w = setup();
  assert.ok(tick(w, 'tile3'));
  const ctl = w.document.createElement('div');
  ctl.setAttribute('jslog', '177243;');
  w.document.getElementById('tile3').append(ctl);
  await frame(w);
  await frame(w);
  assert.strictEqual(tick(w, 'tile3'), null);
  assert.strictEqual(tick(w, 'row3'), null);
});
