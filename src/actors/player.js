import * as THREE from 'three';
import { CITY } from '../config.js';
import { angleLerp, clamp, damp, lerp } from '../core/rng.js';

/** The outdoor "space": city collision, ground height and map edge. Apartments
 *  provide their own space with the same shape (see world/apartments.js). */
export function citySpace(city) {
  const E = CITY.EDGE - 0.5;
  return {
    indoor: false,
    colliders: city.colliders,
    groundHeight: (x, z) => city.groundHeight(x, z),
    ceiling: Infinity,
    bounds: { x0: -E, x1: E, z0: -E, z1: E },
  };
}

export class Player {
  constructor(crowd, space, appearance, spawn) {
    this.crowd = crowd;
    this.space = space;
    this.char = crowd.add(appearance);
    this.pos = new THREE.Vector3(spawn.x, space.groundHeight(spawn.x, spawn.z), spawn.z);
    this.yaw = spawn.yaw;
    this.speed = 0;
    this.moveDir = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.radius = 0.35;
    this.phase = 0;
    this.onStep = null;
    this.locked = false;
  }

  teleport(space, x, z, yaw) {
    this.space = space;
    this.pos.set(x, space.groundHeight(x, z), z);
    this.yaw = yaw;
    this.speed = 0;
    this.moveDir.set(Math.sin(yaw), Math.cos(yaw));
  }

  update(dt, input, camYaw, extraPush) {
    const mv = this.locked ? { x: 0, y: 0 } : input.move();
    const running = !this.locked && (input.down('ShiftLeft', 'ShiftRight') || input.autoRun);
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const dx = fx * mv.y - fz * mv.x;
    const dz = fz * mv.y + fx * mv.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    const indoor = this.space.indoor;
    const target = mag * (running ? (indoor ? 4.4 : 7.2) : indoor ? 2.5 : 3.6) * (this.slow ?? 1);
    this.speed = damp(this.speed, target, target > this.speed ? 8 : 12, dt);
    if (mag > 0.05) {
      this.moveDir.set(dx / mag, dz / mag);
      this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    this.pos.x += this.moveDir.x * this.speed * dt;
    this.pos.z += this.moveDir.y * this.speed * dt;

    const S = this.space;
    S.colliders.resolveCircle(this.pos, indoor ? 0.28 : this.radius, this.pos.y);
    if (extraPush && !indoor) extraPush(this.pos, this.radius);
    this.pos.x = clamp(this.pos.x, S.bounds.x0, S.bounds.x1);
    this.pos.z = clamp(this.pos.z, S.bounds.z0, S.bounds.z1);
    const g = S.groundHeight(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, g, 18, dt);

    // animation
    const walkSpeed = indoor ? 2.5 : 3.6;
    const run = clamp((this.speed - walkSpeed) / walkSpeed, 0, 1);
    const stride = lerp(indoor ? 1.6 : 2.2, indoor ? 2.4 : 3.3, run);
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
    c.amount = clamp(this.speed / (walkSpeed * 0.85), 0, 1);
    c.run = run;
  }
}

/** Third-person orbit camera with collision, plus title and wardrobe framings. */
export class CameraRig {
  constructor(camera, space) {
    this.camera = camera;
    this.space = space;
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
        const indoor = this.space.indoor;
        this.dist = clamp(this.dist + input.wheel * (indoor ? 0.4 : 0.7), indoor ? 1.4 : 2.5, indoor ? 4.5 : 14);
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
      } else if (this.mode === 'dance') {
        // a slow orbit, like a music video
        this.yaw += dt * 0.16;
        this.pitch = damp(this.pitch, 0.55, 2, dt); // up above the heads of the crowd
        this.focus.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      }
      const want = this.mode === 'wardrobe' ? 3.0 : this.mode === 'talk' ? Math.min(this.dist, 4.2) : this.mode === 'dance' ? 3.1 : this.dist;
      const cp = Math.cos(this.pitch);
      pos.set(
        this.focus.x - Math.sin(this.yaw) * want * cp,
        this.focus.y + Math.sin(this.pitch) * want,
        this.focus.z - Math.cos(this.yaw) * want * cp,
      );
      const indoor = this.space.indoor;
      if (indoor) this.focus.y = Math.min(this.focus.y, this.space.ceiling - 0.35);
      const t = this.space.colliders.segment(this.focus, pos, indoor ? 0.22 : 0.3);
      const d = Math.max(indoor ? 0.35 : 0.6, want * t - (indoor ? 0.12 : 0.2));
      this.curDist = d < this.curDist ? d : damp(this.curDist, d, 3, dt);
      pos.set(
        this.focus.x - Math.sin(this.yaw) * this.curDist * cp,
        this.focus.y + Math.sin(this.pitch) * this.curDist,
        this.focus.z - Math.cos(this.yaw) * this.curDist * cp,
      );
      pos.y = Math.max(pos.y, this.space.groundHeight(pos.x, pos.z) + 0.35);
      pos.y = Math.min(pos.y, this.space.ceiling - 0.12);
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
