import { Rng } from '../core/rng.js';
import { makeCanvas, makeTex, noise, jitter } from './textures.js';

// Procedural textures for SUBSTATION (src/world/club.js): board-formed concrete,
// roller shutters with tags, the neon sign, UV paint, gig posters and signs.

const STENCIL = '"Arial Black", Impact, sans-serif';

function text(g, t, x, y, size, col, { align = 'center', font = STENCIL, weight = 'bold', spacing = 0 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(t, x, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

/** Board-formed concrete: horizontal plank marks, form-tie holes, rust streaks. */
function concrete(seed) {
  const rng = new Rng(seed);
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#8e8c88';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    g.fillStyle = jitter('#8e8c88', rng, 16);
    g.fillRect(0, y, S, 32);
    g.fillStyle = 'rgba(30,30,30,0.28)';
    g.fillRect(0, y, S, 1);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, y + 1, S, 1);
    // wood grain left in the concrete by the formwork
    g.strokeStyle = 'rgba(40,40,40,0.08)';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      const yy = y + rng.float(4, 28);
      g.moveTo(0, yy);
      for (let x = 0; x <= S; x += 32) g.lineTo(x, yy + rng.float(-2, 2));
      g.stroke();
    }
  }
  for (let y = 16; y < S; y += 64)
    for (let x = 32; x < S; x += 64) {
      g.fillStyle = 'rgba(30,26,24,0.7)';
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
      if (rng.chance(0.6)) {
        const gr = g.createLinearGradient(0, y, 0, y + rng.float(20, 60));
        gr.addColorStop(0, 'rgba(120,64,30,0.35)');
        gr.addColorStop(1, 'rgba(120,64,30,0)');
        g.fillStyle = gr;
        g.fillRect(x - 2, y + 2, 4, 60);
      }
    }
  for (let k = 0; k < 18; k++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const r = rng.float(12, 40);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rng.chance(0.5) ? '255,255,255' : '20,20,20'},0.06)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(g, S, S, rng, 14);
  return makeTex(c);
}

/** Corrugated steel shutter, covered in tags. */
function shutter(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(256, 256);
  for (let y = 0; y < 256; y += 8) {
    const gr = g.createLinearGradient(0, y, 0, y + 8);
    gr.addColorStop(0, '#7a7e82');
    gr.addColorStop(0.5, '#b8bcc0');
    gr.addColorStop(1, '#5a5e62');
    g.fillStyle = gr;
    g.fillRect(0, y, 256, 8);
  }
  // rust and grime
  for (let k = 0; k < 20; k++) {
    g.fillStyle = `rgba(110,60,30,${rng.float(0.05, 0.18)})`;
    g.fillRect(rng.float(0, 256), rng.float(0, 256), rng.float(4, 30), rng.float(2, 20));
  }
  const grime = g.createLinearGradient(0, 160, 0, 256);
  grime.addColorStop(0, 'rgba(30,26,20,0)');
  grime.addColorStop(1, 'rgba(30,26,20,0.55)');
  g.fillStyle = grime;
  g.fillRect(0, 0, 256, 256);
  // tags: fat outlined letters in a few colours
  const words = ['VOLT', 'ZAP', 'K9', 'RUNE', 'OHM', 'NOVA', 'STATIC', 'AMP'];
  for (let k = 0; k < 9; k++) {
    const x = rng.float(10, 230);
    const y = rng.float(30, 230);
    g.save();
    g.translate(x, y);
    g.rotate(rng.float(-0.25, 0.2));
    g.font = `bold ${rng.int(22, 40)}px ${STENCIL}`;
    g.lineWidth = 4;
    g.strokeStyle = rng.pick(['#1a1a1a', '#f2f2f2', '#2a1a3a']);
    g.fillStyle = rng.pick(['#ff3a8a', '#3ae8ff', '#ffd23a', '#8aff3a', '#ff7a2a', '#b85aff']);
    const w = rng.pick(words);
    g.strokeText(w, 0, 0);
    g.fillText(w, 0, 0);
    g.restore();
  }
  noise(g, 256, 256, rng, 12);
  return makeTex(c, { repeat: false });
}

/** "SUBSTATION" in neon tubes with a lightning bolt, on black (drawn additively). */
function neonSign() {
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 128);
  const tube = (draw, col, glow) => {
    g.save();
    g.shadowColor = glow;
    g.shadowBlur = 16;
    g.strokeStyle = glow;
    g.fillStyle = glow;
    g.lineWidth = 7;
    draw();
    g.shadowBlur = 4;
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 2.5;
    draw();
    g.restore();
  };
  // the lightning bolt
  tube(
    () => {
      g.beginPath();
      g.moveTo(52, 14);
      g.lineTo(26, 68);
      g.lineTo(48, 68);
      g.lineTo(34, 114);
      g.lineTo(78, 52);
      g.lineTo(56, 52);
      g.lineTo(72, 14);
      g.closePath();
      g.stroke();
    },
    '#fff6c8',
    '#ffc83a',
  );
  tube(
    () => {
      // sized to fit the 512px texture whatever the fallback font is
      g.font = `bold 50px ${STENCIL}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '3px';
      g.strokeText('SUBSTATION', 96, 66, 400);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    },
    '#e8f4ff',
    '#3a8aff',
  );
  return makeTex(c, { repeat: false });
}

/** Faded painted lettering left over from the power company. */
function ghostLettering() {
  const [c, g] = makeCanvas(1024, 64);
  g.clearRect(0, 0, 1024, 64);
  text(g, 'CITY  POWER  &  LIGHT   ·   SUBSTATION  No. 9', 512, 34, 40, 'rgba(236,232,220,0.5)', { spacing: 4 });
  // flaking: knock holes out of the paint
  const rng = new Rng(77);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(0,0,0,${rng.float(0.3, 0.9)})`;
    g.fillRect(rng.float(0, 1024), rng.float(0, 64), rng.float(1, 6), rng.float(1, 4));
  }
  g.globalCompositeOperation = 'source-over';
  return makeTex(c, { repeat: false });
}

/** UV paint on black walls: zigzags, bolts, rings and grids, drawn additively. */
function uvArt(seed) {
  const rng = new Rng(seed);
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const cols = ['#ff2ad0', '#2affea', '#c8ff2a', '#ff8a2a', '#8a5aff'];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (col, w, fn) => {
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 8;
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    fn();
    g.stroke();
    g.restore();
  };
  // zigzag bands
  for (let k = 0; k < 3; k++) {
    const y = 30 + k * 80 + rng.float(-10, 10);
    stroke(rng.pick(cols), 3, () => {
      g.moveTo(0, y);
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? -10 : 10));
    });
  }
  // rings
  for (let k = 0; k < 4; k++) {
    const x = rng.float(20, 236);
    const y = rng.float(20, 236);
    stroke(rng.pick(cols), 2.5, () => g.arc(x, y, rng.float(10, 28), 0, Math.PI * 2));
  }
  // bolts
  for (let k = 0; k < 3; k++) {
    const x = rng.float(20, 230);
    const y = rng.float(10, 180);
    stroke(rng.pick(cols), 3, () => {
      g.moveTo(x, y);
      g.lineTo(x - 10, y + 26);
      g.lineTo(x + 4, y + 26);
      g.lineTo(x - 8, y + 56);
    });
  }
  // a grid of dots
  for (let y = 8; y < S; y += 24)
    for (let x = 8; x < S; x += 24)
      if (rng.chance(0.25)) {
        g.fillStyle = rng.pick(cols);
        g.fillRect(x, y, 2, 2);
      }
  return makeTex(c);
}

/** 16 rows of signs, 256x16 each. */
export const SIGN_ROWS = 16;
function signs() {
  const rows = [
    ['TOILETS', '#141418', '#f2f2f2'],
    ['STAFF ONLY', '#b02a2a', '#ffffff'],
    ['VIP  ·  WRISTBANDS ONLY', '#141418', '#e8c060'],
    ['COAT CHECK  ·  $2', '#e8c060', '#141418'],
    ['EXIT', '#1a8a3a', '#ffffff'],
    ['BAR', '#141418', '#3ae8ff'],
    ['DANGER  ·  HIGH VOLTAGE', '#f0c020', '#141418'],
    ['NO STAMP  ·  NO RE-ENTRY', '#2a2a30', '#ffffff'],
    ['PHOTOS  ·  4 FOR $5', '#c82a2a', '#ffe08a'],
    ['OUT OF FILM', '#f4f0e0', '#2a2a30'],
    ['CASH ONLY BAR', '#141418', '#ff6aa8'],
    ['ATM', '#2a5ab0', '#ffffff'],
    ['SUBSTATION', '#141418', '#6ab8ff'],
    ['NO SMOKING', '#f4f0e0', '#c82a2a'],
    ['NIGHTLY  10PM - 4AM', '#141418', '#f2f2f2'],
    ['FRIES  ·  LATE  ·  $4', '#e8c020', '#8a1a1a'],
  ];
  const [c, g] = makeCanvas(256, 256);
  rows.forEach(([t, bg, fg], k) => {
    g.fillStyle = bg;
    g.fillRect(0, k * 16, 256, 16);
    text(g, t, 128, k * 16 + 8.5, 11, fg);
  });
  return makeTex(c, { repeat: false });
}
export const signUV = (k) => [0, 1 - (k + 1) / SIGN_ROWS + 0.002, 1, 1 - k / SIGN_ROWS - 0.002];

/** Four gig posters for the club's theme nights. */
function posters() {
  const [c, g] = makeCanvas(256, 128);
  const nights = [
    ['THU', 'STATIC', '#1a1a2e', '#3ae8ff', '#ff2ad0'],
    ['FRI', 'CURRENT', '#2e0a1a', '#ff6a2a', '#ffd23a'],
    ['SAT', 'OVERLOAD', '#0a0a0a', '#c8ff2a', '#ff2a6a'],
    ['SUN', 'LOW VOLTAGE', '#16203a', '#a8b8ff', '#ffffff'],
  ];
  nights.forEach(([day, name, bg, a, b], k) => {
    const x = k * 64;
    g.fillStyle = bg;
    g.fillRect(x + 2, 2, 60, 124);
    g.strokeStyle = a;
    g.lineWidth = 2;
    for (let r = 8; r < 40; r += 7) {
      g.beginPath();
      g.arc(x + 32, 52, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = b;
    g.beginPath();
    g.moveTo(x + 36, 30);
    g.lineTo(x + 26, 54);
    g.lineTo(x + 34, 54);
    g.lineTo(x + 28, 76);
    g.lineTo(x + 42, 48);
    g.lineTo(x + 34, 48);
    g.closePath();
    g.fill();
    text(g, day, x + 32, 14, 11, b);
    text(g, name, x + 32, 96, name.length > 8 ? 8 : 11, a);
    text(g, 'SUBSTATION', x + 32, 110, 7, '#f2f2f2');
    text(g, '10PM - 4AM', x + 32, 119, 6, '#b8b8c0');
  });
  return makeTex(c, { repeat: false });
}

/** Yellow and black safety stripes. */
function hazard() {
  const [c, g] = makeCanvas(64, 64);
  g.fillStyle = '#f0c020';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#18181a';
  for (let k = -64; k < 64; k += 32) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 16, 64);
    g.lineTo(k + 80, 0);
    g.lineTo(k + 64, 0);
    g.closePath();
    g.fill();
  }
  return makeTex(c);
}

/** Sticker-bombed surface (toilet doors, mirror frames). */
function stickers(seed) {
  const rng = new Rng(seed);
  const [c, g] = makeCanvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  for (let k = 0; k < 40; k++) {
    g.save();
    g.translate(rng.float(0, 128), rng.float(0, 128));
    g.rotate(rng.float(-0.6, 0.6));
    g.fillStyle = rng.pick(['#ff3a8a', '#3ae8ff', '#ffd23a', '#f2f2f2', '#1a1a1a', '#8aff3a', '#ff7a2a']);
    if (rng.chance(0.4)) {
      g.beginPath();
      g.arc(0, 0, rng.float(4, 9), 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(-rng.float(5, 12), -rng.float(3, 7), rng.float(10, 24), rng.float(6, 14));
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-4, -1, 8, 2);
    g.restore();
  }
  return makeTex(c);
}

/** Bright in the middle, fading to the edges: LED floor tiles, glow discs. */
function frosted() {
  const [c, g] = makeCanvas(32, 32);
  const gr = g.createRadialGradient(16, 16, 2, 16, 16, 22);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#5a5a5a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return makeTex(c, { repeat: false });
}

/** Light beam: bright at the lamp (v = 1), gone at the far end, soft at the sides. */
function beam() {
  const [c, g] = makeCanvas(32, 64);
  const img = g.createImageData(32, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 32; x++) {
      const v = 1 - y / 63; // canvas top = texture v 1
      const u = Math.abs((x + 0.5) / 32 - 0.5) * 2;
      const a = Math.pow(v, 1.6) * (1 - u * u * 0.6);
      const i = (y * 32 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * a);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return makeTex(c, { repeat: false });
}

/** Mirror ball facets. */
function mirrorTiles() {
  const rng = new Rng(9);
  const [c, g] = makeCanvas(64, 64);
  for (let y = 0; y < 64; y += 4)
    for (let x = 0; x < 64; x += 4) {
      const v = rng.int(110, 255);
      g.fillStyle = `rgb(${v},${v},${v + 8 > 255 ? 255 : v + 8})`;
      g.fillRect(x, y, 3, 3);
    }
  return makeTex(c);
}

export function createClubTextures() {
  return {
    concrete: concrete(901),
    shutter: shutter(902),
    neon: neonSign(),
    ghost: ghostLettering(),
    uv: uvArt(903),
    frosted: frosted(),
    beam: beam(),
    mirror: mirrorTiles(),
    // kit-ready entries (map + metres per tile)
    kit: {
      clubSigns: { map: signs(), scale: 1 },
      posters: { map: posters(), scale: 1 },
      hazard: { map: hazard(), scale: 0.6 },
      stickers: { map: stickers(904), scale: 0.8 },
    },
  };
}
