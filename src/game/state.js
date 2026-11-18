// Game clock + persistent state (money, looks, relationships, settings).
// Saved to localStorage — the "memory card". Every access is wrapped because
// storage can be blocked (private windows, embedded previews).

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export class Clock {
  constructor(minutes) {
    this.minutes = minutes;
    this.rate = 1; // game minutes per real second (a full day = 24 real minutes)
  }
  update(dt, fast) {
    this.minutes += dt * this.rate * (fast ? 45 : 1);
  }
  get hour() {
    return (this.minutes / 60) % 24;
  }
  get day() {
    return Math.floor(this.minutes / 1440) + 1;
  }
  get weekday() {
    return DAYS[(this.day - 1) % 7];
  }
  format() {
    const h = Math.floor(this.hour);
    const m = Math.floor(this.minutes % 60);
    const h12 = ((h + 11) % 12) + 1;
    return `${this.weekday}  ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
}

const KEY = 'ps2lifesim.save.v1';

export function loadSave() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_SETTINGS = {
  res: 448,
  dither: true,
  scanlines: true,
  bloom: true,
  soft: true,
  crisp: false,
  muted: false,
  flash: 'reduced', // the club's strobes: 'full' | 'reduced' | 'off'
};
