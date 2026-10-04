// ============================================================
// NEON REAPER - main.js
// Game loop, state machine, input, collision, rendering.
// ============================================================
'use strict';

const Game = {
  state: 'menu', // menu | modeselect | howtoplay | leaderboard | playing | paused | gameover
  mode: 'hardcore',
  level: 1,
  player: null,
  enemies: [],
  boss: null,
  projectiles: [],
  walls: [],
  pickups: [],
  particles: new ParticleSystem(),
  slashes: [], // short-lived melee arc swing effects: {x,y,angle,arc,range,color,life,maxLife}
  flashes: [], // short-lived muzzle flash rings: {x,y,angle,color,life,maxLife,size}
  dashTrail: [], // fading afterimage silhouettes left behind by the dash dodge: {x,y,angle,life,maxLife}
  difficulty: null, // set in startRun from DIFFICULTIES (see config.js) via the mode-select screen's picker
  selectedDifficulty: 'normal', // the picker's current choice, persisted to localStorage - see loadDifficultyId()
  waveState: 'fighting', // fighting | bossfight | cleared | awaiting-perk
  levelTransitionTimer: 0,
  checkpoint: null,
  levelTime: 0, levelTimeMax: 0, // per-level countdown for deep levels (see LEVEL_TIMER in config.js), 0 = none
  timeLimit: 0, timeRemaining: 0, // Time Attack countdown, seconds (0 = no clock)
  pendingUnlockName: null, // set right before a level-start banner that should announce a new base weapon
  spawnQueue: [], spawnTimer: 0, // enemies still waiting to trickle in once Game.enemies drops below the mode's cap
  groundWarnings: [], // telegraph rings for incoming boss AoE: {x,y,radius,life,maxLife,color}
  revivedThisRun: false, // one rewarded-ad revive per run
  shake: { time: 0, mag: 0 },
  camera: { x: 0, y: 0 },
  pendingPurchases: new Set(), // product ids with a purchaseIAP() call in flight - blocks a concurrent double-purchase
  gameOverBusy: false // true while a game-over-screen async flow (revive ad / score submit) is in flight - blocks the other two buttons on that screen from firing concurrently
};

// ---------------------------------------------------------------
// Cross-platform ads/fullscreen dispatch - Yandex.js and vk.js are each
// fully self-contained, safe-no-op adapters; these just pick whichever
// one is actually live so the call sites below don't need to know which
// platform (if any) the game is running on. Yandex takes priority when
// both somehow report ready (shouldn't happen in practice - a build only
// ever ships to one platform's script tags actually resolving).
// ---------------------------------------------------------------
function adsReady() { return Yandex.ready || VK.ready; }
function enterFullscreenAny() { return Yandex.ready ? Yandex.enterFullscreen() : VK.enterFullscreen(); }
function exitFullscreenAny() { return Yandex.ready ? Yandex.exitFullscreen() : VK.exitFullscreen(); }
function showInterstitialAny() { return Yandex.ready ? Yandex.showFullscreenAdv() : VK.showInterstitialAd(); }
function showRewardedAny() { return Yandex.ready ? Yandex.showRewardedAdv() : VK.showRewardedAd(); }

// ---------------------------------------------------------------
// Canvas / viewport
// ---------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = window.innerWidth, viewH = window.innerHeight;
// World zoom: on small screens (phones) the arena is drawn scaled down so the
// player sees a comparable area of the map as on desktop. worldW/worldH is
// the visible world-space rectangle (viewW/worldScale).
let worldScale = 1, worldW = viewW, worldH = viewH;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // documentElement.clientWidth/Height (not window.innerWidth/innerHeight)
  // track the actual rendered viewport box, which is what matters when
  // this page sits inside a host iframe (VK/OK) - some mobile browsers
  // keep innerWidth/innerHeight stale across an iframe resize that
  // doesn't itself fire a 'resize' DOM event on this document.
  viewW = document.documentElement.clientWidth || window.innerWidth;
  viewH = document.documentElement.clientHeight || window.innerHeight;
  worldScale = Utils.clamp(Math.min(viewW / 1000, viewH / 600), 0.6, 1);
  worldW = viewW / worldScale;
  worldH = viewH / worldScale;
  document.body.classList.toggle('portrait', viewH > viewW);
  document.body.classList.toggle('short', viewH < 460);
  document.body.classList.toggle('narrow', viewW < 520);
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
// Orientation flips (mobile, VK/OK included) often report the new
// innerWidth/innerHeight a frame or two late - re-check shortly after
// instead of trusting the value at the moment the event fires.
window.addEventListener('orientationchange', () => {
  setTimeout(resize, 60);
  setTimeout(resize, 300);
});
// VK/OK host the game inside an iframe whose CSS size the host page can
// change without ever dispatching a 'resize' DOM event on this document
// (observed cause of the game rendering in a short horizontal strip with
// black bars above/below on some mobile VK clients - the canvas was
// sized once, correctly, against a not-yet-final iframe box, and nothing
// ever told it to re-measure). ResizeObserver reliably fires whenever the
// element's rendered box actually changes, regardless of DOM events.
if (window.ResizeObserver) {
  new ResizeObserver(() => resize()).observe(document.documentElement);
}
resize();
// Extra late re-checks to catch a host iframe that finishes sizing itself
// shortly after this script starts running (VK Bridge's own handshake,
// see js/vk.js VK.init, can still be in flight at this point) - cheap and
// self-correcting even when nothing was actually wrong.
setTimeout(resize, 300);
setTimeout(resize, 1200);

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------
const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false, rightDown: false }
};

window.addEventListener('keydown', (e) => {
  Input.keys.add(e.code);
  if (Game.state === 'playing') {
    if (e.code === 'Space') { if (Game.player.startDash()) onDashStart(); e.preventDefault(); }
    if (e.code === 'KeyF') throwWeapon();
    const numMap = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'];
    const ni = numMap.indexOf(e.code);
    if (ni >= 0) Game.player.switchWeaponTo(ni);
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (Game.state === 'playing') pauseGame();
    else if (Game.state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.code));

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  Input.mouse.x = e.clientX - r.left;
  Input.mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) Input.mouse.down = true;
  if (e.button === 2) { Input.mouse.rightDown = true; throwWeapon(); }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) Input.mouse.down = false;
  if (e.button === 2) Input.mouse.rightDown = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  if (Game.state !== 'playing') return;
  Game.player.switchWeapon(e.deltaY > 0 ? 1 : -1);
});

// Always-visible HUD pause button (see .hud-pause-btn in style.css) - the
// ESC/P keydown handler above only reaches a keyboard, and the touch pause
// button only exists once TouchControls.active is true, so desktop-web
// (mouse only, e.g. inside VK's web iframe) had no on-screen way to reach
// the pause screen's "quit-menu" button mid-run. VK moderation flagged
// exactly this - see /areas/neon-reaper.md.
document.getElementById('btn-pause-hud').addEventListener('click', () => {
  if (Game.state === 'playing') pauseGame();
  else if (Game.state === 'paused') resumeGame();
});

// Auto-pause when the tab/app loses focus - otherwise enemies keep attacking
// (and the player keeps taking free hits) while the player isn't even looking.
// Also fully halts audio (not just ducks it) while hidden, per Yandex's
// "when focus is lost, sound from the game stops" requirement, and resumes
// it the moment focus comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Game.state === 'playing') pauseGame();
    Sfx.suspendAll();
    releaseStuckInput();
  } else {
    Sfx.resumeAll();
  }
});

// A key held down (e.g. S/ArrowDown) or the mouse button held down at the
// moment focus leaves the window never gets its matching keyup/mouseup -
// the browser doesn't deliver those to a page that isn't focused. Without
// this, Input.keys keeps that direction "held" forever, so the player
// keeps walking (and, once paused/resumed, keeps sliding) straight into a
// wall and stays pinned there - feels like being "magnetized" to it. Any
// focus loss (alt-tab, clicking outside an embedding iframe on Yandex
// Games, opening devtools, switching apps on mobile) must clear this.
function releaseStuckInput() {
  Input.keys.clear();
  Input.mouse.down = false;
  Input.mouse.rightDown = false;
}
window.addEventListener('blur', () => {
  if (Game.state === 'playing') pauseGame();
  releaseStuckInput();
});

// ---------------------------------------------------------------
// Android hardware/gesture back button - only fires inside the RuStore
// Capacitor wrapper (@capacitor/app's plugin injects window.Capacitor on
// native builds only; this is a silent no-op in every browser, including
// Yandex Games and local testing). Pauses instead of instantly killing the
// app mid-run, matches README.md's RuStore wrapper guidance.
// ---------------------------------------------------------------
if (window.Capacitor?.isNativePlatform?.()) {
  window.Capacitor.Plugins?.App?.addListener('backButton', () => {
    if (Game.state === 'playing') pauseGame();
    else if (Game.state === 'paused') resumeGame();
    else if (Game.state === 'menu') window.Capacitor.Plugins.App.exitApp();
    else { Game.state = 'menu'; showScreen('screen-menu'); }
  });
}

function readMoveAxis() {
  let x = 0, y = 0;
  if (Input.keys.has('KeyW') || Input.keys.has('ArrowUp')) y -= 1;
  if (Input.keys.has('KeyS') || Input.keys.has('ArrowDown')) y += 1;
  if (Input.keys.has('KeyA') || Input.keys.has('ArrowLeft')) x -= 1;
  if (Input.keys.has('KeyD') || Input.keys.has('ArrowRight')) x += 1;
  return { x, y };
}

// ---------------------------------------------------------------
// Touch controls (mobile): two virtual sticks (move / aim+fire) plus
// dash/throw buttons and tap-to-switch on the weapon bar. Only shown and
// bound when a touch-capable device is detected - desktop keyboard/mouse
// input above is untouched and still works standalone.
// ---------------------------------------------------------------
const TouchControls = {
  active: false,
  moveVec: { x: 0, y: 0 },
  aimAngle: 0,
  aiming: false,

  bound: false,
  init() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) {
      // Some phone webviews (VK app) report no touch support at boot - if a
      // real touch ever arrives, switch the touch UI on at that moment.
      if (!this._lateHook) {
        this._lateHook = true;
        window.addEventListener('touchstart', () => { if (!this.bound) this.init2(); }, { once: true, passive: true });
      }
      return;
    }
    this.init2();
  },
  init2() {
    if (this.bound) return;
    this.bound = true;
    this.active = true;
    document.body.classList.add('touch-active');
    document.getElementById('touch-controls').classList.remove('hidden');
    this.bindStick(document.getElementById('stick-move'), (x, y) => { this.moveVec.x = x; this.moveVec.y = y; }, () => { this.moveVec.x = 0; this.moveVec.y = 0; });
    this.bindStick(document.getElementById('stick-aim'), (x, y, active) => { this.aimAngle = Math.atan2(y, x); this.aiming = active; }, () => { this.aiming = false; });
    const dashBtn = document.getElementById('btn-dash');
    const throwBtn = document.getElementById('btn-throw');
    const pauseBtn = document.getElementById('btn-pause');
    dashBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (Game.state === 'playing' && Game.player.startDash()) onDashStart(); });
    throwBtn.addEventListener('touchstart', (e) => { e.preventDefault(); throwWeapon(); });
    // On-screen pause - Escape/P only reach a keyboard, so touch devices need
    // their own way to pause (Yandex's "fully gesture-controlled" mobile
    // requirement).
    pauseBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (Game.state === 'playing') pauseGame();
      else if (Game.state === 'paused') resumeGame();
    });
  },

  // Binds one joystick element: reports a unit direction vector (dead-zoned)
  // while a finger is down inside it, ignores touches outside the element
  // once one is already tracked (multi-touch safe: left stick + right stick
  // + buttons all track their own touch identifier independently).
  bindStick(el, onMove, onEnd) {
    const thumb = el.querySelector('.joystick-thumb');
    const maxR = () => Math.max(32, el.getBoundingClientRect().width * 0.38);
    const deadZone = 0.18;
    let touchId = null;

    const apply = (touch) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = touch.clientX - cx, dy = touch.clientY - cy;
      const len = Math.hypot(dx, dy) || 0.0001;
      const mr = maxR();
      const clamped = Math.min(len, mr);
      thumb.style.transform = `translate(${(dx / len) * clamped}px, ${(dy / len) * clamped}px)`;
      const mag = clamped / mr;
      if (mag < deadZone) onMove(0, 0, true);
      else onMove(dx / len, dy / len, true);
    };

    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchId = t.identifier;
      apply(t);
    });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === touchId) { e.preventDefault(); apply(t); }
    });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          e.preventDefault();
          touchId = null;
          thumb.style.transform = 'translate(0,0)';
          onEnd();
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
};

// ---------------------------------------------------------------
// Screens (DOM overlays)
// ---------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('hidden', el.id !== id);
  });
  const hud = document.getElementById('hud');
  hud.classList.toggle('hidden', !(Game.state === 'playing' || Game.state === 'paused'));
}

function showLevelBanner(text) {
  const el = document.getElementById('level-banner');
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.remove('banner-anim');
  void el.offsetWidth;
  el.classList.add('banner-anim');
  clearTimeout(showLevelBanner._t);
  showLevelBanner._t = setTimeout(() => el.classList.add('hidden'), 1800);
}

// Appends a "new weapon unlocked" line to the level-start banner when this level
// permanently grants the next base-tier weapon (set by beginLevel).
function bannerTextFor(level, baseText) {
  if (Game.pendingUnlockName) {
    const text = `${baseText}  •  ${Lang.t('newWeapon')}: ${Game.pendingUnlockName.toUpperCase()}`;
    Game.pendingUnlockName = null;
    return text;
  }
  return baseText;
}

document.addEventListener('click', (e) => {
  // first user gesture on the page - safe point to spin up the audio context
  Sfx.init();
  Sfx.resume();
  if (!Music.playing) Music.start('menu');
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  Sfx.uiClick();
  handleAction(btn.dataset.action);
});

// Fired right after a dash successfully starts (see the Space keydown handler).
function onDashStart() {
  const p = Game.player;
  Sfx.dash();
  triggerShake(3, 0.08);
  Game.particles.burst(p.x, p.y, Palette.cyan, 10, { speed: [60, 200], life: [0.15, 0.3] });
}

function handleAction(action) {
  switch (action) {
    case 'play': showScreen('screen-modeselect'); break;
    case 'upgrades': openUpgrades(); break;
    case 'howtoplay': showScreen('screen-howtoplay'); break;
    case 'leaderboard': openLeaderboard(); break;
    case 'back-menu': Game.state = 'menu'; showScreen('screen-menu'); break;
    case 'resume': resumeGame(); break;
    case 'toggle-music': Music.setMuted(!Music.muted); syncAudioButtons(); break;
    case 'toggle-sfx': Sfx.setMuted(!Sfx.muted); syncAudioButtons(); break;
    case 'revive-ad': reviveViaAd(); break;
    case 'quit-menu':
      Game.state = 'menu'; Yandex.gameplayStop(); exitFullscreenAny(); Music.setMood('menu'); Music.duck(false); showScreen('screen-menu'); break;
    case 'shop': openShop(); break;
    case 'noop': break;
    case 'submit-restart': finishGameOverFlow(() => startRun(Game.mode)); break;
    case 'submit-menu': finishGameOverFlow(() => { Game.state = 'menu'; exitFullscreenAny(); showScreen('screen-menu'); }); break;
    default:
      if (action.startsWith('mode-')) startRun(action.slice(5));
      else if (action.startsWith('perk-')) choosePerk(action.slice(5));
      else if (action.startsWith('buy-iap-')) purchaseIAP(action.slice(8));
      else if (action.startsWith('buy-skin-')) buySkinAction(action.slice(9));
      else if (action.startsWith('select-skin-')) selectSkinAction(action.slice(12));
      else if (action.startsWith('buy-')) buyUpgrade(action.slice(4));
      else if (action.startsWith('diff-')) {
        Game.selectedDifficulty = action.slice(5);
        saveDifficultyId(Game.selectedDifficulty);
        buildDifficultyRow();
      }
  }
}

// Builds the mode-select buttons straight from GAME_MODES so adding/tuning a
// mode only ever means editing config.js - the menu never drifts out of sync.
function buildModeSelect() {
  const list = document.getElementById('mode-list');
  list.innerHTML = '';
  GAME_MODE_ORDER.forEach(id => {
    const m = GAME_MODES[id];
    const btn = document.createElement('button');
    btn.className = 'btn btn-mode';
    btn.dataset.action = 'mode-' + id;
    btn.innerHTML = `${Lang.name(m)}<small>${Lang.desc(m)}</small>`;
    list.appendChild(btn);
  });
}

// ---------------------------------------------------------------
// Difficulty picker (mode-select screen) - orthogonal to the mode itself,
// remembered between runs via localStorage. See DIFFICULTIES in config.js.
// ---------------------------------------------------------------
const DIFFICULTY_KEY = 'neonreaper_difficulty_v1';
function loadDifficultyId() {
  try { const id = localStorage.getItem(DIFFICULTY_KEY); return DIFFICULTIES.some(d => d.id === id) ? id : 'normal'; }
  catch (e) { return 'normal'; }
}
function saveDifficultyId(id) { try { localStorage.setItem(DIFFICULTY_KEY, id); } catch (e) {} }

function buildDifficultyRow() {
  const row = document.getElementById('difficulty-row');
  if (!row) return;
  row.innerHTML = '';
  DIFFICULTY_ORDER.forEach((id) => {
    const def = DIFFICULTIES.find(x => x.id === id);
    const btn = document.createElement('button');
    btn.className = 'diff-btn' + (Game.selectedDifficulty === id ? ' active' : '');
    btn.dataset.action = 'diff-' + id;
    btn.title = Lang.desc(def);
    btn.textContent = Lang.name(def);
    row.appendChild(btn);
  });
}

async function openLeaderboard() {
  showScreen('screen-leaderboard');
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = `<li class="lb-loading">${Lang.t('lbLoading')}</li>`;
  const top = await Leaderboard.top(10);
  list.innerHTML = '';
  if (!top.length) {
    list.innerHTML = `<li class="lb-empty">${Lang.t('lbEmpty')}</li>`;
    return;
  }
  top.forEach((e, i) => {
    const li = document.createElement('li');
    const modeShort = e.mode && GAME_MODES[e.mode] ? Lang.short(GAME_MODES[e.mode]) : '';
    li.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(e.name)}</span>${modeShort ? `<span class="lb-mode">${escapeHtml(modeShort)}</span>` : ''}<span class="lb-score">${Utils.formatScore(e.score)}</span>`;
    list.appendChild(li);
  });
}
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ---------------------------------------------------------------
// Permanent upgrades (Meta currency, see meta.js/META_UPGRADES) -
// menu-only, applied to the Player at construction time in startRun.
// ---------------------------------------------------------------
function openUpgrades() {
  renderUpgrades();
  showScreen('screen-upgrades');
}

function renderUpgrades() {
  document.getElementById('upgrades-currency').textContent = `${Lang.t('currency')}: ${Meta.getCurrency()}`;
  const list = document.getElementById('upgrades-list');
  list.innerHTML = '';
  META_UPGRADES.forEach((def) => {
    const level = Meta.getUpgradeLevel(def.id);
    const maxed = level >= def.maxLevel;
    const cost = Meta.costFor(def, level);
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${Lang.name(def)} <span class="upgrade-level">${level}/${def.maxLevel}</span></div>
        <div class="upgrade-desc">${Lang.desc(def)}</div>
      </div>
      <button class="btn btn-buy" data-action="buy-${def.id}" ${maxed || Meta.getCurrency() < cost ? 'disabled' : ''}>
        ${maxed ? Lang.t('maxLevel') : `${Lang.t('buy')} (${cost})`}
      </button>
    `;
    list.appendChild(row);
  });
}

function buyUpgrade(id) {
  if (Meta.buyUpgrade(id)) { Sfx.pickup(); renderUpgrades(); }
}

// ---------------------------------------------------------------
// Shop (real-money IAP via js/monetization.js + cosmetic skins bought with
// the free/earnable Осколки currency). See IAP_PRODUCTS/SKINS in config.js.
// ---------------------------------------------------------------
// Cache of Yandex's live catalog (id -> {price, priceCurrencyCode, ...}),
// fetched once and reused - Monetization.getCatalog() is a network call,
// so this avoids re-fetching on every shop open/render. Stays null on VK/
// local, where renderShop falls back to IAP_PRODUCTS.priceVotes instead -
// see priceLabel() inside renderShop below.
let yandexCatalogCache = null;

async function openShop() {
  if (Monetization.ready && !yandexCatalogCache) {
    try {
      const catalog = await Monetization.getCatalog();
      yandexCatalogCache = {};
      (catalog || []).forEach((p) => { yandexCatalogCache[p.id] = p; });
    } catch (e) { yandexCatalogCache = null; }
  }
  renderShop();
  showScreen('screen-shop');
}

// True once SOME real-money purchase path is actually live - Yandex
// Payments (Monetization.ready) or VK's order-confirmation backend
// (VK.ready + a real VK_BACKEND_URL configured, not the placeholder).
// Exactly one of these is ever true in a given deployed build (each
// platform's host only injects its own SDK), but checking both keeps
// local/dev testing and future platforms from needing another rewrite.
function iapReady() {
  return Monetization.ready || (VK.ready && typeof VK_BACKEND_URL !== 'undefined' && VK_BACKEND_URL && !VK_BACKEND_URL.includes('YOUR-BACKEND-DOMAIN'));
}

function renderShop() {
  document.getElementById('shop-currency').textContent = `${Lang.t('currency')}: ${Meta.getCurrency()}`;

  // ---- real-money IAP: only purchasable with a live purchase path - see
  // iapReady() above. Outside any recognized platform (local testing, the
  // in-chat preview) every row is shown but disabled - never a fake/
  // simulated purchase. A row for a purchase still in flight (see
  // Game.pendingPurchases) stays disabled and shows "processing" even
  // after a reconcile/re-render swaps in a fresh button node, so a slow
  // purchase can't be started twice from two rows.
  const iapList = document.getElementById('shop-iap-list');
  iapList.innerHTML = '';
  const ready = iapReady();
  // Explicit price+currency for each real-money item, shown on the row
  // itself (not only inside the platform's native purchase dialog) - VK
  // moderation requires the price/currency to be stated up front. Prefers
  // Yandex's own live catalog price (already formatted with currency,
  // e.g. "19 ₽") when available; falls back to the VK голоса price
  // (IAP_PRODUCTS.priceVotes) otherwise, including on any host where
  // neither SDK is live yet (local testing) so the row is never silently
  // priceless.
  function priceLabel(def) {
    const yandexProduct = yandexCatalogCache && yandexCatalogCache[def.id];
    if (yandexProduct && yandexProduct.price) return yandexProduct.price;
    if (typeof def.priceVotes === 'number') return Lang.votes(def.priceVotes);
    return '';
  }
  IAP_PRODUCTS.forEach((def) => {
    const owned = def.type === 'non_consumable' && Meta.hasPurchase(def.id);
    const pending = Game.pendingPurchases.has(def.id);
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    const label = owned ? Lang.t('owned') : (pending ? Lang.t('processing') : (ready ? Lang.t('iapBuy') : Lang.t('iapUnavailable')));
    const price = priceLabel(def);
    row.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${Lang.name(def)}${price && !owned ? ` — <span class="iap-price">${price}</span>` : ''}</div>
        <div class="upgrade-desc">${Lang.desc(def)}</div>
      </div>
      <button class="btn btn-buy" data-action="buy-iap-${def.id}" ${owned || pending || !ready ? 'disabled' : ''}>${label}</button>
    `;
    iapList.appendChild(row);
  });

  // ---- cosmetic skins: no SDK needed, just the shard wallet everyone has
  // (shards come from playing OR from the shards_* IAP above - same wallet,
  // so this never becomes pay-to-win, only pay-for-look). ----
  const skinsList = document.getElementById('shop-skins-list');
  skinsList.innerHTML = '';
  SKINS.forEach((def) => {
    const owned = Meta.ownsSkin(def.id);
    const selected = Meta.getSelectedSkin() === def.id;
    let label, action, disabled;
    if (selected) { label = Lang.t('selected'); action = 'noop'; disabled = true; }
    else if (owned) { label = Lang.t('select'); action = 'select-skin-' + def.id; disabled = false; }
    else { label = `${Lang.t('buy')} (${def.cost})`; action = 'buy-skin-' + def.id; disabled = Meta.getCurrency() < def.cost; }
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name"><span class="skin-swatch" style="background:${def.color}"></span>${Lang.name(def)}</div>
      </div>
      <button class="btn btn-buy" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>
    `;
    skinsList.appendChild(row);
  });
}

// Applies the reward for a purchased product id - shared by both platform
// flows (Yandex's purchaseIAP below and boot()'s reconcile*Purchases) so
// "what a purchase grants" is defined exactly once. Never call this before
// the platform SDK has actually confirmed the purchase (see purchaseIAP
// and reconcileVkPurchases for that guard) - this function itself trusts
// its caller completely.
function applyGrantedPurchase(id) {
  const def = IAP_PRODUCTS.find(p => p.id === id);
  if (!def) return;
  if (def.type === 'consumable') {
    Meta.addCurrency(def.currencyAmount || 0);
  } else {
    Meta.recordPurchase(id);
    if (id === 'starter_pack') {
      Meta.addCurrency(300);
      if (Game.state === 'playing' && Game.player) { Game.player.unlockWeapon('reaper_scythe'); buildWeaponBar(); }
    }
  }
}

async function purchaseIAP(id) {
  const def = IAP_PRODUCTS.find(p => p.id === id);
  // Guards, in order: unknown product / no live payments session; a second
  // call for the same product while the first is still in flight (would
  // double-grant currency / double-record a non-consumable) - see
  // Game.pendingPurchases; and a non-consumable already owned - the shop UI
  // disables its button once owned, but this stops a re-purchase from ever
  // reaching the SDK even if that's bypassed (devtools, a stale re-render).
  const alreadyOwned = def && def.type === 'non_consumable' && Meta.hasPurchase(id);
  if (!def || !iapReady() || Game.pendingPurchases.has(id) || alreadyOwned) return;
  Game.pendingPurchases.add(id);
  renderShop();
  try {
    if (Monetization.ready) {
      // ---- Yandex: one SDK call both charges and confirms; getPurchases()
      // on the next boot covers anything interrupted mid-flow. ----
      const result = await Monetization.purchase(id);
      if (result && result.purchaseToken) {
        applyGrantedPurchase(id);
        if (def.type === 'consumable') await Monetization.consumePurchase(result.purchaseToken);
        Sfx.pickup();
      }
    } else if (VK.ready) {
      // ---- VK: purchase() itself waits for the backend to see VK's
      // server-to-server confirmation (see js/vk.js) - a non-null result
      // here means the money has actually landed, not just that the order
      // box closed. ----
      const order = await VK.purchase(id);
      if (order) {
        applyGrantedPurchase(id);
        await VK.consumeOrder(order.orderId);
        Sfx.pickup();
      }
    }
  } catch (e) {
    // SDK/backend rejected (network error, payment sheet dismissed
    // abnormally, etc) - fall through to the finally block so the button
    // never gets stuck.
  } finally {
    Game.pendingPurchases.delete(id);
    renderShop();
  }
}

function buySkinAction(id) {
  if (Meta.buySkin(id)) { Sfx.pickup(); renderShop(); }
}
function selectSkinAction(id) {
  if (Meta.selectSkin(id)) {
    Sfx.uiClick();
    if (Game.player) Game.player.skin = SKINS.find(s => s.id === id) || SKINS[0];
    renderShop();
  }
}

// ---------------------------------------------------------------
// Audio mute toggles (pause menu) - persisted by Sfx/Music.setMuted (audio.js)
// ---------------------------------------------------------------
function syncAudioButtons() {
  document.getElementById('btn-toggle-music').textContent = Music.muted ? Lang.t('musicOff') : Lang.t('musicOn');
  document.getElementById('btn-toggle-sfx').textContent = Sfx.muted ? Lang.t('sfxOff') : Lang.t('sfxOn');
}

function pauseGame() { Game.state = 'paused'; syncAudioButtons(); showScreen('screen-pause'); Music.duck(true); }
function resumeGame() { Game.state = 'playing'; showScreen(null); Music.duck(false); }

// ---------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------
function startRun(mode) {
  const cfg = GAME_MODES[mode] || GAME_MODES.hardcore;
  Game.mode = cfg.id;
  Game.difficulty = DIFFICULTIES.find(d => d.id === Game.selectedDifficulty) || DIFFICULTIES.find(d => d.id === 'normal');
  Game.level = 1;
  Game.checkpoint = null;
  Game.timeLimit = cfg.timeLimit;
  Game.timeRemaining = cfg.timeLimit;
  Game.revivedThisRun = false;
  Game.spawnQueue = [];
  Game.spawnTimer = 0;
  Game.groundWarnings.length = 0;
  Level._lastLayout = null;
  const spawn = Level.playerSpawnPoint();
  Game.player = new Player(spawn.x, spawn.y);
  Game.player.scoreMult = cfg.scoreMult * Game.difficulty.scoreMult;
  Game.particles.clear();
  Game.slashes.length = 0;
  Game.flashes.length = 0;
  Game.dashTrail.length = 0;
  // Starter Pack IAP: permanently unlocks the legendary Reaper's Scythe from
  // run 1 onward once purchased (see purchaseIAP/Meta.hasPurchase).
  if (Meta.hasPurchase('starter_pack')) Game.player.unlockWeapon('reaper_scythe');
  Game.player.skin = SKINS.find(s => s.id === Meta.getSelectedSkin()) || SKINS[0];

  _lastWeaponId = null;
  buildWeaponBar();
  beginLevel(1);
  Game.state = 'playing';
  showScreen(null);
  document.getElementById('timer-label').classList.toggle('hidden', cfg.timeLimit <= 0);
  Yandex.gameplayStart();
  // Fullscreen during gameplay (Yandex mobile requirement) - fired from
  // inside the same click gesture that picked the mode, so browsers allow it.
  enterFullscreenAny();
}

function beginLevel(level) {
  const cfg = GAME_MODES[Game.mode] || GAME_MODES.hardcore;
  Game.level = level;
  Game.walls = Level.generateArena(level, cfg);
  Game.pickups = [];
  Game.projectiles = [];
  Game.particles.clear();
  Game.slashes.length = 0;
  Game.flashes.length = 0;
  Game.dashTrail.length = 0;
  const spawn = Level.playerSpawnPoint();
  Game.player.x = spawn.x; Game.player.y = spawn.y;
  Game.player.thrownWeaponId = null;
  Game.player.alive = true;
  if (Game.player.hp <= 0) Game.player.hp = Game.player.maxHp;

  // ---- base-arsenal progression: permanently unlock the next weapon on schedule ----
  const unlocked = WEAPONS.find(w => w.tier === 'unlock' && w.unlockLevel === level);
  if (unlocked && Game.player.unlockWeapon(unlocked.id)) {
    Game.pendingUnlockName = Lang.name(unlocked);
    buildWeaponBar();
  }

  // ---- rare weapon: a chance to find a top-tier gun scattered on this level's map ----
  const rare = Level.placeRareWeaponPickup(level, Game.walls);
  if (rare) Game.pickups.push(new WeaponPickup(rare.x, rare.y, rare.weaponId));

  // Always start a fresh level with a clean spawn queue - otherwise leftover
  // trickle-in enemies from the previous (non-boss) level would keep spawning
  // regular enemies alongside a boss fight, or into the next wave early.
  Game.spawnQueue = [];
  Game.spawnTimer = 0;

  if (Level.isBossLevel(level, cfg.bossEvery)) {
    Game.boss = Level.spawnBoss(level, Game.player, cfg, Game.difficulty);
    Game.enemies = [];
    Game.waveState = 'bossfight';
    showLevelBanner(bannerTextFor(level, `${Lang.t('levelLabel')} ${level} — ${Lang.t('bossLabel')}: ${Lang.name(Game.boss.def)}`));
    document.getElementById('boss-hp-wrap').classList.remove('hidden');
    document.getElementById('boss-name').textContent = Lang.name(Game.boss.def);
    Music.setMood('boss');
  } else {
    Game.boss = null;
    const wave = Level.spawnWave(level, Game.player, Game.walls, cfg, Game.difficulty);
    Game.enemies = wave.enemies;
    Game.spawnQueue = wave.queue;
    Game.waveState = 'fighting';
    showLevelBanner(bannerTextFor(level, `${Lang.t('levelLabel')} ${level}`));
    document.getElementById('boss-hp-wrap').classList.add('hidden');
    Music.setMood('gameplay');
  }
  Game.groundWarnings.length = 0;

  // ---- per-level time limit on deep levels ----
  Game.levelTime = 0; Game.levelTimeMax = 0;
  if (cfg.timeLimit <= 0 && level >= LEVEL_TIMER.startLevel) {
    const diffMult = LEVEL_TIMER.diffMult[Game.difficulty.id] || 1;
    let secs;
    if (Game.boss) secs = LEVEL_TIMER.bossTime;
    else secs = Utils.clamp(LEVEL_TIMER.base + LEVEL_TIMER.perEnemy * (Game.enemies.length + Game.spawnQueue.length), LEVEL_TIMER.min, LEVEL_TIMER.max);
    Game.levelTimeMax = Math.round(secs * diffMult);
    Game.levelTime = Game.levelTimeMax;
  }

  if (cfg.checkpointEvery > 0 && Level.isCheckpointLevel(level, cfg.checkpointEvery)) {
    Game.checkpoint = { level, score: Game.player.score };
  }
}

function onStageCleared() {
  if (Game.waveState === 'cleared') return;
  Game.waveState = 'cleared';
  Game.levelTransitionTimer = 1.3;
}

// ---------------------------------------------------------------
// Perk choice: a run-only "pick 1 of 3" upgrade offered on every level
// clear (see PERKS in config.js) - this is what gives each run its own
// build on top of the fixed weapon-unlock schedule.
// ---------------------------------------------------------------
// Perks that are still worth offering right now: a capped stackable perk
// (see Player.perkAtCap) is excluded once maxed out so a choice is never
// wasted on something that does nothing anymore, and 'heal' is excluded
// while already at full HP for the same reason.
function availablePerks() {
  const p = Game.player;
  return PERKS.filter((perk) => {
    if (perk.id === 'heal') return p.hp < p.maxHp;
    return !p.perkAtCap(perk.id);
  });
}

function samplePerks(n) {
  const pool = availablePerks();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function showPerkChoice() {
  const offered = samplePerks(3);
  // Every perk this run has either capped out or isn't relevant right now
  // (e.g. full HP + everything else maxed) - nothing meaningful to offer,
  // so skip the screen entirely instead of showing an empty/broken one.
  if (!offered.length) { Game.waveState = 'fighting'; Game.state = 'playing'; beginLevel(Game.level + 1); return; }
  Game.state = 'perkchoice';
  const list = document.getElementById('perk-list');
  list.innerHTML = '';
  const p = Game.player;
  offered.forEach((perk) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-mode';
    btn.dataset.action = 'perk-' + perk.id;
    const stackNote = perk.maxStacks != null ? ` <span class="upgrade-level">${p.perkStacks[perk.id]}/${perk.maxStacks}</span>` : '';
    btn.innerHTML = `${Lang.name(perk)}${stackNote}<small>${Lang.desc(perk)}</small>`;
    list.appendChild(btn);
  });
  showScreen('screen-perkchoice');
}

function choosePerk(id) {
  Game.player.applyPerk(id);
  Game.waveState = 'fighting';
  Game.state = 'playing';
  showScreen(null);
  Sfx.levelup();
  beginLevel(Game.level + 1);
}

// Currency earned this run - rewards both score and depth reached, so a
// long cautious run and a high-score aggressive run both pay out fairly.
function currencyForRun(player, level) {
  return Math.round(player.score / 40) + level * 3;
}

function endRun(reason) {
  Game.state = 'gameover';
  Game.gameOverBusy = false;
  Yandex.gameplayStop();
  Sfx.gameover();
  Music.setMood('menu');
  Music.duck(false);

  // ---- revive-via-ad offer: once per run, only while a platform's ads are
  // actually available (Yandex or VK), and only before the player has
  // already used it this run ----
  const reviveBtn = document.getElementById('btn-revive-ad');
  const canOfferRevive = (reason === 'death' || reason === 'leveltime') && adsReady() && !Game.revivedThisRun;
  reviveBtn.classList.toggle('hidden', !canOfferRevive);

  const title = document.getElementById('gameover-title');
  title.textContent = reason === 'death' ? Lang.t('deathTitle') : (reason === 'timeup' || reason === 'leveltime') ? Lang.t('timeupTitle') : Lang.t('overTitle');
  const stats = document.getElementById('gameover-stats');
  const modeName = Lang.short(GAME_MODES[Game.mode] || GAME_MODES.hardcore);
  const earned = currencyForRun(Game.player, Game.level);
  Meta.addCurrency(earned);
  const runCount = Meta.recordRunEnd();
  stats.innerHTML = `
    <div class="stat"><span>${Lang.t('statScore')}</span><b>${Utils.formatScore(Game.player.score)}</b></div>
    <div class="stat"><span>${Lang.t('statLevel')}</span><b>${Game.level}</b></div>
    <div class="stat"><span>${Lang.t('statMode')}</span><b>${modeName}</b></div>
    <div class="stat"><span>${Lang.t('statDifficulty')}</span><b>${Lang.name(Game.difficulty)}</b></div>
    <div class="stat"><span>${Lang.t('earnedCurrency')}</span><b>${earned}</b></div>
  `;
  document.getElementById('name-input').value = Leaderboard.getLocalName();
  showScreen('screen-gameover');

  // Interstitial ad on a cadence (every 3rd run) rather than every death -
  // keeps the game from feeling ad-gated while still monetizing repeat play.
  // Skipped entirely once the player owns the 'remove_ads' IAP.
  if (runCount % 3 === 0 && !Meta.hasPurchase('remove_ads')) showInterstitialAny();
}

// The game-over screen has three buttons that each kick off an async flow
// (revive-ad / restart / to-menu) - only one may run at a time, or a
// double-tap (very reachable on mobile) can double-submit the leaderboard
// entry, double-start a run, or let a revive land on a run the player
// already abandoned. Game.gameOverBusy + this helper is the shared lock.
function setGameOverButtonsBusy(busy) {
  Game.gameOverBusy = busy;
  const reviveBtn = document.getElementById('btn-revive-ad');
  const restartBtn = document.querySelector('#screen-gameover [data-action="submit-restart"]');
  const menuBtn = document.querySelector('#screen-gameover [data-action="submit-menu"]');
  if (reviveBtn && !reviveBtn.classList.contains('hidden')) reviveBtn.disabled = busy;
  if (restartBtn) restartBtn.disabled = busy;
  if (menuBtn) menuBtn.disabled = busy;
}

// "Watch an ad, revive" - only reachable from the death screen, only once per
// run. On a successful watch, resurrects the player on the spot with partial
// HP and resumes play immediately instead of returning to the menu.
async function reviveViaAd() {
  if (Game.gameOverBusy) return;
  const targetPlayer = Game.player; // snapshot - see the staleness check below
  setGameOverButtonsBusy(true);
  let rewarded = false;
  try {
    // Re-assert fullscreen right before the rewarded ad, in the same click
    // gesture as the "watch ad" button - the run-start fullscreen call
    // (startRun's enterFullscreenAny) doesn't reliably survive to this
    // point (backgrounding, the game-over overlay, or the platform simply
    // not keeping it across a whole run), and VK moderation requires the
    // reward ad itself to launch in fullscreen, not just the gameplay.
    await enterFullscreenAny();
    rewarded = await showRewardedAny();
  } catch (e) {
    rewarded = false;
  } finally {
    setGameOverButtonsBusy(false);
  }
  // The player could have restarted or quit to the menu while the ad was
  // loading (both were disabled during the ad, but this guards against any
  // future path that reaches endRun/startRun without going through the
  // busy lock) - bail rather than reviving/resuming the wrong run.
  if (!rewarded || Game.state !== 'gameover' || Game.player !== targetPlayer) return;
  Game.revivedThisRun = true;
  const p = Game.player;
  p.alive = true;
  p.hp = Math.round(p.maxHp * 0.5);
  p.invuln = 1.5;
  if (Game.levelTimeMax > 0) Game.levelTime = Math.max(30, Math.round(Game.levelTimeMax * 0.4));
  Game.state = 'playing';
  showScreen(null);
  Music.setMood(Game.boss ? 'boss' : 'gameplay');
  Yandex.gameplayStart();
  Sfx.checkpoint();
  showLevelBanner(Lang.t('checkpointRevive'));
}

function finishGameOverFlow(next) {
  if (Game.gameOverBusy) return;
  setGameOverButtonsBusy(true);
  const nameInput = document.getElementById('name-input');
  Leaderboard.setLocalName(nameInput.value);
  Leaderboard.submit(Game.player.score, Game.level, Game.mode).finally(() => {
    setGameOverButtonsBusy(false);
    next();
  });
}

// ---------------------------------------------------------------
// Weapon bar (DOM)
// ---------------------------------------------------------------
// Rebuilds the DOM bar from the player's *current* loadout order (weaponIds),
// so the number shown on each slot always matches what the number key actually
// selects (switchWeaponTo(n) indexes into weaponIds, not the full WEAPONS list).
// Not-yet-owned weapons are appended afterwards as locked "???" slots so
// progression has something to tease. Call this again any time weaponIds changes.
function buildWeaponBar() {
  const bar = document.getElementById('weapon-bar');
  bar.innerHTML = '';
  const owned = Game.player ? Game.player.weaponIds : WEAPONS.filter(w => w.tier === 'starter').map(w => w.id);

  owned.forEach((id, i) => {
    const w = WEAPONS.find(x => x.id === id);
    const slot = document.createElement('div');
    slot.className = 'weapon-slot';
    slot.dataset.weaponId = w.id;
    slot.dataset.weaponIndex = i;
    slot.innerHTML = `<span class="wkey">${(i + 1) % 10}</span><span class="wname">${Lang.name(w)}</span>`;
    // touchstart (not just click): with both thumbs already on the sticks a
    // third finger's tap is not reliably turned into a 'click' by mobile
    // browsers, so the weapon could not be switched mid-fight. touchstart
    // fires immediately for every new finger. preventDefault stops the
    // follow-up synthetic click from switching twice.
    slot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectWeaponSlot(i);
    }, { passive: false });
    slot.addEventListener('click', () => selectWeaponSlot(i));
    bar.appendChild(slot);
  });

  WEAPONS.filter(w => !owned.includes(w.id)).forEach((w) => {
    const slot = document.createElement('div');
    slot.className = 'weapon-slot locked';
    slot.dataset.weaponId = w.id;
    slot.innerHTML = `<span class="wkey">&#128274;</span><span class="wname">???</span>`;
    bar.appendChild(slot);
  });
}
function selectWeaponSlot(i) {
  if (Game.state === 'playing' && Game.player) Game.player.switchWeaponTo(i);
}

// Small floating weapon-name label (touch screens hide the names on the
// compact bar, so announce the weapon whenever it changes).
let _lastWeaponId = null;
function showWeaponToast(w) {
  const el = document.getElementById('weapon-toast');
  if (!el) return;
  el.textContent = Lang.name(w);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showWeaponToast._t);
  showWeaponToast._t = setTimeout(() => el.classList.remove('show'), 1100);
}
function updateWeaponBar() {
  const p = Game.player;
  const bar = document.getElementById('weapon-bar');
  bar.querySelectorAll('.weapon-slot').forEach((el) => {
    const id = el.dataset.weaponId;
    el.classList.toggle('active', !!p.weapon && id === p.weapon.id);
    el.classList.toggle('unavailable', p.thrownWeaponId === id);
  });
  if (p.weapon && p.weapon.id !== _lastWeaponId) {
    if (_lastWeaponId !== null) showWeaponToast(p.weapon);
    _lastWeaponId = p.weapon.id;
  }
}

// ---------------------------------------------------------------
// Combat: attack / throw
// ---------------------------------------------------------------
function updateSpinUp(dt) {
  const p = Game.player;
  const w = p.weapon;
  const firing = Input.mouse.down || (TouchControls.active && TouchControls.aiming);
  if (firing && w.spinUp) p.spinUp = Math.min(1, p.spinUp + dt / 0.6);
  else p.spinUp = Math.max(0, p.spinUp - dt / 0.3);
}

function performAttack() {
  const p = Game.player;
  if (p.attackTimer > 0) return;
  const w = p.weapon;
  if (w.throwable && p.thrownWeaponId === w.id) return; // currently thrown away
  const cooldownMult = (GAME_MODES[Game.mode] || GAME_MODES.hardcore).cooldownMult * p.runCooldownMult;

  if (w.type === 'melee') {
    meleeSwing(p, w);
    p.attackTimer = w.cooldown * cooldownMult;
    Sfx.melee();
  } else {
    fireRanged(p, w);
    p.attackTimer = (w.spinUp ? Utils.lerp(w.cooldown * 3, w.cooldown, p.spinUp) : w.cooldown) * cooldownMult;
    // explosive weapons only get their boom on impact (explodeAt), not on launch too
    if (w.explosive || w.dmg >= 40 || w.beam) Sfx.shootHeavy();
    else Sfx.shootLight();
  }
  triggerShake(w.type === 'melee' ? 2 : 3, 0.08);
}

function meleeSwing(p, w) {
  const targets = [...Game.enemies];
  if (Game.boss) targets.push(Game.boss);
  const hitColor = w.color;

  // visible arc "slash" sweep - the actual swing animation
  Game.slashes.push({
    x: p.x, y: p.y, angle: p.angle, arc: w.arc, range: w.range,
    color: w.color, life: 0.16, maxLife: 0.16
  });
  Game.particles.burst(
    p.x + Math.cos(p.angle) * w.range * 0.6,
    p.y + Math.sin(p.angle) * w.range * 0.6,
    hitColor, 10, { speed: [60, 200], life: [0.15, 0.3] }
  );
  const dmg = w.dmg * p.dmgMult;
  targets.forEach((t) => {
    const d = Utils.dist(p.x, p.y, t.x, t.y);
    if (d > w.range + t.radius) return;
    const a = Utils.angleTo(p.x, p.y, t.x, t.y);
    if (Math.abs(Utils.normalizeAngleDiff(a - p.angle)) > w.arc / 2) return;
    const kb = Utils.vecFromAngle(a, w.knockback);
    const dead = t.isBoss ? t.takeDamage(dmg) : t.takeDamage(dmg, kb.x, kb.y);
    if (!t.isBoss) { t.x += kb.x * 0.02; t.y += kb.y * 0.02; }
    if (w.stun && !t.isBoss && !dead) t.stunTimer = Math.max(t.stunTimer || 0, w.stun);
    // legendary Reaper's Scythe: heals the wielder for a cut of the damage dealt
    if (w.lifesteal && p.alive) {
      p.hp = Math.min(p.maxHp, p.hp + dmg * w.lifesteal);
      Game.particles.burst(p.x, p.y, Palette.green, 4, { speed: [20, 60], life: [0.2, 0.4] });
    }
    Game.particles.burst(t.x, t.y, hitColor, 8, { speed: [40, 160], life: [0.15, 0.3] });
    if (dead) onEnemyOrBossKilled(t); else Sfx.hit();
  });
  // destructible walls in melee range (fists/katana can smash weak walls up close)
  Game.walls.forEach((wall) => {
    if (wall.dead || !wall.destructible) return;
    const cx = Utils.clamp(p.x, wall.x, wall.x + wall.w);
    const cy = Utils.clamp(p.y, wall.y, wall.y + wall.h);
    if (Utils.dist(p.x, p.y, cx, cy) < w.range * 0.7) {
      wall.damage(dmg * 0.5);
      Game.particles.burst(cx, cy, Palette.orange, 6, { speed: [40, 140], life: [0.15, 0.3] });
      if (wall.dead) wallDestroyedEffect(wall);
    }
  });
}

// Nearest live enemy or boss to (x,y), or null if the arena is currently empty -
// used by the legendary Seeker Cannon to pick each shot's homing target.
function nearestTarget(x, y) {
  let best = null, bestD = Infinity;
  Game.enemies.forEach((en) => { const d = Utils.dist(x, y, en.x, en.y); if (d < bestD) { bestD = d; best = en; } });
  if (Game.boss) { const d = Utils.dist(x, y, Game.boss.x, Game.boss.y); if (d < bestD) best = Game.boss; }
  return best;
}

function fireRanged(p, w) {
  const pellets = w.pellets || 1;
  const muzzleX = p.x + Math.cos(p.angle) * (p.radius + 6);
  const muzzleY = p.y + Math.sin(p.angle) * (p.radius + 6);
  const homingTarget = w.homing ? nearestTarget(muzzleX, muzzleY) : null;
  for (let i = 0; i < pellets; i++) {
    const spread = (Math.random() - 0.5) * w.spread;
    const a = p.angle + spread;
    Game.projectiles.push(new Projectile({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(a) * w.projSpeed, vy: Math.sin(a) * w.projSpeed,
      radius: w.beam ? 4 : 5, dmg: w.dmg * p.dmgMult, color: w.color, owner: 'player',
      pierce: !!w.pierce, breaksWalls: !!w.breaksWalls,
      explosive: !!w.explosive, explosionRadius: w.explosionRadius || 0,
      burn: w.burn || null,
      homing: !!homingTarget, target: homingTarget, turnRate: w.turnRate || 2.4,
      life: w.life || 1.4
    }));
  }
  // bright muzzle flash ring - the actual "shooting animation" cue
  Game.flashes.push({ x: muzzleX, y: muzzleY, angle: p.angle, color: w.color, life: 0.1, maxLife: 0.1, size: w.beam ? 20 : 14 });
  Game.particles.burst(muzzleX, muzzleY, w.color, 7, { speed: [40, 140], life: [0.1, 0.2] });
}

function wallDestroyedEffect(wall) {
  const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
  Game.particles.burst(cx, cy, Palette.orange, 26, { speed: [80, 300], life: [0.3, 0.6], size: [3, 7] });
  triggerShake(6, 0.18);
  Sfx.wallBreak();
}

function throwWeapon() {
  if (Game.state !== 'playing') return;
  const p = Game.player;
  const w = p.weapon;
  if (!w.throwable || p.thrownWeaponId) return;
  Game.projectiles.push(new Projectile({
    x: p.x + Math.cos(p.angle) * (p.radius + 6),
    y: p.y + Math.sin(p.angle) * (p.radius + 6),
    vx: Math.cos(p.angle) * w.projSpeed, vy: Math.sin(p.angle) * w.projSpeed,
    radius: 7, dmg: w.projDmg * p.dmgMult, color: w.color, owner: 'player',
    pierce: !!w.pierce, breaksWalls: false, life: 1.1,
    isThrownWeapon: true, weaponId: w.id
  }));
  Game.particles.burst(
    p.x + Math.cos(p.angle) * (p.radius + 6), p.y + Math.sin(p.angle) * (p.radius + 6),
    w.color, 8, { speed: [50, 160], life: [0.15, 0.3] }
  );
  p.thrownWeaponId = w.id;
  p.switchWeaponTo('fists');
}

function onEnemyOrBossKilled(entity) {
  const scoreVal = entity.isBoss ? entity.def.score : entity.def.score;
  Game.player.registerKill(scoreVal);
  Game.particles.burst(entity.x, entity.y, entity.color, entity.isBoss ? 60 : 18,
    { speed: [60, entity.isBoss ? 420 : 220], life: [0.3, entity.isBoss ? 0.9 : 0.5] });
  triggerShake(entity.isBoss ? 14 : 4, entity.isBoss ? 0.5 : 0.12);
  if (entity.isBoss) { Sfx.bossDeath(); Game.boss = null; } else { Sfx.death(); }
}

function triggerShake(mag, time) {
  Game.shake.mag = Math.max(Game.shake.mag, mag);
  Game.shake.time = Math.max(Game.shake.time, time);
}

// ---------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------
function resolveWallCollision(entity, walls) {
  for (const wall of walls) {
    if (wall.dead) continue;
    const nx = Utils.clamp(entity.x, wall.x, wall.x + wall.w);
    const ny = Utils.clamp(entity.y, wall.y, wall.y + wall.h);
    const dx = entity.x - nx, dy = entity.y - ny;
    const d = Math.hypot(dx, dy);
    if (d < entity.radius) {
      if (d === 0) {
        const overs = [
          [entity.x - wall.x, () => entity.x = wall.x - entity.radius],
          [wall.x + wall.w - entity.x, () => entity.x = wall.x + wall.w + entity.radius],
          [entity.y - wall.y, () => entity.y = wall.y - entity.radius],
          [wall.y + wall.h - entity.y, () => entity.y = wall.y + wall.h + entity.radius]
        ];
        overs.sort((a, b) => a[0] - b[0]);
        overs[0][1]();
      } else {
        const push = (entity.radius - d) / d;
        entity.x += dx * push; entity.y += dy * push;
      }
    }
  }
}

function explodeAt(x, y, radius, dmg, particles, color) {
  particles.burst(x, y, color, 34, { speed: [80, 340], life: [0.3, 0.7] });
  triggerShake(10, 0.3);
  Sfx.explosion();
  const affectDamage = (target) => {
    const d = Utils.dist(x, y, target.x, target.y);
    if (d <= radius + target.radius) {
      const falloff = 1 - d / (radius + target.radius);
      const dmgv = dmg * Utils.clamp(falloff, 0.25, 1);
      const kb = Utils.vecFromAngle(Utils.angleTo(x, y, target.x, target.y), 220);
      return { dmgv, kb };
    }
    return null;
  };
  Game.enemies.forEach((en) => {
    const hit = affectDamage(en);
    if (hit) { const dead = en.takeDamage(hit.dmgv, hit.kb.x, hit.kb.y); if (dead) onEnemyOrBossKilled(en); }
  });
  if (Game.boss) {
    const hit = affectDamage(Game.boss);
    if (hit) { const dead = Game.boss.takeDamage(hit.dmgv); if (dead) onEnemyOrBossKilled(Game.boss); }
  }
  const distToPlayer = Utils.dist(x, y, Game.player.x, Game.player.y);
  if (distToPlayer <= radius + Game.player.radius) {
    Game.player.takeDamage(Math.round(dmg * 0.6));
  }
  Game.walls.forEach((w) => {
    if (!w.destructible || w.dead) return;
    const cx = Utils.clamp(x, w.x, w.x + w.w), cy = Utils.clamp(y, w.y, w.y + w.h);
    if (Utils.dist(x, y, cx, cy) <= radius) w.damage(dmg);
  });
}

// ---------------------------------------------------------------
// Update
// ---------------------------------------------------------------
function update(dt) {
  const p = Game.player;
  const touchMoving = TouchControls.active && (TouchControls.moveVec.x || TouchControls.moveVec.y);
  const move = touchMoving ? TouchControls.moveVec : readMoveAxis();
  p.moveX = move.x; p.moveY = move.y;

  if (TouchControls.active && TouchControls.aiming) {
    p.angle = TouchControls.aimAngle;
  } else {
    const worldMouse = screenToWorld(Input.mouse.x, Input.mouse.y);
    p.angle = Utils.angleTo(p.x, p.y, worldMouse.x, worldMouse.y);
  }

  p.update(dt);
  resolveWallCollision(p, Game.walls);
  p.x = Utils.clamp(p.x, 0, Balance.arenaW);
  p.y = Utils.clamp(p.y, 0, Balance.arenaH);
  // chilled by the Cryo boss (see the projectile-vs-player block below) -
  // a light frost-particle tell, matching the ember cue burning enemies get
  if (p.chillTimer > 0 && Math.random() < 0.35) {
    Game.particles.burst(p.x, p.y, Palette.cyan, 1, { speed: [10, 40], life: [0.15, 0.3], size: [2, 3] });
  }

  updateSpinUp(dt);
  if (Input.mouse.down || (TouchControls.active && TouchControls.aiming)) performAttack();

  // ---- projectiles ----
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    const pr = Game.projectiles[i];
    pr.update(dt);
    let removed = false;

    if (pr.owner === 'player') {
      for (const wall of Game.walls) {
        if (wall.dead) continue;
        if (Utils.circleRectOverlap(pr.x, pr.y, pr.radius, wall)) {
          if (wall.destructible && pr.breaksWalls) {
            wall.damage(pr.dmg);
            if (wall.dead) wallDestroyedEffect(wall);
          }
          if (pr.explosive) explodeAt(pr.x, pr.y, pr.explosionRadius, pr.dmg, Game.particles, pr.color);
          else Game.particles.burst(pr.x, pr.y, pr.color, 8, { speed: [50, 200], life: [0.15, 0.35] });
          removed = true; break;
        }
      }
      if (!removed) {
        const targets = [...Game.enemies];
        if (Game.boss) targets.push(Game.boss);
        for (const t of targets) {
          if (pr.hitSet.has(t.id)) continue;
          if (Utils.circlesOverlap(pr.x, pr.y, pr.radius, t.x, t.y, t.radius)) {
            pr.hitSet.add(t.id);
            if (pr.explosive) {
              explodeAt(pr.x, pr.y, pr.explosionRadius, pr.dmg, Game.particles, pr.color);
            } else {
              const kb = Utils.vecFromAngle(Math.atan2(pr.vy, pr.vx), 120);
              const dead = t.isBoss ? t.takeDamage(pr.dmg) : t.takeDamage(pr.dmg, kb.x, kb.y);
              Game.particles.burst(t.x, t.y, pr.color, 6, { speed: [40, 140], life: [0.15, 0.3] });
              if (pr.burn && !dead) {
                t.burnTimer = Math.max(t.burnTimer || 0, pr.burn.duration);
                t.burnDps = pr.burn.dps;
              }
              if (dead) onEnemyOrBossKilled(t); else Sfx.hit();
            }
            if (!pr.pierce) { removed = true; break; }
          }
        }
      }
    } else {
      // enemy/boss projectile vs player
      if (Utils.circlesOverlap(pr.x, pr.y, pr.radius, p.x, p.y, p.radius)) {
        if (pr.explosive) explodeAt(pr.x, pr.y, pr.explosionRadius, pr.dmg, Game.particles, pr.color);
        else {
          const hit = p.takeDamage(pr.dmg);
          // Cryo boss's ice attacks (see BossPatterns.iceLance/frostBurst/freezeNova)
          // carry a `chill` payload - only applies on a landed hit, never through
          // dash i-frames, and never stacks past whichever slow is strongest.
          if (hit && pr.chill) {
            p.chillTimer = Math.max(p.chillTimer, pr.chill.duration);
            p.chillMult = Math.min(p.chillMult, pr.chill.mult);
          }
        }
        removed = true;
      }
      for (const wall of Game.walls) {
        if (wall.dead) continue;
        if (!wall.destructible && Utils.circleRectOverlap(pr.x, pr.y, pr.radius, wall)) { removed = true; break; }
      }
    }

    if (pr.dead) removed = true;
    if (removed) {
      if (pr.isThrownWeapon) Game.pickups.push(new WeaponPickup(pr.x, pr.y, pr.weaponId));
      else if (pr.explosive) { /* already exploded above */ }
      Game.projectiles.splice(i, 1);
    }
  }

  // ---- pickups ----
  for (let i = Game.pickups.length - 1; i >= 0; i--) {
    const pk = Game.pickups[i];
    if (Utils.circlesOverlap(pk.x, pk.y, pk.radius, p.x, p.y, p.radius)) {
      if (p.thrownWeaponId === pk.weaponId) p.thrownWeaponId = null;
      const isNewFind = p.unlockWeapon(pk.weaponId);
      p.switchWeaponTo(pk.weaponId);
      Game.pickups.splice(i, 1);
      if (isNewFind) {
        const w = WEAPONS.find(x => x.id === pk.weaponId);
        const label = w.tier === 'legendary' ? Lang.t('foundLegendary') : Lang.t('foundWeapon');
        showLevelBanner(`${label}: ${Lang.name(w).toUpperCase()}`);
        Game.particles.burst(pk.x, pk.y, w.color, w.tier === 'legendary' ? 46 : 24, { speed: [80, 260], life: [0.3, 0.7], size: [3, 7] });
        triggerShake(w.tier === 'legendary' ? 9 : 5, w.tier === 'legendary' ? 0.25 : 0.15);
        buildWeaponBar();
        Sfx.pickup();
      }
    }
  }

  // ---- enemies ----
  for (let i = Game.enemies.length - 1; i >= 0; i--) {
    const en = Game.enemies[i];
    en.update(dt, p, Game.projectiles, Game.walls, Game.enemies);
    resolveWallCollision(en, Game.walls);
    en.touchCooldown = (en.touchCooldown || 0) - dt;
    // !en.dead guard: a corpse killed earlier this same frame (melee/an
    // earlier projectile) is still in this array until the splice below,
    // and its position is now frozen (en.update() no-ops once dead) - don't
    // let it land one last contact hit on the player.
    if (!en.dead && Utils.circlesOverlap(en.x, en.y, en.radius, p.x, p.y, p.radius)) {
      if ((en.touchCooldown || 0) <= 0) {
        p.takeDamage(Math.round(en.def.contactDmg * (en.dmgMult || 1)));
        en.touchCooldown = 0.5;
      }
    }
    if (!en.dead && en.burnTimer > 0) {
      en.burnTimer -= dt;
      if (Math.random() < 0.4) Game.particles.burst(en.x, en.y, Palette.ember, 1, { speed: [10, 40], life: [0.15, 0.3], size: [2, 3] });
      const burned = en.takeDamage(en.burnDps * dt);
      if (burned) onEnemyOrBossKilled(en);
    }
    if (en.dead) Game.enemies.splice(i, 1);
  }

  // ---- trickle in queued enemies as the alive count drops below the cap ----
  if (Game.spawnQueue.length > 0) {
    Game.spawnTimer -= dt;
    const cfgCap = (GAME_MODES[Game.mode] || GAME_MODES.hardcore).maxAlive;
    if (Game.spawnTimer <= 0 && Game.enemies.length < cfgCap) {
      const type = Game.spawnQueue.shift();
      const pos = Level.spawnPositionAwayFrom(p.x, p.y, 260, Game.walls);
      const en = new Enemy(type, pos.x, pos.y);
      const diff = Game.difficulty;
      en.speedMult = (GAME_MODES[Game.mode] || GAME_MODES.hardcore).enemySpeedMult * (diff ? diff.speedMult : 1);
      en.hp = Math.round(en.hp * (diff ? diff.hpMult : 1)); en.maxHp = en.hp;
      en.dmgMult = diff ? diff.dmgMult : 1;
      Game.enemies.push(en);
      Game.spawnTimer = 0.12;
    }
  }

  // ---- boss ----
  if (Game.boss) {
    Game.boss.update(dt, p, Game.projectiles, Game.particles, Level.arena, Game.groundWarnings);
    Game.boss.touchCooldown = (Game.boss.touchCooldown || 0) - dt;
    if (Utils.circlesOverlap(Game.boss.x, Game.boss.y, Game.boss.radius, p.x, p.y, p.radius)) {
      if ((Game.boss.touchCooldown || 0) <= 0) { p.takeDamage(Math.round(16 * (Game.boss.dmgMult || 1))); Game.boss.touchCooldown = 0.4; }
    }
    if (Game.boss.burnTimer > 0) {
      Game.boss.burnTimer -= dt;
      const burned = Game.boss.takeDamage(Game.boss.burnDps * dt);
      if (burned) onEnemyOrBossKilled(Game.boss);
    }
  }

  Game.particles.update(dt);
  for (let i = Game.slashes.length - 1; i >= 0; i--) { Game.slashes[i].life -= dt; if (Game.slashes[i].life <= 0) Game.slashes.splice(i, 1); }
  for (let i = Game.flashes.length - 1; i >= 0; i--) { Game.flashes[i].life -= dt; if (Game.flashes[i].life <= 0) Game.flashes.splice(i, 1); }
  for (let i = Game.groundWarnings.length - 1; i >= 0; i--) { Game.groundWarnings[i].life -= dt; if (Game.groundWarnings[i].life <= 0) Game.groundWarnings.splice(i, 1); }
  if (Game.shake.time > 0) { Game.shake.time -= dt; if (Game.shake.time <= 0) Game.shake.mag = 0; }

  // ---- dash afterimage trail (the dodge animation) ----
  if (p.dashing) {
    Game.dashTrail.push({ x: p.x, y: p.y, angle: p.angle, life: 0.22, maxLife: 0.22 });
  }
  for (let i = Game.dashTrail.length - 1; i >= 0; i--) {
    Game.dashTrail[i].life -= dt;
    if (Game.dashTrail[i].life <= 0) Game.dashTrail.splice(i, 1);
  }

  // ---- stage clear / progression ----
  if (Game.waveState === 'fighting' && Game.enemies.length === 0 && Game.spawnQueue.length === 0) onStageCleared();
  if (Game.waveState === 'bossfight' && !Game.boss) onStageCleared();
  if (Game.waveState === 'cleared') {
    Game.levelTransitionTimer -= dt;
    if (Game.levelTransitionTimer <= 0) { Game.waveState = 'awaiting-perk'; showPerkChoice(); }
  }

  // ---- death / checkpoint ----
  if (!p.alive) {
    if (Game.checkpoint) {
      const cp = Game.checkpoint;
      p.alive = true; p.hp = p.maxHp; p.score = cp.score;
      beginLevel(cp.level);
      showLevelBanner(Lang.t('checkpointRevive'));
      Sfx.checkpoint();
    } else {
      endRun('death');
    }
  }

  // ---- time-limited modes (Time Attack) ----
  if (Game.timeLimit > 0 && Game.state === 'playing') {
    Game.timeRemaining -= dt;
    if (Game.timeRemaining <= 0) { Game.timeRemaining = 0; endRun('timeup'); }
  }

  // ---- per-level countdown (deep levels) ----
  if (Game.levelTimeMax > 0 && Game.state === 'playing' && (Game.waveState === 'fighting' || Game.waveState === 'bossfight')) {
    Game.levelTime -= dt;
    if (Game.levelTime <= 0) {
      Game.levelTime = 0;
      if (Game.checkpoint) {
        const cp = Game.checkpoint;
        p.alive = true; p.hp = p.maxHp; p.score = cp.score;
        beginLevel(cp.level);
        showLevelBanner(Lang.t('checkpointRevive'));
        Sfx.checkpoint();
      } else {
        endRun('leveltime');
      }
    }
  }

  updateHud();
}

function screenToWorld(sx, sy) { return { x: sx / worldScale + Game.camera.x, y: sy / worldScale + Game.camera.y }; }

function updateHud() {
  const p = Game.player;
  document.getElementById('hp-fill').style.width = Utils.clamp(p.hp / p.maxHp, 0, 1) * 100 + '%';
  document.getElementById('level-label').textContent = Lang.t('levelLabel') + ' ' + Game.level;
  if (Game.timeLimit > 0) {
    const timerEl = document.getElementById('timer-label');
    timerEl.textContent = Utils.formatTime(Math.max(0, Game.timeRemaining));
    timerEl.classList.toggle('low', Game.timeRemaining <= 20);
  }
  const ltEl = document.getElementById('level-timer');
  if (ltEl) {
    const show = Game.levelTimeMax > 0;
    ltEl.classList.toggle('hidden', !show);
    if (show) {
      ltEl.textContent = '⏱ ' + Utils.formatTime(Math.max(0, Math.ceil(Game.levelTime)));
      ltEl.classList.toggle('low', Game.levelTime <= LEVEL_TIMER.lowSeconds);
    }
  }
  document.getElementById('combo-label').textContent = 'x' + p.combo;
  document.getElementById('combo-label').classList.toggle('hot', p.combo >= 5);
  document.getElementById('score-label').textContent = Utils.formatScore(p.score);
  updateWeaponBar();
  if (Game.boss) {
    document.getElementById('boss-hp-fill').style.width = Utils.clamp(Game.boss.hp / Game.boss.maxHp, 0, 1) * 100 + '%';
  }
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function clampCameraAxis(val, viewSize, worldSize) {
  if (worldSize <= viewSize) return -(viewSize - worldSize) / 2;
  return Utils.clamp(val, 0, worldSize - viewSize);
}

function render() {
  ctx.clearRect(0, 0, viewW, viewH);
  drawBackground();

  if (Game.state !== 'playing' && Game.state !== 'paused') return;

  const p = Game.player;
  Game.camera.x = clampCameraAxis(p.x - worldW / 2, worldW, Balance.arenaW);
  Game.camera.y = clampCameraAxis(p.y - worldH / 2, worldH, Balance.arenaH);

  ctx.save();
  let sx = 0, sy = 0;
  if (Game.shake.time > 0) {
    sx = (Math.random() - 0.5) * Game.shake.mag;
    sy = (Math.random() - 0.5) * Game.shake.mag;
  }
  ctx.scale(worldScale, worldScale);
  ctx.translate(-Game.camera.x + sx, -Game.camera.y + sy);

  drawArenaFloor();
  Game.walls.forEach(drawWall);
  drawGroundWarnings();
  Game.pickups.forEach(drawPickup);
  drawParticles();
  Game.slashes.forEach(drawSlash);
  Game.projectiles.forEach(drawProjectile);
  Game.flashes.forEach(drawFlash);
  Game.enemies.forEach(drawEnemy);
  if (Game.boss) drawBoss(Game.boss);
  drawDashTrail();
  drawPlayer(p);

  ctx.restore();
}

let bgScroll = 0;
// Small per-run cache so this doesn't re-parse/re-blend two hex colors every
// single frame - only recomputed when the level (and so possibly the boss
// chapter) actually changes.
let _bgTint = { level: null, color: Palette.grid };
function currentGridColor() {
  if (_bgTint.level === Game.level) return _bgTint.color;
  const chapterColor = Level.chapterColor(Game.level, (GAME_MODES[Game.mode] || {}).bossEvery);
  _bgTint = { level: Game.level, color: Utils.mixHex(Palette.grid, chapterColor, 0.3) };
  return _bgTint.color;
}
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, Palette.bg1);
  g.addColorStop(1, Palette.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  bgScroll = (bgScroll + 0.15) % 40;
  // Subtly tinted toward whichever boss's chapter the player is currently
  // in (see Level.chapterColor) - each ~5-level stretch gets its own faint
  // mood instead of the grid looking identical for the whole run.
  ctx.strokeStyle = (Game.state === 'playing' || Game.state === 'paused') ? currentGridColor() : Palette.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let x = -bgScroll; x < viewW; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, viewH); ctx.stroke();
  }
  for (let y = -bgScroll; y < viewH; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Boss AoE telegraphs: pulsing warning rings marking impact zones ~0.4s
// before they land (see Game.groundWarnings, filled in by BossPatterns).
function drawGroundWarnings() {
  Game.groundWarnings.forEach((w) => {
    const t = Utils.clamp(w.life / w.maxLife, 0, 1); // 1 -> 0 as impact nears
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.strokeStyle = w.color;
    ctx.shadowColor = w.color;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.3 + 0.5 * (1 - t);
    ctx.lineWidth = 2 + 3 * (1 - t);
    ctx.beginPath();
    ctx.arc(0, 0, w.radius * (0.6 + 0.4 * t), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function drawArenaFloor() {
  const a = Level.arena;
  ctx.save();
  ctx.strokeStyle = Palette.purple;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 4;
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.restore();
}

function glowShape(draw, color, blur) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

function drawWall(w) {
  if (w.dead) return;
  ctx.save();
  if (w.destructible) {
    const t = w.hp / 60;
    ctx.fillStyle = 'rgba(255,138,61,' + (0.12 + 0.18 * t) + ')';
    ctx.strokeStyle = Palette.orange;
    ctx.setLineDash([6, 4]);
  } else {
    ctx.fillStyle = 'rgba(138,63,252,0.14)';
    ctx.strokeStyle = Palette.purple;
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 2;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 10;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeRect(w.x, w.y, w.w, w.h);
  ctx.restore();
}

function drawPickup(pk) {
  const w = WEAPONS.find(x => x.id === pk.weaponId);
  const legendary = w.tier === 'legendary';
  const t = performance.now() / 200;
  glowShape(() => {
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 10 + Math.sin(t) * 2, 0, Math.PI * 2);
    ctx.fill();
    // legendary pickups get an extra rotating ring of sparks so they read as
    // unmistakably special at a glance, not just another weapon on the floor.
    if (legendary) {
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      const spikes = 6;
      for (let i = 0; i < spikes; i++) {
        const a = t * 0.6 + (i / spikes) * Math.PI * 2;
        const r1 = 16, r2 = 24;
        ctx.beginPath();
        ctx.moveTo(pk.x + Math.cos(a) * r1, pk.y + Math.sin(a) * r1);
        ctx.lineTo(pk.x + Math.cos(a) * r2, pk.y + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }, w.color, legendary ? 28 : 16);
}

function drawParticles() {
  Game.particles.list.forEach((pt) => {
    const alpha = Utils.clamp(pt.life / pt.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.shadowColor = pt.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawProjectile(pr) {
  glowShape(() => {
    // motion trail - what makes a bullet actually read as "moving fast" rather than a static dot
    ctx.strokeStyle = pr.color;
    ctx.lineWidth = pr.radius * (pr.beam ? 1.4 : 1.1);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(pr.prevX, pr.prevY);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = pr.color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
    ctx.fill();
    if (pr.beam) {
      ctx.strokeStyle = pr.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const back = 26;
      ctx.moveTo(pr.x - Math.cos(Math.atan2(pr.vy, pr.vx)) * back, pr.y - Math.sin(Math.atan2(pr.vy, pr.vx)) * back);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
    }
  }, pr.color, 14);
}

function drawSlash(s) {
  const t = s.life / s.maxLife; // 1 -> 0
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  ctx.globalAlpha = t;
  ctx.strokeStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 16;
  ctx.lineWidth = 5 * t + 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, s.range * (1 - 0.25 * t), -s.arc / 2, s.arc / 2);
  ctx.stroke();
  ctx.restore();
}

function drawFlash(f) {
  const t = f.life / f.maxLife; // 1 -> 0
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = t;
  ctx.fillStyle = f.color;
  ctx.shadowColor = f.color;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, f.size * (1.3 - t * 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------
// Humanoid renderer - small top-down neon figures built from shared
// primitives (legs/torso/head/arms), assembled differently per class
// so the hero, each enemy class and the bosses each have their own
// distinct silhouette instead of one shape recolored. Drawn in LOCAL
// space after translate+rotate: local +x is "forward" (the way the
// figure is facing/aiming), local y is left/right.
// ---------------------------------------------------------------
const RIM = 'rgba(4,3,10,0.55)';

function humanLegs(r, color, o = {}) {
  const { moving = false, walkPhase = 0, span = r * 0.55, width = r * 0.17, hipInset = r * 0.22, hipX = -r * 0.08 } = o;
  const stride = moving ? Math.sin(walkPhase) * r * 0.35 : 0;
  const strideOther = moving ? Math.sin(walkPhase + Math.PI) * r * 0.35 : 0;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.8, width); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, -hipInset); ctx.lineTo(hipX + stride, -span);
  ctx.moveTo(hipX, hipInset); ctx.lineTo(hipX + strideOther, span);
  ctx.stroke();
}

function humanTorsoEllipse(r, color, o = {}) {
  const { rx = r * 0.42, ry = r * 0.32, x = 0 } = o;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = 1.4; ctx.stroke();
}

function roundRectPath(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function humanTorsoBlock(r, color, o = {}) {
  const { w = r * 1.0, h = r * 0.78, x = -w * 0.15 } = o;
  roundRectPath(x, -h / 2, w, h, r * 0.14);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = 1.6; ctx.stroke();
}

function humanHead(r, color, o = {}) {
  const { shape = 'circle', x = r * 0.66, size = r * 0.36 } = o;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(x + size, 0); ctx.lineTo(x, -size * 0.82); ctx.lineTo(x - size * 0.75, 0); ctx.lineTo(x, size * 0.82); ctx.closePath();
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = x + Math.cos(a) * size, py = Math.sin(a) * size;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (shape === 'spike') {
    ctx.moveTo(x + size * 1.3, 0); ctx.lineTo(x - size * 0.55, -size * 0.8); ctx.lineTo(x - size * 0.55, size * 0.8); ctx.closePath();
  } else {
    ctx.arc(x, 0, size, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.strokeStyle = RIM; ctx.lineWidth = 1.4; ctx.stroke();
}

function humanOffArm(r, color, o = {}) {
  const { x0 = -r * 0.1, y0 = -r * 0.25, x1 = -r * 0.42, y1 = -r * 0.58, width = r * 0.13 } = o;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.6, width); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function humanWeaponArm(r, color, o = {}) {
  const { reach = 1.35, y = r * 0.28, tip = 'dot', width = r * 0.16, x0 = r * 0.12 } = o;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, width); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y * 0.9); ctx.lineTo(r * reach, y * 0.7); ctx.stroke();
  ctx.fillStyle = color;
  const tx = r * reach, ty = y * 0.7;
  if (tip === 'rect') {
    ctx.save(); ctx.translate(tx, ty);
    ctx.fillRect(-r * 0.06, -r * 0.09, r * 0.42, r * 0.18);
    ctx.restore();
  } else if (tip === 'diamond') {
    const s = r * 0.15;
    ctx.beginPath(); ctx.moveTo(tx + s, ty); ctx.lineTo(tx, ty - s); ctx.lineTo(tx - s, ty); ctx.lineTo(tx, ty + s); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(tx, ty, r * 0.11, 0, Math.PI * 2); ctx.fill();
  }
}

// Twin claw-slashes instead of a weapon arm - the rusher is unarmed and feral.
function humanClaws(r, color, o = {}) {
  const { reach = 1.15 } = o;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.8, r * 0.13); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.14, r * 0.24); ctx.lineTo(r * reach, r * 0.42);
  ctx.moveTo(r * 0.14, -r * 0.06); ctx.lineTo(r * reach * 0.88, -r * 0.26);
  ctx.stroke();
}

// A short flaring cape behind the hero - grows longer while dashing.
function humanCape(r, color, o = {}) {
  const { flare = 1 } = o;
  ctx.fillStyle = color; ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.24);
  ctx.lineTo(-r * (0.9 + 0.6 * flare), -r * 0.5 * flare);
  ctx.lineTo(-r * (0.65 + 0.5 * flare), 0);
  ctx.lineTo(-r * (0.9 + 0.6 * flare), r * 0.5 * flare);
  ctx.lineTo(-r * 0.12, r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---- per-class assembled models (draw order = back to front) ----

// The hero: unique silhouette - flaring cape, diamond visor-head, diamond
// weapon tip - nothing else in the game looks like this.
function drawPlayerModel(r, bodyColor, opts = {}) {
  const { armColor = bodyColor, moving = false, walkPhase = 0, dashFlare = 0 } = opts;
  humanCape(r, armColor, { flare: 1 + dashFlare * 1.7 });
  humanLegs(r, bodyColor, { moving, walkPhase, span: r * 0.55, width: r * 0.17 });
  humanOffArm(r, armColor, {});
  humanWeaponArm(r, armColor, { reach: 1.5, tip: 'diamond', width: r * 0.17 });
  humanTorsoEllipse(r, bodyColor, { rx: r * 0.4, ry: r * 0.3 });
  humanHead(r, bodyColor, { shape: 'diamond', x: r * 0.64, size: r * 0.34 });
}

// Rusher: lean, spike-headed, claws instead of a gun - reads as fast & feral.
function drawRusherModel(r, color, opts = {}) {
  const { moving = false, walkPhase = 0 } = opts;
  humanLegs(r, color, { moving, walkPhase, span: r * 0.62, width: r * 0.15 });
  humanClaws(r, color, { reach: 1.15 });
  humanTorsoEllipse(r, color, { rx: r * 0.32, ry: r * 0.24 });
  humanHead(r, color, { shape: 'spike', x: r * 0.56, size: r * 0.3 });
}

// Shooter: round head, a small rifle in hand, antenna-like off-arm.
function drawShooterModel(r, color, opts = {}) {
  const { moving = false, walkPhase = 0 } = opts;
  humanLegs(r, color, { moving, walkPhase, span: r * 0.5, width: r * 0.16 });
  humanOffArm(r, color, { x1: -r * 0.14, y1: -r * 0.66 });
  humanWeaponArm(r, color, { reach: 1.75, tip: 'rect', width: r * 0.15 });
  humanTorsoEllipse(r, color, { rx: r * 0.4, ry: r * 0.3 });
  humanHead(r, color, { shape: 'circle', x: r * 0.6, size: r * 0.32 });
}

// Heavy: blocky torso, hex helmet, twin thick brute arms, no ranged reach.
function drawHeavyModel(r, color, opts = {}) {
  const { moving = false, walkPhase = 0 } = opts;
  humanLegs(r, color, { moving, walkPhase, span: r * 0.5, width: r * 0.26 });
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2.2, r * 0.2); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.05, r * 0.35); ctx.lineTo(r * 0.58, r * 0.55);
  ctx.moveTo(r * 0.05, -r * 0.35); ctx.lineTo(r * 0.58, -r * 0.55);
  ctx.stroke();
  humanTorsoBlock(r, color, { w: r * 1.0, h: r * 0.78, x: -r * 0.15 });
  humanHead(r, color, { shape: 'hex', x: r * 0.58, size: r * 0.34 });
}

// Bosses reuse the heavy's bulk (bigger, blockier, crowned) - the spiky
// aura drawn behind them in drawBoss is what marks them apart visually.
function drawBossModel(r, color, opts = {}) {
  const { walkPhase = 0 } = opts;
  humanLegs(r, color, { moving: true, walkPhase, span: r * 0.48, width: r * 0.22 });
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2.4, r * 0.17); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.05, r * 0.32); ctx.lineTo(r * 0.6, r * 0.5);
  ctx.moveTo(r * 0.05, -r * 0.32); ctx.lineTo(r * 0.6, -r * 0.5);
  ctx.stroke();
  humanTorsoBlock(r, color, { w: r * 0.95, h: r * 0.74, x: -r * 0.12 });
  humanHead(r, color, { shape: 'diamond', x: r * 0.62, size: r * 0.38 });
}

const ENEMY_MODEL_BY_TYPE = { rusher: drawRusherModel, shooter: drawShooterModel, heavy: drawHeavyModel, sniper: drawShooterModel };

function drawEnemy(en) {
  ctx.save();
  const flashColor = en.hitFlash > 0 ? Palette.white : en.color;
  ctx.translate(en.x, en.y);
  ctx.rotate(en.angle);
  const model = ENEMY_MODEL_BY_TYPE[en.typeKey] || drawRusherModel;
  glowShape(() => {
    model(en.radius, flashColor, { moving: en.moving, walkPhase: en.walkPhase });
  }, en.color, en.burnTimer > 0 ? 20 : 14);
  ctx.restore();

  // sniper wind-up telegraph: a thin, growing-alpha aim line toward the player,
  // giving a real "get out of the way" tell before the shot actually fires.
  if (en.chargeTimer > 0 && en.def.telegraph) {
    const t = 1 - Utils.clamp(en.chargeTimer / en.def.telegraph, 0, 1);
    ctx.save();
    ctx.strokeStyle = en.color;
    ctx.globalAlpha = 0.25 + 0.55 * t;
    ctx.lineWidth = 1.5 + 1.5 * t;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(en.x, en.y);
    const reach = en.def.preferredRange ? en.def.preferredRange * 1.6 : 500;
    ctx.lineTo(en.x + Math.cos(en.angle) * reach, en.y + Math.sin(en.angle) * reach);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(en.x, en.y);
  if (en.burnTimer > 0) {
    glowShape(() => {
      ctx.fillStyle = Palette.ember;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(0, 0, en.radius * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }, Palette.ember, 16);
  }
  ctx.restore();

  if (en.stunTimer > 0) {
    ctx.save();
    ctx.fillStyle = Palette.yellow;
    ctx.font = `bold ${Math.round(en.radius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = Palette.yellow;
    ctx.shadowBlur = 10;
    ctx.fillText('*', en.x, en.y - en.radius * 1.6);
    ctx.restore();
  }

  if (en.hp < en.maxHp) {
    ctx.save();
    const w = en.radius * 2;
    ctx.translate(en.x - w / 2, en.y - en.radius - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = Palette.red;
    ctx.fillRect(0, 0, w * Utils.clamp(en.hp / en.maxHp, 0, 1), 4);
    ctx.restore();
  }
}

function drawBoss(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  // enraged (past def.enrageAt hp threshold): the spike aura spins faster and
  // burns red - a clear "this just got more dangerous" tell to match the
  // real speed/attack-rate increase in Boss.update.
  const t = performance.now() / (b.enraged ? 150 : 300);
  const auraColor = b.enraged ? Palette.red : b.color;
  glowShape(() => {
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = b.enraged ? 3 : 2;
    const spikes = 10;
    ctx.beginPath();
    for (let i = 0; i < spikes; i++) {
      const a = (Math.PI * 2 * i) / spikes + t * 0.3;
      const r = i % 2 === 0 ? b.radius * 1.35 : b.radius * 0.95;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }, auraColor, b.enraged ? 30 : 22);
  ctx.rotate(b.angle || 0);
  glowShape(() => {
    drawBossModel(b.radius, b.hitFlash > 0 ? Palette.white : b.color, { walkPhase: t * 4 });
  }, b.color, 26);
  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.rotate(p.angle);
  const moving = p.moveX !== 0 || p.moveY !== 0 || p.dashing;
  const chilled = p.chillTimer > 0;
  const skin = p.skin || SKINS[0];
  glowShape(() => {
    drawPlayerModel(p.radius, p.dashing ? Palette.cyan : (chilled ? Palette.steel : skin.color), {
      armColor: p.weapon.color, moving, walkPhase: p.walkPhase, dashFlare: p.dashing ? 1 : 0
    });
  }, chilled ? Palette.steel : (p.dashing ? Palette.cyan : skin.glow), p.dashing ? 24 : (chilled ? 22 : 18));
  ctx.restore();
}

// Fading afterimage silhouettes left behind while dashing (the dodge animation).
function drawDashTrail() {
  Game.dashTrail.forEach((tr) => {
    const a = Utils.clamp(tr.life / tr.maxLife, 0, 1) * 0.4;
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);
    ctx.globalAlpha = a;
    glowShape(() => {
      drawPlayerModel(Game.player.radius, Palette.cyan, { dashFlare: 1 });
    }, Palette.cyan, 12);
    ctx.restore();
  });
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
let lastTs = performance.now();
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (Game.state === 'playing') update(dt);
  render();
}

// Reconciles non-consumable IAP ownership and any consumable purchase that
// was paid for but never granted+consumed (e.g. the tab closed right after
// paying, before Meta.addCurrency/consumePurchase ran) - runs once on boot,
// only does anything when a real Yandex Payments session is available.
async function reconcilePurchases() {
  if (!Monetization.ready) return;
  let purchases = [];
  try { purchases = await Monetization.getPurchases(); } catch (e) { purchases = []; }
  for (const p of purchases) {
    const id = p.productID || p.id;
    const def = IAP_PRODUCTS.find(d => d.id === id);
    if (!def) continue;
    if (def.type === 'non_consumable') {
      Meta.recordPurchase(def.id);
    } else if (def.type === 'consumable' && p.purchaseToken) {
      Meta.addCurrency(def.currencyAmount || 0);
      await Monetization.consumePurchase(p.purchaseToken);
    }
  }
}

// Same reconciliation as reconcilePurchases() above, but for VK's
// order-confirmation backend: grants+consumes any order the backend has
// recorded as 'chargeable' but this browser never got to apply (tab closed
// between payment and Meta.addCurrency/recordPurchase). Bounded to 10
// orders so a backend bug can't turn this into an infinite boot-time loop.
async function reconcileVkPurchases() {
  if (!VK.ready) return;
  for (let i = 0; i < 10; i++) {
    const order = await VK._fetchPendingOrder(VK.launchParams && VK.launchParams.vk_user_id);
    if (!order) break;
    applyGrantedPurchase(order.itemId);
    await VK.consumeOrder(order.orderId);
  }
}

// Resolves with `fallback` if the promise takes longer than `ms` (or rejects)
// - a slow/hung platform SDK or the free-tier backend must never be able to
// freeze the UI. The underlying promise keeps running in the background.
function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

function buildAllUi() {
  Lang.applyStaticText();
  Game.selectedDifficulty = loadDifficultyId();
  buildWeaponBar();
  buildModeSelect();
  buildDifficultyRow();
}

async function boot() {
  // 1) UI first: the menu, mode list, difficulty row and touch controls are
  //    built and clickable immediately, without waiting for any SDK/network.
  //    (Previously boot() awaited Yandex/VK init AND a request to the backend
  //    first, so on phones the difficulty buttons did nothing for a while.)
  Lang.detect();
  TouchControls.init();
  buildAllUi();
  showScreen('screen-menu');
  requestAnimationFrame(loop);

  // 2) Platform SDKs in the background, each with a timeout.
  await withTimeout(Yandex.init(), 5000);
  await withTimeout(VK.init(), 6000);
  await withTimeout(Monetization.init(), 4000);

  // The SDK may know the real language (Yandex) - re-apply if it changed.
  const prevLang = Lang.current;
  Lang.detect();
  if (Lang.current !== prevLang) buildAllUi();
  Yandex.gameReady();

  // 3) Purchase reconciliation never blocks anything.
  withTimeout(reconcilePurchases(), 15000);
  withTimeout(reconcileVkPurchases(), 20000);
}
boot();
