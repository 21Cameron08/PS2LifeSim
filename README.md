# Port Halcyon — a PS2‑style life sim (prototype)

A browser life sim with a PlayStation‑2‑era look: a dense little city, day/night,
pedestrians, traffic, shops, neon, and one block where things get a bit magical.

```bash
npm install
npm run dev      # open the printed URL
npm run build    # static site in dist/ — host it anywhere (GitHub Pages, Netlify, itch.io)
```

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk / run | WASD or arrows, hold Shift to run | left thumb (drag), RUN toggle |
| Look / zoom | drag with the mouse, wheel to zoom, Q snaps 45° | right thumb (drag) |
| Talk / use | E | USE |
| Wardrobe | C | STYLE |
| Pause / settings | Esc (or P) | MENU |
| Fast‑forward time | hold T | – |
| Mute | M | in the pause menu |

## What's in this first slice

- **The city**: a 6×6 block grid of procedurally generated buildings (7 facade styles,
  shop fronts, signs, awnings, setback towers with blinking antennas, rooftop clutter),
  sidewalks, crosswalks, street lamps, trees, benches, bus stops, vending machines,
  ATMs, steaming manholes, a park with a fountain, a ring of buildings around the
  outer road, and a fogged skyline beyond so it feels endless.
- **The Lantern Quarter** (southeast of downtown): an ancient glowing tree, floating
  lanterns, fireflies, rune stones, a rune circle, a night market. Walking toward it
  shifts the fog and sky violet and fades in a mystical soundtrack.
- **Day/night**: a full 24‑minute day with sunrise and sunset palettes, stars, a moon,
  drifting clouds, lit windows at night and sodium street lights that really light
  you and passing cars.
- **People**: ~85 NPCs walking the sidewalks, crossing at corners, idling, chatting in
  pairs, mostly going home at night. Talk to anyone (E): they have names, moods and
  a friendship value that grows when you chat once a day.
- **Traffic**: cars and taxis on the road grid that turn at junctions, queue, stop
  for pedestrians, and honk if you stand in the road.
- **Money**: cash + bank balance, working ATMs (deposit/withdraw), vending machines,
  a lantern seller and a fortune teller in the night market.
- **Customization**: the wardrobe (C) edits skin, hair style/colour, top style
  (tee, long sleeve, jacket over a shirt), colours, bottoms, shoes, height, build.
- **Save**: autosaves to localStorage ("memory card"): position, time, money,
  looks, friendships, settings.
- **Sound**: all synthesised with WebAudio: city rumble, wind, crickets, footsteps,
  horns, distant sirens, UI blips, typewriter ticks.

## How the PS2 look works

It's mostly a rendering recipe, not expensive art (see `src/render/ps2pipeline.js`):

1. Render the scene at a low internal resolution (448 lines by default, like the PS2)
   and let the browser scale it up softly.
2. Low‑poly meshes, Gouraud‑style lighting, small hand‑made textures (32–256 px,
   all painted at load time on canvases in `src/render/textures.js`).
3. Heavy distance fog that matches the sky, and fake "light pools" under lamps.
4. A big soft bloom pass (the classic PS2 glow), colour grading and a vignette.
5. Ordered dithering + 5‑bit colour quantisation, a light composite‑video smear and
   optional scanlines.

All of these are switchable in the pause menu (try 240p for a PS1 feel).

## Do you need Blender?

Not to start: everything here is built in code (boxes, cylinders, procedural
textures), which suits the PS2 style well. Blender (free) becomes the best tool when
you want **characters with real rigs and animations, clothing meshes, furniture,
cars and hero buildings**. Export as `.glb` (glTF) and load with three.js's
`GLTFLoader`. Mixamo is handy for animations; free CC0 low‑poly packs (Kenney,
Quaternius) are good placeholders. The code is structured so procedural pieces can
be swapped for models one at a time.

## Code map

```
src/
  main.js                 boot, game loop, interactions (talk, ATM, shops)
  config.js               city layout constants, special blocks, start values
  core/                   seeded RNG + math, merged-geometry builder, input
  render/                 PS2 post pipeline, procedural textures, sky, time-of-day palette
  world/                  city generator, street props, Lantern Quarter, colliders, particles
  actors/                 crowd renderer (instanced puppets), appearance model,
                          player + camera, pedestrians AI, traffic
  game/                   clock + save system, NPC dialogue data
  ui/                     HUD, dialogue box, wardrobe, pause menu, title, touch controls
  audio/                  procedural ambience and sound effects
```

Performance notes: static scenery is merged into one mesh per material and every
person is drawn with ~12 instanced meshes total, so a frame is roughly 60–120 draw
calls. It should run well on integrated GPUs and phones.

## Roadmap (suggested order)

1. **Needs + home**: hunger/energy/fun/social bars, an apartment you can enter, a bed.
2. **Jobs**: shift jobs at shops (clock in, mini‑tasks, wages paid to the bank), job
   board, schedules tied to the clock.
3. **Economy**: rent and bills, a bank screen with transactions, shop inventories.
4. **Clothes shops**: buy items that unlock in the wardrobe; outfits as data.
5. **Furniture**: interior lots with a grid placement mode, catalogue, save layout.
6. **Cars**: enter/exit parked cars, driving model on the same road graph, parking.
7. **NPC lives**: homes, workplaces, daily schedules, memory of conversations, dating.
8. **Art pass**: Blender characters/clothing/furniture as glTF, real animations.
9. **Weather**: rain with wet-street reflections (very PS2), wind, seasonal events.
10. **Online (later later)**: a small Node server (WebSocket, e.g. Colyseus) for shared
    streets, chat and visiting apartments; the bank must move server‑side then.

All names, shops and brands in the game are made up.
