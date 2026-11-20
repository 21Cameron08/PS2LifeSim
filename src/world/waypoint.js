import * as THREE from 'three';
import { CITY } from '../config.js';
import { clamp } from '../core/rng.js';
import { additive } from '../render/materials.js';

// The route marker: a tall orange light beam you can see over the rooftops, a
// spinning diamond over the door and a ring on the pavement. It fades out as
// you get close so it doesn't sit in your face when you arrive.

const COLOR = '#ffaa4a';

export class Waypoint {
  constructor(scene, tex) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    // an ordinary see-through orange column (it has to show against a bright sky too), with a glowing core
    this.beamMat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 90, 12, 1, true).translate(0, 45, 0), this.beamMat);
    beam.renderOrder = 3;
    this.group.add(beam);
    this.coreMat = additive({ map: null, color: new THREE.Color('#ffd8a0'), opacity: 0.5, fog: false });
    this.coreMat.side = THREE.DoubleSide;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 90, 8, 1, true).translate(0, 45, 0), this.coreMat);
    core.renderOrder = 4;
    this.group.add(core);
    this.diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), new THREE.MeshBasicMaterial({ color: COLOR, fog: false }));
    this.diamond.scale.set(1, 1.5, 1);
    this.group.add(this.diamond);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.glowMat = additive({ map: tex.glow, color: new THREE.Color(COLOR), size: 3.2, points: true, fog: false });
    this.diamond.add(new THREE.Points(gg, this.glowMat));
    this.ringMat = additive({ map: null, color: new THREE.Color(COLOR), opacity: 0.6 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 40).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.05;
    this.ring.renderOrder = 2;
    this.group.add(this.ring);
    this.at = null;
  }

  /** at: { x, z } or null */
  set(at) {
    this.at = at;
    this.group.visible = !!at;
    if (at) this.group.position.set(at.x, CITY.CURB, at.z);
  }

  update(time, playerPos) {
    if (!this.at) return;
    const d = Math.hypot(playerPos.x - this.at.x, playerPos.z - this.at.z);
    const far = clamp((d - 8) / 30, 0, 1);
    this.beamMat.opacity = 0.06 + 0.32 * far;
    this.coreMat.opacity = 0.1 + 0.45 * far;
    this.diamond.rotation.y = time * 1.6;
    this.diamond.position.y = 4.2 + Math.sin(time * 2.2) * 0.18;
    const pulse = (time * 0.8) % 1;
    this.ring.scale.setScalar(0.8 + pulse * 0.6);
    this.ringMat.opacity = 0.7 * (1 - pulse);
  }
}
