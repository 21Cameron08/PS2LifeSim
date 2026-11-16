// Character appearance data. This is the seed of the customization system:
// the renderer only reads this object, so the wardrobe UI, shops, saved outfits
// and NPC generation all just produce one of these.

export const SKIN = ['#f3d4b8', '#e9b996', '#d39b74', '#b97c55', '#94603f', '#6e452c', '#4b2e1e'];
export const HAIR_COLORS = ['#1b1410', '#3b2416', '#6b4423', '#a8743c', '#dcbc78', '#cfcac2', '#8f2f2a', '#2f3f8a', '#6a2a7e', '#2e7b6a', '#e07aa8'];
export const CLOTH = [
  '#ece8df', '#2b2b30', '#7a2330', '#c4483a', '#e0a53a', '#4c7a3a', '#2f5d8a', '#1f2e4a',
  '#6b4a8a', '#d77aa0', '#7a6a55', '#3f6f6f', '#9aa0a8', '#c9b48a', '#e86a2a', '#5ac8d8',
];
export const SHOES = ['#1e1e22', '#e8e4dc', '#5a3a26', '#8a2a2a', '#2a3a6a'];
export const HAIR_STYLES = ['Short', 'Long', 'Bob', 'Tall', 'Buzz', 'Bald'];
export const TOP_STYLES = ['T-Shirt', 'Long Sleeve', 'Jacket'];
export const BOTTOM_STYLES = ['Pants', 'Shorts'];

export function defaultPlayerAppearance() {
  return {
    skin: SKIN[2],
    hair: HAIR_COLORS[1],
    hairStyle: 0,
    top: CLOTH[0],
    topStyle: 2,
    jacket: CLOTH[3],
    bottom: CLOTH[6],
    bottomStyle: 0,
    shoes: SHOES[1],
    height: 1.0,
    build: 1.0,
  };
}

export function randomAppearance(rng) {
  const topStyle = rng.chance(0.3) ? 2 : rng.int(0, 1);
  return {
    skin: rng.pick(SKIN),
    hair: rng.chance(0.85) ? rng.pick(HAIR_COLORS.slice(0, 6)) : rng.pick(HAIR_COLORS),
    hairStyle: rng.pick([0, 0, 1, 1, 2, 3, 4, 5]),
    top: rng.pick(CLOTH),
    topStyle,
    jacket: rng.pick(['#2b2b30', '#5a4632', '#1f2e4a', '#7a2330', '#4a5a3a', '#8a8a90', '#c9b48a']),
    bottom: rng.pick(['#1f2e4a', '#2b2b30', '#3a4a6a', '#5a4a3a', '#7a6a55', '#9aa0a8', '#2f3f2f']),
    bottomStyle: rng.chance(0.15) ? 1 : 0,
    shoes: rng.pick(SHOES),
    height: rng.float(0.92, 1.07),
    build: rng.float(0.9, 1.15),
  };
}
