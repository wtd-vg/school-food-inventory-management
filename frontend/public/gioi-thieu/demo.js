(() => {
'use strict';

/* ---------------------------------------------------------------- icons */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M17.5 14.3A6 6 0 0 1 21 20"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 3v5h5M4 13a8 8 0 0 0 14.5 4.5L20 16M20 21v-5h-5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
};
const svg = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/* ---------------------------------------------------------------- data (one believable school month) */
const STOCK = [
  ['Bí đao', 'BI', '9 kg', '15.000 đ', '135.000 đ', ''],
  ['Cà rốt', 'CAROT', '6,5 kg', '22.000 đ', '143.000 đ', ''],
  ['Dầu ăn', 'DAU', '12 lít', '48.000 đ', '576.000 đ', ''],
  ['Gạo tẻ', 'GAO', '120 kg', '17.500 đ', '2.100.000 đ', ''],
  ['Nước mắm', 'NMAM', '8 lít', '55.000 đ', '440.000 đ', ''],
  ['Rau muống', 'RAUMUONG', '0 kg', '14.000 đ', '0 đ', 'out'],
  ['Thịt bò', 'THITBO', '3,5 kg', '260.000 đ', '910.000 đ', ''],
  ['Thịt heo nạc', 'THIT', '22 kg', '113.636 đ', '2.500.000 đ', ''],
  ['Trứng cút', 'TRUNGCUT', '600 cái', '900 đ', '540.000 đ', ''],
];
const MAILS = [
  ['ng•••@gmail.com', 1], ['tr•••@gmail.com', 2], ['ph•••@yahoo.com', 1], ['le•••@gmail.com', 1],
  ['ho•••@outlook.com', 1], ['vu•••@gmail.com', 2], ['da•••@gmail.com', 1],
];
// Cost per meal served, school days of October 2026 (weekdays 1–19). 19/10 matches the walkthrough: 2.634.999,92 đ ÷ 299.
const DAILY = [
  ['01/10', 8641, 296], ['02/10', 8920, 301], ['05/10', 8433, 298], ['06/10', 8710, 295], ['07/10', 9105, 300],
  ['08/10', 8562, 297], ['09/10', 8877, 302], ['12/10', 8390, 294], ['13/10', 8954, 299], ['14/10', 8618, 300],
  ['15/10', 9210, 296], ['16/10', 8745, 298], ['19/10', 8812.71, 299],
];

/* ---------------------------------------------------------------- narration */
// `text` is spoken; `cap` is the same line broken into caption rows (the URL is written, not spelled).
const VO = [
  { t: 0.7,  cap: ["Meet SchoolFood: school lunch and inventory in one place.", "Let's walk through a day."] },
  { t: 7.4,  cap: ["Each morning starts on Today.", "Three hundred meals are confirmed, the menu is set,", "and every step is tracked."] },
  { t: 17.4, cap: ["At six-thirty, parents got today's menu by email.", "Addresses are encrypted, shown masked,", "and parents can unsubscribe anytime."] },
  { t: 26.5, cap: ["Next, ingredients.", "Three hundred meals need twenty-one kilos of pork,", "plus one in reserve.", "Minus stock and deliveries on the way,", "we buy just thirteen."] },
  { t: 38.6, cap: ["One click turns that into a supplier order,", "linked to today's lunch.", "Approve, send, done."] },
  { t: 46.6, cap: ["When the delivery arrives, enter what actually came in.", "Stock updates the moment it's posted,", "and you can't receive more than you ordered."] },
  { t: 58.6, cap: ["Need to check an item?", "Search the stockroom,", "then open its full history and average cost."] },
  { t: 67.6, cap: ["After lunch, close the day.", "Cost per meal is based on meals actually served,", "and the monthly report exports to CSV in one click."] },
  { t: 81.5, cap: ["SchoolFood.", "From meal counts to the kitchen, without the guesswork.", "Try it at schoolfoodusth.store."],
    text: "SchoolFood. From meal counts to the kitchen, without the guesswork. Try it at schoolfoodusth dot store." },
];
VO.forEach((v) => { v.text = v.text || v.cap.join(' '); });
const TOTAL = 90;

/* ---------------------------------------------------------------- audio (Tone.js) */
const audio = { ok: false, voice: null, music: null, musicVol: null, synths: {}, last: {} };
function initAudio() {
  if (!window.Tone || audio.ok) return;
  const T = window.Tone;
  const sfxOut = new T.Volume(-6).toDestination();
  const s = audio.synths;
  s.click = new T.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.0005, decay: 0.06, sustain: 0 }, volume: -10 }).connect(sfxOut);
  const keyF = new T.Filter(3200, 'bandpass').connect(sfxOut);
  s.key = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.022, sustain: 0 }, volume: -20 }).connect(keyF);
  s.bell = new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 1.4 }, volume: -12 }).connect(sfxOut);
  s.tri = new T.PolySynth(T.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.18, sustain: 0, release: 0.3 }, volume: -12 }).connect(sfxOut);
  s.err = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.05 }, volume: -26 }).connect(sfxOut);
  const whF = new T.Filter({ type: 'bandpass', frequency: 600, Q: 0.8 }).connect(sfxOut);
  s.whF = whF;
  s.whoosh = new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.09, decay: 0.28, sustain: 0 }, volume: -18 }).connect(whF);
  buildMusic(T);
  audio.ok = true;
}
function buildMusic(T) {
  const out = new T.Volume(-21).toDestination();
  audio.musicVol = out;
  const verb = new T.Reverb({ decay: 3, wet: 0.3 }).connect(out);
  const lp = new T.Filter(2000, 'lowpass').connect(verb);
  const pad = new T.PolySynth(T.Synth, { oscillator: { type: 'fattriangle', count: 3, spread: 16 }, envelope: { attack: 0.5, decay: 0.4, sustain: 0.55, release: 1.8 }, volume: -15 }).connect(lp);
  const keys = new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.45, sustain: 0, release: 0.6 }, volume: -13 }).connect(lp);
  const bass = new T.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.55, release: 0.7 }, filterEnvelope: { baseFrequency: 180, octaves: 1.5 }, volume: -9 }).connect(out);
  const kick = new T.MembraneSynth({ pitchDecay: 0.035, octaves: 4, envelope: { attack: 0.001, decay: 0.32, sustain: 0 }, volume: -12 }).connect(out);
  const hatF = new T.Filter(7500, 'highpass').connect(out);
  const hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 }, volume: -29 }).connect(hatF);
  T.Transport.bpm.value = 86;
  const prog = [
    { c: ['C4', 'E4', 'G4', 'B4'], b: 'C2' }, { c: ['A3', 'C4', 'E4', 'G4'], b: 'A1' },
    { c: ['F3', 'A3', 'C4', 'E4'], b: 'F1' }, { c: ['G3', 'B3', 'D4', 'F4'], b: 'G1' },
  ];
  const pickup = T.Time('2n').toSeconds() + T.Time('8n').toSeconds(); // bass pickup on beat 3½
  let bar = 0;
  T.Transport.scheduleRepeat((time) => {
    const p = prog[bar % 4];
    pad.triggerAttackRelease(p.c, '1m', time);
    bass.triggerAttackRelease(p.b, '4n.', time);
    bass.triggerAttackRelease(p.b, '8n', time + pickup);
    bar++;
  }, '1m', 0);
  T.Transport.scheduleRepeat((time) => kick.triggerAttackRelease('C1', '8n', time), '2n', 0);
  T.Transport.scheduleRepeat((time) => hat.triggerAttackRelease('32n', time), '4n', '8n');
  const mel = ['E5', null, 'G5', null, null, 'A5', null, 'G5', null, 'E5', null, null, 'D5', null, 'C5', null];
  let step = 0;
  T.Transport.scheduleRepeat((time) => {
    const n = mel[step % mel.length];
    if (n && step >= 32) keys.triggerAttackRelease(n, '8n', time);
    step++;
  }, '8n', 0);
}
function fire(name, fn) {
  if (!audio.ok || muted) return;
  const T = window.Tone;
  const now = T.now();
  const t = Math.max(now + 0.005, (audio.last[name] || 0) + 0.012);
  audio.last[name] = t;
  try { fn(t, audio.synths); } catch (e) { /* a dropped UI sound must never break playback */ }
}
const sfx = {
  click: () => fire('click', (t, s) => s.click.triggerAttackRelease('G4', '64n', t)),
  key: () => fire('key', (t, s) => s.key.triggerAttackRelease('64n', t)),
  tick: () => fire('tick', (t, s) => s.tri.triggerAttackRelease('A5', '32n', t, 0.6)),
  chime: () => fire('chime', (t, s) => { s.bell.triggerAttackRelease('E6', '8n', t, 0.7); s.bell.triggerAttackRelease('B6', '4n', t + 0.13, 0.6); }),
  success: () => fire('success', (t, s) => ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => s.tri.triggerAttackRelease(n, '16n', t + i * 0.07, 0.8))),
  error: () => fire('error', (t, s) => { s.err.triggerAttackRelease('D3', '16n', t); s.err.triggerAttackRelease('C#3', '16n', t + 0.13); }),
  whoosh: () => fire('whoosh', (t, s) => { s.whF.frequency.cancelScheduledValues(t); s.whF.frequency.setValueAtTime(350, t); s.whF.frequency.exponentialRampToValueAtTime(3200, t + 0.35); s.whoosh.triggerAttackRelease('8n', t); }),
  download: () => fire('download', (t, s) => { s.tri.triggerAttackRelease('G5', '16n', t, 0.7); s.bell.triggerAttackRelease('D6', '8n', t + 0.12, 0.6); }),
};
let muted = false;

/* ---------------------------------------------------------------- voice (Web Speech API) */
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter((v) => /^en(-|_)US/i.test(v.lang) || v.lang === 'en-US');
  const pref = [/natural/i, /Google US English/i, /Aria/i, /Jenny/i, /Samantha/i, /Ava/i, /Allison/i, /Microsoft.*Zira/i];
  for (const re of pref) { const v = vs.find((x) => re.test(x.name)); if (v) return v; }
  return vs[0] || null;
}
if ('speechSynthesis' in window) {
  audio.voice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { audio.voice = pickVoice(); };
}
/* Voices differ in speed. Speak at 0.95 by default; if the measured pace of the installed voice
   would overrun a line's slot, nudge the rate up (max 1.12) so the voice stays on the picture. */
const speech = { wps: 2.6, cur: null, start: 0, paused: false };
function say(i) {
  if (!('speechSynthesis' in window) || muted) return;
  const text = VO[i].text, words = text.split(/\s+/).length;
  const slot = (i + 1 < VO.length ? VO[i + 1].t : TOTAL) - VO[i].t - 0.5;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.pitch = 1.0; u.volume = 1;
  u.rate = Math.min(1.12, Math.max(0.95, words / (speech.wps * slot)));
  if (audio.voice) u.voice = audio.voice;
  u.onstart = () => { speech.start = performance.now(); speech.paused = false; };
  u.onend = () => {
    if (u.cut || speech.paused || !speech.start) return;
    const secs = (performance.now() - speech.start) / 1000;
    if (secs > 1.5) speech.wps = Math.min(3.6, Math.max(1.8, words / secs / u.rate));
  };
  if (speech.cur) speech.cur.cut = true;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); // never let a line drift past its scene
  speech.cur = u; speech.start = 0;
  speechSynthesis.speak(u);
}

/* ---------------------------------------------------------------- stage scaling */
const stage = document.getElementById('stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();

/* ---------------------------------------------------------------- DOM helpers */
let $ = (sel) => stage.querySelector(sel);
let $$ = (sel) => Array.from(stage.querySelectorAll(sel));
const viNum = (n, dp = 0) => {
  const [i, f] = Math.abs(n).toFixed(dp).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
};

function decorate() {
  $$('[data-ico]').forEach((el) => el.insertAdjacentHTML('afterbegin', svg(el.dataset.ico, el.tagName === 'A' ? 20 : 18)));
  // Stock table rows
  const tbl = $('#st-table');
  STOCK.forEach(([name, code, qty, cost, val, flag]) => {
    tbl.insertAdjacentHTML('beforeend', `<div class="tr st-row" data-name="${name.toLowerCase()}" style="grid-template-columns:2fr .9fr 1fr 1.2fr 1.2fr 1fr"><span class="strong">${name}</span><span class="muted">${code}</span><span class="r strong">${qty}</span><span class="r muted">${cost}</span><span class="r">${val}</span><span>${flag ? '<span class="badge b-danger">Hết hàng</span>' : ''}</span></div>`);
  });
  const em = $('#em-table');
  MAILS.forEach(([hint, kids], i) => {
    em.insertAdjacentHTML('beforeend', `<div class="tr" style="grid-template-columns:1.8fr .7fr 1fr .8fr 1fr"><span class="strong em-hint">${hint}</span><span class="r">${kids}</span><span><span class="badge b-ok">Đã gửi</span></span><span class="r">1</span><span class="r muted num">6:${String(30 + Math.floor(i / 3)).padStart(2, '0')}</span></div>`);
  });
  // Report columns (single series, one colour; only today's bar and the maximum are labelled)
  const cols = $('#rp-cols'); const xs = $('#rp-x');
  const max = Math.max(...DAILY.map((d) => d[1]));
  DAILY.forEach(([d, v]) => {
    const today = d === '19/10';
    const label = today || v === max ? `<span class="vl">${viNum(v, today ? 2 : 0)} đ</span>` : '';
    cols.insertAdjacentHTML('beforeend', `<div class="col${today ? ' today' : ''}" data-h="${(v / 10000) * 100}">${label}</div>`);
    xs.insertAdjacentHTML('beforeend', `<span>${d}</span>`);
  });
}

/* Position of an element in camera-space (the untransformed 1920×1080 frame), at call time. */
function P(target, ax = 0.5, ay = 0.5) {
  const el = typeof target === 'string' ? $(target) : target;
  const r = el.getBoundingClientRect();
  const c = $('#cam').getBoundingClientRect();
  const k = c.width / 1920;
  return { x: (r.left - c.left + r.width * ax) / k, y: (r.top - c.top + r.height * ay) / k, w: r.width / k, h: r.height / k, l: (r.left - c.left) / k, t: (r.top - c.top) / k };
}

/* ---------------------------------------------------------------- timeline building blocks */
let tl, cur;
function camTo(at, target, s = 1.3, dur = 1.1, dx = 0, dy = 0) {
  const focus = () => {
    if (!target) return { x: 960, y: 540 };
    const p = typeof target === 'function' ? target() : P(target);
    const half = { x: 960 / s, y: 540 / s };
    // keep the browser window filling the frame (Screen Studio-style), small margin allowed
    const x = Math.min(Math.max(p.x + dx, 160 + half.x - 40), 1760 - half.x + 40);
    const y = Math.min(Math.max(p.y + dy, 92 + half.y - 40), 988 - half.y + 40);
    return { x, y };
  };
  let f;
  tl.to('#cam', {
    x: () => { f = focus(); return 960 - f.x * s; },
    y: () => 540 - (f || focus()).y * s,
    scale: s, duration: dur, ease: 'power3.inOut',
  }, at);
}
function renderCursor() {
  if (!Number.isFinite(cur.x) || !Number.isFinite(cur.y)) return;
  $('#cursor').style.transform = `translate(${cur.x}px, ${cur.y}px)`;
}
function moveTo(at, target, dur = 0.85, ox = 0, oy = 0, hoverEl) {
  const o = { t: 0 };
  let sx, sy;
  tl.to(o, {
    t: 1, duration: dur, ease: 'power2.inOut',
    onStart() { sx = cur.x; sy = cur.y; },
    // re-aim every frame so the pointer lands on the target even if the layout is still settling
    onUpdate() {
      if (sx === undefined) { sx = cur.x; sy = cur.y; } // GSAP can update at t=0 before onStart fires
      const p = typeof target === 'function' ? target() : P(target);
      const ex = p.x + ox, ey = p.y + oy;
      const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, bend = Math.min(110, len * 0.16);
      const cx = (sx + ex) / 2 - (dy / len) * bend, cy = (sy + ey) / 2 + (dx / len) * bend;
      const t = o.t, u = 1 - t;
      cur.x = u * u * sx + 2 * u * t * cx + t * t * ex; cur.y = u * u * sy + 2 * u * t * cy + t * t * ey;
      renderCursor();
    },
  }, at);
  if (hoverEl) tl.call(() => { const el = typeof hoverEl === 'function' ? hoverEl() : typeof hoverEl === 'string' ? $(hoverEl) : hoverEl; el && el.classList.add('hover'); }, null, at + dur - 0.15);
}
function click(at, el) {
  tl.call(sfx.click, null, at);
  tl.to('#cursor svg', { scale: 0.8, duration: 0.07, ease: 'power2.out' }, at);
  tl.to('#cursor svg', { scale: 1, duration: 0.2, ease: 'back.out(3)' }, at + 0.07);
  tl.set('#rip', { x: () => cur.x, y: () => cur.y, scale: 0.25, autoAlpha: 0.95 }, at);
  tl.to('#rip', { scale: 1.5, autoAlpha: 0, duration: 0.55, ease: 'power2.out' }, at + 0.001);
  if (el) {
    tl.to(el, { scale: 0.96, duration: 0.07 }, at);
    tl.to(el, { scale: 1, duration: 0.18 }, at + 0.07);
    tl.call(() => { const e = typeof el === 'string' ? $(el) : el; e && e.classList.remove('hover'); }, null, at + 0.25);
  }
}
function typeInto(at, el, text, cps = 8, onChar) {
  const o = { n: 0 };
  let last = 0;
  tl.to(o, {
    n: text.length, duration: text.length / cps, ease: 'none',
    onStart() { last = 0; },
    onUpdate() {
      const n = Math.round(o.n);
      if (n !== last) { $(el).textContent = text.slice(0, n); if (n > last) { sfx.key(); onChar && onChar(text.slice(0, n)); } last = n; }
    },
  }, at);
  return text.length / cps;
}
function countUp(at, el, to, dur, fmt, from = 0) {
  const o = { v: from };
  tl.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate() { $(el).textContent = fmt(o.v); } }, at);
}
/* target: selector/element, or a function returning a camera-space rect {l, t, w, h}. */
function ring(at, target, dur = 2.2, pad = 8) {
  let r;
  const rect = () => (r = typeof target === 'function' ? target() : P(target));
  tl.set('#ring', { x: () => rect().l - pad, y: () => r.t - pad, width: () => r.w + pad * 2, height: () => r.h + pad * 2, scale: 1.06 }, at);
  tl.to('#ring', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, at);
  tl.to('#ring', { autoAlpha: 0, duration: 0.3 }, at + dur);
}
function callout(at, text, target, dur = 2.3, place = 'above', dx = 0) {
  tl.call(() => { $('#callout-t').textContent = text; }, null, at - 0.01);
  const pos = () => {
    const p = P(target), c = $('#callout').getBoundingClientRect(), k = $('#cam').getBoundingClientRect().width / 1920;
    const w = c.width / k, h = c.height / k;
    if (place === 'right') return { x: p.l + p.w + 18 + dx, y: p.y - h / 2 };
    if (place === 'left') return { x: p.l - w - 18 + dx, y: p.y - h / 2 };
    if (place === 'below') return { x: p.x - w / 2 + dx, y: p.t + p.h + 16 };
    return { x: p.x - w / 2 + dx, y: p.t - h - 16 };
  };
  let q;
  tl.set('#callout', { x: () => (q = pos()).x, y: () => (q || pos()).y + 10 }, at);
  tl.to('#callout', { autoAlpha: 1, y: '-=10', duration: 0.4, ease: 'power3.out' }, at + 0.01);
  tl.to('#callout', { autoAlpha: 0, y: '-=6', duration: 0.3, ease: 'power2.in' }, at + dur);
}
function toast(at, text, dur = 2.2) {
  tl.call(() => { $('#toast-t').textContent = text; }, null, at - 0.01);
  tl.fromTo('#toast', { autoAlpha: 0, y: -14 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out', immediateRender: false }, at);
  tl.to('#toast', { autoAlpha: 0, y: -10, duration: 0.3 }, at + dur);
}
let pageNow = 'p-today';
const URLS = {
  'p-today': '/bua-trua?ngay=2026-10-19', 'p-demand': '/bua-trua/nhu-cau?ngay=2026-10-19', 'p-orders': '/bua-trua/don-dat?don=31',
  'p-receive': '/bua-trua/nhan-hang?don=31', 'p-stock': '/kho', 'p-email': '/lop-hoc/thu-thuc-don?ngay=2026-10-19', 'p-report': '/bao-cao?thang=2026-10',
};
const NAVS = { 'p-today': 'lunch', 'p-demand': 'lunch', 'p-orders': 'lunch', 'p-receive': 'lunch', 'p-stock': 'stock', 'p-email': 'class', 'p-report': 'report' };
function go(at, to) {
  const from = pageNow; pageNow = to;
  tl.call(() => {
    sfx.whoosh();
    $('#url').innerHTML = `<b>schoolfoodusth.store</b>${URLS[to]}`;
    $$('.nav a').forEach((a) => a.classList.toggle('on', a.id === 'nav-' + NAVS[to]));
    $$('.nav a').forEach((a) => a.classList.remove('hover'));
  }, null, at);
  tl.to('#' + from, { autoAlpha: 0, x: -24, duration: 0.26, ease: 'power2.in' }, at);
  tl.fromTo('#skel', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14, immediateRender: false }, at + 0.18);
  tl.to('#skel', { autoAlpha: 0, duration: 0.22 }, at + 0.62);
  tl.fromTo('#' + to, { autoAlpha: 0, x: 26 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'power3.out', immediateRender: false }, at + 0.55);
}
function stepDone(at, i, detail) {
  tl.call(() => {
    const li = $$('#timeline .step')[i];
    li.classList.add('done');
    li.querySelector('.mk').textContent = '✓';
    const b = li.querySelector('.badge'); b.className = 'badge b-ok'; b.textContent = 'Xong';
    if (detail) li.querySelector('.sd').textContent = detail;
    $('#tl-count').textContent = $$('#timeline .step.done').length;
    sfx.tick();
  }, null, at);
  tl.fromTo($$('#timeline .mk')[i], { scale: 0.6 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, at);
}

/* ---------------------------------------------------------------- subtitles */
/* Captions: each line is shown as short rows in turn, timed by word count. */
function buildSubs() {
  const box = $('#subs'); box.innerHTML = '';
  VO.forEach((v, i) => v.cap.forEach((ph, j) => {
    const words = ph.split(' ').map((w, k, a) => `<span>${w}${k < a.length - 1 ? '&nbsp;' : ''}</span>`).join('');
    box.insertAdjacentHTML('beforeend', `<div class="sub" id="sub${i}_${j}" data-n="${ph.split(' ').length}">${words}</div>`);
  }));
}
function subtitles() {
  VO.forEach((v, i) => {
    tl.call(say, [i], v.t);
    const parts = $$(`#subs .sub[id^="sub${i}_"]`);
    const total = parts.reduce((a, p) => a + Number(p.dataset.n), 0);
    const end = i + 1 < VO.length ? VO[i + 1].t - 0.2 : TOTAL - 0.5;
    const speak = Math.min(total / 2.45, end - v.t - 0.3); // ~2.45 words/s at rate 0.95
    let at = v.t;
    parts.forEach((p, j) => {
      const dur = (speak * Number(p.dataset.n)) / total;
      const words = p.querySelectorAll('span');
      tl.fromTo(p, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power3.out', immediateRender: false }, at);
      tl.fromTo(words, { opacity: 0.35 }, { opacity: 1, duration: 0.18, stagger: (dur * 0.85) / words.length, ease: 'none', immediateRender: false }, at);
      const last = j === parts.length - 1;
      tl.to(p, { autoAlpha: 0, y: last ? -6 : 0, duration: last ? 0.3 : 0.12 }, last ? Math.min(end, at + dur + 1.0) : at + dur - 0.06);
      at += dur;
    });
  });
}

/* ---------------------------------------------------------------- the film */
function build() {
  cur = { x: 1460, y: 930 };
  pageNow = 'p-today';
  gsap.set('#cam', { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });
  gsap.set('#win', { autoAlpha: 0, y: 240, scale: 0.9, rotationX: 10, transformPerspective: 1600, transformOrigin: '50% 0%' });
  gsap.set(['#ring', '#callout', '#file', '#rip', '#cursor', '#phone'], { autoAlpha: 0 });
  gsap.set('#outro > *', { autoAlpha: 0 });
  renderCursor();
  tl = gsap.timeline({ paused: true, onUpdate: progress, onComplete: finished });

  /* ---- 0 · Intro (0 – 7.2) */
  tl.from('#intro .logo-mark', { scale: 0.4, rotation: -14, autoAlpha: 0, duration: 0.9, ease: 'back.out(1.8)' }, 0.2);
  tl.from('#intro .logo-word', { x: -30, autoAlpha: 0, duration: 0.8, ease: 'power3.out' }, 0.45);
  tl.from(['#intro .tag-vi', '#intro .tag-en'], { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out' }, 0.9);
  tl.to('#intro', { y: -120, autoAlpha: 0, scale: 0.92, duration: 0.8, ease: 'power3.in' }, 3.6);
  tl.call(sfx.whoosh, null, 3.9);
  tl.to('#win', { autoAlpha: 1, y: 0, scale: 1, rotationX: 0, duration: 1.4, ease: 'power3.out' }, 3.9);
  tl.to('#cursor', { autoAlpha: 1, duration: 0.3 }, 5.4);
  countUp(5.6, '#k-planned', 300, 1.5, (v) => viNum(Math.round(v)));
  tl.from('#timeline .step', { autoAlpha: 0, x: -16, stagger: 0.07, duration: 0.4, ease: 'power2.out' }, 5.5);

  /* ---- 1 · Today (7.2 – 17) */
  camTo(7.6, '#kpi-planned', 1.45, 1.3, 260, 40);
  moveTo(8.2, '#kpi-planned', 1.0, 40, 10);
  callout(9.0, '300 meals · 10 classes + 5 staff', '#kpi-planned', 2.6, 'below', 120);
  camTo(11.6, '#tl-card', 1.3, 1.2, 0, 10);
  moveTo(11.8, () => { const p = P($$('#timeline .step')[1]); return { x: p.l + 260, y: p.y }; }, 1.0);
  ring(12.4, '#timeline', 2.6, 10);
  callout(12.6, 'Every step of the day, in order', '#tl-card', 2.4, 'right', -40);
  camTo(15.4, null, 1, 1.2);
  moveTo(15.6, () => ({ x: 1500, y: 700 }), 1.0);

  /* ---- 2 · 06:30 parent email (17 – 26.3) */
  tl.fromTo('#phone', { autoAlpha: 0, x: 520, rotation: 6 }, { autoAlpha: 1, x: 0, rotation: 0, duration: 1.0, ease: 'power3.out', immediateRender: false }, 16.9);
  tl.call(sfx.chime, null, 17.7);
  tl.fromTo('#mail', { autoAlpha: 0, y: -30, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.6)', immediateRender: false }, 17.7);
  camTo(17.3, () => ({ x: P('#phone').x - 120, y: P('#phone').y }), 1.35, 1.2);
  callout(18.7, 'Sent automatically at 06:30', '#mail', 2.2, 'left');
  camTo(21.0, null, 1, 1.0);
  tl.to('#phone', { autoAlpha: 0, x: 520, rotation: 6, duration: 0.8, ease: 'power3.in' }, 21.0);
  moveTo(21.0, '#nav-class', 0.9, 0, 0, '#nav-class');
  click(21.95, '#nav-class');
  go(22.0, 'p-email');
  camTo(22.9, '#em-table', 1.3, 1.1, -60, 0);
  moveTo(23.0, () => { const p = P('#em-col'); return { x: p.x + 40, y: p.y + 70 }; }, 0.9);
  ring(23.6, () => { const a = P('#em-col'); const b = P($$('#em-table .em-hint').pop()); return { l: a.l - 6, t: a.t - 6, w: a.w + 20, h: b.t + b.h - a.t + 12, x: 0, y: 0 }; }, 2.4, 6);
  callout(23.8, 'Encrypted · always shown masked', '#em-col', 2.2, 'above', 160);
  camTo(26.0, null, 1, 0.9);

  /* ---- 3 · Demand (26.3 – 38.3) */
  moveTo(26.2, '#nav-lunch', 0.8, 0, 0, '#nav-lunch');
  click(27.05, '#nav-lunch');
  go(27.1, 'p-demand');
  moveTo(28.0, '#btn-calc', 0.85, 0, 0, '#btn-calc');
  click(28.9, '#btn-calc');
  tl.to('#dm-empty', { autoAlpha: 0, duration: 0.2 }, 29.0);
  tl.fromTo('#skel', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, immediateRender: false }, 29.0);
  tl.to('#skel', { autoAlpha: 0, duration: 0.2 }, 29.55);
  tl.to('#dm-result', { autoAlpha: 1, duration: 0.3 }, 29.6);
  tl.from('#dm-table .tr', { autoAlpha: 0, y: 10, stagger: 0.09, duration: 0.35 }, 29.65);
  tl.to('#btn-approve', { opacity: 1, duration: 0.3 }, 29.8);
  camTo(30.2, '#dm-table', 1.4, 1.2, 0, 10);
  ring(30.9, '#dm-req', 2.4, 10);
  callout(31.0, '300 meals × (60 g + 10 g) = 21 kg', '#dm-req', 2.4, 'above');
  moveTo(32.9, '#btn-approve', 0.9, 0, 0, '#btn-approve');
  click(33.85, '#btn-approve');
  tl.call(() => {
    $('#h4').textContent = 'Lấy từ tồn'; $('#h5').textContent = 'Hàng chờ về';
    $$('#dm-table .c4, #dm-table .c5').forEach((c) => { c.classList.remove('cellflash'); void c.offsetWidth; c.classList.add('cellflash'); });
    const st = $('#dm-state'); st.className = 'badge b-ok'; st.textContent = 'Đã duyệt';
    $('#btn-approve').style.visibility = 'hidden';
    sfx.success();
  }, null, 33.95);
  tl.to(['#h6', '#dm-table .c6'], { opacity: 1, duration: 0.4 }, 34.0);
  toast(34.0, 'Đã duyệt đề xuất và giữ hàng cho ngày ăn.', 2.4);
  tl.to('#dm-chart', { autoAlpha: 1, duration: 0.35 }, 34.3);
  ['#sg1', '#sg2', '#sg3'].forEach((id, i) => {
    // three segments share the track minus two 2px surface gaps
    tl.to(id, { width: () => (($('#stack').offsetWidth - 4) * Number($(id).dataset.w)) / 100, duration: 0.55, ease: 'power2.out' }, 34.6 + i * 0.45);
    tl.call(sfx.tick, null, 34.6 + i * 0.45);
  });
  camTo(34.4, '#dm-chart', 1.35, 1.2, 0, 20);
  callout(36.0, 'Stock and pending first. Buy only 13 kg.', '#sg3', 2.2, 'above');
  tl.to('#dm-cta', { autoAlpha: 1, duration: 0.35 }, 36.4);

  /* ---- 4 · Supplier order (38.3 – 46.4) */
  camTo(38.2, '#dm-cta', 1.2, 1.0, -120, -60);
  moveTo(38.3, '#btn-po', 0.85, 0, 0, '#btn-po');
  click(39.2, '#btn-po');
  tl.to('#scrim', { autoAlpha: 1, duration: 0.3 }, 39.3);
  tl.fromTo('#mo-po', { autoAlpha: 0, y: 24, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out', immediateRender: false }, 39.3);
  camTo(39.5, '#mo-po', 1.3, 0.9);
  moveTo(39.8, '#btn-po-create', 0.8, 0, 0, '#btn-po-create');
  click(40.65, '#btn-po-create');
  tl.to('#mo-po', { autoAlpha: 0, scale: 0.96, duration: 0.25 }, 40.8);
  tl.fromTo('#burst', { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2.2)', immediateRender: false }, 40.85);
  tl.fromTo('#burst .ring', { scale: 0.7, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.8, ease: 'power2.out', immediateRender: false }, 40.9);
  tl.call(sfx.success, null, 40.9);
  tl.to(['#burst', '#scrim'], { autoAlpha: 0, duration: 0.3 }, 41.6);
  go(41.7, 'p-orders');
  tl.to('#po-drawer', { x: 0, duration: 0.5, ease: 'power3.out' }, 42.3);
  toast(42.3, 'Đã tạo đơn DH20261019-1 (nháp).', 1.8);
  camTo(42.5, () => { const p = P('#po-drawer'); return { x: p.x - 160, y: p.t + 300 }; }, 1.3, 1.1);
  callout(43.0, "Linked to today's lunch", '#po-src', 1.8, 'below');
  moveTo(43.0, '#btn-po-approve', 0.75, 0, 0, '#btn-po-approve');
  click(43.85, '#btn-po-approve');
  tl.call(() => {
    ['#po-chip', '#po-chip2'].forEach((id) => { const c = $(id); c.className = 'badge b-info'; c.textContent = 'Đã duyệt'; });
    $('#po-kick').textContent = 'Đã duyệt';
    $('#btn-po-approve').style.display = 'none'; $('#btn-po-send').style.display = 'inline-flex';
    sfx.tick();
  }, null, 43.95);
  moveTo(44.2, '#btn-po-send', 0.45, 0, 0, '#btn-po-send');
  click(44.75, '#btn-po-send');
  tl.call(() => {
    ['#po-chip', '#po-chip2'].forEach((id) => { const c = $(id); c.className = 'badge b-info'; c.textContent = 'Đã gửi NCC'; });
    $('#po-kick').textContent = 'Đã gửi NCC'; sfx.success();
  }, null, 44.85);
  toast(44.9, 'Đánh dấu đã gửi NCC: DH20261019-1 → Đã gửi NCC.', 1.6);
  tl.fromTo('#po-chip2', { scale: 0.8 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, 44.85);

  /* ---- 5 · Receive (46.4 – 58.4) */
  camTo(46.0, null, 1, 0.9);
  tl.to('#po-drawer', { x: '105%', duration: 0.4, ease: 'power2.in' }, 46.0);
  moveTo(46.2, '#tab-receive', 0.75, 0, 0, '#tab-receive');
  click(47.0, '#tab-receive');
  go(47.05, 'p-receive');
  tl.set('#rc-meter', { width: `${(9 / 22) * 100}%` }, 47.5);
  camTo(47.9, () => ({ x: P('#p-receive').x, y: P('#rc-qty').y + 60 }), 1.4, 1.1);
  moveTo(48.0, '#rc-qty', 0.7);
  click(48.75, '#rc-qty');
  tl.call(() => { $('#rc-qty').classList.add('focus'); $('#rc-ph').style.display = 'none'; }, null, 48.8);
  typeInto(48.95, '#rc-qty-t', '10', 7);
  moveTo(49.4, '#btn-rc-draft', 0.6, 0, 0, '#btn-rc-draft');
  click(50.05, '#btn-rc-draft');
  tl.call(() => $('#rc-qty').classList.remove('focus'), null, 50.1);
  tl.fromTo('#rc-draft', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, 50.2);
  moveTo(50.55, '#btn-rc-post', 0.6, 0, 0, '#btn-rc-post');
  click(51.2, '#btn-rc-post');
  tl.call(sfx.success, null, 51.3);
  tl.to('#rc-draft', { autoAlpha: 0, duration: 0.25 }, 51.35);
  tl.to('#rc-meter', { width: `${(19 / 22) * 100}%`, duration: 0.9, ease: 'power2.out' }, 51.35);
  countUp(51.35, '#rc-stock', 19, 0.9, (v) => viNum(Math.round(v)), 9);
  tl.call(() => {
    $('#rc-recv').textContent = '10 kg'; $('#rc-open').textContent = '3 kg';
    $('#rc-state').textContent = 'Đã gửi NCC · còn chờ 3 kg';
    $('#rc-qty-t').textContent = ''; $('#rc-ph').style.display = '';
  }, null, 51.4);
  toast(51.4, 'Đã chốt phiếu nhập #12, tồn kho đã cộng.', 1.6);
  moveTo(52.6, '#rc-qty', 0.55);
  click(53.2, '#rc-qty');
  tl.call(() => { $('#rc-qty').classList.add('focus'); $('#rc-ph').style.display = 'none'; }, null, 53.25);
  typeInto(53.35, '#rc-qty-t', '4', 6);
  moveTo(53.6, '#btn-rc-draft', 0.45, 0, 0, '#btn-rc-draft');
  click(54.1, '#btn-rc-draft');
  tl.call(() => {
    const q = $('#rc-qty'); q.classList.remove('focus'); q.classList.add('err');
    q.classList.remove('shake'); void q.offsetWidth; q.classList.add('shake');
    sfx.error();
  }, null, 54.2);
  tl.to('#rc-err', { opacity: 1, duration: 0.25 }, 54.2);
  ring(54.3, '#rc-qty', 2.0, 8);
  callout(54.4, "Can't receive more than ordered", '#rc-qty', 2.0, 'above');
  moveTo(55.4, '#rc-qty', 0.4, -20);
  click(55.85, '#rc-qty');
  tl.call(() => { const q = $('#rc-qty'); q.classList.remove('err', 'shake'); q.classList.add('focus'); $('#rc-qty-t').textContent = ''; }, null, 55.9);
  tl.to('#rc-err', { opacity: 0, duration: 0.2 }, 55.9);
  typeInto(55.95, '#rc-qty-t', '3', 6);
  moveTo(56.1, '#btn-rc-draft', 0.35, 0, 0, '#btn-rc-draft');
  click(56.5, '#btn-rc-draft');
  tl.call(() => { $('#rc-qty').classList.remove('focus'); $('#rc-draft-t').textContent = 'Phiếu nhập nháp #13'; $('#rc-draft-d').textContent = 'Thịt heo nạc 3 kg × 120.000 đ — tổng 360.000 đ'; }, null, 56.55);
  tl.fromTo('#rc-draft', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, immediateRender: false }, 56.6);
  moveTo(56.75, '#btn-rc-post', 0.4, 0, 0, '#btn-rc-post');
  click(57.2, '#btn-rc-post');
  tl.call(sfx.success, null, 57.3);
  tl.to('#rc-draft', { autoAlpha: 0, duration: 0.25 }, 57.3);
  tl.to('#rc-meter', { width: '100%', duration: 0.6, ease: 'power2.out' }, 57.3);
  countUp(57.3, '#rc-stock', 22, 0.6, (v) => viNum(Math.round(v)), 19);
  tl.call(() => {
    $('#rc-recv').textContent = '13 kg'; $('#rc-open').textContent = '0 kg'; $('#rc-qty-t').textContent = ''; $('#rc-ph').style.display = '';
    const s = $('#rc-state'); s.className = 'badge b-ok'; s.textContent = 'Đã đóng · Đã nhận đủ';
  }, null, 57.35);
  tl.fromTo('#rc-state', { scale: 0.8 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, 57.35);
  camTo(57.7, '#rc-card', 1.25, 0.8, -200, 0);

  /* ---- 6 · Search the stockroom (58.4 – 67.4) */
  camTo(58.4, null, 1, 0.8);
  moveTo(58.4, '#nav-stock', 0.7, 0, 0, '#nav-stock');
  click(59.15, '#nav-stock');
  go(59.2, 'p-stock');
  camTo(60.0, '#st-search', 1.35, 1.0, 80, 160);
  moveTo(60.1, '#st-search', 0.6, -80);
  click(60.75, '#st-search');
  tl.call(() => { $('#st-search').classList.add('focus'); $('#st-ph').style.display = 'none'; }, null, 60.8);
  typeInto(60.95, '#st-q', 'thịt', 5.5, (q) => {
    $$('.st-row').forEach((r) => r.classList.toggle('gone', !r.dataset.name.includes(q)));
  });
  const thit = () => $$('.st-row').find((r) => r.dataset.name === 'thịt heo nạc');
  moveTo(62.0, () => { const p = P(thit()); return { x: p.l + 120, y: p.y }; }, 0.7, 0, 0, () => thit());
  tl.call(() => thit().classList.add('hover'), null, 62.55);
  click(62.8, null);
  tl.call(() => thit().classList.remove('hover'), null, 63.0);
  tl.to('#st-drawer', { x: 0, duration: 0.5, ease: 'power3.out' }, 62.9);
  tl.from('#st-hist .hrow', { autoAlpha: 0, x: 20, stagger: 0.08, duration: 0.35 }, 63.25);
  camTo(63.1, () => { const p = P('#st-drawer'); return { x: p.x - 160, y: p.t + 330 }; }, 1.3, 1.1);
  moveTo(63.4, () => { const p = P('#st-drawer'); return { x: p.l + 380, y: p.t + 300 }; }, 0.8);
  callout(64.0, 'Every receipt and issue, with average cost', '#st-hist', 2.4, 'below');
  tl.to('#st-drawer', { x: '105%', duration: 0.4, ease: 'power2.in' }, 66.6);
  camTo(66.6, null, 1, 0.8);

  /* ---- 7 · Close the day + report (67.4 – 81.2) */
  moveTo(67.2, '#nav-lunch', 0.7, 0, 0, '#nav-lunch');
  click(67.95, '#nav-lunch');
  go(68.0, 'p-today');
  stepDone(68.9, 2, 'Đã duyệt bản 1 (300 suất).');
  stepDone(69.25, 3, 'DH20261019-1 (Chợ đầu mối Bình Điền)');
  stepDone(69.6, 4, 'Đã nhận đủ / đã đóng đơn.');
  stepDone(69.95, 5, 'Đã xuất XB20261019-1.');
  tl.call(() => { $('#k-actual-s').textContent = 'Đã chốt sau bữa trưa'; $('#k-per-s').textContent = 'Chi phí ngày 2.634.999,92 đ'; $('#k-value').textContent = '4,7 triệu đ'; }, null, 69.0);
  countUp(69.0, '#k-actual', 299, 1.3, (v) => viNum(Math.round(v)));
  countUp(69.1, '#k-per', 8812.71, 1.4, (v) => viNum(v, v >= 8812.7 ? 2 : 0) + ' đ');
  camTo(68.9, '#kpi-per', 1.3, 1.1, -120, 160);
  moveTo(70.2, '#btn-close-day', 0.85, 0, 0, '#btn-close-day');
  click(71.15, '#btn-close-day');
  stepDone(71.25, 6, 'Đóng bởi Nguyễn Thị Lan lúc 13:42.');
  tl.call(() => { const s = $('#k-state'); s.className = 'badge b-ok'; s.textContent = 'Đã đóng ngày'; sfx.success(); }, null, 71.3);
  toast(71.3, 'Đã đóng ngày 19/10/2026.', 2.0);
  camTo(71.6, '#kpi-per', 1.5, 1.0, 0, 30);
  callout(72.2, 'Cost per meal = day cost ÷ meals actually served', '#kpi-per', 2.3, 'below');
  camTo(74.4, null, 1, 0.8);
  moveTo(74.3, '#nav-report', 0.75, 0, 0, '#nav-report');
  click(75.1, '#nav-report');
  go(75.15, 'p-report');
  moveTo(75.9, '#rp-s4', 0.7, 0, 0, '#rp-s4');
  click(76.65, '#rp-s4');
  tl.call(() => { $('#rp-s1').classList.remove('on'); $('#rp-s4').classList.add('on'); }, null, 76.7);
  tl.to('#rp-over', { autoAlpha: 0, duration: 0.2 }, 76.7);
  tl.to('#rp-daily', { autoAlpha: 1, duration: 0.3 }, 76.8);
  const totalCost = DAILY.reduce((a, d) => a + d[1] * d[2], 0);
  const totalServ = DAILY.reduce((a, d) => a + d[2], 0);
  countUp(76.9, '#rp-total', totalCost / 1e6, 1.3, (v) => viNum(v, 1) + ' triệu đ');
  countUp(76.9, '#rp-serv', totalServ, 1.3, (v) => viNum(Math.round(v)));
  countUp(76.9, '#rp-avg', totalCost / totalServ, 1.3, (v) => viNum(Math.round(v)) + ' đ');
  tl.to('#rp-cols .col', { height: (i, el) => el.dataset.h + '%', duration: 0.6, stagger: 0.06, ease: 'power2.out' }, 77.0);
  tl.to('#rp-cols .vl', { opacity: 1, duration: 0.3 }, 78.0);
  camTo(77.0, '#rp-chart-card', 1.25, 1.0, 0, -20);
  camTo(78.3, () => ({ x: P('#btn-csv').x - 300, y: P('#btn-csv').y + 200 }), 1.2, 0.9);
  moveTo(78.4, '#btn-csv', 0.7, 0, 0, '#btn-csv');
  click(79.2, '#btn-csv');
  tl.call(sfx.download, null, 79.3);
  tl.set('#file', { x: () => P('#btn-csv').x - 180, y: () => P('#btn-csv').y - 40, scale: 0.5, rotation: -6 }, 79.3);
  tl.to('#file', { autoAlpha: 1, scale: 1, rotation: 0, x: 1420, y: 800, duration: 0.9, ease: 'power3.out' }, 79.3);
  camTo(79.6, null, 1, 1.0);
  tl.to('#file', { autoAlpha: 0, y: '+=30', duration: 0.4 }, 81.0);

  /* ---- 8 · Outro (81.2 – 90) */
  tl.to('#cursor', { autoAlpha: 0, duration: 0.3 }, 81.2);
  tl.to('#win', { scale: 0.4, y: -60, duration: 1.4, ease: 'power3.inOut', transformOrigin: '50% 0%' }, 81.4);
  tl.fromTo('#outro .o-title', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out', immediateRender: false }, 82.3);
  tl.to('#outro .o-stats', { autoAlpha: 1, duration: 0.01 }, 82.6);
  tl.fromTo('#outro .o-stat', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.18, ease: 'power3.out', immediateRender: false }, 82.7);
  tl.call(sfx.tick, null, 82.7); tl.call(sfx.tick, null, 82.88); tl.call(sfx.tick, null, 83.06); tl.call(sfx.tick, null, 83.24);
  tl.fromTo('#outro .o-tag', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, immediateRender: false }, 84.0);
  tl.fromTo('#outro .o-cta', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(2)', immediateRender: false }, 84.6);
  tl.to('#outro .o-cta', { scale: 1.05, duration: 0.6, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 85.4);
  tl.call(() => { if (audio.ok) audio.musicVol.volume.rampTo(-60, 3.5); }, null, 86.4);
  tl.to({}, { duration: 0.01 }, TOTAL - 0.01);

  subtitles();
}

/* ---------------------------------------------------------------- playback + controls */
const PRISTINE = stage.innerHTML;
const controls = document.getElementById('controls');
let playing = false, hideTimer = null, started = false;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function progress() {
  const t = tl.time();
  document.querySelector('#bar i').style.width = `${(t / TOTAL) * 100}%`;
  document.getElementById('time').textContent = `${fmtTime(t)} / ${fmtTime(TOTAL)}`;
}
function setIcons() {
  document.getElementById('ic-pause').style.display = playing ? '' : 'none';
  document.getElementById('ic-play').style.display = playing ? 'none' : '';
}
function showControls(autoHide) {
  controls.classList.remove('hidden');
  clearTimeout(hideTimer);
  if (autoHide && playing) hideTimer = setTimeout(() => controls.classList.add('hidden'), 1600);
}
function play() {
  playing = true; setIcons();
  tl.play();
  if ('speechSynthesis' in window) speechSynthesis.resume();
  if (audio.ok) window.Tone.Transport.start();
  controls.classList.add('hidden');
}
function pause() {
  playing = false; setIcons();
  tl.pause();
  speech.paused = true;
  if ('speechSynthesis' in window) speechSynthesis.pause();
  if (audio.ok) window.Tone.Transport.pause();
  showControls(false);
}
function finished() {
  playing = false; setIcons();
  if (audio.ok) { window.Tone.Transport.stop(); }
  showControls(false);
}
function restart() {
  if (tl) tl.kill();
  if (speech.cur) speech.cur.cut = true;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (audio.ok) { window.Tone.Transport.stop(); window.Tone.Transport.position = 0; audio.musicVol.volume.value = -21; }
  stage.innerHTML = PRISTINE;
  init();
  document.getElementById('start').remove();
  play();
}
function init() {
  fit();
  decorate();
  buildSubs();
  build();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#play')) {
    initAudioSafely().then(() => {
      document.getElementById('start').remove();
      started = true;
      play();
    });
  }
});
async function initAudioSafely() {
  try { if (window.Tone) { await window.Tone.start(); initAudio(); } } catch (e) { audio.ok = false; }
  if ('speechSynthesis' in window) { audio.voice = pickVoice(); speechSynthesis.cancel(); }
}
document.getElementById('c-play').addEventListener('click', () => (playing ? pause() : (tl.progress() >= 1 ? restart() : play())));
document.getElementById('c-restart').addEventListener('click', restart);
addEventListener('mousemove', () => { if (started) showControls(true); });
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
  if (!started) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : (tl.progress() >= 1 ? restart() : play()); }
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.key === 'm' || e.key === 'M') { muted = !muted; if (muted && 'speechSynthesis' in window) speechSynthesis.cancel(); if (audio.ok) window.Tone.Destination.mute = muted; }
});

/* Boot: GSAP và Tone.js tự host trong /gioi-thieu/vendor/ (CSP của app chỉ cho script cùng origin). */
async function boot() {
  const btn = document.getElementById('play');
  if (!window.gsap) { document.getElementById('play-t').textContent = 'Could not load GSAP'; return; }
  init();
  btn.disabled = false;
  document.getElementById('play-t').textContent = 'Play';
  window.__demo = { get tl() { return tl; }, restart };
}
boot();
})();
