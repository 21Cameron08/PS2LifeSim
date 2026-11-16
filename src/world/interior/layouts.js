import * as THREE from 'three';
import { F, C } from './kit.js';

// The three apartments, room by room. Coordinates are local metres:
// x across the street facade (0..W), z from the corridor wall (z=0) to the
// street windows (z=D), y up from the floor. Rotations: 0 faces +z (toward the
// windows), PI faces -z, PI/2 faces +x, -PI/2 faces -x.
//
// `use` keys on interactables are handled in main.js (sleep, dress, tv, ...).

const PI = Math.PI;
const R90 = PI / 2;

export const LAYOUTS = {
  // ==========================================================================
  starter: {
    name: 'Unit 3B',
    title: 'Unit 3B · 14 Tannery Lane',
    blurb: 'A cramped one-bedroom walk-up above the laundromat. Creaky floors, a radiator that clanks, a view of the park.',
    rent: 85,
    moveIn: 300,
    W: 9.0,
    D: 7.2,
    H: 2.6,
    spawn: { x: 6.2, z: 3.4, yaw: 0.35 },
    music: 'radio',
    build(kit) {
      const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
      const H = kit.H;
      kit.room('hall', 2.0, 0, 3.6, 3.0, { floor: 'woodWorn', wallColor: '#d6caae', base: '#cfc3a6', trim: '#e2dac6' });
      kit.room('bath', 0, 0, 2.0, 3.0, { floor: 'penny', wallColor: '#c4d8d0', base: null, wainscot: { key: 'wallTile', h: 1.25, color: '#f4f2ea', cap: '#d8d4c8' } });
      kit.room('bed', 0, 3.0, 3.6, 7.2, { floor: 'carpet', wallColor: '#b4c0c8', base: '#e0dcd0' });
      kit.room('living', 3.6, 0, 9.0, 7.2, { floor: 'woodWorn', wall: 'wallpaper', wallColor: '#ffffff', base: '#d8ccb0', trim: '#e6dec8' });
      // linoleum in the kitchenette
      const ls = kit.scale('lino');
      kit.grid('lino', [5.9, 0.004, 1.9], [3.1, 0, 0], [0, 0, -1.9], [0, 1, 0], (p) => [p[0] / ls, -p[2] / ls]);

      // exterior walls
      kit.wall('x', 7.2, 0, 9.0, {
        t: 0.25,
        ext: 1,
        open: [
          { from: 1.0, to: 2.4, kind: 'window', y0: 0.85, y1: 2.25, dress: 'curtains', color: '#9a7a96' },
          { from: 4.6, to: 6.0, kind: 'window', y0: 0.85, y1: 2.25, dress: 'blinds', down: 0.35 },
          { from: 7.2, to: 8.6, kind: 'window', y0: 0.85, y1: 2.25, dress: 'blinds', down: 0.55 },
        ],
      });
      kit.wall('x', 0, 0, 9.0, { t: 0.25, ext: -1, open: [{ from: 2.35, to: 3.25, kind: 'entry', y1: 2.05, doorColor: '#5a3a2a' }] });
      kit.wall('z', 0, 0, 7.2, { t: 0.25, ext: -1 });
      kit.wall('z', 9.0, 0, 7.2, { t: 0.25, ext: 1 });
      // partitions
      kit.wall('z', 2.0, 0, 3.0, { open: [{ from: 0.5, to: 1.3, swing: -1 }] });
      kit.wall('x', 3.0, 0, 3.6, { open: [{ from: 2.4, to: 3.2, swing: 1 }] });
      kit.wall('z', 3.6, 0, 7.2, { open: [{ from: 0.9, to: 2.1, kind: 'opening' }] });

      // --- hall
      P(2.8, 0.25).interact(0, 0.35, { use: 'leave', label: 'Leave apartment', r: 1.0 });
      F.switchPlate(P(3.54, 0.45, -R90));
      P(3.54, 0.45, -R90).interact(0, 0.3, { use: 'lights', label: 'Light switch', r: 0.8 });
      F.coatHooks(P(2.06, 2.35, R90), { cols: ['#a07a4e', '#5a7aa0'] });
      F.rug(P(2.8, 1.6), { w: 0.8, l: 1.8, key: 'rugStripe' });
      F.ceilingLight(P(2.8, 1.5), H, { style: 'dome', power: 0.8 });
      F.smoke(P(2.8, 2.4), H);
      // --- bathroom
      F.bathtub(P(0, 2.15, R90), { l: 1.6, curtain: '#c8dce4', onUse: { use: 'shower', label: 'Take a shower' } });
      F.toilet(P(0.55, 0));
      F.vanity(P(1.4, 2.94, PI), { w: 0.75, col: '#e8e2d2', mirrorW: 0.55 });
      F.towelRack(P(1.94, 2.15, -R90), { col: '#e8c8a0' });
      F.bathMat(P(1.0, 2.15), { w: 0.5, l: 0.8, col: '#7aa0b8' });
      F.ceilingLight(P(1.0, 1.4), H, { style: 'dome', power: 0.6 });
      // --- bedroom
      const side = F.bed(P(0, 5.0, R90), { w: 1.4, l: 2.0, frame: '#7a5a3a', blanket: '#5a6a8a', sheet: '#e0dcd2', messy: true });
      kit.interactables.push({ use: 'sleep', label: 'Sleep', x: side.x, z: side.z, r: 1.2 });
      F.nightstand(P(0, 6.15, R90), { col: '#6a4a2a' });
      F.wardrobe(P(0.65, 3.06), { w: 1.0, col: '#8a6a4a' });
      P(0.65, 3.06).interact(0, 0.9, { use: 'dress', label: 'Change clothes', r: 1.0 });
      F.dresser(P(3.54, 5.4, -R90), { w: 1.1, col: '#7a5a3a' });
      F.laundry(P(1.6, 3.45));
      F.boxes(P(3.1, 6.65), { n: 2 });
      F.poster(P(0, 5.0, R90), { idx: 4, w: 0.45, h: 0.6, y: 1.55 });
      F.radiator(P(1.7, 7.2, PI), { w: 0.9 });
      F.rug(P(2.55, 5.0, R90), { w: 1.2, l: 0.8, key: 'rugStripe' });
      F.ceilingLight(P(1.8, 5.1), H, { style: 'dome', power: 0.7 });
      F.outlet(P(3.54, 6.4, -R90));
      // --- kitchenette
      const K = P(0, 0);
      F.counter(K, { x0: 6.0, x1: 6.62, cab: '#d8ccb0', cabKey: 'wood', top: '#b8a078', topKey: 'solid' });
      F.stove(K, { x: 7.0, style: 'old' });
      F.counter(K, { x0: 7.38, x1: 8.2, cab: '#d8ccb0', cabKey: 'wood', top: '#b8a078', topKey: 'solid' });
      F.sink(K, { x: 7.82, steel: true });
      F.upper(K, { x0: 6.0, x1: 6.62, col: '#d8ccb0', key: 'wood' });
      F.upper(K, { x0: 7.38, x1: 8.2, col: '#d8ccb0', key: 'wood' });
      F.hood(K, { x: 7.0, steel: false });
      F.backsplash(K, { x0: 6.0, x1: 8.2, col: '#f0e8d0' });
      F.fridge(K, { x: 8.6, style: 'old', h: 1.7, onUse: { use: 'fridge', label: 'Open the fridge' } });
      F.microwave(K, { x: 6.3 });
      F.kettle(K, { x: 7.55, z: 0.4 });
      F.ceilingLight(P(7.3, 1.0), H, { style: 'tube', power: 0.85 });
      F.diningTable(P(5.0, 2.6), { w: 0.85, round: true, chairs: 2, col: '#8a6a4a' });
      F.radio(P(5.0, 2.45, 0, 0.76), { onUse: { use: 'music', label: 'Radio' } });
      F.art(P(4.9, 0), { idx: 7, w: 0.55, h: 0.55, y: 1.55, frame: '#6a4a2a' });
      // --- living
      F.sofa(P(3.66, 4.9, R90), { w: 2.0, col: '#5a6a4a', style: 'old', accent: '#c8a050' });
      F.rug(P(5.3, 4.9, R90), { w: 2.2, l: 1.6, key: 'rugPersian' });
      F.coffeeTable(P(5.3, 4.9, R90), { w: 1.0, d: 0.55, col: '#7a5a3a' });
      F.tvCRT(P(9.0, 4.9, -R90), { onTV: { use: 'tv', label: 'TV' } });
      F.armchair(P(7.0, 6.2, -2.3), { col: '#8a4a3a', style: 'old' });
      F.floorLamp(P(3.95, 6.4));
      F.bookshelf(P(9.0, 6.4, -R90), { w: 0.9, h: 1.8, col: '#6a4a2a' });
      F.windowAC(P(7.9, 7.08, PI, 0.85));
      F.radiator(P(5.3, 7.2, PI), { w: 0.9 });
      F.plant(P(4.2, 6.85), { kind: 'tall' });
      F.boxes(P(8.6, 3.3), { n: 3 });
      F.poster(P(3.66, 4.9, R90), { idx: 5, w: 0.5, h: 0.7, y: 1.6 });
      F.fan(P(6.2, 4.6), H, { power: 0.9 });
      F.smoke(P(6.2, 3.0), H);
      F.outlet(P(8.94, 3.9, -R90));
      F.outlet(P(3.66, 6.9, R90));
    },
  },

  // ==========================================================================
  loft: {
    name: 'Loft 4',
    title: 'Loft 4 · The Kiln Works',
    blurb: 'A converted pottery factory. Exposed brick, steel beams, giant windows and an open kitchen made for showing off.',
    rent: 280,
    moveIn: 2500,
    W: 13.0,
    D: 9.6,
    H: 3.0,
    spawn: { x: 1.7, z: 1.2, yaw: 0 },
    music: 'records',
    build(kit) {
      const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
      const H = kit.H;
      kit.room('main', 0, 0, 9.0, 9.6, { floor: 'concrete', wallColor: '#ece8e0', ceil: '#d4d0c8', base: '#3a3e42', trim: '#e8e4dc' });
      kit.room('bed', 9.0, 4.2, 13.0, 9.6, { floor: 'woodOak', wallColor: '#d4ccc0', base: '#f0ece4' });
      kit.room('bath', 9.0, 0, 13.0, 4.2, {
        floor: 'wallTile',
        floorColor: '#6a6e72',
        wallColor: '#e8ecec',
        base: null,
        wainscot: { key: 'subway', h: 1.4, color: '#ffffff', cap: '#2a2a2a' },
      });
      const steel = { kind: 'window', y0: 0.55, y1: 2.75, grid: [4, 3], frame: '#2b3034', trim: '#2b3034' };
      kit.wall('x', 9.6, 0, 13.0, {
        t: 0.3,
        ext: 1,
        open: [
          { from: 0.6, to: 2.8, ...steel },
          { from: 3.4, to: 5.6, ...steel },
          { from: 6.2, to: 8.4, ...steel },
          { from: 9.8, to: 12.2, ...steel, dress: 'curtains', color: '#e8e0d0', long: true, rod: '#1a1a1a' },
        ],
      });
      kit.wall('x', 0, 0, 13.0, { t: 0.3, ext: -1, open: [{ from: 1.2, to: 2.2, kind: 'entry', y1: 2.1, doorColor: '#3a4046' }] });
      kit.wall('z', 0, 0, 9.6, { t: 0.3, ext: -1 });
      kit.wall('z', 13.0, 0, 9.6, { t: 0.3, ext: 1 });
      kit.wall('z', 9.0, 0, 9.6, {
        open: [
          { from: 1.6, to: 2.5, swing: 1, doorColor: '#3a4046' },
          { from: 6.2, to: 7.1, swing: 1, hinge: 'to', doorColor: '#3a4046' },
        ],
      });
      kit.wall('x', 4.2, 9.0, 13.0);
      // exposed brick on the long wall
      const bs = kit.scale('brick');
      kit.grid('brick', [0.006, 0, 9.6], [0, 0, -9.6], [0, H, 0], [1, 0, 0], (p) => [p[2] / bs, p[1] / bs]);

      // --- entry
      P(1.7, 0.25).interact(0, 0.4, { use: 'leave', label: 'Leave apartment', r: 1.0 });
      F.switchPlate(P(2.5, 0));
      P(2.5, 0).interact(0, 0.4, { use: 'lights', label: 'Light switch', r: 0.8 });
      F.coatHooks(P(0.6, 0), { cols: ['#c8a070', '#6a6e72'] });
      // --- kitchen
      const K = P(0, 0);
      const cab = '#2e3a44';
      const top = '#c8a070';
      F.counter(K, { x0: 3.0, x1: 4.22, cab, top, topKey: 'wood', handles: '#c8a860' });
      F.stove(K, { x: 4.6, style: 'steel' });
      F.counter(K, { x0: 4.98, x1: 7.6, cab, top, topKey: 'wood', handles: '#c8a860' });
      F.sink(K, { x: 6.6 });
      F.upper(K, { x0: 3.0, x1: 4.2, col: cab, handles: '#c8a860', y1: 2.3 });
      F.upper(K, { x0: 5.0, x1: 7.6, col: cab, handles: '#c8a860', y1: 2.3 });
      F.hood(K, { x: 4.6 });
      F.backsplash(K, { x0: 3.0, x1: 7.6, y1: 1.45 });
      F.fridge(K, { x: 7.98, style: 'steel', h: 1.95, onUse: { use: 'fridge', label: 'Open the fridge' } });
      F.kettle(K, { x: 5.4, z: 0.35 });
      F.island(P(5.3, 2.4), { w: 2.2, d: 0.95, cab, top, topKey: 'wood', stools: 3, stoolCol: '#1a1a1a' });
      F.fruitBowl(P(5.3, 2.3), { y: 0.92, z: 0 });
      for (const x of [4.5, 5.3, 6.1]) F.ceilingLight(P(x, 2.4), H, { style: 'pendant', power: 0.5, metal: '#1a1a1a' });
      // --- dining
      F.diningTable(P(1.9, 4.4), { w: 1.8, d: 0.9, col: '#5a3a24', chairs: 4, chairCol: '#1a1a1a' });
      F.ceilingLight(P(1.9, 4.4), H, { style: 'pendant', power: 0.7, metal: '#2b3034' });
      F.art(P(0.006, 4.4, R90), { idx: 0, w: 1.0, h: 1.2, y: 1.7, frame: '#1a1a1a', mat: false });
      // --- living
      F.tvFlat(P(0.006, 7.3, R90), { w: 1.3, console: '#3a2a1e', onTV: { use: 'tv', label: 'TV' } });
      F.art(P(0.006, 7.3, R90), { idx: 3, w: 0.9, h: 0.5, y: 2.3, frame: '#1a1a1a', mat: false });
      F.rug(P(2.0, 7.3, R90), { w: 2.6, l: 2.0, key: 'rugModern' });
      F.coffeeTable(P(2.0, 7.3, R90), { w: 1.0, d: 0.6, col: '#3a2a1e' });
      F.sofa(P(3.95, 7.3, -R90), { w: 2.6, col: '#4a5a6a', style: 'modern', accent: '#c87a4a' });
      F.armchair(P(2.4, 9.6, PI), { col: '#c8a070', style: 'modern' });
      F.floorLamp(P(3.95, 9.1), { col: '#1a1a1a' });
      F.recordPlayer(P(8.94, 4.4, -R90), { onUse: { use: 'music', label: 'Record player' } });
      F.art(P(8.94, 4.4, -R90), { idx: 1, w: 0.7, h: 0.7, y: 1.8, frame: '#c8a070' });
      F.bookshelf(P(8.94, 8.75, -R90), { w: 0.9, h: 2.2, col: '#1a1a1a', n: 6 });
      F.desk(P(7.3, 9.6, PI), { w: 1.3, col: '#c8a070', legs: '#1a1a1a' });
      F.plant(P(0.5, 9.05), { kind: 'big', pot: '#e8e4dc' });
      F.plant(P(8.6, 3.05), { kind: 'tall', pot: '#2a2a2a' });
      F.ceilingLight(P(2.2, 7.3), H, { style: 'recessed', power: 0.6 });
      F.ceilingLight(P(6.2, 7.6), H, { style: 'recessed', power: 0.6 });
      // industrial ceiling
      F.pipes(P(4.5, 5.5), { len: 9, y: 2.8 });
      F.beam(P(3.0, 4.8), { len: 9.6, y: 2.95 });
      F.beam(P(6.0, 4.8), { len: 9.6, y: 2.95 });
      F.smoke(P(4.5, 3.5), H);
      F.outlet(P(0.006, 5.8, R90));
      // --- bedroom
      const side = F.bed(P(11.0, 4.26), { w: 1.6, l: 2.05, frame: '#3a2a1e', blanket: '#c8b89a', sheet: '#f2f0ea', head: '#3a2a1e' });
      kit.interactables.push({ use: 'sleep', label: 'Sleep', x: side.x, z: side.z, r: 1.2 });
      F.nightstand(P(9.75, 4.26), { col: '#3a2a1e' });
      F.nightstand(P(12.25, 4.26), { col: '#3a2a1e' });
      F.bench(P(11.0, 6.5), { w: 1.4, col: '#5a6a4a' });
      F.rug(P(11.0, 6.4), { w: 2.4, l: 1.8, key: 'rugPersian' });
      F.wardrobe(P(13.0, 7.6, -R90), { w: 1.2, col: '#e8e4dc' });
      P(13.0, 7.6, -R90).interact(0, 0.95, { use: 'dress', label: 'Change clothes', r: 1.0 });
      F.armchair(P(9.85, 9.6, PI), { col: '#8a5a3a', style: 'modern' });
      F.art(P(11.0, 4.26), { idx: 6, w: 0.6, h: 0.8, y: 1.75, frame: '#c8a070' });
      F.ceilingLight(P(11.0, 7.0), H, { style: 'dome', power: 0.6 });
      // --- bathroom
      F.shower(P(12.4, 0), { w: 1.1, d: 1.1, onUse: { use: 'shower', label: 'Take a shower' } });
      F.vanity(P(13.0, 2.4, -R90), { w: 1.2, col: cab, top: '#ebe9e4', topKey: 'marble', mirrorW: 0.9 });
      F.toilet(P(12.2, 4.14, PI));
      F.towelRack(P(10.3, 0), { col: '#2e3a44' });
      F.bathMat(P(11.4, 1.6), { col: '#c8b89a' });
      F.plant(P(9.4, 0.4), { kind: 'small', pot: '#2a2a2a' });
      F.ceilingLight(P(11.0, 2.1), H, { style: 'recessed', power: 0.8 });
    },
  },

  // ==========================================================================
  penthouse: {
    name: 'Meridian Penthouse',
    title: 'Penthouse · Meridian Tower',
    blurb: 'The whole top floor of a glass tower. Floor-to-ceiling windows on two sides, a fireplace, a grand piano, and the city at your feet.',
    rent: 950,
    moveIn: 12000,
    W: 18.0,
    D: 13.0,
    H: 2.9,
    spawn: { x: 7.55, z: 1.3, yaw: 0 },
    music: 'piano',
    build(kit) {
      const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
      const H = kit.H;
      const wall = '#e6e2dc';
      kit.room('great', 0, 5.0, 12.0, 13.0, { floor: 'herringbone', wallColor: wall, base: wall, ceil: '#f4f2ee' });
      kit.room('kitchen', 0, 0, 6.0, 5.0, { floor: 'marble', wallColor: wall, base: wall });
      kit.room('entry', 6.0, 0, 9.0, 5.0, { floor: 'marble', wallColor: '#d8d2c8', base: '#d8d2c8' });
      kit.room('study', 9.0, 0, 12.0, 5.0, { floor: 'herringbone', wallColor: '#2e3a44', base: '#2e3a44', trim: '#e8e4dc' });
      kit.room('master', 12.0, 5.6, 18.0, 13.0, { floor: 'herringbone', wallColor: '#d4ccc4', base: '#d4ccc4' });
      kit.room('ensuite', 12.0, 0, 18.0, 5.6, { floor: 'marble', wall: 'marble', wallColor: '#ffffff', base: null });

      const glass = { kind: 'window', y0: 0.05, y1: 2.8, grid: [1, 1], frame: '#1e1e22', trim: '#1e1e22' };
      kit.wall('x', 13.0, 0, 18.0, {
        t: 0.25,
        ext: 1,
        open: [
          { from: 0.3, to: 3.0, ...glass },
          { from: 3.1, to: 5.8, ...glass },
          { from: 5.9, to: 8.6, ...glass },
          { from: 8.7, to: 11.6, ...glass },
          { from: 12.4, to: 15.0, ...glass, dress: 'curtains', color: '#efe8dc', long: true, rod: '#1e1e22' },
          { from: 15.1, to: 17.7, ...glass, dress: 'curtains', color: '#efe8dc', long: true, rod: '#1e1e22' },
        ],
      });
      kit.wall('z', 18.0, 0, 13.0, {
        t: 0.25,
        ext: 1,
        open: [
          { from: 1.5, to: 3.6, kind: 'window', y0: 1.3, y1: 2.5, grid: [2, 1], frame: '#1e1e22', dress: 'blinds', down: 0.6 },
          { from: 6.2, to: 9.0, ...glass },
          { from: 9.1, to: 12.4, ...glass },
        ],
      });
      kit.wall('x', 0, 0, 18.0, { t: 0.25, ext: -1, open: [{ from: 7.0, to: 8.1, kind: 'entry', y1: 2.3, doorColor: '#1e1e22' }] });
      kit.wall('z', 0, 0, 13.0, { t: 0.25, ext: -1 });
      // partitions
      kit.wall('x', 5.0, 0, 12.0, {
        open: [
          { from: 0.8, to: 5.6, kind: 'opening', y1: 2.5 },
          { from: 6.6, to: 8.4, kind: 'opening', y1: 2.4 },
          { from: 10.0, to: 10.9, swing: -1 },
        ],
      });
      kit.wall('z', 6.0, 0, 5.0);
      kit.wall('z', 9.0, 0, 5.0);
      kit.wall('z', 12.0, 0, 13.0, { open: [{ from: 9.0, to: 10.0, swing: 1, hinge: 'to' }] });
      kit.wall('x', 5.6, 12.0, 18.0, { open: [{ from: 13.0, to: 13.9, swing: -1 }] });

      // --- entry
      P(7.55, 0.25).interact(0, 0.45, { use: 'leave', label: 'Leave apartment', r: 1.0 });
      F.switchPlate(P(8.4, 0));
      P(8.4, 0).interact(0, 0.4, { use: 'lights', label: 'Light switch', r: 0.8 });
      F.dresser(P(8.94, 2.6, -R90), { w: 1.3, h: 0.8, col: '#2a2a2e' });
      P(8.94, 2.6, -R90).box('solid', -0.42, 1.05, 0, 0.42, 1.95, 0.02, [0.55, 0.52, 0.45]);
      P(8.94, 2.6, -R90).panel('mirror', -0.38, 1.09, 0.38, 1.91, 0.021);
      F.wardrobe(P(6.06, 1.3, R90), { w: 1.2, col: '#e8e4dc', h: 2.3 });
      F.rug(P(7.55, 2.5), { w: 1.2, l: 2.6, key: 'rugPersian' });
      F.plant(P(8.7, 4.6), { kind: 'tall', pot: '#e8e4dc' });
      F.ceilingLight(P(7.55, 1.5), H, { style: 'recessed', power: 0.5 });
      F.ceilingLight(P(7.55, 3.6), H, { style: 'recessed', power: 0.5 });
      // --- kitchen
      const K = P(0, 0);
      const cab = '#f2f0ea';
      F.fridge(K, { x: 0.85, style: 'steel', w: 0.9, h: 2.0, onUse: { use: 'fridge', label: 'Open the fridge' } });
      F.counter(K, { x0: 1.3, x1: 1.95, cab, top: '#ebe9e4', topKey: 'marble', handles: '#2a2a2a' });
      F.stove(K, { x: 2.4, style: 'steel', w: 0.9 });
      F.counter(K, { x0: 2.85, x1: 5.6, cab, top: '#ebe9e4', topKey: 'marble', handles: '#2a2a2a' });
      F.sink(K, { x: 4.4 });
      F.upper(K, { x0: 1.3, x1: 1.95, col: '#3a3a3e', handles: '#c8a860', y1: 2.5 });
      F.upper(K, { x0: 2.85, x1: 5.6, col: '#3a3a3e', handles: '#c8a860', y1: 2.5 });
      F.hood(K, { x: 2.4, w: 0.9 });
      F.backsplash(K, { x0: 1.3, x1: 5.6, key: 'marble', col: '#ffffff', y1: 1.45 });
      F.island(P(3.0, 2.9), { w: 2.6, d: 1.0, cab: '#3a3a3e', top: '#ebe9e4', topKey: 'marble', stools: 3, stoolCol: '#c8b8a0' });
      F.fruitBowl(P(2.4, 2.8), { y: 0.92, z: 0 });
      F.kettle(K, { x: 3.4, z: 0.35 });
      for (const x of [2.3, 3.7]) F.ceilingLight(P(x, 2.9), H, { style: 'pendant', power: 0.5, metal: '#c8a860' });
      F.ceilingLight(P(1.2, 1.3), H, { style: 'recessed', power: 0.4 });
      F.ceilingLight(P(5.0, 1.3), H, { style: 'recessed', power: 0.4 });
      // --- great room
      F.fireplace(P(0, 9.0, R90), { w: 1.8, onUse: { use: 'fire', label: 'Fireplace' } });
      const TVP = P(0, 9.0, R90);
      TVP.box('solid', -0.7, 1.35, 0.02, 0.7, 2.15, 0.07, [0.02, 0.02, 0.025]);
      TVP.panel('tv', -0.66, 1.39, 0.66, 2.11, 0.071);
      TVP.interact(0, 1.6, { use: 'tv', label: 'TV' });
      F.rug(P(2.6, 9.0, R90), { w: 3.4, l: 2.6, key: 'rugModern' });
      F.coffeeTable(P(2.4, 9.0, R90), { w: 1.2, d: 0.7, glass: true });
      F.sofa(P(4.6, 9.0, -R90), { w: 2.8, col: '#d8d2c6', style: 'modern', accent: '#2e3a44' });
      F.armchair(P(1.5, 11.6, -2.4), { col: '#2e3a44', style: 'modern' });
      F.floorLamp(P(4.9, 11.0), { col: '#c8a860' });
      F.diningTable(P(7.8, 8.6), { w: 2.2, d: 1.0, col: '#ffffff', topKey: 'marble', chairs: 6, chairCol: '#2a2a2a', seat: '#c8b8a0' });
      F.ceilingLight(P(7.8, 8.6), H, { style: 'chandelier', power: 0.8 });
      F.piano(P(9.8, 10.6), { onUse: { use: 'music', label: 'Play the piano' } });
      F.barCart(P(6.0, 12.95, PI));
      F.plant(P(0.6, 12.4), { kind: 'big', pot: '#e8e4dc' });
      F.plant(P(5.3, 12.5), { kind: 'tall', pot: '#2a2a2a' });
      F.plant(P(11.4, 5.6), { kind: 'tall', pot: '#e8e4dc' });
      F.art(P(11.94, 7.0, -R90), { idx: 1, w: 1.0, h: 1.0, y: 1.6, frame: '#c8a860' });
      F.art(P(11.94, 11.8, -R90), { idx: 2, w: 0.9, h: 0.9, y: 1.6, frame: '#1e1e22' });
      // a sculpture on a plinth
      const S = P(10.9, 12.4);
      S.box('solid', -0.25, 0, -0.25, 0.25, 0.9, 0.25, [0.9, 0.9, 0.88]);
      S.geo('solid', new THREE.TorusKnotGeometry(0.2, 0.06, 48, 6), 0, 1.2, 0, C('#c8a050'));
      S.collide(-0.25, -0.25, 0.25, 0.25, 1.4);
      for (const [x, z] of [
        [2.5, 7.0],
        [2.5, 11.0],
        [6.0, 6.6],
        [6.0, 11.4],
        [10.0, 7.0],
        [10.0, 11.4],
      ])
        F.ceilingLight(P(x, z), H, { style: 'recessed', power: 0.35 });
      F.smoke(P(6.0, 9.0), H);
      // --- study
      F.desk(P(10.5, 0), { w: 1.4, col: '#3a2a1e', legs: '#c8a860' });
      F.bookshelf(P(11.94, 1.5, -R90), { w: 0.9, h: 2.4, col: '#3a2a1e', n: 6 });
      F.bookshelf(P(11.94, 2.45, -R90), { w: 0.9, h: 2.4, col: '#3a2a1e', n: 6 });
      F.armchair(P(9.7, 3.9, 2.3), { col: '#8a4a2a', style: 'old' });
      F.floorLamp(P(9.35, 4.6), { col: '#c8a860' });
      F.rug(P(10.4, 2.6), { w: 1.6, l: 1.2, key: 'rugPersian' });
      F.art(P(9.06, 2.4, R90), { idx: 6, w: 0.5, h: 0.7, y: 1.6, frame: '#c8a860' });
      F.ceilingLight(P(10.5, 2.4), H, { style: 'dome', power: 0.5 });
      // --- master bedroom
      const side = F.bed(P(15.3, 5.66), { w: 1.9, l: 2.1, frame: '#2a2a2e', blanket: '#2e3a44', sheet: '#f4f2ee', head: '#c8b8a0', headKey: 'fabric' });
      kit.interactables.push({ use: 'sleep', label: 'Sleep', x: side.x, z: side.z, r: 1.2 });
      F.nightstand(P(13.95, 5.66), { col: '#2a2a2e', shade: '#f4ecdc' });
      F.nightstand(P(16.65, 5.66), { col: '#2a2a2e', shade: '#f4ecdc' });
      F.bench(P(15.3, 7.95), { w: 1.6, col: '#c8b8a0' });
      F.rug(P(15.3, 7.4), { w: 2.8, l: 2.4, key: 'rugModern' });
      F.armchair(P(17.1, 12.4, -2.4), { col: '#c8b8a0', style: 'modern' });
      F.wardrobe(P(12.06, 11.0, R90), { w: 1.2, col: '#3a3a3e', h: 2.4 });
      F.wardrobe(P(12.06, 12.2, R90), { w: 1.2, col: '#3a3a3e', h: 2.4 });
      P(12.06, 11.6, R90).interact(0, 0.95, { use: 'dress', label: 'Walk-in wardrobe', r: 1.1 });
      F.art(P(15.3, 5.66), { idx: 3, w: 1.4, h: 0.8, y: 1.75, frame: '#1e1e22', mat: false });
      F.plant(P(12.45, 6.1), { kind: 'tall', pot: '#e8e4dc' });
      F.ceilingLight(P(14.0, 9.5), H, { style: 'recessed', power: 0.45 });
      F.ceilingLight(P(16.5, 9.5), H, { style: 'recessed', power: 0.45 });
      // --- ensuite
      F.freeTub(P(15.5, 2.8), { onUse: { use: 'shower', label: 'Run a bath' } });
      F.vanity(P(15.0, 0), { w: 1.8, col: '#3a3a3e', top: '#ebe9e4', topKey: 'marble', mirrorW: 1.6 });
      F.shower(P(17.3, 0), { w: 1.2, d: 1.2 });
      F.toilet(P(12.06, 2.0, R90));
      F.towelRack(P(12.06, 3.6, R90), { col: '#f4f2ee' });
      F.bathMat(P(15.5, 3.8), { w: 1.0, l: 0.5, col: '#e8e4dc' });
      F.ceilingLight(P(14.0, 2.0), H, { style: 'recessed', power: 0.6 });
      F.ceilingLight(P(16.6, 3.6), H, { style: 'recessed', power: 0.6 });
    },
  },
};
