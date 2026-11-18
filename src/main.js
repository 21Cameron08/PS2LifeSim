import './style.css';
import * as THREE from 'three';
import { START, CITY } from './config.js';
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
import { Player, CameraRig, citySpace } from './actors/player.js';
import { Apartments } from './world/apartments.js';
import { Store } from './world/store.js';
import { Club } from './world/club.js';
import { Clubbers } from './actors/clubbers.js';
import { StoreJob } from './game/job.js';
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
  home: save?.home ?? 'starter',
  rentWeek: save?.rentWeek,
  seen: save?.seen ?? {},
  job: save?.job,
  clubStamp: save?.clubStamp, // the night your hand was stamped at SUBSTATION
  coatCheck: save?.coatCheck, // your jacket, if it's at the club's coat check
};
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
const crowd = new Crowd(scene, tex, 200);
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
if (state.job.hired) store.helpWanted.visible = false;
store.onChime = () => camera.position.distanceTo(store.doorCenter) < 35 && audio.chime();
const storeSpace = { ...outdoor, indoor: true, ceiling: store.origin.y + store.H };
let inStore = false;
let cctvTick = 0;
const club = new Club(scene, city, tex, apts.tex);
const clubbers = new Clubbers(crowd, club, city);
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

const SNACKS = ['Cold noodles. Still good.', 'Half a sandwich of uncertain age.', 'A yoghurt and some grapes.', 'Leftover dumplings. Perfect.', 'Just condiments. And hope.'];

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
      return ui.fade(() => {
        const cur = clock.minutes;
        let wake = Math.floor(cur / 1440) * 1440 + 7 * 60;
        if (cur > wake - 30) wake += 1440;
        clock.minutes = wake;
        ui.toast('You slept until 7:00 AM. Good morning!');
      }, 'SLEEPING');
    case 'dress':
      if (!home) return nope('Plenty of closet space.');
      return openWardrobe();
    case 'fridge':
      if (!home) return nope('Empty. It smells brand new.');
      return ui.toast(talkRng.pick(SNACKS));
    case 'shower':
      if (!home) return nope('Great water pressure, according to the listing.');
      return ui.fade(() => {
        clock.minutes += 20;
        ui.toast('Fresh and clean.');
      }, 'SHOWERING');
    case 'fire':
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
    return best ? { label: aptLabel(best), act: () => useApt(best) } : null;
  }
  const work = job.findInteraction(player.pos);
  if (work) return work;
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
  return null;
}

// ----------------------------------------------------------------------------
// SUBSTATION
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const coverCharge = () => (Clubbers.weekdayOfNight(clock.minutes) === 'SAT' ? 30 : 20);

function clubInteraction() {
  const p = player.pos;
  const open = club.status === 'open';
  if (!inClub) {
    if (club.status !== 'closed' && near(p, club.bouncerSpot, 1.9)) return { label: 'Talk to the bouncer', act: bouncerTalk };
    if (club.status === 'closed' && near(p, club.doorOut, 1.5)) return { label: 'SUBSTATION', act: () => ui.toast('Locked. Doors open at 10 PM.') };
    if (club.cartOpen && near(p, club.friesSpot, 1.4)) return { label: 'Buy fries ($4)', act: buyFries };
    return null;
  }
  if (near(p, club.coatCounter, 1.3) && club.status !== 'closed') return { label: state.coatCheck ? 'Collect your jacket' : 'Check your jacket ($2)', act: coatCheck };
  if (near(p, club.photoSpot, 1.1)) return { label: 'Photo booth', act: () => ui.toast('OUT OF FILM. A taped-on note says: back soon.') };
  if (near(p, club.vipSpot, 1.3)) return { label: 'VIP balcony', act: () => ui.toast("Wristbands only, and the balcony's shut for a refit tonight.") };
  if (open && club.barSpots.some((b) => near(p, b, 1.0))) return { label: 'Order at the bar', act: barOrder };
  if (open && near(p, club.w(11.7, 3.0), 1.3)) return { label: 'Request a song', act: () => ui.toast('The DJ points at their headphones, grins, and plays whatever they want.') };
  return null;
}

function bouncerTalk() {
  const tonight = nightOf(clock.minutes);
  const unlock = () => (player.locked = false);
  const say = (text, choices) => ui.openDialog({ name: 'DMITRI · DOOR', text, choices, onClose: unlock });
  player.locked = true;
  if (club.status === 'lightsup') return say("Lights are up, we're done. Go home, drink some water.");
  if (state.clubStamp === tonight) return say(talkRng.pick(["You've got a stamp. Go on in.", 'Back again? Go on.', 'Stamp checks out. In you go.']));
  const cover = coverCharge();
  const greet = talkRng.pick([`${cover} to get in. Cash.`, `Evening. It's ${cover} tonight, cash only.`, `You on your own? ${cover}, cash.`]);
  say(greet, [
    {
      label: `Pay $${cover}`,
      fn: () => {
        if (state.cash < cover) return say("Cash only, friend. Come back when you've got it.");
        state.cash -= cover;
        state.clubStamp = tonight;
        audio.coin();
        say("He stamps the back of your hand: a little lightning bolt. \"You can come and go till close. Have a good one.\"");
        saveNow();
      },
    },
    { label: 'Not tonight', fn: () => ui.closeDialog() },
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
  ui.toast("You hand over your jacket and get ticket 42.");
}

const DRINKS = [
  ['Tap water', 0, 'Free. The bartender slides it over without looking up.'],
  ['Cola', 4, 'Ice, straw, slice of lemon nobody asked for.'],
  ['Lime soda', 5, 'Sharp and cold. Perfect.'],
  ['Beer', 7, 'Plastic cup. Mostly foam. Still good.'],
];
function barOrder() {
  player.locked = true;
  ui.openDialog({
    name: 'BAR',
    text: talkRng.pick(['What can I get you?', "What'll it be?", 'Yeah? What are you having?']),
    choices: [
      ...DRINKS.map(([name, price, line]) => ({
        label: price ? `${name} ($${price})` : name,
        fn: () => {
          ui.closeDialog();
          if (state.cash < price) return ui.toast("Cash only bar, and you're short.");
          state.cash -= price;
          if (price) audio.coin();
          ui.toast(line);
        },
      })),
      { label: 'Nothing', fn: () => ui.closeDialog() },
    ],
    onClose: () => (player.locked = false),
  });
}

function buyFries() {
  if (state.cash < 4) return ui.toast('Four dollars, cash. Card reader died in 2003.');
  state.cash -= 4;
  audio.coin();
  ui.toast(talkRng.pick(['Hot, salty, too many. Exactly right.', 'Ray adds extra salt without asking. Legend.', 'Paper cone of fries, burning your fingers.']));
}

/** Where the club's music is muffled, and how loud, from where you're standing. */
function clubMix() {
  if (inClub) {
    const z = club.zoneAt(player.pos);
    return z === 'hall' ? [18000, 0.55] : z === 'lobby' ? [1100, 0.36] : z === 'stairs' ? [900, 0.3] : z === 'toilets' ? [420, 0.28] : [700, 0.28];
  }
  const d = Math.hypot(player.pos.x - club.doorCenter.x, player.pos.z - club.doorCenter.z);
  const fall = Math.pow(Math.max(0, 1 - d / 60), 1.6);
  return [170 + 900 * club.doorOpen, 0.0001 + 0.34 * fall * (0.7 + 0.3 * club.doorOpen)];
}

function updateClub(dt) {
  const tonight = nightOf(clock.minutes);
  const open = club.status === 'open';
  const allow = inClub || (open && state.clubStamp === tonight);
  const people = clubbers.people();
  if (allow && !inClub) people.push(player.pos);
  club.update(dt, time, env, { hour: clock.hour, beat: audio.musicBeat(), flash: settings.flash, camera, people, allow });
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
    time,
  });
  // the sound system
  const dClub = Math.hypot(player.pos.x - club.floorCenter.x, player.pos.z - club.floorCenter.z);
  const want = playing && !place && open && dClub < 75;
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
  district = '';
}

function warpOutside(spot) {
  ui.fade(() => {
    leaveInterior();
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
  list.push({ label: 'SUBSTATION', go: () => warpOutside(club.outsideSpot) });
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
  if (place && !state.seen.homeHint) {
    state.seen.homeHint = true;
    setTimeout(() => ui.hint('This is your apartment. Explore the rooms, then use the front door (<b>E</b>) to head out into the city.', 9), 10500);
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

function openWardrobe() {
  if (job.J.shift) return ui.toast("You're in uniform. Clock out first.");
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
  if (input.hit('KeyM')) {
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    ui.toast(settings.muted ? 'Sound off' : 'Sound on');
  }
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
  clock.update(dt, free && input.keys.has('KeyT') && !job.J.shift);
  if (playing) payRent();

  player.update(dt, input, rig.yaw, (p, r) => {
    traffic.push(p, r);
    peds.push(p, r);
  });
  job.push(player.pos, player.radius);
  // walking into the shop: tighter camera, shop music, shop lighting
  if (!place) {
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
        if (playing) ui.showLocation('SUBSTATION', club.status === 'open' ? `${Clubbers.weekdayOfNight(clock.minutes).toLowerCase()} night` : 'lights up');
      } else {
        rig.dist = outdoorDist;
        district = '';
        if (playing && state.coatCheck) ui.toast("Your jacket's still at coat check.");
      }
    }
  }
  job.update(dt, time, { playerPos: player.pos });
  if (!place) clubbers.push(player.pos, inClub ? 0.28 : player.radius);
  updateClub(dt);
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
  env.indoor = place ? 1 : inStore ? 0.6 : inClub ? 0.9 : 0;
  if (inClub) env.magic *= 0.25;
  env.update(clock.hour, time, player.pos);
  city.update(dt);
  city.updateLampLights(
    playing ? player.pos : camera.position,
    env.night,
    place ? { list: place.fixtures, on: apts.lampOn } : inStore ? { list: store.fixtures, on: 1 } : inClub ? { list: club.fixtures, on: 1 } : null,
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
    if (!place && (districtTimer -= dt) <= 0) {
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
  audio.update({ night: env.night, magic: env.magic, green, time, indoor: place ? 1 : inStore ? 0.5 : inClub ? 0.85 : 0, store: inStore ? 1 : 0 });

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
  crowd,
  audio,
  enterApartment,
  exitApartment,
  get place() {
    return place;
  },
};
