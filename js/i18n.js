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
    authorCredit: 'Автор: Абрашнев Никита Сергеевич',
    startFirst: 'НАЧАТЬ',
    tutMoveTouch: 'Левый стик — двигайтесь', tutMoveKb: 'WASD — двигайтесь',
    tutAttackTouch: 'Правый стик — цельтесь и стреляйте', tutAttackKb: 'Мышь — цель, зажмите ЛКМ — атака',
    tutKill: 'Уничтожьте красного врага',
    tutDashTouch: 'Нажмите ⚡ — рывок (неуязвимость)', tutDashKb: 'ПРОБЕЛ — рывок (неуязвимость)',
    tutClear: 'Добейте остальных врагов',
    tutPerkNote: 'Усиление действует до конца этого забега',
    tutSkip: 'Пропустить', tutDone: 'Отлично! Обучение пройдено',
    protectBanner: 'ЗАЩИТА НОВИЧКА: ВОЗРОЖДЕНИЕ',
    assistBanner: 'ПОМОЩЬ НОВИЧКУ: ВОЛНА ЗАЧИЩЕНА',
    firstEnough: 'Хватит на первое постоянное улучшение',
    goUpgrades: 'УЛУЧШИТЬСЯ', anotherRun: 'ЕЩЁ ОДИН ЗАБЕГ', recommended: 'Рекомендуем',
    goalBoss: 'До босса — {n} {lv}', goalWeapon: 'Следующее оружие — на уровне {n}',
    lvOne: 'уровень', lvFew: 'уровня', lvMany: 'уровней',
    firstBonus: 'Бонус за первый забег: +{n}',
    inviteFriends: 'ПОЗВАТЬ ДРУЗЕЙ', addFavorite: 'В ИЗБРАННОЕ', favoriteDone: 'В ИЗБРАННОМ ✓', shareRecord: 'ПОДЕЛИТЬСЯ РЕКОРДОМ',
    shareText: 'Я набрал {score} очков и дошёл до уровня {level} в NEON REAPER! Сможешь лучше?',
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
    levelTimeBanner: 'ВРЕМЯ НА УРОВЕНЬ',
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
    authorCredit: 'Author: Nikita S. Abrashnev',
    startFirst: 'START',
    tutMoveTouch: 'Left stick — move', tutMoveKb: 'WASD — move',
    tutAttackTouch: 'Right stick — aim and shoot', tutAttackKb: 'Mouse — aim, hold LMB — attack',
    tutKill: 'Destroy the red enemy',
    tutDashTouch: 'Tap ⚡ — dash (invulnerable)', tutDashKb: 'SPACE — dash (invulnerable)',
    tutClear: 'Finish off the rest',
    tutPerkNote: 'This boost lasts until the end of this run',
    tutSkip: 'Skip', tutDone: 'Nice! Tutorial complete',
    protectBanner: 'ROOKIE PROTECTION: REVIVED',
    assistBanner: 'ROOKIE ASSIST: WAVE CLEARED',
    firstEnough: 'Enough for your first permanent upgrade',
    goUpgrades: 'UPGRADE', anotherRun: 'ONE MORE RUN', recommended: 'Recommended',
    goalBoss: 'Boss in {n} {lv}', goalWeapon: 'Next weapon unlocks at level {n}',
    lvOne: 'level', lvFew: 'levels', lvMany: 'levels',
    firstBonus: 'First-run bonus: +{n}',
    inviteFriends: 'INVITE FRIENDS', addFavorite: 'ADD TO FAVORITES', favoriteDone: 'IN FAVORITES ✓', shareRecord: 'SHARE MY RECORD',
    shareText: 'I scored {score} and reached level {level} in NEON REAPER! Can you beat it?',
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
    levelTimeBanner: 'TIME LIMIT',
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
