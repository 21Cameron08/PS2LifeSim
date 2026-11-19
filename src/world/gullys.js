import * as THREE from 'three';
import { CITY, GULLYS_SITE } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { damp, smoothstep } from '../core/rng.js';
import { InteriorKit, F, C } from './interior/kit.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { createGullysTextures, ServingBoard, gsignUV } from '../render/gullysTextures.js';
import { additive } from '../render/materials.js';
import { addGully } from './gullyFigure.js';
import { BRAND, isOpen, BREAKFAST_UNTIL } from '../game/gullysMenu.js';

// GULLY'S, Greenway: a low standalone burger restaurant set back behind a patio.
// Like the store it's part of the street (no loading screen): glass front, booths
// in the windows, a long counter with the kitchen line in full view behind it.
//
// Local coordinates: x along the street (0..W), z from the back wall (0) to the
// glass front (D), y up from the floor. The patio runs from the front wall to the
// pavement.

const W = 19.4;
const D = 12.4;
const H = 3.4;
const ROOF = 4.6;
const DOOR = [8.7, 10.7];
const CTR_Z = 6.2; // the counter's back (kitchen side)
const CTR_F = 6.9; // and its front (dining side)
const CTR = [6.4, 16.4];
const AISLE = 10.25; // the walkway between the tables and the window booths
export const REG = [8.2, 10.4];
export const PICK = [13.2, 14.4, 15.6];
const { teal, orange, cream, navy } = BRAND;

export class Gullys {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.gullysSite;
    this.site = site;
    this.origin = new THREE.Vector3(site.x0 + 0.3, CITY.CURB + GULLYS_SITE.floorLift, site.z0 + 0.3);
    this.W = W;
    this.D = D;
    this.H = H;
    this.cityTex = cityTex;
    this.gt = createGullysTextures();
    this.group = new THREE.Group();
    this.outside = new THREE.Group();
    scene.add(this.group, this.outside);
    this.uniforms = makeInteriorUniforms();
    this.tex = { ...interiorTex, ...this.gt.kit };

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildInterior(kit);
    kit.build(this.group, {}, { fog: true });
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.fixtures = kit.lights;
    this.buildDynamic();
    this.buildExterior();
    this.buildDoors();

    this.doorOpen = 0;
    this.serving = [];
    this.serveBoard.draw([]);
    this.rideBob = 0;
  }

  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  contains(p, pad = 0) {
    const x = p.x - this.origin.x;
    const z = p.z - this.origin.z;
    return x > -pad && x < W + pad && z > -pad && z < D + pad && p.y < this.origin.y + ROOF;
  }

  /** On the patio (between the glass front and the pavement)? */
  onPatio(p) {
    const x = p.x - this.origin.x;
    return x > -0.3 && x < W + 0.3 && p.z > this.origin.z + D + 0.3 && p.z < this.site.z1;
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const R90 = Math.PI / 2;
    const PI = Math.PI;

    // ---------------------------------------------------------------- rooms
    const dining = {
      floor: 'lino',
      wall: 'plaster',
      wallColor: '#fff0d8',
      wainscot: { key: 'wallTile', h: 1.1, color: '#6ad0d0', cap: orange },
      ceil: '#ffffff',
      ceilKey: 'ceilTile',
      base: navy,
      trim: teal,
      zone: 'dining',
    };
    kit.room('dining', 0, CTR_F, W, D, dining);
    kit.room('kids', 0, 3.4, CTR[0], CTR_F, { ...dining, floor: 'carpet', floorColor: '#4ab8c0' });
    kit.room('drinks', CTR[1], 3.4, W, CTR_F, dining);
    kit.room('kitchen', CTR[0], 0, CTR[1], CTR_F, { floor: 'wallTile', floorColor: '#c06a4a', wall: 'subway', wallColor: '#f4f4f0', ceil: '#f2f2f0', ceilKey: 'ceilTile', base: '#5a5a5a', trim: '#c8ccd0' });
    kit.room('restroom', 0, 0, CTR[0], 3.4, { floor: 'penny', floorColor: '#e8e4dc', wall: 'wallTile', wallColor: '#cdeeee', ceil: '#f2f2f0', ceilKey: 'ceilTile', base: navy, trim: teal });

    // ---------------------------------------------------------------- walls
    const glass = { kind: 'window', y0: 0.75, y1: 2.55, grid: [3, 1], frame: '#0e6a70', trim: '#0e6a70' };
    kit.wall('x', D, 0, W, {
      t: 0.3,
      ext: 1,
      open: [
        { from: 0.35, to: 8.35, ...glass },
        { from: DOOR[0], to: DOOR[1], kind: 'opening', y1: 2.4, trim: '#0e6a70' },
        { from: 11.05, to: 19.05, ...glass },
      ],
    });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1 });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1 });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1 });
    // the bulkhead over the counter (menu boards hang on it)
    kit.wall('x', CTR_F, CTR[0], CTR[1], { t: 0.2, open: [{ from: CTR[0], to: CTR[1], kind: 'opening', y1: 2.4, noTrim: true }] });
    kit.wall('z', CTR[0], 0, CTR_F, { open: [{ from: 1.6, to: 2.6, kind: 'entry', doorColor: '#a8b0b8' }] }); // walk-in freezer
    kit.wall('z', CTR[1], 0, CTR_F, { open: [{ from: 1.0, to: 1.9, kind: 'entry', doorColor: '#8a2a2a' }] }); // staff room
    kit.wall('x', 3.4, 0, CTR[0], { open: [{ from: 4.6, to: 5.5, swing: -1, doorColor: '#17a2a8' }] });
    kit.wall('x', 3.4, CTR[1], W);

    // ---------------------------------------------------------------- light
    for (const x of [2.0, 5.0, 8.0, 11.0, 14.0, 17.0])
      for (const z of [8.3, 10.7]) {
        const L = P(x, z);
        L.box('solid', -0.3, H - 0.02, -0.6, 0.3, H - 0.005, 0.6, C('#d8d8d4'), { bottom: true });
        L.box('glow', -0.26, H - 0.025, -0.56, 0.26, H - 0.02, 0.56, C('#fff8ec'), { top: false, bottom: true });
        L.light(0, H - 0.3, 0, '#fff2dc', 0.36, true);
      }
    for (const [x, z, pw] of [
      [2.0, 4.8, 0.45],
      [17.9, 5.0, 0.45],
      [2.2, 2.2, 0.85],
      [4.9, 2.2, 0.7],
    ]) {
      P(x, z).box('glow', -0.26, H - 0.025, -0.56, 0.26, H - 0.02, 0.56, C('#fff8ec'), { top: false, bottom: true });
      P(x, z).light(0, H - 0.3, 0, '#fff2dc', pw, true);
    }
    for (const x of [8.0, 11.0, 14.0])
      for (const z of [2.2, 4.2]) {
        P(x, z).box('glow', -0.26, H - 0.025, -0.56, 0.26, H - 0.02, 0.56, C('#f4f8ff'), { top: false, bottom: true });
        P(x, z).light(0, H - 0.3, 0, '#f4f8ff', 0.42, true);
      }

    this.buildDining(kit, P, R90, PI);
    this.buildKitchen(kit, P, R90, PI);
  }

  buildDining(kit, P, R90, PI) {
    this.seats = [];
    const stuff = (key, col) => C(col);
    // --- window booths: tables end-on to the glass, a bench either side
    const booth = (c, col) => {
      const B = P(c, D);
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -0.95 : 0.45;
        const x1 = s < 0 ? -0.45 : 0.95;
        B.box('fabric', x0, 0, -1.4, x1, 0.45, -0.05, stuff('fabric', col));
        B.box('fabric', s < 0 ? -0.95 : 0.85, 0.45, -1.4, s < 0 ? -0.85 : 0.95, 1.12, -0.05, stuff('fabric', col));
        B.box('solid', x0 - 0.008, 0, -1.428, x1 + 0.008, 0.06, -0.042, C('#2a2a30')); // plinth, a hair proud of the bench
      }
      B.box('solid', -0.4, 0.71, -1.3, 0.4, 0.75, -0.12, C('#f4ead6'), { bottom: true });
      B.box('solid', -0.42, 0.69, -1.32, 0.42, 0.71, -0.12, C(teal), { bottom: true });
      B.geo('solid', new THREE.CylinderGeometry(0.05, 0.08, 0.69, 8), 0, 0.345, -0.68, C('#8a8c90'));
      B.collide(-0.95, -1.42, 0.95, 0, 1.12);
      B.shadow(-0.95, -1.42, 0.95, 0, 0.35);
      for (const s of [-1, 1])
        for (const z of [-1.0, -0.45])
          this.seats.push({ ...xz(this.w(c + s * 0.68, D + z)), y: this.origin.y, yaw: s < 0 ? R90 : -R90, tray: this.w(c + s * 0.2, D + z, 0.76), out: xz(this.w(c + s * 0.5, D - 1.95)) });
      // a pendant over each table
      const L = P(c, D - 0.7);
      L.box('solid', -0.006, 1.9, -0.006, 0.006, H, 0.006, C('#1a1a1a'));
      L.geo('solid', new THREE.ConeGeometry(0.2, 0.22, 10, 1, true), 0, 1.82, 0, C(col === teal ? orange : teal));
      L.box('glow', -0.07, 1.705, -0.07, 0.07, 1.71, 0.07, C('#fff0c8'), { top: false, bottom: true });
      L.light(0, 1.6, 0, '#ffd8a0', 0.28, true);
    };
    [1.3, 3.7, 6.1].forEach((c, k) => booth(c, k % 2 ? orange : teal));
    [13.0, 15.4, 17.8].forEach((c, k) => booth(c, k % 2 ? teal : orange));

    // --- freestanding tables with swivel stools
    const table = (x, z, sideways = false) => {
      const T = P(x, z);
      T.box('solid', -0.45, 0.72, -0.45, 0.45, 0.76, 0.45, C('#f4ead6'), { bottom: true });
      T.box('solid', -0.47, 0.7, -0.47, 0.47, 0.72, 0.47, C(orange), { bottom: true });
      T.geo('solid', new THREE.CylinderGeometry(0.05, 0.08, 0.7, 8), 0, 0.35, 0, C('#8a8c90'));
      T.collide(-0.47, -0.47, 0.47, 0.47, 0.76);
      const spots = sideways
        ? [
            [-0.72, 0, R90],
            [0.72, 0, -R90],
          ]
        : [
            [-0.25, -0.75, 0],
            [0.25, -0.75, 0],
            [-0.25, 0.75, PI],
            [0.25, 0.75, PI],
          ];
      for (const [dx, dz, yaw] of spots) {
        const S = P(x + dx, z + dz);
        S.geo('solid', new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), 0, 0.44, 0, C(teal));
        S.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), 0, 0.22, 0, C('#8a8c90'));
        S.geo('solid', new THREE.CylinderGeometry(0.16, 0.18, 0.03, 10), 0, 0.015, 0, C('#5a5a60'));
        S.collide(-0.15, -0.15, 0.15, 0.15, 0.48);
        this.seats.push({ ...xz(this.w(x + dx, z + dz)), y: this.origin.y, yaw, tray: this.w(x + dx * 0.45, z + dz * 0.42, 0.77), out: xz(this.w(x + dx * 1.6, z + dz * 1.6)) });
      }
    };
    table(2.2, 8.7);
    table(4.8, 8.7);
    table(18.0, 9.0, true);
    // how to walk to each seat from the aisle between the tables and the booths
    const L = (x, z) => xz(this.w(x, z));
    for (const sp of this.seats) {
      const lx = sp.x - this.origin.x;
      const lz = sp.z - this.origin.z;
      if (lz > 10.5) sp.route = [L(sp.out.x - this.origin.x, AISLE), sp.out, xz(sp)];
      else if (lz < 8.4 && lx < 6) sp.route = [L(3.5, AISLE), L(3.5, 7.4), L(lx, 7.4), xz(sp)];
      else sp.route = [L(lx, AISLE), xz(sp)];
    }

    // --- bins by the door, with a stack of trays on top
    this.binSpots = [];
    for (const x of [7.75, 11.65]) {
      const Bn = P(x, D - 0.5, PI);
      Bn.box('solid', -0.32, 0, -0.25, 0.32, 1.02, 0.25, C(teal));
      Bn.box('solid', -0.34, 1.02, -0.27, 0.34, 1.06, 0.27, C(navy), { bottom: true });
      Bn.box('solid', -0.2, 0.6, 0.25, 0.2, 0.85, 0.27, C('#1a1a1e'));
      Bn.panel('gSigns', -0.3, 0.9, 0.3, 0.98, 0.256, gsignUV(3));
      for (let k = 0; k < 5; k++) Bn.box('solid', -0.24, 1.06 + k * 0.022, -0.17, 0.24, 1.075 + k * 0.022, 0.17, C(orange));
      Bn.collide(-0.34, -0.27, 0.34, 0.27, 1.1);
      this.binSpots.push(this.w(x, D - 1.0));
    }

    // --- drink station in the alcove: fountain, ice, lids, napkins, condiments
    const DS = P(W, 5.2, -R90);
    DS.box('solid', -1.4, 0, 0, 1.4, 0.92, 0.62, C('#f4ead6'));
    DS.box('solid', -1.42, 0.92, -0.01, 1.42, 0.96, 0.64, C('#c8ccd0'), { bottom: true });
    DS.box('solid', -1.0, 0.96, 0.05, 0.4, 1.75, 0.5, C('#2a2a30'));
    DS.box('glow', -0.95, 1.4, 0.501, 0.35, 1.7, 0.506, C('#5ad8e8'));
    for (let k = 0; k < 6; k++) DS.box('glow', -0.92 + k * 0.21, 1.42, 0.507, -0.76 + k * 0.21, 1.66, 0.512, C(['#e83a3a', '#2a2a30', '#f0c030', '#3ab04a', '#ff8a2a', '#f4f4f4'][k]));
    for (let k = 0; k < 6; k++) DS.box('solid', -0.92 + k * 0.21, 1.1, 0.5, -0.84 + k * 0.21, 1.18, 0.56, C('#c8ccd0'));
    DS.box('solid', 0.55, 0.96, 0.1, 1.3, 1.15, 0.45, C('#c8ccd0'));
    for (let k = 0; k < 3; k++) DS.geo('solid', new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), 0.65 + k * 0.22, 1.26, 0.28, C(['#e83a3a', '#f0c030', '#f4f4f4'][k]));
    DS.panel('gSigns', -1.2, 1.95, 1.2, 2.13, 0.008, gsignUV(6));
    DS.collide(-1.42, 0, 1.42, 0.64, 1.75);
    this.drinkSpot = this.w(W - 1.2, 5.0);

    // --- kids' corner: Gully statue, a kiddie ride, crayon table
    const statue = P(1.0, 4.3, 0.6);
    statue.geo('solid', new THREE.CylinderGeometry(0.45, 0.5, 0.3, 14), 0, 0.15, 0, C(navy));
    addGully(kit.target('solid'), statue.m.clone().multiply(trs(0, 0.3, 0, 0, 1.45)), {});
    statue.collide(-0.5, -0.5, 0.5, 0.5, 2.0);
    const RD = P(3.4, 4.4);
    RD.geo('solid', new THREE.CylinderGeometry(0.55, 0.6, 0.22, 16), 0, 0.11, 0, C(orange));
    RD.box('solid', 0.55, 0, -0.15, 0.85, 1.0, 0.15, C('#d8d8d4'));
    RD.box('glow', 0.6, 0.75, 0.151, 0.8, 0.92, 0.156, C('#ffd23a'));
    RD.collide(-0.6, -0.6, 0.86, 0.6, 0.9);
    this.rideSpot = this.w(3.4, 4.4);
    this.rideStand = xz(this.w(3.4, 5.4));
    P(3.4, 3.4 + 0.07).panel('gSigns', -0.75, 1.8, 0.75, 1.95, 0.0, gsignUV(8));
    const CT = P(5.3, 5.5);
    CT.box('solid', -0.45, 0.42, -0.35, 0.45, 0.46, 0.35, C('#ffd23a'), { bottom: true });
    for (const [x, z] of [
      [-0.3, -0.25],
      [0.3, 0.25],
    ])
      CT.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), x, 0.21, z, C('#8a8c90'));
    for (let k = 0; k < 5; k++) CT.box('solid', -0.3 + k * 0.12, 0.46, -0.1, -0.24 + k * 0.12, 0.47, 0.1, C(['#e83a3a', '#2a6ae0', '#3ab04a', '#f0c030', '#b04aff'][k]));
    CT.collide(-0.45, -0.35, 0.45, 0.35, 0.47);
    P(5.05, 3.4 + 0.07).panel('gSigns', -0.5, 2.2, 0.5, 2.34, 0.0, gsignUV(2));

    // --- the harbour mural on the west wall, posters and the founder photo
    this.muralSpot = { m: trs(this.origin.x + 0.01, this.origin.y + 2.0, this.origin.z + 9.6, R90), w: 5.0, h: 1.9 };
    for (let k = 0; k < 4; k++) P(W - 0.01, 9.4 + k * 0.85, -R90).panel('gPosters', -0.33, 1.4, 0.33, 2.7, 0.0, [k / 4, 0, (k + 1) / 4, 1]);
    P(W - 0.01, 11.5, -R90).panel('gSigns', -0.6, 2.85, 0.6, 3.0, 0, gsignUV(9));
    P(9.7, D - 0.01, PI).panel('gSigns', -0.45, 2.6, 0.45, 2.72, 0, gsignUV(10));
  }

  buildKitchen(kit, P, R90, PI) {
    const steel = C('#c8ccd0');
    const dark = C('#2a2a30');
    // --- the counter: teal front with an orange stripe, laminate top
    const K = P(0, 0);
    K.box('solid', CTR[0], 0, CTR_Z, CTR[1], 1.0, CTR_F, C(teal));
    K.box('solid', CTR[0], 0.6, CTR_F + 0.001, CTR[1], 0.68, CTR_F + 0.006, C(orange));
    K.box('solid', CTR[0], 0, CTR_F + 0.001, CTR[1], 0.1, CTR_F + 0.006, C(navy));
    K.box('solid', CTR[0], 1.0, CTR_Z - 0.04, CTR[1], 1.05, CTR_F + 0.06, C('#e8e2d4'), { bottom: true });
    K.panel('gSigns', 7.3, 0.76, 11.3, 0.92, CTR_F + 0.007, gsignUV(0));
    K.panel('gSigns', 12.9, 0.76, 15.9, 0.92, CTR_F + 0.007, gsignUV(1));
    K.collide(CTR[0], CTR_Z - 0.05, CTR[1], CTR_F + 0.08, 1.05);
    // registers: a screen for the cashier, a pole display for you
    for (const x of REG) {
      const R = P(x, 6.55);
      R.box('solid', -0.22, 1.05, -0.2, 0.22, 1.13, 0.2, dark);
      R.box('solid', -0.03, 1.13, -0.03, 0.03, 1.3, 0.03, dark);
      R.box('solid', -0.2, 1.28, -0.2, 0.2, 1.5, -0.08, C('#1e1e22'));
      R.box('glow', -0.17, 1.31, -0.206, 0.17, 1.47, -0.201, C('#6ab0e8'));
      R.box('solid', -0.12, 1.13, 0.12, 0.12, 1.26, 0.2, C('#1e1e22'));
      R.box('glow', -0.1, 1.16, 0.201, 0.1, 1.23, 0.206, C('#3aff8a'));
    }
    // pickup: heat lamps hanging from the bulkhead over the pass
    for (const x of PICK) {
      const L = P(x, 6.55);
      L.box('solid', -0.012, 1.95, -0.012, 0.012, H, 0.012, dark);
      L.geo('solid', new THREE.ConeGeometry(0.18, 0.2, 10, 1, true), 0, 1.86, 0, C(orange));
      L.box('glow', -0.07, 1.755, -0.07, 0.07, 1.76, 0.07, C('#ff9a4a'), { top: false, bottom: true });
    }
    // menu boards, NOW SERVING and PICK UP live on the bulkhead (see buildDynamic)
    P(15.5, CTR_F + 0.106).panel('gSigns', -0.75, 2.62, 0.75, 2.8, 0, gsignUV(1));
    P(15.5, CTR_F + 0.106).panel('gSigns', -0.75, 2.42, 0.75, 2.57, 0, gsignUV(7));
    // the flip-up flap at the west end where the crew come out
    K.box('solid', CTR[0], 1.05, CTR_Z, CTR[0] + 0.7, 1.08, CTR_F, C('#d8d2c4'));

    // --- front line (cooks face the counter): drink tower, toaster, assembly, fries, fryers, bagging
    const FL = P(0, 0);
    FL.box('solid', 6.6, 0, 4.7, 7.6, 1.7, 5.5, C('#3a3e44'));
    FL.box('glow', 6.68, 1.25, 5.501, 7.52, 1.6, 5.506, C('#7ae8c0'));
    for (let k = 0; k < 4; k++) FL.box('solid', 6.72 + k * 0.2, 1.0, 5.5, 6.8 + k * 0.2, 1.1, 5.58, steel);
    FL.box('solid', 7.9, 0, 4.8, 8.6, 1.25, 5.5, steel);
    FL.box('glow', 7.95, 0.9, 5.501, 8.55, 1.0, 5.506, C('#ff7a2a'));
    FL.box('solid', 8.8, 0, 4.7, 11.8, 0.9, 5.6, steel);
    FL.box('solid', 8.8, 0.9, 4.7, 11.8, 0.93, 5.6, C('#e8eaec'), { bottom: true });
    FL.box('solid', 8.8, 1.32, 4.75, 11.8, 1.35, 5.4, steel, { bottom: true });
    for (const x of [8.85, 11.72]) FL.box('solid', x, 0.93, 4.75, x + 0.03, 1.32, 4.78, steel);
    for (let k = 0; k < 9; k++) FL.box('solid', 9.0 + k * 0.3, 1.35, 4.9, 9.22 + k * 0.3, 1.47, 5.2, C(k % 3 === 2 ? '#f4ead6' : k % 2 ? orange : teal));
    FL.box('solid', 8.8, 1.9, 4.7, 11.8, 1.98, 5.55, steel);
    FL.box('glow', 8.9, 1.895, 4.8, 11.7, 1.9, 5.45, C('#ff9a4a'), { top: false, bottom: true });
    for (const x of [8.82, 11.74]) FL.box('solid', x, 1.47, 4.72, x + 0.04, 1.9, 4.76, steel);
    FL.box('solid', 12.0, 0, 4.7, 12.9, 0.9, 5.6, steel);
    for (let k = 0; k < 30; k++) FL.box('solid', 12.1 + (k % 6) * 0.13, 0.9, 4.85 + Math.floor(k / 6) * 0.13, 12.13 + (k % 6) * 0.13, 0.98 + (k % 3) * 0.03, 4.88 + Math.floor(k / 6) * 0.13, C('#ffd23a'));
    FL.box('solid', 12.0, 1.85, 4.75, 12.9, 1.93, 5.55, steel);
    FL.box('glow', 12.05, 1.845, 4.8, 12.85, 1.85, 5.5, C('#ff9a4a'), { top: false, bottom: true });
    FL.box('solid', 13.1, 0, 4.7, 15.0, 0.88, 5.6, steel);
    for (let k = 0; k < 3; k++) {
      const x0 = 13.16 + k * 0.62;
      const x1 = x0 + 0.58;
      FL.box('glow', x0 + 0.04, 0.88, 4.82, x1 - 0.04, 0.9, 5.48, C('#e8b040'));
      for (const [a0, b0, a1, b1] of [
        [x0, 4.78, x1, 4.82],
        [x0, 5.48, x1, 5.52],
        [x0, 4.82, x0 + 0.04, 5.48],
        [x1 - 0.04, 4.82, x1, 5.48],
      ])
        FL.box('solid', a0, 0.88, b0, a1, 0.97, b1, dark);
    }
    FL.box('solid', 13.1, 0.88, 4.7, 15.0, 1.4, 4.78, steel);
    FL.box('solid', 15.2, 0, 4.8, 16.2, 0.9, 5.6, steel);
    for (let k = 0; k < 4; k++) FL.box('solid', 15.3 + k * 0.22, 0.9, 5.0, 15.48 + k * 0.22, 1.18, 5.18, C('#c8a070'));
    FL.collide(6.6, 4.7, 16.2, 5.6, 1.9);
    // order screens over the line, facing the cooks
    for (const x of [9.6, 13.8]) {
      const S = P(x, 4.6, PI);
      S.box('solid', -0.42, 2.0, -0.04, 0.42, 2.48, 0.02, C('#1e1e22'));
      S.box('solid', -0.01, 2.48, -0.01, 0.01, H, 0.01, dark);
    }
    this.screenSpots = [9.6, 13.8].map((x) => this.w(x, 4.6 - 0.026, 2.24));

    // --- back line: grill under a hood, prep table, sinks, racks
    const BL = P(0, 0);
    BL.box('solid', 8.6, 0, 0.0, 11.2, 0.88, 0.85, steel);
    BL.box('solid', 8.6, 0.88, 0.0, 11.2, 0.95, 0.85, C('#1a1a1c'), { bottom: true });
    this.grill = { x0: 8.8, x1: 11.0, z0: 0.15, z1: 0.75, y: 0.95 };
    BL.box('solid', 8.4, 2.2, 0.0, 11.4, 3.0, 1.3, steel);
    BL.box('glow', 8.5, 2.195, 0.1, 11.3, 2.2, 1.2, C('#fff0d8'), { top: false, bottom: true });
    BL.box('solid', 11.6, 0, 0.0, 13.4, 0.9, 0.75, steel);
    BL.box('solid', 11.7, 0.9, 0.1, 12.3, 0.93, 0.6, C('#f4f4f0'));
    for (const [x, col] of [
      [12.45, '#5ab84a'],
      [12.75, '#e83a3a'],
      [13.05, '#f0c030'],
    ])
      BL.box('solid', x, 0.9, 0.15, x + 0.25, 1.0, 0.45, C(col));
    BL.box('solid', 13.8, 0, 0.0, 16.0, 0.9, 0.7, steel);
    for (let k = 0; k < 3; k++) {
      BL.box('solid', 13.9 + k * 0.72, 0.9, 0.08, 14.5 + k * 0.72, 0.905, 0.6, C('#8a8c90'));
      BL.box('solid', 14.17 + k * 0.72, 0.9, 0.05, 14.23 + k * 0.72, 1.25, 0.11, steel);
    }
    BL.box('solid', 6.6, 0, 0.0, 8.2, 1.9, 0.55, C('#8a9aa8'));
    for (const y of [0.4, 0.9, 1.4]) for (let k = 0; k < 4; k++) BL.box('solid', 6.7 + k * 0.38, y, 0.06, 7.0 + k * 0.38, y + 0.3, 0.5, C(k % 2 ? '#c8a070' : '#e8e0c8'));
    BL.collide(6.6, 0, 16.0, 0.9, 1.9);
    P(6.4 + 0.07, 2.1, R90).panel('gSigns', -0.5, 2.25, 0.5, 2.38, 0.0, gsignUV(12));
    P(16.4 - 0.07, 1.45, -R90).panel('gSigns', -0.5, 2.25, 0.5, 2.38, 0.0, gsignUV(4));
    P(14.9, 0.01).panel('gSigns', -0.6, 1.6, 0.6, 1.73, 0.0, gsignUV(13));
    // heat lamps light the line
    for (const x of [10.3, 12.45]) P(x, 5.1).light(0, 1.7, 0, '#ff9a5a', 0.3, true);

    // --- restroom: two stalls, two sinks, a mirror
    for (let k = 0; k < 2; k++) {
      const x0 = 0.2 + k * 1.35;
      F.toilet(P(x0 + 0.65, 0.0));
      P(x0 + 1.35, 0).box('solid', -0.02, 0.15, 0, 0.02, 2.0, 1.5, C(teal));
      P(x0, 1.5).box('solid', 0.05, 0.15, -0.02, 1.25, 2.0, 0.02, C(teal));
      P(0, 0).collide(x0, 1.45, x0 + 1.35, 1.6, 2.0);
    }
    for (const z of [0.9, 1.9]) F.vanity(P(CTR[0] - 0.06, z, -R90), { w: 0.75, col: '#f4ead6', mirror: false, light: false });
    const M = P(CTR[0] - 0.07, 1.4, -R90);
    M.quad('mirror', [-0.9, 1.15, 0.02], [0.9, 1.15, 0.02], [0.9, 1.9, 0.02], [-0.9, 1.9, 0.02], [0, 0, 1], [0, 0, 1, 1], C('#d0d8dc'));
    M.box('solid', -0.95, 1.1, 0, 0.95, 1.15, 0.03, C(teal));
  }

  // ==========================================================================
  buildDynamic() {
    const o = this.origin;
    // the menu board swaps to the sunrise menu before 11 AM
    this.menuMat = new THREE.MeshBasicMaterial({ map: this.gt.lunch, fog: false });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.98), this.menuMat);
    menu.position.set(o.x + 9.6, o.y + 2.9, o.z + CTR_F + 0.106);
    this.group.add(menu);
    this.serveBoard = new ServingBoard();
    this.serveMat = new THREE.MeshBasicMaterial({ map: this.serveBoard.tex, fog: false });
    const serve = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), this.serveMat);
    serve.position.set(o.x + 13.45, o.y + 2.72, o.z + CTR_F + 0.106);
    this.group.add(serve);
    // the kitchen screens
    const ks = new THREE.MeshBasicMaterial({ map: this.gt.kitchen, fog: false });
    for (const p of this.screenSpots) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.42), ks);
      s.position.copy(p);
      s.rotation.y = Math.PI; // facing the cooks
      this.group.add(s);
    }
    // the harbour mural
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(this.muralSpot.w, this.muralSpot.h), new THREE.MeshBasicMaterial({ map: this.gt.mural, color: '#e8e0d8', fog: false }));
    mural.applyMatrix4(this.muralSpot.m);
    this.group.add(mural);
    // fry baskets dip in and out of the oil
    const bb = new GeoBuilder();
    bb.box(-0.22, 0, -0.3, 0.22, 0.16, 0.3, { color: shade('#a8acb0'), bottom: true });
    bb.box(-0.02, 0.16, 0.28, 0.02, 0.2, 0.62, { color: shade('#1a1a1a') });
    const basketGeo = bb.build();
    const basketMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.baskets = [0, 1, 2].map((k) => {
      const m = new THREE.Mesh(basketGeo, basketMat);
      m.position.set(o.x + 13.45 + k * 0.62, o.y + 1.0, o.z + 5.1);
      m.rotation.y = Math.PI;
      this.group.add(m);
      return m;
    });
    // patties sizzling on the grill, with a little steam
    const g = this.grill;
    const pg = new GeoBuilder();
    for (let k = 0; k < 8; k++) pg.addGeometry(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10), trs(o.x + g.x0 + 0.15 + (k % 4) * 0.55, o.y + g.y + 0.012, o.z + g.z0 + 0.15 + Math.floor(k / 4) * 0.3), shade('#4a2a18'));
    this.group.add(new THREE.Mesh(pg.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const N = 18;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.steamMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#8a8a8a'), size: 0.5, points: true, opacity: 0.25 });
    this.steam = new THREE.Points(sg, this.steamMat);
    this.steam.frustumCulled = false;
    this.group.add(this.steam);
    this.steamSeeds = Array.from({ length: N }, (_, k) => [k / N, Math.sin(k * 7.3) * 0.5 + 0.5, Math.cos(k * 3.1) * 0.5 + 0.5]);
    // the kiddie ride's Gully bobs when someone's riding
    const rb = new GeoBuilder();
    addGully(rb, new THREE.Matrix4().makeScale(0.75, 0.75, 0.75), {});
    this.ride = new THREE.Mesh(rb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.ride.position.copy(this.rideSpot).setY(o.y + 0.22);
    this.ride.rotation.y = Math.PI / 2;
    this.group.add(this.ride);
  }

  buildExterior() {
    const o = this.origin;
    const s = this.site;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;
    const Zf = o.z + D + 0.3; // the glass front's outer face
    const Yb = CITY.CURB;
    const Yt = ly(ROOF);
    this.Zf = Zf;

    // --- stucco shell: cream, an orange stripe, a teal band at the top
    const shell = new GeoBuilder();
    const bands = [
      [Yb, ly(2.85), cream],
      [ly(2.85), ly(3.0), orange],
      [ly(3.0), Yt, teal],
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
    // front: around the two big windows and the door
    const front = [
      [-0.3, DOOR[0], -0.02, 0.75],
      [DOOR[1], W + 0.3, -0.02, 0.75],
      [-0.3, 0.35, 0.75, 2.55],
      [8.35, DOOR[0], 0.75, 2.55],
      [DOOR[1], 11.05, 0.75, 2.55],
      [19.05, W + 0.3, 0.75, 2.55],
      [DOOR[0], DOOR[1], 2.4, 2.55],
      [-0.3, W + 0.3, 2.55, ROOF],
    ];
    for (const [x0, x1, y0, y1] of front) face(lx(x0), Zf, lx(x1), Zf, y0 < 0 ? Yb : ly(y0), ly(y1), [0, 0, 1]);
    face(s.x1, s.z0, s.x0, s.z0, Yb, Yt, [0, 0, -1]);
    face(s.x0, s.z0, s.x0, Zf, Yb, Yt, [-1, 0, 0]);
    face(s.x1, Zf, s.x1, s.z0, Yb, Yt, [1, 0, 0]);
    this.outside.add(new THREE.Mesh(shell.build(), new THREE.MeshLambertMaterial({ map: this.tex.plaster.map, vertexColors: true })));

    // --- roof cap, entrance canopy, roof sign frame, patio, planters, tables, the pole sign
    const st = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, col, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: shade(col), bottom: true, ...op });
    box(s.x0 - 0.03, Yt, s.z0 - 0.03, s.x1 + 0.03, Yt + 0.25, Zf + 0.15, navy);
    box(lx(8.2), ly(2.72), Zf, lx(11.2), ly(2.92), Zf + 1.3, teal);
    box(lx(8.2), ly(2.92), Zf + 1.24, lx(11.2), ly(3.0), Zf + 1.3, orange);
    for (const x of [6.0, 13.4]) box(lx(x) - 0.06, Yt + 0.25, Zf - 0.9, lx(x) + 0.06, Yt + 0.9, Zf - 0.75, '#5a5a60');
    box(lx(2.0), Yt + 0.25, s.z0 + 2, lx(4.2), Yt + 1.3, s.z0 + 4, '#9a9ca0');
    // patio slab, a hair above the pavement it sits on
    const patio = new GeoBuilder();
    patio.box(s.x0, CITY.CURB, Zf, s.x1, CITY.CURB + 0.03, s.z1, { sx: 3, sy: 3, topScale: 3, bottom: false });
    this.outside.add(new THREE.Mesh(patio.build(), new THREE.MeshLambertMaterial({ map: this.tex.concrete.map, color: '#d8d0c4' })));
    const P0 = CITY.CURB + 0.03;
    const col = this.city.colliders;
    for (const [x0, x1] of [
      [-0.3, 7.9],
      [11.5, W + 0.3],
    ]) {
      box(lx(x0), P0, s.z1 - 0.45, lx(x1), P0 + 0.5, s.z1 - 0.05, '#d8d0c4');
      box(lx(x0) + 0.05, P0 + 0.45, s.z1 - 0.4, lx(x1) - 0.05, P0 + 0.47, s.z1 - 0.1, '#5a4030'); // soil sits a little below the rim
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.9) st.addGeometry(new THREE.IcosahedronGeometry(0.3, 0), trs(lx(x), P0 + 0.68, s.z1 - 0.25, x * 2), shade(['#3f6b2e', '#4f8a3a', '#2f5a2a'][Math.round(x * 3) % 3]));
      col.add(lx(x0), s.z1 - 0.45, lx(x1), s.z1 - 0.05, P0 - 0.03, P0 + 0.9);
    }
    this.patioSeats = [];
    this.umbrellas = [];
    [2.2, 5.4, 14.0, 17.2].forEach((x, k) => {
      const z = Zf + 1.9;
      st.addGeometry(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), trs(lx(x), P0 + 0.74, z), shade('#f4ead6'));
      st.addGeometry(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), trs(lx(x), P0 + 1.15, z), shade('#8a8c90'));
      st.addGeometry(new THREE.ConeGeometry(1.2, 0.45, 8, 1, true), trs(lx(x), P0 + 2.35, z), shade(k % 2 ? orange : teal));
      st.addGeometry(new THREE.ConeGeometry(1.2, 0.45, 8, 1, true).scale(-1, 1, 1), trs(lx(x), P0 + 2.349, z), shade('#f4ead6'));
      col.add(lx(x) - 0.42, z - 0.42, lx(x) + 0.42, z + 0.42, P0, P0 + 0.76);
      for (const dx of [-0.75, 0.75]) {
        st.addGeometry(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), trs(lx(x + dx), P0 + 0.45, z), shade(k % 2 ? teal : orange));
        st.addGeometry(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), trs(lx(x + dx), P0 + 0.22, z), shade('#8a8c90'));
        this.patioSeats.push({ x: lx(x + dx), z, y: CITY.CURB, yaw: dx < 0 ? Math.PI / 2 : -Math.PI / 2, tray: new THREE.Vector3(lx(x + dx * 0.4), P0 + 0.77, z), out: { x: lx(x + dx * 1.7), z }, patio: true });
      }
    });
    // bike rack
    for (let k = 0; k < 3; k++) st.addGeometry(new THREE.TorusGeometry(0.3, 0.025, 4, 12, Math.PI), trs(lx(12.3 + k * 0.5), P0, Zf + 0.7, Math.PI / 2), shade('#8a8c90'));
    col.add(lx(12.0), Zf + 0.6, lx(13.6), Zf + 0.8, P0, P0 + 0.35);
    // the pole sign at the corner of the patio
    const px = lx(-0.05);
    const pz = s.z1 - 0.95;
    box(px - 0.14, P0, pz - 0.14, px + 0.14, P0 + 7.0, pz + 0.14, '#5a5a60');
    col.add(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 0, 8);
    this.outside.add(new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));

    // --- lit signs: the roof sign and the pole sign (logo on both faces)
    this.signMat = new THREE.MeshLambertMaterial({ map: this.gt.logo, emissive: '#ffffff', emissiveMap: this.gt.logo, emissiveIntensity: 0.3 });
    const side = new THREE.MeshLambertMaterial({ color: navy });
    const roofSign = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.1, 0.4), [side, side, side, side, this.signMat, this.signMat]);
    roofSign.position.set(lx(9.7), Yt + 1.95, Zf - 0.82);
    this.outside.add(roofSign);
    const poleSign = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.5, 3.0), [this.signMat, this.signMat, side, side, side, side]);
    poleSign.position.set(px, P0 + 5.5, pz);
    this.outside.add(poleSign);
    const fg = new GeoBuilder();
    addGully(fg, new THREE.Matrix4().makeScale(1.5, 1.5, 1.5), {});
    this.poleGully = new THREE.Mesh(fg.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#202020' }));
    this.poleGully.position.set(px, P0 + 6.25, pz);
    this.outside.add(this.poleGully);
    // OPEN hours plate by the door
    const hp = new GeoBuilder();
    hp.quad([lx(11.2), ly(0.32), Zf + 0.01], [lx(13.4), ly(0.32), Zf + 0.01], [lx(13.4), ly(0.5), Zf + 0.01], [lx(11.2), ly(0.5), Zf + 0.01], [0, 0, 1], gsignUV(5));
    this.outside.add(new THREE.Mesh(hp.build(), new THREE.MeshLambertMaterial({ map: this.tex.gSigns.map, emissive: '#ffffff', emissiveMap: this.tex.gSigns.map, emissiveIntensity: 0.2 })));
    // night glow: teal neon along the roof edge, canopy downlights, light on the patio
    this.neonMat = additive({ map: null, color: new THREE.Color(teal), opacity: 0 });
    const ng = new GeoBuilder();
    ng.quad([s.x0, Yt - 0.12, Zf + 0.02], [s.x1, Yt - 0.12, Zf + 0.02], [s.x1, Yt - 0.06, Zf + 0.02], [s.x0, Yt - 0.06, Zf + 0.02], [0, 0, 1]);
    this.outside.add(new THREE.Mesh(ng.build(), this.neonMat));
    this.downMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    const db = new GeoBuilder();
    for (const x of [8.9, 9.7, 10.5]) db.addGeometry(new THREE.CircleGeometry(0.08, 10).rotateX(Math.PI / 2), trs(lx(x), ly(2.715), Zf + 0.8));
    this.outside.add(new THREE.Mesh(db.build(), this.downMat));
    this.poolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffe8c8'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, s.z1 - Zf + 2).rotateX(-Math.PI / 2), this.poolMat);
    pool.position.set(lx(W / 2), CITY.CURB + 0.045, (Zf + s.z1) / 2 + 0.5);
    pool.renderOrder = 2;
    this.outside.add(pool);

    for (const sp of this.patioSeats) sp.route = [{ x: sp.x, z: Zf + 0.95 }, xz(sp)];
    // queues, waiting, pickup, crew stations (all world positions)
    this.queues = REG.map((x) => [0, 1, 2, 3, 4].map((k) => xz(this.w(x, CTR_F + 0.55 + k * 0.75))));
    this.cashierSpots = REG.map((x) => ({ ...xz(this.w(x, 5.75)), yaw: 0 }));
    this.waitSpots = [];
    for (let k = 0; k < 8; k++) this.waitSpots.push({ ...xz(this.w(12.8 + (k % 4) * 0.9, 7.95 + Math.floor(k / 4) * 0.8)), yaw: Math.PI });
    this.pickSlots = PICK.map((x) => ({ tray: this.w(x, 6.55, 1.06), stand: xz(this.w(x, CTR_F + 0.45)), expo: xz(this.w(x, 5.75)) }));
    this.crewSpots = {
      grill: { ...xz(this.w(9.9, 1.55)), yaw: Math.PI },
      assembly: { ...xz(this.w(10.3, 4.25)), yaw: 0 },
      fry: { ...xz(this.w(14.0, 4.25)), yaw: 0 },
      dump: { ...xz(this.w(12.45, 4.25)), yaw: 0 },
      expo: { ...xz(this.w(14.4, 5.75)), yaw: 0 },
      flapIn: xz(this.w(6.75, 5.6)),
      flapOut: xz(this.w(6.75, 7.5)),
      manager: { ...xz(this.w(16.0, 7.6)), yaw: Math.PI },
    };
    this.aisle = (x) => xz(this.w(x - this.origin.x, AISLE));
    this.crayonSpot = xz(this.w(5.3, 6.3));
    this.sinkSpots = [0.9, 1.9].map((z) => xz(this.w(5.7, z)));
    this.muralLook = xz(this.w(0.9, 10.0));
    this.patioGate = xz(this.w(9.7, this.site.z1 - this.origin.z - 0.2));
    this.doorCenter = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.15);
    this.doorOut = this.w((DOOR[0] + DOOR[1]) / 2, D + 1.4);
    this.doorIn = this.w((DOOR[0] + DOOR[1]) / 2, D - 0.9);
    this.street = { x: lx(9.7), z: s.z1 + 1.4 };
    this.outsideSpot = { x: lx(9.7), z: s.z1 + 1.6, yaw: Math.PI };
  }

  buildDoors() {
    const o = this.origin;
    const mk = () => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      const fr = shade('#0e6a70');
      b.box(-0.5, 0, -0.03, 0.5, 0.08, 0.03, { color: fr, bottom: true });
      b.box(-0.5, 2.32, -0.03, 0.5, 2.4, 0.03, { color: fr, bottom: true });
      b.box(-0.5, 0, -0.03, -0.44, 2.4, 0.03, { color: fr });
      b.box(0.44, 0, -0.03, 0.5, 2.4, 0.03, { color: fr });
      b.box(-0.44, 1.0, -0.035, 0.44, 1.07, 0.035, { color: shade(orange) });
      g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 2.24), new THREE.MeshBasicMaterial({ color: '#a8d8e0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.y = 1.2;
      glass.renderOrder = 5;
      g.add(glass);
      this.outside.add(g);
      return g;
    };
    this.doorL = mk();
    this.doorR = mk();
    // locked between 2 and 6 AM
    this.city.colliders.add(o.x + DOOR[0], o.z + D - 0.05, o.x + DOOR[1], o.z + D + 0.32, o.y, o.y + 2.4);
    this.gate = this.city.colliders.boxes[this.city.colliders.boxes.length - 1];
    this.gateTop = this.gate.y1;
    this.positionDoors();
  }

  positionDoors() {
    const o = this.origin;
    const z = o.z + D + 0.1;
    this.doorL.position.set(o.x + DOOR[0] + 0.5 - this.doorOpen * 0.95, o.y, z);
    this.doorR.position.set(o.x + DOOR[1] - 0.5 + this.doorOpen * 0.95, o.y, z);
  }

  // ==========================================================================
  /** s: { hour, camera, people (positions that open the doors), serving (numbers), riding } */
  update(dt, time, env, s) {
    const cam = s.camera.position;
    const near = cam.distanceTo(this.doorCenter) < 70;
    this.group.visible = near;
    const open = isOpen(s.hour);
    this.open = open;
    this.gate.y1 = open ? -10 : this.gateTop;
    const u = this.uniforms;
    u.uLampOn.value = damp(u.uLampOn.value, open ? 1 : 0.22, 2, dt);
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.35).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.08));
    if (this.kit.glowMat) this.kit.glowMat.color.setScalar(open ? 1.4 : 0.4);
    const breakfast = s.hour >= 6 && s.hour < BREAKFAST_UNTIL;
    const map = breakfast ? this.gt.breakfast : this.gt.lunch;
    if (this.menuMat.map !== map) {
      this.menuMat.map = map;
      this.menuMat.needsUpdate = true;
    }
    this.menuMat.color.setScalar(open ? 1.15 : 0.15);
    this.serveBoard.draw(open ? s.serving : []);

    // doors
    let want = 0;
    if (open) for (const p of s.people) if (Math.hypot(p.x - this.doorCenter.x, p.z - this.doorCenter.z) < 2.3) want = 1;
    this.doorOpen = damp(this.doorOpen, want, want ? 7 : 4, dt);
    this.positionDoors();

    // kitchen life
    if (near) {
      this.baskets.forEach((b, k) => {
        const ph = (time * 0.05 + k * 0.37) % 1;
        const down = open && ph > 0.15 && ph < 0.7;
        b.position.y = damp(b.position.y, this.origin.y + (down ? 0.82 : 1.0), 5, dt);
      });
      const sp = this.steam.geometry.attributes.position;
      const g = this.grill;
      this.steamSeeds.forEach(([ph, fx, fz], k) => {
        const life = (time * 0.35 + ph) % 1;
        sp.setXYZ(k, this.origin.x + g.x0 + fx * (g.x1 - g.x0), this.origin.y + g.y + 0.1 + life * 1.0, this.origin.z + g.z0 + fz * (g.z1 - g.z0));
      });
      sp.needsUpdate = true;
      this.steamMat.opacity = open ? 0.18 : 0;
      this.rideBob = damp(this.rideBob, s.riding ? 1 : 0, 3, dt);
      this.ride.position.y = this.origin.y + 0.22 + this.rideBob * (0.06 + 0.06 * Math.sin(time * 6));
      this.ride.rotation.z = this.rideBob * Math.sin(time * 3) * 0.12;
    }

    // outside: the pole sign's Gully turns, signs and neon light up at night
    this.poleGully.rotation.y = time * 0.6;
    const night = env.night;
    this.signMat.emissiveIntensity = 0.25 + night * 0.9 * (open ? 1 : 0.35);
    this.neonMat.opacity = open ? night * 0.9 : 0;
    this.downMat.color.setScalar(open ? 0.4 + night : 0.1);
    this.poolMat.opacity = open ? night * 0.35 : 0;
  }
}

function xz(v) {
  return { x: v.x, z: v.z };
}
