import * as THREE from 'three';
import { CITY } from '../config.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { damp, smoothstep } from '../core/rng.js';
import { InteriorKit } from './interior/kit.js';
import { LAYOUTS } from './interior/layouts.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { createInteriorTextures } from '../render/interiorTextures.js';
import { makeCanvas, makeTex } from '../render/textures.js';
import { additive } from '../render/materials.js';

// Builds every apartment interior on its real floor inside its building (so the
// windows show the live street), plus the street doors, floating markers and
// "for lease" signs. Entering/leaving is orchestrated by main.js.

const DOOR_STYLE = {
  starter: { frame: '#c8bfae', door: '#5a2a2a', canopy: null, lamp: true },
  loft: { frame: '#2b3034', door: '#3a4046', canopy: '#2b3034', lamp: true },
  penthouse: { frame: '#1e1e22', door: null, canopy: '#1e1e22', lamp: false },
};

function leaseSign(text, sub, col) {
  const [c, g] = makeCanvas(128, 48);
  g.fillStyle = '#f2efe6';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = col;
  g.fillRect(0, 0, 128, 18);
  g.font = 'bold 13px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.fillText(text, 64, 14);
  g.fillStyle = '#2a2a2a';
  g.font = 'bold 10px Arial, sans-serif';
  g.fillText(sub, 64, 32);
  g.fillText('INQUIRE AT DOOR', 64, 44);
  return makeTex(c, { repeat: false });
}

export class Apartments {
  constructor(scene, city, cityTex) {
    this.scene = scene;
    this.glowTex = cityTex.glow;
    this.tex = createInteriorTextures();
    this.uniforms = makeInteriorUniforms();
    this.list = [];
    this.byId = {};
    this.lampOn = 1;
    this.tvTick = 0;
    const outside = new GeoBuilder();
    const outsideGlow = new GeoBuilder();
    this.markerGeo = new THREE.OctahedronGeometry(0.32, 0);

    for (const [id, L] of Object.entries(LAYOUTS)) {
      const site = city.apartmentSites[id];
      if (!site) continue;
      const cx = (site.x0 + site.x1) / 2;
      // the whole front wall (up to 0.3m thick) must stay behind the facade
      const zFront = site.z1 - 0.34;
      const origin = new THREE.Vector3(cx - L.W / 2, site.floorY, zFront - L.D);
      const kit = new InteriorKit({ origin, W: L.W, D: L.D, H: L.H, tex: this.tex, uniforms: this.uniforms });
      L.build(kit);
      const group = new THREE.Group();
      group.visible = false;
      scene.add(group);
      kit.build(group);

      // ceiling fans spin (they're lit like characters, not baked)
      const fans = kit.fans.map((p) => {
        const b = new GeoBuilder();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const g = new THREE.BoxGeometry(0.62, 0.012, 0.12).translate(0.42, 0, 0).rotateY(a);
          b.addGeometry(g, new THREE.Matrix4(), shade('#7a5a3e'));
        }
        const m = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
        m.position.copy(p);
        group.add(m);
        return m;
      });

      const doorX = site.x0 + 1.4;
      const doorZ = site.z1;
      const apt = {
        id,
        L,
        kit,
        group,
        site,
        fans,
        origin,
        floorY: site.floorY,
        lightsOn: true,
        tvOn: false,
        interactables: kit.interactables,
        fixtures: kit.lights,
        door: { x: doorX, z: doorZ + 1.0, r: 1.7 },
        exit: { x: doorX, z: doorZ + 1.4, yaw: 0 },
        spawn: { x: origin.x + L.spawn.x, z: origin.z + L.spawn.z, yaw: L.spawn.yaw },
        space: {
          indoor: true,
          colliders: kit.colliders,
          groundHeight: () => site.floorY,
          ceiling: site.floorY + L.H,
          bounds: { x0: origin.x + 0.15, x1: origin.x + L.W - 0.15, z0: origin.z + 0.15, z1: origin.z + L.D - 0.15 },
        },
      };
      this.buildDoor(apt, outside, outsideGlow);
      this.buildMarker(apt);
      this.list.push(apt);
      this.byId[id] = apt;
      city.colliders.addC(doorX, doorZ + 0.3, 1.8, 0.55, 0.36); // the front step
    }

    this.outsideMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(outside.build(), this.outsideMat));
    this.outsideGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(outsideGlow.build(), this.outsideGlowMat));
  }

  buildDoor(apt, B, G) {
    const s = DOOR_STYLE[apt.id];
    const x = apt.door.x;
    const z = apt.site.z1;
    const y0 = CITY.CURB;
    const fr = shade(s.frame);
    B.box(x - 0.9, 0, z, x + 0.9, y0 + 0.16, z + 0.55, { color: shade('#a8a49a') });
    B.box(x - 0.78, y0, z, x - 0.62, y0 + 2.75, z + 0.12, { color: fr });
    B.box(x + 0.62, y0, z, x + 0.78, y0 + 2.75, z + 0.12, { color: fr });
    B.box(x - 0.78, y0 + 2.6, z, x + 0.78, y0 + 2.85, z + 0.14, { color: fr, bottom: true });
    if (s.door) {
      B.box(x - 0.6, y0 + 0.16, z, x + 0.6, y0 + 2.6, z + 0.03, { color: shade(s.door) });
      B.box(x - 0.45, y0 + 1.55, z + 0.03, x + 0.45, y0 + 2.4, z + 0.035, { color: shade('#1a2228') });
      B.box(x + 0.42, y0 + 1.05, z + 0.03, x + 0.48, y0 + 1.12, z + 0.09, { color: shade('#c8b070') });
    } else {
      // glass lobby doors, lit from inside
      G.box(x - 0.6, y0 + 0.16, z, x + 0.6, y0 + 2.6, z + 0.02, { color: shade('#f4e2c0', 0.8) });
      B.box(x - 0.01, y0 + 0.16, z, x + 0.01, y0 + 2.6, z + 0.04, { color: fr });
    }
    if (s.canopy) B.box(x - 1.3, y0 + 2.95, z, x + 1.3, y0 + 3.08, z + 1.4, { color: shade(s.canopy), bottom: true });
    if (s.lamp) G.box(x - 0.1, y0 + 2.88, z + 0.12, x + 0.1, y0 + 3.08, z + 0.22, { color: shade('#ffd8a0') });
    else G.box(x - 1.0, y0 + 2.94, z + 0.3, x + 1.0, y0 + 2.95, z + 1.2, { color: shade('#fff0d8', 0.9), top: false, bottom: true });
    // buzzer panel + brass number plate
    B.box(x + 0.82, y0 + 1.2, z, x + 0.98, y0 + 1.55, z + 0.03, { color: shade('#8a8a86') });
    G.box(x + 0.86, y0 + 1.3, z + 0.03, x + 0.94, y0 + 1.48, z + 0.035, { color: shade('#ffd27a', 0.5) });
    B.box(x - 0.98, y0 + 1.8, z, x - 0.84, y0 + 1.95, z + 0.02, { color: shade('#c8b070') });

    if (apt.id !== 'starter') {
      const tex = leaseSign(apt.id === 'loft' ? 'FOR LEASE' : 'NOW LEASING', apt.L.name.toUpperCase(), apt.id === 'loft' ? '#b03a2a' : '#1e2a4a');
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.2, side: THREE.DoubleSide });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), mat);
      sign.position.set(x + 2.1, y0 + 2.2, z + 0.04);
      this.scene.add(sign);
      apt.leaseSign = sign;
      apt.leaseMat = mat;
    }
  }

  buildMarker(apt) {
    const mat = new THREE.MeshBasicMaterial({ color: '#7fd4ff', fog: false });
    const m = new THREE.Mesh(this.markerGeo, mat);
    m.position.set(apt.door.x, CITY.CURB + 3.7, apt.site.z1 + 0.9);
    m.scale.set(1, 1.5, 1);
    this.scene.add(m);
    const glowMat = additive({ map: this.glowTex, color: new THREE.Color('#7fd4ff'), size: 3, points: true, fog: false });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const glow = new THREE.Points(gg, glowMat);
    m.add(glow);
    apt.marker = m;
    apt.markerMat = mat;
    apt.markerGlow = glowMat;
  }

  setHome(id) {
    for (const a of this.list) {
      const home = a.id === id;
      a.markerMat.color.set(home ? '#7dff9a' : '#7fd4ff');
      a.markerGlow.color.set(home ? '#7dff9a' : '#7fd4ff');
      if (a.leaseSign) a.leaseSign.visible = !home;
    }
  }

  show(apt) {
    for (const a of this.list) a.group.visible = a === apt;
    if (apt) this.lampOn = apt.lightsOn ? 1 : 0;
  }

  /** env: Environment, current: apartment the player is in (or null) */
  update(dt, time, env, current) {
    for (const a of this.list) {
      a.marker.rotation.y = time * 1.2;
      a.marker.position.y = CITY.CURB + 3.7 + Math.sin(time * 2 + a.door.x) * 0.15;
      a.marker.visible = !current;
      if (a.leaseMat) a.leaseMat.emissiveIntensity = 0.15 + env.night * 0.6;
    }
    this.outsideGlowMat.color.setScalar(0.7 + env.night * 2.2);
    if (!current) return;
    this.lampOn = damp(this.lampOn, current.lightsOn ? 1 : 0, 10, dt);
    const u = this.uniforms;
    u.uLampOn.value = this.lampOn;
    // daylight through the windows follows the sky
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value
      .copy(env.hemi.color)
      .multiplyScalar(env.hemi.intensity * 0.42)
      .add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.1));
    current.kit.glowMat.color.setScalar(0.35 + this.lampOn * 1.6);
    for (const f of current.fans) f.rotation.y += dt * 4.5;
    if (current.kit.screenMat) {
      this.tvTick -= dt;
      if (this.tvTick <= 0) {
        this.tvTick = 0.1;
        this.tex.tv.draw(time, current.tvOn);
      }
      current.kit.screenMat.color.setScalar(current.tvOn ? 1.6 : 1);
    }
  }

  /** Nearest street door within reach. */
  doorNear(p) {
    for (const a of this.list) if (Math.hypot(p.x - a.door.x, p.z - a.door.z) < a.door.r) return a;
    return null;
  }
}
