import { Rng } from '../core/rng.js';

// The Port Halcyon stock market (all companies made up). Prices are worked out
// from the game clock, the same every time you load: each trading day (MON-FRI)
// opens on the morning's news and drifts to its close along a wiggly path, so the
// board really moves while the market is open (9:30 AM - 4 PM). Headlines go up at
// 8 AM; brokers at the Ticker Bar sometimes hear them the evening before.
//
// You buy and sell at a trading terminal (HALCYON EXCHANGE, or a trading desk at
// home): $5 a trade, paid from the bank. Dividends land on Monday mornings.

export const OPEN_H = 9.5;
export const CLOSE_H = 16;
export const COMMISSION = 5;

export const STOCKS = [
  { sym: 'GULL', name: "GULLY'S Group", sector: 'Restaurants', p0: 24.5, vol: 0.017, drift: 0.0007, div: 0.0012, col: '#17a2a8', blurb: 'Burgers, Chip Snatchers and Gull Boxes in eleven harbour towns. Steady, salty.' },
  { sym: 'SPLT', name: 'SPLITGRAIN', sector: 'Apparel', p0: 38.2, vol: 0.03, drift: 0.0011, div: 0, col: '#ff6a2a', blurb: 'Streetwear and sneakers. Moves with the drops and the hype.' },
  { sym: 'VLRD', name: 'Maison Vellard', sector: 'Luxury', p0: 412, vol: 0.013, drift: 0.0006, div: 0.0008, col: '#d8b46a', blurb: 'Cashmere, gold and the Meridian watches. Old money, slow money.' },
  { sym: 'MRDN', name: 'Meridian Holdings', sector: 'Property', p0: 131, vol: 0.012, drift: 0.0005, div: 0.0015, col: '#7fb0e0', blurb: "Owns half of Downtown, including the tower you'd like to live in." },
  { sym: 'BRWR', name: 'Brightwire Electronics', sector: 'Electronics', p0: 9.4, vol: 0.05, drift: -0.0004, div: 0, col: '#5ae8ff', blurb: 'TVs, stereos and a store that has been closed for refit for a while now.' },
  { sym: 'HFRY', name: 'Harbour Freight & Ferry', sector: 'Shipping', p0: 56.1, vol: 0.015, drift: 0.0004, div: 0.0018, col: '#4a7aa8', blurb: 'Cargo through the port and the night ferry. Weather-dependent.' },
  { sym: 'LNTN', name: 'Lantern Light & Power', sector: 'Utilities', p0: 17.8, vol: 0.038, drift: 0.0009, div: 0.001, col: '#c88aff', blurb: 'Keeps the Lantern Quarter glowing. Nobody is quite sure how.' },
  { sym: 'KILN', name: 'Kiln Works Steel', sector: 'Industry', p0: 31.4, vol: 0.021, drift: 0.0003, div: 0.0014, col: '#e8a060', blurb: 'The old works in Kiln Heights. Furnaces, bridges, very orange smoke.' },
];
export const STOCK = Object.fromEntries(STOCKS.map((s) => [s.sym, s]));

const NEWS = {
  GULL: {
    up: ["GULLY'S breakfast sales up 18%: 'the Early Bird is flying'", "GULLY'S to open three new harbour-town sites", "'Ghost Gully' toy resells for $40; Gull Box sales soar"],
    down: ["Fryer recall hits GULLY'S kitchens", 'Rival burger chain undercuts the Gull Stack', "GULLY'S HQ: 'the mascot costume is being cleaned, that is all'"],
  },
  SPLT: {
    up: ['SPLITGRAIN drop sells out in nine minutes', 'SPLITGRAIN signs a pro skater', 'SPLITGRAIN posts a record quarter'],
    down: ['Resellers flood the market with SPLITGRAIN pairs', "SPLITGRAIN hoodie recall: 'too heavy', say customers", "SPLITGRAIN founder steps back 'to focus on vinyl'"],
  },
  VLRD: {
    up: ['Maison Vellard raises prices again; demand rises with them', "Meridian watch waiting list 'now three years'", 'VELLARD opens a salon in a city nobody can afford'],
    down: ['Luxury slowdown hits Maison Vellard', 'Fake VELLARD coats seized at the harbour', "VELLARD creative director quits over 'a disagreement about beige'"],
  },
  MRDN: {
    up: ['Meridian Tower penthouses fully let', 'Meridian Holdings wins the Downtown office tender', 'Meridian buys up waterfront warehouses'],
    down: ['Downtown office vacancies rise; Meridian slips', 'Meridian Tower elevator stuck for six hours', 'Rate fears weigh on Meridian Holdings'],
  },
  BRWR: {
    up: ["BRIGHTWIRE refit 'nearly finished', says the CEO", "Brightwire unveils a TV 'like a window, but louder'", 'Takeover rumours light up Brightwire'],
    down: ['BRIGHTWIRE refit delayed again', "Brightwire recalls remotes 'for being too clicky'", 'Brightwire misses earnings by a mile'],
  },
  HFRY: {
    up: ['Harbour Freight & Ferry adds night crossings', 'Record cargo through Port Halcyon', 'Harbour Freight wins the fish market contract'],
    down: ['Fog shuts the harbour for two days', 'Dock strike talks stall at Harbour Freight', "Night ferry bumps the pier: 'nobody hurt, pier offended'"],
  },
  LNTN: {
    up: ["Lantern Quarter glow 'more efficient than ever'", 'LNTN unveils lanterns that never go out', 'Strange lights over the Quarter lift Lantern Light & Power'],
    down: ['Lantern Quarter blackout lasts eleven minutes; nobody can explain it', "LNTN engineers: 'the tree is fine'. Unconvincingly.", 'Fireflies found inside an LNTN substation'],
  },
  KILN: {
    up: ['Kiln Works lands the new bridge contract', 'Steel prices climb; Kiln Works smiles', 'Kiln Heights loft boom lifts Kiln Works'],
    down: ['Furnace three shut for repairs at Kiln Works', 'Cheap imports squeeze Kiln Works Steel', "Kiln Works fined over 'very orange' smoke"],
  },
};
const MARKET_NEWS = ['Port Halcyon Index hits a record', 'Quiet day on the Exchange floor', 'Brokers blame the weather', 'Halcyon Savings holds rates', 'Tourist season lifts harbour stocks'];

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r.next() * 0.999999)) * Math.cos(2 * Math.PI * r.next());
const cents = (n) => Math.round(n * 100) / 100;
/** Day index (0 = MON of week 1; negative before the game starts) is a trading day? */
export const tradingDay = (d) => ((d % 7) + 7) % 7 < 5;
// the market was trading for nine weeks before you arrived (so the charts have a history)
const EPOCH = 63;

export class Market {
  constructor({ clock, state }) {
    this.clock = clock;
    this.state = state;
    state.market ??= { holdings: {}, trades: 0, realized: 0 };
    this.M = state.market;
    this.days = Object.fromEntries(STOCKS.map((s) => [s.sym, []]));
    this.newsDays = [];
  }

  // ---------------------------------------------------------------- the news
  /** The day's headlines (deterministic): [{ sym, up, text, size }] */
  news(d) {
    if (d < -EPOCH) return [];
    if (this.newsDays[d + EPOCH]) return this.newsDays[d + EPOCH];
    const r = new Rng(9001 + d * 104729);
    const out = [];
    if (tradingDay(d)) {
      const n = r.chance(0.25) ? 2 : r.chance(0.7) ? 1 : 0;
      const used = new Set();
      for (let k = 0; k < n; k++) {
        const s = r.pick(STOCKS);
        if (used.has(s.sym)) continue;
        used.add(s.sym);
        const up = r.chance(0.5 + s.drift * 15);
        out.push({ sym: s.sym, up, text: r.pick(NEWS[s.sym][up ? 'up' : 'down']), size: r.float(1.8, 4.2) });
      }
      // SPLITGRAIN on a Friday: the drop is tomorrow
      if (((d % 7) + 7) % 7 === 4 && !used.has('SPLT')) out.push({ sym: 'SPLT', up: true, text: 'SPLITGRAIN drop tomorrow: lines expected by dawn', size: 0.7 });
      if (!out.length) out.push({ sym: null, up: true, text: r.pick(MARKET_NEWS), size: 0 });
    }
    this.newsDays[d + EPOCH] = out;
    return out;
  }

  /** A broker's tip at the bar on day d: tomorrow's (next trading day's) news, right about 70% of the time. */
  tip(d) {
    let n = d + 1;
    while (!tradingDay(n)) n++;
    const item = this.news(n).find((x) => x.sym);
    if (!item) return null;
    const r = new Rng(77 + d * 31);
    const right = r.chance(0.7);
    return { sym: item.sym, up: right ? item.up : !item.up, day: n };
  }

  /** Headlines visible at a time (today's from 8 AM, plus earlier ones), newest first. */
  headlines(minutes = this.clock.minutes, count = 6) {
    const d = Math.floor(minutes / 1440);
    const h = (minutes / 60) % 24;
    const out = [];
    for (let k = d; k >= d - 10 && out.length < count; k--) {
      if (k === d && h < 8) continue;
      for (const n of this.news(k)) out.push({ ...n, day: k });
    }
    if (this.state.headline && this.state.headline.t <= minutes && minutes - this.state.headline.t < 1440) out.unshift({ sym: null, up: true, text: this.state.headline.text, day: d, you: true });
    return out.slice(0, count);
  }

  // ---------------------------------------------------------------- prices
  /** A day's record for a stock: { open, close, trading, wig } (computed in order and cached). */
  day(sym, d) {
    const arr = this.days[sym];
    if (d < -EPOCH) {
      const s = STOCK[sym];
      return { open: s.p0, close: s.p0, trading: false, wig: [] };
    }
    for (let i = arr.length; i <= d + EPOCH; i++) {
      const k = i - EPOCH; // the game's day index
      const s = STOCK[sym];
      const prev = i ? arr[i - 1].close : s.p0;
      if (!tradingDay(k)) {
        arr.push({ open: prev, close: prev, trading: false, wig: [] });
        continue;
      }
      const r = new Rng(hash(sym) ^ (k * 2654435761));
      let gap = gauss(r) * s.vol * 0.3;
      for (const n of this.news(k)) if (n.sym === sym) gap += (n.up ? 1 : -1) * n.size * s.vol;
      // a slow cycle so stocks have good months and bad months
      const cycle = Math.sin(k / (17 + (hash(sym) & 7)) + (hash(sym) & 15)) * s.vol * 0.25;
      const open = Math.max(0.5, prev * Math.exp(gap));
      const close = Math.max(0.5, open * Math.exp(s.drift + cycle + gauss(r) * s.vol));
      const wig = [0, 1, 2].map((i) => [r.float(0.5, 1.5) * (i + 1) * 2, r.float(0, Math.PI * 2), r.float(0.4, 1)]);
      arr.push({ open, close, trading: true, wig });
    }
    return arr[d + EPOCH];
  }

  /** Price of a stock at a game time (minutes). */
  price(sym, minutes = this.clock.minutes) {
    const d = Math.floor(minutes / 1440);
    const h = (minutes / 60) % 24;
    const D = this.day(sym, d);
    if (!D.trading) return cents(D.close);
    if (h < OPEN_H) return cents(this.day(sym, d - 1).close);
    if (h >= CLOSE_H) return cents(D.close);
    return cents(this.intraday(sym, D, (h - OPEN_H) / (CLOSE_H - OPEN_H)));
  }

  intraday(sym, D, t) {
    const s = STOCK[sym];
    let w = 0;
    for (const [f, ph, a] of D.wig) w += Math.sin(f * Math.PI * 2 * t + ph) * a;
    return Math.max(0.5, D.open + (D.close - D.open) * t + w * Math.sqrt(t * (1 - t)) * s.vol * D.open * 0.9);
  }

  /** The previous close (what today's change is measured from). */
  prevClose(sym, minutes = this.clock.minutes) {
    let d = Math.floor(minutes / 1440) - 1;
    while (d >= -EPOCH && !tradingDay(d)) d--;
    return cents(this.day(sym, d).close);
  }

  /** Closes for the last n trading days up to (not including) today. */
  history(sym, n = 30, minutes = this.clock.minutes) {
    const out = [];
    for (let d = Math.floor(minutes / 1440) - 1; d >= -EPOCH && out.length < n; d--) if (tradingDay(d)) out.unshift(cents(this.day(sym, d).close));
    while (out.length < n) out.unshift(STOCK[sym].p0);
    return out;
  }

  /** Today's path so far, as prices sampled through the session. */
  todayPath(sym, minutes = this.clock.minutes, steps = 26) {
    const d = Math.floor(minutes / 1440);
    const D = this.day(sym, d);
    if (!D.trading) return [];
    const h = (minutes / 60) % 24;
    const tNow = Math.min(1, (h - OPEN_H) / (CLOSE_H - OPEN_H));
    if (tNow <= 0) return [];
    const out = [];
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * tNow;
      out.push(cents(this.intraday(sym, D, t)));
    }
    return out;
  }

  isOpen(minutes = this.clock.minutes) {
    const d = Math.floor(minutes / 1440);
    const h = (minutes / 60) % 24;
    return tradingDay(d) && h >= OPEN_H && h < CLOSE_H;
  }

  /** "OPEN · closes 4:00 PM" or "CLOSED · opens MON 9:30 AM" */
  statusText(minutes = this.clock.minutes) {
    if (this.isOpen(minutes)) return 'MARKET OPEN · closes 4:00 PM';
    const d = Math.floor(minutes / 1440);
    const h = (minutes / 60) % 24;
    let n = h < OPEN_H ? d : d + 1;
    while (!tradingDay(n)) n++;
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return `MARKET CLOSED · opens ${n === d ? 'today' : DAYS[n % 7]} 9:30 AM`;
  }

  // ---------------------------------------------------------------- your portfolio
  holding(sym) {
    return this.M.holdings[sym] ?? { n: 0, cost: 0 };
  }

  /** What your shares are worth right now. */
  value(minutes = this.clock.minutes) {
    let v = 0;
    for (const [sym, h] of Object.entries(this.M.holdings)) v += h.n * this.price(sym, minutes);
    return cents(v);
  }

  /** Buy n shares (n = 'max': as many as the bank covers). Returns { ok, msg }. */
  buy(sym, n) {
    if (!this.isOpen()) return { ok: false, msg: this.statusText() };
    const p = this.price(sym);
    const bank = this.state.bank;
    if (n === 'max') n = Math.floor((bank - COMMISSION) / p);
    if (n <= 0) return { ok: false, msg: `Not enough in the bank for a share of ${sym} (plus the $${COMMISSION} fee).` };
    const cost = cents(n * p + COMMISSION);
    if (cost > bank) return { ok: false, msg: `That's ${money(cost)} with the fee. Your bank has ${money(bank)}.` };
    this.state.bank = cents(bank - cost);
    const h = (this.M.holdings[sym] ??= { n: 0, cost: 0 });
    h.cost = cents(h.cost + n * p);
    h.n += n;
    this.M.trades++;
    this.ledger(`Bought ${n} ${sym} @ ${money(p)}`, -cost);
    return { ok: true, msg: `Bought ${n} ${sym} at ${money(p)}. ${money(cost)} with the fee.`, n, p };
  }

  /** Sell n shares (n = 'all'). */
  sell(sym, n) {
    if (!this.isOpen()) return { ok: false, msg: this.statusText() };
    const h = this.M.holdings[sym];
    if (!h?.n) return { ok: false, msg: `You don't own any ${sym}.` };
    if (n === 'all' || n > h.n) n = h.n;
    const p = this.price(sym);
    const avg = h.cost / h.n;
    const gain = cents((p - avg) * n);
    const proceeds = cents(n * p - COMMISSION);
    h.cost = cents(h.cost - avg * n);
    h.n -= n;
    if (!h.n) delete this.M.holdings[sym];
    this.state.bank = cents(this.state.bank + proceeds);
    this.M.realized = cents(this.M.realized + gain - COMMISSION);
    this.M.trades++;
    this.ledger(`Sold ${n} ${sym} @ ${money(p)}`, proceeds);
    return { ok: true, msg: `Sold ${n} ${sym} at ${money(p)}: ${gain >= 0 ? 'a gain' : 'a loss'} of ${money(Math.abs(gain))}.`, n, p, gain };
  }

  /** Monday morning: a week of dividends on what you hold. Returns the total. */
  payDividends() {
    let total = 0;
    for (const [sym, h] of Object.entries(this.M.holdings)) total += h.n * this.price(sym) * STOCK[sym].div;
    total = cents(total);
    if (total >= 0.01) {
      this.state.bank = cents(this.state.bank + total);
      this.ledger('Dividends', total);
    }
    return total;
  }

  ledger(what, amt) {
    const L = this.state.ledger;
    if (!L) return;
    L.push({ t: Math.round(this.clock.minutes), what, amt: cents(amt) });
    if (L.length > 80) L.splice(0, L.length - 80);
  }
}

export function money(n) {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
