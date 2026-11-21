import { CITY, roadLine } from '../config.js';
import { PLACE_ICONS } from '../game/places.js';
import { NEED_ICONS } from './ui.js';

// The city map (M): a top-down drawing of the real blocks and buildings, coloured
// by district, with every place worth going to, whether it's open, what it does
// for your needs, and where you are. Pick a place and set a route to it.

const $ = (id) => document.getElementById(id);
const DISTRICT = {
  Downtown: '#5a7ad0',
  'Old Market': '#c07a50',
  'Kiln Heights': '#b09a5a',
  Greenway: '#5aa874',
  'Ember Row': '#c8584a',
  'Lantern Quarter': '#9a6ae0',
  'Greenway Park': '#4a9a50',
};
const P2D = {};
const path = (d) => (P2D[d] ??= new Path2D(d));
const svg = (d, color = 'currentColor') => `<svg viewBox="0 0 16 16" fill="${color}" aria-hidden="true">${d.startsWith('<') ? d : `<path d="${d}"/>`}</svg>`;

export class CityMap {
  constructor(ui, city) {
    this.ui = ui;
    this.city = city;
    this.el = $('map');
    this.canvas = $('map-canvas');
    this.g = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.E = CITY.EDGE + 8; // world half-size shown
    this.isOpen = false;
    this.sel = 0;
    this.t = 0;
    this.canvas.addEventListener('pointerdown', (e) => this.click(e));
    $('map-close').addEventListener('click', () => this.close());
    window.addEventListener('resize', () => this.isOpen && this.layout());
    // district label positions: the middle of each district's blocks
    const acc = {};
    for (const b of city.blocks) {
      if (b.kind !== 'city') continue;
      const d = city.districtAt(b.cx, b.cz);
      (acc[d] ??= []).push(b);
    }
    this.labels = Object.entries(acc).map(([name, bs]) => ({ name, x: bs.reduce((s, b) => s + b.cx, 0) / bs.length, z: bs.reduce((s, b) => s + b.cz, 0) / bs.length }));
    // Ember Row wraps around the Lantern Quarter: put its name on the street below, clear of the tree
    const ember = this.labels.find((l) => l.name === 'Ember Row');
    if (ember && city.lanternBlock) ember.z = city.lanternBlock.z1 + CITY.ROAD / 2;
  }

  /**
   * ctx: { places: { list, small }, player, camYaw(), hour(), time(), where(), route() -> place|null,
   *        setRoute(place|null), lowNeeds() -> need keys, onClose() }
   */
  open(ctx) {
    this.ctx = ctx;
    this.isOpen = true;
    this.ui.modal = 'map';
    this.ui.setPrompt(null);
    document.body.classList.add('in-menu');
    this.el.classList.remove('hidden');
    // start on the route if there is one, otherwise the nearest place
    const list = ctx.places.list;
    const r = ctx.route();
    const p = ctx.player.pos;
    this.sel = r ? list.indexOf(r) : list.reduce((best, q, i) => (Math.hypot(q.at.x - p.x, q.at.z - p.z) < Math.hypot(list[best].at.x - p.x, list[best].at.z - p.z) ? i : best), 0);
    this.layout();
    this.renderList();
    this.draw();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    document.body.classList.remove('in-menu');
    if (this.ui.modal === 'map') this.ui.modal = null;
    this.ui.audio.blip(false);
    this.ctx?.onClose?.();
  }

  key(k) {
    const n = this.ctx.places.list.length;
    if (k === 'Escape' || k === 'KeyM' || k === 'KeyP') this.close();
    else if (k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowLeft' || k === 'KeyA') this.select((this.sel - 1 + n) % n);
    else if (k === 'ArrowDown' || k === 'KeyS' || k === 'ArrowRight' || k === 'KeyD' || k === 'Tab') this.select((this.sel + 1) % n);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyE') this.toggleRoute();
  }

  select(i) {
    if (i === this.sel) return;
    this.sel = i;
    this.ui.audio.blip(false);
    this.renderList();
  }

  toggleRoute() {
    const p = this.ctx.places.list[this.sel];
    this.ctx.setRoute(this.ctx.route() === p ? null : p);
    this.ui.audio.blip(true);
    this.renderList();
  }

  // ---------------------------------------------------------------- layout
  layout() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (w === c.width && h === c.height && this.baseDone) return;
    c.width = w;
    c.height = h;
    this.S = Math.min(w, h);
    this.ox = (w - this.S) / 2;
    this.oy = (h - this.S) / 2;
    this.dpr = dpr;
    this.renderBase();
  }

  m(x, z) {
    return [this.ox + ((x + this.E) / (2 * this.E)) * this.S, this.oy + ((z + this.E) / (2 * this.E)) * this.S];
  }

  /** world length -> pixels */
  px(n) {
    return (n / (2 * this.E)) * this.S;
  }

  rect(g, x0, z0, x1, z1) {
    const [a, b] = this.m(x0, z0);
    const [c, d] = this.m(x1, z1);
    g.fillRect(a, b, c - a, d - b);
  }

  /** The parts of the map that never change: land, roads, blocks, buildings, district names. */
  renderBase() {
    const city = this.city;
    const B = this.base;
    B.width = this.canvas.width;
    B.height = this.canvas.height;
    const g = B.getContext('2d');
    g.fillStyle = '#070b1c';
    g.fillRect(0, 0, B.width, B.height);
    // a faint survey grid
    g.strokeStyle = 'rgba(120, 160, 255, 0.06)';
    g.lineWidth = 1;
    for (let k = -200; k <= 200; k += 20) {
      const [a, b] = this.m(k, -this.E);
      const [c, d] = this.m(k, this.E);
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c, d);
      g.stroke();
      const [e, f] = this.m(-this.E, k);
      const [h, i] = this.m(this.E, k);
      g.beginPath();
      g.moveTo(e, f);
      g.lineTo(h, i);
      g.stroke();
    }
    const { HALF, ROAD, SIDEWALK, N } = CITY;
    // the outer pavement ring, then the road grid
    const e = HALF + ROAD / 2 + SIDEWALK;
    g.fillStyle = '#2c3456';
    this.rect(g, -e, -e, e, e);
    g.fillStyle = '#1b2240';
    this.rect(g, -HALF - ROAD / 2, -HALF - ROAD / 2, HALF + ROAD / 2, HALF + ROAD / 2);
    g.setLineDash([this.px(3), this.px(3)]);
    g.strokeStyle = 'rgba(255, 214, 120, 0.22)';
    g.lineWidth = Math.max(1, this.px(0.35));
    for (let i = 0; i <= N; i++) {
      const r = roadLine(i);
      for (const [a, b, c, d] of [
        [r, -HALF - ROAD / 2, r, HALF + ROAD / 2],
        [-HALF - ROAD / 2, r, HALF + ROAD / 2, r],
      ]) {
        const [x0, y0] = this.m(a, b);
        const [x1, y1] = this.m(c, d);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
    }
    g.setLineDash([]);
    // blocks: pavement, then the lot tinted by district
    for (const b of city.blocks) {
      const d = b.kind === 'park' ? 'Greenway Park' : b.kind === 'lantern' ? 'Lantern Quarter' : city.districtAt(b.cx, b.cz);
      g.fillStyle = '#46507a';
      this.rect(g, b.x0, b.z0, b.x1, b.z1);
      const L = b.lot;
      g.fillStyle = '#121830';
      this.rect(g, L.x0, L.z0, L.x1, L.z1);
      g.globalAlpha = 0.28;
      g.fillStyle = DISTRICT[d] ?? '#5a6a9a';
      this.rect(g, L.x0, L.z0, L.x1, L.z1);
      g.globalAlpha = 1;
      if (b.kind === 'park') {
        g.fillStyle = '#2f6a3a';
        this.rect(g, L.x0, L.z0, L.x1, L.z1);
        g.strokeStyle = '#a89a78';
        g.lineWidth = this.px(2.2);
        g.beginPath();
        g.moveTo(...this.m(b.cx, L.z0));
        g.lineTo(...this.m(b.cx, L.z1));
        g.moveTo(...this.m(L.x0, b.cz));
        g.lineTo(...this.m(L.x1, b.cz));
        g.stroke();
        g.fillStyle = '#4a8ac8';
        g.beginPath();
        g.arc(...this.m(b.cx, b.cz), this.px(4), 0, Math.PI * 2);
        g.fill();
      }
      if (b.kind === 'lantern') {
        const [cx, cy] = this.m(b.cx, b.cz);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, this.px(24));
        gr.addColorStop(0, 'rgba(200, 160, 255, 0.85)');
        gr.addColorStop(0.35, 'rgba(140, 90, 230, 0.45)');
        gr.addColorStop(1, 'rgba(90, 50, 180, 0)');
        g.fillStyle = gr;
        this.rect(g, L.x0, L.z0, L.x1, L.z1);
      }
    }
    // buildings, lighter the taller they are
    for (const f of city.footprints ?? []) {
      const d = city.districtAt((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2);
      const t = Math.min(1, f.top / 70);
      g.fillStyle = DISTRICT[d] ?? '#6a7aa0';
      g.globalAlpha = 0.45 + 0.45 * t;
      this.rect(g, f.x0, f.z0, f.x1, f.z1);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      g.lineWidth = 1;
      const [a, b2] = this.m(f.x0, f.z0);
      const [c, d2] = this.m(f.x1, f.z1);
      g.strokeRect(a + 0.5, b2 + 0.5, c - a - 1, d2 - b2 - 1);
    }
    // the places that build their own shells
    const site = (s, col) => {
      if (!s) return;
      g.fillStyle = col;
      this.rect(g, s.x0, s.z0, s.x1, s.z1);
    };
    site(city.clubSite, '#5a3a6e');
    site(city.gullysSite, '#1a8a90');
    site(city.galleriaSite, '#8a7a5a');
    site(city.exchangeSite, '#6a6048');
    if (city.motorsSite) {
      // the showroom, and its forecourt in front
      const m = city.motorsSite;
      site({ x0: m.x0 + 0.8, z0: m.z0 + 0.3, x1: m.x1 - 0.8, z1: m.z0 + 18.9 }, '#6a3a3a');
      site({ x0: m.x0, z0: m.z0 + 18.9, x1: m.x1, z1: m.z1 }, '#a8a49c');
    }
    if (city.gullysSite) {
      g.fillStyle = '#d8d0c4';
      g.globalAlpha = 0.35;
      this.rect(g, city.gullysSite.x0, city.gullysSite.z1 - 4, city.gullysSite.x1, city.gullysSite.z1);
      g.globalAlpha = 1;
    }
    // district names
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(this.S * 0.03)}px Rajdhani, sans-serif`;
    for (const l of this.labels) {
      const [x, y] = this.m(l.x, l.z);
      g.fillStyle = 'rgba(0, 0, 0, 0.55)';
      spaced(g, l.name.toUpperCase(), x + 1.5, y + 1.5, this.S * 0.006);
      g.fillStyle = 'rgba(230, 238, 255, 0.5)';
      spaced(g, l.name.toUpperCase(), x, y, this.S * 0.006);
    }
    // north arrow and a scale bar
    const s = this.S;
    const nx = this.ox + s * 0.05;
    const ny = this.oy + s * 0.06;
    g.fillStyle = 'rgba(230, 238, 255, 0.8)';
    g.beginPath();
    g.moveTo(nx, ny - s * 0.025);
    g.lineTo(nx + s * 0.013, ny + s * 0.012);
    g.lineTo(nx, ny + s * 0.004);
    g.lineTo(nx - s * 0.013, ny + s * 0.012);
    g.fill();
    g.font = `700 ${Math.round(s * 0.022)}px Rajdhani, sans-serif`;
    g.fillText('N', nx, ny + s * 0.035);
    const L50 = this.px(50);
    const sx = this.ox + s * 0.95 - L50;
    const sy = this.oy + s * 0.965;
    g.fillRect(sx, sy, L50, Math.max(2, s * 0.004));
    g.fillRect(sx, sy - s * 0.008, Math.max(2, s * 0.003), s * 0.012);
    g.fillRect(sx + L50 - Math.max(2, s * 0.003), sy - s * 0.008, Math.max(2, s * 0.003), s * 0.012);
    g.font = `600 ${Math.round(s * 0.02)}px Rajdhani, sans-serif`;
    g.fillText('50 m', sx + L50 / 2, sy - s * 0.016);
    this.baseDone = true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.isOpen) return;
    this.t += dt;
    this.layout();
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const g = this.g;
    const s = this.S;
    g.drawImage(this.base, 0, 0);
    const hour = ctx.hour();
    // your home building gets a green outline
    const home = ctx.places.list.find((p) => p.id.startsWith('apt:') && p.big());
    if (home) {
      const site = this.city.apartmentSites?.[home.id.slice(4)];
      if (site) {
        g.strokeStyle = '#7dff9a';
        g.lineWidth = Math.max(2, s * 0.004);
        const [a, b] = this.m(site.x0, site.z0);
        const [c, d] = this.m(site.x1, site.z1);
        g.strokeRect(a, b, c - a, d - b);
      }
    }
    // ATMs and vending machines
    for (const q of ctx.places.small) {
      const [x, y] = this.m(q.x, q.z);
      const r = s * 0.0065;
      g.fillStyle = q.type === 'atm' ? '#5ad88a' : '#5ac8ff';
      if (q.type === 'atm') g.fillRect(x - r, y - r, r * 2, r * 2);
      else {
        g.beginPath();
        g.arc(x, y, r * 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the route: a dashed line from you to the place
    const route = ctx.route();
    const pp = ctx.player.pos;
    const [px, py] = this.m(pp.x, pp.z);
    if (route) {
      const [tx, ty] = this.m(route.at.x, route.at.z);
      g.setLineDash([s * 0.012, s * 0.01]);
      g.lineDashOffset = -this.t * s * 0.04;
      g.strokeStyle = '#ffb05a';
      g.lineWidth = Math.max(2, s * 0.005);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(tx, ty);
      g.stroke();
      g.setLineDash([]);
    }
    // places
    const low = ctx.lowNeeds();
    const sel = ctx.places.list[this.sel];
    g.textBaseline = 'middle';
    ctx.places.list.forEach((p, i) => {
      const [x, y] = this.m(p.at.x, p.at.z);
      const st = p.status(hour);
      const col = p.color();
      const r = s * (p.big() ? 0.022 : 0.016);
      if (p === route) {
        g.strokeStyle = '#ffb05a';
        g.lineWidth = Math.max(2, s * 0.004);
        g.beginPath();
        g.arc(x, y, r * (1.6 + 0.25 * Math.sin(this.t * 4)), 0, Math.PI * 2);
        g.stroke();
      }
      if (i === this.sel) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(2, s * 0.003);
        g.beginPath();
        g.arc(x, y, r * (1.35 + 0.12 * Math.sin(this.t * 6)), 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#0a0f24';
      g.strokeStyle = st.open ? col : '#6a7088';
      g.lineWidth = Math.max(1.5, s * 0.003);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.save();
      g.translate(x - r * 0.62, y - r * 0.62);
      g.scale((r * 1.24) / 16, (r * 1.24) / 16);
      g.fillStyle = st.open ? col : '#7a8098';
      g.fill(path(PLACE_ICONS[p.icon()]));
      g.restore();
      // a low need this place would fix (and it's open): an orange badge
      if (st.open && p.needs().some((k) => low.includes(k))) {
        g.fillStyle = '#ff9a3a';
        g.beginPath();
        g.arc(x + r * 0.8, y - r * 0.8, r * 0.36, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0a0f24';
        g.font = `800 ${Math.round(r * 0.6)}px Rajdhani, sans-serif`;
        g.textAlign = 'center';
        g.fillText('!', x + r * 0.8, y - r * 0.78);
      }
      if (p.big() || i === this.sel || p === route) {
        g.font = `700 ${Math.round(s * 0.022)}px Rajdhani, sans-serif`;
        g.textAlign = 'left';
        const name = p.name();
        g.lineWidth = Math.max(2, s * 0.005);
        g.strokeStyle = 'rgba(4, 6, 18, 0.9)';
        g.strokeText(name, x + r * 1.35, y);
        g.fillStyle = i === this.sel ? '#ffffff' : st.open ? '#dfe8ff' : '#9aa0b8';
        g.fillText(name, x + r * 1.35, y);
      }
    });
    // you: a pulsing dot with an arrow, and a soft wedge where the camera looks
    const cy = ctx.camYaw();
    const look = Math.atan2(Math.cos(cy), Math.sin(cy));
    const wedge = g.createRadialGradient(px, py, 0, px, py, s * 0.07);
    wedge.addColorStop(0, 'rgba(127, 212, 255, 0.35)');
    wedge.addColorStop(1, 'rgba(127, 212, 255, 0)');
    g.fillStyle = wedge;
    g.beginPath();
    g.moveTo(px, py);
    g.arc(px, py, s * 0.07, look - 0.5, look + 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(127, 212, 255, 0.25)';
    g.beginPath();
    g.arc(px, py, s * (0.018 + 0.004 * Math.sin(this.t * 5)), 0, Math.PI * 2);
    g.fill();
    const yaw = ctx.player.yaw;
    const face = Math.atan2(Math.cos(yaw), Math.sin(yaw));
    g.save();
    g.translate(px, py);
    g.rotate(face);
    const a = s * 0.016;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0a2a4a';
    g.lineWidth = Math.max(1.5, s * 0.003);
    g.beginPath();
    g.moveTo(a, 0);
    g.lineTo(-a * 0.7, a * 0.62);
    g.lineTo(-a * 0.35, 0);
    g.lineTo(-a * 0.7, -a * 0.62);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    if (sel) {
      const [sx, sy] = this.m(sel.at.x, sel.at.z);
      this.selXY = [sx, sy];
    }
    $('map-time').textContent = ctx.time();
  }

  // ---------------------------------------------------------------- the list
  renderList() {
    const ctx = this.ctx;
    const hour = ctx.hour();
    const pp = ctx.player.pos;
    const route = ctx.route();
    const low = ctx.lowNeeds();
    $('map-where').textContent = `You're in ${ctx.where()}`;
    const rows = ctx.places.list.map((p, i) => {
      const st = p.status(hour);
      const d = Math.hypot(p.at.x - pp.x, p.at.z - pp.z);
      const dist = d < 15 ? 'here' : `${Math.round(d / 10) * 10} m`;
      const needs = p
        .needs()
        .map((k) => `<span class="map-need${st.open && low.includes(k) ? ' low' : ''}" title="${k}">${svg(NEED_ICONS[k])}</span>`)
        .join('');
      const sel = i === this.sel;
      const btn = sel ? `<button class="reg-btn${route === p ? ' no' : ' go'}" data-route="${i}">${route === p ? 'CLEAR ROUTE' : 'SET ROUTE'}</button>` : '';
      return `<div class="map-row${sel ? ' sel' : ''}${route === p ? ' routed' : ''}" data-i="${i}">
        <span class="map-icon" style="color:${st.open ? p.color() : '#7a8098'}">${svg(PLACE_ICONS[p.icon()])}</span>
        <div class="map-info"><div class="map-name">${p.name()}<span class="map-dist">${dist}</span></div>
        <div class="map-sub">${p.sub()}</div>
        <div class="map-meta"><span class="map-status${st.open ? ' open' : ''}">${st.text}</span><span class="map-needs">${needs}</span></div>${btn}</div>
      </div>`;
    });
    const el = $('map-list');
    el.innerHTML = rows.join('');
    el.querySelectorAll('[data-i]').forEach((row) => row.addEventListener('click', () => this.select(Number(row.dataset.i))));
    el.querySelectorAll('[data-route]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleRoute();
      }),
    );
    el.querySelector('.map-row.sel')?.scrollIntoView({ block: 'nearest' });
  }

  click(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (this.canvas.width / r.width);
    const y = (e.clientY - r.top) * (this.canvas.height / r.height);
    let best = -1;
    let bd = this.S * 0.05;
    this.ctx.places.list.forEach((p, i) => {
      const [mx, my] = this.m(p.at.x, p.at.z);
      const d = Math.hypot(mx - x, my - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return;
    if (best === this.sel) this.toggleRoute();
    else this.select(best);
  }
}

/** Letter-spaced text, centred on x. */
function spaced(g, text, x, y, gap) {
  const ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((s, w) => s + w, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  [...text].forEach((ch, k) => {
    g.fillText(ch, cx, y);
    cx += ws[k] + gap;
  });
  g.textAlign = 'center';
}
