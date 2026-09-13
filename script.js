/* ══════════════════════════════════════════════
   IMC — script.js  |  Performance-first rewrite
   Key principles:
   - India map rendered to offscreen canvas ONCE → drawImage() per frame
   - All gradient objects cached, never recreated per frame
   - Dirty flag: skip draw if nothing changed
   - 30fps base, 60fps only during active animation/interaction
   ══════════════════════════════════════════════ */

'use strict';

const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi)   => lo + Math.random() * (hi - lo);
const $    = id          => document.getElementById(id);

// ════════════════════════════════════════════
//  NAVBAR (no canvas, always cheap)
// ════════════════════════════════════════════

const navWrapper = $('navbar-wrapper');
const navbar     = $('navbar');
const hamburger  = $('hamburger');
const mobileMenu = $('mobile-menu');

setTimeout(() => navWrapper.classList.add('visible'), 80);

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 32);
}, { passive: true });

hamburger.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', open);
  mobileMenu.setAttribute('aria-hidden', !open);
});

document.querySelectorAll('.mob-link, .mob-cta').forEach(el => {
  el.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', false);
    mobileMenu.setAttribute('aria-hidden', true);
  });
});

// ════════════════════════════════════════════
//  HERO ANIMATIONS
// ════════════════════════════════════════════

[
  { id: 'hero-eyebrow', d: 180 }, { id: 'hero-headline', d: 300 },
  { id: 'hero-sub',     d: 420 }, { id: 'hero-ctas',     d: 540 },
  { id: 'hero-stats',   d: 660 }, { id: 'map-wrap',      d: 260 },
].forEach(({ id, d }) => {
  const el = $(id);
  if (el) setTimeout(() => el.classList.add('in'), d);
});

// ════════════════════════════════════════════
//  MAP — DATA
// ════════════════════════════════════════════

const CITIES = [
  { name: 'Mumbai',    state: 'Maharashtra',   lng: 72.88, lat: 19.07, sz: 'lg', members: '12.4K', orgs: '340' },
  { name: 'Delhi',     state: 'Delhi NCR',      lng: 77.10, lat: 28.70, sz: 'lg', members: '9.8K',  orgs: '285' },
  { name: 'Hyderabad', state: 'Telangana',      lng: 78.48, lat: 17.38, sz: 'lg', members: '7.2K',  orgs: '198' },
  { name: 'Bengaluru', state: 'Karnataka',      lng: 77.59, lat: 12.97, sz: 'md', members: '5.6K',  orgs: '164' },
  { name: 'Chennai',   state: 'Tamil Nadu',     lng: 80.27, lat: 13.08, sz: 'md', members: '4.1K',  orgs: '120' },
  { name: 'Kolkata',   state: 'West Bengal',    lng: 88.36, lat: 22.57, sz: 'md', members: '5.9K',  orgs: '172' },
  { name: 'Lucknow',   state: 'Uttar Pradesh',  lng: 80.95, lat: 26.85, sz: 'md', members: '4.8K',  orgs: '138' },
  { name: 'Ahmedabad', state: 'Gujarat',        lng: 72.58, lat: 23.02, sz: 'sm', members: '2.9K',  orgs: '84'  },
  { name: 'Bhopal',    state: 'Madhya Pradesh', lng: 77.40, lat: 23.26, sz: 'sm', members: '2.1K',  orgs: '62'  },
  { name: 'Patna',     state: 'Bihar',          lng: 85.14, lat: 25.60, sz: 'sm', members: '3.2K',  orgs: '88'  },
  { name: 'Jaipur',    state: 'Rajasthan',      lng: 75.79, lat: 26.91, sz: 'sm', members: '1.8K',  orgs: '54'  },
  { name: 'Srinagar',  state: 'J&K',            lng: 74.80, lat: 34.08, sz: 'sm', members: '1.4K',  orgs: '42'  },
  { name: 'Guwahati',  state: 'Assam',          lng: 91.74, lat: 26.18, sz: 'sm', members: '1.2K',  orgs: '38'  },
  { name: 'Kochi',     state: 'Kerala',         lng: 76.26, lat:  9.93, sz: 'sm', members: '2.6K',  orgs: '72'  },
  { name: 'Pune',      state: 'Maharashtra',    lng: 73.86, lat: 18.52, sz: 'sm', members: '3.4K',  orgs: '95'  },
  { name: 'Nagpur',    state: 'Maharashtra',    lng: 79.09, lat: 21.14, sz: 'sm', members: '1.5K',  orgs: '45'  },
  { name: 'Surat',     state: 'Gujarat',        lng: 72.83, lat: 21.17, sz: 'sm', members: '1.9K',  orgs: '55'  },
];

const CONNECTIONS = [
  [0,1],[0,2],[0,7],[0,14],[0,15],[0,16],
  [1,10],[1,6],[1,11],[1,8],
  [2,3],[2,4],[2,8],
  [3,13],[3,4],
  [4,5],[5,9],[5,12],
  [6,9],[7,16],
];

// India geographic bounds
const LNG0 = 67.5, LNG1 = 97.5, LAT0 = 7.0, LAT1 = 37.5;

// ════════════════════════════════════════════
//  CANVAS SETUP
// ════════════════════════════════════════════

const canvas  = $('map-canvas');
const ctx     = canvas.getContext('2d', { alpha: true });
const tooltip = $('map-tooltip');

let W, H, DPR;

// Offscreen canvas — India map pre-rendered here ONCE per resize
let offscreen    = null;
let offscreenCtx = null;
let offscreenDirty = true; // rebuild when resize happens

// Projection state
let proj = null; // { offX, offY, scaleX, scaleY }

// GeoJSON paths and city positions
let indiaPaths = [];
let cityPts    = [];

// ════════════════════════════════════════════
//  PROJECTION
// ════════════════════════════════════════════

function buildProj() {
  const PAD = 0.06;
  const drawW = W * (1 - PAD * 2), drawH = H * (1 - PAD * 2);
  const lngSpan = LNG1 - LNG0, latSpan = LAT1 - LAT0;
  const aspect  = lngSpan / latSpan;
  let sW, sH;
  if (drawW / drawH > aspect) { sH = drawH; sW = sH * aspect; }
  else                        { sW = drawW; sH = sW / aspect; }
  proj = {
    offX: (W - sW) / 2, offY: (H - sH) / 2,
    scaleX: sW / lngSpan, scaleY: sH / latSpan,
  };
}

function project(lng, lat) {
  return {
    x: proj.offX + (lng - LNG0) * proj.scaleX,
    y: proj.offY + (LAT1 - lat) * proj.scaleY,
  };
}

// ════════════════════════════════════════════
//  OFFSCREEN MAP RENDER (called once per resize)
// ════════════════════════════════════════════

function buildOffscreen(features) {
  // Create / resize offscreen canvas
  if (!offscreen) {
    offscreen    = document.createElement('canvas');
    offscreenCtx = offscreen.getContext('2d', { alpha: true });
  }
  offscreen.width  = Math.round(W * DPR);
  offscreen.height = Math.round(H * DPR);
  offscreenCtx.setTransform(1, 0, 0, 1, 0, 0); // reset
  offscreenCtx.scale(DPR, DPR);
  offscreenCtx.clearRect(0, 0, W, H);

  // Build Path2D objects
  indiaPaths = [];
  if (features) {
    features.forEach(feat => {
      const geom = feat.geometry;
      if (!geom) return;
      const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      rings.forEach(poly => {
        const path = new Path2D();
        poly.forEach(ring => {
          ring.forEach(([lng, lat], i) => {
            const { x, y } = project(lng, lat);
            i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
          });
          path.closePath();
        });
        indiaPaths.push(path);
      });
    });
  }

  // Draw all paths into the offscreen canvas — done ONCE
  // Dark-tinted India silhouette on the dark hero background
  const grad = offscreenCtx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,   'rgba(255,255,255,0.04)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1,   'rgba(255,255,255,0.03)');

  indiaPaths.forEach(p => {
    offscreenCtx.fillStyle = grad;
    offscreenCtx.fill(p);
    offscreenCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    offscreenCtx.lineWidth   = 0.7;
    offscreenCtx.lineJoin    = 'round';
    offscreenCtx.stroke(p);
  });

  offscreenDirty = false;
}

// ════════════════════════════════════════════
//  CITY POSITIONS & CACHED GRADIENTS
// ════════════════════════════════════════════

// Pre-created gradient cache — rebuilt on resize/hover change
let nodeGradCache = []; // one entry per city

function getNodeR(city) {
  return { lg: 9, md: 6.5, sm: 4.5 }[city.sz] ?? 5;
}

function buildCityPositions() {
  cityPts = CITIES.map((c, i) => {
    const { x, y } = project(c.lng, c.lat);
    return { ...c, x, y, baseX: x, baseY: y, idx: i };
  });
  // Invalidate gradient cache on resize (coords changed)
  nodeGradCache = new Array(CITIES.length).fill(null);
}

// Get or create cached node gradient
function getNodeGrad(cx, cy, r, hov) {
  const ng = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  ng.addColorStop(0, hov ? '#2ee87e' : '#22d476');
  ng.addColorStop(1, hov ? '#0B8F55' : '#086b40');
  return ng;
}

// ════════════════════════════════════════════
//  ANIMATION STATE
// ════════════════════════════════════════════

let nodeState = CITIES.map(() => ({
  appear: 0, target: 0,
  pulse: rand(0, Math.PI * 2),
  floatT: rand(0, Math.PI * 2),
  hovered: false,
}));

let connState = CONNECTIONS.map(() => ({
  appear: 0, target: 0,
  dash: rand(0, 40),
}));

function scheduleAppear() {
  CITIES.forEach((_, i)     => setTimeout(() => { nodeState[i].target = 1; dirty = true; }, 900 + i * 80));
  CONNECTIONS.forEach((_, i) => setTimeout(() => { connState[i].target = 1; dirty = true; }, 1300 + i * 60));
}

// ════════════════════════════════════════════
//  DIRTY FLAG + FRAME THROTTLE
// ════════════════════════════════════════════

let dirty       = true;  // redraw requested
let animating   = false; // true while nodes are appearing/pulsing
let lastTs      = 0;

// During active animation/hover: 60fps. Idle: 20fps (just for pulse)
function getFrameMs() { return animating || hoveredIdx >= 0 ? 16.7 : 50; }

// ════════════════════════════════════════════
//  HOVER
// ════════════════════════════════════════════

let hoveredIdx = -1;

const mousePos = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

canvas.addEventListener('mousemove', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  mousePos.tx = e.clientX / window.innerWidth;
  mousePos.ty = e.clientY / window.innerHeight;

  let found = -1;
  for (let i = cityPts.length - 1; i >= 0; i--) {
    const cp = cityPts[i];
    const hr = getNodeR(cp) + 14;
    const dx = mx - cp.x, dy = my - cp.y;
    if (dx * dx + dy * dy < hr * hr) { found = i; break; }
  }

  if (found !== hoveredIdx) {
    if (hoveredIdx >= 0) nodeState[hoveredIdx].hovered = false;
    hoveredIdx = found;
    if (found >= 0) {
      nodeState[found].hovered = true;
      showTooltip(found, mx, my, r);
      canvas.style.cursor = 'pointer';
    } else {
      hideTooltip();
      canvas.style.cursor = 'crosshair';
    }
    dirty = true;
  } else if (found >= 0) {
    posTooltip(mx, my, r);
  }
  dirty = true; // parallax needs redraw
}, { passive: true });

canvas.addEventListener('mouseleave', () => {
  if (hoveredIdx >= 0) { nodeState[hoveredIdx].hovered = false; dirty = true; }
  hoveredIdx = -1;
  hideTooltip();
});

function showTooltip(i, mx, my, r) {
  const c = CITIES[i];
  $('tt-city').textContent    = c.name;
  $('tt-state').textContent   = c.state;
  $('tt-members').textContent = c.members;
  $('tt-orgs').textContent    = c.orgs;
  tooltip.setAttribute('aria-hidden', 'false');
  posTooltip(mx, my, r);
  requestAnimationFrame(() => tooltip.classList.add('show'));
}
function hideTooltip() {
  tooltip.classList.remove('show');
  tooltip.setAttribute('aria-hidden', 'true');
}
function posTooltip(mx, my, r) {
  const tw = tooltip.offsetWidth || 160, th = tooltip.offsetHeight || 108;
  let tx = mx + 16, ty = my - th / 2;
  if (tx + tw > r.width  - 8) tx = mx - tw - 12;
  if (ty < 8) ty = 8;
  if (ty + th > r.height - 8) ty = r.height - th - 8;
  tooltip.style.left = tx + 'px';
  tooltip.style.top  = ty + 'px';
}

// ════════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════════

let startTime = null;

function render(ts) {
  requestAnimationFrame(render);

  // Throttle
  const frameMs = getFrameMs();
  if (ts - lastTs < frameMs) return;
  lastTs = ts;

  if (!startTime) startTime = ts;
  const t = (ts - startTime) / 1000;

  // Smooth mouse parallax
  const prevMx = mousePos.x, prevMy = mousePos.y;
  mousePos.x = lerp(mousePos.x, mousePos.tx, 0.06);
  mousePos.y = lerp(mousePos.y, mousePos.ty, 0.06);
  const mouseMoved = Math.abs(mousePos.x - prevMx) > 0.0001 ||
                     Math.abs(mousePos.y - prevMy) > 0.0001;
  if (mouseMoved) dirty = true;

  const px = (mousePos.x - 0.5) * 9;
  const py = (mousePos.y - 0.5) * 7;

  // Update animation state — check if still animating
  animating = false;
  nodeState.forEach((ns, i) => {
    const prev = ns.appear;
    ns.appear = lerp(ns.appear, ns.target, 0.06);
    ns.pulse  += 0.032;
    ns.floatT += 0.009;
    if (Math.abs(ns.appear - ns.target) > 0.002) { animating = true; dirty = true; }
    // Pulse always causes minor redraw when visible
    if (ns.appear > 0.05) { dirty = true; }
  });

  connState.forEach(cs => {
    const prev = cs.appear;
    cs.appear = lerp(cs.appear, cs.target, 0.045);
    if (cs.appear > 0.05) { cs.dash = (cs.dash + 0.45) % 40; dirty = true; }
    if (Math.abs(cs.appear - cs.target) > 0.002) animating = true;
  });

  if (!dirty) return;
  dirty = false;

  // ── Draw ──────────────────────────────────
  ctx.clearRect(0, 0, W, H);

  // 1. Blit offscreen India map (instant — just a bitmap copy)
  if (offscreen && offscreen.width > 0) {
    ctx.save();
    ctx.translate(px, py);
    ctx.drawImage(offscreen, 0, 0, W, H); // ← the big win
    ctx.restore();
  }

  // 2. Connections
  ctx.save();
  ctx.translate(px, py);
  CONNECTIONS.forEach((conn, ci) => {
    const cs = connState[ci];
    if (cs.appear < 0.02) return;

    const a = cityPts[conn[0]], b = cityPts[conn[1]];
    if (!a || !b) return;

    const hov = hoveredIdx === conn[0] || hoveredIdx === conn[1];

    ctx.globalAlpha   = cs.appear * (hov ? 0.55 : 0.18);
    ctx.strokeStyle   = hov ? '#E8632A' : 'rgba(232,99,42,0.75)';
    ctx.lineWidth     = hov ? 1.3 : 0.7;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = -cs.dash;

    const cx2 = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
    const cy2 = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx2, cy2, b.x, b.y);
    ctx.stroke();

    // Travelling dot (only on hover)
    if (hov) {
      ctx.setLineDash([]);
      const p2 = (Math.sin(t * 1.6 + ci) * 0.5 + 0.5);
      const u  = 1 - p2;
      ctx.globalAlpha = cs.appear * 0.9;
      ctx.fillStyle   = '#E8632A';
      ctx.beginPath();
      ctx.arc(
        u*u*a.x + 2*u*p2*cx2 + p2*p2*b.x,
        u*u*a.y + 2*u*p2*cy2 + p2*p2*b.y,
        2, 0, Math.PI * 2
      );
      ctx.fill();
    }
  });
  ctx.setLineDash([]);
  ctx.restore();

  // 3. City nodes
  ctx.save();
  ctx.translate(px, py);
  cityPts.forEach((cp, i) => {
    const ns = nodeState[i];
    if (ns.appear < 0.02) return;

    const baseR = getNodeR(cp);
    const pv    = (Math.sin(ns.pulse) * 0.5 + 0.5);
    const hov   = ns.hovered;
    const r     = baseR * (hov ? 1.38 : 1 + pv * 0.07) * ns.appear;
    const fx    = cp.baseX + Math.sin(ns.floatT) * 1.2;
    const fy    = cp.baseY + Math.cos(ns.floatT * 0.7) * 1.0;

    // Update canvas position for tooltip
    if (hov) { cp.x = fx; cp.y = fy; }

    ctx.globalAlpha = ns.appear;

    // Outer glow ring — orange tint
    const glowR = r * (hov ? 2.2 : 1.8);
    const rg = ctx.createRadialGradient(fx, fy, r * 0.5, fx, fy, glowR);
    rg.addColorStop(0, `rgba(232,99,42,${hov ? 0.30 : 0.14 * (0.5 + pv * 0.5)})`);
    rg.addColorStop(1, 'rgba(232,99,42,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Core node — orange
    const ng = ctx.createRadialGradient(fx - r * 0.28, fy - r * 0.28, 0, fx, fy, r);
    ng.addColorStop(0, hov ? '#f07840' : '#e8743a');
    ng.addColorStop(1, hov ? '#c94f1a' : '#b8451a');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner specular
    ctx.globalAlpha = ns.appear * 0.5;
    ctx.fillStyle   = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(fx - r * .28, fy - r * .28, r * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // Label
    if (cp.sz === 'lg' || (cp.sz === 'md' && W > 600) || hov) {
      ctx.globalAlpha = ns.appear * (hov ? 1 : 0.75);
      const fs  = hov ? 11.5 : 10.5;
      ctx.font  = `${hov ? 600 : 500} ${fs}px Inter, sans-serif`;
      const lbl = cp.name;
      const tw  = ctx.measureText(lbl).width;
      const lx  = fx - (tw + 10) / 2, ly = fy + r + 5;

      ctx.fillStyle = 'rgba(13,35,24,0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, ly, tw + 10, 15, 4);
      else ctx.rect(lx, ly, tw + 10, 15);
      ctx.fill();

      ctx.fillStyle    = hov ? '#FFFFFF' : 'rgba(255,255,255,0.70)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(lbl, fx, ly + 2.5);
    }
  });
  ctx.restore();
}

// ════════════════════════════════════════════
//  RESIZE
// ════════════════════════════════════════════

let geoFeatures = null;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× — 3× is overkill
  const rect = canvas.parentElement.getBoundingClientRect();
  W = rect.width; H = rect.height;
  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.style.maxHeight = 'min(calc(100svh - 120px), 650px)';
  canvas.style.maxWidth = '640px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR, DPR);
  buildProj();
  buildCityPositions();
  buildOffscreen(geoFeatures); // rebuild offscreen map at new size
  dirty = true;
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 150);
});

// ════════════════════════════════════════════
//  GEOJSON LOAD
// ════════════════════════════════════════════

function getEmbeddedFallback() {
  const c = [
    [74.0,36.0],[76.2,35.5],[77.8,35.4],[78.8,35.2],[79.5,34.8],[80.2,34.0],
    [81.0,33.5],[80.6,32.8],[81.5,32.2],[82.3,31.5],[83.5,31.0],[85.0,30.2],
    [88.0,28.5],[89.0,27.8],[90.5,26.9],[92.0,26.3],[93.5,26.0],[94.8,26.2],
    [96.5,27.2],[97.2,28.0],[97.5,28.5],[97.0,29.0],[96.5,29.5],[95.8,29.8],
    [95.0,29.5],[94.0,29.2],[93.5,28.8],[92.8,28.2],[92.0,27.8],[91.5,27.4],
    [90.5,22.5],[89.8,21.5],[88.2,21.7],[87.5,21.0],[86.5,20.0],[85.5,19.8],
    [84.5,18.8],[83.5,18.0],[82.5,17.0],[81.5,16.0],[80.5,15.0],[80.2,14.0],
    [80.0,13.2],[79.8,12.0],[79.5,10.5],[79.3,9.5],[78.5,8.5],[77.5,8.1],
    [76.5,8.3],[76.0,8.1],[77.0,8.0],[77.5,8.3],
    [77.0,9.0],[76.5,9.8],[76.2,10.5],[75.8,11.5],[75.3,12.5],[74.8,13.5],
    [74.2,14.5],[73.8,15.5],[73.4,16.5],[73.2,17.5],[72.9,18.5],[72.8,19.5],
    [72.6,20.5],[72.5,21.5],[72.3,22.5],[72.0,23.0],[68.7,23.5],[68.5,22.8],
    [68.0,23.0],[67.5,23.5],[67.8,24.5],[68.5,25.0],[69.5,25.5],[70.0,26.0],
    [70.5,27.0],[71.0,27.5],[71.5,28.5],[72.0,29.5],[72.3,30.5],[73.0,31.5],
    [73.5,32.0],[74.0,32.5],[74.5,33.5],[74.0,34.5],[74.0,36.0],
  ];
  return { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { name: 'India' },
    geometry: { type: 'Polygon', coordinates: [c] },
  }]};
}

async function loadMap() {
  let data;
  try {
    const res = await fetch('https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson');
    if (!res.ok) throw new Error('failed');
    data = await res.json();
  } catch {
    data = getEmbeddedFallback();
  }

  geoFeatures = data.type === 'FeatureCollection' ? data.features
              : data.type === 'Feature'            ? [data]
              : getEmbeddedFallback().features;

  resize();          // build offscreen map with real data
  scheduleAppear();
  requestAnimationFrame(render);
}

// ════════════════════════════════════════════
//  SCROLL SCENE  —  scale map on scroll
//
//  As the user scrolls the scroll-scene:
//    → Hero text fades out        (p: 0.00 → 0.40)
//    → Map scales up 1x → 1.9x   (p: 0.00 → 0.70)
//    → "Find your community" fades in (p: 0.60 → 1.00)
// ════════════════════════════════════════════

const scrollScene = $('scroll-scene');
const sceneSticky = $('scene-sticky');
const heroContent = $('hero-content');
const mapWrap     = $('map-wrap');
const discoveryUI = $('discovery-ui');
const discHud     = $('disc-hud');

const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp01 = t => Math.max(0, Math.min(1, t));

function band(p, lo, hi) {
  return clamp01((p - lo) / (hi - lo));
}

function getScrollProgress() {
  if (!scrollScene) return 0;
  const scrollable = scrollScene.offsetHeight - window.innerHeight;
  if (scrollable <= 0) return 0;
  return clamp01(-scrollScene.getBoundingClientRect().top / scrollable);
}

// ── PIN / City database ───────────────────────
const PIN_DB = [
  { pin: '400001', city: 'Mumbai',    state: 'Maharashtra',    lng: 72.88, lat: 19.07 },
  { pin: '110001', city: 'Delhi',     state: 'Delhi NCR',      lng: 77.10, lat: 28.70 },
  { pin: '560001', city: 'Bengaluru', state: 'Karnataka',      lng: 77.59, lat: 12.97 },
  { pin: '500001', city: 'Hyderabad', state: 'Telangana',      lng: 78.48, lat: 17.38 },
  { pin: '226001', city: 'Lucknow',   state: 'Uttar Pradesh',  lng: 80.95, lat: 26.85 },
  { pin: '700001', city: 'Kolkata',   state: 'West Bengal',    lng: 88.36, lat: 22.57 },
  { pin: '600001', city: 'Chennai',   state: 'Tamil Nadu',     lng: 80.27, lat: 13.08 },
  { pin: '380001', city: 'Ahmedabad', state: 'Gujarat',        lng: 72.58, lat: 23.02 },
  { pin: '462001', city: 'Bhopal',    state: 'Madhya Pradesh', lng: 77.40, lat: 23.26 },
  { pin: '800001', city: 'Patna',     state: 'Bihar',          lng: 85.14, lat: 25.60 },
  { pin: '302001', city: 'Jaipur',    state: 'Rajasthan',      lng: 75.79, lat: 26.91 },
  { pin: '190001', city: 'Srinagar',  state: 'J&K',            lng: 74.80, lat: 34.08 },
  { pin: '781001', city: 'Guwahati',  state: 'Assam',          lng: 91.74, lat: 26.18 },
  { pin: '682001', city: 'Kochi',     state: 'Kerala',         lng: 76.26, lat:  9.93 },
  { pin: '411001', city: 'Pune',      state: 'Maharashtra',    lng: 73.86, lat: 18.52 },
];

let discCam = {
  targetLng: 78.96, targetLat: 20.59,
  curLng: 78.96,    curLat: 20.59,
  targetZoom: 1.15, curZoom: 1.15,
  activeCity: 'Mumbai', activePin: '400001',
};

// ── Main scroll driver ───────────────────────
function updateScrollScene() {
  const p = getScrollProgress();   // 0 = top of scene, 1 = bottom

  // 1. Hero text fades out (p: 0 → 0.4)
  if (heroContent) {
    const t = easeOut(band(p, 0, 0.40));
    heroContent.style.opacity   = 1 - t;
    heroContent.style.transform = `translateX(${-t * 50}px)`;
  }

  // 2. Map scales up (p: 0 → 0.70) — from 1x to 1.5x
  //    transform-origin center so it grows symmetrically within the right panel
  if (mapWrap) {
    const t     = easeOut(band(p, 0, 0.70));
    const scale = 1 + t * 0.40;               // 1.0 → 1.40
    mapWrap.style.transform       = `scale(${scale})`;
    mapWrap.style.transformOrigin = 'center center';
    // Also drive camera zoom to match visual scale
    discCam.targetZoom = 1.15 + t * 1.25;
  }

  // 3. Discovery UI fades in (p: 0.60 → 1.0)
  const discT = easeOut(band(p, 0.60, 1.0));
  if (discoveryUI) {
    discoveryUI.classList.toggle('visible', discT > 0.05);
  }
  if (discHud) {
    discHud.classList.toggle('visible', discT > 0.3);
  }

  // Phase class for CSS hooks
  if (sceneSticky) {
    sceneSticky.classList.toggle('phase-3', p > 0.6);
  }
}

window.addEventListener('scroll', updateScrollScene, { passive: true });
updateScrollScene();

// ════════════════════════════════════════════
//  DISCOVERY CONTROLS
// ════════════════════════════════════════════

function selectLocation(query) {
  if (!query) return;
  const clean = query.toString().trim().toLowerCase();
  let match = PIN_DB.find(d => d.pin === clean || d.city.toLowerCase() === clean);
  if (!match) match = PIN_DB.find(d => d.city.toLowerCase().includes(clean));
  if (!match) match = CITIES.find(c => c.name.toLowerCase().includes(clean));
  if (!match) return;

  discCam.targetLng  = match.lng;
  discCam.targetLat  = match.lat;
  discCam.targetZoom = 2.4;
  discCam.activeCity = match.city || match.name;
  discCam.activePin  = match.pin  || '400001';

  const input = $('location-search-input');
  if (input) input.value = `${match.city || match.name}${match.pin ? ' (' + match.pin + ')' : ''}`;

  const hud = $('hud-label');
  if (hud) hud.textContent = `Viewing Region: ${match.city || match.name}${match.pin ? ' (' + match.pin + ')' : ''}`;

  document.querySelectorAll('.loc-chip').forEach(chip => {
    chip.classList.toggle('active',
      chip.getAttribute('data-city')?.toLowerCase() === (match.city || match.name).toLowerCase()
    );
  });
}

function setupDiscoveryControls() {
  const search  = $('location-search-input');
  const explore = $('explore-community-btn');
  const detect  = $('detect-location-btn');

  if (search) {
    search.addEventListener('keydown', e => { if (e.key === 'Enter') selectLocation(search.value); });
    search.addEventListener('input',   () => { if (search.value.length >= 3) selectLocation(search.value); });
  }
  if (explore) explore.addEventListener('click', () => selectLocation(search?.value || 'Mumbai'));
  if (detect)  detect.addEventListener('click',  () => {
    detect.style.transform = 'rotate(180deg)';
    setTimeout(() => { detect.style.transform = ''; selectLocation('Mumbai'); }, 350);
  });

  document.querySelectorAll('.loc-chip').forEach(chip =>
    chip.addEventListener('click', () =>
      selectLocation(chip.getAttribute('data-pin') || chip.getAttribute('data-city'))
    )
  );
}

// ════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════

resize();
loadMap();
setupDiscoveryControls();

// ════════════════════════════════════════════
//  NETWORK SECTION — orbital scroll animation
//  Draws SVG connection lines + reveals nodes
// ════════════════════════════════════════════

(function initNetworkSection() {
  const hub      = document.getElementById('net-hub');
  const lines    = document.querySelectorAll('.net-line');
  const endDots  = document.querySelectorAll('.net-end-dot');
  const nodes    = document.querySelectorAll('.net-node');
  const visual   = document.getElementById('net-visual');
  if (!visual) return;

  let animated = false;

  function revealNetwork() {
    if (animated) return;
    animated = true;

    // 1. Hub pops in
    if (hub) hub.classList.add('visible');

    // 2. Lines draw outward — staggered
    lines.forEach((line, i) => {
      setTimeout(() => {
        line.style.strokeDashoffset = '0';
        // End dot appears after line finishes
        setTimeout(() => {
          if (endDots[i]) {
            endDots[i].style.transition = 'opacity .4s ease';
            endDots[i].style.opacity = '1';
          }
        }, 900);
      }, 200 + i * 180);
    });

    // 3. Nodes slide in
    nodes.forEach((node, i) => {
      setTimeout(() => node.classList.add('visible'), 600 + i * 180);
    });
  }

  // IntersectionObserver — triggers when visual is 30% in view
  const observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) revealNetwork(); },
    { threshold: 0.30 }
  );
  observer.observe(visual);
})();

// ════════════════════════════════════════════
//  IMC PLATFORM SECTION — Scroll construction & capability activation
// ════════════════════════════════════════════

(function initPlatformSection() {
  const stage = document.getElementById('plat-stage');
  if (!stage) return;

  let animated = false;

  function activatePlatform() {
    if (animated) return;
    animated = true;

    // 1. Trigger overall stage construction (Dashboard, connection paths, satellite cards)
    stage.classList.add('animated');

    // 2. Animate Action Flow sequence: People -> Skills -> Needs -> Opportunities -> Action
    const steps = [
      document.getElementById('flow-step-1'),
      document.getElementById('flow-step-2'),
      document.getElementById('flow-step-3'),
      document.getElementById('flow-step-4'),
      document.getElementById('flow-step-5')
    ];

    let currentStep = 0;
    function highlightNextStep() {
      steps.forEach(s => s && s.classList.remove('active'));
      if (steps[currentStep]) {
        steps[currentStep].classList.add('active');
      }
      currentStep = (currentStep + 1) % steps.length;
    }

    // Start flow highlighting after initial stage reveal
    setTimeout(() => {
      highlightNextStep();
      setInterval(highlightNextStep, 2200);
    }, 1200);
  }

  const observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) activatePlatform(); },
    { threshold: 0.20 }
  );
  observer.observe(stage);
})();

// ════════════════════════════════════════════
//  IMC IMPACT SECTION — Bottom-to-top scroll animation
// ════════════════════════════════════════════

(function initSequentialImpactCardDeck() {
  const stage = document.getElementById('imp-deck-stage');
  const stack = document.getElementById('imp-cards-stack');
  if (!stage || !stack) return;

  const cards = Array.from(stack.querySelectorAll('.imp-stack-card'));
  const counterEl = document.getElementById('imp-deck-counter');
  const dots = Array.from(document.querySelectorAll('#imp-deck-dots .imp-dot'));

  if (!cards.length) return;

  // On smaller screens (< 768px), fallback to standard layout
  function isMobile() {
    return window.innerWidth <= 768 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  let isTicking = false;
  let isInView = false;

  function updateDeckOnScroll() {
    if (isMobile()) {
      cards.forEach(c => {
        c.style.transform = '';
        c.style.opacity = '';
      });
      return;
    }

    const rect = stage.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const totalScrollDist = rect.height - windowHeight;

    if (totalScrollDist <= 0) return;

    // Calculate scroll progress from 0.0 to 1.0
    let progress = -rect.top / totalScrollDist;
    progress = Math.max(0, Math.min(1, progress));

    const totalCards = cards.length;
    const transitions = totalCards - 1; // 5 transitions between 6 cards
    const stepSize = 1 / transitions;

    // Determine current active card index
    const activeIndex = Math.min(totalCards - 1, Math.floor(progress * (transitions + 0.01)));

    // Update Counter & Dots
    if (counterEl) {
      counterEl.innerHTML = `0${activeIndex + 1} <span class="imp-counter-total">/ 06</span>`;
    }
    dots.forEach((dot, idx) => {
      if (idx === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    // Card 0 is always visible at base
    // Cards 1..5 rise from bottom (translateY 100vh -> 0) sequentially on scroll
    cards.forEach((card, idx) => {
      if (idx === 0) {
        // Card 0 logic: stays at 0, scales down slightly as subsequent cards overlay
        if (progress > 0) {
          const depthScale = Math.max(0.94, 1 - progress * 0.06);
          card.style.transform = `translate3d(0, 0, 0) scale(${depthScale.toFixed(3)})`;
        } else {
          card.style.transform = 'translate3d(0, 0, 0) scale(1)';
        }
        card.style.opacity = '1';
        return;
      }

      const startP = (idx - 1) * stepSize;
      const endP = idx * stepSize;

      if (progress <= startP) {
        // Waiting underneath the bottom of the viewport
        card.style.transform = 'translate3d(0, 100vh, 0)';
        card.style.opacity = '0';
      } else if (progress >= endP) {
        // Fully arrived in place
        // Scale down slightly as future cards come over it
        const futureProgress = (progress - endP) / (1 - endP + 0.001);
        const depthScale = Math.max(0.95, 1 - Math.max(0, futureProgress) * 0.05);
        card.style.transform = `translate3d(0, 0, 0) scale(${depthScale.toFixed(3)})`;
        card.style.opacity = '1';
      } else {
        // Actively sliding up from the bottom of screen on scroll
        let t = (progress - startP) / stepSize;
        t = Math.max(0, Math.min(1, t));
        const ease = easeOutCubic(t);

        const currY = (1 - ease) * 90; // 90vh to 0vh
        const currOpacity = Math.min(1, t * 1.8);

        card.style.transform = `translate3d(0, ${currY.toFixed(2)}vh, 0) scale(1)`;
        card.style.opacity = currOpacity.toFixed(3);
      }
    });

    isTicking = false;
  }

  function onScroll() {
    if (!isTicking && isInView) {
      requestAnimationFrame(updateDeckOnScroll);
      isTicking = true;
    }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isInView = entry.isIntersecting;
      if (isInView) {
        window.addEventListener('scroll', onScroll, { passive: true });
        updateDeckOnScroll();
      } else {
        window.removeEventListener('scroll', onScroll);
      }
    });
  }, { threshold: 0 });

  observer.observe(stage);
  window.addEventListener('resize', updateDeckOnScroll);
  updateDeckOnScroll();
})();

// ════════════════════════════════════════════
//  SITE FOOTER — Oversized IMC Watermark Parallax
// ════════════════════════════════════════════

(function initFooterWatermarkParallax() {
  const footer = document.getElementById('site-footer');
  const watermark = document.getElementById('footer-watermark');
  if (!footer || !watermark) return;

  function updateParallax() {
    const rect = footer.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    if (rect.top < windowHeight && rect.bottom > 0) {
      const scrollProgress = (windowHeight - rect.top) / (windowHeight + rect.height);
      const translateY = (1 - scrollProgress) * 40;
      watermark.style.transform = `translate(-50%, ${translateY.toFixed(2)}px)`;
    }
  }

  window.addEventListener('scroll', () => {
    requestAnimationFrame(updateParallax);
  }, { passive: true });

  updateParallax();
})();



