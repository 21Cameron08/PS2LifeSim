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
import { CrewJob } from './game/crewJob.js';
import { Galleria } from './world/galleria.js';
import { Exchange } from './world/exchange.js';
import { Brokers } from './actors/brokers.js';
import { Shoppers } from './actors/shoppers.js';
import { Shopping, lookup } from './game/shopping.js';
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
import { baseWear, statusOf, dress, outerOn, ITEM, TIERS, showpiece, extraStatus } from './game/fashion.js';
import { HomeDecor } from './world/homeDecor.js';
import { HomeLife } from './game/homeLife.js';
import { FURN } from './game/furniture.js';
import { Market, STOCKS } from './game/market.js';
import { Property, PROPS } from './game/property.js';
import { Resale, SwapBoard, SWAP_OPEN, sellable, DEX_LOOK } from './game/resale.js';
import { GR9 } from './game/fashion.js';
import { Garage, CAR, CARS, STATIONS, kmh } from './game/cars.js';
import { Motors } from './world/motors.js';
import { MotorsFolk } from './actors/motorsFolk.js';
import { Crown, orreryOpen } from './world/crown.js';
import { CrownFolk } from './actors/crownFolk.js';
import { ORRERY_MENU, ORRERY_PRICE, PAIRING_PRICE, DRESS_TIER, SLOTS, TablePlate } from './game/orrery.js';

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
  crewJob: save?.crewJob, // crew at GULLY'S: { hired, earned, shifts }
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
  owned: save?.owned ?? [], // clothes you've bought (item ids, game/fashion.js)
  wish: save?.wish ?? null, // the thing you're saving up for (an item id)
  ledger: save?.ledger ?? [], // bank transactions: { t, what, amt }
  thrift: save?.thrift, // RACK & RUIN: today's sold one-offs
  drop: save?.drop, // this week's sneaker drop: { week, stock, mine }
  spent: save?.spent ?? 0, // everything you've ever spent at the Galleria
  spentDay: save?.spentDay, // today's spend at MAISON VELLARD (for the champagne)
  champagneDay: save?.champagneDay,
  furniture: save?.furniture ?? { pieces: [], next: 1 }, // what you've bought at ROOMSET, placed or in storage
  arcadeBest: save?.arcadeBest ?? 0, // NIGHT RUNNER high score
  fishFed: save?.fishFed,
  homeBar: save?.homeBar,
  market: save?.market, // your shares: { holdings: { SYM: { n, cost } }, trades, realized }
  property: save?.property, // buildings you own: { owned: { id: { paid, week } } }
  franchise: save?.franchise, // GULLY'S Greenway, once it's yours: { since, special, toy, last }
  tips: save?.tips, // which brokers told you something today
  gullDay: save?.gullDay,
  headline: save?.headline, // a headline about you on the Exchange ticker: { t, text }
  milestone: save?.milestone ?? 0, // the last net-worth milestone you passed
  cars: save?.cars ?? [], // your cars, wherever you left them: { uid, id, paint, x, z, yaw }
  carNext: save?.carNext ?? 1,
  carStation: save?.carStation ?? 1, // the car radio's station (game/cars.js STATIONS)
  driven: save?.driven ?? 0, // km driven
  crownMember: save?.crownMember, // THE CROWN membership (penthouse residents are members anyway)
  bottles: save?.bottles ?? 0, // bottles ordered on SUBSTATION's balcony
  phone: save?.phone, // your BRIGHTWIRE phone: 'flip' | 'gold'
  help: save?.help ?? {}, // hired help from the Agency: { housekeeper, chef, chauffeur }
  helpDay: save?.helpDay,
  crownKnown: save?.crownKnown ?? {},
  cabana: save?.cabana, // today's cabana at THE CROWN: { day, k, champagne }
  orrery: save?.orrery, // an ORRERY booking: { night, hour }
  orreryVisits: save?.orreryVisits ?? 0,
  testDay: save?.testDay, // CORSO test drives today: { testDay, testCount }
  testCount: save?.testCount ?? 0,
  espressoHour: save?.espressoHour,
};
// saves from before clothes could be owned: what you had on becomes basics
if (!state.appearance.wear) state.appearance.wear = baseWear(state.appearance);
// ...and nothing you were only trying on comes home with you
{
  const base = baseWear(state.appearance);
  for (const [slot, id] of Object.entries(state.appearance.wear)) if (id && !ITEM[id]?.basic && !state.owned.includes(id)) state.appearance.wear[slot] = base[slot];
}
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
const crowd = new Crowd(scene, tex, 320);
// where do we start? a fresh life starts inside your apartment
let place = freshStart ? apts.byId[state.home] : save.inside ? apts.byId[save.inside] : null;
let touring = false;
const homeApt = apts.byId[state.home];
const startAt = place ? (freshStart ? place.spawn : save.player) : (save?.player ?? homeApt.exit);
const player = new Player(crowd, place ? place.space : outdoor, state.appearance, startAt);
const peds = new Pedestrians(crowd, city, 72);
const traffic = new Traffic(scene, tex, 24);
const clock = new Clock(save?.minutes ?? START.hour * 60);
// the stock market (game/market.js): prices come from the clock, your shares from the save
const market = new Market({ clock, state });
const job = new StoreJob({ store, crowd, ui, audio, state, clock, player });
job.blocked = () => (barJob.onShift ? 'SUBSTATION' : crew.onShift ? "GULLY'S" : null);
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
// ...and so does the Galleria (two floors and the escalators between them)
const galleria = new Galleria(scene, city, tex, apts.tex);
// ...and THE CROWN, on the roof of the Meridian tower (world/crown.js)
const crown = new Crown(scene, city, tex, apts.tex);
outdoor.groundHeight = (x, z) => crown.groundAt(x, z, player.pos.y, galleria.groundAt(x, z, player.pos.y, club.groundAt(x, z, player.pos.y, cityGround(x, z))));
const crownFolk = new CrownFolk(crowd, crown);
const orrerySpace = {
  ...outdoor,
  indoor: true,
  get ceiling() {
    return crown.ceilingAt(player.pos);
  },
};
let onCrown = false;
let inOrrery = false;
let crownKick = 0;
// the mall's ceiling is low in the shops and high under the glass roof
// HALCYON EXCHANGE: the banking hall Downtown (world/exchange.js, actors/brokers.js)
const exchange = new Exchange(scene, city, tex, apts.tex);
// property you can buy (game/property.js): FOR SALE boards on real buildings, lit up on the city model
const property = new Property({ city, clock, state });
scene.add(property.signs);
property.buildSigns(exchange.xt.xsigns);
exchange.setModel(property.modelHighlights());
const exchSpace = { ...outdoor, indoor: true, ceiling: exchange.origin.y + exchange.H - 0.5 };
// CORSO MOTORS: the car showroom in Kiln Heights (world/motors.js, actors/motorsFolk.js)
const motors = new Motors(scene, city, tex, apts.tex);
const motorsSpace = { ...outdoor, indoor: true, ceiling: motors.origin.y + motors.H - 0.4 };
const motorsFolk = new MotorsFolk(crowd, motors);
let inMotors = false;
let motorsKick = 0;
let inExchange = false;
let exchKick = 0;
let bellDay = -1;
const mallSpace = {
  ...outdoor,
  indoor: true,
  get ceiling() {
    return galleria.ceilingAt(player.pos);
  },
};
let inGalleria = false;
let mallKick = 0;
const shoppers = new Shoppers(crowd, galleria, city);
const brokers = new Brokers(crowd, exchange);
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
const crew = new CrewJob({ gullys, diners, visit, ui, audio, state, clock, player, crowd, needs });
crew.blocked = () => !!job.J.shift || barJob.onShift;
visit.crew = crew;
visit.statusTier = () => statusOf(state.appearance, state.home).tier;
/** On the clock at any job. */
const onClock = () => !!job.J.shift || barJob.onShift || crew.onShift;
if (state.gullToys.length) apts.setToys(state.gullToys);
// your furniture, placed at home or in storage (built into the room and its lighting)
const decor = new HomeDecor({ apts, state });
decor.rebuild(apts.byId[state.home]);
extraStatus.decor = decor.score(state.home);
let gullysKick = 0;
let lightsUpNight = -1;
const rig = new CameraRig(camera, player.space);
// ----------------------------------------------------------------------------
// Cars (game/cars.js): yours stay parked where you left them; get in and drive
const _fp = new THREE.Vector3();
const garage = new Garage({
  scene,
  tex,
  state,
  audio,
  traffic,
  peds,
  ground: (x, z) => cityGround(x, z),
  colliders: city.colliders,
  bounds: outdoor.bounds,
  // no driving into buildings through their front doors, or through the night market
  forbidden: (p) => {
    _fp.set(p.x, 0.1, p.z);
    const lb = city.lanternBlock;
    if (lb && p.x > lb.x0 + 1 && p.x < lb.x1 - 1 && p.z > lb.z0 + 1 && p.z < lb.z1 - 1) return true;
    return store.contains(_fp, 0.4) || club.contains(_fp, 0.4) || gullys.contains(_fp, 0.4) || exchange.contains(_fp, 0.4) || galleria.contains(_fp, 0.4) || motors.contains(_fp, 0.4);
  },
  blockers: (c, r) => {
    clubbers.push(c, r);
    diners.push(c, r);
    shoppers.push(c, r);
    motorsFolk.push(c, r);
  },
  onScare: () => {
    if (Math.random() < 0.5) ui.toast(talkRng.pick(['"HEY! Watch it!"', '"Are you KIDDING me?"', '"It\'s a pavement!"', '"Learn to drive!"', '"Unbelievable."']));
  },
});
garage.station = state.carStation;
let driving = null; // the car you're in
const carCam = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, len: 4 };
rig.car = carCam;
const shopping = new Shopping({ galleria, shoppers, ui, audio, state, clock, player, crowd, needs, input, rig, decor, saveNow: () => saveNow() });
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
  { name: 'Dex, SOLE SWAP', role: 'resale', look: { ...defaultPlayerAppearance(), skin: '#8a5a3a', hair: '#1a1210', hairStyle: 4, height: 1.02, ...DEX_LOOK } },
];
const VENDOR_ROLES = ['lanterns', 'fortune', 'resale'];
lantern.vendorSpots.forEach((s, k) => {
  const v = peds.addStander(s.x, s.z, s.yaw, VENDORS[k]?.look);
  if (VENDORS[k]) Object.assign(v, { name: VENDORS[k].name, role: VENDORS[k].role }, { known: true });
});
// SOLE SWAP (game/resale.js): a chalkboard of this week's sneaker prices by Dex's stall
const resale = new Resale({ clock, state });
const swapBoard = new SwapBoard();
{
  const st = lantern.stalls[2];
  const g = new THREE.Group();
  const leg = new THREE.MeshLambertMaterial({ color: '#5a3a24' });
  for (const sx of [-0.42, 0.42]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), leg);
    m.position.set(sx, 0.75, 0);
    g.add(m);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshBasicMaterial({ map: swapBoard.tex }));
  board.position.set(0, 0.95, 0.03);
  g.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.06, 0.03), leg);
  back.position.set(0, 0.95, 0);
  g.add(back);
  const p = new THREE.Vector3(1.95, 0, 0.9).applyMatrix4(st.m);
  g.position.set(p.x, city.groundHeight(p.x, p.z), p.z);
  g.rotation.y = st.ry + 0.35;
  scene.add(g);
  swapBoard.draw(resale);
}
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
    crewJob: state.crewJob,
    djGig: state.djGig,
    djRep: state.djRep,
    djSets: state.djSets,
    doorNight: state.doorNight,
    doorChat: state.doorChat,
    doorTip: state.doorTip,
    gullToys: state.gullToys,
    thrift: state.thrift,
    drop: state.drop,
    spent: state.spent,
    spentDay: state.spentDay,
    champagneDay: state.champagneDay,
    owned: state.owned,
    wish: state.wish,
    furniture: state.furniture,
    arcadeBest: state.arcadeBest,
    fishFed: state.fishFed,
    homeBar: state.homeBar,
    market: state.market,
    property: state.property,
    franchise: state.franchise,
    tips: state.tips,
    gullDay: state.gullDay,
    headline: state.headline,
    milestone: state.milestone,
    cars: state.cars.filter((c) => !c.demo),
    carNext: state.carNext,
    testDay: state.testDay,
    crownMember: state.crownMember,
    bottles: state.bottles,
    phone: state.phone,
    help: state.help,
    helpDay: state.helpDay,
    crownKnown: state.crownKnown,
    cabana: state.cabana,
    orrery: state.orrery,
    orreryVisits: state.orreryVisits,
    testCount: state.testCount,
    espressoHour: state.espressoHour,
    carStation: state.carStation,
    driven: state.driven,
    ledger: state.ledger.slice(-60),
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
  if (npc.role === 'resale') {
    onClose();
    return soleSwap();
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
    { label: 'Statement', fn: () => statement() },
    { label: 'Net worth', fn: () => worthSheet(show) },
    { label: 'Exit', fn: () => ui.closeDialog() },
  ];
  const statement = () => {
    const rows = state.ledger.slice(-12).reverse();
    const line = (e) => {
      const d = Math.floor(e.t / 1440) + 1;
      const what = e.what.length > 22 ? `${e.what.slice(0, 21)}…` : e.what.padEnd(22, ' ');
      return `D${String(d).padEnd(3, ' ')} ${what} ${(e.amt < 0 ? '-' : '+') + money(Math.abs(e.amt))}`;
    };
    const ins = state.ledger.filter((e) => e.amt > 0).reduce((s, e) => s + e.amt, 0);
    const outs = state.ledger.filter((e) => e.amt < 0).reduce((s, e) => s - e.amt, 0);
    ui.openDialog({
      name: 'HALCYON SAVINGS · STATEMENT',
      text: [...(rows.length ? rows.map(line) : ['No transactions yet.']), '', `In ${money(ins)} · out ${money(outs)} · balance ${money(state.bank)}`].join('\n'),
      mono: true,
      choices: [{ label: 'Back', fn: () => show() }],
      onClose: () => (player.locked = false),
    });
  };
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
    state.ledger.push({ t: Math.round(clock.minutes), what: amt > 0 ? 'ATM deposit' : 'ATM withdrawal', amt });
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
  if (seat) standUp();
  place = apt;
  touring = tour;
  apts.show(apt);
  if (!tour && apt.id === state.home) decor.refresh(apt);
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
  let packed = 0;
  for (const p of decor.pieces)
    if (p.home && p.home !== apt.id) {
      p.home = null;
      packed++;
    }
  if (old && old !== apt) decor.rebuild(old);
  decor.rebuild(apt);
  extraStatus.decor = decor.score(state.home);
  audio.coin();
  if (inside) touring = false;
  ui.openDialog({
    name: 'LETTING AGENT',
    text: `Signed! Welcome home to ${L.name}.${old && old !== apt ? ` Your lease on ${old.L.name} has ended.` : ''}${packed ? ` The movers packed your furniture: it's in storage here (F to place it).` : ''} Rent of ${money(L.rent)} comes out of your bank every Monday morning.`,
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
      // fresh sheets (the housekeeper): you wake up properly rested
      if (state.help?.housekeeper) needs.give({ energy: Math.min(15, h * 2), hygiene: 6 });
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
      if (state.help?.chef)
        return ui.fade(() => {
          state.fridge--;
          clock.minutes += 40;
          needsLast = clock.minutes;
          needs.give({ hunger: 70, fun: 8, energy: 4 });
          ui.toast(talkRng.pick(['Bastien makes risotto out of what looked like nothing. You eat it at the counter like a king.', 'Bastien: "Sit." Three small plates arrive, then a big one. Then a tart. You did not have a tart.', 'Grilled fish, a salad with something crunchy, a sauce he will not tell you the secret of.']));
        }, 'DINNER');
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
    case 'decor':
      if (!home) return null;
      return homeLife.use(it, place);
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
  if (decor.carry) return carryPrompt();
  if (driving) return Math.abs(driving.speed) < 2.5 ? { label: input.isTouch ? 'Get out' : 'Get out <small>R radio · H horn</small>', act: () => exitCar() } : null;
  if (place) {
    if (seat) return { label: 'Stand up', act: standUp };
    let best = null;
    let bd = Infinity;
    for (const it of place.interactables) {
      const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
      if (d < it.r && d < bd) {
        best = it;
        bd = d;
      }
    }
    if (best) return { label: aptLabel(best) + (best.decor && atHome() ? ' <small>F move</small>' : ''), act: () => useApt(best) };
    const piece = atHome() && decor.nearest(place, player);
    if (piece) return { label: `Move the ${FURN[piece.id].name.toLowerCase()}`, key: 'F', act: () => startCarry(piece) };
    return visit.anywhere();
  }
  if (!job.J.shift && near(player.pos, store.customerSpot, 1.0) && job.manager.home === 'counter' && !job.manager.path.length)
    return { label: 'Buy something at the counter', act: storeCounter };
  if (inUnder) return underInteraction();
  const work = job.findInteraction(player.pos);
  if (work) return work;
  const crewWork = crew.find(player.pos);
  if (crewWork) return crewWork;
  if (inGalleria && galleria.open && galleria.phoneStand && Math.hypot(galleria.phoneStand.x - player.pos.x, galleria.phoneStand.z - player.pos.z) < 0.8 && Math.abs(galleria.phoneStand.y - player.pos.y) < 1.2)
    return { label: state.phone === 'gold' ? 'BRIGHTWIRE: the phones' : 'BRIGHTWIRE: buy a Flip phone', act: phoneShop };
  if (inGalleria && galleria.gamesPod && Math.hypot(galleria.gamesPod.x - player.pos.x, galleria.gamesPod.z - player.pos.z) < 0.8 && Math.abs(galleria.gamesPod.y - player.pos.y) < 1.2) return { label: 'Play the VOLT Station demo (NIGHT RUNNER HD)', act: gamesPod };
  const mall = shopping.find(player.pos);
  if (mall) return mall;
  if (inGalleria || galleria.onPlaza(player.pos)) {
    const m = mallSeatOrTalk();
    if (m) return m;
  }
  if (inExchange || exchange.onPlaza(player.pos)) {
    const x = exchangeFind();
    if (x) return x;
  }
  if (inMotors || motors.onForecourt(player.pos)) {
    const x = motorsFind();
    if (x) return x;
  }
  if (onCrown) return crownFind() ?? visit.anywhere();
  if (Math.hypot(crown.lobbyDoor.x - player.pos.x, crown.lobbyDoor.z - player.pos.z) < 1.8) return { label: crownMember() || guestOfOrrery() ? 'THE CROWN: take the lift up' : 'THE CROWN · ORRERY (members)', act: crownLobby };
  const food = visit.find();
  if (food) return food;
  const nightlife = clubInteraction();
  if (nightlife) return nightlife;
  const car = !seat && garage.nearest(player.pos, 1.0);
  if (car) return { label: `Get in your ${car.m.make} ${car.m.name}`, act: () => enterCar(car) };
  const door = apts.doorNear(player.pos);
  if (door) {
    const home = door.id === state.home;
    return {
      label: home ? `Enter ${door.L.name} (home)` : `${door.L.name} · for lease`,
      act: () => (job.J.shift ? ui.toast("You're on the clock. Clock out first.") : home ? enterApartment(door) : leaseOffer(door, false)),
    };
  }
  // the night market's stallholders stand behind their counters: talk to them across it
  const vendor = peds.list.find((n) => VENDOR_ROLES.includes(n.role) && Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z) < 3.2);
  if (vendor) return { label: vendor.role === 'resale' ? 'SOLE SWAP: talk to Dex' : `Talk to ${vendor.name}`, act: () => talkTo(vendor) };
  const npc = peds.nearest(player.pos, 2.3);
  let best = null;
  let bd = Infinity;
  for (const it of city.interactables) {
    if (it.y !== undefined && Math.abs(it.y - player.pos.y) > 1.5) continue; // (the mall's ATM is downstairs)
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
  const a = dress(state.appearance);
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
  const flashy = statusOf(state.appearance, state.home).tier >= 5;
  if (q >= 2 && !friend && !flashy && state.vipNight !== tonight && state.queuedNight !== tonight) {
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
  const sharp = flashy ? talkRng.pick(['Looking expensive tonight. ', 'Nice watch. Skip the line. ', 'Well, look at you. ']) : outerOn(dress(state.appearance)) ? 'Nice jacket. ' : '';
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

const BOTTLES = [
  { name: 'Volta Sparkling', size: 'the house bottle', price: 200, n: 1, line: 'A bottle of Volta arrives at your booth with a sparkler fizzing on top. The balcony cheers.' },
  { name: 'Maison Lune Brut', size: 'bottle', price: 450, n: 2, line: 'Two sparklers and a silver bucket. Celeste pours the first glass herself.' },
  { name: 'Maison Lune Rosé', size: 'bottle', price: 900, n: 3, shout: true, line: 'Pink, cold, three sparklers. Halflife gives you a shout-out from the booth.' },
  { name: 'Lune Grande Réserve', size: 'magnum', price: 2500, n: 5, shout: true, party: 5, line: 'A parade of sparklers up the stairs. Halflife drops a horn. Half the floor looks up at you.' },
  { name: 'Lune Grande Réserve', size: 'methuselah (6 litres)', price: 12000, n: 8, shout: true, party: 7, confetti: true, line: 'Eight sparklers, a methuselah carried by two people, confetti from the truss. The whole club is looking at your booth.' },
];
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
  say(state.bottles ? 'Back for more? The bottle list, darling.' : 'Bottle service? Here is the list. Everything comes with sparklers.', [
    ...BOTTLES.map((b) => ({
      label: `${b.name}, ${b.size} (${money(b.price)}, card)`,
      fn: () => bottleService(b, say, bye),
    })),
    bye,
  ]);
}

function bottleService(b, say, bye) {
  if (state.bank < b.price) return say("That card's not having it. Maybe a water?", [bye]);
  state.bank -= b.price;
  state.ledger.push({ t: Math.round(clock.minutes), what: `SUBSTATION · ${b.name}`, amt: -b.price });
  state.bottles = (state.bottles ?? 0) + 1;
  audio.coin();
  const t = club.vipTables.reduce((m, q) => (q.distanceTo(player.pos) < m.distanceTo(player.pos) ? q : m), club.vipTables[0]);
  club.sparkle(t, { n: b.n, from: b.n > 2 ? club.vipHostSpot : null, time: 9 + b.n * 1.5 });
  if (b.confetti) club.confettiBurst();
  needs.give({ fun: 12 + b.n * 3, social: 10 + b.n * 2 });
  // a buzz, shared out round the booth
  const tonight = nightOf(clock.minutes);
  if (!state.drinks || state.drinks.night !== tonight) state.drinks = { night: tonight, alc: 0, count: 0, at: clock.minutes };
  state.drinks.alc = buzz() + 1;
  state.drinks.at = clock.minutes;
  // everyone up here is suddenly your friend; with a big one, regulars come up from the floor
  for (const v of clubbers.vips) if (v.mode !== 'off') state.clubRel[v.key] = Math.min(100, (state.clubRel[v.key] ?? 0) + 3 + b.n);
  let joined = '';
  if (b.party) {
    clubbers.vipBoost = Math.min(club.vipSeats.length - 1, b.party);
    clubbers.vipBoostUntil = performance.now() + 4 * 60 * 1000;
    clubbers.settle(clubbers.vips, clubbers.vipBoost, club.vipSeats, true);
    const friends = clubbers.pool.filter((a) => (state.clubRel[a.key] ?? 0) >= 20 && a.mode !== 'off').slice(0, 2);
    for (const f of friends) state.clubRel[f.key] = Math.min(100, (state.clubRel[f.key] ?? 0) + 8);
    joined = friends.length ? ` ${friends.map((f) => f.name).join(' and ')} come${friends.length > 1 ? '' : 's'} up from the floor to join you.` : ' People you have never met come up to say hello. Everyone is your friend now.';
  }
  if (b.shout) {
    setTimeout(() => {
      audio.horn(0.22, 1400, audio.master);
      ui.toast(talkRng.pick(['Halflife on the mic: "BIG LOVE to the balcony tonight!" Every head turns.', 'The music drops out for one beat. "THIS ONE\'S FOR THE BALCONY!" The drop lands. The floor goes mad.', 'Halflife points up at you and holds the drop for an extra bar. The whole room screams.']));
    }, 2500);
  }
  if (b.price >= 2500) state.headline = { t: Math.round(clock.minutes), text: b.price >= 12000 ? 'SOMEBODY ORDERED A METHUSELAH AT SUBSTATION LAST NIGHT. NOBODY CAN AGREE WHO.' : 'SPARKLER PARADE AT SUBSTATION: A MAGNUM ON THE BALCONY' };
  say(b.line + joined, [bye]);
  audio.cheer?.(audio.master, audio.ctx?.currentTime ?? 0);
  saveNow();
}

function coatCheck() {
  const app = state.appearance;
  if (state.coatCheck) {
    app.wear.outer = state.coatCheck.outer ?? 'basic:jacket';
    app.jacket = state.coatCheck.jacket;
    state.coatCheck = null;
    crowd.setAppearance(player.char.id, app);
    return ui.toast('Ticket 42. Your jacket, back on.');
  }
  if (!app.wear.outer) return ui.toast("You're not wearing a jacket.");
  if (state.cash < 2) return ui.toast('Two dollars, cash.');
  state.cash -= 2;
  state.coatCheck = { jacket: app.jacket, outer: app.wear.outer };
  app.wear.outer = null;
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
      ...(where === 'BAR' && !forWhom && barJob.J.hired && !onClock() ? [{ label: 'Start a bar shift', fn: () => (close(), barJob.clockIn(nightOf(clock.minutes))) }] : []),
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
  shoppers.seatTaken.delete(sp);
  crownFolk.taken.delete(sp);
  if (sp.kind === 'orrery' && dinner) {
    // walking out mid-dinner: the bill comes anyway
    dinner.cleared = true;
    setTimeout(orreryBill, 400);
  }
  if (sp.exch && seatRef) {
    brokers.taken.delete(seatRef);
    seatRef = null;
  }
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
  c.y = seat.y + (seat.seatH ?? 0.5) - 0.86 * state.appearance.height;
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
    state.photos = [url, ...(state.photos ?? [])].slice(0, 4);
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
  crew.update(dt);
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
// The Halcyon Galleria: sitting, and talking to the staff and the shoppers
const MALL_LINES = {
  dot: ['Everything in here had a life before you. Give it a good second one.', "I've had this shop since before the mall had a roof. True story. It leaked.", "If it doesn't fit, it's vintage. If it does, it's fate."],
  kez: ['The drop is Saturday, ten sharp. People camp. I am not joking.', "Resellers buy six pairs and sell them for triple. I hate it here. I love it here.", 'Cargos are back. Cargos never left. Cargos are forever.'],
  kai: ['The plasma is so sharp you can see the weatherman\'s thoughts.', 'The VOLT Station sold out in eleven minutes. We hid some. Don\'t tell Kez.', 'Every Flip comes with a ringtone of a gull. You cannot turn it off. We tried.'],
  celeste: ['Everything here is made by hand, in very small numbers, for very particular people.', 'The Meridian has a waiting list. The Noir has a waiting list for the waiting list.', 'We do not have sales. We have seasons.'],
  anton: ['Good afternoon.', 'Mind the step. It is a very expensive step.', 'Welcome to Maison Vellard.'],
  ines: ['People come in for a lamp and leave with a hot tub. I never push. I just let them sit in it.', 'Everything on the floor is in stock. The boys deliver the same day, up any stairs.', "The aquarium fish are real. They have names. Don't ask me the names, I'll cry when they sell.", 'A rug ties a room together. People laugh, but it does.'],
  guard: ['No running, no skateboards, no feeding the pigeons. They get in through the doors.', "Mall's open ten to ten. I'm here eleven to eleven. Do the math.", 'Somebody tried to fish the coins out of the fountain once. Once.'],
  pretzel: ['Pretzel? Salt, cinnamon, or "the works". The works is both. Do not get the works.', "Twenty years at this kiosk. I've seen three escalators break and one wedding.", 'Cash only. The card machine broke in 2003 and honestly, good.'],
  shopper: ["I came in for socks. I have four bags. Help.", 'Have you been in the fancy one upstairs? I touched a coat and a man appeared.', 'The pretzel guy remembers my order. That is a kind of love.', "My partner's in RACK & RUIN. I'll see them in three hours.", 'They say the drop sells out in eleven minutes.'],
};
/** What shoppers say when they notice what you're wearing (or don't). */
function outfitLine(a) {
  const st = statusOf(state.appearance, state.home);
  const piece = showpiece(state.appearance);
  if (st.tier >= 6 && piece) return talkRng.pick([`Wait, is that the ${piece.name}? Can I... no. Sorry. Never mind.`, `Okay, you're clearly someone. Are you someone?`, `I've only ever seen the ${piece.name} in the window.`]);
  if (st.tier >= 3 && piece) return talkRng.pick([`Love the ${piece.name}. Where's that from?`, 'You look like you know where you\'re going.', 'Sick fit, honestly.']);
  return talkRng.pick(MALL_LINES.shopper);
}
function mallSeatOrTalk() {
  if (seat) return { label: 'Stand up', act: standUp };
  const p = player.pos;
  const a = shoppers.nearest(p, 1.5);
  let sp = null;
  let sd = 1.0;
  for (const s of galleria.seats) {
    if (shoppers.seatTaken.has(s) || Math.abs(s.y - p.y) > 0.6) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < sd) {
      sd = d;
      sp = s;
    }
  }
  const da = a ? Math.hypot(a.c.x - p.x, a.c.z - p.z) - (a.role ? 0.6 : 0) : Infinity;
  if (a && da <= sd) return { label: `Talk to ${a.name ?? 'shopper'}`, act: () => mallTalk(a) };
  if (sp)
    return {
      label: sp.showroom ? `Try ${sp.showroom}` : sp.mall ? 'Sit on the bench' : 'Sit down',
      act: () => {
        shoppers.seatTaken.add(sp);
        sitDown(sp);
        if (sp.showroom) {
          needs.add('energy', 1);
          return ui.toast(talkRng.pick(['You sink in. Then you sink in a bit more. Ines gives you a knowing look.', 'Oh no. Oh, this is very comfortable.', 'You sit, and for a second you can see it in your place.']));
        }
        if (sp.y > galleria.origin.y + 2) ui.toast(talkRng.pick(['You sit and watch the escalators. People going up with nothing, coming down with bags.', 'The whole atrium below you. A kid drops a coin in the fountain and makes a face like it worked.']));
      },
    };
  return null;
}
function mallTalk(a) {
  const key = a.key ?? 'shopper';
  player.locked = true;
  a.talking = true;
  const close = () => ui.closeDialog();
  needs.chat(`mall:${a.name ?? a.k}`, clock.minutes, 6);
  const st = statusOf(state.appearance, state.home);
  let text = talkRng.pick(MALL_LINES[key] ?? MALL_LINES.shopper);
  if (!a.key) text = outfitLine(a);
  if (key === 'anton') text = st.tier >= 5 ? talkRng.pick(['A pleasure to see you again.', 'He opens the door before you reach it, with a small bow.']) : st.tier <= 1 ? 'He looks at your shoes for a long second. "...Welcome."' : talkRng.pick(MALL_LINES.anton);
  if (key === 'celeste' && st.tier <= 2) text = 'She keeps folding the scarf. "If you need anything, I\'ll be... here."';
  const choices = [];
  const shopOf = { dot: 'rr', kez: 'sg', celeste: 'mv', ines: 'rs', kai: 'bw' }[key];
  if (shopOf && shopping.unpaid(shopOf)) choices.push({ label: 'I\'d like to pay for these', fn: () => (close(), setTimeout(() => shopping.checkout(shopOf), 0)) });
  if (key === 'pretzel') choices.push({ label: 'A pretzel ($4.50)', fn: () => (close(), shopping.pretzel()) });
  if (key === 'ines')
    choices.push({
      label: 'How does delivery work?',
      fn: () =>
        ui.openDialog({
          name: 'Ines',
          text: 'Pay here and it goes on the van. By the time you get home it\'s in your storage, unpacked. Then you just put it where you want it: press F at home. Move it as often as you like. Free.',
          choices: [{ label: 'Great', fn: close }],
          onClose: done,
        }),
    });
  if (key === 'kez') choices.push({ label: 'When is the next drop?', fn: () => ui.openDialog({ name: 'Kez', text: `Saturday, ten AM. This week it's the ${shopping.dropItem().name}. ${state.drop?.stock ?? 12} pairs, and a new colourway every week. The line starts on the plaza before nine. Bring a chair.`, choices: [{ label: 'Okay', fn: close }], onClose: done }) });
  choices.push({ label: 'Bye', fn: close });
  const done = () => {
    a.talking = false;
    player.locked = false;
  };
  ui.openDialog({ name: a.name ?? 'Shopper', text, choices, onClose: done });
}

// ----------------------------------------------------------------------------
// The Halcyon Galleria
/** The Exchange: the board, the crawl, the people, the music, the closing bell, midnight. */
function updateExchange(dt) {
  const camD = camera.position.distanceTo(exchange.doorCenter);
  const people = brokers.people();
  if (exchange.open) people.push(player.pos);
  exchange.update(dt, time, env, { hour: clock.hour, camera, people, market, stocks: STOCKS, clockText: clock.format(), tape: tickerItems });
  brokers.update(dt, { hour: clock.hour, weekday: clock.weekday, near: camD < 95, watched: camD < 50, playerPos: player.pos });
  if (!playing) return;
  const style = inExchange && exchange.open ? 'jazz' : null;
  if (style && audio.music?.style !== style) audio.startMusic(style);
  if (!style && audio.music?.style === 'jazz' && !place) audio.stopMusic();
  // four o'clock on a weekday: the closing bell, and happy hour at the bar
  const d = Math.floor(clock.minutes / 1440);
  if (inExchange && market.isOpen() === false && clock.hour >= 16 && clock.hour < 16.2 && bellDay !== d && !['SAT', 'SUN'].includes(clock.weekday)) {
    bellDay = d;
    for (let k = 0; k < 4; k++) setTimeout(() => audio.tone(1568, 'sine', 0.07, 1.2), k * 380);
    ui.toast("The closing bell rings. A cheer from the floor, a groan from the corner. Happy hour at the Ticker Bar.");
  }
  // midnight: Gus walks the last of them out
  if (inExchange && !exchange.open && !ui.modal && !ui.fading) {
    if ((exchKick += dt) > 8) {
      exchKick = 0;
      ui.fade(() => {
        if (seat) standUp();
        leaveInterior();
        const sp = exchange.outsideSpot;
        player.teleport(outdoor, sp.x, sp.z, sp.yaw);
        Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: sp.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
        ui.toast('Gus: "That\'s midnight. Doors open at eight. Go home, the money will still be here."');
      }, 'CLOSING TIME');
    }
  } else exchKick = 0;
}

/** What crawls along the LED band: every price, then the headlines. */
function tickerItems() {
  const items = STOCKS.map((s) => {
    const p = market.price(s.sym);
    const ch = ((p - market.prevClose(s.sym)) / market.prevClose(s.sym)) * 100;
    return { text: `${s.sym} ${p.toFixed(2)} ${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%`, col: ch >= 0 ? '#5aff8a' : '#ff6a5a' };
  });
  for (const h of market.headlines(undefined, 4)) items.push({ text: `◆ ${h.you ? 'BREAKING: ' : ''}${h.text.toUpperCase()}`, col: h.you ? '#ffd36a' : '#ffb060' });
  return items;
}

const BAR_MENU = [
  { id: 'espresso', name: 'Espresso', price: 3, give: { energy: 12, fun: 1 }, line: 'Short, black, bitter. Your eyes open a little wider.' },
  { id: 'flat', name: 'Flat white', price: 4, give: { energy: 10, hunger: 3 }, line: 'Walt does a leaf in the foam without looking.' },
  { id: 'bull', name: 'Bull run', price: 14, booze: true, give: { fun: 8, social: 3 }, line: 'Bourbon, ginger, a lot of confidence. It tastes like a green day.' },
  { id: 'cat', name: 'Dead cat bounce', price: 12, booze: true, give: { fun: 7, social: 2 }, line: 'Gin, bitter lemon, a twist. Goes down, comes back up a little. Like the name.' },
  { id: 'bell', name: 'Closing bell', price: 16, booze: true, give: { fun: 9, social: 3 }, line: 'Champagne and something gold. Walt rings a tiny bell when he serves it.' },
  { id: 'margin', name: 'Margin call', price: 18, booze: true, give: { fun: 10, energy: -4 }, line: "Three spirits and a dare. You feel richer. You aren't." },
  { id: 'soda', name: 'Club soda', price: 2, give: { fun: 1 }, line: 'Fizzy water with a lime. Walt respects it.' },
];

/** The Ticker Bar: coffee all day, cocktails after the bell (half price till six). */
function tickerBar() {
  player.locked = true;
  const h = clock.hour;
  const after = h >= 16 || h < 4 || ['SAT', 'SUN'].includes(clock.weekday);
  const happy = h >= 16 && h < 18;
  const close = () => ui.closeDialog();
  const buy = (it, price) => {
    if (state.cash < price) return ui.toast(`Walt: "That's ${money(price)}, cash. There's an ATM by the door. Kidding, there isn't. There's one on the corner."`);
    state.cash = Math.round((state.cash - price) * 100) / 100;
    needs.give(it.give);
    audio.coin();
    close();
    ui.toast(it.line);
  };
  ui.openDialog({
    name: 'WALT · THE TICKER BAR',
    text: after ? (happy ? "Happy hour. Half price on anything with a name. What'll it be?" : 'Evening. What can I get you?') : "Coffee's on. The cocktails start when the bell rings at four.",
    choices: [
      ...BAR_MENU.filter((it) => after || !it.booze).map((it) => {
        const price = happy && it.booze ? it.price / 2 : it.price;
        return { label: `${it.name} (${money(price)})`, fn: () => buy(it, price) };
      }),
      { label: 'Nothing for now', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

const BROKER_LINES = [
  "Buy low, sell high. That's the whole job. Nobody can do it, but that's the job.",
  "I've been watching Brightwire for a year. It's a lottery ticket with a logo.",
  "The board's green, I'm happy. The board's red, I'm at the bar. Either way I'm at the bar.",
  'Dividends. Boring, beautiful dividends. Monday mornings are my favourite.',
  'Headlines go up at eight. By nine-thirty everyone has an opinion. By ten, half of them are wrong.',
  "Never put everything in one stock. Put most of it in one stock and lie about the rest. Joke. Mostly.",
  'Property, though. You can stand inside property. Try standing inside a share.',
];

/** Talking to people at the Exchange. Brokers at the bar after the bell will trade you a tip for a drink. */
function exchangeTalk(a) {
  const key = a.key ?? 'broker';
  player.locked = true;
  a.talking = true;
  const close = () => ui.closeDialog();
  const done = () => {
    a.talking = false;
    player.locked = false;
  };
  needs.chat(`exch:${a.name}`, clock.minutes, 6);
  if (key === 'walt') {
    a.talking = false;
    return tickerBar();
  }
  if (key === 'priya') {
    a.talking = false;
    return propertyDesk();
  }
  if (key === 'gus') return ui.openDialog({ name: 'Gus', text: talkRng.pick(["Evening. Wipe your feet, it's real marble.", "Eight till midnight. I've been on this door since the board had chalk on it.", 'Rub the gull outside on your way out. Everybody does. Nobody admits it.']), choices: [{ label: 'Bye', fn: close }], onClose: done });
  const d = Math.floor(clock.minutes / 1440);
  state.tips ??= {};
  const atBar = a.spot && (a.spot.role === 'bar' || a.spot.role === 'booth');
  const choices = [];
  if (atBar && clock.hour >= 16 && state.tips[a.name] !== d)
    choices.push({
      label: "Buy them a drink and ask what they've heard ($14)",
      fn: () => {
        if (state.cash < 14) return ui.toast('Not enough cash for a round.');
        state.cash -= 14;
        state.tips[a.name] = d;
        needs.give({ social: 6, fun: 3 });
        audio.coin();
        const tip = market.tip(d);
        const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const when = tip && (tip.day === d + 1 ? 'tomorrow' : `on ${DAYS[((tip.day % 7) + 7) % 7]}`);
        const text = tip
          ? `${a.name} leans in. "You didn't hear it from me. ${STOCKS.find((s) => s.sym === tip.sym).name}, ${when}. ${tip.up ? 'Good news. Very good news.' : "Bad news. I'd be out by the open."}" They tap their nose.`
          : `${a.name} shrugs into the glass. "Quiet week. Nothing's moving that I know about."`;
        ui.openDialog({ name: a.name, text, choices: [{ label: 'Thanks', fn: close }], onClose: done });
      },
    });
  choices.push({ label: 'Bye', fn: close });
  ui.openDialog({ name: a.name, text: talkRng.pick(BROKER_LINES), choices, onClose: done });
}

/** E at the Exchange (and on its plaza). */
function exchangeFind() {
  const p = player.pos;
  if (seat?.exch) return { label: seat.terminal ? 'Back to the terminal' : 'Stand up', act: seat.terminal ? () => openTerminal('HALCYON EXCHANGE · TERMINAL', standUp) : standUp };
  const near = (q, r) => Math.hypot(q.x - p.x, q.z - p.z) < r;
  if (exchange.onPlaza(p) && near(exchange.gull, 1.3)) return { label: "Rub the Harbour Gull's beak", act: rubGull };
  if (!inExchange || !exchange.open) return null;
  // the terminals
  for (const t of exchange.terminals) {
    if (brokers.taken.has(t.seat) || !near(t.seat, 0.9)) continue;
    return { label: 'Use the terminal', act: () => (sitDown({ ...t.seat, exch: true, terminal: true }), brokers.taken.add(t.seat), (seatRef = t.seat), openTerminal('HALCYON EXCHANGE · TERMINAL', standUp)) };
  }
  const a = brokers.nearest(p, 1.5);
  const loc = exchange.local(p);
  if (a && (a.key || Math.hypot(a.c.x - p.x, a.c.z - p.z) < 1.3)) return { label: `Talk to ${a.name}`, act: () => exchangeTalk(a) };
  if (loc.x > 3.3 && loc.x < 4.9 && loc.z > 3.6 && loc.z < 11.6) return { label: 'Order at the bar', act: tickerBar };
  if (near(exchange.agentSpot, 1.3)) return { label: 'Ask about property', act: propertyDesk };
  if (near(exchange.modelAt, 2.3)) return { label: 'Look at the city model', act: () => ui.toast(propertyModelLine()) };
  for (const s of [...exchange.stools, ...exchange.booths, ...exchange.loungeSeats]) {
    if (brokers.taken.has(s) || !near(s, 0.8)) continue;
    const label = s.stool ? 'Sit at the bar' : exchange.booths.includes(s) ? 'Slide into the booth' : 'Sit down';
    return { label, act: () => (brokers.taken.add(s), (seatRef = s), sitDown({ ...s, exch: true })) };
  }
  return null;
}
let seatRef = null; // the exchange seat object you're in (shared "taken" set with the brokers)

/** Priya's desk: what's for sale, what you own, buy, sell, find it on the map. */
function propertyDesk() {
  if (!state.seen.property) {
    state.seen.property = true;
    setTimeout(() => ui.hint('Buy a building and its rent lands in your bank every <b>Monday</b>, minus repairs. Values go up and down with each district: sell here any time (3% fees).', 10), 300);
  }
  player.locked = true;
  const row = (p) => {
    const mine = property.owns(p.id);
    const v = property.value(p);
    const o = state.property.owned[p.id];
    return {
      p,
      name: p.name,
      desc: `${p.where} · ${p.blurb}`,
      chip: mine ? '#5aff8a' : '#ff5a4a',
      tags: mine ? [`<em class="own">YOURS · paid ${money(o.paid)}</em>`] : [],
      right: money(v),
      rightSub: `rent ${money(property.rent(p))}/wk`,
      acts: mine
        ? [
            { id: 'map', label: 'Show me on the map', key: 'E', go: true },
            { id: 'sell', label: `Sell (${money(Math.round(v * 0.97))} after fees)`, key: 'X' },
          ]
        : [
            { id: 'buy', label: 'Buy it', key: 'E', go: true },
            { id: 'map', label: 'Show me on the map', key: 'X' },
          ],
    };
  };
  ui.openDecor({
    title: 'HALCYON EXCHANGE · PROPERTY',
    style: 'prop',
    sub: () => `Bank ${money(state.bank)} · you own ${property.ownedList().length} of ${PROPS.length}`,
    rows: () => [...PROPS.filter((p) => !property.owns(p.id)).map(row), ...PROPS.filter((p) => property.owns(p.id)).map(row)],
    empty: '',
    foot: input.isTouch ? 'tap a row, then a button' : '↑↓ pick · Enter buy (or map) · X sell (or map) · Esc done',
    onAct: (r, id) => {
      const p = r.p;
      if (id === 'map') {
        ui.closeDecor();
        const at = property.frontOf(p);
        if (at) setRoute({ id: `prop:${p.id}`, at, name: () => p.name, icon: () => 'key', color: () => '#d8b46a' });
        return void ui.toast(`Route set: ${p.name}, ${p.where}. Follow the beam.`);
      }
      if (id === 'buy') {
        const v = property.value(p);
        ui.closeDecor();
        player.locked = true;
        return void ui.openDialog({
          name: 'Priya',
          text: `${p.name}, ${p.where}. ${money(v)} today, rent about ${money(property.rent(p))} a week. From your bank (you have ${money(state.bank)}). Shall I draw up the papers?`,
          choices: [
            {
              label: `Buy it (${money(v)})`,
              fn: () => {
                const res = property.buy(p.id);
                ui.closeDialog();
                if (!res.ok) return ui.toast(res.msg);
                audio.coin();
                setTimeout(() => audio.tone(1568, 'sine', 0.05, 0.6), 200);
                needs.give({ fun: 12 });
                propertyChanged();
                ui.toast(`Priya: "Congratulations. ${res.msg}" She hands you a heavy ring of keys.`);
                saveNow();
              },
            },
            { label: 'Not yet', fn: () => ui.closeDialog() },
          ],
          onClose: () => (player.locked = false),
        });
      }
      if (id === 'sell') {
        const res = property.sell(p.id);
        if (res.ok) {
          audio.coin();
          propertyChanged();
          saveNow();
        }
        return res.msg;
      }
    },
    onClose: () => (player.locked = false),
  });
}

/** SOLE SWAP: sell Dex your pairs (and other clothes), buy the colourways you missed. */
function soleSwap() {
  if (!SWAP_OPEN(clock.hour)) return ui.toast('Dex: "Stall opens at six. Daylight is bad for business. And for my eyes."');
  player.locked = true;
  if (!state.seen.swap) {
    state.seen.swap = true;
    setTimeout(() => ui.hint('Grain Runner 9 pairs are worth the most the week they drop, then less, then more as they get rare. Dex pays 80% of the going rate and sells at 120%. He pays cash.', 10), 300);
  }
  const rows = () => {
    const out = [{ head: true, name: "Grain Runner 9 · this week's prices", desc: 'A new colourway drops at SPLITGRAIN every Saturday, 10 AM.' }];
    for (const id of GR9) {
      const it = ITEM[id];
      const m = resale.market(id);
      const mine = state.owned.includes(id);
      const a = resale.sinceDrop(id);
      out.push({
        id,
        name: it.name,
        desc: m === null ? 'Not dropped yet.' : a === 0 ? 'Dropped this week. Peak hype.' : `Dropped ${a} week${a > 1 ? 's' : ''} ago.`,
        chip: it.look.shoes,
        tags: mine ? ['<em class="own">YOURS</em>'] : [],
        right: m === null ? '—' : money(m),
        rightSub: m === null ? '' : mine ? `Dex pays ${money(resale.offer(id))}` : `Dex sells ${money(resale.ask(id))}`,
        acts: m === null ? [] : mine ? [{ id: 'sell', label: `Sell (${money(resale.offer(id))})`, key: 'X' }] : [{ id: 'buy', label: `Buy (${money(resale.ask(id))})`, key: 'E', go: true }],
      });
    }
    const rest = sellable(state).filter((it) => !it.drop);
    if (rest.length) out.push({ head: true, name: 'Your other clothes', desc: 'Dex takes anything. Vintage gems and VELLARD hold their value best.' });
    for (const it of rest) out.push({ id: it.id, name: it.name, desc: it.desc, chip: it.look.jacket ?? it.look.top ?? it.look.bottom ?? it.look.shoes ?? '#888', right: money(it.price), rightSub: `Dex pays ${money(resale.offer(it.id))}`, acts: [{ id: 'sell', label: `Sell (${money(resale.offer(it.id))})`, key: 'X' }] });
    return out;
  };
  ui.openDecor({
    title: 'SOLE SWAP · DEX',
    style: 'swap',
    sub: () => `Cash ${money(state.cash)} · cash only`,
    rows,
    empty: '',
    foot: input.isTouch ? 'tap a row, then a button' : '↑↓ pick · Enter buy · X sell · Esc done',
    onAct: (row, id) => {
      if (id === 'buy') {
        const res = resale.buy(row.id);
        if (res.ok) {
          audio.coin();
          needs.add('fun', 6);
          saveNow();
        }
        return res.msg;
      }
      if (id === 'sell') {
        const res = resale.sell(row.id, state.appearance, baseWear(state.appearance));
        if (res.ok) {
          crowd.setAppearance(player.char.id, state.appearance);
          audio.coin();
          saveNow();
        }
        return res.msg;
      }
    },
    onClose: () => (player.locked = false),
  });
}

/** Ownership changed: the boards on the buildings, the city model, the map. */
function propertyChanged() {
  property.buildSigns(exchange.xt.xsigns);
  exchange.setModel(property.modelHighlights());
}

function propertyModelLine() {
  const n = property.ownedList().length;
  return `Port Halcyon in miniature, under glass. ${PROPS.length - n} buildings glow red: for sale.${n ? ` ${n} glow green: yours.` : ''} Somebody has put a tiny gull on the Exchange.`;
}

function rubGull() {
  const d = Math.floor(clock.minutes / 1440);
  if (state.gullDay === d) return ui.toast("The beak's already shiny from you today. Greedy.");
  state.gullDay = d;
  needs.add('fun', 3);
  audio.tone(880, 'sine', 0.04, 0.4);
  ui.toast(talkRng.pick(["You rub the Harbour Gull's beak. It's worn gold from a hundred years of hopeful hands.", 'A rub for luck. A tourist takes your photo doing it.', 'The bronze is warm from the sun. You feel, briefly, like a winner.']));
}

function updateGalleria(dt) {
  const camD = camera.position.distanceTo(galleria.doorCenter);
  const people = shoppers.people();
  if (galleria.open) people.push(player.pos);
  galleria.update(dt, time, env, { hour: clock.hour, camera, people, home: !!place });
  shoppers.update(dt, { hour: clock.hour, weekend: ['SAT', 'SUN'].includes(clock.weekday), near: camD < 95, watched: camD < 50, playerPos: player.pos, drop: shopping.drop });
  if (!playing) return;
  shopping.update(dt);
  // the music follows you from shop to shop
  const zone = inGalleria && galleria.open ? galleria.zoneAt(player.pos) : null;
  const style = zone && { rr: 'radio', sg: 'street', mv: 'lounge', rs: 'bossa', bw: 'street', mall: 'mall' }[zone];
  const mallStyles = ['radio', 'street', 'lounge', 'bossa', 'mall'];
  if (style && audio.music?.style !== style) audio.startMusic(style);
  if (!style && mallStyles.includes(audio.music?.style) && !place) audio.stopMusic();
  // 10 PM: the guard walks the last shoppers out
  if (inGalleria && !galleria.open && !ui.modal && !ui.fading) {
    if ((mallKick += dt) > 10) {
      mallKick = 0;
      ui.fade(() => {
        leaveInterior();
        const sp = galleria.outsideSpot;
        player.teleport(outdoor, sp.x, sp.z, sp.yaw);
        Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: sp.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
        ui.toast('The guard jingles his keys. "Mall\'s closed, friend. Ten AM tomorrow."');
      }, 'CLOSING TIME');
    }
  } else mallKick = 0;
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
  if (onClock()) Object.assign(mult, { energy: 1.6, hygiene: 1.4, fun: 1.4 });
  if (dm > 0 && dm < 30) needs.tick(dm, mult);

  // things that fill them while you're doing them (per real second)
  const home = place && !touring;
  if (home && place.tvOn) needs.add('fun', 0.25 * dt);
  if (home && audio.music) needs.add('fun', 0.08 * dt);
  if (seat?.green || seat?.rest) needs.add('energy', 0.1 * dt);
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
    if (decor.carry) decor.cancel();
    visit.interrupt();
    if (job.J.shift) job.clockOut();
    if (barJob.onShift) barJob.clockOut();
    if (crew.onShift) crew.clockOut('passout');
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
  if (driving) exitCar(true);
  if (decor.carry) decor.cancel();
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
  inGalleria = false;
  inExchange = false;
  inMotors = false;
  if (inOrrery) {
    inOrrery = false;
    player.space = rig.space = outdoor;
  }
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
  list.push({ label: 'HALCYON GALLERIA', go: () => warpOutside(galleria.outsideSpot) });
  list.push({ label: 'CORSO MOTORS', go: () => warpOutside(motors.outsideSpot) });
  list.push({ label: 'THE CROWN · lobby', go: () => warpOutside(crown.outsideSpot) });
  list.push({ label: 'THE CROWN · roof', go: () => warpOutside({ ...crown.liftArrive, y: crown.DECK }) });
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
const places = buildPlaces({ city, apts, state, store, job, crew, gullys, galleria, exchange, market, motors, crown, club, lantern, park, clubNight, clubTheme: tonightTheme, clubFriends, weekday: () => clock.weekday });
// buildings you own show up on the map (with a key)
for (const p of PROPS) {
  const at = property.frontOf(p);
  if (at) places.list.push({ id: `prop:${p.id}`, icon: () => 'key', color: () => '#d8b46a', at, name: () => p.name.toUpperCase(), sub: () => `Yours · ${p.where} · rent about ${money(property.rent(p))} a week`, status: () => ({ text: 'YOURS', open: true }), needs: () => [], hidden: () => !property.owns(p.id) });
}

// ...and so do your cars, wherever you left them
for (let k = 0; k < 8; k++) {
  const rec = () => state.cars[k];
  places.list.push({
    id: `car:${k}`,
    icon: () => 'car',
    color: () => '#ffd84a',
    at: {
      get x() {
        return rec()?.x ?? 0;
      },
      get z() {
        return rec()?.z ?? 0;
      },
    },
    name: () => {
      const m = CAR[rec().id];
      return `Your ${m.make} ${m.name}`;
    },
    sub: () => 'Parked where you left it',
    status: () => ({ text: 'PARKED', open: true }),
    needs: () => ['fun'],
    hidden: () => !rec() || driving?.rec === rec(),
  });
}

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

/** The wardrobe's status line for an outfit. */
function statusHtml(app) {
  const st = statusOf(app, state.home);
  const next = st.next !== null ? `${st.next - st.score} more to ${TIERS[st.tier + 1].name}` : 'nowhere left to climb';
  return `STATUS · ${st.name.toUpperCase()} <small>${st.score} points (outfit + home) · ${next}</small>`;
}

let lastTier = null;
let remarkT = 20;
const REMARKS = [
  [],
  [],
  [],
  ['Someone glances at your shoes on the way past.', '"Nice jacket," says someone, already gone.'],
  ['"Okay, that fit," someone mutters to their friend.', 'A couple stops talking as you pass, then starts again, about you.'],
  ['Someone stops dead to look at your {piece}. You keep walking. Obviously.', '"Is that real?" you hear behind you. It is.'],
  ['A tourist takes your photo. You pretend not to notice.', 'Two people argue about whether you are somebody. You are.', 'Someone actually gasps at your {piece}.'],
  ['A kid asks if you\'re famous. Their mum says "shh" but she\'s looking too.', 'A phone comes up to film you. Then another one.', 'People part like the sea. It\'s the {piece}.'],
];
/** Your status and the thing you're saving for, under the money. */
function updateStatus() {
  const st = statusOf(state.appearance, state.home);
  peds.stare = onClock() ? 0 : [0, 0, 0.05, 0.15, 0.3, 0.45, 0.65, 0.85][st.tier];
  // now and then someone says something
  if (!place && st.tier >= 3 && !ui.modal && (remarkT -= 1 / 60) <= 0) {
    const npc = peds.list.find((n) => n.noticed && n.c.visible && Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z) < 3.5);
    if (npc) {
      remarkT = talkRng.float(25, 50) / (1 + st.tier * 0.15);
      const piece = showpiece(state.appearance);
      ui.toast(talkRng.pick(REMARKS[st.tier]).replace('{piece}', piece ? piece.name : 'outfit'));
      needs.give({ fun: 1.5, social: 1 });
    }
  }
  const it = state.wish && lookup(state.wish);
  ui.setStatus(st, it && !state.owned.includes(state.wish) ? { name: it.name, have: state.cash + Math.max(0, state.bank), price: it.price } : null, shopping.unpaidText());
  // (the climb only counts once you've paid: trying things on just previews it)
  const wear = state.appearance.wear;
  const paid = Object.values(wear).every((id) => !id || ITEM[id]?.basic || state.owned.includes(id));
  if (!paid) return;
  if (lastTier !== null && st.tier > lastTier && !onClock()) {
    const LINES = ['', 'People stop looking straight through you.', "You look like you've got it together.", 'Fresh. Heads turn a little.', 'Sharp. People notice when you walk in.', 'Flashy. You can feel the looks.', 'Rich. Doors start opening for you.', 'Untouchable. The city knows your name.'];
    ui.toast(`STATUS: ${st.name.toUpperCase()}. ${LINES[st.tier]}`);
    audio.blip(true);
  }
  if (!onClock()) lastTier = st.tier;
}

function openWardrobe() {
  if (onClock()) return ui.toast("You're in uniform. Clock out first.");
  if (shopping.busy) return ui.toast("You're trying something on. Pay for it or take it off first.");
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
    { owned: state.owned, status: statusHtml },
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
  state.ledger.push({ t: Math.round(clock.minutes), what: `Rent · ${apt.L.name}`, amt: -due });
  ui.toast(`Rent paid: -${money(due)} · ${apt.L.name}`);
  if (state.bank < 0) setTimeout(() => ui.toast('Your bank account is overdrawn!'), 2600);
  weeklyIncome(n);
}

/** Monday morning, after the rent: what your money made last week. */
function weeklyIncome(n = 1) {
  const lines = [];
  const div = market.payDividends();
  if (div > 0) lines.push(`dividends +${money(div)}`);
  const fr = crew.franchiseProfit(n, Math.floor((clock.minutes - 6 * 60) / (7 * 1440)));
  if (fr) lines.push(`GULLY'S ${fr >= 0 ? '+' : '-'}${money(Math.abs(fr))}`);
  if (property.ownedList().length) {
    const r = property.collect(n);
    lines.push(`rent ${r.net >= 0 ? '+' : '-'}${money(Math.abs(r.net))}`);
    if (r.notes.length) setTimeout(() => ui.toast(`Your buildings: ${r.notes.slice(0, 3).join(' · ')}`), 6400);
  }
  const staff = payHelp(n);
  if (staff) lines.push(staff);
  if (lines.length) setTimeout(() => ui.toast(`Monday: ${lines.join(' · ')}`), 3200);
}

// ----------------------------------------------------------------------------
// Getting rich: the market (game/market.js) and what you're worth
/** Everything you have: cash, bank, shares (and, later, property and what your things would fetch). */
function netWorth() {
  const furniture = decor.pieces.reduce((s, p) => s + (FURN[p.id]?.price ?? 0) * 0.4, 0);
  const cars = ownedCars().reduce((s, c) => s + carValue(c.rec), 0);
  return state.cash + state.bank + market.value() + property.worth() + (crew.J.owner ? 150000 : 0) + resale.worth() + furniture + cars;
}

/** What you're worth, line by line (at any ATM). */
function worthSheet(back) {
  const furniture = decor.pieces.reduce((s, p) => s + (FURN[p.id]?.price ?? 0) * 0.4, 0);
  const line = (a, b) => `${a.padEnd(24, '.')} ${money(Math.round(b))}`;
  const rows = [
    line('Cash', state.cash),
    line('Bank', state.bank),
    line('Shares', market.value()),
    line(`Property (${property.ownedList().length})`, property.worth()),
    ...(crew.J.owner ? [line("GULLY'S Greenway", 150000)] : []),
    line('Clothes (to a reseller)', resale.worth()),
    ...(ownedCars().length ? [line(`Cars (${ownedCars().length})`, ownedCars().reduce((s, c) => s + carValue(c.rec), 0))] : []),
    line('Furniture (second-hand)', furniture),
    '',
    line('NET WORTH', netWorth()),
  ];
  ui.openDialog({ name: 'HALCYON SAVINGS · NET WORTH', text: rows.join('\n'), mono: true, choices: [{ label: 'Back', fn: () => back() }], onClose: () => (player.locked = false) });
}

// Net worth milestones: a moment, a headline on the Exchange's ticker, and status
const MILESTONES = [
  { at: 50000, status: 4, head: 'NEWCOMER CLEARS $50K; FRIENDS SUDDENLY CALL MORE' },
  { at: 250000, status: 8, head: 'QUARTER-MILLION AND CLIMBING: WHO IS THIS PERSON?' },
  { at: 1000000, status: 15, head: 'PORT HALCYON HAS A NEW MILLIONAIRE' },
  { at: 10000000, status: 25, head: 'TEN MILLION: THE CITY NOTICES ITS NEWEST TYCOON' },
];
let worthT = 0;
function updateWorth(dt) {
  if ((worthT -= dt) > 0) return;
  worthT = 0.5;
  const w = netWorth();
  let k = 0;
  MILESTONES.forEach((m, i) => w >= m.at && (k = i + 1));
  extraStatus.wealth = k ? MILESTONES[k - 1].status : 0;
  if (k > (state.milestone ?? 0)) {
    const m = MILESTONES[k - 1];
    state.milestone = k;
    state.headline = { t: Math.round(clock.minutes), text: m.head };
    for (let j = 0; j < 3; j++) setTimeout(() => audio.tone(1047 + j * 262, 'sine', 0.05, 0.35), j * 160);
    ui.toast(`NET WORTH: ${money(m.at)}+. ${['People start asking what you do.', 'Your bank calls just to say hello.', "You're a millionaire. Say it out loud. Go on.", 'You could buy the street. You might.'][k - 1]} It's on the ticker at the Exchange.`);
    saveNow();
  }
}

function openTerminal(title = 'HALCYON EXCHANGE · TERMINAL', after = null) {
  player.locked = true;
  if (!state.seen.market) {
    state.seen.market = true;
    setTimeout(() => ui.hint('Pick a company, choose how many (←→), then <b>Enter</b> to buy or <b>X</b> to sell. Headlines go up at 8 AM; the market is open 9:30 to 4, Monday to Friday.', 10), 400);
  }
  ui.openMarket({
    title,
    market,
    stocks: STOCKS,
    cash: () => state.cash,
    bank: () => state.bank,
    worth: netWorth,
    onTrade: (sym, side, n) => {
      const res = side === 'buy' ? market.buy(sym, n) : market.sell(sym, n);
      if (res.ok) {
        audio.coin();
        needs.add('fun', 1.5);
        saveNow();
      }
      return res;
    },
    onClose: () => {
      player.locked = false;
      after?.();
    },
  });
}

function handleKeys() {
  if (decor.carry) {
    if (input.hit('Escape', 'KeyF')) return cancelCarry();
    if (input.hit('KeyR')) {
      if (decor.rotate()) audio.tone(700, 'square', 0.02, 0.05);
      return;
    }
    if (input.hit('KeyE')) dropCarry();
    return;
  }
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
  if (driving) {
    if (input.hit('Tab') && state.phone) ui.toast('Eyes on the road. Pull over first.');
    if (input.hit('KeyR')) {
      const st = garage.nextStation();
      state.carStation = garage.station;
      audio.tone(st.style ? 1200 : 300, 'square', 0.02, 0.04);
    }
    if (input.hit('KeyH')) audio.horn(0.18, 1600, audio.master);
    if (input.hit('KeyE') && current) current.act();
    if (input.hit('KeyM')) return openMap();
    return;
  }
  if (input.hit('Tab') && state.phone) return openPhone();
  if (input.hit('KeyC')) return openWardrobe();
  if (input.hit('KeyM')) return openMap();
  if (input.hit('KeyF') && atHome()) {
    const near = !seat && decor.nearest(place, player);
    return near ? startCarry(near) : openDecorPanel();
  }
  if (input.hit('KeyE') && current) current.act();
}

// ----------------------------------------------------------------------------
// Home: placing furniture (world/homeDecor.js) and using it (game/homeLife.js)
const atHome = () => !!(place && !touring && place.id === state.home);
const homeLife = new HomeLife({ ui, audio, needs, clock, state, player, decor, sitDown, timeSkipped: () => (needsLast = clock.minutes), save: () => saveNow(), talk: talkRng, openTerminal: (t) => openTerminal(t) });

function carryPrompt() {
  const c = decor.carry;
  const touch = input.isTouch;
  const keys = touch ? 'TURN turns · DECOR cancels' : 'R turn · F cancel';
  const turn = c.def.kind === 'wall' ? (touch ? 'DECOR cancels' : 'F cancel') : keys;
  return { label: c.valid ? `Set down the ${c.def.name.toLowerCase()} <small>${turn}</small>` : `<span class="no">${c.why}</span> <small>${turn}</small>`, act: dropCarry };
}

function startCarry(piece) {
  if (!piece || !atHome()) return;
  if (seat) standUp();
  decor.pickUp(piece, place, player);
  audio.tone(520, 'sine', 0.04, 0.1);
  if (!state.seen.decor) {
    state.seen.decor = true;
    ui.hint(input.isTouch ? 'Walk it where you want it. <b>TURN</b> turns it, <b>USE</b> sets it down (green means it fits), <b>DECOR</b> puts it back.' : 'Walk it where you want it. <b>R</b> turns it, <b>E</b> sets it down (green means it fits), <b>F</b> puts it back.', 9);
  }
}

function dropCarry() {
  const c = decor.carry;
  if (!c) return;
  const why = decor.drop();
  if (why) {
    audio.tone(170, 'square', 0.04, 0.14);
    return ui.toast(why);
  }
  audio.tone(150, 'sine', 0.1, 0.18);
  const before = extraStatus.decor;
  extraStatus.decor = decor.score(state.home);
  if (extraStatus.decor > before) ui.toast(`${c.def.name} in place. Your home: +${extraStatus.decor} status.`);
  saveNow();
}

function cancelCarry() {
  decor.cancel();
  audio.tone(400, 'sine', 0.03, 0.08);
  extraStatus.decor = decor.score(state.home);
}

function openDecorPanel() {
  if (!atHome() || seat) return;
  const apt = place;
  player.locked = true;
  ui.openDecor({
    title: `${apt.L.name.toUpperCase()} · YOUR THINGS`,
    sub: () => `your home: +${decor.score(state.home)} status`,
    rows: () => {
      const rows = [];
      const groups = new Map();
      for (const p of decor.stored()) {
        const g = groups.get(p.id);
        if (g) g.n++;
        else groups.set(p.id, { p, n: 1 });
      }
      if (groups.size) rows.push({ head: true, name: 'In storage', desc: 'Delivered by ROOMSET. Pick something up and find it a spot.' });
      for (const { p, n } of groups.values()) {
        const def = FURN[p.id];
        rows.push({ piece: p, name: def.name, desc: def.desc, chip: def.chip, tags: n > 1 ? [`<em>×${n}</em>`] : [], right: `+${def.decor}`, rightSub: 'status', acts: [{ id: 'place', label: def.kind === 'wall' ? 'Hang it' : 'Place it', key: 'E', go: true }] });
      }
      const here = decor.placedIn(apt.id);
      if (here.length) rows.push({ head: true, name: 'In this home', desc: 'Move things around, or pack them away.' });
      for (const p of here) {
        const def = FURN[p.id];
        rows.push({ piece: p, name: def.name, desc: def.desc, chip: def.chip, right: `+${def.decor}`, rightSub: 'status', acts: [{ id: 'move', label: 'Move it', key: 'E', go: true }, { id: 'store', label: 'Put in storage', key: 'X' }] });
      }
      return rows;
    },
    empty: 'Nothing to place yet. ROOMSET, upstairs at the Halcyon Galleria, delivers.',
    foot: input.isTouch ? 'tap a row, then a button' : '↑↓ pick · Enter place or move · X put in storage · Esc done',
    onAct: (row, id) => {
      if (id === 'place' || id === 'move') {
        ui.closeDecor();
        startCarry(row.piece);
        return;
      }
      if (id === 'store') {
        row.piece.home = null;
        decor.rebuild(apt);
        extraStatus.decor = decor.score(state.home);
        saveNow();
        return `${FURN[row.piece.id].name} packed away.`;
      }
    },
    onClose: () => (player.locked = false),
  });
}

// ---------------------------------------------------------------- BRIGHTWIRE: phones and the games pod
const PHONES = {
  flip: { name: 'BRIGHTWIRE Flip', price: 480, status: 1, line: 'Snaps shut with a sound you will never get tired of.' },
  gold: { name: 'BRIGHTWIRE Flip Gold', price: 2400, status: 6, line: 'Brushed gold, a sapphire screen, and a ringtone recorded by an actual orchestra.' },
};
function phoneShop() {
  player.locked = true;
  const close = () => ui.closeDialog();
  const have = state.phone;
  ui.openDialog({
    name: 'Kai · BRIGHTWIRE',
    text: have === 'gold' ? '"You have the Gold. There is nothing above the Gold. I checked."' : have ? '"How\'s the Flip treating you? You know there\'s a Gold one. Just saying."' : '"The Flip! Flip it open: cabs, your bank, the markets, table bookings, the agency. Flip it shut: very satisfying."',
    choices: [
      ...Object.entries(PHONES)
        .filter(([id]) => have !== id && have !== 'gold')
        .map(([id, ph]) => ({
          label: `${ph.name} (${money(ph.price)})`,
          fn: () => {
            close();
            if (state.cash + Math.max(0, state.bank) < ph.price) return ui.toast(`"Card says no." Kai looks genuinely sad for you. (${money(ph.price)})`);
            const fromCash = Math.min(state.cash, ph.price);
            state.cash -= fromCash;
            state.bank -= ph.price - fromCash;
            state.ledger.push({ t: Math.round(clock.minutes), what: `BRIGHTWIRE · ${ph.name}`, amt: -ph.price });
            state.phone = id;
            extraStatus.phone = ph.status;
            audio.coin();
            for (let k = 0; k < 3; k++) setTimeout(() => audio.tone(1568 + k * 392, 'square', 0.03, 0.08), 200 + k * 90);
            needs.give({ fun: 8 });
            document.body.classList.add('has-phone');
            saveNow();
            ui.toast(`${ph.name}: yours. ${ph.line}`);
            setTimeout(() => ui.hint(input.isTouch ? 'Tap <b>PHONE</b> (under your needs) to open it.' : 'Press <b>Tab</b> to open your phone (or click PHONE under your needs).', 9), 1500);
          },
        })),
      { label: 'Just looking', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

function gamesPod() {
  homeLife.arcade();
}

// ---------------------------------------------------------------- the phone
function openPhone() {
  if (!state.phone || ui.modal || ui.fading) return;
  if (driving) return ui.toast('Eyes on the road. Pull over first.');
  if (dance.active || dj.active) return;
  player.locked = true;
  audio.tone(1760, 'square', 0.02, 0.05);
  const apps = () => {
    const rows = [
      { app: 'cab', name: 'Harbour Cabs', desc: 'A yellow cab to anywhere on the map. Pay the driver by distance.', chip: '#ffd84a' },
      ...(state.help?.chauffeur ? [{ app: 'chauffeur', name: 'Ellis (your chauffeur)', desc: ownedCars().some((c) => c.rec.id === 'monarch') ? 'In the Monarch, of course. Anywhere you like. Free.' : 'Anywhere you like, in the agency\'s black saloon. Free.', chip: '#141418' }] : []),
      ...(ownedCars().length ? [{ app: 'valet', name: 'Valet', desc: 'Have one of your cars brought round to you. $40.', chip: '#ff6a5a' }] : []),
      { app: 'orrery', name: 'ORRERY', desc: orreryBooking() ? `Your table: ${hourText(orreryBooking().hour)} tonight.` : 'Book a table on the roof of the Meridian tower.', chip: '#d8b46a' },
      { app: 'markets', name: 'Markets', desc: market.statusText?.() ?? 'Prices, your shares, buy and sell.', chip: '#5aff8a' },
      { app: 'bank', name: 'Bank', desc: `Cash ${money(state.cash)} · bank ${money(state.bank)} · net worth ${money(netWorth())}`, chip: '#7fd4ff' },
      { app: 'agency', name: 'The Agency', desc: 'Hired help: a housekeeper, a private chef, a chauffeur. Paid weekly.', chip: '#c8a070' },
    ];
    return rows.map((r) => ({ ...r, acts: [{ id: 'open', label: 'Open', key: 'E', go: true }] }));
  };
  ui.openDecor({
    title: `${PHONES[state.phone].name.toUpperCase()}`,
    sub: () => clock.format(),
    style: 'phone',
    rows: apps,
    empty: '',
    foot: input.isTouch ? 'tap an app' : '↑↓ pick · Enter open · Esc put it away',
    onAct: (row) => {
      ui.closeDecor();
      setTimeout(() => phoneApp(row.app), 0);
    },
    onClose: () => (player.locked = false),
  });
}

function phoneApp(app) {
  if (app === 'cab') return cabMenu(false);
  if (app === 'chauffeur') return cabMenu(true);
  if (app === 'valet') return valetMenu();
  if (app === 'orrery') return phoneOrrery();
  if (app === 'markets') return openTerminal(`${PHONES[state.phone].name.toUpperCase()} · MARKETS`);
  if (app === 'bank') {
    player.locked = true;
    return worthSheet(() => (player.locked = false));
  }
  if (app === 'agency') return agencyMenu();
}

/** Where a cab can take you: every place on the map (that you know about), home first. */
function cabMenu(chauffeur) {
  if (onClock()) return ui.toast("You're on the clock. Clock out first.");
  if (dinner) return ui.toast("You're in the middle of dinner. Theo would never forgive you.");
  const here = { x: player.pos.x, z: player.pos.z };
  const fare = (at) => (chauffeur ? 0 : Math.round(6 + Math.hypot(at.x - here.x, at.z - here.z) * 0.024));
  const list = places.list.filter((p) => !p.hidden?.() && Math.hypot(p.at.x - here.x, p.at.z - here.z) > 15);
  const homeFirst = list.sort((a, b) => (b.id === `apt:${state.home}`) - (a.id === `apt:${state.home}`));
  player.locked = true;
  ui.openDecor({
    title: chauffeur ? 'ELLIS · WHERE TO?' : 'HARBOUR CABS · WHERE TO?',
    sub: () => (chauffeur ? 'your driver is outside' : `cash ${money(state.cash)}`),
    style: 'phone',
    rows: () =>
      homeFirst.map((p) => ({
        p,
        name: p.name(),
        desc: p.sub?.() ?? '',
        chip: p.color(),
        right: chauffeur ? '' : money(fare(p.at)),
        rightSub: chauffeur ? '' : `about ${Math.round(3 + Math.hypot(p.at.x - here.x, p.at.z - here.z) / 120)} min`,
        acts: [{ id: 'go', label: 'Go', key: 'E', go: true }],
      })),
    empty: "You're already where everything is.",
    foot: input.isTouch ? 'tap a place, then Go' : '↑↓ pick · Enter go · Esc cancel',
    onAct: (row) => {
      const f = fare(row.p.at);
      if (state.cash + Math.max(0, state.bank) < f) return `<span class="no">The fare's about ${money(f)}. You don't have it.</span>`;
      ui.closeDecor();
      ride(row.p, f, chauffeur);
    },
    onClose: () => (player.locked = false),
  });
}

function ride(p, fare, chauffeur) {
  const fromCash = Math.min(state.cash, fare);
  state.cash -= fromCash;
  state.bank -= fare - fromCash;
  if (fare) state.ledger.push({ t: Math.round(clock.minutes), what: 'Harbour Cabs', amt: -fare });
  const d = Math.hypot(p.at.x - player.pos.x, p.at.z - player.pos.z);
  audio.horn(0.1);
  ui.fade(() => {
    if (seat) standUp();
    if (driving) exitCar(true);
    leaveInterior();
    visit.interrupt();
    clock.minutes += Math.round(3 + d / 120);
    player.pos.y = CITY.CURB;
    player.teleport(outdoor, p.at.x, p.at.z, 0);
    // step out on the pavement, not in the road
    city.colliders.resolveCircle(player.pos, 0.4, player.pos.y);
    Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: rig.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
    needs.give(chauffeur ? { energy: 3, fun: 2 } : { energy: 1 });
    ui.toast(
      chauffeur
        ? talkRng.pick([`Ellis holds the door. "${p.name()}. Very good." The partition goes up. The city slides by.`, 'Ellis drives like the road was built just for you. Maybe it was.'])
        : talkRng.pick([`The cabbie talks the whole way about his nephew's band. ${money(fare)}, no tip expected, tip accepted.`, `A yellow cab, a pine air freshener, the radio on low. ${money(fare)}.`, `The driver takes a shortcut that is not a shortcut. ${money(fare)} anyway.`]),
    );
    saveNow();
  }, chauffeur ? 'ELLIS' : 'TAXI');
}

/** Have a car brought round: it turns up on the nearest road, facing along it. */
function valetMenu() {
  const outside = !place && !onCrown && !inUnder && !inStore && !inClub && !inGullys && !inGalleria && !inExchange && !inMotors;
  if (!outside) return ui.toast('Step outside first, so the valet knows where to bring it.');
  player.locked = true;
  ui.openDecor({
    title: 'VALET · WHICH CAR?',
    sub: () => `cash ${money(state.cash)}`,
    style: 'phone',
    rows: () => ownedCars().map((c) => ({ car: c, name: `${c.m.make} ${c.m.name}`, desc: `Parked ${Math.round(Math.hypot(c.rec.x - player.pos.x, c.rec.z - player.pos.z))} m away.`, chip: c.rec.paint, right: '$40', acts: [{ id: 'go', label: 'Bring it', key: 'E', go: true }] })),
    empty: 'No cars.',
    foot: input.isTouch ? 'tap a car, then Bring it' : '↑↓ pick · Enter bring it · Esc cancel',
    onAct: (row) => {
      const spot = roadSpotNear(player.pos, row.car);
      if (!spot) return "The valet can't find anywhere to stop. Try somewhere nearer a road.";
      if (state.cash + Math.max(0, state.bank) < 40) return '<span class="no">$40, and you don\'t have it.</span>';
      const fromCash = Math.min(state.cash, 40);
      state.cash -= fromCash;
      state.bank -= 40 - fromCash;
      ui.closeDecor();
      ui.fade(() => {
        Object.assign(row.car.rec, spot);
        clock.minutes += 6;
        saveNow();
        ui.toast(`A valet in a red waistcoat hops out of your ${row.car.m.name}, hands you the keys and jogs off. Six minutes.`);
      }, 'VALET');
    },
    onClose: () => (player.locked = false),
  });
}

/** The nearest place on a road (ground level 0) a car fits, near p. */
function roadSpotNear(p, car) {
  let best = null;
  let bd = Infinity;
  const tmp = new THREE.Vector3();
  for (let r = 3; r <= 24; r += 1.5)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      if (city.groundHeight(x, z) !== 0) continue;
      // which way does the road run? along whichever axis is nearer a road's centre line
      const fi = (x + CITY.HALF) / CITY.PITCH;
      const fj = (z + CITY.HALF) / CITY.PITCH;
      const dx = Math.abs(fi - Math.round(fi)) * CITY.PITCH;
      const dz = Math.abs(fj - Math.round(fj)) * CITY.PITCH;
      const yaw = dx < dz ? 0 : Math.PI / 2;
      const ok = [-0.4, 0, 0.4].every((t) => {
        tmp.set(x + Math.sin(yaw) * car.m.L * t, 0, z + Math.cos(yaw) * car.m.L * t);
        const bx = tmp.x;
        const bz = tmp.z;
        city.colliders.resolveCircle(tmp, car.m.W / 2 + 0.2, 0);
        return Math.hypot(tmp.x - bx, tmp.z - bz) < 0.01;
      });
      if (ok && r < bd) {
        bd = r;
        best = { x, z, yaw };
      }
    }
  return best;
}

function phoneOrrery() {
  player.locked = true;
  const close = () => ui.closeDialog();
  const tonight = nightOf(clock.minutes);
  const late = clock.hour >= SLOTS[SLOTS.length - 1] - 0.5 || clock.hour < 6;
  const night = late ? tonight + 1 : tonight;
  const slots = SLOTS.filter((h) => late || h > clock.hour + 0.4);
  const b = orreryBooking();
  ui.openDialog({
    name: 'ORRERY · reservations',
    text: `A recorded voice, then Anouk. "ORRERY, good ${clock.hour < 12 ? 'morning' : clock.hour < 18 ? 'afternoon' : 'evening'}." ${b ? `"You're with us at ${hourText(b.hour)}. A change?"` : `"For one? ${late ? 'Tomorrow' : 'Tonight'} I can do ${slots.map(hourText).join(', ')}. We ask our guests to dress: ${TIERS[DRESS_TIER].name} or better."`}`,
    choices: [
      ...slots.map((h) => ({
        label: `${late ? 'Tomorrow' : 'Tonight'} at ${hourText(h)}`,
        fn: () => {
          close();
          state.orrery = { night, hour: h };
          saveNow();
          ui.toast(`Booked: ORRERY ${late ? 'tomorrow' : 'tonight'} at ${hourText(h)}. The lift is in the lobby of the Meridian tower.`);
        },
      })),
      ...(b ? [{ label: 'Cancel my table', fn: () => (close(), (state.orrery = null), ui.toast('"Of course. Another time."')) }] : []),
      { label: 'Hang up', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

// ---------------------------------------------------------------- hired help (the Agency)
const HELP = {
  housekeeper: { name: 'Marisol', role: 'Housekeeper', wage: 600, desc: 'Keeps the fridge stocked and the place spotless. Fresh sheets: you sleep better.', status: 3 },
  chef: { name: 'Bastien', role: 'Private chef', wage: 1400, desc: 'Turns whatever is in the fridge into a proper dinner. Every night is a restaurant.', status: 4 },
  chauffeur: { name: 'Ellis', role: 'Chauffeur', wage: 1800, desc: 'Drives you anywhere on the map, from wherever you are. On call, day and night.', status: 5 },
};
function agencyMenu() {
  player.locked = true;
  state.help ??= {};
  ui.openDecor({
    title: 'THE AGENCY · HIRED HELP',
    sub: () => `bank ${money(state.bank)}`,
    style: 'phone',
    rows: () =>
      Object.entries(HELP).map(([id, h]) => ({
        id,
        name: `${h.role}: ${h.name}`,
        desc: h.desc,
        chip: state.help[id] ? '#5aff8a' : '#3a3a40',
        tags: state.help[id] ? ['<em>working for you</em>'] : [],
        right: `${money(h.wage)}`,
        rightSub: 'a week',
        acts: state.help[id] ? [{ id: 'fire', label: 'Let them go', key: 'X' }] : [{ id: 'hire', label: 'Hire (first week now)', key: 'E', go: true }],
      })),
    empty: '',
    foot: input.isTouch ? 'tap someone, then a button' : '↑↓ pick · Enter hire · X let go · Esc done',
    onAct: (row, act) => {
      const h = HELP[row.id];
      if (act === 'hire') {
        if (state.bank < h.wage) return `<span class="no">The first week is ${money(h.wage)}, up front. Your bank has ${money(state.bank)}.</span>`;
        state.bank -= h.wage;
        state.ledger.push({ t: Math.round(clock.minutes), what: `The Agency · ${h.role}`, amt: -h.wage });
        state.help[row.id] = true;
        if (row.id === 'housekeeper') state.fridge = Math.max(state.fridge, 6);
        updateHelpStatus();
        audio.coin();
        saveNow();
        return `${h.name} starts today. ${{ housekeeper: '"I have my own key. Don\'t worry about anything."', chef: '"Tell me what you hate. I will make you love it."', chauffeur: '"Call any time. I mean any time."' }[row.id]}`;
      }
      if (act === 'fire') {
        state.help[row.id] = false;
        updateHelpStatus();
        saveNow();
        return `${h.name} takes it well. Better than you'd hoped, honestly.`;
      }
    },
    onClose: () => (player.locked = false),
  });
}
function updateHelpStatus() {
  extraStatus.help = Object.entries(HELP).reduce((s, [id, h]) => s + (state.help?.[id] ? h.status : 0), 0);
}
/** Monday: the Agency takes its wages. */
function payHelp(n) {
  const wage = Object.entries(HELP).reduce((s, [id, h]) => s + (state.help?.[id] ? h.wage : 0), 0) * n;
  if (!wage) return null;
  state.bank -= wage;
  state.ledger.push({ t: Math.round(clock.minutes), what: 'The Agency · wages', amt: -wage });
  return `staff -${money(wage)}`;
}
/** Every morning the housekeeper restocks the fridge. */
function helpMorning() {
  const d = Math.floor((clock.minutes - 6 * 60) / 1440);
  if (state.help?.housekeeper && state.helpDay !== d) {
    state.helpDay = d;
    state.fridge = Math.max(state.fridge, 6);
  }
}

// ---------------------------------------------------------------- THE CROWN and ORRERY
const CROWN_FEE = 25000;
const crownMember = () => !!state.crownMember || state.home === 'penthouse';
const today = () => Math.floor(clock.minutes / 1440);
/** Tonight's ORRERY booking (or null). */
function orreryBooking() {
  const b = state.orrery;
  return b && b.night === nightOf(clock.minutes) ? b : null;
}
const guestOfOrrery = () => {
  const b = orreryBooking();
  return !!b && clock.hour >= b.hour - 1 && clock.hour < 23.5;
};

function updateCrown(dt) {
  const h = clock.hour;
  const session = crown.open && h >= 18 && h < 22;
  crown.update(dt, time, env, { hour: h, camera, session });
  const up = !place && crown.onRoof(player.pos);
  onCrown = up;
  const far = camera.position.y < crown.DECK - 20 || camera.position.distanceTo(crown.w(11, 9)) > 90;
  crownFolk.update(dt, { hour: h, time, far, playerPos: player.pos, reserved: orreryBooking() ? 0 : -1 });
  dinnerPlate.set(dinner ? crown.tables[0].plate : null, crown.tables[0].seats[0], dinner && !dinner.cleared ? ORRERY_MENU[dinner.course] : null, dinner?.pairing);
  if (!playing) return;
  if (up && !seat) crownFolk.push(player.pos, player.radius);
  const style = up && crown.open ? (inOrrery ? 'piano' : session ? 'lounge' : h >= 22 || h < 2 ? 'jazz' : 'bossa') : null;
  if (style && audio.music?.style !== style) audio.startMusic(style);
  // two in the morning: Margaux sends everyone down
  if (up && !crown.open && !ui.modal && !ui.fading) {
    if ((crownKick += dt) > 6) {
      crownKick = 0;
      crownLift(false, 'Margaux: "That\'s two. The lift is going down, and so are you. Goodnight."');
    }
  } else crownKick = 0;
}

/** Up (from the lobby) or down (from the roof) in the lift. */
function crownLift(goingUp, note = null) {
  if (dj.active) dj.end(true);
  for (let k = 0; k < 2; k++) setTimeout(() => audio.tone(1319 - k * 330, 'sine', 0.05, 0.5), k * 180);
  ui.fade(() => {
    if (seat) standUp();
    leaveInterior();
    visit.interrupt();
    if (goingUp) {
      const a = crown.liftArrive;
      player.pos.y = crown.DECK;
      player.teleport(outdoor, a.x, a.z, a.yaw);
      Object.assign(rig, { space: outdoor, pitch: 0.25, yaw: a.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
      district = city.districtAt(a.x, a.z);
      ui.showLocation('THE CROWN', clock.hour >= 18 && clock.hour < 22 ? 'sunset session' : crownMember() ? 'members' : 'guest of ORRERY');
      if (!state.seen.crown) {
        state.seen.crown = true;
        setTimeout(() => ui.hint('Lie on a lounger, swim (walk down the steps at the end of the pool), sit by the fire pits, order at the bar. ORRERY is the glass pavilion: Anouk at the door takes bookings. The lift is behind you.', 12), 1600);
      }
    } else {
      const o = crown.lobbyOut;
      player.pos.y = CITY.CURB;
      player.teleport(outdoor, o.x, o.z, o.yaw);
      Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: o.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
    }
    if (note) ui.toast(note);
  }, goingUp ? 'GOING UP' : 'GOING DOWN');
}

function crownLobby() {
  if (driving) return;
  if (!crown.open) return ui.toast('The lobby doors are locked. THE CROWN opens at 10 AM.');
  if (crownMember() || guestOfOrrery()) return crownLift(true, crownMember() ? null : `Felix checks the book. "ORRERY at ${hourText(orreryBooking().hour)}? Up you go."`);
  player.locked = true;
  const st = statusOf(state.appearance, state.home);
  ui.openDialog({
    name: 'Felix · THE CROWN',
    text:
      st.tier >= 5
        ? `"Good evening. THE CROWN is members only, I'm afraid. Membership is ${money(CROWN_FEE)}, once, for life. Residents of the tower are members already. Or there's ORRERY, if you have a reservation."`
        : `He looks at you, then at the list, then at you again. "Members only. ${money(CROWN_FEE)} to join. ORRERY takes reservations by phone. If you have a phone."`,
    choices: [
      {
        label: `Join (${money(CROWN_FEE)} from your bank)`,
        fn: () => {
          ui.closeDialog();
          if (state.bank < CROWN_FEE) return ui.toast(`Your card is declined. Felix is very kind about it. (Bank: ${money(state.bank)})`);
          state.bank -= CROWN_FEE;
          state.ledger.push({ t: Math.round(clock.minutes), what: 'THE CROWN · membership', amt: -CROWN_FEE });
          state.crownMember = true;
          audio.coin();
          needs.give({ fun: 6, social: 4 });
          saveNow();
          crownLift(true, 'Felix hands you a heavy brass card with your name on it. "Welcome to THE CROWN."');
        },
      },
      { label: 'Not today', fn: () => ui.closeDialog() },
    ],
    onClose: () => (player.locked = false),
  });
}

const hourText = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

function crownFind() {
  const p = player.pos;
  const near = (q, r) => Math.hypot(q.x - p.x, q.z - p.z) < r;
  if (seat?.crown) return seatAction(seat);
  if (dinner) return { label: 'Back to your table', act: () => sitDown(crown.tables[0].seats[0]) };
  if (near(crown.liftSpot, 1.3)) return { label: 'Take the lift down', act: () => crownLift(false) };
  if (crown.inPool(p)) return { label: 'Swim a few lengths', act: swim };
  const a = crownFolk.nearest(p, 1.6);
  const staffKey = a && Object.keys(crownFolk.staff).find((k) => crownFolk.staff[k] === a);
  if (staffKey === 'maitre' || near(crown.hostStand, 1.1)) return crownFolk.staff.maitre.c.visible ? { label: 'Talk to Anouk (ORRERY)', act: orreryHost } : { label: 'ORRERY · dinner 7 to 11', act: () => ui.toast('Anouk is on the door from half six. Book a table, then dress for it.') };
  if (staffKey === 'bar' || near(crown.barSpot, 1.2)) return { label: 'Order at THE CROWN BAR', act: () => crownBar() };
  const sp = crown.seats.find((q) => q.kind !== 'orrery' && near(q, 0.8) && !crownFolk.taken.has(q));
  if (a && staffKey) return { label: `Talk to ${a.name}`, act: () => crownStaffTalk(staffKey) };
  if (sp) return { label: { lounger: 'Lie on the lounger', pit: 'Sit by the fire', cabana: 'Sit in the cabana', bar: 'Sit at the bar' }[sp.kind], act: () => crownSit(sp) };
  if (a) return { label: `Talk to ${state.crownKnown?.[a.name] ? a.name : 'a member'}`, act: () => memberTalk(a) };
  return null;
}

function crownSit(sp) {
  if (sp.kind === 'cabana' && !(state.cabana?.day === today() && state.cabana.k === sp.cabana)) {
    return ui.toast(`"Reserved, I'm afraid." The cabanas are ${money(600)} a day, with champagne: ask Margaux by the lift.`);
  }
  sp.crown = true;
  crownFolk.taken.add(sp);
  sitDown(sp);
}

/** What E does when you're sitting somewhere up here. */
function seatAction(sp) {
  const day = clock.hour >= 7 && clock.hour < 18.5;
  if (sp.kind === 'orrery') return dinner ? { label: dinner.cleared ? 'Ask for the bill' : 'Next course', act: openDinner } : { label: 'Stand up', act: standUp };
  if (sp.kind === 'lounger') return { label: day ? 'Soak up the sun for a while' : 'Lie back and look at the stars', act: () => relax(sp) };
  if (sp.kind === 'pit') return { label: 'Warm your hands and chat', act: () => relax(sp) };
  if (sp.kind === 'cabana') return { label: 'Order champagne to the cabana', act: cabanaChampagne };
  if (sp.kind === 'bar') return { label: 'Order a drink', act: () => crownBar() };
  return { label: 'Stand up', act: standUp };
}

function relax(sp) {
  const day = clock.hour >= 7 && clock.hour < 18.5;
  ui.fade(() => {
    clock.minutes += 30;
    needsLast = clock.minutes;
    if (sp.kind === 'lounger') needs.give(day ? { energy: 10, fun: 5 } : { energy: 6, fun: 6 });
    else needs.give({ fun: 6, social: 8, energy: 2 });
    ui.toast(
      sp.kind === 'pit'
        ? talkRng.pick(['You end up in a long conversation about yachts with someone called Teddy. You learn a great deal about yachts.', 'The fire crackles. Somebody tells a story about a racehorse. Everybody laughs at the right moment.', 'Half an hour by the fire. Somebody passes you a blanket that probably costs more than your sofa.'])
        : day
          ? talkRng.pick(['Half an hour in the sun, 58 metres above the traffic. You can hear the harbour from up here.', 'You doze off. A waiter puts a towel over your feet without waking you.', 'The sun, the sound of the pool, a breeze. You might never go back down.'])
          : talkRng.pick(['The city below like spilt jewellery. A plane blinks across the stars.', 'You lie back and count the red lights on the cranes. You lose count at the ninth.']),
    );
  }, 'LATER');
}

function swim() {
  ui.fade(() => {
    clock.minutes += 20;
    needsLast = clock.minutes;
    needs.give({ fun: 12, hygiene: 6, energy: -6 });
    ui.toast(talkRng.pick(['Twenty lengths. Well. Twelve, and some floating. At the far end the water just stops and the city starts.', 'You swim to the edge and look over. Taxis like toys. Your heart does a little flip.', 'You float on your back. A gull looks down at you, unimpressed.']));
  }, 'SWIMMING');
}

const CROWN_DRINKS = [
  { name: 'Sparkling water', price: 6, line: 'In a glass so thin you worry about holding it.' },
  { name: 'Fresh juice', price: 12, line: 'Blood orange, pressed in front of you.' },
  { name: 'Crown Spritz', price: 22, alc: 1, line: 'Pink, bitter, a sprig of something from the roof garden. Very good.' },
  { name: 'Meridian Martini', price: 28, alc: 1, line: 'Stirred for exactly as long as it takes Remy to tell you about his boat.' },
  { name: 'Champagne (glass)', price: 34, alc: 1, line: 'Maison Lune, poured so the bubbles go straight up.' },
];
function crownBar() {
  const tonight = nightOf(clock.minutes);
  if (!state.drinks || state.drinks.night !== tonight) state.drinks = { night: tonight, alc: 0, count: 0, at: clock.minutes };
  const d = state.drinks;
  player.locked = true;
  const close = () => ui.closeDialog();
  ui.openDialog({
    name: 'Remy · THE CROWN BAR',
    text: talkRng.pick(['What are we drinking?', 'Good evening. On your tab?', 'Something cold, something bubbly, something strong?']),
    choices: [
      ...CROWN_DRINKS.map((dr) => ({
        label: `${dr.name} (${money(dr.price)})`,
        fn: () => {
          close();
          if (dr.alc && d.count >= 5) return ui.toast('"Let me get you some water, and maybe something to eat." Remy is nothing if not tactful.');
          state.bank -= dr.price;
          state.ledger.push({ t: Math.round(clock.minutes), what: 'THE CROWN · bar', amt: -dr.price });
          audio.coin();
          d.alc = Math.max(0, buzz() + (dr.alc ? 1 : -0.3));
          d.at = clock.minutes;
          if (dr.alc) d.count++;
          needs.give(dr.alc ? { fun: 7, social: 2, energy: -2 } : { energy: 3, hunger: 2 });
          ui.toast(dr.line + ' (on your tab)');
        },
      })),
      { label: 'Nothing', fn: close },
    ],
    onClose: () => (player.locked = false),
  });
}

function cabanaChampagne() {
  if (state.cabana?.champagne === today()) return ui.toast('The bottle is still half full and the ice bucket is still cold.');
  state.cabana.champagne = today();
  state.bank -= 180;
  state.ledger.push({ t: Math.round(clock.minutes), what: 'THE CROWN · champagne', amt: -180 });
  audio.coin();
  needs.give({ fun: 10, social: 4 });
  const tonight = nightOf(clock.minutes);
  if (!state.drinks || state.drinks.night !== tonight) state.drinks = { night: tonight, alc: 0, count: 0, at: clock.minutes };
  state.drinks.alc = buzz() + 1;
  state.drinks.at = clock.minutes;
  ui.toast('A bottle of Maison Lune arrives in a silver bucket, with two glasses and a bowl of strawberries. ($180)');
}

function crownStaffTalk(key) {
  const a = crownFolk.staff[key];
  player.locked = true;
  a.talking = true;
  needs.chat(`crown:${key}`, clock.minutes, 5);
  const done = () => {
    a.talking = false;
    player.locked = false;
  };
  const close = () => ui.closeDialog();
  if (key === 'host') {
    const mine = state.cabana?.day === today();
    return ui.openDialog({
      name: 'Margaux · THE CROWN',
      text: crownMember() ? talkRng.pick(['Lovely to see you. The pool is perfect today, eighty-two degrees.', 'Welcome back. Can I get you a towel? A cabana? A small country?', 'The sunset session starts at six. DJ Lune is in a very good mood.']) : 'Welcome, guest of ORRERY. The pool and the cabanas are for members, but please, enjoy the view.',
      choices: [
        ...(crownMember() && !mine
          ? [
              {
                label: `Book a cabana for the day (${money(600)}, champagne included)`,
                fn: () => {
                  close();
                  const k = crownFolk.taken.has(crown.cabanas[0].seats[0]) ? 1 : 0;
                  state.cabana = { day: today(), k };
                  state.bank -= 600;
                  state.ledger.push({ t: Math.round(clock.minutes), what: 'THE CROWN · cabana', amt: -600 });
                  audio.coin();
                  saveNow();
                  ui.toast(`Cabana ${k + 1} is yours until we close. "The champagne is on its way when you are."`);
                },
              },
            ]
          : []),
        { label: 'Thanks', fn: close },
      ],
      onClose: done,
    });
  }
  const lines = {
    bar: ['Every bottle on that shelf has a story. Most of them are about Mr Halvard.', "I've been up here nine years. I've seen two proposals, a divorce and a man who brought his horse up in the lift.", 'The trick with the Martini is you stir it until the customer stops talking about their yacht.'],
    dj: ['Sunset sessions, every evening. I play whatever the sky looks like.', 'You can hear the whole city from up here if you turn me down. I will not be turning me down.', 'Last week the sun went down exactly on the drop. Exactly. I cried.'],
    maitre: [],
    chef: ['Seven courses. The truffle is the fifth. Do not fill up on bread.', 'Everything comes up the dumbwaiter from the kitchen on eighteen. Very slowly. Very carefully.'],
    waiter: ['The orrery took the sculptor three years. It keeps perfect time. Unlike the sculptor.', "The table by the window is the best in the city. I'm not supposed to say that. I say it every night."],
  }[key];
  ui.openDialog({ name: `${a.name} · THE CROWN`, text: talkRng.pick(lines), choices: [{ label: 'Bye', fn: close }], onClose: done });
}

function memberTalk(a) {
  player.locked = true;
  state.crownKnown ??= {};
  const known = state.crownKnown[a.name];
  state.crownKnown[a.name] = true;
  a.c.talk = 1;
  needs.chat(`crown:m:${a.name}`, clock.minutes, 7);
  const st = statusOf(state.appearance, state.home);
  const line = known
    ? talkRng.pick([`"You again! Have you been to Saint-Halcyon this year? Don't. Everybody's there."`, '"My accountant says I should slow down. I bought him a boat. He\'s much happier."', '"We should do lunch. My people will call your people. Do you have people?"'])
    : st.tier >= 6
      ? talkRng.pick([`"${a.name}. And you are? Of course you are. I've seen your car."`, `"I'm ${a.name}. I collect watches and grudges. Charmed."`])
      : talkRng.pick([`"Oh, hello. ${a.name}. Are you a member, or with somebody?" They look at your shoes.`, `"${a.name}." A limp handshake. "Are you new? You look new."`]);
  ui.openDialog({ name: a.name, text: line, choices: [{ label: 'Bye', fn: () => ui.closeDialog() }], onClose: () => ((player.locked = false), (a.c.talk = 0)) });
}

// ---------------------------------------------------------------- ORRERY
const dinnerPlate = new TablePlate(scene);
let dinner = null; // { course, pairing, cleared }

function orreryHost() {
  const a = crownFolk.staff.maitre;
  player.locked = true;
  a.talking = true;
  const done = () => {
    a.talking = false;
    player.locked = false;
  };
  const close = () => ui.closeDialog();
  const b = orreryBooking();
  const st = statusOf(state.appearance, state.home);
  if (b && clock.hour >= b.hour - 0.5 && orreryOpen(clock.hour)) {
    if (st.tier < DRESS_TIER)
      return ui.openDialog({
        name: 'Anouk · ORRERY',
        text: `"We have your table, of course." A pause. "We do ask our guests to dress for the evening. ${TIERS[DRESS_TIER].name} or better. The lift will be here when you're ready."`,
        choices: [{ label: 'Go and change', fn: close }],
        onClose: done,
      });
    return ui.openDialog({
      name: 'Anouk · ORRERY',
      text: talkRng.pick(['"Good evening. Your table by the window is ready. Please, follow me."', '"Welcome to ORRERY. You are just in time: the orrery is about to pass the window."']),
      choices: [
        { label: 'Follow her in', fn: () => (close(), startDinner()) },
        { label: 'In a minute', fn: close },
      ],
      onClose: done,
    });
  }
  // a booking: tonight (later than now) or tomorrow
  const tonight = nightOf(clock.minutes);
  const late = clock.hour >= SLOTS[SLOTS.length - 1] - 0.5 || clock.hour < 6;
  const night = late ? tonight + 1 : tonight;
  const slots = SLOTS.filter((h) => late || h > clock.hour + 0.4);
  ui.openDialog({
    name: 'Anouk · ORRERY',
    text: b ? `"We have you down for ${hourText(b.hour)} tonight. Would you like to change it?"` : `"A table for one? ${late ? 'Tomorrow' : 'Tonight'} I have" (she runs a gold pen down the book) "${slots.map(hourText).join(', ')}. Seven courses, ${money(ORRERY_PRICE)}, the wine pairing ${money(PAIRING_PRICE)} more. We ask our guests to dress: ${TIERS[DRESS_TIER].name} or better."`,
    choices: [
      ...slots.map((h) => ({
        label: `${late ? 'Tomorrow' : 'Tonight'} at ${hourText(h)}`,
        fn: () => {
          close();
          state.orrery = { night, hour: h };
          saveNow();
          ui.toast(`Booked: ORRERY, ${late ? 'tomorrow' : 'tonight'} at ${hourText(h)}. Come up in the lift and find Anouk at the door.`);
        },
      })),
      { label: 'Not tonight', fn: close },
    ],
    onClose: done,
  });
}

function startDinner() {
  const sp = crown.tables[0].seats[0];
  dinner = { course: 0, pairing: false, cleared: false };
  sp.crown = true;
  crownFolk.taken.add(sp);
  sitDown(sp);
  player.locked = true;
  ui.openDialog({
    name: 'Theo · ORRERY',
    text: `"Good evening. Tonight's menu is seven courses. Would you like the wine pairing? A glass with each, ${money(PAIRING_PRICE)}."`,
    choices: [
      { label: 'Yes, the pairing', fn: () => ((dinner.pairing = true), ui.closeDialog()) },
      { label: 'Just water, thanks', fn: () => ui.closeDialog() },
    ],
    onClose: () => {
      player.locked = false;
      setTimeout(openDinner, 300);
    },
  });
}

function openDinner() {
  if (!dinner || ui.modal) return;
  if (dinner.cleared) return orreryBill();
  player.locked = true;
  ui.openDecor({
    title: 'ORRERY · SEVEN COURSES',
    sub: () => (dinner.pairing ? 'with the wine pairing' : 'water, still'),
    style: 'orrery',
    rows: () =>
      ORRERY_MENU.map((c, k) => ({
        name: `${k + 1}. ${c.name}`,
        desc: k < dinner.course ? '<i>finished</i>' : k === dinner.course ? `${c.desc}${dinner.pairing ? `<br><em>${c.wine}</em>` : ''}` : '',
        chip: k <= dinner.course ? c.col : 'transparent',
        right: k < dinner.course ? '✓' : k === dinner.course ? 'now' : '',
        acts: k === dinner.course ? [{ id: 'eat', label: k === ORRERY_MENU.length - 1 ? 'Eat it (then the bill)' : 'Eat it', key: 'E', go: true }] : [],
      })),
    empty: '',
    foot: input.isTouch ? 'tap Eat it when you are ready' : 'Enter eat · Esc sit back and look at the view',
    onAct: (row, id) => {
      if (id !== 'eat') return;
      const c = ORRERY_MENU[dinner.course];
      clock.minutes += 15;
      needsLast = clock.minutes;
      needs.give({ hunger: c.hunger, fun: 3, social: 1 });
      if (dinner.pairing) {
        const tonight = nightOf(clock.minutes);
        if (!state.drinks || state.drinks.night !== tonight) state.drinks = { night: tonight, alc: 0, count: 0, at: clock.minutes };
        state.drinks.alc = buzz() + 0.4;
        state.drinks.at = clock.minutes;
      }
      audio.tone(1568, 'sine', 0.02, 0.15);
      dinner.course++;
      if (dinner.course >= ORRERY_MENU.length) {
        dinner.cleared = true;
        ui.closeDecor();
        setTimeout(orreryBill, 500);
        return;
      }
      ui.decorS.sel = dinner.course;
      return `${c.name}: gone. Theo clears the plate and brings the ${ORRERY_MENU[dinner.course].name.toLowerCase()}.`;
    },
    onClose: () => (player.locked = false),
  });
  ui.decorS.sel = dinner.course;
  ui.renderDecor();
}

function orreryBill() {
  const total = ORRERY_PRICE + (dinner.pairing ? PAIRING_PRICE : 0);
  const tip = Math.round(total * 0.15);
  player.locked = true;
  ui.openDialog({
    name: 'ORRERY · the bill',
    text: `Seven courses${dinner.pairing ? ' and the pairing' : ''}: ${money(total)}. Theo brings it in a little brass box, with a chocolate shaped like a planet.`,
    choices: [
      { label: `Pay with a ${money(tip)} tip`, fn: () => payOrrery(total + tip) },
      { label: `Pay ${money(total)}`, fn: () => payOrrery(total) },
    ],
    onClose: () => (player.locked = false),
  });
}

function payOrrery(amt) {
  ui.closeDialog();
  state.bank -= amt;
  state.ledger.push({ t: Math.round(clock.minutes), what: 'ORRERY', amt: -amt });
  state.orreryVisits = (state.orreryVisits ?? 0) + 1;
  state.orrery = null;
  dinner = null;
  audio.coin();
  needs.give({ fun: 14, social: 10 });
  if (state.orreryVisits === 1) state.headline = { t: Math.round(clock.minutes), text: 'SPOTTED: A NEW FACE AT ORRERY, AT THE WINDOW TABLE, ALONE, HAVING THE TIME OF THEIR LIFE' };
  if (seat) standUp();
  saveNow();
  ui.toast(talkRng.pick(['Anouk walks you to the door. "We hope to see you again soon." You think she means it.', 'You float out of ORRERY. The orrery turns. Somewhere below, a taxi honks, very far away.']));
}

// ---------------------------------------------------------------- CORSO MOTORS
function updateMotors(dt) {
  const camD = camera.position.distanceTo(motors.doorCenter);
  const people = motorsFolk.people();
  if (motors.open && !driving) people.push(player.pos);
  motors.update(dt, time, env, { hour: clock.hour, camera, people });
  motorsFolk.update(dt, clock.hour, time, player.pos, camD > 60);
  if (!playing) return;
  if (!place && !driving && (inMotors || motors.onForecourt(player.pos))) motorsFolk.push(player.pos, player.radius);
  const style = inMotors && motors.open ? 'lounge' : null;
  if (style && audio.music?.style !== style) audio.startMusic(style);
  if (!style && inMotors && audio.music?.style === 'lounge') audio.stopMusic();
  // a test drive running out
  if (testDrive && driving === testDrive.car && clock.minutes > testDrive.until && !testDrive.warned) {
    testDrive.warned = true;
    ui.toast('Your phone buzzes: Vic. "Having fun? Bring her back when you\'re ready. No rush. Some rush."');
  }
  // a demo car you've got out of goes back to the showroom once you walk off
  if (testDrive && driving !== testDrive.car) {
    const r = testDrive.car.rec;
    if (Math.hypot(player.pos.x - r.x, player.pos.z - r.z) > 25 || motors.onForecourt(r) || inMotors) endTestDrive();
  }
  // eight o'clock: Vic locks up
  if (inMotors && !motors.open && !ui.modal && !ui.fading) {
    if ((motorsKick += dt) > 6) {
      motorsKick = 0;
      ui.fade(() => {
        if (seat) standUp();
        leaveInterior();
        const sp = motors.outsideSpot;
        player.teleport(outdoor, sp.x, sp.z, sp.yaw);
        Object.assign(rig, { space: outdoor, pitch: 0.28, yaw: sp.yaw, curDist: rig.dist, mode: 'follow', blend: 1 });
        ui.toast('Vic: "We\'re closing up, my friend. Nine tomorrow. The Rift will still be here. Probably."');
      }, 'CLOSING TIME');
    }
  } else motorsKick = 0;
}

const carValue = (rec) => {
  const m = CAR[rec.id];
  // classics hold their value; everything else loses a third the day it leaves the forecourt
  return Math.round(m.price * (rec.id === 'spider' ? 1.05 : 0.65));
};
const ownedCars = () => garage.list.filter((c) => !c.rec.demo);

function motorsFind() {
  const p = player.pos;
  const near = (q, r) => Math.hypot(q.x - p.x, q.z - p.z) < r;
  if (seat?.motors) return { label: 'Stand up', act: standUp };
  if (motors.onForecourt(p)) {
    for (const b of motors.usedBays) if (near(b, 2.6)) return { label: 'Approved used: CORSO Pip, $8,900', act: () => openCarPanel('pip') };
    return null;
  }
  if (!inMotors) return null;
  const v = motorsFolk.vic;
  if (v.c.visible && (near(v.c, 2.0) || near(motors.deskSpot, 1.2))) return { label: 'Talk to Vic (sales)', act: vicTalk };
  if (near(motors.espresso, 1.2)) return { label: 'Make yourself an espresso', act: espresso };
  if (near(motors.brochures, 1.5)) return { label: 'Flick through the brochures', act: brochures };
  const n = motorsFolk.nico;
  if (n.c.visible && near(n.c, 1.4)) return { label: 'Talk to Nico', act: nicoTalk };
  const sp = motors.seats.find((q) => near(q, 0.8));
  if (sp) return { label: 'Sit down', act: () => sitDown({ ...sp, motors: true }) };
  for (const d of motors.displays) if (near(d.card, 1.0) || d.looks.some((q) => near(q, 0.9))) return { label: `Look at the ${d.m.make} ${d.m.name}`, act: () => openCarPanel(d.id) };
  if (near(motors.turnLook, 1.6)) return { label: 'Look at the VANTOR Rift', act: () => openCarPanel('rift') };
  return null;
}

function espresso() {
  const h = Math.floor(clock.minutes / 60);
  if (state.espressoHour === h) return ui.toast('Another one and you\'ll be able to hear colours. Give it an hour.');
  state.espressoHour = h;
  audio.tone(180, 'sawtooth', 0.03, 0.9, audio.master, 120);
  needs.give({ energy: 10, fun: 1 });
  ui.toast(talkRng.pick(['The machine hisses like a V12. A perfect little espresso, on the house.', 'A ristretto in a tiny red cup. You feel faster already.', 'Cortado. The biscotti jar is empty. Of course it is.']));
}

function brochures() {
  needs.add('fun', 3);
  ui.toast(talkRng.pick([
    'The Kestrel brochure is mostly photos of it on mountain roads at dawn. You have never wanted anything more.',
    "'The HALVARD Monarch: arrive.' That's the whole page. Underneath, very small: from $145,000.",
    "A glossy fold-out of the Rift. The options list runs to four pages. The carbon wheels are an option. So is the colour.",
    "The Pip's brochure has a coupon for a free tank of fuel. It expired in 2019.",
  ]));
}

function nicoTalk() {
  player.locked = true;
  needs.chat('motors:nico', clock.minutes, 4);
  ui.openDialog({
    name: 'Nico · detailing',
    text: talkRng.pick([
      "Don't touch the Kestrel. I've polished it four times today and a kid licked it.",
      'Every car in here gets wiped down every hour. Fingerprints. People cannot help themselves.',
      "The Spider's my favourite. No computers, no beeps. Just a car. Vic says I'm a romantic.",
      "You know the Rift's paint has gold flake in it? Real gold. Don't tell anyone, they'll lick it.",
    ]),
    choices: [{ label: 'Bye', fn: () => ui.closeDialog() }],
    onClose: () => (player.locked = false),
  });
}

function vicTalk() {
  const v = motorsFolk.vic;
  if (!motors.open) return ui.toast("The showroom's closed. Nine to eight.");
  player.locked = true;
  v.talking = true;
  needs.chat('motors:vic', clock.minutes, 5);
  const st = statusOf(state.appearance, state.home);
  const mine = ownedCars();
  const greet = mine.some((c) => c.rec.id === 'rift')
    ? 'My favourite customer! How is she? Have you had her over two hundred yet? Don\'t tell me. Tell me.'
    : mine.length
      ? `Back again! How's the ${CAR[mine[mine.length - 1].rec.id].name} treating you?`
      : st.tier >= 5
        ? 'Welcome, welcome. Can I get you an espresso? Something sparkling? You have the look of somebody who knows what they want.'
        : talkRng.pick(["Hi there! Vic. Have a look around, no pressure. Well. A little pressure.", "Welcome to CORSO. Everything you see is for sale, including the coffee machine if the price is right.", 'Afternoon! Just browsing? Everyone says that. Then they meet the Kestrel.']);
  const done = () => {
    v.talking = false;
    player.locked = false;
  };
  const choices = [
    { label: 'Show me the cars', fn: () => (ui.closeDialog(), openCarPanel()) },
    ...(mine.length ? [{ label: `Sell a car back to Vic`, fn: () => (ui.closeDialog(), openTradeIn()) }] : []),
    { label: 'Just looking', fn: () => ui.closeDialog() },
  ];
  ui.openDialog({ name: 'Vic · CORSO MOTORS', text: greet, choices, onClose: done });
}

/** The cars, prices and stats; buy (pick a colour) or take a test drive. */
function openCarPanel(focus = null) {
  if (ui.modal) return;
  player.locked = true;
  const owned = (id) => ownedCars().filter((c) => c.rec.id === id).length;
  const rows = () =>
    CARS.map((m) => ({
      id: m.id,
      name: `${m.make} ${m.name}`,
      desc: m.desc,
      chip: motors.paint[m.id],
      tags: [`<em>${kmh(m.top)} km/h</em>`, `<em>0-100 ${(27.8 / m.accel).toFixed(1)}s</em>`, ...(owned(m.id) ? [`<em>yours ×${owned(m.id)}</em>`] : [])],
      right: money(m.price),
      rightSub: m.id === 'pip' ? 'used · from your bank' : 'from your bank',
      acts: [
        { id: 'buy', label: 'Choose a colour', key: 'E', go: true },
        { id: 'test', label: 'Test drive', key: 'X' },
      ],
    }));
  ui.openDecor({
    title: 'CORSO MOTORS · NEW & APPROVED USED',
    sub: () => `bank ${money(state.bank)}`,
    style: 'motors',
    rows,
    empty: '',
    foot: input.isTouch ? 'tap a car, then a button' : '↑↓ pick · Enter choose a colour · X test drive · Esc done',
    onAct: (row, id) => {
      if (id === 'test') {
        const why = testDriveCheck(row.id);
        if (why) return why;
        ui.closeDecor();
        startTestDrive(row.id);
        return;
      }
      if (id === 'buy') {
        ui.closeDecor();
        openPaintPanel(row.id);
      }
    },
    onClose: () => (player.locked = false),
  });
  if (focus) ui.decorS.sel = Math.max(0, CARS.findIndex((m) => m.id === focus));
  ui.renderDecor();
}

const PAINT_NAMES = { '#c43a2a': 'Corsa red', '#e8e4dc': 'Chalk', '#3a6a9a': 'Harbour blue', '#e8b818': 'Giallo', '#5a8a4a': 'Park green', '#2a2a2e': 'Graphite', '#c8c8cc': 'Silver', '#1a2a5a': 'Navy', '#7a1a1a': 'Oxblood', '#e8e6e0': 'White', '#1a3a6a': 'Kestrel blue', '#d8b46a': 'Champagne', '#e8dcc0': 'Cream', '#3a5a3a': 'Racing green', '#5ac8d8': 'Riviera', '#141418': 'Black', '#3a2a1a': 'Mocha', '#2a3a2a': 'Forest', '#ff6a2a': 'Arancio', '#5aff8a': 'Verde acido' };

function openPaintPanel(id) {
  const m = CAR[id];
  player.locked = true;
  const start = motors.paint[id];
  const rows = () => {
    const sel = ui.decorS?.sel ?? 0;
    const paint = m.paints[sel] ?? m.paints[0];
    motors.repaint(id, paint); // the car on the floor changes colour as you choose
    return m.paints.map((p) => ({ paint: p, name: PAINT_NAMES[p] ?? p, desc: `${m.make} ${m.name} in ${(PAINT_NAMES[p] ?? 'this colour').toLowerCase()}. Delivered to the bay out front, keys in it.`, chip: p, right: money(m.price), rightSub: 'from your bank', acts: [{ id: 'buy', label: 'Buy it', key: 'E', go: true }] }));
  };
  ui.openDecor({
    title: `${m.make} ${m.name.toUpperCase()} · PICK A COLOUR`,
    sub: () => `bank ${money(state.bank)}`,
    style: 'motors',
    rows,
    empty: '',
    foot: input.isTouch ? 'tap a colour, then Buy it' : '↑↓ colour · Enter buy · Esc back',
    onAct: (row) => {
      if (!motors.open) return "The showroom's closed. Vic's back at nine.";
      if (state.bank < m.price) return `<span class="no">Your bank has ${money(state.bank)}. Vic does finance, but not for you. Not yet.</span>`;
      buyCar(id, row.paint);
      ui.closeDecor();
    },
    onClose: () => {
      motors.paint[id] = motors.paint[id] ?? start;
      motors.repaint(id, motors.paint[id]);
      player.locked = false;
    },
  });
  ui.decorS.sel = Math.max(0, m.paints.indexOf(start));
  ui.renderDecor();
}

function buyCar(id, paint) {
  const m = CAR[id];
  state.bank -= m.price;
  state.ledger.push({ t: Math.round(clock.minutes), what: `CORSO MOTORS · ${m.make} ${m.name}`, amt: -m.price });
  const bay = motors.freeBay(garage.list);
  garage.add(id, paint, bay.x, bay.z, bay.yaw);
  motors.paint[id] = paint;
  audio.coin();
  for (let j = 0; j < 3; j++) setTimeout(() => audio.tone(784 + j * 196, 'triangle', 0.05, 0.3), j * 140);
  needs.give({ fun: 14, social: 4 });
  if (id === 'rift' || id === 'monarch') state.headline = { t: Math.round(clock.minutes), text: id === 'rift' ? 'LOCAL BUYER DRIVES A VANTOR RIFT OFF THE CORSO FORECOURT, CROWD FILMS' : 'HALVARD MONARCH DELIVERED IN KILN HEIGHTS: "I WILL BE DRIVEN," SAYS OWNER' };
  updateCarStatus();
  saveNow();
  ui.toast(`${m.make} ${m.name}: yours. Vic shakes your hand for a long time. It's in the delivery bay out front, keys in it.`);
  if (!state.seen.firstCar) {
    state.seen.firstCar = true;
    setTimeout(() => ui.hint('Walk up to your car and press <b>E</b> to get in. Park it anywhere; it stays there, and it\'s on the map (<b>M</b>).', 10), 2500);
  }
}

function openTradeIn() {
  player.locked = true;
  ui.openDecor({
    title: 'CORSO MOTORS · VIC BUYS',
    sub: () => `bank ${money(state.bank)}`,
    style: 'motors',
    rows: () =>
      ownedCars().map((c) => ({
        car: c,
        name: `${c.m.make} ${c.m.name}`,
        desc: c.rec.id === 'spider' ? "\"A '68 Spider? I'll pay over the odds. Don't tell Nico.\"" : '"Forty per cent? It\'s a car, not a painting. Thirty-five. Final offer."',
        chip: c.rec.paint,
        right: money(carValue(c.rec)),
        rightSub: 'to your bank',
        acts: [{ id: 'sell', label: 'Sell it', key: 'X' }],
      })),
    empty: "You don't have a car to sell.",
    foot: input.isTouch ? 'tap a car, then Sell it' : '↑↓ pick · X sell · Esc done',
    onAct: (row) => {
      const c = row.car;
      if (driving === c) return 'Get out of it first.';
      const v = carValue(c.rec);
      garage.remove(c);
      state.bank += v;
      state.ledger.push({ t: Math.round(clock.minutes), what: `CORSO MOTORS · bought your ${c.m.name}`, amt: v });
      audio.coin();
      updateCarStatus();
      saveNow();
      return `Sold. ${money(v)} to your bank. Nico drives it round the back.`;
    },
    onClose: () => (player.locked = false),
  });
}

/** Why Vic won't hand you the keys (or null). */
function testDriveCheck(id) {
  const m = CAR[id];
  if (!motors.open) return "Test drives are while the showroom's open, nine to eight.";
  if (!motorsFolk.vic.c.visible) return 'Vic is the one with the keys. Find Vic.';
  if (testDrive) return "You've already got one of Vic's cars out.";
  if (buzz() >= 1) return "Vic sniffs. \"Have you been drinking? No. Come back tomorrow.\"";
  if (state.testDay === Math.floor(clock.minutes / 1440) && state.testCount >= 2) return '"Two test drives a day, my friend. Insurance."';
  const st = statusOf(state.appearance, state.home);
  if (m.price > 60000 && st.tier < 5 && state.bank < m.price / 2) return `<span class="no">Vic looks at your shoes. "The ${m.name}'s test drives are by appointment. Let me check the book. Oh no, it's full."</span>`;
  return null;
}

let testDrive = null; // { car, until, warned }
function startTestDrive(id) {
  const m = CAR[id];
  const d = Math.floor(clock.minutes / 1440);
  if (state.testDay !== d) state.testCount = 0;
  state.testDay = d;
  state.testCount = (state.testCount ?? 0) + 1;
  ui.fade(() => {
    leaveInterior();
    const bay = motors.freeBay(garage.list);
    const car = garage.add(id, motors.paint[id], bay.x, bay.z, bay.yaw);
    car.rec.demo = true;
    testDrive = { car, until: clock.minutes + 30, warned: false };
    player.teleport(outdoor, bay.x - 1.6, bay.z, bay.yaw);
    rig.space = outdoor;
    rig.dist = outdoorDist;
    enterCar(car);
    ui.toast(`Vic drops the keys in your hand. "Thirty minutes. Bring her back with the same number of wheels."`);
  }, 'TEST DRIVE');
}

function endTestDrive() {
  const car = testDrive.car;
  testDrive = null;
  if (garage.list.includes(car)) garage.remove(car);
  needs.give({ fun: 8 });
  ui.toast(talkRng.pick(['Nico jogs over and takes the keys back. "Well? You want it. I can tell."', 'The demo car goes back to CORSO. You can still smell it.']));
}

/** Your best car adds to your status (people notice what you pull up in). */
function updateCarStatus() {
  const best = ownedCars().reduce((b, c) => Math.max(b, c.m.status), 0);
  extraStatus.car = Math.round(best * 0.6);
}

// ---------------------------------------------------------------- driving
function enterCar(car) {
  if (onClock()) return ui.toast("You're on the clock. Clock out first.");
  if (buzz() >= 1) return ui.toast(talkRng.pick(["You've had a drink. The car stays here tonight: walk, or get a cab.", 'Keys in hand, you think better of it. Not after drinking.']));
  if (seat) standUp();
  driving = car;
  garage.enter(car);
  player.locked = true;
  player.speed = 0;
  rig.setMode('drive');
  rig.yaw = car.rec.yaw;
  rig.pitch = 0.2;
  document.body.classList.add('driving');
  audio.tone(160, 'square', 0.05, 0.07);
  setTimeout(() => audio.tone(120, 'square', 0.05, 0.1), 90);
  const st = STATIONS[garage.station];
  if (st.style) setTimeout(() => driving === car && audio.startMusic(st.style), 600);
  if (!state.seen.drive) {
    state.seen.drive = true;
    ui.hint(input.isTouch ? 'Steer with the stick (up to go, down to brake and reverse). <b>BRAKE</b> is the handbrake, <b>RADIO</b> changes station. Stop, then <b>USE</b> to get out.' : '<b>W/S</b> or ↑↓ to go and brake (and reverse), <b>A/D</b> to steer, <b>Space</b> handbrake, <b>R</b> radio, <b>H</b> horn. Stop, then <b>E</b> to get out.', 11);
  }
}

function exitCar(quiet = false) {
  const car = driving;
  if (!car) return;
  const spot = garage.exit();
  driving = null;
  player.teleport(outdoor, spot.x, spot.z, spot.yaw);
  player.char.sit = false;
  player.locked = false;
  rig.setMode('follow');
  rig.pitch = 0.28;
  document.body.classList.remove('driving');
  ui.setCar(null);
  if (STATIONS[garage.station].style) audio.stopMusic();
  if (!quiet) {
    audio.tone(200, 'square', 0.05, 0.08);
    saveNow();
  }
}

function updateDriving(dt, free) {
  const car = driving;
  const mv = free ? input.move() : { x: 0, y: 0 };
  const before = { x: car.rec.x, z: car.rec.z };
  garage.drive(dt, { thr: mv.y, steer: -mv.x, hand: free && input.down('Space') });
  const moved = Math.hypot(car.rec.x - before.x, car.rec.z - before.z);
  state.driven += moved / 1000;
  // a good drive is fun; a fast one more so
  if (Math.abs(car.speed) > 3) needs.add('fun', dt * (0.05 + Math.abs(car.speed) / car.m.top * 0.12));
  const s = garage.seat(car);
  player.pos.set(s.x, s.y, s.z);
  player.yaw = car.rec.yaw;
  player.speed = 0;
  const c = player.char;
  c.x = s.x;
  c.z = s.z;
  c.yaw = car.rec.yaw;
  c.sit = true;
  c.ground = s.y;
  c.y = s.y + s.h - 0.86 * state.appearance.height;
  c.amount = 0;
  c.run = 0;
  Object.assign(carCam, { x: car.rec.x, y: car.y, z: car.rec.z, yaw: car.rec.yaw, speed: car.speed, len: car.m.L });
  const st = STATIONS[garage.station];
  const left = testDrive?.car === car ? Math.max(0, Math.ceil(testDrive.until - clock.minutes)) : null;
  ui.setCar({ kmh: kmh(car.speed), name: left !== null ? `TEST DRIVE · ${left} MIN LEFT` : `${car.m.make} ${car.m.name}`, radio: `♪ ${st.name}` });
}

function frame(now) {
  // the first frame's timestamp can be older than `last`: never let time run backwards
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  time += dt;

  const free = playing && !ui.modal && !ui.fading;
  input.enabled = free;
  if (free) handleKeys();
  if (!inUnder) clock.update(dt, free && input.keys.has('KeyT') && !onClock());
  if (playing) payRent();

  if (driving) updateDriving(dt, free);
  else
    player.update(dt, input, rig.yaw, (p, r) => {
      traffic.push(p, r);
      peds.push(p, r);
      garage.push(p, r);
    });
  garage.update(dt, env.night);
  if (!driving) job.push(player.pos, player.radius);
  if (inGalleria && !player.locked) {
    const flow = galleria.escalatorFlow(player.pos);
    if (flow) {
      player.pos.x += flow.dx * dt;
      player.pos.z += flow.dz * dt;
    }
  }
  // walking into the shop: tighter camera, shop music, shop lighting
  if (!place && !inUnder && !driving) {
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
    const nowInX = exchange.contains(player.pos, -0.05);
    if (nowInX !== inExchange) {
      inExchange = nowInX;
      player.space = rig.space = nowInX ? exchSpace : outdoor;
      if (nowInX) {
        outdoorDist = rig.dist;
        rig.dist = 4.6;
        if (playing) ui.showLocation('HALCYON EXCHANGE', !exchange.open ? 'closed · opens 8 am' : market.isOpen() ? 'the market is open' : 'the ticker bar is open');
        if (playing && !state.seen.exchange) {
          state.seen.exchange = true;
          setTimeout(() => ui.hint('Use any free <b>terminal</b> on the floor to buy and sell shares (9:30 to 4, weekdays). The <b>Ticker Bar</b> is on the left, the <b>property desk</b> on the right. Brokers talk, especially after a drink.', 11), 1500);
        }
      } else {
        rig.dist = outdoorDist;
        district = '';
      }
    }
    const nowInO = crown.inPavilion(player.pos);
    if (nowInO !== inOrrery) {
      inOrrery = nowInO;
      player.space = rig.space = nowInO ? orrerySpace : outdoor;
      if (nowInO) {
        outdoorDist = rig.dist;
        rig.dist = 3.6;
        if (playing) ui.showLocation('ORRERY', orreryOpen(clock.hour) ? 'dinner is served' : 'dinner from 7 PM');
      } else rig.dist = outdoorDist;
    }
    const nowInC = motors.contains(player.pos, -0.05);
    if (nowInC !== inMotors) {
      inMotors = nowInC;
      player.space = rig.space = nowInC ? motorsSpace : outdoor;
      if (nowInC) {
        outdoorDist = rig.dist;
        rig.dist = 4.8;
        if (playing) ui.showLocation('CORSO MOTORS', motors.open ? 'new & approved used' : 'closed · opens 9 am');
        if (playing && motors.open && !state.seen.motors) {
          state.seen.motors = true;
          setTimeout(() => ui.hint('Look at any car (or talk to <b>Vic</b> at the desk) to see prices, pick a colour or take a <b>test drive</b>. Cars are paid for from your bank.', 10), 1500);
        }
      } else {
        rig.dist = outdoorDist;
        district = '';
      }
    }
    const nowInM = galleria.contains(player.pos, -0.05);
    if (nowInM !== inGalleria) {
      inGalleria = nowInM;
      player.space = rig.space = nowInM ? mallSpace : outdoor;
      if (nowInM) {
        outdoorDist = rig.dist;
        rig.dist = 4.2;
        if (playing) ui.showLocation('HALCYON GALLERIA', galleria.open ? 'shop. dream. repeat.' : 'closed · opens 10 am');
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
  if (!place && (inGalleria || galleria.onPlaza(player.pos))) shoppers.push(player.pos, player.radius);
  updateClub(dt);
  updateGullys(dt);
  updateGalleria(dt);
  updateExchange(dt);
  updateMotors(dt);
  updateCrown(dt);
  helpMorning();
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
  env.indoor = place || inUnder ? 1 : inStore || inGullys || inOrrery ? 0.6 : inClub ? 0.9 : 0;
  if (inClub) env.magic *= 0.25;
  env.update(clock.hour, time, player.pos);
  city.update(dt);
  city.updateLampLights(
    playing ? player.pos : camera.position,
    env.night,
    place ? { list: place.fixtures, on: apts.lampOn } : inUnder ? { list: under.fixtures, on: 1 } : inStore ? { list: store.fixtures, on: 1 } : inClub ? { list: club.fixtures, on: 1 } : inGullys ? { list: gullys.fixtures, on: 1 } : inGalleria ? { list: galleria.fixtures, on: 1 } : aloft && club.status === 'open' ? { list: club.roofFixtures, on: 1 } : onCrown ? { list: crown.fixtures, on: 1 } : null,
  );
  store.update(dt, time, env, job.people(player.pos), camera);
  apts.update(dt, time, env, place);
  if (decor.carry) decor.updateCarry(player, dt);
  decor.update(dt, time, place);
  document.body.classList.toggle('at-home', playing && atHome() && !ui.modal);
  document.body.classList.toggle('carrying', !!decor.carry);
  lantern.update(dt, time, env.night);
  effects.update(time, env);
  sky.update(camera, time);
  crowd.update();

  if (playing) {
    current = ui.modal ? null : findInteraction();
    ui.setPrompt(current?.label ?? null, current?.key);
    ui.setClock(clock.format(), clock.day);
    ui.setMoney(state.cash, state.bank);
    updateStatus();
    updateWorth(dt);
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
  audio.update({ night: env.night, magic: env.magic, green, time, indoor: place || inUnder ? 1 : inStore || inGullys ? 0.5 : inGalleria || inExchange || inMotors || inOrrery ? 0.6 : inClub ? 0.85 : 0, store: inStore ? 1 : 0, kitchen: inGullys && gullys.open ? 1 : 0 });

  // the shop's security cameras (only when you're close enough to see a monitor)
  if (!place && cctvTick++ % 4 === 0 && camera.position.distanceTo(store.doorCenter) < 30) store.renderCCTV(renderer, scene);
  pipeline.render(scene, camera, time);
  input.endFrame();
  requestAnimationFrame(frame);
}

player.onStep = (run) => playing && audio.step(run);
updateCarStatus();
updateHelpStatus();
if (state.phone) {
  extraStatus.phone = PHONES[state.phone].status;
  document.body.classList.add('has-phone');
}
document.getElementById('phone-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (playing) openPhone();
});
requestAnimationFrame(frame);

// handy for debugging from the console
window.game = {
  resale,
  soleSwap,
  property,
  exchange,
  brokers,
  get inExchange() {
    return inExchange;
  },
  market,
  openTerminal,
  netWorth,
  motors,
  motorsFolk,
  openPhone,
  phoneShop,
  cabMenu,
  agencyMenu,
  roadSpotNear,
  crown,
  crownFolk,
  crownLift,
  orreryHost,
  startDinner,
  get dinner() {
    return dinner;
  },
  get onCrown() {
    return onCrown;
  },
  openCarPanel,
  buyCar,
  startTestDrive,
  get testDrive() {
    return testDrive;
  },
  get inMotors() {
    return inMotors;
  },
  garage,
  enterCar,
  exitCar,
  get driving() {
    return driving;
  },
  decor,
  homeLife,
  startCarry,
  dropCarry,
  openDecorPanel,
  extraStatus,
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
  galleria,
  shoppers,
  shopping,
  get inGalleria() {
    return inGalleria;
  },
  visit,
  needs,
  barJob,
  crew,
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
