import * as THREE from 'three';
import { CITY, CLUB_SITE } from '../config.js';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, clamp, damp, lerp, smoothstep } from '../core/rng.js';
import { InteriorKit, F, C } from './interior/kit.js';
import { makeInteriorUniforms, makeFxUniforms } from './interior/bake.js';
import { createClubTextures, signUV } from '../render/clubTextures.js';
import { additive } from '../render/materials.js';
import { BPM, sectionAt } from '../audio/clubTrack.js';
import { NIGHTS } from '../game/clubNights.js';
import { makeCanvas, makeTex } from '../render/textures.js';

// SUBSTATION: a nightclub in a decommissioned 1950s power substation in Ember Row,
// across the road from the Lantern Quarter. Like HALCYON 24 it's part of the
// street, not a loading screen: you queue on the pavement, pay the bouncer, and
// walk through the lobby's strip curtain into one tall concrete hall.
//
// Local coordinates: x along the street facade (0..W, west to east), z from the
// back wall (0) to the street wall (D), y up from the floor.
//
// Lighting is the PS2 trick from the apartments (baked vertex light) plus four
// colour channels baked the same way and recoloured every frame (bake.js: aFx):
//   0 house lights (work lights; dim during the night, full at 4 AM "lights up")
//   1 stage wash, west half    2 stage wash, east half    3 LED floor + coil glow

const W = 23.4;
const D = 17.4;
const H = 7.0;
const FRONT = 14.0; // the lobby strip starts here
const LOBBY_H = 3.2;
const DOOR = [5.6, 7.6];
const ARCH = [9.2, 11.8];
const TILE = 0.9;
const FLOOR = { x0: 8.1, z0: 3.6, n: 8 };
const ROOF = 8.0; // top of the concrete shell above the club floor
const COIL = { x: 11.7, y: 4.7 };

// colour scenes for the washes come from tonight's theme (game/clubNights.js); a new one every 8 bars
const toPalettes = (night) => night.palettes.map((p) => p.map((h) => new THREE.Color(h)));

const ROOF_DECK = ROOF + 0.36; // the terrace decking
const ROOF_DECK_Z = 8.6;
const FE_RISE = (ROOF_DECK - 3.6) / 14; // fire escape: 14 steps from the landing to the roof
const FE_RUN = (21.7 - 15.9) / 14;

const OPEN_H = 22; // 10 PM
const CLOSE_H = 4; // lights up
const LOCK_H = 4.5; // everyone out, doors locked

export class Club {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.clubSite;
    this.site = site;
    this.origin = new THREE.Vector3(site.x0 + 0.3, CITY.CURB + CLUB_SITE.floorLift, site.z0 + 0.3);
    this.W = W;
    this.D = D;
    this.H = H;
    this.rng = new Rng(9090);
    this.ct = createClubTextures();
    this.cityTex = cityTex;
    this.group = new THREE.Group(); // the interior: only drawn when you're close
    this.outside = new THREE.Group(); // the shell, signs, cart: always drawn
    scene.add(this.group, this.outside);

    this.uniforms = { ...makeInteriorUniforms(), ...makeFxUniforms() };
    this.uniforms.uLampOn.value = 1;
    this.uniforms.uDayColor.value.setRGB(0, 0, 0);
    this.uniforms.uAmbient.value.setRGB(0.02, 0.02, 0.026);
    this.tex = { ...interiorTex, ...this.ct.kit };

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.dyn = []; // LED strips etc. whose colour follows the lights: { mat, ch, k }
    this.buildInterior(kit);
    kit.build(this.group, { stickers: { alphaTest: 0.5 } }, { fog: true });
    for (const b of kit.colliders.boxes) {
      const nb = city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
      if (Math.abs(b.x0 - (this.origin.x + 19.4)) < 0.01 && Math.abs(b.z0 - (this.origin.z + 12.8)) < 0.01) this.barFlap = nb;
    }
    this.barFlapTop = this.barFlap?.y1 ?? 1.1;
    this.buildEffects();
    this.buildExterior();
    this.buildDoors();

    // state
    this.beat = 0;
    this.section = sectionAt(0);
    this.status = 'closed';
    this.lightsUp = 0; // 0..1, house lights at the end of the night
    this.flash = 'reduced';
    this.kick = 0;
    this.wash = [new THREE.Color(), new THREE.Color()];
    this.floorCol = new THREE.Color();
    this.doorOpen = 0;
    this.allowPlayer = false;
    this.setNight(NIGHTS.house);
  }

  /** Tonight's theme: wash colours, floor patterns, strobes, lasers, the TONIGHT sign by the door. */
  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    this.palettes = toPalettes(night);
    const g = this.tonightG;
    if (!g) return;
    g.fillStyle = '#0a0a0e';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = night.sign[0];
    g.lineWidth = 3;
    g.strokeRect(4, 4, 248, 88);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#d8d8e0';
    g.font = 'bold 13px Arial, sans-serif';
    g.fillText('T O N I G H T', 128, 19);
    g.shadowColor = night.sign[0];
    g.shadowBlur = 10;
    g.fillStyle = night.sign[0];
    g.font = `bold ${night.name.length > 9 ? 26 : 32}px "Arial Black", Impact, sans-serif`;
    g.fillText(night.name, 128, 49, 236);
    g.shadowBlur = 0;
    g.fillStyle = night.sign[1];
    g.font = 'bold 12px Arial, sans-serif';
    g.fillText(`${night.blurb.toUpperCase()} · $${night.cover}`, 128, 78, 236);
    this.tonightTex.needsUpdate = true;
  }

  /** Lift the flap at the end of the bar (staff only). */
  setBarFlap(open) {
    if (this.barFlap) this.barFlap.y1 = open ? -10 : this.barFlapTop;
  }

  /** OVERLOAD: confetti cannons when the drop lands. */
  confettiBurst() {
    this.confettiT = 0;
    this.confetti.visible = true;
  }

  /** local -> world */
  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  local(p) {
    return { x: p.x - this.origin.x, z: p.z - this.origin.z };
  }

  contains(p, pad = 0) {
    const { x, z } = this.local(p);
    return x > -pad && x < W + pad && z > -pad && z < D + pad && p.y < this.origin.y + ROOF;
  }

  zoneAt(p) {
    const { x, z } = this.local(p);
    const y = p.y - this.origin.y;
    if (x < -0.3 || x > W + 0.3 || z < -0.3 || z > D + 0.3) return null;
    if (y > ROOF - 0.5) return 'roof';
    if (x < 0 || x > W || z < 0 || z > D) return null;
    if (z >= FRONT && y > 3.0) return x < 17.6 ? 'vip' : 'stairs';
    if (z >= FRONT) return x < 3.6 ? 'coat' : x < 17.6 ? 'lobby' : 'stairs';
    if (x > 18.4 && z < 5.4) return 'toilets';
    if (x < 5.0 && z < 4.2) return 'green';
    return 'hall';
  }

  ceilingAt(p) {
    const z = this.zoneAt(p);
    const h = z === 'coat' || z === 'lobby' ? LOBBY_H : z === 'stairs' ? 6.0 : z === 'toilets' || z === 'green' ? 3.0 : z === 'roof' ? Infinity : H;
    return this.origin.y + h;
  }

  /**
   * The club has floors at several heights: the stairs, the landing and walkway, the
   * VIP balcony over the lobby, the fire escape and the roof. Given where the player's
   * feet are now (yHint), pick the highest surface they could be standing on.
   */
  groundAt(wx, wz, yHint, base) {
    const o = this.origin;
    const x = wx - o.x;
    const z = wz - o.z;
    if (x < -0.4 || x > W + 0.4 || z < -0.4 || z > D + 1.6) return base;
    const reach = yHint - o.y + 0.45;
    let best = base - o.y;
    const take = (h) => {
      if (h <= reach && h > best) best = h;
    };
    const inR = (x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    // lobby stairs: 14 steps up to the landing
    if (inR(17.9, 22.1, 15.9, D)) take(Math.min(14, Math.floor((x - 17.9) / 0.3) + 1) * (3.6 / 14));
    if (inR(22.1, W, FRONT, D) || inR(22.35, 23.25, D, D + 0.3)) take(3.6); // landing and its street door
    if (inR(17.5, 22.1, FRONT + 0.1, 15.6)) take(3.6); // walkway to the VIP door
    if (inR(3.6, 17.6, FRONT + 0.12, D)) take(3.6); // VIP balcony
    // fire escape on the facade, outside the street wall
    const fz0 = D + 0.3;
    if (inR(21.7, 23.6, fz0, fz0 + 1.15)) take(3.6);
    if (inR(15.9, 21.7, fz0 + 0.05, fz0 + 1.1)) take(3.6 + Math.min(14, Math.floor((21.7 - x) / FE_RUN) + 1) * FE_RISE);
    if (inR(14.9, 15.9, D - 0.1, fz0 + 1.1)) take(ROOF_DECK);
    // the roof, and the terrace deck on its front half
    if (inR(-0.3, W + 0.3, -0.3, D + 0.3)) take(inR(-0.05, W + 0.05, ROOF_DECK_Z, D + 0.05) ? ROOF_DECK : ROOF + 0.32);
    return o.y + best;
  }

  /** Is p standing on the LED dance floor? */
  onFloor(p) {
    const { x, z } = this.local(p);
    return p.y < this.origin.y + 1 && x > FLOOR.x0 - 0.2 && x < FLOOR.x0 + FLOOR.n * TILE + 0.2 && z > FLOOR.z0 - 0.2 && z < FLOOR.z0 + FLOOR.n * TILE + 0.2;
  }

  /** Is p up on the fire escape or the roof? */
  aloft(p) {
    return this.zoneAt(p) === 'roof' || (p.y > this.origin.y + 3 && Math.abs(p.z - (this.origin.z + D + 0.85)) < 0.9 && p.x > this.origin.x + 14.5 && p.x < this.origin.x + W + 0.3);
  }

  /** 'open' 10 PM - 4 AM, 'lightsup' 4 - 4:30 AM, otherwise 'closed' */
  statusAt(hour) {
    if (hour >= OPEN_H || hour < CLOSE_H) return 'open';
    if (hour < LOCK_H) return 'lightsup';
    return 'closed';
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const R90 = Math.PI / 2;
    const PI = Math.PI;
    const BLACK = '#141418';

    // ---------------------------------------------------------------- rooms
    const hall = {
      floor: 'concrete',
      floorColor: '#6a6a72',
      wall: 'concrete',
      wallColor: '#8a8a92',
      ceil: '#202026',
      ceilKey: 'concrete',
      base: null,
      trim: '#2a2a30',
      wainscot: { key: 'solid', h: 1.15, color: '#1c1c22', cap: '#c8a02a' },
      zone: 'hall',
    };
    kit.room('hall', 5.0, 0, 18.4, FRONT, hall);
    kit.room('lounge', 0, 4.2, 5.0, FRONT, { ...hall, floor: 'carpet', floorColor: '#5a2a3e' });
    kit.room('bar', 18.4, 5.4, W, FRONT, hall);
    const lobbyF = { floor: 'vct', floorColor: '#6a5a72', wall: 'plaster', wallColor: '#3a2c48', ceil: '#141018', ceilKey: 'solid', base: '#141418', trim: '#c8a02a', h: LOBBY_H };
    kit.room('lobby', 3.6, FRONT, 17.6, D, lobbyF);
    kit.room('coat', 0, FRONT, 3.6, D, { floor: 'woodWorn', wall: 'plaster', wallColor: '#8a2a3e', ceil: '#2a1a20', base: '#2a1a1a', trim: '#5a3a2a', h: LOBBY_H });
    kit.room('stairs', 17.6, FRONT, W, D, { floor: 'concrete', floorColor: '#5a5a62', wall: 'solid', wallColor: '#4a161c', ceil: '#1a0a0c', ceilKey: 'solid', base: BLACK, trim: '#c8a02a', h: 6.0 });
    // the VIP balcony over the lobby: its floor is the lobby's ceiling, it's open to the hall
    kit.room('vip', 3.66, FRONT + 0.125, 17.54, D, {
      y0: 3.6,
      floor: 'herringbone',
      floorColor: '#8a5a3e',
      wall: 'plaster',
      wallColor: '#3a2034',
      wainscot: { key: 'wood', h: 1.05, color: '#4a2c1c', cap: '#c8a04a' },
      ceil: '#120e14',
      ceilKey: 'solid',
      base: BLACK,
      trim: '#c8a04a',
      zone: 'hall',
    });
    kit.room('green', 0, 0, 5.0, 4.2, { floor: 'carpet', floorColor: '#3a2a30', wall: 'plaster', wallColor: '#4a3a46', ceil: '#2a2026', ceilKey: 'solid', base: BLACK, trim: '#c8a04a', h: 3.0 });
    kit.room('toilets', 18.4, 0, W, 5.4, {
      floor: 'penny',
      floorColor: '#7a8a84',
      wall: 'plaster',
      wallColor: '#3a4a44',
      wainscot: { key: 'subway', h: 1.6, color: '#6aa08a', cap: BLACK },
      ceil: '#d8dcd8',
      ceilKey: 'ceilTile',
      base: BLACK,
      trim: BLACK,
      h: 3.0,
    });

    // ---------------------------------------------------------------- walls
    kit.wall('x', D, 0, W, {
      t: 0.3,
      ext: 1,
      open: [
        { from: DOOR[0], to: DOOR[1], kind: 'opening', y1: 2.6, trim: '#2a2a2e' },
        { from: 22.35, to: 23.25, kind: 'opening', y0: 3.6, y1: 5.7, trim: '#c8a02a' }, // out to the fire escape
      ],
    });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1 });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1 });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1 });
    // the hall's front wall: the arch from the lobby, and the balcony's big opening above it
    kit.wall('x', FRONT, 0, W, {
      t: 0.25,
      open: [
        { from: 4.0, to: ARCH[0], kind: 'opening', y0: 3.6, y1: 6.6, noTrim: true },
        { from: ARCH[0], to: ARCH[1], gaps: [{ y0: 0, y1: 2.7, trim: '#c8a02a' }, { y0: 3.6, y1: 6.6, noTrim: true }] },
        { from: ARCH[1], to: 17.2, kind: 'opening', y0: 3.6, y1: 6.6, noTrim: true },
      ],
    });
    kit.wall('z', 3.6, FRONT, D, { open: [{ from: 14.5, to: 16.9, kind: 'opening', y0: 0.98, y1: 2.2, trim: '#5a3a2a' }] });
    kit.wall('z', 17.6, FRONT, D, {
      open: [
        { from: 14.2, to: 15.4, kind: 'opening', y0: 3.6, y1: 5.7, trim: '#c8a02a' },
        { from: 15.95, to: 17.15, kind: 'opening', y1: 2.3, trim: '#c8a02a' },
      ],
    });
    kit.wall('x', 5.4, 18.4, W, { open: [{ from: 18.75, to: 19.65, swing: -1, doorColor: '#2a3a34' }] });
    kit.wall('z', 18.4, 0, 5.4);
    kit.wall('z', 5.0, 0, 4.2, { open: [{ from: 2.9, to: 3.8, kind: 'entry', doorColor: '#2a2a2e' }] });
    kit.wall('x', 4.2, 0, 5.0);

    // ---------------------------------------------------------------- light
    // house lights: big work lamps up in the roof
    for (const x of [2.5, 8.5, 14.5, 20.5]) for (const z of [3.2, 10.2]) P(x, z).fxLight(0, 6.6, 0, 0, 0.55, { down: true, fall: 0.1 });
    // stage washes from the truss, and the lounge / bar ends of the room
    for (const [x, z, ch] of [
      [8.0, 4.4, 1],
      [8.0, 10.0, 1],
      [2.6, 9.0, 1],
      [11.7, 1.0, 1],
      [15.4, 4.4, 2],
      [15.4, 10.0, 2],
      [20.6, 9.0, 2],
      [11.7, 12.6, 2],
    ])
      P(x, z).fxLight(0, ch === 1 && x < 5 ? 3.2 : 5.6, 0, ch, x < 5 || x > 18 ? 0.7 : 1.1, { fall: 0.09 });
    // the LED floor lights things from below; the coil ring lights the back wall
    for (const x of [9.9, 13.5]) for (const z of [5.4, 9.0]) P(x, z).fxLight(0, 0.25, 0, 3, 0.5, { fall: 0.3 });
    P(COIL.x, 0.6).fxLight(0, COIL.y, 0, 3, 0.6, { fall: 0.4 });

    // practical lamps (always on): bar, booths, lobby, coat check, stairs, toilets
    for (const z of [7.2, 9.4, 11.6]) {
      const L = P(19.8, z);
      L.box('solid', -0.008, 2.6, -0.008, 0.008, H, 0.008, C('#1a1a1a'));
      L.geo('solid', new THREE.ConeGeometry(0.18, 0.22, 10, 1, true), 0, 2.5, 0, C('#2a2a2e'));
      L.box('glow', -0.07, 2.385, -0.07, 0.07, 2.39, 0.07, C('#ffd08a'), { top: false, bottom: true });
      L.light(0, 2.3, 0, '#ffb060', 0.55, true);
    }
    for (const z of [5.8, 9.0, 12.2]) {
      const L = P(1.15, z);
      L.box('solid', -0.008, 2.0, -0.008, 0.008, H, 0.008, C('#1a1a1a'));
      L.geo('solid', new THREE.SphereGeometry(0.16, 10, 6, 0, PI * 2, 0, PI / 2), 0, 1.86, 0, C('#8a2a3e'));
      L.box('glow', -0.06, 1.855, -0.06, 0.06, 1.86, 0.06, C('#ffb878'), { top: false, bottom: true });
      L.light(0, 1.75, 0, '#ff9a5a', 0.45, true);
    }
    for (const x of [5.0, 7.6, 10.2, 12.8, 15.4]) P(x, 15.7).light(0, 2.9, 0, x < 6 ? '#ffc890' : '#d060ff', 0.75, true);
    P(6.0, 14.6).light(0, 2.6, 0, '#ffd8b0', 0.5, true); // over the posters
    P(1.8, 15.7).light(0, 2.9, 0, '#ffd8a0', 0.6, true);
    P(20.2, 15.8).light(0, 5.6, 0, '#ff2a2a', 0.85, true);
    P(18.4, 16.5).light(0, 2.4, 0, '#ff3a3a', 0.45, true);
    P(20.9, 2.7).light(0, 2.8, 0, '#e8f6ff', 0.8, true);
    P(22.9, 9.4).light(0, 1.8, 0, '#ffb04a', 0.45);
    P(11.7, 1.8).light(0, 2.6, 0, '#fff0d0', 0.25, true);

    this.buildHall(kit, P, R90, PI, BLACK);
    this.buildGreenRoom(kit, P, R90, PI, BLACK);
    this.buildFront(kit, P, R90, PI, BLACK);
    this.buildToilets(kit, P, R90, PI, BLACK);
    this.buildVip(kit, P, R90, PI, BLACK);
  }

  buildHall(kit, P, R90, PI, BLACK) {
    // --- steel roof beams and cable trays
    for (const z of [1.8, 5.3, 8.8, 12.3]) P(0, z).box('solid', 0, 6.62, -0.12, W, 6.98, 0.12, C('#2a2a30'), { bottom: true });
    for (const z of [0.14, 13.83]) {
      const T = P(5.2, z);
      T.box('solid', 0, 6.1, -0.06, 13.0, 6.14, 0.06, C('#8a8c90'), { bottom: true });
      for (let k = 0; k < 4; k++) T.geo('solid', new THREE.CylinderGeometry(0.025, 0.025, 13.0, 5), 6.5, 6.17, -0.04 + k * 0.027, C('#141414'), 0, 1, 1, 1, 0, PI / 2);
    }

    // --- the LED dance floor's frame (tiles are instanced, see buildEffects)
    const fx1 = FLOOR.x0 + FLOOR.n * TILE;
    const fz1 = FLOOR.z0 + FLOOR.n * TILE;
    P(0, 0).box('solid', FLOOR.x0 - 0.05, 0, FLOOR.z0 - 0.05, fx1 + 0.05, 0.012, fz1 + 0.05, C('#0a0a0c'));
    for (const [x0, z0, x1, z1] of [
      [FLOOR.x0 - 0.12, FLOOR.z0 - 0.12, fx1 + 0.12, FLOOR.z0 - 0.05],
      [FLOOR.x0 - 0.12, fz1 + 0.05, fx1 + 0.12, fz1 + 0.12],
      [FLOOR.x0 - 0.12, FLOOR.z0 - 0.05, FLOOR.x0 - 0.05, fz1 + 0.05],
      [fx1 + 0.05, FLOOR.z0 - 0.05, fx1 + 0.12, fz1 + 0.05],
    ])
      P(0, 0).box('solid', x0, 0, z0, x1, 0.03, z1, C('#9a9ca0'));

    // --- DJ booth: an old transformer housing with cooling fins
    const DJ = P(11.7, 0);
    DJ.box('solid', -3.0, 0, 0.3, 3.0, 0.9, 2.6, C('#3a4a44'));
    for (let k = 0; k < 13; k++) DJ.box('solid', -2.88 + k * 0.48, 0.06, 2.6, -2.8 + k * 0.48, 0.86, 2.68, C('#2a3632'));
    DJ.box('hazard', -3.0, 0.9, 2.52, 3.0, 0.95, 2.62, C('#ffffff'), { bottom: true });
    DJ.collide(-3.05, 0.3, 3.05, 2.7, 0.95);
    // decks table, turntables, mixer, laptop
    DJ.box('solid', -1.5, 0.9, 1.45, 1.5, 1.82, 2.15, C('#1a1a1e'));
    DJ.box('solid', -1.55, 1.82, 1.4, 1.55, 1.86, 2.2, C('#2a2a30'), { bottom: true });
    for (const x of [-0.9, 0.9]) {
      DJ.box('solid', x - 0.32, 1.86, 1.48, x + 0.32, 1.92, 2.08, C('#3a3a40'));
      DJ.geo('solid', new THREE.CylinderGeometry(0.25, 0.25, 0.02, 18), x - 0.03, 1.93, 1.78, C('#101012'));
      DJ.geo('solid', new THREE.CylinderGeometry(0.06, 0.06, 0.022, 10), x - 0.03, 1.935, 1.78, C('#d83a3a'));
      DJ.box('solid', x + 0.2, 1.92, 1.56, x + 0.24, 1.95, 1.9, C('#c8ccd0'));
    }
    DJ.box('solid', -0.3, 1.86, 1.5, 0.3, 1.94, 2.06, C('#2a2a30'));
    for (let k = 0; k < 12; k++) DJ.box('glow', -0.24 + (k % 4) * 0.16, 1.94, 1.58 + Math.floor(k / 4) * 0.14, -0.2 + (k % 4) * 0.16, 1.945, 1.62 + Math.floor(k / 4) * 0.14, C(['#3aff6a', '#ffd23a', '#ff3a3a'][k % 3]));
    DJ.box('solid', 1.35, 1.86, 1.0, 1.75, 1.88, 1.3, C('#c8ccd0'));
    DJ.box('glow', 1.37, 1.88, 1.02, 1.73, 2.08, 1.025, C('#8ab8ff', 0.8));

    // --- the coil: a huge copper ring on the back wall, with a glowing core (dynamic)
    const coil = P(COIL.x, 0);
    coil.geo('solid', new THREE.TorusGeometry(1.7, 0.2, 8, 40), 0, COIL.y, 0.32, C('#b0683a'));
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * PI * 2;
      coil.box('solid', Math.cos(a) * 1.7 - 0.03, COIL.y + Math.sin(a) * 1.7 - 0.03, 0.08, Math.cos(a) * 1.7 + 0.03, COIL.y + Math.sin(a) * 1.7 + 0.03, 0.14, C('#4a3020'));
    }
    // insulator stacks either side: stacked ceramic sheds with copper caps
    for (const x of [-4.1, 4.1]) {
      const I = P(COIL.x + x, 0.7);
      I.box('solid', -0.45, 0, -0.45, 0.45, 0.35, 0.45, C('#3a4a44'));
      for (let k = 0; k < 9; k++) I.geo('solid', new THREE.CylinderGeometry(k % 2 ? 0.26 : 0.42, k % 2 ? 0.26 : 0.42, 0.26, 14), 0, 0.48 + k * 0.26, 0, C(k % 2 ? '#7a4a2a' : '#e8e2d4'));
      I.geo('solid', new THREE.CylinderGeometry(0.2, 0.3, 0.3, 12), 0, 2.85, 0, C('#b0683a'));
      I.geo('glow', new THREE.TorusGeometry(0.33, 0.035, 6, 20), 0, 2.72, 0, C('#5ab8ff'), 0, 1, 1, 1, PI / 2);
      I.collide(-0.46, -0.46, 0.46, 0.46, 3.0);
      I.light(0, 3.1, 0.5, '#4ab0ff', 0.3);
    }

    // --- speaker stacks (cones are a separate mesh so they can pump)
    this.coneSpots = [];
    for (const x of [6.1, 17.3]) {
      const S = P(x, 0.3);
      S.box('solid', -0.95, 0, 0, 0.95, 1.2, 1.2, C('#18181a'));
      S.box('solid', -0.85, 1.2, 0.1, 0.85, 2.6, 1.15, C('#1c1c1f'));
      S.box('solid', -0.6, 2.6, 0.2, 0.6, 3.2, 1.05, C('#18181a'));
      S.collide(-0.96, 0, 0.96, 1.21, 3.2);
      for (const sx of [-0.45, 0.45]) this.coneSpots.push({ x: x + sx, y: 0.6, z: 1.5, r: 0.38 });
      for (const sx of [-0.4, 0.4]) this.coneSpots.push({ x: x + sx, y: 1.7, z: 1.45, r: 0.2 });
      this.coneSpots.push({ x, y: 2.3, z: 1.45, r: 0.13 });
      this.coneSpots.push({ x, y: 2.9, z: 1.35, r: 0.15 });
    }

    // --- truss around the dance floor, hung on chains
    const tx0 = FLOOR.x0 - 0.2;
    const tz0 = FLOOR.z0 - 0.2;
    const tx1 = fx1 + 0.2;
    const tz1 = fz1 + 0.2;
    const TY = 5.6;
    const truss = P(0, 0);
    const grey = C('#a8aab0');
    for (const [x0, z0, x1, z1] of [
      [tx0 - 0.15, tz0 - 0.15, tx1 + 0.15, tz0 + 0.15],
      [tx0 - 0.15, tz1 - 0.15, tx1 + 0.15, tz1 + 0.15],
      [tx0 - 0.15, tz0 + 0.15, tx0 + 0.15, tz1 - 0.15],
      [tx1 - 0.15, tz0 + 0.15, tx1 + 0.15, tz1 - 0.15],
    ]) {
      truss.box('solid', x0, TY + 0.26, z0, x1, TY + 0.3, z1, grey, { bottom: true });
      truss.box('solid', x0, TY - 0.3, z0, x1, TY - 0.26, z1, grey, { bottom: true });
    }
    for (const [x, z] of [
      [tx0, tz0],
      [tx1, tz0],
      [tx0, tz1],
      [tx1, tz1],
    ])
      truss.box('solid', x - 0.02, TY + 0.3, z - 0.02, x + 0.02, H, z + 0.02, C('#5a5a60'));
    this.truss = { tx0, tz0, tx1, tz1, y: TY };

    // --- mirror ball rod (the ball itself is in buildEffects)
    P(COIL.x, (FLOOR.z0 + fz1) / 2).box('solid', -0.015, 5.35, -0.015, 0.015, H, 0.015, C('#5a5a60'));

    // --- columns with hazard-striped feet, high tables around them
    for (const [x, z] of [
      [6.6, 3.2],
      [16.8, 3.2],
      [6.6, 11.6],
      [16.8, 11.6],
    ]) {
      const Cn = P(x, z);
      Cn.box('solid', -0.18, 0.9, -0.18, 0.18, H, 0.18, C('#2a2a30'));
      Cn.box('hazard', -0.19, 0, -0.19, 0.19, 0.9, 0.19, C('#ffffff'));
      Cn.collide(-0.2, -0.2, 0.2, 0.2, H);
    }
    P(6.6, 3.2).panel('clubSigns', -0.18, 2.0, 0.18, 2.05, 0.196, signUV(6));
    for (const [x, z] of [
      [6.4, 7.3],
      [17.0, 7.3],
      [13.9, 12.7],
      [5.9, 12.9],
    ]) {
      const T = P(x, z);
      T.geo('solid', new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), 0, 1.06, 0, C('#2a2a30'));
      T.geo('solid', new THREE.CylinderGeometry(0.04, 0.04, 1.04, 8), 0, 0.53, 0, C('#8a8c90'));
      T.geo('solid', new THREE.CylinderGeometry(0.26, 0.28, 0.03, 14), 0, 0.015, 0, C('#2a2a30'));
      T.collide(-0.3, -0.3, 0.3, 0.3, 1.08);
      T.shadow(-0.3, -0.3, 0.3, 0.3, 0.3);
    }

    // --- the bar
    const B = P(0, 0);
    B.box('solid', 19.4, 0, 6.0, 20.2, 1.1, 12.8, C('#141418'));
    B.box('marble', 19.28, 1.1, 5.95, 20.3, 1.16, 12.85, C('#5a5a64'), { bottom: true });
    for (let k = 0; k < 9; k++) B.box('solid', 19.394, 0.12, 6.2 + k * 0.74, 19.4, 0.95, 6.5 + k * 0.74, C('#2a2a30'));
    B.geo('solid', new THREE.CylinderGeometry(0.025, 0.025, 6.6, 6), 19.2, 0.22, 9.4, C('#c8a04a'), 0, 1, 1, 1, PI / 2);
    for (const z of [6.4, 12.4]) B.box('solid', 19.18, 0, z - 0.02, 19.24, 0.25, z + 0.02, C('#c8a04a'));
    B.collide(19.15, 5.95, 20.3, 12.85, 1.16);
    B.shadow(19.15, 6.0, 20.3, 12.8, 0.4);
    // beer taps
    for (const z of [8.6, 8.9, 9.2, 9.5]) {
      B.box('solid', 19.85, 1.16, z - 0.03, 19.91, 1.42, z + 0.03, C('#c8ccd0'));
      B.box('solid', 19.83, 1.42, z - 0.02, 19.93, 1.56, z + 0.02, C(['#d83a3a', '#2a2a30', '#e8c060', '#3a8aff'][Math.round((z - 8.6) / 0.3)]));
    }
    // a hinged flap closes the bartenders' end
    B.box('solid', 19.4, 0, 12.85, 20.2, 1.1, 12.95, C('#2a2a30'));
    B.collide(19.4, 12.8, 23.4, 13.6, 1.1);
    // back bar: counter, glass shelves, bottles, backlight
    B.box('solid', 22.75, 0, 6.2, W, 0.95, 12.6, C('#1a1a1e'));
    B.box('solid', 22.7, 0.95, 6.15, W, 1.0, 12.65, C('#3a3a40'), { bottom: true });
    B.box('glow', W - 0.012, 1.1, 6.4, W - 0.006, 2.5, 12.4, C('#ffa040', 0.55));
    B.collide(22.7, 6.15, W, 12.65, 2.5);
    const rng = new Rng(55);
    for (const y of [1.25, 1.7, 2.15]) {
      B.box('glass', 22.85, y - 0.015, 6.4, W - 0.02, y, 12.4);
      for (let z = 6.5; z < 12.3; z += 0.22) {
        const h = rng.float(0.26, 0.36);
        const col = rng.pick(['#3a6a2a', '#7a4a1a', '#c8c8b8', '#1a3a6a', '#8a1a2a', '#c89a3a', '#2a2a2a']);
        B.geo('solid', new THREE.CylinderGeometry(0.035, 0.04, h, 7), 23.1, y + h / 2, z, C(col, 0.9));
        B.geo('solid', new THREE.CylinderGeometry(0.012, 0.02, 0.08, 6), 23.1, y + h + 0.04, z, C(col, 0.9));
      }
    }
    for (let k = 0; k < 10; k++) B.geo('glass', new THREE.CylinderGeometry(0.04, 0.035, 0.12, 8), 22.95, 1.06, 6.6 + k * 0.18);
    P(W - 0.01, 9.4, -R90).panel('clubSigns', -1.1, 2.7, 1.1, 2.84, 0, signUV(5));
    // stools
    for (let k = 0; k < 6; k++) {
      const S = P(18.85, 6.7 + k * 1.1);
      S.geo('solid', new THREE.CylinderGeometry(0.19, 0.17, 0.07, 12), 0, 0.76, 0, C('#8a2a3e'));
      S.geo('solid', new THREE.CylinderGeometry(0.03, 0.03, 0.74, 6), 0, 0.37, 0, C('#8a8c90'));
      S.geo('solid', new THREE.TorusGeometry(0.15, 0.012, 4, 12), 0, 0.3, 0, C('#8a8c90'), 0, 1, 1, 1, PI / 2);
      S.collide(-0.18, -0.18, 0.18, 0.18, 0.8);
    }
    this.barSpots = [];
    for (let k = 0; k < 7; k++) this.barSpots.push({ ...xz(this.w(18.95, 6.15 + k * 1.1)), yaw: R90 });
    this.bartenderSpots = [7.0, 9.4, 11.8].map((z) => ({ ...xz(this.w(21.0, z)), yaw: -R90 }));

    // --- lounge: half walls, three booths in deep red velvet
    for (const [z0, z1] of [
      [4.3, 7.2],
      [10.8, 13.9],
    ]) {
      const HW = P(4.85, 0);
      HW.box('solid', -0.1, 0, z0, 0.1, 1.05, z1, C('#1c1c22'));
      HW.box('solid', -0.13, 1.05, z0 - 0.03, 0.13, 1.1, z1 + 0.03, C('#c8a02a'), { bottom: true });
      HW.collide(-0.12, z0, 0.12, z1, 1.1);
    }
    this.seats = [];
    const velvet = C('#7a1a3a');
    for (const c of [5.8, 9.0, 12.2]) {
      const Bo = P(0, c);
      Bo.box('fabric', 0, 0, -1.25, 0.55, 0.45, 1.25, velvet);
      Bo.box('fabric', 0, 0.45, -1.25, 0.2, 1.25, 1.25, velvet);
      for (const s of [-1, 1]) {
        const z0 = s < 0 ? -1.25 : 0.7;
        const z1 = s < 0 ? -0.7 : 1.25;
        Bo.box('fabric', 0.55, 0, z0, 1.85, 0.45, z1, velvet);
        Bo.box('fabric', 0.55, 0.45, s < 0 ? -1.25 : 1.05, 1.85, 1.25, s < 0 ? -1.05 : 1.25, velvet);
      }
      Bo.geo('solid', new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), 1.15, 0.72, 0, C('#2a2a30'));
      Bo.geo('solid', new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), 1.15, 0.35, 0, C('#c8a04a'));
      Bo.geo('glass', new THREE.CylinderGeometry(0.04, 0.035, 0.14, 8), 1.0, 0.81, 0.1);
      Bo.geo('glass', new THREE.CylinderGeometry(0.04, 0.035, 0.14, 8), 1.3, 0.81, -0.15);
      Bo.collide(0, -1.25, 1.9, 1.25, 1.25);
      Bo.shadow(0, -1.25, 1.9, 1.25, 0.35);
      const y = this.origin.y;
      const out = xz(this.w(2.35, c));
      this.seats.push(
        { ...xz(this.w(0.3, c - 0.4)), y, yaw: R90, out },
        { ...xz(this.w(0.3, c + 0.4)), y, yaw: R90, out },
        { ...xz(this.w(1.25, c - 0.95)), y, yaw: 0, out },
        { ...xz(this.w(1.25, c + 0.95)), y, yaw: PI, out },
      );
    }
    // posters over the booths
    for (const [k, z] of [
      [0, 5.8],
      [2, 9.0],
      [1, 12.2],
    ])
      P(0.006, z, R90).panel('posters', -0.4, 1.6, 0.4, 3.2, 0, [k / 4, 0, (k + 1) / 4, 1]);

    // --- UV paint over the lounge and on the back wall (additive, see buildEffects)
    this.uvPanels = [
      { m: trs(this.origin.x + 0.01, this.origin.y + 4.8, this.origin.z + 9.0, PI / 2), w: 8.5, h: 2.8 },
      { m: trs(this.origin.x + W - 0.01, this.origin.y + 4.6, this.origin.z + 9.5, -PI / 2), w: 8.0, h: 3.0 },
      { m: trs(this.origin.x + 6.3, this.origin.y + 4.9, this.origin.z + 0.01, 0), w: 2.4, h: 2.6 },
      { m: trs(this.origin.x + 17.1, this.origin.y + 4.9, this.origin.z + 0.01, 0), w: 2.4, h: 2.6 },
    ];

    // --- exit signs and the strip curtain
    P(10.5, FRONT - 0.13, PI).panel('clubSigns', -0.4, 2.85, 0.4, 3.0, 0, signUV(4));
    for (let x = ARCH[0] + 0.02; x < ARCH[1] - 0.05; x += 0.22) P(0, 0).quad('glass', [x + 0.2, 0.05, FRONT], [x, 0.05, FRONT], [x, 2.68, FRONT], [x + 0.2, 2.68, FRONT], [0, 0, -1], [0, 0, 1, 1]);
    P(19.2, 5.4 + 0.07, 0).panel('clubSigns', -0.45, 2.22, 0.45, 2.34, 0, signUV(0));
    P(5.07, 3.35, R90).panel('clubSigns', -0.45, 2.25, 0.45, 2.37, 0, signUV(1));

    // the dance floor's spots for clubbers
    this.danceSpots = [];
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++) {
        const x = FLOOR.x0 - 0.2 + i * 0.95 + this.rng.float(-0.18, 0.18);
        const z = FLOOR.z0 - 0.1 + j * 0.92 + this.rng.float(-0.18, 0.18);
        this.danceSpots.push({ ...xz(this.w(x, z)), yaw: Math.atan2(COIL.x - x, 0.5 - z) + this.rng.float(-0.5, 0.5) });
      }
    this.djSpot = { ...xz(this.w(COIL.x, 1.0)), y: this.origin.y + 0.9, yaw: 0 };
    this.securitySpot = { ...xz(this.w(12.6, 13.2)), yaw: PI };
    this.hallDoor = this.w((ARCH[0] + ARCH[1]) / 2, FRONT - 0.6);
    this.lobbyDoor = this.w((ARCH[0] + ARCH[1]) / 2, FRONT + 0.6);
  }

  /** Backstage: a worn sofa, the DJ's rider, a mirror ringed with bulbs, record crates. */
  buildGreenRoom(kit, P, R90, PI, BLACK) {
    F.rug(P(1.7, 2.1, R90), { w: 2.4, l: 1.7, key: 'rugPersian' });
    F.sofa(P(0.02, 2.1, R90), { w: 2.0, col: '#5a2a2a', style: 'old', accent: '#c8a04a' });
    F.coffeeTable(P(1.45, 2.1, R90), { w: 1.0, d: 0.5, col: '#2a2a30' });
    // the rider: bottles, a fruit bowl, crisps, a laminated set list
    const R = P(1.45, 2.1);
    for (const [x, z, col] of [
      [-0.1, -0.3, '#3a6a2a'],
      [0.05, -0.18, '#c8c8b8'],
      [-0.12, 0.05, '#8a1a2a'],
    ])
      R.geo('solid', new THREE.CylinderGeometry(0.035, 0.04, 0.3, 7), x, 0.6, z, C(col));
    F.fruitBowl(R, { x: 0.05, y: 0.45, z: 0.25 });
    R.box('solid', -0.15, 0.45, 0.12, 0.05, 0.452, 0.3, C('#f4f0e0'));
    // mirror with a frame of bulbs on the back wall, over a little counter
    const M = P(3.4, 0.0);
    M.box('solid', -0.7, 0.75, 0, 0.7, 0.8, 0.4, C('#2a2a30'), { bottom: true });
    M.box('solid', -0.7, 0, 0.02, 0.7, 0.75, 0.38, C('#3a3a40'));
    M.quad('mirror', [-0.55, 1.05, 0.012], [0.55, 1.05, 0.012], [0.55, 1.95, 0.012], [-0.55, 1.95, 0.012], [0, 0, 1], [0, 0, 1, 1], C('#c8d0d4'));
    for (let k = 0; k < 6; k++) M.geo('glow', new THREE.SphereGeometry(0.035, 6, 4), -0.62 + k * 0.248, 2.02, 0.045, C('#fff2c8'));
    for (let k = 0; k < 4; k++)
      for (const x of [-0.62, 0.62]) M.geo('glow', new THREE.SphereGeometry(0.035, 6, 4), x, 1.15 + k * 0.25, 0.045, C('#fff2c8'));
    M.light(0, 1.6, 0.5, '#ffe2b0', 0.8, true);
    M.collide(-0.7, 0, 0.7, 0.4, 0.8);
    // record crates and a clothes rail
    const RC = P(4.55, 0.55);
    for (let k = 0; k < 2; k++) {
      RC.box('solid', -0.3, k * 0.32, -0.25, 0.3, k * 0.32 + 0.3, 0.25, C('#7a5a3a'));
      for (let r = 0; r < 9; r++) RC.box('solid', -0.27 + r * 0.06, k * 0.32 + 0.3, -0.2, -0.24 + r * 0.06, k * 0.32 + 0.36, 0.2, C(['#141418', '#c83a3a', '#2a5aaa', '#e8e4dc', '#c8a04a'][r % 5]));
    }
    RC.collide(-0.3, -0.25, 0.3, 0.25, 0.7);
    const CR = P(2.0, 3.95);
    CR.box('solid', -0.7, 1.6, -0.015, 0.7, 1.63, 0.015, C('#8a8c90'));
    for (const x of [-0.7, 0.7]) CR.box('solid', x - 0.015, 0, -0.015, x + 0.015, 1.63, 0.015, C('#8a8c90'));
    for (let k = 0; k < 5; k++) CR.box('fabric', -0.55 + k * 0.26, 0.75, -0.12, -0.4 + k * 0.26, 1.55, 0.12, C(['#141418', '#7a2330', '#2a2a30', '#c9b48a', '#3a3a6a'][k]));
    CR.collide(-0.72, -0.15, 0.72, 0.15, 1.65);
    F.floorLamp(P(0.4, 3.75), { col: '#2a2a2a', shade: '#e8b878', power: 0.7 });
    P(2.5, 2.1).light(0, 2.7, 0, '#ffc890', 0.85, true);
    // tour laminates and flyers
    for (let k = 0; k < 3; k++) P(0.006, 0.8 + k * 0.55 + (k > 1 ? 1.9 : 0), R90).panel('posters', -0.2, 1.5, 0.2, 2.2, 0, [(k % 4) / 4, 0, ((k % 4) + 1) / 4, 1]);
    this.greenSeats = [1.7, 2.5].map((z) => ({ ...xz(this.w(0.42, z)), y: this.origin.y, yaw: R90, out: xz(this.w(1.0, z < 2.1 ? 1.0 : 3.2)), green: true }));
    this.greenSpots = { rider: xz(this.w(1.45, 2.1)), mirror: xz(this.w(3.4, 0.75)), records: xz(this.w(4.0, 1.0)), inside: { ...xz(this.w(4.4, 3.35)), yaw: -R90 }, outside: { ...xz(this.w(5.65, 3.35)), yaw: R90 } };
    this.djAsideSpot = { ...xz(this.w(7.45, 2.35)), yaw: R90 };

    // the door behind the coil: a low steel hatch in the back wall over the DJ's platform
    const DR = P(COIL.x, 0.0);
    DR.box('solid', -0.48, 0.9, 0.006, 0.48, 2.56, 0.045, C('#2e3034'));
    DR.box('solid', -0.54, 0.9, 0.006, -0.48, 2.62, 0.05, C('#1a1a1e'));
    DR.box('solid', 0.48, 0.9, 0.006, 0.54, 2.62, 0.05, C('#1a1a1e'));
    DR.box('solid', -0.54, 2.56, 0.006, 0.54, 2.62, 0.05, C('#1a1a1e'));
    for (const y of [1.1, 2.35]) for (const x of [-0.38, 0.38]) DR.box('solid', x - 0.02, y - 0.02, 0.045, x + 0.02, y + 0.02, 0.055, C('#5a5a60'));
    DR.box('solid', 0.3, 1.62, 0.045, 0.36, 1.78, 0.075, C('#8a8c90'));
    this.hatch = this.w(COIL.x, 0.06, 1.73);
  }

  buildFront(kit, P, R90, PI, BLACK) {
    // --- coat check: counter in the hatch, rails of coats, a tip jar
    const CC = P(3.6, 15.7, R90);
    CC.box('wood', -1.2, 0.95, -0.25, 1.2, 1.0, 0.3, C('#6a4a32'), { bottom: true });
    CC.geo('glass', new THREE.CylinderGeometry(0.07, 0.06, 0.16, 10), 0.8, 1.08, 0.15);
    CC.panel('clubSigns', -1.2, 2.32, 1.2, 2.5, 0.07, signUV(3));
    const rng = new Rng(66);
    for (const x of [0.6, 1.8]) {
      const R = P(x, 0);
      R.box('solid', -0.02, 1.86, 14.25, 0.02, 1.9, 17.15, C('#c8ccd0'));
      for (let z = 14.4; z < 17.0; z += 0.11) {
        if (rng.chance(0.25)) continue;
        const col = rng.pick(['#2b2b30', '#5a4632', '#1f2e4a', '#7a2330', '#4a5a3a', '#8a8a90', '#c9b48a', '#e86a2a']);
        R.box('solid', -0.24, 0.95 + rng.float(0, 0.25), z - 0.03, 0.24, 1.84, z + 0.03, C(col));
        R.box('solid', -0.03, 1.5, z + 0.03, 0.03, 1.58, z + 0.04, C('#f2f2f2'));
      }
      R.collide(-0.3, 14.2, 0.3, 17.2, 1.9);
    }
    this.coatSpot = { ...xz(this.w(2.85, 15.7)), yaw: R90 };
    this.coatCounter = this.w(4.3, 15.7);

    // --- gig posters on the lobby wall, UV paint, a neon strip down the ceiling
    for (let k = 0; k < 4; k++) P(4.4 + k * 0.85, FRONT + 0.135).panel('posters', 0, 0.9, 0.7, 2.3, 0, [k / 4, 0, (k + 1) / 4, 1]);
    P(0, 0).box('glow', 4.0, LOBBY_H - 0.04, 15.68, 17.2, LOBBY_H - 0.02, 15.72, C('#e04aff'), { top: false, bottom: true });
    this.uvPanels.push({ m: trs(this.origin.x + 14.3, this.origin.y + 1.7, this.origin.z + FRONT + 0.135, 0), w: 3.6, h: 2.2 });
    P(6.6, D - 0.01, PI).panel('clubSigns', -0.4, 2.75, 0.4, 2.9, 0, signUV(4));
    P(9.3, D - 0.01, PI).panel('clubSigns', -0.9, 1.4, 0.9, 1.52, 0, signUV(7));

    // --- ATM against the hall wall
    const A = P(13.6, FRONT + 0.13);
    A.box('solid', -0.4, 0, 0, 0.4, 1.65, 0.55, C('#3a3e44'));
    A.box('solid', -0.36, 0.95, 0.55, 0.36, 1.0, 0.68, C('#2a2a2e'));
    A.box('glow', -0.24, 1.08, 0.551, 0.24, 1.4, 0.556, C('#5ab0ff'));
    A.box('glow', -0.12, 0.88, 0.551, 0.12, 0.9, 0.556, C('#3aff6a'));
    A.panel('clubSigns', -0.35, 1.5, 0.35, 1.6, 0.556, signUV(11));
    A.collide(-0.42, 0, 0.42, 0.7, 1.65);
    this.atmSpot = this.w(13.6, FRONT + 1.2);

    // --- photo booth (out of film)
    const PB = P(15.2, D - 0.62, -R90);
    PB.box('solid', -0.6, 0, -0.75, 0.6, 2.25, 0.4, C('#c82a2a'));
    PB.box('solid', -0.62, 2.25, -0.77, 0.62, 2.45, 0.42, C('#f4f0e0'));
    PB.panel('clubSigns', -0.55, 2.27, 0.55, 2.43, 0.43, signUV(8));
    PB.quad('curtain', [0.5, 0.15, 0.42], [-0.5, 0.15, 0.42], [-0.5, 2.15, 0.42], [0.5, 2.15, 0.42], [0, 0, 1], [0, 0, 1.6, 1], C('#2a2a30'));
    PB.panel('clubSigns', -0.35, 1.2, 0.35, 1.32, 0.43, signUV(9));
    PB.collide(-0.62, -0.77, 0.62, 0.42, 2.45);
    this.photoSpot = this.w(14.2, 16.6);

    // --- the VIP stairs: roped off for now
    const ST = P(0, 0);
    const steps = 14;
    for (let k = 0; k < steps; k++) {
      const x0 = 17.9 + k * 0.3;
      const top = ((k + 1) * 3.6) / steps;
      ST.box('concrete', x0, 0, 15.95, k === steps - 1 ? 22.1 : x0 + 0.3, top, D, C('#4a4a50'));
      ST.box('solid', x0 - 0.01, top - 0.03, 15.96, x0 + 0.05, top + 0.006, D - 0.01, C('#c8a02a'));
    }
    ST.box('concrete', 22.1, 0, FRONT, W, 3.6, D, C('#4a4a50'));
    ST.box('concrete', 17.67, 3.35, FRONT + 0.13, 22.1, 3.6, 15.6, C('#4a4a50'), { bottom: true });
    for (let x = 17.9; x < 22.1; x += 0.6) ST.box('solid', x, 3.6, 15.5, x + 0.04, 4.6, 15.54, C('#c8a02a'));
    ST.box('solid', 17.6, 4.6, 15.48, 22.1, 4.65, 15.56, C('#c8a02a'), { bottom: true });
    ST.geo('solid', new THREE.BoxGeometry(5.53, 0.05, 0.05), 20.0, 2.75, 15.9, C('#c8a02a'), 0, 1, 1, 1, 0, Math.atan2(3.6, 4.2));
    // the VIP door's sign; the stairs themselves are open to everyone (roof terrace)
    ST.box('glow', 17.6 + 0.121, 5.75, 14.45, 17.6 + 0.126, 5.9, 15.15, C('#ffd23a'));
    P(17.6 + 0.07, 14.8, R90).panel('clubSigns', -0.55, 5.72, 0.55, 5.86, 0.06, signUV(9));
    P(17.6 - 0.07, 16.55, -R90).panel('clubSigns', -0.7, 2.45, 0.7, 2.6, 0, signUV(2));
    P(W - 0.01, 16.5, -R90).panel('clubSigns', -0.6, 5.85, 0.6, 5.97, 0, signUV(2));
    // railings: walkway edge over the stairwell, and the open side of the stairs
    P(0, 0).collide(17.6, 15.5, 22.1, 15.96, 4.65);
    P(0, 0, 0, 0.25).collide(18.4, 15.86, 22.1, 15.96, 4.4);
    for (let x = 18.5; x < 22.1; x += 0.6) {
      const top = Math.min(14, Math.floor((x - 17.9) / 0.3) + 1) * (3.6 / 14);
      ST.box('solid', x, top, 15.9, x + 0.035, top + 0.9, 15.935, C('#c8a02a'));
    }
    this.vipDoorSpot = this.w(18.1, 14.8, 3.6);
  }

  buildVip(kit, P, R90, PI, BLACK) {
    const Y = 3.6;
    const V = (x, z, r = 0) => kit.place(x, z, r, Y);
    // glass balustrade in the big opening, brass posts and rail
    const B = V(0, 0);
    for (let x = 4.0; x < 17.19; x += 1.65) {
      const x1 = Math.min(17.2, x + 1.65);
      B.quad('glass', [x + 0.03, 0.02, FRONT], [x1 - 0.03, 0.02, FRONT], [x1 - 0.03, 1.0, FRONT], [x + 0.03, 1.0, FRONT], [0, 0, 1], [0, 0, 1, 1]);
      B.box('solid', x - 0.025, 0, FRONT - 0.04, x + 0.025, 1.05, FRONT + 0.04, C('#c8a04a'));
    }
    B.box('solid', 17.175, 0, FRONT - 0.04, 17.225, 1.05, FRONT + 0.04, C('#c8a04a'));
    B.box('solid', 4.0, 1.05, FRONT - 0.05, 17.2, 1.1, FRONT + 0.05, C('#c8a04a'), { bottom: true });
    B.collide(4.0, FRONT - 0.13, 17.2, FRONT + 0.22, 1.1);

    // three booths in emerald velvet against the street wall, looking down on the floor
    this.vipSeats = [];
    this.vipTables = [];
    const velvet = C('#1a5a4a');
    for (const bx of [6.2, 9.8, 13.4]) {
      const Bo = V(bx, D, PI);
      Bo.box('fabric', -1.25, 0, 0, 1.25, 0.45, 0.55, velvet);
      Bo.box('fabric', -1.25, 0.45, 0, 1.25, 1.25, 0.2, velvet);
      for (const sx of [-1, 1]) {
        Bo.box('fabric', sx < 0 ? -1.25 : 0.7, 0, 0.55, sx < 0 ? -0.7 : 1.25, 0.45, 1.75, velvet);
        Bo.box('fabric', sx < 0 ? -1.25 : 1.05, 0.45, 0.55, sx < 0 ? -1.05 : 1.25, 1.0, 1.75, velvet);
      }
      Bo.geo('solid', new THREE.CylinderGeometry(0.44, 0.44, 0.04, 18), 0, 0.5, 1.15, C('#1a1a1e'));
      Bo.geo('solid', new THREE.CylinderGeometry(0.06, 0.08, 0.48, 8), 0, 0.24, 1.15, C('#c8a04a'));
      Bo.geo('solid', new THREE.CylinderGeometry(0.11, 0.09, 0.22, 12), 0.12, 0.63, 1.1, C('#c8ccd0'));
      Bo.geo('solid', new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8), 0.12, 0.8, 1.1, C('#1a3a2a'));
      for (const gx of [-0.2, -0.05]) Bo.geo('glass', new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), gx, 0.58, 1.25);
      Bo.collide(-1.25, 0, 1.25, 1.75, 1.25);
      Bo.shadow(-1.25, 0, 1.25, 1.75, 0.35);
      const out = xz(Bo.point(0, 0, 2.25));
      const seat = (lx, lz, a) => ({ ...xz(Bo.point(lx, 0, lz)), y: this.origin.y + Y, yaw: a + PI, vip: true, out });
      this.vipSeats.push(seat(-0.42, 0.3, 0), seat(0.42, 0.3, 0), seat(-0.95, 1.2, PI / 2), seat(0.95, 1.2, -PI / 2));
      this.vipTables.push(Bo.point(0.12, 0.95, 1.1));
      // a low pendant over each table
      const L = V(bx, D - 1.15);
      L.box('solid', -0.008, 2.2, -0.008, 0.008, H - Y, 0.008, C('#1a1a1a'));
      L.geo('solid', new THREE.SphereGeometry(0.2, 12, 6, 0, PI * 2, 0, PI / 2), 0, 2.0, 0, C('#c8a04a'));
      L.box('glow', -0.08, 1.995, -0.08, 0.08, 2.0, 0.08, C('#ffc890'), { top: false, bottom: true });
      L.light(0, 1.9, 0, '#ffb070', 0.5, true);
    }
    // host stand by the door, a bar cart and plants at the far end
    const HS = V(16.6, 15.75);
    HS.box('solid', -0.25, 0, -0.2, 0.25, 1.1, 0.2, C('#1a1a1e'));
    HS.box('solid', -0.27, 1.1, -0.22, 0.27, 1.14, 0.22, C('#c8a04a'), { bottom: true });
    HS.box('glow', -0.1, 1.14, -0.05, 0.1, 1.16, 0.05, C('#ffd890'));
    HS.collide(-0.26, -0.21, 0.26, 0.21, 1.14);
    this.vipHostSpot = { ...xz(this.w(16.95, 14.8)), y: this.origin.y + Y, yaw: PI / 2 };
    F.barCart(V(4.6, D, PI));
    F.plant(V(4.15, 14.7), { kind: 'tall', pot: '#2a2a30' });
    F.plant(V(15.55, 16.9), { kind: 'tall', pot: '#2a2a30' });
    // sconces and the balcony's UV mural above the booths
    for (const [x, z, r] of [
      [3.67, 15.8, R90],
      [17.53, 16.6, -R90],
    ]) {
      const Sc = V(x, z, r);
      Sc.box('solid', -0.12, 1.7, 0, 0.12, 2.1, 0.08, C('#c8a04a'));
      Sc.box('glow', -0.09, 1.74, 0.081, 0.09, 2.06, 0.086, C('#ffd0a0'));
      Sc.light(0, 1.9, 0.3, '#ffb878', 0.3);
    }
    this.uvPanels.push({ m: trs(this.origin.x + 9.8, this.origin.y + Y + 2.45, this.origin.z + D - 0.01, PI), w: 10.5, h: 1.3 });
  }

  buildToilets(kit, P, R90, PI, BLACK) {
    // four stalls along the back wall, sticker-bombed doors
    const stalls = [18.4, 19.65, 20.9, 22.15, W];
    for (let k = 0; k < 4; k++) {
      const x0 = stalls[k];
      const x1 = stalls[k + 1];
      F.toilet(P((x0 + x1) / 2, 0.0));
      if (k > 0) P(x0, 0).box('solid', -0.02, 0.15, 0, 0.02, 2.0, 1.55, C('#2a3a34'));
      const open = k === 1 || k === 3;
      const Dr = P(x0, 1.55);
      Dr.box('solid', 0.04, 0.15, -0.02, 0.1, 2.0, 0.02, C('#2a3a34'));
      if (open) Dr.box('solid', 0.1, 0.15, 0.02, 0.14, 2.0, 0.9, C('#2a3a34'));
      else {
        Dr.box('solid', 0.1, 0.15, -0.02, x1 - x0 - 0.02, 2.0, 0.02, C('#2a3a34'));
        Dr.panel('stickers', 0.15, 0.6, x1 - x0 - 0.07, 1.9, 0.026);
      }
      P(0, 0).collide(x0, 1.45, x1, 1.62, 2.0);
    }
    // sinks with a long mirror, a hand dryer
    for (const z of [2.6, 3.6]) F.vanity(P(W, z, -R90), { w: 0.8, col: '#2a2a30', top: '#3a3a40', mirror: false, light: false });
    const M = P(W - 0.01, 3.1, -R90);
    M.box('solid', -1.0, 1.1, 0, 1.0, 1.95, 0.02, C('#1a1a1e'));
    M.quad('mirror', [-0.95, 1.14, 0.025], [0.95, 1.14, 0.025], [0.95, 1.91, 0.025], [-0.95, 1.91, 0.025], [0, 0, 1], [0, 0, 1, 1], C('#c8d0d4'));
    M.panel('stickers', -1.0, 1.95, 1.0, 2.15, 0.006);
    P(W - 0.01, 4.7, -R90).box('solid', -0.15, 1.1, 0, 0.15, 1.45, 0.18, C('#c8ccd0'));
    P(20.9, 2.7).box('glow', -0.6, 2.97, -0.05, 0.6, 2.99, 0.05, C('#e8f6ff'), { top: false, bottom: true });
  }

  // ==========================================================================
  buildEffects() {
    const o = this.origin;
    const glowTex = this.cityTex.glow;

    // LED floor: one instanced mesh, a colour per tile
    const n = FLOOR.n;
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE - 0.05, 0.016, TILE - 0.05), new THREE.MeshBasicMaterial({ map: this.ct.frosted, fog: false }), n * n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        m.makeTranslation(o.x + FLOOR.x0 + (i + 0.5) * TILE, o.y + 0.02, o.z + FLOOR.z0 + (j + 0.5) * TILE);
        this.tiles.setMatrixAt(i * n + j, m);
        this.tiles.setColorAt(i * n + j, new THREE.Color(0, 0, 0));
      }
    this.tiles.frustumCulled = false;
    this.group.add(this.tiles);
    this.floorCenter = this.w(FLOOR.x0 + (n * TILE) / 2, FLOOR.z0 + (n * TILE) / 2);

    // dynamic LED strips: DJ booth front and the bar's front lip
    const strip = (b, ch, k = 1) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#000000', fog: false });
      const mesh = new THREE.Mesh(b.build(), mat);
      this.group.add(mesh);
      this.dyn.push({ mat, ch, k });
      return mesh;
    };
    const s1 = new GeoBuilder();
    for (const y of [0.1, 0.84]) s1.quad([o.x + 8.7, o.y + y, o.z + 2.69], [o.x + 14.7, o.y + y, o.z + 2.69], [o.x + 14.7, o.y + y + 0.04, o.z + 2.69], [o.x + 8.7, o.y + y + 0.04, o.z + 2.69], [0, 0, 1]);
    strip(s1, 1, 1.4);
    const s2 = new GeoBuilder();
    s2.quad([o.x + 19.393, o.y + 1.0, o.z + 12.8], [o.x + 19.393, o.y + 1.0, o.z + 6.0], [o.x + 19.393, o.y + 1.05, o.z + 6.0], [o.x + 19.393, o.y + 1.05, o.z + 12.8], [-1, 0, 0]);
    strip(s2, 2, 1.4);
    // 3:33: violet light leaking round the hatch behind the coil
    const seam = new GeoBuilder();
    const hz0 = o.z + 0.058;
    const hx = o.x + COIL.x;
    for (const [x0, y0, x1, y1] of [
      [-0.56, 0.9, -0.5, 2.64],
      [0.5, 0.9, 0.56, 2.64],
      [-0.56, 2.58, 0.56, 2.64],
    ])
      seam.quad([hx + x0, o.y + y0, hz0], [hx + x1, o.y + y0, hz0], [hx + x1, o.y + y1, hz0], [hx + x0, o.y + y1, hz0], [0, 0, 1]);
    this.seamMat = additive({ map: null, color: new THREE.Color('#b06aff'), opacity: 0 });
    const seamMesh = new THREE.Mesh(seam.build(), this.seamMat);
    seamMesh.renderOrder = 3;
    this.group.add(seamMesh);
    this.spillMat = additive({ map: glowTex, color: new THREE.Color('#9a4aff'), opacity: 0 });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.0), this.spillMat);
    spill.position.set(hx, o.y + 1.75, o.z + 0.07);
    spill.renderOrder = 3;
    this.group.add(spill);

    // the coil's glowing core
    const ring = new GeoBuilder();
    ring.addGeometry(new THREE.TorusGeometry(1.42, 0.05, 6, 48), trs(o.x + COIL.x, o.y + COIL.y, o.z + 0.42));
    ring.addGeometry(new THREE.TorusGeometry(0.9, 0.035, 6, 40), trs(o.x + COIL.x, o.y + COIL.y, o.z + 0.42));
    strip(ring, 3, 2.2);

    // speaker cones: pushed forward on every kick
    const cb = new GeoBuilder();
    for (const s of this.coneSpots) {
      cb.addGeometry(new THREE.CircleGeometry(s.r, 14), trs(o.x + s.x, o.y + s.y, o.z + s.z + 0.005), shade('#2a2a2e'));
      cb.addGeometry(new THREE.CircleGeometry(s.r * 0.3, 10), trs(o.x + s.x, o.y + s.y, o.z + s.z + 0.012), shade('#5a5a60'));
      cb.addGeometry(new THREE.TorusGeometry(s.r, 0.02, 4, 16), trs(o.x + s.x, o.y + s.y, o.z + s.z + 0.006), shade('#0a0a0a'));
    }
    this.cones = new THREE.Mesh(cb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(this.cones);

    // UV paint
    this.uvMat = new THREE.MeshBasicMaterial({ map: this.ct.uv, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ub = new GeoBuilder();
    for (const p of this.uvPanels) {
      const g = new THREE.PlaneGeometry(p.w, p.h);
      g.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? p.h / 3 : p.w / 3)));
      ub.addGeometry(g, p.m);
    }
    const uvMesh = new THREE.Mesh(ub.build(), this.uvMat);
    uvMesh.renderOrder = 3;
    this.group.add(uvMesh);

    // mirror ball and the spots it throws around the hall
    this.ballPos = this.w(COIL.x, FLOOR.z0 + (FLOOR.n * TILE) / 2, 5.0);
    this.ballMat = new THREE.MeshBasicMaterial({ map: this.ct.mirror, color: '#8a8a90', fog: false });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), this.ballMat);
    this.ball.position.copy(this.ballPos);
    this.group.add(this.ball);
    const N = 170;
    const rng = new Rng(77);
    this.spotDirs = [];
    for (let k = 0; k < N; k++) {
      const y = rng.float(-0.85, 0.75);
      const a = rng.float(0, Math.PI * 2);
      const r = Math.sqrt(1 - y * y);
      this.spotDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.spotMat = additive({ map: glowTex, color: new THREE.Color('#ffffff'), size: 0.42, points: true, fog: false, opacity: 0 });
    this.spots = new THREE.Points(sg, this.spotMat);
    this.spots.frustumCulled = false;
    this.spots.renderOrder = 4;
    this.group.add(this.spots);

    // moving heads on the truss with beams through the haze
    const t = this.truss;
    const cone = new THREE.CylinderGeometry(0.05, 0.85, 9, 14, 1, true).translate(0, -4.5, 0);
    this.heads = [];
    const headGeo = new THREE.BoxGeometry(0.26, 0.3, 0.26);
    const headMat = new THREE.MeshLambertMaterial({ color: '#18181a' });
    const beamMat = new THREE.MeshBasicMaterial({ map: this.ct.beam, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const spots = [];
    for (const f of [0.25, 0.75]) {
      spots.push([lerp(t.tx0, t.tx1, f), t.tz0, 0]);
      spots.push([lerp(t.tx0, t.tx1, f), t.tz1, 1]);
      spots.push([t.tx0, lerp(t.tz0, t.tz1, f), 0]);
      spots.push([t.tx1, lerp(t.tz0, t.tz1, f), 1]);
    }
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    this.beamMesh = new THREE.InstancedMesh(cone, beamMat, spots.length);
    for (const m of [this.headMesh, this.beamMesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.beamMesh.renderOrder = 4;
    spots.forEach(([x, z, side], k) => {
      this.heads.push({ pos: this.w(x, z, t.y - 0.45), rot: new THREE.Euler(0, 0, 0, 'YXZ'), color: new THREE.Color(), side, k });
      this.beamMesh.setColorAt(k, _c.setRGB(0, 0, 0));
    });

    // lasers from above the DJ, fanning over the crowd
    this.laserMat = new THREE.MeshBasicMaterial({ color: '#3aff6a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lg = new THREE.BoxGeometry(0.02, 0.02, 16).translate(0, 0, 8);
    this.laserOrigin = this.w(COIL.x, 0.9, 3.1);
    this.lasers = new THREE.InstancedMesh(lg, this.laserMat, 12);
    this.lasers.frustumCulled = false;
    this.lasers.renderOrder = 4;
    this.group.add(this.lasers);

    // confetti for OVERLOAD's drops: paper squares that flutter down from the truss
    const CN = 220;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CN * 3), 3));
    const cc = new Float32Array(CN * 3);
    const crng = new Rng(77);
    const cols = ['#c8ff2a', '#ff2a6a', '#ffffff', '#2affd0', '#ffd23a'].map((h) => new THREE.Color(h));
    this.confettiSeeds = [];
    for (let k = 0; k < CN; k++) {
      const c = crng.pick(cols);
      cc.set([c.r, c.g, c.b], k * 3);
      this.confettiSeeds.push([crng.float(FLOOR.x0 - 1, FLOOR.x0 + FLOOR.n * TILE + 1), crng.float(FLOOR.z0 - 1, FLOOR.z0 + FLOOR.n * TILE + 1), crng.float(0.35, 0.8), crng.float(0, 6.28), crng.float(0, 0.6)]);
    }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, fog: false }));
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.group.add(this.confetti);
    this.confettiT = 99;

    // haze: big soft sprites drifting under the roof
    const HN = 26;
    const hg = new THREE.BufferGeometry();
    const hp = new Float32Array(HN * 3);
    this.hazeSeeds = [];
    for (let k = 0; k < HN; k++) this.hazeSeeds.push([rng.float(4, 19), rng.float(2.2, 5.2), rng.float(1.5, 13), rng.float(0, 6.28)]);
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    this.hazeMat = additive({ map: glowTex, color: new THREE.Color('#ffffff'), size: 7, points: true, fog: false, opacity: 0.05 });
    this.haze = new THREE.Points(hg, this.hazeMat);
    this.haze.frustumCulled = false;
    this.haze.renderOrder = 2;
    this.group.add(this.haze);

    // a sparkler on a VIP bottle (bottle service)
    const SPK = 80;
    const spg = new THREE.BufferGeometry();
    spg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPK * 3), 3));
    this.sparkMat = additive({ map: glowTex, color: new THREE.Color('#ffe8a0'), size: 0.14, points: true, fog: false, opacity: 0 });
    this.sparks = new THREE.Points(spg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    this.group.add(this.sparks);
    this.sparkSeeds = Array.from({ length: SPK }, () => [rng.next(), rng.float(0, Math.PI * 2), rng.float(0.8, 1.6)]);
    this.sparkT = 0;

    // lights for the people in here (the shared pool of 6 point lights picks the nearest)
    const F2 = (x, z, y, col, power, dist = 9) => ({ ...this.w(x, z, y), color: new THREE.Color(col), power, dist });
    this.fixtures = [
      F2(9.6, 6.5, 4.2, '#000000', 0.9, 10),
      F2(13.8, 8.0, 4.2, '#000000', 0.9, 10),
      F2(11.7, 7.2, 0.6, '#000000', 0.5, 6),
      F2(11.7, 1.8, 2.6, '#000000', 0.5, 6),
      F2(11.7, 12.2, 4.0, '#000000', 0.8, 10),
      F2(19.8, 9.4, 2.4, '#ffb060', 0.55, 7),
      F2(1.5, 9.0, 2.0, '#ff9a5a', 0.5, 7),
      F2(9.0, 15.7, 2.8, '#c04aff', 0.45, 7),
      F2(1.8, 15.7, 2.8, '#ffd8a0', 0.4, 5),
      F2(20.5, 15.8, 4.0, '#ff2a2a', 0.5, 6),
      F2(20.9, 2.7, 2.7, '#e8f6ff', 0.6, 6),
      F2(7.0, 15.8, 5.8, '#ffb070', 0.55, 7),
      F2(13.0, 15.8, 5.8, '#ffb070', 0.55, 7),
    ];
    this.stageFix = this.fixtures.slice(0, 5);
  }

  // ==========================================================================
  buildExterior() {
    const o = this.origin;
    const s = this.site;
    const ct = this.ct;
    const X0 = s.x0;
    const X1 = s.x1;
    const Z0 = s.z0;
    const Z1 = s.z1;
    const Yb = CITY.CURB;
    const Yt = o.y + ROOF;
    this.Z1 = Z1;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;

    // --- concrete shell, subdivided so street lamps light it per vertex
    const shell = new GeoBuilder();
    const face = (ax, az, bx, bz, y0, y1, n) => {
      const len = Math.hypot(bx - ax, bz - az);
      const nu = Math.max(1, Math.ceil(len / 1.6));
      const nv = Math.max(1, Math.ceil((y1 - y0) / 1.6));
      const S = 4;
      // u runs along the wall from its start, so textures line up across pieces
      const u0 = n[2] !== 0 ? (n[2] > 0 ? ax - X0 : X1 - ax) : n[0] > 0 ? Z1 - az : az - Z0;
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const f0 = i / nu;
          const f1 = (i + 1) / nu;
          const yA = y0 + ((y1 - y0) * j) / nv;
          const yB = y0 + ((y1 - y0) * (j + 1)) / nv;
          const P0 = [lerp(ax, bx, f0), yA, lerp(az, bz, f0)];
          const P1 = [lerp(ax, bx, f1), yA, lerp(az, bz, f1)];
          const P2 = [lerp(ax, bx, f1), yB, lerp(az, bz, f1)];
          const P3 = [lerp(ax, bx, f0), yB, lerp(az, bz, f0)];
          const g = (y) => shade('#ffffff', 0.62 + 0.38 * smoothstep(Yb, Yb + 2.2, y));
          shell.quad(P0, P1, P2, P3, n, [(u0 + f0 * len) / S, yA / S, (u0 + f1 * len) / S, yA / S, (u0 + f1 * len) / S, yB / S, (u0 + f0 * len) / S, yB / S], [g(yA), g(yA), g(yB), g(yB)]);
        }
    };
    face(X0, Z1, lx(DOOR[0]), Z1, Yb, Yt, [0, 0, 1]);
    face(lx(DOOR[1]), Z1, lx(22.35), Z1, Yb, Yt, [0, 0, 1]);
    face(lx(22.35), Z1, lx(23.25), Z1, Yb, ly(3.6), [0, 0, 1]);
    face(lx(22.35), Z1, lx(23.25), Z1, ly(5.7), Yt, [0, 0, 1]);
    face(lx(23.25), Z1, X1, Z1, Yb, Yt, [0, 0, 1]);
    face(lx(DOOR[0]), Z1, lx(DOOR[1]), Z1, ly(2.6), Yt, [0, 0, 1]);
    face(X1, Z0, X0, Z0, Yb, Yt, [0, 0, -1]);
    face(X0, Z0, X0, Z1, Yb, Yt, [-1, 0, 0]);
    face(X1, Z1, X1, Z0, Yb, Yt, [1, 0, 0]);
    const shellMat = new THREE.MeshLambertMaterial({ map: ct.concrete, vertexColors: true });
    const shellMesh = new THREE.Mesh(shell.build(), shellMat);
    shellMesh.name = 'club:shell';
    this.outside.add(shellMesh);

    // --- steel and trim: plinth, coping, canopy, window frames, shutter frames, roof gear
    const st = new GeoBuilder();
    const dark = shade('#2a2c30');
    const box = (x0, y0, z0, x1, y1, z1, col = dark, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: col, bottom: true, ...op });
    box(X0, Yb, Z1, lx(DOOR[0]), Yb + 0.55, Z1 + 0.06, shade('#5a5a5e'));
    box(lx(DOOR[1]), Yb, Z1, X1, Yb + 0.55, Z1 + 0.06, shade('#5a5a5e'));
    box(X0 - 0.03, Yt, Z0 - 0.03, X1 + 0.03, Yt + 0.32, Z1 + 0.12, shade('#6a6a6e'));
    // canopy over the door with three downlights
    box(lx(4.4), ly(2.85), Z1, lx(8.8), ly(3.1), Z1 + 1.5, shade('#1e1e22'));
    for (const x of [4.6, 8.6]) box(lx(x) - 0.03, ly(3.1), Z1 + 1.42, lx(x) + 0.03, ly(3.7), Z1 + 1.48, shade('#1e1e22'));
    // clerestory window frames (front) and side windows
    this.windowGlows = [];
    const frontWin = [];
    for (let k = 0; k < 5; k++) frontWin.push(12.4 + k * 2.05);
    for (const x of frontWin) {
      box(lx(x) - 0.08, ly(4.62), Z1, lx(x + 1.6) + 0.08, ly(4.7), Z1 + 0.08);
      box(lx(x) - 0.08, ly(6.6), Z1, lx(x + 1.6) + 0.08, ly(6.68), Z1 + 0.08);
      box(lx(x) - 0.08, ly(4.7), Z1, lx(x), ly(6.6), Z1 + 0.08);
      box(lx(x + 1.6), ly(4.7), Z1, lx(x + 1.6) + 0.08, ly(6.6), Z1 + 0.08);
      box(lx(x + 0.78), ly(4.7), Z1, lx(x + 0.82), ly(6.6), Z1 + 0.06);
      this.windowGlows.push({ a: [lx(x), ly(4.7), Z1 + 0.015], b: [lx(x + 1.6), ly(6.6), Z1 + 0.015], n: [0, 0, 1] });
    }
    for (const z of [4.6, 8.6, 12.6]) {
      for (const [X, sgn] of [
        [X0, -1],
        [X1, 1],
      ]) {
        const zz = o.z + z;
        box(X + (sgn < 0 ? -0.03 : 0), ly(4.62), zz - 0.08, X + (sgn > 0 ? 0.03 : 0), ly(6.68), zz + 1.68);
        this.windowGlows.push({ a: [X + sgn * 0.035, ly(4.75), zz], b: [X + sgn * 0.035, ly(6.55), zz + 1.6], n: [sgn, 0, 0] });
      }
    }
    // roller shutters: lintels and guides
    for (const [x0, x1] of [
      [13.0, 16.6],
      [18.4, 22.0],
    ]) {
      box(lx(x0 - 0.2), ly(3.2), Z1, lx(x1 + 0.2), ly(3.45), Z1 + 0.14);
      box(lx(x0 - 0.15), Yb, Z1, lx(x0), ly(3.2), Z1 + 0.09);
      box(lx(x1), Yb, Z1, lx(x1 + 0.15), ly(3.2), Z1 + 0.09);
      box(lx(x0), Yb, Z1, lx(x1), Yb + 0.06, Z1 + 0.07, shade('#3a3a3e'));
    }
    // roof: old insulator gantry, vents, an AC unit
    const rx = (o.x + X1) / 2;
    for (const z of [Z0 + 3, Z0 + 8]) {
      box(rx - 4, Yt + 0.32, z - 0.1, rx - 3.8, Yt + 3.2, z + 0.1);
      box(rx + 3.8, Yt + 0.32, z - 0.1, rx + 4, Yt + 3.2, z + 0.1);
      box(rx - 4, Yt + 3.2, z - 0.1, rx + 4, Yt + 3.4, z + 0.1);
      for (const dx of [-2.4, 0, 2.4]) {
        for (let k = 0; k < 4; k++) st.addGeometry(new THREE.CylinderGeometry(k % 2 ? 0.1 : 0.17, k % 2 ? 0.1 : 0.17, 0.12, 10), trs(rx + dx, Yt + 2.62 + k * 0.13, z), shade(k % 2 ? '#7a4a2a' : '#d8d2c4'));
      }
    }
    box(X0 + 1.2, Yt + 0.32, Z0 + 4.6, X0 + 3.4, Yt + 1.5, Z0 + 6.6, shade('#9a9ca0'));
    box(X1 - 3, Yt + 0.32, Z0 + 5.0, X1 - 2.4, Yt + 2.2, Z0 + 5.6, shade('#5a5a5e'));
    // the rope line: brass stanchions
    this.ropeZ = Z1 + 0.82;
    const posts = [0.0, 1.3, 2.6, 3.9, 5.2];
    for (const x of posts) {
      st.addGeometry(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 12), trs(lx(x), Yb + 0.015, this.ropeZ), shade('#c8a04a'));
      st.addGeometry(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), trs(lx(x), Yb + 0.48, this.ropeZ), shade('#c8a04a'));
      st.addGeometry(new THREE.SphereGeometry(0.05, 8, 6), trs(lx(x), Yb + 0.97, this.ropeZ), shade('#c8a04a'));
    }
    for (let k = 0; k < posts.length - 1; k++) {
      const a = new THREE.Vector3(lx(posts[k]), Yb + 0.9, this.ropeZ);
      const b = new THREE.Vector3(lx(posts[k + 1]), Yb + 0.9, this.ropeZ);
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.22, 0));
      st.addGeometry(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.025, 5), trs(0, 0, 0), shade('#8a1a2a'));
    }
    this.city.colliders.add(lx(-0.05), this.ropeZ - 0.06, lx(5.25), this.ropeZ + 0.06, Yb, Yb + 1.0);
    // fries cart on the curb side of the pavement
    const cx = lx(13.85);
    const cz = Z1 + 2.55;
    this.cart = { x: cx, z: cz };
    box(cx - 0.85, Yb + 0.32, cz - 0.38, cx + 0.85, Yb + 1.0, cz + 0.38, shade('#e8e4d8'));
    box(cx - 0.86, Yb + 0.62, cz - 0.39, cx + 0.86, Yb + 0.72, cz + 0.39, shade('#c82a2a'));
    box(cx - 0.9, Yb + 1.0, cz - 0.5, cx + 0.9, Yb + 1.04, cz + 0.42, shade('#a8acb0'));
    for (const x of [-0.9, 0.9]) st.addGeometry(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), trs(cx + x, Yb + 0.22, cz, 0, 1, 1, 1, 0, Math.PI / 2), shade('#1a1a1a'));
    for (const [x, z] of [
      [-0.82, -0.36],
      [0.82, -0.36],
      [-0.82, 0.36],
      [0.82, 0.36],
    ])
      box(cx + x - 0.02, Yb + 1.04, cz + z - 0.02, cx + x + 0.02, Yb + 2.05 + ((z + 0.62) / 1.12) * 0.25, cz + z + 0.02, shade('#a8acb0'));
    for (let k = 0; k < 6; k++) {
      const x0 = cx - 1.0 + k * (2.0 / 6);
      st.quad2([x0, Yb + 2.05, cz - 0.62], [x0 + 2.0 / 6, Yb + 2.05, cz - 0.62], [x0 + 2.0 / 6, Yb + 2.3, cz + 0.5], [x0, Yb + 2.3, cz + 0.5], [0, 0.98, -0.2], [0, 0, 1, 1], shade(k % 2 ? '#f2f0e8' : '#c82a2a'));
    }
    this.city.colliders.add(cx - 0.9, cz - 0.5, cx + 0.9, cz + 0.45, Yb, Yb + 2.3);

    // --- shutters, ghost lettering, posters, signs (lit decals)
    const decals = new Map();
    const decalB = (mat) => decals.get(mat) ?? decals.set(mat, new GeoBuilder()).get(mat);
    const decal = (mat, x0, y0, x1, y1, z, uv = [0, 0, 1, 1]) => decalB(mat).quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], uv);
    const shutterMat = new THREE.MeshLambertMaterial({ map: ct.shutter });
    decal(shutterMat, lx(13.0), Yb + 0.06, lx(16.6), ly(3.2), Z1 + 0.03, [0, 0, 0.55, 1]);
    decal(shutterMat, lx(18.4), Yb + 0.06, lx(22.0), ly(3.2), Z1 + 0.03, [0.45, 0, 1, 1]);
    const ghostMat = new THREE.MeshLambertMaterial({ map: ct.ghost, transparent: true, depthWrite: false });
    decal(ghostMat, lx(3.7), ly(6.85), lx(19.7), ly(7.85), Z1 + 0.012);
    const posterMat = new THREE.MeshLambertMaterial({ map: this.tex.posters.map });
    for (let k = 0; k < 6; k++) decal(posterMat, lx(0.4 + k * 0.82), ly(0.85), lx(1.05 + k * 0.82), ly(2.15), Z1 + 0.012, [(k % 4) / 4, 0, ((k % 4) + 1) / 4, 1]);
    const signMat = new THREE.MeshLambertMaterial({ map: this.tex.clubSigns.map, emissive: '#ffffff', emissiveMap: this.tex.clubSigns.map, emissiveIntensity: 0.15 });
    this.signMat = signMat;
    decal(signMat, lx(8.2), ly(1.62), lx(10.0), ly(1.73), Z1 + 0.012, signUV(14));
    // tonight's theme in a lightbox over the door signs
    const [tc, tg] = makeCanvas(256, 96);
    this.tonightG = tg;
    this.tonightTex = makeTex(tc, { repeat: false });
    this.tonightMat = new THREE.MeshLambertMaterial({ map: this.tonightTex, emissive: '#ffffff', emissiveMap: this.tonightTex, emissiveIntensity: 0.3 });
    box(lx(8.15), ly(1.86), Z1, lx(10.05), ly(2.56), Z1 + 0.06, shade('#141416'));
    decal(this.tonightMat, lx(8.2), ly(1.9), lx(10.0), ly(2.52), Z1 + 0.067);
    decal(signMat, lx(8.2), ly(1.48), lx(10.0), ly(1.59), Z1 + 0.012, signUV(10));
    decal(signMat, lx(8.2), ly(1.34), lx(10.0), ly(1.45), Z1 + 0.012, signUV(7));
    decal(signMat, lx(16.85), ly(2.2), lx(18.25), ly(2.29), Z1 + 0.012, signUV(6));
    // fries sign on the awning, both faces
    decalB(signMat).quad2([cx - 0.9, Yb + 1.82, cz - 0.64], [cx + 0.9, Yb + 1.82, cz - 0.64], [cx + 0.9, Yb + 2.02, cz - 0.64], [cx - 0.9, Yb + 2.02, cz - 0.64], [0, 0, -1], signUV(15));

    // --- the neon sign over the canopy, on a steel backer
    box(lx(2.5), ly(3.55), Z1, lx(10.7), ly(5.65), Z1 + 0.14, shade('#141416'));
    this.neonMat = additive({ map: ct.neon, color: new THREE.Color('#ffffff'), opacity: 1 });
    decal(this.neonMat, lx(2.6), ly(3.6), lx(10.6), ly(5.6), Z1 + 0.16);
    for (const [mat, b] of decals) {
      const mesh = new THREE.Mesh(b.build(), mat);
      if (mat === this.neonMat) mesh.renderOrder = 3;
      this.outside.add(mesh);
    }
    const stMesh = new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    stMesh.name = 'club:steel';
    this.outside.add(stMesh);

    // --- things that glow at night
    this.winMat = additive({ map: null, color: new THREE.Color('#000000'), opacity: 1 });
    const wg = new GeoBuilder();
    for (const g of this.windowGlows) {
      const { a, b, n } = g;
      if (n[2]) wg.quad([a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]], n);
      else if (n[0] < 0) wg.quad([a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]], n);
      else wg.quad([a[0], a[1], b[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [a[0], b[1], b[2]], n);
    }
    const winGlass = new THREE.Mesh(wg.build(), new THREE.MeshLambertMaterial({ color: '#1a2230' }));
    this.outside.add(winGlass);
    const winGlow = new THREE.Mesh(winGlass.geometry.clone().translate(0, 0, 0), this.winMat);
    // nudge the glow just in front of the dark glass
    const gp = winGlow.geometry.attributes.position;
    const gn = winGlow.geometry.attributes.normal;
    for (let i = 0; i < gp.count; i++) gp.setXYZ(i, gp.getX(i) + gn.getX(i) * 0.01, gp.getY(i), gp.getZ(i) + gn.getZ(i) * 0.01);
    winGlow.renderOrder = 3;
    this.outside.add(winGlow);

    this.downMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    const db = new GeoBuilder();
    for (const x of [5.0, 6.6, 8.2]) db.addGeometry(new THREE.CircleGeometry(0.09, 10).rotateX(Math.PI / 2), trs(lx(x), ly(2.845), Z1 + 0.9));
    this.outside.add(new THREE.Mesh(db.build(), this.downMat));
    this.poolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffb8e8'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, CITY.SIDEWALK - 0.2).rotateX(-Math.PI / 2), this.poolMat);
    pool.position.set(lx(6.6), CITY.CURB + 0.03, Z1 + CITY.SIDEWALK / 2);
    pool.renderOrder = 2;
    this.outside.add(pool);
    this.cartMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffc870'), opacity: 0 });
    const cartPool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.0).rotateX(-Math.PI / 2), this.cartMat);
    cartPool.position.set(cx, CITY.CURB + 0.035, cz - 0.4);
    cartPool.renderOrder = 2;
    this.outside.add(cartPool);
    this.cartLamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.7), new THREE.MeshBasicMaterial({ color: '#000000' }));
    this.cartLamp.position.set(cx, Yb + 2.02, cz - 0.05);
    this.outside.add(this.cartLamp);

    // where people stand outside
    this.bouncerSpot = { ...xz(this.w(8.45, D + 0.3 + 0.62)), yaw: 0 };
    this.queueSpots = [];
    for (let k = 0; k < 8; k++) this.queueSpots.push({ ...xz(this.w(4.85 - k * 0.66, D + 0.3 + 0.38)), yaw: Math.PI / 2 });
    this.doorOut = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.3 + 0.6);
    this.doorIn = this.w((DOOR[0] + DOOR[1]) / 2, D - 0.7);
    this.doorCenter = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.3);
    this.vendorSpot = { x: cx, z: cz + 0.68, yaw: Math.PI };
    this.friesSpot = { x: cx, z: cz - 1.05 };
    this.outsideSpot = { x: lx(6.6), z: Z1 + 2.0, yaw: Math.PI };
    this.buildRoof();
  }

  /** The fire escape up the facade and the roof terrace (outdoor, lit by sun and street). */
  buildRoof() {
    const o = this.origin;
    const s = this.site;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;
    const lz = (z) => o.z + z;
    const Z1 = s.z1;
    const Yt = o.y + ROOF;
    const DK = ly(ROOF_DECK);
    const col = this.city.colliders;
    const st = new GeoBuilder();
    const steel = shade('#30353a');
    const box = (x0, y0, z0, x1, y1, z1, c = steel, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: c, bottom: true, ...op });
    const slope = (ax, ay, bx, by, z, h, t, c = steel) => {
      const len = Math.hypot(bx - ax, by - ay);
      st.addGeometry(new THREE.BoxGeometry(len, h, t), trs((ax + bx) / 2, (ay + by) / 2, z, 0, 1, 1, 1, 0, Math.atan2(by - ay, bx - ax)), c);
    };

    // --- fire escape: a landing outside the stair-room door, 14 steps up to the roof
    const fz0 = Z1 + 0.05;
    const fz1 = Z1 + 1.1;
    box(lx(21.7), ly(3.52), Z1, lx(23.6), ly(3.6), Z1 + 1.15);
    for (const x of [21.75, 22.6, 23.55]) box(lx(x) - 0.02, ly(3.6), Z1 + 1.11, lx(x) + 0.02, ly(4.65), Z1 + 1.15);
    box(lx(21.7), ly(4.62), Z1 + 1.1, lx(23.6), ly(4.67), Z1 + 1.16);
    box(lx(23.55), ly(4.62), Z1, lx(23.6), ly(4.67), Z1 + 1.15);
    for (const x of [21.9, 23.4]) slope(lx(x), ly(2.6), lx(x), ly(3.5), Z1 + 0.6, 0.06, 1.0, shade('#25292d'));
    col.add(lx(21.7), Z1 + 1.1, lx(23.65), Z1 + 1.22, ly(3.6), ly(4.7));
    col.add(lx(23.55), Z1, lx(23.65), Z1 + 1.2, ly(3.6), ly(4.7));
    for (let k = 0; k < 14; k++) {
      const xb = 21.7 - k * FE_RUN;
      const top = 3.6 + (k + 1) * FE_RISE;
      box(lx(xb - FE_RUN), ly(top - 0.035), fz0, lx(xb), ly(top), fz1, steel);
    }
    for (const z of [fz0 - 0.02, fz1 + 0.02]) slope(lx(21.7), ly(3.45), lx(15.9), ly(ROOF_DECK - 0.15), z, 0.22, 0.04);
    slope(lx(21.7), ly(4.55), lx(15.9), ly(ROOF_DECK + 0.95), fz1 + 0.04, 0.05, 0.05);
    for (let k = 1; k < 14; k += 2) {
      const x = 21.7 - (k + 0.5) * FE_RUN;
      const top = 3.6 + (k + 1) * FE_RISE;
      box(lx(x) - 0.015, ly(top), fz1 + 0.02, lx(x) + 0.015, ly(top + 0.95), fz1 + 0.06);
    }
    col.add(lx(15.9), fz1 + 0.01, lx(21.7), fz1 + 0.12, ly(3.4), ly(ROOF_DECK + 1.1));
    // top landing, bridging the parapet gap onto the roof
    box(lx(14.9), DK - 0.08, Z1 - 0.25, lx(15.9), DK, Z1 + 1.1); // meets the deck edge, no overlap
    box(lx(14.85), DK, Z1, lx(14.9), DK + 1.05, Z1 + 1.15);
    box(lx(14.9), DK + 1.0, Z1 + 1.1, lx(15.9), DK + 1.05, Z1 + 1.15);
    col.add(lx(14.8), Z1, lx(14.92), Z1 + 1.2, DK, DK + 1.1);
    col.add(lx(14.9), Z1 + 1.08, lx(15.9), Z1 + 1.2, DK, DK + 1.1);

    // --- parapet around the roof, a steel rail along the street side, the terrace deck
    const pb = new GeoBuilder();
    const py0 = Yt + 0.32;
    const py1 = Yt + 1.2;
    const S4 = { sx: 4, sy: 4, topScale: 4, bottom: false };
    for (const [x0, z0, x1, z1] of [
      [s.x0, Z1 - 0.25, lx(14.9), Z1],
      [lx(15.9), Z1 - 0.25, s.x1, Z1],
      [s.x0, s.z0, s.x1, s.z0 + 0.25],
      [s.x0, s.z0 + 0.25, s.x0 + 0.25, Z1 - 0.25],
      [s.x1 - 0.25, s.z0 + 0.25, s.x1, Z1 - 0.25],
    ]) {
      pb.box(x0, py0, z0, x1, py1, z1, S4);
      box(x0 - 0.02, py1, z0 - 0.02, x1 + 0.02, py1 + 0.05, z1 + 0.02, shade('#5a5a5e'));
      col.add(x0, z0, x1, z1, Yt, py1 + 0.5);
    }
    this.outside.add(new THREE.Mesh(pb.build(), new THREE.MeshLambertMaterial({ map: this.ct.concrete })));
    for (const x of [0.3, 3.0, 6.0, 9.0, 12.0, 14.85, 15.95, 19.0, 22.0, 23.35]) box(lx(x) - 0.02, py1 + 0.05, Z1 - 0.14, lx(x) + 0.02, py1 + 0.45, Z1 - 0.1);
    box(s.x0, py1 + 0.42, Z1 - 0.15, lx(14.9), py1 + 0.47, Z1 - 0.09);
    box(lx(15.9), py1 + 0.42, Z1 - 0.15, s.x1, py1 + 0.47, Z1 - 0.09);
    const deck = new GeoBuilder();
    deck.box(s.x0 + 0.25, py0, lz(ROOF_DECK_Z), s.x1 - 0.25, DK, Z1 - 0.25, { sx: 1.6, sy: 1.6, topScale: 1.6, bottom: false });
    this.outside.add(new THREE.Mesh(deck.build(), new THREE.MeshLambertMaterial({ map: this.tex.woodWorn.map, color: '#8a8278' })));
    col.add(s.x0 + 1.2, s.z0 + 4.6, s.x0 + 3.4, s.z0 + 6.6, Yt, Yt + 1.5);
    col.add(s.x1 - 3, s.z0 + 5.0, s.x1 - 2.4, s.z0 + 5.6, Yt, Yt + 2.2);
    for (const z of [3, 8]) for (const x of [-4, 3.8]) col.add((o.x + s.x1) / 2 + x, s.z0 + z - 0.1, (o.x + s.x1) / 2 + x + 0.2, s.z0 + z + 0.1, Yt, Yt + 3.4);

    // --- terrace furniture: two sofas round a table, a bench at the parapet, high tables, a bar
    const wood = shade('#6a4a32');
    const cushion = shade('#c8b89a');
    this.roofSeats = [];
    const sofa = (cx, cz, face) => {
      // face: +1 looks south (+z), -1 looks north
      const zb = cz - face * 0.35;
      box(lx(cx - 1.0), DK, lz(cz - 0.4), lx(cx + 1.0), DK + 0.38, lz(cz + 0.4), wood);
      box(lx(cx - 0.95), DK + 0.38, lz(cz - 0.35), lx(cx + 0.95), DK + 0.48, lz(cz + 0.35), cushion);
      box(lx(cx - 1.0), DK + 0.38, lz(zb - 0.05), lx(cx + 1.0), DK + 0.9, lz(zb + 0.05), wood);
      for (const sx of [-1, 1]) box(lx(cx + sx * 0.97) - 0.04, DK + 0.38, lz(cz - 0.4), lx(cx + sx * 0.97) + 0.04, DK + 0.65, lz(cz + 0.4), wood);
      col.add(lx(cx - 1.0), lz(cz - 0.4), lx(cx + 1.0), lz(cz + 0.4), DK, DK + 0.9);
      for (const sx of [-0.45, 0.45]) this.roofSeats.push({ x: lx(cx + sx), z: lz(cz + face * 0.05), y: DK, yaw: face > 0 ? 0 : Math.PI, roof: true, out: { x: lx(cx + sx * 2.9), z: lz(cz) } });
    };
    sofa(4.0, 12.0, 1);
    sofa(4.0, 14.6, -1);
    box(lx(3.4), DK, lz(13.0), lx(4.6), DK + 0.4, lz(13.6), wood);
    col.add(lx(3.4), lz(13.0), lx(4.6), lz(13.6), DK, DK + 0.4);
    // bench facing over the parapet, toward the Lantern Quarter
    box(lx(8.0), DK, lz(16.6), lx(10.8), DK + 0.42, lz(17.1), wood);
    col.add(lx(8.0), lz(16.6), lx(10.8), lz(17.1), DK, DK + 0.45);
    for (const x of [8.7, 10.1]) this.roofSeats.push({ x: lx(x), z: lz(16.85), y: DK, yaw: 0, roof: true, out: { x: lx(x), z: lz(16.1) } });
    for (const [x, z] of [
      [10.4, 13.6],
      [13.4, 14.8],
    ]) {
      st.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 14), trs(lx(x), DK + 1.06, lz(z)), shade('#2a2a2e'));
      st.addGeometry(new THREE.CylinderGeometry(0.035, 0.035, 1.04, 8), trs(lx(x), DK + 0.52, lz(z)), shade('#8a8c90'));
      col.add(lx(x) - 0.28, lz(z) - 0.28, lx(x) + 0.28, lz(z) + 0.28, DK, DK + 1.08);
    }
    // roof bar: a steel counter with a cooler, facing the terrace
    box(lx(18.6), DK, lz(10.4), lx(21.4), DK + 1.05, lz(11.0), shade('#3a3e44'));
    box(lx(18.55), DK + 1.05, lz(10.35), lx(21.45), DK + 1.1, lz(11.08), shade('#8a8c90'));
    box(lx(18.9), DK, lz(9.2), lx(20.1), DK + 0.8, lz(9.7), shade('#2a6ae0'));
    col.add(lx(18.55), lz(10.35), lx(21.45), lz(11.08), DK, DK + 1.1);
    col.add(lx(18.9), lz(9.2), lx(20.1), lz(9.7), DK, DK + 0.8);
    this.roofBarSpot = { x: lx(20.0), z: lz(11.55) };
    this.roofBartenderSpot = { x: lx(20.0), z: lz(9.95), y: DK, yaw: 0 };
    // planters along the east parapet
    for (const z of [10.0, 12.5, 15.0]) {
      box(lx(22.75), DK, lz(z - 0.5), lx(23.4), DK + 0.55, lz(z + 0.5), shade('#4a4a50'));
      for (const [dx, dz, r] of [
        [0, -0.2, 0.35],
        [0.05, 0.25, 0.3],
        [-0.05, 0, 0.28],
      ])
        st.addGeometry(new THREE.IcosahedronGeometry(r, 0), trs(lx(23.07 + dx), DK + 0.8 + r * 0.4, lz(z + dz)), shade(['#3f6b2e', '#4f8a3a', '#2f5a2a'][Math.round(r * 10) % 3]));
      col.add(lx(22.75), lz(z - 0.5), lx(23.4), lz(z + 0.5), DK, DK + 1.2);
    }
    // patio heaters
    this.heaters = [];
    for (const [x, z] of [
      [6.9, 13.3],
      [16.4, 13.2],
    ]) {
      st.addGeometry(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 12), trs(lx(x), DK + 0.04, lz(z)), steel);
      st.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), trs(lx(x), DK + 1.1, lz(z)), shade('#8a8c90'));
      st.addGeometry(new THREE.ConeGeometry(0.45, 0.22, 14, 1, true), trs(lx(x), DK + 2.3, lz(z)), shade('#a8acb0'));
      col.add(lx(x) - 0.3, lz(z) - 0.3, lx(x) + 0.3, lz(z) + 0.3, DK, DK + 2.4);
      this.heaters.push(new THREE.Vector3(lx(x), DK + 2.0, lz(z)));
    }
    // poles for the string lights
    const poleX = [0.6, 6.35, 11.7, 17.05, 22.8];
    for (const x of poleX)
      for (const z of [ROOF_DECK_Z + 0.4, D + 0.15]) {
        box(lx(x) - 0.03, DK, lz(z) - 0.03, lx(x) + 0.03, DK + 3.1, lz(z) + 0.03, shade('#2a2a2e'));
        col.add(lx(x) - 0.06, lz(z) - 0.06, lx(x) + 0.06, lz(z) + 0.06, DK, DK + 3.1);
      }
    const roofMesh = new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    roofMesh.name = 'club:roof';
    this.outside.add(roofMesh);

    // --- string lights: two zig-zag strands of warm bulbs across the terrace
    const wires = new GeoBuilder();
    const bulbs = [];
    const back = lz(ROOF_DECK_Z + 0.4);
    const front = lz(D + 0.15);
    for (const flip of [0, 1]) {
      for (let k = 0; k < poleX.length - 1; k++) {
        const za = (k + flip) % 2 ? front : back;
        const zb = (k + flip) % 2 ? back : front;
        const a = new THREE.Vector3(lx(poleX[k]), DK + 3.0, za);
        const b = new THREE.Vector3(lx(poleX[k + 1]), DK + 3.0, zb);
        const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.9, 0)), b);
        wires.addGeometry(new THREE.TubeGeometry(curve, 12, 0.01, 3), trs(0, 0, 0), shade('#1a1a1a'));
        const n = Math.round(a.distanceTo(b) / 0.7);
        for (let j = 1; j < n; j++) bulbs.push(curve.getPoint(j / n));
      }
    }
    this.outside.add(new THREE.Mesh(wires.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const bg = new THREE.BufferGeometry().setFromPoints(bulbs);
    this.bulbMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffd08a'), size: 0.55, points: true, opacity: 0 });
    const bp = new THREE.Points(bg, this.bulbMat);
    bp.renderOrder = 3;
    this.outside.add(bp);
    this.heaterMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ff7a2a'), size: 1.4, points: true, opacity: 0 });
    const hg = new THREE.BufferGeometry().setFromPoints(this.heaters.map((h) => h.clone().add(new THREE.Vector3(0, 0.15, 0))));
    const hp = new THREE.Points(hg, this.heaterMat);
    hp.renderOrder = 3;
    this.outside.add(hp);

    // people up here, and their lights
    const DKy = DK;
    this.roofStand = [
      [9.9, 13.6, Math.PI / 2],
      [10.9, 13.6, -Math.PI / 2],
      [10.4, 14.15, Math.PI],
      [12.9, 14.8, Math.PI / 2],
      [13.9, 14.8, -Math.PI / 2],
      [5.9, 17.05, 0],
      [6.5, 17.05, 0],
      [19.4, 11.6, Math.PI],
    ].map(([x, z, yaw]) => ({ x: lx(x), z: lz(z), y: DKy, yaw }));
    const F3 = (x, y, z, c, power, dist) => ({ x: lx(x), y: DK + y, z: lz(z), color: new THREE.Color(c), power, dist });
    this.roofFixtures = [F3(6.9, 2.2, 13.3, '#ff9a4a', 0.9, 8), F3(16.4, 2.2, 13.2, '#ff9a4a', 0.9, 8), F3(4.0, 2.8, 13.3, '#ffd08a', 0.6, 9), F3(11.7, 2.8, 13.0, '#ffd08a', 0.6, 9), F3(20.0, 2.0, 10.7, '#ffd08a', 0.6, 7), F3(9.4, 2.4, 16.6, '#ffd08a', 0.5, 7)];
  }

  buildDoors() {
    const o = this.origin;
    const mk = (side) => {
      const pivot = new THREE.Group();
      const b = new GeoBuilder();
      const w = 0.99;
      const x0 = side < 0 ? 0.01 : -w;
      const x1 = side < 0 ? w : -0.01;
      b.box(x0, 0, -0.03, x1, 2.58, 0.03, { color: shade('#5a1a22'), bottom: true });
      const px = side < 0 ? 0.55 : -0.55;
      b.addGeometry(new THREE.CircleGeometry(0.15, 14), trs(px, 1.6, 0.036), shade('#1a2230'));
      b.addGeometry(new THREE.CircleGeometry(0.15, 14), trs(px, 1.6, -0.036, Math.PI), shade('#1a2230'));
      b.addGeometry(new THREE.TorusGeometry(0.16, 0.042, 4, 16), trs(px, 1.6, 0), shade('#c8ccd0'));
      b.box(side < 0 ? 0.82 : -0.86, 0.95, -0.07, side < 0 ? 0.86 : -0.82, 1.25, 0.07, { color: shade('#c8ccd0') });
      const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      pivot.add(mesh);
      pivot.position.set(o.x + (side < 0 ? DOOR[0] : DOOR[1]), o.y, o.z + D + 0.24);
      this.outside.add(pivot);
      return pivot;
    };
    this.doorL = mk(-1);
    this.doorR = mk(1);
    // the gate: a collider in the doorway, switched off when you're allowed in
    this.city.colliders.add(o.x + DOOR[0], o.z + D - 0.05, o.x + DOOR[1], o.z + D + 0.32, o.y, o.y + 2.6);
    this.gate = this.city.colliders.boxes[this.city.colliders.boxes.length - 1];
    this.gateTop = this.gate.y1;
    // the VIP balcony door: wristbands only
    this.city.colliders.add(o.x + 17.45, o.z + 14.2, o.x + 17.75, o.z + 15.4, o.y + 3.6, o.y + 5.7);
    this.vipGate = this.city.colliders.boxes[this.city.colliders.boxes.length - 1];
    this.vipGateTop = this.vipGate.y1;
  }

  /**
   * Bottle service: sparklers fizzing on the bottle at `pos`. opts.n: how many
   * (a parade carries them in from opts.from first), opts.time: how long they burn.
   */
  sparkle(pos, opts = {}) {
    this.sparkAt = pos.clone();
    this.sparkFrom = opts.from ? new THREE.Vector3(opts.from.x, pos.y, opts.from.z) : null;
    this.sparkN = opts.n ?? 1;
    this.sparkT = opts.time ?? 9;
    this.sparkT0 = this.sparkT;
    this.sparkAnchors = Array.from({ length: this.sparkN }, () => pos.clone());
  }

  // ==========================================================================
  /**
   * s: { hour, beat (from the sound system, or null), flash: 'full'|'reduced'|'off',
   *      camera, people (positions that open the doors), allow (player may enter), night }
   */
  update(dt, time, env, s) {
    const o = this.origin;
    const cam = s.camera.position;
    // the interior only shows from inside, or through the doors while they're open
    this.group.visible = this.contains(cam, 0.4) || (this.doorOpen > 0.02 && Math.hypot(cam.x - this.doorCenter.x, cam.z - this.doorCenter.z) < 14);
    this.flash = s.flash;
    const status = this.statusAt(s.hour);
    this.status = status;
    // 3:33 to 3:45: the coil hums and the hatch behind it glows
    this.humOpen = status === 'open' && s.hour >= 3.55 && s.hour < 3.75;
    this.hum = damp(this.hum ?? 0, this.humOpen ? 1 : 0, 0.8, dt);
    // the song: follow the sound system when it's playing, otherwise keep time ourselves
    if (s.beat != null) this.beat = s.beat;
    else this.beat += (dt * BPM) / 60;
    const S = (this.section = sectionAt(this.beat / 4));
    const playing = status === 'open';
    this.lightsUp = damp(this.lightsUp, status === 'open' ? 0 : 1, status === 'lightsup' ? 2.5 : 1, dt);

    // gate
    this.allowPlayer = !!s.allow;
    this.gate.y1 = this.allowPlayer ? -10 : this.gateTop;
    this.vipGate.y1 = s.vip ? -10 : this.vipGateTop;
    let want = 0;
    for (const p of s.people) if (Math.hypot(p.x - this.doorCenter.x, p.z - this.doorCenter.z) < 1.9) want = 1;
    this.doorOpen = damp(this.doorOpen, want, want ? 5 : 3, dt);
    this.doorL.rotation.y = -this.doorOpen * 1.45;
    this.doorR.rotation.y = this.doorOpen * 1.45;

    // ---------------------------------------------------------------- the show
    const fl = this.flash;
    const pulseAmt = fl === 'full' ? 1 : fl === 'reduced' ? 0.45 : 0;
    const bph = ((this.beat % 1) + 1) % 1;
    const kick = S.kick ? Math.exp(-bph * (fl === 'full' ? 7 : 3.5)) : 0;
    this.kick = playing ? kick : 0;
    const bar = Math.floor(this.beat / 4);
    const PAL = this.palettes;
    const pal = PAL[((Math.floor(bar / 8) % PAL.length) + PAL.length) % PAL.length];
    const nid = this.night.id;
    const prog = (S.bar + (this.beat % 4) / 4) / S.len;
    const e = playing ? (S.name === 'build' ? 0.3 + prog * 0.6 : S.energy) : 0;
    const beatN = Math.floor(this.beat);
    // two washes; in the drop they trade places on every beat
    const swap = S.name === 'drop' && fl !== 'off' && beatN % 2 === 1;
    const A = pal[swap ? 1 : 0];
    const B2 = pal[swap ? 0 : 1];
    const base = 0.18 + 0.5 * e;
    const pk = pulseAmt * kick * (0.4 + 0.8 * e);
    const breakdown = S.name === 'breakdown' || S.name === 'build';
    this.wash[0].copy(breakdown ? _deep : A).multiplyScalar(playing ? base + pk : 0);
    this.wash[1].copy(breakdown ? _violet : B2).multiplyScalar(playing ? base + pk : 0);
    // strobe: only with flashing lights on full, on the last bars of the build and the drop's first beats
    let strobe = 0;
    if (playing && fl === 'full' && this.night.strobe) {
      const sixteenth = Math.floor(this.beat * 4);
      if (S.name === 'build' && S.bar >= S.len - 1) strobe = sixteenth % 2 === 0 ? 1 : 0;
      if (S.name === 'drop' && S.bar % 8 === 0 && this.beat % 4 < 1) strobe = (this.beat * 8) % 1 < 0.35 ? 1 : 0;
    }
    const house = lerp(playing ? 0.035 : 0.06, 1.0, this.lightsUp) + strobe * 1.8;
    const u = this.uniforms.uFx.value;
    u[0].setRGB(house, house * 0.97, house * 0.9);
    u[1].copy(this.wash[0]).multiplyScalar(1.6);
    u[2].copy(this.wash[1]).multiplyScalar(1.6);

    // LED floor
    const n = FLOOR.n;
    const avg = this.floorCol.setRGB(0, 0, 0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let v = 0;
        let col = A;
        const dc = Math.hypot(i - 3.5, j - 3.5);
        if (!playing) v = 0;
        else if (fl === 'off') {
          v = 0.25 + 0.2 * Math.sin(dc * 0.9 - this.beat * 0.4);
          col = (i + j) % 2 ? A : B2;
        } else if (S.name === 'intro') {
          v = ((i + j + Math.floor(this.beat / 2)) % 2 ? 0.5 : 0.08) * (0.7 + 0.3 * kick);
        } else if (nid === 'low' && S.name !== 'drop') {
          // LOW VOLTAGE: slow ripples out from the middle
          v = 0.2 + 0.35 * Math.max(0, Math.sin(dc * 1.1 - this.beat * 0.6));
          col = dc < 2 ? B2 : A;
        } else if (nid === 'static' && (S.name === 'groove' || S.name === 'drop')) {
          // STATIC: tiles flicker like a dead channel
          const h = hash(i, j, Math.floor(this.beat * 4));
          v = h > 0.72 ? 0.9 : h > 0.5 ? 0.25 * (1 + kick) : 0.03;
          col = h > 0.9 ? _white : h > 0.8 ? B2 : A;
        } else if (S.name === 'groove') {
          const row = Math.floor(this.beat * 2) % 8;
          v = j === row || j === 7 - row ? 0.95 : 0.1 + 0.25 * kick;
          col = j === row ? A : B2;
          if (nid === 'overload' && (i + j + beatN) % 4 === 0) v = Math.max(v, 0.7 * kick);
        } else if (S.name === 'breakdown') {
          v = 0.25 + 0.25 * Math.sin(dc * 1.4 - this.beat * 1.2);
          col = _violet;
        } else if (S.name === 'build') {
          v = j >= 8 - Math.ceil(prog * 8) ? 0.8 : 0.06;
          col = A;
        } else {
          const h = hash(i, j, beatN);
          v = h > 0.55 ? 0.6 + 0.6 * kick : 0.08 + 0.4 * kick * (1 - dc / 5);
          col = h > 0.8 ? _white : h > 0.65 ? B2 : A;
        }
        if (strobe) {
          v = 1.4;
          col = _white;
        }
        _c.copy(col).multiplyScalar(v * (1 - this.lightsUp));
        this.tiles.setColorAt(i * n + j, _c);
        avg.add(_c);
      }
    this.tiles.instanceColor.needsUpdate = true;
    avg.multiplyScalar(1 / (n * n));
    const coilGlow = playing ? 0.35 + 0.65 * (S.name === 'drop' ? kick : 0.3 + 0.2 * Math.sin(this.beat * 0.5)) : 0.05;
    u[3].copy(avg).multiplyScalar(1.4).add(_c.copy(A).multiplyScalar(coilGlow * 0.5));
    for (const d of this.dyn) {
      if (d.ch === 3) d.mat.color.copy(A).lerp(_white, 0.3).lerp(_violet, this.hum).multiplyScalar(Math.max(coilGlow, this.hum * 1.2) * d.k);
      else d.mat.color.copy(this.wash[d.ch - 1]).multiplyScalar(d.k * (1 - this.lightsUp * 0.8));
    }
    this.cones.position.z = this.kick * 0.03;

    // mirror ball: lit by a pinspot in the breakdown and the drop
    const ballOn = playing && (breakdown || S.name === 'drop') ? 1 : 0;
    this.ballOn = damp(this.ballOn ?? 0, ballOn, 1.5, dt);
    this.ball.rotation.y += dt * 0.5;
    this.ballMat.color.setScalar(0.4 + this.ballOn * 1.4);
    this.spotMat.opacity = this.ballOn * (S.name === 'drop' ? 0.6 : 0.95);
    if (this.ballOn > 0.01 && this.group.visible) {
      const pos = this.spots.geometry.attributes.position;
      const ry = this.ball.rotation.y;
      const cs = Math.cos(ry);
      const sn = Math.sin(ry);
      const bx = this.ballPos.x - o.x;
      const by = this.ballPos.y - o.y;
      const bz = this.ballPos.z - o.z;
      this.spotDirs.forEach((dv, k) => {
        const dx = dv.x * cs - dv.z * sn;
        const dz = dv.x * sn + dv.z * cs;
        const dy = dv.y;
        let t = Infinity;
        if (dx > 1e-4) t = Math.min(t, (W - 0.03 - bx) / dx);
        if (dx < -1e-4) t = Math.min(t, (0.03 - bx) / dx);
        if (dz > 1e-4) t = Math.min(t, (FRONT - 0.15 - bz) / dz);
        if (dz < -1e-4) t = Math.min(t, (0.03 - bz) / dz);
        if (dy > 1e-4) t = Math.min(t, (H - 0.03 - by) / dy);
        if (dy < -1e-4) t = Math.min(t, (0.03 - by) / dy);
        pos.setXYZ(k, o.x + bx + dx * t, o.y + by + dy * t, o.z + bz + dz * t);
      });
      pos.needsUpdate = true;
    }

    // moving heads: sweep patterns that change with the section
    const sweepRate = fl === 'off' ? 0.25 : S.name === 'drop' ? 1 : 0.5;
    const tb = this.beat * Math.PI * 0.25 * sweepRate;
    const beamOn = playing && S.name !== 'breakdown' ? 0.35 + 0.65 * e : playing ? 0.15 : 0;
    for (const h of this.heads) {
      const dir = h.side ? 1 : -1;
      const fan = S.name === 'drop' ? Math.sin(tb + h.k * 0.8) * 0.75 : Math.sin(tb * 0.7 + h.k) * 0.45;
      const tilt = S.name === 'intro' ? 0.15 : S.name === 'build' ? 0.15 + prog * 0.9 : 0.55 + 0.25 * Math.sin(tb * 1.3 + h.k);
      h.rot.set(tilt * dir * (h.k % 2 ? 1 : -1), fan + (h.k % 4) * 0.4, fan * 0.5, 'YXZ');
      _m.compose(h.pos, _q.setFromEuler(h.rot), _one);
      this.headMesh.setMatrixAt(h.k, _m);
      this.beamMesh.setMatrixAt(h.k, _m);
      h.color.copy(h.k % 2 ? this.wash[1] : this.wash[0]).multiplyScalar(beamOn * (0.45 + 0.4 * kick * pulseAmt));
      if (strobe) h.color.setScalar(0.9);
      this.beamMesh.setColorAt(h.k, h.color);
    }
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.beamMesh.instanceMatrix.needsUpdate = true;
    this.beamMesh.instanceColor.needsUpdate = true;

    // lasers in the drop (and through the groove on OVERLOAD); STATIC's are white and cyan
    const laserOn = playing && (S.name === 'drop' || (this.night.lasers && S.name === 'groove')) ? (fl === 'off' ? 0.35 : (S.name === 'drop' ? 0.55 : 0.3) + 0.45 * kick) : 0;
    this.laserMat.opacity = laserOn;
    this.lasers.visible = laserOn > 0.01;
    if (this.lasers.visible) {
      const fanW = fl === 'off' ? 0.9 : 0.7 + 0.5 * Math.sin(this.beat * 0.25 * Math.PI);
      for (let k = 0; k < 12; k++) {
        const f = k / 11 - 0.5;
        _e.set(-0.12 - 0.08 * Math.sin(this.beat * 0.5 + k), f * fanW * 2, 0, 'YXZ');
        this.lasers.setMatrixAt(k, _m.compose(this.laserOrigin, _q.setFromEuler(_e), _one));
      }
      this.lasers.instanceMatrix.needsUpdate = true;
      this.laserMat.color.set(nid === 'static' ? (Math.abs(Math.floor(bar / 2)) % 2 ? '#ffffff' : '#3ae8ff') : nid === 'overload' ? (Math.abs(Math.floor(bar / 4)) % 2 ? '#c8ff2a' : '#ff2a6a') : Math.abs(Math.floor(bar / 4)) % 2 ? '#3aff6a' : '#3ac8ff');
    }
    // confetti: fired on OVERLOAD's drops, flutters down, settles, fades
    if (playing && this.night.confetti && S.name === 'drop' && S.bar === 0 && this.beat % 4 < 0.5 && this.confettiT > 4) this.confettiBurst();
    if (this.confetti.visible) {
      this.confettiT += dt;
      const T = this.confettiT;
      const cp = this.confetti.geometry.attributes.position;
      this.confettiSeeds.forEach(([x, z, v, ph, delay], k) => {
        const tt = Math.max(0, T - delay);
        const y = Math.max(0.03, 5.4 - tt * v);
        const sway = y > 0.05 ? Math.sin(tt * 3 + ph) * 0.25 : 0;
        cp.setXYZ(k, o.x + x + sway, o.y + y, o.z + z + Math.cos(tt * 2.2 + ph) * 0.15);
      });
      cp.needsUpdate = true;
      if (T > 16) this.confetti.visible = false;
    }

    // sparkler
    if (this.sparkT > 0) {
      this.sparkT -= dt;
      const sp = this.sparks.geometry.attributes.position;
      // the parade: the sparklers walk in from the stairs in a line, then gather round the bottle
      const walked = this.sparkT0 - this.sparkT;
      const A = this.sparkAnchors ?? [this.sparkAt];
      A.forEach((v, j) => {
        const n = A.length;
        const spread = n > 1 ? 0.35 : 0;
        const home = this.sparkAt.clone().add(new THREE.Vector3(Math.cos((j / n) * Math.PI * 2) * spread, 0, Math.sin((j / n) * Math.PI * 2) * spread));
        if (this.sparkFrom) {
          const t = Math.min(1, Math.max(0, (walked - j * 0.45) / 4));
          v.lerpVectors(this.sparkFrom, home, t);
          v.y = home.y + 0.6 * (1 - t) + Math.abs(Math.sin(walked * 6 + j)) * 0.05 * (1 - t);
        } else v.copy(home);
      });
      this.sparkSeeds.forEach(([ph, ang, v], k) => {
        const a = A[k % A.length];
        const life = (time * v + ph) % 1;
        const r = life * 0.32;
        sp.setXYZ(k, a.x + Math.cos(ang + life * 2) * r, a.y + 0.12 + life * 0.55 - life * life * 0.7, a.z + Math.sin(ang + life * 2) * r);
      });
      sp.needsUpdate = true;
      this.sparkMat.opacity = Math.min(1, this.sparkT) * (0.7 + 0.3 * Math.sin(time * 40));
    } else this.sparkMat.opacity = 0;

    // haze drifts and picks up the wash colours
    const hp = this.haze.geometry.attributes.position;
    this.hazeSeeds.forEach(([x, y, z, ph], k) => hp.setXYZ(k, o.x + x + Math.sin(time * 0.05 + ph) * 1.5, o.y + y + Math.sin(time * 0.07 + ph * 2) * 0.4, o.z + z + Math.cos(time * 0.04 + ph) * 1.2));
    hp.needsUpdate = true;
    this.hazeMat.color.copy(this.wash[0]).add(this.wash[1]).multiplyScalar(0.5).addScalar(this.lightsUp * 0.3).lerp(_violet, this.hum * 0.8);
    this.hazeMat.opacity = (playing ? 0.07 : 0.02) + this.hum * 0.05;
    const seamFlick = 0.75 + 0.25 * Math.sin(time * 7.3) * Math.sin(time * 2.1);
    this.seamMat.opacity = this.hum * seamFlick;
    this.spillMat.opacity = this.hum * 0.35 * seamFlick;
    this.uvMat.color.setScalar(playing ? 0.75 + 0.25 * kick * pulseAmt : 0.25 + 0.3 * (1 - this.lightsUp));

    // lights for the people: stage fixtures follow the washes
    this.stageFix[0].color.copy(this.wash[0]).addScalar(strobe);
    this.stageFix[1].color.copy(this.wash[1]).addScalar(strobe);
    this.stageFix[2].color.copy(avg).multiplyScalar(1.5);
    this.stageFix[3].color.copy(this.wash[0]).lerp(this.wash[1], 0.5).addScalar(0.2);
    this.stageFix[4].color.copy(this.wash[1]).lerp(this.wash[0], 0.3).multiplyScalar(0.9).addScalar(0.08 + strobe);
    if (this.lightsUp > 0.02) for (const f of this.stageFix) f.color.lerp(_work, this.lightsUp);

    // ---------------------------------------------------------------- outside
    const night = env.night;
    const signOn = status !== 'closed' || s.hour >= 20 ? 1 : 0;
    this.neonOn = damp(this.neonOn ?? 0, signOn, 3, dt);
    const flick = Math.sin(time * 13) > -0.97 && Math.sin(time * 3.1 + 1) > -0.99 ? 1 : 0.25;
    this.neonMat.opacity = this.neonOn * (0.35 + 0.65 * night) * flick;
    this.winMat.color.copy(this.wash[0]).lerp(this.wash[1], 0.5 + 0.5 * Math.sin(this.beat * 0.5)).multiplyScalar(playing ? 0.18 * (0.5 + 0.5 * night) * (1 + kick * pulseAmt * 0.8) : 0);
    this.downMat.color.setScalar(this.neonOn * 1.2);
    this.poolMat.opacity = this.neonOn * night * 0.42;
    const cartOpen = s.hour >= 21 || s.hour < 5 ? 1 : 0;
    this.cartOpen = cartOpen > 0;
    this.cartMat.opacity = cartOpen * night * 0.5;
    this.cartLamp.material.color.setRGB(cartOpen * 1.3, cartOpen * 1.0, cartOpen * 0.55);
    this.signMat.emissiveIntensity = 0.12 + night * 0.25 * this.neonOn;
    this.tonightMat.emissiveIntensity = 0.2 + night * 0.9 * this.neonOn;
    const roofOn = status === 'open' ? 1 : 0;
    this.roofOn = damp(this.roofOn ?? 0, roofOn, 2, dt);
    this.bulbMat.opacity = this.roofOn * (0.35 + 0.65 * night) * (0.92 + 0.08 * Math.sin(time * 1.7));
    this.heaterMat.opacity = this.roofOn * (0.5 + 0.5 * night) * (0.85 + 0.15 * Math.sin(time * 9.0));
  }
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
const _white = new THREE.Color(1, 1, 1);
const _deep = new THREE.Color('#2a3aff');
const _violet = new THREE.Color('#8a3aff');
const _work = new THREE.Color('#fff2d8');

function hash(i, j, k) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function xz(v) {
  return { x: v.x, z: v.z };
}
