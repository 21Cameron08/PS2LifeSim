import { Rng } from '../core/rng.js';
import { makeCanvas, makeTex } from './textures.js';
import { sgMark, vvMark } from './fashionTextures.js';

// Procedural textures for the Halcyon Galleria: shop signs, the mall directory,
// ads and posters, ROOMSET's fascia. All brands are made up.

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Arial Black", Impact, sans-serif';
const HAND = '"Comic Sans MS", "Marker Felt", cursive';

function t(g, s, x, y, size, col, { align = 'center', font = SANS, weight = 'bold', max, spacing = 0 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(s, x, y, max);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// sign atlas slots: [x, y, w, h] in a 1024 x 1024 canvas
export const MSIGN = {
  galleria: [0, 0, 1024, 128],
  rack: [0, 128, 512, 96],
  split: [512, 128, 512, 96],
  vellard: [0, 224, 512, 96],
  bright: [512, 224, 512, 96],
  roomset: [0, 320, 512, 192],
  pretzel: [512, 320, 512, 96],
  wc: [512, 416, 256, 64],
  hours: [768, 416, 256, 64],
  drop: [512, 480, 512, 96],
  returns: [0, 512, 512, 64],
  directory: [0, 576, 512, 384],
  chalk: [512, 576, 256, 192],
  refit: [768, 576, 256, 192],
  exit: [512, 768, 256, 64],
  staff: [768, 768, 256, 64],
  fitting: [512, 832, 256, 64],
  till: [768, 832, 256, 64],
  wish: [512, 896, 512, 64],
};
/** UVs of a sign slot, for kit panels and quads. */
export const msignUV = (k) => {
  const [x, y, w, h] = MSIGN[k];
  return [(x + 2) / 1024, 1 - (y + h - 2) / 1024, (x + w - 2) / 1024, 1 - (y + 2) / 1024];
};

function signs() {
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#101014';
  g.fillRect(0, 0, 1024, 1024);
  const slot = (k, fn) => {
    const [x, y, w, h] = MSIGN[k];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    fn(g, w, h);
    g.restore();
  };
  // the big one over the entrance: white letters on deep blue with a gold rule
  slot('galleria', (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16224a');
    bg.addColorStop(1, '#0a1230');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8b46a';
    g.fillRect(40, h - 22, w - 80, 4);
    t(g, 'HALCYON GALLERIA', w / 2, 56, 70, '#f6f2ea', { font: SERIF, spacing: 10, max: w - 80 });
  });
  slot('rack', (g, w, h) => {
    g.fillStyle = '#2a1e16';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0a53a';
    g.lineWidth = 4;
    g.strokeRect(8, 8, w - 16, h - 16);
    t(g, 'RACK & RUIN', w / 2, 42, 50, '#e0a53a', { spacing: 4 });
    t(g, 'thrift · vintage · treasure', w / 2, 76, 18, '#f4e8d0', { font: HAND, weight: 'normal' });
  });
  slot('split', (g, w, h) => {
    g.fillStyle = '#ece8df';
    g.fillRect(0, 0, w, h);
    sgMark(g, 30, 26, 70, '#ff5a3a', '#ece8df');
    t(g, 'SPLITGRAIN', 300, 50, 56, '#1c1c20', { max: 370 });
  });
  slot('vellard', (g, w, h) => {
    g.fillStyle = '#0c0c0e';
    g.fillRect(0, 0, w, h);
    vvMark(g, 52, 48, 30, '#d8b46a');
    t(g, 'MAISON VELLARD', 290, 50, 40, '#e8cc88', { font: SERIF, weight: 'normal', spacing: 6, max: 400 });
  });
  slot('bright', (g, w, h) => {
    g.fillStyle = '#0a1a2a';
    g.fillRect(0, 0, w, h);
    t(g, 'BRIGHTWIRE', w / 2, 46, 56, '#5ae8ff', { spacing: 3 });
    g.fillStyle = '#5ae8ff';
    g.fillRect(70, 78, w - 140, 3);
  });
  // ROOMSET: the fascia (top half) and the delivery sign (bottom half)
  slot('roomset', (g, w, h) => {
    const rng = new Rng(1203);
    g.fillStyle = '#ece4d4';
    g.fillRect(0, 0, w, 96);
    for (let k = 0; k < 120; k++) {
      g.fillStyle = `rgba(120,100,70,${rng.float(0.02, 0.05)})`;
      g.fillRect(rng.float(0, w), rng.float(0, 96), rng.float(10, 60), rng.float(1, 2));
    }
    t(g, 'ROOMSET', w / 2, 40, 50, '#2a3a4a', { font: SERIF, spacing: 12 });
    t(g, 'furniture for the life you want', w / 2, 76, 17, '#5a6a7a', { font: SERIF, weight: 'normal', spacing: 1 });
    g.fillStyle = '#2a3a4a';
    g.fillRect(0, 96, w, 96);
    g.fillStyle = '#d8b46a';
    g.fillRect(30, 102, w - 60, 2);
    g.fillRect(30, 184, w - 60, 2);
    t(g, 'SAME-DAY DELIVERY', w / 2, 132, 30, '#f4efe6', { spacing: 4 });
    t(g, 'to your door, unpacked, ready to place', w / 2, 164, 17, '#c8d0d8', { font: SERIF, weight: 'normal' });
  });
  slot('pretzel', (g, w, h) => {
    g.fillStyle = '#7a3a1a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd36a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(56, 50, 22, Math.PI * 0.2, Math.PI * 1.8);
    g.stroke();
    g.beginPath();
    g.moveTo(40, 66);
    g.lineTo(72, 32);
    g.moveTo(72, 66);
    g.lineTo(40, 32);
    g.stroke();
    t(g, 'PRETZEL PILOT', 300, 50, 46, '#ffd36a', { max: 400 });
  });
  slot('wc', (g, w, h) => {
    g.fillStyle = '#e8e4dc';
    g.fillRect(0, 0, w, h);
    t(g, 'RESTROOMS  ›', w / 2, h / 2, 28, '#2a3a5a');
  });
  slot('hours', (g, w, h) => {
    g.fillStyle = '#0a1230';
    g.fillRect(0, 0, w, h);
    t(g, 'OPEN 10 AM – 10 PM', w / 2, h / 2, 22, '#f6f2ea', { max: w - 16 });
  });
  slot('drop', (g, w, h) => {
    g.fillStyle = '#ff6a2a';
    g.fillRect(0, 0, w, h);
    t(g, 'GRAIN RUNNER 9 · NEW COLOURWAY', w / 2, 32, 30, '#1c1c20', { max: w - 20 });
    t(g, 'DROP · SATURDAY 10 AM · LIMIT ONE', w / 2, 70, 22, '#1c1c20', { max: w - 20 });
  });
  slot('returns', (g, w, h) => {
    g.fillStyle = '#f4f0e6';
    g.fillRect(0, 0, w, h);
    t(g, 'ALL SALES FINAL · CASH OR CARD', w / 2, h / 2, 26, '#3a2a20', { max: w - 20 });
  });
  slot('directory', (g, w, h) => {
    g.fillStyle = '#0a1230';
    g.fillRect(0, 0, w, h);
    t(g, 'HALCYON GALLERIA · DIRECTORY', w / 2, 26, 22, '#d8b46a', { font: SERIF, max: w - 20 });
    const floor = (y0, label, cells) => {
      t(g, label, 16, y0 + 12, 16, '#9fb0d0', { align: 'left', font: SANS });
      cells.forEach(([x, w2, name, col]) => {
        g.fillStyle = col;
        g.fillRect(x, y0 + 26, w2, 110);
        t(g, name, x + w2 / 2, y0 + 81, 15, '#0a0a0a', { max: w2 - 6 });
      });
    };
    floor(48, 'UPPER LEVEL', [
      [16, 140, 'MAISON VELLARD', '#d8b46a'],
      [160, 190, 'balcony · escalators', '#5a6a8a'],
      [354, 140, 'ROOMSET · BRIGHTWIRE', '#7a8a9a'],
    ]);
    floor(206, 'STREET LEVEL', [
      [16, 140, 'RACK & RUIN', '#e0a53a'],
      [160, 190, 'atrium · fountain · pretzels', '#8ab8d8'],
      [354, 140, 'SPLITGRAIN', '#ff6a4a'],
    ]);
    g.fillStyle = '#ff4a4a';
    g.beginPath();
    g.arc(256, 352, 8, 0, Math.PI * 2);
    g.fill();
    t(g, 'YOU ARE HERE', 256, 372, 13, '#f6f2ea');
  });
  slot('chalk', (g, w, h) => {
    g.fillStyle = '#1e2a22';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a4a';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    t(g, 'NEW IN', w / 2, 40, 28, '#f4f2ec', { font: HAND });
    t(g, 'every', w / 2, 82, 22, '#f4e8a0', { font: HAND, weight: 'normal' });
    t(g, 'MORNING', w / 2, 116, 28, '#f4f2ec', { font: HAND });
    t(g, 'treasure ≠ trash', w / 2, 158, 18, '#a8d8b0', { font: HAND, weight: 'normal' });
  });
  slot('refit', (g, w, h) => {
    g.fillStyle = '#2a2e34';
    g.fillRect(0, 0, w, h);
    t(g, 'CLOSED', w / 2, 60, 40, '#5ae8ff');
    t(g, 'for refit', w / 2, 100, 24, '#c8d8e8', { weight: 'normal', font: SERIF });
    t(g, 'back soon!', w / 2, 140, 24, '#c8d8e8', { weight: 'normal', font: SERIF });
  });
  slot('exit', (g, w, h) => {
    g.fillStyle = '#1a8a3a';
    g.fillRect(0, 0, w, h);
    t(g, 'EXIT', w / 2, h / 2, 34, '#ffffff');
  });
  slot('staff', (g, w, h) => {
    g.fillStyle = '#5a5a60';
    g.fillRect(0, 0, w, h);
    t(g, 'STAFF ONLY', w / 2, h / 2, 26, '#f4f2ec');
  });
  slot('fitting', (g, w, h) => {
    g.fillStyle = '#2a1e16';
    g.fillRect(0, 0, w, h);
    t(g, 'FITTING ROOM', w / 2, h / 2, 26, '#e0a53a');
  });
  slot('till', (g, w, h) => {
    g.fillStyle = '#1c1c20';
    g.fillRect(0, 0, w, h);
    t(g, 'PAY HERE', w / 2, h / 2, 28, '#ff6a2a');
  });
  slot('wish', (g, w, h) => {
    g.fillStyle = '#0c0c0e';
    g.fillRect(0, 0, w, h);
    t(g, 'BY APPOINTMENT · OR NOT AT ALL', w / 2, h / 2, 22, '#d8b46a', { font: SERIF, weight: 'normal', spacing: 3, max: w - 20 });
  });
  return makeTex(c, { repeat: false });
}

function posters() {
  const [c, g] = makeCanvas(1024, 512);
  const P = (k, fn) => {
    g.save();
    g.translate(k * 256, 0);
    g.beginPath();
    g.rect(0, 0, 256, 512);
    g.clip();
    fn(g);
    g.restore();
  };
  // 0: the Meridian ad
  P(0, (g) => {
    g.fillStyle = '#0c0c0e';
    g.fillRect(0, 0, 256, 512);
    const glow = g.createRadialGradient(128, 220, 10, 128, 220, 150);
    glow.addColorStop(0, 'rgba(216,180,106,0.35)');
    glow.addColorStop(1, 'rgba(216,180,106,0)');
    g.fillStyle = glow;
    g.fillRect(0, 60, 256, 320);
    g.fillStyle = '#3a2a1a';
    g.fillRect(108, 90, 40, 260);
    g.fillStyle = '#d8b46a';
    g.beginPath();
    g.arc(128, 220, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141418';
    g.beginPath();
    g.arc(128, 220, 52, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [
      [108, 205],
      [148, 205],
      [128, 245],
    ]) {
      g.strokeStyle = '#d8b46a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 12, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = '#f4e8c8';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(128, 220);
    g.lineTo(128, 180);
    g.moveTo(128, 220);
    g.lineTo(156, 232);
    g.stroke();
    t(g, 'MERIDIAN', 128, 400, 34, '#e8cc88', { font: SERIF, weight: 'normal', spacing: 5 });
    t(g, 'Time, kept.', 128, 436, 18, '#c8b490', { font: SERIF, weight: 'normal' });
    t(g, 'MAISON VELLARD', 128, 486, 13, '#8a7a5a', { font: SERIF, weight: 'normal', spacing: 3 });
  });
  // 1: the drop
  P(1, (g) => {
    g.fillStyle = '#ff6a2a';
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#1c1c20';
    g.fillRect(0, 300, 256, 212);
    // a sneaker, side on
    g.fillStyle = '#17a2a8';
    g.beginPath();
    g.moveTo(30, 250);
    g.lineTo(60, 170);
    g.lineTo(130, 160);
    g.lineTo(180, 200);
    g.lineTo(230, 215);
    g.lineTo(232, 250);
    g.closePath();
    g.fill();
    g.fillStyle = '#ff8a2a';
    g.fillRect(26, 250, 210, 22);
    g.fillStyle = '#f4f2ec';
    g.fillRect(70, 200, 90, 8);
    sgMark(g, 150, 220, 30, '#f4f2ec', '#17a2a8');
    t(g, 'GRAIN', 128, 60, 52, '#1c1c20');
    t(g, 'RUNNER 9', 128, 110, 40, '#1c1c20');
    t(g, 'NEW EVERY WEEK', 128, 350, 24, '#ff8a2a');
    t(g, 'SAT 10 AM', 128, 400, 38, '#f4f2ec');
    t(g, '12 PAIRS. NO RESTOCK.', 128, 452, 16, '#f4f2ec');
  });
  // 2: the mall's own ad
  P(2, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#16224a');
    bg.addColorStop(1, '#3a2a5a');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 512);
    for (const [y, s] of [
      [150, 'SHOP.'],
      [230, 'DREAM.'],
      [310, 'REPEAT.'],
    ])
      t(g, s, 128, y, 48, '#f6f2ea', { font: SERIF });
    g.fillStyle = '#d8b46a';
    g.fillRect(48, 360, 160, 3);
    t(g, 'HALCYON GALLERIA', 128, 400, 18, '#d8b46a', { font: SERIF, spacing: 2 });
    t(g, 'late nights fridays', 128, 432, 14, '#c8c0d8', { font: SERIF, weight: 'normal' });
  });
  // 3: the thrift shop, hand-made
  P(3, (g) => {
    g.fillStyle = '#f2e8d0';
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#e0a53a';
    g.fillRect(0, 0, 256, 18);
    t(g, 'ONE', 128, 100, 44, '#3a2a20', { font: HAND });
    t(g, "PERSON'S", 128, 150, 36, '#3a2a20', { font: HAND });
    t(g, 'JUNK', 128, 210, 56, '#c4483a', { font: HAND });
    t(g, 'is your', 128, 270, 28, '#3a2a20', { font: HAND, weight: 'normal' });
    t(g, 'NEW FIT', 128, 330, 48, '#2f5d8a', { font: HAND });
    t(g, 'RACK & RUIN', 128, 450, 22, '#e0a53a');
  });
  return makeTex(c, { repeat: false });
}

export function createGalleriaTextures() {
  const msigns = signs();
  const mposters = posters();
  return {
    msigns,
    mposters,
    kit: {
      mSigns: { map: msigns, scale: 1 },
      mPosters: { map: mposters, scale: 1 },
    },
  };
}
