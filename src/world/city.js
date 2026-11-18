import * as THREE from 'three';
import { CITY, roadLine, blockBounds, blockKind, siteForBlock } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, clamp, lerp } from '../core/rng.js';
import { FACADE_STYLES, FACADE_TILE, SHOP_TILE_W, SIGN_NAMES } from '../render/textures.js';
import { Colliders } from './colliders.js';
import { makePropTemplates } from './props.js';
import { additive } from '../render/materials.js';

const SODIUM = new THREE.Color('#ffae5c');
const STYLE = Object.fromEntries(FACADE_STYLES.map((s, i) => [s.id, i]));
const AWNINGS = ['#8a2a2a', '#2a5a3a', '#2a3a6a', '#8a6a2a', '#5a2a5a', '#c8c0b0', '#2a6a6a'];

/** Frame for one side of a building: p(u, y, o) -> world point. u runs left->right
 *  as seen from the street, o is the distance out from the wall. */
function faceFrame(face, x0, z0, x1, z1) {
  switch (face) {
    case 'n':
      return { len: x1 - x0, n: [0, 0, -1], p: (u, y, o) => [x1 - u, y, z0 - o] };
    case 's':
      return { len: x1 - x0, n: [0, 0, 1], p: (u, y, o) => [x0 + u, y, z1 + o] };
    case 'e':
      return { len: z1 - z0, n: [1, 0, 0], p: (u, y, o) => [x1 + o, y, z1 - u] };
    default:
      return { len: z1 - z0, n: [-1, 0, 0], p: (u, y, o) => [x0 - o, y, z0 + u] };
  }
}

function splits(a, b, n, rng) {
  const w = [];
  for (let k = 0; k < n; k++) w.push(rng.float(0.7, 1.3));
  const sum = w.reduce((s, v) => s + v, 0);
  const out = [a];
  let acc = a;
  for (let k = 0; k < n - 1; k++) {
    acc += ((b - a) * w[k]) / sum;
    out.push(acc);
  }
  out.push(b);
  return out;
}

export class City {
  constructor(scene, tex, env) {
    this.scene = scene;
    this.tex = tex;
    this.rng = new Rng(CITY.SEED);
    this.colliders = new Colliders(12);
    this.blocks = [];
    this.lamps = []; // {x, y, z, r, rect, small}
    this.beacons = [];
    this.interactables = [];
    this.steamVents = [];
    this.apartmentSites = {};
    this.T = makePropTemplates();
    this.B = {
      facades: FACADE_STYLES.map(() => new GeoBuilder()),
      shop: new GeoBuilder(),
      roof: new GeoBuilder(),
      trim: new GeoBuilder(),
      sign: new GeoBuilder(),
      flicker: new GeoBuilder(),
      sidewalk: new GeoBuilder(),
      dash: new GeoBuilder(),
      cross: new GeoBuilder(),
      prop: new GeoBuilder(),
      leaf: new GeoBuilder(),
      lampGlass: new GeoBuilder(),
      screen: new GeoBuilder(),
      pool: new GeoBuilder(),
      grass: new GeoBuilder(),
      path: new GeoBuilder(),
      stone: new GeoBuilder(),
    };
    this.generate();
    this.buildMeshes(env);
  }

  // -------------------------------------------------------------------------
  generate() {
    const { N } = CITY;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const b = blockBounds(i, j);
        b.kind = blockKind(i, j);
        this.blocks.push(b);
        const S = CITY.SIDEWALK;
        b.lot = { x0: b.x0 + S, x1: b.x1 - S, z0: b.z0 + S, z1: b.z1 - S };
        if (b.kind === 'city') {
          this.B.sidewalk.box(b.x0, 0, b.z0, b.x1, CITY.CURB, b.z1, { sx: 3, topScale: 3 });
        } else {
          this.sidewalkRing(b);
        }
        this.streetFurniture(b);
        if (b.kind === 'city') this.cityBlock(b);
        if (b.kind === 'park') this.park(b);
        if (b.kind === 'lantern') this.lanternBlock = b;
      }
    this.roads();
    this.outerRing();
    this.skyline();
    this.spawn = { x: roadLine(3) + CITY.ROAD / 2 + 1.8, z: roadLine(3) + CITY.ROAD / 2 + 1.8, yaw: Math.PI / 2 };
  }

  blockAt(x, z) {
    const i = Math.floor((x + CITY.HALF) / CITY.PITCH);
    const j = Math.floor((z + CITY.HALF) / CITY.PITCH);
    if (i < 0 || j < 0 || i >= CITY.N || j >= CITY.N) return null;
    const b = this.blocks[j * CITY.N + i];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
    return b;
  }

  groundHeight(x, z) {
    if (this.blockAt(x, z)) return CITY.CURB;
    const e = CITY.HALF + CITY.ROAD / 2;
    if (Math.abs(x) > e || Math.abs(z) > e) return CITY.CURB;
    return 0;
  }

  districtAt(x, z) {
    const lb = this.lanternBlock;
    if (lb && x > lb.x0 - 6 && x < lb.x1 + 6 && z > lb.z0 - 6 && z < lb.z1 + 6) return 'Lantern Quarter';
    const b = this.blockAt(x, z);
    if (b && b.kind === 'park') return 'Greenway Park';
    const fi = (x + CITY.HALF) / CITY.PITCH;
    const fj = (z + CITY.HALF) / CITY.PITCH;
    if (Math.abs(fi - 3) < 1.15 && Math.abs(fj - 3) < 1.15) return 'Downtown';
    if (fi < 3 && fj < 3) return 'Old Market';
    if (fi >= 3 && fj < 3) return 'Kiln Heights';
    if (fi < 3) return 'Greenway';
    return 'Ember Row';
  }

  // -------------------------------------------------------------------------
  sidewalkRing(b) {
    const S = CITY.SIDEWALK;
    const o = { sx: 3, topScale: 3 };
    const sw = this.B.sidewalk;
    sw.box(b.x0, 0, b.z0, b.x1, CITY.CURB, b.z0 + S, o);
    sw.box(b.x0, 0, b.z1 - S, b.x1, CITY.CURB, b.z1, o);
    sw.box(b.x0, 0, b.z0 + S, b.x0 + S, CITY.CURB, b.z1 - S, o);
    sw.box(b.x1 - S, 0, b.z0 + S, b.x1, CITY.CURB, b.z1 - S, o);
  }

  addLamp(x, z, ry, rect) {
    const m = trs(x, CITY.CURB, z, ry);
    this.B.prop.addGeometry(this.T.lamp, m);
    this.B.lampGlass.addGeometry(this.T.lampGlass, m);
    const h = this.T.lampHead.clone().applyMatrix4(m);
    this.lamps.push({ x: h.x, y: h.y, z: h.z, r: 4.4, rect });
    this.colliders.addC(x, z, 0.36, 0.36, 7);
  }

  addTree(x, z, y = CITY.CURB) {
    const rng = this.rng;
    const s = rng.float(0.85, 1.2);
    const m = trs(x, y, z, rng.float(0, 6.28), s);
    this.B.prop.addGeometry(this.T.trunk, m);
    this.B.leaf.addGeometry(rng.pick(this.T.canopies), m);
    this.colliders.addC(x, z, 0.45, 0.45, 3);
  }

  streetFurniture(b) {
    const rng = this.rng;
    const S = CITY.SIDEWALK;
    const isCity = b.kind === 'city';
    const d = Math.hypot(b.cx, b.cz) / CITY.HALF;
    const leafy = d > 0.55 ? 0.45 : 0.18;
    const edges = [
      { ax: b.x0, az: b.z0, dx: 1, dz: 0, nx: 0, nz: -1, len: b.x1 - b.x0, face: 'n' },
      { ax: b.x1, az: b.z0, dx: 0, dz: 1, nx: 1, nz: 0, len: b.z1 - b.z0, face: 'e' },
      { ax: b.x1, az: b.z1, dx: -1, dz: 0, nx: 0, nz: 1, len: b.x1 - b.x0, face: 's' },
      { ax: b.x0, az: b.z1, dx: 0, dz: -1, nx: -1, nz: 0, len: b.z1 - b.z0, face: 'w' },
    ];
    for (const e of edges) {
      const ry = Math.atan2(e.nx, e.nz);
      const at = (t, inset) => [e.ax + e.dx * t - e.nx * inset, e.az + e.dz * t - e.nz * inset];
      const n = Math.max(2, Math.round((e.len - 8) / 13) + 1);
      const spacing = (e.len - 8) / (n - 1);
      for (let k = 0; k < n; k++) {
        const t = 4 + k * spacing;
        const [lx, lz] = at(t, 0.6);
        // the club's entrance gets its canopy lights instead of a lamp post
        const clubDoor = e.face === 's' && siteForBlock(b.i, b.j)?.[0] === 'club' && Math.abs(lx - (b.cx - 5.1)) < 2.5;
        if (!clubDoor) this.addLamp(lx, lz, ry, b);
        if (k === n - 1) continue;
        const tm = t + spacing / 2;
        const r = rng.next();
        // keep the entrances of the park / Lantern Quarter clear
        if (!isCity && Math.abs(tm - e.len / 2) < 5) continue;
        // and the pavement in front of the club (queue, rope line, fries cart)
        if (e.face === 's' && siteForBlock(b.i, b.j)?.[0] === 'club' && Math.abs(tm - e.len / 2) < 13) continue;
        if (r < leafy) {
          const [x, z] = at(tm, 0.95);
          this.addTree(x, z);
        } else if (r < leafy + 0.12 && isCity) {
          const [x, z] = at(tm, 1.15);
          this.B.prop.addGeometry(this.T.busStop, trs(x, CITY.CURB, z, ry));
          this.B.screen.addGeometry(this.T.busStopGlow, trs(x, CITY.CURB, z, ry));
          // shelter collision: the back panel and posts only
          const [bx, bz] = at(tm, 1.15 + 0.62);
          this.colliders.addC(bx, bz, e.dx ? 3.2 : 0.3, e.dz ? 3.2 : 0.3, 2.5);
        } else if (r < leafy + 0.32) {
          const [x, z] = at(tm, 1.1);
          this.B.prop.addGeometry(this.T.bench, trs(x, CITY.CURB, z, ry));
          this.colliders.addC(x, z, e.dx ? 1.7 : 0.5, e.dz ? 1.7 : 0.5, 1);
        } else if (r < leafy + 0.48) {
          const [x, z] = at(tm, 0.7);
          this.B.prop.addGeometry(this.T.trash, trs(x, CITY.CURB, z, 0));
          this.colliders.addC(x, z, 0.55, 0.55, 1);
        } else if (r < leafy + 0.6 && isCity) {
          const [x, z] = at(tm, 0.8);
          this.B.prop.addGeometry(rng.pick(this.T.newsbox), trs(x, CITY.CURB, z, ry));
          this.colliders.addC(x, z, 0.55, 0.55, 1);
        } else if (r < leafy + 0.72) {
          const [x, z] = at(tm, 1.1);
          this.B.prop.addGeometry(this.T.planter, trs(x, CITY.CURB, z, 0));
          this.colliders.addC(x, z, 1.2, 1.2, 0.6);
        }
      }
      // hydrant near the corner
      if (rng.chance(0.35)) {
        const [x, z] = at(2.2, 0.55);
        this.B.prop.addGeometry(this.T.hydrant, trs(x, CITY.CURB, z, ry));
        this.colliders.addC(x, z, 0.3, 0.3, 0.7);
      }
      if (!isCity) continue;
      if (siteForBlock(b.i, b.j) && e.face === 's') continue;
      // wall-side machines: vending machines glow at night, ATMs give you money
      const wall = S - 0.42;
      const forceAtm = b.i === 3 && b.j === 3 && e.face === 'n';
      if (forceAtm || rng.chance(0.1)) {
        const t = forceAtm ? 12 : rng.float(8, e.len - 8);
        const [x, z] = at(t, wall);
        this.B.prop.addGeometry(this.T.atm.solid, trs(x, CITY.CURB, z, ry));
        this.B.screen.addGeometry(this.T.atm.glow, trs(x, CITY.CURB, z, ry));
        this.colliders.addC(x, z, 0.9, 0.9, 2);
        this.interactables.push({ type: 'atm', x: x + e.nx * 0.6, z: z + e.nz * 0.6, r: 1.6, label: 'Use ATM' });
      } else if (rng.chance(0.38)) {
        const t = rng.float(6, e.len - 6);
        const [x, z] = at(t, wall - 0.05);
        const v = rng.int(0, this.T.vending.length - 1);
        this.B.prop.addGeometry(this.T.vending[v].solid, trs(x, CITY.CURB, z, ry));
        this.B.screen.addGeometry(this.T.vending[v].glow, trs(x, CITY.CURB, z, ry));
        this.colliders.addC(x, z, 1.0, 1.0, 2);
        this.interactables.push({ type: 'vending', x: x + e.nx * 0.7, z: z + e.nz * 0.7, r: 1.5, label: 'Buy a drink ($2)' });
      }
    }
  }

  // -------------------------------------------------------------------------
  cityBlock(b) {
    const rng = this.rng;
    const lot = b.lot;
    const d = Math.hypot(b.cx, b.cz) / CITY.HALF;
    const t = Math.pow(clamp((d - 0.2) / 0.85, 0, 1), 0.6);
    const maxH = lerp(80, 17, t);
    const minH = lerp(32, 8, t);
    const styles =
      t < 0.15
        ? ['glass', 'office', 'stone', 'glass']
        : t < 0.55
          ? ['stone', 'office', 'cream', 'brick', 'rose']
          : ['brick', 'cream', 'teal', 'rose', 'brick', 'factory'];
    const site = siteForBlock(b.i, b.j);
    let xs;
    let zs;
    if (site) {
      // reserve the middle of the south side for an apartment building
      const s = site[1];
      const mx = (lot.x0 + lot.x1) / 2;
      xs = [lot.x0, mx - s.width / 2, mx + s.width / 2, lot.x1];
      zs = [lot.z0, lot.z1 - s.depth, lot.z1];
    } else {
      xs = splits(lot.x0, lot.x1, rng.int(2, 3), rng);
      zs = splits(lot.z0, lot.z1, rng.int(2, 3), rng);
    }
    for (let a = 0; a < xs.length - 1; a++)
      for (let c = 0; c < zs.length - 1; c++) {
        let x0 = xs[a];
        let x1 = xs[a + 1];
        let z0 = zs[c];
        let z1 = zs[c + 1];
        const faces = { w: a === 0, e: a === xs.length - 2, n: c === 0, s: c === zs.length - 2 };
        const street = faces.w || faces.e || faces.n || faces.s;
        if (site && a === 1 && c === 1) {
          if (site[0] === 'store') this.storeBuilding(site[1], x0, z0, x1, z1);
          else if (site[0] === 'club') this.clubSite = { x0, z0, x1, z1 }; // the club builds its own shell
          else this.apartmentBuilding(site[0], site[1], x0, z0, x1, z1);
          continue;
        }
        const gap = rng.chance(0.22) ? 1.6 : 0.12;
        if (!faces.w) x0 += gap / 2;
        if (!faces.e) x1 -= gap / 2;
        if (!faces.n) z0 += gap / 2;
        if (!faces.s) z1 -= gap / 2;
        const style = STYLE[rng.pick(styles)];
        if (!street) {
          this.building(x0, z0, x1, z1, rng.float(6, 12), style, faces, false);
          continue;
        }
        const H = rng.float(minH, maxH) * (rng.chance(0.15) ? 0.55 : 1);
        this.building(x0, z0, x1, z1, H, style, faces, rng.chance(lerp(0.95, 0.6, t)));
      }
  }

  apartmentBuilding(id, s, x0, z0, x1, z1) {
    const gf = s.shop ? CITY.GF_H : 0;
    const H = gf + s.floors * CITY.FLOOR_H;
    const res = this.building(x0, z0, x1, z1, H, STYLE[s.style], { s: true }, s.shop, {
      floors: s.floors,
      noCrown: true,
      reserve: 3.4,
      signRow: s.signRow,
    });
    this.apartmentSites[id] = { id, x0, z0, x1, z1, gf, top: res.top, floorY: gf + s.unitFloor * CITY.FLOOR_H, style: s.style };
  }

  storeBuilding(s, x0, z0, x1, z1) {
    // the ground floor is left open: the store interior provides its own walls,
    // and the facade above starts exactly at the top of those walls
    const gf = CITY.CURB + s.floorLift + s.groundH;
    const H = gf + s.floors * CITY.FLOOR_H;
    const res = this.building(x0, z0, x1, z1, H, STYLE[s.style], { s: true }, false, { floors: s.floors, noCrown: true, gf, collideFrom: gf });
    this.storeSite = { x0, z0, x1, z1, gf, top: res.top };
  }

  building(x0, z0, x1, z1, H, style, faces, shop, opts = {}) {
    const rng = this.rng;
    const B = this.B;
    const gf = opts.gf ?? (shop ? CITY.GF_H : 0);
    const floors = opts.floors ?? Math.max(1, Math.round((H - gf) / CITY.FLOOR_H));
    const top = gf + floors * CITY.FLOOR_H + 0.4;
    const tint = rng.float(0.86, 1.06);
    const col = [tint * rng.float(0.96, 1.04), tint, tint * rng.float(0.96, 1.04)];
    const glassy = FACADE_STYLES[style].curtain || FACADE_STYLES[style].ribbon;
    const trimCol = glassy ? shade('#3a3f46') : shade(rng.pick(['#d2cbbb', '#bdb5a2', '#8e8678', '#e0dccf']));
    B.facades[style].box(x0, gf, z0, x1, top, z1, {
      sx: FACADE_TILE.w,
      sy: FACADE_TILE.h,
      ou: rng.int(0, 3) * 0.25,
      ov: rng.int(0, 3) * 0.25,
      top: false,
      color: col,
    });
    if (shop) {
      const v = rng.int(0, 3);
      B.shop.box(x0, 0, z0, x1, gf, z1, {
        sx: SHOP_TILE_W,
        vRange: [1 - (v + 1) / 4 + 0.004, 1 - v / 4 - 0.004],
        ou: rng.float(0, 1),
        top: false,
      });
      const ov = (f) => (faces[f] ? 0.15 : 0.02);
      B.trim.box(x0 - ov('w'), gf - 0.1, z0 - ov('n'), x1 + ov('e'), gf + 0.25, z1 + ov('s'), { color: trimCol, bottom: true });
      for (const f of ['n', 's', 'e', 'w']) if (faces[f]) this.shopFace(faceFrame(f, x0, z0, x1, z1), top, opts);
    }
    this.roofCap(x0, z0, x1, z1, top, trimCol, faces);
    if (!opts.noCollide) this.colliders.add(x0, z0, x1, z1, opts.collideFrom ?? 0, top);

    const w = x1 - x0;
    const d = z1 - z0;
    // setback crown on tall towers
    if (!opts.noCrown && top > 40 && rng.chance(0.7) && w > 8 && d > 8) {
      const ix = w * rng.float(0.14, 0.24);
      const iz = d * rng.float(0.14, 0.24);
      const ctop = top + 0.45 + rng.int(2, 5) * CITY.FLOOR_H;
      B.facades[style].box(x0 + ix, top + 0.45, z0 + iz, x1 - ix, ctop, z1 - iz, {
        sx: FACADE_TILE.w,
        sy: FACADE_TILE.h,
        ou: 0.5,
        top: false,
        color: col,
      });
      this.roofCap(x0 + ix, z0 + iz, x1 - ix, z1 - iz, ctop, trimCol);
      if (rng.chance(0.7)) {
        const ah = rng.float(6, 16);
        const ax = (x0 + x1) / 2;
        const az = (z0 + z1) / 2;
        B.trim.cbox(ax, ctop, az, 0.25, ah, 0.25, shade('#2a2a2e'));
        this.beacons.push(new THREE.Vector3(ax, ctop + ah + 0.2, az));
      }
      return;
    }
    // roof clutter
    if (w > 5 && d > 5) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const cx = rng.float(x0 + 1.5, x1 - 1.5);
        const cz = rng.float(z0 + 1.5, z1 - 1.5);
        B.trim.cbox(cx, top + 0.05, cz, rng.float(0.9, 1.6), rng.float(0.6, 1.1), rng.float(0.9, 1.6), shade('#8a8c8e'));
      }
      if (top < 36 && rng.chance(0.25)) {
        B.prop.addGeometry(this.T.waterTower, trs(rng.float(x0 + 2, x1 - 2), top + 0.05, rng.float(z0 + 2, z1 - 2), rng.float(0, 3)));
      }
    }
    return { gf, top };
  }

  roofCap(x0, z0, x1, z1, top, col, faces = null) {
    // the cornice overhangs the street; on sides that face a neighbour it stays
    // just proud of the wall so it can't overlap the building next door
    const c = (f) => (!faces || faces[f] ? 0.28 : 0.03);
    const w = 0.45;
    const h = 0.45;
    const t = this.B.trim;
    t.box(x0 - c('w'), top, z0 - c('n'), x1 + c('e'), top + h, z0 + w, { color: col, bottom: true });
    t.box(x0 - c('w'), top, z1 - w, x1 + c('e'), top + h, z1 + c('s'), { color: col, bottom: true });
    t.box(x0 - c('w'), top, z0 + w, x0 + w, top + h, z1 - w, { color: col, bottom: true });
    t.box(x1 - w, top, z0 + w, x1 + c('e'), top + h, z1 - w, { color: col, bottom: true });
    this.B.roof.box(x0, top - 0.2, z0, x1, top + 0.06, z1, { sides: [false, false, false, false], topScale: 4 });
  }

  shopFace(F, top, opts = {}) {
    const rng = this.rng;
    if (F.len < 6.5) return;
    const SW = 5.2;
    // `reserve` keeps the first metres of the facade clear (a residential front door)
    const lo = (opts.reserve ?? 0) + SW / 2 + 0.4;
    if (lo > F.len - SW / 2 - 0.4) return;
    const c = rng.float(lo, F.len - SW / 2 - 0.4);
    const n = F.n;
    if (opts.signRow !== undefined || rng.chance(0.8)) {
      const row = opts.signRow ?? rng.int(0, SIGN_NAMES.length - 1);
      const v0 = 1 - (row + 1) / 8 + 0.003;
      const v1 = 1 - row / 8 - 0.003;
      const flick = (this._flickers ?? 0) < 4 && rng.chance(0.06);
      if (flick) this._flickers = (this._flickers ?? 0) + 1;
      const B = flick ? this.B.flicker : this.B.sign;
      B.quad(F.p(c - SW / 2, 3.62, 0.08), F.p(c + SW / 2, 3.62, 0.08), F.p(c + SW / 2, 4.27, 0.08), F.p(c - SW / 2, 4.27, 0.08), n, [0, v0, 1, v1]);
    }
    if (rng.chance(0.45)) {
      const aw = Math.min(F.len - 1 - (opts.reserve ?? 0), rng.float(4, 8));
      const a0 = clamp(c - aw / 2, 0.3 + (opts.reserve ?? 0), F.len - aw - 0.3);
      const col = shade(rng.pick(AWNINGS));
      const nn = [n[0] * 0.45, 0.9, n[2] * 0.45];
      this.B.trim.quad2(F.p(a0, 2.85, 1.3), F.p(a0 + aw, 2.85, 1.3), F.p(a0 + aw, 3.45, 0.02), F.p(a0, 3.45, 0.02), nn, [0, 0, 1, 1], col);
      this.B.trim.quad2(F.p(a0, 2.6, 1.3), F.p(a0 + aw, 2.6, 1.3), F.p(a0 + aw, 2.85, 1.3), F.p(a0, 2.85, 1.3), n, [0, 0, 1, 1], col);
    }
    if (!opts.reserve && top > 14 && rng.chance(0.14)) {
      const row = rng.int(0, SIGN_NAMES.length - 1);
      const v0 = 1 - (row + 1) / 8 + 0.003;
      const v1 = 1 - row / 8 - 0.003;
      const u = 0.6;
      const y0 = 5.2;
      const y1 = 5.2 + 7.2;
      const a = F.p(u, y0, 1.05);
      const b = F.p(u, y0, 0.15);
      const cc = F.p(u, y1, 0.15);
      const d = F.p(u, y1, 1.05);
      // normal points along -u (perpendicular to wall)
      const p0 = F.p(0, 0, 0);
      const p1 = F.p(1, 0, 0);
      const un = [p1[0] - p0[0], 0, p1[2] - p0[2]];
      const uv = [0, v0, 0, v1, 1, v1, 1, v0];
      this.B.sign.quad(a, b, cc, d, [-un[0], 0, -un[2]], uv);
      this.B.sign.quad(b, a, d, cc, un, uv);
      this.B.trim.box(Math.min(a[0], cc[0]) - 0.04, y0 - 0.1, Math.min(a[2], cc[2]) - 0.04, Math.max(a[0], cc[0]) + 0.04, y0, Math.max(a[2], cc[2]) + 0.04, {
        color: shade('#222'),
        bottom: true,
      });
    }
  }

  // -------------------------------------------------------------------------
  park(b) {
    const rng = this.rng;
    const L = b.lot;
    const C = CITY.CURB;
    const cx = (L.x0 + L.x1) / 2;
    const cz = (L.z0 + L.z1) / 2;
    const none = [false, false, false, false];
    this.B.grass.box(L.x0, 0, L.z0, L.x1, C, L.z1, { sides: none, topScale: 4 });
    this.B.path.box(L.x0, C, cz - 1.6, L.x1, C + 0.02, cz + 1.6, { sides: none, topScale: 4 });
    this.B.path.box(cx - 1.6, C, L.z0, cx + 1.6, C + 0.02, L.z1, { sides: none, topScale: 4 });
    this.B.path.addGeometry(new THREE.CircleGeometry(7.5, 16).rotateX(-Math.PI / 2), trs(cx, C + 0.025, cz));
    // fountain
    const stone = shade('#a8a296');
    // open cylinders go in the double-sided trim mesh so the inside of the basin renders
    this.B.trim.addGeometry(new THREE.CylinderGeometry(4.2, 4.4, 0.75, 16, 1, true), trs(cx, C + 0.37, cz), stone);
    this.B.trim.addGeometry(new THREE.CylinderGeometry(3.9, 3.9, 0.75, 16, 1, true), trs(cx, C + 0.37, cz), shade('#7a766e'));
    this.B.prop.addGeometry(new THREE.RingGeometry(3.9, 4.2, 16).rotateX(-Math.PI / 2), trs(cx, C + 0.75, cz), stone);
    this.B.prop.addGeometry(new THREE.CylinderGeometry(0.45, 0.6, 1.8, 8), trs(cx, C + 0.9, cz), stone);
    this.B.prop.addGeometry(new THREE.CylinderGeometry(1.4, 0.5, 0.35, 10), trs(cx, C + 1.9, cz), stone);
    this.B.prop.addGeometry(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 8), trs(cx, C + 2.2, cz), stone);
    this.colliders.add(cx - 4.2, cz - 4.2, cx + 4.2, cz + 4.2, 0, 0.9);
    this.fountain = { x: cx, y: C, z: cz };
    // hedges with gaps for the paths
    const hedge = shade('#2f4f26');
    const hb = (x0, z0, x1, z1) => {
      this.B.leaf.box(x0, C, z0, x1, C + 1.0, z1, { color: hedge });
      this.colliders.add(x0, z0, x1, z1, 0, 1.2);
    };
    const g = 2.4;
    hb(L.x0, L.z0, cx - g, L.z0 + 0.8);
    hb(cx + g, L.z0, L.x1, L.z0 + 0.8);
    hb(L.x0, L.z1 - 0.8, cx - g, L.z1);
    hb(cx + g, L.z1 - 0.8, L.x1, L.z1);
    hb(L.x0, L.z0 + 0.8, L.x0 + 0.8, cz - g);
    hb(L.x0, cz + g, L.x0 + 0.8, L.z1 - 0.8);
    hb(L.x1 - 0.8, L.z0 + 0.8, L.x1, cz - g);
    hb(L.x1 - 0.8, cz + g, L.x1, L.z1 - 0.8);
    // trees
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 20; tries++) {
      const x = rng.float(L.x0 + 2.5, L.x1 - 2.5);
      const z = rng.float(L.z0 + 2.5, L.z1 - 2.5);
      if (Math.abs(x - cx) < 3.2 || Math.abs(z - cz) < 3.2 || Math.hypot(x - cx, z - cz) < 9) continue;
      this.addTree(x, z);
      placed++;
    }
    // benches along the paths, park lamps
    for (const s of [-1, 1]) {
      for (const off of [10, 15]) {
        this.B.prop.addGeometry(this.T.bench, trs(cx + s * off, C, cz - 2.5, 0));
        this.colliders.addC(cx + s * off, cz - 2.5, 1.7, 0.5, 1);
        this.B.prop.addGeometry(this.T.bench, trs(cx - 2.5, C, cz + s * off, Math.PI / 2));
        this.colliders.addC(cx - 2.5, cz + s * off, 0.5, 1.7, 1);
      }
      for (const off of [8.5, 16]) {
        for (const [x, z] of [
          [cx + s * off, cz + 2.3],
          [cx + 2.3, cz + s * off],
        ]) {
          const m = trs(x, C, z, 0);
          this.B.prop.addGeometry(this.T.parkLamp, m);
          this.B.lampGlass.addGeometry(this.T.parkLampGlass, m);
          this.lamps.push({ x, y: C + 3.55, z, r: 3.2, small: true, rect: L });
          this.colliders.addC(x, z, 0.3, 0.3, 3);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  roads() {
    const { N, ROAD, SIDEWALK: S } = CITY;
    const h = ROAD / 2;
    const y = 0.02;
    const U = ROAD / 3.2;
    for (let i = 0; i <= N; i++) {
      const x = roadLine(i);
      for (let j = 0; j < N; j++) {
        const z0 = roadLine(j) + h;
        const z1 = roadLine(j + 1) - h;
        // vertical road: dashes run along z
        const za = z0 + S + 1;
        const zb = z1 - S - 1;
        this.B.dash.quad([x - 0.12, y, zb], [x + 0.12, y, zb], [x + 0.12, y, za], [x - 0.12, y, za], [0, 1, 0], [0, 0, 1, (zb - za) / 4]);
        for (const [a, b] of [
          [z0, z0 + S],
          [z1 - S, z1],
        ])
          this.B.cross.quad([x - h, y, b], [x + h, y, b], [x + h, y, a], [x - h, y, a], [0, 1, 0], [0, 0, U, 1]);
        // horizontal road (same indices swapped): dashes run along x
        const z = roadLine(i);
        const xa = z0 + S + 1;
        const xb = z1 - S - 1;
        const L = (xb - xa) / 4;
        this.B.dash.quad([xa, y, z + 0.12], [xb, y, z + 0.12], [xb, y, z - 0.12], [xa, y, z - 0.12], [0, 1, 0], [0, 0, 0, L, 1, L, 1, 0]);
        for (const [a, b] of [
          [z0, z0 + S],
          [z1 - S, z1],
        ])
          this.B.cross.quad([a, y, z + h], [b, y, z + h], [b, y, z - h], [a, y, z - h], [0, 1, 0], [0, 0, 0, 1, U, 1, U, 0]);
      }
    }
    // manholes, some of them steaming
    const rng = this.rng;
    for (let k = 0; k < 40; k++) {
      const alongX = rng.chance(0.5);
      const line = roadLine(rng.int(0, N));
      const along = rng.float(-CITY.HALF + 10, CITY.HALF - 10);
      const lane = rng.sign() * 2.6;
      const x = alongX ? along : line + lane;
      const z = alongX ? line + lane : along;
      if (this.blockAt(x, z)) continue;
      this.B.prop.addGeometry(this.T.manhole, trs(x, 0.03, z));
      if (k % 4 === 0) this.steamVents.push(new THREE.Vector3(x, 0.05, z));
    }
  }

  outerRing() {
    const rng = this.rng;
    const { HALF, ROAD, SIDEWALK: S, CURB } = CITY;
    const e0 = HALF + ROAD / 2;
    const e1 = e0 + S;
    const o = { sx: 3, topScale: 3 };
    const sw = this.B.sidewalk;
    sw.box(-e1, 0, -e1, e1, CURB, -e0, o);
    sw.box(-e1, 0, e0, e1, CURB, e1, o);
    sw.box(-e1, 0, -e0, -e0, CURB, e0, o);
    sw.box(e0, 0, -e0, e1, CURB, e0, o);
    const rects = [
      { x0: -e1, x1: e1, z0: -e1, z1: -e0 },
      { x0: -e1, x1: e1, z0: e0, z1: e1 },
      { x0: -e1, x1: -e0, z0: -e1, z1: e1 },
      { x0: e0, x1: e1, z0: -e1, z1: e1 },
    ];
    for (let p = -HALF + 6; p < HALF; p += 13.5) {
      this.addLamp(p, -e0 - 0.6, 0, rects[0]);
      this.addLamp(p, e0 + 0.6, Math.PI, rects[1]);
      this.addLamp(-e0 - 0.6, p, Math.PI / 2, rects[2]);
      this.addLamp(e0 + 0.6, p, -Math.PI / 2, rects[3]);
    }
    // a wall of buildings facing the outer road
    const depth = 22;
    const styles = ['brick', 'cream', 'teal', 'rose', 'stone', 'office'];
    // north/south runs include the corners; east/west runs fill between them
    const runs = [
      [-e1 - depth, e1 + depth, (a, b) => [a, -e1 - depth, b, -e1, { s: true }]],
      [-e1 - depth, e1 + depth, (a, b) => [a, e1, b, e1 + depth, { n: true }]],
      [-e1, e1, (a, b) => [-e1 - depth, a, -e1, b, { e: true }]],
      [-e1, e1, (a, b) => [e1, a, e1 + depth, b, { w: true }]],
    ];
    for (const [start, end, run] of runs) {
      let a = start;
      while (a < end - 4) {
        const w = Math.min(rng.float(9, 20), end - a);
        const [x0, z0, x1, z1, faces] = run(a, a + w);
        this.building(x0, z0, x1, z1, rng.float(9, 30), STYLE[rng.pick(styles)], faces, rng.chance(0.65));
        a += w + (rng.chance(0.2) ? 1.5 : 0);
      }
    }
  }

  skyline() {
    // Distant silhouettes, mostly swallowed by fog. Makes the city feel endless.
    const rng = this.rng;
    for (let k = 0; k < 110; k++) {
      const ang = rng.float(0, Math.PI * 2);
      const r = rng.float(245, 340);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const w = rng.float(14, 36);
      const d = rng.float(14, 36);
      const h = rng.float(18, 70) * (rng.chance(0.2) ? 1.8 : 1);
      if (Math.max(Math.abs(x), Math.abs(z)) - Math.max(w, d) / 2 < 200) continue;
      const s = rng.int(0, FACADE_STYLES.length - 1);
      this.B.facades[s].box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, {
        sx: FACADE_TILE.w,
        sy: FACADE_TILE.h,
        ou: rng.int(0, 3) * 0.25,
        top: false,
      });
      this.B.roof.box(x - w / 2, h - 0.1, z - d / 2, x + w / 2, h, z + d / 2, { sides: [false, false, false, false], topScale: 4 });
    }
  }

  // -------------------------------------------------------------------------
  buildPools() {
    const P = this.B.pool;
    const C = CITY.CURB;
    for (const l of this.lamps) {
      const R = l.r;
      const sq = { x0: l.x - R, x1: l.x + R, z0: l.z - R, z1: l.z + R };
      const add = (r, y) => {
        const u = (x) => (x - sq.x0) / (2 * R);
        const v = (z) => (z - sq.z0) / (2 * R);
        P.quad([r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0], [r.x0, y, r.z0], [0, 1, 0], [
          u(r.x0),
          v(r.z1),
          u(r.x1),
          v(r.z1),
          u(r.x1),
          v(r.z0),
          u(r.x0),
          v(r.z0),
        ]);
      };
      if (!l.small) add(sq, 0.04);
      const rc = l.rect;
      const clip = { x0: Math.max(sq.x0, rc.x0), x1: Math.min(sq.x1, rc.x1), z0: Math.max(sq.z0, rc.z0), z1: Math.min(sq.z1, rc.z1) };
      if (clip.x1 > clip.x0 && clip.z1 > clip.z0) add(clip, C + 0.035);
    }
  }

  buildMeshes(env) {
    const tex = this.tex;
    const B = this.B;
    const group = new THREE.Group();
    this.group = group;
    this.scene.add(group);
    const add = (builder, mat) => {
      const m = builder.mesh(mat);
      if (m) {
        const fi = B.facades.indexOf(builder);
        m.name = `city:${fi >= 0 ? `facade${fi}` : Object.keys(B).find((k) => B[k] === builder)}`;
        group.add(m);
      }
      return m;
    };
    const lam = (o) => new THREE.MeshLambertMaterial(o);

    // ground
    tex.asphalt.repeat.set(175, 175);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lam({ map: tex.asphalt }));
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);

    this.facadeMats = tex.facades.map((f) => lam({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, vertexColors: true }));
    B.facades.forEach((b, k) => add(b, this.facadeMats[k]));
    this.shopMat = lam({ map: tex.shops.map, emissiveMap: tex.shops.emissive, emissive: 0xffffff });
    add(B.shop, this.shopMat);
    add(B.roof, lam({ map: tex.roof }));
    add(B.trim, lam({ vertexColors: true, side: THREE.DoubleSide }));
    this.signMat = lam({ map: tex.signs.map, emissiveMap: tex.signs.emissive, emissive: 0xffffff });
    add(B.sign, this.signMat);
    this.flickerMat = this.signMat.clone();
    add(B.flicker, this.flickerMat);
    add(B.sidewalk, lam({ map: tex.sidewalk }));
    const decal = (map) =>
      lam({ map, alphaTest: 0.5, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    add(B.dash, decal(tex.dash));
    add(B.cross, decal(tex.crosswalk));
    add(B.prop, lam({ vertexColors: true }));
    add(B.leaf, lam({ vertexColors: true, flatShading: true }));
    add(B.grass, lam({ map: tex.grass }));
    add(B.path, lam({ map: tex.path, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.lampGlassMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    add(B.lampGlass, this.lampGlassMat);
    this.screenMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    add(B.screen, this.screenMat);

    this.buildPools();
    this.poolMat = additive({ map: tex.glow, color: SODIUM, opacity: 0 });
    const pools = add(B.pool, this.poolMat);
    if (pools) pools.renderOrder = 2;

    // lamp halos as point sprites
    const hp = [];
    for (const l of this.lamps) hp.push(l.x, l.y - 0.1, l.z);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    this.haloMat = additive({ map: tex.glow, color: SODIUM, size: 3.6, points: true });
    const halos = new THREE.Points(hg, this.haloMat);
    halos.renderOrder = 3;
    group.add(halos);

    // antenna beacons (blinking red)
    const bp = [];
    for (const b of this.beacons) bp.push(b.x, b.y, b.z);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    this.beaconMat = additive({ map: tex.glow, color: new THREE.Color('#ff2a1a'), size: 5, points: true, fog: false });
    group.add(new THREE.Points(bg, this.beaconMat));

    // fountain water
    if (this.fountain) {
      tex.water.repeat.set(2, 2);
      this.waterMat = lam({ map: tex.water, emissive: new THREE.Color('#0a2a3a'), transparent: true, opacity: 0.9 });
      const water = new THREE.Mesh(new THREE.CircleGeometry(3.95, 16).rotateX(-Math.PI / 2), this.waterMat);
      water.position.set(this.fountain.x, this.fountain.y + 0.55, this.fountain.z);
      group.add(water);
      const bowl = new THREE.Mesh(new THREE.CircleGeometry(1.3, 10).rotateX(-Math.PI / 2), this.waterMat);
      bowl.position.set(this.fountain.x, this.fountain.y + 2.07, this.fountain.z);
      group.add(bowl);
    }

    this.flick = { t: 0, on: 1 };
    env.onUpdate((e) => {
      const n = e.night;
      for (const m of this.facadeMats) m.emissiveIntensity = 0.02 + n * 1.0;
      this.shopMat.emissiveIntensity = 0.1 + n * 0.42;
      this.signMat.emissiveIntensity = 0.2 + n * 1.8;
      this.flickerMat.emissiveIntensity = this.signMat.emissiveIntensity * this.flick.on;
      this.lampGlassMat.color.setScalar(0.45 + n * 4);
      this.screenMat.color.setScalar(0.85 + n * 1.8);
      this.poolMat.opacity = n * 0.5;
      this.haloMat.opacity = n * 0.85;
      this.beaconMat.opacity = (0.3 + n * 0.7) * (Math.sin(e.time * 3) > 0.3 ? 1 : 0.08);
      if (this.waterMat) this.waterMat.map.offset.set(e.time * 0.02, e.time * 0.013);
    });
  }

  /** A few real point lights that hop between the street lamps nearest the player,
   *  so people and cars get lit orange as they pass under a lamp. */
  initLampLights(count = 6) {
    this.lampLights = [];
    for (let k = 0; k < count; k++) {
      const l = new THREE.PointLight(SODIUM, 0, 16, 1.3);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this._near = [];
  }

  /** override: optional { list: [{x,y,z,color,power}], on } of interior fixtures. */
  updateLampLights(focus, night, override = null) {
    if (!this.lampLights) return;
    const near = this._near;
    near.length = 0;
    if (override) {
      for (const l of override.list) near.push([(l.x - focus.x) ** 2 + (l.z - focus.z) ** 2 + (l.y - focus.y) ** 2, l]);
      near.sort((a, b) => a[0] - b[0]);
      this.lampLights.forEach((light, k) => {
        const e = near[k];
        if (!e) {
          light.intensity = 0;
          return;
        }
        const l = e[1];
        light.position.set(l.x, l.y, l.z);
        light.color.copy(l.color);
        light.distance = l.dist ?? 7;
        light.intensity = 5 * l.power * override.on;
      });
      return;
    }
    for (const l of this.lamps) {
      const d = (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2;
      if (d < 900) near.push([d, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    this.lampLights.forEach((light, k) => {
      const e = near[k];
      if (!e || night < 0.05) {
        light.intensity = 0;
        return;
      }
      const [d2, l] = e;
      light.position.set(l.x, l.y - 0.6, l.z);
      light.color.copy(SODIUM);
      light.distance = 16;
      const fade = 1 - Math.min(1, Math.max(0, (Math.sqrt(d2) - 12) / 10));
      light.intensity = night * 26 * fade * (l.small ? 0.6 : 1);
    });
  }

  update(dt) {
    // neon flicker: mostly on, with short stutters
    const f = this.flick;
    f.t -= dt;
    if (f.t <= 0) {
      if (f.on === 1 && Math.random() < 0.5) {
        f.on = 0.05;
        f.t = Math.random() * 0.12 + 0.03;
      } else {
        f.on = 1;
        f.t = Math.random() * 3 + 0.2;
      }
    }
  }
}
