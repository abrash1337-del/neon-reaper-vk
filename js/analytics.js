// ============================================================
// NEON REAPER - analytics.js
// Small, isolated product-analytics module (first-session funnel).
//
//   Analytics.track('run_start', { run_number: 1, mode: 'practice' });
//   Analytics.once('first_kill', {...})   // at most once per run
//
// Design rules (see docs/ANALYTICS.md):
//  - never blocks the game: every path is wrapped in try/catch;
//  - no personal data: payload keys are filtered, values are short numbers /
//    booleans / short strings only;
//  - duplicate suppression: identical events inside DEDUPE_MS are dropped
//    (double taps, repeated screen renders, pause/resume bounces);
//  - transports are replaceable. Built in: console (debug mode), a local ring
//    buffer in localStorage (debug mode only - nothing is stored for normal
//    players), and an OPTIONAL VK Bridge transport
//    (VKWebAppTrackEvent) that is OFF by default - that method feeds VK Ads /
//    MyTracker (beta, on request), so enabling it is the owner's decision.
//    No third-party analytics service is bundled.
// ============================================================
'use strict';

const ANALYTICS_BUFFER_KEY = 'neonreaper_events_v1';

const Analytics = {
  config: {
    debug: false,            // true -> console.log every event (also ?analytics=debug or localStorage neonreaper_debug=1)
    bufferEnabled: false,    // keep the last N events locally - OFF for normal players, switched on together with debug mode
    bufferSize: 300,
    vkTrackEvent: false,     // forward events to VKWebAppTrackEvent (OFF - see header)
    dedupeMs: 400,
    maxKeys: 12,
    maxString: 32
  },

  sessionId: null,
  seq: 0,
  _recent: new Map(),   // dedupe key -> timestamp
  _once: new Set(),     // keys already fired for the current run
  _runId: 0,
  _transports: [],
  _memory: [],          // fallback buffer when localStorage is unavailable
  _context: {},         // fields added to every event (platform, lang, ...)

  init(context) {
    try {
      this.sessionId = Math.random().toString(36).slice(2, 10);
      this._context = Object.assign({}, context || {});
      try {
        const q = (typeof location !== 'undefined' && location.search) || '';
        if (/[?&]analytics=debug/.test(q) || localStorage.getItem('neonreaper_debug') === '1') {
          this.config.debug = true;
          this.config.bufferEnabled = true; // dump() / local buffer only exist in debug mode
        }
      } catch (e) {}
    } catch (e) {}
  },

  setContext(patch) { try { Object.assign(this._context, patch || {}); } catch (e) {} },

  // Replace/extend where events go. fn(eventObject) must not throw (it is
  // wrapped anyway). Pass `replace=true` to drop the built-in transports.
  addTransport(fn, replace) {
    if (typeof fn !== 'function') return;
    if (replace) this._transports = [];
    this._transports.push(fn);
  },

  // Called at the start of every run so "first_*" events can fire again.
  resetRun() { this._once.clear(); this._runId++; },

  _clean(payload) {
    const out = {};
    if (!payload || typeof payload !== 'object') return out;
    const banned = /(name|mail|phone|tel|sign|launch|token|password|fio|surname|address)/i;
    let n = 0;
    for (const k of Object.keys(payload)) {
      if (n >= this.config.maxKeys) break;
      if (banned.test(k)) continue;
      const v = payload[k];
      if (typeof v === 'number') { if (isFinite(v)) { out[k] = Math.round(v * 100) / 100; n++; } }
      else if (typeof v === 'boolean') { out[k] = v; n++; }
      else if (typeof v === 'string') { out[k] = v.slice(0, this.config.maxString); n++; }
    }
    return out;
  },

  track(name, payload) {
    try {
      if (typeof name !== 'string' || !name) return false;
      const clean = this._clean(payload);
      const now = Date.now();
      const key = name + '|' + JSON.stringify(clean);
      const last = this._recent.get(key);
      if (last !== undefined && now - last < this.config.dedupeMs) return false;
      this._recent.set(key, now);
      if (this._recent.size > 200) {
        for (const [k, t] of this._recent) if (now - t > 5000) this._recent.delete(k);
      }
      const ev = { n: name, p: Object.assign({}, this._context, clean), t: now, s: this.sessionId, i: ++this.seq };
      this._deliver(ev);
      return true;
    } catch (e) { return false; }
  },

  // Fires `name` at most once per run (resetRun() re-arms it).
  once(name, payload) {
    try {
      if (this._once.has(name)) return false;
      const sent = this.track(name, payload);
      if (sent) this._once.add(name);
      return sent;
    } catch (e) { return false; }
  },

  _deliver(ev) {
    if (this.config.debug) { try { console.log('[analytics]', ev.n, JSON.stringify(ev.p)); } catch (e) {} }
    if (this.config.bufferEnabled) this._buffer(ev);
    for (const fn of this._transports) { try { fn(ev); } catch (e) {} }
    if (this.config.vkTrackEvent) this._vkSend(ev);
  },

  _buffer(ev) {
    try {
      let arr;
      try { arr = JSON.parse(localStorage.getItem(ANALYTICS_BUFFER_KEY) || '[]'); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) arr = this._memory.slice();
      arr.push(ev);
      if (arr.length > this.config.bufferSize) arr = arr.slice(arr.length - this.config.bufferSize);
      this._memory = arr;
      try { localStorage.setItem(ANALYTICS_BUFFER_KEY, JSON.stringify(arr)); } catch (e) {}
    } catch (e) {}
  },

  // Optional VK Bridge transport. Official method: VKWebAppTrackEvent with
  // `event_name` (required string) and optional `user_id`. We never send
  // user ids or payload fields - the event name alone, prefixed.
  _vkSend(ev) {
    try {
      if (typeof VK === 'undefined' || !VK.ready || !VK.bridge) return;
      const p = VK.bridge.send('VKWebAppTrackEvent', { event_name: 'nr_' + ev.n });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  },

  // Everything buffered so far (oldest first). Handy in devtools:
  //   JSON.stringify(Analytics.dump())
  dump() {
    try { const a = JSON.parse(localStorage.getItem(ANALYTICS_BUFFER_KEY) || '[]'); if (Array.isArray(a)) return a; } catch (e) {}
    return this._memory.slice();
  },
  clearBuffer() { this._memory = []; try { localStorage.removeItem(ANALYTICS_BUFFER_KEY); } catch (e) {} }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Analytics };
