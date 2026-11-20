// Stand Done — adds tick toggles to Google Meet participants (People panel + video tiles).
// State lives in memory only: it is lost on page reload.
(() => {
  'use strict';

  const ATTR = 'data-participant-id';
  const HOST_SELECTOR = `[${ATTR}]`;
  const BTN_CLASS = 'stand-done-tick';
  const DONE_CLASS = 'stand-done-checked';
  const HOST_CLASS = 'stand-done-host';
  const SPACER_CLASS = 'stand-done-spacer';
  // Own video tile contains self-view controls (Reframe / Backgrounds and effects).
  // Matched by Meet's numeric jslog ids, which do not depend on UI language.
  const SELF_TILE_MARKER = '[jslog^="188492"], [jslog^="177243"], [jslog^="187882"]';

  /** @type {Set<string>} participant ids marked as done */
  const done = new Set();
  /** Own participant ids confirmed by a tile's self-view controls (tiles and panel rows share the id). */
  const selfIds = new Set();
  /** Own id guessed from the panel; used only while no tile confirms self. */
  let guessedSelfId = null;

  // Panel list items and video tiles both carry data-participant-id in Meet.
  // Only the outermost element per id is decorated (Meet nests the attribute).
  function findHosts(root) {
    const hosts = [];
    root.querySelectorAll(HOST_SELECTOR).forEach((el) => {
      const id = el.getAttribute(ATTR);
      if (!id) return;
      const parent = el.parentElement && el.parentElement.closest(HOST_SELECTOR);
      if (parent && parent.getAttribute(ATTR) === id) return;
      hosts.push(el);
    });
    return hosts;
  }

  function isPanelItem(el) {
    return el.getAttribute('role') === 'listitem' || !!el.closest('[role="list"]');
  }

  function cleanName(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function participantName(el) {
    if (isPanelItem(el)) {
      const label = el.getAttribute('aria-label');
      if (label) return cleanName(label);
      const first = el.querySelector('span');
      return cleanName(first ? first.textContent : '');
    }
    const nameEl = el.querySelector('.notranslate');
    return cleanName(nameEl ? nameEl.textContent : '');
  }

  // Panel fallback (when your tile is hidden): Meet renders your row's name as
  // <span>Name</span><span>(You)</span> — detected structurally, not by the word.
  // Other rows might share the structure (e.g. a "(Guest)" tag), so this is only a guess.
  function panelRowHasSelfSuffix(el) {
    const label = cleanName(el.getAttribute('aria-label'));
    if (!label) return false;
    return [...el.querySelectorAll('span')].some((span) => {
      const next = span.nextElementSibling;
      return cleanName(span.textContent) === label && !span.children.length &&
        next && next.tagName === 'SPAN' && /^\(.+\)$/.test(cleanName(next.textContent));
    });
  }

  function learnSelf(hosts) {
    hosts.forEach((el) => {
      const id = el.getAttribute(ATTR);
      if (!selfIds.has(id) && !isPanelItem(el) && el.querySelector(SELF_TILE_MARKER)) selfIds.add(id);
    });
    // A tile confirmation wins; the panel guess is trusted only when exactly one row matches.
    if (selfIds.size) {
      guessedSelfId = null;
      return;
    }
    const guesses = new Set(hosts.filter((el) => isPanelItem(el) && panelRowHasSelfSuffix(el))
      .map((el) => el.getAttribute(ATTR)));
    guessedSelfId = guesses.size === 1 ? [...guesses][0] : null;
  }

  function isSelf(el) {
    const id = el.getAttribute(ATTR);
    return selfIds.has(id) || id === guessedSelfId;
  }

  function buttonOf(el) {
    return el.querySelector(`.${BTN_CLASS}`);
  }

  function render(el) {
    const checked = done.has(el.getAttribute(ATTR));
    el.classList.toggle(DONE_CLASS, checked);
    if (checked && !isPanelItem(el)) matchTileRadius(el);
    const btn = buttonOf(el);
    if (!btn) return;
    const name = participantName(el) || 'participant';
    const title = checked ? `${name} — already spoke (click to undo)` : `Mark ${name} as done`;
    // Write only on change: render runs on every scan.
    setAttr(btn, 'aria-pressed', String(checked));
    setAttr(btn, 'title', title);
    setAttr(btn, 'aria-label', title);
  }

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  /** Tiles already measured — measuring forces layout, so do it once per element. */
  const radiusTried = new WeakSet();

  // The green border follows the tile's rounded corners, which Meet sets on an
  // inner element — copy the first non-zero radius onto the host (CSS falls back to 8px).
  function matchTileRadius(el) {
    if (radiusTried.has(el)) return;
    radiusTried.add(el);
    const candidates = [el, ...el.querySelectorAll('div')].slice(0, 20);
    for (const c of candidates) {
      const r = getComputedStyle(c).borderTopLeftRadius;
      // Only elements spanning the whole tile (skip round avatars etc.).
      if (r && r.endsWith('px') && parseFloat(r) > 0 && c.offsetWidth >= el.offsetWidth - 4) {
        el.style.setProperty('--stand-done-radius', r);
        return;
      }
    }
  }

  function renderAll() {
    findHosts(document).forEach(render);
  }

  function toggle(key) {
    if (done.has(key)) done.delete(key);
    else done.add(key);
    renderAll();
  }

  function stop(e) {
    // Keep Meet from reacting (pinning tiles, opening menus, etc.).
    e.stopImmediatePropagation();
  }

  function undecorate(el) {
    const btn = buttonOf(el);
    if (btn) btn.remove();
    el.classList.remove(HOST_CLASS, DONE_CLASS);
  }

  // Panel checkbox goes in the row's flex line, left of the avatar.
  function insertPanelNode(el, node) {
    const avatar = el.querySelector('img');
    const box = avatar && avatar.parentElement;
    if (box && box.parentElement && box !== el) box.parentElement.insertBefore(node, box);
    else el.insertBefore(node, el.firstChild);
  }

  function createButton(el, panel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${BTN_CLASS} ${panel ? 'stand-done-panel' : 'stand-done-tile'}`;
    ['pointerdown', 'mousedown', 'mouseup', 'keydown', 'keyup'].forEach((t) =>
      btn.addEventListener(t, (e) => {
        if (t.startsWith('key') && e.key !== 'Enter' && e.key !== ' ') return;
        stop(e);
      }, true)
    );
    btn.addEventListener('click', (e) => {
      stop(e);
      e.preventDefault();
      toggle(el.getAttribute(ATTR));
    }, true);
    return btn;
  }

  function decorate(el) {
    if (isSelf(el)) {
      // Clear the tick only for confirmed self; a wrong panel guess must not lose it.
      if (selfIds.has(el.getAttribute(ATTR))) done.delete(el.getAttribute(ATTR));
      undecorate(el);
      // Keep own row aligned with the others in the panel.
      if (isPanelItem(el) && !el.querySelector(`.${SPACER_CLASS}`)) {
        const spacer = document.createElement('span');
        spacer.className = SPACER_CLASS;
        spacer.setAttribute('aria-hidden', 'true');
        insertPanelNode(el, spacer);
      }
      return;
    }
    // Row was guessed as own before (guess dropped) — remove its spacer.
    const spacer = el.querySelector(`.${SPACER_CLASS}`);
    if (spacer) spacer.remove();
    if (!buttonOf(el)) {
      const panel = isPanelItem(el);
      const btn = createButton(el, panel);
      el.classList.add(HOST_CLASS);
      // Panel: checkbox left of the avatar; tile: chip floating top-left.
      if (panel) insertPanelNode(el, btn);
      else el.prepend(btn);
    }
    render(el);
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    const hosts = findHosts(document);
    learnSelf(hosts);
    hosts.forEach(decorate);
  }

  function isOwnNode(node) {
    return node instanceof Element &&
      (node.classList.contains(BTN_CLASS) || node.classList.contains(SPACER_CLASS));
  }

  function hasParticipant(node) {
    return node instanceof Element && (node.matches(HOST_SELECTOR) || !!node.querySelector(HOST_SELECTOR));
  }

  // Meet mutates the DOM constantly (captions, chat, tooltips). Rescan only when a
  // mutation can affect participants: new participant elements, changes inside a
  // participant (late-rendered content, self-view controls, our button removed),
  // or the id attribute itself. Our own insertions are skipped.
  function isRelevant(m) {
    if (m.type === 'attributes') return true;
    // Our node removed by Meet (re-render) — must be re-added.
    if ([...m.removedNodes].some(isOwnNode)) return true;
    if (m.removedNodes.length === 0 && [...m.addedNodes].every(isOwnNode)) return false;
    if (m.target instanceof Element && m.target.closest(HOST_SELECTOR)) return true;
    return [...m.addedNodes].some(hasParticipant);
  }

  const observer = new MutationObserver((mutations) => {
    if (!scheduled && mutations.some(isRelevant)) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [ATTR],
  });
  scan();
})();
