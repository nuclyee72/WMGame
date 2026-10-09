// settings.js — 과일 이미지: 세트 고르기(기본 · 미리 넣은 세트 · 커스텀) + 커스텀 칸 업로드 (규칙은 고정)
window.WM = window.WM || {};
(function (WM) {
  const $ = (s) => document.querySelector(s);
  let onChange = () => {};
  let clearArmed = 0;
  const isCustom = () => WM.imageSet === 'custom';

  WM.initSettings = function (opts) {
    onChange = opts.onChange || onChange;

    // 세트 탭
    const tabs = $('#set-tabs');
    tabs.innerHTML = WM.IMAGE_SETS.map((s) => `<button type="button" data-set="${s.id}">${s.name}</button>`).join('');
    tabs.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-set]');
      if (!btn || btn.dataset.set === WM.imageSet) return;
      showError('');
      try {
        await WM.applyImageSet(btn.dataset.set);
      } catch {
        showError("Couldn't load that set — open the game through the local server");
        await WM.applyImageSet('default');
      }
      WM.renderSettings();
      onChange('images');
    });

    // 한 장 올리기
    const one = $('#file-one');
    one.addEventListener('change', async () => {
      const file = one.files[0];
      const tier = +one.dataset.tier;
      one.value = '';
      if (file) { await setImage(tier, file); afterImages(); }
    });

    // 여러 장 — 파일 이름 순서(1, 2, 10…)대로 1단계부터 채운다
    const many = $('#file-many');
    $('#multi-btn').addEventListener('click', () => many.click());
    many.addEventListener('change', async () => {
      const files = [...many.files].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      many.value = '';
      const n = Math.min(files.length, WM.settings.tierCount);
      for (let i = 0; i < n; i++) await setImage(i, files[i]);
      afterImages();
      const extra = files.length - n;
      if (extra > 0) showError(`Skipped ${extra} file${extra > 1 ? 's' : ''} — there are only ${n} tiers`);
    });

    // 모두 지우기 — 한 번 더 눌러야 지운다
    const clearBtn = $('#clear-btn');
    clearBtn.addEventListener('click', async () => {
      if (!WM.customImages.some(Boolean)) return;
      if (!clearArmed) {
        clearBtn.textContent = 'Tap again to clear';
        clearArmed = setTimeout(disarmClear, 2500);
        return;
      }
      disarmClear();
      WM.customImages.forEach((b) => b && b.close && b.close());
      WM.customImages.fill(null);
      await WM.store.clearImages();
      afterImages();
    });
  };

  function disarmClear() {
    clearTimeout(clearArmed);
    clearArmed = 0;
    $('#clear-btn').textContent = 'Clear all';
  }

  function showError(msg) { $('#images-error').textContent = msg; }

  async function setImage(tier, file) {
    showError('');
    try {
      const { blob, bitmap } = await WM.loadImageFile(file);
      const old = WM.customImages[tier];
      if (old && old.close) old.close();
      WM.customImages[tier] = bitmap;
      await WM.store.putImage(tier, blob);
    } catch {
      showError(`Couldn't read ${file.name}`);
    }
  }

  async function removeImage(tier) {
    const old = WM.customImages[tier];
    if (old && old.close) old.close();
    WM.customImages[tier] = null;
    await WM.store.deleteImage(tier);
    afterImages();
  }

  function afterImages() {
    WM.rebuildSprites();
    WM.renderSettings();
    onChange('images');
  }

  // ── 그리기 ──
  WM.renderSettings = function () {
    const custom = isCustom();
    document.querySelectorAll('#set-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.set === WM.imageSet));
    $('#custom-actions').hidden = !custom;

    const grid = $('#slot-grid');
    grid.classList.toggle('is-locked', !custom);
    const n = WM.settings.tierCount;
    grid.innerHTML = '';
    const size = grid.clientWidth ? Math.floor((grid.clientWidth - 3 * 8) / 4) : 60;
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'slot-wrap';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot' + (custom && WM.customImages[i] ? ' has-image' : '');
      btn.disabled = !custom; // 기본·미리 넣은 세트는 보기만
      btn.setAttribute('aria-label', custom ? `Change tier ${i + 1} image` : `Tier ${i + 1}`);
      const cv = document.createElement('canvas');
      WM.paintSprite(cv, i, Math.round(size * 0.7));
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = i + 1;
      btn.append(cv, num);
      if (custom) {
        btn.addEventListener('click', () => {
          const input = $('#file-one');
          input.dataset.tier = i;
          input.click();
        });
        // 데스크톱: 파일을 칸에 끌어다 놓기
        btn.addEventListener('dragover', (e) => { e.preventDefault(); btn.classList.add('is-drag'); });
        btn.addEventListener('dragleave', () => btn.classList.remove('is-drag'));
        btn.addEventListener('drop', async (e) => {
          e.preventDefault();
          btn.classList.remove('is-drag');
          const file = e.dataTransfer.files[0];
          if (file) { await setImage(i, file); afterImages(); }
        });
      }
      wrap.append(btn);

      if (custom && WM.customImages[i]) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'slot-del';
        del.textContent = '×';
        del.setAttribute('aria-label', `Remove tier ${i + 1} image`);
        del.addEventListener('click', () => removeImage(i));
        wrap.append(del);
      }
      grid.append(wrap);
    }

    const used = WM.customImages.slice(0, n).filter(Boolean).length;
    let note;
    if (WM.imageSet === 'default') note = 'The original fruits';
    else if (!custom) note = `${WM.IMAGE_SETS.find((s) => s.id === WM.imageSet).name} set · switch to Custom to use your own`;
    else if (used) note = `${used} of ${n} tiers use your images · empty slots use the default fruit`;
    else note = 'Tap a slot to upload a PNG · empty slots use the default fruit';
    $('#images-note').textContent = note;
  };
})(window.WM);
