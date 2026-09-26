// ============================================================
// NEON REAPER - utils.js
// Small math / helper utilities shared across the game.
// ============================================================
'use strict';

const Utils = {
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
  angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  randRange(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(this.randRange(min, max + 1)); },
  choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  // Picks one item from arr with probability proportional to weightFn(item) -
  // used to make legendary weapons rare within the rare-pickup roll without
  // a second, separate roll.
  weightedChoice(arr, weightFn) {
    if (!arr.length) return undefined;
    const total = arr.reduce((s, x) => s + Math.max(0, weightFn(x)), 0);
    // All weights zero/negative - fall back to a uniform pick rather than
    // silently always returning arr[0] (Math.random()*0 === 0 would make
    // the very first loop iteration's `r <= 0` true every time below).
    if (total <= 0) return this.choice(arr);
    let r = Math.random() * total;
    for (const x of arr) { r -= Math.max(0, weightFn(x)); if (r <= 0) return x; }
    return arr[arr.length - 1];
  },
  vecFromAngle(angle, mag) { return { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag }; },
  rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },
  circleRectOverlap(cx, cy, r, rect) {
    const nx = this.clamp(cx, rect.x, rect.x + rect.w);
    const ny = this.clamp(cy, rect.y, rect.y + rect.h);
    return this.dist(cx, cy, nx, ny) < r;
  },
  circlesOverlap(x1, y1, r1, x2, y2, r2) {
    return this.dist(x1, y1, x2, y2) < r1 + r2;
  },
  normalizeAngleDiff(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },
  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
  formatScore(n) {
    return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  },
  uid() { return Math.random().toString(36).slice(2, 10); },
  // Russian plural form picker (1 голос / 2 голоса / 5 голосов, same rule
  // as рубль/минута/etc). Used by main.js's shop price display for VK's
  // голоса currency - see IAP_PRODUCTS.priceVotes in config.js.
  pluralRu(n, one, few, many) {
    const n100 = Math.abs(n) % 100;
    const n10 = n100 % 10;
    if (n100 > 10 && n100 < 20) return many;
    if (n10 > 1 && n10 < 5) return few;
    if (n10 === 1) return one;
    return many;
  },
  // Blends two '#rrggbb' colors, t=0 -> a, t=1 -> b. Used to tint the arena
  // grid toward the current boss chapter's accent color (see
  // Level.chapterColor in level.js) without needing a whole second palette.
  mixHex(hexA, hexB, t) {
    const pa = parseInt(hexA.slice(1), 16), pb = parseInt(hexB.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    const r = Math.round(this.lerp(ar, br, t)), g = Math.round(this.lerp(ag, bg, t)), b = Math.round(this.lerp(ab, bb, t));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
};

// ---- Simple seeded-ish id counter for entities ----
let __idCounter = 1;
Utils.nextId = () => __idCounter++;
