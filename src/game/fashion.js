// Clothes you can own, the brands that make them, and what they say about you.
// Everything here is plain data. A character's appearance (actors/appearance.js)
// carries `wear`: one item id per slot. dress() turns that into the colours and
// shapes the renderer draws, so shops, the wardrobe and NPCs all share one model.
// All brands are made up.

export const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'hat', 'glasses', 'chain', 'watch'];
export const SLOT_NAMES = { top: 'Top', outer: 'Jacket / coat', bottom: 'Bottoms', shoes: 'Shoes', hat: 'Hat', glasses: 'Glasses', chain: 'Chain', watch: 'Watch' };

export const BRANDS = {
  basic: { name: 'Basics', color: '#9fb0d0' },
  thrift: { name: 'RACK & RUIN', color: '#e0a53a', bag: '#c8b48a' },
  splitgrain: { name: 'SPLITGRAIN', color: '#ff5a3a', bag: '#1c1c20' },
  vellard: { name: 'MAISON VELLARD', color: '#d8b46a', bag: '#f2ece0' },
};

// chest/back prints: tiles in the print atlas (render/fashionTextures.js)
export const PRINT = {
  gullys: 0, band: 1, run5k: 2, iheart: 3, sgBox: 4, sgSplit: 5, sgSmall: 6, sgBack: 7,
  vvSmall: 8, vvBack: 9, substation: 10, okayest: 11, sgOrange: 12, rack: 13,
};

const T = (id, brand, name, slot, price, status, look, desc, extra = {}) => ({ id, brand, name, slot, price, status, look, desc, ...extra });

// look: fields merged into the appearance when worn. Tops set topStyle 0 (tee),
// 1 (long sleeve) or hood; outers set topStyle 2 (jacket) or 3 (long coat).
export const ITEMS = [
  // ---------------------------------------------------------------- basics (free, always yours)
  T('basic:tee', 'basic', 'Plain tee', 'top', 0, 0, { topStyle: 0 }, 'A T-shirt. Any colour.', { basic: true }),
  T('basic:long', 'basic', 'Plain long sleeve', 'top', 0, 0, { topStyle: 1 }, 'Long sleeves. Any colour.', { basic: true }),
  T('basic:jacket', 'basic', 'Plain jacket', 'outer', 0, 1, { topStyle: 2 }, 'A zip jacket. Any colour.', { basic: true }),
  T('basic:pants', 'basic', 'Plain trousers', 'bottom', 0, 0, { bottomStyle: 0 }, 'Trousers. Any colour.', { basic: true }),
  T('basic:shorts', 'basic', 'Plain shorts', 'bottom', 0, 0, { bottomStyle: 1 }, 'Shorts. Any colour.', { basic: true }),
  T('basic:shoes', 'basic', 'Plain shoes', 'shoes', 0, 0, {}, 'Shoes. Any colour.', { basic: true }),

  // ---------------------------------------------------------------- RACK & RUIN (thrift; the stock changes daily)
  T('rr:gullys', 'thrift', "Faded GULLY'S tee", 'top', 6, 1, { topStyle: 0, top: '#e8dcc0', print: PRINT.gullys }, 'A staff tee from about 1996. Soft as a cloud, smells faintly of fryer.'),
  T('rr:band', 'thrift', "THE GULLS '98 tour tee", 'top', 9, 2, { topStyle: 0, top: '#1e1e22', print: PRINT.band }, 'A local band that played the pier one summer. Cracked print. Very cool.'),
  T('rr:5k', 'thrift', 'Harbour 5K 2001 tee', 'top', 3, 1, { topStyle: 0, top: '#5ac8d8', print: PRINT.run5k }, 'Someone ran five kilometres in 2001. Now you can say you did.'),
  T('rr:iheart', 'thrift', 'I ♥ PORT HALCYON tee', 'top', 5, 1, { topStyle: 0, top: '#f4f2ec', print: PRINT.iheart }, 'Tourist classic. Ironic or sincere: your call.'),
  T('rr:okayest', 'thrift', "WORLD'S OKAYEST tee", 'top', 4, 1, { topStyle: 0, top: '#4c7a3a', print: PRINT.okayest }, 'A gift someone gave back.'),
  T('rr:wool', 'thrift', 'Itchy wool sweater', 'top', 8, 1, { topStyle: 1, top: '#7a6a55' }, 'Hand-knitted, itchy, warm. Grandma energy.'),
  T('rr:cord', 'thrift', 'Corduroy jacket', 'outer', 18, 3, { topStyle: 2, jacket: '#8a5a2a' }, 'Brown cord, elbow patches worn shiny.'),
  T('rr:denim', 'thrift', 'Denim jacket', 'outer', 15, 3, { topStyle: 2, jacket: '#3a5a8a' }, 'Broken in by someone else. Perfect.'),
  T('rr:tweed', 'thrift', "Grandpa's tweed overcoat", 'outer', 28, 4, { topStyle: 3, jacket: '#6a5a45' }, 'Heavy, long, a mint in the pocket from 1983.'),
  T('rr:flares', 'thrift', 'Flared jeans', 'bottom', 7, 1, { bottomStyle: 0, bottom: '#4a6a9a' }, 'Wide at the ankle. Bold.'),
  T('rr:jorts', 'thrift', 'Jorts', 'bottom', 4, 0, { bottomStyle: 1, bottom: '#5a7aa8' }, 'Jeans that lost a fight with scissors.'),
  T('rr:bowling', 'thrift', 'Bowling shoes', 'shoes', 9, 2, { shoes: '#8a2a2a', sole: '#e8e4dc' }, 'Size 9. Probably. Two-tone.'),
  T('rr:trucker', 'thrift', 'Trucker cap', 'hat', 4, 1, { hat: 1, hatColor: '#c4483a' }, 'Mesh back, faded front.'),
  T('rr:beanie', 'thrift', 'Hand-knit beanie', 'hat', 3, 1, { hat: 2, hatColor: '#d77aa0' }, 'Pink. Lumpy. Lovely.'),
  T('rr:aviators', 'thrift', 'Scratched aviators', 'glasses', 6, 2, { glasses: 1, glassesColor: '#c8a050' }, 'One lens is a bit loose.'),
  // the gems: they turn up now and then, and someone always gets there first
  T('rr:vvjacket', 'thrift', 'Vintage VELLARD jacket (1994)', 'outer', 40, 18, { topStyle: 2, jacket: '#1a1a1e', printBack: PRINT.vvBack }, "Real. Dot didn't check the label. Don't tell her.", { gem: true }),
  T('rr:sghoodie', 'thrift', 'SPLITGRAIN sample hoodie', 'top', 12, 7, { topStyle: 1, hood: true, top: '#9aa0a8', print: PRINT.sgSmall }, 'A pre-release sample with a misprinted tag. Collectors want these.', { gem: true }),

  // ---------------------------------------------------------------- SPLITGRAIN (streetwear)
  T('sg:box', 'splitgrain', 'Box Logo Tee', 'top', 38, 4, { topStyle: 0, top: '#f4f2ec', print: PRINT.sgBox }, 'The one everyone knows. Heavy cotton.'),
  T('sg:split', 'splitgrain', 'Split Tee (black)', 'top', 38, 4, { topStyle: 0, top: '#1c1c20', print: PRINT.sgSplit }, 'The split logo, cracked down the middle on purpose.'),
  T('sg:hoodie', 'splitgrain', 'Heavyweight Hoodie (slate)', 'top', 95, 8, { topStyle: 1, hood: true, top: '#3a4450', print: PRINT.sgSmall }, '500 gsm. You could survive a winter in it.'),
  T('sg:hoodieo', 'splitgrain', 'Heavyweight Hoodie (signal orange)', 'top', 95, 8, { topStyle: 1, hood: true, top: '#ff6a2a', print: PRINT.sgOrange }, 'You will be seen from space.'),
  T('sg:bomber', 'splitgrain', 'Flight Bomber', 'outer', 165, 10, { topStyle: 2, jacket: '#4a5a3a', printBack: PRINT.sgBack }, 'Olive nylon, orange lining, the big logo on the back.'),
  T('sg:bomberb', 'splitgrain', 'Flight Bomber (black)', 'outer', 165, 10, { topStyle: 2, jacket: '#1c1c20', printBack: PRINT.sgBack }, 'Black on black on orange.'),
  T('sg:cargo', 'splitgrain', 'Cargo Pants', 'bottom', 72, 5, { bottomStyle: 0, bottom: '#5a5a48' }, 'Eight pockets. You will use two.'),
  T('sg:cargob', 'splitgrain', 'Cargo Pants (black)', 'bottom', 72, 5, { bottomStyle: 0, bottom: '#1c1c20' }, 'Eight pockets, all black.'),
  T('sg:cap', 'splitgrain', '6-Panel Cap', 'hat', 32, 4, { hat: 1, hatColor: '#1c1c20' }, 'Flat brim, stiff crown, a tiny SG on the side.'),
  T('sg:beanie', 'splitgrain', 'Watch Beanie', 'hat', 28, 3, { hat: 2, hatColor: '#ff6a2a' }, 'Ribbed, cuffed, orange.'),
  T('sg:core', 'splitgrain', 'Grain Runner (core white)', 'shoes', 130, 7, { shoes: '#f4f2ec', sole: '#c8a070' }, 'White uppers on a gum sole. Keep them clean.'),
  T('sg:volt', 'splitgrain', 'Grain Runner (volt)', 'shoes', 150, 9, { shoes: '#c8e83a', sole: '#1c1c20' }, 'Neon green. Not subtle.'),
  T('sg:shades', 'splitgrain', 'Shield Shades', 'glasses', 45, 4, { glasses: 2, glassesColor: '#1c1c20' }, 'One wraparound lens. Fast-looking even standing still.'),
  T('sg:chain', 'splitgrain', 'Steel Link Chain', 'chain', 60, 5, { chain: 2 }, 'Stainless, chunky, cold on the neck.'),
  // the Saturday drop
  T('sg:gr9', 'splitgrain', "Grain Runner 9 'Harbour'", 'shoes', 220, 18, { shoes: '#17a2a8', sole: '#ff8a2a' }, 'Teal and harbour orange. Twelve pairs in the whole city.', { drop: true }),

  // ---------------------------------------------------------------- MAISON VELLARD (luxury)
  T('mv:shirt', 'vellard', 'Silk Shirt', 'top', 680, 14, { topStyle: 1, top: '#efe6d2', print: PRINT.vvSmall }, 'Heavy silk, mother-of-pearl buttons, the monogram on the pocket.'),
  T('mv:knit', 'vellard', 'Cashmere Knit', 'top', 950, 15, { topStyle: 1, top: '#26262c' }, 'So soft it feels like a rumour.'),
  T('mv:monogram', 'vellard', 'Monogram Jacket', 'outer', 2400, 28, { topStyle: 2, jacket: '#3a2a1a', printBack: PRINT.vvBack }, 'Brown leather, the gold VV across the back. People will ask.'),
  T('mv:coat', 'vellard', 'Cashmere Overcoat (camel)', 'outer', 3900, 32, { topStyle: 3, jacket: '#c9a878' }, 'Floor-skimming camel cashmere. You will walk differently in it.'),
  T('mv:coatn', 'vellard', 'Cashmere Overcoat (midnight)', 'outer', 3900, 32, { topStyle: 3, jacket: '#1a2030' }, 'Midnight blue. For entrances.'),
  T('mv:trousers', 'vellard', 'Tailored Trousers', 'bottom', 890, 12, { bottomStyle: 0, bottom: '#22283a' }, 'A crease you could cut bread with.'),
  T('mv:loafers', 'vellard', 'Horsebit Loafers', 'shoes', 1100, 16, { shoes: '#3a2416', sole: '#141414' }, 'Polished oxblood leather and a gold bit.'),
  T('mv:court', 'vellard', 'Court Sneakers', 'shoes', 890, 14, { shoes: '#f4f2ec', sole: '#d8b46a' }, 'White leather on a gold-tinted sole. Quiet money.'),
  T('mv:cap', 'vellard', 'Monogram Cap', 'hat', 520, 9, { hat: 1, hatColor: '#3a2a1a' }, 'A baseball cap that costs as much as a used car payment.'),
  T('mv:riviera', 'vellard', 'Riviera Sunglasses', 'glasses', 480, 10, { glasses: 1, glassesColor: '#d8b46a' }, 'Gold frames, gradient lenses.'),
  T('mv:cuban', 'vellard', 'Cuban Link Chain (18k)', 'chain', 2800, 22, { chain: 1 }, 'Solid gold. It catches every light in the room.'),
  T('mv:meridian', 'vellard', 'Meridian Chronograph', 'watch', 14500, 40, { watch: 1 }, 'Gold case, three dials, a movement you can hear if the room is quiet.'),
  T('mv:noir', 'vellard', 'Meridian Noir', 'watch', 48000, 70, { watch: 3 }, 'Black ceramic and rose gold. One in the window, and it is the one.'),
];
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
export const itemsFor = (slot, owned) => ITEMS.filter((it) => it.slot === slot && (it.basic || owned.includes(it.id)));

/** The default outfit for an appearance from before clothes could be owned. */
export function baseWear(app) {
  return {
    top: app.topStyle === 1 ? 'basic:long' : 'basic:tee',
    outer: app.topStyle === 2 ? 'basic:jacket' : null,
    bottom: app.bottomStyle === 1 ? 'basic:shorts' : 'basic:pants',
    shoes: 'basic:shoes',
    hat: null,
    glasses: null,
    chain: null,
    watch: null,
  };
}

/**
 * What a character looks like in what they're wearing: the appearance plus every
 * worn item's look. Basics keep the appearance's own colours.
 */
export function dress(app) {
  const w = app.wear;
  if (!w) return app;
  const out = { ...app, print: -1, printBack: -1, hood: false, hat: 0, glasses: 0, chain: 0, watch: 0, sole: null };
  // slots left out of `wear` keep the appearance's own clothes (NPCs who only add accessories)
  if ('top' in w) Object.assign(out, (ITEM[w.top] ?? ITEM['basic:tee']).look);
  if ('outer' in w) {
    const outer = w.outer && ITEM[w.outer];
    if (outer) Object.assign(out, outer.look);
    else if (out.topStyle >= 2) out.topStyle = 1;
  }
  // a hoodie under a jacket keeps its hood showing; its chest print is hidden by the jacket
  for (const s of ['bottom', 'shoes', 'hat', 'glasses', 'chain', 'watch']) {
    const it = w[s] && ITEM[w[s]];
    if (it) Object.assign(out, it.look);
  }
  return out;
}

/** Is this appearance wearing a jacket or coat? */
export const outerOn = (app) => app.topStyle === 2 || app.topStyle === 3;

// ---------------------------------------------------------------- status
export const TIERS = [
  { min: 0, name: 'Nobody' },
  { min: 5, name: 'Regular' },
  { min: 12, name: 'Put-Together' },
  { min: 22, name: 'Fresh' },
  { min: 35, name: 'Sharp' },
  { min: 55, name: 'Flashy' },
  { min: 80, name: 'Rich' },
  { min: 120, name: 'Untouchable' },
];
const HOME = { starter: 0, loft: 12, penthouse: 30 };

/** Your status from what you're wearing and where you live: { score, tier (0-7), name, next }. */
export function statusOf(app, home) {
  let score = HOME[home] ?? 0;
  for (const s of SLOTS) {
    const it = app.wear?.[s] && ITEM[app.wear[s]];
    if (it) score += it.status;
  }
  let tier = 0;
  TIERS.forEach((t, i) => {
    if (score >= t.min) tier = i;
  });
  return { score, tier, name: TIERS[tier].name, next: TIERS[tier + 1]?.min ?? null };
}

/** The most eye-catching thing someone's wearing (for people who notice). */
export function showpiece(app) {
  let best = null;
  for (const s of SLOTS) {
    const it = app.wear?.[s] && ITEM[app.wear[s]];
    if (it && !it.basic && (!best || it.status > best.status)) best = it;
  }
  return best;
}

/** Dress an NPC up a bit: richer areas, nicer things. wealth 0..1 */
export function npcWear(app, rng, wealth) {
  const wear = baseWear(app);
  const roll = rng.next();
  if (roll > 0.15 + wealth * 0.35) return { ...app, wear };
  const pool = ITEMS.filter((it) => !it.basic && !it.gem && !it.drop && (it.brand !== 'vellard' || rng.chance(wealth * 0.5)) && it.price < 20000);
  const n = rng.int(1, 2 + Math.round(wealth * 2));
  for (let k = 0; k < n; k++) {
    const it = rng.pick(pool);
    if (it.slot === 'top' && wear.outer && it.look.hood) continue;
    wear[it.slot] = it.id;
  }
  // somewhere in the city, one person owns a Meridian
  if (wealth > 0.8 && rng.chance(0.04)) wear.watch = 'mv:meridian';
  return { ...app, wear };
}

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const price = (it) => (it.price ? money(it.price) : 'free');
