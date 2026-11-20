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
- SUBSTATION (`world/club.js`, `actors/clubbers.js`, `audio/clubTrack.js`, `game/dance.js`,
  `game/photobooth.js`): interiors can carry four extra baked light channels (`fxLight` in
  the kit, `aFx` in bake.js) recoloured per frame; rooms with the same `zone` share lights.
  Rooms can be stacked (`y0` floor, `h` ceiling) and wall openings can have several vertical
  `gaps`. The player's ground on stairs/balcony/fire escape/roof comes from
  `club.groundAt(x, z, playerY, base)` (outdoor and club spaces both use it). Phases 1-3 are
  built. Theme nights: `game/clubNights.js` (cover, dress, palettes, looks) and
  `audio/clubTrack.js` (`setTheme` changes the tempo, so the club music restarts; `sectionAt`
  is shared by the sound, the lights and the dance game, and `setArrangement` lets a DJ set
  drive all three). The bar job (`game/barJob.js`) opens `club.setBarFlap`; the DJ set is
  `game/djSet.js`; the green room is part of the club interior. The Undercurrent
  (`world/undercurrent.js`) is its own space 30 m under the club, reached at 3:33-3:45 AM;
  `main.js` stops the clock there (`inUnder`).
- GULLY'S (`world/gullys.js`, `world/gullyFigure.js`, `render/gullysTextures.js`,
  `actors/diners.js`, `game/gullysMenu.js`, `game/gullysVisit.js`): the menu is plain data
  in gullysMenu.js. Diners owns the crew, customers, orders and the tray/bag meshes (the
  player's tray is a diners tray too); when the camera is far away people walk at 80 m/s
  and new customers can spawn already seated or waiting, so the place is busy on arrival.
  Seats carry a `route` from the aisle; crowd poses `c.tray` and `c.eat` came with it.
- GULLY'S crew job (`game/crewJob.js`): Marco hires you through `gullysVisit.talk`
  (`crew.marcoChoices`). On a shift `diners.shift = { stock: { fry, grill }, short }`: register 2
  waits for you (customers carry a `wish`, `diners.ringUp` sends your ticket), Marco only
  plates orders whose `items` the bins can cover (`KITCHEN` in gullysMenu.js), to-go orders
  wait in state `bag` for you, and `diners.onCrew` reports 'lost'/'wrong'. The kitchen side
  is reached through the staff gate (`gullys.staffGate` collider, opened while
  `gullys.crewKitchen` is set or you're still `behindCounter`); the live ticket screen is
  `KitchenScreen` swapped onto `gullys.kitchenMat`. One job at a time: `onClock()` in main.js.
- Needs (`game/needs.js`, `updateNeeds`/`passOut` in main.js, HUD in `ui.setNeeds`): decay
  comes from game time each frame (`needs.tick`); jumps of 30+ minutes are skipped there, so
  anything that skips time on purpose (sleep, shower, fridge, passing out) applies its own
  effect and resets `needsLast`. Activities call `needs.give({...})`; conversations call
  `needs.chat(key, minutes)`. New things to do should feed at least one need.
- The map (`ui/map.js`, places in `game/places.js`, route beam `world/waypoint.js`): it is
  drawn from `city.blocks`/`city.footprints`, so new buildings show up on their own. A new
  hangout space needs an entry in `buildPlaces` (door position, live status/hours, needs it
  fills) to appear in the list, on the map and as a route target.
- Secret cheat menu (money, warps, time) for testing: type `BLING` while walking around,
  or tap the money display five times. Code is in `main.js` (`openCheats`) and
  `ui/ui.js` (`openCheats`). Not listed in the in-game controls on purpose.
- All names, shops and brands in the game are made up; keep it that way.
