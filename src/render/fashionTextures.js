import { makeCanvas, makeTex } from './textures.js';

// The print atlas: logos and graphics that go on tees, hoodies and jacket backs
// (tile numbers are PRINT in game/fashion.js). 4 x 4 tiles of 64 px; transparent
// around the artwork. Small chest logos sit up in the tile's top-left corner, so
// one quad on the chest puts them where a pocket logo goes.

const FONT = '"Arial Black", Impact, sans-serif';
const S = 64;

function t(g, s, x, y, size, col, { align = 'center', font = FONT, weight = 'bold', max } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(s, x, y, max);
}

/** The SPLITGRAIN mark: two slabs split by a diagonal. */
export function sgMark(g, x, y, w, col, cut = '#000') {
  g.fillStyle = col;
  g.fillRect(x, y, w, w * 0.62);
  g.strokeStyle = cut;
  g.lineWidth = w * 0.09;
  g.beginPath();
  g.moveTo(x + w * 0.58, y - 1);
  g.lineTo(x + w * 0.42, y + w * 0.62 + 1);
  g.stroke();
}

/** The VELLARD monogram: two interlocked Vs in a thin ring. */
export function vvMark(g, cx, cy, r, col) {
  g.strokeStyle = col;
  g.lineWidth = Math.max(1, r * 0.12);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = Math.max(1, r * 0.16);
  for (const dx of [-0.22, 0.22]) {
    g.beginPath();
    g.moveTo(cx + (dx - 0.38) * r, cy - 0.45 * r);
    g.lineTo(cx + dx * r, cy + 0.5 * r);
    g.lineTo(cx + (dx + 0.38) * r, cy - 0.45 * r);
    g.stroke();
  }
}

const TILES = [
  // 0 faded GULLY'S staff tee
  (g) => {
    g.globalAlpha = 0.75;
    g.fillStyle = '#17a2a8';
    g.beginPath();
    g.arc(32, 26, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f6f4ee';
    g.beginPath();
    g.arc(32, 28, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff8a2a';
    g.fillRect(36, 27, 9, 4);
    t(g, "GULLY'S", 32, 50, 11, '#ff8a2a');
    g.globalAlpha = 1;
  },
  // 1 THE GULLS '98 tour
  (g) => {
    t(g, 'THE', 32, 10, 9, '#e8e4dc');
    t(g, 'GULLS', 32, 24, 17, '#e8c050');
    g.strokeStyle = '#e8e4dc';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(14, 38);
    g.quadraticCurveTo(22, 31, 30, 38);
    g.quadraticCurveTo(38, 31, 46, 38);
    g.stroke();
    t(g, "PIER TOUR '98", 32, 52, 8, '#c4483a');
  },
  // 2 Harbour 5K 2001
  (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 28, 18, 0, Math.PI * 2);
    g.fill();
    t(g, '5K', 32, 26, 18, '#1f2e4a');
    t(g, 'HARBOUR', 32, 40, 7, '#1f2e4a');
    t(g, '2001', 32, 54, 9, '#ffffff');
  },
  // 3 I heart PORT HALCYON
  (g) => {
    t(g, 'I', 18, 18, 18, '#1e1e22');
    g.fillStyle = '#d8283a';
    g.beginPath();
    g.moveTo(42, 28);
    g.bezierCurveTo(26, 16, 34, 4, 42, 12);
    g.bezierCurveTo(50, 4, 58, 16, 42, 28);
    g.fill();
    t(g, 'PORT', 32, 40, 11, '#1e1e22');
    t(g, 'HALCYON', 32, 53, 11, '#1e1e22');
  },
  // 4 SPLITGRAIN box logo
  (g) => {
    g.fillStyle = '#e8322a';
    g.fillRect(6, 20, 52, 22);
    t(g, 'SPLITGRAIN', 32, 31.5, 9, '#ffffff', { max: 48 });
  },
  // 5 SPLIT (cracked)
  (g) => {
    t(g, 'SPL', 22, 30, 16, '#f4f2ec');
    t(g, 'IT', 46, 34, 16, '#f4f2ec');
    g.strokeStyle = '#1c1c20';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(36, 14);
    g.lineTo(30, 50);
    g.stroke();
  },
  // 6 small SG mark, left chest
  (g) => sgMark(g, 40, 10, 14, '#f4f2ec', '#3a4450'),
  // 7 big SG on a jacket back
  (g) => {
    sgMark(g, 10, 14, 44, '#ff8a2a', '#4a5a3a');
    t(g, 'SPLITGRAIN', 32, 52, 8, '#ff8a2a', { max: 54 });
  },
  // 8 small VV, pocket
  (g) => vvMark(g, 46, 16, 7, '#c8a050'),
  // 9 big VV on the back
  (g) => {
    vvMark(g, 32, 28, 20, '#d8b46a');
    t(g, 'VELLARD', 32, 56, 8, '#d8b46a');
  },
  // 10 SUBSTATION merch
  (g) => {
    g.strokeStyle = '#ff5ac8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(30, 8);
    g.lineTo(22, 30);
    g.lineTo(34, 30);
    g.lineTo(26, 50);
    g.stroke();
    t(g, 'SUBSTATION', 32, 56, 8, '#5ae8ff', { max: 56 });
  },
  // 11 WORLD'S OKAYEST
  (g) => {
    t(g, "WORLD'S", 32, 18, 10, '#f4f2ec');
    t(g, 'OKAYEST', 32, 32, 12, '#f4f2ec');
    t(g, 'HUMAN', 32, 46, 10, '#f4f2ec');
  },
  // 12 small SG mark on an orange hoodie
  (g) => sgMark(g, 40, 10, 14, '#1c1c20', '#ff6a2a'),
  // 13 RACK & RUIN
  (g) => t(g, 'R&R', 32, 32, 18, '#e0a53a'),
];

let atlas = null;
/** One shared texture for every print. */
export function printAtlas() {
  if (atlas) return atlas;
  const [c, g] = makeCanvas(S * 4, S * 4);
  g.clearRect(0, 0, S * 4, S * 4);
  TILES.forEach((draw, k) => {
    g.save();
    g.translate((k % 4) * S, Math.floor(k / 4) * S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    draw(g);
    g.restore();
  });
  atlas = makeTex(c, { repeat: false });
  return atlas;
}
