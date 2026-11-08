// 시각·청각 효과: 파티클 캔버스, 화면 흔들림/섬광, 합성 효과음 (외부 파일 없음)
import { store } from './store.js';

const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const settings = {
  sound: store.get('st_sound') !== 'off',
  motion: store.get('st_motion') ? store.get('st_motion') !== 'off' : !prefersReduced,
};
export function setSetting(key, on) {
  settings[key] = on;
  store.set('st_' + key, on ? 'on' : 'off');
}

// ---------------- 파티클 ----------------
let cv, ctx, W = 0, H = 0, dpr = 1, raf = 0;
const parts = [];
let ambient = null; // { el, color }

function ensureCanvas() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.id = 'fx';
  document.body.appendChild(cv);
  ctx = cv.getContext('2d');
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
}

function loop() {
  ctx.clearRect(0, 0, W, H);
  if (ambient && settings.motion && document.body.contains(ambient.el)) {
    const r = ambient.el.getBoundingClientRect();
    if (r.width && Math.random() < 0.35) {
      parts.push({
        x: r.left + r.width * (0.2 + Math.random() * 0.6), y: r.top + r.height * (0.55 + Math.random() * 0.3),
        vx: (Math.random() - 0.5) * 0.3, vy: -0.4 - Math.random() * 0.7, g: -0.002,
        life: 0, max: 90 + Math.random() * 80, size: 1 + Math.random() * 2.2, color: ambient.color, shape: 'dot', fade: true,
      });
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life++;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.vy += p.g; p.vx *= p.drag ?? 0.99; p.vy *= p.drag ?? 0.99;
    p.x += p.vx; p.y += p.vy;
    if (p.vr) p.rot += p.vr;
    const k = 1 - p.life / p.max;
    ctx.globalAlpha = p.fade ? Math.min(1, k * 1.6) * (p.alpha ?? 1) : (p.alpha ?? 1);
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    if (p.shape === 'dot') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, 6.283); ctx.fill();
    } else if (p.shape === 'spark') {
      ctx.lineWidth = p.size; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke();
    } else if (p.shape === 'ring') {
      ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (1 - k) * p.grow, 0, 6.283); ctx.stroke();
    } else if (p.shape === 'shard' || p.shape === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.shape === 'shard') {
        ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.8); ctx.lineTo(-p.size * 0.7, p.size * 0.5); ctx.closePath(); ctx.fill();
      } else {
        ctx.scale(1, Math.cos(p.life * 0.15 + p.size)); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (parts.length || ambient) raf = requestAnimationFrame(loop);
  else raf = 0;
}
function kick() { ensureCanvas(); if (!raf) raf = requestAnimationFrame(loop); }

export function burst(x, y, { color = '#fff', colors, count = 30, speed = 6, size = 3, gravity = 0.12, shape = 'spark', life = 50 } = {}) {
  if (!settings.motion) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.75);
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, life: 0, max: life * (0.6 + Math.random() * 0.6),
      size: size * (0.5 + Math.random()), color: colors ? colors[i % colors.length] : color, shape, fade: true,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, drag: 0.97,
    });
  }
  kick();
}
export function ring(x, y, color = '#fff', grow = 160, life = 40) {
  if (!settings.motion) return;
  parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0, max: life, size: 10, grow, color, shape: 'ring', fade: true });
  kick();
}
export function shards(x, y, color, count = 40) {
  if (!settings.motion) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.25, life: 0, max: 80 + Math.random() * 40,
      size: 5 + Math.random() * 12, color, shape: 'shard', fade: true, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, drag: 0.985 });
  }
  kick();
}
export function confetti(colors, count = 140) {
  if (!settings.motion) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
      g: 0.04, life: 0, max: 220 + Math.random() * 100, size: 6 + Math.random() * 6, color: colors[i % colors.length],
      shape: 'confetti', fade: false, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2, drag: 0.995 });
  }
  kick();
}
export function setAmbient(el, color) {
  ambient = el ? { el, color } : null;
  if (ambient) kick();
}
export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

export function shake(el = document.getElementById('app'), strong = false) {
  if (!settings.motion || !el) return;
  el.classList.remove('shake', 'shake-strong');
  void el.offsetWidth;
  el.classList.add(strong ? 'shake-strong' : 'shake');
}
export function flash(color = '#fff', ms = 500) {
  if (!settings.motion) return;
  const d = document.createElement('div');
  d.className = 'flash';
  d.style.background = color;
  d.style.animationDuration = ms + 'ms';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms + 50);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- 효과음 (Web Audio 합성) ----------------
let ac = null;
function audio() {
  if (!settings.sound) return null;
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
// iOS: 첫 터치 때 오디오 잠금 해제
addEventListener('pointerdown', () => { if (settings.sound) audio(); }, { once: true });

function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.2, to = null, attack = 0.005 } = {}) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise({ at = 0, dur = 0.3, vol = 0.15, freq = 800, q = 1, type = 'bandpass' } = {}) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

export const sfx = {
  tap: () => tone(660, { dur: 0.05, type: 'triangle', vol: 0.08 }),
  mark: () => { tone(880, { dur: 0.09, type: 'triangle', vol: 0.12 }); tone(1320, { at: 0.05, dur: 0.12, type: 'sine', vol: 0.09 }); },
  combo: (n) => tone(660 * Math.pow(1.06, Math.min(n, 12)), { dur: 0.16, type: 'square', vol: 0.06 }),
  wrong: () => { tone(160, { dur: 0.22, type: 'sawtooth', vol: 0.12, to: 90 }); noise({ dur: 0.12, vol: 0.06, freq: 300 }); },
  tick: () => tone(1200, { dur: 0.03, type: 'square', vol: 0.04 }),
  whoosh: () => noise({ dur: 0.45, vol: 0.12, freq: 1200, q: 0.6 }),
  slam: () => { tone(70, { dur: 0.5, type: 'sine', vol: 0.35, to: 40 }); noise({ dur: 0.3, vol: 0.18, freq: 200, type: 'lowpass' }); },
  heartbeat: () => { tone(60, { dur: 0.15, vol: 0.3 }); tone(55, { at: 0.18, dur: 0.18, vol: 0.25 }); },
  victory: () => [523, 659, 784, 1047].forEach((f, i) => { tone(f, { at: i * 0.09, dur: 0.5, type: 'triangle', vol: 0.12 }); tone(f / 2, { at: i * 0.09, dur: 0.5, type: 'sine', vol: 0.06 }); }),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, { at: i * 0.16, dur: 0.5, type: 'sawtooth', vol: 0.06 })),
  lpUp: () => tone(900, { dur: 0.04, type: 'sine', vol: 0.05 }),
  promo: () => {
    noise({ dur: 1.2, vol: 0.08, freq: 3000, q: 0.4 });
    [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { at: 0.6 + i * 0.07, dur: 1.4, type: 'triangle', vol: 0.09 }));
    [131, 196].forEach((f) => tone(f, { at: 0.6, dur: 2, type: 'sine', vol: 0.15 }));
  },
  demote: () => {
    tone(110, { dur: 1.6, type: 'sawtooth', vol: 0.1, to: 45 });
    noise({ at: 0.5, dur: 0.8, vol: 0.2, freq: 400 });
    [220, 207, 196].forEach((f, i) => tone(f, { at: 0.9 + i * 0.25, dur: 0.6, type: 'triangle', vol: 0.08 }));
  },
  series: () => { [440, 554, 659].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.6, type: 'square', vol: 0.05 })); },
  danger: () => { tone(220, { dur: 0.3, type: 'square', vol: 0.06 }); tone(208, { at: 0.3, dur: 0.3, type: 'square', vol: 0.06 }); },
};
