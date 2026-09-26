// ============================================================
// NEON REAPER - entities.js
// Player, Enemy, Boss, Projectile, Wall, Particle, WeaponPickup
// ============================================================
'use strict';

// ---------------------------------------------------------------
// Particles
// ---------------------------------------------------------------
class ParticleSystem {
  constructor() { this.list = []; }
  burst(x, y, color, count, opts = {}) {
    const speed = opts.speed || [40, 220];
    const life = opts.life || [0.25, 0.6];
    const size = opts.size || [2, 5];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Utils.randRange(speed[0], speed[1]);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: Utils.randRange(life[0], life[1]),
        maxLife: life[1],
        size: Utils.randRange(size[0], size[1]),
        color
      });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - Math.min(1, dt * 2.2));
      p.vy *= (1 - Math.min(1, dt * 2.2));
    }
  }
  clear() { this.list.length = 0; }
}

// ---------------------------------------------------------------
// Player
// ---------------------------------------------------------------
class Player {
  constructor(x, y) {
    this.id = Utils.nextId();
    this.x = x; this.y = y;
    this.radius = Balance.playerRadius;
    this.angle = 0;
    this.alive = true;

    // permanent bonuses from Meta (bought with currency earned across runs)
    const metaHpLevel = Meta.getUpgradeLevel('hp');
    this.maxHp = 100 + metaHpLevel * 10;
    this.hp = this.maxHp;
    this.metaDmgMult = 1 + Meta.getUpgradeLevel('damage') * 0.08;
    this.metaSpeedMult = 1 + Meta.getUpgradeLevel('speed') * 0.05;
    this.metaDashCooldownMult = 1 - Meta.getUpgradeLevel('dash') * 0.1;
    // temporary, run-only bonuses from perks chosen on level-up (see applyPerk)
    this.runDmgMult = 1; this.runSpeedMult = 1; this.runCooldownMult = 1; this.runDashCooldownMult = 1;
    // how many times each stackable perk has been picked this run, capped at
    // PERKS[id].maxStacks - see applyPerk() and main.js's availablePerks()
    this.perkStacks = { hp_max: 0, damage: 0, speed: 0, cooldown: 0, dash: 0 };

    this.weaponIds = WEAPONS.filter(w => w.tier === 'starter').map(w => w.id);
    this.weaponIndex = 0;
    this.attackTimer = 0;
    this.spinUp = 0; // for minigun-style wind-up

    this.dashCooldownTimer = 0;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashDirX = 0; this.dashDirY = 0;
    this.invuln = 0;

    this.combo = 0;
    this.comboTimer = 0;
    this.score = 0;
    this.scoreMult = 1; // set by the current game mode (e.g. Time Attack/Frenzy score bonuses)

    this.thrownWeaponId = null; // set while a melee weapon is lying on the ground
    this.moveX = 0; this.moveY = 0;
    this.walkPhase = 0; // used by the humanoid renderer's leg animation

    // Frost/chill status (set by the Cryo boss's ice attacks - see main.js's
    // enemy-projectile-vs-player handling) - a temporary movement slow, not
    // a stacking debuff: a fresh hit refreshes the timer and keeps whichever
    // slow is currently strongest rather than adding on top.
    this.chillTimer = 0; this.chillMult = 1;

    // Cosmetic-only skin (see SKINS in config.js) - purely visual, no stat
    // effect. startRun() overwrites this with the player's selected skin;
    // this default just keeps drawPlayer() safe if ever drawn before that.
    this.skin = SKINS[0];
  }

  get weapon() { return WEAPONS.find(w => w.id === this.weaponIds[this.weaponIndex]); }

  // Combined permanent (Meta shop) x temporary (this-run perk) multipliers -
  // every damage/speed/cooldown call site reads through these instead of
  // the raw Balance/weapon numbers.
  get dmgMult() { return this.metaDmgMult * this.runDmgMult; }
  get moveSpeedMult() { return this.metaSpeedMult * this.runSpeedMult * this.chillMult; }
  get dashCooldownMult() { return this.metaDashCooldownMult * this.runDashCooldownMult; }

  // True once a stackable perk has hit its PERKS[id].maxStacks this run - used
  // both to stop applyPerk from over-applying it and by main.js's
  // availablePerks() to stop offering it as a (now pointless) choice.
  perkAtCap(id) {
    const def = PERKS.find(p => p.id === id);
    if (!def || def.maxStacks == null) return false;
    return (this.perkStacks[id] || 0) >= def.maxStacks;
  }

  // Applies one of the PERKS (see config.js) chosen on a level-up screen.
  // Purely run-scoped - never touches the permanent Meta multipliers.
  // Every stackable perk is ADDITIVE (mult = 1 +/- stacks * step), capped at
  // maxStacks, so no perk can snowball without limit and none goes stale.
  applyPerk(id) {
    if (this.perkAtCap(id)) return; // guard - the UI shouldn't offer it capped, but stay safe
    switch (id) {
      case 'hp_max':
        this.maxHp += 15; this.hp = Math.min(this.maxHp, this.hp + 15);
        this.perkStacks.hp_max++;
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.3));
        break;
      case 'damage':
        this.perkStacks.damage++;
        this.runDmgMult = 1 + this.perkStacks.damage * 0.08;
        break;
      case 'speed':
        this.perkStacks.speed++;
        this.runSpeedMult = 1 + this.perkStacks.speed * 0.05;
        break;
      case 'cooldown':
        this.perkStacks.cooldown++;
        this.runCooldownMult = 1 - this.perkStacks.cooldown * 0.10;
        break;
      case 'dash':
        this.perkStacks.dash++;
        this.runDashCooldownMult = 1 - this.perkStacks.dash * 0.12;
        break;
    }
  }

  switchWeapon(delta) {
    const n = this.weaponIds.length;
    this.weaponIndex = ((this.weaponIndex + delta) % n + n) % n;
  }
  switchWeaponTo(idOrIndex) {
    if (typeof idOrIndex === 'number') { this.weaponIndex = Utils.clamp(idOrIndex, 0, this.weaponIds.length - 1); return; }
    const idx = this.weaponIds.indexOf(idOrIndex);
    if (idx >= 0) this.weaponIndex = idx;
  }

  // Adds a weapon to the loadout (permanently, for the rest of this run) if not
  // already owned. Returns true when it was newly unlocked (for UI feedback).
  unlockWeapon(id) {
    if (this.weaponIds.includes(id)) return false;
    this.weaponIds.push(id);
    return true;
  }

  takeDamage(amount) {
    if (this.invuln > 0 || this.dashing || !this.alive) return false;
    this.hp -= amount;
    this.combo = 0;
    this.comboTimer = 0;
    this.invuln = 0.5;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    Sfx.hurt();
    return true;
  }

  registerKill(scoreValue) {
    this.combo += 1;
    this.comboTimer = Balance.comboWindow;
    const multiplier = 1 + this.combo * Balance.comboScorePerKill * 0.1;
    this.score += Math.round(scoreValue * multiplier * this.scoreMult);
  }

  // Returns true when the dash actually started (still on cooldown -> false),
  // so the caller can gate the dash sound/VFX on a real dash.
  startDash() {
    if (this.dashCooldownTimer > 0 || this.dashing) return false;
    let dx = this.moveX, dy = this.moveY;
    if (dx === 0 && dy === 0) { dx = Math.cos(this.angle); dy = Math.sin(this.angle); }
    const len = Math.hypot(dx, dy) || 1;
    this.dashDirX = dx / len; this.dashDirY = dy / len;
    this.dashing = true;
    this.dashTimer = Balance.dashDuration;
    this.dashCooldownTimer = Balance.dashCooldown * this.dashCooldownMult;
    this.invuln = Math.max(this.invuln, Balance.dashIFrames);
    return true;
  }

  update(dt) {
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.attackTimer > 0) this.attackTimer -= dt;

    if (this.dashing) {
      this.dashTimer -= dt;
      this.x += this.dashDirX * Balance.dashSpeed * dt;
      this.y += this.dashDirY * Balance.dashSpeed * dt;
      if (this.dashTimer <= 0) this.dashing = false;
      this.walkPhase += dt * 22; // legs blur fast while dashing
    } else {
      const len = Math.hypot(this.moveX, this.moveY);
      if (len > 0) {
        this.x += (this.moveX / len) * Balance.playerSpeed * this.moveSpeedMult * dt;
        this.y += (this.moveY / len) * Balance.playerSpeed * this.moveSpeedMult * dt;
        this.walkPhase += dt * 10;
      }
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.chillTimer > 0) {
      this.chillTimer -= dt;
      if (this.chillTimer <= 0) { this.chillTimer = 0; this.chillMult = 1; }
    }
  }
}

// ---------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------
class Projectile {
  constructor(opts) {
    this.id = Utils.nextId();
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, radius: 5, dmg: 10, color: Palette.white,
      owner: 'player', pierce: false, life: 2.2, explosive: false,
      explosionRadius: 0, breaksWalls: false, homing: false, target: null,
      turnRate: 2.4, hitSet: new Set(), dead: false
    }, opts);
    this.prevX = this.x; this.prevY = this.y;
  }
  update(dt) {
    this.prevX = this.x; this.prevY = this.y;
    // "still a valid target" check has to work for both target kinds this
    // ever homes on: Player (has .alive, no .dead) when a boss fires a
    // homing shot, and Enemy/Boss (has .dead, no .alive) when the player's
    // own homing weapon (Seeker Cannon) locks onto one - checking only
    // .alive silently never stops tracking a killed Enemy/Boss, since
    // .alive is always undefined on those and `undefined !== false` is
    // always true.
    if (this.homing && this.target && this.target.alive !== false && this.target.dead !== true) {
      const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      const diff = Utils.normalizeAngleDiff(desired - cur);
      const turn = Utils.clamp(diff, -this.turnRate * dt, this.turnRate * dt);
      const speed = Math.hypot(this.vx, this.vy);
      const na = cur + turn;
      this.vx = Math.cos(na) * speed;
      this.vy = Math.sin(na) * speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

// ---------------------------------------------------------------
// Wall (arena obstacle, optionally destructible)
// ---------------------------------------------------------------
class Wall {
  constructor(x, y, w, h, destructible) {
    this.id = Utils.nextId();
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.destructible = destructible;
    this.hp = destructible ? 60 : Infinity;
    this.dead = false;
  }
  damage(amount) {
    if (!this.destructible) return;
    this.hp -= amount;
    if (this.hp <= 0) this.dead = true;
  }
}

// ---------------------------------------------------------------
// Weapon pickup (a melee weapon thrown to the ground)
// ---------------------------------------------------------------
class WeaponPickup {
  constructor(x, y, weaponId) {
    this.id = Utils.nextId();
    this.x = x; this.y = y; this.weaponId = weaponId;
    this.radius = 16;
    this.dead = false;
  }
}

// ---------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------
class Enemy {
  constructor(typeKey, x, y) {
    const def = ENEMY_TYPES[typeKey];
    this.id = Utils.nextId();
    this.typeKey = typeKey;
    this.def = def;
    this.x = x; this.y = y;
    this.hp = def.hp; this.maxHp = def.hp;
    this.radius = def.radius;
    this.color = def.color;
    this.dead = false;
    this.fireTimer = Utils.randRange(0.2, def.fireRate || 1);
    this.hitFlash = 0;
    this.knockX = 0; this.knockY = 0;
    this.chargeTimer = 0; // telegraph wind-up before firing, for enemies with def.telegraph (e.g. sniper)
    this.stunTimer = 0; // set by weapons with a `stun` field (e.g. the hammer)
    this.burnTimer = 0; this.burnDps = 0; // set by weapons with a `burn` field (e.g. the flamethrower)
    this.angle = 0; // facing direction, used by the humanoid renderer
    this.moving = false; // used to gate the walk-cycle animation
    this.walkPhase = Math.random() * Math.PI * 2; // desynced per-enemy leg animation
    this.speedMult = 1; // set by the current game mode (e.g. Frenzy speeds enemies up)
    this.dmgMult = 1; // set by the chosen difficulty (see DIFFICULTIES in config.js)
  }
  takeDamage(dmg, kx = 0, ky = 0) {
    // Already dead this frame (killed by an earlier projectile/melee hit
    // this same tick, just not yet spliced out of Game.enemies). Every call
    // site uses this method's return value as "did this call just kill it"
    // to decide whether to fire onEnemyOrBossKilled (score/combo/VFX/SFX) -
    // so this MUST return false here (not this.dead/true), or a second/
    // third simultaneous overlapping hit (e.g. several shotgun pellets
    // landing on one small hitbox at once) re-triggers the kill reward a
    // second time for the same kill.
    if (this.dead) return false;
    this.hp -= dmg;
    this.hitFlash = 0.12;
    const resist = this.def.knockbackResist || 0;
    this.knockX += kx * (1 - resist);
    this.knockY += ky * (1 - resist);
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
  // `others` (typically Game.enemies) is optional - when passed, this enemy
  // steers slightly away from any of them it's overlapping (see sepX/sepY
  // below), so a group fans out and surrounds the player instead of walking
  // in a single-file stack straight at them.
  update(dt, player, projectiles, walls, others) {
    // Killed earlier this same frame (by melee or a projectile processed
    // before the enemies loop runs) but not yet spliced out - skip its
    // turn entirely so a corpse can't still fire a shot or land contact
    // damage on the player for the one frame before removal.
    if (this.dead) return;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // apply knockback decay
    if (Math.abs(this.knockX) > 1 || Math.abs(this.knockY) > 1) {
      this.x += this.knockX * dt;
      this.y += this.knockY * dt;
      this.knockX *= 0.86; this.knockY *= 0.86;
    }
    if (this.stunTimer > 0) { this.stunTimer -= dt; this.moving = false; return; } // stunned: no movement, no attacking

    const d = Utils.dist(this.x, this.y, player.x, player.y);
    const ang = Utils.angleTo(this.x, this.y, player.x, player.y);
    this.angle = ang; // always face the player, like the player faces the mouse
    this.moving = false;

    const spd = this.def.speed * this.speedMult;

    let sepX = 0, sepY = 0;
    if (others) {
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o === this || o.dead) continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const dd = Math.hypot(dx, dy) || 0.01;
        const minDist = this.radius + o.radius + 10;
        if (dd < minDist) {
          const push = (minDist - dd) / minDist;
          sepX += (dx / dd) * push;
          sepY += (dy / dd) * push;
        }
      }
    }

    if (this.def.behavior === 'melee') {
      // predictive intercept: aim a little ahead of where the player is
      // moving rather than straight at their current spot, so strafing
      // around a rusher in a straight line no longer works forever
      const pvx = player.moveX || 0, pvy = player.moveY || 0;
      const pvLen = Math.hypot(pvx, pvy);
      let chaseAng = ang;
      if (pvLen > 0.1) {
        const leadSpeed = Balance.playerSpeed * (player.moveSpeedMult || 1);
        const predX = player.x + (pvx / pvLen) * leadSpeed * 0.35;
        const predY = player.y + (pvy / pvLen) * leadSpeed * 0.35;
        chaseAng = Utils.angleTo(this.x, this.y, predX, predY);
      }
      if (d > this.radius + player.radius - 4) {
        this.x += (Math.cos(chaseAng) * spd + sepX * spd * 0.9) * dt;
        this.y += (Math.sin(chaseAng) * spd + sepY * spd * 0.9) * dt;
        this.moving = true;
      } else if (sepX || sepY) {
        this.x += sepX * spd * 0.6 * dt;
        this.y += sepY * spd * 0.6 * dt;
      }
    } else if (this.def.behavior === 'ranged') {
      const pref = this.def.preferredRange || 250;
      let vx = 0, vy = 0;
      if (d > pref + 30) {
        vx = Math.cos(ang); vy = Math.sin(ang);
        this.moving = true;
      } else if (d < pref - 30) {
        vx = -Math.cos(ang); vy = -Math.sin(ang);
        this.moving = true;
      } else {
        // sitting in the ideal range band: strafe sideways instead of
        // standing still, so ranged enemies are a moving target, not a
        // stationary turret - direction flips every couple of seconds
        this.strafeDir = this.strafeDir || (Math.random() < 0.5 ? 1 : -1);
        this.strafeTimer = (this.strafeTimer || 0) - dt;
        if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = Utils.randRange(1.2, 2.4); }
        const perp = ang + Math.PI / 2;
        vx = Math.cos(perp) * this.strafeDir; vy = Math.sin(perp) * this.strafeDir;
        this.moving = true;
      }
      this.x += (vx * spd + sepX * spd * 0.7) * dt;
      this.y += (vy * spd + sepY * spd * 0.7) * dt;
      this.fireTimer -= dt;
      if (this.chargeTimer > 0) {
        // telegraphing a shot (e.g. sniper) - hold aim, don't move the fire timer, then fire
        this.chargeTimer -= dt;
        if (this.chargeTimer <= 0) {
          this.fireTimer = this.def.fireRate;
          const fireAng = Utils.angleTo(this.x, this.y, player.x, player.y);
          projectiles.push(new Projectile({
            x: this.x, y: this.y,
            vx: Math.cos(fireAng) * this.def.projSpeed, vy: Math.sin(fireAng) * this.def.projSpeed,
            radius: 5, dmg: this.def.projDmg * this.dmgMult, color: this.color, owner: 'enemy'
          }));
        }
      } else if (this.fireTimer <= 0 && d < pref + 200) {
        if (this.def.telegraph) {
          this.chargeTimer = this.def.telegraph; // next frame(s) will count this down, then fire
        } else {
          this.fireTimer = this.def.fireRate;
          projectiles.push(new Projectile({
            x: this.x, y: this.y,
            vx: Math.cos(ang) * this.def.projSpeed, vy: Math.sin(ang) * this.def.projSpeed,
            radius: 5, dmg: this.def.projDmg * this.dmgMult, color: this.color, owner: 'enemy'
          }));
        }
      }
    }
    if (this.moving) this.walkPhase += dt * 9;
  }
}

// ---------------------------------------------------------------
// Boss
// ---------------------------------------------------------------
class Boss {
  constructor(typeKey, x, y) {
    const def = BOSS_TYPES[typeKey];
    this.id = Utils.nextId();
    this.typeKey = typeKey;
    this.def = def;
    this.x = x; this.y = y;
    this.hp = def.hp; this.maxHp = def.hp;
    this.radius = def.radius;
    this.color = def.color;
    this.dead = false;
    this.hitFlash = 0;
    this.phaseTimer = 1.0; // grace period before first attack
    this.teleportCharge = 0;
    this.teleportTarget = null;
    this.isBoss = true;
    this.burnTimer = 0; this.burnDps = 0; // set by weapons with a `burn` field (e.g. the flamethrower)
    this.angle = 0; // facing direction, used by the humanoid renderer
    this.speedMult = 1; // set by the current game mode (e.g. Frenzy speeds enemies up)
    this.dmgMult = 1; // set by the chosen difficulty (see DIFFICULTIES in config.js)
    this.attackIndex = 0; // cycles through def.attacks when a boss has more than one pattern
    this.enraged = false; // latches true once hp drops below def.enrageAt and never turns back off
  }
  takeDamage(dmg) {
    if (this.dead) return false; // see Enemy.takeDamage's identical guard for why - must be false, not true/this.dead
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
  update(dt, player, projectiles, particles, arena, groundWarnings) {
    if (this.dead) return;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Enrage: once hp drops below the threshold, permanently pick up the pace
    // (faster, hits attacks more often) - gives multi-attack bosses like the
    // Squall a real second phase instead of one flat difficulty the whole fight.
    if (!this.enraged && this.def.enrageAt && this.hp / this.maxHp <= this.def.enrageAt) {
      this.enraged = true;
    }
    const enrageSpeedMult = this.enraged ? 1.3 : 1;
    const enrageRateMult = this.enraged ? 0.6 : 1; // multiplies phaseTimer - lower = attacks more often

    const d = Utils.dist(this.x, this.y, player.x, player.y);
    const ang = Utils.angleTo(this.x, this.y, player.x, player.y);
    this.angle = ang;
    const keepDist = 240;
    const spd = this.def.speed * this.speedMult * enrageSpeedMult;
    if (this.def.attack !== 'teleportSlam' || this.teleportCharge <= 0) {
      if (d > keepDist) { this.x += Math.cos(ang) * spd * dt; this.y += Math.sin(ang) * spd * dt; }
      else if (d < keepDist - 80) { this.x -= Math.cos(ang) * spd * dt; this.y -= Math.sin(ang) * spd * dt; }
    }
    this.x = Utils.clamp(this.x, arena.x + this.radius, arena.x + arena.w - this.radius);
    this.y = Utils.clamp(this.y, arena.y + this.radius, arena.y + arena.h - this.radius);

    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      // Bosses with a single fixed `attack` key behave exactly as before;
      // bosses with an `attacks` array (e.g. bulletstorm/Squall) cycle
      // through all of them in order instead of repeating one pattern.
      const patterns = this.def.attacks || [this.def.attack];
      const key = patterns[this.attackIndex % patterns.length];
      this.attackIndex++;
      BossPatterns[key](this, dt, player, projectiles, particles, arena, groundWarnings);
      this.phaseTimer *= enrageRateMult;
    }
  }
}

// ---------------------------------------------------------------
// Boss attack patterns (each sets this.phaseTimer to its own cooldown)
// ---------------------------------------------------------------
const BossPatterns = {
  bulletSpray(boss, dt, player, projectiles) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
        radius: 6, dmg: 12 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 3
      }));
    }
    boss.phaseTimer = 1.8;
  },
  // Squall-exclusive: a tight 3-bullet fan that keeps firing every ~0.35s and
  // rotates a little further each pulse, so over ~2s it sweeps a full rotating
  // "flower" of bullets around the arena instead of one static burst.
  spiralBarrage(boss, dt, player, projectiles) {
    const n = 3;
    boss.spiralAngle = (boss.spiralAngle || 0) + 0.55;
    for (let i = 0; i < n; i++) {
      const a = boss.spiralAngle + (i / n) * Math.PI * 2;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
        radius: 6, dmg: 10 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 2.4
      }));
    }
    boss.phaseTimer = 0.35;
    boss.spiralPulses = (boss.spiralPulses || 0) + 1;
    // after ~14 quick pulses (≈5s), hand control back to the normal pattern
    // cycle instead of spiraling forever
    if (boss.spiralPulses >= 14) { boss.spiralPulses = 0; boss.phaseTimer = 1.6; }
    else { boss.attackIndex--; } // stay on this pattern for the next tick too
  },
  // Squall-exclusive: three expanding waves along the four diagonals, aimed
  // independent of player position - forces movement rather than just
  // dodging sideways like bulletSpray/spiralBarrage do.
  crossVolley(boss, dt, player, projectiles) {
    for (let r = 0; r < 3; r++) {
      const spd = 300 + r * 90;
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4;
        projectiles.push(new Projectile({
          x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          radius: 6, dmg: 11 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 2.2
        }));
      }
    }
    boss.phaseTimer = 2.2;
  },
  teleportSlam(boss, dt, player, projectiles, particles) {
    particles.burst(boss.x, boss.y, boss.color, 30, { speed: [80, 260], life: [0.3, 0.6] });
    const angle = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 60;
    boss.x = Utils.clamp(player.x + Math.cos(angle) * r, 60, Balance.arenaW - 60);
    boss.y = Utils.clamp(player.y + Math.sin(angle) * r, 60, Balance.arenaH - 60);
    particles.burst(boss.x, boss.y, boss.color, 30, { speed: [80, 260], life: [0.3, 0.6] });
    const d = Utils.dist(boss.x, boss.y, player.x, player.y);
    if (d < 130) player.takeDamage(Math.round(22 * boss.dmgMult));
    boss.phaseTimer = 1.6;
  },
  // Phantom-exclusive: teleports away then unloads a spread of slow-tracking
  // shadow bolts - ranged pressure between blinks instead of pure melee ambush.
  phantomBolts(boss, dt, player, projectiles, particles) {
    particles.burst(boss.x, boss.y, boss.color, 20, { speed: [60, 200], life: [0.3, 0.5] });
    const angle = Math.random() * Math.PI * 2;
    const r = 220 + Math.random() * 80;
    boss.x = Utils.clamp(player.x + Math.cos(angle) * r, 60, Balance.arenaW - 60);
    boss.y = Utils.clamp(player.y + Math.sin(angle) * r, 60, Balance.arenaH - 60);
    particles.burst(boss.x, boss.y, boss.color, 20, { speed: [60, 200], life: [0.3, 0.5] });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.28;
      const a = Utils.angleTo(boss.x, boss.y, player.x, player.y) + spread;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
        radius: 6, dmg: 9 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 3.2,
        homing: true, target: player, turnRate: 1.4
      }));
    }
    boss.phaseTimer = 2.0;
  },
  // Phantom-exclusive: blinks twice in quick succession instead of once - the
  // player has to react to two landing spots, not just one predictable slam.
  doubleBlink(boss, dt, player, projectiles, particles) {
    particles.burst(boss.x, boss.y, boss.color, 24, { speed: [80, 240], life: [0.25, 0.5] });
    const angle = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 60;
    boss.x = Utils.clamp(player.x + Math.cos(angle) * r, 60, Balance.arenaW - 60);
    boss.y = Utils.clamp(player.y + Math.sin(angle) * r, 60, Balance.arenaH - 60);
    particles.burst(boss.x, boss.y, boss.color, 24, { speed: [80, 240], life: [0.25, 0.5] });
    const d = Utils.dist(boss.x, boss.y, player.x, player.y);
    if (d < 130) player.takeDamage(Math.round(18 * boss.dmgMult));
    boss.blinkCount = (boss.blinkCount || 0) + 1;
    if (boss.blinkCount < 2) { boss.phaseTimer = 0.35; boss.attackIndex--; }
    else { boss.blinkCount = 0; boss.phaseTimer = 1.4; }
  },
  homingMissiles(boss, dt, player, projectiles) {
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 0.4;
      const a = Utils.angleTo(boss.x, boss.y, player.x, player.y) + spread;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
        radius: 7, dmg: 14 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 4,
        homing: true, target: player, turnRate: 1.8
      }));
    }
    boss.phaseTimer = 2.2;
  },
  // Seeker-exclusive: two quick pulses of 3 homing missiles each (6 total) -
  // a denser swarm than the base pattern, using the same self-repeat trick
  // as Squall's spiralBarrage to spread the pulses over real time.
  missileBarrage(boss, dt, player, projectiles) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const spread = (i - 1) * 0.35;
      const a = Utils.angleTo(boss.x, boss.y, player.x, player.y) + spread;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        radius: 6, dmg: 10 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 3.5,
        homing: true, target: player, turnRate: 2.0
      }));
    }
    boss.missilePulses = (boss.missilePulses || 0) + 1;
    if (boss.missilePulses < 2) { boss.phaseTimer = 0.4; boss.attackIndex--; }
    else { boss.missilePulses = 0; boss.phaseTimer = 2.4; }
  },
  // Seeker-exclusive: a ring of slow, tightly-homing "mines" that drift in
  // from every direction at once - inescapable rather than fast, the
  // opposite feel from homingMissiles/missileBarrage's speed.
  swarmMines(boss, dt, player, projectiles) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      projectiles.push(new Projectile({
        x: boss.x + Math.cos(a) * 30, y: boss.y + Math.sin(a) * 30,
        vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
        radius: 8, dmg: 16 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 5,
        homing: true, target: player, turnRate: 3.0
      }));
    }
    boss.phaseTimer = 3.0;
  },
  meteorShower(boss, dt, player, projectiles, particles, arena, groundWarnings) {
    // telegraph: a ground ring marks each impact point for the same ~0.42s
    // the meteor itself takes to fall (260 / 620 px/s), so the landing spot
    // is obvious even if the falling dot itself is easy to miss.
    for (let i = 0; i < 6; i++) {
      const tx = arena.x + Math.random() * arena.w;
      const ty = arena.y + Math.random() * arena.h;
      if (groundWarnings) groundWarnings.push({ x: tx, y: ty, radius: 70, life: 0.42, maxLife: 0.42, color: boss.color });
      projectiles.push(new Projectile({
        x: tx, y: ty - 260, vx: 0, vy: 620,
        radius: 12, dmg: 20 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 1.4,
        explosive: true, explosionRadius: 70
      }));
    }
    boss.phaseTimer = 2.4;
  },
  // Meteor-exclusive: a straight line of meteors across a random orientation
  // through the arena center, telegraphed the same way as meteorShower - dodge
  // sideways off the line instead of just away from random points.
  meteorLine(boss, dt, player, projectiles, particles, arena, groundWarnings) {
    const n = 6;
    const dirAngle = Math.random() * Math.PI;
    const cx = arena.x + arena.w / 2, cy = arena.y + arena.h / 2;
    const spacing = 90;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      const tx = Utils.clamp(cx + Math.cos(dirAngle) * off, arena.x + 60, arena.x + arena.w - 60);
      const ty = Utils.clamp(cy + Math.sin(dirAngle) * off, arena.y + 60, arena.y + arena.h - 60);
      if (groundWarnings) groundWarnings.push({ x: tx, y: ty, radius: 65, life: 0.5, maxLife: 0.5, color: boss.color });
      projectiles.push(new Projectile({
        x: tx, y: ty - 260, vx: 0, vy: 620,
        radius: 11, dmg: 18 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 1.4,
        explosive: true, explosionRadius: 65
      }));
    }
    boss.phaseTimer = 2.6;
  },
  // Meteor-exclusive: many smaller, faster meteors centered on the player's
  // CURRENT position rather than random arena spots - denser, more localized
  // pressure that demands active movement instead of reading a wide spread.
  meteorRain(boss, dt, player, projectiles, particles, arena, groundWarnings) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const tx = Utils.clamp(player.x + Utils.randRange(-260, 260), arena.x + 60, arena.x + arena.w - 60);
      const ty = Utils.clamp(player.y + Utils.randRange(-260, 260), arena.y + 60, arena.y + arena.h - 60);
      if (groundWarnings) groundWarnings.push({ x: tx, y: ty, radius: 46, life: 0.38, maxLife: 0.38, color: boss.color });
      projectiles.push(new Projectile({
        x: tx, y: ty - 260, vx: 0, vy: 700,
        radius: 8, dmg: 12 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 1.3,
        explosive: true, explosionRadius: 46
      }));
    }
    boss.phaseTimer = 2.8;
  },
  // Cryo's signature nova - now actually applies the `chill` movement-slow it
  // always visually implied but never mechanically had (see Player.chillMult).
  freezeNova(boss, dt, player, projectiles, particles) {
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        radius: 6, dmg: 8 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 2.6,
        chill: { duration: 1.6, mult: 0.65 }
      }));
    }
    particles.burst(boss.x, boss.y, boss.color, 24, { speed: [50, 180], life: [0.4, 0.7] });
    boss.phaseTimer = 2.6;
  },
  // Cryo-exclusive: a few fast, piercing lances aimed directly at the player -
  // a precision poke to punish standing still, opposite of the omnidirectional nova.
  iceLance(boss, dt, player, projectiles) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const spread = (i - 1) * 0.18;
      const a = Utils.angleTo(boss.x, boss.y, player.x, player.y) + spread;
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
        radius: 7, dmg: 18 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 1.6,
        pierce: true, chill: { duration: 1.6, mult: 0.6 }
      }));
    }
    boss.phaseTimer = 1.8;
  },
  // Cryo-exclusive: two smaller, quick novas back to back (10 bullets each,
  // offset rotation) instead of one big one - a "double pulse" of chill.
  frostBurst(boss, dt, player, projectiles, particles) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + (boss.frostPulseOffset || 0);
      projectiles.push(new Projectile({
        x: boss.x, y: boss.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
        radius: 6, dmg: 7 * boss.dmgMult, color: boss.color, owner: 'enemy', life: 2.2,
        chill: { duration: 1.2, mult: 0.7 }
      }));
    }
    boss.frostPulseOffset = (boss.frostPulseOffset || 0) + Math.PI / 10;
    boss.frostPulses = (boss.frostPulses || 0) + 1;
    if (boss.frostPulses < 2) { boss.phaseTimer = 0.4; boss.attackIndex--; }
    else { boss.frostPulses = 0; boss.phaseTimer = 2.4; }
  }
};
