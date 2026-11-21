import * as THREE from 'three';
import { makeCanvas, makeTex } from './textures.js';

// Textures for the HALCYON EXCHANGE: carved and painted signs, the listings wall,
// and the live ones: the big board of prices, the LED ticker crawl and the clocks.
// All names made up.

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Arial Black", Impact, sans-serif';
const MONO = '"Courier New", Courier, monospace';

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
export const XSIGN = {
  pediment: [0, 0, 1024, 128],
  est: [0, 128, 512, 64],
  bar: [512, 128, 512, 128],
  property: [0, 192, 512, 96],
  hours: [0, 288, 256, 64],
  gull: [256, 288, 256, 64],
  listings: [512, 256, 512, 384],
  menu: [0, 352, 256, 384],
  forsale: [256, 352, 256, 192],
  sold: [256, 544, 256, 192],
  terminal: [0, 736, 256, 128],
  floor: [256, 736, 256, 64],
  welcome: [512, 640, 512, 96],
};
/** UVs of a sign slot, for kit panels and quads. */
export const xsignUV = (k) => {
  const [x, y, w, h] = XSIGN[k];
  return [(x + 2) / 1024, 1 - (y + h - 2) / 1024, (x + w - 2) / 1024, 1 - (y + 2) / 1024];
};

function signs() {
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#101014';
  g.fillRect(0, 0, 1024, 1024);
  const slot = (k, fn) => {
    const [x, y, w, h] = XSIGN[k];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    fn(g, w, h);
    g.restore();
  };
  const stone = (g, w, h, base = '#d8ccb0') => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 200; k++) {
      g.fillStyle = `rgba(90,70,40,${0.02 + ((k * 37) % 10) / 300})`;
      g.fillRect((k * 97) % w, (k * 53) % h, 12 + (k % 20), 2);
    }
  };
  // carved into the frieze over the columns
  slot('pediment', (g, w, h) => {
    stone(g, w, h);
    t(g, 'HALCYON  EXCHANGE', w / 2 + 2, h / 2 + 2, 74, 'rgba(255,255,255,0.35)', { font: SERIF, spacing: 14, max: w - 60 });
    t(g, 'HALCYON  EXCHANGE', w / 2, h / 2, 74, '#5a4a30', { font: SERIF, spacing: 14, max: w - 60 });
  });
  slot('est', (g, w, h) => {
    stone(g, w, h);
    t(g, 'EST. 1921 · PORT HALCYON', w / 2, h / 2, 30, '#6a5a3a', { font: SERIF, spacing: 6 });
  });
  // the bar's sign: brass letters on walnut
  slot('bar', (g, w, h) => {
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8a050';
    g.lineWidth = 4;
    g.strokeRect(10, 10, w - 20, h - 20);
    t(g, 'THE TICKER BAR', w / 2, 56, 50, '#f0c860', { font: SERIF, spacing: 4 });
    t(g, 'coffee by day · cocktails after the bell', w / 2, 98, 20, '#d8b878', { font: SERIF, weight: 'normal' });
  });
  slot('property', (g, w, h) => {
    g.fillStyle = '#1a2a3a';
    g.fillRect(0, 0, w, h);
    t(g, 'PROPERTY', w / 2, 38, 44, '#e8dcc0', { font: SERIF, spacing: 10 });
    t(g, 'sales · lettings · advice', w / 2, 74, 20, '#a8b8c8', { font: SERIF, weight: 'normal' });
  });
  slot('hours', (g, w, h) => {
    g.fillStyle = '#c8a050';
    g.fillRect(0, 0, w, h);
    t(g, 'OPEN 8 AM - MIDNIGHT', w / 2, h / 2, 22, '#2a1a10', { font: SERIF });
  });
  slot('gull', (g, w, h) => {
    g.fillStyle = '#6a5030';
    g.fillRect(0, 0, w, h);
    t(g, 'THE HARBOUR GULL', w / 2, h / 2, 26, '#f0d8a0', { font: SERIF, spacing: 2 });
  });
  // the listings wall: cards for buildings with little sketches
  slot('listings', (g, w, h) => {
    g.fillStyle = '#e8e0cc';
    g.fillRect(0, 0, w, h);
    const r = (s) => ((s * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 6; k++) {
      const x = 16 + (k % 3) * 166;
      const y = 16 + Math.floor(k / 3) * 184;
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 150, 168);
      g.fillStyle = ['#a8c0d8', '#d8c0a0', '#b8d0b0'][k % 3];
      g.fillRect(x + 8, y + 8, 134, 80);
      // a little building
      const bw = 40 + r(k + 1) * 50;
      const bh = 30 + r(k + 7) * 46;
      g.fillStyle = ['#8a7a6a', '#6a7a8a', '#a86a4a'][k % 3];
      g.fillRect(x + 75 - bw / 2, y + 88 - bh, bw, bh);
      g.fillStyle = '#ffe8a0';
      for (let wy = y + 92 - bh; wy < y + 84; wy += 10) for (let wx = x + 80 - bw / 2; wx < x + 70 + bw / 2; wx += 10) g.fillRect(wx, wy, 4, 5);
      g.fillStyle = '#c43a2a';
      g.fillRect(x + 8, y + 96, 70, 18);
      t(g, 'FOR SALE', x + 43, y + 105, 13, '#ffffff');
      g.fillStyle = '#5a5a60';
      for (let l = 0; l < 4; l++) g.fillRect(x + 10, y + 124 + l * 10, 60 + r(k * 3 + l) * 70, 4);
    }
  });
  // the bar's chalkboard menu
  slot('menu', (g, w, h) => {
    g.fillStyle = '#1c2420';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a40';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    const HAND = '"Comic Sans MS", "Marker Felt", cursive';
    t(g, 'THE TICKER BAR', w / 2, 36, 22, '#f2efe6', { font: HAND });
    const rows = [
      ['Espresso', '$3'],
      ['Flat white', '$4'],
      ['Bull run', '$14'],
      ['Dead cat bounce', '$12'],
      ['Closing bell', '$16'],
      ['Margin call', '$18'],
      ['Club soda', '$2'],
    ];
    rows.forEach(([a, b], k) => {
      t(g, a, 24, 84 + k * 38, 19, '#f2efe6', { font: HAND, weight: 'normal', align: 'left' });
      t(g, b, w - 22, 84 + k * 38, 19, '#f2d080', { font: HAND, align: 'right' });
    });
    t(g, 'happy hour 4 - 6', w / 2, h - 30, 18, '#a8e0b0', { font: HAND });
  });
  // what goes up on a building for sale, and after
  slot('forsale', (g, w, h) => {
    g.fillStyle = '#f4f0e6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c43a2a';
    g.fillRect(0, 0, w, 74);
    t(g, 'FOR SALE', w / 2, 40, 44, '#ffffff');
    t(g, 'HALCYON EXCHANGE', w / 2, 104, 22, '#2a2a30', { font: SERIF });
    t(g, 'PROPERTY DESK', w / 2, 134, 20, '#2a2a30', { font: SERIF });
    t(g, 'enquire within, Downtown', w / 2, 166, 16, '#6a6a70', { font: SERIF, weight: 'normal' });
  });
  slot('sold', (g, w, h) => {
    g.fillStyle = '#2a3a2a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b46a';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    t(g, 'PRIVATE', w / 2, 62, 40, '#f0d890', { font: SERIF, spacing: 4 });
    t(g, 'PROPERTY', w / 2, 108, 40, '#f0d890', { font: SERIF, spacing: 4 });
    t(g, 'managed by the owner', w / 2, 150, 17, '#c8d0b8', { font: SERIF, weight: 'normal' });
  });
  slot('terminal', (g, w, h) => {
    g.fillStyle = '#04100a';
    g.fillRect(0, 0, w, h);
    g.font = `bold 15px ${MONO}`;
    g.textAlign = 'left';
    const rows = ['GULL  24.61 +0.4', 'SPLT  36.12 -1.2', 'VLRD 411.20 +0.1', 'BRWR   9.88 +3.1', 'HFRY  56.40 -0.3', 'KILN  31.05 +0.6'];
    rows.forEach((s, k) => {
      g.fillStyle = s.includes('-') ? '#ff6a5a' : '#5aff8a';
      g.fillText(s, 12, 18 + k * 19);
    });
  });
  slot('floor', (g, w, h) => {
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, w, h);
    t(g, 'MEMBERS · TRADING FLOOR', w / 2, h / 2, 20, '#d8b878', { font: SERIF });
  });
  slot('welcome', (g, w, h) => {
    g.fillStyle = '#16202c';
    g.fillRect(0, 0, w, h);
    t(g, 'ANYONE MAY TRADE · $5 A TRADE · TERMINALS ON THE FLOOR', w / 2, h / 2, 24, '#e8dcc0', { font: SERIF, max: w - 30 });
  });
  return makeTex(c, { repeat: false });
}

/** The big board on the back wall: every stock, its price and the day's move. */
export class BigBoard {
  constructor() {
    const [c, g] = makeCanvas(1024, 320);
    this.c = c;
    this.g = g;
    this.tex = makeTex(c, { repeat: false });
  }
  draw(market, stocks, clockText) {
    const g = this.g;
    const W = 1024;
    const H = 320;
    g.fillStyle = '#05080a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#0e1a14';
    g.fillRect(0, 0, W, 40);
    g.font = `bold 24px ${MONO}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#f0c860';
    g.fillText('HALCYON EXCHANGE', 16, 21);
    g.textAlign = 'right';
    g.fillStyle = market.isOpen() ? '#5aff8a' : '#ff8a6a';
    g.fillText(`${market.isOpen() ? 'OPEN' : 'CLOSED'} · ${clockText}`, W - 16, 21);
    stocks.forEach((s, k) => {
      const col = k % 2;
      const row = Math.floor(k / 2);
      const x = 16 + col * 504;
      const y = 72 + row * 66;
      const p = market.price(s.sym);
      const prev = market.prevClose(s.sym);
      const ch = ((p - prev) / prev) * 100;
      const up = ch >= 0;
      g.textAlign = 'left';
      g.font = `bold 34px ${MONO}`;
      g.fillStyle = '#ffe8a0';
      g.fillText(s.sym, x, y);
      g.textAlign = 'right';
      g.fillStyle = '#e8f0e8';
      g.fillText(p.toFixed(2), x + 300, y);
      g.fillStyle = up ? '#5aff8a' : '#ff5a4a';
      g.font = `bold 28px ${MONO}`;
      g.fillText(`${up ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%`, x + 470, y);
    });
  }
}

/** The LED crawl under the board: prices and headlines scroll past forever. */
export class TickerTape {
  constructor() {
    const [c, g] = makeCanvas(2048, 64);
    this.c = c;
    this.g = g;
    this.tex = makeTex(c, { repeat: true });
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  draw(items) {
    const g = this.g;
    g.fillStyle = '#080402';
    g.fillRect(0, 0, 2048, 64);
    g.font = `bold 38px ${MONO}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    let x = 10;
    for (const it of items) {
      g.fillStyle = it.col;
      g.fillText(it.text, x, 34);
      x += g.measureText(it.text).width + 40;
      if (x > 2040) break;
    }
    // LED dots
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 2048, 1);
    for (let xx = 0; xx < 2048; xx += 4) g.fillRect(xx, 0, 1, 64);
    this.tex.needsUpdate = true;
  }
}

/** Three clocks over the board: Port Halcyon and two made-up cities. */
export class ClockFaces {
  constructor() {
    const [c, g] = makeCanvas(384, 160);
    this.c = c;
    this.g = g;
    this.tex = makeTex(c, { repeat: false });
  }
  draw(hour) {
    const g = this.g;
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 384, 160);
    [
      ['PORT HALCYON', 0],
      ['SAINT ORIEL', -5],
      ['NOVA MERIDIAN', 8],
    ].forEach(([name, off], k) => {
      const cx = 64 + k * 128;
      const cy = 62;
      g.fillStyle = '#f2ecd8';
      g.beginPath();
      g.arc(cx, cy, 50, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c8a050';
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = '#2a2a2a';
      for (let m = 0; m < 12; m++) {
        const a = (m / 12) * Math.PI * 2;
        g.fillRect(cx + Math.sin(a) * 42 - 1.5, cy - Math.cos(a) * 42 - 1.5, 3, 3);
      }
      const h = (((hour + off) % 24) + 24) % 24;
      const hand = (a, len, w) => {
        g.lineWidth = w;
        g.strokeStyle = '#1a1a1a';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
        g.stroke();
      };
      hand(((h % 12) / 12) * Math.PI * 2, 26, 5);
      hand(((h % 1) * 60 * Math.PI * 2) / 60, 40, 3);
      t(g, name, cx, 140, 15, '#f0c860', { font: SERIF });
    });
    this.tex.needsUpdate = true;
  }
}

export function createExchangeTextures() {
  const xsigns = signs();
  return { xsigns, kit: { xSigns: { map: xsigns, scale: 1 } } };
}
