// ============================================================
// NEON REAPER - firstrun.js
// First-session ("guided first run") configuration and the PURE logic
// around it: tutorial step flow, guaranteed first reward, ad-eligibility
// rules, upgrade recommendation and "next goal" lookups. Nothing in here
// touches the DOM or the game loop - main.js wires it up - which is also
// what lets tests/logic.test.js exercise it in plain Node.
// ============================================================
'use strict';

// Tunables for the guided first run. Change numbers here, not in main.js.
const FIRST_RUN = {
  mode: 'practice',          // existing GAME_MODES id used for the guided run
  nextMode: 'hardcore',      // mode of the fast "one more run" after the guided run (practice never ends: its level-1 checkpoint revives forever)
  difficulty: 'easy',        // existing DIFFICULTIES id
  graceSeconds: 20,          // no lethal damage during the first N seconds ...
  graceHpFloorPct: 0.35,     // ... hp cannot drop below this fraction of max hp
  guidedLevels: 2,           // the softer enemy multipliers apply up to this level
  enemyHpMult: 0.6,
  enemyDmgMult: 0.6,
  enemySpeedMult: 0.85,
  targetHpMult: 0.35,        // the single "training" enemy of step 3
  targetSpeedMult: 0.45,
  targetDistance: 230,       // how far ahead of the player it appears (world px)
  waveExtraEnemies: 8,       // rusher-only enemies released after the kill step
  waveSpawnGap: 2.5,         // seconds between the gentle trickle-in of the guided levels
  clearSpawnRadius: 300,     // interior walls are removed this close to the spawn
  moveDistance: 70,          // px of real movement that completes the "move" step
  assistAfterSeconds: 150,   // safety net: wave is wrapped up if still alive after this
  guaranteedReward: 25,      // minimum shards for the first completed run
  recommendedUpgrade: 'hp',  // id from META_UPGRADES highlighted after the first run
  freeRevive: true,          // one ad-free revive in the guided run
  revivePct: 0.6,
  reviveInvuln: 2
};

// Ad pacing for new players (see FirstRun.interstitialAllowed).
const AD_RULES = {
  minCompletedRuns: 3,       // no forced interstitial until more than this many runs finished
  minActiveSeconds: 600,     // ... and not before this much active play time
  everyNRuns: 3              // existing cadence: one interstitial per N finished runs
};

const TUTORIAL_STEPS = ['move', 'attack', 'kill', 'dash', 'clear', 'perk'];

// Small state machine. Events may arrive "early" (e.g. the player attacks
// while still on the move step) - they're remembered and the step is
// completed the moment it becomes current, so nobody gets stuck on a prompt
// for something they already did.
const TutorialFlow = {
  create() {
    return { index: 0, seen: {}, done: false, skipped: false, completed: [] };
  },
  current(t) { return t.done ? null : TUTORIAL_STEPS[t.index]; },
  // Returns the list of steps completed by this event (usually 0 or 1).
  event(t, name) {
    if (t.done || !TUTORIAL_STEPS.includes(name)) return [];
    t.seen[name] = true;
    const finished = [];
    while (!t.done && t.seen[TUTORIAL_STEPS[t.index]]) {
      finished.push(TUTORIAL_STEPS[t.index]);
      t.completed.push(TUTORIAL_STEPS[t.index]);
      t.index++;
      if (t.index >= TUTORIAL_STEPS.length) t.done = true;
    }
    return finished;
  },
  skip(t) { if (t.done) return false; t.done = true; t.skipped = true; return true; }
};

const FirstRun = {
  // Total shards credited for a finished run. The very first finished run is
  // topped up to the guaranteed minimum; later runs are untouched.
  computeReward(earned, alreadyClaimed, minimum = FIRST_RUN.guaranteedReward) {
    const e = Math.max(0, Math.floor(earned) || 0);
    if (alreadyClaimed) return { total: e, bonus: 0, firstReward: false };
    const total = Math.max(e, minimum);
    return { total, bonus: total - e, firstReward: true };
  },

  // Forced interstitial gate. Rewarded ads are voluntary and not covered here.
  interstitialAllowed(s) {
    if (s.hasRemoveAds) return false;
    if (s.guided) return false;
    if (s.runCount <= AD_RULES.minCompletedRuns) return false;
    if (s.activePlaySeconds < AD_RULES.minActiveSeconds) return false;
    return s.runCount % AD_RULES.everyNRuns === 0;
  },

  // Cheapest-first pick among upgrades the player can afford right now,
  // preferring FIRST_RUN.recommendedUpgrade. `upgrades` = META_UPGRADES,
  // `levels` = { id: level }, `costFor(def, level)`. Returns an id or null.
  recommendUpgrade(currency, upgrades, levels, costFor, preferred = FIRST_RUN.recommendedUpgrade) {
    const affordable = upgrades.filter((u) => (levels[u.id] || 0) < u.maxLevel && costFor(u, levels[u.id] || 0) <= currency);
    if (!affordable.length) return null;
    const pref = affordable.find((u) => u.id === preferred);
    if (pref) return pref.id;
    affordable.sort((a, b) => costFor(a, levels[a.id] || 0) - costFor(b, levels[b.id] || 0));
    return affordable[0].id;
  },

  // Smallest level > `level` that is a boss level for a mode with `bossEvery`.
  nextBossLevel(level, bossEvery) {
    if (!bossEvery || bossEvery <= 0) return null;
    return (Math.floor(level / bossEvery) + 1) * bossEvery;
  },

  // Nearest permanent weapon unlock above `level` ({level, id}) or null.
  nextWeaponUnlock(level, weapons) {
    let best = null;
    for (const w of weapons) {
      if (w.tier === 'unlock' && w.unlockLevel > level && (!best || w.unlockLevel < best.level)) best = { level: w.unlockLevel, id: w.id };
    }
    return best;
  },

  // Damage floor during the grace period: returns the hp the player may not
  // go below (0 = no protection). `elapsed` is seconds since run start.
  graceHpFloor(guided, elapsed, maxHp) {
    if (!guided || elapsed >= FIRST_RUN.graceSeconds) return 0;
    return Math.ceil(maxHp * FIRST_RUN.graceHpFloorPct);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FIRST_RUN, AD_RULES, TUTORIAL_STEPS, TutorialFlow, FirstRun };
}
