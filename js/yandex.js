// ============================================================
// NEON REAPER - yandex.js
// Thin adapter around the Yandex Games SDK. Every call is
// guarded so the game runs fine with no SDK present (local
// testing, the in-chat preview build, or any other host).
//
// To publish on Yandex Games: include, before this file, the SDK
// loader script tag Yandex's own console/docs give you at publish
// time (Console -> game settings -> "Инструкция по подключению SDK").
// Do not hardcode that script URL anywhere in this codebase - the
// upload moderation scans the archive and rejects any file that
// contains a literal link to Yandex's own internal SDK storage host.
// This file will pick up the injected `YaGames` global automatically
// via init() regardless of how that tag got onto the page.
// ============================================================
'use strict';

const Yandex = {
  sdk: null,
  ready: false,
  player: null,

  async init() {
    if (typeof YaGames === 'undefined') { this.ready = false; return null; }
    try {
      this.sdk = await YaGames.init();
      this.ready = true;
      try { this.player = await this.sdk.getPlayer({ scopes: false }); } catch (e) { this.player = null; }
      return this.sdk;
    } catch (e) {
      this.ready = false;
      return null;
    }
  },

  gameplayStart() { try { this.sdk?.features.GameplayAPI?.start(); } catch (e) {} },
  gameplayStop() { try { this.sdk?.features.GameplayAPI?.stop(); } catch (e) {} },

  // Yandex requirement 1.19.2: LoadingAPI.ready() must fire at the moment
  // the player can actually start playing - not the moment the SDK itself
  // finishes initializing. Call this once, right before the menu screen is
  // shown (end of boot()), after every other startup step has run.
  gameReady() { try { this.sdk?.features.LoadingAPI?.ready(); } catch (e) {} },

  // Fullscreen mode - required by Yandex's platform requirements ("the game
  // is in fullscreen mode during gameplay or launch", explicit for mobile).
  // Prefers the SDK's own screen API when it's available (works reliably in
  // more mobile webviews than the raw browser API), falls back to the
  // standard Fullscreen API (with vendor prefixes for older Safari/iOS)
  // everywhere else - including local testing and any non-Yandex host.
  // Must be called from inside a real user gesture (a click/tap handler) or
  // browsers silently refuse it; every call site in main.js respects that.
  async enterFullscreen() {
    try {
      if (this.ready && this.sdk?.screen?.fullscreenEnter) { await this.sdk.screen.fullscreenEnter(); return; }
    } catch (e) {}
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) await req.call(el);
    } catch (e) {}
  },

  async exitFullscreen() {
    try {
      if (this.ready && this.sdk?.screen?.fullscreenExit) { await this.sdk.screen.fullscreenExit(); return; }
    } catch (e) {}
    try {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (!isFs) return;
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) await exit.call(document);
    } catch (e) {}
  },

  isFullscreen() {
    try {
      if (this.ready && this.sdk?.screen?.fullscreenStatus) return this.sdk.screen.fullscreenStatus === 'fullscreen';
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    } catch (e) { return false; }
  },

  async showFullscreenAdv() {
    if (!this.ready) return;
    try {
      await new Promise((resolve) => {
        this.sdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: () => resolve(),
            onError: () => resolve(),
            onOffline: () => resolve()
          }
        });
      });
    } catch (e) {}
  },

  // Rewarded video - used for the "watch an ad, revive" offer on the death
  // screen. Resolves true only if the player actually watched it through
  // (onRewarded fired), never on close/skip/error - so callers never grant
  // the reward for free.
  async showRewardedAdv() {
    if (!this.ready) return false;
    try {
      let rewarded = false;
      await new Promise((resolve) => {
        this.sdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => { rewarded = true; },
            onClose: () => resolve(),
            onError: () => resolve()
          }
        });
      });
      return rewarded;
    } catch (e) { return false; }
  },

  async submitScore(score) {
    if (!this.ready) return false;
    try {
      const lb = await this.sdk.getLeaderboards();
      await lb.setLeaderboardScore('neonreaper_top', score);
      return true;
    } catch (e) { return false; }
  },

  async getLeaderboard(n) {
    if (!this.ready) return null;
    try {
      const lb = await this.sdk.getLeaderboards();
      const res = await lb.getLeaderboardEntries('neonreaper_top', { quantityTop: n, includeUser: true });
      return res.entries.map(e => ({
        name: e.player?.publicName || 'ИГРОК',
        score: e.score,
        level: null,
        date: null
      }));
    } catch (e) { return null; }
  }
};
