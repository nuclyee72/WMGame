// sets.js — 과일 이미지 세트: 기본(이모지) · 미리 넣어 둔 세트 · 내가 올린 커스텀
window.WM = window.WM || {};
(function (WM) {
  const LS_SET = 'wm-image-set';

  // files는 1단계부터 순서대로. cutout이면 흰 배경을 지워 쓴다. credit은 저작권 표시
  WM.IMAGE_SETS = [
    { id: 'default', name: 'Default' },
    { id: 'plush', name: 'Plush', files: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.png', '8.jpg'], cutout: true, credit: 'Plush photos © NEXON' },
    { id: 'custom', name: 'Custom' },
  ];
  const findSet = (id) => WM.IMAGE_SETS.find((s) => s.id === id);

  WM.customImages = new Array(WM.MAX_TIERS).fill(null); // 내가 올린 ImageBitmap (IndexedDB에 저장)
  WM.imageSet = 'default';

  WM.loadImageSetChoice = function () {
    try { const id = localStorage.getItem(LS_SET); return findSet(id) ? id : null; } catch { return null; }
  };

  // 세트를 바꾸고 그림을 다시 만든다. 미리 넣은 세트는 처음 고를 때 한 번 불러온다
  WM.applyImageSet = async function (id) {
    const set = findSet(id) || findSet('default');
    if (set.id === 'custom') WM.images = WM.customImages; // 같은 배열이라 올리고 지우는 게 바로 반영된다
    else if (set.files) {
      if (!set.bitmaps) set.bitmaps = await loadPreset(set);
      WM.images = set.bitmaps;
    } else WM.images = new Array(WM.MAX_TIERS).fill(null);
    WM.imageSet = set.id;
    try { localStorage.setItem(LS_SET, set.id); } catch {}
    WM.rebuildSprites();
  };

  async function loadPreset(set) {
    const out = new Array(WM.MAX_TIERS).fill(null);
    await Promise.all(set.files.map(async (file, i) => {
      const res = await fetch(file);
      if (!res.ok) throw new Error(file);
      let blob = await res.blob();
      if (set.cutout) blob = await removeWhiteBackground(blob);
      out[i] = (await WM.loadImageFile(blob)).bitmap; // 투명 여백을 잘라 256px로
    }));
    return out;
  }

  // 가장자리에서 이어진 흰 배경만 지운다 (인형 안쪽의 흰 부분은 남는다). 경계는 살짝 부드럽게
  async function removeWhiteBackground(blob) {
    const src = await createImageBitmap(blob);
    const sc = Math.min(1, 512 / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * sc)), h = Math.max(1, Math.round(src.height * sc));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const isBg = (p) => {
      const i = p * 4;
      if (d[i + 3] < 16) return true;
      const mn = Math.min(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]);
      return mn > 232 && mx - mn < 24;
    };
    const gone = new Uint8Array(w * h);
    const stack = [];
    const push = (p) => { if (!gone[p] && isBg(p)) { gone[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    for (let p = 0; p < w * h; p++) {
      if (gone[p]) { d[p * 4 + 3] = 0; continue; }
      // 배경과 맞닿은 밝은 픽셀은 반쯤 투명하게 (흰 테두리가 남지 않게)
      const x = p % w, y = (p / w) | 0;
      const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
      if (!edge) continue;
      const i = p * 4, mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (mn > 190) d[i + 3] = Math.round(Math.min(1, (255 - mn) / 65) * 255);
    }
    g.putImageData(img, 0, 0);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
  }
})(window.WM);
