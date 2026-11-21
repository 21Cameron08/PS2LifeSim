import * as THREE from 'three';
import { InteriorKit } from './interior/kit.js';
import { bake, interiorMaterial, roomAt } from './interior/bake.js';
import { FURN, collectionsFor, FishTank } from '../game/furniture.js';
import { TOYS } from '../game/gullysMenu.js';
import { stripTexture } from '../game/photobooth.js';
import { damp } from '../core/rng.js';

// Furniture you own, placed in your home. Pieces live in state.furniture:
//   { uid, id, home: aptId | null (in storage), x, z (apartment-local), r (quarter turns), variant }
// Everything placed in an apartment is built with the same interior kit as the room and
// baked into its lighting (lamps you place light the room; shadows land on the floor),
// so it looks like it was always there. Decor mode (F at home) carries a translucent
// "ghost" in front of you: green where it fits, red where it doesn't.

const Q = Math.PI / 2;
const GRID = 0.25; // floor pieces snap to a quarter-metre grid
const WGRID = 0.125; // wall pieces slide along the wall in 12.5 cm steps
const EYE = 1.45; // where you look for a wall to hang something on
const WALL_OFF = 0.004; // hung pieces sit 4 mm off the wall (never in its plane)
const BACK_GAP = 0.03; // pieces pushed back against a wall stop 3 cm short of it

/** Corners of a local footprint [x0, z0, x1, z1] turned r quarter-turns, as a world-axis box. */
function turnBox(b, r) {
  const a = r * Q;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  const xs = [];
  const zs = [];
  for (const [x, z] of [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[2], b[3]],
    [b[0], b[3]],
  ]) {
    xs.push(x * c + z * s);
    zs.push(-x * s + z * c);
  }
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

const overlap = (a, b, pad = 0) => a.x0 < b.x1 - pad && a.x1 > b.x0 + pad && a.z0 < b.z1 - pad && a.z1 > b.z0 + pad;

/**
 * Every static triangle of an apartment, bucketed into a 2D grid, for "is anything in
 * this box?" and short ray tests while you carry furniture around.
 */
class TriIndex {
  constructor(geos, cell = 0.5) {
    let n = 0;
    for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    this.t = new Float32Array(n * 9);
    this.cell = cell;
    this.map = new Map();
    this.stamp = new Uint32Array(n);
    this.s = 0;
    let k = 0;
    for (const g of geos) {
      const p = g.attributes.position;
      const idx = g.index;
      const cnt = idx ? idx.count : p.count;
      for (let i = 0; i < cnt; i += 3) {
        let x0 = Infinity;
        let z0 = Infinity;
        let x1 = -Infinity;
        let z1 = -Infinity;
        for (let v = 0; v < 3; v++) {
          const j = idx ? idx.getX(i + v) : i + v;
          const o = k * 9 + v * 3;
          const x = p.getX(j);
          const z = p.getZ(j);
          this.t[o] = x;
          this.t[o + 1] = p.getY(j);
          this.t[o + 2] = z;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          z0 = Math.min(z0, z);
          z1 = Math.max(z1, z);
        }
        for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++)
          for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
            const key = cx * 73856093 + cz * 19349663;
            let arr = this.map.get(key);
            if (!arr) this.map.set(key, (arr = []));
            arr.push(k);
          }
        k++;
      }
    }
    this.tri = new THREE.Triangle();
  }

  /** Calls fn(triIndex) once for each triangle touching the xz rect. Stops if fn returns true. */
  each(x0, z0, x1, z1, fn) {
    const c = this.cell;
    const s = ++this.s;
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++)
      for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
        const arr = this.map.get(cx * 73856093 + cz * 19349663);
        if (!arr) continue;
        for (const k of arr) {
          if (this.stamp[k] === s) continue;
          this.stamp[k] = s;
          if (fn(k)) return true;
        }
      }
    return false;
  }

  setTri(k) {
    const t = this.t;
    const o = k * 9;
    this.tri.a.set(t[o], t[o + 1], t[o + 2]);
    this.tri.b.set(t[o + 3], t[o + 4], t[o + 5]);
    this.tri.c.set(t[o + 6], t[o + 7], t[o + 8]);
    return this.tri;
  }

  /** Does any triangle cross this box? */
  boxHits(box) {
    return this.each(box.min.x, box.min.z, box.max.x, box.max.z, (k) => box.intersectsTriangle(this.setTri(k)));
  }

  /** Nearest hit along a ray within far: { d, n (unit normal facing the ray) } or null. */
  ray(o, dir, far) {
    const ray = (this._ray ??= new THREE.Ray());
    ray.origin.copy(o);
    ray.direction.copy(dir);
    const hit = (this._hit ??= new THREE.Vector3());
    const e = o.clone().addScaledVector(dir, far);
    let best = null;
    this.each(Math.min(o.x, e.x), Math.min(o.z, e.z), Math.max(o.x, e.x), Math.max(o.z, e.z), (k) => {
      const T = this.setTri(k);
      if (!ray.intersectTriangle(T.a, T.b, T.c, false, hit)) return false;
      const d = hit.distanceTo(o);
      if (d > far || (best && d >= best.d)) return false;
      const n = T.getNormal(new THREE.Vector3());
      if (n.dot(dir) > 0) n.negate();
      best = { d, n };
      return false;
    });
    return best;
  }
}

export class HomeDecor {
  constructor({ apts, state }) {
    this.apts = apts;
    this.state = state;
    state.furniture ??= { pieces: [], next: 1 };
    this.mats = {};
    this.slots = new Map(); // aptId -> what's built there
    this.index = new Map(); // aptId -> TriIndex (built the first time you carry something)
    this.carry = null;
    this.photoTex = new Map(); // data url -> texture
    this.colSig = '';
    this.ghostMats = {};
    for (const a of apts.list) {
      // the apartment's own static meshes: what the baking and the fit tests start from
      a.baseMeshes = a.group.children.filter((m) => m.isMesh && (m.name.startsWith('interior:') || m.material === a.kit.glowMat || m.material === a.kit.glassMat || m.material === a.kit.screenMat));
      a.baseLights = a.kit.lights.slice();
      a.baseShadows = a.kit.shadows.slice();
    }
  }

  get pieces() {
    return this.state.furniture.pieces;
  }
  stored() {
    return this.pieces.filter((p) => !p.home);
  }
  placedIn(id) {
    return this.pieces.filter((p) => p.home === id && p !== this.carry?.piece);
  }

  /** A new piece, straight into storage. */
  add(id) {
    const F = this.state.furniture;
    const p = { uid: F.next++, id, home: null, x: 0, z: 0, r: 0, variant: Math.floor(Math.random() * 8) };
    F.pieces.push(p);
    return p;
  }

  /** How much your home adds to your status (what's placed where you live). */
  score(homeId) {
    let s = 0;
    for (const p of this.pieces) if (p.home === homeId) s += FURN[p.id]?.decor ?? 0;
    return Math.min(45, s);
  }

  mat(key) {
    if (!this.mats[key]) {
      const o = {};
      if (key === 'blinds' || key === 'books') Object.assign(o, { alphaTest: 0.5, side: THREE.DoubleSide });
      if (key === 'curtain') o.side = THREE.DoubleSide;
      this.mats[key] = interiorMaterial(this.apts.tex[key].map, this.apts.uniforms, o);
    }
    return this.mats[key];
  }

  slot(apt) {
    let S = this.slots.get(apt.id);
    if (!S) {
      const group = new THREE.Group();
      apt.group.add(group);
      S = { group, colliders: [], interactables: [], items: [], tanks: [] };
      this.slots.set(apt.id, S);
    }
    return S;
  }

  /** Rebuild everything placed in an apartment and re-bake its lighting. */
  rebuild(apt) {
    const S = this.slot(apt);
    const kit = apt.kit;
    for (const t of S.tanks) t.dispose();
    S.tanks = [];
    for (const m of S.group.children) m.geometry?.dispose();
    S.group.clear();
    for (const b of S.colliders) kit.colliders.remove(b);
    S.colliders = [];
    for (const it of S.interactables) {
      const i = apt.interactables.indexOf(it);
      if (i >= 0) apt.interactables.splice(i, 1);
    }
    S.interactables = [];
    S.items = [];

    const tk = new InteriorKit({ origin: kit.o, W: kit.W, D: kit.D, H: kit.H, tex: kit.tex, uniforms: kit.uniforms });
    const col = collectionsFor(this.state, TOYS);
    const pieces = this.placedIn(apt.id);
    S.shelf = pieces.some((p) => p.id === 'trophyShelf');
    const dyn = [];
    for (const p of pieces) {
      const def = FURN[p.id];
      if (!def) continue;
      const P = tk.place(p.x, p.z, p.r * Q);
      const ctx = { variant: p.variant ?? 0, dyn: [], ...col };
      def.build(P, ctx);
      for (const d of ctx.dyn) dyn.push({ ...d, uid: p.uid });
      S.items.push({ piece: p, def, ...this.worldBox(apt, p, def) });
      if (def.use) {
        const b = def.box;
        const front = def.kind === 'wall' ? 0.6 : b[3] + 0.35;
        const pt = P.point((b[0] + b[2]) / 2, 0, front);
        const it = { x: pt.x, z: pt.z, r: def.reach ?? Math.max(1.15, (b[2] - b[0]) / 2 + 0.45), use: 'decor', uid: p.uid, label: def.label ?? 'Sit down', decor: true };
        S.interactables.push(it);
        apt.interactables.push(it);
      }
    }
    for (const b of tk.colliders.boxes) S.colliders.push(kit.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1));

    // light: the room's own lamps plus any you placed; shadows under everything
    const lights = apt.baseLights.concat(tk.lights);
    for (const R of kit.rooms) R.lampAmb.setRGB(0, 0, 0);
    const zone = (k) => (k < 0 ? -1 : (kit.rooms[k].zone ?? `#${k}`));
    for (const L of lights) {
      L.room = roomAt(kit.rooms, L.x, L.z, L.y);
      if (L.room < 0) continue;
      const z = zone(L.room);
      const amb = L.color.clone().multiplyScalar(L.power * 0.07);
      kit.rooms.forEach((R, k) => zone(k) === z && R.lampAmb.add(amb));
    }
    kit.lights.length = 0;
    kit.lights.push(...lights); // the apartment's fixtures list (it lights the player too)
    const ctx = { rooms: kit.rooms, lights, windows: kit.windows, shadows: apt.baseShadows.concat(tk.shadows), floorY: kit.o.y, ceil: kit.H, fx: kit.fxLights };
    for (const m of apt.baseMeshes) if (m.name.startsWith('interior:')) rebakeInPlace(m.geometry, ctx);
    for (const [key, b] of tk.B) {
      if (b.empty) continue;
      const geo = b.build();
      bake(geo, ctx);
      const mesh = new THREE.Mesh(geo, this.mat(key));
      mesh.matrixAutoUpdate = false;
      S.group.add(mesh);
    }
    if (!tk.glow.empty) S.group.add(new THREE.Mesh(tk.glow.build(), kit.glowMat));
    if (!tk.glass.empty) {
      const g = new THREE.Mesh(tk.glass.build(), kit.glassMat);
      g.renderOrder = 5;
      S.group.add(g);
    }

    // things that move or change: fish, photo strips
    for (const d of dyn) {
      if (d.type === 'fish') S.tanks.push(new FishTank(S.group, d));
      else if (d.type === 'photo') {
        const url = this.state.photos?.[d.idx];
        if (!url) continue;
        const mat = new THREE.MeshBasicMaterial({ color: '#c8c0b8', fog: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
        m.applyMatrix4(d.m);
        S.group.add(m);
        this.photo(url, (t) => {
          mat.map = t;
          mat.needsUpdate = true;
        });
      }
    }
  }

  photo(url, cb) {
    const t = this.photoTex.get(url);
    if (t) return cb(t);
    stripTexture(url, (tex) => {
      this.photoTex.set(url, tex);
      cb(tex);
    });
  }

  /** World footprint and height range of a placed piece. */
  worldBox(apt, p, def, r = p.r) {
    const o = apt.kit.o;
    if (def.kind === 'wall') {
      const B = this.measure(def);
      const f = turnBox([B.min.x, B.min.z, B.max.x, B.max.z], r);
      return { x0: o.x + p.x + f[0], z0: o.z + p.z + f[1], x1: o.x + p.x + f[2], z1: o.z + p.z + f[3], y0: o.y + B.min.y, y1: o.y + B.max.y };
    }
    const f = turnBox(def.box, r);
    return { x0: o.x + p.x + f[0], z0: o.z + p.z + f[1], x1: o.x + p.x + f[2], z1: o.z + p.z + f[3], y0: o.y, y1: o.y + Math.max(def.h, 0.03) };
  }

  /** The local bounds of a piece's geometry (for hanging things on walls). */
  measure(def) {
    this._measure ??= {};
    if (this._measure[def.id]) return this._measure[def.id];
    const tk = this.scratchKit(def, 0);
    const B = new THREE.Box3();
    for (const b of [...tk.B.values(), tk.glow, tk.glass, tk.screen]) {
      if (b.empty) continue;
      const g = b.build();
      g.computeBoundingBox();
      B.union(g.boundingBox);
      g.dispose();
    }
    return (this._measure[def.id] = B);
  }

  scratchKit(def, variant) {
    const k = this.apts.list[0].kit;
    const tk = new InteriorKit({ origin: new THREE.Vector3(), W: 4, D: 4, H: 3, tex: k.tex, uniforms: k.uniforms });
    def.build(tk.place(0, 0, 0), { variant, dyn: [], ...collectionsFor(this.state, TOYS) });
    return tk;
  }

  triIndex(apt) {
    let T = this.index.get(apt.id);
    if (!T) {
      T = new TriIndex(apt.baseMeshes.map((m) => m.geometry));
      this.index.set(apt.id, T);
    }
    return T;
  }

  // ---------------------------------------------------------------- decor mode
  /** Start carrying a piece (from storage, or picked up from where it stands). */
  pickUp(piece, apt, player) {
    const def = FURN[piece.id];
    const from = piece.home ? { home: piece.home, x: piece.x, z: piece.z, r: piece.r } : null;
    this.carry = { piece, def, apt, from, r: 0, valid: false, why: '', target: null, sig: '', ghost: this.ghost(def, piece.variant ?? 0) };
    // face you
    this.carry.r = def.kind === 'wall' ? 0 : ((Math.round((player.yaw + Math.PI) / Q) % 4) + 4) % 4;
    if (from) this.carry.r = from.r;
    apt.group.add(this.carry.ghost);
    if (from) this.rebuild(apt);
    this.triIndex(apt);
    this.updateCarry(player, 1);
    this.carry.ghost.position.copy(this.carry.pos);
  }

  ghost(def, variant) {
    const tk = this.scratchKit(def, variant);
    const g = new THREE.Group();
    const add = (b, key) => {
      if (b.empty) return;
      let m = this.ghostMats[key];
      if (!m) {
        m = this.ghostMats[key] = new THREE.MeshBasicMaterial({
          map: key === 'glow' || key === 'glass' ? null : this.apts.tex[key]?.map ?? null,
          vertexColors: true,
          transparent: true,
          opacity: key === 'glass' ? 0.25 : 0.72,
          depthWrite: key !== 'glass',
          fog: false,
        });
      }
      g.add(new THREE.Mesh(b.build(), m));
    };
    for (const [key, b] of tk.B) add(b, key);
    add(tk.glow, 'glow');
    add(tk.glass, 'glass');
    // the footprint on the floor: green where it fits, red where it doesn't
    if (def.kind !== 'wall') {
      const [x0, z0, x1, z1] = def.box;
      this.footMat ??= new THREE.MeshBasicMaterial({ color: '#4aff7a', transparent: true, opacity: 0.4, depthWrite: false, fog: false });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Q), this.footMat);
      f.position.set((x0 + x1) / 2, 0.035, (z0 + z1) / 2);
      f.renderOrder = 7;
      g.add(f);
    }
    return g;
  }

  tint(ok) {
    const c = ok ? [0.6, 1.4, 0.7] : [1.5, 0.45, 0.4];
    for (const m of Object.values(this.ghostMats)) m.color.setRGB(...c);
    this.footMat?.color.set(ok ? '#4aff7a' : '#ff4a3a');
  }

  rotate() {
    const c = this.carry;
    if (!c || c.def.kind === 'wall') return false;
    c.r = (c.r + 1) % 4;
    c.sig = '';
    return true;
  }

  /** Where the carried piece would go, and whether it fits. */
  updateCarry(player, dt) {
    const c = this.carry;
    if (!c) return;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const sig = `${player.pos.x.toFixed(2)},${player.pos.z.toFixed(2)},${player.yaw.toFixed(2)},${c.r}`;
    if (sig !== c.sig) {
      c.sig = sig;
      if (c.def.kind === 'wall') this.aimWall(c, player, fx, fz);
      else this.aimFloor(c, player, fx, fz);
    }
    const g = c.ghost;
    if (!c.pos) return;
    g.position.x = damp(g.position.x, c.pos.x, 18, dt);
    g.position.z = damp(g.position.z, c.pos.z, 18, dt);
    g.position.y = c.pos.y;
    g.rotation.y = c.r * Q;
    this.tint(c.valid);
  }

  aimFloor(c, player, fx, fz) {
    const apt = c.apt;
    const o = apt.kit.o;
    const f = turnBox(c.def.box, c.r);
    // far enough in front that the piece clears you
    const reach = Math.max(Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? -f[0] : f[2]) : fz > 0 ? -f[1] : f[3], 0);
    const dist = Math.max(0.95, reach + 0.6);
    let x = player.pos.x + fx * dist - o.x;
    let z = player.pos.z + fz * dist - o.z;
    x = Math.round(x / GRID) * GRID;
    z = Math.round(z / GRID) * GRID;
    // back it up against a wall if one is close behind it
    if (c.def.kind === 'floor') [x, z] = this.backToWall(apt, c.def, c.r, x, z);
    const p = { x, z, r: c.r };
    c.target = p;
    c.pos = new THREE.Vector3(o.x + x, o.y, o.z + z);
    const why = this.fitFloor(apt, c.def, p, player);
    c.valid = !why;
    c.why = why;
  }

  backToWall(apt, def, r, x, z) {
    const o = apt.kit.o;
    const f = turnBox(def.box, r);
    // the piece's back faces -front; front is (sin, cos) of r quarter turns
    const bx = -Math.round(Math.sin(r * Q));
    const bz = -Math.round(Math.cos(r * Q));
    const fy = o.y;
    const X0 = o.x + x + f[0];
    const X1 = o.x + x + f[2];
    const Z0 = o.z + z + f[1];
    const Z1 = o.z + z + f[3];
    const look = 0.45;
    const into = 0.3;
    const q = apt.kit.colliders.query(Math.min(X0, X0 + bx * look) - 0.01, Math.min(Z0, Z0 + bz * look) - 0.01, Math.max(X1, X1 + bx * look) + 0.01, Math.max(Z1, Z1 + bz * look) + 0.01, []);
    let best = null;
    for (const b of q) {
      if (b.y0 > fy + 0.6 || b.y1 < fy + 1.4) continue; // only tall things (walls, wardrobes)
      if (bx) {
        if (b.z0 > Z0 + 0.05 || b.z1 < Z1 - 0.05) continue; // must cover the piece's whole back
        const edge = bx < 0 ? X0 : X1;
        const face = bx < 0 ? b.x1 : b.x0;
        const gap = (edge - face) * -bx; // >0: the wall is behind
        if (gap < -into || gap > look || (bx < 0 ? b.x0 > edge : b.x1 < edge)) continue;
        if (!best || gap < best.gap) best = { gap };
      } else {
        if (b.x0 > X0 + 0.05 || b.x1 < X1 - 0.05) continue;
        const edge = bz < 0 ? Z0 : Z1;
        const face = bz < 0 ? b.z1 : b.z0;
        const gap = (edge - face) * -bz;
        if (gap < -into || gap > look || (bz < 0 ? b.z0 > edge : b.z1 < edge)) continue;
        if (!best || gap < best.gap) best = { gap };
      }
    }
    if (!best) return [x, z];
    const move = best.gap - BACK_GAP;
    return [x + bx * move, z + bz * move];
  }

  /** null if the piece fits at p, else a short reason. */
  fitFloor(apt, def, p, player) {
    const kit = apt.kit;
    const W = this.worldBox(apt, p, def);
    const B = apt.space.bounds;
    if (W.x0 < B.x0 - 0.1 || W.x1 > B.x1 + 0.1 || W.z0 < B.z0 - 0.1 || W.z1 > B.z1 + 0.1) return "It won't fit there";
    const fy = kit.o.y;
    const rug = def.kind === 'rug';
    if (!rug) {
      for (const d of kit.doorways) if (overlap(W, d, 0.02)) return 'Keep the doorway clear';
      if (player && Math.hypot(Math.max(W.x0 - player.pos.x, 0, player.pos.x - W.x1), Math.max(W.z0 - player.pos.z, 0, player.pos.z - W.z1)) < 0.3) return "You're in the way";
    }
    // walls and furniture (the room's own, and what you've placed)
    for (const b of kit.colliders.query(W.x0 + 0.02, W.z0 + 0.02, W.x1 - 0.02, W.z1 - 0.02, [])) {
      if (b.x1 <= W.x0 + 0.02 || b.x0 >= W.x1 - 0.02 || b.z1 <= W.z0 + 0.02 || b.z0 >= W.z1 - 0.02) continue;
      if (rug) {
        if (b.y0 <= fy + 0.05 && b.y1 - b.y0 >= 2.0) return 'Not under a wall';
        continue;
      }
      if (b.y1 > fy + 0.05 && b.y0 < W.y1) return "Something's in the way";
    }
    // anything else built into the room (shelves, lamps, cabinets, trim)
    if (!rug) {
      const box = new THREE.Box3(new THREE.Vector3(W.x0 + 0.01, fy + 0.16, W.z0 + 0.01), new THREE.Vector3(W.x1 - 0.01, fy + Math.max(0.2, def.h - 0.01), W.z1 - 0.01));
      if (this.triIndex(apt).boxHits(box)) return "Something's in the way";
    }
    for (const it of this.slot(apt).items) {
      if (!overlap(W, it, 0.01)) continue;
      const other = it.def.kind;
      if (rug && other === 'rug') return 'It overlaps another rug';
      if (rug || other === 'rug') continue;
      if (W.y0 < it.y1 && W.y1 > it.y0) return "Something's in the way";
    }
    return null;
  }

  aimWall(c, player, fx, fz) {
    const apt = c.apt;
    const kit = apt.kit;
    const o = kit.o;
    const T = this.triIndex(apt);
    const eye = new THREE.Vector3(player.pos.x, o.y + EYE, player.pos.z);
    const dir = new THREE.Vector3(fx, 0, fz);
    const hit = T.ray(eye, dir, 2.6);
    const float = (why) => {
      c.valid = false;
      c.why = why;
      c.target = null;
      c.r = ((Math.round((player.yaw + Math.PI) / Q) % 4) + 4) % 4;
      c.pos = new THREE.Vector3(player.pos.x + fx * 1.1, o.y, player.pos.z + fz * 1.1);
    };
    if (!hit || Math.abs(hit.n.y) > 0.2) return float('Face a wall to hang it');
    const ax = Math.abs(hit.n.x) > Math.abs(hit.n.z);
    if (Math.max(Math.abs(hit.n.x), Math.abs(hit.n.z)) < 0.97) return float('Face a wall to hang it');
    const nx = ax ? Math.sign(hit.n.x) : 0;
    const nz = ax ? 0 : Math.sign(hit.n.z);
    const P = eye.clone().addScaledVector(dir, hit.d);
    // is it really a wall (something full height behind the surface)?
    const behind = { x: P.x - nx * 0.03, z: P.z - nz * 0.03 };
    const wall = kit.colliders.query(behind.x - 0.01, behind.z - 0.01, behind.x + 0.01, behind.z + 0.01, []).some((b) => behind.x >= b.x0 && behind.x <= b.x1 && behind.z >= b.z0 && behind.z <= b.z1 && b.y1 - b.y0 >= 2.0 && b.y0 <= o.y + 0.1);
    if (!wall) return float('Face a wall to hang it');
    c.r = (((Math.round(Math.atan2(nx, nz) / Q) % 4) + 4) % 4);
    // slide along the wall in steps; sit just off it
    let lx = P.x - o.x;
    let lz = P.z - o.z;
    if (ax) lz = Math.round(lz / WGRID) * WGRID;
    else lx = Math.round(lx / WGRID) * WGRID;
    if (ax) lx += nx * WALL_OFF;
    else lz += nz * WALL_OFF;
    const p = { x: lx, z: lz, r: c.r };
    c.target = p;
    c.pos = new THREE.Vector3(o.x + lx, o.y, o.z + lz);
    const why = this.fitWall(apt, c.def, p, nx, nz);
    c.valid = !why;
    c.why = why;
  }

  fitWall(apt, def, p, nx, nz) {
    const kit = apt.kit;
    const T = this.triIndex(apt);
    const B = this.measure(def);
    const W = this.worldBox(apt, p, def);
    if (W.y1 > kit.o.y + kit.H - 0.05) return "It won't fit there";
    // a wall behind every part of it (not a window, a door or the edge of the wall)
    const o = new THREE.Vector3();
    const dir = new THREE.Vector3(-nx, 0, -nz);
    const along = nx ? [W.z0 + 0.03, (W.z0 + W.z1) / 2, W.z1 - 0.03] : [W.x0 + 0.03, (W.x0 + W.x1) / 2, W.x1 - 0.03];
    const wx = kit.o.x + p.x - nx * WALL_OFF;
    const wz = kit.o.z + p.z - nz * WALL_OFF;
    for (const a of along)
      for (const y of [W.y0 + 0.03, (W.y0 + W.y1) / 2, W.y1 - 0.03]) {
        if (nx) o.set(wx + nx * 0.06, y, a);
        else o.set(a, y, wz + nz * 0.06);
        const h = T.ray(o, dir, 0.12);
        if (!h || h.d > 0.066) return 'There has to be wall behind it';
        if (h.d < 0.054) return "There's something on that wall";
      }
    // nothing built in front of the wall there
    const depth = B.max.z;
    const box = new THREE.Box3();
    if (nx) box.set(new THREE.Vector3(Math.min(wx + nx * 0.006, wx + nx * depth), W.y0, W.z0 + 0.01), new THREE.Vector3(Math.max(wx + nx * 0.006, wx + nx * depth), W.y1, W.z1 - 0.01));
    else box.set(new THREE.Vector3(W.x0 + 0.01, W.y0, Math.min(wz + nz * 0.006, wz + nz * depth)), new THREE.Vector3(W.x1 - 0.01, W.y1, Math.max(wz + nz * 0.006, wz + nz * depth)));
    if (T.boxHits(box)) return "There's something on that wall";
    const Wb = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
    for (const it of this.slot(apt).items) if (it.def.kind !== 'rug' && overlap(Wb, it, 0) && box.min.y < it.y1 && box.max.y > it.y0) return "There's something in the way";
    for (const b of kit.colliders.query(Wb.x0, Wb.z0, Wb.x1, Wb.z1, [])) {
      if (b.x1 <= Wb.x0 || b.x0 >= Wb.x1 || b.z1 <= Wb.z0 || b.z0 >= Wb.z1) continue;
      if (b.y1 > box.min.y && b.y0 < box.max.y) return "There's something in the way";
    }
    return null;
  }

  /** Set it down where the ghost is. Returns null, or why it can't go there. */
  drop() {
    const c = this.carry;
    if (!c) return null;
    if (!c.valid || !c.target) return c.why || "It won't fit there";
    Object.assign(c.piece, { home: c.apt.id, x: c.target.x, z: c.target.z, r: c.target.r });
    this.endCarry();
    return null;
  }

  /** Put it back where it was (or back in storage if it came from there). */
  cancel() {
    const c = this.carry;
    if (!c) return;
    if (c.from) Object.assign(c.piece, c.from);
    else c.piece.home = null;
    this.endCarry();
  }

  /** Pack the carried piece away. */
  store() {
    const c = this.carry;
    if (!c) return;
    c.piece.home = null;
    this.endCarry();
  }

  endCarry() {
    const c = this.carry;
    this.carry = null;
    c.apt.group.remove(c.ghost);
    c.ghost.traverse((m) => m.geometry?.dispose());
    this.rebuild(c.apt);
  }

  /** The placed piece you're closest to (and facing), for picking it up again. */
  nearest(apt, player) {
    const S = this.slot(apt);
    let best = null;
    let bd = 1.1;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    for (const it of S.items) {
      const cx = Math.max(it.x0, Math.min(player.pos.x, it.x1));
      const cz = Math.max(it.z0, Math.min(player.pos.z, it.z1));
      const dx = cx - player.pos.x;
      const dz = cz - player.pos.z;
      const d = Math.hypot(dx, dz);
      const facing = d < 0.05 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.2) continue;
      const score = d - facing * 0.3 + (it.def.kind === 'rug' ? 0.6 : 0);
      if (score < bd) {
        bd = score;
        best = it.piece;
      }
    }
    return best;
  }

  /** Seat closest to you on a placed piece (local seat → world). */
  seatFor(apt, uid, pos) {
    const p = this.pieces.find((q) => q.uid === uid);
    const def = p && FURN[p.id];
    if (!def?.seats) return null;
    const o = apt.kit.o;
    const a = p.r * Q;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const W = (x, z) => ({ x: o.x + p.x + x * c + z * s, z: o.z + p.z - x * s + z * c });
    let best = null;
    for (const [x, z] of def.seats) {
      const w = W(x, z);
      const d = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (!best || d < best.d) best = { d, w, out: W(x, def.box[3] + 0.45) };
    }
    return { x: best.w.x, z: best.w.z, y: o.y, yaw: a, out: best.out, rest: true };
  }

  /** Collections follow what you own: rebuild the home when that changes. */
  refresh(apt) {
    if (!apt) return;
    const st = this.state;
    const sig = `${(st.owned ?? []).length}|${(st.gullToys ?? []).length}|${(st.photos ?? [])[0]?.length ?? 0}|${(st.photos ?? []).length}`;
    if (sig === this.colSig && this.slots.has(apt.id)) return;
    this.colSig = sig;
    this.rebuild(apt);
  }

  update(dt, time, apt) {
    if (!apt) return;
    const S = this.slots.get(apt.id);
    // a trophy shelf takes the Gull Box toys off the fridge
    if (apt.toys) apt.toys.visible = !S?.shelf;
    if (S) for (const t of S.tanks) t.update(time);
    if (this.carry) this.carry.ghost.visible = this.carry.apt === apt;
  }
}

/** Re-bake lighting into an existing geometry, reusing its buffers. */
function rebakeInPlace(geo, ctx) {
  const old = { aLamp: geo.attributes.aLamp, aDay: geo.attributes.aDay, aFx: geo.attributes.aFx };
  bake(geo, ctx);
  for (const [k, a] of Object.entries(old)) {
    const n = geo.attributes[k];
    if (!a || !n || a.array.length !== n.array.length) continue;
    a.array.set(n.array);
    a.needsUpdate = true;
    geo.setAttribute(k, a);
  }
}
