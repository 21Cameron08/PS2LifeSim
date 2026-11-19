import { SPB, sectionAt } from '../audio/clubTrack.js';

// The dance floor rhythm game. Arrows scroll toward a hit line; press the matching
// direction on the beat. Timing is judged against the club's sound system clock
// (what you hear), not frame time. A groove meter fills with good timing: it
// upgrades your moves, and once you're on fire the dancers around you turn and cheer.

const DIRS = ['◀', '▲', '▶', '▼'];
const KEYS = {
  ArrowLeft: 0,
  KeyA: 0,
  ArrowUp: 1,
  KeyW: 1,
  ArrowRight: 2,
  KeyD: 2,
  ArrowDown: 3,
  KeyS: 3,
};
const LOOK = 4; // beats of notes visible ahead
const PERFECT = 0.07; // seconds
const GOOD = 0.14;
const LATE = 0.2;

function hash(n) {
  const s = Math.sin(n * 91.3458 + 17.17) * 47453.5453;
  return s - Math.floor(s);
}

/** Beat positions (within one bar, in beats) that get an arrow, by section. */
function pattern(S) {
  if (!S || S.name === 'breakdown') return [];
  if (S.name === 'intro') return [0, 2];
  if (S.name === 'groove') return [0, 1, 2, 3];
  if (S.name === 'build') return S.bar >= S.len - 1 ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1, 2, 3];
  return [0, 1, 1.5, 2, 3]; // drop
}

export class DanceGame {
  /** opts: { ui, audio, getBeat() -> beats heard, onEnd(result), onHype(level) } */
  constructor(opts) {
    Object.assign(this, opts);
    this.active = false;
    this.el = document.getElementById('dance');
    this.notesEl = document.getElementById('dance-notes');
    this.judgeEl = document.getElementById('dance-judge');
    this.comboEl = document.getElementById('dance-combo');
    this.fillEl = document.getElementById('dance-fill');
    this.restEl = document.getElementById('dance-rest');
    this.pool = [];
    for (let k = 0; k < 16; k++) {
      const n = document.createElement('div');
      n.className = 'dnote';
      this.notesEl.appendChild(n);
      this.pool.push(n);
    }
    document.querySelectorAll('#dance-pad [data-d]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.press(Number(b.dataset.d));
      }),
    );
    document.getElementById('dance-stop').addEventListener('click', () => this.stop());
  }

  start({ buzz = 0, partner = null } = {}) {
    this.active = true;
    this.buzz = buzz;
    this.partner = partner;
    this.combo = 0;
    this.best = 0;
    this.perfects = 0;
    this.goods = 0;
    this.misses = 0;
    this.groove = 20;
    this.judged = new Map(); // beat -> 'perfect' | 'good' | 'miss'
    this.flash = 0;
    this.el.classList.remove('hidden');
    this.judgeEl.textContent = 'READY';
    this.comboEl.textContent = '';
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    const total = this.perfects + this.goods + this.misses;
    this.onEnd?.({ best: this.best, perfects: this.perfects, goods: this.goods, misses: this.misses, total, groove: this.groove, partner: this.partner });
  }

  /** Your current move for the dancing puppet, from the groove meter. */
  get move() {
    return this.groove > 75 ? 1 : this.groove > 50 ? 0 : this.groove > 25 ? 2 : 3;
  }

  get hype() {
    return this.active ? Math.max(0, (this.groove - 60) / 40) : 0;
  }

  /** Arrow positions (in beats) near `now`, with a direction each. */
  notesAround(now, before, after) {
    const out = [];
    for (let bar = Math.floor((now - before) / 4); bar <= Math.floor((now + after) / 4); bar++) {
      const S = sectionAt(bar);
      for (const off of pattern(S)) {
        const b = bar * 4 + off;
        if (b < now - before || b > now + after) continue;
        out.push({ b, dir: Math.floor(hash(b * 2) * 4) });
      }
    }
    return out;
  }

  press(dir) {
    if (!this.active) return;
    const now = this.getBeat();
    const win = 1 + this.buzz * 0.3; // a drink or two loosens you up
    const near = this.notesAround(now, LATE / SPB, LATE / SPB).filter((n) => !this.judged.has(n.b));
    if (!near.length) return; // pressing between arrows is free
    near.sort((a, b) => Math.abs(a.b - now) - Math.abs(b.b - now));
    const n = near[0];
    const err = Math.abs(n.b - now) * SPB;
    let j = 'miss';
    if (n.dir === dir && err <= PERFECT * win) j = 'perfect';
    else if (n.dir === dir && err <= GOOD * win) j = 'good';
    this.judge(n.b, j);
  }

  judge(b, j) {
    this.judged.set(b, j);
    if (j === 'miss') {
      this.misses++;
      this.combo = 0;
      this.groove = Math.max(0, this.groove - 8);
    } else {
      if (j === 'perfect') this.perfects++;
      else this.goods++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const before = this.groove;
      this.groove = Math.min(100, this.groove + (j === 'perfect' ? 4 : 2) + Math.min(3, this.combo / 10));
      if (before < 75 && this.groove >= 75) this.onHype?.(1);
    }
    this.judgeEl.textContent = j === 'perfect' ? 'PERFECT!' : j === 'good' ? 'GOOD' : 'MISS';
    this.judgeEl.className = j;
    this.comboEl.textContent = this.combo > 2 ? `${this.combo} COMBO` : '';
    this.flash = 1;
  }

  key(code) {
    if (code in KEYS) {
      this.press(KEYS[code]);
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return;
    const now = this.getBeat();
    // arrows that slipped past unjudged are misses
    for (const n of this.notesAround(now, 2, 0)) if (!this.judged.has(n.b) && (now - n.b) * SPB > LATE) this.judge(n.b, 'miss');
    for (const b of this.judged.keys()) if (b < now - 8) this.judged.delete(b);
    // draw
    const notes = this.notesAround(now, 0.6, LOOK);
    const S = sectionAt(Math.floor(now / 4));
    this.restEl.textContent = S.name === 'breakdown' ? 'breakdown · catch your breath' : S.name === 'build' ? 'it’s building…' : '';
    this.pool.forEach((el, k) => {
      const n = notes[k];
      if (!n) {
        el.style.display = 'none';
        return;
      }
      const j = this.judged.get(n.b);
      el.style.display = 'block';
      el.textContent = DIRS[n.dir];
      el.className = `dnote d${n.dir}${j ? ` ${j}` : ''}`;
      el.style.left = `${8 + ((n.b - now) / LOOK) * 88}%`;
    });
    this.fillEl.style.width = `${this.groove}%`;
    this.fillEl.classList.toggle('hot', this.groove > 75);
    this.groove = Math.max(0, this.groove - dt * 0.8); // stand still and it fades
  }
}
