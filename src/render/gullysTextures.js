import { Rng } from '../core/rng.js';
import { makeCanvas, makeTex, noise } from './textures.js';
import { BRAND, LUNCH, BREAKFAST, price } from '../game/gullysMenu.js';

// Procedural textures for GULLY'S: the logo, Gully's face, menu boards with little
// drawn food icons, the NOW SERVING display, a harbour mural, posters and signs.

const FONT = '"Arial Black", Impact, sans-serif';
const { teal, orange, cream, navy } = BRAND;

function text(g, t, x, y, size, col, { align = 'center', weight = 'bold', font = FONT, max } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(t, x, y, max);
}

function ellipse(g, x, y, rx, ry, col) {
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** Gully's head: round, white, orange beak, teal cap, one eye winking. */
export function drawFace(g, cx, cy, r) {
  ellipse(g, cx, cy, r, r, '#f6f4ee');
  g.strokeStyle = navy;
  g.lineWidth = r * 0.08;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = orange;
  g.beginPath();
  g.moveTo(cx + r * 0.1, cy + r * 0.05);
  g.lineTo(cx + r * 1.0, cy + r * 0.28);
  g.lineTo(cx + r * 0.1, cy + r * 0.45);
  g.closePath();
  g.fill();
  ellipse(g, cx + r * 0.25, cy - r * 0.18, r * 0.12, r * 0.14, navy);
  g.strokeStyle = navy;
  g.lineWidth = r * 0.08;
  g.beginPath();
  g.moveTo(cx - r * 0.42, cy - r * 0.18);
  g.quadraticCurveTo(cx - r * 0.28, cy - r * 0.3, cx - r * 0.14, cy - r * 0.18);
  g.stroke();
  g.fillStyle = teal;
  g.beginPath();
  g.ellipse(cx, cy - r * 0.78, r * 0.75, r * 0.3, 0, Math.PI, 0);
  g.fill();
  g.fillRect(cx - r * 0.75, cy - r * 0.8, r * 1.5, r * 0.16);
  g.fillStyle = '#ffffff';
  g.fillRect(cx - r * 0.78, cy - r * 0.66, r * 1.56, r * 0.1);
}

/** The logo: a cream sign with Gully, the name and the tagline. */
function logo() {
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = cream;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = teal;
  g.fillRect(0, 0, 512, 12);
  g.fillRect(0, 116, 512, 12);
  g.fillStyle = orange;
  g.fillRect(0, 12, 512, 5);
  g.fillRect(0, 111, 512, 5);
  drawFace(g, 70, 66, 40);
  text(g, "GULLY'S", 290, 58, 64, navy, { max: 360 });
  text(g, 'BURGERS · FRIES · SHAKES', 290, 98, 16, orange, { max: 360 });
  return makeTex(c, { repeat: false });
}

// ---------------------------------------------------------------- food icons
const ICONS = {
  burger(g, x, y, s, two = false) {
    ellipse(g, x, y + s * 0.3, s * 0.5, s * 0.14, '#d89a4a');
    g.fillStyle = '#5a3018';
    g.fillRect(x - s * 0.5, y + s * 0.02, s, s * 0.16);
    if (two) {
      g.fillStyle = '#f0c030';
      g.fillRect(x - s * 0.48, y - s * 0.04, s * 0.96, s * 0.06);
      g.fillStyle = '#5a3018';
      g.fillRect(x - s * 0.5, y - s * 0.16, s, s * 0.14);
    }
    g.fillStyle = '#5ab84a';
    g.fillRect(x - s * 0.52, y - s * (two ? 0.22 : 0.06), s * 1.04, s * 0.07);
    g.fillStyle = '#d89a4a';
    g.beginPath();
    g.ellipse(x, y - s * (two ? 0.24 : 0.08), s * 0.5, s * 0.3, 0, Math.PI, 0);
    g.fill();
  },
  burger2(g, x, y, s) {
    ICONS.burger(g, x, y, s, true);
  },
  fish(g, x, y, s) {
    ellipse(g, x, y + s * 0.25, s * 0.5, s * 0.12, '#e8b060');
    g.fillStyle = '#e8a83a';
    g.fillRect(x - s * 0.45, y - s * 0.02, s * 0.9, s * 0.2);
    g.fillStyle = '#f4f0e0';
    g.fillRect(x - s * 0.4, y - s * 0.07, s * 0.8, s * 0.05);
    g.fillStyle = '#e8b060';
    g.beginPath();
    g.ellipse(x, y - s * 0.08, s * 0.5, s * 0.26, 0, Math.PI, 0);
    g.fill();
  },
  dog(g, x, y, s) {
    ellipse(g, x, y + s * 0.1, s * 0.55, s * 0.18, '#e0a050');
    ellipse(g, x, y, s * 0.58, s * 0.09, '#a8442a');
    g.strokeStyle = '#ffd23a';
    g.lineWidth = s * 0.05;
    g.beginPath();
    for (let k = 0; k <= 8; k++) g.lineTo(x - s * 0.45 + k * s * 0.11, y - s * 0.02 + (k % 2 ? -1 : 1) * s * 0.03);
    g.stroke();
  },
  strips(g, x, y, s) {
    g.fillStyle = teal;
    g.fillRect(x - s * 0.35, y, s * 0.7, s * 0.4);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = '#e0a040';
      g.save();
      g.translate(x - s * 0.24 + k * s * 0.16, y - s * 0.1);
      g.rotate((k - 1.5) * 0.15);
      g.fillRect(-s * 0.06, -s * 0.25, s * 0.12, s * 0.45);
      g.restore();
    }
  },
  fries(g, x, y, s) {
    g.fillStyle = '#ffd23a';
    for (let k = 0; k < 7; k++) g.fillRect(x - s * 0.3 + k * s * 0.09, y - s * 0.4 + (k % 3) * s * 0.06, s * 0.06, s * 0.5);
    g.fillStyle = orange;
    g.beginPath();
    g.moveTo(x - s * 0.4, y - s * 0.05);
    g.lineTo(x + s * 0.4, y - s * 0.05);
    g.lineTo(x + s * 0.3, y + s * 0.45);
    g.lineTo(x - s * 0.3, y + s * 0.45);
    g.closePath();
    g.fill();
    ellipse(g, x, y + s * 0.18, s * 0.1, s * 0.1, '#ffffff');
  },
  rings(g, x, y, s) {
    g.strokeStyle = '#e0a040';
    g.lineWidth = s * 0.14;
    for (const [dx, dy] of [
      [-0.15, 0.05],
      [0.18, -0.08],
    ]) {
      g.beginPath();
      g.ellipse(x + dx * s, y + dy * s, s * 0.24, s * 0.2, 0, 0, Math.PI * 2);
      g.stroke();
    }
  },
  shake(g, x, y, s, col = '#7ae8c0') {
    g.fillStyle = '#f4f2ea';
    g.beginPath();
    g.moveTo(x - s * 0.28, y - s * 0.15);
    g.lineTo(x + s * 0.28, y - s * 0.15);
    g.lineTo(x + s * 0.2, y + s * 0.45);
    g.lineTo(x - s * 0.2, y + s * 0.45);
    g.closePath();
    g.fill();
    g.fillStyle = teal;
    g.fillRect(x - s * 0.24, y + s * 0.05, s * 0.48, s * 0.08);
    ellipse(g, x, y - s * 0.18, s * 0.3, s * 0.18, col);
    g.fillStyle = '#e83a5a';
    g.fillRect(x + s * 0.05, y - s * 0.55, s * 0.05, s * 0.4);
  },
  shake2(g, x, y, s) {
    ICONS.shake(g, x, y, s, '#ff9a8a');
  },
  cup(g, x, y, s, col = teal) {
    g.fillStyle = '#f4f2ea';
    g.beginPath();
    g.moveTo(x - s * 0.26, y - s * 0.3);
    g.lineTo(x + s * 0.26, y - s * 0.3);
    g.lineTo(x + s * 0.2, y + s * 0.45);
    g.lineTo(x - s * 0.2, y + s * 0.45);
    g.closePath();
    g.fill();
    g.fillStyle = col;
    g.fillRect(x - s * 0.24, y - s * 0.05, s * 0.48, s * 0.18);
    g.fillStyle = '#d8d8d0';
    g.fillRect(x - s * 0.3, y - s * 0.36, s * 0.6, s * 0.07);
    g.fillStyle = orange;
    g.fillRect(x + s * 0.02, y - s * 0.62, s * 0.05, s * 0.3);
  },
  cup2(g, x, y, s) {
    ICONS.cup(g, x, y, s, orange);
  },
  coffee(g, x, y, s) {
    g.fillStyle = '#f4f2ea';
    g.fillRect(x - s * 0.22, y - s * 0.2, s * 0.44, s * 0.6);
    g.fillStyle = '#6a3a1a';
    g.fillRect(x - s * 0.22, y - s * 0.02, s * 0.44, s * 0.14);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = s * 0.05;
    for (const dx of [-0.08, 0.08]) {
      g.beginPath();
      g.moveTo(x + dx * s, y - s * 0.28);
      g.quadraticCurveTo(x + dx * s + s * 0.08, y - s * 0.4, x + dx * s, y - s * 0.52);
      g.stroke();
    }
  },
  box(g, x, y, s) {
    g.fillStyle = teal;
    g.fillRect(x - s * 0.36, y - s * 0.1, s * 0.72, s * 0.5);
    g.fillStyle = orange;
    g.beginPath();
    g.moveTo(x - s * 0.42, y - s * 0.08);
    g.lineTo(x, y - s * 0.42);
    g.lineTo(x + s * 0.42, y - s * 0.08);
    g.closePath();
    g.fill();
    g.strokeStyle = navy;
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(x, y - s * 0.42, s * 0.12, Math.PI, 0);
    g.stroke();
    drawStar(g, x, y + s * 0.15, s * 0.14, '#ffd23a');
  },
  meal(g, x, y, s) {
    ICONS.fries(g, x + s * 0.32, y + s * 0.05, s * 0.6);
    ICONS.cup(g, x - s * 0.36, y, s * 0.6);
    ICONS.burger(g, x, y + s * 0.2, s * 0.6, true);
  },
  muffin(g, x, y, s) {
    ellipse(g, x, y + s * 0.18, s * 0.42, s * 0.12, '#e8c080');
    ellipse(g, x, y + s * 0.02, s * 0.44, s * 0.07, '#ffd23a');
    ellipse(g, x, y - s * 0.02, s * 0.36, s * 0.05, '#ffffff');
    ellipse(g, x, y - s * 0.12, s * 0.42, s * 0.12, '#e8c080');
  },
  pancakes(g, x, y, s) {
    for (let k = 0; k < 3; k++) ellipse(g, x, y + s * 0.25 - k * s * 0.13, s * 0.45, s * 0.1, '#e0a050');
    ellipse(g, x, y - s * 0.12, s * 0.2, s * 0.06, '#ffe08a');
    g.fillStyle = '#8a4a1a';
    g.fillRect(x - s * 0.3, y - s * 0.06, s * 0.08, s * 0.25);
  },
  raft(g, x, y, s) {
    g.fillStyle = '#e8a83a';
    g.beginPath();
    g.ellipse(x, y, s * 0.42, s * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c8802a';
    g.lineWidth = s * 0.04;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(x + k * s * 0.12 - s * 0.05, y - s * 0.18);
      g.lineTo(x + k * s * 0.12 + s * 0.05, y + s * 0.18);
      g.stroke();
    }
  },
};

function drawStar(g, x, y, r, col) {
  g.fillStyle = col;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** A backlit menu board: 3 columns of items with icons and prices. */
function menuBoard(items, title) {
  const W = 1024;
  const Hh = 168;
  const [c, g] = makeCanvas(W, Hh);
  const bg = g.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, '#24345a');
  bg.addColorStop(1, '#141c34');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, Hh);
  g.fillStyle = teal;
  g.fillRect(0, 0, W, 26);
  g.fillStyle = orange;
  g.fillRect(0, 26, W, 4);
  text(g, title, W / 2, 14, 17, cream);
  drawFace(g, 22, 14, 10);
  drawFace(g, W - 22, 14, 10);
  const cols = 3;
  const rows = Math.ceil(items.length / cols);
  const cw = W / cols;
  const rh = (Hh - 34) / rows;
  items.forEach((it, k) => {
    const cx = (k % cols) * cw;
    const cy = 34 + Math.floor(k / cols) * rh + rh / 2;
    ICONS[it.icon]?.(g, cx + 34, cy + 2, rh * 0.62);
    text(g, it.name.toUpperCase(), cx + 64, cy - 6, 15, cream, { align: 'left', max: cw - 140 });
    text(g, it.desc, cx + 64, cy + 10, 10, '#a8b8d8', { align: 'left', weight: 'normal', font: 'Arial, sans-serif', max: cw - 140 });
    text(g, price(it.price), cx + cw - 14, cy, 19, orange, { align: 'right' });
    g.fillStyle = 'rgba(255,255,255,0.08)';
    if (k % cols) g.fillRect(cx, cy - rh / 2 + 4, 1, rh - 8);
  });
  return makeTex(c, { repeat: false });
}

/** A live NOW SERVING display (redrawn when the numbers change). */
export class ServingBoard {
  constructor() {
    const [c, g] = makeCanvas(256, 64);
    this.c = c;
    this.g = g;
    this.tex = makeTex(c, { repeat: false });
    this.key = null;
    this.draw([]);
  }
  draw(nums) {
    const key = nums.join(',');
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    g.fillStyle = '#0c0c10';
    g.fillRect(0, 0, 256, 64);
    text(g, 'NOW SERVING', 128, 13, 12, '#7ae8c0');
    const shown = nums.slice(-3);
    shown.forEach((n, k) => {
      const x = 128 + (k - (shown.length - 1) / 2) * 76;
      g.shadowColor = '#ff8a2a';
      g.shadowBlur = 8;
      text(g, String(n), x, 42, 30, k === shown.length - 1 ? '#ffb05a' : '#c8702a');
      g.shadowBlur = 0;
    });
    if (!shown.length) text(g, '- - -', 128, 42, 24, '#5a3a2a');
    this.tex.needsUpdate = true;
  }
}

/** The harbour mural on the dining room wall. */
function mural() {
  const rng = new Rng(1987);
  const [c, g] = makeCanvas(512, 192);
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#ffb06a');
  sky.addColorStop(1, '#ffe0a0');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 120);
  ellipse(g, 380, 96, 34, 34, '#fff4c8');
  const sea = g.createLinearGradient(0, 110, 0, 192);
  sea.addColorStop(0, '#2aa6b0');
  sea.addColorStop(1, '#1a5a7a');
  g.fillStyle = sea;
  g.fillRect(0, 110, 512, 82);
  for (let k = 0; k < 40; k++) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(rng.float(0, 512), rng.float(118, 190), rng.float(6, 20), 2);
  }
  // pier with a little GULLY'S shack, lighthouse, boats, gulls
  g.fillStyle = '#6a4a32';
  g.fillRect(20, 112, 200, 8);
  for (let x = 26; x < 220; x += 22) g.fillRect(x, 120, 5, 30);
  g.fillStyle = cream;
  g.fillRect(60, 84, 70, 28);
  g.fillStyle = teal;
  g.beginPath();
  g.moveTo(54, 86);
  g.lineTo(95, 66);
  g.lineTo(136, 86);
  g.closePath();
  g.fill();
  text(g, "GULLY'S", 95, 98, 12, navy);
  text(g, '1987', 95, 108, 7, orange);
  g.fillStyle = '#f4f0e6';
  g.fillRect(450, 50, 16, 64);
  g.fillStyle = '#e83a3a';
  for (let y = 58; y < 112; y += 16) g.fillRect(450, y, 16, 7);
  g.fillStyle = '#2a2a30';
  g.fillRect(446, 42, 24, 9);
  for (const [x, y, s] of [
    [280, 140, 1],
    [330, 160, 0.8],
  ]) {
    g.fillStyle = '#f4f0e6';
    g.beginPath();
    g.moveTo(x - 20 * s, y);
    g.lineTo(x + 20 * s, y);
    g.lineTo(x + 14 * s, y + 8 * s);
    g.lineTo(x - 14 * s, y + 8 * s);
    g.closePath();
    g.fill();
    g.fillStyle = orange;
    g.fillRect(x - 2 * s, y - 22 * s, 3 * s, 22 * s);
    g.beginPath();
    g.moveTo(x + 1 * s, y - 22 * s);
    g.lineTo(x + 16 * s, y - 4 * s);
    g.lineTo(x + 1 * s, y - 4 * s);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = navy;
  g.lineWidth = 2.5;
  for (let k = 0; k < 9; k++) {
    const x = rng.float(150, 440);
    const y = rng.float(14, 70);
    const s = rng.float(5, 10);
    g.beginPath();
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x - s / 2, y - s / 2, x, y);
    g.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y);
    g.stroke();
  }
  text(g, 'SNATCH A BITE!', 256, 22, 20, navy);
  noise(g, 512, 192, rng, 8);
  return makeTex(c, { repeat: false });
}

/** Four posters: the new shake, the toys, breakfast, employee of the month. */
function posters() {
  const [c, g] = makeCanvas(256, 128);
  const card = (k, bg, draw) => {
    g.fillStyle = bg;
    g.fillRect(k * 64 + 2, 2, 60, 124);
    draw(k * 64 + 32);
  };
  card(0, teal, (x) => {
    text(g, 'NEW!', x, 14, 13, '#ffd23a');
    ICONS.shake(g, x, 58, 50);
    text(g, 'SEAFOAM', x, 100, 10, cream);
    text(g, 'SHAKE', x, 113, 10, cream);
  });
  card(1, orange, (x) => {
    text(g, 'COLLECT', x, 14, 10, navy);
    text(g, 'ALL 6!', x, 28, 12, '#ffffff');
    ICONS.box(g, x, 66, 44);
    text(g, 'GULL BOX', x, 104, 10, navy);
    text(g, 'TOYS', x, 116, 9, navy);
  });
  card(2, '#ffe8b0', (x) => {
    text(g, 'SUNRISE', x, 14, 11, orange);
    text(g, 'MENU', x, 27, 11, orange);
    ICONS.pancakes(g, x, 62, 44);
    text(g, '6 - 11 AM', x, 104, 10, navy);
  });
  card(3, '#f4f2ea', (x) => {
    text(g, 'EMPLOYEE', x, 12, 8, navy);
    text(g, 'OF THE MONTH', x, 23, 7, navy);
    g.fillStyle = '#c8b8a0';
    g.fillRect(x - 20, 32, 40, 48);
    ellipse(g, x, 50, 11, 12, '#d39b74');
    g.fillStyle = teal;
    g.fillRect(x - 16, 64, 32, 16);
    text(g, 'DANA K.', x, 96, 10, navy);
    drawStar(g, x, 113, 8, '#ffd23a');
  });
  return makeTex(c, { repeat: false });
}

/** 16 rows of signs, 256x16 each. */
export const GSIGN_ROWS = 16;
function signs() {
  const rows = [
    ['ORDER HERE', teal, '#ffffff'],
    ['PICK UP', orange, '#ffffff'],
    ['RESTROOMS', navy, '#ffffff'],
    ['THANK YOU', teal, '#ffffff'],
    ['EMPLOYEES ONLY', '#b02a2a', '#ffffff'],
    ['OPEN 6AM - 2AM', navy, '#ffd23a'],
    ['DRINKS · REFILLS FREE', teal, '#ffffff'],
    ['PLEASE WAIT FOR YOUR NUMBER', cream, navy],
    ['KIDDIE RIDE · 50¢', '#ffd23a', navy],
    ["GULLY'S · SINCE 1987", navy, cream],
    ['EXIT', '#1a8a3a', '#ffffff'],
    ['CONDIMENTS', orange, '#ffffff'],
    ['WALK-IN · KEEP CLOSED', '#8a9098', '#141418'],
    ['WASH YOUR HANDS', '#ffffff', '#b02a2a'],
    ['SNATCH A BITE!', orange, navy],
    ['CLOSED · BACK AT 6AM', navy, '#ffffff'],
  ];
  const [c, g] = makeCanvas(256, 256);
  rows.forEach(([t, bg, fg], k) => {
    g.fillStyle = bg;
    g.fillRect(0, k * 16, 256, 16);
    text(g, t, 128, k * 16 + 8.5, 11, fg, { max: 248 });
  });
  return makeTex(c, { repeat: false });
}
export const gsignUV = (k) => [0, 1 - (k + 1) / GSIGN_ROWS + 0.002, 1, 1 - k / GSIGN_ROWS - 0.002];

/** Order tickets glowing on the kitchen screens. */
function kitchenScreen() {
  const rng = new Rng(47);
  const [c, g] = makeCanvas(128, 64);
  g.fillStyle = '#0a1420';
  g.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 4; k++) {
    const x = 3 + k * 31;
    g.fillStyle = k === 0 ? '#ff8a2a' : '#2a6a8a';
    g.fillRect(x, 3, 28, 8);
    g.fillStyle = '#e8f0f8';
    for (let l = 0; l < rng.int(3, 6); l++) g.fillRect(x + 2, 15 + l * 7, rng.int(10, 24), 3);
  }
  return makeTex(c, { repeat: false });
}

export function createGullysTextures() {
  return {
    logo: logo(),
    lunch: menuBoard(LUNCH, "GULLY'S MENU · SNATCH A BITE!"),
    breakfast: menuBoard(BREAKFAST, 'SUNRISE MENU · 6 - 11 AM'),
    mural: mural(),
    kitchen: kitchenScreen(),
    kit: {
      gSigns: { map: signs(), scale: 1 },
      gPosters: { map: posters(), scale: 1 },
    },
  };
}

