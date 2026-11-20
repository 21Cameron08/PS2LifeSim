import './style.css';
import * as THREE from 'three';
import { START, CITY } from './config.js';
import { Rng, clamp, smoothstep, damp } from './core/rng.js';
import { Input } from './core/input.js';
import { createTextures } from './render/textures.js';
import { PS2Pipeline } from './render/ps2pipeline.js';
import { Sky } from './render/sky.js';
import { Environment } from './render/environment.js';
import { City } from './world/city.js';
import { LanternQuarter } from './world/lanternQuarter.js';
import { Effects } from './world/effects.js';
import { Crowd } from './actors/crowd.js';
import { Player, CameraRig, citySpace } from './actors/player.js';
import { Apartments } from './world/apartments.js';
import { Store } from './world/store.js';
import { Club } from './world/club.js';
import { Clubbers } from './actors/clubbers.js';
import { Gullys } from './world/gullys.js';
import { Diners } from './actors/diners.js';
import { GullysVisit } from './game/gullysVisit.js';
import { Needs, NEEDS } from './game/needs.js';
import { additive } from './render/materials.js';
import { buildPlaces } from './game/places.js';
import { CityMap } from './ui/map.js';
import { Waypoint } from './world/waypoint.js';
import { StoreJob } from './game/job.js';
import { Pedestrians } from './actors/pedestrians.js';
import { Traffic } from './actors/traffic.js';
import { defaultPlayerAppearance } from './actors/appearance.js';
import { Clock, loadSave, writeSave, clearSave, DEFAULT_SETTINGS } from './game/state.js';
import { greeting, chatLine, cityLine, KEEPER_LINES, relTier, CLUB_GREET, CLUB_CHAT, DRINK_THANKS } from './game/dialogue.js';
import { DanceGame } from './game/dance.js';
import { nightTheme, dayName } from './game/clubNights.js';
import { setTheme } from './audio/clubTrack.js';
import { BarJob } from './game/barJob.js';
import { DjSet } from './game/djSet.js';
import { Undercurrent } from './world/undercurrent.js';
import { PhotoBooth, stripTexture } from './game/photobooth.js';
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
  home: save?.home ?? 'starter',
  rentWeek: save?.rentWeek,
  seen: save?.seen ?? {},
  job: save?.job,
  clubStamp: save?.clubStamp, // the night your hand was stamped at SUBSTATION
  coatCheck: save?.coatCheck, // your jacket, if it's at the club's coat check
  vipNight: save?.vipNight, // the night you bought a VIP wristband
  drinks: save?.drinks, // tonight's drinks: { night, alc, count, at }
  clubRel: save?.clubRel ?? {}, // friendships with people at SUBSTATION, by key
  clubKnown: save?.clubKnown ?? {},
  clubChat: save?.clubChat ?? {},
  clubTreat: save?.clubTreat ?? {},
  danceBest: save?.danceBest ?? 0,
  photos: save?.photos ?? [], // photo-booth strips (data URLs), newest first
  clubMem: save?.clubMem ?? {}, // what you last did with each regular: { night, did }
  barJob: save?.barJob, // bartending at SUBSTATION: { hired, earned, shifts }
  djGig: save?.djGig, // a booked DJ set: { night, slot }
  djRep: save?.djRep ?? 0, // good sets played
  djSets: save?.djSets ?? 0,
  doorNight: save?.doorNight, // the last night Dmitri's friendship went up
  doorChat: save?.doorChat,
  doorTip: save?.doorTip,
  gullToys: save?.gullToys ?? [], // Gull Box toys collected (ids), on top of the fridge
  gullMeals: save?.gullMeals ?? 0,
  gullOrders: save?.gullOrders ?? 0,
  lastMeal: save?.lastMeal,
  fridge: save?.fridge ?? 4, // home-cooked meals left in the fridge
};
const needs = new Needs(save?.needs);
const SAVE_VERSION = 2;
// saves from before apartments existed keep money/looks but start you at home
const freshStart = !save || save.v !== SAVE_VERSION;

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
const apts = new Apartments(scene, city, tex);
apts.setHome(state.home);
const outdoor = citySpace(city);
const store = new Store(scene, city, tex, apts.tex);
const crowd = new Crowd(scene, tex, 264);
// where do we start? a fresh life starts inside your apartment
let place = freshStart ? apts.byId[state.home] : save.inside ? apts.byId[save.inside] : null;
let touring = false;
const homeApt = apts.byId[state.home];
const startAt = place ? (freshStart ? place.spawn : save.player) : (save?.player ?? homeApt.exit);
const player = new Player(crowd, place ? place.space : outdoor, state.appearance, startAt);
const peds = new Pedestrians(crowd, city, 72);
const traffic = new Traffic(scene, tex, 24);
const clock = new Clock(save?.minutes ?? START.hour * 60);
const job = new StoreJob({ store, crowd, ui, audio, state, clock, player });
job.blocked = () => barJob.onShift;
if (state.job.hired) store.helpWanted.visible = false;
store.onChime = () => camera.position.distanceTo(store.doorCenter) < 35 && audio.chime();
const storeSpace = { ...outdoor, indoor: true, ceiling: store.origin.y + store.H };
let inStore = false;
let cctvTick = 0;
const club = new Club(scene, city, tex, apts.tex);
const clubbers = new Clubbers(crowd, club, city);
clubbers.bartenders[0].name = 'Nadia';
const barJob = new BarJob({ scene, club, clubbers, ui, audio, state, clock, player, crowd, tex });
const under = new Undercurrent(scene, club, crowd, apts.tex, tex);
let inUnder = false;
// the club has stairs, a balcony, a fire escape and a roof: the player's ground
// height depends on which level their feet are on
const cityGround = outdoor.groundHeight;
outdoor.groundHeight = (x, z) => club.groundAt(x, z, player.pos.y, cityGround(x, z));
// the club's lobby is low, its hall is 7 m tall: the camera asks where you are
const clubSpace = {
  ...outdoor,
  indoor: true,
  get ceiling() {
    return club.ceilingAt(player.pos);
  },
};
let inClub = false;
const nightOf = (m) => Math.floor((m - 6 * 60) / 1440);
const gullys = new Gullys(scene, city, tex, apts.tex);
const gullysSpace = { ...outdoor, indoor: true, ceiling: gullys.origin.y + gullys.H };
let inGullys = false;
const diners = new Diners(crowd, gullys, city, scene);
const visit = new GullysVisit({ gullys, diners, ui, audio, state, clock, player, input, apts, needs, saveNow: () => saveNow() });
if (state.gullToys.length) apts.setToys(state.gullToys);
let gullysKick = 0;
let lightsUpNight = -1;
const rig = new CameraRig(camera, player.space);
rig.yaw = player.yaw;
let outdoorDist = 6.2;
if (place) {
  apts.show(place);
  rig.dist = 3.4;
  rig.pitch = 0.42;
}
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
    v: SAVE_VERSION,
    home: state.home,
    rentWeek: state.rentWeek,
    seen: state.seen,
    clubStamp: state.clubStamp,
    coatCheck: state.coatCheck,
    vipNight: state.vipNight,
    drinks: state.drinks,
    clubRel: state.clubRel,
    clubKnown: state.clubKnown,
    clubChat: state.clubChat,
    clubTreat: state.clubTreat,
    danceBest: state.danceBest,
    photos: state.photos,
    clubMem: state.clubMem,
    barJob: state.barJob,
    djGig: state.djGig,
    djRep: state.djRep,
    djSets: state.djSets,
    doorNight: state.doorNight,
    doorChat: state.doorChat,
    doorTip: state.doorTip,
    gullToys: state.gullToys,
    gullMeals: state.gullMeals,
    gullOrders: state.gullOrders,
    lastMeal: state.lastMeal,
    fridge: state.fridge,
    needs: needs.save(),
    job: state.job,
    inside: place && !touring ? place.id : null,
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
      {
        label: 'Listen',
        fn: () => {
          needs.give({ fun: 3, social: 3 });
          say(KEEPER_LINES[(line = (line + 1) % KEEPER_LINES.length)], menu());
        },
      },
      {
        label: 'Touch the tree',
        fn: () => {
          needs.give({ fun: 8, energy: 5 });
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
          needs.add('fun', 10);
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
          needs.give({ fun: 6, social: 3 });
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
        needs.chat(`ped:${npc.id}`, clock.minutes, 10);
        if (state.lastChat[npc.id] !== clock.day) {
          state.lastChat[npc.id] = clock.day;
          const before = relTier(rel);
          // how it goes depends on your mood (and whether you've showered)
          const gain = Math.max(1, Math.round(8 * needs.charm));
          state.rel[npc.id] = Math.min(100, rel + gain);
          extra = before !== relTier(state.rel[npc.id]) ? ' ★' : '';
          ui.toast(`Friendship with ${first} +${gain}${extra}${needs.get('hygiene') < 25 ? ` · ${first} leans back a little.` : ''}`);
        }
        say(chatLine(state.rel[npc.id] ?? 0, talkRng), menu());
      },
    },
    {
      label: 'Ask about the city',
      fn: () => {
        needs.add('social', 1);
        say(cityLine(talkRng), menu());
      },
    },
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
    needs.give({ hunger: 4, energy: 8 });
    ui.toast(`*clunk* ${talkRng.pick(drinks)}. Refreshing.`);
  }
}

/** HALCYON 24's counter: groceries for the fridge and a few snacks. Mrs. Varga serves you. */
function storeCounter() {
  player.locked = true;
  const close = () => ui.closeDialog();
  const staff = job.J.hired;
  const say = (text) =>
    ui.openDialog({
      name: 'MRS. VARGA',
      text,
      choices: [
        { label: `Groceries for the week ($18 · 5 meals)${state.fridge ? ` · ${state.fridge} at home` : ''}`, fn: () => buy(18, () => (state.fridge = Math.min(12, state.fridge + 5)), 'Two paper bags. Noodles, eggs, bread, a sad lettuce. "Cook something real."') },
        { label: staff ? 'Day-old hot dog (staff: free)' : 'Day-old hot dog ($2)', fn: () => buy(staff ? 0 : 2, () => needs.give({ hunger: 18 }), 'It has been rotating since this morning. It tastes like it.') },
        { label: 'Coffee ($1.50)', fn: () => buy(1.5, () => needs.give({ energy: 14 }), 'Burnt, strong, perfect. Your eyes open a little wider.') },
        { label: 'Candy bar ($1.25)', fn: () => buy(1.25, () => needs.give({ hunger: 6, fun: 3 }), 'Chocolate, peanuts, gone in four bites.') },
        { label: 'Nothing, thanks', fn: close },
      ],
      onClose: () => (player.locked = false),
    });
  const buy = (price, fn, line) => {
    if (price > 0) {
      if (state.cash >= price) state.cash = Math.round((state.cash - price) * 100) / 100;
      else if (state.bank >= price) state.bank = Math.round((state.bank - price) * 100) / 100;
      else return say("Card's declined, cash is short. Come back when you're flush.");
      audio.beep();
    }
    fn();
    close();
    ui.toast(line);
    saveNow();
  };
  say(talkRng.pick(['What do you need?', 'Yes? Quickly, my show is on.', 'Make it quick.']));
}

// ----------------------------------------------------------------------------
// Apartments
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

function enterApartment(apt, tour = false) {
  ui.fade(() => moveIntoApartment(apt, tour), tour ? 'VIEWING' : 'LOADING');
}

function moveIntoApartment(apt, tour) {
  place = apt;
  touring = tour;
  apts.show(apt);
  player.teleport(apt.space, apt.spawn.x, apt.spawn.z, apt.spawn.yaw);
  outdoorDist = rig.dist;
  Object.assign(rig, { space: apt.space, dist: 3.4, pitch: 0.42, yaw: apt.spawn.yaw, curDist: 1.5, mode: 'follow', blend: 1 });
  ui.showLocation(apt.L.name.toUpperCase(), tour ? 'viewing · for lease' : 'home');
  if (tour) ui.hint('Look around, then use the front door to sign the lease or leave.', 7);
}

function exitApartment() {
  audio.stopMusic();
  ui.fade(() => {
    const apt = place;
    apt.tvOn = false;
    place = null;
    touring = false;
    apts.show(null);
    player.teleport(outdoor, apt.exit.x, apt.exit.z, apt.exit.yaw);
    Object.assign(rig, { space: outdoor, dist: outdoorDist, pitch: 0.28, yaw: apt.exit.yaw, curDist: outdoorDist, mode: 'follow', blend: 1 });
    district = '';
    if (!state.seen.leaseHint) {
      state.seen.leaseHint = true;
      ui.hint('Two nicer homes are up for lease: follow the <b>blue diamonds</b> to a loft in Kiln Heights and a penthouse Downtown.', 10);
    }
  });
}

function signLease(apt, inside) {
  const L = apt.L;
  const unlock = () => (player.locked = false);
  if (state.bank < L.moveIn) {
    ui.openDialog({
      name: 'LETTING AGENT',
      text: `Your bank balance is ${money(state.bank)}, and the move-in is ${money(L.moveIn)}. Deposit cash at any ATM, or come back when work picks up.`,
      choices: [{ label: 'OK', fn: () => ui.closeDialog() }],
      onClose: unlock,
    });
    return;
  }
  const old = apts.byId[state.home];
  state.bank -= L.moveIn;
  state.home = apt.id;
  apts.setHome(apt.id);
  audio.coin();
  if (inside) touring = false;
  ui.openDialog({
    name: 'LETTING AGENT',
    text: `Signed! Welcome home to ${L.name}.${old && old !== apt ? ` Your lease on ${old.L.name} has ended.` : ''} Rent of ${money(L.rent)} comes out of your bank every Monday morning.`,
    choices: [
      {
        label: inside ? 'Make yourself at home' : 'Go inside',
        fn: () => {
          ui.closeDialog();
          if (!inside) enterApartment(apt);
          else ui.showLocation(L.name.toUpperCase(), 'home');
        },
      },
    ],
    onClose: unlock,
  });
  saveNow(true);
}

function leaseOffer(apt, inside) {
  const L = apt.L;
  const choices = [];
  if (!inside) choices.push({ label: 'Take a tour', fn: () => (ui.closeDialog(), enterApartment(apt, true)) });
  choices.push({ label: `Sign the lease (${money(L.moveIn)})`, fn: () => signLease(apt, inside) });
  if (inside) choices.push({ label: 'Leave', fn: () => (ui.closeDialog(), exitApartment()) });
  choices.push({ label: inside ? 'Keep looking around' : 'Not now', fn: () => ui.closeDialog() });
  player.locked = true;
  ui.openDialog({
    name: 'LETTING AGENT',
    text: inside
      ? `So, what do you think? ${L.name} is ${money(L.moveIn)} to move in, then ${money(L.rent)} a week.`
      : `${L.title}. ${L.blurb} Move-in ${money(L.moveIn)} (deposit + first week), then ${money(L.rent)} a week.`,
    choices,
    onClose: () => (player.locked = false),
  });
}

const HOME_MEALS = [
  'Noodles with an egg dropped in. Classic.',
  'A cheese toastie, slightly burnt on one side. Perfect.',
  'Rice, kimchi and a fried egg.',
  'Pasta with whatever was in the fridge. It works.',
  'Leftover dumplings, pan-fried until crispy.',
  'Soup from a can, upgraded with pepper. Chef.',
];

/** The bed: sleep until morning, or a nap. */
function sleepMenu() {
  player.locked = true;
  const close = () => ui.closeDialog();
  const e = needs.get('energy');
  const cur = clock.minutes;
  let wake = Math.floor(cur / 1440) * 1440 + 7 * 60;
  if (wake <= cur) wake += 1440;
  let hours = (wake - cur) / 60;
  const morning = hours >= 4 && hours <= 15;
  if (!morning) hours = 8;
  const sleepFor = (h) => {
    close();
    ui.fade(() => {
      needs.sleep(h);
      clock.minutes += h * 60;
      needsLast = clock.minutes;
      const hungry = needs.get('hunger') < 25 ? ' Your stomach is growling.' : '';
      const rested = needs.get('energy') >= 95 ? 'Fully rested.' : needs.get('energy') >= 60 ? 'Better.' : 'Still groggy.';
      ui.toast(`You slept ${Math.round(h)} hours. ${rested}${hungry}`);
      saveNow();
    }, 'SLEEPING');
  };
  ui.openDialog({
    name: 'BED',
    text: e > 85 ? "You're not tired. You could lie here and stare at the ceiling, though." : e < 25 ? 'Your eyes are closing on their own.' : 'Bed. Warm, soft, right there.',
    choices: [
      { label: morning ? `Sleep until 7 AM (${Math.round(hours)}h)` : 'Sleep 8 hours', fn: () => sleepFor(hours) },
      { label: 'Nap for 2 hours', fn: () => sleepFor(2) },
      { label: 'Not yet', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

function useApt(it) {
  const home = !touring;
  const nope = (t) => ui.toast(t);
  switch (it.use) {
    case 'leave':
      if (touring) return leaseOffer(place, true);
      return exitApartment();
    case 'lights':
      place.lightsOn = !place.lightsOn;
      return audio.tone(1900, 'square', 0.02, 0.03);
    case 'tv':
      place.tvOn = !place.tvOn;
      return audio.tone(place.tvOn ? 2400 : 900, 'sine', 0.03, 0.12);
    case 'music':
      if (audio.music) return audio.stopMusic();
      return audio.startMusic(place.L.music);
    case 'sleep':
      if (!home) return nope('Comfy. You would need to live here to sleep here.');
      return sleepMenu();
    case 'dress':
      if (!home) return nope('Plenty of closet space.');
      return openWardrobe();
    case 'fridge':
      if (!home) return nope('Empty. It smells brand new.');
      if (!state.fridge) return ui.toast('Empty. Just condiments and hope. Groceries are at HALCYON 24.');
      if (needs.get('hunger') > 90) return ui.toast("You open the fridge, stare into it, and close it again. You're not hungry.");
      return ui.fade(() => {
        state.fridge--;
        clock.minutes += 20;
        needsLast = clock.minutes;
        needs.give({ hunger: 40, fun: 2 });
        ui.toast(`${talkRng.pick(HOME_MEALS)} (${state.fridge ? `${state.fridge} more in the fridge` : 'that was the last of the food'})`);
      }, 'COOKING');
    case 'shower': {
      if (!home) return nope('Great water pressure, according to the listing.');
      const bath = it.label.includes('bath');
      return ui.fade(() => {
        clock.minutes += bath ? 45 : 20;
        needsLast = clock.minutes;
        needs.give(bath ? { hygiene: 100, fun: 10, energy: 4 } : { hygiene: 100, energy: 3 });
        ui.toast(bath ? 'A long, hot bath. You emerge a new person.' : 'Fresh and clean.');
      }, bath ? 'BATHING' : 'SHOWERING');
    }
    case 'fire':
      needs.add('fun', 2);
      return ui.toast('The fire crackles. It is gas, but it tries its best.');
    default:
      return null;
  }
}

function aptLabel(it) {
  if (it.use === 'lights') return place.lightsOn ? 'Turn the lights off' : 'Turn the lights on';
  if (it.use === 'tv') return place.tvOn ? 'Turn the TV off' : 'Watch TV';
  if (it.use === 'music') return audio.music ? 'Stop the music' : it.label;
  return it.label;
}

function findInteraction() {
  if (place) {
    let best = null;
    let bd = Infinity;
    for (const it of place.interactables) {
      const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
      if (d < it.r && d < bd) {
        best = it;
        bd = d;
      }
    }
    return best ? { label: aptLabel(best), act: () => useApt(best) } : visit.anywhere();
  }
  if (!job.J.shift && near(player.pos, store.customerSpot, 1.0) && job.manager.home === 'counter' && !job.manager.path.length)
    return { label: 'Buy something at the counter', act: storeCounter };
  if (inUnder) return underInteraction();
  const work = job.findInteraction(player.pos);
  if (work) return work;
  const food = visit.find();
  if (food) return food;
  const nightlife = clubInteraction();
  if (nightlife) return nightlife;
  const door = apts.doorNear(player.pos);
  if (door) {
    const home = door.id === state.home;
    return {
      label: home ? `Enter ${door.L.name} (home)` : `${door.L.name} · for lease`,
      act: () => (job.J.shift ? ui.toast("You're on the clock. Clock out first.") : home ? enterApartment(door) : leaseOffer(door, false)),
    };
  }
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
  return visit.anywhere();
}

// ----------------------------------------------------------------------------
// SUBSTATION
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const clubNight = () => Clubbers.weekdayOfNight(clock.minutes);
const weekend = () => ['FRI', 'SAT'].includes(clubNight());
const tonightTheme = () => nightTheme(clubNight());
const DMITRI = 'club:staff:dmitri';
const coverCharge = () => tonightTheme().cover;
const vipPrice = () => (weekend() ? 150 : 100);
let seat = null; // the seat the player is sitting in

function clubInteraction() {
  const p = player.pos;
  const open = club.status === 'open';
  if (seat) return { label: 'Stand up', act: standUp };
  // whichever is nearer: a free seat or someone to talk to
  const seatOrTalk = () => {
    const sp = clubbers.freeSeats().find((q) => near(p, q, 0.85) && Math.abs(q.y - p.y) < 0.6);
    const a = clubbers.nearest(p, 1.5);
    const da = a ? Math.hypot(a.c.x - p.x, a.c.z - p.z) : Infinity;
    const ds = sp ? Math.hypot(sp.x - p.x, sp.z - p.z) : Infinity;
    if (a && da <= ds) return { label: `Talk to ${state.clubKnown[a.key] ? a.name : 'someone'}`, act: () => clubTalk(a) };
    if (sp) return { label: 'Sit down', act: () => sitDown(sp) };
    return null;
  };
  if (!inClub) {
    if (club.aloft(p)) {
      if (open && near(p, club.roofBarSpot, 1.2)) return { label: 'Order at the roof bar', act: () => barOrder('ROOF BAR') };
      return seatOrTalk();
    }
    if (club.status !== 'closed' && near(p, club.bouncerSpot, 1.9)) return { label: 'Talk to the bouncer', act: bouncerTalk };
    if (club.status === 'closed' && near(p, club.doorOut, 1.5)) return { label: 'SUBSTATION', act: () => ui.toast('Locked. Doors open at 10 PM.') };
    if (club.cartOpen && near(p, club.friesSpot, 1.4)) return { label: 'Buy fries ($4)', act: buyFries };
    return null;
  }
  const up = p.y > club.origin.y + 3;
  if (up) {
    if (club.status !== 'closed' && near(p, club.vipHostSpot, 1.9)) return { label: 'Talk to Celeste (VIP)', act: vipHost };
    return seatOrTalk();
  }
  const work = barJob.find(p, near);
  if (work) return work;
  if (barJob.onShift) {
    const nadia = clubbers.bartenders[0].c;
    if (nadia.visible && near(p, nadia, 1.5)) return { label: 'Talk to Nadia', act: nadiaTalk };
  }
  // backstage
  if (club.zoneAt(p) === 'green') {
    if (near(p, club.greenSpots.inside, 1.0)) return { label: 'Back to the floor', act: () => greenRoom(true) };
    if (near(p, club.greenSpots.rider, 1.0)) return { label: 'Help yourself to the rider', act: riderGrab };
    if (near(p, club.greenSpots.mirror, 1.0))
      return {
        label: 'Check yourself in the mirror',
        act: () => ui.toast(needs.get('hygiene') < 30 ? 'The bulbs are not kind. You look like you slept in a skip.' : needs.mood > 70 ? 'Bulbs all round, like a film star. You look great. You know it.' : 'You fix your hair. It un-fixes itself. Good enough.'),
      };
    if (near(p, club.greenSpots.records, 1.0)) return { label: "Flick through Halflife's records", act: () => (needs.add('fun', 3), ui.toast(talkRng.pick(['White labels, test pressings, one record that is just a recording of a fridge.', 'A sticker on a sleeve says DO NOT PLAY BEFORE 3AM. You put it back carefully.', 'Every record is filed by colour, then by mood. Respect.']))) };
    return seatOrTalk();
  }
  if (near(p, club.greenSpots.outside, 1.0)) return { label: greenAccess() ? 'Green room' : 'Green room (staff only)', act: () => greenRoom(false) };
  if (near(p, club.coatCounter, 1.3) && club.status !== 'closed') return { label: state.coatCheck ? 'Collect your jacket' : 'Check your jacket ($2)', act: coatCheck };
  if (near(p, club.photoSpot, 1.1)) return { label: 'Photo booth ($5)', act: photoBooth };
  if (open && club.barSpots.some((b) => near(p, b, 1.0))) return barJob.onShift ? { label: 'Talk to Nadia', act: nadiaTalk } : { label: 'Order at the bar', act: () => barOrder('BAR') };
  if (open && near(p, club.w(11.7, 3.0), 1.3)) {
    if (club.humOpen) return { label: 'Slip behind the coil (the hatch is glowing)', act: enterUndercurrent };
    if (djGigTonight() && !dj.active) return { label: `Take the decks (your ${state.djGig.slot === 'prime' ? 'prime-time' : 'warm-up'} set)`, act: startDjSet };
    return { label: 'Talk to DJ Halflife', act: djTalk };
  }
  if (open && club.onFloor(p)) return { label: 'Dance', act: () => startDance() };
  return seatOrTalk();
}

// ---------------------------------------------------------------- the door
/** Why the bouncer won't let you in dressed like that (or null). */
function dressCode() {
  const a = state.appearance;
  const th = tonightTheme();
  if (needs.get('hygiene') < 20) return 'Whoa. No. You smell like the bottom of a gym bag. Go home and shower, then we can talk.';
  if (a.bottomStyle === 1 && !th.shorts) return "Shorts? No. It's a club, not a barbecue. Go and change.";
  if (th.sleeves && a.topStyle === 0) return `It's ${th.name}. Long sleeves or a jacket. T-shirts are for Thursdays.`;
  return null;
}

function bouncerTalk() {
  const tonight = nightOf(clock.minutes);
  const unlock = () => (player.locked = false);
  const say = (text, choices) => ui.openDialog({ name: 'DMITRI · DOOR', text, choices, onClose: unlock });
  player.locked = true;
  if (club.status === 'lightsup') return say("Lights are up, we're done. Go home, drink some water.");
  if (state.clubStamp === tonight) return say(talkRng.pick(["You've got a stamp. Go on in.", 'Back again? Go on.', 'Stamp checks out. In you go.']));
  if (staffTonight()) {
    state.clubStamp = tonight;
    return say(talkRng.pick(['Staff? Go on through. Nadia was asking where you were.', "You're working? In you go. Don't be late again.", 'Ah, the help. In.']));
  }
  const rel = state.clubRel[DMITRI] ?? 0;
  const friend = rel >= 30;
  const close = rel >= 60;
  const bump = (n) => (state.clubRel[DMITRI] = Math.min(100, (state.clubRel[DMITRI] ?? 0) + Math.max(1, Math.round(n * needs.charm))));
  const no = dressCode();
  if (no) {
    say(`He looks you up and down. "${friend ? 'Sorry, mate. Rules are rules. ' : ''}${no}"`);
    ui.hint(input.isTouch ? 'Change your outfit with <b>STYLE</b>.' : 'Change your outfit with <b>C</b> (wardrobe).', 6);
    return;
  }
  // a line outside: friends of the door and VIPs walk past it
  const q = club.status === 'open' ? clubbers.queueLength() : 0;
  if (q >= 2 && !friend && state.vipNight !== tonight && state.queuedNight !== tonight) {
    const mins = q * 4;
    return say(`"There's a line." He nods at the ${q} people behind the rope. "Back of it."`, [
      {
        label: `Join the line (about ${mins} min)`,
        fn: () => {
          ui.closeDialog();
          ui.fade(() => {
            clock.minutes += mins;
            state.queuedNight = tonight;
            const sp = clubbers.club.bouncerSpot;
            player.teleport(player.space, sp.x - 0.9, sp.z + 0.4, -Math.PI / 2);
            setTimeout(() => bouncerTalk(), 700);
          }, 'IN THE LINE');
        },
      },
      { label: 'Not tonight', fn: () => ui.closeDialog() },
    ]);
  }
  const th = tonightTheme();
  const quiet = th.id === 'house' || th.id === 'low';
  const cover = close && quiet ? 0 : coverCharge();
  const sharp = state.appearance.topStyle === 2 ? 'Nice jacket. ' : '';
  const greet = close
    ? cover
      ? talkRng.pick([`There they are. ${th.name} tonight, it'll be wild. ${cover}, cash. Sorry, the boss counts.`, `My favourite regular. ${cover} tonight, I can't do anything about Saturdays.`])
      : talkRng.pick(["There they are. Put your money away, you're with me tonight.", 'On the house. Go on, before anyone sees.'])
    : friend
      ? talkRng.pick([`He unhooks the rope before you even get to the front. "${th.name} tonight. ${cover}, cash."`, `"Hey, you. Skip the line." He waves you up. "${cover}, cash."`])
      : talkRng.pick([`${sharp}${cover} to get in. Cash. It's ${th.name} tonight.`, `Evening. ${sharp}It's ${th.name}, ${cover}, cash only.`, `You on your own? ${sharp}${cover}, cash.`]);
  const choices = [
    {
      label: cover ? `Pay $${cover}` : 'Go in (on the house)',
      fn: () => {
        if (state.cash < cover) return say("Cash only, friend. Come back when you've got it.");
        state.cash -= cover;
        state.clubStamp = tonight;
        if (cover) audio.coin();
        if (state.doorNight !== tonight) {
          state.doorNight = tonight;
          bump(4);
        }
        say('He stamps the back of your hand: a little lightning bolt. "You can come and go till close. Have a good one."');
        saveNow();
      },
    },
  ];
  if (state.doorChat !== tonight)
    choices.push({
      label: "How's the door tonight?",
      fn: () => {
        state.doorChat = tonight;
        bump(3);
        needs.chat('club:dmitri', clock.minutes, 6);
        say(
          talkRng.pick([
            `${th.name} brings out the best of them. And the worst. Mostly the worst.`,
            "Turned away a guy in flip-flops who said he knew the DJ. Everyone knows the DJ.",
            'Cold out here. But I can hear the drop through the wall. That keeps me going.',
            "Twelve years on this door. You learn to read people. You, you're alright.",
          ]),
          choices.filter((c) => !c.label.startsWith('How')),
        );
      },
    });
  if (state.doorTip !== tonight)
    choices.push({
      label: 'Tip him $10',
      fn: () => {
        if (state.cash < 10) return say('He laughs. "Keep it. Looks like you need it more than me."');
        state.cash -= 10;
        state.doorTip = tonight;
        audio.coin();
        bump(8);
        say('He pockets it without looking. "I never saw you. Which means I always see you. Get it?"', choices.filter((c) => !c.label.startsWith('Tip')));
      },
    });
  choices.push({ label: 'Not tonight', fn: () => ui.closeDialog() });
  say(greet, choices);
}

/** Working tonight: on a bar shift, or a DJ set booked. */
function staffTonight() {
  return barJob.onShift || djGigTonight();
}
function djGigTonight() {
  return !!state.djGig && state.djGig.night === nightOf(clock.minutes);
}
const DJ_KEY = 'club:staff:dj';
/** Backstage: staff, the DJ's friends, and anyone who's played a good set. */
function greenAccess() {
  return staffTonight() || (state.clubRel[DJ_KEY] ?? 0) >= 40 || state.djRep >= 1;
}

// ---------------------------------------------------------------- the bar job
function hireTalk() {
  const close = () => ui.closeDialog();
  ui.openDialog({
    name: 'NADIA · BAR',
    text: "Hiring? Always. Somebody quits every Saturday. Eleven dollars an hour plus tips, any night we're open. You make what's on the card, you keep the glasses coming, you don't pour free drinks for your friends.",
    choices: [
      {
        label: "I'll take it",
        fn: () => {
          barJob.J.hired = true;
          saveNow();
          ui.openDialog({
            name: 'NADIA · BAR',
            text: "Good. Ask me for a shift any night we're open. The flap's at the end of the bar. Ice first, always ice first.",
            choices: [{ label: 'Got it', fn: close }],
            onClose: () => (player.locked = false),
          });
        },
      },
      { label: 'Maybe later', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

function nadiaTalk() {
  player.locked = true;
  const close = () => ui.closeDialog();
  ui.openDialog({
    name: 'NADIA',
    text: barJob.nadiaLine(),
    choices: [
      { label: 'End my shift', fn: () => (close(), barJob.clockOut()) },
      { label: 'Back to work', fn: close },
    ],
    onClose: () => (player.locked = !!barJob.work),
  });
}

// ---------------------------------------------------------------- the DJ
const dj = new DjSet({
  ui,
  audio,
  getBeat: () => audio.musicBeat() ?? club.beat,
  onEnd: (r) => endDjSet(r),
  onCheer: () => audio.ctx && audio.cheer(audio.master, audio.ctx.currentTime),
});

/** The next night with a warm-up slot (midweek or STATIC), or the next CURRENT Friday for a prime-time set. */
function nextGigNight(prime) {
  const now = nightOf(clock.minutes);
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  for (let k = clock.hour >= 6 && clock.hour < 21 ? 0 : 1; k < 9; k++) {
    const d = DAYS[(((now + k) % 7) + 7) % 7];
    const th = nightTheme(d).id;
    if (prime ? th === 'current' : th === 'house' || th === 'static') return { night: now + k, day: d };
  }
  return null;
}

function djTalk() {
  player.locked = true;
  const close = () => ui.closeDialog();
  const rel = () => state.clubRel[DJ_KEY] ?? 0;
  if (dj.active) return;
  needs.chat('club:dj', clock.minutes, 8);
  const tonight = nightOf(clock.minutes);
  if (state.djChat !== tonight) {
    state.djChat = tonight;
    state.clubRel[DJ_KEY] = Math.min(100, rel() + 3);
  }
  const say = (text, choices) => ui.openDialog({ name: 'DJ HALFLIFE', text, choices, onClose: () => (player.locked = false) });
  const menu = () => {
    const out = [{ label: 'Request a song', fn: () => say(talkRng.pick(['She points at her headphones, grins, and plays whatever she wants.', '"Ask me again after the drop." She does not ask you again.', '"I play what the room needs. The room needs this."']), menu()) }];
    if (state.djGig) {
      const days = state.djGig.night - tonight;
      out.push({ label: 'About my set...', fn: () => say(days === 0 ? 'Tonight! Come to the booth when you are ready. Build before the drop. I will be right beside you.' : `${days === 1 ? 'Tomorrow' : `In ${days} nights`}. ${state.djGig.slot === 'prime' ? 'Friday prime time. Do not let me down.' : 'Warm-up slot. Keep them moving, save the big stuff.'}`, menu()) });
    } else
      out.push({
        label: 'How do I get a set here?',
        fn: () => {
          const ready = (state.danceBest ?? 0) >= 25 || rel() >= 15;
          if (!ready) return say("Show me you can feel a room first. Get on that floor, get your combo up, come and talk to me more. Then we'll see.", menu());
          const prime = state.djRep >= 2;
          const g = nextGigNight(prime);
          if (!g) return say('Booked solid. Ask me next week.', menu());
          say(
            prime
              ? `You've earned it. ${dayName(g.day)}, CURRENT, prime time. Ten phrases, one hundred forty dollars, and the crowd decides the tips.`
              : `Alright. Warm-up slot, ${dayName(g.day)} night. Eight phrases: pick what comes next, hit the cue on the one. Sixty bucks plus tips. Build before you drop.`,
            [
              {
                label: 'Book it',
                fn: () => {
                  state.djGig = { night: g.night, slot: prime ? 'prime' : 'warmup' };
                  saveNow();
                  say(`Booked. ${dayName(g.day)}. Come to the booth any time after ten. The green room's yours that night too.`, [{ label: 'See you then', fn: close }]);
                },
              },
              { label: 'Not yet', fn: close },
            ],
          );
        },
      });
    out.push({ label: 'Bye', fn: close });
    return out;
  };
  say(talkRng.pick(["Hey. Make it quick, I'm mixing.", 'You again! Having a good night?', "If you're here to request something, the answer is no. Hi though."]), menu());
}

function startDjSet() {
  const g = state.djGig;
  player.locked = true;
  if (seat) standUp();
  dj.start({ phrases: g.slot === 'prime' ? 10 : 8, slot: g.slot });
  clubbers.djAway = true;
  rig.yaw = Math.PI;
  rig.setMode('dj');
  ui.openDj((k) => (k === 'stop' ? dj.end(true) : k === 'cue' ? dj.cue() : dj.choose(k)));
  ui.toast('Halflife slides the headphones over to you. "All yours. Build before the drop."');
}

function updateDj(dt) {
  if (!dj.active) return;
  dj.update(dt);
  ui.setDj(dj.view());
  const sp = club.djSpot;
  const c = player.char;
  player.pos.set(sp.x, sp.y, sp.z);
  player.yaw = 0;
  c.x = sp.x;
  c.z = sp.z;
  c.y = sp.y;
  c.ground = sp.y;
  c.yaw = 0;
  c.work = true;
  c.amount = 0;
  c.nod = 0.15 * Math.pow(Math.abs(Math.cos(Math.PI * club.beat)), 6);
  if (club.status !== 'open' || !inClub) dj.end(true);
}

function endDjSet(r) {
  ui.closeDj();
  rig.setMode('follow');
  clubbers.djAway = false;
  player.char.work = false;
  player.locked = false;
  const front = club.w(11.7, 3.4);
  player.teleport(player.space, front.x, front.z, 0);
  const g = state.djGig ?? { slot: r.slot };
  state.djGig = null;
  state.djSets++;
  const base = g.slot === 'prime' ? 140 : 60;
  const phrases = g.slot === 'prime' ? 10 : 8;
  const done = r.played >= phrases;
  const pay = done ? base : Math.round(base * Math.max(0.25, r.played / phrases));
  const tips = Math.round(r.avg * (g.slot === 'prime' ? 1.4 : 0.7));
  state.cash += pay + tips;
  audio.coin();
  const good = r.avg >= 55 && done;
  if (good) state.djRep++;
  state.clubRel[DJ_KEY] = Math.min(100, (state.clubRel[DJ_KEY] ?? 0) + (good ? 12 : 4));
  needs.give({ fun: 20, social: 10, energy: -6 });
  player.locked = true;
  const verdict =
    r.avg >= 75 ? '"Okay. OKAY. They were going mental. You can come back."' : r.avg >= 55 ? '"Not bad at all. You kept them. That\'s the job."' : r.avg >= 35 ? '"Bit rough. You\'ll get there. Builds before drops, remember."' : '"...I\'ll take it from here."';
  ui.openDialog({
    name: 'DJ HALFLIFE',
    text: `${verdict}\n\nCrowd energy ${Math.round(r.avg)}% · ${r.drops} drop${r.drops === 1 ? '' : 's'} · ${r.cleans} clean mix${r.cleans === 1 ? '' : 'es'}${r.wrecks ? ` · ${r.wrecks} trainwreck${r.wrecks > 1 ? 's' : ''}` : ''}\nPaid: $${pay} cash + $${tips} in tips.${good && state.djRep === 2 ? '\n\n"Ask me about a Friday."' : ''}`,
    choices: [{ label: 'Pocket the cash', fn: () => ui.closeDialog() }],
    onClose: () => (player.locked = false),
  });
  saveNow();
}

// ---------------------------------------------------------------- the green room
function greenRoom(inside) {
  if (!inside && !greenAccess()) return ui.toast('Locked. STAFF ONLY. Behind the door, someone laughs at a joke you will never hear.');
  ui.fade(() => {
    const sp = inside ? club.greenSpots.outside : club.greenSpots.inside;
    player.teleport(player.space, sp.x, sp.z, sp.yaw);
    rig.yaw = sp.yaw;
    if (!inside && !state.seen.greenRoom) {
      state.seen.greenRoom = true;
      setTimeout(() => ui.hint('The green room: sit on the sofa to get your energy back, and help yourself to the rider.', 8), 600);
    }
  }, inside ? 'BACK TO THE FLOOR' : 'BACKSTAGE');
}

function riderGrab() {
  const tonight = nightOf(clock.minutes);
  if (state.riderNight !== tonight) {
    state.riderNight = tonight;
    state.riderCount = 0;
  }
  if (state.riderCount >= 3) return ui.toast("You've already raided the rider. Halflife's watching you.");
  state.riderCount++;
  needs.give({ hunger: 15, fun: 3 });
  ui.toast(talkRng.pick(['Fancy crisps and a single, perfect grape.', 'A tiny sandwich with the crusts cut off. Rock and roll.', 'Sparkling water with a name you cannot pronounce.']));
}

// ---------------------------------------------------------------- the Undercurrent
function enterUndercurrent() {
  ui.fade(() => {
    if (seat) standUp();
    leaveInterior();
    inUnder = true;
    state.restedHere = false;
    under.show(true);
    const sp = under.spots.spawn;
    player.teleport(under.space, sp.x, sp.z, sp.yaw);
    Object.assign(rig, { space: under.space, dist: 3.4, pitch: 0.3, yaw: sp.yaw, curDist: 1.5, mode: 'follow', blend: 1 });
    audio.startMusic('under');
    const hm = clock.format().split(' ').filter(Boolean)[1];
    ui.showLocation('THE UNDERCURRENT', `it is still ${hm}`);
    if (!state.seen.undercurrent) {
      state.seen.undercurrent = true;
      setTimeout(() => ui.hint("Down here the clock doesn't move. Rest, listen, talk to the regulars. The hatch takes you back up whenever you're ready.", 10), 2200);
      saveNow();
    }
  }, '3:33');
}

function leaveUndercurrent() {
  ui.fade(() => {
    if (seat) standUp();
    inUnder = false;
    under.show(false);
    audio.stopMusic();
    const front = club.w(11.7, 3.4);
    player.teleport(outdoor, front.x, front.z, 0);
    Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: 0, curDist: rig.dist, mode: 'follow', blend: 1 });
    const hm = clock.format().split(' ').filter(Boolean)[1];
    ui.toast(`You climb back through the hatch. The clock says ${hm}. It has always said ${hm}.`);
  }, '3:33');
}

const UNDER_LINES = {
  Vesper: ["What'll it be? We only have nothing. It's very good.", 'Time is a guest here. It waits outside.', 'You came through the coil. Most people come through the coil.'],
  'The man in the hat': ['I came in at 3:33 in 1987. Lovely night. Still is.', "Shh. Listen. That's the club, upstairs, played very slowly.", 'The gulls know about this place. Gulls know everything.'],
  'A woman with lantern eyes': ['The tree grew down here looking for water. It found music instead.', "Every lantern anyone ever let go of comes here eventually. That one's yours.", 'You can feel it, right? The hum.'],
  'Someone humming': ['Mm-hm-hmm. Hmm. Mmmm.', 'Hmm? Oh. Hi. Hmm-hmm.', "Hmm. (They hum the drop from tonight's set, slower, much sadder.)"],
  'A sleepy raver': ["I was at OVERLOAD. Then I wasn't. Then I was here.", 'Is it still Saturday? It feels like Saturday.', 'Best afterparty in the city. No queue. No Dmitri.'],
};

function underInteraction() {
  const p = player.pos;
  if (seat) return { label: under.seats.includes(seat) && !state.restedHere ? 'Close your eyes for a while' : 'Stand up', act: under.seats.includes(seat) && !state.restedHere ? underRest : standUp };
  if (near(p, under.spots.door, 1.1)) return { label: 'Climb back up through the hatch', act: leaveUndercurrent };
  const a = under.nearest(p, 1.5);
  const sp = under.freeSeats().find((q) => near(p, q, 0.95));
  if (a && (!sp || Math.hypot(a.c.x - p.x, a.c.z - p.z) < Math.hypot(sp.x - p.x, sp.z - p.z)))
    return { label: a.role === 'bar' ? 'Talk to Vesper' : `Talk to ${a.name.toLowerCase().startsWith('the') || a.name.startsWith('A ') || a.name.startsWith('Some') ? a.name.charAt(0).toLowerCase() + a.name.slice(1) : a.name}`, act: () => underTalk(a) };
  if (sp) return { label: 'Sit down', act: () => sitDown(sp) };
  if (near(p, under.spots.arch, 1.6)) return { label: 'Look through the arch', act: () => (needs.add('fun', 3), ui.toast('The tree from the Lantern Quarter, in a night with more stars than this one. A lantern drifts past on the other side and waves. Lanterns cannot wave.')) };
  if (near(p, under.spots.switchboard, 1.2)) return { label: 'Pull the big brass lever', act: () => (needs.add('fun', 4), audio.coilHum(), ui.toast('Clunk. Every dial swings to 3:33 and the lanterns all turn to look at you. Then they go back to drifting.')) };
  if (near(p, under.spots.record, 1.0)) return { label: 'Look at the record', act: () => ui.toast('The label just says SUBSTATION · 48 BARS · 3:33. It plays at a speed no record player has.') };
  return null;
}

function underTalk(a) {
  player.locked = true;
  a.talking = true;
  needs.chat(`under:${a.name}`, clock.minutes, 10);
  const close = () => ui.closeDialog();
  const choices = [];
  if (a.role === 'bar' && state.nothingDrink !== nightOf(clock.minutes))
    choices.push({
      label: 'A glass of nothing, please',
      fn: () => {
        state.nothingDrink = nightOf(clock.minutes);
        needs.give({ energy: 25, fun: 6 });
        ui.openDialog({ name: 'VESPER', text: 'She pours you a glass of something clear that tastes exactly like the moment before a drop. You feel wide awake.', choices: [{ label: 'Thank you', fn: close }], onClose: () => ((a.talking = false), (player.locked = false)) });
      },
    });
  choices.push({ label: 'Goodbye', fn: close });
  ui.openDialog({ name: a.name.toUpperCase(), text: talkRng.pick(UNDER_LINES[a.name] ?? UNDER_LINES.Vesper), choices, onClose: () => ((a.talking = false), (player.locked = false)) });
}

function underRest() {
  state.restedHere = true;
  ui.fade(() => {
    needs.give({ energy: 45, fun: 20, social: 5 });
    ui.toast(`You close your eyes. Somewhere far above, a drop lands, very slowly. When you open them it's still ${clock.format().split(' ').filter(Boolean)[1]}, and you feel new.`);
  }, '. . .');
}

function vipHost() {
  const tonight = nightOf(clock.minutes);
  const unlock = () => (player.locked = false);
  const say = (text, choices) => ui.openDialog({ name: 'CELESTE · VIP', text, choices, onClose: unlock });
  const bye = { label: 'Not now', fn: () => ui.closeDialog() };
  player.locked = true;
  const onBalcony = club.zoneAt(player.pos) === 'vip';
  if (state.vipNight !== tonight) {
    const price = vipPrice();
    return say(`Balcony's $${price} tonight. Wristband, a booth, the best view of the floor. Card's fine up here.`, [
      {
        label: `Wristband ($${price}, card)`,
        fn: () => {
          if (state.bank < price) return say("Card's declined, love. Happens to the best of us.", [bye]);
          state.bank -= price;
          state.vipNight = tonight;
          needs.add('fun', 10);
          audio.coin();
          say('She snaps a gold wristband on you and unhooks the rope. "Enjoy the view."', [bye]);
          saveNow();
        },
      },
      bye,
    ]);
  }
  if (!onBalcony) return say("You're on the list. Go on through.", [bye]);
  say('Anything for the balcony?', [
    {
      label: 'Bottle service ($200, card)',
      fn: () => {
        if (state.bank < 200) return say("That card's not having it. Maybe a water?", [bye]);
        state.bank -= 200;
        audio.coin();
        const t = club.vipTables.reduce((m, q) => (q.distanceTo(player.pos) < m.distanceTo(player.pos) ? q : m), club.vipTables[0]);
        club.sparkle(t);
        needs.give({ fun: 15, social: 12 });
        // everyone up here is suddenly your friend
        for (const v of clubbers.vips) if (v.mode !== 'off') state.clubRel[v.key] = Math.min(100, (state.clubRel[v.key] ?? 0) + 6);
        say('A bottle of Volta arrives at your booth with a sparkler fizzing on top. The whole balcony cheers.', [bye]);
        audio.cheer?.(audio.master, audio.ctx?.currentTime ?? 0);
        saveNow();
      },
    },
    bye,
  ]);
}

function coatCheck() {
  const app = state.appearance;
  if (state.coatCheck) {
    app.topStyle = 2;
    app.jacket = state.coatCheck.jacket;
    state.coatCheck = null;
    crowd.setAppearance(player.char.id, app);
    return ui.toast('Ticket 42. Your jacket, back on.');
  }
  if (app.topStyle !== 2) return ui.toast("You're not wearing a jacket.");
  if (state.cash < 2) return ui.toast('Two dollars, cash.');
  state.cash -= 2;
  state.coatCheck = { jacket: app.jacket };
  app.topStyle = 1;
  crowd.setAppearance(player.char.id, app);
  audio.coin();
  ui.toast('You hand over your jacket and get ticket 42.');
}

// ---------------------------------------------------------------- drinks
const DRINKS = [
  { name: 'Tap water', price: 0, line: 'Free. The bartender slides it over without looking up.' },
  { name: 'Cola', price: 4, line: 'Ice, straw, a slice of lemon nobody asked for.' },
  { name: 'Lime soda', price: 5, line: 'Sharp and cold. Perfect.' },
  { name: 'Ginger beer', price: 5, line: 'Spicy enough to make your eyes water.' },
  { name: 'Beer', price: 7, alc: 1, line: 'Plastic cup. Mostly foam. Still good.' },
  { name: 'Live Wire', price: 12, alc: 1, line: 'Gin, lime and something blue that fizzes. It tastes like a thunderstorm.' },
  { name: 'Brownout', price: 11, alc: 1, line: "Dark rum, cola and cold coffee. The DJ's favourite." },
  { name: 'Spark (shot)', price: 6, alc: 1, line: 'Cinnamon and regret. The bartender rings a little bell.' },
];
/** How buzzed you are right now (0-3): wears off over an hour or so of game time. */
function buzz() {
  const d = state.drinks;
  if (!d) return 0;
  return Math.max(0, Math.min(3, d.alc - (clock.minutes - d.at) / 45));
}

function barOrder(where, forWhom = null) {
  const tonight = nightOf(clock.minutes);
  if (!state.drinks || state.drinks.night !== tonight) state.drinks = { night: tonight, alc: 0, count: 0, at: clock.minutes };
  const d = state.drinks;
  player.locked = true;
  const close = () => ui.closeDialog();
  ui.openDialog({
    name: where,
    text: forWhom ? `What's ${forWhom.name} having?` : talkRng.pick(['What can I get you?', "What'll it be?", 'Yeah? What are you having?']),
    choices: [
      ...(where === 'BAR' && !forWhom && !barJob.J.hired ? [{ label: 'Are you hiring?', fn: () => (close(), (player.locked = true), hireTalk()) }] : []),
      ...(where === 'BAR' && !forWhom && barJob.J.hired && !barJob.onShift && !job.J.shift ? [{ label: 'Start a bar shift', fn: () => (close(), barJob.clockIn(nightOf(clock.minutes))) }] : []),
      ...DRINKS.map((dr) => ({
        label: dr.price ? `${dr.name} ($${dr.price})` : dr.name,
        fn: () => {
          close();
          if (!forWhom && dr.alc && d.count >= 4) return ui.toast("\"You're done, friend. Water's on the house.\" Fair enough.");
          if (state.cash < dr.price) return ui.toast("Cash only bar, and you're short.");
          state.cash -= dr.price;
          if (dr.price) audio.coin();
          if (forWhom) return giveDrink(forWhom, dr);
          d.alc = buzz() + (dr.alc ? 1 : dr.price === 0 ? -0.5 : 0);
          d.alc = Math.max(0, d.alc);
          d.at = clock.minutes;
          if (dr.alc) d.count++;
          needs.give(dr.alc ? { fun: 6, energy: -3 } : dr.price ? { hunger: 2, energy: 4 } : {});
          ui.toast(dr.line + (dr.alc && buzz() >= 2 ? ' The floor looks very inviting.' : ''));
        },
      })),
      { label: 'Nothing', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

function buyFries() {
  if (state.cash < 4) return ui.toast('Four dollars, cash. Card reader died in 2003.');
  state.cash -= 4;
  audio.coin();
  needs.give({ hunger: 22, fun: 2 });
  ui.toast(talkRng.pick(['Hot, salty, too many. Exactly right.', 'Ray adds extra salt without asking. Legend.', 'Paper cone of fries, burning your fingers.']));
}

// ---------------------------------------------------------------- people in the club
const clubWhere = (a) => (a.group === 'vip' ? 'vip' : a.group === 'roof' ? 'roof' : a.mode === 'bar' ? 'bar' : a.mode === 'sit' ? 'booth' : 'floor');

function clubTalk(a) {
  const tonight = nightOf(clock.minutes);
  a.talking = true;
  player.locked = true;
  player.yaw = Math.atan2(a.c.x - player.pos.x, a.c.z - player.pos.z);
  rig.setMode('talk');
  const rel = () => state.clubRel[a.key] ?? 0;
  const bump = (n) => (state.clubRel[a.key] = Math.min(100, rel() + n));
  const onClose = () => {
    a.talking = false;
    player.locked = false;
    rig.setMode('follow');
  };
  const known = !!state.clubKnown[a.key];
  const say = (text, choices) => ui.openDialog({ name: state.clubKnown[a.key] ? a.name.toUpperCase() : '???', text, choices, onClose });
  const bye = { label: 'Catch you later', fn: () => ui.closeDialog() };
  const menu = () => {
    const out = [
      {
        label: 'Chat',
        fn: () => {
          needs.chat(`club:${a.key}`, clock.minutes, 10);
          if (state.clubChat[a.key] !== tonight) {
            state.clubChat[a.key] = tonight;
            bump(Math.max(1, Math.round(4 * needs.charm)));
          }
          say(talkRng.pick(CLUB_CHAT[relTier(rel())]), menu());
        },
      },
      { label: 'Buy them a drink', fn: () => (ui.closeDialog(), barOrder(clubWhere(a) === 'roof' ? 'ROOF BAR' : 'BAR', a)) },
    ];
    if (a.group === undefined && club.status === 'open') out.push({ label: 'Dance with me?', fn: () => askToDance(a) });
    out.push(bye);
    return out;
  };
  if (!known) {
    state.clubKnown[a.key] = true;
    state.clubMem[a.key] = { night: tonight, did: 'chat' };
    return say(`${talkRng.pick(CLUB_GREET[clubWhere(a)])} I'm ${a.name}.`, menu());
  }
  say(talkRng.pick(CLUB_GREET[clubWhere(a)]), menu());
}

function giveDrink(a, dr) {
  const tonight = nightOf(clock.minutes);
  if (state.clubTreat?.[a.key] !== tonight) {
    state.clubTreat[a.key] = tonight;
    state.clubRel[a.key] = Math.min(100, (state.clubRel[a.key] ?? 0) + (dr.price >= 10 ? 10 : 6));
  }
  state.clubKnown[a.key] = true;
  state.clubMem[a.key] = { night: tonight, did: 'drink' };
  ui.toast(`${a.name}: "${talkRng.pick(DRINK_THANKS)}"`);
  saveNow();
}

function askToDance(a) {
  ui.closeDialog();
  if (a.mode !== 'dance') clubbers.reassign(a, 'dance');
  const tier = relTier(state.clubRel[a.key] ?? 0);
  if (tier === 'stranger' && (state.clubRel[a.key] ?? 0) < 6 && talkRng.chance(0.4)) return ui.toast(`${a.name} laughs. "Maybe after the next drop."`);
  // head to the floor together
  const spot = club.danceSpots.filter((sp) => !clubbers.taken.has(sp)).sort((p, q) => Math.hypot(p.x - player.pos.x, p.z - player.pos.z) - Math.hypot(q.x - player.pos.x, q.z - player.pos.z))[0];
  if (spot) {
    clubbers.taken.delete(a.spot);
    clubbers.taken.add(spot);
    a.spot = spot;
    a.mode = 'walk';
    a.role = 'dance';
    a.c.sit = false;
    a.path = [{ x: spot.x, z: spot.z }];
  }
  if (!club.onFloor(player.pos)) ui.toast(`${a.name} heads for the floor. Meet them there and press E to dance.`);
  else startDance(a);
  pendingPartner = a;
}
let pendingPartner = null;

// ---------------------------------------------------------------- sitting
function sitDown(sp) {
  seat = sp;
  clubbers.taken.add(sp);
  player.locked = true;
  player.pos.set(sp.x, sp.y, sp.z);
  player.yaw = sp.yaw;
}
function standUp() {
  const sp = seat;
  seat = null;
  clubbers.taken.delete(sp);
  player.locked = false;
  player.pos.x = sp.out.x;
  player.pos.z = sp.out.z;
  player.char.sit = false;
}
function updateSeat() {
  if (!seat) return;
  const c = player.char;
  player.pos.set(seat.x, seat.y, seat.z);
  player.yaw = seat.yaw;
  c.x = seat.x;
  c.z = seat.z;
  c.yaw = seat.yaw;
  c.sit = true;
  c.ground = seat.y;
  c.y = seat.y + 0.5 - 0.86 * state.appearance.height;
  c.amount = 0;
  if (Math.hypot(input.move().x, input.move().y) > 0.6) standUp();
}

// ---------------------------------------------------------------- dancing
const dance = new DanceGame({
  ui,
  audio,
  getBeat: () => audio.musicBeat() ?? club.beat,
  onHype: () => audio.ctx && audio.cheer(audio.master, audio.ctx.currentTime),
  onEnd: (r) => endDance(r),
});
function startDance(partner = pendingPartner) {
  if (dance.active) return;
  pendingPartner = null;
  if (partner && (partner.mode === 'off' || !partner.c.visible)) partner = null;
  player.locked = true;
  dance.start({ buzz: Math.min(2, buzz()), partner });
  clubbers.partner = partner;
  ui.openDance((k) => (k === 'stop' ? dance.stop() : dance.key(k)));
  rig.setMode('dance');
  if (partner) ui.toast(`Dancing with ${partner.name}. Hit the arrows on the beat.`);
}
function endDance(r) {
  ui.closeDance();
  rig.setMode('follow');
  player.locked = false;
  clubbers.partner = null;
  state.danceBest = Math.max(state.danceBest ?? 0, r.best);
  if (!r.total) return;
  const rate = (r.perfects + r.goods * 0.6) / r.total;
  needs.give({ fun: Math.round(rate * 10), social: r.partner ? 12 : 3 });
  const verdict = rate > 0.85 ? 'The crowd loved it.' : rate > 0.6 ? 'Solid moves.' : rate > 0.35 ? 'You found the beat. Mostly.' : 'Bold. Very bold.';
  if (r.partner) {
    const gain = Math.round(rate * 12);
    state.clubRel[r.partner.key] = Math.min(100, (state.clubRel[r.partner.key] ?? 0) + gain);
    state.clubMem[r.partner.key] = { night: nightOf(clock.minutes), did: 'danced' };
    ui.toast(`Best combo ${r.best} · ${r.perfects} perfect. ${r.partner.name}: "${rate > 0.6 ? 'Okay, you can DANCE.' : 'That was fun!'}"`);
  } else ui.toast(`Best combo ${r.best} · ${r.perfects} perfect, ${r.goods} good. ${verdict}`);
  saveNow();
}

// ---------------------------------------------------------------- photo booth
const booth = new PhotoBooth(renderer, scene, crowd, city.lampLights[0]);
if (state.photos?.[0]) stripTexture(state.photos[0], (t) => apts.setPhoto(t));
function photoBooth() {
  if (state.cash < 5) return ui.toast('$5 in coins. You check your pockets: not enough.');
  state.cash -= 5;
  audio.coin();
  player.locked = true;
  ui.modal = 'busy';
  ui.setPrompt(null);
  booth.begin(new THREE.Vector3(club.origin.x + 11, -40, club.origin.z + 8), `SUBSTATION · ${clubNight()} NIGHT · DAY ${clock.day}`);
  let k = 0;
  const shot = () => {
    const counts = ['3', '2', '1'];
    counts.forEach((t, i) => setTimeout(() => ui.flash(t, false), i * 420));
    setTimeout(() => {
      booth.shoot(player.char, k);
      ui.flash('', true);
      audio.tone(2600, 'square', 0.03, 0.05);
      setTimeout(() => ui.flash('', false), 90);
      k++;
      if (k < 4) setTimeout(shot, 650);
      else setTimeout(done, 900);
    }, counts.length * 420);
  };
  const done = () => {
    const url = booth.finish();
    needs.give({ fun: 14, social: 3 });
    state.photos = [url, ...(state.photos ?? [])].slice(0, 3);
    stripTexture(url, (t) => apts.setPhoto(t));
    saveNow();
    ui.modal = null;
    ui.openPhoto(url, () => (player.locked = false));
  };
  shot();
}

/** Where the club's music is muffled, and how loud, from where you're standing. */
function clubMix() {
  if (inClub) {
    const z = club.zoneAt(player.pos);
    if (z === 'stairs' && player.pos.y > club.origin.y + 3) return [1600, 0.32];
    return z === 'hall' ? [18000, 0.55] : z === 'vip' ? [16000, 0.46] : z === 'lobby' ? [1100, 0.36] : z === 'stairs' ? [900, 0.3] : z === 'toilets' ? [420, 0.28] : [700, 0.28];
  }
  if (club.aloft(player.pos)) return [650, 0.17];
  const d = Math.hypot(player.pos.x - club.doorCenter.x, player.pos.z - club.doorCenter.z);
  const fall = Math.pow(Math.max(0, 1 - d / 60), 1.6);
  return [170 + 900 * club.doorOpen, 0.0001 + 0.34 * fall * (0.7 + 0.3 * club.doorOpen)];
}

/** A regular you've made friends with comes over to say hi. */
function friendGreets(a) {
  const tonight = nightOf(clock.minutes);
  const mem = state.clubMem[a.key];
  const usual = [...a.nights].find((d) => d === clubNight());
  const lines = [
    mem?.did === 'danced' ? 'You! The dancer! Save me a spot on the floor later.' : null,
    mem?.did === 'drink' ? 'Hey, my favourite person. I still owe you a drink.' : null,
    usual ? `Told you I'm always here on ${dayName(usual)}s!` : null,
    mem && tonight - mem.night > 3 ? "Where have you BEEN? It's been ages." : null,
    'You came! I was hoping you would.',
    'There you are! This crowd is so much better with you in it.',
  ].filter(Boolean);
  ui.toast(`${a.name}: "${talkRng.pick(lines)}"`);
  needs.chat(`club:${a.key}`, clock.minutes, 8);
  state.clubRel[a.key] = Math.min(100, (state.clubRel[a.key] ?? 0) + 2);
  state.clubMem[a.key] = { night: tonight, did: mem?.did ?? 'chat' };
}

function updateClub(dt) {
  const tonight = nightOf(clock.minutes);
  barJob.update(dt, { open: club.status === 'open', nightId: club.night.id, inClub, playerPos: player.pos });
  updateDj(dt);
  if (inClub && club.humOpen && club.zoneAt(player.pos) === 'hall' && state.humNight !== tonight && playing && !ui.modal) {
    state.humNight = tonight;
    audio.coilHum();
    ui.toast('3:33. The coil hums. Behind it, around a little steel hatch, a seam of violet light.');
  }
  // tonight's theme sets the tempo: switching it means restarting the song
  const th = tonightTheme();
  if (club.night !== th) {
    setTheme(th.id);
    club.setNight(th);
    clubbers.setNight(th);
    if (audio.music?.style === 'club') audio.stopMusic();
  }
  const open = club.status === 'open';
  const allow = inClub || (open && state.clubStamp === tonight);
  const people = clubbers.people();
  if (allow && !inClub) people.push(player.pos);
  club.update(dt, time, env, { hour: clock.hour, beat: audio.musicBeat(), flash: settings.flash, camera, people, allow, vip: state.vipNight === tonight });
  clubbers.update(dt, {
    status: club.status,
    hour: clock.hour,
    weekday: Clubbers.weekdayOfNight(clock.minutes),
    beat: club.beat,
    section: club.section,
    playerPos: player.pos,
    playerInside: inClub,
    near: camera.position.distanceTo(club.floorCenter) < 95,
    nearDoor: near(player.pos, club.doorCenter, 10),
    onRoof: club.aloft(player.pos),
    hype: dance.hype,
    time,
    rel: state.clubRel,
    nightIndex: tonight,
    playerFree: inClub && club.zoneAt(player.pos) === 'hall' && !dance.active && !seat && !ui.modal && !barJob.onShift && !dj.active,
    crowdBoost: dj.active ? dj.energy / 100 : null,
    onGreet: friendGreets,
  });
  // dancing and sitting drive the player's puppet
  const pc = player.char;
  if (dance.active) {
    dance.update(dt);
    pc.dance = damp(pc.dance || 0, 1, 4, dt);
    pc.move = dance.move;
    pc.beat = club.beat;
    clubbers.partnerMove = dance.move;
    if (!inClub || club.status !== 'open') dance.stop();
  } else if (pc.dance) pc.dance = pc.dance < 0.02 ? 0 : damp(pc.dance, 0, 5, dt);
  updateSeat();
  // the sound system
  const dClub = Math.hypot(player.pos.x - club.floorCenter.x, player.pos.z - club.floorCenter.z);
  const want = playing && !place && !inUnder && open && dClub < 75;
  if (want && audio.music?.style !== 'club') audio.startMusic('club', { beat: club.beat });
  if (!want && audio.music?.style === 'club') audio.stopMusic();
  if (audio.music?.style === 'club') audio.setMusicMix(...clubMix());
  if (!playing) return;
  // 4 AM: lights up, music off; at 4:30 security walks out anyone still here
  if (inClub && club.status === 'lightsup' && lightsUpNight !== tonight) {
    lightsUpNight = tonight;
    ui.toast("4 AM. Lights up! That's the night.");
  }
  if (inClub && club.status === 'closed' && !ui.modal && !ui.fading) {
    ui.fade(() => {
      leaveInterior();
      const sp = club.outsideSpot;
      player.teleport(outdoor, sp.x, sp.z, 0);
      Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: 0, curDist: rig.dist, mode: 'follow', blend: 1 });
      ui.toast('Security walks you out. Go home, get some sleep.');
    }, 'CLOSING TIME');
  }
}

// ----------------------------------------------------------------------------
// GULLY'S
function updateGullys(dt) {
  const camD = camera.position.distanceTo(gullys.doorCenter);
  const people = diners.people();
  if (gullys.open) people.push(player.pos);
  gullys.update(dt, time, env, { hour: clock.hour, camera, people, serving: diners.serving(), riding: visit.riding > 0 });
  diners.update(dt, {
    hour: clock.hour,
    open: gullys.open,
    time,
    playerPos: player.pos,
    near: camD < 70,
    watched: camD < 45,
    cleaning: !gullys.open,
    serving: visit.serving,
    talking: visit.talking,
  });
  visit.update(dt, inGullys);
  if (!playing) return;
  // the in-store radio, and the kitchen
  const want = inGullys && gullys.open;
  if (want && audio.music?.style !== 'gullys') {
    audio.startMusic('gullys');
    audio.jingle();
  }
  if (!want && audio.music?.style === 'gullys') audio.stopMusic();
  // 2 AM: Pip politely walks the last customers out
  if (inGullys && !gullys.open && !ui.modal && !ui.fading) {
    if ((gullysKick += dt) > 12) {
      gullysKick = 0;
      ui.fade(() => {
        visit.interrupt();
        leaveInterior();
        const sp = gullys.outsideSpot;
        player.teleport(outdoor, sp.x, sp.z, sp.yaw);
        Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: sp.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
        ui.toast('Pip walks you to the door. "We\'re closed, hon! Back at six!"');
      }, 'CLOSING TIME');
    }
  } else gullysKick = 0;
}

// ----------------------------------------------------------------------------
// Needs: time drains them, places and activities fill them, and running on
// empty has consequences (see game/needs.js)
let needsLast = clock.minutes;
let passingOut = false;
const warnQueue = [];
let warnT = 0;
// a little green stink cloud when your hygiene gets low
const STINK = 10;
const stinkGeo = new THREE.BufferGeometry();
stinkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(STINK * 3), 3));
const stinkMat = additive({ map: tex.glow, color: new THREE.Color('#a8e060'), size: 0.34, points: true, opacity: 0 });
const stink = new THREE.Points(stinkGeo, stinkMat);
stink.frustumCulled = false;
stink.visible = false;
scene.add(stink);

function updateNeeds(dt) {
  if (!playing) {
    needsLast = clock.minutes;
    return;
  }
  // game time drains them; skips longer than half an hour (cheats, sleeping) are handled where they happen
  const dm = clock.minutes - needsLast;
  needsLast = clock.minutes;
  const mult = {};
  if (job.J.shift || barJob.onShift) Object.assign(mult, { energy: 1.6, hygiene: 1.4, fun: 1.4 });
  if (dm > 0 && dm < 30) needs.tick(dm, mult);

  // things that fill them while you're doing them (per real second)
  const home = place && !touring;
  if (home && place.tvOn) needs.add('fun', 0.25 * dt);
  if (home && audio.music) needs.add('fun', 0.08 * dt);
  if (seat?.green) needs.add('energy', 0.1 * dt);
  if (inUnder) needs.give({ energy: 0.06 * dt, fun: 0.1 * dt, social: 0.03 * dt });
  if (env.magic > 0.1) needs.add('fun', 0.12 * env.magic * dt);
  if (!place && city.blockAt(player.pos.x, player.pos.z)?.kind === 'park') needs.add('fun', 0.05 * dt);
  if (inClub && club.status === 'open') needs.give({ fun: 0.04 * dt, social: 0.05 * dt });
  if (inGullys && gullys.open) needs.add('social', 0.015 * dt);
  if (dance.active) needs.give({ fun: 0.45 * dt, energy: -0.2 * dt, hygiene: -0.15 * dt, social: clubbers.partner ? 0.1 * dt : 0 });

  // running on empty
  const e = needs.get('energy');
  player.noRun = e < 15;
  player.weary = e < 6 ? 0.8 : 1;
  if (e <= 0 && !passingOut && !ui.fading && (!ui.modal || ui.modal === 'dance')) passOut();

  // warnings when something gets low
  for (const w of needs.warnings()) warnQueue.push(w);
  if (warnQueue.length && (warnT -= dt) <= 0 && !ui.modal) {
    const { need, level } = warnQueue.shift();
    warnT = 4;
    if (level === 2) ui.hint(`<b>${need.empty}!</b> ${need.fix}`, 9);
    else ui.toast(`${need.low}. ${need.fix}`);
  }

  // the stink cloud
  const amt = clamp((25 - needs.get('hygiene')) / 20, 0, 1);
  stink.visible = amt > 0 && player.char.visible;
  if (stink.visible) {
    stinkMat.opacity = 0.7 * amt;
    const c = player.char;
    const sp = stinkGeo.attributes.position;
    for (let k = 0; k < STINK; k++) {
      const life = (time * 0.35 + k / STINK) % 1;
      const a = k * 2.4 + time * 0.7;
      const r = 0.22 + 0.12 * Math.sin(time * 1.3 + k);
      sp.setXYZ(k, c.x + Math.cos(a) * r, c.y + (0.5 + life * 1.5) * c.app.height, c.z + Math.sin(a) * r);
    }
    sp.needsUpdate = true;
  }
  ui.setNeeds(needs);
}

/** Energy hit zero: you drop, and wake up at home six hours later. */
function passOut() {
  passingOut = true;
  if (dance.active) dance.stop();
  if (ui.modal === 'dance') ui.closeDance();
  ui.fade(() => {
    if (seat) standUp();
    visit.interrupt();
    if (job.J.shift) job.clockOut();
    if (barJob.onShift) barJob.clockOut();
    if (dj.active) dj.end(true);
    const home = apts.byId[state.home];
    const atHome = place === home && !touring;
    const fare = 20;
    if (!atHome) {
      if (state.cash >= fare) state.cash -= fare;
      else state.bank -= fare;
      leaveInterior();
      moveIntoApartment(home, false);
    }
    needs.sleep(6);
    clock.minutes += 6 * 60;
    needsLast = clock.minutes;
    passingOut = false;
    player.locked = false;
    ui.toast(
      atHome
        ? 'You fell asleep where you stood. Six hours later you wake up with carpet on your face.'
        : `You passed out. A cab brought you home (-$${fare}), and you slept it off on the sofa. Get some proper sleep.`,
    );
    saveNow();
  }, 'PASSED OUT');
}

// ----------------------------------------------------------------------------
// Secret cheat menu. Type B-L-I-N-G while walking around (none of those keys do
// anything else), or tap the money display five times on a touch screen.
const CHEAT_CODE = ['KeyB', 'KeyL', 'KeyI', 'KeyN', 'KeyG'];
const CHEAT_TIMES = [
  { label: 'Sunrise · 6 AM', hour: 6 },
  { label: 'Morning · 9 AM', hour: 9 },
  { label: 'Noon', hour: 12 },
  { label: 'Golden hour · 5:30 PM', hour: 17.5 },
  { label: 'Night · 9 PM', hour: 21 },
  { label: 'Club night · 11 PM', hour: 23 },
  { label: 'Midnight', hour: 0 },
];
let codeAt = 0;
let codeTime = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const now = performance.now();
  if (now - codeTime > 1500) codeAt = 0;
  codeTime = now;
  codeAt = e.code === CHEAT_CODE[codeAt] ? codeAt + 1 : e.code === CHEAT_CODE[0] ? 1 : 0;
  if (codeAt === CHEAT_CODE.length) {
    codeAt = 0;
    openCheats();
  }
});
{
  let taps = 0;
  let lastTap = 0;
  document.getElementById('hud-money').addEventListener('pointerdown', () => {
    const now = performance.now();
    taps = now - lastTap < 1000 ? taps + 1 : 1;
    lastTap = now;
    if (taps >= 5) {
      taps = 0;
      openCheats();
    }
  });
}

/** Leave whatever interior you're in (apartment or shop) without moving yet. */
function leaveInterior() {
  audio.stopMusic();
  if (touring) ui.clearHint();
  if (place) {
    place.tvOn = false;
    place = null;
    touring = false;
    apts.show(null);
  }
  if (rig.space !== outdoor) rig.dist = outdoorDist;
  inStore = false;
  inClub = false;
  inGullys = false;
  if (inUnder) {
    inUnder = false;
    under.show(false);
  }
  district = '';
}

function warpOutside(spot) {
  if (dj.active) dj.end(true);
  ui.fade(() => {
    leaveInterior();
    if (seat) standUp();
    visit.interrupt();
    if (spot.y !== undefined) player.pos.y = spot.y;
    player.teleport(outdoor, spot.x, spot.z, spot.yaw);
    Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: spot.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
  }, 'WARPING');
}

function cheatPlaces() {
  const S = CITY.SIDEWALK;
  // the middle of a block's north sidewalk, looking in (yaw 0 faces south)
  const sidewalk = (b) => ({ x: b.cx, z: b.z0 + S / 2, yaw: 0 });
  const home = apts.byId[state.home];
  const list = [{ label: `Home · ${home.L.name}`, go: () => ui.fade(() => (leaveInterior(), moveIntoApartment(home, false)), 'WARPING') }];
  for (const apt of apts.list) {
    if (apt === home) continue;
    list.push({ label: `${apt.L.name} · tour`, go: () => ui.fade(() => (leaveInterior(), moveIntoApartment(apt, true)), 'WARPING') });
  }
  list.push({ label: 'HALCYON 24', go: () => warpOutside({ ...store.outsideSpot, yaw: Math.PI }) });
  list.push({ label: "GULLY'S", go: () => warpOutside(gullys.outsideSpot) });
  list.push({ label: 'SUBSTATION', go: () => warpOutside(club.outsideSpot) });
  list.push({ label: 'SUBSTATION · VIP', go: () => warpOutside({ ...club.w(11.0, 15.0, 3.6), yaw: 0 }) });
  list.push({ label: 'SUBSTATION · roof', go: () => warpOutside({ ...club.w(11.0, 12.0, 8.36), yaw: 0 }) });
  if (park) list.push({ label: 'Greenway Park', go: () => warpOutside(sidewalk(park)) });
  list.push({ label: 'Lantern Quarter', go: () => warpOutside(sidewalk(city.lanternBlock)) });
  return list;
}

function openCheats() {
  if (!playing || ui.modal || ui.fading) return;
  player.locked = true;
  [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => audio.tone(f, 'square', 0.035, 0.1), i * 70));
  ui.openCheats({
    give(kind, amount) {
      if (!amount) return ui.toast('Type an amount first.');
      state[kind] += amount;
      audio.coin();
      ui.toast(`+${money(amount)} ${kind === 'cash' ? 'cash' : 'in the bank'}`);
      saveNow();
    },
    places: cheatPlaces(),
    times: CHEAT_TIMES,
    setNeeds(mode) {
      const v = needs.v;
      if (mode === 0) for (const n of NEEDS) v[n.key] = 100;
      else if (mode === 1) for (const n of NEEDS) v[n.key] = 12;
      else if (mode === 2) v.hunger = 3;
      else if (mode === 3) v.energy = 2;
      else v.hygiene = 8;
      for (const n of NEEDS) needs.pulse[n.key] = 1;
      ui.toast(['All needs full.', 'Everything is low. Good luck.', 'Starving.', 'Exhausted. You have about a minute.', 'You smell. Badly.'][mode]);
    },
    setTime(hour) {
      ui.fade(() => {
        let t = Math.floor(clock.minutes / 1440) * 1440 + hour * 60;
        if (t <= clock.minutes) t += 1440;
        clock.minutes = t;
      }, 'LATER');
    },
    onClose: () => (player.locked = false),
  });
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
  if (place) {
    ui.fade(() => Object.assign(rig, { mode: 'follow', blend: 1 }));
    ui.showLocation(place.L.name.toUpperCase(), 'home');
  } else rig.setMode('follow');
  const newLife = place && !state.seen.homeHint;
  if (newLife) {
    state.seen.homeHint = true;
    setTimeout(() => ui.hint('This is your apartment. Explore the rooms, then use the front door (<b>E</b>) to head out into the city.', 9), 10500);
  }
  if (!state.seen.needs) {
    state.seen.needs = true;
    setTimeout(
      () => ui.hint('Your <b>needs</b> are under your money: hunger, energy, hygiene, fun and social. Eat, sleep, shower, have fun and talk to people to keep them up.', 11),
      newLife ? 21000 : 11000,
    );
  }
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

// ----------------------------------------------------------------------------
// The map (M) and routes
const places = buildPlaces({ city, apts, state, store, job, gullys, club, lantern, park, clubNight, clubTheme: tonightTheme, clubFriends });

/** Friends whose usual night it is tonight (for the map). */
function clubFriends() {
  const d = clubNight();
  return clubbers.pool.filter((a) => (state.clubRel[a.key] ?? 0) >= 20 && a.nights.has(d)).map((a) => a.name);
}
const cityMap = new CityMap(ui, city);
ui.mapView = cityMap;
const waypoint = new Waypoint(scene, tex);
let route = null; // a place from the map

function whereAmI() {
  if (place) return touring ? `${place.L.name} (viewing)` : `${place.L.name} (home)`;
  if (inStore) return 'HALCYON 24';
  if (inClub) return 'SUBSTATION';
  if (inGullys) return "GULLY'S";
  return city.districtAt(player.pos.x, player.pos.z);
}

function setRoute(p) {
  route = p;
  waypoint.set(p ? p.at : null);
  if (!p) ui.setRoute(null);
}

function openMap() {
  if (!playing || ui.modal || ui.fading) return;
  player.locked = true;
  audio.blip(true);
  cityMap.open({
    places: { list: places.list.filter((p) => !p.hidden?.()), small: places.small },
    player,
    camYaw: () => rig.yaw,
    hour: () => clock.hour,
    time: () => clock.format(),
    where: whereAmI,
    route: () => route,
    setRoute,
    lowNeeds: () => NEEDS.filter((n) => needs.get(n.key) < 25).map((n) => n.key),
    onClose: () => (player.locked = !!(seat || visit.seat || visit.riding || visit.eating)),
  });
}

function updateRoute(dt) {
  cityMap.update(dt);
  if (!route) return;
  waypoint.update(time, player.pos);
  const dx = route.at.x - player.pos.x;
  const dz = route.at.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  // the arrow turns with the camera: 0 means straight ahead
  const turn = ((rig.yaw - Math.atan2(dx, dz)) * 180) / Math.PI;
  ui.setRoute(route.name(), d, ((turn % 360) + 540) % 360 - 180);
  if (d < 6 && playing && !ui.modal) {
    ui.toast(`You've arrived: ${route.name()}.`);
    audio.chime();
    setRoute(null);
  }
}

function openWardrobe() {
  if (job.J.shift || barJob.onShift) return ui.toast("You're in uniform. Clock out first.");
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
}

function payRent() {
  const week = Math.floor((clock.minutes - 6 * 60) / (7 * 1440));
  if (state.rentWeek === undefined) state.rentWeek = week;
  if (week <= state.rentWeek) return;
  const n = week - state.rentWeek;
  state.rentWeek = week;
  const apt = apts.byId[state.home];
  const due = apt.L.rent * n;
  state.bank -= due;
  ui.toast(`Rent paid: -${money(due)} · ${apt.L.name}`);
  if (state.bank < 0) setTimeout(() => ui.toast('Your bank account is overdrawn!'), 2600);
}

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
  if (input.hit('KeyC')) return openWardrobe();
  if (input.hit('KeyM')) return openMap();
  if (input.hit('KeyE') && current) current.act();
}

function frame(now) {
  // the first frame's timestamp can be older than `last`: never let time run backwards
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  time += dt;

  const free = playing && !ui.modal && !ui.fading;
  input.enabled = free;
  if (free) handleKeys();
  if (!inUnder) clock.update(dt, free && input.keys.has('KeyT') && !job.J.shift && !barJob.onShift);
  if (playing) payRent();

  player.update(dt, input, rig.yaw, (p, r) => {
    traffic.push(p, r);
    peds.push(p, r);
  });
  job.push(player.pos, player.radius);
  // walking into the shop: tighter camera, shop music, shop lighting
  if (!place && !inUnder) {
    const nowIn = store.contains(player.pos, -0.05);
    if (nowIn !== inStore) {
      inStore = nowIn;
      player.space = rig.space = nowIn ? storeSpace : outdoor;
      if (nowIn) {
        outdoorDist = rig.dist;
        rig.dist = 3.6;
        if (playing) {
          ui.showLocation('HALCYON 24', job.J.hired ? 'your workplace' : 'open 24 hours');
          audio.startMusic('muzak');
        }
      } else {
        rig.dist = outdoorDist;
        audio.stopMusic();
        district = '';
      }
    }
    const nowInClub = club.contains(player.pos, -0.05);
    if (nowInClub !== inClub) {
      inClub = nowInClub;
      player.space = rig.space = nowInClub ? clubSpace : outdoor;
      if (nowInClub) {
        outdoorDist = rig.dist;
        rig.dist = 4.2;
        if (playing) ui.showLocation('SUBSTATION', club.status === 'open' ? `${tonightTheme().name.toLowerCase()} · ${dayName(clubNight()).toLowerCase()} night` : 'lights up');
      } else {
        rig.dist = outdoorDist;
        district = '';
        if (playing && state.coatCheck) ui.toast("Your jacket's still at coat check.");
      }
    }
    const nowInG = gullys.contains(player.pos, -0.05);
    if (nowInG !== inGullys) {
      inGullys = nowInG;
      player.space = rig.space = nowInG ? gullysSpace : outdoor;
      if (nowInG) {
        outdoorDist = rig.dist;
        rig.dist = 3.8;
        if (playing) ui.showLocation("GULLY'S", gullys.open ? 'snatch a bite!' : 'closed · back at 6 am');
        if (playing && gullys.open && !state.seen.gullys) {
          state.seen.gullys = true;
          setTimeout(() => ui.hint('Order at a register, wait for your number on the <b>NOW SERVING</b> board, then grab your tray and find a seat.', 9), 1500);
        }
      } else {
        rig.dist = outdoorDist;
        district = '';
      }
    }
  }
  job.update(dt, time, { playerPos: player.pos });
  if (!place && !inUnder) clubbers.push(player.pos, inClub ? 0.28 : player.radius);
  under.update(dt, time);
  if (!place && (inGullys || gullys.onPatio(player.pos))) diners.push(player.pos, player.radius);
  updateClub(dt);
  updateGullys(dt);
  updateNeeds(dt);
  updateRoute(dt);
  peds.update(dt, player.pos, env.night);
  traffic.update(dt, player.pos, peds.list, env.night);
  if (traffic.honk && playing) {
    const d = traffic.honk.distanceTo(player.pos);
    audio.horn(0.14 * clamp(1 - d / 45, 0, 1));
  }
  for (const npc of peds.list) if (npc.mode === 'talk') npc.speaking = !!ui.dialog?.typing;

  rig.update(dt, input, player, time);
  // in tight rooms the camera can end up in your head: hide yourself then
  player.char.visible = rig.mode === 'title' || camera.position.distanceTo(rig.focus) > 0.75;
  env.magic = lantern.influence(playing ? player.pos : camera.position);
  if (inUnder) env.magic = Math.max(env.magic, 0.5);
  const aloft = !place && !inClub && club.aloft(player.pos);
  env.indoor = place || inUnder ? 1 : inStore || inGullys ? 0.6 : inClub ? 0.9 : 0;
  if (inClub) env.magic *= 0.25;
  env.update(clock.hour, time, player.pos);
  city.update(dt);
  city.updateLampLights(
    playing ? player.pos : camera.position,
    env.night,
    place ? { list: place.fixtures, on: apts.lampOn } : inUnder ? { list: under.fixtures, on: 1 } : inStore ? { list: store.fixtures, on: 1 } : inClub ? { list: club.fixtures, on: 1 } : inGullys ? { list: gullys.fixtures, on: 1 } : aloft && club.status === 'open' ? { list: club.roofFixtures, on: 1 } : null,
  );
  store.update(dt, time, env, job.people(player.pos), camera);
  apts.update(dt, time, env, place);
  lantern.update(dt, time, env.night);
  effects.update(time, env);
  sky.update(camera, time);
  crowd.update();

  if (playing) {
    current = ui.modal ? null : findInteraction();
    ui.setPrompt(current?.label ?? null);
    ui.setClock(clock.format(), clock.day);
    ui.setMoney(state.cash, state.bank);
    if (!place && !inUnder && (districtTimer -= dt) <= 0) {
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
  audio.update({ night: env.night, magic: env.magic, green, time, indoor: place || inUnder ? 1 : inStore || inGullys ? 0.5 : inClub ? 0.85 : 0, store: inStore ? 1 : 0, kitchen: inGullys && gullys.open ? 1 : 0 });

  // the shop's security cameras (only when you're close enough to see a monitor)
  if (!place && cctvTick++ % 4 === 0 && camera.position.distanceTo(store.doorCenter) < 30) store.renderCCTV(renderer, scene);
  pipeline.render(scene, camera, time);
  input.endFrame();
  requestAnimationFrame(frame);
}

player.onStep = (run) => playing && audio.step(run);
requestAnimationFrame(frame);

// handy for debugging from the console
window.game = {
  scene,
  camera,
  renderer,
  clock,
  state,
  player,
  peds,
  traffic,
  city,
  env,
  settings,
  rig,
  ui,
  lantern,
  apts,
  store,
  job,
  club,
  clubbers,
  gullys,
  diners,
  visit,
  needs,
  barJob,
  dj,
  under,
  places,
  enterUndercurrent,
  startDjSet,
  get inUnder() {
    return inUnder;
  },
  crowd,
  audio,
  dance,
  booth,
  stripTexture,
  sitDown,
  standUp,
  get seat() {
    return seat;
  },
  enterApartment,
  exitApartment,
  get place() {
    return place;
  },
};
