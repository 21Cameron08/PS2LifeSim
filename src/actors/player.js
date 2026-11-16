import * as THREE from 'three';
import { CITY } from '../config.js';
import { angleLerp, clamp, damp, lerp } from '../core/rng.js';

export class Player {
  constructor(crowd, city, appearance, spawn) {
    this.crowd = crowd;
    this.city = city;
    this.char = crowd.add(appearance);
    this.pos = new THREE.Vector3(spawn.x, city.groundHeight(spawn.x, spawn.z), spawn.z);
    this.yaw = spawn.yaw;
    this.speed = 0;
    this.moveDir = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.radius = 0.35;
    this.phase = 0;
    this.onStep = null;
    this.locked = false;
  }

  update(dt, input, camYaw, extraPush) {
    const mv = this.locked ? { x: 0, y: 0 } : input.move();
    const running = !this.locked && (input.down('ShiftLeft', 'ShiftRight') || input.autoRun);
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const dx = fx * mv.y - fz * mv.x;
    const dz = fz * mv.y + fx * mv.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    const target = mag * (running ? 7.2 : 3.6);
    this.speed = damp(this.speed, target, target > this.speed ? 8 : 12, dt);
    if (mag > 0.05) {
      this.moveDir.set(dx / mag, dz / mag);
      this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    this.pos.x += this.moveDir.x * this.speed * dt;
    this.pos.z += this.moveDir.y * this.speed * dt;

    this.city.colliders.resolveCircle(this.pos, this.radius, this.pos.y);
    if (extraPush) extraPush(this.pos, this.radius);
    const E = CITY.EDGE - 0.5;
    this.pos.x = clamp(this.pos.x, -E, E);
    this.pos.z = clamp(this.pos.z, -E, E);
    const g = this.city.groundHeight(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, g, 18, dt);

    // animation
    const run = clamp((this.speed - 3.6) / 3.6, 0, 1);
    const stride = lerp(2.2, 3.3, run);
    const before = Math.sin(this.phase);
    this.phase += (this.speed / stride) * Math.PI * 2 * dt;
    const after = Math.sin(this.phase);
    if (this.onStep && this.speed > 0.8 && Math.sign(before) !== Math.sign(after)) this.onStep(run);

    const c = this.char;
    c.x = this.pos.x;
    c.y = this.pos.y;
    c.z = this.pos.z;
    c.ground = g;
    c.yaw = this.yaw;
    c.phase = this.phase;
    c.amount = clamp(this.speed / 3, 0, 1);
    c.run = run;
  }
}

/** Third-person orbit camera with collision, plus title and wardrobe framings. */
export class CameraRig {
  constructor(camera, colliders, city) {
    this.camera = camera;
    this.colliders = colliders;
    this.city = city;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 6.2;
    this.curDist = 6.2;
    this.mode = 'title';
    this.blend = 1;
    this.fromPos = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();
    this.focus = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.lookObj = new THREE.Camera(); // a Camera so lookAt() points -z at the target
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
    this.blend = 0;
    this.mode = mode;
  }

  update(dt, input, player, time) {
    const cam = this.camera;
    const pos = this.tmp;
    if (this.mode === 'title') {
      const a = time * 0.035 + 0.6;
      this.focus.set(20, 22, 20);
      pos.set(20 + Math.sin(a) * 85, 34 + Math.sin(time * 0.05) * 6, 20 + Math.cos(a) * 85);
    } else {
      if (this.mode === 'follow') {
        this.yaw -= input.lookDX * 0.0055;
        this.pitch = clamp(this.pitch + input.lookDY * 0.004, -0.2, 1.15);
        if (input.hit('KeyQ')) this.yaw += Math.PI / 4;
        this.dist = clamp(this.dist + input.wheel * 0.7, 2.5, 14);
        // gently swing behind the player while walking, unless the user is steering the camera
        const idle = performance.now() - input.lastLookTime > 1500;
        if (idle && player.speed > 1) this.yaw = angleLerp(this.yaw, player.yaw, 1 - Math.exp(-0.9 * dt));
        this.focus.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
      } else if (this.mode === 'wardrobe') {
        this.yaw = angleLerp(this.yaw, player.yaw + Math.PI + 0.2, 1 - Math.exp(-6 * dt));
        this.pitch = damp(this.pitch, 0.06, 6, dt);
        // frame the player beside the wardrobe panel (right on desktop, bottom on phones)
        const wide = window.innerWidth > 600;
        const side = wide ? 0.85 : 0;
        this.focus.set(
          player.pos.x - Math.cos(this.yaw) * side,
          player.pos.y + (wide ? 1.1 : 0.55),
          player.pos.z + Math.sin(this.yaw) * side,
        );
      } else if (this.mode === 'talk') {
        this.focus.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
      }
      const want = this.mode === 'wardrobe' ? 3.0 : this.mode === 'talk' ? Math.min(this.dist, 4.2) : this.dist;
      const cp = Math.cos(this.pitch);
      pos.set(
        this.focus.x - Math.sin(this.yaw) * want * cp,
        this.focus.y + Math.sin(this.pitch) * want,
        this.focus.z - Math.cos(this.yaw) * want * cp,
      );
      const t = this.colliders.segment(this.focus, pos, 0.3);
      const d = Math.max(0.6, want * t - 0.2);
      this.curDist = d < this.curDist ? d : damp(this.curDist, d, 3, dt);
      pos.set(
        this.focus.x - Math.sin(this.yaw) * this.curDist * cp,
        this.focus.y + Math.sin(this.pitch) * this.curDist,
        this.focus.z - Math.cos(this.yaw) * this.curDist * cp,
      );
      pos.y = Math.max(pos.y, this.city.groundHeight(pos.x, pos.z) + 0.35);
    }

    this.lookObj.position.copy(pos);
    this.lookObj.lookAt(this.focus);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 1.6);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      cam.position.lerpVectors(this.fromPos, pos, k);
      cam.quaternion.slerpQuaternions(this.fromQuat, this.lookObj.quaternion, k);
    } else {
      cam.position.copy(pos);
      cam.quaternion.copy(this.lookObj.quaternion);
    }
  }
}
