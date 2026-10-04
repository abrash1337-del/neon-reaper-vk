// ============================================================
// NEON REAPER - vk.js
// Thin adapter around VK Bridge (VK Games / OK Games platform). Every
// call is guarded so the game runs fine with no Bridge present (local
// testing, the in-chat preview build, Yandex Games, or the RuStore
// WebView build) - same philosophy as yandex.js.
//
// Unlike Yandex Games, VK does NOT inject its own SDK script when it
// hosts the game - VK Bridge has to ship as part of the game's own
// files. index.html loads it from VK's official CDN build before this
// file (see the <script> comment there); that tag simply never
// resolves to anything useful outside a VK/OK iframe, and VK.init()
// below already treats a missing/failing `vkBridge` global as "no
// platform", so nothing here needs that tag to be VK-specific.
//
// Real-money purchases (VKWebAppShowOrderBox) ARE wired up, end to end -
// unlike Yandex's single-SDK-call flow, VK purchases are only half the
// story client-side: after the user pays, VK calls a SERVER webhook with
// an order-status notification, and that server must confirm the order
// back to VK before it's final. See server/ (a small Node/Express app)
// for that half, and server/README.md for how to deploy it and point
// VK_BACKEND_URL (config.js) at it. The reward is granted client-side
// ONLY once the backend reports the order as VK-confirmed ('chargeable')
// - this codebase never fake-grants a purchase client-side alone (see
// README.md, "Монетизация").
//
// Ads (showInterstitialAd / showRewardedAd) ARE fully client-side on
// VK, same as on Yandex, so those are wired for real use.
// ============================================================
'use strict';

const VK = {
  bridge: null,
  ready: false,
  launchParams: null,

  async init() {
    if (typeof vkBridge === 'undefined') { this.ready = false; return null; }
    try {
      // VK requires VKWebAppInit to fire within 30s of game start, before
      // any other Bridge call. Outside a real VK/OK iframe this promise
      // never resolves (no host page listening) rather than rejecting, so
      // it's raced against a timeout to keep boot() from hanging forever
      // on every non-VK host (local testing, Yandex Games, RuStore).
      await Promise.race([
        vkBridge.send('VKWebAppInit', {}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('vk init timeout')), 3000))
      ]);
      this.bridge = vkBridge;
      this.ready = true;
      try { this.launchParams = await vkBridge.send('VKWebAppGetLaunchParams', {}); } catch (e) { this.launchParams = null; }
      // VK can resize/relayout its hosting iframe (safe-area insets,
      // orientation, UI chrome) without that ever reaching this page as a
      // DOM 'resize' event - main.js's own ResizeObserver/orientation/
      // timeout fallbacks (see resize() there) cover most of this, but
      // re-checking on every Bridge event too is cheap and catches
      // anything those miss (e.g. VKWebAppUpdateConfig). window.resize is
      // the same global resize() main.js defines (plain scripts, shared
      // global scope) - guarded in case main.js hasn't parsed yet.
      try {
        vkBridge.subscribe(() => { if (typeof window.resize === 'function') window.resize(); });
      } catch (e) {}
      return this.bridge;
    } catch (e) {
      this.ready = false;
      return null;
    }
  },

  // --- Fullscreen -------------------------------------------------
  // VK Bridge has no fullscreen method of its own (a Web game already
  // lives inside VK's iframe chrome) - this is the same standard
  // Fullscreen API fallback yandex.js uses outside the Yandex SDK, kept
  // here too so callers don't need to know which adapter is active.
  // Whether it actually does anything depends on the host page's
  // iframe having allow="fullscreen" set, which is outside this game's
  // control - it's a best-effort no-throw call either way.
  async enterFullscreen() {
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) await req.call(el);
    } catch (e) {}
  },
  async exitFullscreen() {
    try {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (!isFs) return;
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) await exit.call(document);
    } catch (e) {}
  },

  // --- Ads ----------------------------------------------------------
  // ad_format values confirmed against VK Bridge's own issue tracker /
  // type definitions: 'interstitial' (full-screen, closable) and
  // 'reward' (full-screen, must be watched through to resolve true).
  // Re-check against the current VK Bridge docs before shipping - ad
  // product surfaces are the part of these platform SDKs that shifts
  // most often between releases.
  async _checkAd(format) {
    if (!this.ready) return false;
    try {
      const res = await this.bridge.send('VKWebAppCheckNativeAds', { ad_format: format });
      return !!res?.result;
    } catch (e) { return false; }
  },

  // Interstitial - used the same way Yandex.showFullscreenAdv() is
  // (periodic ad between runs). Resolves once the ad closes either way;
  // never grants anything, so it's safe to call with no follow-up.
  async showInterstitialAd() {
    if (!this.ready) return;
    try {
      const available = await this._checkAd('interstitial');
      if (!available) return;
      await this.bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
    } catch (e) {}
  },

  // Rewarded - used the same way Yandex.showRewardedAdv() is (the
  // "watch an ad, revive" offer). Only resolves true when VK reports the
  // ad actually finished playing, mirroring the Yandex adapter's
  // onRewarded-only-on-completion rule so callers never grant the reward
  // for a skipped/closed/failed ad.
  async showRewardedAd() {
    if (!this.ready) return false;
    try {
      const available = await this._checkAd('reward');
      if (!available) return false;
      const res = await this.bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' });
      return !!res?.result;
    } catch (e) { return false; }
  },

  // --- Leaderboard ----------------------------------------------------
  // VK has no queryable "top N entries" API like Yandex's getLeaderboards()
  // - VKWebAppShowLeaderBoardBox just opens VK's own native leaderboard UI
  // showing the submitted result. It's a complement to, not a replacement
  // for, the game's own local/Yandex leaderboard screen - leaderboard.js
  // calls this best-effort alongside its existing logic, never instead of
  // it. Requires a leaderboard to be enabled for this game in VK's console.
  async showLeaderboard(score) {
    if (!this.ready) return false;
    try {
      const res = await this.bridge.send('VKWebAppShowLeaderBoardBox', { user_result: Math.floor(score) });
      return !!res?.success;
    } catch (e) { return false; }
  },

  // --- Social: invite / share / favorites -----------------------------
  // All best-effort and VK-only (callers hide the buttons unless VK.ready).
  appLink() {
    const id = (this.launchParams && this.launchParams.vk_app_id) || 54755987;
    return 'https://vk.com/app' + id;
  },
  async inviteFriends() {
    if (!this.ready) return false;
    try { const r = await this.bridge.send('VKWebAppShowInviteBox', {}); return !!r; }
    catch (e) {
      // Older clients / no friends access: fall back to the generic share dialog.
      try { await this.bridge.send('VKWebAppShare', { link: this.appLink() }); return true; } catch (e2) { return false; }
    }
  },
  async shareWallPost(message) {
    if (!this.ready) return false;
    try { const r = await this.bridge.send('VKWebAppShowWallPostBox', { message, attachments: this.appLink() }); return !!r; }
    catch (e) {
      try { await this.bridge.send('VKWebAppShare', { link: this.appLink() }); return true; } catch (e2) { return false; }
    }
  },
  async addToFavorites() {
    if (!this.ready) return false;
    try { const r = await this.bridge.send('VKWebAppAddToFavorites', {}); return !!(r && r.result !== false); }
    catch (e) { return false; }
  },

  // --- Storage --------------------------------------------------------
  // NOT used by Meta (js/meta.js) yet - Meta still persists progression
  // to localStorage. That's fine when the game is hosted on a stable
  // custom domain, but VK's own free static hosting (vk-miniapps-deploy)
  // issues a NEW url with every redeploy, which silently resets
  // localStorage for every player. If that hosting option is the one
  // actually used, swap Meta's persistence to these two methods instead
  // (VK's docs recommend exactly this, precisely for this reason) - they
  // key data to the VK user id rather than the browser/URL.
  async storageSet(key, value) {
    if (!this.ready) return false;
    try { await this.bridge.send('VKWebAppStorageSet', { key, value: String(value) }); return true; } catch (e) { return false; }
  },
  async storageGet(key) {
    if (!this.ready) return null;
    try {
      const res = await this.bridge.send('VKWebAppStorageGet', { keys: [key] });
      return res?.keys?.[0]?.value ?? null;
    } catch (e) { return null; }
  },

  // --- Payments -----------------------------------------------------
  // Real-money purchases, backed by server/ (see that folder's README and
  // vkSignature.js/orderStore.js) for order confirmation. The flow:
  //   1. VKWebAppShowOrderBox opens VK's own payment UI and resolves once
  //      the user finishes (or cancels) it - this alone does NOT mean the
  //      charge is confirmed; VK confirms asynchronously by calling the
  //      backend's /vk-payments webhook.
  //   2. Once the order box resolves successfully, poll the backend for
  //      that order landing as 'chargeable' (it's normally near-instant,
  //      but never assumed synchronous - see _awaitConfirmedOrder).
  //   3. Only once step 2 finds a confirmed order does the caller (main.js
  //      purchaseIAP) grant the reward, then call consumeOrder() - same
  //      "grant first, consume after" ordering js/monetization.js uses for
  //      Yandex, so a crash between the two never loses a paid purchase.
  // Returns the confirmed order record on success, null on cancel/error/
  // timeout - never throws.
  async purchase(itemId) {
    if (!this.ready || !this.launchParams || !this.launchParams.vk_user_id) return null;
    try {
      const res = await this.bridge.send('VKWebAppShowOrderBox', { type: 'item', item: itemId });
      if (!res || res.success !== true) return null;
      return await this._awaitConfirmedOrder(itemId);
    } catch (e) { return null; }
  },

  // Polls the backend for a confirmed-but-unconsumed order for the current
  // VK user (optionally narrowed to one item id). Used right after
  // purchase() above, and also worth calling once on boot (with no itemId)
  // to recover a purchase whose reward never got granted because the tab
  // closed between VK confirming payment and the client applying it.
  async _awaitConfirmedOrder(itemId, { attempts = 8, delayMs = 1500 } = {}) {
    const userId = this.launchParams && this.launchParams.vk_user_id;
    if (!userId) return null;
    for (let i = 0; i < attempts; i++) {
      const order = await this._fetchPendingOrder(userId, itemId);
      if (order) return order;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  },

  async _fetchPendingOrder(userId, itemId) {
    if (typeof VK_BACKEND_URL === 'undefined' || !VK_BACKEND_URL || VK_BACKEND_URL.includes('YOUR-BACKEND-DOMAIN')) return null;
    try {
      const qs = new URLSearchParams({ user_id: String(userId) });
      if (itemId) qs.set('item', itemId);
      const res = await fetch(`${VK_BACKEND_URL}/api/orders/pending?${qs}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.order ? data.order : null;
    } catch (e) { return null; }
  },

  // Call ONLY after the reward has actually been applied (Meta.addCurrency/
  // recordPurchase succeeded) - see purchase()'s header comment for why.
  async consumeOrder(orderId) {
    if (typeof VK_BACKEND_URL === 'undefined' || !VK_BACKEND_URL || VK_BACKEND_URL.includes('YOUR-BACKEND-DOMAIN')) return false;
    try {
      const res = await fetch(`${VK_BACKEND_URL}/api/orders/${encodeURIComponent(orderId)}/consume`, { method: 'POST' });
      return res.ok;
    } catch (e) { return false; }
  }
};
