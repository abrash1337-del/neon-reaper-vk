// ============================================================
// NEON REAPER - meta.js
// Persistent progression between runs: currency earned per run,
// spent on permanent upgrades (see META_UPGRADES in config.js).
// Stored in localStorage - same storage the leaderboard already
// uses, so it works identically offline and once Yandex Games
// injects its own hosting (Yandex player cloud sync can be layered
// on top of this later without changing the call sites).
// ============================================================
'use strict';

const META_KEY = 'neonreaper_meta_v1';
const META_SCHEMA_VERSION = 2;
const META_TUTORIAL_STATES = ['new', 'in_progress', 'done', 'skipped'];

const Meta = {
  _cache: null,

  _load() {
    if (this._cache) return this._cache;
    const fallback = { currency: 0, levels: {}, runCount: 0 };
    try {
      const raw = localStorage.getItem(META_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // Guard against a corrupted/foreign value at this key that still
      // parses as valid JSON but isn't the object shape every method below
      // assumes (e.g. a stray "null"/number/array) - without this, the very
      // next line (`this._cache.levels`) throws before _load() ever
      // returns, and every caller (starting with Player's constructor,
      // which reads Meta on the first line of every run) crashes with it.
      this._cache = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : fallback;
    } catch (e) {
      this._cache = fallback;
    }
    if (!this._cache.levels || typeof this._cache.levels !== 'object' || Array.isArray(this._cache.levels)) this._cache.levels = {};
    if (typeof this._cache.currency !== 'number' || !isFinite(this._cache.currency) || this._cache.currency < 0) this._cache.currency = 0;
    this._migrate(this._cache);
    return this._cache;
  },

  // Schema v2 (retention hotfix): adds first-session state next to the
  // existing fields. Same storage key, plain JSON - old saves load as-is and
  // are upgraded in place; nothing already stored is removed or renamed.
  // An existing player (any prior progress) is NEVER put into the tutorial.
  _migrate(d) {
    let changed = false;
    const hasProgress = (Number(d.runCount) > 0) || Number(d.currency) > 0 ||
      Object.values(d.levels).some((v) => Number(v) > 0) ||
      !!(d.purchases && Object.keys(d.purchases).length) ||
      (Array.isArray(d.skins) && d.skins.length > 1);
    if (typeof d.runCount !== 'number' || !isFinite(d.runCount) || d.runCount < 0) { d.runCount = 0; changed = true; }
    d.runCount = Math.floor(d.runCount);
    if (d.schemaVersion !== META_SCHEMA_VERSION) { d.schemaVersion = META_SCHEMA_VERSION; changed = true; }
    if (!META_TUTORIAL_STATES.includes(d.tutorialStatus)) { d.tutorialStatus = hasProgress ? 'done' : 'new'; changed = true; }
    if (d.runCount > 0 && (d.tutorialStatus === 'new' || d.tutorialStatus === 'in_progress')) { d.tutorialStatus = 'done'; changed = true; }
    if (typeof d.firstRunRewardClaimed !== 'boolean') { d.firstRunRewardClaimed = hasProgress; changed = true; }
    if (typeof d.firstFreeReviveUsed !== 'boolean') { d.firstFreeReviveUsed = hasProgress; changed = true; }
    if (typeof d.activePlaySeconds !== 'number' || !isFinite(d.activePlaySeconds) || d.activePlaySeconds < 0) { d.activePlaySeconds = 0; changed = true; }
    if (changed) this._save();
  },
  _save() {
    try { localStorage.setItem(META_KEY, JSON.stringify(this._cache)); } catch (e) {}
  },

  getCurrency() { return this._load().currency || 0; },
  addCurrency(n) {
    const d = this._load();
    d.currency += Math.max(0, Math.floor(n));
    this._save();
    return d.currency;
  },

  getUpgradeLevel(id) { return this._load().levels[id] || 0; },

  costFor(def, level) {
    return Math.round(def.baseCost * Math.pow(def.costGrowth, level));
  },

  // Attempts to buy the next level of an upgrade. Returns true on success.
  buyUpgrade(id) {
    const def = META_UPGRADES.find(u => u.id === id);
    if (!def) return false;
    const d = this._load();
    const level = d.levels[id] || 0;
    if (level >= def.maxLevel) return false;
    const cost = this.costFor(def, level);
    if (d.currency < cost) return false;
    d.currency -= cost;
    d.levels[id] = level + 1;
    this._save();
    return true;
  },

  // ---- First-session state (see js/firstrun.js) ----
  getTutorialStatus() { return this._load().tutorialStatus; },
  setTutorialStatus(status) {
    if (!META_TUTORIAL_STATES.includes(status)) return;
    const d = this._load();
    if (d.tutorialStatus === status) return;
    d.tutorialStatus = status;
    this._save();
  },
  // True while the player has never finished a run and has not finished /
  // skipped the tutorial - i.e. the "НАЧАТЬ -> guided run" path applies.
  isFirstSession() {
    const d = this._load();
    return d.runCount === 0 && (d.tutorialStatus === 'new' || d.tutorialStatus === 'in_progress');
  },
  isFirstRewardClaimed() { return !!this._load().firstRunRewardClaimed; },
  claimFirstReward() { const d = this._load(); d.firstRunRewardClaimed = true; this._save(); },
  isFreeReviveUsed() { return !!this._load().firstFreeReviveUsed; },
  useFreeRevive() { const d = this._load(); d.firstFreeReviveUsed = true; this._save(); },
  getActivePlaySeconds() { return this._load().activePlaySeconds || 0; },
  addActivePlaySeconds(n) {
    if (!(n > 0) || !isFinite(n)) return;
    const d = this._load();
    d.activePlaySeconds = (d.activePlaySeconds || 0) + n;
    this._save();
  },

  getRunCount() { return this._load().runCount || 0; },
  recordRunEnd() {
    const d = this._load();
    d.runCount = (d.runCount || 0) + 1;
    this._save();
    return d.runCount;
  },

  // ---- Monetization: non-consumable IAP ownership (remove_ads, starter_pack).
  // Local mirror of what Monetization.getPurchases() would report from a live
  // Yandex Payments backend - see js/monetization.js and IAP_PRODUCTS.
  hasPurchase(id) { return !!(this._load().purchases || {})[id]; },
  recordPurchase(id) {
    const d = this._load();
    if (!d.purchases) d.purchases = {};
    d.purchases[id] = true;
    this._save();
  },

  // ---- Cosmetic skins (see SKINS in config.js) - always owns 'default'.
  getOwnedSkins() {
    const d = this._load();
    if (!d.skins) d.skins = ['default'];
    return d.skins;
  },
  ownsSkin(id) { return this.getOwnedSkins().includes(id); },
  buySkin(id) {
    const def = SKINS.find(s => s.id === id);
    if (!def) return false;
    const d = this._load();
    const owned = this.getOwnedSkins();
    if (owned.includes(id)) return false;
    if (d.currency < def.cost) return false;
    d.currency -= def.cost;
    owned.push(id);
    d.skins = owned;
    this._save();
    return true;
  },
  getSelectedSkin() {
    const d = this._load();
    return (d.selectedSkin && this.ownsSkin(d.selectedSkin)) ? d.selectedSkin : 'default';
  },
  selectSkin(id) {
    if (!this.ownsSkin(id)) return false;
    const d = this._load();
    d.selectedSkin = id;
    this._save();
    return true;
  }
};
