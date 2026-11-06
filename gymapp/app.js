window.addEventListener('error', (e) => { try { const d = document.createElement('div'); d.id = 'gym-err'; d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;background:#400;color:#fff;font:12px/1.4 monospace;padding:10px;border-radius:8px;white-space:pre-wrap'; d.textContent = 'Fehler: ' + (e.message || e) + ' (' + (e.lineno || '?') + ')'; document.body.appendChild(d); } catch (_) {} });
/* Gym App – Prototyp Phase 1
 * Oberfläche, Kamera und Pose-Erkennung. Zähl-Logik: counter.js, Spiel-Logik: store.js.
 */
const GC = window.GymCounter;
const ST = window.GymStore;

// Fotos (im Einzeldatei-Build stehen hier eingebettete Bilder)
const IMG = {
  main: 'img/main.jpg',
  fruehnebel: 'img/fruehnebel.jpg',
  sonnenaufgang: 'img/sonnenaufgang.jpg',
  mittag: 'img/mittag.jpg',
  abendrot: 'img/abendrot.jpg',
  sternennacht: 'img/sternennacht.jpg',
  polarlicht: 'img/polarlicht.jpg'
};
const IMG_D = {
  main: 'img/d_main.jpg',
  fruehnebel: 'img/d_fruehnebel.jpg',
  sonnenaufgang: 'img/d_sonnenaufgang.jpg',
  mittag: 'img/d_mittag.jpg',
  abendrot: 'img/d_abendrot.jpg',
  sternennacht: 'img/d_sternennacht.jpg',
  polarlicht: 'img/d_polarlicht.jpg'
};
const isLightTheme = () => document.documentElement.getAttribute('data-theme') === 'light';
const imgOf = (k) => (isLightTheme() ? IMG : IMG_D)[k];

/* ---------- Titelbild der Startseite: Farbverlauf statt Foto ----------
 * Wird einmal pro Design und Tageszeit auf ein Canvas gezeichnet. Dieselben Pixel liegen im CSS (Data-URL)
 * und im Glas-Hintergrund (glass.js nimmt das Canvas direkt), darum bricht das Glas genau das, was man sieht.
 * Pro Verlauf: Grundfarbe oben und unten, dazu Farbflecken [x, y, Radius (Anteil der Breite), r, g, b, Deckkraft]. */
const HERO_ART = {
  dark: {
    morning: { base: ['#1C2536', '#0E1117'], blobs: [[.15, .85, .95, 255, 170, 90, .55], [.9, .55, .7, 240, 120, 120, .28], [.7, .08, .8, 110, 140, 200, .30]] },
    day: { base: ['#162A38', '#0D141A'], blobs: [[.2, .2, .95, 70, 170, 190, .38], [.85, .7, .85, 90, 120, 210, .32], [.5, .98, .6, 200, 220, 230, .14]] },
    evening: { base: ['#241A33', '#0F0D16'], blobs: [[.2, .9, .95, 255, 140, 70, .55], [.85, .45, .85, 220, 90, 150, .38], [.5, .05, .85, 120, 90, 200, .35]] },
    night: { base: ['#101828', '#07090E'], blobs: [[.3, .15, .95, 70, 90, 200, .40], [.8, .8, .85, 60, 170, 170, .22], [.1, .7, .7, 120, 80, 180, .22]] }
  },
  light: {
    morning: { base: ['#E6EEF9', '#F6EFEA'], blobs: [[.15, .72, .95, 255, 175, 130, .80], [.88, .25, .85, 140, 190, 250, .75], [.8, .9, .65, 205, 170, 240, .55]] },
    day: { base: ['#E2EFF9', '#F1F6F9'], blobs: [[.2, .2, .95, 120, 185, 245, .80], [.85, .65, .85, 150, 220, 205, .65], [.4, .95, .65, 255, 215, 150, .55]] },
    evening: { base: ['#F4E8EE', '#F3F1F6'], blobs: [[.2, .72, .95, 250, 150, 150, .78], [.88, .3, .85, 175, 150, 240, .75], [.6, .95, .65, 255, 190, 130, .65]] },
    night: { base: ['#E6EAF5', '#F1F2F7'], blobs: [[.25, .22, .95, 130, 150, 240, .78], [.85, .7, .85, 195, 160, 240, .65], [.5, .95, .65, 160, 210, 240, .60]] }
  }
};
const heroCache = {};
function heroSlot(t) { const h = new Date(t).getHours(); return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 22 ? 'evening' : 'night'; }
function heroArt(theme) {
  const th = theme || (isLightTheme() ? 'light' : 'dark');
  const slot = heroSlot(Date.now());
  const key = th + '-' + slot;
  if (heroCache[key]) return heroCache[key];
  const W = 512, H = 800;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const p = HERO_ART[th][slot];
  const lin = x.createLinearGradient(0, 0, 0, H);
  lin.addColorStop(0, p.base[0]); lin.addColorStop(1, p.base[1]);
  x.fillStyle = lin; x.fillRect(0, 0, W, H);
  p.blobs.forEach((b) => {
    const cx = b[0] * W, cy = b[1] * H, r = b[2] * W;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${b[3]},${b[4]},${b[5]},${b[6]})`);
    g.addColorStop(1, `rgba(${b[3]},${b[4]},${b[5]},0)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
  // feines Rauschen gegen Streifen in sanften Verläufen
  try {
    const im = x.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(im, 0, 0);
  } catch (e) { /* ohne Rauschen weiter */ }
  heroCache[key] = { canvas: cv, url: cv.toDataURL('image/jpeg', 0.95) };
  return heroCache[key];
}
const PHOTO_POS = { fruehnebel: '50% 58%', sonnenaufgang: '50% 46%', mittag: '50% 50%', abendrot: '50% 50%', sternennacht: '50% 45%', polarlicht: '50% 45%' };

// MediaPipe wird beim Start der Kamera nachgeladen (braucht Internet).
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
// Genaueres Modell "full" (ca. 9 MB, wird einmal geladen). Fällt bei Problemen auf "lite" zurück.
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
const MODEL_URL_LITE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

const $ = (id) => document.getElementById(id);
const screens = {};
['home', 'inv', 'shop', 'settings', 'done', 'train', 'onb', 'lock', 'pro', 'how'].forEach((n) => { screens[n] = $('screen-' + n); });
const els = {
  stage: $('stage'), video: $('video'), overlay: $('overlay'), flash: $('flash'),
  count: $('count'), countLabel: $('count-label'), chip: $('chip'),
  hintTitle: $('hint-title'), hintSub: $('hint-sub'), pillText: $('pill-text'), dot: $('state-dot'),
  gauge: $('gauge'), gaugeLabel: $('gauge-label'), gaugeFill: $('gauge-fill'),
  debug: $('debug'), ovLoading: $('ov-loading'), loadingText: $('loading-text'),
  zoombar: $('zoombar'), hudBottom: $('hud-bottom'),
  ovCountdown: $('ov-countdown'), cdNum: $('cd-num'), ovSetup: $('ov-setup'),
  ovError: $('ov-error'), errTitle: $('err-title'), errText: $('err-text'),
  nav: $('nav'), modal: $('modal'), toast: $('toast')
};

/* ---------- Spielstand ---------- */
const STORE_KEY = 'gymapp-v1';
let S = ST.defaultState();
let storageOk = true;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    S = ST.normalize(raw ? JSON.parse(raw) : null);
  } catch (e) { S = ST.defaultState(); storageOk = false; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; }
  catch (e) { storageOk = false; }
}

/* ---------- Laufzeit ---------- */
const run = {
  current: 'home',
  mode: 'idle', // idle | loading | countdown | running
  stream: null,
  landmarker: null,
  counter: null,
  side: 'L',
  lastVideoTime: -1,
  wakeLock: null,
  token: 0,
  fpsFrames: 0,
  fpsStart: 0,
  fps: 0,
  summary: null
};

/* ---------- Hilfen ---------- */
const now = () => Date.now();
function minLabel(m) { return m >= 120 && m % 60 === 0 ? (m / 60) + ' Std' : m + ' Min'; }
function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','); }
function fmtP(n) { return ST.fmtPoints(n); }
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

const ICON = {
  pushup: '<svg viewBox="0 0 64 48" width="34" height="28" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="18" r="5" fill="currentColor" stroke="none"/><path d="M22 24L58 36M22 24V44"/></svg>',
  squat: '<svg viewBox="0 0 48 64" width="34" height="28" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="8" r="5" fill="currentColor" stroke="none"/><path d="M24 17L20 34L35 38L30 58M24 21L41 25"/></svg>',
  situp: '<svg viewBox="0 0 64 48" width="34" height="28" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="20" cy="9" r="5" fill="currentColor" stroke="none"/><path d="M30 40L22 18M30 40L45 24L54 40M23 22L41 26M10 44H58"/></svg>',
  plank: '<svg viewBox="0 0 64 40" width="34" height="28" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="22" r="5" fill="currentColor" stroke="none"/><path d="M14 26L58 34M19 29V38M10 38H26"/></svg>'
};
const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const APP_NAME = 'Verdient';
let logoN = 0;
function logo(size) {
  const id = 'lg' + (++logoN);
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C9CED6"/><stop offset="1" stop-color="#F6D77A"/></linearGradient></defs><circle cx="32" cy="32" r="24" stroke="url(#${id})" stroke-width="6" stroke-linecap="round" stroke-dasharray="118 33" transform="rotate(-60 32 32)"/><path d="M21 33l8.5 8.5L45 24" style="stroke:var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const ICON_FLAME = '<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 1C10 6 16 9 16 14.5A7 7 0 0 1 2 14.5C2 11.5 3.5 9.7 5 8.2 5.2 10.2 6 11.2 7.2 11.6 7 7.2 7.5 4 9 1Z" fill="#F5A445"/></svg>';
const RINGS = '<svg class="rings" viewBox="0 0 390 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true">' +
  [70, 120, 170, 220, 270].map((r, i) => `<ellipse cx="${'CX'}" cy="130" rx="${r}" ry="${Math.round(r * 0.72)}" fill="none" stroke="#fff" stroke-opacity=".045" stroke-width="1.3"/>`).join('') + '</svg>';
function rings(cx) { return RINGS.split('CX').join(String(cx)); }

function segmentsHTML(info) {
  let h = '<div class="segs">';
  for (let i = 0; i < info.total; i++) {
    let w = 0;
    if (info.next === null) w = 100;
    else if (i < info.number) w = 100;
    else if (i === info.number) w = Math.round(info.progress * 100);
    h += `<div class="seg-b"><i data-w="${w}"></i></div>`;
  }
  return h + '</div>';
}

/* ---------- Navigation ---------- */
const NAV_SCREENS = ['home', 'inv', 'shop'];

function showScreen(name) {
  run.current = name;
  screens[name].classList.remove('noanim');
  if (name === 'shop') shopSel = null;
  for (const k in screens) screens[k].classList.toggle('active', k === name);
  els.nav.classList.toggle('show', NAV_SCREENS.includes(name));
  els.nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
  if (typeof placePill === 'function') requestAnimationFrame(placePill);
  ST.pruneMinutes(S, now());
  { const k = ST.applyShield(S, now()); if (k) { saveState(); toast('Streak-Schutztag hat gestern gerettet'); } }
  if (name === 'home') renderHome();
  else if (name === 'inv') renderInv();
  else if (name === 'shop') renderShop();
  else if (name === 'settings') renderSettings();
  else if (name === 'onb') renderOnb();
  else if (name === 'lock') renderLock();
  else if (name === 'pro') renderPro();
  else if (name === 'how') renderHow();
  const sc = screens[name].querySelector('.scroll, .done-wrap');
  if (sc) sc.scrollTop = 0;
}
// Nav: gleitende Glas-Pille, die man auch ziehen kann
const navPill = document.createElement('i');
navPill.className = 'nav-pill';
els.nav.prepend(navPill);
const navBtns = Array.from(els.nav.querySelectorAll('button'));
let navDrag = null, navDragged = false;
function placePill() {
  const on = navBtns.find((x) => x.classList.contains('on')) || navBtns[0];
  if (!on || !on.offsetWidth) return;
  navPill.style.width = on.offsetWidth + 'px';
  navPill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
}
window.addEventListener('resize', placePill);
function nearestBtn(x) {
  let best = navBtns[0], bd = 1e9;
  navBtns.forEach((b) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - x); if (d < bd) { bd = d; best = b; } });
  return best;
}
els.nav.addEventListener('pointerdown', (e) => {
  const r = els.nav.getBoundingClientRect();
  navDrag = { x0: e.clientX, left0: (navBtns.find((x) => x.classList.contains('on')) || navBtns[0]).offsetLeft, moved: false, near: null, id: e.pointerId, r, lastX: e.clientX, lastT: performance.now(), v: 0 };
  els.nav.classList.add('press');
  navPill.classList.add('press');
  navPill.style.transform = 'translateX(' + navDrag.left0 + 'px) scale(1.14,1.12)';
});
els.nav.addEventListener('pointermove', (e) => {
  if (!navDrag) return;
  const dx = e.clientX - navDrag.x0;
  if (!navDrag.moved && Math.abs(dx) < 8) return;
  if (!navDrag.moved) { navDrag.moved = true; try { els.nav.setPointerCapture(navDrag.id); } catch (er) { /* ignorieren */ } navPill.classList.add('drag'); }
  const lo = navBtns[0].offsetLeft, hi = navBtns[navBtns.length - 1].offsetLeft;
  const rawX = navDrag.left0 + dx;
  // am Rand gibt die Leiste elastisch nach (Gummiband)
  const over = rawX < lo ? rawX - lo : rawX > hi ? rawX - hi : 0;
  const x = Math.max(lo, Math.min(hi, rawX)) + over * 0.25;
  const nowT = performance.now();
  const vx = (e.clientX - navDrag.lastX) / Math.max(8, nowT - navDrag.lastT);
  navDrag.v = navDrag.v * 0.6 + vx * 0.4; navDrag.lastX = e.clientX; navDrag.lastT = nowT;
  const st = Math.min(0.34, Math.abs(navDrag.v) * 0.22 + Math.abs(over) * 0.004);
  navPill.style.transform = 'translateX(' + x + 'px) scale(' + (1.1 + st).toFixed(3) + ',' + (1.1 - st * 0.55).toFixed(3) + ')';
  els.nav.style.transform = 'scale(' + (1.02 + st * 0.12).toFixed(3) + ',' + (1.0 - st * 0.05).toFixed(3) + ')';
  const nb = nearestBtn(x + navPill.offsetWidth / 2);
  if (nb !== navDrag.near) { navDrag.near = nb; navBtns.forEach((b) => b.classList.toggle('near', b === nb)); haptic('tick'); }
});
function navEnd() {
  if (!navDrag) return;
  const d = navDrag; navDrag = null;
  navPill.classList.remove('drag');
  navPill.classList.remove('press');
  els.nav.classList.remove('press');
  els.nav.style.transform = '';
  navBtns.forEach((b) => b.classList.remove('near'));
  placePill();
  if (d.moved) {
    navDragged = true; setTimeout(() => { navDragged = false; }, 60);
    const target = d.near || navBtns.find((x) => x.classList.contains('on'));
    if (target.dataset.go !== (navBtns.find((x) => x.classList.contains('on')) || {}).dataset?.go) showScreen(target.dataset.go);
    placePill();
  }
}
els.nav.addEventListener('pointerup', navEnd);
els.nav.addEventListener('pointercancel', navEnd);
navBtns.forEach((b) => b.addEventListener('click', () => { if (navDragged) return; showScreen(b.dataset.go); }));

/* ---------- Bewegung: Einblenden, Hochzählen, Parallax ---------- */
const REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANIM_SEL = '[data-w],[data-h],[data-dash],[data-count]';

function cnt(n, text) {
  const s = text !== undefined ? text : (Number.isInteger(n) ? String(n) : fmtP(n));
  return `<span data-count="${n}" data-final="${s}">${s}</span>`;
}

function countUp(el, animate) {
  const target = parseFloat(el.dataset.count);
  const final = el.dataset.final || el.textContent;
  if (!animate || REDUCE || !isFinite(target) || target <= 0) { el.textContent = final; return; }
  const intT = Number.isInteger(target);
  const t0 = performance.now();
  const step = (ts) => {
    const k = Math.min(1, (ts - t0) / 900);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = k >= 1 ? final : (intT ? String(Math.round(target * e)) : fmtP(Math.round(target * e * 10) / 10));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

function activate(el, animate) {
  el.classList.add('in');
  const nodes = [el].concat(Array.from(el.querySelectorAll(ANIM_SEL)));
  nodes.forEach((n) => {
    if (n.dataset.w !== undefined) n.style.width = n.dataset.w + '%';
    if (n.dataset.h !== undefined) n.style.height = n.dataset.h + 'px';
    if (n.dataset.dash !== undefined) n.style.strokeDasharray = n.dataset.dash;
    if (n.dataset.count !== undefined) countUp(n, animate);
  });
}

function setupMotion(root) {
  const items = Array.from(root.querySelectorAll('.rv'));
  const sc = root.querySelector('.scroll, .done-wrap');
  const instant = REDUCE || root.classList.contains('noanim') || !('IntersectionObserver' in window) || !sc;
  if (instant) { items.forEach((el) => activate(el, false)); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { activate(en.target, true); io.unobserve(en.target); } });
  }, { root: sc, threshold: 0.1, rootMargin: '0px 0px -3% 0px' });
  items.forEach((el) => io.observe(el));
}

const SDA = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()') && CSS.supports('timeline-scope: --a'));

function bindScroll(root) {
  const sc = root.querySelector('.scroll');
  if (!sc) return;
  const plx = root.querySelector('.hero .plx');
  const hero = root.querySelector('.hero');
  const mist = root.querySelector('.hero .mist');
  const greet = root.querySelector('.greet');
  const slogan = root.querySelector('.slogan');
  const head = root.querySelector('.head.sticky');
  if (head && !head.classList.contains('pinned')) {
    const sp = document.createElement('div');
    sp.style.height = head.offsetHeight + 'px';
    head.parentNode.insertBefore(sp, head);
    head.classList.add('pinned');
    root.appendChild(head);
  }
  let queued = false;
  let stuck = false;
  const update = () => {
    queued = false;
    const y = sc.scrollTop;
    if (head && (y > 40) !== stuck) { stuck = y > 40; head.classList.toggle('stuck', stuck); }
    if (plx && !REDUCE && !SDA) {
      plx.style.transform = `translate3d(0,${(-Math.min(y, 2500) * 0.104).toFixed(1)}px,0) scale(${(1.32 - Math.min(y, 2500) * 0.000128).toFixed(3)})`;
      if (mist) mist.style.transform = `translate3d(0,${(-Math.min(y, 2000) * 0.2).toFixed(1)}px,0)`;
      if (hero) hero.style.opacity = String(Math.max(0, 1 - y / 2000).toFixed(3));
      const f = Math.max(0, 1 - y / 150).toFixed(3);
      [greet, slogan].forEach((n) => { if (n) { n.style.opacity = f; n.style.transform = `translateY(${(y * 0.3).toFixed(1)}px)`; } });
    }
  };
  sc.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// Glas (glass.js) auf eine frisch gezeichnete Seite legen; ohne WebGL bleibt der CSS-Look
function glassOn(root) { if (window.Glass) window.Glass.mount(root); }

function rerenderKeep(name, fn) {
  const scr = screens[name];
  const old = scr.querySelector('.scroll');
  const y = old ? old.scrollTop : 0;
  scr.classList.add('noanim');
  fn();
  const nu = scr.querySelector('.scroll');
  if (nu) { nu.scrollTop = y; nu.dispatchEvent(new Event('scroll')); }
}

const ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#121316" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const ICON_LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TIPS = [
  { ex: 'pushup', t: 'Aufbau', p: 'Lehne das Handy stabil an und stell dich etwa 2 bis 3 Meter weg. Der ganze Körper muss im Bild sein.' },
  { ex: 'pushup', t: 'Liegestütze', p: 'Geh tief, bis die Ellbogen etwa 90° haben, und streck dich oben ganz durch. Halbe Wiederholungen zählen nicht.' },
  { ex: 'squat', t: 'Kniebeugen', p: 'Stell dich seitlich zur Kamera. Senk die Hüfte tief ab und richte dich oben ganz auf.' },
  { ex: 'situp', t: 'Situps', p: 'Lieg seitlich zur Kamera, Knie angewinkelt. Oberkörper ganz hoch und kontrolliert wieder runter.' },
  { ex: 'plank', t: 'Plank', p: 'Seitlich zur Kamera, Körper gerade wie ein Brett. 20 Sekunden halten zählen als 1 Wiederholung.' },
  { ex: 'pushup', t: 'Licht', p: 'Helles, gleichmäßiges Licht von vorne hilft. Gegenlicht und sehr dunkle Räume stören die Erkennung.' }
];
const QUOTES = ['Jede Wiederholung ist Handyzeit.', 'Klein anfangen zählt auch.', 'Heute schon verdient?', 'Wer sich bewegt, scrollt mit gutem Gewissen.'];

function ago(at, t) {
  const d = Math.round((ST.startOfDay(t) - ST.startOfDay(at)) / 86400000);
  if (d <= 0) { const x = new Date(at); return 'Heute, ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); }
  if (d === 1) return 'Gestern';
  return 'vor ' + d + ' Tagen';
}
function sessionsHTML(n, t, days) {
  let list = ST.recentSessions(S, days ? 60 : n);
  if (days) list = list.filter((x) => x.at >= t - days * 86400000).slice(0, n);
  if (!list.length) return '<p class="empty">Noch nichts trainiert. Deine Einheiten erscheinen hier.</p>';
  return '<div class="list">' + list.map((s) =>
    `<div class="row"><div class="ic">${ICON[s.ex]}</div><div class="m"><b>${s.reps} × ${ST.EX_LABEL[s.ex]}</b><span>${ago(s.at, t)}</span></div><span class="pts">+${fmt(s.earned)}</span></div>`).join('') + '</div>';
}
function pkgBig(p) { return p.type === 'pass' ? 'Ganzer Tag' : minLabel(p.minutes); }

/* ---------- Training (Startseite) ---------- */
function freeText() {
  if (ST.passActive(S, now())) return { v: 'Pass', u: '' };
  return { v: String(ST.minutesFree(S, now())), u: ' Min' };
}

function renderHome() {
  const t = now();
  const key = ST.dayKey(t);
  if (!ST.isUnlocked(S, S.settings.ex)) { S.settings.ex = 'pushup'; saveState(); }
  const day = ST.dayOf(S, key);
  const ex = S.settings.ex;
  const exToday = day.byEx[ex] || 0;
  const streak = ST.streakOf(S, t);
  const free = freeText();
  const sub = exToday > 0 ? `Heute schon ${exToday} geschafft.` : `Tagesziel: ${S.goal} Wdh. Los geht’s.`;
  const nf = (n) => String(n).replace('.', ',');
  const ppr = ex === 'plank'
    ? '<b>20 Sekunden = 1 Punkt</b><span>Länger halten bringt mehr Punkte pro Block.</span>'
    : '<b>1 Wiederholung = ' + nf(ST.POINTS_PER_REP[ex]) + (ST.POINTS_PER_REP[ex] === 1 ? ' Punkt' : ' Punkte') + '</b><span>' + (ST.trainingMinutes ? 'Tagesziel dauert ca. ' + ST.trainingMinutes(ex, S.goal) + ' Minuten.' : '') + '</span>';
  const tiles = ST.EXERCISES.map((e) => {
    const lk = !ST.isUnlocked(S, e);
    return `<button class="tile glass${e === ex ? ' on' : ''}${lk ? ' locked' : ''}" type="button" data-ex="${e}" aria-pressed="${e === ex}"${lk ? ' aria-label="' + ST.EX_LABEL[e] + ', gesperrt, Pro"' : ''}><span class="ti">${ICON[e]}</span><span class="tn">${ST.EX_LABEL[e]}</span>${lk ? '<span class="tl">' + ICON_LOCK + '</span>' : ''}</button>`;
  }).join('');

  // Dein Tag
  const frac = Math.max(0, Math.min(1, day.reps / Math.max(1, S.goal)));
  const strip = ST.lastDays(S, t, 7).map((d) => {
    const wd = WD[new Date(d.key + 'T12:00:00').getDay()];
    return `<div class="d${d.today ? ' today' : ''}"><i class="${d.goalMet ? 'on' : (d.reps > 0 ? 'part' : '')}">${d.goalMet ? ICON_CHECK : ''}</i><span>${wd}</span></div>`;
  }).join('');
  const dayTitle = day.goalMet ? 'Tagesziel geschafft' : `Noch ${Math.max(0, S.goal - day.reps)} bis zum Ziel`;
  const dayText = streak > 0 ? `${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge. Bleib dran.` : 'Schaffe dein Tagesziel und starte eine Serie.';

  // Nächstes Ziel
  const ng = ST.nextShopGoal(S, t);
  let goalCard;
  if (ng) {
    const p = ng.pkg;
    const ph = `<div class="ph" style="background-image:url('${imgOf(p.photo)}');background-position:${PHOTO_POS[p.photo]}"></div>`;
    goalCard = `<button class="card goal-card card-tap glass rv" type="button" data-act="go-shop" aria-label="Zum Shop">${ph}<div class="sh"></div><div class="in">
      <span class="eb">Nächstes Ziel im Shop</span><span class="nm">${p.name} · ${pkgBig(p)}</span>
      <span class="sb">Noch ${ng.missing} Punkte, ungefähr ${ng.pushups} Liegestütze oder ${ng.squats} Kniebeugen</span>
      <div class="pbar"><i data-w="${Math.round(ng.progress * 100)}"></i></div></div></button>`;
  } else {
    goalCard = '<div class="card glass rv"><p class="empty">Du kannst dir gerade alles im Shop leisten. Löse ein Paket ein.</p></div>';
  }

  // Rang
  const info = ST.rankInfo(ST.rankScore(S));
  const rankCard = `<div class="card glass rank-card rv"><div class="r1"><b>Rang ${info.name}</b><span>${info.next ? `Noch ${info.toNext} bis ${info.next}` : 'Höchster Rang'}</span></div>
    <div class="pbar" style="margin-top:12px"><i data-w="${Math.round(info.progress * 100)}"></i></div>
    <p class="sb">${info.tagline} · Rang ${info.number} von ${info.total}</p></div>`;

  const tips = TIPS.map((x) => `<div class="tip glass"><span class="ti">${ICON[x.ex]}</span><b>${x.t}</b><p>${x.p}</p></div>`).join('');
  const quote = QUOTES[new Date(t).getDate() % QUOTES.length];

  screens.home.innerHTML = `
    <div class="bgfx bg-home"></div>
    <div class="hero" role="img" aria-label="Dämmerung an einem Bergsee, gerahmt von dunklen Tannen">
      <div class="plx"><div class="kb" style="background-image:url('${imgOf('main')}')"></div><div class="mist"></div></div><div class="top-fade"></div><div class="bot-fade"></div>
    </div>
    <div class="scroll">
      <div class="head sticky">
        <h1 class="brandh">${logo(30)}<span>${APP_NAME}</span></h1>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="flame">${ICON_FLAME}${streak}</span>
          <button class="round-btn glass" type="button" data-act="settings" aria-label="Einstellungen">${ICON_GEAR}</button>
        </div>
      </div>
      <p class="greet">${ST.greeting(t)}${S.settings.name ? ', ' + S.settings.name.replace(/[<>&"]/g, '') : ''}</p>
      <p class="slogan">Erst bewegen. Dann scrollen.</p>
      <div class="stats rv">
        <div><div class="k">Punkte</div><div class="v">${cnt(S.points)}${day.reps > 0 ? '<span class="up">▲</span>' : ''}</div></div>
        <div><div class="k">Heute</div><div class="v">${cnt(day.reps)}<small> Wdh.</small></div></div>
        <div><div class="k">Frei</div><div class="v">${free.v}<small>${free.u}</small></div></div>
      </div>
      <div class="divider"></div>
      <div class="gcard rv" style="margin-top:-1px"><div class="gcard-in">
        <div class="t"><b>Zeit für ${ST.EX_LABEL[ex]}?</b><span>${sub}</span></div>
        <div class="ic">${ICON[ex]}</div>
        <div class="ppr">${ppr}</div>
        <button class="start-btn" type="button" data-act="start"><svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true"><path d="M1.5 1L12 7L1.5 13Z" fill="#ECEEF1"/></svg>Training starten</button>
      </div></div>
      <div class="label-small rv">Übung wählen</div>
      <div class="tiles rv">${tiles}</div>
      <button class="btn-text rv" type="button" data-act="start-practice" style="margin:14px auto 0;display:block;font-size:14.5px;color:var(--muted)">Kamera-Training · Üben ohne Punkte</button>

      <div class="sec-title rv"><b>Dein Tag</b><span>${day.reps} / ${S.goal} Wdh.</span></div>
      <div class="card glass rv">
        <div class="day-card">
          <div class="mini-ring"><svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="40" fill="none" stroke="rgba(var(--w),.12)" stroke-width="8"/><circle cx="46" cy="46" r="40" fill="none" style="stroke:var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 251.3" data-dash="${(frac * 251.3).toFixed(1)} 251.3" transform="rotate(-90 46 46)"/></svg>
            <div class="mid"><b>${Math.round(frac * 100)}%</b><span>vom Ziel</span></div></div>
          <div class="txt"><b>${dayTitle}</b><span>${dayText}</span></div>
        </div>
        <div class="strip">${strip}</div>
      </div>

      <div class="sec-title rv"><b>Dein Ziel</b></div>
      ${goalCard}
      <div style="height:12px"></div>
      ${rankCard}

      <div class="sec-title rv"><b>Tipps für saubere Wiederholungen</b></div>
      <div class="tips rv">${tips}</div>

      <div class="sec-title rv"><b>Zuletzt</b><span>${S.sessions.length ? 'Deine letzten Einheiten' : ''}</span></div>
      <div class="card glass rv">${sessionsHTML(5, t)}</div>

      <p class="quote rv">${quote}</p>
      ${storageOk ? '' : '<p class="shop-note">Speichern ist in diesem Browser gerade nicht möglich. Dein Stand geht beim Schließen verloren.</p>'}
    </div>`;
  setupMotion(screens.home);
  bindScroll(screens.home);
  glassOn(screens.home);
  screens.home.querySelectorAll('.tile, .start-btn').forEach(springPress);
}

/* ---------- Inventar ---------- */
function statsHTML(t) {
  const st = ST.stats(S, t, 30);
  return `<div class="recs rv">
    <div class="rec glass"><b>${cnt(st.reps)}</b><span>Wdh. in 30 Tagen</span></div>
    <div class="rec glass"><b>${cnt(st.active)}</b><span>Aktive Tage</span></div>
    <div class="rec glass"><b>${cnt(st.avg)}</b><span>Ø Wdh. pro aktivem Tag</span></div>
    <div class="rec glass"><b style="font-size:22px">${st.fav ? ST.EX_LABEL[st.fav] : '–'}</b><span>Lieblingsübung</span></div>
  </div>`;
}

function renderInv() {
  const t = now();
  const info = ST.rankInfo(ST.rankScore(S));
  const streak = ST.streakOf(S, t);
  const week = ST.weekOf(S, t);
  const maxReps = Math.max(1, ...week.days.map((d) => d.reps));
  const bars = week.days.map((d) => {
    const h = d.reps > 0 ? Math.max(14, Math.round((d.reps / maxReps) * 80)) : 0;
    return `<div class="col${d.today ? ' today' : ''}"><span class="val">${d.reps > 0 ? d.reps : ''}</span>${d.reps > 0 ? `<div class="bar" data-h="${h}"></div>` : '<div class="bar zero"></div>'}<span class="day">${d.label}</span></div>`;
  }).join('');
  const totals = ST.EXERCISES.map((e) => `<div class="total glass"><b>${cnt(S.totalReps[e] || 0)}</b><span>${ST.EX_LABEL[e]}</span></div>`).join('');
  const reps = ST.totalRepsAll(S);
  const rankChips = ST.RANKS.map((r, i) => `<span class="rchip${i < info.index ? ' done' : (i === info.index ? ' cur' : '')}">${r.name}</span>`).join('');
  const pro = ST.isPro(S);
  const histDays = pro ? ST.PRO.PRO_HISTORY_DAYS : ST.PRO.FREE_HISTORY_DAYS;
  const lockCard = (title, text) => `<button class="lockcard glass rv" type="button" data-act="open-pro"><span class="pl">Pro</span><b>${title}</b><span>${text}</span></button>`;
  const cal = ST.lastDays(S, t, histDays).map((d) => `<div class="c${d.goalMet ? ' on' : (d.reps > 0 ? ' part' : '')}${d.today ? ' today' : ''}">${d.date}</div>`).join('');
  const ms = ST.milestones(S);
  const msDone = ms.filter((m) => m.done).length;
  const mile = ms.map((m) => `<div class="mile glass${m.done ? ' done' : ''}"><div class="b">${m.done ? ICON_CHECK : ICON_LOCK}</div><div><b>${m.name}</b><span>${m.desc}</span></div></div>`).join('');

  screens.inv.innerHTML = `
    <div class="bgfx bg-inv">${rings(300)}<div class="cloud"></div></div>
    <div class="scroll">
      <div class="head sticky"><h1>Inventar</h1><button class="round-btn glass" type="button" data-act="settings" aria-label="Einstellungen">${ICON_GEAR}</button></div>
      <p class="eyebrow" style="margin-top:14px">Rang ${info.number} von ${info.total}</p>
      <p class="rank-big gradtext${info.name.length > 7 ? ' long' : ''}">${info.name}</p>
      <p class="rank-tag">${info.tagline}</p>
      <div class="rv">${segmentsHTML(info)}</div>
      <div class="segs-sub"><span>${reps} Wiederholungen</span><span>${info.next ? `Noch ${info.toNext} bis ${info.next}` : 'Höchster Rang'}</span></div>
      <div class="rank-row rv" id="rank-row">${rankChips}</div>
      <div class="stats rv" style="margin-top:22px">
        <div><div class="k">Punkte</div><div class="v">${cnt(S.points)}</div></div>
        <div><div class="k">Streak</div><div class="v">${cnt(streak)}<small> ${streak === 1 ? 'Tag' : 'Tage'}</small></div></div>
        <div><div class="k">Woche</div><div class="v">${cnt(week.total)}<small> Wdh.</small></div></div>
      </div>
      <div class="divider"></div>
      <div class="sec-title rv"><b>Diese Woche</b></div>
      <div class="chart glass rv" style="margin-top:0" role="img" aria-label="Wiederholungen in dieser Woche">${bars}</div>
      <div class="totals rv">${totals}</div>

      <div class="sec-title rv"><b>Rekorde</b></div>
      ${pro ? '' : lockCard('Deine Rekorde', 'Bester Tag, längster Streak und mehr. Mit Pro.')}
      <div class="recs rv"${pro ? '' : ' hidden'}>
        <div class="rec glass"><b>${cnt(ST.bestDay(S))}</b><span>Bester Tag (Wdh.)</span></div>
        <div class="rec glass"><b>${cnt(ST.bestStreak(S))}</b><span>Längster Streak (Tage)</span></div>
        <div class="rec glass"><b>${cnt(ST.activeDays(S))}</b><span>Aktive Tage</span></div>
        <div class="rec glass"><b>${cnt(Math.round(S.earnedTotal))}</b><span>Punkte verdient</span></div>
      </div>

      <div class="sec-title rv"><b>Statistik</b></div>
      ${pro ? statsHTML(t) : lockCard('Statistik der letzten 30 Tage', 'Schnitt pro Tag, Lieblingsübung und mehr. Mit Pro.')}

      <div class="sec-title rv"><b>Letzte ${histDays} Tage</b></div>
      <div class="card glass rv"><div class="cal">${cal}</div>
        <div class="cal-legend"><span><i style="background:var(--accent)"></i>Ziel geschafft</span><span><i style="background:rgba(246,215,122,.3)"></i>Trainiert</span></div></div>

      <div class="sec-title rv"><b>Meilensteine</b><span>${msDone} von ${ms.length}</span></div>
      <div class="ms rv">${mile}</div>

      <div class="sec-title rv"><b>Verlauf</b></div>
      <div class="card glass rv">${sessionsHTML(8, t, pro ? 0 : ST.PRO.FREE_HISTORY_DAYS)}</div>${pro ? '' : `<p class="shop-note" style="margin-top:8px">Gratis siehst du die letzten ${ST.PRO.FREE_HISTORY_DAYS} Tage. Pro zeigt alles.</p>`}
    </div>`;
  const row = $('rank-row');
  const cur = row && row.querySelector('.cur');
  if (row && cur) row.scrollLeft = Math.max(0, cur.offsetLeft - row.clientWidth / 2 + cur.offsetWidth / 2);
  setupMotion(screens.inv);
  bindScroll(screens.inv);
  glassOn(screens.inv);
}

/* ---------- Shop ---------- */
let shopSel = null;

function selectPkg(id) {
  shopSel = shopSel === id ? null : id;
  screens.shop.querySelectorAll('.pcard').forEach((c) => c.classList.toggle('sel', c.dataset.id === shopSel));
  screens.shop.classList.toggle('sel-open', !!shopSel);
  updateBuyPanel();
  if (shopSel) {
    const card = screens.shop.querySelector(`.pcard[data-id="${shopSel}"]`);
    const sc = screens.shop.querySelector('.scroll');
    if (card && sc) setTimeout(() => sc.scrollTo({ top: Math.max(0, card.offsetTop - 120), behavior: REDUCE ? 'auto' : 'smooth' }), 60);
  }
}

const HOLD_MS = 2000;
document.addEventListener('selectstart', e => { if (e.target.closest && e.target.closest('.buy-panel, .pcard, #nav, button')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.buy-panel, .pcard')) e.preventDefault(); });
let hapticEl = null;
// Leichtes Vibrieren: Android über die Vibration-Schnittstelle, iPhone (iOS 17.4+) über einen versteckten Schalter.
function haptic(kind) {
  if (!S.settings.sound) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'ok' ? [25, 35, 55] : 8); return; }
  } catch (e) { /* weiter */ }
  try {
    if (!hapticEl) {
      hapticEl = document.createElement('label');
      hapticEl.setAttribute('aria-hidden', 'true');
      hapticEl.style.cssText = 'position:fixed;left:-120px;top:0;opacity:0;pointer-events:none';
      hapticEl.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(hapticEl);
    }
    hapticEl.click();
  } catch (e) { /* ignorieren */ }
}

function updateBuyPanel() {
  const panel = $('buy-panel');
  if (!panel) return;
  const p = shopSel ? ST.findPackage(shopSel) : null;
  if (!p) { panel.classList.remove('show'); panel.innerHTML = ''; return; }
  const ok = ST.canAfford(S, p);
  const miss = Math.ceil(p.price - S.points - 1e-9);
  panel.innerHTML = `
    <div class="bp-top"><div class="bp-name"><b>${p.name}</b><span>${pkgBig(p)}${p.type === 'pass' ? ' · bis Mitternacht' : ' Handyzeit'} · ${p.price} P.</span></div>
      <div class="bp-after"><span>${ok ? 'Danach noch' : 'Es fehlen'}</span><b>${ok ? fmtP(S.points - p.price) : miss} P.</b></div></div>
    <div class="hold-wrap"><div class="hg"></div>
      <button class="hold" id="hold" type="button" aria-label="${pkgBig(p)} einlösen, 2 Sekunden gedrückt halten"><div class="hf"></div><span class="hl" id="hold-label">Zum Einlösen gedrückt halten</span><span class="hl hl2" id="hold-label2" aria-hidden="true">Zum Einlösen gedrückt halten</span></button></div>`;
  panel.classList.add('show');
  bindHold(p.id, ok);
  glassOn(screens.shop);
}

function bindHold(id, ok) {
  const b = $('hold');
  if (!b) return;
  const fill = b.querySelector('.hf');
  const glow = b.parentElement.querySelector('.hg');
  const label1 = $('hold-label');
  const label2 = $('hold-label2');
  const setText = (t) => { label1.textContent = t; label2.textContent = t; };
  const IDLE = 'Zum Einlösen gedrückt halten';
  let start = 0, raf = 0, active = false, done = false, nextTick = 0, denyT = null;
  const setP = (p) => {
    fill.style.transform = `scaleX(${p.toFixed(3)})`;
    glow.style.opacity = (p * 0.95).toFixed(2);
    glow.style.transform = `scale(${(1 + p * 0.07).toFixed(3)})`;
    label2.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(1)}% 0 0)`;
  };
  const reset = () => {
    active = false; cancelAnimationFrame(raf);
    b.classList.remove('holding');
    setP(0);
    setText(IDLE);
  };
  const complete = () => {
    active = false; done = true;
    haptic('ok');
    b.classList.remove('holding'); b.classList.add('burst');
    setText('Eingelöst');
    setTimeout(() => doBuy(id), 400);
  };
  const frame = (ts) => {
    if (!active) return;
    const p = Math.min(1, (ts - start) / HOLD_MS);
    setP(p);
    setText(p < 1 ? `Weiter halten … ${((1 - p) * HOLD_MS / 1000).toFixed(1).replace('.', ',')} s` : 'Eingelöst');
    if (ts >= nextTick) { haptic('tick'); nextTick = ts + (170 - 115 * p); }
    if (p >= 1) { complete(); return; }
    raf = requestAnimationFrame(frame);
  };
  const press = () => {
    if (done || active) return;
    if (!ok) {
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake', 'deny');
      setText('Nicht genug Punkte');
      clearTimeout(denyT);
      denyT = setTimeout(() => { b.classList.remove('shake', 'deny'); setText(IDLE); }, 2000);
      return;
    }
    active = true;
    start = performance.now(); nextTick = start;
    b.classList.add('holding');
    raf = requestAnimationFrame(frame);
  };
  const release = () => { if (active && !done) reset(); };
  b.addEventListener('pointerdown', (e) => {
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    press();
  });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press(); } });
  b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') release(); });
}

function renderShop() {
  const t = now();
  const passOn = ST.passActive(S, t);
  const ppr = ST.POINTS_PER_REP;
  const cards = ST.PACKAGES.map((p, idx) => {
    const isPass = p.type === 'pass';
    const affordable = ST.canAfford(S, p);
    const locked = !passOn || !isPass ? !affordable : false;
    const save = ST.savingPercent(p);
    let badges = '';
    if (p.badge === 'popular') badges = '<span class="badge gold">Beliebt</span>';
    else if (p.badge === 'save' && save > 0) badges = `<span class="badge dark">Spare ${save} %</span>`;
    else if (isPass) badges = '<span class="badge dark">Bis Mitternacht</span>';

    const photo = `<div class="ph" style="background-image:url('${imgOf(p.photo)}');background-position:${PHOTO_POS[p.photo]}"></div>`;
    let big;
    if (isPass) big = '<span class="m word">Ganzer Tag</span>';
    else if (p.minutes >= 120 && p.minutes % 60 === 0) big = `<span class="m">${p.minutes / 60}<small>Std</small></span>`;
    else big = `<span class="m">${p.minutes}<small>Min</small></span>`;

    let right;
    if (isPass && passOn) {
      right = '<div class="rt"><span class="badge gold">Aktiv</span><span class="after">bis Mitternacht</span></div>';
    } else if (locked) {
      const prog = Math.max(0, Math.min(1, S.points / p.price));
      right = `<div class="rt"><div class="lockring"><svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="5"/><circle cx="27" cy="27" r="22" fill="none" style="stroke:var(--accent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 138.2" data-dash="${(prog * 138.2).toFixed(1)} 138.2" transform="rotate(-90 27 27)"/></svg><svg class="lk" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><span class="need">noch ${Math.ceil(p.price - S.points - 1e-9)} P.</span></div>`;
    } else {
      right = `<div class="rt"><span class="price"><i class="coin"></i> ${p.price}</span></div>`;
    }
    const eq = `<span class="eq">ca. ${Math.round(p.price / ppr.pushup)} Liegestütze</span>`;
    const left = affordable ? `${fmtP(S.points - p.price)} P.` : `fehlen ${Math.ceil(p.price - S.points - 1e-9)} P.`;
    const perMin = isPass ? 'Alles frei' : (p.price / p.minutes).toFixed(1).replace('.', ',') + ' P./Min';
    const det = `<div class="det"><div><span>${affordable ? 'Danach' : 'Dir'}</span><b>${left}</b></div><div><span>Gültig</span><b>${isPass ? 'Bis 24 Uhr' : ST.MINUTES_VALID_DAYS + ' Tage'}</b></div><div><span>Preis</span><b>${perMin}</b></div></div>`;
    const inner = `${photo}<div class="sh"></div><div class="main"><div class="badges">${badges}</div><div class="lt"><span class="n">${p.name}</span>${big}${eq}</div>${right}</div>${det}`;
    const sel = shopSel === p.id ? ' sel' : '';
    const selectable = !(isPass && passOn);
    const cls = 'pcard rv' + (p.badge === 'popular' ? ' pop' : '') + (locked ? ' locked' : '') + sel;
    const attrs = `data-id="${p.id}"${selectable ? ` data-sel="${p.id}" role="button" tabindex="0" aria-label="${p.name}, ${pkgBig(p)} auswählen"` : ''}`;
    return p.badge === 'popular' ? `<div class="${cls}" ${attrs}><div class="inner">${inner}</div></div>` : `<div class="${cls}" ${attrs}>${inner}</div>`;
  }).join('');

  const free = ST.minutesFree(S, t);
  const exp = ST.expiryDays(S, t);
  const timeBig = passOn ? 'Freier Tag' : `${free}<small>Min</small>`;
  const timeTxt = passOn ? 'Heute ist alles frei, bis Mitternacht.'
    : (free > 0 ? `Läuft in ${exp} ${exp === 1 ? 'Tag' : 'Tagen'} ab. Nutze sie vorher.` : 'Noch nichts eingelöst. Wähle unten ein Paket.');
  const table = ST.EXERCISES.map((e) => `<div class="total glass"><b>${e === 'plank' ? '1 bis 2' : fmt(ppr[e])}</b><span>${ST.EX_LABEL[e]}</span></div>`).join('');

  screens.shop.innerHTML = `
    <div class="bgfx bg-shop">${rings(195)}<div class="cloud"></div></div>
    <div class="scroll">
      <div class="head big sticky"><div><h1>Shop</h1><p class="sub">Tausche Punkte gegen Handyzeit</p></div>
        <div class="balance glass"><i class="coin"></i><b>${fmtP(S.points)}</b></div></div>
      <div class="card glass time-card rv"><div class="big">${timeBig}</div><div class="txt"><b>Deine Handyzeit</b><span>${timeTxt}</span></div></div>
      <div class="cards">${cards}</div>
      <div class="sec-title rv"><b>So funktioniert’s</b></div>
      <div class="card glass steps rv">
        <div class="st"><div><b>Trainieren.</b> Jede saubere Wiederholung bringt Punkte.</div></div>
        <div class="st"><div><b>Einlösen.</b> Tausche Punkte gegen Handyzeit oder den Freien Tag.</div></div>
        <div class="st"><div><b>Nutzen.</b> Gekaufte Zeit gilt ${ST.MINUTES_VALID_DAYS} Tage. Danach verfällt der Rest.</div></div>
      </div>
      <div class="sec-title rv"><b>Punkte pro Wiederholung</b></div>
      <div class="totals rv" style="margin-top:0">${table}</div>
      <p class="shop-note rv">Im Browser-Test wird noch keine App gesperrt. Die echte Sperre kommt mit der iPhone-App.</p>
    </div>
    <div id="buy-panel" class="buy-panel" aria-live="polite"></div>`;
  screens.shop.classList.toggle('sel-open', !!shopSel);
  updateBuyPanel();
  setupMotion(screens.shop);
  bindScroll(screens.shop);
  glassOn(screens.shop);
}

function openModal(html) {
  els.modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  els.modal.classList.add('show');
  els.modal.setAttribute('aria-hidden', 'false');
}
function closeModal() {
  if (typeof tut3d !== 'undefined' && tut3d) { tut3d.dispose(); tut3d = null; }
  els.modal.classList.remove('show');
  els.modal.setAttribute('aria-hidden', 'true');
  els.modal.innerHTML = '';
}
els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

function askBuy(id) {
  const p = ST.findPackage(id);
  if (!p) return;
  const what = p.type === 'pass' ? 'Freien Tag (bis Mitternacht)' : p.name + ', ' + minLabel(p.minutes);
  openModal(`<h3>${what} einlösen?</h3><p>${p.price} Punkte. Danach bleiben dir ${fmtP(S.points - p.price)} Punkte.${p.type === 'pass' ? '' : ' Die Zeit bleibt ' + ST.MINUTES_VALID_DAYS + ' Tage gültig.'}</p>
    <div class="row"><button class="btn-grad" type="button" data-confirm-buy="${p.id}">Einlösen</button><button class="btn-text" type="button" data-act="close-modal">Abbrechen</button></div>`);
}

function doBuy(id) {
  const r = ST.buy(S, id, now());
  closeModal();
  shopSel = null;
  if (r.ok) {
    saveState();
    beepOk();
    toast(r.pkg.type === 'pass' ? 'Freier Tag aktiv bis Mitternacht' : minLabel(r.pkg.minutes) + ' gutgeschrieben');
  } else if (r.error === 'not_enough') toast('Dafür fehlen noch Punkte.');
  else if (r.error === 'pass_active') toast('Der Freie Tag ist schon aktiv.');
  else toast('Das hat nicht geklappt.');
  rerenderKeep('shop', renderShop);
}

/* ---------- Einstellungen ---------- */
function renderSettings() {
  const set = S.settings;
  const gdp = ST.goalDropProgress(S);
  const sw = (on, act, label) => `<button class="switch${on ? ' on' : ''}" type="button" data-act="${act}" aria-pressed="${on}" aria-label="${label}"></button>`;
  screens.settings.innerHTML = `
    <div class="bgfx bg-set"><div class="cloud"></div></div>
    <div class="scroll">
      <div class="set-title">
        <button class="round-btn glass" type="button" data-act="back" aria-label="Zurück"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h1>Einstellungen</h1>
      </div>

      <div class="group"><div class="gl">Training</div><div class="panel glass">
        <div class="item"><div>Tagesziel<span class="s">Wiederholungen pro Tag für den Streak. Erhöhen ist gratis, Senken kostet ${ST.GOAL_DROP_REPS} Extra-Wiederholungen.</span></div>
          <div class="stepper"><button type="button" data-act="goal-down" aria-label="Tagesziel senken">−</button><b>${S.goal}</b><button type="button" data-act="goal-up" aria-label="Tagesziel erhöhen">+</button></div></div>
        ${gdp ? `<div class="item"><div>Ziel sinkt auf ${gdp.to}<span class="s">Noch ${gdp.left} Wiederholungen, egal welche Übung.</span><div class="pbar" style="margin-top:8px;width:200px"><i style="width:${Math.round(gdp.done / gdp.need * 100)}%"></i></div></div><button class="actbtn" type="button" data-act="goal-drop-cancel">Abbrechen</button></div>` : ''}
        <div class="item"><div>Darstellung<span class="s">Auto folgt deinem Handy.</span></div><div class="seg" role="group" aria-label="Darstellung">${['auto','light','dark'].map(k => `<button type="button" class="${(set.theme||'dark')===k?'on':''}" data-act="theme" data-v="${k}">${{auto:'Auto',light:'Hell',dark:'Dunkel'}[k]}</button>`).join('')}</div></div>
        <div class="item"><div>Ton und Vibration<span class="s">Vibration gibt es nur auf Android-Handys im Browser.</span></div>${sw(set.sound, 'toggle-sound', 'Ton')}</div>
        <div class="item"><div>Kamera</div><div class="segpair"><button type="button" class="${set.facing === 'user' ? 'on' : ''}" data-act="cam-user">Front</button><button type="button" class="${set.facing === 'environment' ? 'on' : ''}" data-act="cam-env">Rück</button></div></div>
        <div class="item"><div>Messwerte einblenden<span class="s">Zeigt beim Training Winkel und Erkennung zum Testen.</span></div>${sw(set.debug, 'toggle-debug', 'Messwerte')}</div>
        <div class="item"><div>Anleitungen<span class="s">Zeigt die Erklärung vor jeder Übung wieder an.</span></div><button class="actbtn" type="button" data-act="tut-reset">Zurücksetzen</button></div>
        <div class="item"><div>So funktioniert die Erkennung<span class="s">Was die Kamera macht, was zählt und was nicht.</span></div><button class="actbtn" type="button" data-act="open-how-settings">Lesen</button></div>
      </div></div>

      <div class="group"><div class="gl">Handyzeit</div><div class="panel glass">
        <div class="item"><div>Sperr-Screen ansehen<span class="s">So sieht eine gesperrte App aus (Vorschau).</span></div><button class="actbtn" type="button" data-act="open-lock">Ansehen</button></div>
        <div class="item col"><div>Handyzeit ohne Training<span class="s">So viel Zeit hast du am Tag, ohne zu trainieren. Danach sperrt die iPhone-App deine Apps.</span></div>${sliderHTML('timeGoal', S.settings.timeGoal || ST.TIME_GOAL.def, true)}</div>
        <div class="item"><div>Hinweis kurz vor Ende<span class="s">Ca. 5 Minuten vorher. Die echte Mitteilung kommt mit der iPhone-App.</span></div><button class="actbtn" type="button" data-act="warn-preview">Vorschau</button></div>
        <div class="item off"><div>Gesperrte Apps und Ausnahmen<span class="s">Auswahl der Apps und feste Ausnahmen wie Telefon.</span></div><span class="tag">iPhone-App</span></div>
        <div class="item off"><div>Benachrichtigungen<span class="s">Einzeln einstellbar, zum Beispiel Warnung 1 Minute vor Ende.</span></div><span class="tag">iPhone-App</span></div>
      </div></div>

      <div class="group"><div class="gl">Verdient Pro</div><div class="panel glass">
        <div class="item"><div>Bezahl-Vorschau<span class="s">Design des Abos, noch ohne echten Kauf.</span></div><button class="actbtn" type="button" data-act="open-pro">Ansehen</button></div>
        <div class="item${ST.isPro(S) ? '' : ' off'}"><div>Streak-Schutztag<span class="s">Ein Tag pro Woche ohne Training bricht deinen Streak nicht. ${ST.isPro(S) ? 'Diese Woche: ' + (ST.shieldUsedThisWeek(S, now()) ? 'schon benutzt.' : 'noch frei.') : 'Nur mit Pro.'}</span></div>${sw(set.shield && ST.isPro(S), 'toggle-shield', 'Streak-Schutztag')}</div>
      </div></div>

      <div class="group"><div class="gl">Daten</div><div class="panel glass">
        <div class="item"><div>Datenexport<span class="s">Speichert deinen Stand als Datei.</span></div><button class="actbtn" type="button" data-act="export">Exportieren</button></div>
        <div class="info"><b style="color:var(--text)">Datenschutz:</b> Das Kamerabild bleibt auf deinem Handy. Es wird nicht gespeichert und nicht hochgeladen. Punkte und Verlauf liegen nur in diesem Browser.</div>
      </div></div>

      <div class="group"><div class="gl">Nur für den Test</div><div class="panel glass">
        <div class="item"><div>Pro simulieren<span class="s">Schaltet Pro-Funktionen zum Ausprobieren frei. Es wird nichts bezahlt.</span></div>${sw(set.proTest, 'toggle-protest', 'Pro simulieren')}</div>
        ${['squat', 'plank'].map((e) => `<div class="item"><div>${ST.EX_LABEL[e]} einzeln freischalten<span class="s">Simuliert den Einzelkauf (${eur(ST.PRO.PRICES.exercise)} pro Monat).</span></div>${sw(S.unlockedEx.indexOf(e) >= 0, 'test-unlock" data-v="' + e, ST.EX_LABEL[e] + ' freischalten')}</div>`).join('')}
        <div class="item"><div>Gratis-Woche zurücksetzen<span class="s">Nur zum Testen. In der echten App entscheidet Apple, ob sie schon genutzt wurde.</span></div><button class="actbtn" type="button" data-act="trial-reset">Zurück</button></div>
        <div class="item"><div>100 Punkte dazu<span class="s">Zum Ausprobieren des Shops.</span></div><button class="actbtn" type="button" data-act="test-points">+100</button></div>
        <div class="item"><div>5 Min Handyzeit verbrauchen<span class="s">Simuliert, was später die Sperre macht.</span></div><button class="actbtn" type="button" data-act="test-spend">−5 Min</button></div>
        <div class="item"><div>Einstieg wiederholen<span class="s">Zeigt die Einführung und die Fragen noch einmal.</span></div><button class="actbtn" type="button" data-act="redo-onb">Starten</button></div>
        <div class="item"><div>Alles zurücksetzen<span class="s">Löscht Punkte, Rang, Streak und Zeit.</span></div><button class="actbtn danger" type="button" data-act="reset">Löschen</button></div>
      </div></div>
    </div>`;
  glassOn(screens.settings);
}

function exportData() {
  try {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gym-app-daten-' + ST.dayKey(now()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Datei wird gespeichert …');
  } catch (e) {
    toast('Export hat nicht geklappt.');
  }
}

/* ---------- Sperr-Screen (Vorschau) ---------- */
function renderLock() {
  const t = now();
  const passOn = ST.passActive(S, t);
  const free = ST.minutesFree(S, t);
  let title = 'Diese App ist gesperrt', text, btns;
  if (passOn) {
    title = 'Freier Tag ist aktiv';
    text = 'Alle Apps sind bis Mitternacht frei.';
    btns = '<button class="btn-grad" type="button" data-act="lock-use">App öffnen</button>';
  } else if (free > 0) {
    text = `Du hast <b>${free} Min</b> Handyzeit. Nutze sie, oder verdiene dir mehr.`;
    btns = `<button class="btn-grad" type="button" data-act="lock-use">${Math.min(5, free)} Min nutzen</button><button class="btn-text" type="button" data-act="start">Jetzt trainieren</button>`;
  } else {
    text = 'Du hast gerade keine Handyzeit. Trainiere, um sie zu verdienen.';
    btns = '<button class="btn-grad" type="button" data-act="start">Jetzt trainieren</button><button class="btn-text" type="button" data-act="go-shop">Im Shop einlösen</button>';
  }
  screens.lock.innerHTML = `
    <div class="bgfx bg-lock"><div class="cloud"></div></div>
    <div class="lockwrap">
      <div class="onb-top"><button class="round-btn glass" type="button" data-act="back-settings" aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><span class="tag-pill">Vorschau</span><span style="width:38px"></span></div>
      <div class="lock-mid">
        <div class="lk-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg></div>
        <div class="lk-ring"><svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="78" fill="none" stroke="rgba(var(--w),.12)" stroke-width="6"/><circle cx="90" cy="90" r="78" fill="none" stroke="url(#lkg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${passOn ? 490 : (free > 0 ? 250 : 40)} 490" transform="rotate(-90 90 90)"/><defs><linearGradient id="lkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C9CED6"/><stop offset="1" stop-color="#F6D77A"/></linearGradient></defs></svg>
          <div class="lk-in">${passOn ? '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>' : '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'}</div></div>
        <h2>${title}</h2>
        <p class="lead" style="max-width:300px;text-align:center">${text}</p>
      </div>
      <div class="onb-foot lock-foot">${btns}<p class="shop-note" style="margin-top:12px">Vorschau. In der iPhone-App erscheint dieser Bildschirm über jeder gesperrten App.</p></div>
    </div>`;
  glassOn(screens.lock);
}

/* ---------- So funktioniert die Erkennung ---------- */
const how = { from: 'settings' };
function renderHow() {
  const rules = [
    ['Liegestütze', ['Ganz runter, die Brust geht fast bis zum Boden.', 'Oben die Arme ganz durchdrücken.', 'Nicht auf den Knien. Das zählt nicht.', 'Nicht zu schnell. Zu schnelle Wiederholungen zählen nicht.']],
    ['Kniebeugen', ['Tief in die Hocke.', 'Oben die Beine ganz strecken.', 'Nicht auf den Knien sitzen oder wippen.', 'Nicht zu schnell.']],
    ['Situps', ['Ganz hoch bis zum Sitzen.', 'Danach ganz ablegen.', 'Nur den Kopf bewegen zählt nicht.', 'Nicht zu schnell.']],
    ['Plank', ['Körper gerade wie ein Brett.', 'Auf die Arme stützen, Oberkörper vom Boden weg. Liegen zählt nicht.', '20 Sekunden halten sind 1 Wiederholung.']]
  ];
  screens.how.innerHTML = `
    <div class="bgfx bg-set"><div class="cloud"></div></div>
    <div class="scroll">
      <div class="set-title">
        <button class="round-btn glass" type="button" data-act="back-how" aria-label="Zurück"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h1>Erkennung</h1>
      </div>
      <div class="group"><div class="gl">So funktioniert es</div><div class="panel glass how">
        <p>Die Kamera filmt dich. Die Erkennung (MediaPipe von Google) sucht in jedem Bild 33 Körperpunkte, zum Beispiel Schultern, Ellbogen, Hüfte und Knie. Aus den Winkeln zwischen diesen Punkten zählt die App deine Wiederholungen.</p>
        <p>Beim Start der Kamera lädt die App die Erkennung aus dem Internet nach. Dafür brauchst du Internet.</p>
      </div></div>
      <div class="group"><div class="gl">Dein Kamerabild</div><div class="panel glass how">
        <p>Das Bild wird nur auf deinem Handy ausgewertet. Die App speichert es nicht und schickt es nirgends hin. Aus dem Internet werden nur die Dateien der Erkennung geladen, hochgeladen wird nichts.</p>
        <p>Punkte, Verlauf und Einstellungen liegen nur in diesem Browser.</p>
      </div></div>
      <div class="group"><div class="gl">Aufbau</div><div class="panel glass how">
        <p>Stell das Handy fest hin, etwa 2 bis 3 Meter entfernt. Der ganze Körper muss im Bild sein, mit gutem Licht von vorn. In einem engen Raum hilft oft der Zoom 0,5× der Rückkamera.</p>
      </div></div>
      <div class="group"><div class="gl">Was zählt und was nicht</div><div class="panel glass how">
        ${rules.map((r) => `<h4>${r[0]}</h4><ul>${r[1].map((x) => `<li>${x}</li>`).join('')}</ul>`).join('')}
      </div></div>
      <div class="group"><div class="gl">Grenzen</div><div class="panel glass how">
        <p>Die Erkennung ist nicht perfekt. Dunkle Kleidung, wenig Licht oder ein halb verdeckter Körper können zu Zählfehlern führen. Wie genau sie bei vielen verschiedenen Menschen ist, haben wir noch nicht gemessen.</p>
      </div></div>
    </div>`;
  glassOn(screens.how);
}

/* ---------- Bezahl-Vorschau (Pro) ---------- */
let proPlan = 'year';
let proFrom = 'settings';   // wohin der Zurück-Knopf der Pro-Seite führt (Einstieg, Inventar, Einstellungen, Start)
const eur = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const YES = '<span class="cy" aria-label="Ja">' + ICON_CHECK + '</span>';
const NO = '<span class="cn" aria-label="Nein">–</span>';
// Gratis | Pro. Alles ein Vorschlag. 'app' = nur mit der iPhone-App.
const COMPARE = [
  ['Liegestütze und Situps', YES, YES],
  ['Kniebeugen und Plank', NO, YES],
  ['Punkte, Shop, Tagesziel', YES, YES],
  ['Streak und Ränge', YES, YES],
  ['Verlauf', PRO_DAYS_LABEL(), 'Unbegrenzt'],
  ['Rekorde', NO, 'Unbegrenzt'],
  ['Statistiken', NO, YES],
  ['Streak-Schutztag', NO, YES],
  ['Neue Übungen zuerst', NO, YES],
  ['Apps sperren', 'Bis 2', 'Mehr', 'app']
];
function PRO_DAYS_LABEL() { return ST.PRO.FREE_HISTORY_DAYS + ' Tage'; }
function renderPro() {
  const P = ST.PRO.PRICES;
  const plan = proPlan;
  const saving = Math.round((1 - P.year / (P.month * 12)) * 100);
  const sel = (k) => (plan === k ? ' sel' : '');
  const used = ST.trialUsed(S);
  const after = plan === 'year' ? eur(P.year) + ' pro Jahr' : eur(P.month) + ' pro Monat';
  const note = plan === 'once'
    ? 'Einmal zahlen, kein Abo. Der Preis ist ein Platzhalter.'
    : used
      ? `Die Gratis-Woche gibt es nur einmal und ist schon genutzt. Kündigen jederzeit in den iPhone-Einstellungen unter Abos. ${after}.`
      : `${ST.PRO.TRIAL_DAYS} Tage gratis, nur einmal. Kündigen jederzeit in den iPhone-Einstellungen unter Abos. Danach ${after}.`;
  const buy = plan === 'once' ? 'Einmalkauf ansehen' : used ? 'Pro abonnieren' : `${ST.PRO.TRIAL_DAYS} Tage gratis testen`;
  screens.pro.innerHTML = `
    <div class="bgfx bg-set"><div class="cloud"></div></div>
    <div class="scroll">
      <div class="onb-top" style="padding-top:calc(env(safe-area-inset-top) + 22px)"><span class="tag-pill">Vorschau</span><button class="round-btn glass" type="button" data-act="back-pro" aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div style="display:flex;justify-content:center;margin-top:14px">${logo(64)}</div>
      <h2 class="pro-h">Gratis oder Pro</h2>
      <p class="lead" style="text-align:center">Das Wichtigste bleibt gratis.</p>
      <div class="card glass cmp" style="margin-top:20px">
        <div class="cmp-h"><span></span><b>Gratis</b><b class="gold">Pro</b></div>
        ${COMPARE.map((r) => `<div class="cmp-r"><span>${r[0]}${r[3] === 'app' ? '<em>mit iPhone-App</em>' : ''}</span><span class="v">${r[1]}</span><span class="v pr">${r[2]}</span></div>`).join('')}
      </div>
      <div class="plans three">
        <button class="plan-opt${sel('year')}" type="button" data-act="pro-plan" data-v="year"><span class="pb">Spare ${saving} %</span><b>Jahr</b><span class="pp">${eur(P.year)}</span><span class="ps">${eur(P.year / 12)} pro Monat</span></button>
        <button class="plan-opt${sel('month')}" type="button" data-act="pro-plan" data-v="month"><b>Monat</b><span class="pp">${eur(P.month)}</span><span class="ps">pro Monat</span></button>
        <button class="plan-opt${sel('once')}" type="button" data-act="pro-plan" data-v="once"><span class="pb alt">Platzhalter</span><b>Einmal</b><span class="pp">${eur(P.once)}</span><span class="ps">einmal zahlen</span></button>
      </div>
      <button class="btn-grad" type="button" data-act="pro-buy" style="margin-top:18px">${buy}</button>
      <p class="shop-note" style="margin-top:10px">${note}</p>
      <div class="card glass later" style="margin-top:18px"><b>Nur eine Übung?</b><span>Kniebeugen oder Plank gibt es auch einzeln für ${eur(P.exercise)} pro Monat. Pro schaltet beide frei.</span></div>
      <div class="card glass later" style="margin-top:12px"><b>Kommt später</b><span>Widgets, Erinnerungen und Events mit Bonus-Punkten. Das gibt es erst mit der iPhone-App.</span></div>
      <div class="pro-links"><button type="button" data-act="pro-link">Käufe wiederherstellen</button><button type="button" data-act="pro-link">Nutzungsbedingungen</button><button type="button" data-act="pro-link">Datenschutz</button></div>
      <p class="shop-note" style="margin-top:14px">Vorschau: noch kein echter Kauf, und in dieser Web-Version ist nichts gesperrt. Alle Preise und Inhalte sind ein Vorschlag, noch nicht festgelegt.</p>
    </div>`;
  glassOn(screens.pro);
}

/* ---------- Einstieg ---------- */
const EX_DESC = { pushup: 'Brust fast bis zum Boden', squat: 'Tief runter, oben aufrichten', situp: 'Oberkörper ganz hoch', plank: '20 Sekunden halten' };
// Jede Frage hat einen eigenen Bildschirm.
const ONB_STEPS = ['welcome', 'name', 'age', 'theme', 'fit', 'ex', 'phone', 'time', 'plan', 'camera', 'commit'];
const ONB_LAST = ONB_STEPS.length - 1;
const onb = { step: 0, fit: 2, ex: 'pushup', phone: '2to4', phoneIdx: 2, name: '', age: ST.AGE.def, timeGoal: ST.TIME_GOAL.def, shown: -1 };

function onbPlan() {
  const goal = ST.FIT_STEPS[onb.fit].goal;
  return { goal: goal, mins: ST.trainingMinutes(onb.ex, goal), pts: goal * ST.POINTS_PER_REP[onb.ex] };
}

/* ---------- Regler (eigene Bauweise) mit Ton, Vibration und lebendiger Anzeige ---------- */
const FIT_BARS = [28, 44, 62, 80, 100];
const SLIDERS = {
  age: {
    min: ST.AGE.min, max: ST.AGE.max, step: 1, tick: 5, ends: [String(ST.AGE.min), ST.AGE.max + '+'],
    art: (v) => `<div class="vs-num gradtext">${v}</div><div class="vs-unit">Jahre</div>`,
    upd: (el, v) => { el.querySelector('.vs-num').textContent = v; }
  },
  fit: {
    min: 0, max: ST.FIT_STEPS.length - 1, step: 1, ends: ['Neuling', 'Stark'],
    art: (v) => `<div class="fitbars">${FIT_BARS.map((h, i) => `<i class="${i <= v ? 'on' : ''}" style="height:${h}%"></i>`).join('')}</div>`,
    val: (v) => ST.FIT_STEPS[v].name, sub: (v) => ST.FIT_STEPS[v].goal + ' Wiederholungen am Tag',
    upd: (el, v) => { el.querySelectorAll('.fitbars i').forEach((b, i) => b.classList.toggle('on', i <= v)); }
  },
  phone: {
    min: 0, max: ST.PHONE_LEVELS.length - 1, step: 1, ends: ['Wenig', 'Sehr viel'],
    art: (v) => `<div class="phone-art"><div class="ph-body"><div class="ph-fill" style="height:${(v + 1) * 20}%"></div><div class="ph-notch"></div></div></div>`,
    val: (v) => ST.PHONE_LEVELS[v].label, sub: () => 'pro Tag am Handy',
    upd: (el, v) => { el.querySelector('.ph-fill').style.height = ((v + 1) * 20) + '%'; }
  },
  timeGoal: {
    min: ST.TIME_GOAL.min, max: ST.TIME_GOAL.max, step: ST.TIME_GOAL.step, tick: 15, ends: [fmtMin(ST.TIME_GOAL.min), fmtMin(ST.TIME_GOAL.max)],
    art: (v) => `<div class="ring-art"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="86" class="rg-bg"/><circle cx="100" cy="100" r="86" class="rg-fg" transform="rotate(-90 100 100)" stroke-dasharray="${RING_C}" stroke-dashoffset="${ringOff(v)}"/></svg><div class="ring-c"><b class="${fmtMin(v).length > 6 ? 'long' : ''}">${fmtMin(v)}</b><span>pro Tag</span></div></div>`,
    upd: (el, v) => { el.querySelector('.rg-fg').setAttribute('stroke-dashoffset', ringOff(v)); const b = el.querySelector('.ring-c b'); b.textContent = fmtMin(v); b.classList.toggle('long', fmtMin(v).length > 6); }
  }
};
const RING_C = 2 * Math.PI * 86;
function ringOff(v) { const d = SLIDERS.timeGoal; return (RING_C * (1 - (v - d.min) / (d.max - d.min))).toFixed(1); }
function fmtMin(m) { return m < 60 ? m + ' Min' : (m % 60 === 0 ? (m / 60) + ' Std' : Math.floor(m / 60) + ' Std ' + (m % 60) + ' Min'); }
function sliderText(kind, v) { const d = SLIDERS[kind]; return d.val ? d.val(v) : ''; }
function sliderHTML(kind, value, compact) {
  const d = SLIDERS[kind];
  const pct = (value - d.min) / (d.max - d.min) * 100;
  let ticks = '';
  if (d.tick) for (let t = d.min; t <= d.max; t += d.tick) ticks += `<i style="left:${((t - d.min) / (d.max - d.min) * 100).toFixed(2)}%"></i>`;
  else for (let t = d.min; t <= d.max; t += d.step) ticks += `<i style="left:${((t - d.min) / (d.max - d.min) * 100).toFixed(2)}%"></i>`;
  const compactLabel = compact ? `<div class="vs-cl">${fmtMin(value)}</div>` : '';
  return `<div class="vs vs-${kind}${compact ? ' compact' : ''}" data-k="${kind}" data-v="${value}" tabindex="0" role="slider" aria-valuemin="${d.min}" aria-valuemax="${d.max}" aria-valuenow="${value}" aria-label="${kind}" style="--p:${pct}%;--f:${(pct / 100).toFixed(4)}">
    <div class="vs-art">${d.art(value)}</div>
    ${d.val ? `<div class="vs-val">${d.val(value)}</div><div class="vs-sub">${d.sub(value)}</div>` : ''}${compactLabel}
    <div class="vs-track"><div class="vs-rail"><i class="vs-fill"></i></div><div class="vs-ticks">${ticks}</div><div class="vs-thumb"><b></b></div></div>
    <div class="vs-ends"><span>${d.ends[0]}</span><span>${d.ends[1]}</span></div></div>`;
}
// Bei jedem Wertwechsel: kurzer Klick und leichtes Vibrieren (Android und iPhone ab iOS 17.4, sonst nur Ton)
function sliderTick() { beep(1250, 0.018, 0.07); haptic('tick'); }
function setSlider(el, v, silent) {
  const k = el.dataset.k, d = SLIDERS[k];
  v = Math.max(d.min, Math.min(d.max, v));
  const prev = Number(el.dataset.v);
  if (v === prev) return;
  el.dataset.v = v;
  el.setAttribute('aria-valuenow', v);
  el.style.setProperty('--p', ((v - d.min) / (d.max - d.min) * 100) + '%');
  el.style.setProperty('--f', ((v - d.min) / (d.max - d.min)).toFixed(4));
  d.upd(el, v);
  const val = el.querySelector('.vs-val'); if (val) val.textContent = d.val(v);
  const sub = el.querySelector('.vs-sub'); if (sub) sub.textContent = d.sub(v);
  const cl = el.querySelector('.vs-cl'); if (cl) cl.textContent = fmtMin(v);
  if (!silent) sliderTick();
  if (k === 'age') onb.age = v;
  else if (k === 'fit') onb.fit = v;
  else if (k === 'phone') { onb.phoneIdx = v; onb.phone = ST.PHONE_LEVELS[v].id; }
  else if (k === 'timeGoal') { if (run.current === 'settings') S.settings.timeGoal = v; else onb.timeGoal = v; }
}
function sliderFromX(el, clientX) {
  const d = SLIDERS[el.dataset.k];
  const tr = el.querySelector('.vs-track').getBoundingClientRect();
  const pad = 17;
  const f = Math.max(0, Math.min(1, (clientX - tr.left - pad) / Math.max(1, tr.width - pad * 2)));
  return d.min + Math.round(f * (d.max - d.min) / d.step) * d.step;
}
let dragSlider = null;
document.addEventListener('pointerdown', (e) => {
  const tr = e.target.closest && e.target.closest('.vs-track');
  if (!tr) return;
  const el = tr.closest('.vs');
  ensureAudio();
  dragSlider = el; el.classList.add('drag');
  try { tr.setPointerCapture(e.pointerId); } catch (x) { /* weiter */ }
  setSlider(el, sliderFromX(el, e.clientX));
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => { if (dragSlider) setSlider(dragSlider, sliderFromX(dragSlider, e.clientX)); });
function endDrag() { if (!dragSlider) return; dragSlider.classList.remove('drag'); if (dragSlider.dataset.k === 'timeGoal' && run.current === 'settings') saveState(); dragSlider = null; }
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', (e) => {
  const el = e.target.closest && e.target.closest('.vs');
  if (!el) return;
  const d = SLIDERS[el.dataset.k], v = Number(el.dataset.v);
  let nv = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v + d.step;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v - d.step;
  else if (e.key === 'Home') nv = d.min; else if (e.key === 'End') nv = d.max;
  if (nv === null) return;
  e.preventDefault(); ensureAudio(); setSlider(el, nv);
  if (el.dataset.k === 'timeGoal' && run.current === 'settings') saveState();
});

/* ---------- Halten zum Starten + Türen, die sich öffnen ---------- */
const HOLD_GO_MS = 3000;
let goHold = null;
function goHoldStart() {
  const btn = $('hold-go');
  if (!btn || goHold || btn.classList.contains('done')) return;
  ensureAudio();
  goHold = { t0: performance.now(), lastTick: 0, raf: 0 };
  btn.classList.add('holding');
  const step = (now) => {
    if (!goHold) return;
    const p = Math.min(1, (now - goHold.t0) / HOLD_GO_MS);
    btn.style.setProperty('--hp', p.toFixed(3));
    const left = Math.max(1, Math.ceil(HOLD_GO_MS / 1000 * (1 - p)));
    const cn = $('orb-cnt');
    if (cn && cn.textContent !== String(left)) { cn.textContent = left; cn.classList.remove('bump'); void cn.offsetWidth; cn.classList.add('bump'); beep(700 + (3 - left) * 180, 0.09, 0.2); haptic('ok'); }
    else if (now - goHold.lastTick > 260) { goHold.lastTick = now; beep(500 + p * 500, 0.03, 0.08); haptic('tick'); }
    if (p >= 1) { goHoldDone(); return; }
    goHold.raf = requestAnimationFrame(step);
  };
  goHold.raf = requestAnimationFrame(step);
}
function goHoldCancel() {
  const btn = $('hold-go');
  if (!goHold) return;
  cancelAnimationFrame(goHold.raf); goHold = null;
  if (btn && !btn.classList.contains('done')) { btn.classList.remove('holding'); btn.style.setProperty('--hp', '0'); const cn = $('orb-cnt'); if (cn) cn.textContent = '3'; }
}
function goHoldDone() {
  const btn = $('hold-go');
  cancelAnimationFrame(goHold.raf); goHold = null;
  btn.classList.add('done'); btn.style.setProperty('--hp', '1');
  beepOk(); haptic('ok');
  setTimeout(openDoors, 800);
}
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#hold-go')) { goHoldStart(); e.preventDefault(); } });
document.addEventListener('pointerup', goHoldCancel);
document.addEventListener('pointercancel', goHoldCancel);
document.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target.id === 'hold-go' && !e.repeat) { e.preventDefault(); goHoldStart(); } });
document.addEventListener('keyup', (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target.id === 'hold-go') goHoldCancel(); });
// Federndes Antippen wie bei iOS-Glas: wächst, dehnt sich in Zugrichtung, federt über die Ruhegröße zurück
const SPR_POINTER = { grow: 6, press: [417.6, 29.2], release: [230, 23.7] };
const SPR_TOUCH = { grow: 15, press: [515, 27.3], release: [250, 11.8] };
function springPress(el) {
  if (el.dataset.spr) return;
  el.dataset.spr = '1';
  const v = [1, 1, 0, 0], vel = [0, 0, 0, 0], tg = [1, 1, 0, 0];
  let k = SPR_POINTER.release[0], c = SPR_POINTER.release[1], raf = 0, last = 0, ptr = null;
  const paint = () => { el.style.scale = v[0].toFixed(4) + ' ' + v[1].toFixed(4); el.style.translate = v[2].toFixed(2) + 'px ' + v[3].toFixed(2) + 'px'; };
  const tick = (t) => {
    const dt = Math.min(0.032, Math.max(0.001, (t - last) / 1000)); last = t;
    let still = true;
    for (let i = 0; i < 4; i++) {
      const steps = 3, h = dt / steps;
      for (let s2 = 0; s2 < steps; s2++) { const a = -k * (v[i] - tg[i]) - c * vel[i]; vel[i] += a * h; v[i] += vel[i] * h; }
      if (Math.abs(v[i] - tg[i]) > 1e-3 || Math.abs(vel[i]) > 1e-2) still = false;
    }
    if (still) { for (let i = 0; i < 4; i++) { v[i] = tg[i]; vel[i] = 0; } paint(); raf = 0; return; }
    paint(); raf = requestAnimationFrame(tick);
  };
  const go = (target, feel) => { for (let i = 0; i < 4; i++) tg[i] = target[i]; k = feel[0]; c = feel[1]; if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const track = (e) => {
    if (!ptr) return;
    const b = ptr.box, base = 1 + ptr.feel.grow / Math.max(b.width, b.height);
    const aspect = b.width / b.height, dx = (e.clientX - ptr.x) / aspect, dy = e.clientY - ptr.y, len = Math.hypot(dx, dy);
    if (!len) return go([base, base, 0, 0], ptr.feel.press);
    const nx = dx / len, ny = dy / len, rub = 1 - 1 / (1 + len / b.height / (5 * aspect));
    const st = 1 + (6 / b.height) * rub * Math.abs(Math.abs(nx) - Math.abs(ny)), hor = Math.abs(nx) > Math.abs(ny);
    go([base * (hor ? st : 1 / st), base * (hor ? 1 / st : st), nx * 8 * rub, ny * 8 * rub], ptr.feel.press);
  };
  const end = () => { if (!ptr) return; const f = ptr.feel; ptr = null; window.removeEventListener('pointermove', track); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); go([1, 1, 0, 0], f.release ? { 0: f.release[0], 1: f.release[1] } : [250, 12]); };
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || ptr) return;
    ptr = { x: e.clientX, y: e.clientY, box: el.getBoundingClientRect(), feel: e.pointerType === 'mouse' ? SPR_POINTER : SPR_TOUCH };
    window.addEventListener('pointermove', track); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    track(e);
  });
}

function openDoors() {
  finishOnb(false);   // die App liegt schon darunter bereit
  const inner = `<div class="dr-clip"><div class="dr-in">${logo(84)}<div class="dr-t1">Los geht’s</div><div class="dr-t2">Erst bewegen. Dann scrollen.</div></div></div><i class="dr-shadow"></i>`;
  const d = document.createElement('div');
  d.className = 'doors';
  d.innerHTML = `<div class="dr dr-t">${inner}</div><div class="dr dr-b">${inner}</div><i class="dg"></i>`;
  const app = $('app');
  app.appendChild(d);
  app.classList.add('reveal');
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('go')));
  setTimeout(() => d.classList.add('open'), 650);
  setTimeout(() => { d.remove(); app.classList.remove('reveal'); }, 2900);
}

function renderOnb() {
  const st = onb.step;
  const key = ONB_STEPS[st];
  const anim = onb.shown !== st;
  onb.shown = st;
  const dots = st > 0 ? `<div class="dots many" aria-label="Schritt ${st} von ${ONB_LAST}">${ONB_STEPS.slice(1).map((_, i) => `<i class="${i + 1 <= st ? 'on' : ''}"></i>`).join('')}</div>` : '<div></div>';
  const back = st > 0 ? '<button class="round-btn glass" type="button" data-act="onb-back" aria-label="Zurück"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' : '<span></span>';
  const skip = '<span></span>';   // Der Einstieg lässt sich nicht überspringen: der Name ist Pflicht
  const next = (label, off) => `<div class="onb-foot"><button class="btn-grad" id="onb-next-btn" type="button" data-act="onb-next"${off ? ' disabled aria-disabled="true"' : ''}>${label || 'Weiter'}</button></div>`;
  const ex = onb.ex;
  let body;
  if (key === 'welcome') {
    body = `<div class="welcome">${logo(104)}<div class="brand">${APP_NAME}</div><p class="rank-tag" style="margin-top:8px">Erst bewegen. Dann scrollen.</p>
      <p class="lead" style="margin-top:22px;max-width:300px">Verdiene dir Handyzeit mit Liegestützen, Kniebeugen und mehr. Die Kamera zählt für dich.</p>
      <p class="lead" style="margin-top:10px;max-width:300px">Für alle, die abends zu lange scrollen.</p></div>
      <div class="onb-foot"><button class="btn-grad" type="button" data-act="onb-next">Los geht’s</button></div>`;
  } else if (key === 'name') {
    const nm = (onb.name || '').trim();
    body = `<h2>Wie heißt du?</h2>
      <div class="hello"><span class="hello-a">Hallo</span><span class="hello-n gradtext" id="hello-n">${nm ? ', ' + nm.replace(/[<>&"]/g, '') : '!'}</span></div>
      <label class="fld big"><span class="in-wrap"><input id="onb-name" type="text" maxlength="20" autocomplete="off" autocapitalize="words" placeholder="Dein Name" value="${(onb.name || '').replace(/"/g, '&quot;')}"></span></label>
      <p class="lead under" id="name-hint">Pflichtfeld. Der Name bleibt nur auf deinem Handy.</p>${next('Weiter', !nm)}`;
  } else if (key === 'age') {
    body = `<h2>Wie alt bist du?</h2>${sliderHTML('age', onb.age)}<p class="lead under">Schieb den Regler. Das bleibt nur auf deinem Handy.</p>${next()}`;
  } else if (key === 'theme') {
    const th = S.settings.theme || 'dark';
    body = `<h2>Hell oder dunkel?</h2>
      <div class="themes">${[['dark', 'Dunkel', 'Wald am Abend', 'img/d_main.jpg'], ['light', 'Hell', 'Schneelandschaft', 'img/main.jpg'], ['auto', 'Automatisch', 'Wie dein Handy', '']].map((a) => `<button class="theme-card${th === a[0] ? ' sel' : ''}${a[0] === 'auto' ? ' auto' : ''}" type="button" data-act="onb-theme" data-v="${a[0]}" ${a[3] ? `style="background-image:url('${a[3]}')"` : ''}><span class="tc-tx"><b>${a[1]}</b><span>${a[2]}</span></span><span class="tc-ck">${ICON_CHECK}</span></button>`).join('')}</div>
      <p class="lead under">Du kannst das später in den Einstellungen ändern.</p>${next()}`;
  } else if (key === 'fit') {
    body = `<h2>Wie fit bist du?</h2>${sliderHTML('fit', onb.fit)}<p class="lead under">Daraus ergibt sich dein Tagesziel. Du kannst es später in den Einstellungen ändern. Ehrlich schätzen lohnt sich: Ein zu hohes Ziel frustriert, ein zu niedriges bringt wenig.</p>${next()}`;
  } else if (key === 'ex') {
    body = `<h2>Womit startest du?</h2>
      <div class="extiles">${ST.EXERCISES.map((e) => { const lk = !ST.isUnlocked(S, e); return `<button class="extile${ex === e ? ' sel' : ''}${lk ? ' lockedopt' : ''}" type="button" data-act="${lk ? 'locked-ex' : 'onb-ex'}" data-v="${e}"><span class="et-i">${ICON[e]}</span><b>${ST.EX_LABEL[e]}</b><span class="et-s">${e === 'plank' ? '1 bis 2 P. pro 20 s' : fmt(ST.POINTS_PER_REP[e]) + ' P. pro Wdh.'}</span>${lk ? '<em class="protag">Pro</em>' : ''}</button>`; }).join('')}</div>
      <p class="lead under">${EX_DESC[ex]}. Du kannst jederzeit wechseln, nichts ist Pflicht.</p>${next()}`;
  } else if (key === 'phone') {
    body = `<h2>Wie viel hängst du am Handy?</h2>${sliderHTML('phone', onb.phoneIdx)}<p class="lead under">Schätze es einfach pro Tag. Das ist nur eine Einordnung für dich, die App misst es nicht.</p>${next()}`;
  } else if (key === 'time') {
    body = `<h2>Wie viel Handyzeit ohne Training?</h2>${sliderHTML('timeGoal', onb.timeGoal)}<p class="lead under">So viel Zeit willst du am Tag haben, ohne zu trainieren. Danach sperrt die iPhone-App deine Apps, bis du dir Zeit verdienst. Die Sperre und der Hinweis kurz vor Ende kommen mit der iPhone-App. Die Zahl legst du schon jetzt fest.</p>${next()}`;
  } else if (key === 'plan') {
    const pl = onbPlan();
    const pk = ST.findPackage('p60');
    const mins = ST.minutesForGoal(pl.goal, ex);
    const rph = ST.repsPerHour(ex);
    const what = ex === 'plank' ? `${rph} mal 20 Sekunden Plank` : `${rph} ${ST.EX_LABEL[ex]}`;
    const more = onb.phone === '4to6' || onb.phone === 'gt6' ? ' Du hängst viel am Handy. Du kannst dein Tagesziel später in den Einstellungen erhöhen.' : '';
    const heavy = more ? '<p class="lead under" style="margin-top:12px">' + more.trim() + '</p>' : '';
    body = `<h2>Dein Plan ist bereit</h2>
      <div class="flow">
        <div class="fl glass"><span class="fl-k">Das machst du am Tag</span><b>${pl.goal} ${ex === 'plank' ? 'mal 20 Sekunden Plank' : ST.EX_LABEL[ex]}</b><span class="fl-s">dauert ca. ${pl.mins} Minuten</span></div>
        <div class="fl-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg><span>dafür bekommst du</span></div>
        <div class="fl glass hi"><span class="fl-k">Handyzeit</span><b class="gradtext">ca. ${mins} Minuten</b><span class="fl-s">jeden Tag, den du das schaffst</span></div>
      </div>
      <p class="lead under">So rechnet es sich: Jede Wiederholung bringt Punkte, mit Punkten kaufst du Handyzeit. 1 Stunde kostet ${pk.price} Punkte, also etwa ${what}. Die Trainingszeit ist geschätzt (1 Minute Aufbau plus kurze Pausen).</p>${heavy}${next()}`;
  } else if (key === 'camera') {
    body = `<div class="welcome"><div class="cam-ic">${ICON.pushup}</div><h2 style="margin-top:24px">Die Kamera bleibt bei dir</h2>
      <p class="lead" style="max-width:310px">Das Bild wird nur auf deinem Handy ausgewertet. Es wird nicht gespeichert und nicht hochgeladen.</p>
      <p class="lead" style="max-width:310px;margin-top:14px">Stell das Handy fest auf, etwa 2 bis 3 Meter entfernt. Der ganze Körper muss im Bild sein.</p>
      <button class="btn-text" type="button" data-act="open-how-onb" style="margin-top:6px">So funktioniert die Erkennung</button></div>${next()}`;
  } else {
    body = `<div class="welcome commit"><h2>Bereit?</h2><p class="lead" style="max-width:290px">Halte den Kreis 3 Sekunden gedrückt. Dann geht es los.</p>
      <button id="hold-go" class="holdbtn orb" type="button" style="--hp:0" aria-label="3 Sekunden halten zum Starten">
        <span class="orb-rip"></span><span class="orb-rip"></span><span class="orb-rip"></span>
        <span class="orb-core"><span class="orb-liquid"></span>
          <span class="orb-t idle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6.5 6.5 0 0 1-6.5 6.5h-.8a5.5 5.5 0 0 1-4.3-2.1L4.6 15a1.6 1.6 0 0 1 2.4-2L9 15"/></svg>Halten</span>
          <span class="orb-t cnt" id="orb-cnt">3</span>
          <span class="orb-t go">Los geht’s</span></span>
        <svg class="orb-ring" viewBox="0 0 220 220" aria-hidden="true"><defs><linearGradient id="orbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#C9CED6"/><stop offset="1" stop-color="#F6D77A"/></linearGradient></defs><circle cx="110" cy="110" r="100" class="orb-ring-bg"/><circle cx="110" cy="110" r="100" class="orb-ring-fg" transform="rotate(-90 110 110)"/></svg>
      </button>
      <p class="lead" style="margin-top:22px">Erst bewegen. Dann scrollen.</p></div>`;
  }
  screens.onb.innerHTML = `<div class="bgfx bg-home"></div><div class="onb"><div class="onb-top">${back}${dots}${skip}</div><div class="step${anim ? ' anim' : ''}">${body}</div></div>`;
  glassOn(screens.onb);
}

function finishOnb(skipped) {
  if (!skipped && !(onb.name || '').trim()) { onb.step = ONB_STEPS.indexOf('name'); renderOnb(); toast('Bitte gib deinen Namen ein.'); return; }
  if (!skipped) {
    S.goal = ST.FIT_STEPS[onb.fit].goal;
    S.settings.ex = onb.ex;
    S.settings.phone = onb.phone;
    S.settings.timeGoal = onb.timeGoal;
    S.settings.age = onb.age;
    S.settings.name = (onb.name || '').trim().slice(0, 20);
  }
  S.onboarded = true;
  saveState();
  showScreen('home');
}

document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'onb-name') return;
  onb.name = e.target.value;
  const h = $('hello-n'); const nm = onb.name.trim();
  if (h) h.textContent = nm ? ', ' + nm : '!';
  const nb = $('onb-next-btn');
  if (nb) { nb.disabled = !nm; nb.setAttribute('aria-disabled', String(!nm)); }
});

/* ---------- Gesperrte Übungen ---------- */
function openLocked(e) {
  const P = ST.PRO.PRICES;
  openModal(`<h3>${ST.EX_LABEL[e]} ist gesperrt</h3>
    <p>Gratis sind Liegestütze und Situps. ${ST.EX_LABEL[e]} bekommst du einzeln für ${eur(P.exercise)} pro Monat oder mit Pro zusammen mit allen anderen.</p>
    <div class="row"><button class="btn-grad" type="button" data-act="unlock-ex" data-v="${e}">${eur(P.exercise)} pro Monat</button><button class="btn-text" type="button" data-act="pro-from-modal">Pro ansehen</button><button class="btn-text" type="button" data-act="close-modal">Später</button></div>`);
}

/* ---------- Klicks (zentral) ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-ex],[data-buy],[data-confirm-buy],[data-sel]');
  if (!t) return;
  if (t.dataset.ex) { if (!ST.isUnlocked(S, t.dataset.ex)) { openLocked(t.dataset.ex); return; } S.settings.ex = t.dataset.ex; saveState(); rerenderKeep('home', renderHome); return; }
  if (t.dataset.sel) { selectPkg(t.dataset.sel); return; }
  if (t.dataset.buy) { askBuy(t.dataset.buy); return; }
  if (t.dataset.confirmBuy) { doBuy(t.dataset.confirmBuy); return; }
  switch (t.dataset.act) {
    case 'settings': showScreen('settings'); break;
    case 'back': showScreen('home'); break;
    case 'onb-next': if (ONB_STEPS[onb.step] === 'name' && !(onb.name || '').trim()) { toast('Bitte gib deinen Namen ein.'); const ni = $('onb-name'); if (ni) ni.focus(); break; }
      if (onb.step >= ONB_LAST) finishOnb(false); else { onb.step++; renderOnb(); } break;
    case 'onb-back': if (onb.step > 0) { onb.step--; renderOnb(); } break;
    case 'onb-skip': finishOnb(true); break;
    case 'onb-ex': onb.ex = t.dataset.v; renderOnb(); break;
    case 'locked-ex': openLocked(t.dataset.v); break;
    case 'unlock-ex': closeModal(); toast('Vorschau: der echte Kauf kommt mit der iPhone-App.'); break;
    case 'pro-from-modal': closeModal(); proFrom = run.current; showScreen('pro'); break;
    case 'test-unlock': { const e = t.dataset.v; const i = S.unlockedEx.indexOf(e); if (i >= 0) S.unlockedEx.splice(i, 1); else S.unlockedEx.push(e); saveState(); rerenderKeep('settings', renderSettings); break; }
    case 'onb-theme': S.settings.theme = t.dataset.v; saveState(); applyTheme(); renderOnb(); break;
    case 'open-how-onb': how.from = 'onb'; showScreen('how'); break;
    case 'open-how-settings': how.from = 'settings'; showScreen('how'); break;
    case 'back-how': showScreen(how.from); break;
    case 'redo-onb': onb.step = 0; onb.shown = -1; onb.phoneIdx = ST.PHONE_LEVELS.findIndex((l) => l.id === S.settings.phone); if (onb.phoneIdx < 0) onb.phoneIdx = 2; onb.phone = ST.PHONE_LEVELS[onb.phoneIdx].id; onb.name = S.settings.name || ''; onb.age = S.settings.age || ST.AGE.def; onb.timeGoal = S.settings.timeGoal || ST.TIME_GOAL.def; showScreen('onb'); break;
    case 'go-shop': showScreen('shop'); break;
    case 'start': startTraining(false); break;
    case 'start-practice': startTraining(true); break;
    case 'tut-go': closeModal(); beginTraining(tutPractice); break;
    case 'tut-skip': { const e = S.settings.ex; S.settings.tutDone = S.settings.tutDone || {}; S.settings.tutDone[e] = true; saveState(); closeModal(); beginTraining(tutPractice); break; }
    case 'tut-reset': S.settings.tutDone = {}; saveState(); toast('Anleitungen werden wieder gezeigt'); break;
    case 'close-modal': closeModal(); break;
    case 'goal-up': ST.setGoal(S, S.goal + ST.GOAL_STEP); saveState(); rerenderKeep('settings', renderSettings); break;
    case 'goal-down': {
      if (S.goalDrop) { toast('Das Senken läuft schon. Schaffe erst die Extra-Wiederholungen.'); break; }
      if (S.goal - ST.GOAL_STEP < ST.GOAL_MIN) { toast('Das Tagesziel kann nicht unter ' + ST.GOAL_MIN + ' sinken.'); break; }
      openModal(`<h3>Ziel auf ${S.goal - ST.GOAL_STEP} senken?</h3><p>Dafür musst du ${ST.GOAL_DROP_REPS} Extra-Wiederholungen schaffen, egal welche Übung. Danach gilt das neue Ziel.</p><div class="row"><button class="btn-grad" type="button" data-act="goal-drop-yes">Okay, ich mache es</button><button class="btn-text" type="button" data-act="close-modal">Abbrechen</button></div>`);
      break;
    }
    case 'goal-drop-yes': { const r = ST.requestGoalDrop(S); closeModal(); saveState(); rerenderKeep('settings', renderSettings); if (r.ok) toast('Schaffe ' + ST.GOAL_DROP_REPS + ' Extra-Wiederholungen'); break; }
    case 'goal-drop-cancel': ST.cancelGoalDrop(S); saveState(); rerenderKeep('settings', renderSettings); break;
    case 'warn-preview': toast('Vorschau: Noch ca. 5 Minuten von deinen ' + fmtMin(S.settings.timeGoal || ST.TIME_GOAL.def) + '.'); break;
    case 'open-lock': showScreen('lock'); break;
    case 'open-pro': proFrom = run.current; showScreen('pro'); break;
    case 'back-pro': showScreen(proFrom && proFrom !== 'pro' ? proFrom : 'settings'); break;
    case 'back-settings': showScreen('settings'); break;
    case 'lock-use': toast('Vorschau: hier würde die App für ein paar Minuten freigeschaltet.'); break;
    case 'pro-plan': proPlan = t.dataset.v; rerenderKeep('pro', renderPro); break;
    case 'pro-buy':
      if (proPlan !== 'once' && ST.startTrialPreview(S, now())) { saveState(); toast('Vorschau: hier würde die Gratis-Woche starten. Sie gibt es nur einmal.'); rerenderKeep('pro', renderPro); }
      else toast('Vorschau: der echte Kauf kommt mit der iPhone-App.');
      break;
    case 'trial-reset': S.trialStartedAt = 0; saveState(); toast('Gratis-Woche zurückgesetzt'); break;
    case 'pro-link': toast('Vorschau: Text folgt mit der iPhone-App.'); break;
    case 'theme': S.settings.theme = t.dataset.v; saveState(); applyTheme(); rerenderKeep('settings', renderSettings); break;
    case 'toggle-sound': S.settings.sound = !S.settings.sound; saveState(); rerenderKeep('settings', renderSettings); if (S.settings.sound) { ensureAudio(); beep(660, 0.08, 0.2); } break;
    case 'setup-go': if (run.setupDone) run.setupDone('manual'); break;
    case 'toggle-shield': if (!ST.isPro(S)) { toast('Nur mit Pro. Zum Testen: "Pro simulieren" unter Nur für den Test.'); break; } S.settings.shield = !S.settings.shield; { const k = ST.applyShield(S, now()); if (k) toast('Streak-Schutztag hat gestern gerettet'); } saveState(); rerenderKeep('settings', renderSettings); break;
    case 'toggle-protest': S.settings.proTest = !S.settings.proTest; saveState(); rerenderKeep('settings', renderSettings); break;
    case 'toggle-debug': S.settings.debug = !S.settings.debug; saveState(); rerenderKeep('settings', renderSettings); break;
    case 'cam-user': S.settings.facing = 'user'; saveState(); rerenderKeep('settings', renderSettings); break;
    case 'cam-env': S.settings.facing = 'environment'; saveState(); rerenderKeep('settings', renderSettings); break;
    case 'export': exportData(); break;
    case 'test-points': S.points = Math.round((S.points + 100) * 100) / 100; saveState(); toast('+100 Punkte'); rerenderKeep('settings', renderSettings); break;
    case 'test-spend': {
      const used = ST.spendMinutes(S, 5, now()); saveState();
      toast(used > 0 ? used + ' Min verbraucht' : 'Keine Handyzeit vorhanden.');
      break;
    }
    case 'reset':
      openModal('<h3>Alles löschen?</h3><p>Punkte, Rang, Streak und gekaufte Zeit werden zurückgesetzt. Das lässt sich nicht rückgängig machen.</p><div class="row"><button class="btn-grad" type="button" data-act="reset-yes">Alles löschen</button><button class="btn-text" type="button" data-act="close-modal">Abbrechen</button></div>');
      break;
    case 'reset-yes': S = ST.defaultState(); saveState(); closeModal(); toast('Zurückgesetzt'); rerenderKeep('settings', renderSettings); break;
    case 'done-shop': showScreen('shop'); break;
    case 'done-home': showScreen('home'); break;
    case 'done-again': startTraining(false); break;
    default: break;
  }
});
document.addEventListener('keydown', (e) => {
  const c = e.target.closest && e.target.closest('.pcard[data-sel]');
  if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectPkg(c.dataset.sel); }
});
$('btn-close').addEventListener('click', () => abortToHome());
$('btn-end').addEventListener('click', () => finish('manual'));
$('btn-err-back').addEventListener('click', () => abortToHome());
$('btn-sound').addEventListener('click', () => { S.settings.sound = !S.settings.sound; saveState(); syncSoundBtn(); if (S.settings.sound) beep(660, 0.08, 0.2); });
function syncSoundBtn() {
  $('btn-sound').setAttribute('aria-pressed', String(S.settings.sound));
  $('btn-sound').style.opacity = S.settings.sound ? '1' : '0.5';
}

/* ---------- Ton und Rückmeldung ---------- */
let audioCtx = null;
function ensureAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* kein Ton möglich */ }
}
function beep(freq, dur, vol) {
  if (!S.settings.sound) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (e) { /* ignorieren */ }
}
function beepOk() { beep(740, 0.1, 0.25); setTimeout(() => beep(990, 0.14, 0.25), 110); }
function repFeedback(isPlank) {
  beep(isPlank ? 520 : 880, isPlank ? 0.35 : 0.14, 0.35);
  // Vibration gibt es nur auf Android-Browsern, nicht im iPhone-Safari.
  try { if (navigator.vibrate) navigator.vibrate(isPlank ? [60, 40, 60] : 35); } catch (e) { /* ignorieren */ }
  els.flash.classList.add('pulse');
  setTimeout(() => els.flash.classList.remove('pulse'), 160);
  [els.count, els.chip].forEach((n) => { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); });
}

/* ---------- Kamera und Erkennung ---------- */
function showOverlay(which) {
  els.ovLoading.classList.toggle('show', which === 'loading');
  els.ovCountdown.classList.toggle('show', which === 'countdown');
  els.ovSetup.classList.toggle('show', which === 'setup');
  els.ovError.classList.toggle('show', which === 'error');
}
function showError(title, text) {
  run.mode = 'idle';
  els.errTitle.textContent = title;
  els.errText.textContent = text;
  showOverlay('error');
}

async function openCamera(deviceId, facing) {
  const face = facing || S.settings.facing;
  stopCamera();
  const base = { width: { ideal: 1280 }, height: { ideal: 960 } };
  let stream = null;
  if (deviceId) {
    stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, base, { deviceId: { exact: deviceId } }), audio: false });
  } else {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, base, { facingMode: { exact: face } }), audio: false });
    } catch (e) {
      if (e && e.name === 'NotAllowedError') throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, base, { facingMode: face }), audio: false });
    }
    // Falls das Handy die falsche Kamera liefert: über die Gerätenamen nachsteuern
    try {
      const t = stream.getVideoTracks()[0];
      const want = face === 'user' ? /front|user|vorder|facetime/i : /back|rear|rück|environment/i;
      const s = t.getSettings ? t.getSettings() : {};
      const mismatch = s.facingMode && s.facingMode !== face;
      if (mismatch) {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        const d = devs.find((x) => want.test(x.label) && !/ultra|tele/i.test(x.label));
        if (d) {
          stream.getTracks().forEach((x) => x.stop());
          stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, base, { deviceId: { exact: d.deviceId } }), audio: false });
        }
      }
    } catch (e) { /* bleibt bei der gelieferten Kamera */ }
  }
  run.stream = stream;
  els.video.srcObject = stream;
  els.stage.classList.toggle('mirror', face === 'user' && !deviceId);
  await els.video.play();
}
/* ---------- Zoom 0,5× / 1× / 2× ---------- */
function markZoom(z) {
  if (z === 0.5) showZoomTip(false);
  els.zoombar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.z) === z));
}
async function findBackLens(kind) {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const re = kind === 'wide' ? /ultra/i : /tele/i;
    const d = devs.find((x) => re.test(x.label));
    return d ? d.deviceId : null;
  } catch (e) { return null; }
}
// Zoom bleibt immer auf der Kamera, die gerade läuft (Front bleibt Front, Rück bleibt Rück).
async function applyZoom(z) {
  if (!run.stream) return;
  const prev = run.zoom || 1;
  const face = S.settings.facing;
  const track = run.stream.getVideoTracks()[0];
  let caps = {};
  try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
  const hw = caps.zoom && z >= caps.zoom.min && z <= caps.zoom.max;
  try {
    if (hw) {
      els.stage.style.setProperty('--dz', '1');
      await track.applyConstraints({ advanced: [{ zoom: z }] });
    } else if (z < 1) {
      if (face === 'user') { toast('Die Frontkamera hat kein 0,5×. Geh einfach einen Schritt weiter weg.'); markZoom(prev); return; }
      const id = await findBackLens('wide');
      if (!id) { toast('0,5× gibt es bei diesem Handy nicht. Geh einen Schritt weiter weg.'); markZoom(prev); return; }
      els.stage.style.setProperty('--dz', '1');
      await openCamera(id, 'environment'); run.lastVideoTime = -1; run.altLens = true;
    } else {
      if (run.altLens) { await openCamera(); run.lastVideoTime = -1; run.altLens = false; }
      els.stage.style.setProperty('--dz', String(z));
    }
    run.zoom = z; markZoom(z);
  } catch (e) { toast('Zoom nicht möglich.'); markZoom(prev); }
}
els.zoombar.addEventListener('click', async (e) => {
  const f = e.target.closest('button[data-flip]');
  if (f) {
    S.settings.facing = S.settings.facing === 'user' ? 'environment' : 'user';
    saveState();
    try { await openCamera(); run.lastVideoTime = -1; run.zoom = 1; run.altLens = false; markZoom(1); els.stage.style.setProperty('--dz', '1'); toast(S.settings.facing === 'user' ? 'Frontkamera' : 'Rückkamera'); }
    catch (err) { toast('Kamera lässt sich nicht wechseln.'); }
    return;
  }
  const b = e.target.closest('button[data-z]');
  if (b) applyZoom(Number(b.dataset.z));
});

function stopCamera() {
  if (run.stream) { run.stream.getTracks().forEach((t) => t.stop()); run.stream = null; }
  els.video.srcObject = null;
}

async function loadLandmarker() {
  if (run.landmarker) return;
  const mod = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await mod.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const make = (delegate, url) => mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: url, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.4
  });
  const tries = [['GPU', MODEL_URL], ['CPU', MODEL_URL], ['GPU', MODEL_URL_LITE], ['CPU', MODEL_URL_LITE]];
  let lastErr = null;
  for (const [d, u] of tries) {
    try { run.landmarker = await make(d, u); run.modelInfo = (u === MODEL_URL ? 'full' : 'lite') + '/' + d; return; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function requestWakeLock() {
  try { if (navigator.wakeLock) run.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignorieren */ }
}
function releaseWakeLock() {
  try { if (run.wakeLock) run.wakeLock.release(); } catch (e) { /* ignorieren */ }
  run.wakeLock = null;
}

/* ---------- Ablauf ---------- */
/* ---------- Anleitung vor jeder Übung ---------- */
const TUT_TEXT = {
  pushup: 'Lehne das Handy flach an etwas auf den Boden, 2 bis 3 m von dir entfernt. Geh schräg zur Kamera in die Liegestütz-Position, damit beide Arme zu sehen sind. Geh runter, bis die Ellbogen etwa 90° haben, und drück dich ganz hoch.',
  squat: 'Stell das Handy auf Hüfthöhe, 2 bis 3 m entfernt. Stell dich von vorn oder leicht schräg hin, Kopf bis Fuß im Bild. Geh in die Hocke, bis die Oberschenkel fast waagerecht sind, und steh ganz auf.',
  situp: 'Lehne das Handy seitlich neben dich auf den Boden, 1,5 bis 2 m entfernt. Leg dich mit angewinkelten Knien hin, Kopf, Hüfte und Knie im Bild. Komm mit dem Oberkörper ganz hoch und leg dich wieder ab.',
  plank: 'Lehne das Handy seitlich schräg auf den Boden, 2 m entfernt. Stütz dich auf die Unterarme, Körper in einer geraden Linie, Kopf bis Füße im Bild. Halte die Position so lange wie möglich.'
};
function tutSvg(ex) {
  const D = 2.6;
  const anim = (a, v) => `<animate attributeName="${a}" values="${v[0]};${v[1]};${v[0]}" keyTimes="0;.5;1" dur="${D}s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .2 1;.4 0 .2 1"/>`;
  // Punkt = [x_oben, y_oben, x_unten, y_unten]
  const seg = (p, q, w) => {
    const c = (n, i) => { const a = (n === 1 ? p : q); return a; };
    let out = `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke-width="${w || 6}">`;
    if (p[0] !== p[2]) out += anim('x1', [p[0], p[2]]);
    if (p[1] !== p[3]) out += anim('y1', [p[1], p[3]]);
    if (q[0] !== q[2]) out += anim('x2', [q[0], q[2]]);
    if (q[1] !== q[3]) out += anim('y2', [q[1], q[3]]);
    return out + '</line>';
  };
  const head = (p) => `<circle cx="${p[0]}" cy="${p[1]}" r="8" class="hd">${p[0] !== p[2] ? anim('cx', [p[0], p[2]]) : ''}${p[1] !== p[3] ? anim('cy', [p[1], p[3]]) : ''}</circle>`;
  let fig = '', label = '';
  if (ex === 'pushup') {
    const H = [160, 138, 160, 138], F = [285, 138, 285, 138];
    const S = [163, 100, 157, 124], E = [165, 119, 176, 129];
    fig = seg(F, S) + seg(S, E, 5) + seg(E, H, 5) + head([147, 95, 141, 127]);
    label = 'Schräg zur Kamera';
  } else if (ex === 'squat') {
    const A = [230, 138, 230, 138], K = [232, 108, 250, 114], P = [230, 76, 221, 116], S = [230, 38, 210, 80];
    fig = seg(A, K) + seg(K, P) + seg(P, S) + seg(S, [258, 40, 238, 84], 5) + head([230, 26, 206, 69]);
    label = 'Ganz im Bild';
  } else if (ex === 'situp') {
    const F = [250, 138, 250, 138], K = [225, 104, 225, 104], P = [200, 134, 200, 134], S = [187, 86, 148, 134];
    fig = seg(F, K) + seg(K, P) + seg(P, S) + seg(S, [213, 92, 160, 127], 5) + head([184, 74, 134, 132]);
    label = 'Seitlich zur Kamera';
  } else {
    const F = [290, 136, 290, 136], S = [160, 106, 160, 106], E = [160, 136, 160, 136];
    fig = seg(F, S) + seg(S, E, 5) + seg(E, [128, 136, 128, 136], 5) + head([146, 100, 146, 100])
      + `<line x1="130" y1="96" x2="298" y2="130" class="gd" stroke-width="2" stroke-dasharray="4 5"><animate attributeName="opacity" values=".25;.9;.25" dur="${D}s" repeatCount="indefinite"/></line>`;
    label = 'Gerade Linie halten';
  }
  return `<svg viewBox="0 0 320 176" role="img" aria-label="Animation: Handy-Position und Übung">
    <line x1="0" y1="140" x2="320" y2="140" class="fl"/>
    <polygon points="32,124 310,34 310,150" class="cone"/>
    <g transform="rotate(-10 22 126)"><rect x="14" y="108" width="16" height="32" rx="4" class="ph"/><circle cx="22" cy="113" r="1.8" class="lens"/></g>
    <g class="fg" stroke-linecap="round" fill="none">${fig}</g>
    <line x1="34" y1="158" x2="200" y2="158" class="ar"/><text x="117" y="172" text-anchor="middle" class="tx">Handy ca. ${ex === 'situp' ? '1,5 bis 2' : (ex === 'plank' ? '2' : '2 bis 3')} m entfernt</text>
    <text x="312" y="14" text-anchor="end" class="tx">${label}</text>
  </svg>`;
}
let tutPractice = false;
let tut3d = null;
const TUT_LABEL = { pushup: 'Schräg zur Kamera', squat: 'Ganz im Bild', situp: 'Seitlich zur Kamera', plank: 'Gerade Linie halten' };
function startTraining(practice) {
  const ex = S.settings.ex;
  if (!ST.isUnlocked(S, ex)) { S.settings.ex = 'pushup'; saveState(); openLocked(ex); return; }
  if (S.settings.tutDone && S.settings.tutDone[ex]) { beginTraining(practice); return; }
  tutPractice = practice === true;
  openModal(`<h3>${GC.LABELS[ex]}: So geht's</h3>
    <p>${TUT_TEXT[ex]}</p>
    <div class="tut-vid">${tutSvg(ex)}</div>
    <div class="tut-btns"><button class="btn-grad" type="button" data-act="tut-go">Okay, los geht's</button><button class="btn-text" type="button" data-act="tut-skip">Ich hab's verstanden, nie wieder anzeigen</button></div>`);
  const vid = els.modal.querySelector('.tut-vid');
  try {
    if (window.Tut3D && vid) {
      const dist = ex === 'situp' ? '1,5 bis 2' : (ex === 'plank' ? '2' : '2 bis 3');
      tut3d = window.Tut3D.mount(vid, ex, { caption: 'Handy ca. ' + dist + ' m entfernt', label: TUT_LABEL[ex] });
    }
  } catch (e) { tut3d = null; }
  const sv = els.modal.querySelector('.tut-vid svg');
  if (!tut3d && sv && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && sv.pauseAnimations) sv.pauseAnimations();
}

async function beginTraining(practice) {
  run.practice = practice === true;
  const token = ++run.token;
  const ex = S.settings.ex;
  ensureAudio();

  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    openModal('<h3>Kamera nicht möglich</h3><p>Die Kamera braucht eine sichere Verbindung (https://). Öffne die Seite über den Link der Veröffentlichung, nicht als Datei.</p><div class="row"><button class="btn-grad" type="button" data-act="close-modal">Okay</button></div>');
    return;
  }

  run.mode = 'loading';
  run.counter = null;
  run.log = null;
  showZoomTip(false);
  run.lastVideoTime = -1;
  els.pillText.textContent = run.practice ? 'Kamera-Training' : GC.LABELS[ex];
  els.dot.classList.remove('warn');
  els.gauge.style.display = 'flex';
  syncSoundBtn();
  renderIdle();
  showScreen('train');
  showOverlay('loading');
  els.loadingText.textContent = 'Kamera wird gestartet …';
  run.zoom = 1; run.altLens = false; markZoom(1); els.stage.style.setProperty('--dz', '1');

  try {
    await openCamera();
  } catch (e) {
    if (token !== run.token) return;
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      showError('Kamera nicht erlaubt', 'Erlaube den Kamerazugriff für diese Seite (iPhone: Einstellungen › Safari › Kamera) und lade die Seite neu.');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      showError('Keine Kamera gefunden', 'Probiere die andere Kamera (Front oder Rück) in den Einstellungen.');
    } else {
      showError('Kamera startet nicht', 'Schließe andere Apps, die die Kamera nutzen, und versuche es noch einmal.');
    }
    return;
  }
  if (token !== run.token) return;

  els.loadingText.textContent = 'Erkennung wird geladen … Beim ersten Mal kann das ein paar Sekunden dauern.';
  try {
    await loadLandmarker();
  } catch (e) {
    if (token !== run.token) return;
    stopCamera();
    showError('Erkennung nicht geladen', 'Die Pose-Erkennung konnte nicht geladen werden. Prüfe dein Internet und versuche es noch einmal.' + (e && e.message ? '\n(' + e.message + ')' : ''));
    return;
  }
  if (token !== run.token) return;

  requestWakeLock();
  const TIPS = GC.SETUP;
  const tip = $('cd-tip'); if (tip) tip.textContent = TIPS[ex] || '';
  // Erst Aufbau prüfen: Haken für Körper, Abstand, Licht. Weiter bei allen grün oder mit "Trotzdem starten".
  ['sc-body', 'sc-dist', 'sc-light'].forEach((id) => $(id).classList.remove('ok'));
  $('sc-tip').textContent = '';
  run.setupSince = 0;
  showOverlay('setup');
  run.mode = 'setup';
  run.fpsStart = performance.now();
  run.fpsFrames = 0;
  requestAnimationFrame(loop);
  await new Promise((res) => { run.setupDone = res; });
  run.setupDone = null;
  if (token !== run.token) return;

  showOverlay('countdown');
  run.mode = 'countdown';
  for (let n = ST.countdownSeconds(S); n >= 1; n--) {
    els.cdNum.textContent = String(n);
    beep(600, 0.1, 0.25);
    await new Promise((r) => setTimeout(r, 1000));
    if (token !== run.token) return;
  }
  beep(1000, 0.3, 0.35);
  showOverlay('none');
  run.counter = GC.createCounter(ex, performance.now());
  run.log = newLog();
  run.lastLm = null; run.lastWorld = null; run.lastLmT = 0;
  showZoomTip(false);
  run.mode = 'running';
}

function renderIdle() {
  const ex = S.settings.ex;
  const isPlank = ex === 'plank';
  els.count.textContent = '0';
  els.countLabel.textContent = isPlank ? 'Sekunden' : 'Wiederholungen';
  els.chip.textContent = run.practice ? 'Ohne Punkte' : '+0 Punkte';
  els.hintTitle.textContent = 'Bereit.';
  els.hintSub.textContent = GC.SUBTEXT[ex];
  els.gaugeLabel.textContent = isPlank ? '20 s' : '–';
  els.gaugeFill.style.height = '0%';
  els.gaugeFill.classList.remove('full');
  clearCanvas();
}

function abortToHome() {
  run.token++;
  if (run.setupDone) run.setupDone('abort');
  run.mode = 'idle';
  stopCamera();
  releaseWakeLock();
  showOverlay('none');
  showScreen('home');
}

function finish(reason) {
  if (run.mode !== 'running' && run.mode !== 'countdown') { abortToHome(); return; }  // im Aufbau-Check ('setup') ist noch nichts gezählt
  const c = run.counter;
  const ex = S.settings.ex;
  const reps = c ? c.reps() : 0;
  const secs = c ? c.plankSeconds() : 0;
  run.token++;
  if (run.setupDone) run.setupDone('abort');
  run.mode = 'idle';
  stopCamera();
  releaseWakeLock();
  showOverlay('none');
  beep(440, 0.4, 0.3);

  if (run.practice) {
    run.practice = false;
    showScreen('home');
    toast(ex === 'plank' ? `Kamera-Training: ${secs} Sekunden erkannt (ohne Punkte)` : `Kamera-Training: ${reps} Wiederholungen erkannt (ohne Punkte)`);
    return;
  }
  // Ergebnis gutschreiben und speichern
  const sum = ST.addSession(S, ex, reps, secs, now());
  saveState();
  run.summary = { sum: sum, ex: ex, secs: secs, reason: reason, log: c ? run.log : null };
  renderDone();
  showScreen('done');
}

/* ---------- Abschluss ---------- */
function renderDone() {
  const { sum, ex, secs, reason, log } = run.summary;
  const info = sum.rankAfter;
  const frac = Math.max(0, Math.min(1, sum.todayReps / Math.max(1, sum.goal)));
  const C = 741.4;
  let status;
  if (sum.reps === 0) status = '<p class="st">Keine Wiederholung gezählt. Prüfe Aufbau und Licht und versuche es noch einmal.</p>';
  else if (sum.rankUp) status = `<p class="st gold">Neuer Rang: ${info.name}!</p>`;
  else if (sum.goalLowered) status = `<p class="st gold">Tagesziel gesenkt auf ${sum.goal}</p>`;
  else if (sum.goalJustMet) status = `<p class="st">Tagesziel geschafft · Streak ${sum.streak} ${sum.streak === 1 ? 'Tag' : 'Tage'}</p>`;
  else if (sum.goalMet) status = `<p class="st">Tagesziel schon geschafft · Streak ${sum.streak} ${sum.streak === 1 ? 'Tag' : 'Tage'}</p>`;
  else status = `<p class="st">Noch ${Math.max(0, sum.goal - sum.todayReps)} bis zum Tagesziel</p>`;

  const notes = [];
  if (log && ex !== 'plank') {
    const no = log.shallow + log.notfull + log.fast;
    const why = [];
    if (log.shallow) why.push(`${log.shallow} ${ex === 'situp' ? 'nicht hoch genug' : 'zu flach'}`);
    if (log.notfull) why.push(`${log.notfull} nicht ganz oben`);
    if (log.fast) why.push(`${log.fast} zu schnell`);
    notes.push(`<b style="color:var(--text)">${sum.reps} gezählt, ${no} nicht gezählt</b>${why.length ? ': ' + why.join(', ') : ''}.`);
  }
  if (log && log.frames >= 90 && log.pose / log.frames < 0.85) notes.push(`Die Erkennung hat dich nur in ${Math.round(log.pose / log.frames * 100)} % der Bilder gesehen. Mehr Licht von vorn, ganzer Körper im Bild und etwas mehr Abstand helfen.`);
  if (ex === 'plank') notes.push(`${secs} Sekunden gehalten (20 Sekunden = 1 Wiederholung).`);
  const gdp = ST.goalDropProgress(S);
  if (gdp) notes.push(`Noch ${gdp.left} Wiederholungen, dann sinkt dein Tagesziel auf ${gdp.to}.`);
  if (reason === 'idle') notes.push('Beendet: 20 Sekunden ohne Bewegung.');
  if (reason === 'lost') notes.push('Beendet: Haltung nicht mehr erkannt.');

  const party = (sum.rankUp || sum.goalJustMet) && sum.reps > 0 && !REDUCE;
  let conf = '';
  if (party) {
    const cols = ['#F6D77A', '#FFFFFF', '#C9CED6', '#F5A445'];
    for (let i = 0; i < 40; i++) conf += `<i style="left:${Math.round(Math.random() * 100)}%;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.6).toFixed(2)}s"></i>`;
  }

  screens.done.innerHTML = `
    <div class="bgfx bg-done">${rings(195)}<div class="cloud"></div></div>
    ${party ? `<div class="confetti" aria-hidden="true">${conf}</div>` : ''}
    <div class="done-wrap">
      <p class="done-label">Geschafft · ${ST.EX_LABEL[ex]}</p>
      <div class="ring rv">
        <svg viewBox="0 0 250 250" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C9CED6"/><stop offset="1" stop-color="#F6D77A"/></linearGradient></defs>
          <circle cx="125" cy="125" r="118" fill="none" stroke="rgba(var(--w),.1)" stroke-width="8"/>
          <circle cx="125" cy="125" r="118" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 ${C}" data-dash="${(frac * C).toFixed(1)} ${C}" transform="rotate(-90 125 125)"/></svg>
        <div class="ring-num gradtext">${cnt(sum.reps)}</div>
        <div class="ring-sub">Wiederholungen</div>
      </div>
      <div class="pchip done-chip rv" style="--d:.2s">+${cnt(sum.earned, fmt(sum.earned))} Punkte</div>
      <div class="done-stats rv" style="--d:.3s">
        <div class="total glass"><b>${sum.todayReps}</b><span>Heute gesamt</span></div>
        <div class="total glass"><b>${sum.streak}</b><span>${sum.streak === 1 ? 'Tag' : 'Tage'} Streak</span></div>
        <div class="total glass"><b>${fmtP(S.points)}</b><span>Punkte jetzt</span></div>
      </div>
      <div class="done-rank rv" style="--d:.4s">
        <div class="r1"><b>Rang ${info.name}</b><span>${info.next ? `Noch ${info.toNext} bis ${info.next}` : 'Höchster Rang'}</span></div>
        ${segmentsHTML(info)}
        ${status}
        ${notes.length ? `<p class="st" style="color:var(--muted)">${notes.join('<br>')}</p>` : ''}
      </div>
      <div class="done-actions rv" style="--d:.5s">
        <button class="btn-grad" type="button" data-act="done-shop">Im Shop einlösen</button>
        <button class="btn-text" type="button" data-act="done-home">Zurück zum Training</button>
      </div>
    </div>`;
  screens.done.classList.remove('noanim');
  setupMotion(screens.done);
  glassOn(screens.done);
}

/* ---------- Bild aufhellen (dunkle Kleidung, dunkler Raum) ---------- */
// Dunkle Kleidung vor dunklem Hintergrund erkennt das Modell schlecht, besonders Knie und Füße.
// Darum werden die Schatten vor der Erkennung angehoben. Das Bild auf dem Bildschirm bleibt unverändert.
const enh = { c: document.createElement('canvas'), x: null, lut: new Uint8ClampedArray(256), gamma: 1, n: 0, ok: true };
function setGamma(g) {
  enh.gamma = g;
  for (let i = 0; i < 256; i++) {
    const a = Math.pow(i / 255, g);                       // Schatten anheben
    enh.lut[i] = Math.max(0, Math.min(255, (a - 0.5) * 1.12 * 255 + 127.5)); // leichter Kontrast
  }
}
setGamma(0.8);
function frameForModel(v) {
  if (!enh.ok) return v;
  try {
    const W = 480, H = Math.max(2, Math.round(W * v.videoHeight / v.videoWidth));
    if (enh.c.width !== W || enh.c.height !== H) { enh.c.width = W; enh.c.height = H; enh.x = enh.c.getContext('2d', { willReadFrequently: true }); }
    enh.x.drawImage(v, 0, 0, W, H);
    const im = enh.x.getImageData(0, 0, W, H), d = im.data;
    if (enh.n++ % 12 === 0) {
      let sum = 0, c = 0;
      for (let i = 0; i < d.length; i += 96) { sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; c++; }
      const luma = sum / c;
      const g = luma < 60 ? 0.52 : luma < 90 ? 0.62 : luma < 120 ? 0.72 : luma < 150 ? 0.82 : 0.9;
      if (g !== enh.gamma) setGamma(g);
      run.luma = Math.round(luma);
    }
    const L = enh.lut;
    for (let i = 0; i < d.length; i += 4) { d[i] = L[d[i]]; d[i + 1] = L[d[i + 1]]; d[i + 2] = L[d[i + 2]]; }
    enh.x.putImageData(im, 0, 0);
    return enh.c;
  } catch (e) { enh.ok = false; return v; }
}

/* ---------- Aufbau-Check vor dem Countdown ---------- */
const LIGHT_MIN = 55;      // mittlere Helligkeit (0 bis 255) ab der "Licht ok" gilt. Schätzwert, nicht an vielen Handys geprüft.
const SETUP_OK_MS = 1000;  // so lange müssen alle Haken grün sein
function setupChecks(lm, ex) {
  // framing() aus counter.js sagt, was im Bild fehlt. null = alles in Ordnung.
  const f = lm ? GC.framing(ex, lm) : { title: 'Ich sehe dich nicht.', sub: '' };
  const bodyOk = !!lm && (f === null || f.soft === true);   // 'Zu nah' und 'Zu weit weg' sind nur weiche Hinweise
  const distOk = !!lm && f === null;
  const lightOk = run.luma === undefined ? false : run.luma >= LIGHT_MIN;
  return { body: bodyOk, dist: distOk, light: lightOk, tip: f && f.title ? f.title + ' ' + f.sub : '' };
}
function updateSetup(lm, t) {
  const c = setupChecks(lm, S.settings.ex);
  const set = (id, on) => { const el = $(id); if (el) el.classList.toggle('ok', on); };
  set('sc-body', c.body); set('sc-dist', c.dist); set('sc-light', c.light);
  const tip = $('sc-tip');
  if (tip) tip.textContent = !c.light && run.luma !== undefined ? 'Zu dunkel. Mach mehr Licht an, am besten von vorn.' : c.tip;
  const all = c.body && c.dist && c.light;
  if (all) { if (!run.setupSince) run.setupSince = t; if (t - run.setupSince >= SETUP_OK_MS && run.setupDone) run.setupDone('ready'); }
  else run.setupSince = 0;
}

/* ---------- Erkennungsschleife ---------- */
function loop() {
  if (run.mode !== 'setup' && run.mode !== 'countdown' && run.mode !== 'running') return;
  const v = els.video;
  if (v.readyState >= 2 && v.currentTime !== run.lastVideoTime && v.videoWidth > 0) {
    run.lastVideoTime = v.currentTime;
    const t = performance.now();
    let lm = null, world = null;
    try {
      const res = run.landmarker.detectForVideo(frameForModel(v), t);
      lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
      world = res && res.worldLandmarks && res.worldLandmarks[0] ? res.worldLandmarks[0] : null;
    } catch (e) { lm = null; }

    // Kurze Aussetzer (unter 0,35 s) überbrücken: letztes Bild weiterverwenden, damit eine Wiederholung nicht an einem verlorenen Bild scheitert.
    if (run.mode === 'running' && run.log) {
      run.log.frames++;
      if (lm) { run.log.pose++; run.lastLm = lm; run.lastWorld = world; run.lastLmT = t; }
      else if (run.lastLm && t - run.lastLmT < 350) { lm = run.lastLm; world = run.lastWorld; }
    }
    run.fpsFrames++;
    if (t - run.fpsStart >= 1000) { run.fps = run.fpsFrames; run.fpsFrames = 0; run.fpsStart = t; }

    let out = null;
    if (run.mode === 'running' && run.counter) {
      out = lm ? run.counter.process(lm, { w: v.videoWidth, h: v.videoHeight }, t, world) : run.counter.noPose(t);
    }
    if (run.mode === 'setup') updateSetup(lm, t);
    drawSkeleton(lm);
    if (out) applyOutput(out);
    renderDebug(out, !!lm);
  }
  requestAnimationFrame(loop);
}

function applyOutput(out) {
  const ex = S.settings.ex;
  const isPlank = ex === 'plank';
  const earned = Math.round(ST.earnedFor(S, ex, out.reps) * 10) / 10;
  els.count.textContent = String(isPlank ? out.plankSeconds : out.reps);
  els.chip.textContent = run.practice ? 'Ohne Punkte' : '+' + fmt(earned) + ' Punkte';
  els.hintTitle.textContent = out.hint.title;
  els.hintSub.textContent = out.hint.sub;
  els.dot.classList.toggle('warn', !out.ok);
  els.hudBottom.classList.toggle('alert', !out.ok);

  if (isPlank) {
    els.gaugeLabel.textContent = '20 s';
    els.gaugeFill.style.height = Math.round(out.depth * 100) + '%';
    els.gaugeFill.classList.remove('full');
  } else {
    const a = out.angle;
    els.gaugeLabel.textContent = (a === null || a === undefined || isNaN(a)) ? '–' : Math.round(out.depth * 100) + ' %';
    els.gaugeFill.style.height = Math.round(out.depth * 100) + '%';
    els.gaugeFill.classList.toggle('full', out.depth >= 1);
  }

  trackHints(out, isPlank);
  if (out.event === 'rep') repFeedback(isPlank);
  if (out.ended) finish(out.ended);
}

/* Liest nur, was counter.js schon als Hinweis liefert. Die Zähl-Logik bleibt unberührt. */
const SIZE_HINTS = ['Zu nah.', 'Knie nicht im Bild.', 'Füße nicht im Bild.'];
const SIZE_HITS_FOR_TIP = 3;
function newLog() { return { shallow: 0, notfull: 0, fast: 0, hint: null, title: '', sizeHits: 0, frames: 0, pose: 0 }; }
function trackHints(out, isPlank) {
  const log = run.log;
  if (!log || !out.hint) return;
  const h = out.hint;
  // Urteile kommen einmal pro verworfener Wiederholung als neuer Hinweis
  if (h !== log.hint) {
    log.hint = h;
    if (!isPlank && /zählt nicht/.test(h.sub || '')) {
      if (h.title === 'Tiefer.' || h.title === 'Höher.') log.shallow++;
      else if (h.title === 'Langsamer.') log.fast++;
      else if (GC.NOTFULL[S.settings.ex] && h.title === GC.NOTFULL[S.settings.ex].t) log.notfull++;
    }
  }
  // Aufbau-Hinweise kommen jedes Bild neu, darum zählt nur der Wechsel auf so einen Titel
  const isSize = SIZE_HINTS.indexOf(h.title) >= 0;
  if (isSize && SIZE_HINTS.indexOf(log.title) < 0) {
    log.sizeHits++;
    if (log.sizeHits >= SIZE_HITS_FOR_TIP) showZoomTip(true);
  }
  log.title = h.title;
}
function showZoomTip(on) {
  const tip = $('zoomtip');
  if (!tip) return;
  const front = S.settings.facing === 'user';
  const already = (run.zoom || 1) === 0.5;
  const show = on && !already;
  tip.hidden = !show;
  tip.textContent = front ? 'Enger Raum? Probier die Rückkamera mit 0,5×' : 'Enger Raum? Probier 0,5×';
  const target = front ? els.zoombar.querySelector('[data-flip]') : els.zoombar.querySelector('[data-z="0.5"]');
  els.zoombar.querySelectorAll('button').forEach((b) => b.classList.toggle('nudge', show && b === target));
}

function renderDebug(out, hasPose) {
  els.debug.classList.toggle('show', !!S.settings.debug);
  if (!S.settings.debug) return;
  const f = (x) => (x === null || x === undefined || isNaN(x)) ? '–' : Math.round(x);
  els.debug.textContent =
    'Pose: ' + (hasPose ? 'ja' : 'nein') + '  3D: ' + (out && out.use3d ? 'ja' : 'nein') + '  Modell: ' + (run.modelInfo || '–') + '  FPS: ' + run.fps + '  Licht: ' + (run.luma === undefined ? '–' : run.luma) + ' (γ ' + enh.gamma.toFixed(2) + ')\n' +
    'Winkel: ' + f(out && out.angle) + '°  oben: ' + f(out && out.top) + '°  unten: ' + f(out && out.bottom) + '°  ' + (out ? out.phase || '' : '') + '\n' +
    'Rumpf: ' + f(out && out.tilt) + '°  Linie: ' + f(out && out.line) + '°  ok: ' + (out ? (out.ok ? 'ja' : 'nein') : '–');
}

/* ---------- Skelett zeichnen ---------- */
function clearCanvas() {
  const c = els.overlay;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
function drawSkeleton(lm) {
  const c = els.overlay;
  const dpr = window.devicePixelRatio || 1;
  const cw = c.clientWidth, ch = c.clientHeight;
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!lm) return;
  const vw = els.video.videoWidth, vh = els.video.videoHeight;
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const get = (i) => {
    const p = lm[i];
    if (!p || (p.visibility !== undefined && p.visibility < 0.5)) return null;
    return { x: p.x * vw * scale + ox, y: p.y * vh * scale + oy };
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const p = get(a), q = get(b);
    if (p && q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
  }
  ctx.stroke();
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = get(i);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
  }
  ctx.lineWidth = 3;
}

/* ---------- Start ---------- */
loadState();

/* ---------- Darstellung (Auto/Hell/Dunkel) ---------- */
const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const t = S.settings.theme || 'dark';
  const light = t === 'light' || (t === 'auto' && mqDark && !mqDark.matches);
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', light ? '#F1F2F4' : '#121316');
}
if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', applyTheme);
applyTheme();
showScreen(S.onboarded ? 'home' : 'onb');
