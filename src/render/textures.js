import * as THREE from 'three';
import { Rng } from '../core/rng.js';

// Every texture in the game is painted at load time on tiny canvases (32-256px),
// which is a big part of the PS2 look: low-res, hand-made, slightly noisy.
// Later you can swap any of these for real image files without touching the rest.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  return [c, g];
}

function makeTex(canvas, { repeat = true, srgb = true, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 1;
  return t;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function jitter(hex, rng, amt) {
  const c = rgb(hex);
  const d = (rng.next() - 0.5) * amt;
  return css([c[0] + d, c[1] + d * 0.9, c[2] + d * 0.8]);
}

function noise(g, w, h, rng, amount, x0 = 0, y0 = 0) {
  const img = g.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, x0, y0);
}

function glassGradient(g, x, y, w, h, top = '#7d97ae', bottom = '#253242') {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath();
  g.moveTo(x + w * 0.15, y + h);
  g.lineTo(x + w * 0.55, y);
  g.lineTo(x + w * 0.75, y);
  g.lineTo(x + w * 0.35, y + h);
  g.fill();
}

// ---------------------------------------------------------------------------
// Building facades. One texture tile = 4 windows wide x 4 floors tall.
export const FACADE_TILE = { w: 11.2, h: 12.8 };
export const FACADE_STYLES = [
  { id: 'brick', wall: '#8b4a3b', mortar: '#5b3a33', brick: true, frame: '#e2d8c6' },
  { id: 'cream', wall: '#c9b896', frame: '#5d4e40', band: '#ae9d7c' },
  { id: 'stone', wall: '#8e8c87', frame: '#2a2b2f', pilaster: '#a8a59e' },
  { id: 'teal', wall: '#4d7270', mortar: '#3c5856', tile: true, frame: '#dcd6c6' },
  { id: 'glass', curtain: true, wall: '#39475a' },
  { id: 'office', ribbon: true, wall: '#9a9ca3', frame: '#2e343c' },
  { id: 'rose', wall: '#a8706a', frame: '#efe6d6', band: '#946059' },
  { id: 'factory', wall: '#7e4a3a', mortar: '#523428', brick: true, frame: '#2b3034', big: true },
];

const CURTAINS = ['#9a5048', '#c8b88a', '#5a6e88', '#ddd6c8', '#7a6680', '#6e7e5c', '#e4ddd0'];
const WINDOW_GLOWS = ['#ffd38a', '#ffe2ac', '#ffc777', '#fff0cc', '#bfd6ff', '#ffb36b'];

function facade(style, seed) {
  const rng = new Rng(seed);
  const S = 128;
  const CW = 32;
  const CH = 32;
  const [cv, g] = makeCanvas(S, S);
  const [ce, ge] = makeCanvas(S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);

  g.fillStyle = style.mortar ?? style.wall;
  g.fillRect(0, 0, S, S);
  if (style.brick) {
    for (let y = 0; y < S; y += 4) {
      const off = (y / 4) % 2 ? 4 : 0;
      for (let x = -8; x < S; x += 8) {
        g.fillStyle = jitter(style.wall, rng, 26);
        g.fillRect(x + off, y, 7, 3);
      }
    }
  } else if (style.tile) {
    for (let y = 0; y < S; y += 4)
      for (let x = 0; x < S; x += 4) {
        g.fillStyle = jitter(style.wall, rng, 18);
        g.fillRect(x, y, 3, 3);
      }
  }
  noise(g, S, S, rng, 14);

  for (let r = 0; r < 4; r++) {
    const floorLit = rng.chance(0.6);
    for (let c = 0; c < 4; c++) {
      const x = c * CW;
      const y = r * CH;
      if (style.curtain) {
        glassGradient(g, x, y, CW, CH, '#8fb0c8', '#1f2b3a');
        g.fillStyle = '#2b3542';
        g.fillRect(x, y + CH - 6, CW, 6);
        g.fillRect(x + CW / 2, y, 1, CH);
        g.fillRect(x, y, 1, CH);
        if (floorLit && rng.chance(0.8)) {
          ge.fillStyle = rng.chance(0.7) ? '#d8e6ff' : '#fff1d0';
          ge.fillRect(x + 1, y + 1, CW - 2, CH - 7);
          ge.fillStyle = 'rgba(0,0,0,0.45)';
          for (let k = 0; k < 3; k++) ge.fillRect(x + rng.int(2, 26), y + 17, rng.int(3, 6), 8);
        }
        continue;
      }
      if (style.ribbon) {
        g.fillStyle = style.frame;
        g.fillRect(x, y + 9, CW, 16);
        glassGradient(g, x, y + 10, CW, 14, '#7f97ab', '#1e2733');
        g.fillStyle = style.frame;
        g.fillRect(x + 15, y + 10, 2, 14);
        if (floorLit && rng.chance(0.75)) {
          ge.fillStyle = rng.chance(0.6) ? '#e4ecff' : '#fff2d4';
          ge.fillRect(x, y + 10, CW, 14);
          ge.fillStyle = 'rgba(0,0,0,0.5)';
          ge.fillRect(x + 15, y + 10, 2, 14);
        }
        continue;
      }
      if (style.big) {
        // tall steel-framed industrial windows
        g.fillStyle = style.frame;
        g.fillRect(x + 2, y + 3, 28, 25);
        glassGradient(g, x + 3, y + 4, 26, 23, '#8aa0b0', '#26313c');
        g.fillStyle = style.frame;
        for (let k = 1; k < 4; k++) g.fillRect(x + 3 + Math.round(k * 6.5), y + 4, 1, 23);
        for (const f of [0.33, 0.66]) g.fillRect(x + 3, y + 4 + Math.round(23 * f), 26, 1);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(x + 1, y + 28, 30, 2);
        if (floorLit && rng.chance(0.6)) {
          ge.fillStyle = rng.pick(['#ffd9a0', '#ffe8c0', '#fff1d8']);
          ge.fillRect(x + 3, y + 4, 26, 23);
          ge.fillStyle = '#000';
          for (let k = 1; k < 4; k++) ge.fillRect(x + 3 + Math.round(k * 6.5), y + 4, 1, 23);
          for (const f of [0.33, 0.66]) ge.fillRect(x + 3, y + 4 + Math.round(23 * f), 26, 1);
        }
        continue;
      }
      const wx = x + 8;
      const wy = y + 6;
      const ww = 16;
      const wh = 19;
      if (style.pilaster) {
        g.fillStyle = style.pilaster;
        g.fillRect(x, y, 3, CH);
      }
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(wx - 2, wy - 3, ww + 4, 2);
      g.fillStyle = style.frame;
      g.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      glassGradient(g, wx, wy, ww, wh);
      const curtain = rng.chance(0.45) ? rng.pick(CURTAINS) : null;
      if (curtain) {
        g.fillStyle = curtain;
        if (rng.chance(0.5)) {
          g.fillRect(wx, wy, 5, wh);
          g.fillRect(wx + ww - 5, wy, 5, wh);
        } else g.fillRect(wx, wy, ww, rng.int(5, 12));
      } else if (rng.chance(0.25)) {
        g.fillStyle = 'rgba(220,214,200,0.55)';
        for (let k = 0; k < wh; k += 2) g.fillRect(wx, wy + k, ww, 1);
      }
      g.fillStyle = style.frame;
      g.fillRect(wx + ww / 2, wy, 1, wh);
      g.fillRect(wx, wy + 7, ww, 1);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(wx - 2, wy + wh + 1, ww + 4, 2);
      if (rng.chance(0.09)) {
        g.fillStyle = '#9a9a96';
        g.fillRect(wx + 3, wy + wh + 3, 10, 5);
      }
      // grime streak under the sill
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(wx + 2, wy + wh + 3, ww - 4, rng.int(2, 8));

      if (rng.chance(0.4)) {
        const glow = rng.pick(WINDOW_GLOWS);
        ge.fillStyle = glow;
        ge.fillRect(wx, wy, ww, wh);
        if (curtain) {
          ge.fillStyle = css(mul(rgb(curtain), 0.9));
          ge.fillRect(wx, wy, 5, wh);
          ge.fillRect(wx + ww - 5, wy, 5, wh);
        }
        ge.fillStyle = '#000';
        ge.fillRect(wx + ww / 2, wy, 1, wh);
        ge.fillRect(wx, wy + 7, ww, 1);
        if (rng.chance(0.3)) {
          ge.fillStyle = 'rgba(0,0,0,0.6)';
          ge.fillRect(wx + rng.int(2, 10), wy + 9, 4, 10); // someone standing inside
        }
      }
    }
    if (style.band) {
      g.fillStyle = style.band;
      g.fillRect(0, r * CH + CH - 3, S, 3);
    }
  }
  return { map: makeTex(cv), emissive: makeTex(ce) };
}

// ---------------------------------------------------------------------------
// Shop fronts: 4 variants stacked in one atlas, each 128x64 = 8m x 4.4m.
export const SHOP_TILE_W = 8;
function storefronts(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(128, 256);
  const [ce, ge] = makeCanvas(128, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 128, 256);
  const variants = [
    { wall: '#2f4a3a', trim: '#c9b27a', glow: '#ffd9a0' },
    { wall: '#5a2228', trim: '#e0c48a', glow: '#ffc890' },
    { wall: '#1f2c44', trim: '#9fb4c8', glow: '#d6ebff' },
    { wall: '#2e2c2b', trim: '#b8b0a2', glow: '#fff0c8' },
  ];
  const goods = ['#d24a3a', '#e8c547', '#4a8ad2', '#5fb35a', '#e6e1d6', '#c46ad0', '#f08a3a'];
  variants.forEach((v, k) => {
    const y0 = k * 64;
    g.fillStyle = v.wall;
    g.fillRect(0, y0, 128, 64);
    noise(g, 128, 64, rng, 10, 0, y0);
    g.fillStyle = css(mul(rgb(v.wall), 0.6));
    g.fillRect(0, y0 + 2, 128, 10);
    g.fillStyle = v.trim;
    g.fillRect(0, y0 + 12, 128, 2);
    const wins = [
      [4, 50],
      [74, 50],
    ];
    for (const [wx, ww] of wins) {
      g.fillStyle = v.trim;
      g.fillRect(wx - 1, y0 + 17, ww + 2, 37);
      glassGradient(g, wx, y0 + 18, ww, 35, '#56687a', '#151c24');
      ge.fillStyle = v.glow;
      ge.fillRect(wx, y0 + 18, ww, 35);
      // shelves of goods
      for (let s = 0; s < 2; s++) {
        const sy = y0 + 30 + s * 11;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(wx, sy + 7, ww, 1);
        for (let x = wx + 2; x < wx + ww - 4; x += rng.int(4, 7)) {
          const col = rng.pick(goods);
          const h = rng.int(3, 7);
          g.fillStyle = col;
          g.fillRect(x, sy + 7 - h, 3, h);
          ge.fillStyle = css(mul(rgb(col), 0.85));
          ge.fillRect(x, sy + 7 - h, 3, h);
        }
      }
      if (rng.chance(0.6)) {
        // a poster in the window
        const pc = rng.pick(goods);
        g.fillStyle = pc;
        g.fillRect(wx + ww - 14, y0 + 20, 10, 8);
        ge.fillStyle = pc;
        ge.fillRect(wx + ww - 14, y0 + 20, 10, 8);
      }
    }
    // door
    g.fillStyle = v.trim;
    g.fillRect(57, y0 + 17, 14, 47);
    glassGradient(g, 59, y0 + 19, 10, 45, '#4e5f70', '#10161d');
    ge.fillStyle = css(mul(rgb(v.glow), 0.8));
    ge.fillRect(59, y0 + 19, 10, 45);
    g.fillStyle = '#c8c0a8';
    g.fillRect(66, y0 + 40, 2, 3);
    // kick plate
    g.fillStyle = css(mul(rgb(v.wall), 0.5));
    g.fillRect(0, y0 + 56, 57, 8);
    g.fillRect(71, y0 + 56, 57, 8);
  });
  return { map: makeTex(cv), emissive: makeTex(ce) };
}

// ---------------------------------------------------------------------------
// Neon / painted shop signs. Made-up names only.
export const SIGN_NAMES = [
  'NOODLE BAR',
  'MOON VIDEO',
  '24H MART',
  'LUCKY CAFE',
  'ARCADE',
  'PAWN & GOLD',
  'LAUNDROMAT',
  'PHARMACY',
];
const SIGN_STYLES = [
  { bg: '#3a0d14', fg: '#ff4a6e' },
  { bg: '#0d1c3a', fg: '#7fd4ff' },
  { bg: '#0e2a14', fg: '#7dff8a' },
  { bg: '#3a2a0a', fg: '#ffd166' },
  { bg: '#2a0d3a', fg: '#e07bff' },
  { bg: '#3a1f0a', fg: '#ffb35c' },
  { bg: '#0a2a2a', fg: '#6affe6' },
  { bg: '#e8e2d4', fg: '#2e7d4f' },
];
function signs() {
  const [cv, g] = makeCanvas(256, 256);
  const [ce, ge] = makeCanvas(256, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  SIGN_NAMES.forEach((name, k) => {
    const y = k * 32;
    const st = SIGN_STYLES[k % SIGN_STYLES.length];
    g.fillStyle = st.bg;
    g.fillRect(0, y, 256, 32);
    g.strokeStyle = st.fg;
    g.lineWidth = 2;
    g.strokeRect(3, y + 3, 250, 26);
    ge.strokeStyle = st.fg;
    ge.lineWidth = 2;
    ge.strokeRect(3, y + 3, 250, 26);
    for (const [ctx, blur] of [
      [g, 0],
      [ge, 6],
    ]) {
      ctx.save();
      ctx.font = 'bold 21px "Arial Black", Impact, "Helvetica Neue", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(name).width;
      const sx = Math.min(1, 228 / w);
      ctx.translate(128, y + 17);
      ctx.scale(sx, 1);
      ctx.shadowColor = st.fg;
      ctx.shadowBlur = blur;
      ctx.fillStyle = st.fg;
      ctx.fillText(name, 0, 0);
      ctx.restore();
    }
  });
  return { map: makeTex(cv, { repeat: false }), emissive: makeTex(ce, { repeat: false }) };
}

// ---------------------------------------------------------------------------
function sidewalk(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.fillStyle = '#9b978e';
  g.fillRect(0, 0, 64, 64);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = `rgba(0,0,0,${rng.float(0.02, 0.08)})`;
    g.fillRect((k % 2) * 32, (k >> 1) * 32, 32, 32);
  }
  noise(g, 64, 64, rng, 22);
  g.fillStyle = '#6f6b63';
  g.fillRect(0, 0, 64, 1);
  g.fillRect(0, 32, 64, 1);
  g.fillRect(0, 0, 1, 64);
  g.fillRect(32, 0, 1, 64);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(30,30,30,${rng.float(0.15, 0.35)})`;
    g.beginPath();
    g.arc(rng.float(2, 62), rng.float(2, 62), rng.float(0.6, 1.6), 0, Math.PI * 2);
    g.fill();
  }
  return makeTex(cv);
}

function asphalt(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(128, 128);
  g.fillStyle = '#3b3b3f';
  g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 7; k++) {
    g.fillStyle = `rgba(${rng.pick([20, 70])},${rng.pick([20, 70])},${rng.pick([24, 74])},0.12)`;
    g.fillRect(rng.int(0, 100), rng.int(0, 100), rng.int(10, 40), rng.int(10, 40));
  }
  noise(g, 128, 128, rng, 30);
  g.strokeStyle = 'rgba(15,15,18,0.55)';
  g.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    let x = rng.float(0, 128);
    let y = rng.float(0, 128);
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += rng.float(-10, 10);
      y += rng.float(-10, 10);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return makeTex(cv);
}

function roadDash() {
  const [cv, g] = makeCanvas(16, 64);
  g.clearRect(0, 0, 16, 64);
  g.fillStyle = '#ddd6bb';
  g.fillRect(3, 0, 10, 30);
  return makeTex(cv);
}

function crosswalk(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#e4dfd2';
  g.fillRect(6, 0, 20, 64);
  g.fillRect(38, 0, 20, 64);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 45; k++) g.fillRect(rng.int(0, 63), rng.int(0, 63), 1, 1);
  return makeTex(cv);
}

function roof(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.fillStyle = '#5d5b58';
  g.fillRect(0, 0, 64, 64);
  noise(g, 64, 64, rng, 36);
  g.fillStyle = 'rgba(20,20,20,0.35)';
  g.fillRect(0, 31, 64, 2);
  g.fillRect(31, 0, 2, 64);
  return makeTex(cv);
}

function grass(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.fillStyle = '#4d6a32';
  g.fillRect(0, 0, 64, 64);
  for (let k = 0; k < 500; k++) {
    g.fillStyle = rng.pick(['#5d7d3a', '#3f5a28', '#6b8a44', '#45612c']);
    g.fillRect(rng.int(0, 63), rng.int(0, 63), 1, rng.int(1, 3));
  }
  return makeTex(cv);
}

function dirtPath(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.fillStyle = '#9b8a6c';
  g.fillRect(0, 0, 64, 64);
  noise(g, 64, 64, rng, 30);
  for (let k = 0; k < 40; k++) {
    g.fillStyle = 'rgba(80,70,55,0.5)';
    g.fillRect(rng.int(0, 63), rng.int(0, 63), 2, 2);
  }
  return makeTex(cv);
}

function plaza(seed) {
  const rng = new Rng(seed);
  const S = 128;
  const [cv, g] = makeCanvas(S, S);
  const [ce, ge] = makeCanvas(S, S);
  g.fillStyle = '#23302a';
  g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  // irregular flagstones by recursive splitting
  const split = (x, y, w, h, d) => {
    if (d > 3 || (w < 26 && h < 26) || (d > 1 && rng.chance(0.25))) {
      g.fillStyle = jitter('#4a4c5a', rng, 30);
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x + 1, y + 1, w - 2, 1);
      ge.fillStyle = `rgba(90,220,255,${rng.float(0.15, 0.6)})`;
      ge.fillRect(x, y + h - 1, w, 1);
      ge.fillRect(x + w - 1, y, 1, h);
      return;
    }
    if (w > h) {
      const c = Math.round(w * rng.float(0.35, 0.65));
      split(x, y, c, h, d + 1);
      split(x + c, y, w - c, h, d + 1);
    } else {
      const c = Math.round(h * rng.float(0.35, 0.65));
      split(x, y, w, c, d + 1);
      split(x, y + c, w, h - c, d + 1);
    }
  };
  split(0, 0, S, S, 0);
  noise(g, S, S, rng, 16);
  for (let k = 0; k < 60; k++) {
    g.fillStyle = 'rgba(70,110,60,0.5)';
    g.fillRect(rng.int(0, S), rng.int(0, S), rng.int(1, 4), 1);
  }
  return { map: makeTex(cv), emissive: makeTex(ce) };
}

// Procedural "runes": a few random strokes on a 3x4 grid. No font needed.
function drawGlyph(ctx, cx, cy, size, rng) {
  const pts = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 3; gx++) pts.push([cx + (gx - 1) * size * 0.35, cy + (gy - 1.5) * size * 0.3]);
  ctx.beginPath();
  // a spine plus 2-3 branches
  const sx = cx + rng.int(-1, 1) * size * 0.35;
  ctx.moveTo(sx, cy - size * 0.45);
  ctx.lineTo(sx, cy + size * 0.45);
  const n = rng.int(2, 3);
  for (let k = 0; k < n; k++) {
    const a = pts[rng.int(0, pts.length - 1)];
    const b = pts[rng.int(0, pts.length - 1)];
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}
function runeCircle(seed) {
  const rng = new Rng(seed);
  const S = 256;
  const [cv, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  for (const [r, w] of [
    [122, 3],
    [112, 1.5],
    [80, 2],
    [74, 1],
    [40, 2],
  ]) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 1.6;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    g.save();
    g.rotate(a);
    drawGlyph(g, 0, -96, 13, rng);
    g.restore();
  }
  g.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const b = ((k + 2) / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 74, Math.sin(a) * 74);
    g.lineTo(Math.cos(b) * 74, Math.sin(b) * 74);
    g.stroke();
  }
  return makeTex(cv, { repeat: false });
}

function runeStone(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(32, 64);
  const [ce, ge] = makeCanvas(32, 64);
  g.fillStyle = '#6c6a70';
  g.fillRect(0, 0, 32, 64);
  noise(g, 32, 64, rng, 40);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 32, 64);
  g.strokeStyle = '#34323c';
  g.lineWidth = 1.5;
  ge.strokeStyle = '#8ff4ff';
  ge.lineWidth = 1.5;
  ge.shadowColor = '#7ff0ff';
  ge.shadowBlur = 4;
  for (let k = 0; k < 4; k++) {
    const seedK = rng.int(0, 1e6);
    drawGlyph(g, 16, 10 + k * 14, 10, new Rng(seedK));
    drawGlyph(ge, 16, 10 + k * 14, 10, new Rng(seedK));
  }
  return { map: makeTex(cv), emissive: makeTex(ce) };
}

function bark(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(32, 64);
  g.fillStyle = '#5a4a46';
  g.fillRect(0, 0, 32, 64);
  for (let k = 0; k < 40; k++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(30,20,20,0.5)' : 'rgba(140,120,110,0.25)';
    g.fillRect(rng.int(0, 31), rng.int(0, 63), 1, rng.int(6, 20));
  }
  return makeTex(cv);
}

function face() {
  // left half: face (multiplied by skin colour per character); right half: plain
  const [cv, g] = makeCanvas(64, 32);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#e6e0dc';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#ffffff';
  g.fillRect(2, 2, 28, 28);
  // brows
  g.fillStyle = '#4a3a34';
  g.fillRect(7, 11, 6, 2);
  g.fillRect(19, 11, 6, 2);
  // eyes
  g.fillStyle = '#f4f4f4';
  g.fillRect(8, 14, 5, 3);
  g.fillRect(19, 14, 5, 3);
  g.fillStyle = '#1a1414';
  g.fillRect(10, 14, 3, 3);
  g.fillRect(19, 14, 3, 3);
  // nose shade
  g.fillStyle = '#d8cfca';
  g.fillRect(15, 16, 2, 5);
  g.fillStyle = '#c6bab4';
  g.fillRect(14, 21, 4, 1);
  // mouth
  g.fillStyle = '#9a5a55';
  g.fillRect(12, 24, 8, 2);
  return makeTex(cv, { repeat: false });
}

function radial(inner, outer, size = 64, alphaPow = 1) {
  const [cv, g] = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const h = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - h, y + 0.5 - h) / h);
      const a = Math.pow(1 - d, alphaPow);
      const i = (y * size + x) * 4;
      img.data[i] = inner[0] * (1 - d) + outer[0] * d;
      img.data[i + 1] = inner[1] * (1 - d) + outer[1] * d;
      img.data[i + 2] = inner[2] * (1 - d) + outer[2] * d;
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  return makeTex(cv, { repeat: false });
}

function lanternPaper(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(32, 32);
  g.fillStyle = '#ffb45e';
  g.fillRect(0, 0, 32, 32);
  noise(g, 32, 32, rng, 20);
  g.fillStyle = 'rgba(150,50,20,0.55)';
  for (let x = 0; x < 32; x += 4) g.fillRect(x, 0, 1, 32);
  g.fillStyle = '#3a1d10';
  g.fillRect(0, 0, 32, 4);
  g.fillRect(0, 28, 32, 4);
  g.strokeStyle = 'rgba(200,40,30,0.85)';
  g.lineWidth = 1.5;
  drawGlyph(g, 16, 16, 12, rng);
  return makeTex(cv);
}

function clouds(seed) {
  const rng = new Rng(seed);
  const S = 256;
  const [cv, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const r = rng.float(8, 34);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(255,255,255,${rng.float(0.18, 0.4)})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  return makeTex(cv, { srgb: false });
}

function water(seed) {
  const rng = new Rng(seed);
  const [cv, g] = makeCanvas(64, 64);
  g.fillStyle = '#2d5a6e';
  g.fillRect(0, 0, 64, 64);
  noise(g, 64, 64, rng, 18);
  g.strokeStyle = 'rgba(200,240,255,0.35)';
  for (let k = 0; k < 14; k++) {
    g.beginPath();
    const x = rng.float(0, 64);
    const y = rng.float(0, 64);
    g.arc(x, y, rng.float(3, 9), rng.float(0, 3), rng.float(3, 6));
    g.stroke();
  }
  return makeTex(cv);
}

export { makeCanvas, makeTex, noise, rgb, css, mul, jitter, glassGradient };

export function createTextures() {
  const t = {
    facades: FACADE_STYLES.map((s, i) => facade(s, 100 + i * 17)),
    shops: storefronts(7),
    signs: signs(),
    sidewalk: sidewalk(3),
    asphalt: asphalt(4),
    dash: roadDash(),
    crosswalk: crosswalk(5),
    roof: roof(6),
    grass: grass(8),
    path: dirtPath(9),
    plaza: plaza(10),
    runeCircle: runeCircle(11),
    runeStone: runeStone(12),
    bark: bark(13),
    face: face(),
    glow: radial([255, 255, 255], [255, 255, 255], 64, 2.2),
    softGlow: radial([255, 255, 255], [255, 255, 255], 64, 1.2),
    shadow: radial([0, 0, 0], [0, 0, 0], 64, 1.5),
    lantern: lanternPaper(14),
    clouds: clouds(15),
    water: water(16),
  };
  return t;
}
