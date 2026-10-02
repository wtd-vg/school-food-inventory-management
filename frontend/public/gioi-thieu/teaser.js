(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const DUR = 60;
const stage = $('#stage');
let scale = 1;
function fit(){ scale = Math.min(innerWidth/1920, innerHeight/1080); stage.style.transform = `translate(-50%,-50%) scale(${scale})`; }
addEventListener('resize', fit); fit();

let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647, (seed-1)/2147483646);
const fmt3 = v => v.toFixed(3);
const splitChars = el => { const t = el.textContent; el.textContent = ''; return [...t].map(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c === ' ' ? ' ' : c; el.appendChild(s); return s; }); };
const stagePoint = el => { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x:(r.left + r.width/2 - s.left)/scale, y:(r.top + r.height/2 - s.top)/scale }; };

/* ---------------- build dynamic DOM ---------------- */
// S1 line 1 words
$('#l1').innerHTML = 'tons of school food'.split(' ').map(w => `<span class="mask"><span class="w">${w}</span></span>`).join(' ');

// spreadsheet
const SHEET = [['Item','Stock','Need'],['Rice','182?','#REF!'],['Pork','??','21 kg?'],['Spinach','9.6','—'],['Eggs','#N/A','300?'],['Milk','12? 15?','??']];
const VALS = ['??','#REF!','12?','8 kg?','#N/A','15?','—','0?','3.2?','#VALUE!','21?','7?'];
const cells = [];
SHEET.forEach((r,ri) => r.forEach((v,ci) => { const d = document.createElement('div'); d.className = 'c' + (ri===0?' h':'') + (/[?#]/.test(v)?' bad':''); d.textContent = v; $('#grid').appendChild(d); if (ri>0 && ci>0) cells.push(d); }));

// cartons
const CARTONS = [[640,770,-14],[740,790,9],[838,768,-5],[930,792,16],[1030,774,-11],[700,676,6],[880,680,-18]];
CARTONS.forEach(([x,y,r],i) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('viewBox','0 0 96 140'); s.setAttribute('class','carton'); s.style.left = x+'px'; s.style.top = y+'px'; s.dataset.r = r;
  s.innerHTML = `<path d="M8 40 L48 6 L88 40 V136 H8 Z" fill="${i%2?'#cfc8bc':'#bdb5a8'}"/><path d="M8 40 H88" stroke="#9b9386" stroke-width="3"/>
    <rect x="16" y="62" width="64" height="34" rx="6" fill="#8f877a"/><text x="48" y="86" text-anchor="middle" font-family="Baloo 2,sans-serif" font-weight="800" font-size="22" fill="#e9e3d9">${i%3===0?'MILK':'EXP'}</text>
    <rect x="22" y="104" width="52" height="16" rx="4" fill="#9a5a4c" opacity=".7"/>`;
  $('#cartons').appendChild(s);
});

// grains (motif bursts)
const GRAINS = [];
for (let i=0;i<42;i++){ const g = document.createElement('div'); g.className='grain'; $('#grains').appendChild(g); GRAINS.push(g); }

// blobs
const BLOBS = [[120,140,260,'#FFE9BF'],[1580,90,330,'#E3F1E6'],[1660,780,220,'#FFE4DA'],[260,820,200,'#DCEBFA'],[960,980,160,'#FFF0C2']];
BLOBS.forEach(([x,y,s,c]) => { const b = document.createElement('div'); b.className='blob'; Object.assign(b.style,{left:x+'px',top:y+'px',width:s+'px',height:s+'px',background:c}); $('#blobs').appendChild(b); });

// stock rows
const ROWS = [['Jasmine rice','Gạo tẻ',182.5,'kg',.78,'var(--orange)'],['Lean pork','Thịt heo nạc',24,'kg',.4,'var(--protein)'],['Water spinach','Rau muống',9.6,'kg',.22,'var(--leaf)'],['Eggs','Trứng gà',420,'pcs',.62,'#D9A441'],['Yogurt','Sữa chua',380,'cups',.56,'var(--dairy)']];
ROWS.forEach(([n,vi,v,u,f,c],i) => {
  const r = document.createElement('div'); r.className='row';
  r.innerHTML = `<div class="n">${n}${i===2?'<span class="low">Low</span>':''}<small>${vi}</small></div><div class="track"><div class="fill" style="background:${c}"></div></div><div class="v"><span class="num">0</span> <small>${u}</small></div>`;
  $('#rows').appendChild(r);
});

// waterfall chart
const chart = $('#chart'), base = 360, k = 13.6; // px per kg
const BARS = [['Needed','21.000',0,21,'#E3B341','b'],['Reserve','+1.000',21,22,'#F1D9A6','b'],['From stock','−5.000',17,22,'#8DB34A','t'],['Arriving','−4.000',13,17,'#7FA6D1','t'],['To buy','13.000',0,13,'#FFC93C','b']];
let chartSvg = '', pts = [];
BARS.forEach(([lab,val,lo,hi,col,org],i) => {
  const x = 40 + i*156, w = 112, y = base - hi*k, h = (hi-lo)*k;
  chartSvg += `<rect class="bar" data-o="${org}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${col}" ${i===4?'stroke="#2A2522" stroke-width="3"':''}/>`;
  chartSvg += `<text class="bv" x="${x+w/2}" y="${y-14}" text-anchor="middle" font-size="26" font-weight="800" fill="#2A2522">${val}</text>`;
  chartSvg += `<text x="${x+w/2}" y="${base+36}" text-anchor="middle" font-size="21" font-weight="600" fill="#6B5F55">${lab}</text>`;
  pts.push([x, x+w, base - (org==='t'?lo:hi)*k]);
});
let d = `M${pts[0][1]} ${pts[0][2]}`; for (let i=1;i<pts.length;i++) d += ` L${pts[i][0]} ${pts[i-1][2]}` + (i<4?` M${pts[i][1]} ${pts[i][2]}`:'');
chartSvg = `<line x1="20" y1="${base}" x2="800" y2="${base}" stroke="#EADFC9" stroke-width="2"/><path id="conn" d="${d}" fill="none" stroke="#2A2522" stroke-width="2.5" opacity=".35"/>` + chartSvg +
  `<circle id="buyDot" cx="${40+4*156+56}" cy="${base-13*k-62}" r="9" fill="#FFC93C"/>`;
chart.innerHTML = chartSvg;

// impact stats + kids + confetti
const STATS = [['1','ledger','for every gram, in and out'],['7','steps','one screen, headcount to closed day'],['1','tap','menu + real photos to every parent']];
STATS.forEach(([n,u,cap]) => {
  const s = document.createElement('div'); s.className='stat';
  const digits = Array.from({length:10},(_,i)=>`<div>${(i+ +n+1)%10}</div>`).join('') + `<div>${n}</div>`;
  s.innerHTML = `<div class="sn"><div class="roll"><div class="col">${digits}</div></div><span class="unit">${u}</span></div><div class="cap"><span class="mask"><span>${cap}</span></span></div>`;
  $('#stats').appendChild(s);
});
const KIDC = [['#1F6B3A','#F2C9A0','#2A2522'],['#3B6FA8','#E0AC80','#4A2E1E'],['#C2452A','#F5D2B0','#2A2522'],['#8C3B1E','#D99C70','#1b1410'],['#E3B341','#F2C9A0','#3a2a1c'],['#5E7F2E','#E8B990','#2A2522'],['#7FA6D1','#F5D2B0','#4A2E1E']];
KIDC.forEach(([shirt,skin,hair],i) => {
  const k = document.createElement('div'); k.className='kid'; k.style.left = (180 + i*230) + 'px';
  k.innerHTML = `<svg viewBox="0 0 150 260" width="150" height="260">
    <rect x="52" y="200" width="18" height="52" rx="8" fill="#2A2522"/><rect x="80" y="200" width="18" height="52" rx="8" fill="#2A2522"/>
    <rect x="34" y="104" width="82" height="108" rx="30" fill="${shirt}"/>
    <circle cx="75" cy="62" r="40" fill="${skin}"/><path d="M35 58 a40 40 0 0 1 80 0 q-20 -14 -40 -10 q-22 2 -40 10z" fill="${hair}"/>
    <circle cx="61" cy="66" r="4" fill="#2A2522"/><circle cx="89" cy="66" r="4" fill="#2A2522"/><path d="M62 80 q13 12 26 0" stroke="#2A2522" stroke-width="4" fill="none" stroke-linecap="round"/>
    <rect x="12" y="136" width="126" height="26" rx="10" fill="#FFF8EC" stroke="#2A2522" stroke-width="3"/>
    <circle cx="40" cy="146" r="8" fill="#fff" stroke="#2A2522" stroke-width="2"/><rect x="62" y="139" width="20" height="14" rx="4" fill="#D9622E"/><circle cx="108" cy="146" r="9" fill="#8DB34A"/>
  </svg>`;
  $('#kids').appendChild(k);
});
const CONF = ['#FFC93C','#1F6B3A','#3B6FA8','#C2452A','#8DB34A','#FFF8EC'];
const CONFS = [];
for (let i=0;i<34;i++){ const c=document.createElement('div'); c.className='confetti'; c.style.background=CONF[i%CONF.length]; $('#confetti').appendChild(c); CONFS.push(c); }

// subtitles + voice lines: [start, end, subtitle, spoken]
const LINES = [
  [0.6, 5.5, 'U.S. schools waste an estimated 530,000 tons of food a year.', 'U.S. schools waste an estimated five hundred and thirty thousand tons of food a year.'],
  [6.4, 10.1, 'Mornings run on guesswork, paper lists, and spreadsheets nobody trusts.'],
  [10.4, 13.8, "By noon, no one knows what's really left in the kitchen."],
  [16.4, 19.3, 'What if every gram had a place?'],
  [20.6, 21.7, 'Meet SchoolFood.'],
  [21.9, 25.3, 'Inventory and school lunch, managed in one place.'],
  [26.5, 30.7, 'Stock updates the moment food comes in, or goes out.'],
  [31.3, 35.7, 'Three hundred meals? It works out every gram, straight from your recipes.'],
  [36.3, 40.6, "Then it orders exactly what's missing. Not a gram more."],
  [41.3, 45.4, 'And parents see the real lunch. Photos and all.'],
  [46.5, 50.6, 'One ledger. One screen for the day. One tap for every parent.'],
  [51.0, 53.5, 'Calmer kitchens. Happier kids.'],
  [54.6, 58.9, 'SchoolFood — schoolfoodusth.store', 'SchoolFood. Find us at school food, U S T H, dot store.'],
];
LINES.forEach(l => { const d = document.createElement('div'); d.className='sub'; d.innerHTML = l[2].split(' ').map(w=>`<span class="w">${w}</span>`).join(''); $('#subs').appendChild(d); gsap.set(d, { xPercent:-50 }); l.el = d; });

/* ---------------- voice ---------------- */
let voice = null;
function pickVoice(){
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
  const pref = [/Natural/i,/Neural/i,/(Aria|Jenny|Guy|Davis|Ava|Andrew|Emma)/i,/Google US English/i,/Samantha/i];
  for (const p of pref){ const v = vs.find(x => p.test(x.name)); if (v) { voice = v; return; } }
  voice = vs[0] || null;
}
if ('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text){
  if (!('speechSynthesis' in window) || !playing) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .95; u.pitch = 1; u.volume = 1;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/* ---------------- master timeline ---------------- */
const tl = gsap.timeline({ paused:true, defaults:{ ease:'power3.out' } });
const dot = $('#dot');
gsap.set(dot, { x:960, y:-60, xPercent:-50, yPercent:-50 });
gsap.set('#shell', { transformPerspective:1800 });
tl.set({}, {}, DUR);

/* S1 — HOOK 0–6 */
tl.set('#s1', { autoAlpha:1 }, 0);
tl.to(dot, { y:250, duration:.5, ease:'power2.in' }, 0);
tl.to(dot, { scaleX:1.8, scaleY:.45, duration:.06, ease:'power1.out' }, .5);
tl.to(dot, { scaleX:1, scaleY:1, y:236, duration:.6, ease:'elastic.out(1,.35)' }, .56);
tl.to(dot, { y:248, duration:1.1, ease:'sine.inOut', yoyo:true, repeat:3 }, 1.2);
const cnt = { v:0 }, statEl = $('#stat');
tl.fromTo(statEl, { scale:.55, autoAlpha:0 }, { scale:1, autoAlpha:1, duration:.55, ease:'back.out(2)' }, .5);
tl.to(cnt, { v:530000, duration:1.5, ease:'power2.out', onUpdate:() => statEl.textContent = Math.round(cnt.v).toLocaleString('en-US') }, .5);
tl.from('#l1 .w', { yPercent:115, duration:.5, stagger:.07, ease:'expo.out' }, 2.0);
tl.from('#w1', { yPercent:115, scale:1.8, duration:.35, ease:'expo.out' }, 3.0);
tl.from('#w2', { yPercent:115, duration:.45, ease:'expo.out' }, 3.5);
tl.from('#cite', { y:-30, autoAlpha:0, duration:.5 }, 4.0);
tl.to('#stat', { scale:1.06, duration:2, ease:'none' }, 3.6);
// CRT collapse + glitch out
tl.to(['#stat','#l1','#l2'], { skewX:18, x:24, duration:.05, yoyo:true, repeat:3, ease:'none', stagger:.03 }, 5.55);
tl.to(['#stat','#l1','#l2','#cite'], { scaleY:.02, scaleX:1.3, duration:.14, ease:'power4.in' }, 5.86);
tl.set('#s1', { autoAlpha:0 }, 6.0);
// dot bursts into grains
tl.to(dot, { scale:0, duration:.1, ease:'power2.in' }, 5.95);
GRAINS.forEach((g,i) => {
  const bx = 960 + (rnd()-.5)*900, by = 236 - rnd()*220, tx = 1565 + (rnd()-.5)*90, ty = 760 + rnd()*20;
  tl.set(g, { autoAlpha:1, x:960, y:240, rotation:rnd()*180, backgroundColor:'#FFC93C' }, 6.0);
  tl.to(g, { x:bx, y:by, duration:.45, ease:'power2.out' }, 6.0);
  tl.to(g, { x:tx, y:ty, rotation:'+=240', backgroundColor:'#8a8378', duration:.9 + rnd()*.9, ease:'power2.in' }, 6.45 + rnd()*.4);
  tl.set(g, { autoAlpha:0 }, 8.4);
});

/* S2 — PROBLEM 6–14 */
tl.set('#s2', { autoAlpha:1 }, 6.0);
tl.to('#bg', { backgroundColor:'#25221f', duration:.25, ease:'none' }, 6.0);
gsap.set('#clip', { rotation:-6 });
tl.from('#clip', { x:-700, rotation:-28, duration:.8, ease:'back.out(1.3)' }, 6.05);
tl.from('#sheet', { x:760, rotation:16, duration:.8, ease:'back.out(1.3)' }, 6.5);
tl.from('#bin', { y:420, duration:.6, ease:'back.out(1.6)' }, 6.2);
$$('#clip .scrib path').forEach((p,i) => { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray:L, strokeDashoffset:L }); tl.to(p, { strokeDashoffset:0, duration:.35, ease:'power1.inOut' }, 6.7 + i*.22); });
$$('.carton').forEach((c,i) => {
  tl.fromTo(c, { y:-1000, rotation:+c.dataset.r*3 }, { y:0, rotation:+c.dataset.r, duration:.55, ease:'bounce.out' }, 7.0 + i*.5);
});
let lastK = -1;
tl.to({ p:0 }, { p:1, duration:7.5, ease:'none', onUpdate(){ const k = Math.floor(this.progress()*60); if (k !== lastK){ lastK = k; cells.forEach((c,i) => { if ((k+i)%3===0) c.textContent = VALS[(k*7+i*5)%VALS.length]; }); } } }, 6.5);
const PW = $$('#pwords div'), PWT = [6.45, 7.55, 8.6, 10.45];
PW.forEach((w,i) => {
  tl.fromTo(w, { autoAlpha:1, x:-60, skewX:35, scaleY:1.3 }, { x:0, skewX:0, scaleY:1, duration:.22, ease:'steps(4)', immediateRender:false }, PWT[i]);
  tl.set(w, { autoAlpha:0 }, i < 3 ? PWT[i+1] : 15.0);
  if (i < 3) tl.to(w, { x:60, skewX:-30, duration:.08, ease:'none' }, PWT[i+1]-.08);
});
// tension jitter on beats, rising
for (let b=8, n=0; b<14; b+=.5, n++){
  const amp = 4 + n*1.4;
  tl.to('#shake', { x:(rnd()-.5)*amp*2, y:(rnd()-.5)*amp, duration:.05, yoyo:true, repeat:1, ease:'none' }, b);
}
[[9,'#gb1'],[11,'#gb2'],[12.5,'#gb3'],[13.25,'#gb1'],[13.5,'#gb2'],[13.75,'#gb3']].forEach(([t,s]) => {
  tl.fromTo(s, { autoAlpha:1, x:-140 }, { x:140, duration:.14, ease:'steps(3)', immediateRender:false }, t);
  tl.set(s, { autoAlpha:0 }, t+.15);
});
gsap.set('#s2', { filter:'saturate(.35) contrast(1) brightness(1)' });
tl.to('#s2', { filter:'saturate(0) contrast(1.1) brightness(1)', duration:.4, ease:'none' }, 8);
// FREEZE 14
tl.set('#shake', { x:0, y:0 }, 14.0);
tl.to('#world', { scale:1.05, duration:1, ease:'power2.out' }, 14.0);
tl.to('#s2', { filter:'saturate(0) contrast(1.25) brightness(.8)', duration:.12, ease:'none' }, 14.0);
// COLLAPSE into the motif 15–16
const collapse = ['#clip','#sheet','#bin',...$$('.carton'),'#pwords'];
collapse.forEach((s,i) => {
  tl.to(s, { x:() => { const p = stagePoint(typeof s==='string'?$(s):s); return '+=' + (960 - p.x); }, y:() => { const p = stagePoint(typeof s==='string'?$(s):s); return '+=' + (560 - p.y); },
    scale:0, rotation:'+=200', duration:.75, ease:'power3.in' }, 15.0 + i*.045);
});
tl.to('#world', { scale:1, duration:.8, ease:'power2.inOut' }, 15.0);
tl.set('#s2', { autoAlpha:0 }, 16.0);
tl.to('#bg', { backgroundColor:'#15110F', duration:.4, ease:'none' }, 15.6);

/* S3 — TURN 15.6–20 */
tl.set(dot, { x:960, y:560, scale:0, scaleX:1, scaleY:1, width:22, height:22 }, 15.5);
tl.to(dot, { scale:1, duration:.5, ease:'back.out(3)' }, 15.75);
tl.to(dot, { scale:1.7, boxShadow:'0 0 90px 30px rgba(255,201,60,.7)', duration:.5, yoyo:true, repeat:5, ease:'sine.inOut' }, 16.3);
tl.set('#s3', { autoAlpha:1 }, 16.3);
const TURN = (() => { const el = $('#turn'); const lines = el.innerHTML.split('<br>'); el.innerHTML = ''; const all = [];
  lines.forEach((ln,li) => { const d = document.createElement('div'); d.textContent = ln; el.appendChild(d); all.push(...splitChars(d)); }); return all; })();
tl.from(TURN, { y:60, autoAlpha:0, rotation:8, duration:.5, stagger:.022, ease:'back.out(2)' }, 16.4);
tl.to(TURN, { x:(i,el) => 960 - stagePoint(el).x, y:(i,el) => 560 - stagePoint(el).y, scale:0, duration:.55, stagger:.008, ease:'power3.in' }, 19.0);
tl.to(dot, { scale:.35, duration:.45, ease:'power4.in' }, 19.5);

/* S4 — REVEAL (drop at 20.0) */
tl.set('#flash', { autoAlpha:1, clipPath:'circle(0px at 960px 560px)', backgroundColor:'#FFC93C' }, 20.0);
tl.to('#flash', { clipPath:'circle(1300px at 960px 560px)', duration:.45, ease:'expo.out' }, 20.0);
tl.set('#bg', { backgroundColor:'#FFF8EC' }, 20.45);
tl.set('#s3', { autoAlpha:0 }, 20.0);
tl.to('#flash', { backgroundColor:'#FFF8EC', duration:.35, ease:'none' }, 20.3);
tl.set('#flash', { autoAlpha:0 }, 20.7);
tl.to(dot, { x:960, y:400, width:240, height:240, borderRadius:60, scale:1, boxShadow:'0 30px 60px -20px rgba(140,90,0,.45)', duration:.75, ease:'back.out(1.7)' }, 20.0);
tl.set('#dotIcon', { autoAlpha:1 }, 20.15);
$$('#dotIcon path').forEach((p,i) => { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray:L, strokeDashoffset:L }); tl.to(p, { strokeDashoffset:0, duration:.7, ease:'power2.inOut' }, 20.2 + i*.25); });
tl.to('#dotIcon .steam', { y:-1.2, duration:.75, yoyo:true, repeat:5, ease:'sine.inOut' }, 21.0);
tl.set('#s4', { autoAlpha:1 }, 20.3);
const WM = splitChars($('#wordmark').childNodes[0].nodeType===3 ? (() => { const s = document.createElement('span'); s.textContent = 'School'; $('#wordmark').replaceChild(s, $('#wordmark').childNodes[0]); return s; })() : $('#wordmark'));
const WMF = splitChars($('#wordmark .f'));
tl.from([...WM, ...WMF], { y:140, rotation:12, autoAlpha:0, duration:.6, stagger:.045, ease:'back.out(2.2)' }, 20.55);
tl.from('#tagline .mask>span', { yPercent:110, duration:.6, stagger:.12, ease:'expo.out' }, 21.9);
tl.from('.blob', { scale:0, duration:.9, stagger:.08, ease:'back.out(1.6)' }, 20.4);
$$('.blob').forEach((b,i) => tl.to(b, { y:(i%2?-1:1)*70, x:(i%3-1)*40, duration:25, ease:'none' }, 21.3));
tl.to(dot, { y:388, duration:1.2, ease:'sine.inOut', yoyo:true, repeat:1 }, 22.6);
// exit + morph logo → UI card
tl.to([...WM, ...WMF], { y:-90, autoAlpha:0, duration:.3, stagger:.018, ease:'power2.in' }, 25.25);
tl.to('#tagline .mask>span', { yPercent:110, duration:.35, ease:'power2.in' }, 25.25);
tl.to('#dotIcon', { scale:0, duration:.25, ease:'power2.in' }, 25.55);
tl.to(dot, { x:1320, y:540, width:920, height:740, borderRadius:32, backgroundColor:'#FFFFFF', boxShadow:'0 50px 90px -40px rgba(42,37,34,.45)', duration:.7, ease:'expo.inOut' }, 25.6);
tl.set('#sf', { autoAlpha:1 }, 26.0);
tl.set('#shell', { autoAlpha:1 }, 26.3);
tl.set(dot, { autoAlpha:0 }, 26.32);
tl.set('#s4 #wordmark, #s4 #tagline', { autoAlpha:0 }, 26.3);

/* FEATURES */
function headIn(id, t){ tl.set(id, { autoAlpha:1 }, t); tl.fromTo(`${id} .mask>span`, { yPercent:115 }, { yPercent:0, duration:.65, stagger:.07, ease:'expo.out', immediateRender:false }, t); }
function headOut(id, t){ tl.to(`${id} .mask>span`, { yPercent:-115, duration:.32, stagger:.03, ease:'power3.in' }, t); tl.set(id, { autoAlpha:0 }, t+.55); }
function flip(from, to, t){
  tl.to('#shell', { rotationY:88, duration:.25, ease:'power2.in' }, t-.25);
  tl.set(from, { autoAlpha:0 }, t); tl.set(to, { autoAlpha:1 }, t);
  tl.fromTo('#shell', { rotationY:-88 }, { rotationY:0, duration:.55, ease:'back.out(1.5)', immediateRender:false }, t);
}
tl.to('#world', { x:-24, duration:19.4, ease:'none' }, 26);
tl.to('#world', { x:0, duration:.6, ease:'expo.inOut' }, 45.75);

// F1 — stock
headIn('#fh1', 26.15);
tl.set('#p1', { autoAlpha:1 }, 26.3);
tl.from('#p1 .ph', { y:-20, autoAlpha:0, duration:.4 }, 26.3);
tl.from('#rows .row', { x:50, autoAlpha:0, duration:.45, stagger:.07 }, 26.35);
$$('#rows .row').forEach((r,i) => {
  const o = { v:0 }, num = r.querySelector('.num'), [, , v, u] = ROWS[i];
  tl.to(r.querySelector('.fill'), { scaleX:ROWS[i][4], duration:1.1, ease:'power3.out' }, 26.6 + i*.08);
  tl.to(o, { v, duration:1.1, ease:'power3.out', onUpdate:() => num.textContent = u==='kg' ? o.v.toFixed(1) : Math.round(o.v) }, 26.6 + i*.08);
});
tl.to('.live i', { boxShadow:'0 0 0 10px rgba(255,201,60,0)', duration:.5, repeat:8, ease:'power1.out' }, 26.5);
tl.fromTo('#toast1', { autoAlpha:1, y:140 }, { y:0, duration:.5, ease:'back.out(1.7)', immediateRender:false }, 28.4);
tl.from('#toast1 .ok', { scale:0, rotation:-90, duration:.4, ease:'back.out(3)' }, 28.6);
const pork = $$('#rows .row')[1], porkO = { v:24 };
tl.to(pork, { backgroundColor:'#FFF6E0', duration:.2, yoyo:true, repeat:1 }, 28.6);
tl.to(pork.querySelector('.fill'), { scaleX:.62, duration:.7, ease:'power3.out' }, 28.7);
tl.to(porkO, { v:37, duration:.7, ease:'power3.out', onUpdate:() => pork.querySelector('.num').textContent = porkO.v.toFixed(1) }, 28.7);
tl.fromTo('#plus13', { autoAlpha:1, y:30, scale:.6 }, { y:-36, scale:1, duration:.6, ease:'back.out(2)', immediateRender:false }, 28.7);
tl.to('#plus13', { y:-80, autoAlpha:0, duration:.4, ease:'power2.in' }, 29.8);

// F2 — demand
headOut('#fh1', 30.6); headIn('#fh2', 31.05);
flip('#p1', '#p2', 31.0);
['#e1','#e2','#e3','#e4','#e5'].forEach((s,i) => tl.fromTo(s, { autoAlpha:1, scale:.3, y:30 }, { scale:1, y:0, duration:.45, ease:'back.out(2.4)', immediateRender:false }, [31.3,31.65,31.8,32.15,32.3][i]));
const e5o = { v:0 };
tl.to(e5o, { v:21, duration:.6, ease:'power2.out', onUpdate:() => $('#e5n').textContent = fmt3(e5o.v) }, 32.3);
$$('#chart .bar').forEach((b,i) => {
  const o = b.dataset.o==='t' ? '50% 0%' : '50% 100%';
  tl.fromTo(b, { scaleY:0, transformOrigin:o }, { scaleY:1, transformOrigin:o, duration:.45, ease:'back.out(1.6)', immediateRender:true }, 32.8 + i*.5);
});
$$('#chart .bv').forEach((t,i) => tl.from(t, { y:16, autoAlpha:0, duration:.3 }, 33.0 + i*.5));
(() => { const c = $('#conn'), L = c.getTotalLength(); gsap.set(c, { strokeDasharray:L, strokeDashoffset:L }); tl.to(c, { strokeDashoffset:0, duration:2.2, ease:'none' }, 32.8); })();
tl.from('#buyDot', { scale:0, transformOrigin:'50% 50%', duration:.45, ease:'back.out(3)' }, 34.95);
tl.to('#buyDot', { attr:{ r:14 }, duration:.35, yoyo:true, repeat:1, ease:'sine.inOut' }, 35.3);

// F3 — order + receive
headOut('#fh2', 35.6); headIn('#fh3', 36.05);
flip('#p2', '#p3', 36.0);
tl.from('#p3 .po, #p3 .poline, #sendBtn, #p3 .recv', { y:30, autoAlpha:0, duration:.4, stagger:.07 }, 36.05);
const ring = $('#ring'), RC = 2*Math.PI*80; gsap.set(ring, { strokeDasharray:RC, strokeDashoffset:RC }); gsap.set('#ringOk', { scale:0, transformOrigin:'50% 50%' });
tl.set('#cur', { autoAlpha:1, x:760, y:640 }, 36.4);
tl.to('#cur', { x:430, duration:.85, ease:'power2.inOut' }, 36.5);
tl.to('#cur', { y:330, duration:.85, ease:'power3.inOut' }, 36.5);
tl.to('#cur', { scale:.82, duration:.08, yoyo:true, repeat:1, ease:'power1.inOut' }, 37.38);
tl.to('#ripple', { scale:9, autoAlpha:0, duration:.6, ease:'power2.out' }, 37.4);
tl.to('#sendBtn', { backgroundColor:'#1F6B3A', duration:.2 }, 37.5);
tl.to('#btnTxt', { yPercent:-100, autoAlpha:0, duration:.15 }, 37.45);
tl.fromTo('#btnTxt2', { autoAlpha:1, yPercent:100 }, { yPercent:0, duration:.25, ease:'back.out(2)', immediateRender:false }, 37.6);
tl.to('#pillA', { yPercent:-100, duration:.3, ease:'power3.inOut' }, 37.55);
tl.to('#pillB', { yPercent:-100, duration:.3, ease:'power3.inOut' }, 37.55);
tl.to('#cur', { x:560, y:720, duration:.6, ease:'power2.inOut' }, 37.7);
tl.set('#cur', { autoAlpha:0 }, 38.3);
const rcvO = { v:0 };
tl.to(ring, { strokeDashoffset:RC*(1-10/13), duration:.6, ease:'power3.out' }, 38.2);
tl.to(rcvO, { v:10, duration:.6, ease:'power3.out', onUpdate:() => $('#rcv').textContent = fmt3(rcvO.v) }, 38.2);
tl.to(ring, { strokeDashoffset:0, stroke:'#2E9D57', duration:.55, ease:'power3.out' }, 39.0);
tl.to(rcvO, { v:13, duration:.55, ease:'power3.out', onUpdate:() => $('#rcv').textContent = fmt3(rcvO.v) }, 39.0);
tl.to('#ringOk', { scale:1, duration:.4, ease:'back.out(3)' }, 39.35);
tl.fromTo('#plus4', { autoAlpha:1, x:300, scale:.7 }, { x:0, scale:1, duration:.3, ease:'power3.out', immediateRender:false }, 39.75);
tl.to('#plus4', { x:'+=14', duration:.05, yoyo:true, repeat:7, ease:'none' }, 40.05);
tl.fromTo('#err', { autoAlpha:1, clipPath:'inset(0% 100% 0% 0%)' }, { clipPath:'inset(0% 0% 0% 0%)', duration:.3, ease:'power2.out', immediateRender:false }, 40.05);
tl.to('#plus4', { y:220, rotation:25, autoAlpha:0, duration:.4, ease:'power2.in' }, 40.5);

// F4 — phone morph + parent email
headOut('#fh3', 40.55); headIn('#fh4', 41.05);
tl.to('#p3', { scale:.85, autoAlpha:0, duration:.25, ease:'power2.in' }, 40.6);
tl.to('#shell', { left:1105, top:96, width:440, height:888, borderRadius:66, backgroundColor:'#2A2522', duration:.6, ease:'expo.inOut' }, 40.75);
tl.set('#p4', { autoAlpha:1 }, 41.25);
tl.fromTo('#screen', { clipPath:'inset(0 0 100% 0 round 50px)' }, { clipPath:'inset(0 0 0% 0 round 50px)', duration:.5, ease:'expo.out', immediateRender:false }, 41.25);
tl.from('#p4 .mailhead > *, #p4 .hi, #dishes .dish, #p4 .photoLbl', { y:24, autoAlpha:0, duration:.35, stagger:.05 }, 41.35);
gsap.set('#photo svg', { filter:'blur(14px) saturate(0) brightness(1.5)' });
tl.fromTo('#pflash', { autoAlpha:1 }, { autoAlpha:0, duration:.45, ease:'power2.out', immediateRender:false }, 41.9);
tl.to('#photo svg', { filter:'blur(0px) saturate(1) brightness(1)', duration:.8, ease:'power2.out' }, 41.95);
tl.fromTo('#realtag', { autoAlpha:1, scale:0 }, { scale:1, duration:.35, ease:'back.out(3)', immediateRender:false }, 42.7);
tl.to('#scroll', { y:-170, duration:.9, ease:'power2.inOut' }, 42.9);
tl.fromTo('#sent', { autoAlpha:1, scale:.4, x:-40 }, { scale:1, x:0, duration:.45, ease:'back.out(2.4)', immediateRender:false }, 43.6);
['#env1','#env2','#env3'].forEach((s,i) => {
  tl.fromTo(s, { autoAlpha:1, x:1300, y:520 + i*60, rotation:-10 }, { x:1960 + i*40, y:200 + i*130, rotation:18, duration:1.1, ease:'power2.in', immediateRender:false }, 43.8 + i*.15);
});

// IMPACT transition: phone → full-bleed yellow
headOut('#fh4', 45.45);
tl.to('#p4, #sent', { scale:.9, autoAlpha:0, duration:.25, ease:'power2.in' }, 45.6);
tl.to('#shell', { left:0, top:0, width:1920, height:1080, borderRadius:0, backgroundColor:'#FFC93C', boxShadow:'0 0 0 0 rgba(0,0,0,0)', duration:.65, ease:'expo.inOut' }, 45.75);
tl.set('#bg', { backgroundColor:'#FFC93C' }, 46.4);
tl.set('#sf, #s4', { autoAlpha:0 }, 46.42);
tl.set('#world', { x:0 }, 46.42);

/* S6 — IMPACT 46.4–54 */
tl.set('#s6', { autoAlpha:1 }, 46.4);
$$('.stat').forEach((s,i) => {
  const t = [46.6, 47.7, 48.9][i], col = s.querySelector('.col');
  tl.from(s.querySelector('.unit'), { x:-30, autoAlpha:0, duration:.4 }, t+.35);
  tl.fromTo(col, { yPercent:0 }, { yPercent:-100*10/11, duration:.9, ease:'power4.out', immediateRender:true }, t);
  tl.from(s.querySelector('.roll'), { scale:.7, autoAlpha:0, duration:.35, ease:'back.out(2)' }, t);
  tl.from(s.querySelector('.cap .mask>span'), { yPercent:110, duration:.5, ease:'expo.out' }, t+.45);
});
$$('.kid').forEach((k,i) => {
  tl.fromTo(k, { x:1600 }, { x:0, duration:1.2, ease:'power3.out', immediateRender:true }, 50.4 + i*.07);
  tl.to(k, { y:-22, duration:.25, yoyo:true, repeat:5, ease:'sine.inOut' }, 51.5 + (i%2)*.25);
});
CONFS.forEach((c,i) => {
  const x = 120 + rnd()*1680;
  tl.set(c, { autoAlpha:1, x, y:-40, rotation:rnd()*360 }, 50.9);
  tl.to(c, { y:1120, x:x + (rnd()-.5)*300, rotation:'+=' + (360 + rnd()*360), duration:1.6 + rnd()*1.2, ease:'power1.in' }, 50.9 + rnd()*.5);
});
// exit
tl.to('.stat', { y:260, rotation:(i) => (i-1)*8, autoAlpha:0, duration:.45, stagger:.06, ease:'power3.in' }, 53.55);
tl.to('.kid', { y:420, duration:.45, stagger:.03, ease:'power3.in' }, 53.6);

/* S7 — CTA 54–60 */
tl.set('#bg', { backgroundColor:'#FFF8EC' }, 54.05);
tl.set('#s6', { autoAlpha:0 }, 54.1);
tl.set('#iris', { autoAlpha:1, clipPath:'circle(1500px at 960px 280px)' }, 54.0);
tl.to('#iris', { clipPath:'circle(0px at 960px 280px)', duration:.6, ease:'power3.inOut' }, 54.0);
tl.set('#iris', { autoAlpha:0 }, 54.62);
tl.set('#s7', { autoAlpha:1 }, 54.0);
tl.fromTo('#ctaLogo', { autoAlpha:1, scale:0, rotation:-20 }, { scale:1, rotation:0, duration:.7, ease:'back.out(2.4)', immediateRender:false }, 54.45);
$$('#ctaLogo path').forEach((p,i) => { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray:L, strokeDashoffset:L }); tl.to(p, { strokeDashoffset:0, duration:.6, ease:'power2.inOut' }, 54.6 + i*.2); });
const CN = (() => { const el = $('#ctaName'); const s = document.createElement('span'); s.textContent = 'School'; el.replaceChild(s, el.childNodes[0]); return [...splitChars(s), ...splitChars($('#ctaName .f'))]; })();
tl.from(CN, { y:120, rotation:10, autoAlpha:0, duration:.55, stagger:.04, ease:'back.out(2.2)' }, 54.8);
tl.from('#ctaTag .mask>span', { yPercent:110, duration:.6, ease:'expo.out' }, 55.4);
tl.fromTo('#url', { autoAlpha:1, clipPath:'inset(0% 50% 0% 50% round 48px)' }, { clipPath:'inset(0% 0% 0% 0% round 48px)', duration:.5, ease:'expo.out', immediateRender:false }, 55.8);
const URLC = [...splitChars($('#urlA')), ...splitChars($('#urlB'))];
tl.from(URLC, { y:30, autoAlpha:0, duration:.25, stagger:.025, ease:'back.out(2)' }, 56.0);
// the motif lands as the "." of the URL
tl.set(dot, { autoAlpha:1, width:16, height:16, borderRadius:'50%', backgroundColor:'#FFC93C', boxShadow:'0 0 24px 4px rgba(255,201,60,.6)', scale:1, x:() => stagePoint($('#slot')).x, y:640 }, 56.3);
tl.to(dot, { y:() => stagePoint($('#slot')).y + 1, duration:.35, ease:'power2.in' }, 56.3);
tl.to(dot, { scaleX:1.6, scaleY:.55, duration:.06 }, 56.65);
tl.to(dot, { scaleX:1, scaleY:1, duration:.5, ease:'elastic.out(1,.35)' }, 56.71);
tl.to('#ctaLogo', { scale:1.06, duration:.25, yoyo:true, repeat:1, ease:'sine.inOut' }, 58.0);
tl.to('#world', { scale:1.02, duration:6, ease:'none' }, 54.0);

/* subtitles */
LINES.forEach(([t0,t1,, spoken], i) => {
  const el = LINES[i].el, words = el.querySelectorAll('.w');
  tl.set(el, { autoAlpha:1 }, t0);
  tl.fromTo(words, { y:26, autoAlpha:0 }, { y:0, autoAlpha:1, duration:.3, stagger:.035, ease:'back.out(2)', immediateRender:false }, t0);
  tl.to(el, { y:-12, autoAlpha:0, duration:.2, ease:'power2.in' }, t1);
  tl.call(() => say(spoken || LINES[i][2]), null, t0);
});

/* ---------------- audio (Tone.js) ---------------- */
let A = null, audioOK = false;
const audioStats = window.__audioStats = { dup:0, err:0 };
async function initAudio(){
  if (A || !window.Tone) return;
  await Tone.start();
  Tone.context.lookAhead = 0.06;
  const T = Tone.Transport; T.bpm.value = 120;
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(1).connect(limiter);
  const music = new Tone.Gain(Tone.dbToGain(-13)).connect(master);
  const sfxBus = new Tone.Gain(Tone.dbToGain(-11)).connect(master);
  const rev = new Tone.Reverb({ decay:3.4, wet:.3 }); await rev.generate(); rev.connect(music);
  const both = n => { n.connect(music); n.connect(rev); return n; };

  const droneF = new Tone.Filter(420, 'lowpass').connect(music);
  const drone = new Tone.FMSynth({ harmonicity:.5, modulationIndex:2.5, oscillator:{ type:'sine' }, modulation:{ type:'triangle' },
    envelope:{ attack:1.5, decay:0, sustain:1, release:2.5 }, modulationEnvelope:{ attack:2, decay:0, sustain:1, release:2 } }).connect(droneF);
  drone.volume.value = -2;
  const kick = new Tone.MembraneSynth({ pitchDecay:.045, octaves:6, envelope:{ attack:.001, decay:.42, sustain:0, release:.1 } }).connect(music); kick.volume.value = 2;
  const clapF = new Tone.Filter(1600, 'bandpass'); both(clapF);
  const clap = new Tone.NoiseSynth({ noise:{ type:'white' }, envelope:{ attack:.001, decay:.16, sustain:0 } }).connect(clapF); clap.volume.value = -6;
  const hatF = new Tone.Filter(7500, 'highpass').connect(music);
  const hat = new Tone.NoiseSynth({ noise:{ type:'white' }, envelope:{ attack:.001, decay:.045, sustain:0 } }).connect(hatF); hat.volume.value = -14;
  const crashF = new Tone.Filter(3500, 'highpass'); both(crashF);
  const crash = new Tone.NoiseSynth({ noise:{ type:'white' }, envelope:{ attack:.001, decay:1.6, sustain:0 } }).connect(crashF); crash.volume.value = -14;
  const bass = new Tone.MonoSynth({ oscillator:{ type:'sawtooth' }, filter:{ Q:2, type:'lowpass' },
    filterEnvelope:{ attack:.005, decay:.18, sustain:.25, baseFrequency:70, octaves:2.6 }, envelope:{ attack:.004, decay:.2, sustain:.5, release:.12 } }).connect(music);
  bass.volume.value = -6;
  const padF = new Tone.Filter(1700, 'lowpass'); both(padF);
  const pad = new Tone.PolySynth(Tone.Synth, { oscillator:{ type:'fatsawtooth', count:3, spread:28 }, envelope:{ attack:.5, decay:.4, sustain:.7, release:1.8 } }).connect(padF);
  pad.volume.value = -17;
  const delay = new Tone.FeedbackDelay(.375, .28); both(delay);
  const pluck = new Tone.PolySynth(Tone.Synth, { oscillator:{ type:'triangle' }, envelope:{ attack:.002, decay:.22, sustain:0, release:.15 } }).connect(delay);
  pluck.volume.value = -15;
  const tenseF = new Tone.Filter(900, 'lowpass'); both(tenseF);
  const tense = new Tone.Synth({ oscillator:{ type:'square' }, envelope:{ attack:.004, decay:.14, sustain:0, release:.08 } }).connect(tenseF); tense.volume.value = -16;
  const tense2 = new Tone.Synth({ oscillator:{ type:'square' }, envelope:{ attack:.002, decay:.06, sustain:0, release:.04 } }).connect(tenseF); tense2.volume.value = -20;
  const riserF = new Tone.Filter({ frequency:200, type:'lowpass', Q:5 });
  const riserG = new Tone.Gain(0).connect(music); riserF.connect(riserG);
  const riser = new Tone.Noise('pink').connect(riserF); riser.start();
  const riseTone = new Tone.Synth({ oscillator:{ type:'sine' }, envelope:{ attack:2, decay:0, sustain:1, release:.05 } }); both(riseTone); riseTone.volume.value = -20;
  // SFX
  const wF = new Tone.Filter({ frequency:400, type:'bandpass', Q:1.1 });
  const wEnv = new Tone.AmplitudeEnvelope({ attack:.14, decay:.15, sustain:0, release:.25 }).connect(sfxBus); wF.connect(wEnv);
  const wNoise = new Tone.Noise('white').connect(wF); wNoise.start();
  const pop = new Tone.MembraneSynth({ pitchDecay:.02, octaves:3, envelope:{ attack:.001, decay:.12, sustain:0, release:.05 } }).connect(sfxBus); pop.volume.value = -4;
  const thud = new Tone.MembraneSynth({ pitchDecay:.06, octaves:3, envelope:{ attack:.001, decay:.25, sustain:0, release:.05 } }).connect(sfxBus); thud.volume.value = -2;
  const tick = new Tone.MetalSynth({ envelope:{ attack:.001, decay:.03, release:.01 }, harmonicity:5.1, modulationIndex:16, resonance:3200, octaves:1 }).connect(sfxBus);
  tick.frequency.value = 500; tick.volume.value = -26;
  const crush = new Tone.BitCrusher(3).connect(sfxBus);
  const glitch = new Tone.NoiseSynth({ noise:{ type:'brown' }, envelope:{ attack:.001, decay:.12, sustain:0 } }).connect(crush); glitch.volume.value = -10;
  const chime = new Tone.PolySynth(Tone.Synth, { oscillator:{ type:'sine' }, envelope:{ attack:.002, decay:.5, sustain:0, release:.4 } }); chime.connect(sfxBus); chime.connect(rev); chime.volume.value = -8;
  const errF = new Tone.Filter(1200, 'lowpass').connect(sfxBus);
  const err = new Tone.Synth({ oscillator:{ type:'square' }, envelope:{ attack:.002, decay:.12, sustain:0, release:.05 } }).connect(errF); err.volume.value = -12;
  const shutF = new Tone.Filter(2500, 'highpass').connect(sfxBus);
  const shutter = new Tone.NoiseSynth({ envelope:{ attack:.001, decay:.05, sustain:0 } }).connect(shutF); shutter.volume.value = -6;
  const click = new Tone.Synth({ oscillator:{ type:'triangle' }, envelope:{ attack:.001, decay:.03, sustain:0, release:.02 } }).connect(sfxBus); click.volume.value = -8;

  // Tone đôi khi gọi một sự kiện hai lần khi nó rơi đúng ranh giới tick: bỏ lần gọi trùng cùng thời điểm.
  const at = (t, fn) => { let last = -1; T.schedule(time => { if (Math.abs(time - last) < 1e-3) { audioStats.dup++; return; } last = time; try { fn(time); } catch (e) { audioStats.err++; } }, t); };
  const whoosh = (t, f0=300, f1=4500, dur=.3) => at(t, time => { wF.frequency.cancelScheduledValues(time); wF.frequency.setValueAtTime(f0, time); wF.frequency.exponentialRampToValueAtTime(f1, time + dur + .1); wEnv.triggerAttackRelease(dur, time); });

  /* --- score --- */
  // hook + problem: drone, heartbeat, ticks
  at(0, time => { drone.detune.setValueAtTime(0, time); drone.triggerAttack('A1', time); });
  at(.5, time => { kick.triggerAttackRelease('A1', '8n', time, .9); pop.triggerAttackRelease('A5', '32n', time); });
  for (let t=.5; t<2.0; t+=.125) at(t, time => tick.triggerAttackRelease('32n', time, .5));
  [[2,2.25],[4,4.25],[6,6.25],[8,8.25],[10,10.25],[12,12.25],[13,13.25]].forEach(([a,b]) => { at(a, time => kick.triggerAttackRelease('A0','8n',time,.55)); at(b, time => kick.triggerAttackRelease('A0','8n',time,.35)); });
  at(3.0, time => { thud.triggerAttackRelease('D2','8n',time,.9); crash.triggerAttackRelease(.4, time, .4); });
  at(3.5, time => pop.triggerAttackRelease('E4','32n',time,.7));
  whoosh(5.86, 4000, 300, .25);
  at(6.0, time => { glitch.triggerAttackRelease(.12, time); pop.triggerAttackRelease('C6','32n',time,.6); });
  const TEN = ['A2','A2','C3','A2','F3','E3','A2','A#2'];
  for (let t=6, i=0; t<14; t+=.25, i++) at(t, time => tense.triggerAttackRelease(TEN[i%8], '16n', time, .6 + (t>11?.25:0)));
  for (let t=12, i=0; t<14; t+=.125, i++) at(t, time => tense2.triggerAttackRelease(i%2?'A3':'E4', '32n', time, .35));
  for (let t=6.25; t<14; t+=.5) at(t, time => hat.triggerAttackRelease('32n', time, .35));
  for (let t=7; t<=10.01; t+=.5) at(t + .45, time => thud.triggerAttackRelease('G1','16n',time,.7));
  [9, 11, 12.5, 13.25, 13.5, 13.75].forEach(t => at(t, time => glitch.triggerAttackRelease(.1, time)));
  [6.45, 7.55, 8.6, 10.45].forEach(t => at(t, time => glitch.triggerAttackRelease(.06, time, .6)));
  // freeze
  at(14, time => { drone.detune.linearRampToValueAtTime(-1200, time + .7); drone.triggerRelease(time + .7); thud.triggerAttackRelease('C1','4n',time,1); });
  whoosh(15.0, 5000, 200, .6); // suction
  at(15.75, time => pop.triggerAttackRelease('G5','32n',time,.8));
  // riser 15–20
  at(15, time => { riserG.gain.cancelScheduledValues(time); riserG.gain.setValueAtTime(0, time); riserG.gain.linearRampToValueAtTime(.55, time + 4.85);
    riserF.frequency.cancelScheduledValues(time); riserF.frequency.setValueAtTime(200, time); riserF.frequency.exponentialRampToValueAtTime(9000, time + 4.85);
    riseTone.triggerAttack('A2', time); riseTone.frequency.exponentialRampToValueAtTime(Tone.Frequency('A5').toFrequency(), time + 4.85); });
  at(16.4, time => pad.triggerAttackRelease(['A2','E3','A3'], 3.4, time, .35));
  for (let t=17; t<18; t+=.25) at(t, time => clap.triggerAttackRelease(.08, time, .35));
  for (let t=18; t<19; t+=.125) at(t, time => clap.triggerAttackRelease(.06, time, .5));
  for (let t=19; t<19.875; t+=.0625) at(t, time => clap.triggerAttackRelease(.04, time, .45 + (t-19)*.5));
  whoosh(19.0, 5000, 300, .45);
  at(19.9, time => { riserG.gain.cancelScheduledValues(time); riserG.gain.setValueAtTime(0, time); riseTone.triggerRelease(time); });
  // DROP + uplifting section
  const CH = { C:['C3','E3','G3','D4'], Gb:['B2','D3','G3','A3'], Am:['A2','C3','E3','B3'], F:['F2','A2','C3','G3'], G:['G2','B2','D3','A3'] };
  const ROOT = { C:'C2', Gb:'B1', Am:'A1', F:'F1', G:'G1' };
  const ARP = { C:['C4','E4','G4','D5'], Gb:['B3','D4','G4','A4'], Am:['A3','C4','E4','B4'], F:['F3','A3','C4','G4'], G:['G3','B3','D4','A4'] };
  const PROG = [[20,'C'],[22,'Gb'],[24,'Am'],[26,'F'],[28,'C'],[30,'Gb'],[32,'Am'],[34,'F'],[36,'C'],[38,'Gb'],[40,'Am'],[42,'F'],[44,'G'],[46,'C'],[48,'Gb'],[50,'Am'],[52,'F'],[54,'F'],[56,'G'],[58,'C']];
  PROG.forEach(([t,c]) => {
    at(t, time => pad.triggerAttackRelease(CH[c], t===58 ? 2.6 : 1.9, time, .55));
    if (t < 54) for (let s=0; s<2; s+=.25) at(t+s, time => bass.triggerAttackRelease(ROOT[c], '16n', time, s%.5 ? .6 : .9));
    else if (t < 58) [0,.75,1.5].forEach(s => at(t+s, time => bass.triggerAttackRelease(ROOT[c], '8n', time, .8)));
    else at(t, time => bass.triggerAttackRelease(ROOT[c], 1.8, time, .9));
    if (t >= 26 && t < 54) { const pat = [0,1,2,3,2,1,3,2]; for (let s=0, i=0; s<2; s+=.125, i++) at(t+s, time => pluck.triggerAttackRelease(ARP[c][pat[i%8]], '32n', time, .5)); }
    if (t >= 54 && t < 58) for (let s=0, i=0; s<2; s+=.25, i++) at(t+s, time => pluck.triggerAttackRelease(ARP[c][i%4], '16n', time, .4));
  });
  for (let t=20; t<54; t+=.5) at(t, time => kick.triggerAttackRelease('C1', '8n', time, .95));
  for (let t=20; t<54; t+=2) { at(t+.5, time => clap.triggerAttackRelease(.12, time, .7)); at(t+1.5, time => clap.triggerAttackRelease(.12, time, .7)); }
  for (let t=20.25; t<54; t+=.5) at(t, time => hat.triggerAttackRelease('32n', time, .55));
  const hat2 = new Tone.NoiseSynth({ noise:{ type:'white' }, envelope:{ attack:.001, decay:.03, sustain:0 } }).connect(hatF); hat2.volume.value = -20;
  for (let t=46.125; t<54; t+=.25) at(t, time => hat2.triggerAttackRelease('64n', time, .3));
  [54,55,56,57].forEach(t => at(t, time => kick.triggerAttackRelease('C1','8n',time,.8)));
  [20, 46, 58].forEach(t => at(t, time => crash.triggerAttackRelease(1.4, time, .8)));
  at(20, time => thud.triggerAttackRelease('C1','4n',time,1));
  // feature sfx
  for (let i=0; i<10; i++) at(20.55 + i*.045, time => pop.triggerAttackRelease(['C5','D5','E5','G5','A5'][i%5], '64n', time, .35));
  [[25.55,250,4000],[30.75,600,3000],[35.75,600,3000],[40.7,300,4500],[45.7,200,5000],[53.55,4000,200]].forEach(([t,a,b]) => whoosh(t, a, b, .35));
  for (let i=0;i<5;i++) at(26.6 + i*.08, time => tick.triggerAttackRelease('32n', time, .6));
  at(28.4, time => chime.triggerAttackRelease(['E5','B5'], '8n', time, .6));
  [31.3,31.65,31.8,32.15,32.3].forEach((t,i) => at(t, time => pop.triggerAttackRelease(['C5','G4','E5','G4','C6'][i], '32n', time, .7)));
  for (let i=0;i<5;i++) at(32.8 + i*.5, time => pop.triggerAttackRelease(['C5','D5','E5','F5','G5'][i], '32n', time, .6));
  at(35.0, time => chime.triggerAttackRelease(['G5','D6'], '8n', time, .55));
  at(37.4, time => click.triggerAttackRelease('C7', '64n', time));
  at(37.55, time => chime.triggerAttackRelease(['E5','A5'], '16n', time, .6));
  at(38.2, time => tick.triggerAttackRelease('32n', time, .8));
  at(39.0, time => tick.triggerAttackRelease('32n', time, .8));
  at(39.35, time => chime.triggerAttackRelease(['C6','G6'], '8n', time, .6));
  at(39.75, time => pop.triggerAttackRelease('E4','32n',time,.6));
  at(40.05, time => { err.triggerAttackRelease('A2','32n',time); err.triggerAttackRelease('A2','32n',time+.12); });
  at(41.9, time => { shutter.triggerAttackRelease(.04, time); shutter.triggerAttackRelease(.04, time + .07); });
  at(42.7, time => pop.triggerAttackRelease('A5','32n',time,.6));
  at(43.6, time => chime.triggerAttackRelease(['A5','E6'], '8n', time, .7));
  whoosh(43.8, 500, 5000, .5);
  [46.6,47.7,48.9].forEach(t => { for (let i=0;i<7;i++) at(t + i*.1, time => tick.triggerAttackRelease('32n', time, .6)); at(t+.7, time => pop.triggerAttackRelease('C6','32n',time,.7)); });
  for (let i=0;i<8;i++) at(50.9 + i*.07, time => pop.triggerAttackRelease(['C6','E6','G6','B6'][i%4], '64n', time, .3));
  at(54.45, time => pop.triggerAttackRelease('G5','32n',time,.8));
  for (let i=0;i<10;i++) at(54.8 + i*.04, time => pop.triggerAttackRelease(['C5','E5','G5'][i%3], '64n', time, .3));
  at(56.65, time => { pop.triggerAttackRelease('C6','32n',time,.9); chime.triggerAttackRelease(['C6'], '16n', time, .4); });
  at(58, time => chime.triggerAttackRelease(['C5','G5','E6'], '2n', time, .5));

  // Kết thúc theo đồng hồ âm thanh (kể cả khi tab bị ẩn và requestAnimationFrame tạm ngưng).
  T.schedule(() => setTimeout(() => { if (playing) { tl.time(DUR); finish(); } }, 60), DUR);
  A = { master, drone, pad, riserG, riseTone, T };
  audioOK = true;
}
function audioMute(on){ if (!A) return; const n = Tone.now(); A.master.gain.cancelScheduledValues(n); A.master.gain.setTargetAtTime(on ? 0 : 1, n, .03); }
function audioReset(){
  if (!A) return; const n = Tone.now();
  A.T.stop(); A.T.seconds = 0;
  A.drone.triggerRelease(n); A.drone.detune.cancelScheduledValues(n); A.drone.detune.setValueAtTime(0, n);
  A.pad.releaseAll(n); A.riseTone.triggerRelease(n);
  A.riserG.gain.cancelScheduledValues(n); A.riserG.gain.setValueAtTime(0, n);
}

/* ---------------- grain ---------------- */
const gc = $('#grain'), gx = gc.getContext('2d'), gimg = gx.createImageData(480, 270);
let gFrame = 0;
(function grainLoop(){ if ((gFrame++ & 1) === 0){ const d = gimg.data; for (let i=0;i<d.length;i+=4){ const v = Math.random()*255|0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; } gx.putImageData(gimg,0,0); } requestAnimationFrame(grainLoop); })();

/* ---------------- transport / controls ---------------- */
let playing = false, ended = false, lastT = 0;
const body = document.body, btnPlay = $('#btnPlay'), barFill = $('#barFill'), timeEl = $('#time');
const mmss = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function clockTime(){
  const T = Tone.Transport;
  let t = typeof T.getSecondsAtTime === 'function' ? T.getSecondsAtTime(Tone.context.currentTime) : T.seconds;
  if (!isFinite(t)) t = T.seconds;
  return t;
}
gsap.ticker.add(() => {
  if (playing && audioOK){
    let t = clockTime();
    t = Math.max(lastT, Math.min(DUR, t)); lastT = t;
    tl.time(t);
  }
  const t = tl.time();
  barFill.style.transform = `scaleX(${t/DUR})`; timeEl.textContent = `${mmss(t)} / 1:00`;
  if (playing && t >= DUR - .001) finish();
});
function play(){
  if (ended) return restart();
  playing = true; body.classList.add('playing'); btnPlay.textContent = '❚❚';
  if (audioOK){ lastT = tl.time(); audioMute(false); if (A.T.state === 'paused') A.T.start(); else A.T.start(undefined, tl.time()); }
  else tl.play();
  idleKick();
}
function pause(){
  playing = false; body.classList.remove('playing'); btnPlay.textContent = '▶';
  if (audioOK){ A.T.pause(); audioMute(true); } else tl.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  body.classList.remove('idle');
}
function finish(){
  playing = false; ended = true; body.classList.remove('playing','idle'); btnPlay.textContent = '↺';
  if (audioOK){ A.T.pause(); setTimeout(() => { if (!playing) audioMute(true); }, 2500); } else tl.pause();
}
function restart(){
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  ended = false; playing = false;
  audioReset(); tl.pause(); tl.time(0, true); lastT = 0;
  play();
}
$('#playBig').addEventListener('click', async () => {
  $('#playBig').disabled = true;
  try { await initAudio(); } catch (e) { console.warn('Audio init failed', e); audioOK = false; }
  gsap.to('#start', { autoAlpha:0, duration:.4, onComplete:() => $('#start').style.display = 'none' });
  restart();
});
btnPlay.addEventListener('click', () => playing ? pause() : play());
$('#btnRestart').addEventListener('click', restart);
addEventListener('keydown', e => {
  if ($('#start').style.display !== 'none') return;
  if (e.code === 'Space' || e.key === 'k'){ e.preventDefault(); playing ? pause() : play(); }
  if (e.key === 'r' || e.key === 'R') restart();
});
let idleTimer = 0;
function idleKick(){ body.classList.add('showui'); body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => { body.classList.remove('showui'); if (playing) body.classList.add('idle'); }, 1600); }
addEventListener('mousemove', idleKick);

window.__teaser = { tl, seek:t => tl.time(t, true) };
})();
