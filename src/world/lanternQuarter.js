import * as THREE from 'three';
import { CITY } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, smoothstep } from '../core/rng.js';
import { additive } from '../render/materials.js';

// The "borderline fantasy" district: one city block where the rules bend a bit.
// An ancient tree, lanterns that float on their own, fireflies, rune stones and
// a little night market. Everything glows harder after dark, and the fog and sky
// shift violet as you get close (see Environment.magic).

export class LanternQuarter {
  constructor(scene, tex, block, colliders) {
    const rng = new Rng(808);
    this.rng = rng;
    const L = block.lot;
    const C = CITY.CURB;
    const cx = (L.x0 + L.x1) / 2;
    const cz = (L.z0 + L.z1) / 2;
    this.center = new THREE.Vector3(cx, C, cz);
    const group = new THREE.Group();
    scene.add(group);
    this.group = group;

    const stone = new GeoBuilder();
    const rune = new GeoBuilder();
    const glow = new GeoBuilder();
    const wood = new GeoBuilder();
    const stoneCol = shade('#6f6a78');

    // plaza floor with faintly glowing seams
    const floor = new GeoBuilder();
    floor.box(L.x0, 0, L.z0, L.x1, C, L.z1, { sides: [false, false, false, false], topScale: 6 });
    this.floorMat = new THREE.MeshLambertMaterial({ map: tex.plaza.map, emissiveMap: tex.plaza.emissive, emissive: new THREE.Color('#58d8ff') });
    group.add(floor.mesh(this.floorMat));

    // low walls with gaps for four gates
    const gap = 2.6;
    const wall = (x0, z0, x1, z1) => {
      stone.box(x0, C, z0, x1, C + 0.8, z1, { color: stoneCol });
      stone.box(x0 - 0.05, C + 0.8, z0 - 0.05, x1 + 0.05, C + 0.92, z1 + 0.05, { color: shade('#8a8494') });
      colliders.add(x0, z0, x1, z1, 0, 1);
    };
    const t = 0.6;
    wall(L.x0, L.z0, cx - gap, L.z0 + t);
    wall(cx + gap, L.z0, L.x1, L.z0 + t);
    wall(L.x0, L.z1 - t, cx - gap, L.z1);
    wall(cx + gap, L.z1 - t, L.x1, L.z1);
    wall(L.x0, L.z0 + t, L.x0 + t, cz - gap);
    wall(L.x0, cz + gap, L.x0 + t, L.z1 - t);
    wall(L.x1 - t, L.z0 + t, L.x1, cz - gap);
    wall(L.x1 - t, cz + gap, L.x1, L.z1 - t);

    // gates
    const gates = [
      [cx, L.z0 + t / 2, 0],
      [cx, L.z1 - t / 2, 0],
      [L.x0 + t / 2, cz, 1],
      [L.x1 - t / 2, cz, 1],
    ];
    const gateTops = [];
    for (const [gx, gz, rot] of gates) {
      for (const s of [-1, 1]) {
        const px = rot ? gx : gx + s * 2.9;
        const pz = rot ? gz + s * 2.9 : gz;
        rune.box(px - 0.45, C, pz - 0.45, px + 0.45, C + 5.6, pz + 0.45, { sx: 0.9, sy: 5.6 });
        colliders.addC(px, pz, 0.9, 0.9, 6);
      }
      const hw = 3.6;
      if (rot) stone.box(gx - 0.55, C + 5.6, gz - hw, gx + 0.55, C + 6.3, gz + hw, { color: stoneCol, bottom: true });
      else stone.box(gx - hw, C + 5.6, gz - 0.55, gx + hw, C + 6.3, gz + 0.55, { color: stoneCol, bottom: true });
      glow.addGeometry(new THREE.OctahedronGeometry(0.45, 0), trs(gx, C + 7.0, gz, 0.4, 1, 1.5, 1), shade('#8ff6ff'));
      gateTops.push(new THREE.Vector3(gx, C + 6.2, gz));
    }

    // the ancient tree
    const bark = new GeoBuilder();
    let px = cx;
    let pz = cz;
    const segs = 6;
    for (let k = 0; k < segs; k++) {
      const y0 = k * 1.25;
      const r0 = 1.55 - k * 0.15;
      const r1 = 1.55 - (k + 1) * 0.15;
      const nx = cx + Math.sin(k * 0.9) * 0.35;
      const nz = cz + Math.cos(k * 1.3) * 0.35;
      const g = new THREE.CylinderGeometry(r1, r0, 1.35, 7, 1, true);
      bark.addGeometry(g, trs((px + nx) / 2, C + y0 + 0.62, (pz + nz) / 2, k * 0.5), [1, 1, 1]);
      px = nx;
      pz = nz;
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      bark.addGeometry(new THREE.CylinderGeometry(0.18, 0.5, 3.4, 6), trs(cx + Math.cos(a) * 1.6, C + 0.4, cz + Math.sin(a) * 1.6, -a, 1, 1, 1, 0, -1.94), [1, 1, 1]);
    }
    const tops = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng.float(-0.3, 0.3);
      const len = rng.float(4.2, 6);
      const tilt = rng.float(0.75, 1.05);
      const y = C + 6.2 + rng.float(-0.6, 0.6);
      const m = trs(cx + Math.cos(a) * len * 0.45 * Math.sin(tilt), y + Math.cos(tilt) * len * 0.5, cz + Math.sin(a) * len * 0.45 * Math.sin(tilt), -a, 1, 1, 1, 0, -tilt);
      bark.addGeometry(new THREE.CylinderGeometry(0.16, 0.42, len, 6), m, [1, 1, 1]);
      tops.push(new THREE.Vector3(cx + Math.cos(a) * len * 0.9 * Math.sin(tilt), y + Math.cos(tilt) * len, cz + Math.sin(a) * len * 0.9 * Math.sin(tilt)));
    }
    tex.bark.repeat.set(2, 1);
    group.add(bark.mesh(new THREE.MeshLambertMaterial({ map: tex.bark, color: new THREE.Color('#d8c8e0'), emissive: new THREE.Color('#2a2040') })));
    colliders.addC(cx, cz, 3.0, 3.0, 9);

    const canopy = new GeoBuilder();
    const leafCols = ['#3fb8a8', '#6a5ad0', '#8a4ac0', '#2a8a9a', '#c05aa0'].map((h) => shade(h));
    tops.push(new THREE.Vector3(cx, C + 11, cz));
    for (const p of tops) {
      const r = rng.float(2.4, 3.6);
      canopy.addGeometry(new THREE.IcosahedronGeometry(r, 0), trs(p.x, p.y, p.z, rng.float(0, 6), 1, rng.float(0.7, 0.9), 1), rng.pick(leafCols));
      canopy.addGeometry(new THREE.IcosahedronGeometry(r * 0.6, 0), trs(p.x + rng.float(-1.5, 1.5), p.y + r * 0.5, p.z + rng.float(-1.5, 1.5), rng.float(0, 6)), rng.pick(leafCols));
      // hanging glow-fruit
      for (let k = 0; k < 4; k++) {
        const fx = p.x + rng.float(-r, r) * 0.8;
        const fz = p.z + rng.float(-r, r) * 0.8;
        const fy = p.y - r * 0.55 - rng.float(0.2, 1.2);
        glow.addGeometry(new THREE.IcosahedronGeometry(0.17, 0), trs(fx, fy, fz), shade(rng.pick(['#ffd27a', '#ff9ad0', '#9affe8'])));
      }
    }
    this.canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#3a1a7a') });
    group.add(canopy.mesh(this.canopyMat));

    // rune circle under the tree
    this.circleMat = additive({ map: tex.runeCircle, color: new THREE.Color('#7fe7ff'), opacity: 0.4 });
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(19, 19).rotateX(-Math.PI / 2), this.circleMat);
    this.circle.position.set(cx, C + 0.05, cz);
    this.circle.renderOrder = 2;
    group.add(this.circle);

    // standing rune stones
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const r = 12.5;
      const sx = cx + Math.cos(a) * r;
      const sz = cz + Math.sin(a) * r;
      const g = new GeoBuilder();
      g.box(-0.45, 0, -0.25, 0.45, 2.6, 0.25, { sx: 0.9, sy: 2.6 });
      rune.addGeometry(g.build(), trs(sx, C, sz, -a + Math.PI / 2, 1, rng.float(0.8, 1.15), 1, rng.float(-0.08, 0.08), rng.float(-0.08, 0.08)));
      colliders.addC(sx, sz, 0.9, 0.9, 3);
    }
    this.runeMat = new THREE.MeshLambertMaterial({ map: tex.runeStone.map, emissiveMap: tex.runeStone.emissive, emissive: new THREE.Color('#ffffff') });
    group.add(rune.mesh(this.runeMat));

    // night market stalls in the corners
    const cloth = ['#8a1a2a', '#2a2a7a', '#1a6a6a', '#c08a1a'];
    this.vendorSpots = [];
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([sx, sz], k) => {
      const x = cx + sx * 12.5;
      const z = cz + sz * 12.5;
      const ry = Math.atan2(-sx, -sz); // face the tree
      const m = trs(x, C, z, ry);
      const s = new GeoBuilder();
      const w = shade('#6a4a30');
      s.cbox(0, 0, 0.6, 2.8, 1.0, 0.9, w);
      for (const ox of [-1.35, 1.35]) {
        s.cbox(ox, 0, 1.0, 0.1, 2.5, 0.1, w);
        s.cbox(ox, 0, -0.8, 0.1, 2.9, 0.1, w);
      }
      const cc = shade(cloth[k]);
      s.quad2([-1.6, 2.4, 1.4], [1.6, 2.4, 1.4], [1.6, 2.95, -0.95], [-1.6, 2.95, -0.95], [0, 0.97, 0.23], [0, 0, 1, 1], cc);
      s.quad2([-1.6, 2.1, 1.4], [1.6, 2.1, 1.4], [1.6, 2.4, 1.4], [-1.6, 2.4, 1.4], [0, 0, 1], [0, 0, 1, 1], cc);
      for (let g = 0; g < 7; g++)
        s.cbox(-1.1 + g * 0.37, 1.0, 0.6 + rng.float(-0.2, 0.2), 0.22, rng.float(0.15, 0.35), 0.22, shade(rng.pick(['#e0c060', '#c04040', '#60a0c0', '#a0c060', '#e090c0'])));
      wood.addGeometry(s.build(), m);
      const gl = new GeoBuilder();
      for (const ox of [-1.0, 0, 1.0]) gl.addGeometry(new THREE.IcosahedronGeometry(0.16, 0), trs(ox, 1.95, 1.35), shade(rng.pick(['#ffb050', '#ff6a8a', '#7affe0'])));
      glow.addGeometry(gl.build(), m);
      colliders.addC(x, z, 3.0, 3.0, 2.5);
      const front = new THREE.Vector3(0, 0, -0.5).applyMatrix4(m);
      this.vendorSpots.push({ x: front.x, z: front.z, yaw: ry });
    });
    group.add(wood.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    group.add(stone.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));

    // strings of lights from each gate to the tree
    const linePts = [];
    for (const g of gateTops) {
      const A = g;
      const B = new THREE.Vector3(cx + (g.x - cx) * 0.12, C + 7.2, cz + (g.z - cz) * 0.12);
      const n = 14;
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const tt = k / n;
        const p = new THREE.Vector3().lerpVectors(A, B, tt);
        p.y -= 1.6 * 4 * tt * (1 - tt);
        if (prev) linePts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
        if (k > 0 && k < n) glow.addGeometry(new THREE.IcosahedronGeometry(0.13, 0), trs(p.x, p.y - 0.12, p.z), shade(['#ffd080', '#ff80b0', '#80fff0'][k % 3]));
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#1a1a20' })));

    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    group.add(glow.mesh(this.glowMat));

    // floating lanterns (instanced, animated)
    const lb = new GeoBuilder();
    lb.addGeometry(new THREE.CylinderGeometry(0.24, 0.19, 0.44, 8), trs(0, 0, 0));
    this.lanternMat = new THREE.MeshBasicMaterial({ map: tex.lantern });
    this.LN = 60;
    this.lanterns = new THREE.InstancedMesh(lb.build(), this.lanternMat, this.LN);
    this.lanterns.frustumCulled = false;
    this.lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(this.lanterns);
    this.lan = [];
    for (let k = 0; k < this.LN; k++) {
      this.lan.push({
        r: rng.float(3.5, 19),
        a: rng.float(0, Math.PI * 2),
        w: rng.float(0.02, 0.07) * rng.sign(),
        h: rng.float(0, 22),
        rise: rng.float(0.12, 0.35),
        bob: rng.float(0, 6),
        s: rng.float(0.8, 1.3),
      });
    }
    const hp = new Float32Array(this.LN * 3);
    this.haloGeo = new THREE.BufferGeometry();
    this.haloGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    this.haloMat = additive({ map: tex.glow, color: new THREE.Color('#ffa040'), size: 2.6, points: true });
    const halos = new THREE.Points(this.haloGeo, this.haloMat);
    halos.frustumCulled = false;
    halos.renderOrder = 3;
    group.add(halos);

    // fireflies / wisps
    this.FN = 240;
    this.flies = [];
    const fp = new Float32Array(this.FN * 3);
    const fc = new Float32Array(this.FN * 3);
    const palette = ['#7affe8', '#ffd76a', '#ff8ad8', '#9aa8ff'].map((h) => new THREE.Color(h));
    for (let k = 0; k < this.FN; k++) {
      const a = rng.float(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 22;
      this.flies.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: C + rng.float(0.4, 9), p: rng.float(0, 100), sp: rng.float(0.3, 1.0) });
      const col = rng.pick(palette);
      fc.set([col.r, col.g, col.b], k * 3);
    }
    this.flyGeo = new THREE.BufferGeometry();
    this.flyGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.flyGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    this.flyMat = additive({ map: tex.glow, size: 0.7, points: true, vertexColors: true });
    const flies = new THREE.Points(this.flyGeo, this.flyMat);
    flies.frustumCulled = false;
    flies.renderOrder = 3;
    group.add(flies);

    // one coloured light so the square (and nearby facades) pick up the glow
    this.light = new THREE.PointLight('#8a6aff', 0, 55, 1.6);
    this.light.position.set(cx, C + 8, cz);
    group.add(this.light);

    this.keeperSpot = { x: cx + 0.5, z: cz + 3.6, yaw: 0 };
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  /** Send a lantern up from where the player is standing. */
  release(p) {
    this.releaseIdx = ((this.releaseIdx ?? -1) + 1) % this.LN;
    const L = this.lan[this.releaseIdx];
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    L.r = Math.max(2, Math.hypot(dx, dz));
    L.a = Math.atan2(dz, dx);
    L.w = 0.01;
    L.rise = 0.6;
    L.h = (((0.2 - (this.time ?? 0) * L.rise) % 22) + 22) % 22;
  }

  /** Returns 0..1: how deep into the Lantern Quarter's influence the point is. */
  influence(p) {
    return smoothstep(80, 22, Math.hypot(p.x - this.center.x, p.z - this.center.z));
  }

  update(dt, time, night) {
    this.time = time;
    const C = this.center;
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.8);
    this.floorMat.emissiveIntensity = (0.1 + night * 0.4) * (0.7 + 0.3 * pulse);
    this.canopyMat.emissiveIntensity = 0.35 + night * 1.1 + pulse * 0.25;
    this.runeMat.emissiveIntensity = 0.4 + night * 1.6 + pulse * 0.4;
    this.glowMat.color.setScalar(1.2 + night * 2.8);
    this.lanternMat.color.setScalar(1.1 + night * 1.5);
    this.circleMat.opacity = 0.25 + night * 0.45 + pulse * 0.1;
    this.circle.rotation.y = time * 0.03;
    this.haloMat.opacity = 0.25 + night * 0.75;
    this.flyMat.opacity = 0.35 + night * 0.65;
    this.light.intensity = (20 + night * 140) * (0.85 + pulse * 0.15);

    const hp = this.haloGeo.attributes.position.array;
    for (let k = 0; k < this.LN; k++) {
      const L = this.lan[k];
      L.a += L.w * dt;
      const h = (L.h + time * L.rise) % 22;
      const y = C.y + 2 + h + Math.sin(time * 0.9 + L.bob) * 0.25;
      const x = C.x + Math.cos(L.a) * L.r;
      const z = C.z + Math.sin(L.a) * L.r;
      const fade = smoothstep(0, 2.5, h) * smoothstep(22, 17, h);
      const s = L.s * fade;
      this.e.set(Math.sin(time + L.bob) * 0.08, L.a, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.set(s, s, s));
      this.lanterns.setMatrixAt(k, this.m);
      hp[k * 3] = x;
      hp[k * 3 + 1] = fade > 0.05 ? y : -100;
      hp[k * 3 + 2] = z;
    }
    this.lanterns.instanceMatrix.needsUpdate = true;
    this.haloGeo.attributes.position.needsUpdate = true;

    const fp = this.flyGeo.attributes.position.array;
    for (let k = 0; k < this.FN; k++) {
      const f = this.flies[k];
      const t = time * f.sp + f.p;
      fp[k * 3] = f.x + Math.sin(t * 0.7) * 1.4 + Math.sin(t * 1.9) * 0.3;
      fp[k * 3 + 1] = f.y + Math.sin(t * 1.1) * 0.6;
      fp[k * 3 + 2] = f.z + Math.cos(t * 0.6) * 1.4;
    }
    this.flyGeo.attributes.position.needsUpdate = true;
  }
}
