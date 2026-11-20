import * as THREE from 'three';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, damp } from '../core/rng.js';
import { InteriorKit, F, C } from './interior/kit.js';
import { makeInteriorUniforms, makeFxUniforms } from './interior/bake.js';
import { additive } from '../render/materials.js';
import { makeCanvas, makeTex } from '../render/textures.js';
import { addGully } from './gullyFigure.js';
import { randomAppearance } from '../actors/appearance.js';

// The Undercurrent: an old cable vault under SUBSTATION that you can only reach
// through the hatch behind the coil, between 3:33 and 3:45 AM. Down here the clock
// stops. The Lantern Quarter's tree has grown through the far wall: its roots glow
// across the floor, its lanterns drift about under the ceiling, and through the
// arch you can see it standing in a violet night that isn't quite this one. The
// music is the club's song, slowed right down and coming from very far away.
//
// It's its own little space (like an apartment), built 30 m under the club.

const W = 11;
const D = 8;
const H = 3.4;

export class Undercurrent {
  constructor(scene, club, crowd, interiorTex, cityTex) {
    this.scene = scene;
    this.origin = new THREE.Vector3(club.origin.x + 4, club.origin.y - 30, club.origin.z + 4);
    this.W = W;
    this.D = D;
    this.H = H;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.uniforms = { ...makeInteriorUniforms(), ...makeFxUniforms() };
    this.uniforms.uLampOn.value = 1;
    this.uniforms.uDayColor.value.setRGB(0, 0, 0);
    this.uniforms.uAmbient.value.setRGB(0.09, 0.06, 0.13);
    this.tex = { ...interiorTex, ...club.ct.kit };
    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.build(kit);
    kit.build(this.group, {}, { fog: false });
    this.fixtures = kit.lights;
    this.buildDynamic(cityTex);
    this.space = {
      indoor: true,
      colliders: kit.colliders,
      groundHeight: () => this.origin.y,
      ceiling: this.origin.y + H,
      bounds: { x0: this.origin.x + 0.2, x1: this.origin.x + W - 0.2, z0: this.origin.z + 0.2, z1: this.origin.z + D - 0.2 },
    };
    // people who are always here
    const rng = new Rng(333);
    const ghostly = (extra) => ({ ...randomAppearance(rng), skin: rng.pick(['#e8d8d0', '#d8c8c8', '#c8b8c0']), top: rng.pick(['#3a3048', '#2a2a3a', '#5a4a6a', '#e8e4dc']), topStyle: 2, jacket: rng.pick(['#2a2236', '#4a3a5a', '#1a1a24']), bottom: '#1a1a24', shoes: '#141418', ...extra });
    this.people = [
      { name: 'Vesper', role: 'bar', app: ghostly({ hair: '#e8e4ec', hairStyle: 1, height: 1.06, top: '#e8e4ec', topStyle: 1 }), spot: { ...this.w(9.9, 3.5), yaw: -Math.PI / 2 } },
      { name: 'The man in the hat', app: ghostly({ hairStyle: 5 }), spot: this.seats[0] },
      { name: 'A woman with lantern eyes', app: ghostly({ hair: '#2a1a3a', hairStyle: 2 }), spot: this.seats[2] },
      { name: 'Someone humming', app: ghostly({ hairStyle: 3, hair: '#8a6aaa' }), spot: { ...this.w(2.2, 6.6), yaw: Math.PI * 0.8 } },
      { name: 'A sleepy raver', app: ghostly({ top: '#c8ff2a', topStyle: 0, hairStyle: 0 }), spot: this.seats[4] },
    ];
    for (const p of this.people) {
      p.c = crowd.add(p.app);
      p.c.visible = false;
      if (p.spot.seat) this.takenSeats.add(p.spot);
    }
    this.inside = false;
  }

  w(x, z, y = 0) {
    return { x: this.origin.x + x, y: this.origin.y + y, z: this.origin.z + z };
  }

  contains(p) {
    return p.x > this.origin.x - 0.5 && p.x < this.origin.x + W + 0.5 && p.z > this.origin.z - 0.5 && p.z < this.origin.z + D + 0.5 && Math.abs(p.y - this.origin.y) < 4;
  }

  build(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const R90 = Math.PI / 2;
    kit.room('vault', 0, 0, W, D, { floor: 'concrete', floorColor: '#3a3440', wall: 'brick', wallColor: '#6a5a6e', ceil: '#1a1420', ceilKey: 'concrete', base: '#141418', trim: '#c8a04a' });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1, open: [{ from: 3.5, to: 7.5, kind: 'opening', y0: 0.0, y1: 2.9, noTrim: true }] });
    kit.wall('x', D, 0, W, { t: 0.3, ext: 1, open: [{ from: 4.8, to: 5.8, kind: 'entry', doorColor: '#3a3a40' }] });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1 });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1 });
    // brick arches over the ceiling, an iron grille in the arch
    for (const x of [2.0, 5.5, 9.0]) P(x, 0).box('solid', -0.15, H - 0.25, 0, 0.15, H, D, C('#4a3a44'), { bottom: true });
    const G = P(5.5, 0.0);
    for (let k = 0; k < 9; k++) G.box('solid', -1.95 + k * 0.49, 0, -0.04, -1.92 + k * 0.49, 2.9, -0.01, C('#1a1a1e'));
    G.box('solid', -2.0, 2.88, -0.05, 2.0, 2.95, 0.0, C('#1a1a1e'));
    // the old switchboard along the west wall: dials and brass levers
    const SB = P(0, 3.0, R90);
    SB.box('solid', -2.2, 0, 0, 2.2, 2.3, 0.35, C('#2a2e2a'));
    for (let k = 0; k < 8; k++) {
      const x = -1.9 + k * 0.54;
      SB.geo('glow', new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), x, 1.7, 0.36, C(k % 3 ? '#ffb85a' : '#7aff9a'), 0, 1, 1, 1, R90);
      SB.geo('glow', new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), x, 1.25, 0.36, C('#ffd88a'), 0, 1, 1, 1, R90);
      SB.box('solid', x - 0.015, 0.6, 0.35, x + 0.015, 0.95, 0.42, C('#c8a04a'));
    }
    SB.collide(-2.2, 0, 2.2, 0.36, 2.3);
    // a corner to sink into: old armchairs, a sagging sofa, a cable drum for a table
    F.rug(P(3.6, 5.0), { w: 3.2, l: 2.4, key: 'rugPersian' });
    F.sofa(P(3.6, D - 0.05, Math.PI), { w: 2.2, col: '#4a2a3a', style: 'old', accent: '#c8a04a' });
    F.armchair(P(2.0, 4.6, R90 * 0.6), { col: '#5a3a2a' });
    F.armchair(P(5.3, 4.6, -R90 * 0.6), { col: '#3a2a4a' });
    const T = P(3.6, 5.3);
    T.geo('solid', new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18), 0, 0.5, 0, C('#6a4a32'));
    T.geo('solid', new THREE.CylinderGeometry(0.22, 0.22, 0.46, 12), 0, 0.23, 0, C('#5a3a2a'));
    T.geo('solid', new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18), 0, 0.03, 0, C('#6a4a32'));
    T.collide(-0.55, -0.55, 0.55, 0.55, 0.55);
    for (const [x, z] of [
      [-0.2, 0.1],
      [0.25, -0.15],
    ]) {
      T.geo('solid', new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8), x, 0.6, z, C('#e8e0d0'));
      T.geo('glow', new THREE.SphereGeometry(0.025, 6, 4), x, 0.68, z, C('#ffc870'));
    }
    T.light(0, 0.9, 0, '#ffb070', 0.45, true);
    this.seats = [];
    this.takenSeats = new Set();
    const seat = (x, z, yaw, outX, outZ) => this.seats.push({ ...this.w(x, z), yaw, out: this.w(outX, outZ), seat: true });
    seat(2.15, 4.45, R90 * 0.6 + Math.PI, 2.6, 5.4); // armchairs face the table
    seat(5.15, 4.45, -R90 * 0.6 + Math.PI, 4.6, 5.4);
    seat(3.1, D - 0.45, Math.PI, 3.1, 6.3); // sofa
    seat(4.1, D - 0.45, Math.PI, 4.1, 6.3);
    seat(3.6, D - 0.45, Math.PI, 3.6, 6.3);
    // the bar: a counter of old cable drums and a brass top, a ghost of a gull on it
    const B = P(9.2, 2.0);
    B.box('solid', 0, 0, 0, 0.6, 1.05, 3.0, C('#4a3a30'));
    B.box('marble', -0.06, 1.05, -0.05, 0.66, 1.1, 3.05, C('#c8a04a'), { bottom: true });
    for (let k = 0; k < 6; k++) B.geo('glass', new THREE.CylinderGeometry(0.04, 0.035, 0.12, 8), 0.3, 1.16, 0.4 + k * 0.4);
    B.collide(-0.06, -0.05, 0.66, 3.05, 1.1);
    addGully(kit.target('solid'), B.m.clone().multiply(trs(0.3, 1.1, 2.6, -R90, 0.16, 0.16, 0.16)), { cap: '#9affd0', band: '#d8fff0', body: '#d8fff0', wing: '#a8f0d8', beak: '#9affd0' });
    P(10.4, 3.5).light(0, 2.4, 0, '#d8a8ff', 0.8, true);
    // old bulkhead lamps on the brick
    for (const [x, z, r] of [
      [0.2, 6.2, R90],
      [W - 0.2, 6.0, -R90],
      [8.0, 0.2, 0],
    ]) {
      const L = P(x, z, r);
      L.box('solid', -0.12, 2.2, 0, 0.12, 2.42, 0.1, C('#2a2a2e'));
      L.box('glow', -0.09, 2.23, 0.1, 0.09, 2.39, 0.106, C('#ffb878'));
      L.light(0, 2.3, 0.4, '#ffa868', 0.6, true);
    }
    // a record player on a crate, playing by itself
    const RP = P(7.4, D - 0.45, Math.PI);
    RP.box('solid', -0.35, 0, -0.3, 0.35, 0.6, 0.3, C('#7a5a3a'));
    RP.box('solid', -0.3, 0.6, -0.25, 0.3, 0.72, 0.25, C('#2a2020'));
    RP.collide(-0.35, -0.3, 0.35, 0.3, 0.75);
    this.recordAt = this.w(7.4, D - 0.45, 0.73);
    // light: candles, the bar, and the violet that comes through the arch (fx channel 0, breathing)
    P(5.5, 1.2).fxLight(0, 1.8, 0, 0, 1.4, { fall: 0.12 });
    P(5.5, 3.6).fxLight(0, 0.3, 0, 0, 0.8, { fall: 0.25 });
    P(2.0, 2.4).light(0, 2.9, 0, '#ff9a5a', 0.3, true);
    this.spots = {
      door: this.w(5.3, D - 0.6),
      spawn: { ...this.w(5.3, D - 0.9), yaw: Math.PI },
      arch: this.w(5.5, 0.9),
      switchboard: this.w(0.75, 3.0),
      record: this.w(7.4, D - 1.1),
      bar: this.w(8.6, 3.5),
    };
  }

  buildDynamic(cityTex) {
    const o = this.origin;
    // the view through the arch: the Lantern Quarter's tree in a night that isn't this one
    const [c, g] = makeCanvas(256, 192);
    const sky = g.createLinearGradient(0, 0, 0, 192);
    sky.addColorStop(0, '#1a0a3a');
    sky.addColorStop(0.6, '#5a2a8a');
    sky.addColorStop(1, '#2a1a4a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 192);
    const rng = new Rng(4444);
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(255, 240, 255, ${rng.float(0.3, 0.9)})`;
      g.fillRect(rng.float(0, 256), rng.float(0, 120), 1.5, 1.5);
    }
    const glow = g.createRadialGradient(128, 110, 4, 128, 110, 110);
    glow.addColorStop(0, 'rgba(255, 220, 255, 0.9)');
    glow.addColorStop(0.3, 'rgba(200, 140, 255, 0.45)');
    glow.addColorStop(1, 'rgba(120, 60, 200, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#140820';
    g.beginPath();
    g.moveTo(112, 192);
    g.quadraticCurveTo(118, 140, 104, 110);
    g.lineTo(124, 120);
    g.quadraticCurveTo(128, 90, 120, 70);
    g.lineTo(136, 90);
    g.quadraticCurveTo(146, 110, 138, 192);
    g.fill();
    g.fillStyle = '#2a1040';
    g.beginPath();
    g.ellipse(128, 70, 70, 42, 0, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 40; k++) {
      g.fillStyle = rng.pick(['#ffe08a', '#ffb0e0', '#b0f0ff']);
      g.beginPath();
      g.arc(rng.float(60, 196), rng.float(30, 110), rng.float(1.2, 2.6), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#0a0414';
    g.fillRect(0, 176, 256, 16);
    const view = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.9), new THREE.MeshBasicMaterial({ map: makeTex(c, { repeat: false }), fog: false }));
    view.position.set(o.x + 5.5, o.y + 1.45, o.z - 0.35);
    this.group.add(view);
    // roots glowing across the floor from the arch
    const rb = new GeoBuilder();
    const rr = new Rng(77);
    for (let k = 0; k < 9; k++) {
      let x = 3.8 + k * 0.42;
      let z = 0.05;
      let a = (k - 4) * 0.18 + rr.float(-0.1, 0.1);
      for (let s = 0; s < 9; s++) {
        const len = rr.float(0.35, 0.7);
        const nx = x + Math.sin(a) * len;
        const nz = z + Math.cos(a) * len;
        const wd = 0.075 * (1 - s / 12);
        const px = Math.cos(a) * wd;
        const pz = -Math.sin(a) * wd;
        rb.quad([o.x + x - px, o.y + 0.008, o.z + z - pz], [o.x + x + px, o.y + 0.008, o.z + z + pz], [o.x + nx + px, o.y + 0.008, o.z + nz + pz], [o.x + nx - px, o.y + 0.008, o.z + nz - pz], [0, 1, 0]);
        x = nx;
        z = nz;
        a += rr.float(-0.45, 0.45);
        if (z > D - 1.5 || x < 0.4 || x > W - 0.4) break;
      }
    }
    this.rootMat = additive({ map: null, color: new THREE.Color('#c88aff'), opacity: 0.8, fog: false });
    const roots = new THREE.Mesh(rb.build(), this.rootMat);
    roots.renderOrder = 2;
    this.group.add(roots);
    // drifting lanterns
    const lb = new GeoBuilder();
    lb.addGeometry(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 8), new THREE.Matrix4(), shade('#ffcf7a'));
    lb.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), new THREE.Matrix4().makeTranslation(0, 0.11, 0), shade('#3a2a1a'));
    const lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.lanterns = new THREE.InstancedMesh(lb.build(), lanternMat, 9);
    this.lanterns.frustumCulled = false;
    this.group.add(this.lanterns);
    this.lanternSeeds = Array.from({ length: 9 }, (_, k) => [rr.float(1, W - 1), rr.float(1, D - 1.5), rr.float(2.0, 3.0), rr.float(0, 6.28), rr.float(0.05, 0.12)]);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9 * 3), 3));
    this.lanternGlowMat = additive({ map: cityTex.glow, color: new THREE.Color('#ffb060'), size: 0.7, points: true, fog: false, opacity: 0.45 });
    this.lanternGlow = new THREE.Points(gg, this.lanternGlowMat);
    this.lanternGlow.frustumCulled = false;
    this.group.add(this.lanternGlow);
    // violet fog low over the floor
    const N = 26;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.fogSeeds = Array.from({ length: N }, () => [rr.float(0.5, W - 0.5), rr.float(0.2, 0.9), rr.float(0.5, D - 0.5), rr.float(0, 6.28)]);
    this.fogMat = additive({ map: cityTex.glow, color: new THREE.Color('#7a3ac8'), size: 4.5, points: true, fog: false, opacity: 0.09 });
    this.fog = new THREE.Points(fg, this.fogMat);
    this.fog.frustumCulled = false;
    this.fog.renderOrder = 3;
    this.group.add(this.fog);
    // the record turns
    this.platter = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 20), new THREE.MeshLambertMaterial({ color: '#141418', emissive: '#100a14' }));
    this.platter.position.set(this.recordAt.x, this.recordAt.y, this.recordAt.z);
    this.group.add(this.platter);
  }

  /** Show it (and its people) or hide it. */
  show(on) {
    this.inside = on;
    this.group.visible = on;
    for (const p of this.people) p.c.visible = on;
  }

  /** The nearest person to talk to. */
  nearest(pos, r = 1.6) {
    let best = null;
    let bd = r;
    for (const p of this.people) {
      const d = Math.hypot(p.c.x - pos.x, p.c.z - pos.z) - (p.role === 'bar' ? 0.6 : 0);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  freeSeats() {
    return this.seats.filter((s) => !this.takenSeats.has(s));
  }

  update(dt, time) {
    if (!this.inside) return;
    const o = this.origin;
    // the arch breathes violet light into the room
    const breathe = 0.6 + 0.4 * Math.sin(time * 0.6);
    this.uniforms.uFx.value[0].setRGB(0.55 * breathe, 0.25 * breathe, 0.95 * breathe);
    this.rootMat.opacity = 0.65 + 0.35 * Math.sin(time * 0.9 + 1.0);
    const m = new THREE.Matrix4();
    const lp = this.lanternGlow.geometry.attributes.position;
    this.lanternSeeds.forEach(([x, z, y, ph, v], k) => {
      const px = o.x + x + Math.sin(time * v + ph) * 1.2;
      const pz = o.z + z + Math.cos(time * v * 0.8 + ph) * 0.9;
      const py = o.y + y + Math.sin(time * 0.5 + ph) * 0.12;
      m.makeRotationY(time * 0.2 + ph).setPosition(px, py, pz);
      this.lanterns.setMatrixAt(k, m);
      lp.setXYZ(k, px, py, pz);
    });
    this.lanterns.instanceMatrix.needsUpdate = true;
    lp.needsUpdate = true;
    const fp = this.fog.geometry.attributes.position;
    this.fogSeeds.forEach(([x, y, z, ph], k) => fp.setXYZ(k, o.x + x + Math.sin(time * 0.07 + ph) * 0.8, o.y + y, o.z + z + Math.cos(time * 0.05 + ph) * 0.6));
    fp.needsUpdate = true;
    this.platter.rotation.y -= dt * 1.8;
    // the regulars of a place that isn't on any map: slow, swaying, always here
    for (const p of this.people) {
      const c = p.c;
      const sp = p.spot;
      c.x = sp.x;
      c.z = sp.z;
      c.ground = this.origin.y;
      c.sit = !!sp.seat;
      c.y = c.sit ? this.origin.y + 0.5 - 0.86 * c.app.height : this.origin.y;
      c.amount = damp(c.amount, 0, 4, dt);
      if (!p.talking) c.yaw = sp.yaw;
      c.dance = p.role === 'bar' || c.sit ? 0 : 0.25;
      c.beat = time * (70 / 60);
      c.move = 2;
      c.nod = c.sit ? 0.06 * Math.sin(time * 0.6 + sp.x) : 0;
      c.talk = !!p.talking;
    }
  }
}
