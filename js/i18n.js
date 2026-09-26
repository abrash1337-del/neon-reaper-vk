// ============================================================
// NEON REAPER - i18n.js
// Minimal localization layer: RU (default, primary audience on
// Yandex Games / RuStore) + EN fallback for everyone else, picked
// automatically from the Yandex SDK's detected language or the
// browser's own language - no build step, no external library.
// ============================================================
'use strict';

const STRINGS = {
  ru: {
    title: 'NEON REAPER',
    subtitle: 'Неоновый ад ждёт. Один рывок между жизнью и смертью.',
    play: 'ИГРАТЬ',
    controls: 'УПРАВЛЕНИЕ',
    leaderboard: 'ТАБЛИЦА ЛИДЕРОВ',
    upgrades: 'УЛУЧШЕНИЯ',
    chooseMode: 'ВЫБЕРИТЕ РЕЖИМ',
    back: 'Назад',
    controlsTitle: 'УПРАВЛЕНИЕ',
    howtoNote: '15 видов оружия, разрушаемые стены, боссы и счётчик комбо — не теряйте серию убийств! Периодичность боссов и сложность зависят от выбранного режима.',
    leaderboardTitle: 'ТАБЛИЦА ЛИДЕРОВ',
    pauseTitle: 'ПАУЗА',
    resume: 'ПРОДОЛЖИТЬ',
    music: 'МУЗЫКА',
    sfx: 'ЗВУК',
    on: 'ВКЛ',
    off: 'ВЫКЛ',
    quitMenu: 'ВЫЙТИ В МЕНЮ',
    restart: 'ЗАНОВО',
    toMenu: 'В МЕНЮ',
    namePlaceholder: 'ВАШЕ ИМЯ',
    upgradesTitle: 'УЛУЧШЕНИЯ',
    currency: 'Осколки',
    perkTitle: 'УРОВЕНЬ ПРОЙДЕН — ВЫБЕРИТЕ УСИЛЕНИЕ',
    reviveAd: 'СМОТРЕТЬ РЕКЛАМУ И ВОСКРЕСНУТЬ',
    statScore: 'Счёт', statLevel: 'Уровень', statMode: 'Режим',
    earnedCurrency: 'Заработано осколков',
    deathTitle: 'ТЫ ПОГИБ', timeupTitle: 'ВРЕМЯ ВЫШЛО', overTitle: 'ИГРА ОКОНЧЕНА',
    lbEmpty: 'Пока нет результатов. Будь первым!',
    lbLoading: 'Загрузка…',
    maxLevel: 'МАКС.',
    buy: 'Купить',
    levelLabel: 'УРОВЕНЬ',
    bossLabel: 'БОСС',
    newWeapon: 'НОВОЕ ОРУЖИЕ',
    foundWeapon: 'НАЙДЕНО ОРУЖИЕ',
    foundLegendary: '★ ЛЕГЕНДАРНОЕ ОРУЖИЕ ★',
    checkpointRevive: 'ЧЕКПОИНТ: ВОЗРОЖДЕНИЕ',
    musicOn: 'МУЗЫКА: ВКЛ', musicOff: 'МУЗЫКА: ВЫКЛ',
    sfxOn: 'ЗВУК: ВКЛ', sfxOff: 'ЗВУК: ВЫКЛ',
    difficulty: 'СЛОЖНОСТЬ',
    statDifficulty: 'Сложность',
    shop: 'МАГАЗИН',
    shopTitle: 'МАГАЗИН',
    shopCurrencyHint: 'Осколки начисляются за каждый забег (по очкам и уровню) — их также можно докупить ниже.',
    shopIapLabel: 'ДОНАТ',
    shopSkinsLabel: 'СКИНЫ',
    iapBuy: 'Купить',
    iapUnavailable: 'Недоступно',
    owned: 'КУПЛЕНО',
    selected: 'ВЫБРАНО',
    select: 'Выбрать',
    processing: 'Оплата…',
    voteOne: 'голос', voteFew: 'голоса', voteMany: 'голосов'
  },
  en: {
    title: 'NEON REAPER',
    subtitle: 'Neon hell awaits. One dash between life and death.',
    play: 'PLAY',
    controls: 'CONTROLS',
    leaderboard: 'LEADERBOARD',
    upgrades: 'UPGRADES',
    chooseMode: 'CHOOSE MODE',
    back: 'Back',
    controlsTitle: 'CONTROLS',
    howtoNote: '15 weapons, destructible walls, bosses and a combo counter — don’t lose your kill streak! Boss frequency and difficulty depend on the mode you pick.',
    leaderboardTitle: 'LEADERBOARD',
    pauseTitle: 'PAUSED',
    resume: 'RESUME',
    music: 'MUSIC',
    sfx: 'SOUND',
    on: 'ON',
    off: 'OFF',
    quitMenu: 'QUIT TO MENU',
    restart: 'RESTART',
    toMenu: 'TO MENU',
    namePlaceholder: 'YOUR NAME',
    upgradesTitle: 'UPGRADES',
    currency: 'Shards',
    perkTitle: 'LEVEL CLEARED — CHOOSE A PERK',
    reviveAd: 'WATCH AD TO REVIVE',
    statScore: 'Score', statLevel: 'Level', statMode: 'Mode',
    earnedCurrency: 'Shards earned',
    deathTitle: 'YOU DIED', timeupTitle: 'TIME’S UP', overTitle: 'GAME OVER',
    lbEmpty: 'No scores yet. Be the first!',
    lbLoading: 'Loading…',
    maxLevel: 'MAX',
    buy: 'Buy',
    levelLabel: 'LEVEL',
    bossLabel: 'BOSS',
    newWeapon: 'NEW WEAPON',
    foundWeapon: 'WEAPON FOUND',
    foundLegendary: '★ LEGENDARY WEAPON ★',
    checkpointRevive: 'CHECKPOINT: REVIVED',
    musicOn: 'MUSIC: ON', musicOff: 'MUSIC: OFF',
    sfxOn: 'SOUND: ON', sfxOff: 'SOUND: OFF',
    difficulty: 'DIFFICULTY',
    statDifficulty: 'Difficulty',
    shop: 'SHOP',
    shopTitle: 'SHOP',
    shopCurrencyHint: 'Shards are earned every run (based on score and level reached) — you can also buy more below.',
    shopIapLabel: 'IN-APP PURCHASES',
    shopSkinsLabel: 'SKINS',
    iapBuy: 'Buy',
    iapUnavailable: 'Unavailable',
    owned: 'OWNED',
    selected: 'SELECTED',
    select: 'Select',
    processing: 'Processing…',
    voteOne: 'vote', voteFew: 'votes', voteMany: 'votes'
  }
};

const Lang = {
  current: 'ru',

  detect() {
    let code = null;
    try { code = Yandex.sdk?.environment?.i18n?.lang || null; } catch (e) {}
    if (!code) { try { code = (navigator.language || navigator.userLanguage || '').slice(0, 2); } catch (e) {} }
    // Primary audience is Russian-speaking (Yandex Games / RuStore); default
    // to ru unless we can positively detect a different language.
    this.current = (code && code.toLowerCase() === 'ru') ? 'ru' : (code ? 'en' : 'ru');
    return this.current;
  },

  t(key) { return (STRINGS[this.current] && STRINGS[this.current][key]) || STRINGS.ru[key] || key; },

  // "19 голосов" / "19 votes" - price display for VK's real-money IAP
  // (see IAP_PRODUCTS.priceVotes in config.js and main.js renderShop).
  votes(n) {
    const word = this.current === 'ru' ? Utils.pluralRu(n, this.t('voteOne'), this.t('voteFew'), this.t('voteMany')) : this.t('voteMany');
    return `${n} ${word}`;
  },

  name(obj) { return (this.current === 'en' && obj.nameEn) ? obj.nameEn : obj.name; },
  desc(obj) { return (this.current === 'en' && obj.descEn) ? obj.descEn : obj.desc; },
  short(obj) { return (this.current === 'en' && obj.shortEn) ? obj.shortEn : obj.short; },

  applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const val = this.t(key);
      if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      const val = this.t(key);
      if (val) el.placeholder = val;
    });
  }
};
