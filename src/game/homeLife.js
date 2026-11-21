import { FURN, collectionsFor } from './furniture.js';
import { TOYS } from './gullysMenu.js';
import { NightRunner } from './nightRunner.js';

// What the furniture you buy is for: sitting, the fish, a drink at your own bar,
// NIGHT RUNNER on the cabinet, a record on the jukebox, the hot tub, and standing
// in front of your collections feeling good about yourself. Everything feeds a need.

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

const FISH_LINES = [
  'The yellow one is called Brenda now. You don\'t make the rules.',
  'Two of them have been circling the same rock for an hour. Relatable.',
  'The little blue ones move like they all got the same text at once.',
  'A clownfish stares at you through the glass. You blink first.',
  'The pump hums. The fish drift. Somewhere outside, a siren. In here, nothing.',
  'One of them is hiding in the castle. It knows something.',
];

const DRINKS = [
  { name: 'Old Fashioned', line: 'Sugar, bitters, a big cube, a twist of orange. You feel like a man in a hat in a film.', give: { fun: 7 }, booze: true },
  { name: 'Negroni', line: 'Equal parts, stirred, bitter and red. Very grown-up. You make a face, then another sip.', give: { fun: 7 }, booze: true },
  { name: 'Spritz', line: 'Orange, fizzy, a slice in the glass. Tastes like a terrace somewhere sunny.', give: { fun: 6, social: 2 }, booze: true },
  { name: 'Espresso martini', line: 'The machine screams, the shaker rattles. Rocket fuel in a coupe.', give: { fun: 6, energy: 12 }, booze: true },
  { name: 'Fresh lemonade', line: 'Lemons, sugar, a lot of ice. Nobody ever regretted a lemonade.', give: { fun: 3, hunger: 4 }, booze: false },
];

const RECORDS = [
  { label: 'A1 · Harbour Lights (bossa nova)', style: 'bossa', line: 'Nylon strings and a shaker. The flat feels five degrees warmer.' },
  { label: 'B4 · After Hours (lounge)', style: 'lounge', line: 'Smoky keys and brushed drums. You lower your voice without meaning to.' },
  { label: 'C2 · Kiln Street (slow beat)', style: 'street', line: 'Heavy, slow, head-nodding. The windows rattle a little.' },
  { label: 'D7 · Dust Grooves (lo-fi)', style: 'records', line: 'Crackle and warm chords. Perfect for staring out of the window.' },
  { label: 'E3 · The Gull Song (novelty)', style: 'gullys', line: "GULLY'S jingle, the extended mix. Why does the jukebox have this. Why do you love it." },
];

export class HomeLife {
  /**
   * deps: { ui, audio, needs, clock, state, player, decor, sitDown, timeSkipped(), save(), talk (Rng) }
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.runner = new NightRunner({ audio: deps.audio });
    this.admired = {};
  }

  get busy() {
    return this.runner.active;
  }

  use(it, apt) {
    const p = this.decor.pieces.find((q) => q.uid === it.uid);
    const def = p && FURN[p.id];
    if (!def) return;
    switch (def.use) {
      case 'sit': {
        const seat = this.decor.seatFor(apt, p.uid, this.player.pos);
        if (seat) this.sitDown(seat);
        return;
      }
      case 'fish':
        return this.fish();
      case 'bar':
        return this.bar();
      case 'arcade':
        return this.arcade();
      case 'jukebox':
        return this.jukebox();
      case 'tub':
        return this.tub();
      case 'trade':
        return this.openTerminal?.('HOME TRADING DESK');
      case 'sneakers':
      case 'watches':
      case 'toys':
      case 'photos':
        return this.admire(def.use);
    }
  }

  dialog(o) {
    this.player.locked = true;
    this.ui.openDialog({ ...o, onClose: () => (this.player.locked = false) });
  }

  /** Time passes behind a fade; needs get their effect directly. */
  pass(minutes, give, label, after) {
    this.ui.closeDialog();
    this.ui.fade(() => {
      this.clock.minutes += minutes;
      this.timeSkipped();
      this.needs.give(give);
      after?.();
    }, label);
  }

  fish() {
    const s = this.state;
    const day = Math.floor(this.clock.minutes / 1440);
    const fed = s.fishFed === day;
    this.dialog({
      name: 'AQUARIUM',
      text: this.talk.pick(FISH_LINES),
      choices: [
        { label: 'Watch them for a while', fn: () => this.pass(20, { fun: 7, energy: 4 }, 'UNWINDING', () => this.ui.toast('Twenty minutes gone. Your shoulders came down from your ears.')) },
        {
          label: fed ? 'Feed them (they ate today)' : 'Feed them',
          fn: () => {
            this.ui.closeDialog();
            if (fed) return this.ui.toast("They look hungry. They always look hungry. They've eaten today.");
            s.fishFed = day;
            this.needs.give({ fun: 4 });
            this.audio.tone(1600, 'sine', 0.04, 0.12);
            this.ui.toast('A pinch of flakes. Absolute chaos at the surface. Brenda gets the most.');
          },
        },
        { label: 'Done', fn: () => this.ui.closeDialog() },
      ],
    });
  }

  bar() {
    const s = this.state;
    const day = Math.floor((this.clock.minutes - 6 * 60) / 1440);
    if (s.homeBar?.day !== day) s.homeBar = { day, n: 0 };
    const enough = s.homeBar.n >= 3;
    this.dialog({
      name: 'HOME BAR',
      text: enough ? 'You have had three already. The bar suggests water, in your own voice.' : 'Backlit bottles, a shaker, a bucket of ice. What are you making?',
      choices: [
        ...DRINKS.filter((d) => !enough || !d.booze).map((d) => ({
          label: d.name,
          fn: () =>
            this.pass(10, d.give, 'MIXING', () => {
              if (d.booze) s.homeBar.n++;
              this.audio.tone(1200, 'sine', 0.03, 0.08);
              this.ui.toast(d.line);
            }),
        })),
        { label: 'Not now', fn: () => this.ui.closeDialog() },
      ],
    });
  }

  arcade() {
    const s = this.state;
    this.player.locked = true;
    this.audio.stopMusic();
    this.ui.modal = 'arcade';
    this.ui.setPrompt(null);
    this.runner.start({
      best: s.arcadeBest ?? 0,
      onEnd: ({ score, plays, seconds }) => {
        this.ui.modal = null;
        this.player.locked = false;
        const best = s.arcadeBest ?? 0;
        if (score > best) s.arcadeBest = score;
        this.needs.give({ fun: Math.min(18, 3 * plays + seconds / 20) });
        this.ui.toast(score > best ? `New NIGHT RUNNER high score: ${score.toLocaleString('en-US')}! Your initials go up on the cabinet.` : `NIGHT RUNNER: best tonight ${score.toLocaleString('en-US')} (high score ${(s.arcadeBest ?? 0).toLocaleString('en-US')}).`);
        this.save();
      },
    });
  }

  jukebox() {
    this.dialog({
      name: 'JUKEBOX',
      text: 'Sixty records, chrome and bubbling tubes. Your finger hovers over the buttons.',
      choices: [
        ...RECORDS.map((r) => ({
          label: r.label,
          fn: () => {
            this.ui.closeDialog();
            this.audio.tone(900, 'square', 0.03, 0.05);
            this.audio.startMusic(r.style);
            this.needs.give({ fun: 2 });
            this.ui.toast(r.line);
          },
        })),
        ...(this.audio.music ? [{ label: 'Stop the record', fn: () => (this.ui.closeDialog(), this.audio.stopMusic()) }] : []),
        { label: 'Leave it', fn: () => this.ui.closeDialog() },
      ],
    });
  }

  tub() {
    const hour = (this.clock.minutes / 60) % 24;
    const night = hour >= 19 || hour < 5;
    this.dialog({
      name: 'HOT TUB',
      text: night ? 'Blue light, steam curling up, the city humming outside. The jets are already going.' : 'Hot water, six jets, a little blue light. It is the middle of the day. Nobody can stop you.',
      choices: [
        {
          label: 'Get in (45 min)',
          fn: () =>
            this.pass(45, { hygiene: 30, energy: 18, fun: 20 }, 'SOAKING', () =>
              this.ui.toast(night ? 'Forty-five minutes of jets and city lights. You are a new, slightly wrinkly person.' : 'You soak until your fingers prune. Worth every cent of the twenty-two grand.'),
            ),
        },
        { label: 'Not now', fn: () => this.ui.closeDialog() },
      ],
    });
  }

  admire(kind) {
    const s = this.state;
    const col = collectionsFor(s, TOYS);
    let name;
    let text;
    if (kind === 'sneakers') {
      const n = col.shoes.length;
      const v = col.shoes.reduce((a, it) => a + it.price, 0);
      name = 'SNEAKER WALL';
      text = n ? `${n} pair${n > 1 ? 's' : ''} on the wall, ${money(v)} of rubber and suede. Top cubby: the ${col.shoes[0].name}. Obviously.` : 'Sixteen lit cubbies and not one shoe. SPLITGRAIN is at the Galleria.';
    } else if (kind === 'watches') {
      const n = col.jewels.length;
      const v = col.jewels.reduce((a, it) => a + it.price, 0);
      name = 'WATCH CASE';
      text = n ? `${n} piece${n > 1 ? 's' : ''} under glass, ${money(v)} all told. The ${col.jewels[0].name} catches the light like it knows.` : 'Velvet, glass, little lights, nothing in it. MAISON VELLARD has a case full upstairs at the Galleria.';
    } else if (kind === 'toys') {
      const n = col.toys.length;
      name = 'TROPHY SHELF';
      text = n ? `${n} of ${TOYS.length} Gull Box toys, lined up and staring at you. ${n === TOYS.length ? 'The complete set. You are a legend.' : `${TOYS.length - n} to go. GULLY'S is open till 2.`}` : "Three glass shelves, waiting. Every GULLY'S Gull Box has a toy in it.";
    } else {
      const n = (s.photos ?? []).length;
      name = 'PHOTO WALL';
      text = n ? `${n} strip${n > 1 ? 's' : ''} from the SUBSTATION photo booth. Faces mid-laugh, mid-blink, mid-something. Good nights.` : 'Four empty frames. The photo booth at SUBSTATION takes four for $5.';
    }
    const hourKey = Math.floor(this.clock.minutes / 60);
    if (this.admired[kind] !== hourKey) {
      this.admired[kind] = hourKey;
      this.needs.give({ fun: 3 });
    }
    this.dialog({ name, text, choices: [{ label: 'Nice', fn: () => this.ui.closeDialog() }] });
  }
}
