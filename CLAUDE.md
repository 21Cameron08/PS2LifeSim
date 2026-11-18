# Port Halcyon: notes for Claude

A PS2-style browser life sim (Vite + three.js, no build-time assets). See README.md for
features, controls and the code map.

## Design direction (from the owner)

- **Lots of cool places to hang out.** This is a core goal, not a side feature: the city
  should keep gaining spaces worth going to and lingering in (think diner booths, an
  arcade, rooftops, a karaoke bar, a laundromat at 2 AM, a record shop, the night market,
  a pier). Each one should have the same detail, ambience and lighting care as the
  apartments and HALCYON 24: a real walk-in interior, sounds, music, people, small things
  to do. When choosing what to build next, favour new hangout spaces.
- Dense semi-city with great detail and ambience; borderline fantasy in some areas (the
  Lantern Quarter).
- Later: more jobs, cars, bank accounts, NPC interaction, clothes, customization,
  furniture, and online play much later.
- Jobs should feel real and immersive, and entry-level pay should be low.

## Working notes

- `npm run dev` / `npm run build`. Interiors use baked vertex lighting
  (`src/world/interior/`); new interiors reuse the kit in `kit.js` and live in the city
  space or their own space (see `world/apartments.js`, `world/store.js`).
- Avoid coplanar overlapping faces (z-fighting): end panels outside spans, labels and
  glows at least 5 mm proud, buildings must not overlap their neighbours' trim.
- SUBSTATION (`world/club.js`, `actors/clubbers.js`, `audio/clubTrack.js`): interiors can
  carry four extra baked light channels (`fxLight` in the kit, `aFx` in bake.js) recoloured
  per frame; rooms with the same `zone` share lights. Phase 1 is built (door, hall, bar,
  booths, toilets, coat check, music, lights, crowd, 4 AM lights up). Phase 2 and 3 are in the
  README roadmap.
- Secret cheat menu (money, warps, time) for testing: type `BLING` while walking around,
  or tap the money display five times. Code is in `main.js` (`openCheats`) and
  `ui/ui.js` (`openCheats`). Not listed in the in-game controls on purpose.
- All names, shops and brands in the game are made up; keep it that way.
