// sets.js — 과일 이미지 세트: 기본(이모지) · 내가 올린 커스텀
window.WM = window.WM || {};
(function (WM) {
  const LS_SET = 'wm-image-set';

  WM.IMAGE_SETS = [
    { id: 'default', name: 'Default' },
    { id: 'custom', name: 'Custom' },
  ];
  const findSet = (id) => WM.IMAGE_SETS.find((s) => s.id === id);

  WM.customImages = new Array(WM.MAX_TIERS).fill(null); // 내가 올린 ImageBitmap (IndexedDB에 저장)
  WM.imageSet = 'default';

  WM.loadImageSetChoice = function () {
    try { const id = localStorage.getItem(LS_SET); return findSet(id) ? id : null; } catch { return null; }
  };

  // 세트를 바꾸고 그림을 다시 만든다
  WM.applyImageSet = async function (id) {
    const set = findSet(id) || findSet('default');
    if (set.id === 'custom') WM.images = WM.customImages; // 같은 배열이라 올리고 지우는 게 바로 반영된다
    else WM.images = new Array(WM.MAX_TIERS).fill(null);
    WM.imageSet = set.id;
    try { localStorage.setItem(LS_SET, set.id); } catch {}
    WM.rebuildSprites();
  };
})(window.WM);
