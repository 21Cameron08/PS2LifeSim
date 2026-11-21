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
| Dance (on the club's floor) | E to start, ← ↑ → ↓ or WASD on the beat, Esc to stop | USE, then the arrow pad |
| Bartending (SUBSTATION) | ingredients 1-0, Q, W · Enter finish the glass · Backspace tip it out · S serve | the panel's buttons |
| DJ set (SUBSTATION) | 1-4 pick what plays next · Space cue on the one · Esc end the set | the panel's buttons |
| Shopping (Galleria) | ↑ ↓ pick · T try on · Enter bag it (or order it at ROOMSET) · P pay now · Space "I want this" · Esc done | the panel's buttons |
| Trading terminal (HALCYON EXCHANGE) | ↑ ↓ pick a company · ← → how many · Enter buy · X sell · Esc done | the panel's buttons |
| Furniture at home | F: your things (or pick up the piece in front of you) · R turn it · E set it down · F put it back | DECOR, TURN, USE |
| NIGHT RUNNER (the arcade cabinet) | Space / E / ↑ jump (hold for higher) · Esc leave | tap to jump |
| Register 2 (GULLY'S crew) | items 1-0, Q, W, R, T · Space eat here / to go · Backspace void last · Enter send · Esc step away | the panel's buttons |
| City map, routes | M (↑↓ pick a place, Enter set a route) | MAP |
| Sound on/off | pause menu (Sound) | in the pause menu |

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
- **Money**: cash + bank balance, working ATMs (deposit, withdraw, and a statement of
  your wages, rent and card payments), vending machines, a lantern seller and a fortune
  teller in the night market.
- **Apartments**: you start in **Unit 3B**, a cramped walk-up above a laundromat in
  Old Market. Two better homes are up for lease (follow the blue diamonds):
  **Loft 4** at The Kiln Works in Kiln Heights, and the **Meridian Tower Penthouse**
  Downtown. See below.
- **Jobs**: night clerk at **HALCYON 24**, the convenience store next door to Unit 3B
  ($9 an hour), crew at **GULLY'S** ($9.50 and a meal, then shift manager, then the
  franchise) and the bar at **SUBSTATION** ($11 plus tips). One shift at a time. See below.
- **Getting rich**: the **HALCYON EXCHANGE** Downtown, a 1920s banking hall turned
  brokerage with a bar: trade shares in eight made-up companies, buy buildings around the
  city and collect rent, resell sneakers at the night market, and watch your net worth
  climb. See below.
- **A nightclub**: **SUBSTATION**, a converted power substation in Ember Row, across the
  road from the Lantern Quarter. Open 10 PM to 4 AM. See below.
- **A burger joint**: **GULLY'S** in Greenway, a little harbour-town fast food chain
  ("Snatch a bite!" since 1987). Open 6 AM to 2 AM. See below.
- **A mall**: the **Halcyon Galleria** Downtown: a skylit two-storey atrium, escalators,
  a fountain, a thrift shop, a streetwear and sneaker shop, a luxury boutique and a
  furniture showroom. Open 10 AM to 10 PM. See below.
- **Furniture and collections**: buy furniture at ROOMSET, place it anywhere at home,
  use it (sofas, a hot tub, a home bar, an aquarium, an arcade cabinet with a real game,
  a jukebox), and fill display pieces with what you own. See below.
- **Clothes you own and status**: what you wear (and where you live) gives you a status,
  shown under your money. People notice. See below.
- **Needs**: hunger, energy, hygiene, fun and social, shown under your money with your
  mood. Eat, sleep, shower, have fun and talk to people to keep them up. See below.
- **City map** (M, or MAP on touch): the real blocks and buildings, coloured by district,
  with every place worth going to, when it's open, and a route you can follow. See below.
- **Customization**: the wardrobe (C) edits skin, hair style and colour, height, build,
  and what you wear: the free basics in any colour (tee, long sleeve, jacket, trousers or
  shorts, shoes), plus every piece you've bought.
- **Save**: autosaves to localStorage ("memory card"): position, time, money,
  looks, friendships, needs, what's in your fridge, Gull Box toys, your furniture and
  where it stands, your shares, buildings and franchise, settings.
- **Sound**: all synthesised with WebAudio: city rumble, wind, crickets, footsteps,
  horns, distant sirens, UI blips, typewriter ticks.

## Apartments

| | Unit 3B (start) | Loft 4 | Meridian Penthouse |
| --- | --- | --- | --- |
| Where | Old Market, 3rd floor above a laundromat, facing the park | Kiln Heights, converted factory, 3rd floor | Downtown, top floor of an 18-storey glass tower |
| Rooms | hall, bathroom, bedroom, living room + kitchenette | open-plan kitchen/dining/living, bedroom, bathroom | entry, kitchen, great room, study, master bedroom, ensuite |
| Move in / rent | $300 / $85 a week | $2,500 / $280 a week | $12,000 / $950 a week |

- Each interior is built **on its real floor inside its building**, so the windows show
  the live street: traffic, people, weather of the day/night cycle. From the penthouse
  you look out over the skyline.
- Walk up to the street door (E): enter your home, or for a listing **take a tour** and
  **sign the lease** (paid from your bank account; deposit cash at an ATM). Signing
  moves you in and ends your old lease. Rent leaves your bank every Monday morning.
- At home: **sleep** (skip to 7 AM), **shower/bath**, **change clothes** at the closet,
  raid the fridge, flip the **light switch**, watch **TV** (it really plays), and put on
  music: a crackly AM radio, a lo-fi record player, or the penthouse grand piano.
- Interiors use **baked vertex lighting** like PS2 games did: every lamp and window is
  pre-computed into the walls and furniture (plus soft contact shadows), and blended at
  runtime with the time of day and the light switch. Characters still get real lights.
- Layouts are plain data in `src/world/interior/layouts.js`: rooms, walls with door and
  window openings, and furniture from the kit in `src/world/interior/kit.js`. Adding an
  apartment = a building site in `src/config.js` + a layout.

## The job: HALCYON 24

A walk-in 24-hour convenience store on the same street as Unit 3B (follow the yellow
diamond). It isn't a loading-screen interior: the sliding doors open with a chime, you
can see in through the lit windows from the street, and shoppers walk in off the
sidewalk.

- **Get hired**: talk to Mrs. Varga behind the counter.
- **Clock in** at the punch clock in the stockroom (through STAFF ONLY). You put on
  the green vest; Mrs. Varga goes to the back office.
- **Register**: customers shop, then queue. Stand behind the counter and press E:
  scan each item, **check ID for beer** (born on or before the date the register
  shows, or refuse), then approve the card or **count out the change** from the drawer.
- **Restock**: shoppers empty the shelves facing by facing. Grab a case from the
  matching stockroom rack (drinks, snacks, noodles, household) and restock the aisle.
- **Mop** spills with the mop by the yellow bucket; a wet-floor sign goes up after.
- **Trash**: when the bin by the door fills, carry the bag out to the dumpster.
- **Pay**: $9.00 per game hour, paid to your bank when you clock out, with a printed
  shift slip. Docked for customers who give up waiting ($2), empty shelves ($1),
  ignored spills ($2), giving too much change, walking off the job ($5), and a $50
  fine for selling beer to a minor. Occasional tips if your change is exact.
- The office has a desk and a **live CCTV monitor** (there's another over the counter),
  so you can watch yourself work.

At $9/hour, Loft 4's $2,500 move-in is roughly 280 hours behind the counter. Not great pay.

## SUBSTATION (nightclub)

A 1950s power substation turned club, in Ember Row facing the Lantern Quarter. Like the
store it's part of the street: no loading screen.

- **Theme nights**: every night has its own sound, colours, cover and door policy, and a lit
  TONIGHT sign by the door (the map shows it too):

  | Night | Theme | Sound | Cover |
  | --- | --- | --- | --- |
  | Mon-Wed | HOUSE NIGHT | the club's own house track, 124 BPM | $15 |
  | Thu | STATIC | glitch electro at 128: square-wave stabs that stutter, bursts of digital noise, a floor like a dead TV channel, white and cyan lasers | $15 |
  | Fri | CURRENT | house all night at 124 with piano stabs, orange and gold washes | $20 |
  | Sat | OVERLOAD | peak-time acid at 130: a squelching 303-ish bassline, an air horn and confetti cannons on every drop, lasers through the groove too | $30 |
  | Sun | LOW VOLTAGE | deep and slow at 112: soft kicks, rimshots, long pads, an echoing lead, lavender light, no strobes | $10 |

- **The door**: a queue behind a velvet rope, Dmitri on the door, a neon sign buzzing over a
  steel canopy, and Ray's fries cart on the curb ($4, open 9 PM to 5 AM). Cover is cash; the
  stamp on your hand lets you come and go until close. From down the street you only hear the
  kick drum; it opens up when the doors swing open. On busy nights there's a real line: Dmitri
  sends you to the back of it (you wait, the clock moves). Make friends with him (pay the
  cover, ask how the door is, tip him) and he waves you past it; close friends get in free on
  quiet nights. Staff walk straight in.
- **Dress code**: no shorts (except at LOW VOLTAGE); on Fridays and Saturdays no T-shirts
  (long sleeves or a jacket). Turned away? Change in the wardrobe (C) and try again.
- **Inside**: a lobby with a coat check (it really takes your jacket off you, $2), gig posters,
  an ATM and a photo booth, a strip curtain into one tall concrete hall:
  an 8x8 LED dance floor under a mirror ball and a lighting truss, a DJ on an old transformer
  housing in front of a giant copper coil, ceramic insulator stacks, speaker stacks whose
  cones pump on the kick, a long backlit bar, red velvet booths, toilets covered in stickers,
  and the stairs up to the VIP balcony and the roof.
- **The show**: an original synthesised house track at 124 BPM that loops through intro,
  groove, breakdown, build and drop. The lights follow it: washes pulse on the kick, the
  floor runs patterns per section, the mirror ball spots swirl in the breakdown, beams sweep
  through the haze, lasers fan out on the drop and the crowd puts its hands up.
- **People**: up to ~40 clubbers depending on the night (Saturday is packed, Monday isn't),
  who walk in through the lobby, dance, prop up the bar, sit in the booths and leave. Staff:
  bouncer, security, DJ, two bartenders, coat check.
- **Dance**: step onto the LED floor and press E. Arrows scroll to the line on the beat; hit
  them in time for PERFECT / GOOD. Good timing fills your groove meter, which upgrades your
  moves (side step, groove, fist pump, hands up); at full groove the dancers around you turn
  and cheer. Timing is judged against what you hear, not the frame rate.
- **The bar** (and the roof bar): water, soft drinks, beer and three house cocktails (the Live
  Wire, the Brownout, the Spark). A drink or two loosens you up (the dance timing gets a bit
  more forgiving); after four, the bartender cuts you off.
- **People**: talk to anyone off the dance floor (bar, booths, balcony, roof). Everyone has a
  name and a vibe; chatting once a night and buying them a drink builds a friendship that's
  saved. Ask someone on the floor to dance and they'll partner you, copying your moves.
- **Sit down** in the booths, on the balcony and on the roof sofas and bench.
- **VIP balcony**: Celeste on the upper door sells wristbands ($150 on Fridays and Saturdays,
  $100 other nights, card). Emerald booths over the glass rail, the best view of the floor,
  and bottle service ($200) that arrives with a sparkler and wins over the whole balcony.
- **The roof terrace**: from the stair landing, out the door and up the fire escape on the
  front of the building. Decking, string lights, patio heaters, sofas, a bench at the parapet
  facing the Lantern Quarter's glowing tree, a roof bar, and people out getting some air. The
  music is a far-off thump up here; the lights show from the street.
- **Photo booth**: $5 for four flashes and four poses. The strip pops up, it's saved (your last
  three), and the newest one is stuck on the fridge at home with a magnet.
- **Regulars**: everyone has their usual nights (party people on Fridays and Saturdays, the
  chill ones on Sundays, one random night each). Make friends and they turn up on theirs, come
  over to say hi when they spot you, and remember what you did together last time. The map
  lists who's usually in tonight.
- **Bartending job**: ask Nadia at the bar if they're hiring. $11 an hour plus tips, any
  night the club's open. She lifts the flap and you work behind the bar with her: people at the
  bar get a "!" when they want something; stand across from them and make it from the recipe
  card taped under the bar, glass by glass, in order (ice first). Every drink takes a clean
  glass, so collect the empties from the tables and booths in a crate and run the glasswasher;
  fill the ice well from the ice machine; change the keg when the beer runs dry. Leave people
  waiting and Nadia serves them (and gets the tip). Wrong drinks are docked. A slip at the end.
- **DJ gig**: talk to DJ Halflife in front of the booth. Once you can move (a good dance combo)
  or she knows you, she books you a warm-up slot on a house or STATIC night: eight 8-bar
  phrases where you pick what comes next (groove, breakdown, build, drop) and hit CUE on the
  "one" as it changes. The music and the lights really follow you. The crowd's energy is the
  score: build before you drop, give them a breather after, mix cleanly; drop too soon or
  leave them hanging after a build and the floor empties. $60 plus tips; play well twice and
  she offers you a Friday prime-time set ($140).
- **The green room** behind the DJ booth (the STAFF ONLY door): a worn red sofa that gets your
  energy back, the DJ's rider (help yourself, three times a night), a mirror ringed with bulbs,
  record crates, a clothes rail and tour laminates. Open to staff, the DJ's friends and anyone
  who's played a good set.
- **3:33.** If you're in the hall at 3:33 AM the coil hums and turns violet, and around a
  little steel hatch behind it a seam of violet light appears. For twelve minutes you can slip
  through it into **the Undercurrent**: an old cable vault where the clock stops. The Lantern
  Quarter's tree has grown through the far wall: its roots glow across the floor, lanterns
  drift under the brick arches, and through the arch you can see it standing in a violet night.
  The music is the club's song slowed right down with bells in the echo. Vesper behind the
  cable-drum bar pours a glass of nothing (it wakes you right up), a few strange regulars have
  been here since 1987, and you can close your eyes on the sofa. Time doesn't pass while you're
  down there. Once you've found it, it's on the map.
- **4 AM: lights up.** House lights snap on, the music cuts, everyone files out. At 4:30
  security walks you out.
- **Flashing lights** (pause menu): FULL adds strobes, REDUCED (default) keeps beat pulses
  without strobing, OFF keeps everything slow and calm.

How the lights work: on top of the baked lamp light, the club's surfaces have four more
baked light channels (house lights, two stage washes, the LED floor) whose colours are set
every frame from the music, so the whole hall changes colour on the beat with no real-time
lights on the walls. People get the shared pool of real point lights, recoloured the same way.

## Needs

Five bars under your money, 0 to 100, and a mood that's mostly their average (the worst
one drags it down). They drain with game time: a game hour is a real minute, so a waking
day is about 16 minutes, which is about two meals, one sleep and one shower.

| Need | Drains | Fills from |
| --- | --- | --- |
| Hunger | ~5.5 an hour | the fridge at home (one meal per portion; groceries at HALCYON 24, $18 for 5), GULLY'S (every item has its own value, filled bite by bite), hot dogs and candy at HALCYON 24, fries outside SUBSTATION, vending machines |
| Energy | ~4.5 an hour, faster on a shift and when hungry | sleeping (until 7 AM, or a two-hour nap), coffee (GULLY'S, HALCYON 24), sodas, sitting on your own sofa, the hot tub, an espresso at the Ticker Bar |
| Hygiene | ~3.5 an hour, faster on a shift and dancing | a shower (or the penthouse bath), washing up at GULLY'S, the hot tub |
| Fun | ~4.5 an hour, faster on a shift | TV and music at home, dancing, the club, drinks, the photo booth, the kiddie ride, Gull Box toys, lanterns, fortunes and just being in the Lantern Quarter, shopping, your own furniture (the fish, the home bar, NIGHT RUNNER, the jukebox, the hot tub, admiring your collections), trading, a cocktail after the closing bell, the Harbour Gull, buying a building |
| Social | ~3 an hour | talking to anyone (a first chat in a while counts most), dancing with someone, the club and GULLY'S crowds, a drink with a broker |

When they run low: a warning tells you what would help. Below 15 energy you can't run,
below 6 you walk slower, and at 0 you pass out: a cab takes you home ($20) and you wake
up six hours later. A hungry body tires faster, and a starving one burns out fast. Low
hygiene gets you a little green stink cloud, halves how much people warm to you, and
Dmitri won't let you into SUBSTATION. Your mood sets how fast friendships grow.

The cheat menu has a Needs row (fill, drain, starving, exhausted, smelly) for testing.

## The map

Press **M** (MAP on touch) for a top-down map drawn from the city itself: roads, every
block and building (lighter = taller), coloured by district, with the park, the Lantern
Quarter's glow, ATMs and vending machines. You're the white arrow (the soft wedge is where
the camera looks); your home is outlined in green.

The list beside it has every place worth going to: home, the flats for lease, HALCYON 24,
GULLY'S, SUBSTATION, the Lantern Quarter and Greenway Park, each with what it is, whether
it's open right now (and until when, or when it opens), how far it is, and which needs it
fills. A place that would fix one of your low needs, and is open, gets an orange badge.

Pick one and **set a route**: an orange light beam rises over its door (you can see it over
the rooftops), and a chip under the clock shows the name, the distance and an arrow that
turns with the camera. Get there and it clears itself. Sound on/off moved to the pause
menu, since M is the map now.

## GULLY'S (fast food)

A small, made-up harbour-town burger chain: a round seagull mascot called Gully in a teal
sailor cap (winking), teal/orange/cream/navy everything, "Snatch a bite!", founded 1987 as
a fish shack on Pier Road. The Greenway branch sits back from the street behind a patio
with umbrella tables, a pole sign with a turning Gully on top and a lit roof sign.

- **Inside**: window booths with pendant lamps, tables with swivel stools, a checkerboard
  floor, the harbour mural, posters (the new Seafoam Shake, collect all six Gull Box toys,
  the sunrise menu, Employee of the Month), the bins with tray stacks by the door, a drink
  station with free refills, a kids' corner with a Gully statue, a kiddie ride and a crayon
  table, and restrooms. The kitchen is in full view behind the counter: the grill and
  hood, the assembly line under heat lamps, fryers with baskets that dip, the order screens.
- **The menu** (lit boards over the counter): Gully Stack, Single Gull, Catch of the Day,
  Harbor Dog, Squawk Strips, Chip Snatchers, Onion Lifebuoys, Seafoam and Sunset shakes,
  the Gull Box (kids' meal + a toy) and the Full Flock meal. Before 11 AM the boards swap to
  the **Sunrise menu** (Early Bird, Dawn Patrol pancakes, Hash Brown Raft, Harbor Coffee...).
- **Ordering**: queue at a register (the second opens when it's busy), press E, pick your
  food, eat here or to go, pay cash or card. You get a number; it goes up on the **NOW
  SERVING** board with a ding when Marco puts your tray on the pass. Take it, find a seat
  (booths, stools or the patio) and eat: every item has its own little line. Bin your tray
  by the door after. Take a tray past the patio and Pip swaps it for a bag; a bag can be
  eaten anywhere (E).
- **Gull Box toys**: six to collect (Captain, Surfer, Astro, Chef, Disco, and the rare
  glow-in-the-dark Ghost). They line up on top of your fridge at home.
- **People**: Jo and Theo on the registers, three cooks, Marco the shift manager on the
  pass, Pip clearing tables, and customers who walk in off the street, queue, wait for
  their number, eat (or take a bag) and mostly bin their own trays. Breakfast, the lunch
  rush, dinner and the after-bars crowd are the busy times. Talk to anyone; ask Marco
  about work (see the crew job below).
- **The kiddie ride** (50¢), refills, crayons, the mural, the sinks.
- **Sound**: the in-store radio (bouncy, a bit cheesy, with the "Snatch a bite!" jingle),
  fryer sizzle and extractor hum, fryer timers, the order-up bell.
- **2 AM**: closed. The lights dim, Pip mops and the grill gets scrubbed. Back at 6.

### The crew job

Ask Marco at the pass if they're hiring. Crew member, **$9.50 an hour** (entry level, paid
to your bank with a slip) and a **free crew meal** after a real shift. Shifts start any time
the place is open between 6 AM and 11 PM; ask Marco to start one and he puts you on while
Theo and two of the cooks take a break. The **staff gate** at the west end of the counter
(a half door under a lift-up flap) opens for you, and you get the teal shirt.

- **Register 2** is yours. Customers come up and say what they want (sometimes they change
  their mind halfway through the sentence). Press E at the register, punch it into the
  screen, set eat here or to go, and send it to the kitchen; they tap their card. Leave
  someone standing for 45 seconds and Jo waves them over to register 1. Get the ticket
  wrong and they bring it back when they collect it: Marco comps it, you're docked $2.
- **The fryer** (behind the line): drop a basket (fries, or hash browns before 11), lift it
  when the timer beeps, before it burns. Each basket fills the fry bin.
- **The grill**: lay down patties (eggs and sausage at breakfast), flip them on the beep,
  pull them into the warming cabinet on the next one. Leave them and they turn to charcoal:
  docked, and you have to scrape the grill.
- **The bins hold up the line.** Marco only puts an order on the pass when the fry and grill
  bins have what its ticket needs, so an empty bin stops everything (he lets you know). The
  **screens over the line** show the live tickets, how old they are, and both bins.
- **To-go orders** come up on the pass for you to bag: stand at the pass, E, and call the
  number. Leave a bag too long and Marco does it himself (and gives you a look).
- The shift HUD lists who's at your register, bags to do, both bins and what the fryer and
  grill are doing. Walk off and you're docked; at 2 AM Marco sends everyone home. Clock
  out by talking to Marco: the slip shows orders rung up, wrong orders, people sent to Jo,
  baskets and grill loads, anything burnt, bags, and what was docked. Working drains energy,
  hygiene and fun faster; the register is a bit social; the meal fixes your hunger.
- **Getting on.** Five good shifts (an hour or more, few mistakes) and Marco wants a word:
  **shift manager**, $13.50 an hour plus a bonus on every order rung and bagged, a navy
  shirt, and the complaints. Every couple of minutes someone in the dining room waves you
  over (an orange "!" over their head): go and sort it out. Refund, remake or a free Gull
  Box toy: the right call for the complaint earns a bonus, a poor one costs you, and
  leaving them waiting costs more.
- **The franchise.** Ten shifts as manager and Gully HQ calls: GULLY'S Greenway is for
  sale, $150,000 from your bank. Once it's yours the week's profit lands on Monday mornings
  (Marco still runs the pass), Jo calls you boss, and through Marco you can read the books,
  run a **special of the week** (Two-for-Tuesday packs the place on thin margins; it
  can go either way) and choose the **toy of the week** (five times as many in the boxes).

## The Halcyon Galleria (shopping)

A two-storey mall Downtown, between Greenway Park and the Meridian tower, behind a plaza
with a slowly turning gold ring sculpture, benches and planters. Open 10 AM to 10 PM; at
ten the guard, Pruitt, walks the last shoppers out.

- **The atrium**: a gabled glass roof (the real sky, day and night), big globe pendants,
  a marble floor, a three-tier fountain (toss a coin, 25¢, and make a wish), palms, a
  directory, an up and a down escalator that really carry you, glass balconies with
  benches for people-watching, PRETZEL PILOT under the back walkway (Benny, $4.50, cash
  only) and an ATM. Smooth 2003 mall music in the atrium; each shop plays its own.
- **RACK & RUIN** (thrift, ground floor, Dot): brick walls, rolling racks, a shoe shelf,
  a hats-and-shades spinner, the bargain bin, a curtained fitting room, a crackly radio.
  $3 to $30. The stock changes every morning and every piece is one of a kind; some days
  the bin hides a gem (a 1994 VELLARD jacket for $40, a SPLITGRAIN sample hoodie).
- **SPLITGRAIN** (streetwear, ground floor, Kez): concrete and plywood, a backlit sneaker
  wall, the tee table (five colours), the hoodie rail (five colours), jackets, cargos,
  caps, shades and chains, a heavy slow beat. $28 to $165. **Saturday 10 AM: the Grain
  Runner 9 drop**: a new colourway every week ('Harbour', 'Ember', 'Static', 'Moss',
  'Ultraviolet', 'Bone', then round again), twelve pairs, a line on the plaza from 8:45
  (join it with E), first come first served. The shoe in the drop case is this week's.
- **MAISON VELLARD** (luxury, upper floor, Céleste, with Anton on the door): marble,
  mannequins on plinths, lit niches, a black marble till, the watch and jewellery case,
  a salon with a velvet sofa and a gold-framed mirror, lounge music. $480 to $250,000: the
  silk shirt, cashmere knits and overcoats in five colours, the monogram jacket, loafers,
  the 18k Cuban link chain, the **Meridian Chronograph** ($14,500), the **Meridian Noir**
  ($48,000), and three one-of-a-kind pieces: the **Shearling Greatcoat** ($18,000), the
  **Diamond Cuban Link** ($95,000) and the **Meridian Grand Complication** ($250,000).
- **ROOMSET** (furniture, upper floor across the atrium, Ines): a showroom staged like a
  flat you'd want: a living room under two prints with the cloud sofa, an arc lamp and a
  rug; a collectors' corner in the window (a stocked sneaker wall, a watch case); a
  wall of big tickets (an arcade cabinet, an aquarium with real fish, a jukebox) and a
  hot tub in the corner; an art wall with a neon palm; a home bar; rugs piled on a
  platform; bossa nova. Sit on the sofas. Order anything (several if you like), pay Ines
  or press P, and it's delivered the same day to your storage at home.
- BRIGHTWIRE, next door, is closed for refit: a wall of TVs still on behind the shutter.
- **Shopping**: browse any rack, wall, table or case (E). Each piece shows its price and
  how much status it gives. **Try it on** (you really wear it round the shop; the
  mirrors turn the camera on you) or **bag it**, then **Pay now** (P, or the button in any
  display of that shop), at the till, or by talking to the shop's staff: cash or card, a
  receipt, a ka-ching, and the shop's bag in your hand. Anything unpaid shows as
  **UNPAID** under your money; walk out with it and the alarm goes off: pay right there
  or hand it back. **"I want this"** pins a piece under your money with
  a bar that fills as you save. Buying something new is a fun boost.
- **The staff notice you**: Dot loves everyone; Kez only looks up if your fit is good;
  Céleste asks a Nobody if they're lost and brings champagne to the salon for anyone
  Flashy or better (or who spent $1,000 there today).

## Home: furniture, collections, things to do

- **ROOMSET's catalog** (`src/game/furniture.js`, ~30 pieces, $40 to $22,000): seating
  (a beanbag, a reading armchair, a leather sofa, the designer cloud sofa, a leather
  lounge chair), tables (side, glass coffee, a marble dining set), lamps and plants (a
  floor lamp, an arc lamp, a potted plant, a fiddle-leaf fig, a forty-year-old olive
  tree, a neon sign), rugs, art (prints, a gig poster, an original oil, a gold
  sculpture), big tickets (an aquarium, a home bar, an arcade cabinet, a jukebox, a hot
  tub) and collection pieces (a sneaker wall, a watch case, a trophy shelf, a photo wall).
- **Placing it** (F at home): the panel lists what's in storage and what's in this home.
  Pick something and you carry a see-through copy of it in front of you, snapped to a
  grid: green where it fits, red (with the reason) where it doesn't (walls, other
  furniture, doorways, shelves and lamps already in the room). Things you put near a
  wall back up against it. R turns it, E sets it down, F puts it back. Wall art and the
  neon sign hang on whatever wall you face, and only where there's clear wall behind
  them (not over a window, a door or another picture). Walk up to anything you've placed
  and press F to move it again, or store it from the panel. Moving house: the movers pack
  everything into storage at the new place.
- Placed furniture is **built into the room's baked lighting** like the built-in pieces:
  your lamps light the room (and switch off with the light switch), and everything casts
  a soft shadow on the floor.
- **Collections fill themselves**: the sneaker wall shows every pair you own (the best
  up top), the watch case your watches and chains, the trophy shelf your Gull Box toys
  (they move off the fridge), the photo wall your last four photo-booth strips. Press E
  to look them over (how many, what they're worth).
- **Using it** (everything feeds a need): sit on any sofa or chair (rests you); watch or
  feed the fish; mix a drink at the home bar; play **NIGHT RUNNER** on the arcade cabinet
  (a rooftop runner on a chunky 320×180 screen, with a high score); pick a record on the
  jukebox (bossa nova, lounge, a slow beat, lo-fi, or the GULLY'S jingle extended mix);
  45 minutes in the hot tub.
- **Your home adds to your status**: every placed piece has a decor value (up to +45 in
  all), on top of the address.

## Getting rich: the HALCYON EXCHANGE

A 1920s banking hall Downtown, behind a stone portico with the name carved in the frieze
and a bronze gull on the plaza (rub its beak for luck). Open 8 AM to midnight; Gus on the
door walks the last of them out.

- **The trading floor**: marble, columns, coffered ceiling, three brass chandeliers.
  A **big board** of every price over the floor, an **LED ticker** crawling underneath with
  the prices and the headlines, clocks for Port Halcyon and two made-up cities, and four
  walnut desks of green-screen **terminals** with banker's lamps. Brokers work them while
  the market's open and stare up at the board.
- **The market**: eight made-up companies (GULLY'S Group, SPLITGRAIN, Maison Vellard,
  Meridian Holdings, Brightwire, Harbour Freight & Ferry, Lantern Light & Power, Kiln
  Works Steel). It trades 9:30 AM to 4 PM, Monday to Friday, and prices really move through
  the day. Headlines go up at 8 AM and move the open; some are tied to the city (SPLITGRAIN
  before a Saturday drop, Brightwire's endless refit). Sit at any free terminal: a chart of
  thirty days and today, your position and profit, buy or sell 1, 10, 100 or all, $5 a
  trade from your bank. Dividends land on Monday mornings. Prices are worked out from the
  game clock (the same for everyone, every load), so the past nine weeks are on the charts
  from day one.
- **The Ticker Bar**: walnut and brass, a back bar of lit bottles, stools and a booth by the
  window, Walt pouring. Coffee all day; cocktails after the **closing bell** at 4 (happy
  hour, half price till six). Buy a broker a drink after the bell and they might tell you
  tomorrow's news (they're right about seven times in ten). Cool jazz in the corner.
- **Property**: Priya's desk, a listings wall and a **model of the whole city under glass**
  (the buildings for sale glow red, yours green). Eight real buildings around Port Halcyon
  carry **FOR SALE** boards, from lock-up garages ($24k) to a Downtown corner tower ($2.4M):
  buy them from your bank, collect rent every Monday (less repairs, and now and then an
  empty flat), sell any time for what they're worth that week (each district has its own
  cycle) less 3%. Yours get a PRIVATE PROPERTY plaque and appear on the map.
- **A trading desk at home**: ROOMSET sells a three-screen desk; trade from your flat.

**SOLE SWAP** (the night market, 6 PM to 2 AM): Dex buys and sells Grain Runner 9s. Each
colourway is worth most the week it drops, dips, then climbs again as it gets rare (some
are grails); his chalkboard has this week's prices. He pays 80% and sells at 120%, cash,
and he'll take your other clothes too (vintage gems and VELLARD hold their value best).

**Net worth** (any ATM): cash, bank, shares, buildings, the franchise, and what your clothes
and furniture would fetch. Passing $50k, $250k, $1M and $10M gets a moment, a headline
about you on the Exchange's ticker, and a little status: people notice money.

## Clothes and status

- Every piece is data in `src/game/fashion.js` (all brands made up): basics (free,
  any colour), RACK & RUIN, SPLITGRAIN and MAISON VELLARD. New things to wear: hoodies,
  long coats, caps and beanies, sunglasses, gold, steel and diamond chains, watches,
  logo prints on the chest or across the back of a jacket, two-tone soles.
- **Status** adds up what you're wearing, where you live (the loft and the penthouse
  count), what's in your home and what you're worth: Nobody, Regular, Put-Together, Fresh,
  Sharp, Flashy, Rich, Untouchable.
  It sits under your money as gold pips; the wardrobe shows it as you change.
- **The world notices**: people turn their heads as you pass (more of them the higher you
  climb) and now and then say something about your Meridian; Jo at GULLY'S asks if you're
  slumming it; Dmitri waves Flashy and up past the SUBSTATION line; shop staff change
  their tune. People around the city wear the brands too (more of it Downtown).

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
  world/                  city generator, street props, Lantern Quarter, colliders, particles,
                          apartments (doors, markers, interiors), the HALCYON 24 store,
                          the SUBSTATION club (club.js) and the room under it
                          (undercurrent.js), GULLY'S (gullys.js, and the mascot figure in
                          gullyFigure.js), the Halcyon Galleria (galleria.js), furniture
                          placed at home (homeDecor.js), the HALCYON EXCHANGE (exchange.js)
  world/interior/         room/wall builder, furniture kit, baked lighting, apartment layouts
  actors/                 crowd renderer (instanced puppets, walk/carry/dance/sit poses),
                          appearance model, player + camera, pedestrians AI, traffic,
                          clubbers (the club's staff, queue and crowd), diners (GULLY'S
                          crew, customers, orders and trays), shoppers (the Galleria's
                          staff, mannequins and shoppers), brokers (the Exchange's)
  game/                   clock + save system, needs (needs.js), NPC dialogue data, the
                          store job, the club's dance game (dance.js), photo booth
                          (photobooth.js), theme nights (clubNights.js), bar job
                          (barJob.js) and DJ set (djSet.js), GULLY'S menu data
                          (gullysMenu.js), your visit there (gullysVisit.js), the
                          crew job (crewJob.js), clothes and status (fashion.js),
                          shopping at the Galleria (shopping.js), ROOMSET's furniture
                          catalog (furniture.js), using it at home (homeLife.js), the
                          arcade cabinet's game (nightRunner.js), the stock market
                          (market.js), property (property.js) and sneaker resale (resale.js)
  ui/                     HUD, dialogue box, wardrobe, pause menu, title, touch controls,
                          the city map (map.js; its places and hours are game/places.js,
                          the route beam is world/waypoint.js)
  audio/                  procedural ambience, sound effects and music; clubTrack.js is the
                          club's tempo and arrangement per theme night, shared with the
                          lights (and taken over by a DJ set)
```

Performance notes: static scenery is merged into one mesh per material and every
person is drawn with ~20 instanced meshes total (body parts plus what they wear), so a
frame is roughly 70–190 draw calls (Downtown, with every tower in view, is the busiest). It
should run well on integrated GPUs and phones.

## Roadmap (suggested order)

The big goal: **lots of cool places to hang out**. Every new space (diner, arcade,
rooftop, karaoke bar, record shop, a 2 AM laundromat, the pier) gets a real walk-in
interior with the same detail, light and sound as the apartments and the store.

1. **Being rich, phase 4: the high life**: BRIGHTWIRE reopens, a car dealership and
   cars, a members' club and pool on the Meridian tower's roof, fine dining, hired help,
   bottle service at SUBSTATION.
2. **More jobs**: the store system (clock, tasks, slip) generalises to other shops:
   noodle bar cook, courier, office temp. Promotions and raises at the store.
3. **Economy**: bills, shop inventories.
4. **Cars**: enter/exit parked cars, driving model on the same road graph, parking.
5. **NPC lives**: homes, workplaces, daily schedules, memory of conversations, dating.
6. **Art pass**: Blender characters/clothing/furniture as glTF, real animations.
7. **Weather**: rain with wet-street reflections (very PS2), wind, seasonal events.
8. **Online (later later)**: a small Node server (WebSocket, e.g. Colyseus) for shared
    streets, chat and visiting apartments; the bank must move server‑side then.

All names, shops and brands in the game are made up.
