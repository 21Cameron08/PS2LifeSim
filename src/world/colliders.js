// Static collision: axis-aligned boxes in a spatial hash.
// Characters are circles on the XZ plane; the camera uses a 3D segment test.
export class Colliders {
  constructor(cell = 12) {
    this.cell = cell;
    this.map = new Map();
    this.boxes = [];
    this._stamp = 0;
  }

  key(cx, cz) {
    return cx * 73856093 + cz * 19349663;
  }

  add(x0, z0, x1, z1, y0 = 0, y1 = 100, tag = null) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag, _s: 0 };
    this.boxes.push(b);
    const c = this.cell;
    for (let cx = Math.floor(b.x0 / c); cx <= Math.floor(b.x1 / c); cx++)
      for (let cz = Math.floor(b.z0 / c); cz <= Math.floor(b.z1 / c); cz++) {
        const k = this.key(cx, cz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(b);
      }
    return b;
  }

  /** Take a box back out (placed furniture that gets moved). */
  remove(b) {
    const i = this.boxes.indexOf(b);
    if (i < 0) return;
    this.boxes.splice(i, 1);
    const c = this.cell;
    for (let cx = Math.floor(b.x0 / c); cx <= Math.floor(b.x1 / c); cx++)
      for (let cz = Math.floor(b.z0 / c); cz <= Math.floor(b.z1 / c); cz++) {
        const arr = this.map.get(this.key(cx, cz));
        const j = arr ? arr.indexOf(b) : -1;
        if (j >= 0) arr.splice(j, 1);
      }
  }

  /** Add a box centred at (x,z). */
  addC(x, z, w, d, h = 100, tag = null) {
    return this.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, h, tag);
  }

  query(x0, z0, x1, z1, out = []) {
    const c = this.cell;
    const s = ++this._stamp;
    out.length = 0;
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++)
      for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
        const arr = this.map.get(this.key(cx, cz));
        if (!arr) continue;
        for (const b of arr) {
          if (b._s === s) continue;
          b._s = s;
          out.push(b);
        }
      }
    return out;
  }

  /** Push a circle (pos.x, pos.z, radius r) out of any boxes. Mutates pos. */
  resolveCircle(pos, r, footY = 0) {
    const list = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._tmp || (this._tmp = []));
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of list) {
        if (footY + 0.3 < b.y0 || footY > b.y1 - 0.25) continue; // can step over / walk under
        const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the shallowest axis
          const pl = pos.x - b.x0;
          const pr = b.x1 - pos.x;
          const pn = pos.z - b.z0;
          const ps = b.z1 - pos.z;
          const m = Math.min(pl, pr, pn, ps);
          if (m === pl) pos.x = b.x0 - r;
          else if (m === pr) pos.x = b.x1 + r;
          else if (m === pn) pos.z = b.z0 - r;
          else pos.z = b.z1 + r;
        }
      }
    }
    return hit;
  }

  /** First hit fraction (0..1) of segment a->b against the boxes, or 1. */
  segment(a, b, pad = 0.25) {
    const minX = Math.min(a.x, b.x) - pad;
    const maxX = Math.max(a.x, b.x) + pad;
    const minZ = Math.min(a.z, b.z) - pad;
    const maxZ = Math.max(a.z, b.z) + pad;
    const list = this.query(minX, minZ, maxX, maxZ, this._tmp2 || (this._tmp2 = []));
    let best = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    for (const bx of list) {
      let t0 = 0;
      let t1 = 1;
      const axes = [
        [a.x, dx, bx.x0 - pad, bx.x1 + pad],
        [a.y, dy, bx.y0 - pad, bx.y1 + pad],
        [a.z, dz, bx.z0 - pad, bx.z1 + pad],
      ];
      let ok = true;
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) {
            ok = false;
            break;
          }
          continue;
        }
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
}
