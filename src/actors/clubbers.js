import { CITY } from '../config.js';
import { Rng, damp, smoothstep, angleLerp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';
import { npcWear } from '../game/fashion.js';
import { FIRST_NAMES } from '../game/dialogue.js';
import { nightsFor } from '../game/clubNights.js';

// Everyone at SUBSTATION: the staff, the queue on the pavement, and a pool of
// clubbers who arrive through the lobby, dance, prop up the bar, sit in the
// booths, and file out when the lights come up. How busy it gets depends on the
// night of the week and the time.

const BUSY = { MON: 12, TUE: 12, WED: 16, THU: 24, FRI: 34, SAT: 42, SUN: 18 };
const VIP_BUSY = { MON: 2, TUE: 2, WED: 3, THU: 4, FRI: 6, SAT: 8, SUN: 3 };
const ROOF_BUSY = { MON: 4, TUE: 3, WED: 4, THU: 6, FRI: 8, SAT: 10, SUN: 5 };
const VIBES = ['hyped', 'chill', 'shy', 'chatty', 'raver', 'regular'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const POOL = 56;
const QUEUE = 8;
const WALK = 1.25;

function clubLook(rng, look = ['#141418', '#2b2b30', '#e8e4dc', '#7a2330', '#1f2e4a', '#e86a2a', '#d77aa0', '#5ac8d8']) {
  const a = randomAppearance(rng);
  // dressed for a night out (in tonight's colours): darker tops, more jackets, the odd bright colour
  if (rng.chance(0.6)) a.top = rng.pick(look);
  if (rng.chance(0.4)) a.topStyle = 2;
  a.jacket = rng.pick(['#141418', '#2b2b30', '#5a4632', '#7a2330', '#3a3a6a', '#c9b48a']);
  a.bottomStyle = rng.chance(0.08) ? 1 : 0;
  // chains, shades, caps and the odd designer watch; the clothes above stay as they are
  const w = npcWear(a, rng, 0.45).wear;
  return { ...a, wear: { shoes: w.shoes, hat: w.hat, glasses: w.glasses, chain: w.chain, watch: w.watch } };
}

export class Clubbers {
  constructor(crowd, club, city) {
    this.crowd = crowd;
    this.club = club;
    this.city = city;
    this.rng = new Rng(4242);
    const rng = this.rng;
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    const black = (extra = {}) => ({ ...clubLook(rng), top: '#141418', topStyle: 2, jacket: '#0e0e10', bottom: '#141418', shoes: '#1e1e22', ...extra });
    this.staff = {
      bouncer: { c: mk(black({ build: 1.18, height: 1.07, hairStyle: 4 })), name: 'Dmitri', spot: club.bouncerSpot },
      security: { c: mk(black({ build: 1.12, height: 1.04 })), name: 'Security', spot: club.securitySpot },
      dj: { c: mk({ ...clubLook(rng), topStyle: 0, top: '#e8e4dc', hairStyle: 3, hair: '#e07aa8' }), name: 'DJ Halflife', spot: club.djSpot },
      coat: { c: mk({ ...clubLook(rng), topStyle: 1, top: '#8a2a3e' }), name: 'Coat check', spot: club.coatSpot },
      vendor: { c: mk({ ...clubLook(rng), topStyle: 0, top: '#f2f0e8', jacket: '#c82a2a' }), name: 'Ray', spot: club.vendorSpot },
    };
    this.bartenders = [0, 1].map((k) => ({ c: mk({ ...clubLook(rng), topStyle: 1, top: k ? '#141418' : '#e8e4dc' }), spot: k, until: 0, work: 0 }));
    // everyone has a name and a vibe, stable from night to night (friendships are saved by key)
    const who = (group, k, vibe) => ({ key: `club:${group}:${k}`, name: FIRST_NAMES[(k * 7 + group.length * 5 + 3) % FIRST_NAMES.length], vibe: vibe ?? VIBES[(k * 5 + group.length) % VIBES.length] });
    this.pool = [];
    for (let k = 0; k < POOL; k++) this.pool.push({ c: mk(clubLook(rng)), mode: 'off', path: [], spot: null, groove: rng.float(-0.06, 0.06), move: rng.int(0, 3), nextMove: 0, ox: 0, oz: 0, ...who('floor', k) });
    // regulars: everyone has their usual nights
    for (const a of this.pool) a.nights = nightsFor(a.k ?? this.pool.indexOf(a), a.vibe);
    this.greeted = new Map(); // key -> night they came over to say hi
    this.greetT = 8;
    this.greeter = null;
    this.djAway = false; // the DJ steps aside while you play
    this.offShift = new Set(); // bartenders you're covering for
    // VIPs on the balcony and smokers on the roof just stay put
    const sharp = () => ({ ...clubLook(rng), topStyle: 2, jacket: rng.pick(['#141418', '#e8e4dc', '#7a2330', '#c9b48a']) });
    this.vips = [];
    for (let k = 0; k < 8; k++) this.vips.push({ c: mk(sharp()), mode: 'off', spot: null, group: 'vip', groove: rng.float(0, 6), ...who('vip', k, k % 2 ? 'flash' : 'regular') });
    this.roofers = [];
    for (let k = 0; k < 10; k++) this.roofers.push({ c: mk(clubLook(rng)), mode: 'off', spot: null, group: 'roof', groove: rng.float(0, 6), ...who('roof', k, k % 3 ? 'chill' : 'chatty') });
    this.staff.host = { c: mk(black({ topStyle: 2, jacket: '#2a2a30', top: '#e8e4dc', hairStyle: 2 })), name: 'Celeste', spot: club.vipHostSpot };
    this.staff.roofBar = { c: mk({ ...clubLook(rng), topStyle: 1, top: '#2a5ab0' }), name: 'Roof bar', spot: club.roofBartenderSpot };
    this.partner = null; // a clubber dancing with the player
    this.queue = [];
    for (let k = 0; k < QUEUE; k++) this.queue.push({ c: mk(clubLook(rng)), mode: 'off', path: [], slot: -1 });
    this.taken = new Set();
    this.arriveTimer = 0;
    this.leaveTimer = 0;
    this.queueTimer = 4;
    this.seen = false;
  }

  /** Tonight's theme: everyone turns up dressed for it. */
  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    const rng = new Rng(night.id.length * 977 + 13);
    for (const a of [...this.pool, ...this.queue, ...this.roofers]) this.crowd.setAppearance(a.c.id, clubLook(rng, night.look));
  }

  /** How many are waiting in line outside. */
  queueLength() {
    return this.queue.filter((q) => q.mode === 'wait').length;
  }

  /** Who walks in next: friends whose night it is, then regulars, then anyone (a big night needs everyone). */
  nextArrival(weekday, rel = {}) {
    const off = this.pool.filter((p) => p.mode === 'off');
    if (!off.length) return null;
    const score = (a) => (a.nights.has(weekday) ? 2 : 0) + ((rel[a.key] ?? 0) >= 20 && a.nights.has(weekday) ? 2 : 0) + this.rng.next();
    off.sort((p, q) => score(q) - score(p));
    return off[0];
  }

  /** People who can open the club's street doors. */
  people() {
    const out = [];
    for (const a of this.queue) if (a.mode === 'enter') out.push(a.c);
    for (const a of this.pool) if (a.c.visible && (a.mode === 'walk' || a.mode === 'leave')) out.push(a.c);
    return out;
  }

  /** Keep the player from walking through people (dancers step aside instead). */
  push(pos, r) {
    const all = [this.staff.bouncer, this.staff.security, this.staff.vendor, ...this.queue, ...this.pool];
    for (const a of all) {
      const c = a.c;
      if (!c.visible) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      if (Math.abs(c.ground - pos.y) > 0.6) continue;
      const rr = r + (a.mode === 'dance' ? 0.16 : 0.26);
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      }
    }
  }

  ground(x, z) {
    return this.club.contains({ x, y: 0, z }) ? this.club.origin.y : this.city.groundHeight(x, z);
  }

  place(c, x, z, yaw, y = null) {
    c.x = x;
    c.z = z;
    c.ground = this.ground(x, z);
    c.y = y ?? c.ground;
    if (yaw !== undefined) c.yaw = yaw;
  }

  /** Walk along a.path; returns true when the path is done. */
  walk(a, dt) {
    const c = a.c;
    const t = a.path[0];
    if (!t) return true;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = WALK * dt;
    c.amount = damp(c.amount, 1, 6, dt);
    c.run = 0;
    if (d <= step) {
      c.x = t.x;
      c.z = t.z;
      a.path.shift();
    } else {
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
    }
    c.phase += step * 2.7;
    c.ground = this.ground(c.x, c.z);
    c.y = c.ground;
    return a.path.length === 0;
  }

  idle(c, dt) {
    c.amount = damp(c.amount, 0, 6, dt);
  }

  // ==========================================================================
  /**
   * s: { status, hour, weekday (of the night), beat, energy, section, playerPos,
   *      playerInside (in the building), near (camera close enough to bother) }
   */
  update(dt, s) {
    const club = this.club;
    const rng = this.rng;
    const open = s.status === 'open';
    const staffOn = s.status !== 'closed';
    const show = s.near;
    const beat = s.beat;
    const hit = Math.pow(Math.abs(Math.cos(Math.PI * beat)), 6);
    const inside = s.playerInside;

    // ---------------------------------------------------------------- staff
    for (const key of ['bouncer', 'security', 'dj', 'coat', 'host', 'roofBar']) {
      const st = this.staff[key];
      const c = st.c;
      c.visible = show && staffOn && (key === 'roofBar' || key === 'bouncer' || s.playerInside || s.nearDoor || key === 'dj');
      if (key === 'roofBar') c.visible = show && open;
      if (!c.visible) continue;
      this.place(c, st.spot.x, st.spot.z, undefined, st.spot.y ?? null);
      if (st.spot.y != null) c.ground = st.spot.y;
      if (key === 'dj' && this.djAway && club.djAsideSpot) {
        // watching your set from the side of the booth
        this.place(c, club.djAsideSpot.x, club.djAsideSpot.z, club.djAsideSpot.yaw);
        c.ground = club.origin.y;
        c.work = false;
        c.nod = 0.12 * hit;
      } else if (key === 'dj') {
        c.yaw = 0;
        c.work = open;
        c.nod = open ? 0.18 * hit : 0;
      } else {
        // look at the player when they're close
        const dx = s.playerPos.x - c.x;
        const dz = s.playerPos.z - c.z;
        const want = Math.hypot(dx, dz) < 4 ? Math.atan2(dx, dz) : st.spot.yaw;
        c.yaw = angleLerp(c.yaw, want, Math.min(1, dt * 3));
        c.nod = key === 'coat' && open ? 0.05 * hit : 0;
      }
      this.idle(c, dt);
    }
    const v = this.staff.vendor;
    v.c.visible = show && club.cartOpen;
    if (v.c.visible) {
      this.place(v.c, v.spot.x, v.spot.z, v.spot.yaw);
      v.c.work = Math.sin(s.time * 0.4) > 0.2;
      this.idle(v.c, dt);
    }
    for (const b of this.bartenders) {
      const c = b.c;
      c.visible = show && staffOn && !this.offShift.has(b);
      if (!c.visible) continue;
      if (!c._placed) {
        const sp = club.bartenderSpots[b.spot];
        this.place(c, sp.x, sp.z, sp.yaw);
        c._placed = true;
      }
      if (b.path?.length) {
        c.work = false;
        if (this.walk(b, dt)) c.yaw = club.bartenderSpots[b.spot].yaw;
      } else {
        this.idle(c, dt);
        c.work = open && b.work > 0;
        b.work -= dt;
        c.yaw = angleLerp(c.yaw, club.bartenderSpots[b.spot].yaw, Math.min(1, dt * 5));
        if (s.time > b.until) {
          b.until = s.time + rng.float(4, 9);
          b.work = rng.float(2, 4);
          const other = this.bartenders.find((o) => o !== b);
          let next = rng.int(0, 2);
          if (next === other.spot) next = (next + 1) % 3;
          if (next !== b.spot) {
            b.spot = next;
            b.path = [club.bartenderSpots[next]];
          }
        }
      }
    }

    // ---------------------------------------------------------------- crowd size
    const h = s.hour < 12 ? s.hour + 24 : s.hour;
    const fill = smoothstep(22, 23.75, h) * (1 - 0.45 * smoothstep(27, 28, h));
    const target = open ? Math.round((BUSY[s.weekday] ?? 16) * fill) : 0;
    const present = this.pool.filter((a) => a.mode !== 'off' && a.mode !== 'leave');
    // the player isn't looking: just make it so
    if (!inside || !this.seen) {
      while (present.length < target) {
        const a = this.nextArrival(s.weekday, s.rel);
        if (!a) break;
        this.assign(a, true);
        present.push(a);
      }
      while (present.length > target) this.despawn(present.pop());
      for (const a of this.pool) if (a.mode === 'leave' || a.mode === 'walk') this.finishInstantly(a);
    } else {
      // the player is inside: people walk in and out through the lobby
      if (present.length < target && (this.arriveTimer -= dt) <= 0) {
        this.arriveTimer = rng.float(1.5, 4);
        const a = this.nextArrival(s.weekday, s.rel);
        if (a) this.assign(a, false);
      }
      const leaveRate = s.status === 'lightsup' ? 0.35 : rng.float(2, 5);
      if (present.length > target && (this.leaveTimer -= dt) <= 0) {
        this.leaveTimer = leaveRate;
        const a = present[Math.floor(rng.next() * present.length)];
        if (a) this.leave(a);
      }
    }
    this.seen = inside;

    // a friend who's in tonight comes over to say hi (one at a time)
    if (open && inside && s.playerFree && !this.greeter && (this.greetT -= dt) <= 0) {
      this.greetT = rng.float(6, 14);
      const night = s.nightIndex;
      const friend = present.find((a) => (s.rel?.[a.key] ?? 0) >= 20 && this.greeted.get(a.key) !== night && (a.mode === 'dance' || a.mode === 'bar' || a.mode === 'sit') && !a.talking && this.partner !== a);
      if (friend) {
        this.greeted.set(friend.key, night);
        this.greeter = friend;
        friend.returnMode = friend.mode;
        friend.mode = 'greet';
        friend.greetPhase = 'go';
        friend.greetT = 20;
        friend.c.sit = false;
      }
    }

    // occasionally someone swaps the floor for the bar, or the bar for the floor
    if (open && inside && rng.chance(dt * 0.12)) {
      const a = rng.pick(present);
      if (a && (a.mode === 'dance' || a.mode === 'bar')) this.reassign(a, a.mode === 'dance' ? 'bar' : 'dance');
    }

    // ---------------------------------------------------------------- pool
    const hallVisible = show && (inside || s.nearDoor);
    const S = s.section;
    for (const a of this.pool) {
      const c = a.c;
      if (a.mode === 'off') {
        c.visible = false;
        continue;
      }
      c.visible = hallVisible;
      c.beat = beat;
      if (a.mode === 'greet') {
        this.updateGreeter(a, dt, s);
        continue;
      }
      if (a.mode === 'walk' || a.mode === 'leave') {
        c.dance = damp(c.dance || 0, 0, 8, dt);
        c.sit = false;
        if (this.walk(a, dt)) {
          if (a.mode === 'leave') this.despawn(a);
          else this.arrive(a);
        }
        continue;
      }
      this.idle(c, dt);
      if (a.mode === 'dance') {
        // pick a new move every few bars; the drop gets the hands in the air
        if (beat > a.nextMove) {
          a.nextMove = Math.ceil(beat / 4) * 4 + rng.pick([8, 16]);
          const r = rng.next();
          a.move = S?.name === 'drop' ? (r < 0.45 ? 1 : r < 0.75 ? 0 : 2) : S?.name === 'breakdown' ? (r < 0.6 ? 2 : 3) : r < 0.4 ? 2 : r < 0.7 ? 3 : 0;
          c.move = a.move;
        }
        let want = open ? (S ? 0.45 + 0.55 * S.energy : 0.7) : 0;
        // during your DJ set the floor follows the crowd's energy
        if (s.crowdBoost != null) want *= 0.3 + 0.9 * s.crowdBoost;
        if (a.talking) want = 0.15;
        if (this.partner === a) {
          want = 1;
          c.move = this.partnerMove ?? c.move;
          a.nextMove = beat + 4;
        }
        c.dance = damp(c.dance || 0, want, 2, dt);
        c.talk = !!a.talking;
        // step aside when the player squeezes past
        let tx = 0;
        let tz = 0;
        const px = a.spot.x - s.playerPos.x;
        const pz = a.spot.z - s.playerPos.z;
        const pd = Math.hypot(px, pz);
        if (pd < 0.75 && pd > 1e-3) {
          tx = (px / pd) * (0.75 - pd) * 0.6;
          tz = (pz / pd) * (0.75 - pd) * 0.6;
        }
        a.ox = damp(a.ox, tx, 6, dt);
        a.oz = damp(a.oz, tz, 6, dt);
        c.x = a.spot.x + a.ox;
        c.z = a.spot.z + a.oz;
        const face = a.talking || this.partner === a ? Math.atan2(s.playerPos.x - c.x, s.playerPos.z - c.z) : a.spot.yaw;
        c.yaw = angleLerp(c.yaw, face, Math.min(1, dt * (a.talking ? 6 : 2)));
        // cheer when the player's on fire nearby
        if (s.hype > 0.5 && Math.hypot(s.playerPos.x - c.x, s.playerPos.z - c.z) < 3.2) {
          c.yaw = angleLerp(c.yaw, Math.atan2(s.playerPos.x - c.x, s.playerPos.z - c.z), Math.min(1, dt * 3));
          c.move = 1;
        }
      } else if (a.mode === 'bar') {
        c.dance = 0;
        c.nod = 0.07 * hit;
        c.talk = a.talking || Math.sin(s.time * 0.3 + a.groove * 100) > 0.6;
        c.yaw = angleLerp(c.yaw, a.talking ? Math.atan2(s.playerPos.x - c.x, s.playerPos.z - c.z) : a.spot.yaw, Math.min(1, dt * 4));
      } else if (a.mode === 'sit') {
        c.dance = 0;
        c.sit = true;
        c.nod = 0.05 * hit;
        c.talk = a.talking || Math.sin(s.time * 0.25 + a.groove * 80) > 0.3;
        c.y = c.ground + 0.5 - 0.86 * c.app.height;
        c.yaw = a.spot.yaw;
      }
    }

    // ---------------------------------------------------------------- balcony and roof
    // a big bottle fills the balcony for a while (main.js vipHost sets vipBoost)
    const boost = this.vipBoostUntil > performance.now() ? this.vipBoost : 0;
    const fillVip = open ? Math.max(boost, Math.round((VIP_BUSY[s.weekday] ?? 3) * Math.max(0.4, fill))) : 0;
    const fillRoof = open ? Math.round((ROOF_BUSY[s.weekday] ?? 4) * Math.max(0.3, fill)) : 0;
    this.settle(this.vips, fillVip, club.vipSeats, !inside);
    this.settle(this.roofers, fillRoof, [...club.roofStand, ...club.roofSeats], !s.onRoof);
    for (const a of [...this.vips, ...this.roofers]) {
      const c = a.c;
      c.visible = a.mode !== 'off' && (a.group === 'roof' ? show : show && (inside || s.nearDoor));
      if (!c.visible) continue;
      c.beat = beat;
      this.idle(c, dt);
      const sp = a.spot;
      c.sit = !!(sp.vip || (sp.roof && sp.yaw !== undefined && club.roofSeats.includes(sp)));
      c.x = sp.x;
      c.z = sp.z;
      c.ground = sp.y;
      c.y = c.sit ? sp.y + 0.5 - 0.86 * c.app.height : sp.y;
      if (!a.talking) c.yaw = angleLerp(c.yaw, sp.yaw, Math.min(1, dt * 3));
      c.nod = (a.group === 'vip' ? 0.06 : 0.03) * hit;
      c.talk = a.talking || Math.sin(s.time * 0.27 + a.groove) > 0.1;
      c.dance = 0;
    }

    // ---------------------------------------------------------------- queue
    const queueLen = open && h < 26.5 ? Math.max(0, Math.min(QUEUE, Math.round(target / 5))) : 0;
    const qs = club.queueSpots;
    const inQ = this.queue.filter((q) => q.mode !== 'off' && q.mode !== 'enter');
    for (const q of this.queue) {
      q.c.visible = show && q.mode !== 'off';
      if (q.mode === 'off') continue;
      q.c.beat = beat;
      if (q.path.length) {
        if (this.walk(q, dt)) {
          if (q.mode === 'enter') {
            q.mode = 'off';
            q.c.visible = false;
          } else q.c.yaw = qs[q.slot]?.yaw ?? q.c.yaw;
        }
      } else {
        this.idle(q.c, dt);
        q.c.nod = 0.05 * hit;
        q.c.talk = q.slot % 3 === 1 && Math.sin(s.time * 0.2 + q.slot) > 0;
      }
    }
    // fill the line from the pavement (or instantly when nobody's watching)
    if (inQ.length < queueLen) {
      const q = this.queue.find((p) => p.mode === 'off');
      if (q) {
        q.slot = inQ.length;
        q.mode = 'wait';
        const sp = qs[q.slot];
        if (s.nearDoor) {
          this.place(q.c, sp.x - 6, sp.z, Math.PI / 2);
          q.path = [{ x: sp.x, z: sp.z }];
        } else {
          this.place(q.c, sp.x, sp.z, sp.yaw);
          q.path = [];
        }
      }
    } else if (inQ.length > queueLen) {
      const q = inQ.reduce((m, p) => (p.slot > m.slot ? p : m), inQ[0]);
      q.mode = 'off';
    }
    // let the front of the line in every few seconds
    if (open && inQ.length && (this.queueTimer -= dt) <= 0) {
      this.queueTimer = rng.float(5, 11);
      const front = inQ.find((q) => q.slot === 0 && !q.path.length);
      if (front) {
        front.mode = 'enter';
        front.path = [club.doorOut, club.doorIn];
        for (const q of inQ)
          if (q !== front) {
            q.slot--;
            q.path = [{ x: qs[q.slot].x, z: qs[q.slot].z }];
          }
      }
    }
  }

  /** A friend walking over to say hi, chatting for a moment, and going back to what they were doing. */
  updateGreeter(a, dt, s) {
    const c = a.c;
    const pp = s.playerPos;
    c.dance = damp(c.dance || 0, 0, 8, dt);
    c.sit = false;
    const end = () => {
      a.greetPhase = 'back';
      c.talk = false;
      a.path = [{ x: a.spot.x, z: a.spot.z }];
    };
    if (a.greetPhase === 'go') {
      const dx = c.x - pp.x;
      const dz = c.z - pp.z;
      const d = Math.hypot(dx, dz) || 1;
      a.path = [{ x: pp.x + (dx / d) * 0.95, z: pp.z + (dz / d) * 0.95 }];
      this.walk(a, dt);
      if (d < 1.15) {
        a.greetPhase = 'talk';
        a.greetT = 4;
        s.onGreet?.(a);
      } else if ((a.greetT -= dt) <= 0 || !s.playerFree) end();
    } else if (a.greetPhase === 'talk') {
      this.idle(c, dt);
      c.talk = true;
      c.yaw = angleLerp(c.yaw, Math.atan2(pp.x - c.x, pp.z - c.z), Math.min(1, dt * 6));
      if ((a.greetT -= dt) <= 0) end();
    } else if (this.walk(a, dt)) {
      a.mode = a.returnMode ?? 'dance';
      if (a.mode === 'sit') c.sit = true;
      this.arrive(a);
      this.greeter = null;
    }
  }

  /** Fill (or empty) a group of people who just sit or stand in fixed spots. */
  settle(list, want, spots, instant) {
    const on = list.filter((a) => a.mode !== 'off');
    if (on.length === want) return;
    // only change who's there when the player can't see it happen
    if (!instant && !(on.length > want && this.rng.chance(0.002))) return;
    while (on.length < want) {
      const a = list.find((p) => p.mode === 'off');
      const free = spots.filter((sp) => !this.taken.has(sp));
      if (!a || !free.length) break;
      a.spot = this.rng.pick(free);
      this.taken.add(a.spot);
      a.mode = 'stay';
      a.c.yaw = a.spot.yaw;
      on.push(a);
    }
    while (on.length > want) {
      const a = on.pop();
      this.taken.delete(a.spot);
      a.mode = 'off';
      a.c.visible = false;
      a.c.sit = false;
    }
  }

  /** The nearest clubber you could talk to (same floor, standing still). */
  nearest(pos, r) {
    let best = null;
    let bd = r;
    for (const a of [...this.pool, ...this.vips, ...this.roofers]) {
      const c = a.c;
      if (!c.visible || a.mode === 'off' || a.mode === 'walk' || a.mode === 'leave') continue;
      if (Math.abs(c.ground - pos.y) > 0.7) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** Seats nobody's sitting in (for the player). */
  freeSeats() {
    return [...this.club.seats, ...this.club.vipSeats, ...this.club.roofSeats, ...(this.club.greenSeats ?? [])].filter((sp) => !this.taken.has(sp));
  }

  // ==========================================================================
  freeSpot(kind) {
    const club = this.club;
    const list = kind === 'bar' ? club.barSpots : kind === 'sit' ? club.seats : club.danceSpots;
    const free = list.filter((sp) => !this.taken.has(sp));
    if (!free.length) return null;
    // dancers fill the middle of the floor first
    if (kind === 'dance') {
      const cx = club.floorCenter.x;
      const cz = club.floorCenter.z;
      free.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz));
      return free[Math.floor(Math.pow(this.rng.next(), 2) * Math.min(free.length, 30))];
    }
    return this.rng.pick(free);
  }

  pickRole() {
    const r = this.rng.next();
    if (r < 0.16 && this.club.barSpots.some((sp) => !this.taken.has(sp))) return 'bar';
    if (r < 0.34 && this.club.seats.some((sp) => !this.taken.has(sp))) return 'sit';
    return 'dance';
  }

  assign(a, instant) {
    const role = this.pickRole();
    const sp = this.freeSpot(role);
    if (!sp) return;
    this.taken.add(sp);
    a.spot = sp;
    a.role = role;
    a.ox = a.oz = 0;
    const c = a.c;
    c.sit = false;
    c.dance = 0;
    c.talk = false;
    c.nod = 0;
    if (instant) {
      this.place(c, sp.x, sp.z, sp.yaw);
      a.mode = role;
      a.path = [];
      c.dance = role === 'dance' ? 0.8 : 0;
    } else {
      this.place(c, this.club.doorIn.x, this.club.doorIn.z, Math.PI);
      a.mode = 'walk';
      a.path = [this.club.lobbyDoor, this.club.hallDoor, { x: sp.x, z: sp.z }];
    }
  }

  arrive(a) {
    a.mode = a.role;
    this.place(a.c, a.spot.x, a.spot.z, a.spot.yaw);
  }

  reassign(a, role) {
    const sp = this.freeSpot(role);
    if (!sp) return;
    this.taken.delete(a.spot);
    this.taken.add(sp);
    a.spot = sp;
    a.role = role;
    a.mode = 'walk';
    a.c.sit = false;
    a.path = [{ x: sp.x, z: sp.z }];
  }

  leave(a) {
    this.taken.delete(a.spot);
    a.mode = 'leave';
    a.c.sit = false;
    a.c.talk = false;
    const club = this.club;
    a.path = [club.hallDoor, club.lobbyDoor, club.doorIn, club.doorOut, { x: club.doorOut.x + (this.rng.chance(0.5) ? -9 : 9), z: club.doorOut.z + 1.2 }];
  }

  finishInstantly(a) {
    if (a.mode === 'leave') this.despawn(a);
    else this.arrive(a);
    a.path = [];
  }

  despawn(a) {
    if (this.greeter === a) this.greeter = null;
    if (a.spot) this.taken.delete(a.spot);
    a.spot = null;
    a.mode = 'off';
    a.path = [];
    a.c.visible = false;
    a.c.sit = false;
    a.c.dance = 0;
    a.c.talk = false;
  }

  static weekdayOfNight(minutes) {
    // a night belongs to the evening it started on (2 AM Saturday is still Friday night)
    return DAYS[Math.floor((minutes - 6 * 60) / 1440) % 7];
  }
}
