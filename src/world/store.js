import * as THREE from 'three';
import { CITY, STORE_SITE } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, damp, smoothstep } from '../core/rng.js';
import { InteriorKit, F, C } from './interior/kit.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { makeCanvas, makeTex } from '../render/textures.js';
import { additive } from '../render/materials.js';

// HALCYON 24: a walk-in convenience store on the street next to Unit 3B.
// Unlike apartments it isn't a separate "place": the sales floor is part of the
// city, you see into it through the windows, customers walk in off the sidewalk.
//
// Local coordinates like the apartments: x along the street facade (0..W),
// z from the back wall (0) to the shop windows (D), y up from the floor.

const W = 13.4;
const D = 12.4;
const H = STORE_SITE.groundH;
const GREEN = '#2e6a46';
const DARK_GREEN = '#24402e';

export const CATEGORIES = ['drinks', 'snacks', 'noodles', 'household'];
const PALETTES = {
  snacks: ['#e83a2a', '#f0c030', '#2a7ae0', '#e87a1a', '#7a3ac0', '#2ab05a', '#c02a6a'],
  noodles: ['#f2eee6', '#c83a2a', '#f0b030', '#2a6ac8', '#e8e4dc'],
  household: ['#2a8ae0', '#f2eee6', '#3ac08a', '#d8d040', '#8a5ac8', '#e85a8a'],
  drinks: ['#c82a2a', '#2a6ae0', '#f2eee6', '#3ab04a', '#f08a1a', '#1e1e22', '#e8c020', '#5ad0e0'],
};

function textCanvas(w, h, draw) {
  const [c, g] = makeCanvas(w, h);
  draw(g);
  return makeTex(c, { repeat: false });
}

function label(g, text, x, y, size, col, align = 'center', font = '"Arial Black", Impact, sans-serif') {
  g.font = `bold ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(text, x, y);
}

/** Small sign atlas: 8 rows, 256x16 each. */
function signAtlas() {
  const rows = [
    ['COLD DRINKS', '#1e4a8a', '#ffffff'],
    ['STAFF ONLY', '#b02a2a', '#ffffff'],
    ['2 FOR $3', '#f0c030', '#b02a2a'],
    ['HOT DOGS $1.99', '#b02a2a', '#ffe08a'],
    ['DRINKS', '#2a6ae0', '#ffffff'],
    ['SNACKS', '#e87a1a', '#ffffff'],
    ['NOODLES', '#c83a2a', '#ffffff'],
    ['HOUSEHOLD', '#3a8a5a', '#ffffff'],
  ];
  return textCanvas(256, 128, (g) => {
    rows.forEach(([t, bg, fg], k) => {
      g.fillStyle = bg;
      g.fillRect(0, k * 16, 256, 16);
      label(g, t, 128, k * 16 + 8.5, 12, fg);
    });
  });
}
const rowUV = (k) => [0, 1 - (k + 1) / 8 + 0.004, 1, 1 - k / 8 - 0.004];

function magazines(seed) {
  const rng = new Rng(seed);
  return textCanvas(128, 64, (g) => {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 8; x++) {
        const bg = rng.pick(['#e83a5a', '#2a5ab0', '#f0c030', '#1e1e22', '#e8e4dc', '#3a9a6a', '#8a3ac0']);
        g.fillStyle = bg;
        g.fillRect(x * 16 + 1, y * 32 + 1, 14, 30);
        g.fillStyle = bg === '#e8e4dc' ? '#c82a2a' : '#ffffff';
        g.fillRect(x * 16 + 2, y * 32 + 3, 12, 4);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x * 16 + 3, y * 32 + 12, 10, 12);
      }
  });
}

function corkboard(seed) {
  const rng = new Rng(seed);
  return textCanvas(64, 48, (g) => {
    g.fillStyle = '#b08a5a';
    g.fillRect(0, 0, 64, 48);
    g.fillStyle = '#6a4a2a';
    g.strokeStyle = '#6a4a2a';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 62, 46);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = rng.pick(['#f4f2ea', '#f0e88a', '#ffd0d8', '#d0e8ff']);
      const x = rng.int(3, 46);
      const y = rng.int(3, 30);
      g.fillRect(x, y, rng.int(10, 16), rng.int(10, 14));
      g.fillStyle = 'rgba(40,40,60,0.6)';
      for (let l = 0; l < 3; l++) g.fillRect(x + 2, y + 3 + l * 3, 8, 1);
      g.fillStyle = '#c82a2a';
      g.fillRect(x + 5, y, 2, 2);
    }
  });
}

/** The CCTV feed: grey, noisy, scanlined. */
const CCTV_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float time;
varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.0) * 43758.5453); }
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  l = pow(clamp(l * 1.4, 0.0, 1.0), 1.0 / 2.2);
  l += (rnd(floor(vUv * vec2(160.0, 120.0))) - 0.5) * 0.12;
  l *= 0.85 + 0.15 * step(0.5, fract(vUv.y * 60.0));
  float v = smoothstep(0.75, 0.2, length(vUv - 0.5));
  gl_FragColor = vec4(vec3(l * (0.6 + 0.4 * v)) * vec3(0.85, 1.0, 0.9) * 1.4, 1.0);
}`;
const CCTV_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Store {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.storeSite;
    this.site = site;
    // a little above the pavement so the shop floor never z-fights the sidewalk under it
    this.origin = new THREE.Vector3(site.x0 + 0.3, CITY.CURB + STORE_SITE.floorLift, site.z0 + 0.3);
    this.W = W;
    this.D = D;
    this.H = H;
    this.rng = new Rng(2404);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.uniforms = makeInteriorUniforms();
    this.uniforms.uLampOn.value = 1;
    this.tex = {
      ...interiorTex,
      signs: { map: signAtlas(), scale: 1 },
      magazines: { map: magazines(31), scale: 1 },
      cork: { map: corkboard(32), scale: 1 },
    };
    this.slots = [];
    this.doorOpen = 0;
    this.onChime = null;

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildInterior(kit);
    kit.build(this.group, {}, { fog: true });
    // the store is part of the street: its walls go into the city's collision
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.fixtures = kit.lights;
    this.interactables = kit.interactables;

    this.buildProducts();
    this.buildDoors();
    this.buildExterior(cityTex);
    this.buildDynamic(cityTex);
    this.buildCCTV();
  }

  /** local -> world */
  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  /** Is a world point on the shop floor or in the back? */
  contains(p, pad = 0) {
    const o = this.origin;
    return p.x > o.x - pad && p.x < o.x + W + pad && p.z > o.z - pad && p.z < o.z + D + pad && p.y < o.y + H;
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const R90 = Math.PI / 2;
    const PI = Math.PI;
    kit.room('floor', 0, 4.0, W, D, { floor: 'vct', wallColor: '#f2f0ea', ceil: '#ffffff', ceilKey: 'ceilTile', base: GREEN, trim: '#e8e4dc' });
    kit.room('stock', 0, 0, 9.0, 4.0, { floor: 'concrete', wallColor: '#d4d0c4', ceil: '#d8d4c8', base: '#5a5a5a' });
    kit.room('office', 9.0, 0, W, 4.0, { floor: 'carpet', floorColor: '#9a9ea8', wallColor: '#d8d2c0', ceil: '#e8e4dc', ceilKey: 'ceilTile', base: '#6a5a4a' });

    const shopfront = { key: 'solid', color: GREEN, trim: DARK_GREEN };
    const brick = { key: 'plaster', color: '#bdb5a2', trim: '#8a8478' };
    const glass = { kind: 'window', y0: 0.45, y1: 2.75, grid: [4, 1], frame: DARK_GREEN, trim: DARK_GREEN };
    kit.wall('x', D, 0, W, {
      t: 0.3,
      ext: 1,
      outside: shopfront,
      open: [
        { from: 0.35, to: 5.7, ...glass },
        { from: 5.9, to: 7.5, kind: 'opening', y1: 2.45, trim: DARK_GREEN },
        { from: 7.7, to: 13.05, ...glass },
      ],
    });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1, outside: brick });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1, outside: brick });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1, outside: brick });
    kit.wall('x', 4.0, 0, W, { open: [{ from: 4.0, to: 5.0, swing: -1, doorColor: '#8a9a96' }] });
    kit.wall('z', 9.0, 0, 4.0, { open: [{ from: 1.6, to: 2.5, swing: 1, doorColor: '#8a9a96' }] });
    P(4.5, 4.06).panel('signs', -0.4, 2.15, 0.4, 2.35, 0.005, rowUV(1));

    // --- ceiling: fluorescent troffers in rows, cameras, speakers
    for (const x of [2.6, 5.0, 7.4, 10.0, 12.2])
      for (const z of [5.6, 8.0, 10.4]) {
        const L = P(x, z);
        L.box('solid', -0.32, H - 0.02, -0.62, 0.32, H - 0.005, 0.62, C('#d8d8d4'), { bottom: true });
        L.box('glow', -0.28, H - 0.025, -0.58, 0.28, H - 0.02, 0.58, C('#f2f6ff'), { top: false, bottom: true });
        L.light(0, H - 0.3, 0, '#f0f4ff', 0.42, true);
      }
    for (const [x, z, r] of [
      [0.35, 4.35, PI * 0.25],
      [W - 0.35, D - 0.4, -PI * 0.75],
    ]) {
      const S = P(x, z, r);
      S.box('solid', -0.06, H - 0.32, -0.06, 0.06, H, 0.06, C('#2a2a2a'));
      S.box('solid', -0.07, H - 0.42, -0.02, 0.07, H - 0.3, 0.22, C('#e8e4dc'));
    }
    // convex security mirror in the back-left corner
    P(0.3, 4.3).geo('mirror', new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, H - 0.5, 0, [1, 1, 1], 0, 1, 1, 0.4, -Math.PI / 2 + 0.6, 0);

    // --- coolers along the left wall
    const CZ0 = 4.6;
    const CZ1 = 10.95;
    const bay = (CZ1 - CZ0) / 5;
    const Cc = P(0, 0);
    Cc.box('solid', 0, 0, CZ0, 0.85, 0.12, CZ1, C('#1e1e22'));
    Cc.box('solid', 0, 2.2, CZ0, 0.9, 2.5, CZ1, C('#1e4a8a'), { bottom: true });
    for (let k = 0; k < 5; k++) {
      const z0 = CZ0 + k * bay;
      const B = P(0, z0);
      // inside: back light, wire shelves
      B.box('glow', 0.02, 0.15, 0.04, 0.03, 2.15, bay - 0.04, C('#e8f4ff', 0.75));
      for (const y of [0.25, 0.65, 1.05, 1.45, 1.85]) B.box('solid', 0.05, y - 0.015, 0.03, 0.8, y, bay - 0.03, C('#b8bec4'), { bottom: true });
      // door: frame, glass, handle
      B.box('solid', 0.82, 0.12, 0, 0.9, 0.18, bay, C('#1e1e22'));
      B.box('solid', 0.82, 2.14, 0, 0.9, 2.2, bay, C('#1e1e22'));
      B.box('solid', 0.82, 0.12, 0, 0.9, 2.2, 0.04, C('#1e1e22'));
      B.quad('glass', [0.86, 0.18, bay - 0.02], [0.86, 0.18, 0.04], [0.86, 2.14, 0.04], [0.86, 2.14, bay - 0.02], [1, 0, 0], [0, 0, 1, 1]);
      B.box('solid', 0.9, 0.7, bay - 0.14, 0.95, 1.7, bay - 0.1, C('#c8ccd0'));
      for (let y = 0; y < 4; y++) this.addSlot('drinks', this.w(0.45, z0 + bay / 2, [0.25, 0.65, 1.05, 1.45][y]), 'z', bay - 0.16, 1, 0.13);
    }
    Cc.box('solid', 0.82, 0.12, CZ1 - 0.04, 0.9, 2.2, CZ1, C('#1e1e22'));
    Cc.collide(0, CZ0, 0.92, CZ1, 2.5);
    P(0.91, (CZ0 + CZ1) / 2, R90).panel('signs', -1.6, 2.25, 1.6, 2.45, 0.0, rowUV(0));
    Cc.light(0.5, 1.4, (CZ0 + CZ1) / 2, '#e8f4ff', 0.5);

    // --- gondola shelving
    const GZ0 = 5.6;
    const GZ1 = 9.6;
    const gcats = [
      ['snacks', 'snacks'],
      ['noodles', 'noodles'],
      ['snacks', 'household'],
    ];
    [2.6, 5.0, 7.4].forEach((X, u) => {
      const G = P(X, (GZ0 + GZ1) / 2);
      const len = GZ1 - GZ0;
      G.box('solid', -0.43, 0, -len / 2, 0.43, 0.12, len / 2, C('#3a3e3a'));
      G.box('solid', -0.04, 0.12, -len / 2, 0.04, 1.6, len / 2, C('#c8ccc6'));
      for (const y of [0.15, 0.5, 0.85, 1.2])
        for (const s of [-1, 1]) {
          G.box('solid', s < 0 ? -0.44 : 0.04, y - 0.025, -len / 2, s < 0 ? -0.04 : 0.44, y, len / 2, C('#dcdedc'), { bottom: true });
          G.box('solid', s < 0 ? -0.455 : 0.44, y - 0.065, -len / 2, s < 0 ? -0.44 : 0.455, y, len / 2, C(GREEN), { bottom: true });
        }
      for (const e of [-1, 1]) G.box('solid', -0.45, 0, e > 0 ? len / 2 : -len / 2 - 0.03, 0.45, 1.6, e > 0 ? len / 2 + 0.03 : -len / 2, C(GREEN));
      G.box('solid', -0.45, 1.6, len / 2 - 0.02, 0.45, 1.95, len / 2 + 0.01, C('#f2f0ea'));
      G.panel('signs', -0.42, 1.65, 0.42, 1.9, len / 2 + 0.02, rowUV([5, 6, 7][u]));
      G.collide(-0.46, -len / 2 - 0.03, 0.46, len / 2 + 0.03, 1.95);
      gcats[u].forEach((cat, side) => {
        const sx = side === 0 ? -0.24 : 0.24;
        for (const y of [0.15, 0.5, 0.85, 1.2])
          for (const [z0, z1] of [
            [GZ0 + 0.1, GZ0 + len / 2],
            [GZ0 + len / 2, GZ1 - 0.1],
          ])
            this.addSlot(cat, this.w(X + sx, (z0 + z1) / 2, y), 'z', z1 - z0 - 0.06, side === 0 ? -1 : 1);
      });
    });
    // end-cap promo stack at the front of the middle aisle
    const E = P(5.0, GZ1 + 0.55);
    E.box('solid', -0.5, 0, -0.35, 0.5, 0.12, 0.35, C('#3a3e3a'));
    for (let k = 0; k < 3; k++) E.box('solid', -0.45 + k * 0.05, 0.12 + k * 0.32, -0.3, 0.45 - k * 0.05, 0.44 + k * 0.32, 0.3, C(['#c82a2a', '#f0c030', '#c82a2a'][k]));
    E.box('solid', -0.02, 1.08, -0.02, 0.02, 1.6, 0.02, C('#8a8a8a'));
    E.panel('signs', -0.45, 1.55, 0.45, 1.85, 0.03, rowUV(2));
    E.collide(-0.5, -0.35, 0.5, 0.35, 1.1);

    // --- wall shelving on the back wall of the shop
    const wall = (x0, x1, cat) => {
      const S = P((x0 + x1) / 2, 4.06);
      const w = x1 - x0;
      S.box('solid', -w / 2, 0, 0, w / 2, 0.12, 0.4, C('#3a3e3a'));
      S.box('solid', -w / 2, 0.12, 0, w / 2, 1.95, 0.03, C('#c8ccc6'));
      for (const e of [-1, 1]) S.box('solid', e > 0 ? w / 2 : -w / 2 - 0.03, 0, 0, e > 0 ? w / 2 + 0.03 : -w / 2, 1.95, 0.43, C(GREEN));
      for (const y of [0.17, 0.57, 0.97, 1.37]) {
        S.box('solid', -w / 2, y - 0.025, 0.03, w / 2, y, 0.42, C('#dcdedc'), { bottom: true });
        S.box('solid', -w / 2, y - 0.065, 0.42, w / 2, y, 0.435, C(GREEN), { bottom: true });
        for (let k = 0; k < 2; k++) {
          const sx0 = x0 + 0.05 + (k * (w - 0.1)) / 2;
          this.addSlot(cat, this.w(sx0 + (w - 0.1) / 4, 4.26, y), 'x', (w - 0.1) / 2 - 0.06, 1);
        }
      }
      S.collide(-w / 2, 0, w / 2, 0.43, 1.95);
    };
    wall(0.95, 3.8, 'household');
    wall(5.3, 9.4, 'noodles');

    // --- coffee station
    const K = P(11.3, 4.06);
    F.counter(K, { x0: -1.3, x1: 1.3, cab: '#5a3a26', cabKey: 'wood', top: '#2a2a2a', d: 0.6 });
    K.box('solid', -1.1, 0.9, 0.05, -0.4, 1.6, 0.5, C('#2a2a2e'));
    K.box('glow', -1.0, 1.35, 0.5, -0.5, 1.5, 0.506, C('#ffb84a'));
    for (const x of [-0.95, -0.65]) K.box('solid', x, 0.9, 0.3, x + 0.12, 1.1, 0.45, C('#c8ccd0'));
    for (const x of [0.0, 0.3]) K.geo('solid', new THREE.CylinderGeometry(0.08, 0.08, 0.35, 10), x, 1.08, 0.3, C('#c82a2a'));
    K.geo('solid', new THREE.CylinderGeometry(0.05, 0.04, 0.45, 8), 0.7, 1.13, 0.25, C('#f2f0ea'));
    K.geo('solid', new THREE.CylinderGeometry(0.05, 0.04, 0.45, 8), 0.85, 1.13, 0.25, C('#f2f0ea'));
    K.box('solid', 1.0, 0.9, 0.15, 1.25, 1.0, 0.45, C('#8a6a4a'));
    this.coffeeSpot = this.w(11.3, 4.95);

    // --- checkout counter
    const CT = P(10.95, 8.65);
    const cl = 4.3;
    CT.box('solid', -0.35, 0, -cl / 2, 0.35, 0.95, cl / 2, C('#e8e4dc'));
    CT.box('solid', -0.36, 0.05, -cl / 2, -0.35, 0.95, cl / 2, C(GREEN), { sides: [false, false, false, true] });
    CT.box('solid', -0.42, 0.95, -cl / 2 - 0.05, 0.42, 1.0, cl / 2 + 0.05, C('#6a6e72'), { bottom: true });
    CT.collide(-0.42, -cl / 2 - 0.05, 0.42, cl / 2 + 0.05, 1.0);
    // register (screen faces the cashier, pole display faces the customer)
    const RG = P(11.05, 7.6);
    RG.box('solid', -0.22, 1.0, -0.25, 0.22, 1.12, 0.25, C('#2a2a2e'));
    RG.box('solid', -0.05, 1.12, -0.03, 0.05, 1.3, 0.03, C('#2a2a2e'));
    RG.box('solid', 0.05, 1.28, -0.2, 0.2, 1.52, 0.2, C('#1e1e22'));
    RG.box('glow', 0.2, 1.31, -0.17, 0.206, 1.49, 0.17, C('#6ab0e8'));
    RG.box('solid', -0.25, 1.12, -0.08, -0.15, 1.24, 0.08, C('#1e1e22'));
    RG.box('glow', -0.256, 1.15, -0.06, -0.25, 1.21, 0.06, C('#3aff6a'));
    RG.box('solid', 0.08, 1.0, 0.32, 0.2, 1.1, 0.42, C('#1e1e22'));
    this.registerSpot = this.w(12.0, 7.6);
    this.customerSpot = this.w(10.05, 7.6);
    // candy rack on the customer side, hot dog roller near the window
    const CR = P(10.55, 9.3, -R90);
    CR.box('solid', -0.4, 0.95, -0.02, 0.4, 1.3, 0.25, C('#c82a2a'));
    for (let k = 0; k < 12; k++) CR.box('solid', -0.37 + (k % 6) * 0.125, 1.0 + Math.floor(k / 6) * 0.15, 0.2, -0.27 + (k % 6) * 0.125, 1.12 + Math.floor(k / 6) * 0.15, 0.26, C(PALETTES.snacks[k % 7]));
    const HD = P(11.0, 10.35);
    HD.box('solid', -0.3, 1.0, -0.25, 0.3, 1.1, 0.25, C('#a8acb0'));
    for (let k = 0; k < 6; k++) HD.geo('solid', new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6), 0, 1.13, -0.18 + k * 0.07, C('#c86a3a'), 0, 1, 1, 1, 0, Math.PI / 2);
    HD.box('glass', -0.3, 1.1, -0.25, 0.3, 1.35, 0.25);
    HD.box('glow', -0.25, 1.38, -0.2, 0.25, 1.4, 0.2, C('#ff8a3a'), { top: false, bottom: true });
    HD.panel('signs', -0.3, 1.42, 0.3, 1.55, 0.26, rowUV(3));
    // shelves behind the cashier: batteries, medicine, phone cards
    const BS = P(W, 8.6, -R90);
    BS.box('solid', -2.0, 0, 0, 2.0, 2.0, 0.03, C('#e8e4dc'));
    BS.box('solid', -2.0, 0, 0.03, 2.0, 0.8, 0.37, C('#d8d4c8'));
    for (const e of [-1, 1]) BS.box('solid', e > 0 ? 2.0 : -2.03, 0, 0, e > 0 ? 2.03 : -2.0, 2.0, 0.39, C(GREEN));
    for (const y of [0.9, 1.3, 1.7]) {
      BS.box('solid', -2.0, y - 0.025, 0.03, 2.0, y, 0.36, C('#dcdedc'), { bottom: true });
      BS.box('solid', -2.0, y - 0.06, 0.36, 2.0, y, 0.38, C(GREEN), { bottom: true });
      for (let k = 0; k < 18; k++) BS.box('solid', -1.9 + k * 0.21, y, 0.15, -1.76 + k * 0.21, y + 0.15 + (k % 3) * 0.04, 0.3, C(PALETTES.household[k % 6]));
    }
    BS.collide(-2.0, 0, 2.0, 0.38, 2.0);
    // CCTV monitor over the counter
    this.monitorSpots = [
      { m: trs(this.origin.x + 10.95, this.origin.y + 2.45, this.origin.z + 8.4, -R90), w: 0.48, h: 0.36, dz: 0.13 },
    ];
    P(10.95, 8.4, -R90).box('solid', -0.3, 2.22, -0.08, 0.3, 2.68, 0.12, C('#1e1e22')).box('solid', -0.02, 2.68, 0, 0.02, H, 0.04, C('#1e1e22'));

    // --- front of shop: magazine rack, ice chest, mat, trash bin
    const MG = P(2.2, D, PI);
    MG.box('solid', -1.2, 0, 0, 1.2, 0.95, 0.35, C('#c8ccc6'));
    for (let k = 0; k < 3; k++) MG.quad('magazines', [-1.15, 0.2 + k * 0.25, 0.36 - k * 0.04], [1.15, 0.2 + k * 0.25, 0.36 - k * 0.04], [1.15, 0.42 + k * 0.25, 0.3 - k * 0.04], [-1.15, 0.42 + k * 0.25, 0.3 - k * 0.04], [0, 0.3, 1], [0, k % 2 ? 0 : 0.5, 1, k % 2 ? 0.5 : 1]);
    MG.collide(-1.2, 0, 1.2, 0.4, 0.95);
    const IC = P(4.6, D - 0.5);
    IC.box('solid', -0.7, 0, -0.4, 0.7, 0.85, 0.4, C('#f2f0ea'));
    IC.box('solid', -0.7, 0.85, -0.4, 0.7, 0.9, 0.4, C('#c8ccd0'));
    IC.quad('solid', [0.5, 0.35, -0.406], [-0.5, 0.35, -0.406], [-0.5, 0.65, -0.406], [0.5, 0.65, -0.406], [0, 0, -1], [0, 0, 1, 1], C('#2a6ae0'));
    IC.collide(-0.7, -0.4, 0.7, 0.4, 0.9);
    P(6.7, D - 0.7).box('solid', -0.8, 0, -0.6, 0.8, 0.012, 0.6, C('#2a2a2a'));
    this.binSpot = this.w(8.35, D - 0.6);
    P(8.35, D - 0.6).geo('solid', new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10, 1, true), 0, 0.425, 0, C('#3a4a3a'));
    kit.colliders.add(this.binSpot.x - 0.3, this.binSpot.z - 0.3, this.binSpot.x + 0.3, this.binSpot.z + 0.3, this.origin.y, this.origin.y + 0.9);

    // --- stockroom
    const bays = [
      ['drinks', 0.45, 4],
      ['snacks', 2.55, 5],
      ['noodles', 4.65, 6],
      ['household', 6.75, 7],
    ];
    this.stockBays = [];
    for (const [cat, x0, row] of bays) {
      const S = P(x0 + 0.95, 0);
      for (const [x, z] of [
        [-0.95, 0.02],
        [0.9, 0.02],
        [-0.95, 0.58],
        [0.9, 0.58],
      ])
        S.box('solid', x - 0.004, 0, z - 0.004, x + 0.054, 2.1, z + 0.054, C('#5a6a7a'));
      for (const y of [0.15, 0.85, 1.55]) {
        S.box('solid', -0.95, y - 0.04, 0.02, 0.95, y, 0.63, C('#8a9aa8'), { bottom: true });
        for (let k = 0; k < 4; k++) {
          const bx = -0.85 + k * 0.44;
          S.box('solid', bx, y, 0.08, bx + 0.38, y + 0.34 + (k % 2) * 0.08, 0.55, C('#b08a5a', 0.9 + (k % 3) * 0.06));
          S.box('solid', bx + 0.05, y + 0.12, 0.55, bx + 0.33, y + 0.22, 0.556, C(PALETTES[cat][k % PALETTES[cat].length]));
        }
      }
      S.panel('signs', -0.6, 2.12, 0.6, 2.32, 0.64, rowUV(row));
      S.collide(-0.97, 0, 0.97, 0.65, 2.1);
      this.stockBays.push({ cat, pos: this.w(x0 + 0.95, 1.1) });
      kit.interactables.push({ job: 'case', cat, label: `Take a case of ${cat}`, ...xz(this.w(x0 + 0.95, 1.05)), r: 0.95 });
    }
    // pallet and hand truck
    const PL = P(5.6, 2.6);
    PL.box('wood', -0.6, 0, -0.5, 0.6, 0.14, 0.5, C('#a8865a'));
    for (let k = 0; k < 6; k++) PL.box('solid', -0.55 + (k % 3) * 0.37, 0.14 + Math.floor(k / 3) * 0.34, -0.45, -0.2 + (k % 3) * 0.37, 0.46 + Math.floor(k / 3) * 0.34, 0.45, C('#b08a5a', 0.95));
    PL.box('glass', -0.58, 0.14, -0.47, 0.58, 0.82, 0.47);
    PL.collide(-0.6, -0.5, 0.6, 0.5, 0.85);
    // janitor corner: mop bucket, mop, utility shelf
    const JN = P(0.6, 3.35);
    JN.box('solid', -0.2, 0, -0.18, 0.2, 0.35, 0.18, C('#e8c020'));
    JN.box('solid', -0.18, 0.3, -0.16, 0.18, 0.31, 0.16, C('#5a7a8a'));
    this.mopHome = { x: this.w(0.35, 3.75), base: this.w(0.6, 3.35) };
    JN.collide(-0.22, -0.2, 0.22, 0.2, 0.4);
    kit.interactables.push({ job: 'mop', label: 'Take the mop', ...xz(this.w(1.2, 3.3)), r: 0.95 });
    // time clock and card rack beside the staff door (stockroom side)
    const TC = P(6.0, 3.94, PI);
    TC.box('solid', -0.15, 1.2, 0, 0.15, 1.55, 0.14, C('#c8c4b8'));
    TC.box('glow', -0.08, 1.42, 0.14, 0.08, 1.48, 0.146, C('#ff5a3a'));
    TC.box('solid', 0.25, 1.0, 0, 0.55, 1.6, 0.04, C('#8a8a86'));
    for (let k = 0; k < 6; k++) TC.box('solid', 0.28 + (k % 2) * 0.14, 1.05 + Math.floor(k / 2) * 0.18, 0.04, 0.38 + (k % 2) * 0.14, 1.2 + Math.floor(k / 2) * 0.18, 0.05, C('#f2eee0'));
    kit.interactables.push({ job: 'clock', label: 'Time clock', ...xz(this.w(6.0, 3.35)), r: 0.9 });
    // lockers + the uniform on a hook
    const LK = P(8.94, 3.3, -R90);
    for (let k = 0; k < 3; k++) {
      LK.box('solid', -0.6 + k * 0.4, 0, 0, -0.22 + k * 0.4, 1.9, 0.45, C('#6a7a8a'));
      for (let v = 0; v < 3; v++) LK.box('solid', -0.55 + k * 0.4, 1.55 + v * 0.06, 0.45, -0.27 + k * 0.4, 1.57 + v * 0.06, 0.455, C('#3a4a5a'));
    }
    LK.collide(-0.62, 0, 0.62, 0.46, 1.9);
    for (const x of [2.0, 6.5]) F.ceilingLight(P(x, 2.0), H, { style: 'tube', power: 0.7 });
    F.smoke(P(4.5, 2.5), H);

    // --- office
    F.desk(P(W, 2.0, -R90), { w: 1.4, col: '#8a7a6a', legs: '#3a3a3a', monitor: false, lamp: true });
    this.monitorSpots.push({ m: trs(this.origin.x + W - 0.2, this.origin.y + 1.11, this.origin.z + 2.0, -R90), w: 0.5, h: 0.38, dz: 0.012 });
    P(W - 0.2, 2.0, -R90).box('solid', -0.3, 0.9, -0.02, 0.3, 1.32, 0.0, C('#1e1e22'));
    P(9.55, 0.3).box('solid', -0.25, 0, 0, 0.25, 1.3, 0.55, C('#8a8e92')).collide(-0.25, 0, 0.25, 0.55, 1.3);
    P(12.85, 0.3).box('solid', -0.3, 0, 0, 0.3, 0.75, 0.6, C('#2a2e30')).box('solid', -0.05, 0.4, 0.6, 0.05, 0.5, 0.65, C('#c8b070')).collide(-0.3, 0, 0.3, 0.6, 0.75);
    P(11.2, 0).box('wood', -0.5, 1.2, 0, 0.5, 1.95, 0.03, C('#6a4a2a')).panel('cork', -0.46, 1.24, 0.46, 1.91, 0.036);
    P(9.7, 3.4, R90).box('solid', -0.3, 0, 0, 0.3, 0.85, 0.5, C('#e8e4dc')).collide(-0.3, 0, 0.3, 0.5, 0.85);
    F.microwave(P(9.7, 3.4, R90), { x: 0, z: 0.05 });
    F.ceilingLight(P(11.2, 2.0), H, { style: 'dome', power: 0.6 });
    F.plant(P(9.45, 3.7), { kind: 'small', pot: '#e8e4dc' });
    this.officeSpot = this.w(11.4, 2.9);
  }

  /** A shelf "slot": a row of identical products that customers deplete. */
  addSlot(cat, center, axis, length, facing, spacing) {
    this.slots.push({ cat, center, axis, length, facing, spacing, products: [], filled: 0 });
  }

  buildProducts() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const cup = new THREE.CylinderGeometry(0.5, 0.38, 1, 8);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.label.map, color: new THREE.Color(0.95, 0.95, 0.95) });
    const rng = this.rng;
    const specs = [];
    const _m = new THREE.Matrix4();
    for (const slot of this.slots) {
      const pal = PALETTES[slot.cat];
      const col = new THREE.Color(rng.pick(pal));
      let shape;
      let size;
      if (slot.cat === 'drinks') {
        shape = 'cyl';
        size = rng.chance(0.6) ? [0.07, 0.24, 0.07] : [0.066, 0.12, 0.066];
      } else if (slot.cat === 'noodles') {
        shape = rng.chance(0.6) ? 'cup' : 'box';
        size = shape === 'cup' ? [0.12, 0.11, 0.12] : [0.2, 0.06, 0.14];
      } else if (slot.cat === 'household') {
        shape = rng.chance(0.3) ? 'cyl' : 'box';
        size = shape === 'cyl' ? [0.09, 0.22, 0.09] : [0.12, rng.float(0.08, 0.16), 0.06];
      } else {
        shape = 'box';
        size = rng.chance(0.5) ? [0.16, rng.float(0.2, 0.27), 0.07] : [0.14, 0.18, 0.05];
      }
      const step = slot.spacing ?? Math.max(size[0], size[2]) + 0.03;
      const n = Math.max(1, Math.floor(slot.length / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const p = slot.center.clone();
        if (slot.axis === 'z') p.z += t * slot.length;
        else p.x += t * slot.length;
        p.y += size[1] / 2 + 0.002;
        const ry = slot.axis === 'z' ? Math.PI / 2 : 0;
        _m.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(size[0], size[1], size[2]));
        // second row behind the first (stores face up products, but there's always depth)
        specs.push({ slot, shape, matrix: _m.clone(), color: col });
        if (shape !== 'box' || slot.cat === 'noodles') {
          const back = p.clone();
          const off = slot.axis === 'z' ? new THREE.Vector3(-slot.facing * 0.12, 0, 0) : new THREE.Vector3(0, 0, -0.12);
          back.add(off);
          specs.push({ slot, shape, matrix: _m.clone().setPosition(back), color: col.clone().multiplyScalar(0.85), back: true });
        }
      }
    }
    const meshes = {};
    for (const [name, geo] of [
      ['box', box],
      ['cyl', cyl],
      ['cup', cup],
    ]) {
      const list = specs.filter((s) => s.shape === name);
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      m.frustumCulled = false;
      list.forEach((s, i) => {
        m.setMatrixAt(i, s.matrix);
        m.setColorAt(i, s.color);
        s.mesh = m;
        s.index = i;
        s.slot.products.push(s);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      meshes[name] = m;
      this.group.add(m);
    }
    for (const slot of this.slots) {
      // front-row products are taken first, then the ones behind
      slot.products.sort((a, b) => (a.back === b.back ? 0 : a.back ? 1 : -1));
      slot.filled = slot.products.length;
    }
    this.productMeshes = meshes;
    this.ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    // start picked over, like any real shop at 6pm
    for (const slot of this.slots) {
      const take = this.rng.int(Math.floor(slot.products.length * 0.15), Math.floor(slot.products.length * 0.7));
      for (let k = 0; k < take; k++) this.takeFrom(slot);
    }
  }

  setProduct(p, visible) {
    p.mesh.setMatrixAt(p.index, visible ? p.matrix : this.ZERO);
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  takeFrom(slot) {
    if (slot.filled <= 0) return false;
    slot.filled--;
    // take from the front row first: products[0..front-1] are front
    const p = slot.products[slot.filled];
    this.setProduct(p, false);
    return true;
  }

  /** Customer takes up to n items of a category near a point. Returns how many. */
  take(cat, near, n) {
    const cands = this.slots.filter((s) => s.cat === cat && s.filled > 0).sort((a, b) => a.center.distanceTo(near) - b.center.distanceTo(near));
    let got = 0;
    for (const s of cands.slice(0, 3)) {
      while (got < n && this.takeFrom(s)) got++;
      if (got >= n) break;
    }
    return got;
  }

  /** Refill missing products of a category near pos. Returns how many were stocked. */
  restock(cat, pos, max = 16) {
    let n = 0;
    const cands = this.slots.filter((s) => s.cat === cat && s.filled < s.products.length && s.center.distanceTo(pos) < 3.2);
    cands.sort((a, b) => a.center.distanceTo(pos) - b.center.distanceTo(pos));
    for (const s of cands) {
      while (s.filled < s.products.length && n < max) {
        this.setProduct(s.products[s.filled], true);
        s.filled++;
        n++;
      }
    }
    return n;
  }

  stockLevel(cat) {
    let have = 0;
    let all = 0;
    for (const s of this.slots)
      if (s.cat === cat) {
        have += s.filled;
        all += s.products.length;
      }
    return all ? have / all : 1;
  }

  emptyNear(cat, pos) {
    return this.slots.some((s) => s.cat === cat && s.filled < s.products.length && s.center.distanceTo(pos) < 3.2);
  }

  // ==========================================================================
  buildDoors() {
    const mk = () => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      const fr = shade(DARK_GREEN);
      b.box(-0.4, 0, -0.03, 0.4, 0.08, 0.03, { color: fr, bottom: true });
      b.box(-0.4, 2.36, -0.03, 0.4, 2.44, 0.03, { color: fr, bottom: true });
      b.box(-0.4, 0, -0.03, -0.34, 2.44, 0.03, { color: fr });
      b.box(0.34, 0, -0.03, 0.4, 2.44, 0.03, { color: fr });
      b.box(-0.34, 1.0, -0.035, 0.34, 1.06, 0.035, { color: shade('#c8ccd0') });
      g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.68, 2.28),
        new THREE.MeshBasicMaterial({ color: '#a8c8e0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      );
      glass.position.y = 1.22;
      glass.renderOrder = 5;
      g.add(glass);
      this.group.add(g);
      return g;
    };
    this.doorL = mk();
    this.doorR = mk();
    this.doorCenter = this.w(6.7, D + 0.15);
    this.positionDoors();
  }

  positionDoors() {
    const o = this.doorOpen;
    const z = this.origin.z + D + 0.08;
    this.doorL.position.set(this.origin.x + 6.3 - o * 0.76, this.origin.y, z);
    this.doorR.position.set(this.origin.x + 7.1 + o * 0.76, this.origin.y, z);
  }

  buildExterior(cityTex) {
    const o = this.origin;
    // illuminated sign box across the front
    const signTex = textCanvas(256, 32, (g) => {
      g.fillStyle = '#f4f2ea';
      g.fillRect(0, 0, 256, 32);
      g.fillStyle = '#2e6a46';
      g.fillRect(0, 0, 256, 6);
      g.fillStyle = '#f08a1a';
      g.fillRect(0, 26, 256, 6);
      label(g, 'HALCYON 24', 104, 16.5, 17, '#2e6a46');
      g.fillStyle = '#f08a1a';
      g.beginPath();
      g.arc(214, 16, 10, 0, Math.PI * 2);
      g.fill();
      label(g, '24', 214, 16.5, 11, '#ffffff');
    });
    this.signMat = new THREE.MeshLambertMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color('#ffffff') });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.72, 0.28), [
      new THREE.MeshLambertMaterial({ color: '#24402e' }),
      new THREE.MeshLambertMaterial({ color: '#24402e' }),
      new THREE.MeshLambertMaterial({ color: '#24402e' }),
      new THREE.MeshLambertMaterial({ color: '#24402e' }),
      this.signMat,
      new THREE.MeshLambertMaterial({ color: '#24402e' }),
    ]);
    sign.position.set(o.x + W / 2, o.y + 3.52, o.z + D + 0.3 + 0.14);
    this.scene.add(sign);

    // window posters, OPEN neon, help wanted
    const posters = textCanvas(256, 64, (g) => {
      const card = (x, bg, lines) => {
        g.fillStyle = bg;
        g.fillRect(x + 2, 2, 60, 60);
        lines.forEach(([t, y, s, c]) => label(g, t, x + 32, y, s, c));
      };
      card(0, '#c82a2a', [
        ['HOT', 18, 14, '#ffe08a'],
        ['DOGS', 33, 14, '#ffe08a'],
        ['$1.99', 50, 12, '#ffffff'],
      ]);
      card(64, '#f0c030', [
        ['COLA', 18, 13, '#c82a2a'],
        ['2 FOR', 34, 12, '#1e1e22'],
        ['$3', 50, 15, '#c82a2a'],
      ]);
      card(128, '#f4f2ea', [
        ['HELP', 16, 14, '#c82a2a'],
        ['WANTED', 32, 11, '#c82a2a'],
        ['ask inside', 50, 8, '#1e1e22'],
      ]);
      card(192, '#2a6ae0', [
        ['ICE', 22, 16, '#ffffff'],
        ['COLD', 42, 11, '#d8f0ff'],
      ]);
    });
    const posterMat = new THREE.MeshLambertMaterial({ map: posters, transparent: true, side: THREE.DoubleSide });
    const poster = (idx, x, y, s = 0.55) => {
      const g = new THREE.PlaneGeometry(s, s);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (idx + uv.getX(i)) / 4);
      const m = new THREE.Mesh(g, posterMat);
      m.position.set(o.x + x, o.y + y, o.z + D + 0.2);
      this.scene.add(m);
      return m;
    };
    poster(0, 1.2, 1.9);
    poster(1, 4.6, 1.95);
    poster(3, 12.3, 1.9);
    this.helpWanted = poster(2, 8.6, 1.6, 0.6);
    const neonTex = textCanvas(128, 32, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 32);
      g.shadowColor = '#ff3a5a';
      g.shadowBlur = 6;
      g.strokeStyle = '#ff5a7a';
      g.lineWidth = 2;
      g.strokeRect(4, 4, 120, 24);
      label(g, 'OPEN 24 HRS', 64, 17, 14, '#ff6a8a');
    });
    this.neonMat = new THREE.MeshBasicMaterial({ map: neonTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), this.neonMat);
    // in front of the window mullions (which sit 0.12-0.19 into the wall), not level with them
    neon.position.set(o.x + 10.9, o.y + 2.25, o.z + D + 0.23);
    this.scene.add(neon);

    // light spilling onto the sidewalk
    this.spillMat = additive({ map: cityTex.glow, color: new THREE.Color('#dff8ea'), opacity: 0.4 });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(13, CITY.SIDEWALK - 0.1).rotateX(-Math.PI / 2), this.spillMat);
    spill.position.set(o.x + W / 2, CITY.CURB + 0.03, this.site.z1 + CITY.SIDEWALK / 2);
    spill.renderOrder = 2;
    this.scene.add(spill);

    // dumpster beside the shop (in front of next door), for the trash run
    const db = new GeoBuilder();
    const dg = shade('#2a5a3a');
    db.box(-0.95, 0.15, -0.5, 0.95, 1.2, 0.5, { color: dg });
    db.box(-1.0, 1.2, -0.55, 1.0, 1.28, 0.55, { color: shade('#1e3a28'), bottom: true });
    for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) db.box(x - 0.06, 0, z - 0.06, x + 0.06, 0.15, z + 0.06, { color: shade('#1e1e1e') });
    const dumpster = new THREE.Mesh(db.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const dpos = this.w(-1.4, D + 0.3 + 0.75);
    dumpster.position.set(dpos.x, CITY.CURB, dpos.z);
    this.scene.add(dumpster);
    this.city.colliders.add(dpos.x - 1.0, dpos.z - 0.55, dpos.x + 1.0, dpos.z + 0.55, 0, 1.3);
    this.dumpsterSpot = new THREE.Vector3(dpos.x + 1.35, CITY.CURB, dpos.z + 0.4);

    // a yellow job marker over the door
    this.markerMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', fog: false });
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.markerMat);
    this.marker.scale.set(1, 1.5, 1);
    this.marker.position.copy(this.w(6.7, D + 1.0, 4.4));
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.marker.add(new THREE.Points(mg, additive({ map: cityTex.glow, color: new THREE.Color('#ffd24a'), size: 3, points: true, fog: false })));
    this.scene.add(this.marker);

    // street-side door spots used by customers
    this.outsideSpot = this.w(6.7, D + 1.6);
    this.insideSpot = this.w(6.7, D - 1.2);
  }

  buildDynamic(cityTex) {
    // spill puddle + wet floor sign
    this.spill = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7a4a1e', transparent: true, opacity: 0.65, depthWrite: false }),
    );
    this.spill.visible = false;
    this.spill.renderOrder = 1;
    this.group.add(this.spill);
    const wf = new GeoBuilder();
    const y = shade('#f0c020');
    wf.quad2([-0.22, 0, 0.18], [0.22, 0, 0.18], [0.18, 0.62, 0], [-0.18, 0.62, 0], [0, 0.3, 1], [0, 0, 1, 1], y);
    wf.quad2([0.22, 0, -0.18], [-0.22, 0, -0.18], [-0.18, 0.62, 0], [0.18, 0.62, 0], [0, 0.3, -1], [0, 0, 1, 1], y);
    this.wetSign = new THREE.Mesh(wf.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.wetSign.visible = false;
    this.group.add(this.wetSign);
    // trash bag poking out of the bin
    this.binBag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshLambertMaterial({ color: '#2a2a2e' }));
    this.binBag.position.copy(this.binSpot).setY(this.origin.y + 0.85);
    this.group.add(this.binBag);
    // carried things: a case, the mop, a trash bag
    const cs = new GeoBuilder();
    cs.box(-0.25, -0.17, -0.18, 0.25, 0.17, 0.18, { color: shade('#b08a5a'), bottom: true });
    cs.box(-0.255, -0.03, -0.12, 0.255, 0.07, 0.12, { color: [1, 1, 1] });
    this.carryCase = new THREE.Mesh(cs.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const mp = new GeoBuilder();
    mp.box(-0.015, -0.6, -0.015, 0.015, 1.0, 0.015, { color: shade('#c8ccd0') });
    mp.box(-0.18, -0.75, -0.06, 0.18, -0.6, 0.06, { color: shade('#e8e0c8') });
    this.carryMop = new THREE.Mesh(mp.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.carryBag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshLambertMaterial({ color: '#2a2a2e' }));
    this.carryBag.scale.set(1, 1.25, 1);
    for (const m of [this.carryCase, this.carryMop, this.carryBag]) {
      m.visible = false;
      this.scene.add(m);
    }
    // a mop leaning in the janitor corner when it's not in use
    this.mopRest = this.carryMop.clone();
    this.mopRest.position.copy(this.mopHome.x).setY(this.origin.y + 0.75);
    this.mopRest.rotation.z = 0.15;
    this.mopRest.visible = true;
    this.group.add(this.mopRest);
    this.trash = 0.4;
  }

  buildCCTV() {
    this.cctvRT = new THREE.WebGLRenderTarget(160, 120, { depthBuffer: true });
    this.cctvCam = new THREE.PerspectiveCamera(78, 4 / 3, 0.1, 60);
    this.cctvCam.position.copy(this.w(0.55, D - 0.45, 2.75));
    this.cctvCam.lookAt(this.w(9.5, 6.0, 0.4));
    this.cctvMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.cctvRT.texture }, time: { value: 0 } },
      vertexShader: CCTV_VERT,
      fragmentShader: CCTV_FRAG,
    });
    this.monitors = [];
    for (const s of this.monitorSpots) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), this.cctvMat);
      this.monitors.push(m);
      m.applyMatrix4(s.m);
      m.translateZ(s.dz);
      this.group.add(m);
    }
    this.cctvTick = 0;
  }

  renderCCTV(renderer, scene) {
    // the monitors can't show themselves (that would read and write the same texture)
    for (const m of this.monitors) m.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.cctvRT);
    renderer.render(scene, this.cctvCam);
    renderer.setRenderTarget(prev);
    for (const m of this.monitors) m.visible = true;
  }

  // ==========================================================================
  /** people: positions of everyone who can trigger the automatic doors */
  update(dt, time, env, people, camera) {
    const near = camera.position.distanceTo(this.doorCenter) < 170;
    this.group.visible = near;
    // the shop is lit day and night; daylight still comes in the windows
    const u = this.uniforms;
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.35).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.08));
    this.kit.glowMat.color.setScalar(1.5);
    this.signMat.emissiveIntensity = 0.35 + env.night * 1.3;
    this.neonMat.opacity = 0.5 + env.night * 0.5 * (Math.sin(time * 11) > -0.95 ? 1 : 0.2);
    this.spillMat.opacity = env.night * 0.45;
    this.marker.rotation.y = time * 1.2;
    this.marker.position.y = this.origin.y + 4.4 + Math.sin(time * 2) * 0.15;
    this.cctvMat.uniforms.time.value = time;

    let want = 0;
    for (const p of people) if (Math.hypot(p.x - this.doorCenter.x, p.z - this.doorCenter.z) < 2.4) want = 1;
    const before = this.doorOpen;
    this.doorOpen = damp(this.doorOpen, want, want ? 7 : 4, dt);
    if (before < 0.05 && this.doorOpen >= 0.05 && want) this.onChime?.();
    this.positionDoors();

    this.binBag.scale.setScalar(0.4 + this.trash * 0.7);
    this.binBag.position.y = this.origin.y + 0.55 + this.trash * 0.35;
  }

  showSpill(pos) {
    if (!pos) {
      this.spill.visible = false;
      return;
    }
    this.spill.position.set(pos.x, this.origin.y + 0.012, pos.z);
    this.spill.visible = true;
  }

  showWetSign(pos) {
    this.wetSign.visible = !!pos;
    if (pos) this.wetSign.position.set(pos.x + 0.7, this.origin.y, pos.z + 0.3);
  }
}

function xz(v) {
  return { x: v.x, z: v.z };
}
