import * as THREE from 'three';
import { CITY } from '../config.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { damp, smoothstep } from '../core/rng.js';
import { InteriorKit, C, F } from './interior/kit.js';
import { makeInteriorUniforms, makeFxUniforms } from './interior/bake.js';
import { createCrownTextures, csignUV } from '../render/crownTextures.js';
import { additive } from '../render/materials.js';

// THE CROWN: a members' club on the roof of the Meridian tower, 58 m over Downtown,
// and ORRERY, the glass restaurant pavilion up there. You get up in the lift from a
// lobby door at the foot of the tower (a fade); the roof is part of the outdoor
// space, so the city lights are really down there.
//
//   x 0                                22    (local metres from the tower's
//   ┌───────────────────────┬────┬──────┐ z 0   north-west corner; z 18 is
//   │ ORRERY (glass)         │ DJ │ LIFT │       the street side)
//   │  six tables · the pass │    │      │
//   │  the orrery overhead   ├────┤ BAR  │
//   ├────[door]──────────────┘    │      │ z 7.4
//   │ fire pit    fire pit   cabana│cabana│
//   │ loungers · umbrellas         │      │ z 12.4
//   │ ≈≈≈≈≈≈≈≈ infinity pool ≈≈≈≈≈≈≈≈≈≈≈≈ │ z 14.2
//   └─────────────────────────────────────┘ z 18 (the edge)
//
// THE CROWN is open 10 AM to 2 AM; ORRERY serves 7 to 11 PM.

const W = 22;
const D = 18;
const H = 3.6; // the pavilion's ceiling; the deck has no roof
const R90 = Math.PI / 2;
const PI = Math.PI;
const PAV = { x0: 0.35, z0: 0.35, x1: 12.6, z1: 7.4 };
const POOL = { x0: 0.8, z0: 14.2, x1: 21.2, z1: 17.8, depth: 1.05 };
const STEPS = [
  [0.8, 1.25, -0.3],
  [1.25, 1.7, -0.6],
  [1.7, 2.15, -0.85],
];
const PAV_DOOR = [3.3, 4.7];
export const crownOpen = (h) => h >= 10 || h < 2;
export const orreryOpen = (h) => h >= 19 && h < 23;

export class Crown {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.apartmentSites.penthouse;
    this.site = site;
    this.top = site.top;
    this.DECK = site.top + 1.15;
    this.origin = new THREE.Vector3(site.x0, this.DECK, site.z0);
    this.W = W;
    this.D = D;
    this.H = H;
    this.cityTex = cityTex;
    this.ct = createCrownTextures();
    this.group = new THREE.Group();
    this.outside = new THREE.Group();
    scene.add(this.group, this.outside);
    this.uniforms = { ...makeInteriorUniforms(), ...makeFxUniforms() };
    this.tex = { ...interiorTex, ...this.ct.kit };
    this.open = true;

    this.seats = []; // loungers, daybeds, fire-pit sofas, bar stools: { x, z, y, yaw, seatH, out, kind }
    this.tables = []; // ORRERY: { k, seats: [seat, seat], plate: {x, y, z} }
    this.staffSpots = {};
    this.poolSpots = []; // where members stand in the water
    this.standSpots = []; // where members stand about with a drink

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildDeck(kit);
    this.buildPavilion(kit);
    kit.build(this.group, {}, { fog: true });
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.buildLive();
    this.buildShell();
    this.buildLobby();
  }

  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  local(p) {
    return { x: p.x - this.origin.x, z: p.z - this.origin.z, y: p.y - this.origin.y };
  }

  /** Up on the roof (anywhere on the deck, in the pool or in ORRERY)? */
  onRoof(p) {
    const { x, z, y } = this.local(p);
    return y > -3 && x > -0.5 && x < W + 0.5 && z > -0.5 && z < D + 0.5;
  }

  inPavilion(p) {
    const { x, z, y } = this.local(p);
    return y > -1 && x > PAV.x0 && x < PAV.x1 && z > PAV.z0 && z < PAV.z1;
  }

  inPool(p) {
    const { x, z, y } = this.local(p);
    return y < -0.2 && y > -2 && x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1;
  }

  /** The player's ground: the deck, the pool's steps and floor. (Chained into the city's ground.) */
  groundAt(wx, wz, yHint, base) {
    const x = wx - this.origin.x;
    const z = wz - this.origin.z;
    if (x < -0.4 || x > W + 0.4 || z < -0.4 || z > D + 0.4) return base;
    if (yHint < this.DECK - 3) return base; // (down on the street)
    if (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1) {
      for (const [a, b, h] of STEPS) if (x >= a && x < b) return this.DECK + h;
      return this.DECK - POOL.depth;
    }
    const J = this.djDeck;
    if (x > J.x0 && x < J.x1 && z > J.z0 && z < J.z1) return this.DECK + 0.2;
    return this.DECK;
  }

  /** Camera ceiling: low inside ORRERY, open sky on the deck. */
  ceilingAt(p) {
    return this.inPavilion(p) ? this.DECK + H - 0.25 : Infinity;
  }

  // ==========================================================================
  buildDeck(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const deck = { floor: 'woodOak', floorColor: '#a07e5a', noCeil: true, sky: 0.8, zone: 'deck', base: '#2a2a2e', trim: '#2a2a2e' };
    kit.room('deckN', PAV.x1, 0, W, PAV.z1, deck);
    kit.room('deckM', 0, PAV.z1, W, POOL.z0, deck);
    kit.room('deckW', 0, POOL.z0, POOL.x0, D, deck);
    kit.room('deckE', POOL.x1, POOL.z0, W, D, deck);
    kit.room('pool', POOL.x0, POOL.z0, POOL.x1, D, { ...deck, noFloor: true });
    // the strips outside the pavilion's walls
    kit.room('ledgeN', 0, 0, PAV.x1, PAV.z0, deck);
    kit.room('ledgeW', 0, PAV.z0, PAV.x0, PAV.z1, deck);

    // ---------------------------------------------------------------- the pool: basin, steps, glass edge
    const tile = C('#7ac8d8');
    const B = P(0, 0, 0, -POOL.depth);
    B.box('wallTile', POOL.x0, -0.02, POOL.z0, POOL.x1, 0, POOL.z1, tile); // floor
    B.box('wallTile', POOL.x0 - 0.15, 0, POOL.z0 - 0.15, POOL.x1 + 0.15, POOL.depth, POOL.z0, tile); // north wall (inner face)
    B.box('wallTile', POOL.x0 - 0.15, 0, POOL.z0, POOL.x0, POOL.depth, POOL.z1, tile);
    B.box('wallTile', POOL.x1, 0, POOL.z0, POOL.x1 + 0.15, POOL.depth, POOL.z1, tile);
    for (const [a, b, h] of STEPS) B.box('wallTile', a, 0, POOL.z0, b, POOL.depth + h, POOL.z1, C('#e8f4f6'));
    // a stone coping round the edge, its lip 3 cm out over the water (never flush with the tiles)
    P(0, 0).box('marble', POOL.x0 - 0.3, -0.04, POOL.z0 - 0.3, POOL.x1 + 0.3, 0.025, POOL.z0 + 0.03, C('#e8e4dc'), { bottom: true });
    P(0, 0).box('marble', POOL.x0 - 0.3, -0.04, POOL.z0 + 0.03, POOL.x0 + 0.03, 0.025, POOL.z1, C('#e8e4dc'), { bottom: true });
    P(0, 0).box('marble', POOL.x1 - 0.03, -0.04, POOL.z0 + 0.03, POOL.x1 + 0.3, 0.025, POOL.z1, C('#e8e4dc'), { bottom: true });
    // the infinity edge: the water runs to a weir, then a trough, then a low glass screen at the very edge
    B.box('solid', POOL.x0 - 0.15, 0, POOL.z1, POOL.x1 + 0.15, POOL.depth - 0.14, POOL.z1 + 0.06, C('#2a3a44'));
    B.box('solid', POOL.x0 - 0.15, 0, POOL.z1 + 0.06, POOL.x1 + 0.15, POOL.depth - 0.4, D - 0.02, C('#1a2a34'));
    P(0, D - 0.06).box('glass', POOL.x0 - 0.15, -0.4, -0.02, POOL.x1 + 0.15, 0.25, 0.0);
    // underwater lights (fx channel 1 shimmers them) and a NO DIVING sign
    for (let x = 3; x < POOL.x1; x += 3.5) {
      B.geo('glow', new THREE.CylinderGeometry(0.1, 0.1, 0.01, 10), x, 0.45, POOL.z0 + 0.006, C('#a8f4ff'), 0, 1, 1, 1, R90);
      P(x, POOL.z0 + 1.6, 0, -0.6).fxLight(0, 0, 0, 1, 1.1, { fall: 0.35 });
    }
    P(POOL.x0 - 0.4, POOL.z0 - 0.3, R90).box('solid', -0.3, 0, -0.03, 0.3, 0.55, 0.0, C('#2a2a2e'));
    P(POOL.x0 - 0.4, POOL.z0 - 0.3, R90).panel('cSigns', -0.28, 0.27, 0.28, 0.53, 0.006, csignUV('pool'));
    // walls you can't climb out of (except up the steps) and the edge you can't swim off
    const PB = P(0, 0, 0, -POOL.depth - 0.05);
    PB.collide(STEPS[STEPS.length - 1][1], POOL.z0 - 0.2, POOL.x1 + 0.2, POOL.z0, POOL.depth);
    PB.collide(POOL.x1, POOL.z0, POOL.x1 + 0.2, POOL.z1, POOL.depth);
    P(0, 0, 0, -POOL.depth - 0.05).collide(POOL.x0, POOL.z1, POOL.x1, D, POOL.depth + 1.3);
    // spots to stand about in the water
    for (const [x, z] of [
      [4.2, 15.6],
      [5.0, 16.4],
      [9.5, 15.2],
      [13.6, 16.6],
      [14.4, 15.8],
      [18.8, 16.2],
    ])
      this.poolSpots.push({ ...xz(this.w(x, z)), y: this.DECK - POOL.depth, yaw: Math.atan2(0, 1) + (x % 2 ? 0.4 : -0.6) });

    // ---------------------------------------------------------------- glass balustrade round the deck
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const r = Math.atan2(x1 - x0, z1 - z0) - R90;
      const Pr = P(x0, z0, r);
      Pr.box('glass', 0, 0.05, -0.012, len, 1.05, 0.012);
      Pr.box('solid', 0, 1.05, -0.03, len, 1.1, 0.03, C('#c8ccd0'));
      for (let a = 0; a <= len + 0.01; a += Math.max(1.2, len / Math.ceil(len / 1.6))) Pr.box('solid', Math.min(a, len) - 0.025, 0, -0.025, Math.min(a, len) + 0.025, 1.05, 0.025, C('#c8ccd0'));
      Pr.collide(0, -0.1, len, 0.1, 1.15);
    };
    rail(0.05, PAV.z1, 0.05, D - 0.05); // west
    rail(0.05, D - 0.05, POOL.x0, D - 0.05);
    rail(POOL.x1, D - 0.05, W - 0.05, D - 0.05);
    rail(W - 0.05, D - 0.05, W - 0.05, 3.4); // east
    rail(PAV.x1, 0.05, 18.6, 0.05); // north, between the pavilion and the lift
    rail(0.05, 0.05, PAV.x1, 0.05); // and outside the pavilion's glass
    rail(0.05, 0.05, 0.05, PAV.z1);

    // ---------------------------------------------------------------- the lift kiosk
    const L = P(18.7, 0.3);
    L.box('solid', 0, 0, 0, 3.0, 3.0, 3.0, C('#1e1e22'));
    L.box('solid', -0.05, 3.0, -0.05, 3.05, 3.12, 3.05, C('#d8b46a'));
    L.box('solid', 0.7, 0, 3.0, 2.3, 2.5, 3.04, C('#b8a070')); // brass lift doors
    L.box('solid', 1.49, 0.02, 3.04, 1.51, 2.45, 3.05, C('#2a2a2e'));
    L.panel('cSigns', 0.25, 2.58, 2.75, 2.95, 3.006, csignUV('crown'));
    L.geo('glow', new THREE.CylinderGeometry(0.04, 0.04, 0.01, 8), 2.55, 1.2, 3.006, C('#ffd890'), 0, 1, 1, 1, R90);
    L.collide(0, 0, 3.0, 3.06, 3.2);
    this.liftSpot = this.w(20.2, 3.95);
    this.liftArrive = { ...xz(this.w(20.2, 4.2)), yaw: 0 };
    P(20.2, 3.6).box('solid', -1.0, 0, -0.3, 1.0, 0.012, 0.3, C('#16140f'));
    P(20.2, 3.6).quad('cSigns', [-0.4, 0.018, 0.25], [0.4, 0.018, 0.25], [0.4, 0.018, -0.25], [-0.4, 0.018, -0.25], [0, 1, 0], csignUV('floor'));
    this.staffSpots.host = { ...xz(this.w(18.2, 3.8)), y: this.DECK, yaw: R90 * 0.6 };

    // ---------------------------------------------------------------- the bar (east side)
    const bar = P(19.0, 4.8);
    bar.box('solid', 0, 0, 0, 0.62, 1.08, 4.8, C('#1a1a1e'));
    bar.box('marble', -0.06, 1.08, -0.04, 0.68, 1.13, 4.84, C('#f2efe8'), { bottom: true });
    bar.box('glow', -0.006, 0.08, 0.1, 0, 0.12, 4.7, C('#ffcf7a'));
    bar.collide(-0.06, -0.04, 0.68, 4.84, 1.15).shadow(0, 0, 0.62, 4.8, 0.45);
    const bb = P(21.1, 4.8);
    bb.box('wood', 0, 0, 0, 0.6, 0.95, 4.8, C('#2a2018'));
    bb.box('marble', -0.02, 0.95, -0.02, 0.62, 0.99, 4.82, C('#f2efe8'));
    const bottles = ['#3a6a3a', '#c8a050', '#7a1a1a', '#e8e8f0', '#5a3a1a', '#2a4a6a', '#d8b46a'];
    for (let k = 0; k < 18; k++) bb.geo('solid', new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8), 0.3 + ((k % 2) - 0.5) * 0.18, 1.14, 0.3 + k * 0.24, C(bottles[k % bottles.length]));
    bb.box('glow', -0.006, 0.9, 0.1, 0, 0.94, 4.7, C('#ffcf7a')); // a warm strip on the bartender's side
    bb.collide(0, 0, 0.62, 4.82, 1.1);
    P(21.88, 7.2, -R90).box('solid', -1.25, 1.2, -0.02, 1.25, 1.9, 0.0, C('#121214'));
    P(21.88, 7.2, -R90).panel('cSigns', -1.2, 1.25, 1.2, 1.85, 0.006, csignUV('bar'));
    for (let k = 0; k < 5; k++) {
      const z = 5.4 + k * 0.9;
      const S = P(18.45, z);
      S.geo('solid', new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), 0, 0.76, 0, C('#d8b46a'));
      S.geo('solid', new THREE.CylinderGeometry(0.025, 0.025, 0.74, 6), 0, 0.38, 0, C('#2a2a2e'));
      S.geo('solid', new THREE.CylinderGeometry(0.18, 0.18, 0.02, 10), 0, 0.01, 0, C('#2a2a2e'));
      S.collide(-0.2, -0.2, 0.2, 0.2, 0.8);
      this.seats.push({ ...xz(this.w(18.45, z)), y: this.DECK, yaw: R90, seatH: 0.79, out: xz(this.w(17.6, z)), kind: 'bar' });
    }
    this.barSpot = this.w(18.2, 7.2);
    this.staffSpots.bar = { ...xz(this.w(20.5, 7.0)), y: this.DECK, yaw: -R90 };

    // ---------------------------------------------------------------- the DJ corner (between ORRERY and the lift)
    const dj = P(13.0, 0.4);
    dj.box('wood', 0, 0, 0, 5.4, 0.2, 2.8, C('#2a2a2e'));
    dj.box('solid', 1.0, 0.2, 1.5, 3.2, 1.1, 2.1, C('#16161a'));
    dj.box('solid', 0.98, 1.1, 1.48, 3.22, 1.14, 2.12, C('#d8b46a'));
    for (const x of [1.5, 2.7]) dj.geo('solid', new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16), x, 1.15, 1.8, C('#3a3a40'));
    dj.box('glow', 1.96, 1.14, 1.62, 2.24, 1.15, 1.98, C('#ff6aa0'));
    for (const x of [0.2, 4.6]) {
      dj.box('solid', x, 0.2, 0.3, x + 0.6, 1.6, 0.9, C('#1a1a1e'));
      dj.geo('solid', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), x + 0.3, 1.1, 0.905, C('#3a3a40'), 0, 1, 1, 1, R90);
      dj.geo('solid', new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), x + 0.3, 0.55, 0.905, C('#3a3a40'), 0, 1, 1, 1, R90);
    }
    dj.collide(0.9, 1.4, 3.3, 2.2, 1.2).collide(0.2, 0.3, 0.8, 0.9, 1.6).collide(4.6, 0.3, 5.2, 0.9, 1.6);
    P(13.0 + 2.1, 0.08).panel('cSigns', -1.6, 1.9, 1.6, 2.7, 0.006, csignUV('sunset'));
    P(13.0 + 2.1, 0.08).box('solid', -1.65, 1.86, -0.03, 1.65, 2.74, 0, C('#0a0a10'));
    P(15.1, 1.2).fxLight(0, 1.6, 0.8, 2, 1.0, { fall: 0.3 });
    this.staffSpots.dj = { ...xz(this.w(15.1, 1.25)), y: this.DECK + 0.2, yaw: 0 };
    this.djDeck = { x0: 13.0, x1: 18.4, z0: 0.4, z1: 3.2 }; // (the platform: the DJ stands 0.2 up)

    // ---------------------------------------------------------------- fire pits with sofas
    this.pits = [];
    for (const px of [3.6, 9.4]) {
      const pz = 10.2;
      const Pp = P(px, pz);
      Pp.geo('marble', new THREE.CylinderGeometry(0.62, 0.7, 0.42, 20, 1, true), 0, 0.21, 0, C('#8a8a86'));
      Pp.geo('marble', new THREE.RingGeometry(0.42, 0.62, 20).rotateX(-R90), 0, 0.42, 0, C('#a8a8a4'));
      Pp.geo('solid', new THREE.CylinderGeometry(0.42, 0.42, 0.02, 16), 0, 0.3, 0, C('#2a2420'));
      Pp.geo('glow', new THREE.CylinderGeometry(0.3, 0.3, 0.01, 12), 0, 0.32, 0, C('#ff8a3a'));
      Pp.collide(-0.7, -0.7, 0.7, 0.7, 0.45).shadow(-0.6, -0.6, 0.6, 0.6, 0.3);
      Pp.fxLight(0, 0.7, 0, 0, 1.6, { fall: 0.45 });
      this.pits.push(this.w(px, pz, 0.35));
      for (const [dx, r] of [
        [-2.0, R90],
        [2.0, -R90],
      ]) {
        const S = P(px + dx, pz, r);
        F.sofa(S, { w: 1.8, col: '#e8e0d0', style: 'modern', accent: dx < 0 ? '#c86a3a' : '#3a6a8a' });
        for (const sx of [-0.45, 0.45]) {
          const p = S.point(sx, 0, 0.55);
          const o = S.point(sx, 0, 1.25);
          this.seats.push({ x: p.x, z: p.z, y: this.DECK, yaw: r, seatH: 0.43, out: { x: o.x, z: o.z }, kind: 'pit' });
        }
      }
    }

    // ---------------------------------------------------------------- loungers and umbrellas along the pool
    for (const x of [2.7, 4.0, 5.3, 7.5, 8.8, 10.1, 11.4]) {
      const Lp = P(x, 12.4);
      Lp.box('wood', -0.33, 0.12, 0.0, 0.33, 0.28, 1.6, C('#8a6a4a'));
      Lp.box('fabric', -0.3, 0.28, 0.45, 0.3, 0.36, 1.58, C('#f2efe8'));
      Lp.geo('fabric', new THREE.BoxGeometry(0.6, 0.08, 0.6), 0, 0.5, 0.24, C('#f2efe8'), 0, 1, 1, 1, -0.75);
      for (const [lx, lz] of [
        [-0.3, 0.05],
        [0.27, 0.05],
        [-0.3, 1.52],
        [0.27, 1.52],
      ])
        Lp.box('solid', lx, 0, lz, lx + 0.03, 0.12, lz + 0.03, C('#5a4a3a'));
      Lp.collide(-0.34, 0, 0.34, 1.6, 0.6).shadow(-0.34, 0, 0.34, 1.6, 0.4);
      const p = Lp.point(0, 0, 0.75);
      const o = Lp.point(0.75, 0, 0.75);
      const ap = Lp.point(0.75, 0, -0.5); // walk down the gap between loungers, not over them
      this.seats.push({ x: p.x, z: p.z, y: this.DECK, yaw: 0, seatH: 0.36, out: { x: o.x, z: o.z }, approach: { x: ap.x, z: ap.z }, kind: 'lounger' });
    }
    for (const x of [6.4, 12.6]) {
      const U = P(x, 13.2);
      U.box('solid', -0.025, 0, -0.025, 0.025, 2.4, 0.025, C('#e8e4dc'));
      U.geo('fabric', new THREE.ConeGeometry(1.4, 0.5, 8, 1, true), 0, 2.45, 0, C('#f2efe8'));
      U.geo('solid', new THREE.CylinderGeometry(0.22, 0.25, 0.08, 10), 0, 0.04, 0, C('#8a8a86'));
      U.collide(-0.2, -0.2, 0.2, 0.2, 2.2);
    }

    // ---------------------------------------------------------------- two cabanas
    this.cabanas = [];
    for (const [cx, cz, w, d] of [
      [14.5, 10.8, 3.6, 3.2],
      [19.3, 11.9, 3.6, 3.0],
    ]) {
      const Cb = P(cx, cz);
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        Cb.box('solid', sx * (w / 2) - 0.05, 0, sz * (d / 2) - 0.05, sx * (w / 2) + 0.05, 2.5, sz * (d / 2) + 0.05, C('#f2efe8'));
        Cb.collide(sx * (w / 2) - 0.12, sz * (d / 2) - 0.12, sx * (w / 2) + 0.12, sz * (d / 2) + 0.12, 2.5);
      }
      Cb.box('fabric', -w / 2 - 0.1, 2.5, -d / 2 - 0.1, w / 2 + 0.1, 2.58, d / 2 + 0.1, C('#f4f0e8'), { bottom: true });
      Cb.box('fabric', -w / 2 - 0.1, 2.3, d / 2 + 0.1, w / 2 + 0.1, 2.5, d / 2 + 0.12, C('#f4f0e8'));
      // curtains: the back, and gathered at the front posts
      Cb.box('fabric', -w / 2 + 0.06, 0.05, -d / 2 + 0.02, w / 2 - 0.06, 2.48, -d / 2 + 0.05, C('#ece6da'));
      for (const sx of [-1, 1]) {
        // gathered at the front posts, and drawn along the first metre of each side
        const [a0, a1] = sx < 0 ? [-w / 2 + 0.06, -w / 2 + 0.36] : [w / 2 - 0.36, w / 2 - 0.06];
        Cb.box('fabric', a0, 0.05, d / 2 - 0.25, a1, 2.48, d / 2 - 0.12, C('#ece6da'));
        const [b0, b1] = sx < 0 ? [-w / 2 + 0.02, -w / 2 + 0.05] : [w / 2 - 0.05, w / 2 - 0.02];
        Cb.box('fabric', b0, 0.05, -d / 2 + 0.07, b1, 2.48, -d / 2 + 1.0, C('#ece6da'));
      }
      Cb.collide(-w / 2, -d / 2, w / 2, -d / 2 + 0.1, 2.5);
      // the daybed
      Cb.box('wood', -1.2, 0.05, -0.9, 1.2, 0.32, 0.7, C('#5a4a3a'));
      Cb.box('fabric', -1.15, 0.32, -0.85, 1.15, 0.48, 0.65, C('#f6f4ee'));
      for (const x of [-0.8, -0.25, 0.3, 0.85]) Cb.geo('fabric', new THREE.BoxGeometry(0.45, 0.4, 0.12), x, 0.66, -0.72, C(x < 0 ? '#c86a3a' : '#e8dcc0'), 0, 1, 1, 1, -0.2);
      Cb.collide(-1.2, -0.9, 1.2, 0.7, 0.5).shadow(-1.3, -1.0, 1.3, 0.8, 0.5);
      // a little table with an ice bucket, and a lantern hanging from the canopy
      Cb.box('wood', 1.35, 0, 0.0, 1.65, 0.5, 0.3, C('#5a4a3a'));
      Cb.geo('solid', new THREE.CylinderGeometry(0.1, 0.08, 0.2, 10), 1.5, 0.6, 0.15, C('#c8ccd0'));
      Cb.geo('glow', new THREE.IcosahedronGeometry(0.1, 0), 0, 2.15, 0, C('#ffd08a'));
      Cb.light(0, 2.0, 0, '#ffc880', 0.35);
      const seatsHere = [];
      for (const x of [-0.5, 0.5]) {
        const p = Cb.point(x, 0, -0.1);
        const o = Cb.point(x, 0, 1.4);
        const s = { x: p.x, z: p.z, y: this.DECK, yaw: 0, seatH: 0.48, out: { x: o.x, z: o.z }, kind: 'cabana', cabana: this.cabanas.length };
        this.seats.push(s);
        seatsHere.push(s);
      }
      this.cabanas.push({ k: this.cabanas.length, at: this.w(cx, cz + d / 2 + 0.6), seats: seatsHere });
    }

    // ---------------------------------------------------------------- string lights over the deck
    const posts = {
      a: [0.15, PAV.z1 + 0.15],
      b: [PAV.x1 + 0.1, PAV.z1 + 0.15],
      c: [W - 0.15, 3.6],
      d: [W - 0.15, POOL.z0 - 0.35],
      e: [0.15, POOL.z0 - 0.35],
    };
    for (const [x, z] of Object.values(posts)) {
      P(x, z).box('solid', -0.04, 0, -0.04, 0.04, 3.3, 0.04, C('#2a2a2e'));
      P(x, z).collide(-0.1, -0.1, 0.1, 0.1, 3.3);
    }
    const lines = [
      ['a', 'b'],
      ['b', 'c'],
      ['b', 'd'],
      ['e', 'b'],
      ['e', 'd'],
    ];
    this.bulbs = [];
    for (const [p, q] of lines) {
      const [x0, z0] = posts[p];
      const [x1, z1] = posts[q];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(4, Math.round(len / 0.75));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const y = 3.25 - Math.sin(t * PI) * 0.55;
        P(x, z).geo('glow', new THREE.IcosahedronGeometry(0.05, 0), 0, y - 0.06, 0, C('#ffe0a0'));
        this.bulbs.push(this.w(x, z, y - 0.06));
        if (i % 4 === 2) P(x, z).light(0, y - 0.2, 0, '#ffd08a', 0.3, true);
        if (i < n) {
          const t2 = (i + 1) / n;
          const xb = x0 + (x1 - x0) * t2;
          const zb = z0 + (z1 - z0) * t2;
          const yb = 3.25 - Math.sin(t2 * PI) * 0.55;
          const seg = Math.hypot(xb - x, zb - z, yb - y);
          const mid = new THREE.Vector3((x + xb) / 2, (y + yb) / 2, (z + zb) / 2);
          const geo = new THREE.BoxGeometry(0.012, 0.012, seg);
          const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x, y, z), new THREE.Vector3(xb, yb, zb), new THREE.Vector3(0, 1, 0));
          m.setPosition(mid);
          kit.target('solid').addGeometry(geo.applyMatrix4(m).applyMatrix4(new THREE.Matrix4().makeTranslation(this.origin.x, this.origin.y, this.origin.z)).toNonIndexed(), new THREE.Matrix4(), C('#1a1a1a'));
        }
      }
    }
    // planters along the west rail, a few standing spots
    for (const z of [8.4, 11.6]) {
      F.plant(P(0.55, z), { kind: 'big', pot: '#e8e4dc' });
    }
    F.plant(P(17.0, 3.3), { kind: 'tall', pot: '#1a1a1e' });
    for (const [x, z, yaw] of [
      [6.6, 8.2, PI * 0.9],
      [7.3, 8.9, -PI * 0.6],
      [16.8, 6.4, R90],
      [17.0, 7.5, PI * 0.8],
      [12.8, 13.9, 0.2],
      [13.7, 8.1, -PI * 0.7],
    ])
      this.standSpots.push({ ...xz(this.w(x, z)), y: this.DECK, yaw });
  }

  // ==========================================================================
  buildPavilion(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    kit.room('orrery', PAV.x0, PAV.z0, PAV.x1, PAV.z1, {
      floor: 'herringbone',
      floorColor: '#9a7458',
      wall: 'plaster',
      wallColor: '#2a2622',
      ceil: '#1e1a18',
      ceilKey: 'wood',
      base: '#16140f',
      trim: '#b8904a',
      zone: 'orrery',
    });
    const win = (from, to) => ({ from, to, kind: 'window', y0: 0.08, y1: 3.3, grid: [Math.max(1, Math.round((to - from) / 2)), 1], frame: '#1a1a1a', trim: '#1a1a1a' });
    kit.wall('x', PAV.z0, PAV.x0, PAV.x1, { t: 0.1, ext: -1, open: [win(PAV.x0 + 0.25, PAV.x1 - 0.25)] });
    kit.wall('z', PAV.x0, PAV.z0, PAV.z1, { t: 0.1, ext: -1, open: [win(PAV.z0 + 0.25, PAV.z1 - 0.25)] });
    kit.wall('z', PAV.x1, PAV.z0, PAV.z1, { t: 0.1, ext: 1, open: [win(4.4, PAV.z1 - 0.25)] });
    kit.wall('x', PAV.z1, PAV.x0, PAV.x1, {
      t: 0.1,
      ext: 1,
      open: [win(PAV.x0 + 0.25, PAV_DOOR[0] - 0.2), { from: PAV_DOOR[0], to: PAV_DOOR[1], kind: 'opening', y0: 0, y1: 2.6, trim: '#b8904a' }, win(PAV_DOOR[1] + 0.2, PAV.x1 - 0.25)],
    });
    // the roof over it (and its overhang)
    P(0, 0).box('solid', PAV.x0 - 0.25, H + 0.012, PAV.z0 - 0.25, PAV.x1 + 0.25, H + 0.2, PAV.z1 + 0.25, C('#1a1a1a'), { bottom: true });
    // ORRERY in gold over the door (outside)
    P(0, PAV.z1 + 0.15).box('solid', PAV_DOOR[0] - 1.0, 2.75, -0.02, PAV_DOOR[1] + 1.0, 3.3, 0.0, C('#0e0e10'));
    P(0, PAV.z1 + 0.15).panel('cSigns', PAV_DOOR[0] - 0.95, 2.78, PAV_DOOR[1] + 0.95, 3.27, 0.006, csignUV('orrery'));
    // ---------------------------------------------------------------- tables: three by the north glass, three by the south
    const T = [
      [1.9, 1.8],
      [4.9, 1.8],
      [7.9, 1.8],
      [1.6, 5.8],
      [6.6, 5.8],
      [9.3, 5.8],
    ];
    T.forEach(([x, z], k) => {
      const Pt = P(x, z);
      F.diningTable(Pt, { w: 0.9, d: 0.9, round: true, chairs: 2, col: '#f2efe8', chairCol: '#2a4a3a', topKey: 'solid' });
      Pt.geo('fabric', new THREE.CylinderGeometry(0.47, 0.5, 0.36, 16, 1, true), 0, 0.58, 0, C('#f2efe8')); // the cloth hangs down
      Pt.geo('glow', new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), 0.12, 0.8, -0.05, C('#ffd890'));
      Pt.geo('solid', new THREE.CylinderGeometry(0.035, 0.03, 0.1, 8), -0.15, 0.81, 0.1, C('#d8e4e8'));
      Pt.light(0.12, 0.95, -0.05, '#ffb870', 0.18);
      F.ceilingLight(Pt, H, { style: 'pendant', power: 0.6, color: '#ffc890', metal: '#b8904a' });
      const seats = [
        [0, -0.75, 0],
        [0, 0.75, PI],
      ].map(([sx, sz, yaw]) => {
        const p = Pt.point(sx, 0, sz);
        const o = Pt.point(sx + 0.7, 0, sz);
        return { x: p.x, z: p.z, y: this.DECK, yaw, seatH: 0.47, out: { x: o.x, z: o.z }, kind: 'orrery', table: k };
      });
      this.tables.push({ k, seats, plate: this.w(x, z, 0.77), at: this.w(x, z) });
    });
    // ---------------------------------------------------------------- the pass at the east end, and the dumbwaiter
    const ps = P(11.0, 0.9);
    ps.box('solid', 0, 0, 0, 0.6, 1.0, 5.2, C('#2a2622'));
    ps.box('marble', -0.04, 1.0, -0.02, 0.64, 1.05, 5.22, C('#e8e4dc'));
    ps.box('solid', 0.05, 1.5, 0.2, 0.55, 1.55, 5.0, C('#c8ccd0'));
    for (let z = 0.6; z < 5; z += 1.1) {
      ps.box('glow', 0.2, 1.495, z - 0.18, 0.4, 1.5, z + 0.18, C('#ff9a4a'));
      ps.light(0.3, 1.3, z, '#ff9a4a', 0.2, true);
      ps.geo('solid', new THREE.CylinderGeometry(0.14, 0.14, 0.015, 14), 0.3, 1.06, z, C('#f6f4ee'));
    }
    ps.collide(-0.04, -0.02, 0.64, 5.22, 1.1).shadow(0, 0, 0.6, 5.2, 0.45);
    P(PAV.x1, 2.0, -R90).box('solid', -0.6, 0.9, 0.0, 0.6, 2.1, 0.06, C('#a8acb0'));
    P(PAV.x1, 2.0, -R90).box('solid', -0.55, 0.95, 0.06, 0.55, 2.05, 0.07, C('#8a8e92'));
    this.staffSpots.chef = { ...xz(this.w(11.95, 3.6)), y: this.DECK, yaw: -R90 };
    this.passSpot = this.w(10.6, 3.6);
    // a wine column in the north-east corner
    const wc = P(11.0, 0.5);
    wc.box('solid', 0.7, 0, 0, 1.5, 2.6, 0.35, C('#1a1a1a'));
    wc.box('glass', 0.72, 0.1, 0.35, 1.48, 2.5, 0.36);
    for (let k = 0; k < 20; k++) wc.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.28, 6), 0.85 + (k % 4) * 0.18, 0.25 + Math.floor(k / 4) * 0.45, 0.2, C(k % 3 ? '#4a1a1a' : '#d8d0a0'), 0, 1, 1, 1, R90);
    wc.box('glow', 0.72, 2.45, 0.05, 1.48, 2.48, 0.33, C('#ffe8c0'));
    wc.collide(0.7, 0, 1.5, 0.36, 2.6);
    // the host stand just outside the door, with the menu
    const hs = P(PAV_DOOR[1] + 0.9, PAV.z1 + 0.6);
    hs.box('wood', -0.3, 0, -0.2, 0.3, 1.05, 0.2, C('#2a2018'));
    hs.box('solid', -0.32, 1.05, -0.22, 0.32, 1.08, 0.22, C('#b8904a'));
    hs.geo('glow', new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), 0.2, 1.14, -0.1, C('#ffd890'));
    hs.collide(-0.32, -0.22, 0.32, 0.22, 1.1);
    P(PAV_DOOR[0] - 0.75, PAV.z1 + 0.11).panel('cSigns', -0.3, 0.9, 0.3, 1.8, 0.006, csignUV('menu'));
    this.staffSpots.maitre = { ...xz(this.w(PAV_DOOR[1] + 0.9, PAV.z1 + 1.15)), y: this.DECK, yaw: PI * 0.85 };
    this.hostStand = this.w(PAV_DOOR[1] + 0.9, PAV.z1 + 1.0);
    // the sun at the orrery's heart lights the room a little
    P(5.6, 3.85).light(0, 2.6, 0, '#ffe0a8', 0.55);
    this.waiterHome = this.w(10.3, 4.6);
    this.staffSpots.waiter = { ...xz(this.waiterHome), y: this.DECK, yaw: -R90 };
  }

  // ==========================================================================
  /** Things that move: the water, the orrery, the fire, the bulbs' glow. */
  buildLive() {
    const o = this.origin;
    // water: a scrolling texture on a translucent surface, slightly below the coping
    const wt = this.ct.water;
    wt.repeat.set((POOL.x1 - POOL.x0) / 3, (POOL.z1 - POOL.z0) / 3);
    this.waterMat = new THREE.MeshPhongMaterial({ map: wt, color: '#9adcf0', transparent: true, opacity: 0.72, shininess: 90, specular: '#aaccdd', depthWrite: false, emissive: '#0a3a5a' });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0 + 0.06).rotateX(-R90), this.waterMat);
    water.position.set(o.x + (POOL.x0 + POOL.x1) / 2, this.DECK - 0.12, o.z + (POOL.z0 + POOL.z1 + 0.06) / 2);
    water.renderOrder = 4;
    this.group.add(water);
    // the orrery: a brass sun and three planets on rings, turning over the dining room
    this.orrery = new THREE.Group();
    this.orrery.position.set(o.x + 5.6, this.DECK + 2.55, o.z + 3.85);
    const brass = new THREE.MeshPhongMaterial({ color: '#c8a050', shininess: 80, specular: '#ffe8a0', emissive: '#3a2a10' });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H - 2.55, 6), brass);
    rod.position.y = (H - 2.55) / 2;
    this.orrery.add(rod);
    const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 2), new THREE.MeshBasicMaterial({ color: '#ffd890' }));
    this.orrery.add(sun);
    this.rings = [];
    [
      [0.5, '#8ab0d0', 0.06, 0.9],
      [0.85, '#c86a3a', 0.08, 0.55],
      [1.25, '#d8c8a0', 0.1, 0.3],
    ].forEach(([r, col, pr, speed], k) => {
      const g = new THREE.Group();
      g.rotation.z = (k - 1) * 0.18;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 4, 40).rotateX(R90), brass);
      g.add(ring);
      const arm = new THREE.Group();
      const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1), new THREE.MeshPhongMaterial({ color: col, shininess: 40 }));
      planet.position.x = r;
      arm.add(planet);
      g.add(arm);
      this.orrery.add(g);
      this.rings.push({ arm, speed });
    });
    this.group.add(this.orrery);
    // fire: flickering flames on the pits (crossed quads, additive)
    this.fireMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ff8a3a'), opacity: 0.9 });
    this.flames = [];
    for (const p of this.pits) {
      const g = new THREE.Group();
      g.position.copy(p);
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8).translate(0, 0.38, 0), this.fireMat);
        f.rotation.y = (k / 3) * PI;
        f.renderOrder = 3;
        g.add(f);
      }
      this.group.add(g);
      this.flames.push(g);
    }
    // the bulbs' halos (points)
    this.bulbMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffd890'), size: 0.5, points: true, opacity: 0.6 });
    this.group.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(this.bulbs), this.bulbMat));
    // dynamic lights near the player (city.updateLampLights) on the deck at night
    const F3 = (x, y, z, c, power, dist) => ({ ...this.w(x, z, y), color: new THREE.Color(c), power, dist });
    this.fixtures = [F3(3.6, 1.0, 10.2, '#ff9a4a', 0.9, 7), F3(9.4, 1.0, 10.2, '#ff9a4a', 0.9, 7), F3(19.5, 2.2, 7.2, '#ffd08a', 0.6, 7), F3(6.5, 2.8, 11.0, '#ffd08a', 0.6, 9), F3(15.5, 2.8, 9.0, '#ffd08a', 0.6, 9), F3(10.0, 0.0, 16.0, '#7ae4ff', 0.7, 9), F3(5.6, 2.4, 3.9, '#ffc890', 0.7, 8)];
  }

  // ==========================================================================
  /** The deck's slab (it raises the club 1.15 m above the roof) and the lift lobby at street level. */
  buildShell() {
    const s = this.site;
    const g = new GeoBuilder();
    const y0 = this.top + 0.06;
    const y1 = this.DECK - 0.012;
    const e = 0.02;
    // around the pool basin (the basin sits in a hole in the slab)
    const parts = [
      [s.x0 + e, s.z0 + e, s.x1 - e, s.z0 + POOL.z0 - 0.15],
      [s.x0 + e, s.z0 + POOL.z0 - 0.15, s.x0 + POOL.x0 - 0.15, s.z1 - e],
      [s.x0 + POOL.x1 + 0.15, s.z0 + POOL.z0 - 0.15, s.x1 - e, s.z1 - e],
    ];
    for (const [a, b, c2, d] of parts) g.box(a, y0, b, c2, y1, d, { color: shade('#2a2a2e') });
    // under the basin, the slab only comes up to the basin floor
    g.box(s.x0 + POOL.x0 - 0.15, y0, s.z0 + POOL.z0 - 0.15, s.x0 + POOL.x1 + 0.15, this.DECK - POOL.depth - 0.025, s.z1 - e, { color: shade('#2a2a2e') });
    this.outside.add(new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    // a glow along the deck's edge at night (seen from the street)
    this.edgeMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffd08a'), opacity: 0 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(s.x1 - s.x0, 3), this.edgeMat);
    glow.position.set((s.x0 + s.x1) / 2, this.DECK + 1.2, s.z1 + 0.05);
    glow.renderOrder = 2;
    this.outside.add(glow);
  }

  /** The street entrance: a brass canopy, a red carpet, a doorman (in main), a sign. */
  buildLobby() {
    const s = this.site;
    const x = s.x1 - 3.4;
    const z = s.z1;
    const Y = CITY.CURB;
    const g = new GeoBuilder();
    const box = (a, b, c2, d, e, f, col) => g.box(a, b, c2, d, e, f, { color: shade(col), bottom: true });
    box(x - 1.0, Y, z + 0.0, x + 1.0, Y + 2.9, z + 0.03, '#1a1a1a'); // dark glass doors
    box(x - 1.15, Y, z, x - 1.0, Y + 3.05, z + 0.08, '#b8904a');
    box(x + 1.0, Y, z, x + 1.15, Y + 3.05, z + 0.08, '#b8904a');
    box(x - 1.15, Y + 2.9, z, x + 1.15, Y + 3.05, z + 0.08, '#b8904a');
    box(x - 0.02, Y + 0.05, z + 0.03, x + 0.02, Y + 2.85, z + 0.05, '#b8904a');
    box(x - 1.6, Y + 3.25, z, x + 1.6, Y + 3.4, z + 2.6, '#b8904a'); // canopy
    for (const sx of [-1.5, 1.5]) box(x + sx - 0.04, Y, z + 2.45, x + sx + 0.04, Y + 3.25, z + 2.53, '#b8904a');
    box(x - 0.8, Y + 0.004, z + 0.05, x + 0.8, Y + 0.014, z + 3.2, '#7a1a1a'); // the red carpet
    for (const sx of [-1.25, 1.25]) {
      box(x + sx - 0.05, Y, z + 3.0, x + sx + 0.05, Y + 0.9, z + 3.1, '#b8904a');
      this.city.colliders.add(x + sx - 0.12, z + 2.93, x + sx + 0.12, z + 3.17, 0, 1);
    }
    for (const sx of [-1.5, 1.5]) this.city.colliders.add(x + sx - 0.1, z + 2.39, x + sx + 0.1, z + 2.59, 0, 3.3);
    this.outside.add(new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const sg = new GeoBuilder();
    sg.quad([x - 1.5, Y + 3.42, z + 2.606], [x + 1.5, Y + 3.42, z + 2.606], [x + 1.5, Y + 4.12, z + 2.606], [x - 1.5, Y + 4.12, z + 2.606], [0, 0, 1], csignUV('lobby'));
    sg.quad([x + 1.17, Y + 1.2, z + 0.086], [x + 1.77, Y + 1.2, z + 0.086], [x + 1.77, Y + 1.43, z + 0.086], [x + 1.17, Y + 1.43, z + 0.086], [0, 0, 1], csignUV('members'));
    this.signMat = new THREE.MeshLambertMaterial({ map: this.ct.csigns, emissive: '#ffffff', emissiveMap: this.ct.csigns, emissiveIntensity: 0.2 });
    this.outside.add(new THREE.Mesh(sg.build(), this.signMat));
    // a box on the canopy's top for the sign to stand on, and warm light under it at night
    this.lobbyPoolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffd8a0'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-R90), this.lobbyPoolMat);
    pool.position.set(x, Y + 0.03, z + 1.6);
    pool.renderOrder = 2;
    this.outside.add(pool);
    this.lobbyDoor = { x, z: z + 1.0 };
    this.lobbyOut = { x, z: z + 2.0, yaw: 0 };
    this.doormanSpot = { x: x + 1.9, z: z + 1.4, y: Y, yaw: -R90 * 0.5 };
    this.outsideSpot = { x, z: z + 3.6, yaw: PI };
  }

  // ==========================================================================
  /** s: { hour, camera, near (the player is up here), session (sunset DJ on) } */
  update(dt, time, env, s) {
    const camY = s.camera.position.y;
    const up = camY > this.DECK - 6;
    const camD = s.camera.position.distanceTo(this.w(W / 2, D / 2));
    this.group.visible = up || camD < 140;
    const open = crownOpen(s.hour);
    this.open = open;
    const u = this.uniforms;
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    const night = env.night ?? 1 - sunUp;
    u.uLampOn.value = damp(u.uLampOn.value, 0.15 + night * (open ? 1 : 0.4), 2, dt);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.48).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.28));
    if (this.kit.glowMat) this.kit.glowMat.color.setScalar(0.7 + night * 0.6);
    this.signMat.emissiveIntensity = 0.2 + night * 0.8;
    this.lobbyPoolMat.opacity = night * 0.45;
    this.edgeMat.opacity = night * (open ? 0.22 : 0.06);
    this.bulbMat.opacity = night * (open ? 0.75 : 0.2);
    // fx: 0 the fire pits flicker, 1 the pool lights shimmer, 2 the DJ's colours
    const fx = u.uFx.value;
    const fire = open && night > 0.2 ? 0.75 + Math.sin(time * 11) * 0.08 + Math.sin(time * 17.3) * 0.06 : 0;
    fx[0].setRGB(1.0 * fire, 0.5 * fire, 0.18 * fire);
    const pool = (0.25 + night * 0.75) * (0.9 + Math.sin(time * 2.1) * 0.1);
    fx[1].setRGB(0.2 * pool, 0.75 * pool, 0.95 * pool);
    const dj = s.session ? 0.8 : 0;
    const hue = (time * 0.05) % 1;
    fx[2].setHSL(hue, 0.8, 0.35 * dj);
    if (!this.group.visible) return;
    this.ct.water.offset.set((time * 0.02) % 1, (time * 0.013) % 1);
    this.orrery.rotation.y = time * 0.05;
    for (const r of this.rings) r.arm.rotation.y = time * r.speed * 0.25;
    for (const [k, f] of this.flames.entries()) {
      f.visible = fire > 0;
      f.scale.y = 0.85 + Math.sin(time * 9 + k) * 0.15 + Math.sin(time * 15.7 + k * 2) * 0.08;
      f.rotation.y = time * 0.6;
    }
  }
}

function xz(v) {
  return { x: v.x, z: v.z };
}
