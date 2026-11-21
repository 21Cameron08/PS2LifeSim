import { makeCanvas, makeTex } from './textures.js';
import { CARS } from '../game/cars.js';

// Signs for CORSO MOTORS (Kiln Heights): the fascia, the lit logo wall, the pylon,
// a price placard for every car, the espresso bar's card. All names made up.

const SANS = '"Arial Black", Impact, sans-serif';
const BODY = 'Arial, Helvetica, sans-serif';
const RED = '#d8241c';

function t(g, s, x, y, size, col, { align = 'center', font = SANS, weight = 'bold', max, spacing = 0, italic = false } = {}) {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(s, x, y, max);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// atlas slots: [x, y, w, h] in a 1024 x 1024 canvas
export const MSIGN = {
  fascia: [0, 0, 1024, 128], // over the glass, outside
  logo: [0, 128, 1024, 192], // the lit wall behind the turntable
  pylon: [0, 320, 128, 512], // the totem on the forecourt (portrait)
  hours: [128, 320, 384, 64],
  used: [128, 384, 384, 128], // approved used, on a windscreen
  delivery: [128, 512, 384, 96], // painted in the delivery bay
  coffee: [128, 608, 192, 224], // the espresso bar's card
  test: [320, 608, 192, 96], // TEST DRIVES · ask Vic
  welcome: [320, 704, 192, 128], // the desk front
  // one placard per car (in CARS order), 256 x 128 each, from (512, 320)
  ...Object.fromEntries(CARS.map((c, k) => [`card:${c.id}`, [512 + (k % 2) * 256, 320 + Math.floor(k / 2) * 128, 256, 128]])),
  rift: [0, 832, 512, 192], // the hero car's banner: NEW · VANTOR RIFT
  stripe: [512, 704, 512, 64], // red racing stripe for walls
  floor: [512, 768, 512, 256], // the turntable's top (a disc)
};
export const msignUV = (k) => {
  const [x, y, w, h] = MSIGN[k];
  return [(x + 2) / 1024, 1 - (y + h - 2) / 1024, (x + w - 2) / 1024, 1 - (y + 2) / 1024];
};

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The C-and-swoosh badge. */
function badge(g, cx, cy, r, col = RED) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = col;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, r * 0.72, Math.PI * 0.25, Math.PI * 1.75);
  g.arc(0, 0, r * 0.42, Math.PI * 1.75, Math.PI * 0.25, true);
  g.closePath();
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-r * 0.15, r * 0.05);
  g.lineTo(r * 0.85, -r * 0.18);
  g.lineTo(r * 0.85, r * 0.06);
  g.closePath();
  g.fill();
  g.restore();
}

function signs() {
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#121214';
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
  slot('fascia', (g, w, h) => {
    g.fillStyle = '#16161a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = RED;
    g.fillRect(0, h - 14, w, 6);
    badge(g, 90, h / 2 - 4, 40);
    t(g, 'CORSO', 290, h / 2 - 4, 76, '#ffffff', { italic: true, spacing: 6 });
    t(g, 'MOTORS', 590, h / 2 - 4, 76, RED, { italic: true, spacing: 6 });
    t(g, 'KILN HEIGHTS · SINCE 1951', 880, h / 2 - 4, 22, '#c8c8cc', { font: BODY, spacing: 3 });
  });
  slot('logo', (g, w, h) => {
    g.fillStyle = '#0e0e10';
    g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(216,36,28,0.35)');
    gr.addColorStop(1, 'rgba(216,36,28,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    badge(g, 150, h / 2, 70);
    t(g, 'CORSO MOTORS', 600, h / 2 - 16, 96, '#ffffff', { italic: true, spacing: 8, max: 760 });
    t(g, 'DRIVEN BY PORT HALCYON', 600, h / 2 + 56, 26, '#e86a5a', { font: BODY, spacing: 10 });
  });
  slot('pylon', (g, w, h) => {
    g.fillStyle = '#16161a';
    g.fillRect(0, 0, w, h);
    badge(g, w / 2, 70, 46);
    g.save();
    g.translate(w / 2, 300);
    g.rotate(-Math.PI / 2);
    t(g, 'CORSO MOTORS', 0, 0, 52, '#ffffff', { italic: true, spacing: 4 });
    g.restore();
    g.fillStyle = RED;
    g.fillRect(0, h - 40, w, 40);
    t(g, 'NEW & USED', w / 2, h - 20, 15, '#ffffff', { font: BODY });
  });
  slot('hours', (g, w, h) => {
    g.fillStyle = '#e8e8e6';
    g.fillRect(0, 0, w, h);
    t(g, 'SHOWROOM 9 AM - 8 PM', w / 2, h / 2, 28, '#1a1a1e', { font: BODY, spacing: 2 });
  });
  slot('used', (g, w, h) => {
    g.fillStyle = '#ffe23a';
    g.fillRect(0, 0, w, h);
    t(g, 'APPROVED USED', w / 2, 30, 30, '#1a1a1e', { spacing: 2 });
    t(g, '$8,900', w / 2, 82, 54, RED);
  });
  slot('delivery', (g, w, h) => {
    g.fillStyle = '#3a3a3e';
    g.fillRect(0, 0, w, h);
    t(g, 'DELIVERY BAY', w / 2, h / 2, 50, '#f2f0e8', { spacing: 8 });
  });
  slot('coffee', (g, w, h) => {
    g.fillStyle = '#f2efe8';
    g.fillRect(0, 0, w, h);
    badge(g, w / 2, 40, 22);
    t(g, 'ESPRESSO BAR', w / 2, 84, 20, '#1a1a1e', { spacing: 2 });
    t(g, 'help yourself', w / 2, 112, 16, '#5a5a60', { font: BODY, weight: 'normal', italic: true });
    ['espresso', 'ristretto', 'macchiato', 'cortado'].forEach((s, k) => t(g, s, w / 2, 146 + k * 20, 16, '#3a3a40', { font: BODY, weight: 'normal' }));
  });
  slot('test', (g, w, h) => {
    g.fillStyle = RED;
    g.fillRect(0, 0, w, h);
    t(g, 'TEST DRIVES', w / 2, 36, 24, '#ffffff');
    t(g, 'ask Vic at the desk', w / 2, 68, 16, '#ffe0d8', { font: BODY, weight: 'normal' });
  });
  slot('welcome', (g, w, h) => {
    g.fillStyle = '#1a1a1e';
    g.fillRect(0, 0, w, h);
    badge(g, w / 2, 46, 30);
    t(g, 'SALES', w / 2, 100, 24, '#ffffff', { spacing: 6 });
  });
  for (const car of CARS)
    slot(`card:${car.id}`, (g, w, h) => {
      g.fillStyle = '#f6f6f4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = RED;
      g.fillRect(0, 0, 10, h);
      t(g, car.make, 24, 22, 18, '#8a8a90', { align: 'left', font: BODY, spacing: 3 });
      t(g, car.name.toUpperCase(), 24, 52, 30, '#1a1a1e', { align: 'left', max: w - 34 });
      t(g, money(car.price), 24, 92, 34, RED, { align: 'left' });
      t(g, `0-100 in ${(27.8 / car.accel).toFixed(1)}s`, w - 12, 116, 13, '#5a5a60', { align: 'right', font: BODY, weight: 'normal' });
    });
  slot('rift', (g, w, h) => {
    g.fillStyle = '#0e0e10';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b818';
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, h - 8, w, 8);
    t(g, 'NEW', w / 2, 44, 30, '#e8b818', { spacing: 12 });
    t(g, 'VANTOR RIFT', w / 2, 104, 64, '#ffffff', { italic: true, spacing: 4 });
    t(g, 'V12 · 0-100 in 2.9s · ask about delivery', w / 2, 156, 20, '#c8c8cc', { font: BODY, weight: 'normal' });
  });
  slot('stripe', (g, w, h) => {
    g.fillStyle = RED;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, h * 0.42, w, h * 0.16);
  });
  slot('floor', (g, w, h) => {
    g.fillStyle = '#121214';
    g.fillRect(0, 0, w, h);
    // a dark disc with a ring of lights and the badge (drawn squashed: it's a 2:1 slot)
    g.save();
    g.scale(2, 1);
    g.fillStyle = '#2a2a2e';
    g.beginPath();
    g.arc(w / 4, h / 2, h / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8d8dc';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w / 4, h / 2, h / 2 - 16, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  });
  return makeTex(c, { repeat: false });
}

export function createMotorsTextures() {
  const msigns = signs();
  return { msigns, kit: { mSigns: { map: msigns, scale: 1 } } };
}
