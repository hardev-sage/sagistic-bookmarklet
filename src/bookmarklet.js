(() => {
  'use strict';
  const ID = '__sagistic__';
  if (window[ID]) { window[ID].toggle(); return; }

  const create = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const key in props) {
      if (key in el) el[key] = props[key];
      else el.setAttribute(key, props[key]);
    }
    el.append(...children);
    return el;
  };

  // localStorage can throw (blocked storage, sandboxed frames), so keep a copy in memory to fall back on
  const memoryStore = {};
  const STATE_KEY = 'sagistic.state.v1';
  const UI_KEY = 'sagistic.ui.v1';

  const load = (key, fallback) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : (memoryStore[key] ?? fallback);
    } catch {
      return memoryStore[key] ?? fallback;
    }
  };
  const save = (key, value) => {
    memoryStore[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pageKey = () => location.origin + location.pathname + location.search;

  let state = Object.assign({ tasks: [], xp: 0 }, load(STATE_KEY, {}));
  const ui = Object.assign({ x: null, y: null, open: false, theme: 'auto', radar: false }, load(UI_KEY, {}));

  const PRIORITY_COLORS = ['#8a8aa8', '#19e3ff', '#ffb703', '#ff3d6e'];
  const RANKS = ['Wanderer', 'Scout', 'Rogue', 'Knight', 'Warlord', 'Archmage', 'Legend'];
  const level = xp => 1 + Math.floor(xp / 100);
  const rank = xp => RANKS[Math.min(level(xp) - 1, RANKS.length - 1)];
  const visibleTasks = () => state.tasks.filter(task => !task.page || task.page === pageKey());
  const siteHue = [...location.hostname].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

  const THEMES = {
    neon:  { bg: '#0b0b14', fg: '#e8e8ff', mut: '#8a8aa8', acc: '#19e3ff', line: '#2a2a44' },
    ink:   { bg: '#14110f', fg: '#f1e9dc', mut: '#9a8f80', acc: '#ff9f43', line: '#322b25' },
    paper: { bg: '#fbf8f1', fg: '#23211d', mut: '#7b756a', acc: '#d6336c', line: '#e6dfd0' },
  };
  const THEME_MODES = ['auto', 'neon', 'ink', 'paper'];

  // Expects an rgb()/rgba() string. Pages that use oklch(), lab() or color() backgrounds will be misjudged.
  const luminance = color => {
    const nums = color.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    const [r, g, b, alpha = 1] = nums.map(Number);
    return alpha < 0.05 ? null : (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const pageIsDark = () => {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const lum = luminance(getComputedStyle(el).backgroundColor);
      if (lum !== null) return lum < 0.5;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const palette = () => {
    if (ui.theme !== 'auto') return THEMES[ui.theme];
    return pageIsDark()
      ? { bg: `hsl(${siteHue} 30% 9%)`, fg: '#f2f2fa', mut: `hsl(${siteHue} 12% 62%)`, acc: `hsl(${siteHue} 95% 62%)`, line: `hsl(${siteHue} 25% 20%)` }
      : { bg: `hsl(${siteHue} 40% 97%)`, fg: '#1d1d26', mut: `hsl(${siteHue} 10% 42%)`, acc: `hsl(${siteHue} 80% 45%)`, line: `hsl(${siteHue} 25% 86%)` };
  };

  // Constructable stylesheets aren't blocked by a strict CSP the way an injected <style> tag can be.
  // The <style> fallback is for older browsers.
  // Returns a function that removes the sheet again.
  const addSheet = (target, css) => {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
      return () => { target.adoptedStyleSheets = target.adoptedStyleSheets.filter(other => other !== sheet); };
    } catch {
      const style = create('style', { textContent: css });
      (target === document ? document.head || document.documentElement : target).append(style);
      return () => style.remove();
    }
  };

  const WIDGET_CSS = `
[hidden]{display:none!important}
*{box-sizing:border-box}
button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.widget{position:relative;width:52px;height:52px;color:var(--fg);font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.orb{all:unset;position:absolute;inset:0;border-radius:50%;cursor:grab;touch-action:none;display:grid;place-items:center;background:var(--bg);color:var(--acc);font:700 17px system-ui,sans-serif;border:2px solid var(--acc);box-shadow:0 4px 16px rgba(0,0,0,.4);filter:drop-shadow(0 0 7px var(--acc));transition:transform .15s}
.orb:hover{transform:scale(1.08)}
.orb.on::after{content:'';position:absolute;inset:-7px;border-radius:50%;border:2px dashed var(--acc);animation:spin 6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.panel{position:absolute;width:316px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;animation:pop .16s ease-out}
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.97)}}
.widget.right .panel{right:0}.widget.left .panel{left:0}.widget.up .panel{bottom:62px}.widget.down .panel{top:62px}
.header{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;cursor:grab;touch-action:none;user-select:none}
.header b{letter-spacing:.2em;font-size:12px;color:var(--acc)}
.level{margin-left:auto;font-size:11px;color:var(--mut)}
.xp-track{height:4px;margin:0 12px 8px;background:var(--line);border-radius:4px;overflow:hidden}
.xp-fill{height:100%;background:var(--acc);transition:width .4s}
.toast{padding:5px 12px;font-size:12px;font-weight:600;color:var(--bg);background:var(--acc);text-align:center}
.quest-list{list-style:none;margin:0;padding:0 6px;overflow:auto;flex:1;min-height:0}
.row{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px}
.row:hover{background:var(--line)}
.quest-text{flex:1;word-break:break-word;cursor:pointer}
.done .quest-text{text-decoration:line-through;color:var(--mut)}
.priority-dot{all:unset;display:inline-block;width:12px;height:12px;border-radius:50%;cursor:pointer;flex:none;border:2px solid}
.icon-btn{all:unset;cursor:pointer;color:var(--mut);padding:0 3px}
.icon-btn:hover{color:var(--fg)}
.empty{padding:14px;text-align:center;color:var(--mut)}
.add{display:flex;padding:8px 12px}
.add input{all:unset;flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;color:var(--fg)}
.add input:focus{border-color:var(--acc)}
.add input::placeholder{color:var(--mut)}
.legend{display:flex;flex-wrap:wrap;gap:10px;padding:0 12px 8px;font-size:11px;color:var(--mut)}
.legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.footer{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}
.footer button{all:unset;display:inline-block;cursor:pointer;font-size:11px;padding:4px 9px;border:1px solid var(--line);border-radius:999px;color:var(--mut)}
.footer button:hover,.footer button.on{color:var(--bg);background:var(--acc);border-color:var(--acc)}
.particle{position:absolute;width:6px;height:6px;border-radius:50%;pointer-events:none}
`;

  const RADAR_CSS = `
a[data-sg]{outline:2px solid var(--sgc,#19e3ff)!important;outline-offset:2px;border-radius:3px;box-shadow:0 0 10px var(--sgc,#19e3ff)!important}
a[data-sg=ext]{--sgc:#ff3d81}a[data-sg=int]{--sgc:#19e3ff}a[data-sg=mail]{--sgc:#ffd60a}
a[data-sg=file]{--sgc:#3dff8b}a[data-sg=hash]{--sgc:#b388ff}
a[data-sg][target=_blank]{outline-style:dashed!important}
`;

  const host = create('div', { id: 'sagistic-host' });
  host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  addSheet(shadow, WIDGET_CSS);

  let toastTimer;
  const toastEl = create('div', { className: 'toast', hidden: true });
  const toast = (message, duration = 1500) => {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, duration);
  };
  const btn = (text, title, onClick, className = '') => create('button', { textContent: text, title, className, onclick: onClick });

  const orbLabel = create('span');
  const orb = create('button', { className: 'orb', title: 'Sagistic - drag me, click to open' }, orbLabel);
  const levelLabel = create('span', { className: 'level' });
  const xpFill = create('div', { className: 'xp-fill' });
  const questList = create('ul', { className: 'quest-list' });
  const legend = create('div', { className: 'legend', hidden: true });
  const questInput = create('input', { placeholder: 'New quest...  !3 priority  @page pin', maxLength: 200, spellcheck: false, autocomplete: 'off' });

  const radarBtn = btn('Radar', 'Highlight every link (Alt+Shift+L)', () => setRadar(!ui.radar));
  const themeBtn = btn('', 'Cycle theme', () => {
    ui.theme = THEME_MODES[(THEME_MODES.indexOf(ui.theme) + 1) % THEME_MODES.length];
    save(UI_KEY, ui);
    applyTheme();
  });
  const carryBtn = btn('Carry', 'Copy quests to clipboard', () => carry());
  const dropBtn = btn('Drop', 'Paste carried quests here', () => drop());
  const cleanBtn = btn('Clean', 'Remove finished quests', () => clean());
  const ejectBtn = btn('Eject', 'Remove Sagistic from this page', () => eject());

  const header = create('div', { className: 'header' },
    create('b', { textContent: 'SAGISTIC' }), levelLabel, btn('\u2013', 'Hide (Esc)', () => setOpen(false), 'icon-btn'));
  const panel = create('div', { className: 'panel', hidden: true },
    header, create('div', { className: 'xp-track' }, xpFill), toastEl, questList,
    create('div', { className: 'add' }, questInput), legend,
    create('div', { className: 'footer' }, radarBtn, themeBtn, carryBtn, dropBtn, cleanBtn, ejectBtn));
  const widget = create('div', { className: 'widget' }, panel, orb);
  shadow.append(widget);

  const saveAndRender = () => { save(STATE_KEY, state); render(); };

  const burst = rowEl => {
    const panelRect = panel.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const startX = rowRect.left - panelRect.left + 20;
    const startY = rowRect.top - panelRect.top + rowRect.height / 2;
    for (let i = 0; i < 12; i++) {
      const particle = create('span', { className: 'particle' });
      particle.style.left = startX + 'px';
      particle.style.top = startY + 'px';
      particle.style.background = PRIORITY_COLORS[i % PRIORITY_COLORS.length];
      panel.append(particle);
      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 55;
      particle.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) scale(0)`, opacity: 0 },
      ], { duration: 650, easing: 'ease-out' }).onfinish = () => particle.remove();
    }
  };

  const toggleTask = (task, rowEl) => {
    const levelBefore = level(state.xp);
    task.done = !task.done;
    if (task.done) {
      // XP is kept on the task so un-completing takes back exactly what was granted,
      // even if the priority was changed in between
      task.xp = 10 * (1 + task.pri);
      state.xp += task.xp;
      burst(rowEl);
    } else {
      state.xp = Math.max(0, state.xp - (task.xp || 0));
      task.xp = 0;
    }
    saveAndRender();
    if (level(state.xp) > levelBefore) toast(`LEVEL UP  Lv ${level(state.xp)} ${rank(state.xp)}`, 2600);
    else if (task.done) toast(`+${task.xp} XP`);
  };

  const createRow = task => {
    const rowEl = create('li', { className: 'row' + (task.done ? ' done' : '') });
    const dot = create('button', {
      className: 'priority-dot',
      title: 'Priority (click to change)',
      onclick: () => { task.pri = (task.pri + 1) % PRIORITY_COLORS.length; saveAndRender(); },
    });
    dot.style.background = PRIORITY_COLORS[task.pri];
    dot.style.borderColor = PRIORITY_COLORS[task.pri];

    const pinBtn = btn(
      task.page ? '\u25C9' : '\u25CB',
      task.page ? 'Pinned to this page (click to unpin)' : 'Pin to this page',
      () => { task.page = task.page ? null : pageKey(); saveAndRender(); },
      'icon-btn');

    rowEl.append(
      dot,
      create('span', { className: 'quest-text', textContent: task.t, title: 'Click to complete', onclick: () => toggleTask(task, rowEl) }),
      pinBtn,
      btn('\u2715', 'Delete', () => { state.tasks = state.tasks.filter(other => other !== task); saveAndRender(); }, 'icon-btn'));
    return rowEl;
  };

  const render = () => {
    const tasks = visibleTasks();
    const pending = tasks.filter(task => !task.done).sort((a, b) => b.pri - a.pri);
    const finished = tasks.filter(task => task.done);
    questList.replaceChildren();
    if (!tasks.length) questList.append(create('li', { className: 'empty', textContent: 'No quests here yet. Add one below.' }));
    for (const task of [...pending, ...finished]) questList.append(createRow(task));
    orbLabel.textContent = tasks.length ? (pending.length || '\u2713') : '+';
    levelLabel.textContent = `Lv ${level(state.xp)} ${rank(state.xp)}`;
    xpFill.style.width = (state.xp % 100) + '%';
  };

  const addTask = raw => {
    let pri = 0, page = null;
    const text = raw
      .replace(/(^|\s)!([1-3])(?=\s|$)/g, (match, space, digit) => { pri = +digit; return space; })
      .replace(/(^|\s)@page(?=\s|$)/gi, (match, space) => { page = pageKey(); return space; })
      .trim();
    if (!text) return;
    state.tasks.push({ id: uid(), t: text.slice(0, 200), done: false, pri, page, ts: Date.now() });
    saveAndRender();
  };

  questInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { addTask(questInput.value); questInput.value = ''; }
    else if (e.key === 'Escape') setOpen(false);
  });
  // Typing in the widget shouldn't trigger the page's own keyboard shortcuts
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, e => e.stopPropagation());

  const clean = () => {
    const shown = new Set(visibleTasks());
    const isFinished = task => task.done && shown.has(task);
    const count = state.tasks.filter(isFinished).length;
    state.tasks = state.tasks.filter(task => !isFinished(task));
    saveAndRender();
    toast(count ? `Cleared ${count}` : 'Nothing to clear');
  };

  // Quests are stored per site (localStorage is per origin), so Carry/Drop moves them between sites via the clipboard
  const carry = async () => {
    const payload = JSON.stringify({
      sagistic: 1,
      xp: state.xp,
      tasks: state.tasks.map(({ t, done, pri }) => ({ t, done, pri })),
    });
    try {
      await navigator.clipboard.writeText(payload);
      toast('Copied. Open another site and press Drop', 2800);
    } catch {
      prompt('Copy your quests:', payload);
    }
  };

  const drop = async () => {
    let raw;
    try { raw = await navigator.clipboard.readText(); }
    catch { raw = prompt('Paste carried quests:') || ''; }

    let data = null;
    try { data = JSON.parse(raw); } catch {}
    if (!data?.sagistic || !Array.isArray(data.tasks)) {
      toast('No carried quests in clipboard', 2200);
      return;
    }

    let count = 0;
    for (const quest of data.tasks) {
      if (typeof quest?.t !== 'string' || !quest.t.trim()) continue;
      if (state.tasks.some(task => task.t === quest.t)) continue;
      state.tasks.push({ id: uid(), t: quest.t.slice(0, 200), done: !!quest.done, pri: quest.pri & 3, page: null, ts: Date.now() });
      count++;
    }
    state.xp = Math.max(state.xp, data.xp | 0);
    saveAndRender();
    toast(`Dropped ${count} quest${count === 1 ? '' : 's'}`);
  };

  const linkCounts = { ext: 0, int: 0, mail: 0, file: 0, hash: 0 };
  const LEGEND_ITEMS = [['ext', '#ff3d81', 'external'], ['int', '#19e3ff', 'internal'], ['mail', '#ffd60a', 'mail/tel'], ['file', '#3dff8b', 'files'], ['hash', '#b388ff', 'anchors']];
  const FILE_RE = /\.(pdf|zip|rar|7z|tar|gz|exe|dmg|apk|iso|docx?|xlsx?|pptx?|csv|mp3|mp4|mkv|png|jpe?g|gif|webp|svg)$/i;

  const linkKind = link => {
    const href = link.getAttribute('href') || '';
    if (/^(mailto|tel|sms):/i.test(href)) return 'mail';
    if (!href || /^javascript:/i.test(href)) return null;
    if (href[0] === '#') return 'hash';
    let url;
    try { url = new URL(href, location.href); } catch { return null; }
    if (link.hasAttribute('download') || FILE_RE.test(url.pathname)) return 'file';
    if (url.host !== location.host) return 'ext';
    const samePage = url.pathname === location.pathname && url.search === location.search;
    return samePage && url.hash ? 'hash' : 'int';
  };

  const scan = () => {
    if (!ui.radar) return;
    for (const key in linkCounts) linkCounts[key] = 0;
    for (const link of document.querySelectorAll('a[href]')) {
      const kind = linkKind(link);
      if (kind) {
        if (link.dataset.sg !== kind) link.dataset.sg = kind;
        linkCounts[kind]++;
      } else if (link.dataset.sg) {
        delete link.dataset.sg;
      }
    }
    renderTools();
  };

  // Debounced because busy pages can fire a lot of mutations in a row
  let scanTimer;
  const linkObserver = new MutationObserver(() => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 200); });
  let removeRadarStyles = null;

  const ripple = () => {
    let index = 0;
    for (const link of document.querySelectorAll('a[data-sg]')) {
      const rect = link.getBoundingClientRect();
      if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue;
      link.animate([{ outlineOffset: '16px', opacity: 0.2 }, { outlineOffset: '2px', opacity: 1 }],
                   { duration: 450, delay: Math.min(index++ * 14, 700), easing: 'ease-out', fill: 'backwards' });
    }
  };
  const radarOn = () => {
    // The links live in the page, not in the shadow root, so their highlight styles go on the document
    removeRadarStyles = removeRadarStyles || addSheet(document, RADAR_CSS);
    linkObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    scan();
    ripple();
  };
  const radarOff = () => {
    linkObserver.disconnect();
    if (removeRadarStyles) removeRadarStyles();
    removeRadarStyles = null;
    document.querySelectorAll('a[data-sg]').forEach(link => delete link.dataset.sg);
  };
  const setRadar = on => {
    ui.radar = on;
    save(UI_KEY, ui);
    if (on) radarOn(); else radarOff();
    renderTools();
    if (on) toast(`Radar online - ${Object.values(linkCounts).reduce((sum, n) => sum + n, 0)} links`);
  };

  const renderTools = () => {
    radarBtn.classList.toggle('on', ui.radar);
    orb.classList.toggle('on', ui.radar);
    themeBtn.textContent = 'Theme: ' + ui.theme;
    legend.hidden = !ui.radar;
    legend.replaceChildren();
    if (ui.radar) {
      for (const [kind, color, name] of LEGEND_ITEMS) {
        const dot = create('span', { className: 'legend-dot' });
        dot.style.background = color;
        legend.append(create('span', {}, dot, `${name} ${linkCounts[kind]}`));
      }
    }
  };

  const applyTheme = () => {
    const colors = palette();
    for (const key in colors) host.style.setProperty('--' + key, colors[key]);
    renderTools();
  };

  // updatePanel is false while dragging, so the panel doesn't flip sides mid-drag
  const place = (updatePanel = true) => {
    ui.x = Math.min(Math.max(8, ui.x), innerWidth - 60);
    ui.y = Math.min(Math.max(8, ui.y), innerHeight - 60);
    host.style.setProperty('left', ui.x + 'px', 'important');
    host.style.setProperty('top', ui.y + 'px', 'important');
    if (!updatePanel) return;
    const opensUp = ui.y > innerHeight / 2;
    widget.classList.toggle('right', ui.x > innerWidth / 2);
    widget.classList.toggle('left', ui.x <= innerWidth / 2);
    widget.classList.toggle('up', opensUp);
    widget.classList.toggle('down', !opensUp);
    const room = opensUp ? ui.y - 18 : innerHeight - ui.y - 70;
    panel.style.maxHeight = Math.max(150, Math.min(540, room)) + 'px';
  };

  const makeDraggable = (el, onTap) => {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button:not(.orb)')) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const originX = ui.x, originY = ui.y;
      let moved = false;
      el.setPointerCapture(e.pointerId);

      const onMove = ev => {
        // Ignore tiny movements so a slightly shaky click still counts as a click
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        moved = true;
        ui.x = originX + ev.clientX - startX;
        ui.y = originY + ev.clientY - startY;
        place(false);
      };
      const onUp = ev => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        if (moved) { place(); save(UI_KEY, ui); }
        else if (onTap && ev.type === 'pointerup') onTap();
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  };
  makeDraggable(orb, () => setOpen(!ui.open));
  makeDraggable(header);

  const setOpen = isOpen => {
    ui.open = isOpen;
    panel.hidden = !isOpen;
    save(UI_KEY, ui);
    place();
    if (isOpen) {
      render();
      setTimeout(() => questInput.focus(), 30);
    }
  };

  // e.code rather than e.key: with Alt held, some layouts (macOS) produce a different character
  const onKeydown = e => {
    if (!e.altKey || !e.shiftKey) return;
    if (e.code === 'KeyS') { e.preventDefault(); setOpen(!ui.open); }
    else if (e.code === 'KeyL') { e.preventDefault(); setRadar(!ui.radar); }
  };
  const onStorage = e => {
    if (e.key !== STATE_KEY) return;
    try {
      state = Object.assign({ tasks: [], xp: 0 }, JSON.parse(e.newValue));
      render();
    } catch {}
  };
  const onResize = () => place();
  addEventListener('keydown', onKeydown, true);
  addEventListener('storage', onStorage);
  addEventListener('resize', onResize);

  // Polling is a simple way to catch route changes in single-page apps without patching history.pushState
  let lastHref = location.href, lastPageKey = pageKey(), lastDark = pageIsDark();
  const pollTimer = setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (pageKey() !== lastPageKey) {
        lastPageKey = pageKey();
        render();
        toast('New page - quests refreshed', 1800);
      }
      if (ui.radar) scan();
    }
    const dark = pageIsDark();
    if (dark !== lastDark) {
      lastDark = dark;
      if (ui.theme === 'auto') {
        applyTheme();
        toast(dark ? 'Dark page detected' : 'Light page detected');
      }
    }
  }, 500);

  const eject = () => {
    clearInterval(pollTimer);
    clearTimeout(scanTimer);
    clearTimeout(toastTimer);
    radarOff();
    removeEventListener('keydown', onKeydown, true);
    removeEventListener('storage', onStorage);
    removeEventListener('resize', onResize);
    host.remove();
    delete window[ID];
  };

  if (ui.x == null) {
    ui.x = innerWidth - 76;
    ui.y = innerHeight - 76;
  }
  // Attached to <html> rather than <body> so pages that rebuild their body don't remove it
  document.documentElement.append(host);
  applyTheme();
  render();
  setOpen(true); // always opens when the script runs; the saved ui.open only matters for toggle()
  if (ui.radar) radarOn();
  window[ID] = { toggle: () => setOpen(!ui.open), eject };
  toast('Sagistic online', 1200);
})();