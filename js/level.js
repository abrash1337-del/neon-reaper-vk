// ============================================================
// NEON REAPER - level.js
// Arena generation and wave / boss spawning logic.
// ============================================================
'use strict';

// ---- arena layout patterns ----------------------------------------------
// Each level rolls one of these to build its interior obstacles, so runs
// don't feel like the same open room with reshuffled crates every time.
// Every builder gets the same signature and returns plain {x,y,w,h,destructible}
// rects; Level.generateArena turns those into real Wall instances.

function layoutClear(midX, midY, cx, cy, spawn, bossSpawn, minCenter, minSpawn, minBoss) {
  if (Utils.dist(midX, midY, cx, cy) < minCenter) return false;
  if (Utils.dist(midX, midY, spawn.x, spawn.y) < minSpawn) return false;
  if (Utils.dist(midX, midY, bossSpawn.x, bossSpawn.y) < minBoss) return false;
  return true;
}

// Random scattered crates - the original layout. Loose and chaotic.
function scatterLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const count = Utils.randInt(4, 7 + Math.min(5, Math.floor(level / 3)));
  let attempts = 0;
  while (out.length < count && attempts < 60) {
    attempts++;
    const w = Utils.randInt(60, 160);
    const h = Utils.randInt(60, 160);
    const x = Utils.randRange(a.x + 80, a.x + a.w - 80 - w);
    const y = Utils.randRange(a.y + 80, a.y + a.h - 80 - h);
    if (!layoutClear(x + w / 2, y + h / 2, cx, cy, spawn, bossSpawn, 190, 220, 220)) continue;
    out.push({ x, y, w, h, destructible: Math.random() < 0.55 });
  }
  return out;
}

// Mirrored blocks either side of the vertical centerline - a tidier, more
// readable room than scatter, with matching cover on both flanks.
function symmetricLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const count = Utils.randInt(3, 4 + Math.min(4, Math.floor(level / 4)));
  let attempts = 0;
  while (out.length < count * 2 && attempts < 60) {
    attempts++;
    const w = Utils.randInt(56, 130);
    const h = Utils.randInt(56, 150);
    const x = Utils.randRange(a.x + 80, cx - 90 - w);
    const y = Utils.randRange(a.y + 80, a.y + a.h - 80 - h);
    if (!layoutClear(x + w / 2, y + h / 2, cx, cy, spawn, bossSpawn, 170, 210, 210)) continue;
    const destructible = Math.random() < 0.5;
    out.push({ x, y, w, h, destructible });
    out.push({ x: 2 * cx - x - w, y, w, h, destructible });
  }
  return out;
}

// A couple of long horizontal dividers, each with a gap - forces movement
// through chokepoints instead of a wide-open room.
function corridorsLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const thick = 34;
  const bandCount = Utils.randInt(2, 4);
  for (let i = 1; i <= bandCount; i++) {
    const y = a.y + (a.h * i) / (bandCount + 1);
    if (Math.abs(y - spawn.y) < 150 || Math.abs(y - bossSpawn.y) < 150) continue;
    const gapW = Utils.randInt(190, 270);
    const gapX = Utils.randRange(a.x + 220, a.x + a.w - 220 - gapW);
    const leftW = gapX - (a.x + 90);
    const rightX = gapX + gapW;
    const rightW = (a.x + a.w - 90) - rightX;
    const destructible = Math.random() < 0.4;
    if (leftW > 70) out.push({ x: a.x + 90, y: y - thick / 2, w: leftW, h: thick, destructible });
    if (rightW > 70) out.push({ x: rightX, y: y - thick / 2, w: rightW, h: thick, destructible });
  }
  return out;
}

// A ring of pillars around the arena center, coliseum-style - naturally
// leaves an opening wherever it would otherwise crowd the spawn points.
function ringLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  // Scaled off the arena's own size (not a flat pixel constant) so the ring
  // actually fills a bigger map instead of shrinking to a small circle lost
  // in the middle of a much larger room.
  const radius = Math.min(a.w, a.h) * 0.32 + Math.min(70, level * 4);
  const n = Utils.randInt(8, 11);
  const size = 46;
  const startAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const ang = startAngle + (i / n) * Math.PI * 2;
    const midX = cx + Math.cos(ang) * radius;
    const midY = cy + Math.sin(ang) * radius;
    if (!layoutClear(midX, midY, cx, cy, spawn, bossSpawn, 0, 190, 190)) continue;
    out.push({ x: midX - size / 2, y: midY - size / 2, w: size, h: size, destructible: false });
  }
  return out;
}

// Four blocks, one per quadrant, leaving a clear cross-shaped walkway
// through the center (which is exactly where spawn/boss already sit).
function quadrantsLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const laneHalf = 95;
  const margin = 90;
  const blockW = Utils.randInt(170, 260);
  const blockH = Utils.randInt(150, 240);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    const x = sx > 0 ? cx + laneHalf : cx - laneHalf - blockW;
    const y = sy > 0 ? cy + laneHalf : cy - laneHalf - blockH;
    if (x < a.x + margin || x + blockW > a.x + a.w - margin) return;
    if (y < a.y + margin || y + blockH > a.y + a.h - margin) return;
    if (!layoutClear(x + blockW / 2, y + blockH / 2, cx, cy, spawn, bossSpawn, 0, 200, 200)) return;
    out.push({ x, y, w: blockW, h: blockH, destructible: Math.random() < 0.5 });
  });
  return out;
}

// A sparse grid of small pillars spread across the whole room - lots of
// sightline breaks, good for dodging around at range.
function pillarsLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const size = 44;
  const cols = 6, rows = 5;
  const marginX = 150, marginY = 150;
  const stepX = (a.w - marginX * 2) / (cols - 1);
  const stepY = (a.h - marginY * 2) / (rows - 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.35) continue;
      const midX = a.x + marginX + c * stepX;
      const midY = a.y + marginY + r * stepY;
      if (!layoutClear(midX, midY, cx, cy, spawn, bossSpawn, 150, 190, 190)) continue;
      out.push({ x: midX - size / 2, y: midY - size / 2, w: size, h: size, destructible: Math.random() < 0.6 });
    }
  }
  return out;
}

// A diagonal staircase of blocks cutting across the room corner-to-corner,
// with a gap partway through to pass. Walls are axis-aligned rects, so the
// "diagonal" is faked as a stepped run of small blocks - reads clearly as a
// diagonal barrier at this scale, and unlike a real angled wall it can't
// leave an enemy's straight-line-to-player movement clipped into a corner
// with nowhere to slide (see entities.js Enemy.update - there's no
// pathfinding, just aim-at-player + wall push-out).
function diagonalLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const goingDown = Math.random() < 0.5; // NW->SE or NE->SW
  const steps = Utils.randInt(9, 12);
  const size = 50;
  const gapStart = Utils.randInt(3, steps - 4);
  const gapLen = 2;
  for (let i = 0; i < steps; i++) {
    if (i >= gapStart && i < gapStart + gapLen) continue;
    const t = i / (steps - 1);
    const x = a.x + 60 + t * (a.w - 120) - size / 2;
    const yT = goingDown ? t : 1 - t;
    const y = a.y + 60 + yT * (a.h - 120) - size / 2;
    if (!layoutClear(x + size / 2, y + size / 2, cx, cy, spawn, bossSpawn, 150, 190, 190)) continue;
    out.push({ x, y, w: size, h: size, destructible: Math.random() < 0.5 });
  }
  return out;
}

// A pinwheel of short spokes radiating out from the center, each offset a
// bit further out than the last block along it - open lanes between spokes
// instead of a solid ring, so it reads very differently from ringLayout
// even though both are center-anchored.
function spokesLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const armCount = Utils.randInt(4, 6);
  const startAngle = Math.random() * Math.PI * 2;
  const size = 42;
  const innerR = Math.min(a.w, a.h) * 0.16;
  const step = Math.min(a.w, a.h) * 0.09;
  const blocksPerArm = Utils.randInt(2, 3);
  for (let i = 0; i < armCount; i++) {
    const ang = startAngle + (i / armCount) * Math.PI * 2;
    for (let j = 0; j < blocksPerArm; j++) {
      const r = innerR + j * step;
      const midX = cx + Math.cos(ang) * r;
      const midY = cy + Math.sin(ang) * r;
      if (!layoutClear(midX, midY, cx, cy, spawn, bossSpawn, 0, 190, 190)) continue;
      out.push({ x: midX - size / 2, y: midY - size / 2, w: size, h: size, destructible: Math.random() < 0.5 });
    }
  }
  return out;
}

// Boss rooms: mostly open so attack patterns have room to breathe, just
// four small corner pillars for a moment of cover.
function arenaLayout(level, a, cx, cy, spawn, bossSpawn) {
  const out = [];
  const size = 50;
  // Offsets scale with the arena so the four corner pillars still sit at a
  // sensible distance from center on a bigger boss room instead of huddling
  // near the middle of a lot of empty space.
  const ox = a.w * 0.24, oy1 = a.h * 0.05, oy2 = a.h * 0.28;
  [
    { x: cx - ox, y: cy - oy1 }, { x: cx + ox - size, y: cy - oy1 },
    { x: cx - ox, y: cy + oy2 }, { x: cx + ox - size, y: cy + oy2 }
  ].forEach(p => {
    if (!layoutClear(p.x + size / 2, p.y + size / 2, cx, cy, spawn, bossSpawn, 160, 200, 260)) return;
    out.push({ x: p.x, y: p.y, w: size, h: size, destructible: false });
  });
  return out;
}

const LAYOUT_BUILDERS = {
  scatter: scatterLayout,
  symmetric: symmetricLayout,
  corridors: corridorsLayout,
  ring: ringLayout,
  quadrants: quadrantsLayout,
  pillars: pillarsLayout,
  diagonal: diagonalLayout,
  spokes: spokesLayout,
  arena: arenaLayout
};
const NORMAL_LAYOUT_KEYS = ['scatter', 'symmetric', 'corridors', 'ring', 'quadrants', 'pillars', 'diagonal', 'spokes'];

// ---- arena corner shape (independent of the interior layout above) ------
// Chamfers/notches cut into the four corners with solid filler blocks, so
// the room doesn't read as "always a plain rectangle" even before you look
// at what's scattered inside it. Purely additive filler on top of the four
// straight border walls generateArena() already places - the outer AABB
// bounds (and therefore camera clamping, spawn margins, etc.) never change,
// so this can't strand anything or break existing math. Only ever cuts
// corners (never a deep notch that would wall off part of the room into a
// separate pocket) because Enemy.update has no pathfinding - it just aims
// straight at the player and slides along whatever it bumps into, so a
// corner chamfer is always safe (still one open convex-ish room) while a
// deep notch could trap an enemy spawned "on the other side" of it.
function chamferShape(a) {
  const cut = Math.min(a.w, a.h) * 0.16;
  const out = [];
  // stepped (staircase) cut so it doesn't need a true diagonal wall
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const s = cut * (steps - i) / steps;
    const t = cut * (i / steps);
    out.push({ x: a.x, y: a.y + t, w: s, h: cut / steps, destructible: false });                          // top-left
    out.push({ x: a.x + a.w - s, y: a.y + t, w: s, h: cut / steps, destructible: false });                 // top-right
    out.push({ x: a.x, y: a.y + a.h - t - cut / steps, w: s, h: cut / steps, destructible: false });       // bottom-left
    out.push({ x: a.x + a.w - s, y: a.y + a.h - t - cut / steps, w: s, h: cut / steps, destructible: false }); // bottom-right
  }
  return out;
}

// Deeper cuts on only the two corners along one diagonal - an asymmetric
// silhouette instead of the symmetric octagon-ish chamferShape.
function notchShape(a) {
  const cut = Math.min(a.w, a.h) * 0.24;
  const cornerA = Math.random() < 0.5 ? 'tl' : 'tr'; // paired with its opposite corner
  const mk = (cx, cy) => ({ x: cx, y: cy, w: cut, h: cut, destructible: false });
  const out = [];
  if (cornerA === 'tl') {
    out.push(mk(a.x, a.y));
    out.push(mk(a.x + a.w - cut, a.y + a.h - cut));
  } else {
    out.push(mk(a.x + a.w - cut, a.y));
    out.push(mk(a.x, a.y + a.h - cut));
  }
  return out;
}

const SHAPE_BUILDERS = { none: () => [], chamfer: chamferShape, notch: notchShape };
const SHAPE_KEYS = ['none', 'none', 'chamfer', 'notch']; // weighted: plain rectangle is still the common case

const Level = {
  arena: { x: 0, y: 0, w: Balance.arenaW, h: Balance.arenaH },
  currentLayout: null,
  currentShape: null,
  _lastLayout: null,

  isBossLevel(level, bossEvery = Balance.bossEveryNLevels) { return level % bossEvery === 0; },

  bossTypeForLevel(level, bossEvery = Balance.bossEveryNLevels) {
    const idx = Math.floor(level / bossEvery) - 1;
    return BOSS_ORDER[((idx % BOSS_ORDER.length) + BOSS_ORDER.length) % BOSS_ORDER.length];
  },

  isCheckpointLevel(level, checkpointEvery = Balance.checkpointEveryNLevels) {
    return checkpointEvery > 0 && level % checkpointEvery === 1;
  },

  // Which boss "chapter" a level belongs to - the run of levels building up
  // to a given boss all share that boss's accent color (see BOSS_TYPES),
  // so the arena's ambient tint shifts every few levels instead of staying
  // one flat color for the whole run. Same bucketing as bossTypeForLevel:
  // the boss level itself is the last level of its own chapter.
  chapterColor(level, bossEvery = Balance.bossEveryNLevels) {
    const idx = Math.floor((level - 1) / bossEvery);
    const key = BOSS_ORDER[((idx % BOSS_ORDER.length) + BOSS_ORDER.length) % BOSS_ORDER.length];
    return BOSS_TYPES[key].color;
  },

  // Picks the next map layout, avoiding an immediate repeat of the last one
  // so back-to-back levels always feel different from each other.
  pickLayout(level, bossEvery = Balance.bossEveryNLevels) {
    if (this.isBossLevel(level, bossEvery)) return 'arena';
    const pool = NORMAL_LAYOUT_KEYS.filter(k => k !== this._lastLayout);
    const key = Utils.choice(pool.length ? pool : NORMAL_LAYOUT_KEYS);
    this._lastLayout = key;
    return key;
  },

  generateArena(level, mode) {
    const a = this.arena;
    const walls = [];
    const thick = 40;
    // border - the arena's contour. Inset INSIDE the arena bounds (not outside
    // them) so it always stays within the camera's viewable range and actually
    // reads as an enclosing wall instead of a strip the camera never scrolls to.
    walls.push(new Wall(a.x, a.y, a.w, thick, false));                         // top
    walls.push(new Wall(a.x, a.y + a.h - thick, a.w, thick, false));           // bottom
    walls.push(new Wall(a.x, a.y, thick, a.h, false));                         // left
    walls.push(new Wall(a.x + a.w - thick, a.y, thick, a.h, false));           // right

    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const spawn = this.playerSpawnPoint();
    const bossSpawn = { x: a.x + a.w / 2, y: a.y + 140 };
    const bossLevel = this.isBossLevel(level, mode ? mode.bossEvery : Balance.bossEveryNLevels);
    const layout = this.pickLayout(level, mode ? mode.bossEvery : Balance.bossEveryNLevels);
    this.currentLayout = layout;
    const builder = LAYOUT_BUILDERS[layout] || scatterLayout;
    builder(level, a, cx, cy, spawn, bossSpawn).forEach(o => {
      walls.push(new Wall(o.x, o.y, o.w, o.h, o.destructible));
    });

    // Corner shape, independent of the interior layout above - skipped on
    // boss levels so those rooms stay fully open for attack patterns, as
    // arenaLayout's own corner pillars already intend.
    const shapeKey = bossLevel ? 'none' : Utils.choice(SHAPE_KEYS);
    this.currentShape = shapeKey;
    (SHAPE_BUILDERS[shapeKey] || (() => []))(a).forEach(o => {
      walls.push(new Wall(o.x, o.y, o.w, o.h, o.destructible));
    });

    return walls;
  },

  // ---- rare weapon pickups (found on the map, never unlocked by leveling) ----
  rareWeaponSpawnChance(level) {
    if (level < 3) return 0;
    return Utils.clamp(0.25 + (level - 3) * 0.04, 0, 0.65);
  },

  eligibleRareWeapons(level) {
    return WEAPONS.filter(w => (w.tier === 'rare' || w.tier === 'legendary') && level >= w.minLevel);
  },

  // Rolls whether a rare weapon should appear this level and, if so, picks a spot
  // for it clear of the player/boss spawn, the arena center, and every wall.
  // Legendary-tier weapons share this same roll but are drawn with a much
  // lower weight, so finding one is a rare, memorable event rather than
  // something guaranteed by grinding levels.
  placeRareWeaponPickup(level, walls) {
    if (Math.random() > this.rareWeaponSpawnChance(level)) return null;
    const pool = this.eligibleRareWeapons(level);
    if (!pool.length) return null;
    const weapon = Utils.weightedChoice(pool, w => w.tier === 'legendary' ? 1 : 6);

    const a = this.arena;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const spawn = this.playerSpawnPoint();
    const bossSpawn = { x: a.x + a.w / 2, y: a.y + 140 };
    let attempts = 0;
    while (attempts < 40) {
      attempts++;
      const x = Utils.randRange(a.x + 100, a.x + a.w - 100);
      const y = Utils.randRange(a.y + 100, a.y + a.h - 100);
      if (Utils.dist(x, y, cx, cy) < 150) continue;
      if (Utils.dist(x, y, spawn.x, spawn.y) < 200) continue;
      if (Utils.dist(x, y, bossSpawn.x, bossSpawn.y) < 200) continue;
      if (walls.some(w => Utils.circleRectOverlap(x, y, 30, w))) continue;
      return { x, y, weaponId: weapon.id };
    }
    return null;
  },

  spawnPositionAwayFrom(px, py, minDist, walls) {
    const a = this.arena;
    let x, y, tries = 0;
    do {
      x = Utils.randRange(a.x + 70, a.x + a.w - 70);
      y = Utils.randRange(a.y + 70, a.y + a.h - 70);
      tries++;
    } while (
      tries < 40 &&
      (Utils.dist(x, y, px, py) < minDist ||
        (walls && walls.some(w => !w.dead && Utils.circleRectOverlap(x, y, 22, w))))
    );
    return { x, y };
  },

  // Returns { enemies, queue }: `enemies` is spawned immediately (capped at
  // the mode's maxAlive so a frame never has to simulate/render more than
  // that many at once), `queue` is the rest as bare type keys, trickled in
  // by main.js as earlier enemies die. Total wave size is itself capped at
  // a sane multiple of the alive-cap so an endless mode's queue can't grow
  // into the tens of thousands at high levels - see AUDIT.md.
  // `difficulty` (see DIFFICULTIES in config.js) scales each spawned
  // enemy's hp/speed/outgoing-damage on top of the mode's own multipliers.
  spawnWave(level, player, walls, mode, difficulty) {
    const countMult = mode ? mode.enemyCountMult : 1;
    const speedMult = (mode ? mode.enemySpeedMult : 1) * (difficulty ? difficulty.speedMult : 1);
    const hpMult = difficulty ? difficulty.hpMult : 1;
    const dmgMult = difficulty ? difficulty.dmgMult : 1;
    const cap = mode ? mode.maxAlive : Balance.maxAliveEnemies;
    const rawCount = Math.round(Balance.baseWaveEnemies * Math.pow(Balance.waveEnemyGrowth, level - 1) * countMult);
    const count = Utils.clamp(rawCount, 1, cap * 6);

    const rollType = () => {
      const roll = Math.random();
      if (level >= 6 && roll < 0.16) return 'sniper';
      if (level >= 3 && roll < 0.42) return 'shooter';
      if (level >= 5 && roll > 0.85) return 'heavy';
      return 'rusher';
    };

    const enemies = [];
    const spawnNow = Math.min(count, cap);
    for (let i = 0; i < spawnNow; i++) {
      const pos = this.spawnPositionAwayFrom(player.x, player.y, 260, walls);
      const en = new Enemy(rollType(), pos.x, pos.y);
      en.speedMult = speedMult;
      en.hp = Math.round(en.hp * hpMult); en.maxHp = en.hp;
      en.dmgMult = dmgMult;
      enemies.push(en);
    }
    const queue = [];
    for (let i = spawnNow; i < count; i++) queue.push(rollType());
    return { enemies, queue };
  },

  spawnBoss(level, player, mode, difficulty) {
    const bossEvery = mode ? mode.bossEvery : Balance.bossEveryNLevels;
    const key = this.bossTypeForLevel(level, bossEvery);
    const a = this.arena;
    const pos = { x: a.x + a.w / 2, y: a.y + 140 };
    const boss = new Boss(key, pos.x, pos.y);
    boss.speedMult = (mode ? mode.enemySpeedMult : 1) * (difficulty ? difficulty.speedMult : 1);
    boss.hp = Math.round(boss.hp * (difficulty ? difficulty.hpMult : 1)); boss.maxHp = boss.hp;
    boss.dmgMult = difficulty ? difficulty.dmgMult : 1;
    return boss;
  },

  playerSpawnPoint() {
    const a = this.arena;
    return { x: a.x + a.w / 2, y: a.y + a.h - 140 };
  }
};
