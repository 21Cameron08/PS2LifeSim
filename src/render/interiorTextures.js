import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { makeCanvas, makeTex, noise, rgb, css, jitter } from './textures.js';

// Procedural textures for apartment interiors. `scale` on each entry is how many
// metres one tile of the texture covers when it's laid on a wall or floor.

function solidBase(g, w, h, hex) {
  g.fillStyle = hex;
  g.fillRect(0, 0, w, h);
}

function plaster(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, '#f4f4f2');
  noise(g, 64, 64, rng, 10);
  return makeTex(c);
}

function wallpaper(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, '#dccfa6');
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = '#cbbb8e';
    g.fillRect(x + 6, 0, 5, 64);
    g.fillStyle = '#b39a6a';
    for (let y = 4; y < 64; y += 16) {
      g.beginPath();
      g.moveTo(x + 8.5, y);
      g.lineTo(x + 11, y + 3);
      g.lineTo(x + 8.5, y + 6);
      g.lineTo(x + 6, y + 3);
      g.fill();
    }
  }
  for (let k = 0; k < 3; k++) {
    const gr = g.createRadialGradient(rng.float(0, 64), rng.float(0, 64), 0, rng.float(0, 64), rng.float(0, 64), rng.float(10, 28));
    gr.addColorStop(0, 'rgba(120,90,40,0.12)');
    gr.addColorStop(1, 'rgba(120,90,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  noise(g, 64, 64, rng, 12);
  return makeTex(c);
}

function brick(seed) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  solidBase(g, S, S, '#b5a691');
  const cols = ['#8a3e2c', '#7a3426', '#9a4a32', '#6e2e22', '#a05a3e', '#844030'];
  for (let y = 0; y < S; y += 6) {
    const off = (y / 6) % 2 ? 8 : 0;
    for (let x = -16; x < S; x += 16) {
      g.fillStyle = jitter(rng.pick(cols), rng, 20);
      g.fillRect(x + off, y, 15, 5);
    }
  }
  // patches of old whitewash
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(230,225,215,${rng.float(0.08, 0.2)})`;
    g.fillRect(rng.int(0, S), rng.int(0, S), rng.int(10, 40), rng.int(6, 24));
  }
  noise(g, S, S, rng, 22);
  return makeTex(c);
}

function squareTile(seed, base, grout, n) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, grout);
  const s = 64 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      g.fillStyle = jitter(base, rng, 10);
      g.fillRect(x * s + 1, y * s + 1, s - 1, s - 1);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x * s + 1, y * s + 1, s - 1, 1);
    }
  noise(g, 64, 64, rng, 6);
  return makeTex(c);
}

function subway(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, '#bdbab2');
  for (let y = 0; y < 64; y += 8) {
    const off = (y / 8) % 2 ? 8 : 0;
    for (let x = -16; x < 64; x += 16) {
      g.fillStyle = jitter('#f2f1ec', rng, 8);
      g.fillRect(x + off + 1, y + 1, 15, 7);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x + off + 1, y + 1, 15, 1);
    }
  }
  return makeTex(c);
}

function planks(seed, base, w = 10, worn = 0) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  for (let x = 0; x < S; x += w) {
    let y = -rng.int(0, 60);
    while (y < S) {
      const len = rng.int(40, 90);
      g.fillStyle = jitter(base, rng, 30);
      g.fillRect(x, y, w - 1, len - 1);
      // grain
      for (let k = 0; k < 3; k++) {
        g.fillStyle = 'rgba(40,20,10,0.18)';
        g.fillRect(x + rng.int(1, w - 2), y, 1, len - 1);
      }
      y += len;
    }
    g.fillStyle = 'rgba(20,10,5,0.6)';
    g.fillRect(x + w - 1, 0, 1, S);
  }
  for (let k = 0; k < worn; k++) {
    g.fillStyle = `rgba(230,200,150,${rng.float(0.05, 0.14)})`;
    g.beginPath();
    g.ellipse(rng.float(0, S), rng.float(0, S), rng.float(6, 26), rng.float(4, 14), rng.float(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  noise(g, S, S, rng, 14);
  return makeTex(c);
}

function chevron(seed, base) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  const img = g.createImageData(S, S);
  const shades = [];
  for (let k = 0; k < 128; k++) {
    const b = rgb(base);
    const d = rng.float(-28, 28);
    shades.push([b[0] + d, b[1] + d * 0.85, b[2] + d * 0.7]);
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const block = Math.floor(x / 16);
      const lx = x % 16;
      const off = block % 2 ? lx : 16 - lx;
      const v = y + off;
      const plank = Math.floor(v / 8) % 16;
      const edge = v % 8 === 0 || lx === 0;
      const col = shades[(block * 16 + plank) % 128];
      const i = (y * S + x) * 4;
      const k = edge ? 0.55 : 1;
      img.data[i] = col[0] * k;
      img.data[i + 1] = col[1] * k;
      img.data[i + 2] = col[2] * k;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  noise(g, S, S, rng, 10);
  return makeTex(c);
}

function concrete(seed) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  solidBase(g, S, S, '#8d8c88');
  for (let k = 0; k < 26; k++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const r = rng.float(10, 40);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        const l = rng.chance(0.5) ? '255,255,255' : '40,40,40';
        gr.addColorStop(0, `rgba(${l},0.07)`);
        gr.addColorStop(1, `rgba(${l},0)`);
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  g.strokeStyle = 'rgba(40,40,40,0.25)';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    let x = rng.float(0, S);
    let y = rng.float(0, S);
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) g.lineTo((x += rng.float(-14, 14)), (y += rng.float(-14, 14)));
    g.stroke();
  }
  noise(g, S, S, rng, 12);
  return makeTex(c);
}

function checker(seed, a, b) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  for (let k = 0; k < 18; k++) {
    g.fillStyle = `rgba(60,50,40,${rng.float(0.05, 0.15)})`;
    g.fillRect(rng.int(0, 63), rng.int(0, 63), rng.int(2, 12), 1);
  }
  noise(g, 64, 64, rng, 14);
  return makeTex(c);
}

function penny(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, '#a9a69c');
  for (let r = 0; r < 8; r++)
    for (let k = -1; k < 9; k++) {
      const x = k * 8 + (r % 2 ? 4 : 0) + 4;
      const y = r * 8 + 4;
      g.fillStyle = rng.chance(0.06) ? '#2c2c30' : jitter('#ecebe4', rng, 10);
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  noise(g, 64, 64, rng, 8);
  return makeTex(c);
}

function marble(seed) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  solidBase(g, S, S, '#ebe9e4');
  noise(g, S, S, rng, 8);
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = rng.float(0, S);
    let y = rng.float(0, S);
    const pts = [[x, y]];
    for (let s = 0; s < 10; s++) pts.push([(x += rng.float(-6, 18)), (y += rng.float(-10, 10))]);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.strokeStyle = `rgba(110,110,118,${rng.float(0.15, 0.35)})`;
        g.lineWidth = rng.float(0.6, 1.8);
        g.beginPath();
        pts.forEach(([px, py], i) => (i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
        g.stroke();
      }
  }
  return makeTex(c);
}

function carpet(seed, base) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, base);
  noise(g, 64, 64, rng, 26);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = `rgba(80,60,40,${rng.float(0.04, 0.1)})`;
    g.beginPath();
    g.arc(rng.float(0, 64), rng.float(0, 64), rng.float(4, 12), 0, Math.PI * 2);
    g.fill();
  }
  return makeTex(c);
}

function fabric(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(32, 32);
  solidBase(g, 32, 32, '#f0f0f0');
  for (let y = 0; y < 32; y += 2) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, y, 32, 1);
  }
  noise(g, 32, 32, rng, 18);
  return makeTex(c);
}

function woodGrain(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  solidBase(g, 64, 64, '#d0a676');
  for (let y = 0; y < 64; y++) {
    const k = Math.sin(y * 0.45 + Math.sin(y * 0.11) * 3) * 0.5 + 0.5;
    g.fillStyle = `rgba(90,50,20,${0.05 + k * 0.12})`;
    g.fillRect(0, y, 64, 1);
  }
  noise(g, 64, 64, rng, 10);
  return makeTex(c);
}

function white() {
  const [c, g] = makeCanvas(4, 4);
  solidBase(g, 4, 4, '#ffffff');
  return makeTex(c);
}

function books(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  const cols = ['#7a2a2a', '#2a3a6a', '#3a5a3a', '#c8b07a', '#5a3a6a', '#d8d0c0', '#1e1e22', '#a8582a', '#4a6a8a', '#8a7a5a'];
  let x = 0;
  while (x < 128) {
    const w = rng.int(3, 8);
    const h = rng.int(38, 62);
    const col = rng.pick(cols);
    g.fillStyle = col;
    g.fillRect(x, 64 - h, w - 1, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, 64 - h + 4, w - 1, 2);
    g.fillRect(x, 64 - 8, w - 1, 1);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + w - 2, 64 - h, 1, h);
    x += w + (rng.chance(0.08) ? rng.int(6, 14) : 0);
  }
  return makeTex(c, { repeat: true });
}

function artAtlas(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(256, 128);
  const cell = (i, fn) => {
    const x = (i % 4) * 64;
    const y = Math.floor(i / 4) * 64;
    g.save();
    g.beginPath();
    g.rect(x, y, 64, 64);
    g.clip();
    g.translate(x, y);
    fn();
    g.restore();
  };
  const text = (t, y, size, col, font = 'bold') => {
    g.font = `${font} ${size}px "Arial Black", Impact, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = col;
    g.fillText(t, 32, y);
  };
  // 0: colour field
  cell(0, () => {
    solidBase(g, 64, 64, '#3a1a1a');
    g.fillStyle = '#c0452c';
    g.fillRect(6, 6, 52, 26);
    g.fillStyle = '#e09a3a';
    g.fillRect(6, 36, 52, 22);
    noise(g, 64, 64, rng, 18);
  });
  // 1: circles
  cell(1, () => {
    solidBase(g, 64, 64, '#ece4d2');
    for (const [x, y, r, col] of [
      [22, 26, 16, '#2a4a8a'],
      [40, 40, 13, '#d8a02a'],
      [30, 46, 7, '#c03a2a'],
    ]) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#1e1e22';
    g.fillRect(8, 54, 48, 2);
  });
  // 2: seaside sunset
  cell(2, () => {
    const gr = g.createLinearGradient(0, 0, 0, 40);
    gr.addColorStop(0, '#3a3a7a');
    gr.addColorStop(1, '#ff9a5a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 40);
    g.fillStyle = '#ffd27a';
    g.beginPath();
    g.arc(40, 36, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a4a6a';
    g.fillRect(0, 38, 64, 26);
    g.fillStyle = 'rgba(255,200,120,0.6)';
    for (let k = 0; k < 6; k++) g.fillRect(36 - k, 41 + k * 3, 8 + k * 2, 1);
  });
  // 3: night skyline
  cell(3, () => {
    solidBase(g, 64, 64, '#141a3a');
    for (let k = 0; k < 9; k++) {
      const x = k * 7 + rng.int(0, 3);
      const h = rng.int(16, 44);
      g.fillStyle = '#0a0c18';
      g.fillRect(x, 64 - h, 7, h);
      g.fillStyle = '#ffd27a';
      for (let w = 0; w < 6; w++) if (rng.chance(0.5)) g.fillRect(x + 1 + (w % 2) * 3, 64 - h + 3 + Math.floor(w / 2) * 5, 2, 2);
    }
    g.fillStyle = '#e8e8ff';
    g.beginPath();
    g.arc(50, 12, 5, 0, Math.PI * 2);
    g.fill();
  });
  // 4: gig poster
  cell(4, () => {
    solidBase(g, 64, 64, '#1e1e22');
    g.fillStyle = '#e8c547';
    g.fillRect(4, 4, 56, 56);
    g.fillStyle = '#1e1e22';
    g.beginPath();
    g.arc(32, 26, 14, 0, Math.PI * 2);
    g.fill();
    text('THE LAMP-', 48, 9, '#1e1e22');
    text('LIGHTERS', 57, 9, '#1e1e22');
  });
  // 5: film poster
  cell(5, () => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#2a0a3a');
    gr.addColorStop(1, '#0a2a4a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#7fd4ff';
    g.globalAlpha = 0.5;
    for (let k = 0; k < 30; k++) {
      const x = rng.float(0, 64);
      const y = rng.float(0, 50);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 2, y + 6);
      g.stroke();
    }
    g.globalAlpha = 1;
    text('NEON', 50, 13, '#ff4a8a');
    text('RAIN', 61, 10, '#ff4a8a');
  });
  // 6: botanical print
  cell(6, () => {
    solidBase(g, 64, 64, '#efe9da');
    g.strokeStyle = '#3a6a3a';
    g.fillStyle = '#5a8a4a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(32, 58);
    g.lineTo(32, 10);
    g.stroke();
    for (let k = 0; k < 5; k++) {
      const y = 16 + k * 9;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(32 + s * 9, y, 9, 3.5, s * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  // 7: map of the city
  cell(7, () => {
    solidBase(g, 64, 64, '#e8e0c8');
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) {
        let col = '#c8bfa4';
        if (x === 1 && y === 2) col = '#8ab06a';
        if (x === 4 && y === 4) col = '#9a7ad0';
        if ((x === 2 || x === 3) && (y === 2 || y === 3)) col = '#a8a8b0';
        g.fillStyle = col;
        g.fillRect(4 + x * 9.5, 4 + y * 9.5, 7.5, 7.5);
      }
    g.fillStyle = '#c03a2a';
    g.beginPath();
    g.arc(16, 15, 2, 0, Math.PI * 2);
    g.fill();
  });
  return makeTex(c, { repeat: false });
}

function rug(seed, kind) {
  const rng = new Rng(seed);
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  if (kind === 'persian') {
    solidBase(g, S, S, '#1f2a4a');
    g.fillStyle = '#e8d8b0';
    g.fillRect(6, 6, S - 12, S - 12);
    g.fillStyle = '#7a1e26';
    g.fillRect(12, 12, S - 24, S - 24);
    g.fillStyle = '#1f2a4a';
    g.beginPath();
    g.moveTo(64, 26);
    g.lineTo(98, 64);
    g.lineTo(64, 102);
    g.lineTo(30, 64);
    g.fill();
    g.fillStyle = '#e8b04a';
    g.beginPath();
    g.moveTo(64, 44);
    g.lineTo(82, 64);
    g.lineTo(64, 84);
    g.lineTo(46, 64);
    g.fill();
    for (let k = 0; k < 120; k++) {
      g.fillStyle = rng.pick(['rgba(232,216,176,0.5)', 'rgba(31,42,74,0.5)', 'rgba(232,176,74,0.4)']);
      g.fillRect(rng.int(14, S - 16), rng.int(14, S - 16), 2, 2);
    }
  } else if (kind === 'modern') {
    solidBase(g, S, S, '#cfc6b6');
    g.fillStyle = '#8a8a86';
    g.fillRect(0, 70, S, 18);
    g.fillStyle = '#3a4048';
    g.fillRect(0, 92, S, 6);
    g.fillStyle = '#c87a4a';
    g.fillRect(84, 0, 10, S);
  } else {
    // braided/striped cheap rug
    const cols = ['#8a3a3a', '#d8c8a0', '#3a5a7a', '#c89a4a'];
    for (let y = 0; y < S; y += 8) {
      g.fillStyle = cols[(y / 8) % cols.length];
      g.fillRect(0, y, S, 8);
    }
  }
  noise(g, S, S, rng, 24);
  return makeTex(c, { repeat: false });
}

function curtain() {
  const [c, g] = makeCanvas(32, 64);
  for (let x = 0; x < 32; x++) {
    const k = 0.75 + 0.25 * Math.sin((x / 32) * Math.PI * 6);
    g.fillStyle = css([255 * k, 255 * k, 255 * k]);
    g.fillRect(x, 0, 1, 64);
  }
  return makeTex(c);
}

function blinds() {
  const [c, g] = makeCanvas(16, 32);
  g.clearRect(0, 0, 16, 32);
  for (let y = 0; y < 32; y += 4) {
    g.fillStyle = '#f2f0ea';
    g.fillRect(0, y, 16, 3);
    g.fillStyle = '#c8c4b8';
    g.fillRect(0, y + 2, 16, 1);
  }
  return makeTex(c);
}

function mirror() {
  const [c, g] = makeCanvas(64, 64);
  const gr = g.createLinearGradient(0, 0, 64, 64);
  gr.addColorStop(0, '#b8c8d4');
  gr.addColorStop(0.5, '#6a7a88');
  gr.addColorStop(1, '#9aaab8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const o of [10, 22]) {
    g.beginPath();
    g.moveTo(o, 64);
    g.lineTo(o + 30, 0);
    g.lineTo(o + 36, 0);
    g.lineTo(o + 6, 64);
    g.fill();
  }
  return makeTex(c, { repeat: false });
}

/** A tiny animated TV: call draw(time, on) every few frames. */
function tv() {
  const [c, g] = makeCanvas(64, 48);
  const tex = makeTex(c, { repeat: false });
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  let channel = 0;
  const draw = (t, on) => {
    if (!on) {
      solidBase(g, 64, 48, '#0c1012');
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(6, 4, 20, 40);
    } else {
      const seg = Math.floor(t / 7) % 3;
      channel = seg;
      if (channel === 0) {
        // news: anchor + ticker
        solidBase(g, 64, 48, '#1a3a6a');
        g.fillStyle = '#d0a080';
        g.fillRect(26, 14, 12, 12);
        g.fillStyle = '#2a2a3a';
        g.fillRect(20, 26, 24, 22);
        g.fillStyle = '#c03030';
        g.fillRect(0, 38, 64, 10);
        g.fillStyle = '#fff';
        for (let k = 0; k < 8; k++) g.fillRect(((k * 12 - t * 20) % 80 + 80) % 80 - 8, 42, 7, 2);
      } else if (channel === 1) {
        // cartoon: bouncing ball
        solidBase(g, 64, 48, '#6ac0e8');
        g.fillStyle = '#5ab05a';
        g.fillRect(0, 36, 64, 12);
        const x = (t * 25) % 72 - 4;
        const y = 34 - Math.abs(Math.sin(t * 4)) * 22;
        g.fillStyle = '#e83a3a';
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      } else {
        // static between channels / a quiz show
        const img = g.createImageData(64, 48);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 200;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < 48; y += 2) g.fillRect(0, y, 64, 1);
    }
    tex.needsUpdate = true;
  };
  draw(0, false);
  return { tex, draw };
}

function vct(seed) {
  // speckled vinyl composition tile: the floor of every convenience store ever
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = jitter('#e4e0d4', rng, 10);
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  for (let k = 0; k < 260; k++) {
    g.fillStyle = rng.pick(['#9a968a', '#7a8a8a', '#b8a890', '#5a6a6a']);
    g.fillRect(rng.int(0, 63), rng.int(0, 63), 1, 1);
  }
  g.fillStyle = 'rgba(80,80,70,0.35)';
  g.fillRect(0, 0, 64, 1);
  g.fillRect(0, 32, 64, 1);
  g.fillRect(0, 0, 1, 64);
  g.fillRect(32, 0, 1, 64);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = 'rgba(60,50,40,0.06)';
    g.fillRect(rng.int(0, 50), rng.int(0, 50), rng.int(6, 20), rng.int(4, 12));
  }
  return makeTex(c);
}

function ceilingTile(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(64, 64);
  g.fillStyle = '#c8c4b8';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f2f0ea';
  g.fillRect(2, 2, 60, 60);
  for (let k = 0; k < 160; k++) {
    g.fillStyle = 'rgba(120,115,100,0.35)';
    g.fillRect(rng.int(3, 60), rng.int(3, 60), 1, 1);
  }
  if (rng.chance(1)) {
    g.fillStyle = 'rgba(150,120,70,0.12)';
    g.beginPath();
    g.arc(44, 20, 9, 0, Math.PI * 2);
    g.fill();
  }
  return makeTex(c);
}

function productLabel() {
  // a generic printed package, tinted per product
  const [c, g] = makeCanvas(32, 32);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 9, 32, 7);
  g.fillStyle = '#ffffff';
  g.fillRect(3, 11, 18, 1);
  g.fillRect(3, 13, 12, 1);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(23, 24, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 29, 32, 3);
  return makeTex(c, { repeat: false });
}

export function createInteriorTextures() {
  return {
    plaster: { map: plaster(201), scale: 2 },
    wallpaper: { map: wallpaper(202), scale: 0.9 },
    brick: { map: brick(203), scale: 1.6 },
    wallTile: { map: squareTile(204, '#eeede6', '#b9b6ac', 4), scale: 0.6 },
    subway: { map: subway(205), scale: 0.6 },
    woodWorn: { map: planks(206, '#9a6a3c', 10, 14), scale: 1.6 },
    woodOak: { map: planks(207, '#c49a68', 12, 0), scale: 1.8 },
    herringbone: { map: chevron(208, '#7a634c'), scale: 1.4 },
    concrete: { map: concrete(209), scale: 3 },
    lino: { map: checker(210, '#e6dcc0', '#4e7a70'), scale: 0.6 },
    penny: { map: penny(211), scale: 0.4 },
    marble: { map: marble(212), scale: 1.6 },
    carpet: { map: carpet(213, '#a49478'), scale: 1 },
    fabric: { map: fabric(214), scale: 0.5 },
    wood: { map: woodGrain(215), scale: 1 },
    solid: { map: white(), scale: 1 },
    books: { map: books(216), scale: 0.9 },
    art: { map: artAtlas(217), scale: 1 },
    rugPersian: { map: rug(218, 'persian'), scale: 1 },
    rugModern: { map: rug(219, 'modern'), scale: 1 },
    rugStripe: { map: rug(220, 'stripe'), scale: 1 },
    curtain: { map: curtain(), scale: 1 },
    blinds: { map: blinds(), scale: 0.25 },
    mirror: { map: mirror(), scale: 1 },
    vct: { map: vct(221), scale: 0.6 },
    ceilTile: { map: ceilingTile(222), scale: 1.2 },
    label: { map: productLabel(), scale: 1 },
    tv: tv(),
  };
}
