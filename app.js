/* =============================================================
   ClassFish – app.js
   Full-screen canvas recitation picker with Glassmorphism UI
   ============================================================= */

'use strict';

// ─────────────────────────────────────────────
//  CONSTANTS & CONFIG
// ─────────────────────────────────────────────
const ASSET_PATHS = {
  fish1: './assets/fish_shape1.svg',
  fish2: './assets/fish_shape2.svg',
  fish3: './assets/fish_shape3.svg',
  base: './assets/shooter_base.svg',
  hook: './assets/hook.svg',
};

const FISH_W = 120;
const FISH_H = 72;
const BASE_W = 90;
const BASE_H = 70;
const HOOK_W = 34;
const HOOK_H = 50;

// All movement speeds are in px/ms so they scale correctly with real dt
let   FISH_SPEED_NORMAL = 0.062;  // ~62 px/s — mutable via slider
const FISH_SPEED_SCARE  = 0.30;   // ~300 px/s — scare burst
let   FISH_SPEED_EVADE  = 0.44;   // ~440 px/s — mutable via Dodge slider (smooth, visible sidestep)
const SCARE_DURATION    = 2000;   // ms
const BOB_AMP = 6;      // px
const BOB_FREQ = 0.0015; // rad/ms — gentle bob cycle

const BASE_MOVE_SPEED = 0.32;   // px/ms
const HOOK_SWING_AMP = Math.PI / 4;   // 45°
const HOOK_SWING_FREQ = 0.0016;        // rad/ms — relaxed swing
const HOOK_FIRE_SPEED = 0.44;   // px/ms — smooth, deliberate throw reaching the topmost tank
const HOOK_RETRACT_SPEED_EMPTY = 0.85;  // px/ms — snappier return when hook returns empty
const HOOK_RETRACT_SPEED_CAUGHT = 0.38; // px/ms — brisk yet weighted reeling when dragging a caught fish
const HOOK_MAX_LENGTH = 3500;   // px — ensures hook reaches the topmost tank at any angle

const BUBBLE_COUNT = 30;

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const tankSelect = document.getElementById('tankSelect');
const addTankBtn = document.getElementById('addTankBtn');
const studentInput = document.getElementById('studentInput');
const saveTankBtn = document.getElementById('saveTankBtn');
const studentList = document.getElementById('studentList');
const studentCount = document.getElementById('studentCount');
const showNamesChk = document.getElementById('showNames');
const soundToggle = document.getElementById('soundToggle');
const soundLabel = document.getElementById('soundLabel');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const shuffleBtn = document.getElementById('shuffleBtn');
const caughtCount = document.getElementById('caughtCount');
const remainingCount = document.getElementById('remainingCount');
const loadingScreen = document.getElementById('loadingScreen');

const catchModal = document.getElementById('catchModal');
const modalName = document.getElementById('modalName');
const modalHookBtn = document.getElementById('modalHookAgainBtn');
const modalFishPreview = document.getElementById('modalFishPreview');

const addTankModal = document.getElementById('addTankModal');
const newTankName = document.getElementById('newTankName');
const confirmAddTank = document.getElementById('confirmAddTank');
const cancelAddTank = document.getElementById('cancelAddTank');

const fishSpeedSlider = document.getElementById('fishSpeedSlider');
const fishSpeedValue = document.getElementById('fishSpeedValue');
const dodgeSpeedSlider = document.getElementById('dodgeSpeedSlider');
const dodgeSpeedValue = document.getElementById('dodgeSpeedValue');
const swingSpeedSlider = document.getElementById('swingSpeedSlider');
const swingSpeedValue = document.getElementById('swingSpeedValue');
const autoPanChk = document.getElementById('autoPan');
const autoPanControls = document.getElementById('autoPanControls');
const autoPanSpeedSlider = document.getElementById('autoPanSpeedSlider');
const autoPanSpeedValue = document.getElementById('autoPanSpeedValue');
const controlBar = document.getElementById('controlBar');
const controlBarToggleBtn = document.getElementById('controlBarToggleBtn');

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const assets = {};          // loaded HTMLImageElement objects
let fishes = [];          // Fish instances currently in the canvas
let bubbles = [];
let trailBubbles = [];
let splashes = [];         // Catch sparkle / splash particles
let rafId = null;
let paused = false;

let zoom = 1.0;
let showNames = true;
let scareEndTime = 0;

let caughtTotal = 0;
let activeTank = 'Lily';
let tankData = {};

// Hook swing speed — mutable via slider
let hookSwingFreq = HOOK_SWING_FREQ; // rad/ms

// Auto-pan state
let autoPan = false;
let autoPanSpeed = 0.18;  // px/ms
let autoPanDir = 1;     // 1 = right, -1 = left

// Hook / base state
const shooter = {
  x: 0,
  y: 0,
  angle: 0,
  swingDir: 1,
  state: 'idle',  // 'idle' | 'firing' | 'retracting'
  hookX: 0,
  hookY: 0,
  hookAngle: -Math.PI / 2,
  lineLength: 0,
  caughtFish: null,
  // Enhanced physics & dynamic trajectory bending
  flightTime: 0,
  launchOriginX: 0,
  launchOriginY: 0,
  launchVx: 0,
  curveSign: 1,
  curveBias: 0,
  swayPhase: 0,
  prevX: 0,
  ropeSagX: 0,
};

const keys = { left: false, right: false };
let prevTime = 0;

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────
function hsl(h, s = 70, l = 60) {
  return `hsl(${h},${s}%,${l}%)`;
}

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

function randInt(a, b) {
  return Math.floor(randBetween(a, b));
}

function getTankWidth() {
  const sidebar = document.getElementById('sidebar');
  const sidebarWidth = sidebar ? sidebar.offsetWidth : 360;
  return Math.max(300, window.innerWidth - sidebarWidth - 32);
}

function getVisibleBounds() {
  const z = Math.max(1.0, zoom);
  const w = canvas.width || 800;
  const h = canvas.height || 600;
  const viewWidth = w / z;
  const viewHeight = h / z;
  const left = (w - viewWidth) / 2;
  const right = left + viewWidth;
  const bottom = h;
  const top = h - viewHeight;
  return { left, right, top, bottom, width: viewWidth, height: viewHeight };
}

function getFishSwimBounds() {
  const b = getVisibleBounds();
  const minX = b.left + FISH_W / 2;
  const maxX = b.right - FISH_W / 2;
  const minY = b.top + FISH_H / 2 + 20; // Uppermost tank area (plenty of room for fish & name label)
  const maxY = b.top + b.height * 0.52; // Around the middle of the tank (keeps bottom 48% clear)
  return { minX, maxX, minY, maxY, b };
}

// ─────────────────────────────────────────────
//  CINEMATIC CAMERA SYSTEM
// ─────────────────────────────────────────────
const camera = {
  mode: 'normal',       // 'normal' | 'tracking' | 'restoring'
  zoom: 1.0,
  targetZoom: 1.0,
  x: 0,                 // world focus x
  y: 0,                 // world focus y
  targetX: 0,
  targetY: 0,
  screenX: 0,           // screen anchor x
  screenY: 0,           // screen anchor y
  targetScreenX: 0,
  targetScreenY: 0,
  trackElapsed: 0,
  restoreTimer: 0,
};

function resetCamera() {
  const cw = canvas.width || 800;
  const ch = canvas.height || 600;
  camera.mode = 'normal';
  camera.zoom = Math.max(1.0, zoom);
  camera.targetZoom = camera.zoom;
  camera.x = cw / 2;
  camera.y = ch;
  camera.targetX = camera.x;
  camera.targetY = camera.y;
  camera.screenX = cw / 2;
  camera.screenY = ch;
  camera.targetScreenX = camera.screenX;
  camera.targetScreenY = camera.screenY;
  camera.trackElapsed = 0;
  camera.restoreTimer = 0;
}

function startCatchCamera(fish) {
  camera.mode = 'tracking';
  camera.trackElapsed = 0;
  camera.restoreTimer = 0;
  // Reduced zoom factor — just zoom in a bit (+18% to +22% zoom)
  camera.targetZoom = Math.min(2.4, Math.max(1.22, zoom * 1.18));
  camera.targetScreenX = (canvas.width || 800) / 2;
  camera.targetScreenY = (canvas.height || 600) * 0.45;
}

function updateCamera(dt) {
  const cw = canvas.width || 800;
  const ch = canvas.height || 600;

  if (camera.mode === 'normal') {
    camera.zoom = Math.max(1.0, zoom);
    camera.targetZoom = camera.zoom;
    camera.x = cw / 2;
    camera.y = ch;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    camera.screenX = cw / 2;
    camera.screenY = ch;
    camera.targetScreenX = camera.screenX;
    camera.targetScreenY = camera.screenY;
    return;
  }

  const b = getVisibleBounds();

  if (camera.mode === 'tracking') {
    camera.trackElapsed += dt;
    // Keep subtle, reduced zoom factor
    camera.targetZoom = Math.min(2.4, Math.max(1.22, zoom * 1.18));
    camera.targetScreenX = cw / 2;
    camera.targetScreenY = ch * 0.45;

    // Follow the hooked fish / anchor
    let tx = shooter.hookX;
    let ty = shooter.hookY;

    // Clamp camera target so viewport stays within the active tank boundaries
    const curZ = camera.zoom || 1.0;
    const minTargetX = b.left + camera.targetScreenX / curZ;
    const maxTargetX = b.right - (cw - camera.targetScreenX) / curZ;
    if (minTargetX <= maxTargetX) {
      tx = Math.max(minTargetX, Math.min(maxTargetX, tx));
    } else {
      tx = (b.left + b.right) / 2;
    }

    const minTargetY = b.top + camera.targetScreenY / curZ;
    const maxTargetY = b.bottom - (ch - camera.targetScreenY) / curZ;
    if (minTargetY <= maxTargetY) {
      ty = Math.max(minTargetY, Math.min(maxTargetY, ty));
    } else {
      ty = (b.top + b.bottom) / 2;
    }

    camera.targetX = tx;
    camera.targetY = ty;
  } else if (camera.mode === 'restoring') {
    camera.restoreTimer += dt;
    camera.targetZoom = Math.max(1.0, zoom);
    camera.targetX = cw / 2;
    camera.targetY = ch;
    camera.targetScreenX = cw / 2;
    camera.targetScreenY = ch;
  }

  // Slower, smooth and graceful cinematic camera transition
  const lerpFactor = 1 - Math.exp(-dt * 0.0038);
  camera.zoom += (camera.targetZoom - camera.zoom) * lerpFactor;
  camera.x += (camera.targetX - camera.x) * lerpFactor;
  camera.y += (camera.targetY - camera.y) * lerpFactor;
  camera.screenX += (camera.targetScreenX - camera.screenX) * lerpFactor;
  camera.screenY += (camera.targetScreenY - camera.screenY) * lerpFactor;

  // Check if restoring is completed
  if (camera.mode === 'restoring') {
    const zoomDiff = Math.abs(camera.zoom - camera.targetZoom);
    const distPos = Math.hypot(camera.x - camera.targetX, camera.y - camera.targetY);
    const distScreen = Math.hypot(camera.screenX - camera.targetScreenX, camera.screenY - camera.targetScreenY);

    if (camera.restoreTimer >= 680 || (zoomDiff < 0.012 && distPos < 3 && distScreen < 3)) {
      resetCamera();
      if (shooter.caughtFish) {
        paused = true;
        showCatchModal(shooter.caughtFish);
      }
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

// ─────────────────────────────────────────────
//  ASSET LOADER
// ─────────────────────────────────────────────
async function loadAllAssets() {
  const keys = Object.keys(ASSET_PATHS);
  const imgs = await Promise.all(keys.map(k => loadImage(ASSET_PATHS[k])));
  keys.forEach((k, i) => { assets[k] = imgs[i]; });
}

// ─────────────────────────────────────────────
//  WEB AUDIO API SYNTHESIZER (BGM & SFX)
// ─────────────────────────────────────────────
let audioCtx = null;
let bgmMasterGain = null;
let sfxMasterGain = null;
let soundEnabled = true;
let bgmInitialized = false;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = new AudioContextClass();

  // Master Gain for SFX
  sfxMasterGain = audioCtx.createGain();
  sfxMasterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
  sfxMasterGain.connect(audioCtx.destination);

  // Master Gain for BGM
  bgmMasterGain = audioCtx.createGain();
  bgmMasterGain.gain.setValueAtTime(soundEnabled ? 0.28 : 0.0001, audioCtx.currentTime);
  bgmMasterGain.connect(audioCtx.destination);

  initBgmSynth();
}

function resumeAudioContext() {
  if (!audioCtx) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function isSoundEnabled() {
  return soundEnabled && !!audioCtx;
}

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (soundToggle) soundToggle.checked = enabled;
  if (soundLabel) soundLabel.textContent = enabled ? '🔊 Sound & Music' : '🔇 Sound Muted';

  if (!enabled) {
    if (bgmMasterGain && audioCtx) {
      bgmMasterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.15);
    }
  } else {
    resumeAudioContext();
    if (bgmMasterGain && audioCtx) {
      bgmMasterGain.gain.setTargetAtTime(0.28, audioCtx.currentTime, 0.4);
    }
  }
  saveSettings();
}

// ── Continuous Ambient BGM Synthesizer (Underwater Vibe) ──
function initBgmSynth() {
  if (bgmInitialized || !audioCtx) return;
  bgmInitialized = true;

  try {
    const sampleRate = audioCtx.sampleRate || 44100;
    const bufferLength = sampleRate * 5; // 5 seconds of brown noise
    const noiseBuffer = audioCtx.createBuffer(2, bufferLength, sampleRate);

    // Deep ocean brown noise synthesis
    for (let ch = 0; ch < 2; ch++) {
      const data = noiseBuffer.getChannelData(ch);
      let lastVal = 0.0;
      for (let i = 0; i < bufferLength; i++) {
        const white = Math.random() * 2 - 1;
        lastVal = (lastVal + (0.02 * white)) / 1.02;
        data[i] = lastVal * 3.5;
      }
      // Circular crossfade to guarantee seamless looping with zero pop
      const fadeLen = Math.floor(sampleRate * 0.12);
      for (let i = 0; i < fadeLen; i++) {
        const t = i / fadeLen;
        data[i] = data[i] * t + data[bufferLength - fadeLen + i] * (1 - t);
      }
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // BiquadFilterNode (lowpass filter around 400Hz)
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(400, audioCtx.currentTime);
    lowpass.Q.setValueAtTime(1.5, audioCtx.currentTime);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.55, audioCtx.currentTime);

    // Deep water pressure swell oscillator (~100Hz sine wave)
    const swellOsc = audioCtx.createOscillator();
    swellOsc.type = 'sine';
    swellOsc.frequency.setValueAtTime(96, audioCtx.currentTime);

    const swellGain = audioCtx.createGain();
    swellGain.gain.setValueAtTime(0.065, audioCtx.currentTime);

    // Very slow LFO modulating volume in and out to simulate water pressure and rolling waves
    const swellLfo = audioCtx.createOscillator();
    swellLfo.type = 'sine';
    swellLfo.frequency.setValueAtTime(0.14, audioCtx.currentTime); // ~7.1s wave swell

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(0.045, audioCtx.currentTime);

    swellLfo.connect(lfoGain);
    lfoGain.connect(swellGain.gain);

    // Swell LFO also gently shifts lowpass filter frequency (320Hz - 480Hz) for rolling tide
    const filterLfoGain = audioCtx.createGain();
    filterLfoGain.gain.setValueAtTime(80, audioCtx.currentTime);
    swellLfo.connect(filterLfoGain);
    filterLfoGain.connect(lowpass.frequency);

    // Route connections
    noiseSource.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(bgmMasterGain);

    swellOsc.connect(swellGain);
    swellGain.connect(bgmMasterGain);

    // Start continuous loops
    noiseSource.start(0);
    swellOsc.start(0);
    swellLfo.start(0);
  } catch (err) {
    console.warn('BGM synth initialization failed:', err);
  }
}

// ── SFX Generators ──

// 1. Hook shoot sound: quick plop / whoosh (sine rapidly dropping 600Hz -> 100Hz over 0.2s)
function playShootSound() {
  if (!isSoundEnabled()) return;
  resumeAudioContext();
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

    osc.connect(gain);
    gain.connect(sfxMasterGain);

    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) {
    console.warn(e);
  }
}

// 2. Hook reel ticking / whirring sound: rapid short low-volume square wave blips
function playReelSound() {
  if (!isSoundEnabled()) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    const baseFreq = randBetween(440, 520);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.022);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(sfxMasterGain);

    osc.start(now);
    osc.stop(now + 0.026);
  } catch (e) {
    console.warn(e);
  }
}

// 3. Catch victory chime: cheerful major chord arpeggio (C5, E5, G5, C6)
function playCatchSound() {
  if (!isSoundEnabled()) return;
  resumeAudioContext();
  try {
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.065;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.24, noteTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

      osc.connect(gain);
      gain.connect(sfxMasterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.48);
    });
  } catch (e) {
    console.warn(e);
  }
}

// 4. Soft pleasant pop for UI interactions: short sine wave (~800Hz) with fast decay (0.05s)
function playClickSound() {
  if (!isSoundEnabled()) return;
  resumeAudioContext();
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(sfxMasterGain);

    osc.start(now);
    osc.stop(now + 0.052);
  } catch (e) {
    console.warn(e);
  }
}

// 5. Cheer & applause sound: celebration crowd clap burst + cheerful vocal whoops + fanfare chord
function playCheerSound() {
  if (!isSoundEnabled()) return;
  resumeAudioContext();
  try {
    const now = audioCtx.currentTime;
    const sampleRate = audioCtx.sampleRate || 44100;
    const dur = 1.7; // ~1.7s celebration
    const len = Math.floor(sampleRate * dur);

    // ── Synthesize organic handclap burst buffer ──
    const clapBuffer = audioCtx.createBuffer(2, len, sampleRate);
    const left = clapBuffer.getChannelData(0);
    const right = clapBuffer.getChannelData(1);

    // Generate ~50 individual handclaps distributed naturally
    const numClaps = 54;
    for (let c = 0; c < numClaps; c++) {
      // Claps swell up quickly around 0.03s-0.5s and taper off toward 1.5s
      const startT = 0.03 + Math.pow(Math.random(), 1.35) * 1.35;
      const startIdx = Math.floor(startT * sampleRate);
      const clapLen = Math.floor(sampleRate * (0.018 + Math.random() * 0.022));
      const pan = Math.random(); // stereo position
      const overallFade = Math.exp(-startT * 0.95);
      const amp = (0.22 + Math.random() * 0.38) * overallFade;

      for (let i = 0; i < clapLen && startIdx + i < len; i++) {
        // Multi-tap impact envelope mimicking palm & finger contact
        const env = Math.exp(-i / (sampleRate * 0.0055));
        const noise = (Math.random() * 2 - 1) * env * amp;
        left[startIdx + i] += noise * (1.2 - pan * 0.7);
        right[startIdx + i] += noise * (0.5 + pan * 0.7);
      }
    }

    // Play clap buffer through a bandpass filter (1180Hz) to give crisp handclap acoustics
    const clapSource = audioCtx.createBufferSource();
    clapSource.buffer = clapBuffer;

    const clapFilter = audioCtx.createBiquadFilter();
    clapFilter.type = 'bandpass';
    clapFilter.frequency.setValueAtTime(1180, now);
    clapFilter.Q.setValueAtTime(1.4, now);

    const clapGain = audioCtx.createGain();
    clapGain.gain.setValueAtTime(0.001, now);
    clapGain.gain.linearRampToValueAtTime(0.40, now + 0.08);
    clapGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    clapSource.connect(clapFilter);
    clapFilter.connect(clapGain);
    clapGain.connect(sfxMasterGain);

    clapSource.start(now);
    clapSource.stop(now + dur + 0.05);

    // ── Layered joyful crowd cheer whoops ("Yay!" / "Woo-hoo!") ──
    const cheerVoices = [
      { startF: 360, peakF: 680, endF: 520, delay: 0.04, dur: 0.75, vol: 0.09 },
      { startF: 480, peakF: 860, endF: 660, delay: 0.09, dur: 0.85, vol: 0.08 },
      { startF: 280, peakF: 490, endF: 380, delay: 0.06, dur: 0.70, vol: 0.065 }
    ];

    cheerVoices.forEach(v => {
      const vTime = now + v.delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(v.startF, vTime);
      osc.frequency.exponentialRampToValueAtTime(v.peakF, vTime + v.dur * 0.38);
      osc.frequency.exponentialRampToValueAtTime(v.endF, vTime + v.dur);

      gain.gain.setValueAtTime(0.001, vTime);
      gain.gain.linearRampToValueAtTime(v.vol, vTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, vTime + v.dur);

      osc.connect(gain);
      gain.connect(sfxMasterGain);

      osc.start(vTime);
      osc.stop(vTime + v.dur + 0.02);
    });

    // ── Celebratory chime / fanfare chords (C5, G5, C6, E6) ringing above the applause ──
    const fanfareNotes = [
      { f: 523.25, t: 0.00, dur: 0.65, vol: 0.16 }, // C5
      { f: 659.25, t: 0.06, dur: 0.60, vol: 0.15 }, // E5
      { f: 783.99, t: 0.12, dur: 0.70, vol: 0.18 }, // G5
      { f: 1046.50, t: 0.18, dur: 1.05, vol: 0.22 }, // C6
      { f: 1318.51, t: 0.24, dur: 1.20, vol: 0.18 }, // E6
    ];

    fanfareNotes.forEach(note => {
      const nTime = now + note.t;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, nTime);

      gain.gain.setValueAtTime(0.001, nTime);
      gain.gain.linearRampToValueAtTime(note.vol, nTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, nTime + note.dur);

      osc.connect(gain);
      gain.connect(sfxMasterGain);

      osc.start(nTime);
      osc.stop(nTime + note.dur + 0.02);
    });

  } catch (err) {
    console.warn('Cheer sound playback failed:', err);
  }
}

// ─────────────────────────────────────────────
//  LOCAL STORAGE
// ─────────────────────────────────────────────
const LS_TANK_KEY = 'classfish_tanks';
const LS_ACTIVE_KEY = 'classfish_activeTank';
const LS_CAUGHT_KEY = 'classfish_caught';
const LS_SETTINGS_KEY = 'classfish_settings';

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_TANK_KEY);
    tankData = raw ? JSON.parse(raw) : {};
  } catch { tankData = {}; }

  // Ensure defaults
  if (!tankData['Lily']) tankData['Lily'] = [];
  if (!tankData['Orchid']) tankData['Orchid'] = [];

  const saved = localStorage.getItem(LS_ACTIVE_KEY);
  activeTank = saved || 'Lily';

  try {
    caughtTotal = parseInt(localStorage.getItem(LS_CAUGHT_KEY) || '0', 10);
  } catch { caughtTotal = 0; }
}

function saveToStorage() {
  localStorage.setItem(LS_TANK_KEY, JSON.stringify(tankData));
  localStorage.setItem(LS_ACTIVE_KEY, activeTank);
  localStorage.setItem(LS_CAUGHT_KEY, String(caughtTotal));
}

function saveSettings() {
  try {
    const bar = document.getElementById('controlBar');
    const settings = {
      showNames: showNamesChk ? showNamesChk.checked : true,
      zoom: zoomSlider ? parseFloat(zoomSlider.value) : 1.0,
      fishSpeed: fishSpeedSlider ? parseFloat(fishSpeedSlider.value) : 4,
      dodgeSpeed: dodgeSpeedSlider ? parseFloat(dodgeSpeedSlider.value) : 4,
      swingSpeed: swingSpeedSlider ? parseFloat(swingSpeedSlider.value) : 4,
      autoPan: autoPanChk ? autoPanChk.checked : false,
      autoPanSpeed: autoPanSpeedSlider ? parseFloat(autoPanSpeedSlider.value) : 3,
      controlBarHidden: bar ? bar.classList.contains('bar-hidden') : false,
      soundEnabled: soundEnabled,
    };
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    // 1. Show names
    if (typeof s.showNames === 'boolean' && showNamesChk) {
      showNames = s.showNames;
      showNamesChk.checked = s.showNames;
    }

    // 2. Zoom
    if (typeof s.zoom === 'number' && zoomSlider && zoomValue) {
      zoom = s.zoom;
      zoomSlider.value = String(s.zoom);
      zoomValue.textContent = zoom.toFixed(1) + '×';
    }

    // 3. Fish Swim Speed (1-10)
    if (typeof s.fishSpeed === 'number' && fishSpeedSlider && fishSpeedValue) {
      fishSpeedSlider.value = String(s.fishSpeed);
      fishSpeedValue.textContent = String(s.fishSpeed);
      const t = (s.fishSpeed - 1) / 9;
      FISH_SPEED_NORMAL = 0.02 + t * 0.126;
    }

    // 4. Fish Dodge Speed (1-10)
    if (typeof s.dodgeSpeed === 'number' && dodgeSpeedSlider && dodgeSpeedValue) {
      dodgeSpeedSlider.value = String(s.dodgeSpeed);
      dodgeSpeedValue.textContent = String(s.dodgeSpeed);
      const t = (s.dodgeSpeed - 1) / 9;
      FISH_SPEED_EVADE = 0.18 + t * 0.67;
    }

    // 5. Hook Swing Speed (1-10)
    if (typeof s.swingSpeed === 'number' && swingSpeedSlider && swingSpeedValue) {
      swingSpeedSlider.value = String(s.swingSpeed);
      swingSpeedValue.textContent = String(s.swingSpeed);
      const t = (s.swingSpeed - 1) / 9;
      hookSwingFreq = 0.0004 + t * 0.0041;
    }

    // 6. Auto-Pan Base
    if (typeof s.autoPan === 'boolean' && autoPanChk) {
      autoPan = s.autoPan;
      autoPanChk.checked = s.autoPan;
      if (autoPanControls) autoPanControls.classList.toggle('hidden', !autoPan);
    }

    // 7. Auto-Pan Speed (1-10)
    if (typeof s.autoPanSpeed === 'number' && autoPanSpeedSlider && autoPanSpeedValue) {
      autoPanSpeedSlider.value = String(s.autoPanSpeed);
      autoPanSpeedValue.textContent = String(s.autoPanSpeed);
      const t = (s.autoPanSpeed - 1) / 9;
      autoPanSpeed = 0.08 + t * 0.47;
    }

    // 8. Control Bar Hidden
    if (typeof s.controlBarHidden === 'boolean') {
      const bar = document.getElementById('controlBar');
      const btn = document.getElementById('controlBarToggleBtn');
      if (bar) bar.classList.toggle('bar-hidden', s.controlBarHidden);
      if (btn) btn.textContent = s.controlBarHidden ? '⌨️ Show Controls' : '⌨️ Hide Controls';
    }

    // 9. Sound Effects & BGM
    if (typeof s.soundEnabled === 'boolean') {
      soundEnabled = s.soundEnabled;
      if (soundToggle) soundToggle.checked = soundEnabled;
      if (soundLabel) soundLabel.textContent = soundEnabled ? '🔊 Sound & Music' : '🔇 Sound Muted';
    }
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

// ─────────────────────────────────────────────
//  TANK SELECTOR UI
// ─────────────────────────────────────────────
function rebuildTankSelector() {
  // Clear all options first
  tankSelect.innerHTML = '';
  const names = Object.keys(tankData);
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `Tank ${name}`;
    tankSelect.appendChild(opt);
  });
  tankSelect.value = activeTank;
}

// ─────────────────────────────────────────────
//  FISH CLASS
// ─────────────────────────────────────────────
class Fish {
  /**
   * @param {string} name
   * @param {number} hue        - 0-360 hue rotation
   * @param {string} shapeKey   - 'fish1' | 'fish2' | 'fish3'
   * @param {number} [sat=2.2]  - CSS saturate() multiplier
   * @param {number} [lit=1.1]  - CSS brightness() multiplier
   */
  constructor(name, hue, shapeKey, sat = 2.2, lit = 1.1) {
    this.name = name;
    this.hue = hue;
    this.shapeKey = shapeKey;
    this.sat = sat;
    this.lit = lit;
    this.absent = false;
    this.removed = false;

    // Evasion personality — each fish has an individual skill (0.25–1.0)
    this.evasionSkill = randBetween(0.82, 1.0); // very high chance to dodge
    this.evading = false;
    this.evadeWaypointSet = false;

    // Pre-render both orientations once — avoids per-frame ctx.filter
    this._buildOffscreen();

    this.reset();
  }

  _buildOffscreen() {
    const img = assets[this.shapeKey];
    const filter = `hue-rotate(${this.hue}deg) saturate(${this.sat}) brightness(${this.lit})`;

    // Left-facing: original SVG assets naturally point to the left
    this.ocLeft = document.createElement('canvas');
    this.ocLeft.width = FISH_W;
    this.ocLeft.height = FISH_H;
    const lCtx = this.ocLeft.getContext('2d');
    lCtx.filter = filter;
    lCtx.drawImage(img, 0, 0, FISH_W, FISH_H);

    // Right-facing: horizontally flipped so snout points to the right
    this.ocRight = document.createElement('canvas');
    this.ocRight.width = FISH_W;
    this.ocRight.height = FISH_H;
    const rCtx = this.ocRight.getContext('2d');
    rCtx.filter = filter;
    rCtx.translate(FISH_W, 0);
    rCtx.scale(-1, 1);
    rCtx.drawImage(img, 0, 0, FISH_W, FISH_H);
  }

  reset() {
    const sb = getFishSwimBounds();
    this.x = randBetween(sb.minX, sb.maxX);
    this.y = randBetween(sb.minY, sb.maxY);
    this.trail = [];
    this.trailTimer = 0;
    this.setWaypoint();
    this.speedMult = 1;
    this.bobOffset = Math.random() * Math.PI * 2;
    this.facingLeft = this.wx < this.x;
    this.opacity = 1;
    this.caught = false;
  }

  setWaypoint() {
    const sb = getFishSwimBounds();
    this.wx = randBetween(sb.minX, sb.maxX);
    this.wy = randBetween(sb.minY, sb.maxY);
    if (this.wx < this.x - 2) {
      this.facingLeft = true;
    } else if (this.wx > this.x + 2) {
      this.facingLeft = false;
    }
  }

  update(dt, now) {
    if (this.caught || this.absent || this.removed) return;

    // ── Evasion AI ─────────────────────────────────────────
    if (shooter.state === 'firing') {
      const hdx = shooter.hookX - this.x;
      const hdy = shooter.hookY - this.y;
      const hdist = Math.hypot(hdx, hdy);

      // Detection radius: hook needs to approach reasonably close
      const alertMult = 1 + (1 - this.y / canvas.height) * 0.5;
      const evadeRadius = 125 * alertMult;

      if (hdist < evadeRadius && !this.evadeWaypointSet) {
        // Each fish rolls its own evasion check once per shot
        if (Math.random() < this.evasionSkill) {
          this.evading = true;
          this.evadeWaypointSet = true;
          // Sidestep away from the hook horizontally (within upper-to-middle swim zone)
          const sb = getFishSwimBounds();
          const sideDir = this.x >= shooter.hookX ? 1 : -1;
          const fleeX = this.x + sideDir * 170;
          const fleeY = this.y + randBetween(-12, 12); // subtle vertical jitter
          this.wx = Math.max(sb.minX, Math.min(sb.maxX, fleeX));
          this.wy = Math.max(sb.minY, Math.min(sb.maxY, fleeY));
          this.facingLeft = sideDir === -1;
        }
      }
    } else {
      // Hook retracted — reset evasion for next shot
      if (this.evading) {
        this.evading = false;
        this.setWaypoint();
      }
      this.evadeWaypointSet = false;
    }
    // ───────────────────────────────────────────────────────

    // Dedicated speed resolution:
    // 1. Evasion dodge speed is strictly fixed (FISH_SPEED_EVADE), independent of the swim speed slider
    // 2. Scare burst runs at FISH_SPEED_SCARE
    // 3. Normal swimming uses the adjustable FISH_SPEED_NORMAL
    let speed = FISH_SPEED_NORMAL;
    if (this.evading) {
      speed = FISH_SPEED_EVADE;
    } else if (now < scareEndTime) {
      speed = FISH_SPEED_SCARE;
    }
    const dx = this.wx - this.x;
    const dy = this.wy - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
      if (!this.evading) this.setWaypoint();
    } else {
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      const bob = Math.sin(now * BOB_FREQ + this.bobOffset) * BOB_AMP;

      // Flip 2D sprite based on swimming direction: snout always leads!
      if (dx < -1.5) this.facingLeft = true;
      else if (dx > 1.5) this.facingLeft = false;

      this.x = this.x + vx * dt;
      this.y = this.y + vy * dt + bob * 0.04;

      // Emit subtle bioluminescent swim trail particle behind tail
      this.trailTimer = (this.trailTimer || 0) + dt;
      if (this.trailTimer >= 45) {
        this.trailTimer = 0;
        const tailX = this.facingLeft ? (this.x + FISH_W * 0.36) : (this.x - FISH_W * 0.36);
        const tailY = this.y + bob + randBetween(-3, 3);
        this.trail.push({
          x: tailX,
          y: tailY,
          r: randBetween(2.5, 4.5),
          alpha: randBetween(0.32, 0.48),
          life: 1.0,
          driftX: (this.facingLeft ? 1 : -1) * randBetween(0.005, 0.015),
          driftY: randBetween(-0.012, 0.006),
          hue: this.hue,
        });
        if (this.trail.length > 18) {
          this.trail.shift();
        }
      }
    }

    // Update trail particles
    if (this.trail && this.trail.length > 0) {
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const p = this.trail[i];
        p.life -= dt / 650;
        p.x += p.driftX * dt;
        p.y += p.driftY * dt;
        if (p.life <= 0) {
          this.trail.splice(i, 1);
        }
      }
    }

    const sb = getFishSwimBounds();
    // Portal wrap within visible zoomed tank area
    if (this.x < sb.b.left - FISH_W * 0.6) this.x = sb.b.right + FISH_W * 0.4;
    if (this.x > sb.b.right + FISH_W * 0.6) this.x = sb.b.left - FISH_W * 0.4;
    // Vertical clamp: fish stay in upper most area down to around middle of tank
    this.y = Math.max(sb.minY, Math.min(sb.maxY, this.y));
  }

  // Draw delicate bioluminescent swim trail wake behind fish
  drawTrail() {
    if (this.removed || this.absent || this.caught || !this.trail || this.trail.length === 0) return;
    for (const p of this.trail) {
      if (p.life <= 0) continue;
      const curR = p.r * (0.5 + p.life * 0.5);
      const curAlpha = p.alpha * p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, curR, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 95%, 72%, ${curAlpha})`;
      ctx.shadowColor = `hsl(${p.hue}, 95%, 70%)`;
      ctx.shadowBlur = 6 * p.life;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  draw(now) {
    if (this.removed || this.absent || this.caught) return;

    const bob = Math.sin(now * BOB_FREQ + this.bobOffset) * BOB_AMP;
    const drawY = this.y + bob;
    // Flipped sprite: ocLeft points left, ocRight points right
    const oc = this.facingLeft ? this.ocLeft : this.ocRight;

    // 1. Soft bioluminescent radial aura behind the fish
    const glowRadius = FISH_W * 0.44;
    const auraGrad = ctx.createRadialGradient(this.x, drawY, glowRadius * 0.15, this.x, drawY, glowRadius);
    auraGrad.addColorStop(0, `hsla(${this.hue}, 90%, 65%, 0.22)`);
    auraGrad.addColorStop(0.55, `hsla(${this.hue}, 85%, 55%, 0.08)`);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(this.x, drawY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw fish sprite with luminous edge glow
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.shadowColor = `hsl(${this.hue}, 95%, 70%)`;
    ctx.shadowBlur = 10;
    ctx.drawImage(oc, this.x - FISH_W / 2, drawY - FISH_H / 2, FISH_W, FISH_H);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 3. Name label — always upright, styled with luminous tag
    if (showNames) {
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const nameText = this.name;
      const tw = ctx.measureText(nameText).width + 10;
      const th = 16;
      const tx = this.x;
      const ty = drawY - FISH_H / 2 - 4;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty - th, tw, th, 6);
      ctx.fillStyle = 'rgba(0, 10, 25, 0.55)';
      ctx.fill();
      ctx.fillStyle = '#eef6ff';
      ctx.shadowColor = `hsl(${this.hue}, 95%, 75%)`;
      ctx.shadowBlur = 6;
      ctx.fillText(nameText, tx, ty);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // Bounding box (in world coords)
  getBounds() {
    return {
      left: this.x - FISH_W / 2,
      right: this.x + FISH_W / 2,
      top: this.y - FISH_H / 2,
      bottom: this.y + FISH_H / 2,
    };
  }
}

// ─────────────────────────────────────────────
//  BUBBLE SYSTEM
// ─────────────────────────────────────────────
function createBubble() {
  const b = getVisibleBounds();
  return {
    x: randBetween(b.left, b.right),
    y: b.bottom + randBetween(0, 40),
    r: randBetween(2, 7),
    speed: randBetween(0.022, 0.065), // px/ms — slow, dreamy float
    drift: randBetween(-0.018, 0.018),
    alpha: randBetween(0.07, 0.20),
  };
}

function initBubbles() {
  bubbles = [];
  const b = getVisibleBounds();
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const bubble = createBubble();
    bubble.y = randBetween(b.top, b.bottom); // spread initially
    bubbles.push(bubble);
  }
}

function updateBubbles(dt) {
  const b = getVisibleBounds();
  for (const bubble of bubbles) {
    bubble.y -= bubble.speed * dt;
    bubble.x += bubble.drift * dt;
    if (bubble.y < b.top - 20) {
      bubble.y = b.bottom + randBetween(0, 30);
      bubble.x = randBetween(b.left, b.right);
    }
  }
}

function drawBubbles() {
  ctx.save();
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${b.alpha * 1.6})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${b.alpha})`;
    ctx.fill();

    // Subtle glint highlight on bubble
    if (b.r >= 3.5) {
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, b.alpha * 2.5)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  DYNAMIC TRAIL BUBBLE SYSTEM
// ─────────────────────────────────────────────
function addTrailBubble(x, y, vx, vy, r, lifeMs, alpha = 0.65, type = 'hook') {
  if (trailBubbles.length > 280) {
    trailBubbles.shift();
  }
  trailBubbles.push({
    x,
    y,
    vx: vx || 0,
    vy: vy !== undefined ? vy : -randBetween(0.03, 0.07),
    r: r || randBetween(2, 4.5),
    maxR: (r || 3) * randBetween(1.15, 1.45),
    alpha: alpha,
    maxLife: lifeMs || 800,
    life: lifeMs || 800,
    type: type,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: randBetween(0.005, 0.01),
  });
}

function updateTrailBubbles(dt) {
  for (let i = trailBubbles.length - 1; i >= 0; i--) {
    const b = trailBubbles[i];
    b.life -= dt;
    if (b.life <= 0) {
      trailBubbles.splice(i, 1);
      continue;
    }
    b.y += b.vy * dt;
    b.wobblePhase += b.wobbleSpeed * dt;
    b.x += b.vx * dt + Math.sin(b.wobblePhase) * 0.22;
    b.vx *= 0.96;
  }
}

function drawTrailBubbles() {
  if (trailBubbles.length === 0) return;
  ctx.save();
  for (const b of trailBubbles) {
    const progress = 1 - (b.life / b.maxLife);
    const currentAlpha = b.alpha * (1 - progress);
    const currentR = b.r + (b.maxR - b.r) * progress;

    ctx.beginPath();
    ctx.arc(b.x, b.y, currentR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha * 0.95})`;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = `rgba(210, 248, 255, ${currentAlpha * 0.38})`;
    ctx.fill();

    if (currentR >= 2.2) {
      ctx.beginPath();
      ctx.arc(b.x - currentR * 0.32, b.y - currentR * 0.32, currentR * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, currentAlpha * 1.6)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  SPLASH & CATCH PARTICLES
// ─────────────────────────────────────────────
function createCatchSplash(x, y, hue) {
  for (let i = 0; i < 16; i++) {
    const angle = randBetween(0, Math.PI * 2);
    const speed = randBetween(0.06, 0.22);
    splashes.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: randBetween(2, 4.5),
      life: 1.0,
      hue: hue || 190,
    });
  }
}

function updateSplashes(dt) {
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.life -= dt / 450;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.life <= 0) {
      splashes.splice(i, 1);
    }
  }
}

function drawSplashes() {
  if (splashes.length === 0) return;
  ctx.save();
  for (const s of splashes) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${s.hue}, 95%, 75%, ${s.life * 0.8})`;
    ctx.shadowColor = `hsl(${s.hue}, 95%, 70%)`;
    ctx.shadowBlur = 6 * s.life;
    ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  UNDERWATER LIGHT BEAMS & SURFACE RIPPLES
// ─────────────────────────────────────────────
function drawSunbeams(now) {
  const b = getVisibleBounds();
  ctx.save();
  const t = (now || performance.now()) * 0.00045;
  for (let i = 0; i < 4; i++) {
    const shift = Math.sin(t + i * 1.5) * (b.width * 0.04);
    const topX = b.left + b.width * (0.12 + i * 0.25) + shift;
    const topW = b.width * 0.08;
    const botX = topX - b.width * 0.12 + shift * 0.6;
    const botW = b.width * 0.17;

    const beam = ctx.createLinearGradient(0, b.top, 0, b.bottom);
    beam.addColorStop(0, 'rgba(160, 240, 255, 0.07)');
    beam.addColorStop(0.35, 'rgba(80, 200, 255, 0.035)');
    beam.addColorStop(1, 'rgba(0, 40, 100, 0)');

    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(topX, b.top);
    ctx.lineTo(topX + topW, b.top);
    ctx.lineTo(botX + botW, b.bottom);
    ctx.lineTo(botX, b.bottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWaterSurface(now) {
  const b = getVisibleBounds();
  ctx.save();
  ctx.beginPath();
  const segs = 24;
  const step = b.width / segs;
  const t = (now || performance.now()) * 0.0022;
  ctx.moveTo(b.left, b.top);
  for (let i = 0; i <= segs; i++) {
    const x = b.left + i * step;
    const y = b.top + Math.sin(t + i * 0.55) * 2.2;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(130, 235, 255, 0.38)';
  ctx.lineWidth = 2.2;
  ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

// ─────────────────────────────────────────────
//  SHOOTER (BASE + HOOK)
// ─────────────────────────────────────────────
function initShooter() {
  const b = getVisibleBounds();
  shooter.x = (b.left + b.right) / 2;
  shooter.y = canvas.height - BASE_H / 2 - 8;
  shooter.state = 'idle';
  shooter.lineLength = 0;
  shooter.caughtFish = null;
  shooter.angle = -Math.PI / 2; // point upward initially
  shooter.hookAngle = -Math.PI / 2;
  shooter.flightTime = 0;
  shooter.ropeSagX = 0;
  shooter.prevX = shooter.x;
  shooter.reelTimer = 0;
  shooter.hookX = shooter.x + Math.cos(shooter.angle) * HOOK_H;
  shooter.hookY = (shooter.y - BASE_H * 0.3) + Math.sin(shooter.angle) * HOOK_H;
  resetCamera();
}

function updateShooter(dt, now) {
  const b = getVisibleBounds();
  const prevBaseX = shooter.x;

  // Auto-pan: bounce the base left and right automatically within visible screen
  // Only pan / move shooter horizontally when not catching a fish
  if (camera.mode === 'normal') {
    if (autoPan) {
      shooter.x += autoPanSpeed * autoPanDir * dt;
      if (shooter.x >= b.right - BASE_W / 2) {
        autoPanDir = -1;
        shooter.x = b.right - BASE_W / 2;
      } else if (shooter.x <= b.left + BASE_W / 2) {
        autoPanDir = 1;
        shooter.x = b.left + BASE_W / 2;
      }
    } else {
      // Manual key movement
      if (keys.left) shooter.x -= BASE_MOVE_SPEED * dt;
      if (keys.right) shooter.x += BASE_MOVE_SPEED * dt;
    }
  }
  shooter.x = Math.max(b.left + BASE_W / 2, Math.min(b.right - BASE_W / 2, shooter.x));
  shooter.y = canvas.height - BASE_H / 2 - 8;

  const winchX = shooter.x;
  const winchY = shooter.y - BASE_H * 0.3;

  // Update dynamic rope lag & fluid resistance based on base motion
  const baseDeltaX = shooter.x - prevBaseX;
  const targetSagX = -baseDeltaX * 16 + (shooter.state === 'firing' ? -shooter.curveSign * 22 : 0);
  shooter.ropeSagX = (shooter.ropeSagX || 0) + (targetSagX - (shooter.ropeSagX || 0)) * Math.min(1, dt * 0.008);

  // ── 1. Base Panning Bubble Trail ──
  if (Math.abs(baseDeltaX) > 0.03) {
    const panDir = Math.sign(baseDeltaX);
    // Trailing thruster wake from rear edge of base
    const wakeX = shooter.x - panDir * (BASE_W * 0.38) + randBetween(-6, 6);
    const wakeY = shooter.y + BASE_H * 0.28 + randBetween(-2, 5);
    const bVx = -panDir * randBetween(0.025, 0.065);
    const bVy = -randBetween(0.035, 0.08);
    addTrailBubble(wakeX, wakeY, bVx, bVy, randBetween(2.2, 5.0), randBetween(750, 1250), randBetween(0.45, 0.75), 'base');

    // Occasional secondary mini-bubble from base keel
    if (Math.random() < 0.45) {
      const keelX = shooter.x + randBetween(-BASE_W * 0.2, BASE_W * 0.2);
      const keelY = shooter.y + BASE_H * 0.32;
      addTrailBubble(keelX, keelY, -panDir * 0.02, -randBetween(0.03, 0.065), randBetween(1.5, 3.2), randBetween(600, 950), 0.5, 'base');
    }
  }

  if (shooter.state === 'idle') {
    // Use mutable hookSwingFreq so the slider takes effect immediately
    shooter.angle = -Math.PI / 2 + Math.sin(now * hookSwingFreq) * HOOK_SWING_AMP;
    shooter.lineLength = 0;
    shooter.hookAngle = shooter.angle;
    shooter.hookX = winchX + Math.cos(shooter.angle) * HOOK_H;
    shooter.hookY = winchY + Math.sin(shooter.angle) * HOOK_H;

    // ── 2. Hook Swing Bubble Trail ──
    const swingCos = Math.cos(now * hookSwingFreq);
    if (Math.random() < 0.48 * Math.abs(swingCos) + 0.14) {
      const flukeOffset = (Math.random() < 0.5 ? -1 : 1) * randBetween(4, 12);
      const perpX = -Math.sin(shooter.angle) * flukeOffset;
      const perpY = Math.cos(shooter.angle) * flukeOffset;
      const tipX = shooter.hookX + perpX + randBetween(-2, 2);
      const tipY = shooter.hookY + perpY + randBetween(-2, 2);
      const tangVx = -swingCos * 0.035 + randBetween(-0.01, 0.01);
      const tangVy = -randBetween(0.025, 0.055);
      addTrailBubble(tipX, tipY, tangVx, tangVy, randBetween(1.4, 3.2), randBetween(600, 1050), randBetween(0.35, 0.65), 'swing');
    }
  }

  if (shooter.state === 'firing') {
    shooter.flightTime += dt;
    const t = shooter.flightTime;
    const forwardDist = HOOK_FIRE_SPEED * t;

    // Unit vectors: launch direction (ux, uy) and perpendicular normal (nx, ny)
    const ux = Math.cos(shooter.firedAngle);
    const uy = Math.sin(shooter.firedAngle);
    const nx = -uy;
    const ny = ux;

    // Linear projection along the launch ray
    const rayX = shooter.launchOriginX + ux * (HOOK_H + forwardDist);
    const rayY = shooter.launchOriginY + uy * (HOOK_H + forwardDist);

    // Lateral displacement physics (bending & direction change):
    // 1. Initial panning momentum drift that gently decays as water drag takes over
    const drift = shooter.launchVx * t * 0.85 * Math.exp(-t * 0.001);

    // 2. Hydrodynamic wave and curve:
    // Wave oscillation causes the anchor to bend to one side and then subtly weave back,
    // creating thrilling anticipation in the classroom!
    const tNorm = t * 0.0035;
    const bendWave = Math.sin(tNorm + shooter.swayPhase) * (forwardDist * 0.12);
    const curveSweep = shooter.curveBias * (1 - Math.cos(t * 0.0028)) * 40;

    // 3. Dynamic tug from base panning: as base pans across screen, rope pulls anchor laterally
    const basePanShift = (shooter.x - shooter.launchOriginX) * 0.35 * Math.min(1.2, forwardDist / 350);

    const totalLateral = drift + (bendWave * shooter.curveSign) + curveSweep + basePanShift;

    const prevX = shooter.hookX;
    const prevY = shooter.hookY;
    const nextHookX = rayX + nx * totalLateral;
    const nextHookY = rayY + ny * totalLateral;

    // Clamp hook within screen bounds so it never clips outside tank
    shooter.hookX = Math.max(b.left, Math.min(b.right, nextHookX));
    shooter.hookY = Math.max(b.top, Math.min(b.bottom, nextHookY));
    shooter.lineLength = Math.hypot(shooter.hookX - winchX, shooter.hookY - winchY);

    // Orient hook facing along its instantaneous velocity vector
    const moveDx = shooter.hookX - prevX;
    const moveDy = shooter.hookY - prevY;
    const stepDist = Math.hypot(moveDx, moveDy);
    if (stepDist > 0.01) {
      shooter.hookAngle = Math.atan2(moveDy, moveDx);

      // ── 3. Hook Launch Bubble Trail (Cavitation streaming wake) ──
      const numBubbles = Math.min(4, Math.max(1, Math.floor(stepDist / 4)));
      for (let i = 0; i < numBubbles; i++) {
        const frac = (i + Math.random() * 0.5) / numBubbles;
        const bx = prevX + moveDx * frac + randBetween(-6, 6);
        const by = prevY + moveDy * frac + randBetween(-6, 6);
        const bubbleVx = -moveDx * 0.04 + randBetween(-0.025, 0.025);
        const bubbleVy = -moveDy * 0.02 - randBetween(0.04, 0.09);
        addTrailBubble(bx, by, bubbleVx, bubbleVy, randBetween(2.0, 5.2), randBetween(800, 1350), randBetween(0.55, 0.85), 'hook');
      }
    }

    // Hit visible boundary (reach topmost water surface b.top, side boundaries, or max length)
    if (shooter.hookX <= b.left || shooter.hookX >= b.right ||
      shooter.hookY <= b.top || shooter.hookY >= b.bottom ||
      shooter.lineLength > HOOK_MAX_LENGTH) {
      shooter.state = 'retracting';
      shooter.reelTimer = 0;
      return;
    }

    // Collision with fish while firing
    const hookMargin = 16;
    for (const fish of fishes) {
      if (fish.caught || fish.absent || fish.removed) continue;
      const fb = fish.getBounds();
      if (shooter.hookX >= fb.left - hookMargin && shooter.hookX <= fb.right + hookMargin &&
        shooter.hookY >= fb.top - hookMargin && shooter.hookY <= fb.bottom + hookMargin) {
        fish.caught = true;
        shooter.caughtFish = fish;
        shooter.state = 'retracting';
        shooter.reelTimer = 0;
        startCatchCamera(fish);
        createCatchSplash(shooter.hookX, shooter.hookY, fish.hue);
        playCatchSound();
        return;
      }
    }
  }

  if (shooter.state === 'retracting') {
    // Mechanical reel ticking sound while retracting
    shooter.reelTimer = (shooter.reelTimer || 0) + dt;
    const tickInterval = shooter.caughtFish ? 95 : 65;
    if (shooter.reelTimer >= tickInterval) {
      shooter.reelTimer = 0;
      playReelSound();
    }

    const dx = winchX - shooter.hookX;
    const dy = winchY - shooter.hookY;
    const currentDist = Math.hypot(dx, dy);

    // When a fish is caught, reel back slower due to heavy drag; return fast when empty
    const retractSpeed = shooter.caughtFish ? HOOK_RETRACT_SPEED_CAUGHT : HOOK_RETRACT_SPEED_EMPTY;
    const step = retractSpeed * dt;

    if (currentDist <= step + HOOK_H || currentDist <= HOOK_H) {
      shooter.lineLength = 0;
      shooter.hookX = winchX + Math.cos(shooter.angle) * HOOK_H;
      shooter.hookY = winchY + Math.sin(shooter.angle) * HOOK_H;
      shooter.hookAngle = shooter.angle;

      if (shooter.caughtFish) {
        // Keep fish pinned to tip of hook base
        shooter.caughtFish.x = shooter.hookX;
        shooter.caughtFish.y = shooter.hookY;

        // Transition camera from tracking to restoring if min tracking duration satisfied
        if (camera.mode === 'tracking') {
          if (camera.trackElapsed >= 500) {
            camera.mode = 'restoring';
            camera.restoreTimer = 0;
          }
        } else if (camera.mode === 'normal') {
          paused = true;
          showCatchModal(shooter.caughtFish);
        }
      } else {
        shooter.state = 'idle';
      }
    } else {
      // Reeling in: pull hook toward current base position in smooth pursuit
      const dirX = dx / currentDist;
      const dirY = dy / currentDist;
      shooter.hookX += dirX * step;
      shooter.hookY += dirY * step;
      shooter.lineLength = Math.max(0, currentDist - step - HOOK_H);
      shooter.hookAngle = Math.atan2(dy, dx) - Math.PI;

      // ── Trailing Reel-Back Bubbles ──
      if (Math.random() < 0.65) {
        addTrailBubble(
          shooter.hookX + randBetween(-8, 8),
          shooter.hookY + randBetween(-8, 8),
          -dirX * 0.03 + randBetween(-0.02, 0.02),
          -randBetween(0.03, 0.075),
          randBetween(1.8, 4.2),
          randBetween(650, 1150),
          randBetween(0.45, 0.75),
          'hook'
        );
      }

      // If retracting without a fish, catch the first fish that hits the returning anchor!
      if (!shooter.caughtFish) {
        const hookMargin = 16;
        for (const fish of fishes) {
          if (fish.caught || fish.absent || fish.removed) continue;
          const fb = fish.getBounds();
          if (shooter.hookX >= fb.left - hookMargin && shooter.hookX <= fb.right + hookMargin &&
            shooter.hookY >= fb.top - hookMargin && shooter.hookY <= fb.bottom + hookMargin) {
            fish.caught = true;
            shooter.caughtFish = fish;
            startCatchCamera(fish);
            createCatchSplash(shooter.hookX, shooter.hookY, fish.hue);
            playCatchSound();
            break; // First fish that hits the anchor going back is caught!
          }
        }
      }

      if (shooter.caughtFish) {
        // Keep fish pinned to hook as it gets dragged in
        shooter.caughtFish.x = shooter.hookX;
        shooter.caughtFish.y = shooter.hookY;

        // Struggling bubbles behind caught fish
        if (Math.random() < 0.35) {
          addTrailBubble(
            shooter.hookX + randBetween(-14, 14),
            shooter.hookY + randBetween(-8, 8),
            randBetween(-0.03, 0.03),
            -randBetween(0.04, 0.08),
            randBetween(2.2, 5.0),
            randBetween(700, 1200),
            randBetween(0.5, 0.8),
            'hook'
          );
        }
      }
    }
  }
}

function drawShooter(now) {
  const bx = shooter.x;
  const by = shooter.y;
  const winchX = bx;
  const winchY = by - BASE_H * 0.3;

  // Draw radiant golden line / rope from base winch to hook tip
  if (shooter.state !== 'idle' || shooter.lineLength > 0) {
    // Dynamic rope curve (Bezier)
    const midX = (winchX + shooter.hookX) / 2;
    const midY = (winchY + shooter.hookY) / 2;

    // Rope fluid bow / sway with slight catenary sag
    const ropeWave = Math.sin((now || performance.now()) * 0.0035) * 6 * Math.min(1, shooter.lineLength / 400);
    const ctrlX = midX + (shooter.ropeSagX || 0) + ropeWave;
    const ctrlY = midY + 12 * Math.min(1.5, shooter.lineLength / 350);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Radiant golden ambient glow
    ctx.beginPath();
    ctx.moveTo(winchX, winchY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, shooter.hookX, shooter.hookY);
    ctx.strokeStyle = '#d49012';
    ctx.lineWidth = 4.5;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // 2. Rich warm gold main cord
    ctx.beginPath();
    ctx.moveTo(winchX, winchY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, shooter.hookX, shooter.hookY);
    ctx.strokeStyle = '#f5be25';
    ctx.lineWidth = 2.8;
    ctx.shadowBlur = 4;
    ctx.stroke();

    // 3. Lustrous sparkling gold highlights / braided chain links
    ctx.beginPath();
    ctx.moveTo(winchX, winchY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, shooter.hookX, shooter.hookY);
    ctx.strokeStyle = '#fff5a8';
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 0;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Golden eyelet ring at base winch
    ctx.beginPath();
    ctx.arc(winchX, winchY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd747';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // Draw base
  ctx.save();
  ctx.translate(bx, by);
  ctx.drawImage(assets.base, -BASE_W / 2, -BASE_H / 2, BASE_W, BASE_H);
  ctx.restore();

  // Draw hook and caught fish
  const hookAngle = (shooter.state === 'idle')
    ? shooter.angle
    : (shooter.hookAngle !== undefined ? shooter.hookAngle : shooter.firedAngle);

  // If a fish is caught, draw it attached to the hook being dragged!
  if (shooter.caughtFish) {
    const f = shooter.caughtFish;
    const oc = f.facingLeft ? f.ocLeft : f.ocRight;
    ctx.save();
    ctx.translate(shooter.hookX, shooter.hookY);
    // Struggle wiggle while being reeled in
    const struggle = Math.sin((now || performance.now()) * 0.016) * 0.12;
    ctx.rotate(hookAngle + Math.PI / 2 + struggle);
    // Draw fish centered with anchor clasping its body
    ctx.shadowColor = `hsl(${f.hue}, 95%, 75%)`;
    ctx.shadowBlur = 12;
    ctx.drawImage(oc, -FISH_W / 2, -FISH_H / 2, FISH_W, FISH_H);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Name label following the caught fish
    if (showNames) {
      ctx.save();
      ctx.font = 'bold 12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const nameText = f.name;
      const tw = ctx.measureText(nameText).width + 14;
      const th = 18;
      const tx = shooter.hookX;
      const ty = shooter.hookY - FISH_H / 2 - 8;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty - th, tw, th, 6);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fill();
      ctx.fillStyle = '#ffdf78';
      ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fillText(nameText, tx, ty - 2);
      ctx.restore();
    }
  }

  // Draw hook (over the fish so the anchor visibly hooks onto it, with golden halo)
  ctx.save();
  ctx.translate(shooter.hookX, shooter.hookY);
  ctx.rotate(hookAngle + Math.PI / 2); // orient hook tip along line
  ctx.shadowColor = 'rgba(255, 215, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.drawImage(assets.hook, -HOOK_W / 2, -HOOK_H / 2, HOOK_W, HOOK_H);
  ctx.restore();
}

function fireHook() {
  if (shooter.state !== 'idle' || camera.mode !== 'normal') return;
  if (fishes.filter(f => !f.absent && !f.removed && !f.caught).length === 0) return;

  playShootSound();
  shooter.reelTimer = 0;

  const winchX = shooter.x;
  const winchY = shooter.y - BASE_H * 0.3;

  shooter.firedAngle = shooter.angle;
  shooter.state = 'firing';
  shooter.lineLength = 0;
  shooter.flightTime = 0;
  shooter.launchOriginX = winchX;
  shooter.launchOriginY = winchY;
  shooter.hookX = winchX + Math.cos(shooter.firedAngle) * HOOK_H;
  shooter.hookY = winchY + Math.sin(shooter.firedAngle) * HOOK_H;
  shooter.hookAngle = shooter.firedAngle;

  // Lateral velocity / momentum from shooter base at launch moment
  let baseVx = 0;
  if (autoPan) {
    baseVx = autoPanSpeed * autoPanDir;
  } else {
    if (keys.left) baseVx -= BASE_MOVE_SPEED;
    if (keys.right) baseVx += BASE_MOVE_SPEED;
  }
  shooter.launchVx = baseVx;

  // Curving / bending bias to create suspense & anticipation:
  // When panning, anchor gets an organic sweeping curve with momentum and water resistance.
  // When stationary, it still has an organic hydrodynamic S-curve rather than a dead-straight ray.
  if (baseVx !== 0) {
    shooter.curveSign = Math.sign(baseVx);
    shooter.curveBias = baseVx * randBetween(1.2, 1.8);
  } else {
    shooter.curveSign = Math.random() < 0.5 ? 1 : -1;
    shooter.curveBias = shooter.curveSign * randBetween(0.12, 0.22);
  }
  shooter.swayPhase = randBetween(0, Math.PI * 2);
}

// ─────────────────────────────────────────────
//  CATCH MODAL
// ─────────────────────────────────────────────
function showCatchModal(fish) {
  modalName.textContent = fish.name;

  // Fish preview in modal
  modalFishPreview.innerHTML = '';
  const previewImg = new Image();
  previewImg.src = ASSET_PATHS[fish.shapeKey];
  previewImg.style.filter = `hue-rotate(${fish.hue}deg) saturate(${fish.sat}) brightness(${fish.lit})`;
  previewImg.style.width = '90%';
  previewImg.style.height = '90%';
  previewImg.style.objectFit = 'contain';
  modalFishPreview.appendChild(previewImg);

  catchModal.classList.remove('hidden');
  playCheerSound();
}

function closeCatchModal() {
  catchModal.classList.add('hidden');
}

// ─────────────────────────────────────────────
//  STUDENT LIST UI
// ─────────────────────────────────────────────
function renderStudentList() {
  const students = tankData[activeTank] || [];
  studentList.innerHTML = '';
  studentCount.textContent = students.filter(s => !s.absent).length;

  students.forEach((student, idx) => {
    const li = document.createElement('li');
    li.className = 'student-item' + (student.absent ? ' absent' : '');

    const dot = document.createElement('span');
    dot.className = 'fish-dot';
    dot.style.background = `hsl(${student.hue}, 85%, 60%)`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'student-name';
    nameSpan.textContent = student.name;

    const absentBtn = document.createElement('button');
    absentBtn.className = 'absent-btn';
    absentBtn.title = student.absent ? 'Show fish' : 'Mark absent';
    absentBtn.textContent = student.absent ? '🚫' : '👁️';
    absentBtn.addEventListener('click', () => {
      playClickSound();
      student.absent = !student.absent;
      // Sync fish
      const fish = fishes.find(f => f.name === student.name);
      if (fish) fish.absent = student.absent;
      saveToStorage();
      renderStudentList();
      updateStats();
    });

    li.appendChild(dot);
    li.appendChild(nameSpan);
    li.appendChild(absentBtn);
    studentList.appendChild(li);
  });
}

// ─────────────────────────────────────────────
//  LOAD TANK
// ─────────────────────────────────────────────
function loadTank(name) {
  activeTank = name;
  tankSelect.value = name;

  if (!tankData[name]) tankData[name] = [];

  studentInput.value = tankData[name].map(s => s.name).join('\n');

  // Build fish, passing per-fish sat/lit (default gracefully if missing from old saves)
  fishes = tankData[name].map(s => {
    const f = new Fish(s.name, s.hue, s.shapeKey, s.sat ?? 2.2, s.lit ?? 1.1);
    f.absent = s.absent || false;
    return f;
  });

  caughtTotal = 0;
  splashes = [];
  resetCamera();
  saveToStorage();
  renderStudentList();
  updateStats();
}

/**
 * Assign well-spaced hues using the golden-angle method so no two fish
 * ever look near-identical in color. Also vary saturation + brightness
 * per fish for extra visual richness.
 */
function assignGoldenHues(students) {
  const GOLDEN = 137.508; // degrees — maximally spreads colors
  students.forEach((s, i) => {
    s.hue = (i * GOLDEN) % 360;
    // Alternate between two saturation tiers for visual variety
    s.sat = (i % 2 === 0) ? 2.5 : 1.9;
    // Cycle brightness slightly: 1.05 / 1.15 / 1.25 / 1.05 ...
    s.lit = 1.05 + (i % 3) * 0.10;
  });
}

function saveTank() {
  const lines = studentInput.value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const existing = tankData[activeTank] || [];
  const newStudents = lines.map((name, idx) => {
    const prev = existing.find(s => s.name === name);
    if (prev) return prev;
    return {
      name,
      hue: 0, // will be overwritten by assignGoldenHues
      sat: 2.2,
      lit: 1.1,
      shapeKey: ['fish1', 'fish2', 'fish3'][randInt(0, 3)],
      absent: false,
    };
  });

  // Re-distribute ALL hues across the full roster so colours stay maximally spaced
  assignGoldenHues(newStudents);

  tankData[activeTank] = newStudents;
  saveToStorage();
  loadTank(activeTank);
}

// ─────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────
function updateStats() {
  const active = fishes.filter(f => !f.absent && !f.removed);
  caughtCount.textContent = caughtTotal;
  remainingCount.textContent = active.length;
}

// ─────────────────────────────────────────────
//  CANVAS RESIZE
// ─────────────────────────────────────────────
function resizeCanvas() {
  const tw = getTankWidth();
  canvas.width = tw;
  canvas.height = window.innerHeight;
  canvas.style.width = tw + 'px';
  canvas.style.height = window.innerHeight + 'px';
  initShooter();
  initBubbles();
  resetCamera();
}

// ─────────────────────────────────────────────
//  SCARE / SHUFFLE
// ─────────────────────────────────────────────
function scareAllFish() {
  scareEndTime = performance.now() + SCARE_DURATION;
  const sb = getFishSwimBounds();
  for (const fish of fishes) {
    if (fish.absent || fish.removed || fish.caught) continue;
    // Random waypoint within upper-most to middle swim zone
    fish.wx = randBetween(sb.minX, sb.maxX);
    fish.wy = randBetween(sb.minY, sb.maxY);
  }
}

// ─────────────────────────────────────────────
//  MAIN GAME LOOP
// ─────────────────────────────────────────────
function drawOceanOverlay(now) {
  const b = getVisibleBounds();
  // Subtle dark gradient at bottom to simulate depth
  const grad = ctx.createLinearGradient(0, b.top + b.height * 0.55, 0, b.bottom);
  grad.addColorStop(0, 'rgba(0,20,50,0)');
  grad.addColorStop(1, 'rgba(0,10,30,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(b.left, b.top, b.width, b.height);

  // Ethereal underwater sunbeams
  drawSunbeams(now);

  // Shimmering surface water ripples
  drawWaterSurface(now);
}

function gameLoop(now) {
  if (!prevTime) prevTime = now;
  const rawDt = Math.min(now - prevTime, 50); // cap dt to avoid spiral of death
  prevTime = now;

  if (!paused) {
    const dt = rawDt;

    updateCamera(dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply camera transform (smooth close-up tracking or normal bottom-anchored view)
    ctx.save();
    ctx.translate(camera.screenX, camera.screenY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawOceanOverlay(now);
    updateBubbles(dt);
    drawBubbles();
    updateSplashes(dt);
    drawSplashes();
    updateTrailBubbles(dt);
    drawTrailBubbles();

    // Draw delicate bioluminescent swim trails (under fishes)
    for (const fish of fishes) {
      fish.drawTrail();
    }

    // Update & draw fish
    for (const fish of fishes) {
      fish.update(dt, now);
    }
    for (const fish of fishes) {
      fish.draw(now);
    }

    updateShooter(dt, now);
    drawShooter(now);

    ctx.restore();
  }

  rafId = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
// Keyboard
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (catchModal && !catchModal.classList.contains('hidden')) {
      if (modalHookBtn) modalHookBtn.click();
    } else {
      fireHook();
    }
  }
  if (e.key === 'Enter') {
    if (catchModal && !catchModal.classList.contains('hidden')) {
      e.preventDefault();
      if (modalHookBtn) modalHookBtn.click();
    }
  }
  // H — toggle control bar
  if (e.key === 'h' || e.key === 'H') toggleControlBar();
  // M — toggle sound & music
  if (e.key === 'm' || e.key === 'M') {
    setSoundEnabled(!soundEnabled);
    playClickSound();
  }
});

function toggleControlBar() {
  const bar = document.getElementById('controlBar');
  const btn = document.getElementById('controlBarToggleBtn');
  const hidden = bar.classList.toggle('bar-hidden');
  if (btn) btn.textContent = hidden ? '⌨️ Show Controls' : '⌨️ Hide Controls';
  saveSettings();
}

if (controlBarToggleBtn) {
  controlBarToggleBtn.addEventListener('click', () => {
    playClickSound();
    toggleControlBar();
  });
}

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

// Canvas click to fire
canvas.addEventListener('click', () => {
  if (!paused) fireHook();
});

// Canvas mousemove to move base (disabled during auto-pan)
canvas.addEventListener('mousemove', e => {
  if (!paused && !autoPan && shooter.state === 'idle') {
    const b = getVisibleBounds();
    const mouseX = Math.max(0, Math.min(canvas.width, e.offsetX));
    const worldMouseX = b.left + (mouseX / canvas.width) * b.width;
    shooter.x = Math.max(b.left + BASE_W / 2, Math.min(b.right - BASE_W / 2, worldMouseX));
  }
});

// Zoom slider
zoomSlider.addEventListener('input', () => {
  zoom = Math.max(1.0, parseFloat(zoomSlider.value));
  zoomValue.textContent = zoom.toFixed(1) + '×';

  if (camera.mode === 'normal') {
    camera.zoom = zoom;
    camera.targetZoom = zoom;
  }

  const b = getVisibleBounds();
  const sb = getFishSwimBounds();
  // Keep shooter within new visible bounds
  shooter.x = Math.max(b.left + BASE_W / 2, Math.min(b.right - BASE_W / 2, shooter.x));
  // Keep all fish within upper-most to middle swim zone
  for (const f of fishes) {
    if (f.caught || f.removed || f.absent) continue;
    f.x = Math.max(sb.minX, Math.min(sb.maxX, f.x));
    f.y = Math.max(sb.minY, Math.min(sb.maxY, f.y));
    f.setWaypoint();
  }
  saveSettings();
});

// Sound & Music toggle
if (soundToggle) {
  soundToggle.addEventListener('change', () => {
    playClickSound();
    setSoundEnabled(soundToggle.checked);
  });
}

// Show names toggle
showNamesChk.addEventListener('change', () => {
  playClickSound();
  showNames = showNamesChk.checked;
  saveSettings();
});

// Tank selector
tankSelect.addEventListener('change', () => {
  playClickSound();
  loadTank(tankSelect.value);
});

// Add tank button
addTankBtn.addEventListener('click', () => {
  playClickSound();
  newTankName.value = '';
  addTankModal.classList.remove('hidden');
  newTankName.focus();
});

confirmAddTank.addEventListener('click', () => {
  playClickSound();
  const name = newTankName.value.trim();
  if (!name) return;
  if (!tankData[name]) tankData[name] = [];

  // Add to selector
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = `Tank ${name}`;
  tankSelect.appendChild(opt);

  addTankModal.classList.add('hidden');
  loadTank(name);
  saveToStorage();
});

cancelAddTank.addEventListener('click', () => {
  playClickSound();
  addTankModal.classList.add('hidden');
});

addTankModal.addEventListener('click', e => {
  if (e.target === addTankModal) addTankModal.classList.add('hidden');
});

newTankName.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAddTank.click();
});

// Save tank
saveTankBtn.addEventListener('click', () => {
  playClickSound();
  saveTank();
});

// Shuffle
shuffleBtn.addEventListener('click', () => {
  playClickSound();
  scareAllFish();
});

// Fish swim speed slider
if (fishSpeedSlider) {
  fishSpeedSlider.addEventListener('input', () => {
    // Map slider 1-10 to px/ms range 0.02 – 0.146 (default 4 = 0.062)
    const t = (parseFloat(fishSpeedSlider.value) - 1) / 9;
    FISH_SPEED_NORMAL = 0.02 + t * 0.126;
    if (fishSpeedValue) fishSpeedValue.textContent = fishSpeedSlider.value;
    saveSettings();
  });
}

// Fish dodge speed slider
if (dodgeSpeedSlider) {
  dodgeSpeedSlider.addEventListener('input', () => {
    // Map slider 1-10 to px/ms range 0.18 – 0.85 (default 4 = 0.44)
    const t = (parseFloat(dodgeSpeedSlider.value) - 1) / 9;
    FISH_SPEED_EVADE = 0.18 + t * 0.67;
    if (dodgeSpeedValue) dodgeSpeedValue.textContent = dodgeSpeedSlider.value;
    saveSettings();
  });
}

// Hook swing speed slider
if (swingSpeedSlider) {
  swingSpeedSlider.addEventListener('input', () => {
    // Map slider 1-10 to rad/ms range 0.0004 – 0.0045
    const t = (parseFloat(swingSpeedSlider.value) - 1) / 9;
    hookSwingFreq = 0.0004 + t * 0.0041;
    if (swingSpeedValue) swingSpeedValue.textContent = swingSpeedSlider.value;
    saveSettings();
  });
}

// Auto-pan toggle
if (autoPanChk) {
  autoPanChk.addEventListener('change', () => {
    playClickSound();
    autoPan = autoPanChk.checked;
    if (autoPanControls) autoPanControls.classList.toggle('hidden', !autoPan);
    saveSettings();
  });
}

if (autoPanSpeedSlider) {
  autoPanSpeedSlider.addEventListener('input', () => {
    // Map 1-10 → 0.08 – 0.55 px/ms
    const t = (parseFloat(autoPanSpeedSlider.value) - 1) / 9;
    autoPanSpeed = 0.08 + t * 0.47;
    if (autoPanSpeedValue) autoPanSpeedValue.textContent = autoPanSpeedSlider.value;
    saveSettings();
  });
}

// Modal buttons
modalHookBtn.addEventListener('click', () => {
  playClickSound();
  if (!shooter.caughtFish) return;
  const fish = shooter.caughtFish;
  const sb = getFishSwimBounds();
  fish.caught = false;
  fish.x = randBetween(sb.minX, sb.maxX);
  fish.y = randBetween(sb.minY, sb.maxY);
  fish.setWaypoint();

  caughtTotal++;
  saveToStorage();
  updateStats();

  closeCatchModal();
  shooter.caughtFish = null;
  shooter.state = 'idle';
  shooter.lineLength = 0;
  resetCamera();
  paused = false;
});

catchModal.addEventListener('click', e => {
  if (e.target === catchModal) {
    // Do nothing – require explicit button press
  }
});

// Window resize
window.addEventListener('resize', () => {
  resizeCanvas();
  // Reposition shooter within visible bounds
  const b = getVisibleBounds();
  shooter.x = (b.left + b.right) / 2;
  shooter.y = canvas.height - BASE_H / 2 - 8;
});

// Resume/initialize Web Audio on first user interaction anywhere on the document
['click', 'keydown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    resumeAudioContext();
  }, { passive: true });
});

// ─────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────
(async function init() {
  resizeCanvas();

  try {
    await loadAllAssets();
  } catch (err) {
    console.error('Asset loading failed:', err);
    document.querySelector('#loadingContent p').textContent =
      '⚠️ Some assets failed to load. Check ./assets/ folder.';
    return;
  }

  // Fade out loading screen
  loadingScreen.style.opacity = '0';
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 500);

  loadFromStorage();
  loadSettings();
  initAudio();
  rebuildTankSelector();
  loadTank(activeTank);
  initShooter();

  // Start game loop
  rafId = requestAnimationFrame(gameLoop);
})();
