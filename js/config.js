// ============================================================
// NEON REAPER - config.js
// All tunable data: palette, weapons, enemies, bosses, balance.
// ============================================================
'use strict';

const Palette = {
  bg0: '#05040c',
  bg1: '#0b0818',
  grid: '#1c1440',
  cyan: '#39f6ff',
  magenta: '#ff2fd0',
  purple: '#8a3ffc',
  yellow: '#f9f871',
  red: '#ff3b5c',
  orange: '#ff8a3d',
  green: '#3dffb0',
  white: '#f4f4ff',
  ember: '#ff5a1f',
  steel: '#8fd6ff',
  gold: '#ffd23f'
};

// Melee weapons deal damage in an arc in front of the player.
// Ranged weapons spawn projectiles.
//
// Weapon progression tiers:
//   starter - owned from the very first second of a run
//   unlock  - permanently added to the loadout the moment the run reaches `unlockLevel`
//   rare    - never unlocked by leveling; only obtainable by finding a pickup scattered
//             on the map (see Level.rareWeaponForLevel), earliest at `minLevel`
const WEAPONS = [
  {
    id: 'fists', name: 'Кулаки', nameEn: 'Fists', type: 'melee', dmg: 12, range: 46, arc: 1.3,
    cooldown: 0.28, color: Palette.white, throwable: false, knockback: 90,
    tier: 'starter'
  },
  {
    id: 'knife', name: 'Нож', nameEn: 'Knife', type: 'melee', dmg: 16, range: 42, arc: 1.0,
    cooldown: 0.22, color: Palette.cyan, throwable: true, projSpeed: 720,
    projDmg: 22, knockback: 70,
    tier: 'unlock', unlockLevel: 2
  },
  {
    id: 'katana', name: 'Катана', nameEn: 'Katana', type: 'melee', dmg: 30, range: 60, arc: 1.6,
    cooldown: 0.38, color: Palette.magenta, throwable: true, projSpeed: 640,
    projDmg: 38, knockback: 140, pierce: true,
    tier: 'unlock', unlockLevel: 3
  },
  {
    id: 'pistol', name: 'Пистолет', nameEn: 'Pistol', type: 'ranged', dmg: 14, cooldown: 0.24,
    projSpeed: 900, spread: 0.03, pellets: 1, color: Palette.white, knockback: 60,
    tier: 'starter'
  },
  {
    id: 'smg', name: 'ПП', nameEn: 'SMG', type: 'ranged', dmg: 8, cooldown: 0.08,
    projSpeed: 1000, spread: 0.10, pellets: 1, color: Palette.cyan, knockback: 20,
    tier: 'unlock', unlockLevel: 4
  },
  {
    id: 'shotgun', name: 'Дробовик', nameEn: 'Shotgun', type: 'ranged', dmg: 11, cooldown: 0.62,
    projSpeed: 820, spread: 0.45, pellets: 7, color: Palette.orange, knockback: 260,
    breaksWalls: true,
    tier: 'unlock', unlockLevel: 5
  },
  {
    id: 'magnum', name: 'Магнум', nameEn: 'Magnum', type: 'ranged', dmg: 46, cooldown: 0.55,
    projSpeed: 1100, spread: 0.015, pellets: 1, color: Palette.yellow, knockback: 160,
    pierce: true,
    tier: 'rare', minLevel: 3
  },
  {
    id: 'minigun', name: 'Миниган', nameEn: 'Minigun', type: 'ranged', dmg: 7, cooldown: 0.055,
    projSpeed: 950, spread: 0.16, pellets: 1, color: Palette.red, knockback: 10,
    spinUp: true, breaksWalls: true,
    tier: 'rare', minLevel: 5
  },
  {
    id: 'railgun', name: 'Рельсотрон', nameEn: 'Railgun', type: 'ranged', dmg: 70, cooldown: 0.9,
    projSpeed: 2000, spread: 0, pellets: 1, color: Palette.purple, knockback: 200,
    pierce: true, beam: true, breaksWalls: true,
    tier: 'rare', minLevel: 7
  },
  {
    id: 'rocket', name: 'Ракетница', nameEn: 'Rocket Launcher', type: 'ranged', dmg: 55, cooldown: 1.05,
    projSpeed: 620, spread: 0.02, pellets: 1, color: Palette.green, knockback: 320,
    explosive: true, explosionRadius: 110, breaksWalls: true,
    tier: 'rare', minLevel: 9
  },

  // ---- additional rare melee: distinct feel from fists/knife/katana ----
  {
    id: 'spear', name: 'Копьё', nameEn: 'Spear', type: 'melee', dmg: 24, range: 88, arc: 0.55,
    cooldown: 0.34, color: Palette.steel, throwable: true, projSpeed: 760,
    projDmg: 32, knockback: 130, pierce: true,
    tier: 'rare', minLevel: 4
  },
  {
    id: 'daggers', name: 'Кинжалы', nameEn: 'Daggers', type: 'melee', dmg: 9, range: 38, arc: 1.1,
    cooldown: 0.12, color: Palette.magenta, throwable: false, knockback: 35,
    tier: 'rare', minLevel: 3
  },
  {
    id: 'hammer', name: 'Кувалда', nameEn: 'Hammer', type: 'melee', dmg: 42, range: 58, arc: 1.8,
    cooldown: 0.85, color: Palette.orange, throwable: false, knockback: 340,
    stun: 1.1,
    tier: 'rare', minLevel: 6
  },

  // ---- additional rare ranged: distinct mechanics from pistol/smg/shotgun ----
  {
    id: 'crossbow', name: 'Арбалет', nameEn: 'Crossbow', type: 'ranged', dmg: 52, cooldown: 0.75,
    projSpeed: 1050, spread: 0.01, pellets: 1, color: Palette.steel, knockback: 90,
    pierce: true,
    tier: 'rare', minLevel: 4
  },
  {
    id: 'flamethrower', name: 'Огнемёт', nameEn: 'Flamethrower', type: 'ranged', dmg: 4, cooldown: 0.05,
    projSpeed: 480, spread: 0.28, pellets: 1, color: Palette.ember, knockback: 15,
    life: 0.45, burn: { dps: 16, duration: 2.4 },
    tier: 'rare', minLevel: 6
  },

  // ---- legendary: never unlocked by leveling, never guaranteed by the normal
  // rare-weapon roll either - drawn from the same pool but at a much lower
  // weight (see Level.placeRareWeaponPickup), so finding one is a real event.
  // Each has a mechanic no other weapon in the game has.
  {
    id: 'reaper_scythe', name: 'Коса Жнеца', nameEn: "Reaper's Scythe", type: 'melee', dmg: 38, range: 74, arc: 1.5,
    cooldown: 0.5, color: Palette.gold, throwable: false, knockback: 200,
    lifesteal: 0.35, // heals the player for 35% of the damage actually dealt on every hit
    tier: 'legendary', minLevel: 8
  },
  {
    id: 'seeker_cannon', name: 'Наводчик', nameEn: 'Seeker Cannon', type: 'ranged', dmg: 32, cooldown: 0.42,
    projSpeed: 680, spread: 0, pellets: 1, color: Palette.gold, knockback: 100,
    homing: true, turnRate: 3.2, // shots bend toward the nearest enemy/boss in flight
    tier: 'legendary', minLevel: 8
  }
];

const ENEMY_TYPES = {
  rusher: {
    name: 'Бегун', nameEn: 'Runner', hp: 26, speed: 168, radius: 14, color: Palette.red,
    contactDmg: 10, score: 60, behavior: 'melee'
  },
  shooter: {
    name: 'Стрелок', nameEn: 'Shooter', hp: 34, speed: 100, radius: 15, color: Palette.orange,
    contactDmg: 6, score: 90, behavior: 'ranged', fireRate: 1.4,
    projSpeed: 480, projDmg: 9, preferredRange: 260
  },
  heavy: {
    name: 'Тяжёлый', nameEn: 'Heavy', hp: 90, speed: 66, radius: 22, color: Palette.purple,
    contactDmg: 18, score: 150, behavior: 'melee', knockbackResist: 0.7
  },
  sniper: {
    name: 'Снайпер', nameEn: 'Sniper', hp: 22, speed: 78, radius: 14, color: Palette.steel,
    contactDmg: 5, score: 120, behavior: 'ranged', fireRate: 2.2,
    projSpeed: 900, projDmg: 20, preferredRange: 420, telegraph: 0.5
  }
};

// Boss patterns keyed by id. `attack` = one fixed pattern repeated every
// cooldown; `attacks` = an array cycled through in order instead (see
// Boss.update in entities.js). `enrageAt` (fraction of maxHp) permanently
// speeds up movement and attack cadence once crossed - every boss gets a
// real second phase instead of one flat difficulty for the whole fight.
const BOSS_TYPES = {
  bulletstorm: {
    name: 'ШКВАЛ', nameEn: 'SQUALL', hp: 780, radius: 44, speed: 74, color: Palette.red,
    score: 2500, attacks: ['bulletSpray', 'spiralBarrage', 'crossVolley'], enrageAt: 0.5
  },
  phantom: {
    name: 'ФАНТОМ', nameEn: 'PHANTOM', hp: 660, radius: 40, speed: 96, color: Palette.purple,
    score: 2600, attack: 'teleportSlam', attacks: ['teleportSlam', 'phantomBolts', 'doubleBlink'], enrageAt: 0.5
  },
  seeker: {
    name: 'ИСКАТЕЛЬ', nameEn: 'SEEKER', hp: 710, radius: 42, speed: 76, color: Palette.cyan,
    score: 2850, attacks: ['homingMissiles', 'missileBarrage', 'swarmMines'], enrageAt: 0.5
  },
  meteor: {
    name: 'МЕТЕОР', nameEn: 'METEOR', hp: 880, radius: 48, speed: 58, color: Palette.orange,
    score: 3100, attacks: ['meteorShower', 'meteorLine', 'meteorRain'], enrageAt: 0.5
  },
  cryo: {
    name: 'МОРОЗ', nameEn: 'FROST', hp: 810, radius: 42, speed: 86, color: Palette.green,
    score: 3300, attacks: ['freezeNova', 'iceLance', 'frostBurst'], enrageAt: 0.5
  }
};
const BOSS_ORDER = ['bulletstorm', 'phantom', 'seeker', 'meteor', 'cryo'];

// Game modes. Each is a full ruleset variant sharing the same core loop
// (waves -> boss -> next level), expressed as small multipliers/overrides
// applied at a handful of injection points (Level.spawnWave/isBossLevel,
// Enemy/Boss speed, Player.attackTimer, the death/checkpoint branch, and
// an optional countdown clock) rather than as separate code paths.
const GAME_MODES = {
  hardcore: {
    id: 'hardcore', name: 'ХАРДКОР', short: 'Хардкор',
    nameEn: 'HARDCORE', shortEn: 'Hardcore',
    desc: 'Одна попытка. Ни одного чекпоинта. Как в оригинале.',
    descEn: 'One attempt. No checkpoints. The original way.',
    checkpointEvery: 0, timeLimit: 0, bossEvery: 5, maxAlive: 22,
    enemyCountMult: 1, enemySpeedMult: 1, cooldownMult: 1, scoreMult: 1
  },
  practice: {
    id: 'practice', name: 'ПРАКТИКА', short: 'Практика',
    nameEn: 'PRACTICE', shortEn: 'Practice',
    desc: 'Чекпоинт каждые 5 уровней — оттачивайте навыки.',
    descEn: 'A checkpoint every 5 levels — hone your skills.',
    checkpointEvery: 5, timeLimit: 0, bossEvery: 5, maxAlive: 22,
    enemyCountMult: 1, enemySpeedMult: 1, cooldownMult: 1, scoreMult: 1
  },
  timeattack: {
    id: 'timeattack', name: 'ЗАБЕГ', short: 'Забег',
    nameEn: 'TIME ATTACK', shortEn: 'Time Attack',
    desc: '3 минуты на максимум очков — таймер не остановится.',
    descEn: '3 minutes for the highest score — the clock won’t stop.',
    checkpointEvery: 0, timeLimit: 180, bossEvery: 5, maxAlive: 22,
    enemyCountMult: 1, enemySpeedMult: 1, cooldownMult: 1, scoreMult: 1.15
  },
  survival: {
    id: 'survival', name: 'ВЫЖИВАНИЕ', short: 'Выживание',
    nameEn: 'SURVIVAL', shortEn: 'Survival',
    desc: 'Волны растут без остановки, боссы — каждые 3 уровня.',
    descEn: 'Waves keep growing, bosses every 3 levels.',
    checkpointEvery: 0, timeLimit: 0, bossEvery: 3, maxAlive: 26,
    enemyCountMult: 1.25, enemySpeedMult: 1, cooldownMult: 1, scoreMult: 1
  },
  frenzy: {
    id: 'frenzy', name: 'БЕЗУМИЕ', short: 'Безумие',
    nameEn: 'FRENZY', shortEn: 'Frenzy',
    desc: 'Врагов вдвое больше и они быстрее — зато оружие бьёт чаще.',
    descEn: 'Twice the enemies and faster — but your weapon fires quicker too.',
    checkpointEvery: 0, timeLimit: 0, bossEvery: 5, maxAlive: 32,
    enemyCountMult: 1.8, enemySpeedMult: 1.3, cooldownMult: 0.55, scoreMult: 1.3
  }
};
const GAME_MODE_ORDER = ['hardcore', 'practice', 'timeattack', 'survival', 'frenzy'];

// Difficulty: an orthogonal multiplier layered on top of whichever mode is
// picked (mode = ruleset, difficulty = how hard that ruleset hits back).
// Chosen once on the mode-select screen, remembered between runs. Applied
// to every enemy/boss at spawn time (see Level.spawnWave/spawnBoss) and to
// score (folded into Player.scoreMult alongside the mode's own bonus).
const DIFFICULTIES = [
  { id: 'easy', name: 'ЛЕГКО', nameEn: 'EASY',
    desc: 'Враги слабее, медленнее и реже бьют — знакомство с игрой.',
    descEn: 'Weaker, slower, less punishing enemies — good for learning the game.',
    hpMult: 0.7, dmgMult: 0.65, speedMult: 0.9, scoreMult: 0.75 },
  { id: 'normal', name: 'НОРМАЛЬНО', nameEn: 'NORMAL',
    desc: 'Сбалансированный опыт по умолчанию.',
    descEn: 'The default, balanced experience.',
    hpMult: 1, dmgMult: 1, speedMult: 1, scoreMult: 1 },
  { id: 'hard', name: 'СЛОЖНО', nameEn: 'HARD',
    desc: 'Враги крепче, бьют больнее и двигаются быстрее.',
    descEn: 'Tougher, harder-hitting, faster enemies.',
    hpMult: 1.4, dmgMult: 1.35, speedMult: 1.12, scoreMult: 1.3 },
  { id: 'nightmare', name: 'КОШМАР', nameEn: 'NIGHTMARE',
    desc: 'Максимальная сложность. Ошибки не прощаются.',
    descEn: 'Maximum difficulty. Mistakes are punished.',
    hpMult: 1.9, dmgMult: 1.7, speedMult: 1.22, scoreMult: 1.65 }
];
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

// In-run perks: offered as a choice of 3 every time a level is cleared.
// Purely temporary (reset each run) - this is what gives each run its own
// "build" on top of the fixed weapon-unlock schedule.
// Run-only perks. Each (except heal, which is a one-shot spend) stacks
// ADDITIVELY up to maxStacks - not multiplicatively/compounding like the
// original version, which let a lucky run snowball damage/speed without
// limit while cooldown/dash quietly hit a hard floor and became dead,
// wasted picks after ~6-7 offers. Caps below are tuned so a full-stack
// perk is a meaningful, noticeable power spike but never a run-breaker,
// and every perk stays worth taking for roughly the same number of picks.
const PERKS = [
  { id: 'hp_max', name: '+15 макс. HP', nameEn: '+15 Max HP', maxStacks: 8,
    desc: 'Увеличивает запас здоровья и лечит на столько же. (до 8 раз за забег)',
    descEn: 'Raises your max HP and heals you by the same amount. (up to 8 times per run)' },
  { id: 'heal', name: 'Аптечка', nameEn: 'Med Kit',
    desc: 'Немедленно восстанавливает 30% максимального HP.',
    descEn: 'Instantly restores 30% of your max HP.' },
  { id: 'damage', name: '+8% урона', nameEn: '+8% Damage', maxStacks: 6,
    desc: 'Весь урон оружия увеличивается (складывается, а не множится). (до 6 раз, макс. +48%)',
    descEn: 'All weapon damage is increased (adds up, does not compound). (up to 6 times, max +48%)' },
  { id: 'speed', name: '+5% скорости', nameEn: '+5% Speed', maxStacks: 4,
    desc: 'Двигайтесь быстрее по арене. (до 4 раз, макс. +20%)',
    descEn: 'Move faster around the arena. (up to 4 times, max +20%)' },
  { id: 'cooldown', name: '-10% перезарядки', nameEn: '-10% Cooldown', maxStacks: 6,
    desc: 'Оружие атакует чаще. (до 6 раз, макс. -60%)',
    descEn: 'Your weapon attacks more often. (up to 6 times, max -60%)' },
  { id: 'dash', name: '-12% отката рывка', nameEn: '-12% Dash Cooldown', maxStacks: 5,
    desc: 'Рывок с неуязвимостью доступен чаще. (до 5 раз, макс. -60%)',
    descEn: 'The invincible dash is available more often. (up to 5 times, max -60%)' }
];

// Permanent meta-progression: bought with currency earned from runs (see
// meta.js), persists across runs in localStorage, and applies to every
// future run via Player's metaXxxMult fields.
const META_UPGRADES = [
  { id: 'hp', name: 'Живучесть', nameEn: 'Vitality', maxLevel: 5,
    desc: '+10 макс. HP за уровень.', descEn: '+10 max HP per level.',
    baseCost: 20, costGrowth: 1.5 },
  { id: 'damage', name: 'Мощь', nameEn: 'Power', maxLevel: 5,
    desc: '+8% урона оружия за уровень.', descEn: '+8% weapon damage per level.',
    baseCost: 25, costGrowth: 1.6 },
  { id: 'speed', name: 'Скорость', nameEn: 'Speed', maxLevel: 3,
    desc: '+5% скорости передвижения за уровень.', descEn: '+5% movement speed per level.',
    baseCost: 22, costGrowth: 1.7 },
  { id: 'dash', name: 'Рефлексы', nameEn: 'Reflexes', maxLevel: 3,
    desc: '-10% отката рывка за уровень.', descEn: '-10% dash cooldown per level.',
    baseCost: 28, costGrowth: 1.7 }
];

// ---- VK order-confirmation backend base URL (see js/vk.js's purchase()/
// _awaitConfirmedOrder()/consumeOrder() and server/ for what runs there).
// PLACEHOLDER - point this at your deployed server/ before shipping the VK
// build; until then VK purchases stay disabled the same honest way Yandex
// ones do outside Yandex Games (see IAP_PRODUCTS below). No trailing slash.
const VK_BACKEND_URL = 'https://neon-reaper-vk-backend.onrender.com';

// ---- Monetization: wired into #screen-shop (main.js: openShop/renderShop/
// purchaseIAP) via js/monetization.js's Yandex Payments adapter (Yandex) or
// js/vk.js's order-confirmation flow against VK_BACKEND_URL above (VK).
// Real ids, prices and titles must still be configured to match each
// platform's own console/catalog before this can process real payments -
// these ids are the stand-ins the shop UI reads locally until then; when
// neither SDK is present (local testing) the shop shows every IAP row
// disabled rather than faking a purchase.
// `type: 'consumable'` products (currency bundles) are re-purchasable
// (consumed right after granting); `type: 'non_consumable'` ones are bought
// once and tracked locally via Meta.hasPurchase/recordPurchase (mirrors
// what Monetization.getPurchases() would report from a live backend).
//
// `priceVotes` is the VK price in ГОЛОСА (VK Votes) - MUST stay in sync
// with server/catalog.js's CATALOG (that file is what VK's "get_item"
// notification actually reads to charge the player; this number is only
// for displaying the price in the shop UI itself before purchase - VK
// moderation requires the price/currency to be shown explicitly on the
// item, not only inside VK's own native order box). On Yandex the real
// price/currency is server-configured in the Yandex console and fetched
// live via Monetization.getCatalog() (see main.js renderShop) - priceVotes
// is not used there.
const IAP_PRODUCTS = [
  { id: 'remove_ads', name: 'Без рекламы', nameEn: 'Remove Ads', type: 'non_consumable', priceVotes: 19,
    desc: 'Отключает межстраничную рекламу между забегами навсегда.',
    descEn: 'Permanently disables the interstitial ad between runs.' },
  { id: 'shards_small', name: '200 осколков', nameEn: '200 Shards', type: 'consumable', currencyAmount: 200, priceVotes: 9,
    desc: 'Небольшой набор осколков для улучшений.',
    descEn: 'A small bundle of shards for upgrades.' },
  { id: 'shards_medium', name: '600 осколков', nameEn: '600 Shards', type: 'consumable', currencyAmount: 600, priceVotes: 25,
    desc: 'Средний набор осколков для улучшений.',
    descEn: 'A medium bundle of shards for upgrades.' },
  { id: 'shards_large', name: '1500 осколков', nameEn: '1500 Shards', type: 'consumable', currencyAmount: 1500, priceVotes: 59,
    desc: 'Большой набор осколков для улучшений.',
    descEn: 'A large bundle of shards for upgrades.' },
  { id: 'starter_pack', name: 'Стартовый набор', nameEn: 'Starter Pack', type: 'non_consumable', priceVotes: 39,
    desc: 'Открывает легендарную Косу Жнеца и даёт 300 осколков сразу.',
    descEn: "Unlocks the legendary Reaper's Scythe and grants 300 shards immediately." }
];

// ---- Cosmetic skins: purely visual (player body/glow recolor), never a
// stat. Bought with the same Осколки/shards currency used for META_UPGRADES
// - free-to-grind players and real-money IAP shard buyers both spend the
// same wallet, so this stays fair (no pay-to-win) while giving spenders
// something extra to buy once the permanent stat upgrades are maxed out.
// Sold in #screen-shop (main.js: renderShop/buySkinAction/selectSkinAction),
// tracked via Meta.getOwnedSkins/ownsSkin/buySkin/getSelectedSkin.
const SKINS = [
  { id: 'default', name: 'Стандартный', nameEn: 'Default', cost: 0, color: Palette.white, glow: Palette.cyan },
  { id: 'crimson', name: 'Багровый', nameEn: 'Crimson', cost: 250, color: Palette.red, glow: Palette.red },
  { id: 'toxic', name: 'Токсик', nameEn: 'Toxic', cost: 250, color: Palette.green, glow: Palette.green },
  { id: 'void', name: 'Пустота', nameEn: 'Void', cost: 400, color: Palette.purple, glow: Palette.magenta },
  { id: 'gold', name: 'Золотой', nameEn: 'Gold', cost: 600, color: Palette.gold, glow: Palette.gold }
];

const Balance = {
  playerSpeed: 240,
  playerRadius: 16,
  dashSpeed: 760,
  dashDuration: 0.16,
  dashCooldown: 0.9,
  dashIFrames: 0.22,
  comboWindow: 3.2,          // seconds of no-hit-taken keeps building; hit resets to 0
  comboScorePerKill: 1,      // multiplier step per combo tier
  baseWaveEnemies: 4,
  waveEnemyGrowth: 1.35,
  bossEveryNLevels: 5,
  checkpointEveryNLevels: 5, // Practice mode
  maxAliveEnemies: 22,       // hard cap on simultaneous enemies - extra get queued, not skipped
  // Bumped from the original 1400x900 - notably more room to move and kite
  // in, while keeping the same ~1.55 aspect ratio so existing camera/UI
  // framing doesn't need to change. See level.js for how every spawn point
  // and layout builder derives its coordinates from Level.arena (= these
  // two numbers), so this alone is what scales the whole map up.
  arenaW: 2000,
  arenaH: 1300
};
