// tiers.js — 과일 단계 정의, 크기 계산, 그림(스프라이트) 만들기
window.WM = window.WM || {};
(function (WM) {
  WM.MAX_TIERS = 15;

  // 기본 과일 (캔버스 전용 구분색 — UI 포인트 색과는 따로 둔다)
  WM.DEFAULT_TIERS = [
    { name: 'Cherry', emoji: '🍒', color: '#d93a49' },
    { name: 'Strawberry', emoji: '🍓', color: '#f2706d' },
    { name: 'Grape', emoji: '🍇', color: '#8e5bd6' },
    { name: 'Dekopon', emoji: '🍋', color: '#f5b82e' },
    { name: 'Persimmon', emoji: '🍊', color: '#f07b2a' },
    { name: 'Apple', emoji: '🍎', color: '#e2453c' },
    { name: 'Pear', emoji: '🍐', color: '#d6cf62' },
    { name: 'Peach', emoji: '🍑', color: '#f7a8a0' },
    { name: 'Watermelon', emoji: '🍉', color: '#3f9e4a' }, // 숨은 9단계
    { name: 'Melon', emoji: '🍈', color: '#9bd36a' },
    { name: 'Pineapple', emoji: '🍍', color: '#f2c94c' },
    { name: 'Coconut', emoji: '🥥', color: '#8b5e3c' },
    { name: 'Pumpkin', emoji: '🎃', color: '#e8833a' },
    { name: 'Earth', emoji: '🌍', color: '#3b7fd9' },
    { name: 'Moon', emoji: '🌕', color: '#e8d48a' },
  ];

  // 규칙은 고정 (설정에서 바꿀 수 없다. 이미지만 바꾼다)
  WM.DEFAULT_SETTINGS = {
    tierCount: 8,        // 단계 수
    dropCount: 3,        // 떨어지는 단계 수 (앞에서부터)
    minR: 10,            // 첫 단계 반지름 (월드 단위, 칸 한 변 100)
    maxR: 46,            // 마지막 단계 반지름 — 칸(100) 하나에 살짝 여유 있게 들어간다 (숨은 9단계는 같은 비율로 한 단계 더 크다)
    lastMerge: 'vanish', // 마지막 단계 둘이 만나면 사라진다
    fit: 'contain',      // 올린 이미지는 모양 그대로
  };

  WM.LIMITS = {
    tierCount: [3, WM.MAX_TIERS],
    minR: [10, 50],
    maxR: [40, 180],
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  WM.clamp = clamp;

  WM.normalizeSettings = function (s) {
    const d = WM.DEFAULT_SETTINGS;
    const num = (v, def) => (Number.isFinite(+v) ? Math.round(+v) : def);
    const out = {};
    out.tierCount = clamp(num(s.tierCount, d.tierCount), ...WM.LIMITS.tierCount);
    out.dropCount = clamp(num(s.dropCount, d.dropCount), 1, out.tierCount - 1);
    out.minR = clamp(num(s.minR, d.minR), ...WM.LIMITS.minR);
    out.maxR = clamp(num(s.maxR, d.maxR), Math.max(WM.LIMITS.maxR[0], out.minR + 10), WM.LIMITS.maxR[1]);
    out.lastMerge = s.lastMerge === 'keep' ? 'keep' : 'vanish';
    out.fit = s.fit === 'circle' ? 'circle' : 'contain';
    return out;
  };

  // 첫 단계 → 마지막 단계 반지름을 등비로 잇는다
  WM.radii = function (s) {
    const n = s.tierCount;
    const ratio = Math.pow(s.maxR / s.minR, 1 / (n - 1));
    return Array.from({ length: n }, (_, i) => s.minR * Math.pow(ratio, i));
  };

  // 단계 k(1부터)를 만들면 얻는 점수: 1, 3, 6, 10, …
  WM.points = (k) => (k * (k + 1)) / 2;

  // ── 스프라이트: 단계마다 256px 그림 하나를 만들어 두고 크기만 바꿔 그린다 ──
  const SPRITE = 256;
  WM.images = new Array(WM.MAX_TIERS).fill(null); // 사용자가 올린 ImageBitmap
  WM.sprites = [];

  function makeSprite(i, bitmap, fit) {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    const g = c.getContext('2d');
    const h = SPRITE / 2;
    g.imageSmoothingQuality = 'high';

    if (bitmap) {
      const bw = bitmap.width, bh = bitmap.height;
      if (fit === 'circle') {
        g.beginPath();
        g.arc(h, h, h, 0, Math.PI * 2);
        g.clip();
        const sc = Math.max(SPRITE / bw, SPRITE / bh);
        g.drawImage(bitmap, h - (bw * sc) / 2, h - (bh * sc) / 2, bw * sc, bh * sc);
      } else {
        const sc = Math.min(SPRITE / bw, SPRITE / bh);
        g.drawImage(bitmap, h - (bw * sc) / 2, h - (bh * sc) / 2, bw * sc, bh * sc);
      }
      return c;
    }

    const t = WM.DEFAULT_TIERS[i];
    g.fillStyle = t.color;
    g.beginPath();
    g.arc(h, h, h - 2, 0, Math.PI * 2);
    g.fill();
    // 윗부분 반짝임
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath();
    g.ellipse(h * 0.68, h * 0.55, h * 0.42, h * 0.26, -0.6, 0, Math.PI * 2);
    g.fill();
    g.font = `${Math.round(SPRITE * 0.5)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000'; // 반짝임의 반투명 색이 이모지에 묻지 않게
    g.fillText(t.emoji, h, h + SPRITE * 0.03);
    return c;
  }

  WM.rebuildSprites = function () {
    const fit = WM.settings ? WM.settings.fit : 'contain';
    for (let i = 0; i < WM.MAX_TIERS; i++) WM.sprites[i] = makeSprite(i, WM.images[i], fit);
  };

  // 작은 <canvas>에 단계 그림을 그린다 (cssSize = 화면 px)
  WM.paintSprite = function (canvas, i, cssSize) {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(1, Math.round(cssSize * dpr));
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    canvas.style.width = canvas.style.height = cssSize + 'px';
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, px, px);
    g.imageSmoothingQuality = 'high';
    if (WM.sprites[i]) g.drawImage(WM.sprites[i], 0, 0, px, px);
  };
})(window.WM);
