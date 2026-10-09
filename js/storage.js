// storage.js — 설정·기록은 localStorage, 올린 이미지는 IndexedDB
window.WM = window.WM || {};
(function (WM) {
  const LS_STATS = 'wm-stats';

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  // ── IndexedDB: DB 'wm-game' / store 'images' / 키 = 단계 번호(0부터) ──
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open('wm-game', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('images');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    }
    return dbPromise;
  }
  async function write(fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('images', 'readwrite');
      fn(tx.objectStore('images'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  WM.store = {
    // 규칙은 고정이라 예전에 저장한 설정은 무시한다
    loadSettings() {
      return WM.normalizeSettings(Object.assign({}, WM.DEFAULT_SETTINGS));
    },
    loadStats() {
      return Object.assign({ best: 0, games: 0, maxTier: 0, bestStars: 0 }, lsGet(LS_STATS) || {});
    },
    saveStats(s) { lsSet(LS_STATS, s); },

    async getAllImages() {
      try {
        const d = await db();
        return await new Promise((resolve, reject) => {
          const out = new Map();
          const req = d.transaction('images').objectStore('images').openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) { out.set(cur.key, cur.value); cur.continue(); } else resolve(out);
          };
          req.onerror = () => reject(req.error);
        });
      } catch { return new Map(); }
    },
    async putImage(i, blob) { try { await write((st) => st.put(blob, i)); } catch {} },
    async deleteImage(i) { try { await write((st) => st.delete(i)); } catch {} },
    async clearImages() { try { await write((st) => st.clear()); } catch {} },
  };

  // ── 올린 파일 → 투명 여백을 잘라내고 최대 256px PNG로 줄인다 ──
  const MAX_SIDE = 256;
  WM.loadImageFile = async function (file) {
    const src = await createImageBitmap(file);
    // 1) 작업용으로 최대 512px에 그린다
    const pre = Math.min(1, 512 / Math.max(src.width, src.height));
    const w0 = Math.max(1, Math.round(src.width * pre));
    const h0 = Math.max(1, Math.round(src.height * pre));
    const work = document.createElement('canvas');
    work.width = w0; work.height = h0;
    const wg = work.getContext('2d', { willReadFrequently: true });
    wg.drawImage(src, 0, 0, w0, h0);
    if (src.close) src.close();

    // 2) 투명 여백 찾기
    const data = wg.getImageData(0, 0, w0, h0).data;
    let x0 = w0, y0 = h0, x1 = -1, y1 = -1;
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        if (data[(y * w0 + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w0 - 1; y1 = h0 - 1; } // 전부 투명하면 그대로
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    // 3) 잘라서 최대 256px로
    const sc = Math.min(1, MAX_SIDE / Math.max(cw, ch));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * sc));
    out.height = Math.max(1, Math.round(ch * sc));
    const og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(work, x0, y0, cw, ch, 0, 0, out.width, out.height);

    const blob = await new Promise((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
    const bitmap = await createImageBitmap(blob);
    return { blob, bitmap };
  };
})(window.WM);
