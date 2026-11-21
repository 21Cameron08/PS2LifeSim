import * as THREE from 'three';
import { makeCanvas, makeTex } from './textures.js';

// Signs for THE CROWN (the members' club on the roof of the Meridian tower) and
// ORRERY (the restaurant up there), plus the pool's water. All names made up.

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Arial Black", Impact, sans-serif';
const BODY = 'Arial, Helvetica, sans-serif';
const GOLD = '#d8b46a';

function t(g, s, x, y, size, col, { align = 'center', font = SERIF, weight = 'bold', max, spacing = 0, italic = false } = {}) {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(s, x, y, max);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

export const CSIGN = {
  crown: [0, 0, 512, 128], // over the lift on the roof
  lobby: [512, 0, 512, 128], // the street entrance
  orrery: [0, 128, 512, 128], // gold letters on the pavilion
  sunset: [512, 128, 512, 128], // neon over the DJ corner
  menu: [0, 256, 256, 384], // ORRERY's menu on the host stand
  pool: [256, 256, 256, 96], // NO DIVING
  members: [256, 352, 256, 96], // MEMBERS · RESIDENTS · GUESTS OF ORRERY
  bar: [512, 256, 512, 128], // THE CROWN BAR
  floor: [256, 448, 256, 192], // the lift's floor badge
};
export const csignUV = (k) => {
  const [x, y, w, h] = CSIGN[k];
  return [(x + 2) / 1024, 1 - (y + h - 2) / 1024, (x + w - 2) / 1024, 1 - (y + 2) / 1024];
};

/** A little five-pointed crown. */
function crownIcon(g, cx, cy, s, col = GOLD) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-s, s * 0.5);
  g.lineTo(-s, -s * 0.3);
  g.lineTo(-s * 0.5, s * 0.05);
  g.lineTo(0, -s * 0.6);
  g.lineTo(s * 0.5, s * 0.05);
  g.lineTo(s, -s * 0.3);
  g.lineTo(s, s * 0.5);
  g.closePath();
  g.fill();
  g.fillRect(-s, s * 0.6, s * 2, s * 0.22);
  g.restore();
}

/** An orrery: a sun and rings, drawn as the restaurant's mark. */
function orreryIcon(g, cx, cy, r, col = GOLD) {
  g.save();
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 2;
  for (const k of [0.45, 0.72, 1]) {
    g.beginPath();
    g.ellipse(cx, cy, r * k, r * k * 0.42, -0.35, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  g.fill();
  for (const [k, a] of [
    [0.45, 0.8],
    [0.72, 3.6],
    [1, 5.2],
  ]) {
    g.beginPath();
    g.arc(cx + Math.cos(a) * r * k * Math.cos(-0.35) - Math.sin(a) * r * k * 0.42 * Math.sin(-0.35), cy + Math.cos(a) * r * k * Math.sin(-0.35) + Math.sin(a) * r * k * 0.42 * Math.cos(-0.35), r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function signs() {
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#101012';
  g.fillRect(0, 0, 1024, 1024);
  const slot = (k, fn) => {
    const [x, y, w, h] = CSIGN[k];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    fn(g, w, h);
    g.restore();
  };
  slot('crown', (g, w, h) => {
    g.fillStyle = '#121214';
    g.fillRect(0, 0, w, h);
    crownIcon(g, 70, h / 2, 30);
    t(g, 'THE CROWN', 290, h / 2 - 8, 58, GOLD, { spacing: 10 });
    t(g, 'MERIDIAN TOWER · ROOF', 290, h / 2 + 36, 16, '#a8a090', { font: BODY, spacing: 6, weight: 'normal' });
  });
  slot('lobby', (g, w, h) => {
    g.fillStyle = '#16140f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    crownIcon(g, 64, h / 2 - 4, 24);
    t(g, 'THE CROWN · ORRERY', 290, h / 2 - 12, 34, GOLD, { spacing: 4 });
    t(g, 'members · residents · reservations', 290, h / 2 + 26, 16, '#c8bca0', { font: BODY, weight: 'normal', spacing: 2 });
  });
  slot('orrery', (g, w, h) => {
    g.fillStyle = '#0e0e10';
    g.fillRect(0, 0, w, h);
    orreryIcon(g, 70, h / 2, 46);
    t(g, 'ORRERY', 300, h / 2 - 6, 70, GOLD, { spacing: 22 });
    t(g, 'seven courses · one view', 300, h / 2 + 42, 16, '#a8a090', { font: BODY, weight: 'normal', spacing: 4 });
  });
  slot('sunset', (g, w, h) => {
    g.fillStyle = '#0a0a10';
    g.fillRect(0, 0, w, h);
    g.shadowColor = '#ff6aa0';
    g.shadowBlur = 18;
    t(g, 'sunset sessions', w / 2, h / 2 - 6, 64, '#ff9ac8', { font: '"Brush Script MT", "Segoe Script", cursive', weight: 'normal', italic: true });
    g.shadowColor = '#ffb04a';
    t(g, '6 PM - 10 PM', w / 2, h / 2 + 42, 22, '#ffd08a', { font: BODY, spacing: 6 });
    g.shadowBlur = 0;
  });
  slot('menu', (g, w, h) => {
    g.fillStyle = '#f4efe4';
    g.fillRect(0, 0, w, h);
    orreryIcon(g, w / 2, 40, 26, '#8a6a30');
    t(g, 'ORRERY', w / 2, 84, 26, '#2a2418', { spacing: 8 });
    const rows = ['oyster · finger lime', 'tomato tea', 'scallop · hazelnut', 'tagliolini · truffle', 'short rib · onion', 'a serious cheese', 'the orrery'];
    rows.forEach((r, k) => t(g, r, w / 2, 122 + k * 30, 15, '#4a4030', { italic: true, weight: 'normal' }));
    t(g, '$420 · pairing $260', w / 2, 350, 15, '#8a6a30', { font: BODY });
  });
  slot('pool', (g, w, h) => {
    g.fillStyle = '#e8e4da';
    g.fillRect(0, 0, w, h);
    t(g, 'NO DIVING', w / 2, 36, 30, '#1a3a5a', { font: SANS, spacing: 4 });
    t(g, 'depth 1.05 m · members only', w / 2, 70, 15, '#3a4a5a', { font: BODY, weight: 'normal' });
  });
  slot('members', (g, w, h) => {
    g.fillStyle = '#16140f';
    g.fillRect(0, 0, w, h);
    t(g, 'MEMBERS ONLY', w / 2, 36, 26, GOLD, { spacing: 6 });
    t(g, 'residents · guests of ORRERY', w / 2, 70, 15, '#c8bca0', { font: BODY, weight: 'normal' });
  });
  slot('bar', (g, w, h) => {
    g.fillStyle = '#121214';
    g.fillRect(0, 0, w, h);
    crownIcon(g, 60, h / 2, 20);
    t(g, 'THE CROWN BAR', 280, h / 2, 40, GOLD, { spacing: 8 });
  });
  slot('floor', (g, w, h) => {
    g.fillStyle = '#16140f';
    g.fillRect(0, 0, w, h);
    crownIcon(g, w / 2, h / 2, 50);
  });
  return makeTex(c, { repeat: false });
}

/** Rippling pool water with bright caustic lines (it scrolls in two directions). */
function water() {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#1a8ab0';
  g.fillRect(0, 0, S, S);
  const r = (k) => ((k * 9301 + 49297) % 233280) / 233280;
  g.strokeStyle = 'rgba(200,250,255,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k < 70; k++) {
    const x = r(k) * S;
    const y = r(k + 100) * S;
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rr = 10 + r(k * 7 + i) * 14;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  // tile both ways by drawing the edges again wrapped
  const img = g.getImageData(0, 0, S, S);
  g.putImageData(img, S / 2, S / 2);
  g.putImageData(img, -S / 2, -S / 2);
  g.putImageData(img, S / 2, -S / 2);
  g.putImageData(img, -S / 2, S / 2);
  const tex = makeTex(c, { repeat: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createCrownTextures() {
  const csigns = signs();
  return { csigns, water: water(), kit: { cSigns: { map: csigns, scale: 1 } } };
}
