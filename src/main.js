import './style.css';
import * as THREE from 'three';
import { START } from './config.js';
import { Rng, clamp, smoothstep } from './core/rng.js';
import { Input } from './core/input.js';
import { createTextures } from './render/textures.js';
import { PS2Pipeline } from './render/ps2pipeline.js';
import { Sky } from './render/sky.js';
import { Environment } from './render/environment.js';
import { City } from './world/city.js';
import { LanternQuarter } from './world/lanternQuarter.js';
import { Effects } from './world/effects.js';
import { Crowd } from './actors/crowd.js';
import { Player, CameraRig } from './actors/player.js';
import { Pedestrians } from './actors/pedestrians.js';
import { Traffic } from './actors/traffic.js';
import { defaultPlayerAppearance } from './actors/appearance.js';
import { Clock, loadSave, writeSave, clearSave, DEFAULT_SETTINGS } from './game/state.js';
import { greeting, chatLine, cityLine, KEEPER_LINES, relTier } from './game/dialogue.js';
import { Ambience } from './audio/ambience.js';
import { UI } from './ui/ui.js';

// ----------------------------------------------------------------------------
// Boot
const canvas = document.getElementById('game');
const audio = new Ambience();
const ui = new UI(audio); // before Input, so menus get first dibs on key presses
const input = new Input(canvas);
ui.bindTouch(input);
document.body.classList.toggle('touch', input.isTouch);

const save = loadSave();
const settings = { ...DEFAULT_SETTINGS, ...(save?.settings || {}) };
const state = {
  cash: save?.cash ?? START.cash,
  bank: save?.bank ?? START.bank,
  rel: save?.rel ?? {},
  known: save?.known ?? {},
  lastChat: save?.lastChat ?? {},
  appearance: { ...defaultPlayerAppearance(), ...(save?.appearance || {}) },
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const pipeline = new PS2Pipeline(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);

const tex = createTextures();
const sky = new Sky(scene, tex);
const env = new Environment(scene, sky, pipeline);
const city = new City(scene, tex, env);
city.initLampLights(6);
const lantern = new LanternQuarter(scene, tex, city.lanternBlock, city.colliders);
const effects = new Effects(scene, tex, city);
const crowd = new Crowd(scene, tex, 112);
const player = new Player(crowd, city, state.appearance, save?.player ?? city.spawn);
const peds = new Pedestrians(crowd, city, 72);
const traffic = new Traffic(scene, tex, 24);
const clock = new Clock(save?.minutes ?? START.hour * 60);
const rig = new CameraRig(camera, city.colliders, city);
rig.yaw = player.yaw;
const talkRng = new Rng(Date.now() & 0xffff);

// special characters
const keeper = peds.addStander(lantern.keeperSpot.x, lantern.keeperSpot.z, lantern.keeperSpot.yaw, {
  skin: '#e9b996',
  hair: '#e8e4dc',
  hairStyle: 1,
  top: '#4a3a7a',
  topStyle: 2,
  jacket: '#2a1a4a',
  bottom: '#2a1a4a',
  bottomStyle: 0,
  shoes: '#1e1e22',
  height: 0.97,
  build: 1.05,
});
Object.assign(keeper, { name: 'The Lantern Keeper', role: 'keeper', known: true, mood: 'dreamy' });
const VENDORS = [
  { name: 'Ottilie the Lantern Seller', role: 'lanterns' },
  { name: 'Madame Sol, Fortunes', role: 'fortune' },
];
lantern.vendorSpots.forEach((s, k) => {
  const v = peds.addStander(s.x, s.z, s.yaw);
  if (VENDORS[k]) Object.assign(v, VENDORS[k], { known: true });
});
// people loitering by shop fronts, some in pairs having a chat
{
  const rng = new Rng(31337);
  const cityLoops = peds.loops.filter((L) => L.b.kind === 'city');
  for (let k = 0; k < 9; k++) {
    const L = rng.pick(cityLoops);
    const s = rng.float(4, L.P - 4);
    const p = peds.onLoop(L, s, 1, 0.95);
    const out = Math.atan2(p.mz, -p.mx);
    if (k % 3 === 0) {
      const q = peds.onLoop(L, s + 1.1, 1, 0.95);
      const a = peds.addStander(p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z), undefined, { chatty: true });
      const b = peds.addStander(q.x, q.z, Math.atan2(p.x - q.x, p.z - q.z), undefined, { chatty: true });
      a.nightOwl = b.nightOwl = rng.chance(0.5);
    } else {
      peds.addStander(p.x, p.z, out).nightOwl = rng.chance(0.4);
    }
  }
}
for (const npc of peds.list) if (state.known[npc.id]) npc.known = true;

// ----------------------------------------------------------------------------
// Settings / resize / save
function applySettings() {
  Object.assign(pipeline.settings, { dither: settings.dither, scanlines: settings.scanlines, bloom: settings.bloom, soft: settings.soft });
  canvas.classList.toggle('crisp', settings.crisp);
  audio.setMuted(settings.muted);
  resize();
}
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ih = Math.min(settings.res, h);
  const iw = Math.max(2, Math.round(ih * (w / h)));
  renderer.setSize(iw, ih, false);
  pipeline.setSize(iw, ih);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 74 : 60; // portrait phones need a taller view
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applySettings();

let resetting = false;
function saveNow(showToast = false) {
  if (resetting) return;
  const ok = writeSave({
    v: 1,
    cash: state.cash,
    bank: state.bank,
    rel: state.rel,
    known: state.known,
    lastChat: state.lastChat,
    appearance: state.appearance,
    minutes: clock.minutes,
    player: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
    settings,
  });
  if (showToast && ok) ui.toast('Saved to Memory Card (8MB) · Slot 1');
}
window.addEventListener('beforeunload', () => saveNow());
document.addEventListener('visibilitychange', () => document.hidden && saveNow());

// ----------------------------------------------------------------------------
// Interactions
function endTalk(npc, prevMode) {
  npc.mode = prevMode;
  npc.speaking = false;
  player.locked = false;
  rig.setMode('follow');
}

function talkTo(npc) {
  const prevMode = npc.mode === 'talk' ? 'walk' : npc.mode;
  npc.mode = 'talk';
  player.locked = true;
  player.yaw = Math.atan2(npc.pos.x - player.pos.x, npc.pos.z - player.pos.z);
  rig.setMode('talk');
  const onClose = () => endTalk(npc, prevMode);
  const say = (text, choices) => {
    npc.speaking = true;
    ui.openDialog({ name: npc.known ? npc.name : '???', text, choices, onClose });
  };
  const bye = { label: 'Goodbye', fn: () => ui.closeDialog() };

  if (npc.role === 'keeper') {
    let line = 0;
    const menu = () => [
      { label: 'Listen', fn: () => say(KEEPER_LINES[(line = (line + 1) % KEEPER_LINES.length)], menu()) },
      {
        label: 'Touch the tree',
        fn: () => {
          say('The bark is warm, like something asleep. For a moment the whole city goes quiet... and then breathes out.', [bye]);
          audio.tone(523, 'sine', 0.06, 3);
        },
      },
      bye,
    ];
    return say(KEEPER_LINES[0], menu());
  }
  if (npc.role === 'lanterns') {
    const menu = () => [
      {
        label: 'Buy a lantern ($5)',
        fn: () => {
          if (state.cash < 5) return say('No coin, no lantern, dear. The sky has rules too.', menu());
          state.cash -= 5;
          audio.coin();
          lantern.release(player.pos);
          say('Light it, let go, don\'t look back. That\'s the trick. ...You looked back, didn\'t you.', menu());
        },
      },
      bye,
    ];
    return say('Lanterns! Paper, wire and one small wish. Five dollars.', menu());
  }
  if (npc.role === 'fortune') {
    const FORTUNES = [
      'I see... a job. A small one. It will lead to a bigger one. Or a nap.',
      'Someone in this city is about to remember your name. Be kind to them.',
      'A green car. A wrong turn. A good meal. In that order.',
      'Your money will grow, if you stop spending it on fortunes.',
      'When the fog turns violet, follow it. Not far. Just a little.',
    ];
    const menu = () => [
      {
        label: 'Hear a fortune ($3)',
        fn: () => {
          if (state.cash < 3) return say('The spirits work for tips, love. Come back with three dollars.', menu());
          state.cash -= 3;
          audio.coin();
          say(talkRng.pick(FORTUNES), menu());
        },
      },
      bye,
    ];
    return say('Sit, sit. The cards are warm tonight.', menu());
  }

  // ordinary citizens
  const first = npc.name.split(' ')[0];
  const intro = npc.known ? greeting(npc.mood, talkRng) : `${greeting(npc.mood, talkRng)} I'm ${first}, by the way.`;
  npc.known = true;
  state.known[npc.id] = true;
  const menu = () => [
    {
      label: 'Chat',
      fn: () => {
        const rel = state.rel[npc.id] ?? 0;
        let extra = '';
        if (state.lastChat[npc.id] !== clock.day) {
          state.lastChat[npc.id] = clock.day;
          const before = relTier(rel);
          state.rel[npc.id] = Math.min(100, rel + 8);
          extra = before !== relTier(state.rel[npc.id]) ? ' ★' : '';
          ui.toast(`Friendship with ${first} +8${extra}`);
        }
        say(chatLine(state.rel[npc.id] ?? 0, talkRng), menu());
      },
    },
    { label: 'Ask about the city', fn: () => say(cityLine(talkRng), menu()) },
    bye,
  ];
  say(intro, menu());
}

function useAtm() {
  const menu = () => [
    { label: 'Withdraw $100', fn: () => move(-100) },
    { label: 'Deposit $100', fn: () => move(100) },
    { label: 'Deposit all', fn: () => move(state.cash) },
    { label: 'Exit', fn: () => ui.closeDialog() },
  ];
  const show = (msg = '') =>
    ui.openDialog({
      name: 'HALCYON SAVINGS · ATM',
      text: `${msg}Balance: $${state.bank.toLocaleString()}   ·   Cash: $${state.cash.toLocaleString()}`,
      choices: menu(),
      onClose: () => (player.locked = false),
    });
  const move = (amt) => {
    if (amt > 0 && state.cash < amt) return show('Not enough cash. ');
    if (amt < 0 && state.bank < -amt) return show('Insufficient funds. ');
    if (amt === 0) return show('Nothing to deposit. ');
    state.cash -= amt;
    state.bank += amt;
    audio.coin();
    show(amt > 0 ? 'Deposited. ' : 'Please take your cash. ');
  };
  player.locked = true;
  show('Welcome. ');
}

function useThing(it) {
  if (it.type === 'atm') return useAtm();
  if (it.type === 'vending') {
    if (state.cash < 2) return ui.toast('Not enough cash.');
    state.cash -= 2;
    audio.coin();
    const drinks = ['Fizzy Peach', 'Cold Barley Tea', 'Melon Cream Soda', 'Volt Cola', 'Yuzu Water'];
    ui.toast(`*clunk* ${talkRng.pick(drinks)}. Refreshing.`);
  }
}

function findInteraction() {
  const npc = peds.nearest(player.pos, 2.3);
  let best = null;
  let bd = Infinity;
  for (const it of city.interactables) {
    const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
    if (d < it.r && d < bd) {
      best = it;
      bd = d;
    }
  }
  const nd = npc ? Math.hypot(npc.pos.x - player.pos.x, npc.pos.z - player.pos.z) : Infinity;
  if (npc && nd <= bd) return { label: `Talk to ${npc.known ? npc.name : 'stranger'}`, act: () => talkTo(npc) };
  if (best) return { label: best.label, act: () => useThing(best) };
  return null;
}

// ----------------------------------------------------------------------------
// Title -> play
const SUBTITLES = {
  Downtown: 'glass, steel and late trains',
  'Old Market': 'where the city keeps its stories',
  'Kiln Heights': 'old factories, new coffee',
  Greenway: 'quiet streets, tall trees',
  'Greenway Park': 'a fountain, some ducks (imagined)',
  'Ember Row': 'the fog does odd things here',
  'Lantern Quarter': 'something old is awake',
};
let playing = false;
let district = '';
ui.showTitle(save ? `slot 1 · day ${Math.floor((save.minutes ?? 0) / 1440) + 1}` : 'no save', () => {
  playing = true;
  audio.start();
  rig.setMode('follow');
  ui.hint(
    input.isTouch
      ? 'Left thumb: move · Right thumb: look · <b>USE</b> talk/interact · <b>STYLE</b> wardrobe'
      : '<b>WASD</b> walk · <b>Shift</b> run · <b>drag</b> look · <b>E</b> talk/use · <b>C</b> wardrobe · <b>Esc</b> menu',
    10,
  );
});

// ----------------------------------------------------------------------------
// Main loop
let last = performance.now();
let time = 0;
let saveTimer = 0;
let districtTimer = 0;
let current = null;
const park = city.blocks.find((b) => b.kind === 'park');

function handleKeys() {
  if (input.hit('Escape', 'KeyP')) {
    player.locked = true;
    ui.openPause(
      settings,
      () => applySettings(),
      () => {
        player.locked = false;
        saveNow(true);
      },
      () => {
        resetting = true;
        clearSave();
        location.reload();
      },
    );
    return;
  }
  if (input.hit('KeyC')) {
    player.locked = true;
    rig.setMode('wardrobe');
    ui.openWardrobe(
      state.appearance,
      (app) => crowd.setAppearance(player.char.id, app),
      (app) => {
        state.appearance = app;
        player.locked = false;
        rig.setMode('follow');
        saveNow(true);
      },
    );
    return;
  }
  if (input.hit('KeyM')) {
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    ui.toast(settings.muted ? 'Sound off' : 'Sound on');
  }
  if (input.hit('KeyE') && current) current.act();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  input.enabled = playing && !ui.modal;
  if (playing && !ui.modal) handleKeys();
  clock.update(dt, playing && !ui.modal && input.keys.has('KeyT'));

  player.update(dt, input, rig.yaw, (p, r) => {
    traffic.push(p, r);
    peds.push(p, r);
  });
  peds.update(dt, player.pos, env.night);
  traffic.update(dt, player.pos, peds.list, env.night);
  if (traffic.honk && playing) {
    const d = traffic.honk.distanceTo(player.pos);
    audio.horn(0.14 * clamp(1 - d / 45, 0, 1));
  }
  for (const npc of peds.list) if (npc.mode === 'talk') npc.speaking = !!ui.dialog?.typing;

  rig.update(dt, input, player, time);
  env.magic = lantern.influence(playing ? player.pos : camera.position);
  env.update(clock.hour, time, player.pos);
  city.update(dt);
  city.updateLampLights(playing ? player.pos : camera.position, env.night);
  lantern.update(dt, time, env.night);
  effects.update(time, env);
  sky.update(camera, time);
  crowd.update();

  if (playing) {
    current = ui.modal ? null : findInteraction();
    ui.setPrompt(current?.label ?? null);
    ui.setClock(clock.format(), clock.day);
    ui.setMoney(state.cash, state.bank);
    if ((districtTimer -= dt) <= 0) {
      districtTimer = 0.5;
      const d = city.districtAt(player.pos.x, player.pos.z);
      if (d !== district) {
        district = d;
        ui.showLocation(d.toUpperCase(), SUBTITLES[d]);
      }
    }
    if ((saveTimer += dt) > 20) {
      saveTimer = 0;
      saveNow();
    }
  }
  ui.update(dt);

  const parkD = park ? Math.hypot(player.pos.x - park.cx, player.pos.z - park.cz) : 999;
  const green = Math.max(smoothstep(45, 15, parkD), smoothstep(0.6, 1.0, Math.hypot(player.pos.x, player.pos.z) / 160));
  audio.update({ night: env.night, magic: env.magic, green, time });

  pipeline.render(scene, camera, time);
  input.endFrame();
  requestAnimationFrame(frame);
}

player.onStep = (run) => playing && audio.step(run);
requestAnimationFrame(frame);

// handy for debugging from the console
window.game = { scene, camera, renderer, clock, state, player, peds, traffic, city, env, settings, rig, ui, lantern };
