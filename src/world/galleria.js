import * as THREE from 'three';
import { CITY, GALLERIA_SITE } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { damp, smoothstep, clamp } from '../core/rng.js';
import { InteriorKit, F, C } from './interior/kit.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { createGalleriaTextures, msignUV } from '../render/galleriaTextures.js';
import { additive } from '../render/materials.js';
import { FURN, FishTank } from '../game/furniture.js';
import { ITEMS } from '../game/fashion.js';
import { TOYS } from '../game/gullysMenu.js';

// The Halcyon Galleria, Downtown: a two-storey mall around a skylit atrium. Like
// GULLY'S it's part of the street (no loading screen) and builds its own shell.
//
//        GROUND                                   UPPER (y = UP)
//  x 0      8.5        17.5       26      x 0   6.5 8.5       17.5 19.5    26
//   ┌────────┬──────────┬────────┐          ┌─────┬─┬──────────┬─┬───────┐
//   │ RACK & │ concourse│ SPLIT- │ z 0      │     │ │ back walk│ │ROOMSET│
//   │ RUIN   ├──────────┤ GRAIN  │ z 2.5    │MAIS-│w├──────────┤e│(furni-│
//   │        │  atrium  │        │          │ ON  │a│  open to │a│ture)  │
//   │(thrift)│ escalator│(street-│          │VELL-│l│  below   │l├───────┤ z 12.2
//   │        │ fountain │ wear)  │          │ ARD │k│          │k│BRIGHT-│
//   │        │          │        │          │     │ │          │ │WIRE   │
//   └────────┴─[doors]──┴────────┘ z 17     └─────┴─┴──────────┴─┴───────┘
//
// Local coordinates: x along the street (0..W), z from the back wall (0) to the
// glass front (D, facing the plaza and the street), y up from the ground floor.

const W = 26;
const D = 17;
export const UP = 4.6; // the upper floor
const GH = 4.4; // ground floor ceiling (the slab is 4.4 - 4.6)
const H = 8.6; // upper ceiling, walls' full height
const RIDGE = 10.3; // the glass roof's ridge over the atrium
const ROOF = H + 0.8; // top of the parapet
const DOOR = [11.5, 14.5];
export const MALL_OPEN = 10;
export const MALL_CLOSE = 22;
export const mallOpen = (h) => h >= MALL_OPEN && h < MALL_CLOSE;
// escalators: an up lane (moves towards -z) and a down lane, from the atrium floor to the back walkway
export const ESC = { x0: 11.4, x1: 14.6, lanes: [{ x0: 11.6, x1: 12.7, dir: 1 }, { x0: 13.3, x1: 14.4, dir: -1 }], zTop: 2.5, zBot: 11.5, speed: 0.6 };
const RUN = ESC.zBot - ESC.zTop;
export const slopeY = (z) => clamp((UP * (ESC.zBot - z)) / RUN, 0, UP);
const TREAD = 0.035; // the moving steps' tops sit this far above the slope
const FOUNT = { x: 13, z: 14.45, r: 1.15 };
const PART = 12.2; // the wall between ROOMSET and BRIGHTWIRE (upstairs, east)
const R90 = Math.PI / 2;
const PI = Math.PI;

export class Galleria {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.galleriaSite;
    this.site = site;
    this.origin = new THREE.Vector3(site.x0 + 1.0, CITY.CURB + GALLERIA_SITE.floorLift, site.z0 + 1.0);
    this.W = W;
    this.D = D;
    this.H = H;
    this.cityTex = cityTex;
    this.gt = createGalleriaTextures();
    this.group = new THREE.Group();
    this.outside = new THREE.Group();
    scene.add(this.group, this.outside);
    this.uniforms = makeInteriorUniforms();
    this.tex = { ...interiorTex, ...this.gt.kit };
    this.open = true;

    // things other systems use (all world positions unless noted)
    this.displays = []; // { id, shop, label, stand, yaw, items }
    this.mannequins = []; // { x, z, y, yaw, shop, wear }
    this.seats = []; // benches and sofas: { x, z, y, yaw, out }
    this.staffSpots = {};
    this.tills = {};
    this.mirrors = [];
    this.lookouts = []; // places people stop to look over the balcony or at a window

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildInterior(kit);
    kit.build(this.group, {}, { fog: true });
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.fixtures = kit.lights;
    this.buildDynamic();
    this.buildExterior();
    this.buildDoors();
    this.buildGraph();
  }

  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  local(p) {
    return { x: p.x - this.origin.x, z: p.z - this.origin.z, y: p.y - this.origin.y };
  }

  contains(p, pad = 0) {
    const { x, z, y } = this.local(p);
    return x > -pad && x < W + pad && z > -pad && z < D + pad && y < RIDGE;
  }

  /** On the plaza in front (between the glass and the pavement)? */
  onPlaza(p) {
    const x = p.x - this.origin.x;
    return x > -1 && x < W + 1 && p.z > this.origin.z + D + 0.3 && p.z < this.site.z1;
  }

  /** Which part of the mall p is in: 'rr' | 'sg' | 'mv' | 'mall' | null */
  zoneAt(p) {
    if (!this.contains(p)) return null;
    const { x, z, y } = this.local(p);
    if (y > UP - 0.6) {
      if (x < 6.5) return 'mv';
      if (x > 19.5 && z < PART) return 'rs';
      return 'mall';
    }
    if (x < 8.5) return 'rr';
    if (x > 17.5) return 'sg';
    return 'mall';
  }

  /** Camera ceiling where p is: low in the shops, high under the glass roof. */
  ceilingAt(p) {
    const { x, z, y } = this.local(p);
    const o = this.origin.y;
    if (y > UP - 0.6) return o + H;
    if (x > 8.5 && x < 17.5 && z > 2.5) return o + RIDGE - 0.4;
    return o + GH;
  }

  /**
   * The floor under (wx, wz) for someone whose feet are at yHint: the ground floor,
   * the upper floor (only if you're already up there) or an escalator in between.
   */
  groundAt(wx, wz, yHint, base) {
    const o = this.origin;
    const x = wx - o.x;
    const z = wz - o.z;
    if (x < -0.05 || x > W + 0.05 || z < -0.05 || z > D + 0.05) return base;
    const reach = yHint - o.y + 0.45;
    let best = 0;
    const take = (h) => {
      if (h <= reach && h > best) best = h;
    };
    // the upper floor: everything but the atrium void
    if ((x < 19.5 && !(x > 8.5 && x < 17.5 && z > 2.5)) || (x >= 19.5 && z < PART)) take(UP);
    // the escalators
    if (x > ESC.lanes[0].x0 - 0.05 && x < ESC.lanes[1].x1 + 0.05 && z > ESC.zTop - 0.02 && z < ESC.zBot + 0.3) take(Math.min(UP, slopeY(z) + TREAD));
    return o.y + best;
  }

  /** If p is riding an escalator: { dx, dz } in m/s (the steps carry you), else null. */
  escalatorFlow(p) {
    const { x, z, y } = this.local(p);
    if (z < ESC.zTop - 0.6 || z > ESC.zBot + 0.4) return null;
    for (const L of ESC.lanes) {
      if (x < L.x0 || x > L.x1) continue;
      if (Math.abs(y - slopeY(z) - TREAD) > 0.35) return null;
      // carried right onto the landing at either end
      if (L.dir > 0 && z < ESC.zTop - 0.5) return null;
      if (L.dir < 0 && z > ESC.zBot + 0.35) return null;
      return { dx: 0, dz: -L.dir * ESC.speed, dir: L.dir };
    }
    return null;
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);

    // ---------------------------------------------------------------- rooms
    const mall = { floor: 'marble', floorColor: '#d6cfc4', wall: 'plaster', wallColor: '#e2d9ca', ceil: '#e8e2d6', ceilKey: 'ceilTile', base: '#7a6a52', trim: '#b8a888', zone: 'mall' };
    kit.room('conc', 8.5, 0, 17.5, 2.5, { ...mall, h: GH });
    kit.room('atrium', 8.5, 2.5, 17.5, D, { ...mall, h: RIDGE, noCeil: true });
    kit.room('walkW', 6.5, 0, 8.5, D, { ...mall, y0: UP });
    kit.room('walkB', 8.5, 0, 17.5, 2.5, { ...mall, y0: UP });
    kit.room('walkE', 17.5, 0, 19.5, D, { ...mall, y0: UP });
    kit.room('rr', 0, 0, 8.5, D, { floor: 'woodWorn', floorColor: '#b89878', wall: 'brick', wallColor: '#d8b8a0', ceil: '#e8e4d8', ceilKey: 'ceilTile', base: '#3a2a20', trim: '#6a4a30', h: GH, zone: 'rr' });
    kit.room('sg', 17.5, 0, W, D, { floor: 'concrete', floorColor: '#b8b8b4', wall: 'concrete', wallColor: '#dcdad4', ceil: '#3a3a40', ceilKey: 'concrete', base: '#1c1c20', trim: '#1c1c20', h: GH, zone: 'sg' });
    kit.room('mv', 0, 0, 6.5, D, {
      floor: 'marble',
      floorColor: '#bdb3a4',
      wall: 'plaster',
      wallColor: '#c2b49c',
      wainscot: { key: 'wood', h: 1.0, color: '#6a4630', cap: '#a8844a' },
      ceil: '#d8d0c2',
      ceilKey: 'plaster',
      base: '#1a1410',
      trim: '#a8844a',
      y0: UP,
      zone: 'mv',
    });
    kit.room('rs', 19.5, 0, W, PART, { floor: 'woodOak', floorColor: '#d8c8b0', wall: 'plaster', wallColor: '#ece6dc', ceil: '#f2efe8', ceilKey: 'plaster', base: '#b8aa94', trim: '#e8dcc8', y0: UP, zone: 'rs' });

    // ---------------------------------------------------------------- walls
    const upperCut = { y0: GH, y1: H, noTrim: true }; // ground-floor walls stop at the slab
    const lowerCut = { y0: 0, y1: UP, noTrim: true }; // upper-floor walls start on it
    const spans = (list, cut) => list.map(([from, to, ...gaps]) => ({ from, to, gaps: [...gaps, cut] }));
    const win = (y0, y1, frame, grid = [3, 1]) => ({ y0, y1, kind: 'window', grid, frame, trim: frame });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1, open: [{ from: 9.2, to: 10.2, kind: 'entry', y1: 2.3, doorColor: '#c8c0b0' }, { from: 15.9, to: 16.9, kind: 'entry', y1: 2.3, doorColor: '#8a8c90' }] });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1 });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1 });
    kit.wall('x', D, 0, W, {
      t: 0.3,
      ext: 1,
      open: [
        { from: 0.6, to: 5.9, gaps: [win(0.45, 3.7, '#3a2a20'), win(UP + 0.8, UP + 3.5, '#a8844a')] },
        { from: 6.7, to: 8.3, gaps: [win(0.45, 3.7, '#3a2a20', [1, 1]), win(UP + 0.4, UP + 3.6, '#a8acb4', [1, 1])] },
        { from: 8.7, to: 11.3, gaps: [win(0.12, 8.4, '#2a3040', [2, 4])] },
        { from: DOOR[0], to: DOOR[1], gaps: [{ y0: 0, y1: 3.0, kind: 'opening', trim: '#2a3040' }, win(3.3, 8.4, '#2a3040', [3, 3])] },
        { from: 14.7, to: 17.3, gaps: [win(0.12, 8.4, '#2a3040', [2, 4])] },
        { from: 17.7, to: 19.3, gaps: [win(0.45, 3.7, '#1c1c20', [1, 1]), win(UP + 0.4, UP + 3.6, '#a8acb4', [1, 1])] },
        { from: 20.1, to: 25.4, gaps: [win(0.45, 3.7, '#1c1c20')] },
      ],
    });
    // shop fronts on the atrium (ground floor only)
    kit.wall('z', 8.5, 0, D, { t: 0.2, open: spans([[0, 5.4], [5.4, 8.0, { y0: 0, y1: 3.0, kind: 'opening', trim: '#3a2a20' }], [8.0, 9.0], [9.0, 15.8, win(0.35, 3.3, '#3a2a20')], [15.8, D]], upperCut) });
    kit.wall('z', 17.5, 0, D, { t: 0.2, open: spans([[0, 5.4], [5.4, 8.0, { y0: 0, y1: 3.0, kind: 'opening', trim: '#1c1c20' }], [8.0, 9.0], [9.0, 15.8, win(0.35, 3.3, '#1c1c20')], [15.8, D]], upperCut) });
    // upstairs: MAISON VELLARD's front, and the closed shops across the atrium
    kit.wall('z', 6.5, 0, D, {
      t: 0.2,
      open: spans([[0, 0.6], [0.6, 6.4, win(UP + 0.4, UP + 3.2, '#a8844a')], [6.4, 7.0], [7.0, 9.0, { y0: UP, y1: UP + 2.9, kind: 'opening', trim: '#a8844a' }], [9.0, 9.6], [9.6, 16.4, win(UP + 0.4, UP + 3.2, '#a8844a')], [16.4, D]], lowerCut),
    });
    // ROOMSET: a display window and an open doorway; BRIGHTWIRE behind its shutter
    kit.wall('z', 19.5, 0, D, { t: 0.2, open: spans([[0, 0.8], [0.8, 4.4, win(UP + 0.4, UP + 3.0, '#e8dcc8')], [4.4, 5.0], [5.0, 7.2, { y0: UP, y1: UP + 2.9, kind: 'opening', trim: '#e8dcc8' }], [7.2, D]], lowerCut) });
    kit.wall('x', PART, 19.6, W, { t: 0.2, open: spans([[19.6, W]], lowerCut) });

    // daylight from the glass roof, and spilling across the balconies
    const o = this.origin;
    kit.windows.push({ x: o.x + 13, y: o.y + 8.0, z: o.z + 2.65, nx: 0, nz: 1, area: 9 });
    kit.windows.push({ x: o.x + 8.45, y: o.y + UP + 2.5, z: o.z + 9.5, nx: -1, nz: 0, area: 3.5 });
    kit.windows.push({ x: o.x + 17.55, y: o.y + UP + 2.5, z: o.z + 9.5, nx: 1, nz: 0, area: 3.5 });
    kit.windows.push({ x: o.x + 13, y: o.y + UP + 2.5, z: o.z + 2.45, nx: 0, nz: -1, area: 3 });

    this.buildAtrium(kit, P);
    this.buildEscalators(kit, P);
    this.buildRackAndRuin(kit, P);
    this.buildSplitgrain(kit, P);
    this.buildVellard(kit, P);
    this.buildRoomset(kit, P);
    this.buildClosedFronts(kit, P);
  }

  // ---------------------------------------------------------------- the atrium, concourse and walkways
  buildAtrium(kit, P) {
    const P0 = P(0, 0);
    const steel = C('#c8ccd0');
    const cream = C('#e8e2d6');
    // the slab's edge round the atrium void
    // (each starts where the neighbouring ceiling ends, so no two faces share a plane)
    P0.box('solid', 8.5, GH, 2.62, 8.62, UP + 0.02, D, cream);
    P0.box('solid', 17.38, GH, 2.62, 17.5, UP + 0.02, D, cream);
    for (const [x0, x1] of [
      [8.5, ESC.x0],
      [ESC.x1, 17.5],
    ])
      P0.box('solid', x0, GH, 2.5, x1, UP + 0.02, 2.62, cream);
    // the soffit between the walkways' ceilings and the glass roof
    P0.box('solid', 8.5, H, 2.62, 8.62, H + 0.36, D, cream, { bottom: true });
    P0.box('solid', 17.38, H, 2.62, 17.5, H + 0.36, D, cream, { bottom: true });
    P0.box('solid', 8.5, H, 2.5, 17.5, H + 0.36, 2.62, cream, { bottom: true });

    // glass balustrades with a steel handrail along the walkways' edges
    const PU = P(0, 0, 0, UP);
    const balustrade = (ax, az, bx, bz) => {
      const dx = bx - ax;
      const dz = bz - az;
      const n = dx ? [0, 0, 1] : [1, 0, 0];
      kit.target('glass').addGeometry(
        (() => {
          const g = new GeoBuilder();
          g.quad([ax, 0.1, az], [bx, 0.1, bz], [bx, 1.0, bz], [ax, 1.0, az], n, [0, 0, 1, 1]);
          return g.build();
        })(),
        PU.m,
      );
      const x0 = Math.min(ax, bx) - (dz ? 0.04 : 0);
      const x1 = Math.max(ax, bx) + (dz ? 0.04 : 0);
      const z0 = Math.min(az, bz) - (dx ? 0.04 : 0);
      const z1 = Math.max(az, bz) + (dx ? 0.04 : 0);
      PU.box('solid', x0, 1.0, z0, x1, 1.06, z1, steel, { bottom: true });
      PU.box('solid', x0 + (dz ? 0.015 : 0), 0.025, z0 + (dx ? 0.015 : 0), x1 - (dz ? 0.015 : 0), 0.1, z1 - (dx ? 0.015 : 0), C('#8a8c90'));
      const len = Math.hypot(dx, dz);
      for (let k = 0; k <= Math.round(len / 1.6); k++) {
        const t = k / Math.max(1, Math.round(len / 1.6));
        PU.box('solid', ax + dx * t - 0.025, 0.1, az + dz * t - 0.025, ax + dx * t + 0.025, 1.0, az + dz * t + 0.025, steel);
      }
      PU.collide(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, 1.1);
    };
    balustrade(8.56, 2.7, 8.56, D - 0.05);
    balustrade(17.44, 2.7, 17.44, D - 0.05);
    balustrade(8.6, 2.56, ESC.x0, 2.56);
    balustrade(ESC.x1, 2.56, 17.4, 2.56);

    // ---------------------------------------------------------------- the glass roof's ribs
    for (let k = 0; k <= 8; k++) {
      const z = 2.5 + (k * (D - 2.5)) / 8;
      for (const s of [-1, 1]) {
        const len = Math.hypot(4.5, RIDGE - H - 0.36);
        const ang = Math.atan2(RIDGE - H - 0.36, 4.5);
        P0.geo('solid', new THREE.BoxGeometry(len, 0.08, 0.08), 13 + s * 2.25, (H + 0.36 + RIDGE) / 2, z, C('#2a3040'), 0, 1, 1, 1, 0, s * ang);
      }
    }
    P0.box('solid', 12.95, RIDGE - 0.06, 2.5, 13.05, RIDGE + 0.04, D, C('#2a3040'), { bottom: true });

    // ---------------------------------------------------------------- big globe pendants
    for (const [x, z] of [
      [10.6, 6.2],
      [15.4, 6.2],
      [10.6, 12.6],
      [15.4, 12.6],
    ]) {
      const L = P(x, z);
      L.box('solid', -0.008, 7.6, -0.008, 0.008, RIDGE - 0.3, 0.008, C('#1a1a1a'));
      L.geo('glow', new THREE.IcosahedronGeometry(0.42, 1), 0, 7.2, 0, C('#fff4dc'));
      L.geo('solid', new THREE.CylinderGeometry(0.1, 0.16, 0.12, 10), 0, 7.66, 0, C('#a8844a'));
      L.light(0, 7.0, 0, '#fff0d4', 0.6);
    }
    // downlights under the walkways and round the concourse
    const down = (x, z, y, power = 0.34, col = '#fff2dc') => {
      const L = P(x, z, 0, 0);
      L.geo('glow', new THREE.CylinderGeometry(0.16, 0.16, 0.012, 12), 0, y - 0.012, 0, C('#fff8ec'));
      L.light(0, y - 0.3, 0, col, power, true);
    };
    for (const x of [9.8, 16.2]) down(x, 1.25, GH);
    for (const z of [2, 6, 10, 14.5]) {
      down(7.5, z, H);
      down(18.5, z, H);
    }
    for (const x of [10.6, 15.4]) down(x, 1.25, H);

    // ---------------------------------------------------------------- the fountain
    const Fo = P(FOUNT.x, FOUNT.z);
    Fo.geo('solid', new THREE.CylinderGeometry(FOUNT.r, FOUNT.r + 0.05, 0.46, 24, 1, true), 0, 0.23, 0, C('#d8d0c0'));
    Fo.geo('solid', inward(new THREE.CylinderGeometry(FOUNT.r - 0.12, FOUNT.r - 0.12, 0.46, 24, 1, true)), 0, 0.23, 0, C('#c8c0b0'));
    Fo.geo('solid', new THREE.RingGeometry(FOUNT.r - 0.12, FOUNT.r + 0.05, 24).rotateX(-R90), 0, 0.46, 0, C('#ece6da'));
    Fo.geo('solid', new THREE.CircleGeometry(FOUNT.r - 0.12, 24).rotateX(-R90), 0, 0.06, 0, C('#2a6a8a'));
    // the coins on the bottom
    for (let k = 0; k < 26; k++) {
      const a = k * 2.399;
      const r = 0.25 + ((k * 37) % 70) / 100;
      Fo.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.006, 6), Math.cos(a) * r, 0.067, Math.sin(a) * r, C(k % 5 ? '#d8b46a' : '#c8ccd0'));
    }
    // a three-tier centre piece
    Fo.geo('solid', new THREE.CylinderGeometry(0.16, 0.22, 1.1, 12), 0, 0.6, 0, C('#e8e2d6'));
    Fo.geo('solid', new THREE.CylinderGeometry(0.6, 0.3, 0.14, 16), 0, 1.15, 0, C('#e8e2d6'));
    Fo.geo('solid', new THREE.CylinderGeometry(0.08, 0.12, 0.6, 10), 0, 1.5, 0, C('#e8e2d6'));
    Fo.geo('solid', new THREE.CylinderGeometry(0.32, 0.16, 0.1, 14), 0, 1.82, 0, C('#e8e2d6'));
    Fo.geo('solid', new THREE.SphereGeometry(0.1, 10, 8), 0, 1.98, 0, C('#d8b46a'));
    Fo.collide(-0.85, -FOUNT.r, 0.85, FOUNT.r, 0.5);
    Fo.collide(-FOUNT.r, -0.85, FOUNT.r, 0.85, 0.5);
    Fo.shadow(-FOUNT.r, -FOUNT.r, FOUNT.r, FOUNT.r, 0.3);
    this.fountain = { ...xz(this.w(FOUNT.x, FOUNT.z)), r: FOUNT.r, stand: xz(this.w(FOUNT.x, FOUNT.z + FOUNT.r + 0.55)) };

    // ---------------------------------------------------------------- benches, palms, the directory
    const bench = (x, z, yaw, y = 0) => {
      const B = P(x, z, yaw, y);
      B.box('wood', -0.85, 0.42, -0.24, 0.85, 0.47, 0.22, C('#a8784a'));
      B.box('wood', -0.85, 0.5, -0.27, 0.85, 0.85, -0.22, C('#a8784a'));
      for (const s of [-0.7, 0.7]) {
        B.box('solid', s - 0.04, 0, -0.215, s + 0.04, 0.42, 0.195, C('#3a3c40'));
        B.box('solid', s - 0.04, 0.47, -0.285, s + 0.04, 0.83, -0.275, C('#3a3c40')); // a back strap behind the backrest
      }
      B.collide(-0.85, -0.27, 0.85, 0.24, 0.5);
      B.shadow(-0.85, -0.27, 0.85, 0.24, 0.3);
      for (const dx of [-0.42, 0.42]) {
        const s = B.point(dx, 0, 0.02);
        const out = B.point(dx, 0, 0.75);
        this.seats.push({ x: s.x, z: s.z, y: this.origin.y + y, yaw, out: { x: out.x, z: out.z }, mall: true });
      }
    };
    bench(9.75, FOUNT.z, R90);
    bench(16.25, FOUNT.z, -R90);
    bench(10.3, 0.5, 0, UP);
    bench(15.7, 0.5, 0, UP);
    bench(7.0, 12.5, R90, UP);
    bench(19.0, 12.5, -R90, UP);
    const palm = (x, z, y = 0) => {
      const Pa = P(x, z, 0, y);
      Pa.box('solid', -0.42, 0, -0.42, 0.42, 0.62, 0.42, C('#d8d0c0'));
      Pa.box('solid', -0.38, 0.62, -0.38, 0.38, 0.635, 0.38, C('#4a3a2a'));
      Pa.geo('wood', new THREE.CylinderGeometry(0.06, 0.1, 2.2, 7), 0.05, 1.7, 0, C('#7a5a3a'), 0, 1, 1, 1, 0, 0.06);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        Pa.geo('solid', new THREE.BoxGeometry(1.2, 0.02, 0.26), Math.cos(a) * 0.55 + 0.12, 2.65 - 0.12, Math.sin(a) * 0.55, C(k % 2 ? '#3f7a32' : '#4f8a3a'), -a, 1, 1, 1, 0, -0.35);
      }
      Pa.collide(-0.42, -0.42, 0.42, 0.42, 0.7);
      Pa.shadow(-0.42, -0.42, 0.42, 0.42, 0.35);
    };
    palm(9.3, 3.4);
    palm(16.7, 3.4);
    palm(9.3, 16.2);
    palm(16.7, 16.2);
    palm(7.5, 16.2, UP);
    palm(18.5, 16.2, UP);
    // the directory totem by the doors
    const Dt = P(11.0, 16.1);
    Dt.box('solid', -0.45, 0, -0.08, 0.45, 2.0, 0.08, C('#1a2040'));
    Dt.panel('mSigns', -0.4, 0.7, 0.4, 1.3, 0.085, msignUV('directory'));
    Dt.panel('mSigns', -0.4, 1.55, 0.4, 1.9, 0.085, msignUV('hours'));
    Dt.collide(-0.45, -0.1, 0.45, 0.1, 2);
    this.directory = xz(this.w(11.0, 16.6));
    // the restrooms, the staff door and an ATM under the back walkway
    P(9.7, 0.02).panel('mSigns', -0.55, 2.4, 0.55, 2.68, 0.0, msignUV('wc'));
    P(16.4, 0.02).panel('mSigns', -0.55, 2.4, 0.55, 2.68, 0.0, msignUV('staff'));
    const Atm = P(11.0, 0.02);
    Atm.box('solid', -0.35, 0, 0, 0.35, 1.8, 0.5, C('#3a4a6a'));
    Atm.box('glow', -0.22, 1.1, 0.501, 0.22, 1.45, 0.506, C('#7ad0ff'));
    Atm.box('solid', -0.3, 0.95, 0.5, 0.3, 1.0, 0.62, C('#2a2a30'));
    Atm.collide(-0.35, 0, 0.35, 0.62, 1.8);
    this.atm = xz(this.w(11.0, 1.2));
    // PRETZEL PILOT, a kiosk under the walkway
    const K = P(16.15, 1.25);
    K.box('solid', -1.0, 0, -0.35, 1.0, 1.0, 0.35, C('#7a3a1a'));
    K.box('solid', -1.05, 1.0, -0.4, 1.05, 1.05, 0.42, C('#e8d8b8'), { bottom: true });
    K.box('glass', -0.9, 1.05, -0.2, 0.9, 1.4, 0.2, C('#ffffff'));
    for (let k = 0; k < 6; k++) K.geo('solid', new THREE.TorusGeometry(0.08, 0.025, 4, 10), -0.7 + k * 0.28, 1.12, 0, C('#b8783a'), 0, 1, 1, 1, R90);
    K.panel('mSigns', -1.0, 1.5, 1.0, 1.88, -0.2, msignUV('pretzel'));
    K.box('solid', -1.0, 1.5, -0.25, 1.0, 1.88, -0.21, C('#3a1a0a'));
    K.light(0, 2.2, 0.6, '#ffd8a0', 0.35);
    K.collide(-1.05, -0.4, 1.05, 0.42, 1.05);
    this.kiosk = { stand: xz(this.w(16.15, 2.15)), yaw: PI };
    this.staffSpots.pretzel = { ...xz(this.w(16.15, 0.55)), y: this.origin.y, yaw: 0 };
    this.staffSpots.guard = { ...xz(this.w(15.9, 16.0)), y: this.origin.y, yaw: PI };
    // posters on the shop walls facing the atrium, a big ad over the stairs
    P(8.6, 4.5, R90).panel('mPosters', -0.4, 1.0, 0.4, 2.6, 0.006, [0.5, 0, 0.75, 1]);
    P(17.4, 4.5, -R90).panel('mPosters', -0.4, 1.0, 0.4, 2.6, 0.006, [0.25, 0, 0.5, 1]);
    P(13, 0.02, 0, UP).panel('mPosters', -0.55, 0.9, 0.55, 3.1, 0.0, [0, 0, 0.25, 1]);
    // the shops' signs over their doors
    P(8.6, 6.7, R90).panel('mSigns', -1.6, 3.35, 1.6, 4.0, 0.006, msignUV('rack'));
    P(17.4, 6.7, -R90).panel('mSigns', -1.6, 3.35, 1.6, 4.0, 0.006, msignUV('split'));
    P(6.6, 8.0, R90, UP).panel('mSigns', -1.6, 3.15, 1.6, 3.75, 0.006, msignUV('vellard'));
    // lookout spots on the balconies (people lean on the rail and watch)
    for (const [x, z, yaw] of [
      [8.15, 6, R90],
      [8.15, 11, R90],
      [17.85, 6, -R90],
      [17.85, 11, -R90],
      [10.0, 2.2, 0],
      [16.0, 2.2, 0],
    ])
      this.lookouts.push({ ...xz(this.w(x, z)), y: this.origin.y + UP, yaw });
  }

  // ---------------------------------------------------------------- escalators
  buildEscalators(kit, P) {
    const P0 = P(0, 0);
    const steel = C('#b8bcc4');
    const dark = C('#2a2a2e');
    // a wedge: the (z, y) profile below, from x0 to x1, built face by face
    const face = (pts, n, col) => {
      const [a, b, c] = pts;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const q = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? [...pts].reverse() : pts;
      P0.quad('solid', q[0], q[1], q[2], q[3], n, [0, 0, 1, 1], col);
    };
    const wedge = (x0, x1, yOff, col, inset = 0) => {
      const zA = ESC.zTop - 0.12 + inset;
      const zB = ESC.zBot + 0.45;
      const yT = UP + yOff;
      const len = Math.hypot(RUN, UP);
      const sideA = [[zA, 0], [zB, 0], [zB, yOff], [ESC.zBot, yOff]];
      const sideB = [[zA, 0], [ESC.zBot, yOff], [ESC.zTop, yT], [zA, yT]];
      for (const [x, nx] of [[x0, -1], [x1, 1]]) for (const side of [sideA, sideB]) face(side.map(([z, y]) => [x, y, z]), [nx, 0, 0], col);
      face([[x0, 0, zB], [x1, 0, zB], [x1, yOff, zB], [x0, yOff, zB]], [0, 0, 1], col); // the foot
      face([[x0, yOff, ESC.zBot], [x1, yOff, ESC.zBot], [x1, yOff, zB], [x0, yOff, zB]], [0, 1, 0], col);
      face([[x0, yOff, ESC.zBot], [x1, yOff, ESC.zBot], [x1, yT, ESC.zTop], [x0, yT, ESC.zTop]], [0, RUN / len, UP / len], col); // the incline
      face([[x0, yT, zA], [x1, yT, zA], [x1, yT, ESC.zTop], [x0, yT, ESC.zTop]], [0, 1, 0], col);
      face([[x0, 0, zA], [x1, 0, zA], [x1, yT, zA], [x0, yT, zA]], [0, 0, -1], col); // the back, under the walkway
    };
    // the body under the steps, then the side skirts and the middle divider standing above it
    for (const L of ESC.lanes) wedge(L.x0 - 0.01, L.x1 + 0.01, 0.005, C('#5a5c62'), 0.01); // its edges tuck into the skirts, its back sits 1 cm in
    wedge(ESC.x0, ESC.lanes[0].x0, 0.14, steel);
    wedge(ESC.lanes[0].x1, ESC.lanes[1].x0, 0.14, steel);
    wedge(ESC.lanes[1].x1, ESC.x1, 0.14, steel);
    // glass balustrades and black handrails
    const ang = Math.atan2(UP, RUN);
    const len = Math.hypot(UP, RUN);
    for (const x of [(ESC.x0 + ESC.lanes[0].x0) / 2, (ESC.lanes[0].x1 + ESC.lanes[1].x0) / 2, (ESC.lanes[1].x1 + ESC.x1) / 2]) {
      const g = new GeoBuilder();
      g.quad([x, 0.14, ESC.zBot + 0.4], [x, 0.14, ESC.zBot], [x, UP + 0.14, ESC.zTop], [x, UP + 0.14, ESC.zTop - 0.1], [1, 0, 0], [0, 0, 1, 1]);
      g.quad([x, 0.14, ESC.zBot], [x, 0.14, ESC.zBot + 0.4], [x, 1.0, ESC.zBot + 0.4], [x, 1.0, ESC.zBot], [1, 0, 0], [0, 0, 1, 1]);
      g.quad([x, 0.14, ESC.zBot], [x, 1.0, ESC.zBot], [x, UP + 1.0, ESC.zTop], [x, UP + 0.14, ESC.zTop], [1, 0, 0], [0, 0, 1, 1]);
      kit.target('glass').addGeometry(g.build(), P0.m);
      P0.geo('solid', new THREE.BoxGeometry(0.09, 0.07, len), x, UP / 2 + 1.0, (ESC.zTop + ESC.zBot) / 2, C('#141418'), 0, 1, 1, 1, ang);
      P0.box('solid', x - 0.045, 0.965, ESC.zBot - 0.02, x + 0.045, 1.035, ESC.zBot + 0.5, C('#141418'));
      P0.box('solid', x - 0.045, UP + 0.965, ESC.zTop - 0.5, x + 0.045, UP + 1.035, ESC.zTop + 0.02, C('#141418'));
    }
    // landing plates (comb plates) at both ends
    for (const L of ESC.lanes) {
      P0.box('solid', L.x0, 0.0, ESC.zBot, L.x1, 0.012, ESC.zBot + 0.6, C('#9a9ca4'));
      P0.box('solid', L.x0, UP + 0.0, ESC.zTop - 0.6, L.x1, UP + 0.012, ESC.zTop, C('#9a9ca4'));
    }
    // a glowing strip down the middle divider
    P0.geo('glow', new THREE.BoxGeometry(0.06, 0.02, len - 0.2), 13.0, UP / 2 + 0.165, (ESC.zTop + ESC.zBot) / 2, C('#9ad8ff'), 0, 1, 1, 1, ang);
    // collision: the sides follow the slope (you can't climb in or out over them),
    // and under the steps it's solid until you're standing on them
    const n = 18;
    for (let k = 0; k < n; k++) {
      const za = ESC.zTop + (k * RUN) / n;
      const zb = ESC.zTop + ((k + 1) * RUN) / n;
      const top = slopeY(za) + 1.0;
      for (const [x0, x1] of [
        [ESC.x0, ESC.lanes[0].x0],
        [ESC.lanes[0].x1, ESC.lanes[1].x0],
        [ESC.lanes[1].x1, ESC.x1],
      ])
        kit.colliders.add(this.origin.x + x0, this.origin.z + za, this.origin.x + x1, this.origin.z + zb, this.origin.y, this.origin.y + top);
      for (const L of ESC.lanes) kit.colliders.add(this.origin.x + L.x0, this.origin.z + za, this.origin.x + L.x1, this.origin.z + zb, this.origin.y, this.origin.y + slopeY(zb));
    }
    // the back end of the wedge, facing the concourse
    kit.colliders.add(this.origin.x + ESC.x0, this.origin.z + ESC.zTop - 0.12, this.origin.x + ESC.x1, this.origin.z + ESC.zTop, this.origin.y, this.origin.y + GH);
  }

  // ---------------------------------------------------------------- RACK & RUIN (thrift, ground west)
  buildRackAndRuin(kit, P) {
    const chrome = C('#b8bcc4');
    const rng = mulberry(31);
    const thriftCols = ['#c4483a', '#2f5d8a', '#e0a53a', '#4c7a3a', '#7a6a55', '#d77aa0', '#ece8df', '#1f2e4a', '#8a5a2a', '#5ac8d8', '#6b4a8a', '#2b2b30'];
    // a rolling rack: a chrome rail on two T-feet, garments hanging along it
    const rack = (x0, x1, z, kinds) => {
      const R = P(0, z);
      for (const x of [x0, x1]) {
        R.box('solid', x - 0.02, 0, -0.02, x + 0.02, 1.62, 0.02, chrome);
        R.box('solid', x - 0.03, 0.02, -0.3, x + 0.03, 0.06, 0.3, chrome);
      }
      R.box('solid', x0, 1.6, -0.018, x1, 1.636, 0.018, chrome);
      for (let x = x0 + 0.12; x < x1 - 0.08; x += 0.085 + rng() * 0.05) {
        const col = C(thriftCols[Math.floor(rng() * thriftCols.length)]);
        const long = kinds === 'long' || (kinds === 'mixed' && rng() < 0.4);
        const h = long ? 0.95 : 0.6;
        R.box('fabric', x - 0.012, 1.55 - h, -0.24, x + 0.012, 1.55, 0.24, col);
        R.box('solid', x - 0.004, 1.55, -0.008, x + 0.004, 1.63, 0.008, C('#3a3a3a'));
      }
      R.collide(x0 - 0.05, -0.3, x1 + 0.05, 0.3, 1.6);
      R.shadow(x0, -0.3, x1, 0.3, 0.3);
    };
    rack(1.2, 5.4, 4.2, 'short');
    rack(1.2, 5.4, 7.6, 'long');
    rack(1.2, 5.4, 11.0, 'mixed');
    const disp = (id, label, x, z, yaw, items) => this.displays.push({ id, shop: 'rr', label, stand: { ...xz(this.w(x, z)), y: this.origin.y }, yaw, items });
    disp('rr-tops', 'Tees and tops rail', 3.3, 5.0, PI, []);
    disp('rr-outer', 'Jackets and coats rail', 3.3, 8.4, PI, []);
    disp('rr-bottoms', 'Jeans and shorts rail', 3.3, 11.8, PI, []);
    // shoe shelves on the west wall
    const Sh = P(0, 14.5, R90);
    for (let r = 0; r < 4; r++) {
      Sh.box('wood', -1.4, 0.3 + r * 0.42, 0, 1.4, 0.33 + r * 0.42, 0.4, C('#6a4a30'));
      for (let k = 0; k < 7; k++) {
        const x = -1.25 + k * 0.4;
        Sh.box('solid', x, 0.33 + r * 0.42, 0.12, x + 0.24, 0.42 + r * 0.42, 0.32, C(['#8a2a2a', '#1e1e22', '#e8e4dc', '#5a3a26', '#2a3a6a', '#c8a070'][(k + r * 3) % 6]));
      }
    }
    Sh.box('wood', -1.45, 0, 0, -1.4, 1.95, 0.4, C('#5a3a20'));
    Sh.box('wood', 1.4, 0, 0, 1.45, 1.95, 0.4, C('#5a3a20'));
    Sh.collide(-1.45, 0, 1.45, 0.42, 1.95);
    disp('rr-shoes', 'Shoe shelves', 1.2, 14.5, -R90, []);
    // the bargain bin
    const Bn = P(6.2, 9.8);
    Bn.box('solid', -0.6, 0, -0.45, 0.6, 0.72, 0.45, C('#a8845a'));
    for (let k = 0; k < 14; k++) Bn.geo('fabric', new THREE.IcosahedronGeometry(0.16, 0), -0.4 + (k % 5) * 0.2, 0.68 + (k % 3) * 0.04, -0.28 + Math.floor(k / 5) * 0.27, C(thriftCols[(k * 5) % thriftCols.length]), k, 1.3, 0.5, 1);
    Bn.panel('mSigns', -0.55, 0.15, 0.55, 0.6, 0.456, msignUV('chalk'));
    Bn.collide(-0.6, -0.45, 0.6, 0.45, 0.8);
    disp('rr-bin', 'The bargain bin', 7.2, 9.8, -R90, []);
    // a spinner of hats and sunglasses
    const Sp = P(6.4, 13.2);
    Sp.geo('solid', new THREE.CylinderGeometry(0.04, 0.04, 1.7, 8), 0, 0.85, 0, chrome);
    Sp.geo('solid', new THREE.CylinderGeometry(0.3, 0.32, 0.04, 12), 0, 0.02, 0, chrome);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const y = 0.9 + (k % 2) * 0.45;
      if (k % 2) Sp.geo('solid', new THREE.BoxGeometry(0.16, 0.05, 0.05), Math.cos(a) * 0.25, y, Math.sin(a) * 0.25, C(['#a8844a', '#1c1c20', '#c4483a', '#2a3a6a'][k % 4]), -a);
      else Sp.geo('fabric', new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), Math.cos(a) * 0.27, y, Math.sin(a) * 0.27, C(thriftCols[k + 2]));
    }
    Sp.collide(-0.33, -0.33, 0.33, 0.33, 1.7);
    disp('rr-acc', 'Hats and sunglasses spinner', 6.4, 14.1, PI, []);
    // the till: a scuffed counter, a radio, a bell
    const T = P(7.2, 2.4);
    T.box('wood', -0.85, 0, -0.35, 0.85, 1.0, 0.35, C('#7a5a3a'));
    T.box('wood', -0.9, 1.0, -0.4, 0.9, 1.04, 0.4, C('#5a3a20'), { bottom: true });
    T.box('solid', -0.6, 1.04, -0.15, -0.2, 1.22, 0.1, C('#3a3a40'));
    T.box('solid', 0.25, 1.04, -0.2, 0.65, 1.26, 0.05, C('#8a2a2a'));
    T.geo('solid', new THREE.CircleGeometry(0.05, 10), 0.32, 1.15, 0.051, C('#d8d0c0'));
    T.geo('solid', new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.0, 1.04, 0.25, C('#a8844a'));
    T.panel('mSigns', -0.8, 0.35, 0.8, 0.55, 0.356, msignUV('returns'));
    T.collide(-0.9, -0.4, 0.9, 0.4, 1.05);
    this.tills.rr = { stand: xz(this.w(7.2, 3.3)), yaw: PI };
    this.staffSpots.dot = { ...xz(this.w(7.2, 1.55)), y: this.origin.y, yaw: 0 };
    // the fitting room: a curtained booth in the back corner, and a mirror
    const Fr = P(0, 0);
    Fr.box('solid', 1.45, 0, 0, 1.5, 2.2, 1.5, C('#5a3a20'));
    Fr.box('solid', 0, 2.15, 1.45, 1.5, 2.2, 1.5, C('#5a3a20'));
    Fr.box('fabric', 0.05, 0.08, 1.46, 1.42, 2.12, 1.49, C('#8a2a3a'));
    Fr.collide(0, 0, 1.5, 1.5, 2.2);
    P(0.75, 1.52).panel('mSigns', -0.5, 2.25, 0.5, 2.45, 0, msignUV('fitting'));
    P(2.6, 0.02).box('solid', -0.45, 0.25, 0, 0.45, 2.0, 0.03, C('#5a3a20'));
    P(2.6, 0.056).panel('mirror', -0.4, 0.3, 0.4, 1.95, 0.0, [0, 0, 1, 1]);
    this.mirrors.push({ shop: 'rr', stand: { ...xz(this.w(2.6, 1.05)), y: this.origin.y }, yaw: PI });
    // a one-armed mannequin and a dressed one in the street window
    this.mannequins.push({ ...xz(this.w(2.2, 16.1)), y: this.origin.y, yaw: 0, shop: 'rr', wear: { top: 'rr:band', outer: 'rr:denim', bottom: 'rr:flares', shoes: 'rr:bowling', hat: 'rr:trucker' } });
    this.mannequins.push({ ...xz(this.w(5.6, 16.1)), y: this.origin.y, yaw: 0, shop: 'rr', wear: { top: 'rr:wool', outer: 'rr:tweed', bottom: 'basic:pants', shoes: 'basic:shoes', glasses: 'rr:aviators' } });
    for (const x of [2.2, 5.6]) P(x, 16.1).geo('solid', new THREE.CylinderGeometry(0.35, 0.38, 0.12, 14), 0, 0.06, 0, C('#5a3a20'));
    P(0.02, 9.6, R90).panel('mPosters', -0.45, 1.0, 0.45, 2.7, 0.006, [0.75, 0, 1, 1]);
    // fluorescent tubes
    for (const x of [2.2, 6.2])
      for (const z of [2.5, 6.5, 10.5, 14.5]) {
        const L = P(x, z);
        L.box('solid', -0.15, GH - 0.06, -0.7, 0.15, GH - 0.005, 0.7, C('#d8d8d4'), { bottom: true });
        L.box('glow', -0.1, GH - 0.065, -0.65, 0.1, GH - 0.06, 0.65, C('#f0fff4'), { top: false, bottom: true });
        L.light(0, GH - 0.4, 0, '#f2fff0', 0.52, true);
      }
  }

  // ---------------------------------------------------------------- SPLITGRAIN (streetwear, ground east)
  buildSplitgrain(kit, P) {
    const ply = C('#d8b888');
    const black = C('#1c1c20');
    const disp = (id, label, x, z, yaw, items) => this.displays.push({ id, shop: 'sg', label, stand: { ...xz(this.w(x, z)), y: this.origin.y }, yaw, items });
    // the sneaker wall: backlit cubbies, a pair in each
    const S = P(W - 0.02, 7.0, -R90);
    S.box('solid', -5.6, 0, 0, 5.6, 3.2, 0.42, black);
    const shoes = ['#f4f2ec', '#c8e83a', '#17a2a8', '#ff6a2a', '#1c1c20', '#e8322a', '#9aa0a8', '#2f5d8a', '#f4f2ec', '#d8b46a'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 10; c++) {
        const x = -5.3 + c * 1.07;
        const y = 0.4 + r * 0.56;
        S.box('glow', x, y, 0.421, x + 0.9, y + 0.42, 0.426, C('#fff4e0', 0.55));
        S.box('solid', x + 0.15, y + 0.03, 0.426, x + 0.75, y + 0.16, 0.66, C(shoes[(c + r * 3) % shoes.length]));
        S.box('solid', x + 0.15, y, 0.426, x + 0.75, y + 0.03, 0.66, C('#f4f2ec'));
      }
    S.collide(-5.6, 0, 5.6, 0.7, 3.2);
    S.light(0, 2.0, 1.4, '#e8f4ff', 0.75);
    disp('sg-sneakers', 'The sneaker wall', 24.6, 7.0, R90, ['sg:core', 'sg:volt']);
    // the drop: a lit pedestal with a glass case
    const Dp = P(21.0, 5.6);
    Dp.geo('solid', new THREE.CylinderGeometry(0.45, 0.5, 0.95, 16), 0, 0.475, 0, C('#a8a8a4'));
    Dp.box('glass', -0.32, 0.95, -0.32, 0.32, 1.55, 0.32, C('#ffffff'));
    Dp.box('glow', -0.34, 0.9, -0.34, 0.34, 0.93, 0.34, C('#ff8a2a'));
    Dp.collide(-0.5, -0.5, 0.5, 0.5, 1.55);
    Dp.light(0, 3.2, 0, '#fff0e0', 0.6, true);
    P(21.0, 5.6 + 0.51).panel('mSigns', -0.45, 0.3, 0.45, 0.48, 0.0, msignUV('drop'));
    disp('sg-drop', 'The drop case', 21.0, 6.6, PI, ['sg:gr9']); // (shopping.itemsAt swaps in this week's colourway)
    this.dropCase = this.w(21.0, 5.6, 1.0);
    // a concrete table of folded tees
    const Tt = P(22.0, 10.0);
    Tt.box('concrete', -1.0, 0, -0.55, 1.0, 0.8, 0.55, C('#b0b0ac'));
    for (let k = 0; k < 6; k++) for (let s = 0; s < 4; s++) Tt.box('fabric', -0.85 + k * 0.3, 0.8 + s * 0.035, -0.35, -0.62 + k * 0.3, 0.83 + s * 0.035, -0.05, C(k % 2 ? '#1c1c20' : '#f4f2ec'));
    for (let k = 0; k < 6; k++) for (let s = 0; s < 3; s++) Tt.box('fabric', -0.85 + k * 0.3, 0.8 + s * 0.035, 0.05, -0.62 + k * 0.3, 0.83 + s * 0.035, 0.35, C(k % 2 ? '#e8322a' : '#ece8df'));
    Tt.collide(-1.0, -0.55, 1.0, 0.55, 0.95);
    Tt.shadow(-1.0, -0.55, 1.0, 0.55, 0.3);
    disp('sg-tees', 'The tee table', 22.0, 11.1, PI, ['sg:box', 'sg:boxh', 'sg:boxo', 'sg:split', 'sg:splitb']);
    // hoodies and jackets on wall rails along the back
    const rail = (x0, x1, cols, long, id, label, items) => {
      const R = P(0, 0.02);
      R.box('solid', x0, 1.9, 0.0, x1, 1.94, 0.32, black);
      for (let x = x0 + 0.15, k = 0; x < x1 - 0.1; x += 0.16, k++) R.box('fabric', x - 0.025, long ? 0.95 : 1.15, 0.05, x + 0.025, 1.88, 0.55, C(cols[k % cols.length]));
      R.collide(x0, 0, x1, 0.6, 1.9);
      disp(id, label, (x0 + x1) / 2, 1.35, PI, items);
    };
    rail(18.6, 21.9, ['#3a4450', '#ff6a2a', '#1c1c20', '#e8e0cc', '#5a6a3a'], false, 'sg-hoodies', 'The hoodie rail', ['sg:hoodie', 'sg:hoodieo', 'sg:hoodieb', 'sg:hoodiec', 'sg:hoodiem']);
    rail(22.4, 25.2, ['#4a5a3a', '#1c1c20'], true, 'sg-outer', 'The jacket rail', ['sg:bomber', 'sg:bomberb']);
    // cargos stacked on plywood cubes
    const Cg = P(19.8, 13.6);
    Cg.box('wood', -0.55, 0, -0.45, 0.55, 0.7, 0.45, ply);
    for (let s = 0; s < 5; s++) Cg.box('fabric', -0.4, 0.7 + s * 0.05, -0.3, 0.4, 0.74 + s * 0.05, 0.3, C(s % 2 ? '#5a5a48' : '#1c1c20'));
    Cg.collide(-0.55, -0.45, 0.55, 0.45, 0.95);
    disp('sg-bottoms', 'The cargo stack', 19.8, 14.5, PI, ['sg:cargo', 'sg:cargob']);
    // caps, shades and chains in a glass counter
    const Ac = P(23.6, 13.6);
    Ac.box('wood', -0.8, 0, -0.35, 0.8, 0.85, 0.35, black);
    Ac.box('glass', -0.78, 0.85, -0.33, 0.78, 1.1, 0.33, C('#ffffff'));
    for (let k = 0; k < 5; k++) Ac.box('solid', -0.6 + k * 0.28, 0.86, -0.1, -0.45 + k * 0.28, 0.9, 0.1, C(['#1c1c20', '#d0d4dc', '#ff6a2a', '#1c1c20', '#d0d4dc'][k]));
    for (let k = 0; k < 4; k++) Ac.geo('fabric', new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), -0.55 + k * 0.36, 1.1, 0, C(k % 2 ? '#ff6a2a' : '#1c1c20'));
    Ac.collide(-0.8, -0.35, 0.8, 0.35, 1.1);
    disp('sg-acc', 'Caps, shades and chains', 23.6, 14.5, PI, ['sg:cap', 'sg:beanie', 'sg:shades', 'sg:chain']);
    // the till: a plywood block with the SG mark
    const T = P(19.5, 3.2);
    T.box('wood', -1.1, 0, -0.38, 1.1, 1.0, 0.38, ply);
    T.box('solid', -1.15, 1.0, -0.42, 1.15, 1.04, 0.42, black, { bottom: true });
    T.box('solid', 0.3, 1.04, -0.2, 0.7, 1.3, 0.0, C('#2a2a30'));
    T.panel('mSigns', -0.6, 0.45, 0.6, 0.75, 0.386, msignUV('till'));
    T.collide(-1.15, -0.42, 1.15, 0.42, 1.05);
    this.tills.sg = { stand: xz(this.w(19.5, 4.2)), yaw: PI };
    this.staffSpots.kez = { ...xz(this.w(19.5, 2.35)), y: this.origin.y, yaw: 0 };
    // a tall mirror between the sneaker wall and the window
    P(W - 0.02, 14.6, -R90).box('solid', -0.5, 0.1, 0, 0.5, 2.2, 0.04, black);
    P(W - 0.066, 14.6, -R90).panel('mirror', -0.45, 0.15, 0.45, 2.15, 0.0, [0, 0, 1, 1]);
    this.mirrors.push({ shop: 'sg', stand: { ...xz(this.w(W - 1.0, 14.6)), y: this.origin.y }, yaw: R90 });
    // the SG mark in neon on the back wall, the drop poster
    P(18.6, 0.02).panel('mSigns', 0, 2.4, 3.2, 3.0, 0.0, msignUV('split'));
    this.mannequins.push({ ...xz(this.w(19.3, 16.1)), y: this.origin.y, yaw: 0, shop: 'sg', wear: { top: 'sg:hoodieo', outer: null, bottom: 'sg:cargob', shoes: 'sg:volt', hat: 'sg:cap', glasses: 'sg:shades' } });
    this.mannequins.push({ ...xz(this.w(23.2, 16.1)), y: this.origin.y, yaw: 0, shop: 'sg', wear: { top: 'sg:box', outer: 'sg:bomber', bottom: 'sg:cargo', shoes: 'sg:core', chain: 'sg:chain' } });
    for (const x of [19.3, 23.2]) P(x, 16.1).box('concrete', -0.4, 0, -0.4, 0.4, 0.1, 0.4, C('#a8a8a4'));
    // track lights on black rails
    for (const x of [19.8, 23.6]) {
      P(x, 8.5).box('solid', -0.03, GH - 0.06, -7.5, 0.03, GH - 0.01, 7.5, black, { bottom: true });
      for (const z of [2.5, 6.5, 10.5, 14.5]) {
        const L = P(x, z);
        L.geo('solid', new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8), 0, GH - 0.17, 0, black);
        L.geo('glow', new THREE.CircleGeometry(0.05, 8).rotateX(R90), 0, GH - 0.276, 0, C('#fff4dc'));
        L.light(0, GH - 0.5, 0, '#fff0dc', 0.5, true);
      }
    }
  }

  // ---------------------------------------------------------------- MAISON VELLARD (luxury, upper west)
  buildVellard(kit, P) {
    const gold = C('#a8844a');
    const black = C('#141414');
    const y = UP;
    const disp = (id, label, x, z, yaw, items) => this.displays.push({ id, shop: 'mv', label, stand: { ...xz(this.w(x, z)), y: this.origin.y + y }, yaw, items });
    // the watch and jewellery case along the back wall
    const Cs = P(2.8, 0.02, 0, y);
    Cs.box('wood', -1.9, 0, 0, 1.9, 0.9, 0.62, black);
    Cs.box('glass', -1.88, 0.9, 0.02, 1.88, 1.2, 0.6, C('#ffffff'));
    Cs.box('glow', -1.85, 0.9, 0.04, 1.85, 0.905, 0.58, C('#fff0d0'));
    for (let k = 0; k < 6; k++) {
      Cs.geo('solid', new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), 0.35 + k * 0.25, 0.92, 0.32, C(k === 5 ? '#1a1a1e' : '#e8c060'), 0, 1, 1, 1, R90);
      Cs.box('solid', 0.33 + k * 0.25, 0.905, 0.2, 0.37 + k * 0.25, 0.915, 0.44, C('#3a2a1a'));
    }
    Cs.box('solid', -1.6, 0.905, 0.22, -0.4, 0.92, 0.44, C('#2a1a12'));
    for (let k = 0; k < 4; k++) Cs.box('solid', -1.5 + k * 0.3, 0.92, 0.3, -1.3 + k * 0.3, 0.94, 0.36, C(k % 2 ? '#d8b46a' : '#1a1a1e'));
    Cs.collide(-1.9, 0, 1.9, 0.62, 1.2);
    Cs.light(0, 2.0, 0.6, '#fff0d8', 0.55, true);
    disp('mv-watch', 'The watch case', 3.8, 1.25, PI, ['mv:meridian', 'mv:noir', 'mv:grand']);
    disp('mv-acc', 'Sunglasses, chains and caps', 1.8, 1.25, PI, ['mv:riviera', 'mv:cuban', 'mv:diamond', 'mv:cap']);
    P(2.8, 0.02, 0, y).panel('mPosters', -0.45, 1.5, 0.45, 3.4, 0.0, [0, 0, 0.25, 1]);
    // mannequins on plinths along the west wall, and one in the street window
    for (const [z, wear] of [
      [4.8, { top: 'mv:shirt', outer: 'mv:monogram', bottom: 'mv:trousers', shoes: 'mv:loafers', chain: 'mv:cuban', watch: 'mv:meridian' }],
      [7.6, { top: 'mv:knit', outer: 'mv:coat', bottom: 'mv:trousers', shoes: 'mv:court', glasses: 'mv:riviera' }],
    ]) {
      P(1.2, z, 0, y).box('solid', -0.45, 0, -0.45, 0.45, 0.25, 0.45, C('#ece6da'));
      P(1.2, z, 0, y).box('solid', -0.47, 0.25, -0.47, 0.47, 0.27, 0.47, gold, { bottom: true });
      P(1.2, z, 0, y).collide(-0.47, -0.47, 0.47, 0.47, 1.9);
      P(1.2, z, 0, y).light(0.6, 3.0, 0, '#fff0d8', 0.4, true);
      this.mannequins.push({ ...xz(this.w(1.2, z)), y: this.origin.y + y + 0.27, yaw: R90, shop: 'mv', wear });
    }
    disp('mv-outer', 'The coats and jackets', 2.4, 6.2, -R90, ['mv:monogram', 'mv:coat', 'mv:coatn', 'mv:coatb', 'mv:coatg', 'mv:coatr', 'mv:shearling']);
    this.mannequins.push({ ...xz(this.w(1.7, 16.25)), y: this.origin.y + y + 0.27, yaw: 0, shop: 'mv', wear: { top: 'mv:knit', outer: 'mv:coatn', bottom: 'mv:trousers', shoes: 'mv:loafers', watch: 'mv:noir' } });
    P(1.7, 16.25, 0, y).box('solid', -0.42, 0, -0.42, 0.42, 0.27, 0.42, black);
    P(1.7, 16.25, 0, y).collide(-0.42, -0.42, 0.42, 0.42, 1.9);
    // knits and shirts in lit niches on the west wall
    const N = P(0.02, 11.0, R90, y);
    N.box('wood', -1.5, 0.4, 0, 1.5, 2.6, 0.38, C('#2a1a12'));
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const x = -1.35 + c * 0.95;
        const yy = 0.55 + r * 0.68;
        N.box('glow', x, yy, 0.381, x + 0.8, yy + 0.55, 0.386, C('#e8c890', 0.45));
        for (let s = 0; s < 3; s++) N.box('fabric', x + 0.12, yy + s * 0.05, 0.386, x + 0.68, yy + 0.045 + s * 0.05, 0.62, C(['#efe6d2', '#26262c', '#c9a878'][(r + c) % 3]));
      }
    N.collide(-1.5, 0, 1.5, 0.65, 2.6);
    disp('mv-tops', 'Shirts and knits', 1.4, 11.0, -R90, ['mv:shirt', 'mv:knit', 'mv:knitc', 'mv:knitw']);
    // a low marble table of folded trousers, and a round shoe plinth
    const Tb = P(3.8, 9.2, 0, y);
    Tb.box('marble', -0.8, 0, -0.4, 0.8, 0.55, 0.4, C('#ece6da'));
    for (let k = 0; k < 3; k++) for (let s = 0; s < 3; s++) Tb.box('fabric', -0.65 + k * 0.48, 0.55 + s * 0.04, -0.2, -0.25 + k * 0.48, 0.585 + s * 0.04, 0.2, C('#22283a'));
    Tb.collide(-0.8, -0.4, 0.8, 0.4, 0.7);
    Tb.shadow(-0.8, -0.4, 0.8, 0.4, 0.3);
    disp('mv-bottoms', 'Tailored trousers', 3.8, 10.1, PI, ['mv:trousers']);
    const Sp = P(4.2, 4.0, 0, y);
    Sp.geo('marble', new THREE.CylinderGeometry(0.6, 0.62, 0.7, 20), 0, 0.35, 0, C('#ece6da'));
    Sp.geo('solid', new THREE.CylinderGeometry(0.62, 0.62, 0.02, 20), 0, 0.71, 0, gold);
    Sp.box('solid', -0.35, 0.72, -0.1, -0.05, 0.84, 0.18, C('#3a2416'));
    Sp.box('solid', 0.05, 0.72, -0.1, 0.35, 0.84, 0.18, C('#f4f2ec'));
    Sp.collide(-0.62, -0.62, 0.62, 0.62, 0.9);
    Sp.light(0, 3.0, 0, '#fff0d8', 0.45, true);
    disp('mv-shoes', 'The shoe plinth', 4.2, 4.95, PI, ['mv:loafers', 'mv:court']);
    // the till: a black marble desk by the door
    const T = P(5.3, 12.0, 0, y);
    T.box('marble', -0.75, 0, -0.35, 0.75, 0.95, 0.35, C('#2a2a2e'));
    T.box('solid', -0.78, 0.95, -0.38, 0.78, 0.98, 0.38, gold, { bottom: true });
    T.box('solid', 0.25, 0.98, 0.0, 0.55, 1.2, 0.2, C('#1a1a1e'));
    T.collide(-0.78, -0.38, 0.78, 0.38, 1.0);
    this.tills.mv = { stand: xz(this.w(5.3, 11.15)), yaw: 0 };
    this.staffSpots.celeste = { ...xz(this.w(5.3, 12.85)), y: this.origin.y + y, yaw: PI };
    this.staffSpots.anton = { ...xz(this.w(7.15, 9.55)), y: this.origin.y + y, yaw: R90 };
    // the salon: a velvet sofa, a mirror, champagne on a side table, a rug
    F.rug(P(3.2, 15.2, 0, y), { w: 3.2, l: 2.2, key: 'rugPersian' });
    F.sofa(P(4.4, D - 0.05, PI, y), { w: 2.0, col: '#5a1a2a', style: 'modern', accent: '#a8844a' });
    const St = P(5.75, 15.9, 0, y);
    St.geo('solid', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), 0, 0.55, 0, gold);
    St.geo('solid', new THREE.CylinderGeometry(0.02, 0.03, 0.55, 6), 0, 0.275, 0, gold);
    St.geo('solid', new THREE.CylinderGeometry(0.07, 0.06, 0.16, 10), -0.06, 0.64, 0, C('#c8ccd0'));
    St.geo('solid', new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), -0.06, 0.78, 0, C('#2a4a2a'));
    St.geo('solid', new THREE.CylinderGeometry(0.025, 0.01, 0.08, 8), 0.08, 0.66, 0.03, C('#f8f0d8'));
    P(0.02, 15.0, R90, y).box('solid', -0.7, 0.2, 0, 0.7, 2.6, 0.04, gold);
    P(0.066, 15.0, R90, y).panel('mirror', -0.62, 0.28, 0.62, 2.52, 0.0, [0, 0, 1, 1]);
    this.mirrors.push({ shop: 'mv', stand: { ...xz(this.w(1.2, 15.0)), y: this.origin.y + y }, yaw: -R90 });
    this.salon = { seat: { ...xz(this.w(4.4, D - 0.62)), y: this.origin.y + y, yaw: PI }, flute: this.w(5.83, 15.93, y + 0.66) };
    P(6.4, 11.0, -R90, y).panel('mSigns', -0.9, 2.95, 0.9, 3.12, 0.006, msignUV('wish'));
    // a chandelier and warm downlights
    const Ch = P(3.2, 8.5, 0, y);
    Ch.box('solid', -0.006, 2.6, -0.006, 0.006, H - y, 0.006, gold);
    Ch.geo('solid', new THREE.TorusGeometry(0.55, 0.03, 6, 20), 0, 2.6, 0, gold, 0, 1, 1, 1, R90);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      Ch.geo('glow', new THREE.SphereGeometry(0.05, 6, 5), Math.cos(a) * 0.55, 2.68, Math.sin(a) * 0.55, C('#fff2d0'));
    }
    Ch.light(0, 2.4, 0, '#ffe8c0', 0.6);
    for (const x of [1.6, 4.8])
      for (const z of [2.2, 5.2, 8.2, 11.2, 14.4]) {
        const L = P(x, z, 0, y);
        L.geo('glow', new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12), 0, H - y - 0.012, 0, C('#fff2e0'));
        L.light(0, H - y - 0.3, 0, '#ffe8c8', 0.24, true);
      }
  }

  // ---------------------------------------------------------------- ROOMSET (furniture, upstairs east)
  // A furniture showroom staged like rooms you could live in. Every piece on the floor
  // is the real catalog piece (game/furniture.js), built with the same kit.
  buildRoomset(kit, P) {
    const y = UP;
    const disp = (id, label, x, z, yaw, items) => this.displays.push({ id, shop: 'rs', label, stand: { ...xz(this.w(x, z)), y: this.origin.y + y }, yaw, items });
    // the collection pieces are dressed with stock: the best sneakers, the best watches, every toy
    const demo = {
      shoes: ITEMS.filter((it) => it.slot === 'shoes' && !it.basic && !it.gem).sort((a, b) => b.price - a.price).slice(0, 12),
      jewels: ITEMS.filter((it) => it.slot === 'watch' || it.slot === 'chain').sort((a, b) => b.price - a.price).slice(0, 8),
      toys: TOYS,
    };
    const put = (id, x, z, r = 0, variant = 0) => {
      const ctx = { variant, dyn: [], ...demo };
      FURN[id].build(P(x, z, r, y), ctx);
      return ctx;
    };
    // a living room against the back wall: the cloud sofa under two prints, a rug, glass, an arc lamp
    put('rugModern', 23.9, 1.9);
    put('cloud', 23.9, 0.04);
    put('coffeeGlass', 23.9, 2.0);
    put('arcLamp', 25.55, 1.75, -R90);
    put('fig', 25.6, 0.4);
    put('armchair', 22.2, 1.9, R90);
    put('floorLamp', 22.2, 0.45);
    put('sideTable', 25.4, 2.7);
    put('print', 23.2, 0.004, 0, 1);
    put('print', 24.6, 0.004, 0, 3);
    const So = P(23.9, 0.04, 0, y);
    for (const sx of [-0.8, 0, 0.8]) {
      const s = So.point(sx, 0, 0.5);
      const out = So.point(sx, 0, 1.35);
      this.seats.push({ x: s.x, z: s.z, y: this.origin.y + y, yaw: 0, out: xz(out), mall: true, showroom: 'the cloud sofa' });
    }
    {
      const A = P(22.2, 1.9, R90, y);
      this.seats.push({ ...xz(A.point(0, 0, 0.45)), y: this.origin.y + y, yaw: R90, out: xz(A.point(-0.9, 0, 0.5)), mall: true, showroom: 'the armchair' });
    }
    disp('rs-seating', 'Sofas and chairs', 23.2, 3.6, PI, ['beanbag', 'armchair', 'sofa', 'cloud', 'lounger']);
    disp('rs-tables', 'Tables, desks, lamps and plants', 25.0, 3.55, PI, ['sideTable', 'coffeeGlass', 'dining', 'tradeDesk', 'floorLamp', 'arcLamp', 'plant', 'fig', 'olive']);
    // the collectors' corner, in the window
    put('sneakerWall', 20.65, 0.02);
    put('watchCase', 20.2, 2.0, R90);
    put('sculpture', 20.25, 3.5);
    disp('rs-collect', 'Collectors\' corner', 21.25, 2.0, -R90, ['sneakerWall', 'watchCase', 'trophyShelf', 'photoWall']);
    // the big ticket wall: the arcade, the aquarium (with fish), the jukebox; the hot tub in the corner
    put('arcade', 25.99, 4.6, -R90);
    this.tankDyn = put('aquarium', 25.99, 6.3, -R90).dyn.find((d) => d.type === 'fish');
    put('jukebox', 25.99, 8.1, -R90);
    put('hotTub', 24.65, 10.85, PI);
    put('oil', 24.65, PART - 0.104, PI);
    disp('rs-big', 'The big ticket', 24.2, 7.2, R90, ['aquarium', 'homeBar', 'arcade', 'jukebox', 'hotTub']);
    // the home bar against the back wall of the room, the art wall by the door
    put('homeBar', 21.4, PART - 0.11, PI);
    put('neon', 19.604, 8.0, R90);
    put('print', 19.604, 9.35, R90, 5);
    put('print', 19.604, 10.25, R90, 6);
    put('poster', 19.604, 11.3, R90, 1);
    disp('rs-art', 'The art wall', 20.85, 9.4, -R90, ['print', 'poster', 'oil', 'neon', 'sculpture']);
    // rugs piled on a low platform
    const Rg = P(22.6, 7.7, 0, y);
    Rg.box('wood', -1.05, 0, -0.75, 1.05, 0.1, 0.75, C('#3a2a1e'));
    Rg.collide(-1.05, -0.75, 1.05, 0.75, 0.5).shadow(-1.05, -0.75, 1.05, 0.75, 0.35);
    for (const [key, w, l, rot, yy, dx, dz] of [
      ['rugStripe', 1.9, 1.3, 0.12, 0.104, -0.05, 0.05],
      ['rugModern', 1.8, 1.2, -0.08, 0.112, 0.05, -0.03],
      ['rugPersian', 1.7, 1.12, 0.03, 0.12, 0, 0],
    ])
      P(22.6 + dx, 7.7 + dz, rot, y + yy).quad(key, [-w / 2, 0, l / 2], [w / 2, 0, l / 2], [w / 2, 0, -l / 2], [-w / 2, 0, -l / 2], [0, 1, 0], [0, 0, 1, 1]);
    disp('rs-rugs', 'Rugs', 22.6, 6.45, 0, ['rugStripe', 'rugModern', 'rugPersian']);
    // the desk: Ines, a tablet, fabric swatches, a vase of eucalyptus
    const T = P(23.6, 5.4, 0, y);
    T.box('wood', -0.65, 0, -0.25, 0.65, 0.95, 0.25, C('#d8ccb8'));
    T.box('solid', -0.68, 0.95, -0.28, 0.68, 0.98, 0.28, C('#2a3a4a'), { bottom: true });
    T.box('solid', 0.2, 0.98, -0.12, 0.5, 1.2, -0.09, C('#1a1a1e'));
    T.box('glow', 0.22, 1.0, -0.125, 0.48, 1.18, -0.12, C('#6a8aa8', 0.7));
    for (let k = 0; k < 4; k++) T.box('fabric', -0.55 + k * 0.012, 0.98 + k * 0.008, 0.02 - k * 0.03, -0.25 + k * 0.012, 0.986 + k * 0.008, 0.2 - k * 0.03, C(['#c8b89a', '#4a2e1e', '#2a3a4a', '#8a2a2a'][k]));
    T.geo('glass', new THREE.CylinderGeometry(0.06, 0.05, 0.22, 10), -0.05, 1.09, -0.1, C('#ffffff'));
    for (const a of [-0.3, 0, 0.35]) T.geo('solid', new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), -0.05 + Math.sin(a) * 0.08, 1.3, -0.1, C('#6a8a6a'), 0, 1, 1, 1, 0, a);
    T.panel('mSigns', -0.45, 0.45, 0.45, 0.67, 0.256, msignUV('till'));
    T.collide(-0.68, -0.28, 0.68, 0.28, 1.0);
    this.tills.rs = { stand: xz(this.w(23.6, 6.1)), yaw: PI };
    this.staffSpots.ines = { ...xz(this.w(23.6, 4.72)), y: this.origin.y + y, yaw: 0 };
    // signs: the fascia over the door, the delivery promise over the window
    const uv = msignUV('roomset');
    const mid = (uv[1] + uv[3]) / 2;
    P(19.4, 6.1, -R90, y).panel('mSigns', -1.5, 3.05, 1.5, 3.61, 0.006, [uv[0], mid, uv[2], uv[3]]);
    P(19.4, 2.6, -R90, y).panel('mSigns', -1.5, 3.15, 1.5, 3.71, 0.006, [uv[0], uv[1], uv[2], mid]);
    // light: warm downlights, a pendant over the sofa
    for (const x of [20.8, 23.0, 25.0])
      for (const z of [1.6, 4.6, 7.6, 10.6]) {
        const L = P(x, z, 0, y);
        L.geo('glow', new THREE.CylinderGeometry(0.09, 0.09, 0.012, 12), 0, H - y - 0.012, 0, C('#fff2e0'));
        L.light(0, H - y - 0.3, 0, '#ffe8c8', 0.22, true);
      }
    const Pd = P(23.9, 2.0, 0, y);
    Pd.box('solid', -0.005, 2.75, -0.005, 0.005, H - y, 0.005, C('#2a2a2a'));
    Pd.geo('solid', new THREE.SphereGeometry(0.3, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.45, 0, C('#2a3a4a'));
    Pd.geo('glow', new THREE.CircleGeometry(0.26, 14).rotateX(R90), 0, 2.445, 0, C('#fff0d8'));
    Pd.light(0, 2.3, 0, '#ffe2b8', 0.45, true);
  }

  // ---------------------------------------------------------------- the closed shop upstairs
  buildClosedFronts(kit, P) {
    const y = UP;
    // BRIGHTWIRE: shutters down over a wall of TVs, still on
    const B = P(19.4, 14.6, -R90, y);
    B.box('solid', -2.05, 0.2, 0, 2.05, 3.1, 0.05, C('#0a0e14'));
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const x = -1.78 + c * 1.2;
        const yy = 0.45 + r * 0.85;
        B.box('solid', x, yy, 0.05, x + 1.15, yy + 0.7, 0.1, C('#1a1a1e'));
        B.quad('tv', [x + 0.05, yy + 0.05, 0.106], [x + 1.1, yy + 0.05, 0.106], [x + 1.1, yy + 0.65, 0.106], [x + 0.05, yy + 0.65, 0.106], [0, 0, 1], [0, 0, 1, 1]);
      }
    for (let k = 0; k < 16; k++) B.box('solid', -2.05, 0.2 + k * 0.18, 0.16, 2.05, 0.24 + k * 0.18, 0.2, C('#8a8c90'));
    B.panel('mSigns', -1.5, 3.2, 1.5, 3.62, 0.006, msignUV('bright'));
    B.panel('mSigns', 1.05, 1.6, 1.9, 2.3, 0.205, msignUV('refit'));
    B.light(0, 1.5, 0.5, '#5ae8ff', 0.4);
    // people stop to look in the windows
    this.lookouts.push({ ...xz(this.w(18.6, 14.6)), y: this.origin.y + UP, yaw: R90 });
    this.lookouts.push({ ...xz(this.w(18.6, 2.6)), y: this.origin.y + UP, yaw: R90 });
    this.lookouts.push({ ...xz(this.w(7.4, 3.5)), y: this.origin.y + UP, yaw: -R90 });
  }

  // ==========================================================================
  buildDynamic() {
    const o = this.origin;
    // escalator steps riding the incline
    const sb = new GeoBuilder();
    sb.box(-0.53, -0.06, -0.19, 0.53, 0.0, 0.19, { color: shade('#5a5c62'), bottom: true });
    sb.box(-0.53, -0.004, 0.15, 0.53, 0.002, 0.19, { color: shade('#e8c030') });
    const N = 22;
    this.steps = new THREE.InstancedMesh(sb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), N * 2);
    this.steps.frustumCulled = false;
    this.stepN = N;
    this.group.add(this.steps);
    this.stepT = 0;
    // fountain water: a few dozen droplets arcing off the top tier
    const n = 60;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    this.drops = new THREE.Points(g, additive({ map: this.cityTex.glow, color: new THREE.Color('#bfe8ff'), size: 0.09, points: true, opacity: 0.8 }));
    this.drops.frustumCulled = false;
    this.dropSeeds = Array.from({ length: n }, (_, k) => [((k * 0.618) % 1) * Math.PI * 2, (k * 0.377) % 1, k % 2]);
    this.group.add(this.drops);
    const sheet = new THREE.Mesh(new THREE.CircleGeometry(FOUNT.r - 0.13, 24).rotateX(-R90), new THREE.MeshBasicMaterial({ color: '#7ac8e8', transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    sheet.position.copy(this.w(FOUNT.x, FOUNT.z, 0.36));
    sheet.renderOrder = 4;
    this.waterMat = sheet.material;
    this.group.add(sheet);
    // ROOMSET's aquarium has real fish in it
    if (this.tankDyn) this.tank = new FishTank(this.group, this.tankDyn);
    // SPLITGRAIN's drop case: this week's Grain Runner 9 (setDropLook recolours it)
    const shoe = new GeoBuilder();
    shoe.box(-0.2, 0.035, -0.08, 0.2, 0.13, 0.12, { color: [1, 1, 1], bottom: false });
    const sole = new GeoBuilder();
    sole.box(-0.205, 0, -0.085, 0.205, 0.035, 0.125, { color: [1, 1, 1], bottom: false });
    this.dropShoe = new THREE.Group();
    this.dropShoe.add(new THREE.Mesh(shoe.build(), new THREE.MeshLambertMaterial({ color: '#17a2a8', vertexColors: true })));
    this.dropShoe.add(new THREE.Mesh(sole.build(), new THREE.MeshLambertMaterial({ color: '#ff8a2a', vertexColors: true })));
    this.dropShoe.position.copy(this.w(21.0, 5.6, 0.95));
    this.group.add(this.dropShoe);
  }

  /** The shoe in SPLITGRAIN's drop case: this week's colourway. */
  setDropLook(look) {
    const [upper, sole] = this.dropShoe.children;
    upper.material.color.set(look.shoes);
    sole.material.color.set(look.sole);
  }

  buildExterior() {
    const o = this.origin;
    const s = this.site;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;
    const Zf = o.z + D + 0.3;
    const Yb = CITY.CURB;
    this.Zf = Zf;
    // --- the shell: a granite plinth, pale limestone, a cornice
    const shell = new GeoBuilder();
    const bands = [
      [Yb, ly(0.6), '#4a4a50'],
      [ly(0.6), ly(H + 0.3), '#e4dccb'],
      [ly(H + 0.3), ly(ROOF), '#c8b89a'],
    ];
    const S = 3;
    const face = (ax, az, bx, bz, y0, y1, n) => {
      for (const [b0, b1, col] of bands) {
        const ya = Math.max(y0, b0);
        const yb = Math.min(y1, b1);
        if (yb - ya < 0.001) continue;
        const len = Math.hypot(bx - ax, bz - az);
        const u0 = n[2] ? (n[2] > 0 ? ax : -ax) : n[0] > 0 ? -az : az;
        shell.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], n, [u0 / S, ya / S, (u0 + len) / S, yb / S], shade(col));
      }
    };
    // the front: everything that isn't glass (local x ranges and heights of the openings)
    const holes = [
      [0.6, 5.9, 0.45, 3.7],
      [0.6, 5.9, UP + 0.8, UP + 3.5],
      [6.7, 8.3, 0.45, 3.7],
      [6.7, 8.3, UP + 0.4, UP + 3.6],
      [8.7, 11.3, 0.12, 8.4],
      [DOOR[0], DOOR[1], 0, 3.0],
      [DOOR[0], DOOR[1], 3.3, 8.4],
      [14.7, 17.3, 0.12, 8.4],
      [17.7, 19.3, 0.45, 3.7],
      [17.7, 19.3, UP + 0.4, UP + 3.6],
      [20.1, 25.4, 0.45, 3.7],
    ];
    for (const [x0, x1, y0, y1] of solidAround(-0.3, W + 0.3, 0, ROOF - 0.0, holes)) face(lx(x0), Zf, lx(x1), Zf, y0 <= 0 ? Yb : ly(y0), ly(y1), [0, 0, 1]);
    face(lx(W + 0.3), o.z - 0.3, lx(-0.3), o.z - 0.3, Yb, ly(ROOF), [0, 0, -1]);
    face(lx(-0.3), o.z - 0.3, lx(-0.3), Zf, Yb, ly(ROOF), [-1, 0, 0]);
    face(lx(W + 0.3), Zf, lx(W + 0.3), o.z - 0.3, Yb, ly(ROOF), [1, 0, 0]);
    this.outside.add(new THREE.Mesh(shell.build(), new THREE.MeshLambertMaterial({ map: this.tex.plaster.map, vertexColors: true })));

    // --- roof, parapet cap, cornice, the glass roof over the atrium, the canopy, the plaza
    const st = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, col, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: shade(col), bottom: true, ...op });
    // roof slab around the glass roof's opening
    box(lx(-0.27), ly(H + 0.36), o.z - 0.27, lx(8.4), ly(H + 0.5), Zf - 0.03, '#8a8a88');
    box(lx(17.6), ly(H + 0.36), o.z - 0.27, lx(W + 0.27), ly(H + 0.5), Zf - 0.03, '#8a8a88');
    box(lx(8.4), ly(H + 0.36), o.z - 0.27, lx(17.6), ly(H + 0.5), o.z + 2.38, '#8a8a88');
    box(lx(-0.35), ly(ROOF), o.z - 0.35, lx(W + 0.35), ly(ROOF + 0.12), o.z - 0.05, '#d8ccb0');
    box(lx(-0.35), ly(ROOF), Zf - 0.25, lx(W + 0.35), ly(ROOF + 0.12), Zf + 0.05, '#d8ccb0');
    box(lx(-0.35), ly(ROOF), o.z - 0.05, lx(-0.05), ly(ROOF + 0.12), Zf - 0.25, '#d8ccb0');
    box(lx(W + 0.05), ly(ROOF), o.z - 0.05, lx(W + 0.35), ly(ROOF + 0.12), Zf - 0.25, '#d8ccb0');
    box(lx(-0.35), ly(H + 0.3), Zf, lx(W + 0.35), ly(H + 0.42), Zf + 0.12, '#d8ccb0'); // cornice
    box(lx(-0.35), ly(UP - 0.05), Zf, lx(8.5), ly(UP + 0.08), Zf + 0.08, '#d8ccb0'); // a string course between the floors
    box(lx(17.5), ly(UP - 0.05), Zf, lx(W + 0.35), ly(UP + 0.08), Zf + 0.08, '#d8ccb0');
    // the entrance canopy: steel frame, glass top, two slim columns
    box(lx(10.4), ly(3.25), Zf, lx(15.6), ly(3.4), Zf + 2.6, '#2a3040');
    for (const x of [10.6, 15.4]) box(lx(x) - 0.06, Yb, Zf + 2.36, lx(x) + 0.06, ly(3.25), Zf + 2.48, '#2a3040');
    // plaza paving, planters with clipped hedges, the gold ring sculpture's plinth, lamp posts
    const pz = new GeoBuilder();
    pz.box(s.x0, CITY.CURB, Zf, s.x1, CITY.CURB + 0.03, s.z1, { sx: 3, sy: 3, topScale: 3, bottom: false });
    this.outside.add(new THREE.Mesh(pz.build(), new THREE.MeshLambertMaterial({ map: this.tex.marble.map, color: '#d8d4cc' })));
    const P0 = CITY.CURB + 0.03;
    const col = this.city.colliders;
    for (const x of [1.5, 22.5]) {
      box(lx(x), P0, Zf + 1.4, lx(x + 2.6), P0 + 0.55, Zf + 2.6, '#c8c0b0');
      box(lx(x) + 0.05, P0 + 0.5, Zf + 1.45, lx(x + 2.6) - 0.05, P0 + 0.85, Zf + 2.55, '#3f6b2e');
      col.add(lx(x), Zf + 1.4, lx(x + 2.6), Zf + 2.6, P0 - 0.03, P0 + 0.9);
    }
    box(lx(5.6), P0, Zf + 3.3, lx(7.0), P0 + 0.6, Zf + 4.7, '#2a2a30');
    col.add(lx(5.6), Zf + 3.3, lx(7.0), Zf + 4.7, 0, P0 + 2.6);
    for (const x of [-0.3, W + 0.3]) {
      box(lx(x) - 0.08, P0, s.z1 - 0.9, lx(x) + 0.08, P0 + 4.6, s.z1 - 0.74, '#2a3040');
      col.add(lx(x) - 0.15, s.z1 - 0.95, lx(x) + 0.15, s.z1 - 0.7, 0, 5);
    }
    // benches on the plaza
    this.plazaSeats = [];
    for (const x of [19.0, 9.0]) {
      box(lx(x - 0.9), P0 + 0.4, Zf + 4.6, lx(x + 0.9), P0 + 0.46, Zf + 5.05, '#a8784a');
      for (const dx of [-0.75, 0.75]) box(lx(x + dx) - 0.05, P0, Zf + 4.65, lx(x + dx) + 0.05, P0 + 0.4, Zf + 5.0, '#3a3c40');
      col.add(lx(x - 0.9), Zf + 4.6, lx(x + 0.9), Zf + 5.05, P0 - 0.03, P0 + 0.5);
      for (const dx of [-0.42, 0.42]) this.seats.push({ x: lx(x + dx), z: Zf + 4.82, y: CITY.CURB, yaw: PI, out: { x: lx(x + dx), z: Zf + 4.1 }, plaza: true });
    }
    this.outside.add(new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    // the glass roof (seen from outside and in)
    const gr = new GeoBuilder();
    const y0 = ly(H + 0.36);
    const y1 = ly(RIDGE);
    const z0 = o.z + 2.38;
    const z1 = Zf;
    gr.quad([lx(8.5), y0, z1], [lx(13), y1, z1], [lx(13), y1, z0], [lx(8.5), y0, z0], [-0.6, 0.8, 0], [0, 0, 1, 1]);
    gr.quad([lx(13), y1, z1], [lx(17.5), y0, z1], [lx(17.5), y0, z0], [lx(13), y1, z0], [0.6, 0.8, 0], [0, 0, 1, 1]);
    gr.quad([lx(8.5), y0, z1], [lx(17.5), y0, z1], [lx(13), y1, z1], [lx(13), y1, z1], [0, 0, 1], [0, 0, 1, 1]);
    gr.quad([lx(17.5), y0, z0], [lx(8.5), y0, z0], [lx(13), y1, z0], [lx(13), y1, z0], [0, 0, -1], [0, 0, 1, 1]);
    const glass = new THREE.Mesh(gr.build(), new THREE.MeshBasicMaterial({ color: '#a8c8e0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    glass.renderOrder = 5;
    this.outside.add(glass);

    // --- the signs: HALCYON GALLERIA over the doors, the shops' names on the facade
    const signTex = this.gt.msigns;
    this.signMat = new THREE.MeshLambertMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 });
    const sq = new GeoBuilder();
    const sign = (key, x0, x1, ya, yb, z) => sq.quad([lx(x0), ly(ya), z], [lx(x1), ly(ya), z], [lx(x1), ly(yb), z], [lx(x0), ly(yb), z], [0, 0, 1], msignUV(key));
    sign('galleria', 8.6, 17.4, 3.45, 4.3, Zf + 2.62);
    sign('rack', 1.2, 5.3, 3.85, 4.55, Zf + 0.01);
    sign('split', 20.6, 24.9, 3.85, 4.55, Zf + 0.01);
    sign('vellard', 0.9, 5.6, H - 0.95 + 0.4, H - 0.15 + 0.3, Zf + 0.01);
    sign('bright', 20.4, 25.2, UP + 1.6, UP + 2.5, Zf + 0.01);
    sign('hours', 15.0, 16.6, 1.5, 1.85, Zf + 0.01);
    this.outside.add(new THREE.Mesh(sq.build(), this.signMat));
    box(lx(8.6), ly(3.4), Zf + 2.58, lx(17.4), ly(4.35), Zf + 2.6, '#16224a');
    // at night: a warm pool on the plaza, a gold line under the cornice
    this.poolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffe8c8'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, s.z1 - Zf + 3).rotateX(-R90), this.poolMat);
    pool.position.set(lx(W / 2), CITY.CURB + 0.045, (Zf + s.z1) / 2 + 0.5);
    pool.renderOrder = 2;
    this.outside.add(pool);
    this.neonMat = additive({ map: null, color: new THREE.Color('#ffd890'), opacity: 0 });
    const ng = new GeoBuilder();
    ng.quad([lx(-0.3), ly(H + 0.22), Zf + 0.13], [lx(W + 0.3), ly(H + 0.22), Zf + 0.13], [lx(W + 0.3), ly(H + 0.28), Zf + 0.13], [lx(-0.3), ly(H + 0.28), Zf + 0.13], [0, 0, 1]);
    this.outside.add(new THREE.Mesh(ng.build(), this.neonMat));
    // the gold ring sculpture on the plaza (it turns, slowly)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 28), new THREE.MeshLambertMaterial({ color: '#d8b46a', emissive: '#3a2a10' }));
    ring.position.set(lx(6.3), P0 + 1.65, Zf + 4.0);
    this.ring = ring;
    this.outside.add(ring);
    this.outsideSpot = { x: lx(13), z: s.z1 + 1.2, yaw: PI };
    this.doorCenter = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.15);
  }

  buildDoors() {
    const o = this.origin;
    const mk = () => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      const fr = shade('#2a3040');
      b.box(-0.75, 0, -0.03, 0.75, 0.06, 0.03, { color: fr, bottom: true });
      b.box(-0.75, 2.92, -0.03, 0.75, 2.98, 0.03, { color: fr, bottom: true });
      b.box(-0.75, 0, -0.03, -0.71, 2.98, 0.03, { color: fr });
      b.box(0.71, 0, -0.03, 0.75, 2.98, 0.03, { color: fr });
      b.box(-0.2, 1.0, 0.03, 0.2, 1.06, 0.06, { color: shade('#d8b46a') });
      g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 2.86), new THREE.MeshBasicMaterial({ color: '#a8d8e0', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.y = 1.49;
      glass.renderOrder = 5;
      g.add(glass);
      this.outside.add(g);
      return g;
    };
    this.doorL = mk();
    this.doorR = mk();
    this.doorOpen = 0;
    // locked outside opening hours
    this.gate = this.city.colliders.add(o.x + DOOR[0], o.z + D - 0.05, o.x + DOOR[1], o.z + D + 0.32, o.y, o.y + 3.0);
    this.gateTop = this.gate.y1;
    this.positionDoors();
    // the mall's ATM works like any other
    this.city.interactables.push({ type: 'atm', x: this.atm.x, z: this.atm.z, r: 1.1, label: 'Use ATM', y: o.y });
  }

  positionDoors() {
    const o = this.origin;
    const z = o.z + D + 0.15;
    this.doorL.position.set(o.x + DOOR[0] + 0.75 - this.doorOpen * 1.45, o.y, z);
    this.doorR.position.set(o.x + DOOR[1] - 0.75 + this.doorOpen * 1.45, o.y, z);
  }

  // ---------------------------------------------------------------- where people walk
  buildGraph() {
    const N = [];
    const add = (id, x, z, y = 0) => N.push({ id, ...xz(this.w(x, z)), y: this.origin.y + y, links: [] });
    // ground: the doors, round the fountain, both sides of the atrium, the concourse
    add('door', 13, 16.6);
    add('fw', 10.6, 15.9);
    add('fe', 15.4, 15.9);
    add('gw1', 10.4, 12.4);
    add('ge1', 15.6, 12.4);
    add('gw2', 10.2, 7.2);
    add('ge2', 15.8, 7.2);
    add('gw3', 10.2, 3.6);
    add('ge3', 15.8, 3.6);
    add('cw', 10.2, 1.6);
    add('ce', 16.2, 2.2);
    add('escUp', 12.15, ESC.zBot + 0.7); // the up escalator's foot
    add('escDn', 13.85, ESC.zBot + 0.7); // where the down one lets you off
    add('rrOut', 9.5, 6.7);
    add('rrIn', 7.5, 6.7);
    add('rr1', 6.0, 5.8);
    add('rr2', 6.0, 9.3);
    add('rr3', 6.6, 12.4);
    add('rr4', 2.0, 13.2);
    add('rrTill', 7.2, 3.4);
    add('sgOut', 16.5, 6.7);
    add('sgIn', 18.5, 6.7);
    add('sg1', 19.8, 8.6);
    add('sg2', 23.6, 8.4);
    add('sg3', 22.2, 12.6);
    add('sgTill', 19.5, 4.4);
    // upper: the walkways and MAISON VELLARD
    add('uTop', 12.15, ESC.zTop - 0.9, UP); // the up escalator lets you off here
    add('uDn', 13.85, ESC.zTop - 0.9, UP); // the down one's head
    add('ub1', 9.2, 1.3, UP);
    add('ub2', 16.8, 1.3, UP);
    add('uw1', 7.5, 3.5, UP);
    add('uw2', 7.5, 8.0, UP);
    add('uw3', 7.5, 13.5, UP);
    add('ue1', 18.5, 3.5, UP);
    add('ue2', 18.5, 9.0, UP);
    add('ue3', 18.5, 14.5, UP);
    add('mvIn', 5.6, 8.0, UP);
    add('mv1', 3.6, 6.0, UP);
    add('mv2', 3.4, 2.4, UP);
    add('mv3', 3.0, 12.6, UP);
    add('rsOut', 18.6, 6.1, UP);
    add('rsIn', 20.4, 6.1, UP);
    add('rs1', 22.0, 4.2, UP);
    add('rs2', 24.7, 4.2, UP);
    add('rs3', 21.0, 9.4, UP);
    const id = Object.fromEntries(N.map((n, k) => [n.id, k]));
    const link = (a, b, kind = 'walk') => {
      N[id[a]].links.push({ to: id[b], kind });
      if (kind === 'walk') N[id[b]].links.push({ to: id[a], kind });
    };
    for (const [a, b] of [
      ['door', 'fw'],
      ['door', 'fe'],
      ['fw', 'gw1'],
      ['fe', 'ge1'],
      ['gw1', 'gw2'],
      ['ge1', 'ge2'],
      ['gw2', 'gw3'],
      ['ge2', 'ge3'],
      ['gw3', 'cw'],
      ['ge3', 'ce'],
      ['gw1', 'escUp'],
      ['ge1', 'escDn'],
      ['escUp', 'escDn'],
      ['gw2', 'rrOut'],
      ['rrOut', 'rrIn'],
      ['rrIn', 'rr1'],
      ['rrIn', 'rr2'],
      ['rr2', 'rr3'],
      ['rr3', 'rr4'],
      ['rr1', 'rrTill'],
      ['ge2', 'sgOut'],
      ['sgOut', 'sgIn'],
      ['sgIn', 'sg1'],
      ['sg1', 'sg2'],
      ['sg1', 'sg3'],
      ['sgIn', 'sgTill'],
      ['uTop', 'ub1'],
      ['uDn', 'ub2'],
      ['uTop', 'uDn'],
      ['ub1', 'uw1'],
      ['ub2', 'ue1'],
      ['uw1', 'uw2'],
      ['uw2', 'uw3'],
      ['ue1', 'ue2'],
      ['ue2', 'ue3'],
      ['uw2', 'mvIn'],
      ['mvIn', 'mv1'],
      ['mv1', 'mv2'],
      ['mvIn', 'mv3'],
      ['ue1', 'rsOut'],
      ['ue2', 'rsOut'],
      ['rsOut', 'rsIn'],
      ['rsIn', 'rs1'],
      ['rs1', 'rs2'],
      ['rsIn', 'rs3'],
    ])
      link(a, b);
    link('escUp', 'uTop', 'up');
    link('uDn', 'escDn', 'down');
    this.graph = { nodes: N, id };
  }

  /** The nearest graph node to a world position on the same level. */
  nodeNear(p) {
    let best = -1;
    let bd = Infinity;
    this.graph.nodes.forEach((n, k) => {
      if (Math.abs(n.y - p.y) > 1.5) return;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return best;
  }

  // ==========================================================================
  /** s: { hour, camera, people (positions that open the doors) } */
  update(dt, time, env, s) {
    const cam = s.camera.position;
    const near = cam.distanceTo(this.doorCenter) < 95;
    this.group.visible = near;
    const open = mallOpen(s.hour);
    this.open = open;
    this.gate.y1 = open ? -10 : this.gateTop;
    const u = this.uniforms;
    u.uLampOn.value = damp(u.uLampOn.value, open ? 1 : 0.25, 2, dt);
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.35).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.08));
    if (this.kit.glowMat) this.kit.glowMat.color.setScalar(open ? 1.25 : 0.35);
    if (this.kit.screenMat) this.kit.screenMat.color.setScalar(open ? 1 : 0.2);
    const night = env.night ?? 1 - sunUp;
    this.signMat.emissiveIntensity = 0.25 + night * 0.9 * (open ? 1 : 0.5);
    this.poolMat.opacity = night * (open ? 0.35 : 0.12);
    this.neonMat.opacity = night * (open ? 0.85 : 0.3);
    this.ring.rotation.y = time * 0.15;

    // doors
    let want = 0;
    if (open) for (const p of s.people) if (Math.abs(p.x - this.doorCenter.x) < 2.6 && Math.abs(p.z - this.doorCenter.z) < 2.6) want = 1;
    this.doorOpen = damp(this.doorOpen, want, want ? 6 : 3, dt);
    this.positionDoors();
    if (!near) return;

    // escalator steps
    this.stepT += dt * (open ? 1 : 0);
    const m = new THREE.Matrix4();
    let k = 0;
    const N = this.stepN;
    for (const L of ESC.lanes) {
      const cx = this.origin.x + (L.x0 + L.x1) / 2;
      for (let i = 0; i < N; i++) {
        let u0 = (i / N + ((this.stepT * ESC.speed) / RUN) * L.dir) % 1;
        if (u0 < 0) u0 += 1;
        const z = ESC.zBot - u0 * RUN;
        m.makeTranslation(cx, this.origin.y + slopeY(z) + TREAD, this.origin.z + z);
        this.steps.setMatrixAt(k++, m);
      }
    }
    this.steps.instanceMatrix.needsUpdate = true;
    // fountain droplets
    const dp = this.drops.geometry.attributes.position;
    const fo = this.w(FOUNT.x, FOUNT.z);
    this.dropSeeds.forEach(([a, ph, tier], i) => {
      const life = (time * 0.7 + ph) % 1;
      const r0 = tier ? 0.3 : 0.6;
      const r = r0 + life * (tier ? 0.3 : 0.45);
      const h0 = tier ? 1.85 : 1.2;
      const yy = h0 + life * 0.35 - life * life * (h0 - 0.38 + 0.35);
      dp.setXYZ(i, fo.x + Math.cos(a) * r, this.origin.y + Math.max(0.37, yy), fo.z + Math.sin(a) * r);
    });
    dp.needsUpdate = true;
    this.drops.visible = open;
    this.waterMat.opacity = 0.3 + 0.06 * Math.sin(time * 2.1);
    this.tank?.update(time);
  }
}

/** Rectangles of a wall face (x0..x1, y0..y1) with the holes cut out. */
function solidAround(x0, x1, y0, y1, holes) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[1]])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h[2], h[3]])])].filter((y) => y >= y0 && y <= y1).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const hole = holes.some((h) => cx > h[0] && cx < h[1] && cy > h[2] && cy < h[3]);
      if (!hole) {
        if (run) run[1] = xs[i + 1];
        else run = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      } else if (run) {
        out.push(run);
        run = null;
      }
    }
    if (run) out.push(run);
  }
  return out;
}

/** Turn a geometry inside out (normals in, winding flipped): the inside of a basin. */
function inward(g) {
  const n = g.attributes.normal;
  for (let k = 0; k < n.count; k++) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k));
  const ix = g.index.array;
  for (let k = 0; k < ix.length; k += 3) {
    const t = ix[k];
    ix[k] = ix[k + 2];
    ix[k + 2] = t;
  }
  return g;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function xz(v) {
  return { x: v.x, z: v.z };
}

