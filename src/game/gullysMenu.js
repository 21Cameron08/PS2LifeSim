// GULLY'S: a small harbour-town burger chain. "Snatch a bite!" since 1987, Pier Road.
// Everything here is made up. The menu is plain data: the menu boards, the order
// panel and the eating lines all read it.

export const BRAND = {
  name: "GULLY'S",
  slogan: 'Snatch a bite!',
  since: 'SINCE 1987',
  teal: '#17a2a8',
  orange: '#ff8a2a',
  cream: '#fff3dc',
  navy: '#1d2c4c',
};

// icon: what the menu board draws next to it. eat: what you think while eating it.
export const LUNCH = [
  { id: 'stack', name: 'Gully Stack', desc: 'Two patties, cheese, Gully sauce', price: 6.49, icon: 'burger2', main: true, eat: 'Two patties, too much sauce, a pickle that ends up on your sleeve. Perfect.' },
  { id: 'single', name: 'Single Gull', desc: 'The classic. One patty, one pickle', price: 3.99, icon: 'burger', main: true, eat: 'Simple, salty, gone in six bites.' },
  { id: 'catch', name: 'Catch of the Day', desc: 'Crispy fish, tartar, soft bun', price: 5.29, icon: 'fish', main: true, eat: 'The fish is square. The sea is not. It works anyway.' },
  { id: 'dog', name: 'Harbor Dog', desc: 'Grilled dog, onions, mustard', price: 3.49, icon: 'dog', main: true, eat: 'Mustard everywhere. Worth it.' },
  { id: 'strips', name: 'Squawk Strips', desc: 'Five chicken strips, dip', price: 4.99, icon: 'strips', main: true, eat: 'Crunchy, hot, and the dip is suspiciously good.' },
  { id: 'fries', name: 'Chip Snatchers', desc: 'Our fries. Guard them', price: 2.29, icon: 'fries', eat: 'Salty, crispy, slightly too hot. You guard them from imaginary gulls.' },
  { id: 'rings', name: 'Onion Lifebuoys', desc: 'Thick onion rings', price: 2.49, icon: 'rings', eat: 'One ring pulls its whole onion out in one go. Classic.' },
  { id: 'seafoam', name: 'Seafoam Shake', desc: 'Mint, cream, sprinkles', price: 3.29, icon: 'shake', drink: true, eat: 'Too thick for the straw for the first five minutes.' },
  { id: 'sunset', name: 'Sunset Shake', desc: 'Strawberry and orange', price: 3.29, icon: 'shake2', drink: true, eat: 'Tastes like the last day of summer.' },
  { id: 'soda', name: 'Fountain Drink', desc: 'Any size, free refills', price: 1.79, icon: 'cup', drink: true, eat: 'Mostly ice. Refill at the fountain.' },
  { id: 'gullbox', name: 'Gull Box', desc: 'Kids meal + a toy! Collect 6', price: 4.49, icon: 'box', main: true, toy: true, eat: 'A tiny burger, tiny fries, and the real prize: the toy.' },
  { id: 'flock', name: 'Full Flock', desc: 'Stack + fries + drink', price: 8.99, icon: 'meal', main: true, eat: 'The Full Flock. You will not need dinner. Or breakfast.' },
];

export const BREAKFAST = [
  { id: 'earlybird', name: 'Early Bird', desc: 'Egg, cheese, muffin', price: 3.29, icon: 'muffin', main: true, eat: 'Hot egg, soft muffin, the morning gets 20% better.' },
  { id: 'dawn', name: 'Dawn Patrol', desc: 'Three pancakes, syrup', price: 3.99, icon: 'pancakes', main: true, eat: 'Syrup in every layer. You will be sticky until lunch.' },
  { id: 'raft', name: 'Hash Brown Raft', desc: 'Crispy potato raft', price: 1.49, icon: 'raft', eat: 'It floats on its own grease. Delicious.' },
  { id: 'coffee', name: 'Harbor Coffee', desc: 'Strong. Bottomless', price: 1.29, icon: 'coffee', drink: true, eat: 'Hot enough to wake the dead. Or you.' },
  { id: 'oj', name: 'Orange Juice', desc: 'Small, cold, real-ish', price: 1.99, icon: 'cup2', drink: true, eat: 'Bright and cold.' },
  { id: 'gullbox_am', name: 'Sunrise Gull Box', desc: 'Mini pancakes + a toy', price: 3.99, icon: 'box', main: true, toy: true, eat: 'Mini pancakes! And the toy, obviously.' },
  { id: 'flock_am', name: 'Full Flock Sunrise', desc: 'Early Bird + raft + coffee', price: 5.49, icon: 'meal', main: true, eat: 'Breakfast like a gull: all of it, fast.' },
];

// what each item does for your needs (see game/needs.js)
export const FEED = {
  stack: { hunger: 50 },
  single: { hunger: 35 },
  catch: { hunger: 40 },
  dog: { hunger: 30 },
  strips: { hunger: 38 },
  fries: { hunger: 15, fun: 2 },
  rings: { hunger: 14, fun: 2 },
  seafoam: { hunger: 10, fun: 6 },
  sunset: { hunger: 10, fun: 6 },
  soda: { hunger: 3, energy: 6 },
  gullbox: { hunger: 30, fun: 4 },
  flock: { hunger: 72, energy: 6, fun: 4 },
  earlybird: { hunger: 34, energy: 4 },
  dawn: { hunger: 40, fun: 3 },
  raft: { hunger: 14 },
  coffee: { energy: 18 },
  oj: { hunger: 4, energy: 8 },
  gullbox_am: { hunger: 28, fun: 4 },
  flock_am: { hunger: 60, energy: 18 },
};

// what each item takes from the kitchen's holding bins (fryer portions, grill items)
export const KITCHEN = {
  stack: { grill: 2 },
  single: { grill: 1 },
  catch: { fry: 1 },
  dog: { grill: 1 },
  strips: { fry: 1 },
  fries: { fry: 1 },
  rings: { fry: 1 },
  gullbox: { grill: 1, fry: 1 },
  flock: { grill: 2, fry: 1 },
  earlybird: { grill: 1 },
  dawn: { grill: 1 },
  raft: { fry: 1 },
  gullbox_am: { grill: 1 },
  flock_am: { grill: 1, fry: 1 },
};

/** What a list of items needs from the kitchen. */
export function kitchenNeeds(items = []) {
  const n = { fry: 0, grill: 0 };
  for (const id of items) for (const [k, v] of Object.entries(KITCHEN[id] ?? {})) n[k] += v;
  return n;
}

const OPENERS = ["Hi! Can I get", "Um... I'll have", 'Yeah, lemme get', 'Could I please have', 'Okay, so.', 'Hey. Just', "I'd like"];
const article = (name) => (/s$/.test(name) ? '' : /^[AEIOU]/.test(name) ? 'an ' : 'a ');
const NUM = ['', '', 'two', 'three'];

/** Say a list of item ids the way a customer would. */
export function sayItems(items, menu) {
  const counts = {};
  for (const id of items) counts[id] = (counts[id] ?? 0) + 1;
  const parts = Object.entries(counts).map(([id, n]) => {
    const name = menu.find((m) => m.id === id)?.name ?? id;
    return n > 1 ? `${NUM[n] ?? n} ${/s$/.test(name) ? name : `${name}s`}` : `${article(name)}${name}`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

/** What a customer at the register asks for: { items, toGo, text } (sometimes they change their mind). */
export function makeWish(menu, rng) {
  const mains = menu.filter((m) => m.main);
  const sides = menu.filter((m) => !m.main && !m.drink);
  const drinks = menu.filter((m) => m.drink);
  const items = [rng.pick(mains).id];
  if (rng.chance(0.55)) items.push(rng.pick(sides).id);
  if (rng.chance(0.6)) items.push(rng.pick(drinks).id);
  if (rng.chance(0.15)) items.push(rng.pick(mains).id);
  const toGo = rng.chance(0.3);
  let text = `${rng.pick(OPENERS)} ${sayItems(items, menu)}? ${toGo ? rng.pick(['To go, please.', 'To take away.', "It's to go."]) : rng.pick(['For here.', 'Eating in.', "We'll eat here."])}`;
  // ...and sometimes they change their mind halfway
  if (rng.chance(0.14)) {
    const k = rng.int(0, items.length - 1);
    const pool = (menu.find((m) => m.id === items[k])?.drink ? drinks : menu.find((m) => m.id === items[k])?.main ? mains : sides).filter((m) => m.id !== items[k]);
    if (pool.length) {
      const swap = rng.pick(pool);
      const old = menu.find((m) => m.id === items[k]).name;
      items[k] = swap.id;
      text += ` Actually, no, make the ${old} ${article(swap.name)}${swap.name}.`;
    }
  }
  return { items: items.sort(), toGo, text };
}

/** Did the ticket match what they asked for? */
export function sameOrder(a, b) {
  const x = [...a.items].sort();
  const y = [...b.items].sort();
  return a.toGo === b.toGo && x.length === y.length && x.every((id, i) => id === y[i]);
}

export const BREAKFAST_UNTIL = 11;
export const menuAt = (hour) => (hour >= 6 && hour < BREAKFAST_UNTIL ? BREAKFAST : LUNCH);

// Gull Box toys: six to collect, the ghost is rare
export const TOYS = [
  { id: 'captain', name: 'Captain Gully', cap: '#1d2c4c', band: '#ffd23a', weight: 3 },
  { id: 'surfer', name: 'Surfer Gully', cap: '#ff8a2a', band: '#17a2a8', wing: '#5ac8d8', weight: 3 },
  { id: 'astro', name: 'Astro Gully', cap: '#d8dce4', band: '#5ac8ff', body: '#e8ecf4', weight: 3 },
  { id: 'chef', name: 'Chef Gully', cap: '#ffffff', band: '#e83a3a', weight: 3 },
  { id: 'disco', name: 'Disco Gully', cap: '#b04aff', band: '#ffd23a', wing: '#d77aff', weight: 2 },
  { id: 'ghost', name: 'Ghost Gully', cap: '#9affd0', band: '#d8fff0', body: '#d8fff0', wing: '#a8f0d8', beak: '#9affd0', weight: 1, glow: true },
];

export function pickToy(rng) {
  const total = TOYS.reduce((s, t) => s + t.weight, 0);
  let r = rng.next() * total;
  for (const t of TOYS) if ((r -= t.weight) < 0) return t;
  return TOYS[0];
}

export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 2; // 2 AM
export const isOpen = (hour) => hour >= OPEN_HOUR || hour < CLOSE_HOUR;
export const price = (n) => `$${n.toFixed(2)}`;
