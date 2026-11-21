import * as THREE from 'three';
import { CITY, MOTORS_SITE } from '../config.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { damp, smoothstep } from '../core/rng.js';
import { InteriorKit, C, F } from './interior/kit.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { createMotorsTextures, msignUV } from '../render/motorsTextures.js';
import { additive } from '../render/materials.js';
import { CARS, CAR, makeCarMesh } from '../game/cars.js';

// CORSO MOTORS, Kiln Heights: a glass-fronted car showroom just north of the
// Meridian tower. Part of the street like the Exchange (no loading screen).
//
//   x 0                                    30      (local metres; z 0 is the back
//   ┌──────────[ CORSO MOTORS logo wall ]───┐ z 0    wall, z 18 the glass front)
//   │ espresso │  HALDVARD     (turntable:    │ sales │
//   │ lounge   │  Monarch       the Rift)     │ desk  │
//   │ sofas    │                              │ (Vic) │
//   │  Pip   Strada    [ aisle ]   Kestrel  Spider │
//   └─────────────────[ doors ]─────────────────┘ z 18
//     forecourt: two approved used Pips · pylon · flags · DELIVERY BAY
//
// Open 9 AM to 8 PM. Cars you buy are delivered to the bay out front.

const W = 30;
const D = 18;
const H = 6.2;
const ROOF = 7.7;
const T = 0.22; // wall thickness
const DOOR = [13.8, 16.2];
const R90 = Math.PI / 2;
const PI = Math.PI;
export const motorsOpen = (h) => h >= 9 && h < 20;

// display cars: model, where (local), facing, paint
const DISPLAY = [
  { id: 'pip', x: 3.6, z: 13.2, yaw: -0.45 },
  { id: 'strada', x: 8.9, z: 13.2, yaw: -0.3 },
  { id: 'kestrel', x: 21.1, z: 13.2, yaw: 0.3 },
  { id: 'spider', x: 26.4, z: 13.2, yaw: 0.45 },
  { id: 'monarch', x: 9.6, z: 6.4, yaw: 0.75 },
];
const TURN = { x: 16, z: 6.4, r: 3.1 }; // the turntable (the Rift)

export class Motors {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.motorsSite;
    this.site = site;
    this.origin = new THREE.Vector3(site.x0 + 1.0, CITY.CURB + MOTORS_SITE.floorLift, site.z0 + 0.5);
    this.W = W;
    this.D = D;
    this.H = H;
    this.cityTex = cityTex;
    this.mt = createMotorsTextures();
    this.group = new THREE.Group();
    this.outside = new THREE.Group();
    scene.add(this.group, this.outside);
    this.uniforms = makeInteriorUniforms();
    this.tex = { ...interiorTex, ...this.mt.kit };
    this.open = true;

    this.seats = []; // lounge sofas and the desk's client chairs
    this.displays = []; // { id, m, x, z, yaw, mesh, look: [spots], card: {x,z} }
    this.lookSpots = []; // where browsers stand and look: { x, z, yaw, car }
    this.staffSpots = {};
    this.bays = []; // delivery bays on the forecourt: { x, z, yaw }

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildInterior(kit);
    kit.build(this.group, {}, { fog: true });
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.fixtures = kit.lights;
    this.buildCars();
    this.buildExterior();
    this.buildDoors();
  }

  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  local(p) {
    return { x: p.x - this.origin.x, z: p.z - this.origin.z, y: p.y - this.origin.y };
  }

  contains(p, pad = 0) {
    const { x, z, y } = this.local(p);
    return x > -pad && x < W + pad && z > -pad && z < D + pad && y < H;
  }

  /** On the forecourt (between the glass and the pavement)? */
  onForecourt(p) {
    const { x, z } = this.local(p);
    return x > -1 && x < W + 1 && z > D + T && p.z < this.site.z1 + 0.5;
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const dark = '#1a1a1e';
    kit.room('show', 0, 0, W, D, {
      floor: 'marble',
      floorColor: '#8e8e96',
      wall: 'plaster',
      wallColor: '#d4d4d2',
      ceil: '#c8c8c6',
      ceilKey: 'plaster',
      base: '#2a2a2e',
      trim: '#c8c8cc',
      zone: 'show',
    });

    // ---------------------------------------------------------------- walls: glass front, glass at the front of the sides
    const win = (from, to, y0, y1, grid) => ({ from, to, kind: 'window', y0, y1, grid, frame: '#2a2a2e', trim: '#2a2a2e' });
    kit.wall('x', 0, 0, W, { t: T, ext: -1 });
    kit.wall('z', 0, 0, D, { t: T, ext: -1, open: [win(9.4, 16.6, 0.6, 5.4, [3, 2])] });
    kit.wall('z', W, 0, D, { t: T, ext: 1, open: [win(9.4, 16.6, 0.6, 5.4, [3, 2])] });
    kit.wall('x', D, 0, W, {
      t: T,
      ext: 1,
      open: [
        win(0.4, 13.6, 0.12, 5.6, [5, 2]),
        { from: DOOR[0], to: DOOR[1], gaps: [{ y0: 0, y1: 3.0, kind: 'opening', trim: '#2a2a2e' }, { y0: 3.4, y1: 5.6, kind: 'window', grid: [2, 1], frame: '#2a2a2e', trim: '#2a2a2e' }] },
        win(16.4, 29.6, 0.12, 5.6, [5, 2]),
      ],
    });

    // ---------------------------------------------------------------- the logo wall and a red stripe round the room
    const LW = [8.5, 23.5];
    P(0, 0).box('solid', LW[0], 0.0, 0.0, LW[1], 6.0, 0.12, C('#141416'));
    this.logoAt = { x0: LW[0] + 1.5, x1: LW[1] - 1.5, y0: 3.4, y1: 5.6, z: 0.13 };
    for (const [axis, at, a0, a1, flip] of [
      ['x', 0.006, 0.4, LW[0] - 0.2, false],
      ['x', 0.006, LW[1] + 0.2, W - 0.4, false],
      ['z', 0.006, 0.4, 9.2, false],
      ['z', W - 0.006, 0.4, 9.2, true],
    ]) {
      const p = axis === 'x' ? P(0, at) : flip ? P(at, 0, -R90) : P(at, 0, R90);
      if (axis === 'x') p.panel('mSigns', a0, 1.0, a1, 1.14, 0, msignUV('stripe'));
      else if (!flip) p.panel('mSigns', -a1, 1.0, -a0, 1.14, 0, msignUV('stripe'));
      else p.panel('mSigns', a0, 1.0, a1, 1.14, 0, msignUV('stripe'));
    }
    // ceiling: long light strips in rows, spots over the turntable
    for (let x = 3; x < W; x += 6)
      for (const z of [3.2, 9.2, 15.0]) {
        P(x, z).box('solid', -1.6, H - 0.07, -0.09, 1.6, H, 0.09, C('#d8d8d4'));
        P(x, z).box('glow', -1.55, H - 0.075, -0.05, 1.55, H - 0.07, 0.05, C('#f6f8ff'));
        P(x, z).light(0, H - 0.4, 0, '#f2f4ff', 0.42, true);
      }
    for (const [dx, dz] of [
      [-2.2, -1.8],
      [2.2, -1.8],
      [-2.2, 1.8],
      [2.2, 1.8],
    ]) {
      P(TURN.x + dx, TURN.z + dz).geo('solid', new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10, 1, true), 0, H - 0.15, 0, C('#2a2a2e'));
      P(TURN.x + dx, TURN.z + dz).geo('glow', new THREE.CylinderGeometry(0.09, 0.09, 0.01, 10), 0, H - 0.3, 0, C('#fff8e8'));
      P(TURN.x + dx, TURN.z + dz).light(0, H - 0.6, 0, '#fff4e0', 0.4, true);
    }

    // ---------------------------------------------------------------- the turntable's static ring and its collider
    P(TURN.x, TURN.z).geo('solid', new THREE.CylinderGeometry(TURN.r + 0.25, TURN.r + 0.3, 0.1, 40, 1, true), 0, 0.05, 0, C('#2a2a2e'));
    P(TURN.x, TURN.z).geo('glow', new THREE.RingGeometry(TURN.r + 0.02, TURN.r + 0.1, 48).rotateX(-R90), 0, 0.105, 0, C('#ff4a3a'));
    P(TURN.x, TURN.z).geo('solid', new THREE.RingGeometry(TURN.r + 0.1, TURN.r + 0.26, 48).rotateX(-R90), 0, 0.1, 0, C('#2a2a2e'));
    P(TURN.x, TURN.z).collide(-TURN.r - 0.3, -TURN.r - 0.3, TURN.r + 0.3, TURN.r + 0.3, 0.6).shadow(-TURN.r, -TURN.r, TURN.r, TURN.r, 0.35);
    // the Rift's banner on a stand beside it
    const B = P(TURN.x + 4.2, TURN.z + 2.9, -0.35);
    B.box('solid', -0.03, 0, -0.03, 0.03, 2.4, 0.03, C('#2a2a2e'));
    B.box('solid', -1.3, 1.3, -0.04, 1.3, 2.3, -0.01, C('#0e0e10'));
    B.panel('mSigns', -1.25, 1.33, 1.25, 2.27, 0.006, msignUV('rift'));
    B.box('solid', -0.35, 0, -0.25, 0.35, 0.04, 0.25, C('#2a2a2e'));
    B.collide(-0.4, -0.3, 0.4, 0.3, 2.4);

    // ---------------------------------------------------------------- the espresso lounge (back left)
    F.counter(P(0.6, 0), { x0: 0, x1: 3.6, cab: '#1a1a1e', top: '#e8e6e0', topKey: 'marble', handles: '#c8c8cc' });
    P(0.6, 0).collide(0, 0, 3.6, 0.65, 1.0);
    const esp = P(1.5, 0.3);
    esp.box('solid', -0.3, 0.92, -0.2, 0.3, 1.38, 0.2, C('#c8ccd0'));
    esp.box('solid', -0.3, 1.38, -0.2, 0.3, 1.44, 0.2, C('#d8241c'));
    esp.box('solid', -0.2, 1.02, 0.2, 0.2, 1.08, 0.26, C('#2a2a2e'));
    for (const x of [-0.12, 0.12]) esp.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), x, 0.98, 0.24, C('#1a1a1e'));
    esp.geo('glow', new THREE.CylinderGeometry(0.025, 0.025, 0.01, 8), -0.2, 1.3, 0.205, C('#7aff8a'), 0, 1, 1, 1, R90);
    for (let k = 0; k < 6; k++) esp.geo('solid', new THREE.CylinderGeometry(0.035, 0.03, 0.06, 8), 0.55 + (k % 3) * 0.09, 0.95, -0.05 + Math.floor(k / 3) * 0.09, C('#f2f0ea'));
    P(0.6 + 2.6, 0.3).geo('solid', new THREE.CylinderGeometry(0.1, 0.12, 0.26, 10), 0, 1.05, 0, C('#3a2a1e')); // a jar of biscotti
    P(0, 0).panel('mSigns', 1.4, 1.5, 2.6, 2.9, 0.006, msignUV('coffee'));
    this.espresso = this.w(1.5 + 0.6, 1.0);
    // the sofas, a coffee table with brochures, a rug, a lamp, plants
    F.rug(P(2.4, 4.6), { w: 3.6, l: 3.2, key: 'rugModern' });
    F.sofa(P(0, 4.6, R90), { w: 2.4, col: '#1e1e22', style: 'modern', accent: '#d8241c' });
    F.sofa(P(2.6, 7.3, PI), { w: 2.2, col: '#1e1e22', style: 'modern', accent: '#c8c8cc' });
    F.coffeeTable(P(2.3, 4.9), { w: 1.2, d: 0.7, glass: true });
    // (the table comes with a couple of glossy brochures on it)
    this.brochures = this.w(2.3, 4.9);
    F.floorLamp(P(0.45, 7.0), { col: '#1a1a1e', shade: '#f6f2ea', power: 0.5 });
    F.plant(P(0.5, 1.2), { kind: 'tall', pot: '#1a1a1e' });
    F.plant(P(5.6, 0.5), { kind: 'big', pot: '#1a1a1e' });
    const seat = (Pl, x, z, seatH, yaw, outDz = 0.9) => {
      const p = Pl.point(x, 0, z);
      const o = Pl.point(x, 0, z + outDz);
      this.seats.push({ x: p.x, z: p.z, y: this.origin.y, yaw, seatH, out: { x: o.x, z: o.z } });
    };
    const sA = P(0, 4.6, R90);
    for (const x of [-0.7, 0, 0.7]) seat(sA, x, 0.55, 0.45, R90);
    const sB = P(2.6, 7.3, PI);
    for (const x of [-0.55, 0.55]) seat(sB, x, 0.55, 0.45, PI);

    // ---------------------------------------------------------------- the sales desk (back right)
    const dk = P(25.8, 3.4);
    dk.box('solid', -1.2, 0, -0.45, 1.2, 0.74, 0.45, C('#f2f2f0'));
    dk.box('solid', -1.25, 0.74, -0.5, 1.25, 0.78, 0.5, C('#1a1a1e'));
    dk.panel('mSigns', -0.45, 0.12, 0.45, 0.72, 0.456, msignUV('welcome'));
    dk.box('solid', -0.35, 0.78, -0.25, 0.35, 0.8, -0.05, C('#2a2a2e')); // keyboard tray
    dk.box('solid', -0.03, 0.8, -0.35, 0.03, 1.05, -0.3, C('#c8ccd0'));
    dk.box('solid', -0.32, 1.0, -0.36, 0.32, 1.36, -0.32, C('#e8e8ea'));
    dk.panel('tv', -0.29, 1.03, 0.29, 1.33, -0.315);
    dk.box('solid', 0.6, 0.78, -0.1, 0.9, 0.8, 0.12, C('#f2f0ea')); // a contract
    dk.box('solid', 0.62, 0.8, 0.0, 0.88, 0.802, 0.012, C('#1a1a1e'));
    dk.collide(-1.25, -0.5, 1.25, 0.5, 0.8).shadow(-1.25, -0.5, 1.25, 0.5, 0.5);
    this.staffSpots.vic = { ...xz(this.w(25.8, 2.35)), y: this.origin.y, yaw: 0 };
    for (const x of [25.1, 26.5]) {
      F.chair(P(x, 4.75, PI), { col: '#d8241c' });
      seat(P(x, 4.75, PI), 0, 0, 0.47, PI, -0.75);
    }
    this.deskSpot = this.w(25.8, 5.3);
    // a sideboard of 1:18 models and the key cabinet
    const sb = P(W, 3.6, -R90);
    sb.box('wood', -1.4, 0, 0, 1.4, 0.8, 0.45, C('#2a2a2e'));
    sb.box('solid', -1.42, 0.8, 0, 1.42, 0.83, 0.47, C('#e8e6e0'));
    sb.collide(-1.42, 0, 1.42, 0.47, 0.9);
    this.models = [
      ['rift', '#e8b818', -0.9],
      ['spider', '#c43a2a', 0],
      ['kestrel', '#1a3a6a', 0.9],
    ].map(([id, col, x]) => ({ id, col, at: sb.point(x, 0.83, 0.24), yaw: -R90 + 0.6 }));
    const kc = P(W, 7.4, -R90);
    kc.box('wood', -0.5, 1.2, 0, 0.5, 2.2, 0.12, C('#1a1a1e'));
    kc.box('glass', -0.46, 1.24, 0.12, 0.46, 2.16, 0.13);
    for (let k = 0; k < 12; k++) kc.box('solid', -0.38 + (k % 4) * 0.25, 1.4 + Math.floor(k / 4) * 0.26, 0.1, -0.34 + (k % 4) * 0.25, 1.52 + Math.floor(k / 4) * 0.26, 0.115, C(k % 3 ? '#c8ccd0' : '#d8241c'));
    F.plant(P(W - 0.5, 0.5), { kind: 'big', pot: '#1a1a1e' });
    F.plant(P(22.8, 0.5), { kind: 'tall', pot: '#1a1a1e' });
    // TEST DRIVES sign on a stand by the desk
    const ts = P(23.0, 6.8, -0.5);
    ts.box('solid', -0.025, 0, -0.025, 0.025, 1.4, 0.025, C('#2a2a2e'));
    ts.box('solid', -0.52, 1.1, -0.03, 0.52, 1.62, -0.005, C('#d8241c'));
    ts.panel('mSigns', -0.5, 1.12, 0.5, 1.6, 0.006, msignUV('test'));
    ts.box('solid', -0.25, 0, -0.2, 0.25, 0.03, 0.2, C('#2a2a2e'));
    ts.collide(-0.3, -0.25, 0.3, 0.25, 1.6);

    // ---------------------------------------------------------------- a mat inside the doors, the hours on the glass
    P((DOOR[0] + DOOR[1]) / 2, D - 1.0).box('solid', -1.4, 0, -0.8, 1.4, 0.012, 0.8, C('#1e1e22'));
    this.staffSpots.nico = null; // set in buildCars (beside the Kestrel)

    // ---------------------------------------------------------------- the display cars' colliders and placards
    for (const d of DISPLAY) {
      const m = CAR[d.id];
      const Pc = P(d.x, d.z, d.yaw);
      Pc.collide(-m.W / 2 - 0.05, -m.L / 2 - 0.05, m.W / 2 + 0.05, m.L / 2 + 0.05, 1.4);
      Pc.shadow(-m.W / 2, -m.L / 2, m.W / 2, m.L / 2, 0.4);
      // a placard on a little lectern off the front corner
      const cx = m.W / 2 + 0.55;
      const cz = m.L / 2 - 0.4;
      const L = Pc.sub(cx, cz, 0);
      L.box('solid', -0.02, 0, -0.02, 0.02, 0.9, 0.02, C('#2a2a2e'));
      L.box('solid', -0.2, 0, -0.15, 0.2, 0.02, 0.15, C('#2a2a2e'));
      const top = L.sub(0, 0, 0);
      top.geo('solid', new THREE.BoxGeometry(0.5, 0.27, 0.02), 0, 1.0, 0, C('#2a2a2e'), 0, 1, 1, 1, -0.5);
      top.quad('mSigns', [-0.24, 0.9, 0.077], [0.24, 0.9, 0.077], [0.24, 1.12, -0.04], [-0.24, 1.12, -0.04], [0, 0.88, 0.48], msignUV(`card:${d.id}`));
      L.collide(-0.25, -0.2, 0.25, 0.2, 1.1);
      const card = Pc.point(cx, 0, cz + 0.6);
      // two places to stand and look: the front corner and the side
      const lookA = Pc.point(0, 0, m.L / 2 + 1.1);
      const lookB = Pc.point(-m.W / 2 - 0.9, 0, 0.2);
      const looks = [
        { x: lookA.x, z: lookA.z, yaw: d.yaw + PI, car: d.id },
        { x: lookB.x, z: lookB.z, yaw: d.yaw + R90, car: d.id },
      ];
      this.lookSpots.push(...looks);
      this.displays.push({ ...d, m, card: { x: card.x, z: card.z }, looks, world: this.w(d.x, d.z) });
    }
    const tlook = [
      [TURN.x, TURN.z + TURN.r + 0.9, PI],
      [TURN.x - TURN.r - 0.8, TURN.z + 1.2, R90],
    ];
    for (const [x, z, yaw] of tlook) this.lookSpots.push({ ...xz(this.w(x, z)), yaw, car: 'rift' });
    this.turnLook = this.w(TURN.x, TURN.z + TURN.r + 0.9);
  }

  /** The cars themselves: real models (game/cars.js), not baked into the room. */
  buildCars() {
    const PAINT = { pip: '#c43a2a', strada: '#c8c8cc', kestrel: '#1a3a6a', spider: '#e8dcc0', monarch: '#141418', rift: '#e8b818' };
    this.paint = { ...PAINT };
    this.carMeshes = {};
    const y = this.origin.y;
    for (const d of this.displays) {
      const car = makeCarMesh(d.m, PAINT[d.id], this.cityTex, { static: true, steer: 0.25 }); // a showroom wheel turn
      car.group.position.set(this.origin.x + d.x, y, this.origin.z + d.z);
      car.group.rotation.y = d.yaw;
      this.group.add(car.group);
      this.carMeshes[d.id] = car;
    }
    // the turntable: a dark disc that turns, with the Rift on it
    this.turntable = new THREE.Group();
    this.turntable.position.set(this.origin.x + TURN.x, y, this.origin.z + TURN.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(TURN.r, TURN.r, 0.1, 40), new THREE.MeshPhongMaterial({ color: '#2a2a2e', shininess: 60, specular: '#444444' }));
    disc.position.y = 0.06;
    this.turntable.add(disc);
    const rift = makeCarMesh(CAR.rift, PAINT.rift, this.cityTex, { static: true });
    rift.group.position.y = 0.11;
    this.turntable.add(rift.group);
    this.carMeshes.rift = rift;
    this.group.add(this.turntable);
    // the little 1:18 models on the sideboard
    for (const md of this.models) {
      const m = makeCarMesh(CAR[md.id], md.col, this.cityTex, { static: true, noShadow: true });
      m.group.scale.setScalar(1 / 18);
      m.group.position.copy(md.at);
      m.group.rotation.y = md.yaw;
      this.group.add(m.group);
    }
    const k = this.displays.find((d) => d.id === 'kestrel');
    const side = new THREE.Vector3(-(k.m.W / 2 + 0.55), 0, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), k.yaw);
    this.staffSpots.nico = { x: this.origin.x + k.x + side.x, z: this.origin.z + k.z + side.z, y: this.origin.y, yaw: k.yaw + R90 };
  }

  /** Repaint a showroom car (when you pick a colour at the desk). */
  repaint(id, paint) {
    const car = this.carMeshes[id];
    if (car) car.paintMat.color.set(paint);
  }

  // ==========================================================================
  buildExterior() {
    const o = this.origin;
    const s = this.site;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;
    const Zf = o.z + D + T;
    const Yb = CITY.CURB;
    this.Zf = Zf;
    // --- the shell: a dark plinth, white render, a black fascia band with the name
    const shell = new GeoBuilder();
    const bands = [
      [Yb, ly(0.12), '#2a2a2e'],
      [ly(0.12), ly(5.85), '#e8e8e6'],
      [ly(5.85), ly(ROOF), '#16161a'],
    ];
    const S = 3;
    // a face from a to b (in plan), cut around holes given along the face's length (u from a)
    const face = (ax, az, bx, bz, n, holes = []) => {
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (const [u0, u1, y0, y1] of solidAround(0, len, 0, ROOF, holes))
        for (const [b0, b1, col] of bands) {
          const ya = Math.max(y0 <= 0 ? Yb : ly(y0), b0);
          const yb = Math.min(ly(y1), b1);
          if (yb - ya < 0.001) continue;
          shell.quad([ax + ux * u0, ya, az + uz * u0], [ax + ux * u1, ya, az + uz * u1], [ax + ux * u1, yb, az + uz * u1], [ax + ux * u0, yb, az + uz * u0], n, [u0 / S, ya / S, u1 / S, yb / S], shade(col));
        }
    };
    const fh = [
      [0.4 + T, 13.6 + T, 0.12, 5.6],
      [DOOR[0] + T, DOOR[1] + T, 0, 3.0],
      [DOOR[0] + T, DOOR[1] + T, 3.4, 5.6],
      [16.4 + T, 29.6 + T, 0.12, 5.6],
    ];
    face(lx(-T), Zf, lx(W + T), Zf, [0, 0, 1], fh);
    face(lx(W + T), o.z - T, lx(-T), o.z - T, [0, 0, -1]);
    // the sides: their windows run from z 9.4 to 16.6
    face(lx(-T), o.z - T, lx(-T), Zf, [-1, 0, 0], [[9.4 + T, 16.6 + T, 0.6, 5.4]]);
    face(lx(W + T), Zf, lx(W + T), o.z - T, [1, 0, 0], [[D + T - 16.6, D + T - 9.4, 0.6, 5.4]]);
    this.outside.add(new THREE.Mesh(shell.build(), new THREE.MeshLambertMaterial({ map: this.tex.plaster.map, vertexColors: true })));

    const st = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, col, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: shade(col), bottom: true, ...op });
    // roof slab and a coping, a canopy over the doors on two slim posts
    box(lx(-T + 0.03), ly(ROOF - 0.2), o.z - T + 0.03, lx(W + T - 0.03), ly(ROOF - 0.05), Zf - 0.03, '#5a5a5e');
    box(lx(-T - 0.1), ly(ROOF), o.z - T - 0.1, lx(W + T + 0.1), ly(ROOF + 0.14), Zf + 0.1, '#2a2a2e');
    const cx0 = lx(DOOR[0] - 1.4);
    const cx1 = lx(DOOR[1] + 1.4);
    box(cx0, ly(3.6), Zf, cx1, ly(3.8), Zf + 2.2, '#2a2a2e');
    for (const x of [cx0 + 0.15, cx1 - 0.15]) {
      box(x - 0.05, Yb + 0.02, Zf + 2.0, x + 0.05, ly(3.6), Zf + 2.1, '#2a2a2e');
      this.city.colliders.add(x - 0.12, Zf + 1.93, x + 0.12, Zf + 2.17, 0, ly(3.6));
    }
    // the forecourt: pale concrete flags, white bay lines
    const P0 = CITY.CURB + 0.02;
    const fz1 = s.z1;
    const pz = new GeoBuilder();
    pz.box(s.x0, CITY.CURB, Zf, s.x1, P0, fz1, { sx: 3, sy: 3, topScale: 3, bottom: false });
    this.outside.add(new THREE.Mesh(pz.build(), new THREE.MeshLambertMaterial({ map: this.tex.concrete.map, color: '#d8d6d0' })));
    const lines = new GeoBuilder();
    const bayX = [1.6, 4.6, 7.6, 22.4, 25.4, 28.4];
    for (const x of bayX) lines.box(lx(x) - 0.06, P0, Zf + 0.4, lx(x) + 0.06, P0 + 0.006, fz1 - 0.2, { color: shade('#f2f0e8') });
    // the canopy's pool of light falls between the bays
    this.outside.add(new THREE.Mesh(lines.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    // DELIVERY BAY, painted between the right-hand lines
    const dq = new GeoBuilder();
    dq.quad([lx(22.6), P0 + 0.014, fz1 - 0.6], [lx(28.2), P0 + 0.014, fz1 - 0.6], [lx(28.2), P0 + 0.014, fz1 - 1.6], [lx(22.6), P0 + 0.014, fz1 - 1.6], [0, 1, 0], msignUV('delivery'));
    this.bays = [23.9, 26.9].map((x) => ({ x: lx(x), z: (Zf + fz1) / 2, yaw: 0 }));
    this.usedBays = [3.1, 6.1].map((x) => ({ x: lx(x), z: (Zf + fz1) / 2, yaw: 0 }));
    // the pylon: a tall black totem with the badge, lit, by the pavement
    const py = { x: lx(9.2), z: fz1 - 0.6 };
    box(py.x - 0.42, P0, py.z - 0.2, py.x + 0.42, P0 + 5.2, py.z + 0.2, '#16161a');
    this.city.colliders.add(py.x - 0.5, py.z - 0.28, py.x + 0.5, py.z + 0.28, 0, 5.4);
    for (const zz of [py.z + 0.206, py.z - 0.206]) {
      const f = zz > py.z ? 1 : -1;
      const xa = f > 0 ? py.x - 0.36 : py.x + 0.36;
      const xb = f > 0 ? py.x + 0.36 : py.x - 0.36;
      dq.quad([xa, P0 + 0.6, zz], [xb, P0 + 0.6, zz], [xb, P0 + 5.0, zz], [xa, P0 + 5.0, zz], [0, 0, f], msignUV('pylon'));
    }
    // three flags on poles at the right-hand end
    this.flags = [];
    for (let k = 0; k < 3; k++) {
      const x = lx(19 + k * 1.0);
      const z = fz1 - 0.4;
      box(x - 0.04, P0, z - 0.04, x + 0.04, P0 + 6.5, z + 0.04, '#d8d8dc');
      this.city.colliders.add(x - 0.12, z - 0.12, x + 0.12, z + 0.12, 0, 6.5);
      this.flags.push({ x, z, y: P0 + 6.3, k });
    }
    this.outside.add(new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.flagMesh = this.buildFlags();
    // A-boards in front of the two used Pips
    for (const b of this.usedBays) {
      const ab = new GeoBuilder();
      const z0 = fz1 - 0.35;
      ab.quad([b.x - 0.4, P0, z0], [b.x + 0.4, P0, z0], [b.x + 0.4, P0 + 0.75, z0 - 0.18], [b.x - 0.4, P0 + 0.75, z0 - 0.18], [0, 0.24, 0.97], msignUV('used'));
      this.outside.add(new THREE.Mesh(ab.build(), new THREE.MeshLambertMaterial({ map: this.mt.msigns, side: THREE.DoubleSide })));
      const used = makeCarMesh(CAR.pip, b.x < lx(5) ? '#5a8a4a' : '#e8e4dc', this.cityTex, { static: true });
      used.group.position.set(b.x, CITY.CURB + 0.02, b.z - 0.25);
      this.outside.add(used.group);
      const m = CAR.pip;
      this.city.colliders.add(b.x - m.W / 2, b.z - 0.25 - m.L / 2, b.x + m.W / 2, b.z - 0.25 + m.L / 2, 0, 1.4);
    }
    // --- signs: the fascia, the hours by the door, the bay, the pylon
    const signTex = this.mt.msigns;
    this.signMat = new THREE.MeshLambertMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.15 });
    dq.quad([lx(5), ly(6.0), Zf + 0.006], [lx(25), ly(6.0), Zf + 0.006], [lx(25), ly(7.5), Zf + 0.006], [lx(5), ly(7.5), Zf + 0.006], [0, 0, 1], msignUV('fascia'));
    dq.quad([lx(DOOR[1] + 0.25), ly(2.0), Zf + 0.006], [lx(DOOR[1] + 1.65), ly(2.0), Zf + 0.006], [lx(DOOR[1] + 1.65), ly(2.24), Zf + 0.006], [lx(DOOR[1] + 0.25), ly(2.24), Zf + 0.006], [0, 0, 1], msignUV('hours'));
    this.outside.add(new THREE.Mesh(dq.build(), this.signMat));
    // inside: the logo wall, lit from within (unlit material, dimmed when closed)
    const L = this.logoAt;
    this.logoMat = new THREE.MeshBasicMaterial({ map: signTex, fog: false });
    const lg = new GeoBuilder();
    lg.quad([lx(L.x0), ly(L.y0), o.z + L.z], [lx(L.x1), ly(L.y0), o.z + L.z], [lx(L.x1), ly(L.y1), o.z + L.z], [lx(L.x0), ly(L.y1), o.z + L.z], [0, 0, 1], msignUV('logo'));
    this.group.add(new THREE.Mesh(lg.build(), this.logoMat));
    // at night: light pooling on the forecourt from the showroom and under the canopy
    this.poolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#f0f4ff'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, 7).rotateX(-R90), this.poolMat);
    pool.position.set(lx(W / 2), P0 + 0.02, Zf + 2.4);
    pool.renderOrder = 2;
    this.outside.add(pool);
    this.outsideSpot = { x: lx((DOOR[0] + DOOR[1]) / 2), z: fz1 + 1.2, yaw: PI };
    this.doorCenter = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.12);
  }

  /** Red and white flags; their vertices ripple in update(). */
  buildFlags() {
    const g = new GeoBuilder();
    for (const f of this.flags) {
      const col = shade(f.k === 1 ? '#f2f0e8' : '#d8241c');
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = f.x + 0.05 + (i / n) * 1.1;
        const b = f.x + 0.05 + ((i + 1) / n) * 1.1;
        g.quad([a, f.y - 0.75, f.z], [b, f.y - 0.75, f.z], [b, f.y, f.z], [a, f.y, f.z], [0, 0, 1], [0, 0, 1, 1], col);
      }
    }
    const geo = g.build();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.outside.add(mesh);
    this.flagBase = geo.attributes.position.array.slice();
    return mesh;
  }

  buildDoors() {
    const o = this.origin;
    const mk = () => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      const fr = shade('#2a2a2e');
      b.box(-0.6, 0, -0.03, 0.6, 0.08, 0.03, { color: fr, bottom: true });
      b.box(-0.6, 2.92, -0.03, 0.6, 2.98, 0.03, { color: fr, bottom: true });
      b.box(-0.6, 0, -0.03, -0.56, 2.98, 0.03, { color: fr });
      b.box(0.56, 0, -0.03, 0.6, 2.98, 0.03, { color: fr });
      b.box(-0.03, 0.9, 0.03, 0.03, 1.6, 0.07, { color: shade('#c8ccd0') });
      g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 2.84), new THREE.MeshBasicMaterial({ color: '#c8d8e0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.y = 1.5;
      glass.renderOrder = 5;
      g.add(glass);
      this.outside.add(g);
      return g;
    };
    this.doorL = mk();
    this.doorR = mk();
    this.doorOpen = 0;
    this.gate = this.city.colliders.add(o.x + DOOR[0], o.z + D - 0.05, o.x + DOOR[1], o.z + D + T + 0.05, o.y, o.y + 3.0);
    this.gateTop = this.gate.y1;
    this.positionDoors();
  }

  positionDoors() {
    const o = this.origin;
    const z = o.z + D + T / 2;
    this.doorL.position.set(o.x + DOOR[0] + 0.6 - this.doorOpen * 1.1, o.y, z);
    this.doorR.position.set(o.x + DOOR[1] - 0.6 + this.doorOpen * 1.1, o.y, z);
  }

  /** A free delivery bay (or the first one). */
  freeBay(cars) {
    for (const b of this.bays) if (!cars.some((c) => Math.hypot(c.rec.x - b.x, c.rec.z - b.z) < 2.2)) return b;
    return this.bays[0];
  }

  // ==========================================================================
  /** s: { hour, camera, people } */
  update(dt, time, env, s) {
    const cam = s.camera.position;
    const near = cam.distanceTo(this.doorCenter) < 110;
    this.group.visible = near;
    const open = motorsOpen(s.hour);
    this.open = open;
    this.gate.y1 = open ? -10 : this.gateTop;
    const u = this.uniforms;
    // closed, the showroom stays softly lit (the cars are the shop window)
    u.uLampOn.value = damp(u.uLampOn.value, open ? 1 : 0.45, 2, dt);
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.25).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.05));
    if (this.kit.glowMat) this.kit.glowMat.color.setScalar(open ? 1.1 : 0.5);
    const night = env.night ?? 1 - sunUp;
    this.signMat.emissiveIntensity = 0.15 + night * 0.7;
    this.logoMat.color.setScalar(open ? 1 : 0.6);
    this.poolMat.opacity = night * (open ? 0.32 : 0.16);
    let want = 0;
    if (open) for (const p of s.people) if (Math.abs(p.x - this.doorCenter.x) < 2.4 && Math.abs(p.z - this.doorCenter.z) < 2.4) want = 1;
    this.doorOpen = damp(this.doorOpen, want, want ? 6 : 3, dt);
    this.positionDoors();
    if (!near) return;
    // the turntable turns (slowly; it stops when the showroom shuts)
    this.turnSpeed = damp(this.turnSpeed ?? 0, open ? 0.12 : 0, 1, dt);
    this.turntable.rotation.y += this.turnSpeed * dt;
    // the flags ripple
    const pos = this.flagMesh.geometry.attributes.position;
    const a = pos.array;
    const b = this.flagBase;
    for (let i = 0; i < a.length; i += 3) {
      const f = this.flags.find((q) => b[i] >= q.x - 0.01 && b[i] <= q.x + 1.2);
      const along = b[i] - f.x;
      a[i + 2] = b[i + 2] + Math.sin(time * 3.1 + along * 3.2 + f.k) * 0.12 * along;
    }
    pos.needsUpdate = true;
  }
}

/** Rectangles of a face (u0..u1, y0..y1) with the holes cut out. */
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

function xz(v) {
  return { x: v.x, z: v.z };
}
