// NIGHT RUNNER (1999): the one game on the arcade cabinet you can buy at ROOMSET.
// A courier runs the rooftops at night: jump the vents and the gaps, grab the
// coins, don't look down. Drawn on a tiny 320x180 canvas, scaled up chunky.
// Space / E / ↑ / tap jumps (hold for higher), Esc leaves.

const W = 320;
const H = 180;
const GROUND = 140;
const GRAV = 900;
const JUMP = 330;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class NightRunner {
  constructor({ audio }) {
    this.audio = audio;
    this.active = false;
    this.el = null;
  }

  mount() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'arcade';
    el.className = 'hidden';
    el.innerHTML = `<div class="arcade-cab"><canvas width="${W}" height="${H}"></canvas><div class="arcade-foot"><span>SPACE / E / TAP jump · hold to jump higher</span><button class="reg-btn" data-quit><span>ESC</span>Leave</button></div></div>`;
    document.getElementById('ui')?.appendChild(el) ?? document.body.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas');
    this.g = this.cv.getContext('2d');
    el.querySelector('[data-quit]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });
    const press = (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.down();
    };
    const release = () => this.active && this.up();
    this.cv.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    this.onKey = (e) => {
      if (!this.active) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return this.stop();
      }
      if (['Space', 'KeyE', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'keydown' && !e.repeat) this.down();
        if (e.type === 'keyup') this.up();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  start({ best, onEnd }) {
    this.mount();
    this.best = best;
    this.onEnd = onEnd;
    this.active = true;
    this.plays = 0;
    this.topScore = 0;
    this.started = performance.now();
    this.el.classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.reset();
    this.mode = 'title';
    this.last = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.mode === 'run') this.topScore = Math.max(this.topScore, this.score); // walked away mid-run: it still counts
    this.el.classList.add('hidden');
    document.body.classList.remove('in-menu');
    this.onEnd?.({ score: this.topScore, plays: this.plays, seconds: (performance.now() - this.started) / 1000 });
  }

  reset() {
    this.r = rng(Math.floor(Math.random() * 1e9));
    this.t = 0;
    this.dist = 0;
    this.speed = 120;
    this.coins = 0;
    this.y = GROUND;
    this.vy = 0;
    this.onGround = true;
    this.holding = false;
    this.roofs = [{ x0: -20, x1: 420, h: GROUND }];
    this.obst = [];
    this.coinList = [];
    this.nextX = 420;
    this.dead = 0;
    while (this.nextX < W + 400) this.spawn();
  }

  spawn() {
    const r = this.r;
    const gap = this.dist < 200 ? 0 : 26 + r() * Math.min(44, 20 + this.speed * 0.12);
    const x0 = this.nextX + gap;
    const len = 160 + r() * 220;
    const h = GROUND + Math.round((r() - 0.5) * 24);
    this.roofs.push({ x0, x1: x0 + len, h });
    // a vent or an aerial on the roof, maybe
    if (len > 200 && r() < 0.75) {
      const ox = x0 + 60 + r() * (len - 120);
      const tall = r() < 0.35;
      this.obst.push({ x: ox, w: tall ? 8 : 16, h: tall ? 26 : 14, y: h, kind: tall ? 'aerial' : 'vent' });
    }
    for (let k = 0; k < 3; k++) if (r() < 0.5) this.coinList.push({ x: x0 + 30 + k * 18 + r() * 40, y: h - 26 - r() * 34, got: false });
    this.nextX = x0 + len;
  }

  down() {
    if (this.mode === 'title' || this.mode === 'over') {
      if (this.mode === 'over' && this.dead > 0) return;
      this.reset();
      this.mode = 'run';
      this.plays++;
      this.audio.tone?.(660, 'square', 0.03, 0.08);
      return;
    }
    this.holding = true;
    if (this.onGround) {
      this.vy = -JUMP;
      this.onGround = false;
      this.audio.tone?.(520, 'square', 0.025, 0.09, undefined, 880);
    }
  }
  up() {
    this.holding = false;
  }

  roofAt(x) {
    for (const R of this.roofs) if (x >= R.x0 && x <= R.x1) return R;
    return null;
  }

  step(dt) {
    this.t += dt;
    if (this.mode === 'over') {
      this.dead = Math.max(0, this.dead - dt);
      return;
    }
    if (this.mode !== 'run') return;
    this.speed = Math.min(300, 120 + this.dist * 0.035);
    const dx = this.speed * dt;
    this.dist += dx;
    for (const R of this.roofs) {
      R.x0 -= dx;
      R.x1 -= dx;
    }
    for (const o of this.obst) o.x -= dx;
    for (const c of this.coinList) c.x -= dx;
    this.nextX -= dx;
    while (this.nextX < W + 200) this.spawn();
    this.roofs = this.roofs.filter((R) => R.x1 > -40);
    this.obst = this.obst.filter((o) => o.x > -40);
    this.coinList = this.coinList.filter((c) => c.x > -20);

    // the runner, at x = 64
    const px = 64;
    const g = this.holding && this.vy < 0 ? GRAV * 0.55 : GRAV;
    this.vy += g * dt;
    this.y += this.vy * dt;
    const R = this.roofAt(px) ?? this.roofAt(px - 6) ?? this.roofAt(px + 6);
    if (R && this.vy >= 0 && this.y >= R.h && this.y - this.vy * dt <= R.h + 4) {
      this.y = R.h;
      this.vy = 0;
      this.onGround = true;
    } else if (!R || this.y < R.h - 1) this.onGround = false;
    // ran into the side of a taller roof
    if (R && this.y > R.h + 6) return this.crash();
    if (this.y > H + 30) return this.crash();
    for (const o of this.obst) if (px + 5 > o.x && px - 5 < o.x + o.w && this.y > o.y - o.h) return this.crash();
    for (const c of this.coinList)
      if (!c.got && Math.abs(c.x - px) < 9 && Math.abs(c.y - (this.y - 10)) < 12) {
        c.got = true;
        this.coins++;
        this.audio.tone?.(1319, 'square', 0.03, 0.12);
      }
  }

  get score() {
    return Math.floor(this.dist / 4) + this.coins * 50;
  }

  crash() {
    this.mode = 'over';
    this.dead = 0.8;
    this.topScore = Math.max(this.topScore, this.score);
    this.audio.tone?.(220, 'sawtooth', 0.05, 0.5, undefined, 70);
  }

  draw() {
    const g = this.g;
    const t = this.t;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0a24');
    sky.addColorStop(0.7, '#2a1a4a');
    sky.addColorStop(1, '#4a2a5a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2ecd8';
    g.beginPath();
    g.arc(262, 34, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0a24';
    g.beginPath();
    g.arc(256, 30, 13, 0, Math.PI * 2);
    g.fill();
    // stars
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 30; k++) {
      const x = (k * 97) % W;
      const y = (k * 53) % 80;
      if ((k + Math.floor(t * 2)) % 7) g.fillRect(x, y, 1, 1);
    }
    // two layers of skyline behind
    const layer = (par, col, win, base, seed) => {
      const off = (this.dist * par) % 40;
      const first = Math.floor((this.dist * par) / 40);
      for (let k = -1; k < 10; k++) {
        const x = k * 40 - off;
        const rr = rng(seed * 31 + first + k);
        const h = 30 + rr() * 50;
        g.fillStyle = col;
        g.fillRect(x, base - h, 36, h + 40);
        g.fillStyle = win;
        for (let wy = base - h + 6; wy < base; wy += 8) for (let wx = x + 4; wx < x + 32; wx += 7) if (rr() < 0.3) g.fillRect(wx, wy, 3, 4);
      }
    };
    layer(0.15, '#1a1438', '#c8a85a', 120, 7);
    layer(0.35, '#120e28', '#e8c06a', 132, 19);
    // the roofs you run on
    for (const R of this.roofs) {
      g.fillStyle = '#0c0a18';
      g.fillRect(R.x0, R.h, R.x1 - R.x0, H - R.h);
      g.fillStyle = '#5a4a8a';
      g.fillRect(R.x0, R.h, R.x1 - R.x0, 2);
      g.fillStyle = '#2a2244';
      for (let x = R.x0 + 8; x < R.x1 - 8; x += 22) g.fillRect(x, R.h + 10, 10, 6);
    }
    for (const o of this.obst) {
      if (o.kind === 'vent') {
        g.fillStyle = '#6a6a7a';
        g.fillRect(o.x, o.y - o.h, o.w, o.h);
        g.fillStyle = '#3a3a4a';
        g.fillRect(o.x + 2, o.y - o.h + 3, o.w - 4, 2);
        g.fillRect(o.x + 2, o.y - o.h + 7, o.w - 4, 2);
      } else {
        g.fillStyle = '#8a8a9a';
        g.fillRect(o.x + 3, o.y - o.h, 2, o.h);
        g.fillRect(o.x, o.y - o.h + 4, o.w, 2);
        g.fillStyle = Math.sin(t * 6) > 0 ? '#ff3a3a' : '#5a1a1a';
        g.fillRect(o.x + 2, o.y - o.h - 3, 4, 3);
      }
    }
    for (const c of this.coinList) {
      if (c.got) continue;
      const w = Math.abs(Math.sin(t * 5 + c.x * 0.1)) * 5 + 1;
      g.fillStyle = '#ffd23a';
      g.fillRect(c.x - w / 2, c.y - 4, w, 8);
    }
    // the courier
    if (this.mode !== 'title') {
      const px = 64;
      const y = this.y;
      const run = this.onGround && this.mode === 'run' ? Math.floor(t * 12) % 2 : 2;
      g.fillStyle = '#5ae8ff';
      g.fillRect(px - 4, y - 18, 8, 9); // jacket
      g.fillStyle = '#f2c8a0';
      g.fillRect(px - 3, y - 24, 6, 6); // head
      g.fillStyle = '#ff6ac8';
      g.fillRect(px - 4, y - 25, 8, 2); // cap
      g.fillRect(px + 3, y - 24, 3, 1);
      g.fillStyle = '#e8e4dc';
      g.fillRect(px - 7, y - 17, 4, 6); // the parcel
      g.fillStyle = '#2a2a4a';
      if (run === 0) {
        g.fillRect(px - 4, y - 9, 3, 9);
        g.fillRect(px + 1, y - 9, 3, 6);
      } else if (run === 1) {
        g.fillRect(px - 4, y - 9, 3, 6);
        g.fillRect(px + 1, y - 9, 3, 9);
      } else {
        g.fillRect(px - 5, y - 9, 3, 5);
        g.fillRect(px + 2, y - 9, 3, 5);
      }
    }
    // HUD
    g.font = 'bold 10px monospace';
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.fillText(`SCORE ${String(this.score).padStart(6, '0')}`, 8, 14);
    g.textAlign = 'right';
    g.fillStyle = '#ffd23a';
    g.fillText(`HI ${String(Math.max(this.best, this.topScore)).padStart(6, '0')}`, W - 8, 14);
    g.textAlign = 'center';
    if (this.mode === 'title') {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 50, W, 70);
      g.font = 'bold 22px monospace';
      g.fillStyle = '#ff6ac8';
      g.fillText('NIGHT RUNNER', W / 2 + 2, 80);
      g.fillStyle = '#5ae8ff';
      g.fillText('NIGHT RUNNER', W / 2, 78);
      g.font = 'bold 10px monospace';
      g.fillStyle = Math.sin(t * 5) > 0 ? '#ffffff' : '#8a8aa8';
      g.fillText('FREE PLAY · PRESS JUMP', W / 2, 104);
    } else if (this.mode === 'over') {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, 54, W, 64);
      g.font = 'bold 18px monospace';
      g.fillStyle = '#ff3a3a';
      g.fillText('GAME OVER', W / 2, 80);
      g.font = 'bold 10px monospace';
      g.fillStyle = '#ffffff';
      g.fillText(`${this.score} POINTS · ${this.coins} COINS`, W / 2, 96);
      if (this.dead <= 0) {
        g.fillStyle = Math.sin(t * 5) > 0 ? '#ffd23a' : '#8a7a3a';
        g.fillText('JUMP TO PLAY AGAIN · ESC TO LEAVE', W / 2, 110);
      }
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
  }
}
