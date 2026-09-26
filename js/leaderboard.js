// ============================================================
// NEON REAPER - leaderboard.js
// Local leaderboard storage with an adapter that transparently
// upgrades to the Yandex Games SDK leaderboard when available
// (see yandex.js). Falls back to localStorage everywhere else
// (offline testing, itch.io-style hosting, RuStore webview, etc).
// ============================================================
'use strict';

const LB_KEY = 'neonreaper_leaderboard_v1';
const LB_NAME_KEY = 'neonreaper_player_name';

const Leaderboard = {
  getLocalName() {
    // A few browser contexts (Safari private mode historically, some
    // locked-down webviews) throw a SecurityError on any localStorage
    // access at all, not just JSON.parse - wrap this read too, matching
    // setLocalName's write below, so the leaderboard degrades to the
    // default name instead of taking the whole game-over/leaderboard
    // screen down with it.
    try { return localStorage.getItem(LB_NAME_KEY) || 'ИГРОК'; } catch (e) { return 'ИГРОК'; }
  },
  setLocalName(name) {
    try { localStorage.setItem(LB_NAME_KEY, (name || 'ИГРОК').slice(0, 16)); } catch (e) {}
  },
  _readAll() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Guard against a corrupted/foreign non-array value at this key
      // (parses fine as JSON but isn't the list every caller assumes) -
      // submit()/top() both call .sort() on this return value directly.
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  },
  _writeAll(list) {
    try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  },

  async submit(score, level, mode) {
    const entry = { name: this.getLocalName(), score: Math.floor(score), level, mode: mode || null, date: Date.now() };
    // Try Yandex SDK first (async, may be unavailable -> falls through)
    const usedYandex = await Yandex.submitScore(entry.score).catch(() => false);
    if (!usedYandex) {
      const list = this._readAll();
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      this._writeAll(list);
    }
    // VK has no queryable top-N API to feed the game's own leaderboard
    // screen (see vk.js) - this just also offers VK's own native
    // leaderboard box, best-effort, alongside whatever ran above. Never
    // awaited into the return value: a slow/failed VK call must not delay
    // or break score submission itself.
    VK.showLeaderboard(entry.score).catch(() => {});
    return entry;
  },

  async top(n = 10) {
    const yandexList = await Yandex.getLeaderboard(n).catch(() => null);
    if (yandexList && yandexList.length) return yandexList;
    const list = this._readAll();
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, n);
  }
};
