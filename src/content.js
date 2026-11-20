// Stand Done — adds tick toggles to Google Meet participants (People panel + video tiles).
// State lives in memory only: it is lost on page reload / leaving the call.
(() => {
  'use strict';

  const ATTR = 'data-participant-id';
  const BTN_CLASS = 'stand-done-tick';
  const DONE_CLASS = 'stand-done-checked';
  const HOST_CLASS = 'stand-done-host';
  const SPACER_CLASS = 'stand-done-spacer';
  // Own video tile contains self-view controls (Reframe / Backgrounds and effects).
  // Matched by Meet's numeric jslog ids, which do not depend on UI language.
  const SELF_TILE_MARKER = '[jslog^="188492"], [jslog^="177243"], [jslog^="187882"]';

  /** @type {Set<string>} participant ids marked as done */
  const done = new Set();
  /** Own participant ids (tiles and panel rows share the id). */
  const selfIds = new Set();

  // Panel list items and video tiles both carry data-participant-id in Meet.
  // Only the outermost element per id is decorated (Meet nests the attribute).
  function findHosts(root) {
    const hosts = [];
    root.querySelectorAll(`[${ATTR}]`).forEach((el) => {
      const id = el.getAttribute(ATTR);
      if (!id) return;
      const parent = el.parentElement && el.parentElement.closest(`[${ATTR}]`);
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
  function panelRowHasSelfSuffix(el) {
    const label = cleanName(el.getAttribute('aria-label'));
    if (!label) return false;
    return [...el.querySelectorAll('span')].some((span) => {
      const next = span.nextElementSibling;
      return cleanName(span.textContent) === label && !span.children.length &&
        next && next.tagName === 'SPAN' && /^\(.+\)$/.test(cleanName(next.textContent));
    });
  }

  function learnSelf(el) {
    const self = isPanelItem(el) ? panelRowHasSelfSuffix(el) : !!el.querySelector(SELF_TILE_MARKER);
    if (self) selfIds.add(el.getAttribute(ATTR));
  }

  function isSelf(el) {
    return selfIds.has(el.getAttribute(ATTR));
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
    btn.setAttribute('aria-pressed', String(checked));
    const name = participantName(el) || 'participant';
    btn.title = checked ? `${name} — already spoke (click to undo)` : `Mark ${name} as done`;
    btn.setAttribute('aria-label', btn.title);
  }

  // The green border follows the tile's rounded corners, which Meet sets on an
  // inner element — copy the first non-zero radius onto the host.
  function matchTileRadius(el) {
    if (el.style.getPropertyValue('--stand-done-radius')) return;
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
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function undecorate(el) {
    const btn = buttonOf(el);
    if (btn) btn.remove();
    el.classList.remove(HOST_CLASS, DONE_CLASS);
  }

  // Where the panel checkbox goes: in the row's flex line, left of the avatar.
  function panelSlot(el) {
    const avatar = el.querySelector('img');
    const box = avatar && avatar.parentElement;
    return box && box.parentElement && box !== el
      ? { parent: box.parentElement, before: box }
      : { parent: el, before: el.firstChild };
  }

  function insertPanelNode(el, node) {
    const { parent, before } = panelSlot(el);
    parent.insertBefore(node, before);
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
      done.delete(el.getAttribute(ATTR));
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
    hosts.forEach(learnSelf);
    hosts.forEach(decorate);
  }

  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own buttons.
    const relevant = mutations.some((m) =>
      !(m.target instanceof Element && m.target.classList.contains(BTN_CLASS))
    );
    if (relevant && !scheduled) {
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

  // Exposed for tests only.
  if (typeof window !== 'undefined') window.__standDone = { done, selfIds, scan, findHosts };
})();
