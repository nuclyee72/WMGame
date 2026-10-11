// sound.js — 효과음: 음원 파일 없이 Web Audio로 그 자리에서 합성한다. 크기는 꺼짐 · 작게 · 크게
window.WM = window.WM || {};
(function (WM) {
  const LS_KEY = 'wm-sound';
  const LEVELS = ['off', 'low', 'high'];
  const VOLUME = { off: 0, low: 0.22, high: 0.6 };
  const LABEL = { off: 'Off', low: 'Low', high: 'High' };
  const MIN_GAP = 0.035; // 같은 종류는 이만큼(초) 안에 겹치면 하나만 낸다 (연쇄 합체로 소리가 뭉개지지 않게)

  let level = 'low';
  try { const v = localStorage.getItem(LS_KEY); if (LEVELS.includes(v)) level = v; } catch {}

  let ctx = null, master = null, noise = null;
  const last = {};
  const listeners = [];

  // 브라우저는 사용자가 누르기 전엔 소리를 막으므로, 처음 누를 때 오디오를 깨운다
  function wake() {
    if (level === 'off') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = VOLUME[level];
      master.connect(ctx.destination);
      // 휙 소리에 쓰는 흰 소음 0.5초
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { capture: true, passive: true }));

  function ready(kind) {
    if (level === 'off' || !ctx || ctx.state !== 'running') return false;
    if (ctx.currentTime - (last[kind] || -1) < MIN_GAP) return false;
    last[kind] = ctx.currentTime;
    return true;
  }

  // 소리 하나: 시작 음높이에서 끝 음높이로 미끄러지며 빠르게 잦아든다
  function tone(type, f0, f1, dur, vol, at) {
    const t = ctx.currentTime + (at || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // 단계가 오를수록 한 음씩 올라가는 5음계
  const PENTA = [0, 2, 4, 7, 9];
  const note = (base, step) => base * Math.pow(2, (PENTA[step % 5] + 12 * Math.floor(step / 5)) / 12);

  WM.sound = {
    // 과일 합체: 퐁 — 높은 단계일수록 음이 올라가고 여운이 길다
    fruitMerge(tier) {
      if (!ready('fruit')) return;
      const f = note(392, tier);
      const dur = 0.16 + Math.min(tier, 8) * 0.02;
      tone('sine', f * 0.7, f, dur, 0.9);
      tone('sine', f * 1.5, f * 2, dur * 0.6, 0.25);
    },

    // 타일 합체: 딱 + 맑은 음 — 수가 클수록 음이 올라간다
    tileMerge(value) {
      if (!ready('tile')) return;
      const step = Math.max(0, Math.round(Math.log2(value)) - 2);
      const f = note(523, step);
      tone('square', 1800, 900, 0.03, 0.12);
      tone('triangle', f, f, 0.22, 0.7, 0.01);
      tone('sine', f * 2, f * 2, 0.14, 0.2, 0.01);
    },

    // 스와이프: 소음을 대역 필터로 쓸어 올리는 휙
    swipe() {
      if (!ready('swipe')) return;
      const t = ctx.currentTime, dur = 0.2;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    level: () => level,
    label: () => LABEL[level],

    // 꺼짐 → 작게 → 크게 → 꺼짐
    cycle() {
      level = LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
      try { localStorage.setItem(LS_KEY, level); } catch {}
      if (master) master.gain.value = VOLUME[level];
      // 바뀐 크기로 한 번 들려준다
      if (wake()) ctx.resume().then(() => { last.fruit = -1; WM.sound.fruitMerge(1); }).catch(() => {});
      listeners.forEach((fn) => fn(level));
    },
    onChange(fn) { listeners.push(fn); fn(level); },
  };
})(window.WM);
