// ============================================================
// NEON REAPER - audio.js
// Tiny procedural sound engine (Web Audio API oscillators + noise).
// No audio files/assets needed - everything is synthesized, so it
// works identically in the zip build and the single-file preview.
// ============================================================
'use strict';

const AUDIO_PREFS_KEY = 'neonreaper_audio_prefs_v1';
function loadAudioPrefs() {
  const fallback = { musicMuted: false, sfxMuted: false };
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // JSON.parse succeeds on any valid JSON value, not just objects (e.g. a
    // stray "null"/"42"/"[]" left behind by a corrupted/foreign write to
    // this key) - Sfx/Music read straight off the returned object's fields
    // at module-load time, so a non-object here would throw before the
    // rest of this file (Music included) even finishes defining itself.
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? { ...fallback, ...parsed } : fallback;
  } catch (e) { return fallback; }
}
function saveAudioPrefs(prefs) {
  try { localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}

const Sfx = {
  ctx: null,
  master: null,
  enabled: true,
  muted: loadAudioPrefs().sfxMuted,
  baseGain: 0.4,

  init() {
    if (this.ctx || !this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.baseGain;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  // Fully halts ALL sound generation (Sfx *and* Music, which share this
  // AudioContext) - not just a gain-to-zero duck. Required by Yandex's
  // platform requirement "when focus is lost, sound from the game stops":
  // a duck still leaves oscillators/schedulers running underneath, this
  // actually stops the audio hardware from processing anything.
  suspendAll() {
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) {} }
  },
  resumeAll() {
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.baseGain;
    const prefs = loadAudioPrefs();
    prefs.sfxMuted = m;
    saveAudioPrefs(prefs);
  },

  // A short tone with a linear attack + exponential decay, optional pitch slide.
  tone(freq, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const { type = 'sine', duration = 0.12, gain = 0.25, freqEnd = null } = opts;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + duration + 0.02);
  },

  // Filtered white-noise burst - impacts, explosions, breaking walls.
  noise(opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const { duration = 0.15, gain = 0.25, filterFreq = 1800, filterType = 'lowpass' } = opts;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType; filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // ---- named game events ----
  shootLight() { this.tone(680, { type: 'square', duration: 0.06, gain: 0.16, freqEnd: 220 }); },
  shootHeavy() {
    this.tone(160, { type: 'sawtooth', duration: 0.16, gain: 0.26, freqEnd: 55 });
    this.noise({ duration: 0.08, gain: 0.14, filterFreq: 2200 });
  },
  melee() { this.noise({ duration: 0.08, gain: 0.2, filterFreq: 3200, filterType: 'highpass' }); },
  hit() { this.tone(150, { type: 'square', duration: 0.06, gain: 0.14, freqEnd: 60 }); },
  explosion() {
    this.noise({ duration: 0.4, gain: 0.32, filterFreq: 700 });
    this.tone(80, { type: 'sine', duration: 0.3, gain: 0.22, freqEnd: 28 });
  },
  dash() { this.tone(520, { type: 'sine', duration: 0.14, gain: 0.18, freqEnd: 1000 }); },
  pickup() {
    this.tone(500, { type: 'triangle', duration: 0.09, gain: 0.2, freqEnd: 900 });
    setTimeout(() => this.tone(760, { type: 'triangle', duration: 0.12, gain: 0.18, freqEnd: 1200 }), 70);
  },
  levelup() {
    this.tone(392, { type: 'triangle', duration: 0.12, gain: 0.2, freqEnd: 523 });
    setTimeout(() => this.tone(523, { type: 'triangle', duration: 0.18, gain: 0.2, freqEnd: 784 }), 90);
  },
  hurt() { this.tone(180, { type: 'sawtooth', duration: 0.13, gain: 0.22, freqEnd: 65 }); },
  death() {
    this.noise({ duration: 0.28, gain: 0.26, filterFreq: 900 });
    this.tone(120, { type: 'sawtooth', duration: 0.28, gain: 0.2, freqEnd: 40 });
  },
  bossDeath() {
    this.noise({ duration: 0.6, gain: 0.36, filterFreq: 500 });
    this.tone(60, { type: 'sawtooth', duration: 0.6, gain: 0.28, freqEnd: 20 });
  },
  wallBreak() { this.noise({ duration: 0.16, gain: 0.22, filterFreq: 1200 }); },
  uiClick() { this.tone(340, { type: 'square', duration: 0.05, gain: 0.13 }); },
  gameover() { this.tone(220, { type: 'sawtooth', duration: 0.5, gain: 0.22, freqEnd: 40 }); },
  checkpoint() { this.tone(600, { type: 'triangle', duration: 0.16, gain: 0.2, freqEnd: 900 }); }
};

// ============================================================
// Procedural background music.
// A tiny step-sequencer scheduled ahead of time on the same shared
// AudioContext as Sfx (the standard "lookahead scheduler" pattern) - no
// audio files, so it works identically in the zip build and the
// single-file preview. Three moods (menu / gameplay / boss) share one
// i-VI-III-VII minor progression and just change tempo, density and
// which layers play, so switching moods never causes a hard cut.
// ============================================================
const Music = {
  ctx: null, master: null, filter: null,
  playing: false, ducked: false,
  muted: loadAudioPrefs().musicMuted,
  mood: 'menu',
  bar: 0, step: 0, nextNoteTime: 0, timerId: null,
  lookahead: 25,          // ms between scheduler ticks
  scheduleAhead: 0.12,    // seconds of notes to queue ahead of "now"

  ROOT_FREQ: 110,                 // A2
  PROGRESSION: [0, -4, 3, -2],    // i - VI - III - VII, semitone offsets per bar

  MOODS: {
    menu:     { bpm: 84,  bass: 'sparse', lead: 'pad',  drums: false, gain: 0.12 },
    gameplay: { bpm: 128, bass: 'pulse',  lead: 'arp',  drums: true,  gain: 0.16 },
    boss:     { bpm: 150, bass: 'drive',  lead: 'arp2', drums: true,  gain: 0.2 }
  },

  init() {
    if (this.ctx || !Sfx.ctx) return; // shares Sfx's AudioContext - Sfx.init() must run first
    this.ctx = Sfx.ctx;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2200;
    this.master.connect(this.filter);
    this.filter.connect(this.ctx.destination);
  },

  start(mood) {
    this.init();
    if (!this.ctx || this.playing) return;
    this.mood = mood || this.mood;
    this.playing = true;
    this.bar = 0; this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this._rampTo(this._targetGain());
    this.timerId = setInterval(() => this._scheduler(), this.lookahead);
  },

  setMood(mood) {
    if (!this.MOODS[mood] || mood === this.mood) return;
    this.mood = mood;
    if (this.ctx) this._rampTo(this._targetGain());
  },

  duck(on) {
    this.ducked = on;
    if (!this.ctx) return;
    this._rampTo(this._targetGain());
  },

  setMuted(m) {
    this.muted = m;
    const prefs = loadAudioPrefs();
    prefs.musicMuted = m;
    saveAudioPrefs(prefs);
    if (this.ctx) this._rampTo(this._targetGain());
  },

  _targetGain() {
    return this.muted ? 0.0001 : this.MOODS[this.mood].gain * (this.ducked ? 0.35 : 1);
  },

  _rampTo(v, t = 0.9) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(Math.max(0.0001, v), now + t);
  },

  _stepSeconds() { return 60 / this.MOODS[this.mood].bpm / 4; },

  _scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      this._scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this._stepSeconds();
      this.step++;
      if (this.step >= 16) { this.step = 0; this.bar = (this.bar + 1) % this.PROGRESSION.length; }
    }
  },

  _freq(semitoneOffset, octave = 0) {
    return this.ROOT_FREQ * Math.pow(2, (semitoneOffset + octave * 12) / 12);
  },

  _scheduleStep(step, t) {
    const cfg = this.MOODS[this.mood];
    const root = this.PROGRESSION[this.bar];

    if (cfg.bass === 'sparse') {
      if (step === 0) this._tone(this._freq(root, -1), t, { type: 'sine', duration: 1.6, gain: 0.5 });
    } else if (cfg.bass === 'pulse') {
      if (step % 4 === 0) this._tone(this._freq(root, -1), t, { type: 'sawtooth', duration: 0.22, gain: 0.45 });
    } else if (cfg.bass === 'drive') {
      if (step % 2 === 0) this._tone(this._freq(root, -1), t, { type: 'sawtooth', duration: 0.14, gain: 0.5 });
    }

    const chord = [root, root + 3, root + 7]; // minor triad relative to this bar's root
    if (cfg.lead === 'pad') {
      if (step === 0) chord.forEach(s => this._tone(this._freq(s, 0), t, { type: 'sine', duration: 3.0, gain: 0.09 }));
    } else if (cfg.lead === 'arp') {
      if (step % 2 === 0) this._tone(this._freq(chord[(step / 2) % chord.length], 1), t, { type: 'triangle', duration: 0.18, gain: 0.14 });
    } else if (cfg.lead === 'arp2') {
      this._tone(this._freq(chord[step % chord.length], 1), t, { type: 'triangle', duration: 0.11, gain: 0.15 });
    }

    if (cfg.drums) {
      if (step === 0 || step === 8) this._kick(t);
      if (step % 4 === 2) this._hat(t);
    }
  },

  _tone(freq, t, opts) {
    const { type = 'sine', duration = 0.2, gain = 0.2 } = opts;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + duration + 0.05);
  },

  _kick(t) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);
  },

  _hat(t) {
    const size = Math.max(1, Math.floor(this.ctx.sampleRate * 0.05));
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }
};
