// ============================================================
// NEON REAPER - monetization.js
// ============================================================
// BASE / SCAFFOLDING ONLY. Nothing in this file is called from anywhere
// else in the game yet - no shop screen, no purchase button, no gating of
// any feature behind it. It exists purely so a future pass can wire up
// real purchases by calling these methods, instead of inventing the
// adapter shape (and re-learning the SDK's quirks) from scratch.
//
// Yandex Games exposes an in-game Payments API (sdk.getPayments()) for
// real-money purchases of virtual goods. Products (id, price, title) are
// configured server-side in the Yandex Games developer console, NOT in
// code - IAP_PRODUCTS in config.js is a local placeholder catalog for
// offline prototyping only; the real ids must match the console exactly.
//
// RuStore has its OWN separate billing SDK (RuStore Payment SDK) with a
// different API shape entirely - this adapter is Yandex-specific. A
// RuStore build needs its own equivalent adapter later (see README.md's
// "Монетизация" section) - the two are not interchangeable.
// ============================================================
'use strict';

const Monetization = {
  payments: null,
  ready: false,

  // Call once after Yandex.init() has resolved (same pattern as
  // Yandex.player - see yandex.js). Safe to call even when the Yandex SDK
  // isn't present; just leaves `ready` false and every method below a no-op.
  async init() {
    if (!Yandex.ready) { this.ready = false; return null; }
    try {
      this.payments = await Yandex.sdk.getPayments({ signed: true });
      this.ready = true;
      return this.payments;
    } catch (e) {
      this.ready = false;
      return null;
    }
  },

  // Product catalog. When the Yandex SDK is available, ask IT for the real
  // catalog (price/currency/title are server-configured there and can
  // change without a redeploy); otherwise fall back to the local
  // placeholder list in config.js so UI can be prototyped offline.
  async getCatalog() {
    if (this.ready) {
      try { return await this.payments.getCatalog(); } catch (e) { return IAP_PRODUCTS; }
    }
    return IAP_PRODUCTS;
  },

  // Starts a purchase flow for one product id (see IAP_PRODUCTS in
  // config.js for the ids this game expects to eventually exist in the
  // Yandex Games console). Resolves with the purchase object on success,
  // null on cancel/error/no-SDK - never throws, so a future caller can
  // await it without wrapping in try/catch.
  async purchase(productId) {
    if (!this.ready) return null;
    try { return await this.payments.purchase({ id: productId }); } catch (e) { return null; }
  },

  // Consumable products (currency bundles, one-time boosts) must be
  // explicitly "consumed" after the reward is granted, or the SDK refuses
  // to sell the same product again. Call this ONLY after the reward has
  // actually been applied (e.g. after Meta.addCurrency succeeds) -
  // consuming before granting risks losing the purchase on a crash.
  async consumePurchase(purchaseToken) {
    if (!this.ready) return false;
    try { await this.payments.consumePurchase(purchaseToken); return true; } catch (e) { return false; }
  },

  // Purchases the player already owns that haven't been consumed yet -
  // needed on boot to grant anything bought in a previous session that
  // got interrupted before consumePurchase() ran (e.g. tab closed right
  // after paying). Non-consumables (like remove_ads) should also be
  // re-checked here so the entitlement survives a fresh session.
  async getPurchases() {
    if (!this.ready) return [];
    try { const res = await this.payments.getPurchases(); return res.purchases || []; } catch (e) { return []; }
  }
};
