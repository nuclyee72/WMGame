// app.js — 화면 전환, 홈, 목표·도감, 다크 모드, 연결
window.WM = window.WM || {};
(async function (WM) {
  const $ = (s) => document.querySelector(s);
  const card = $('#card');
  const backBtn = $('#back-btn');
  const fmt = (n) => n.toLocaleString('en-US');
  let screen = 'home';

  WM.settings = WM.store.loadSettings();
  WM.settingsVersion = 0;
  WM.stats = WM.store.loadStats();

  // 내가 올려 둔 이미지 불러오기 → 고른 이미지 세트 적용 (처음이면 올린 게 있을 때 커스텀, 없으면 기본)
  const saved = await WM.store.getAllImages();
  for (const [tier, blob] of saved) {
    if (tier < 0 || tier >= WM.MAX_TIERS) continue;
    try { WM.customImages[tier] = await createImageBitmap(blob); } catch {}
  }
  const setChoice = WM.loadImageSetChoice() || (WM.customImages.some(Boolean) ? 'custom' : 'default');
  try { await WM.applyImageSet(setChoice); } catch { await WM.applyImageSet('default'); }

  const hasPhysics = !!window.Matter;
  if (hasPhysics) {
    WM.game.init({
      canvas: $('#board-canvas'),
      nextCanvas: $('#next-canvas'),
      onScore: (s) => {
        $('#score').textContent = fmt(s);
        $('#best').textContent = fmt(Math.max(WM.stats.best, s));
      },
      onDex: renderDex,
      onGoals: renderGoals,
      onOver: showOver,
    });
  } else {
    $('#home-error').textContent = "Couldn't load the physics engine. Check your internet connection.";
    $('#play-btn').disabled = true;
  }

  WM.initSettings({
    onChange: () => {
      if (WM.game.redrawNext) WM.game.redrawNext();
      paintGoalIcons();
      renderDex();
    },
  });

  // ── 화면 전환 ──
  function show(name, push) {
    screen = name;
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.dataset.screen !== name; });
    card.classList.toggle('is-sub', name !== 'home');
    card.classList.toggle('is-game', name === 'game');
    card.parentElement.classList.toggle('is-game', name === 'game'); // 게임 화면은 창 전체를 쓴다
    backBtn.hidden = name === 'home' || name === 'game'; // 게임 화면은 머리 줄 오른쪽 끝의 Back을 쓴다
    $('#help-pop').hidden = true;

    if (name === 'game') {
      if (WM.game.version !== WM.settingsVersion) newGame();
      paintGoalIcons();
      fitBoard();
      WM.game.start();
    } else if (hasPhysics) WM.game.stop();
    if (name === 'home') renderHome();
    if (name === 'settings') WM.renderSettings();
    if (push) history.pushState({ screen: name }, '');
  }

  function goBack() {
    if (history.state && history.state.screen) history.back();
    else show('home', false);
  }
  backBtn.addEventListener('click', goBack);
  $('#game-back-btn').addEventListener('click', goBack);
  window.addEventListener('popstate', (e) => show((e.state && e.state.screen) || 'home', false));

  // ── 홈 ──
  function renderHome() {
    const s = WM.stats;
    $('#stat-best').textContent = fmt(s.best);
    $('#stat-games').textContent = fmt(s.games);
    $('#stat-stars').textContent = s.bestStars ? '★'.repeat(s.bestStars) : '-';
    $('#play-btn').textContent = hasPhysics && WM.game.isActive() ? 'Continue' : 'Play';

    const strip = $('#home-strip');
    strip.innerHTML = '';
    const n = WM.settings.tierCount;
    const width = strip.clientWidth || 268;
    const size = Math.min(26, Math.floor((width - (n - 1) * 3) / n));
    for (let i = 0; i < n; i++) {
      const cv = document.createElement('canvas');
      WM.paintSprite(cv, i, size);
      strip.append(cv);
    }
  }

  $('#play-btn').addEventListener('click', () => {
    if (!WM.game.isActive()) newGame();
    show('game', true);
  });
  $('#settings-btn').addEventListener('click', () => show('settings', true));

  // ── 게임 ──
  function newGame() {
    $('#over').hidden = true;
    WM.game.newGame();
  }

  function paintStars(el, n) {
    el.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < n));
  }

  function showOver(r) {
    $('#over-title').textContent = r.cleared ? 'All clear!' : 'Game over';
    paintStars($('#over-stars'), r.stars);
    $('#over-score').textContent = fmt(r.score);
    const badge = $('#over-badge');
    if (r.isBest) { badge.dataset.status = 'solved'; badge.textContent = '🏆 New best'; }
    else { delete badge.dataset.status; badge.textContent = `Best ${fmt(r.best)}`; }
    $('#over').hidden = false;
  }

  let restartArmed = 0;
  const restartBtn = $('#restart-btn');
  restartBtn.addEventListener('click', () => {
    // 진행 중이면 한 번 더 눌러야 새로 시작한다
    if (WM.game.isActive() && !restartArmed) {
      restartBtn.classList.add('is-armed');
      restartBtn.textContent = 'Again?';
      restartArmed = setTimeout(disarmRestart, 2000);
      return;
    }
    disarmRestart();
    newGame();
    WM.game.start();
  });
  function disarmRestart() {
    clearTimeout(restartArmed);
    restartArmed = 0;
    restartBtn.classList.remove('is-armed');
    restartBtn.textContent = '↻';
  }

  $('#again-btn').addEventListener('click', () => { newGame(); WM.game.start(); });
  $('#over-settings-btn').addEventListener('click', () => show('settings', true));

  // ── 목표 ──
  function paintGoalIcons() {
    document.querySelectorAll('#goals canvas[data-sprite]').forEach((cv) => WM.paintSprite(cv, +cv.dataset.sprite, 20));
  }
  function renderGoals(g) {
    document.querySelectorAll('#goals .goal').forEach((el) => el.classList.toggle('is-done', !!g[el.dataset.goal]));
    const n = (g.g64 ? 1 : 0) + (g.socket ? 1 : 0) + (g.top ? 1 : 0);
    paintStars($('#goal-stars'), n);
    renderDex();
  }

  // 폰 세로 화면: 도감을 판 아래 가로 띠로 놓고 판을 화면 폭만큼 키운다
  const mobileQuery = window.matchMedia('(max-width: 600px)');
  const isMobile = () => mobileQuery.matches;

  // 게임판 크기: 화면 안에서 정사각형으로 가능한 한 크게 (도감·목표 줄 몫은 빼고)
  const MAX_BOARD = 820;
  const DEX_ROW_GAP = 4, DEX_LINK = 20; // 가로 띠: 과일 줄 · 연결 줄 · 타일 줄
  function fitBoard() {
    const board = $('#board');
    const dex = $('#dex');
    const px = (v) => parseFloat(v) || 0;
    const outer = (el) => el.offsetHeight + px(getComputedStyle(el).marginBottom);
    const cs = getComputedStyle(card);
    const slide = getComputedStyle(card.parentElement);
    const play = getComputedStyle($('.play-area'));
    const roomW = window.innerWidth - px(slide.paddingLeft) - px(slide.paddingRight) - px(cs.paddingLeft) - px(cs.paddingRight);
    const roomH = window.innerHeight - px(slide.paddingTop) - px(slide.paddingBottom)
      - px(cs.paddingTop) - px(cs.paddingBottom) - outer($('.game-head')) - outer($('#goals'));
    let w;
    if (isMobile()) {
      // 도감 띠 높이는 판 폭에 따라 정해지므로 두 번 맞춘다
      const ds = getComputedStyle(dex);
      const dexH = (bw) => px(ds.paddingTop) + px(ds.paddingBottom) + dexSize(bw) * 2 + DEX_LINK + DEX_ROW_GAP * 2;
      w = Math.min(roomW, MAX_BOARD);
      for (let i = 0; i < 2; i++) w = Math.min(roomW, roomH - px(play.rowGap) - dexH(w), MAX_BOARD);
      w = Math.max(160, Math.floor(w));
      dex.style.width = w + 'px';
      $('#goals').style.width = $('.game-head').style.width = w + 'px';
    } else {
      dex.style.width = '';
      w = Math.max(160, Math.floor(Math.min(roomW - dex.offsetWidth - px(play.columnGap), roomH, MAX_BOARD)));
      $('#goals').style.width = $('.game-head').style.width = (w + px(play.columnGap) + dex.offsetWidth) + 'px';
    }
    board.style.width = w + 'px';
    WM.game.resize(w);
    renderDex();
  }

  // 가로 띠에서 한 칸 크기 (8단계가 한 줄에 들어가게)
  function dexSize(bw) {
    const n = WM.game.tierCount();
    const ds = getComputedStyle($('#dex'));
    const inner = bw - (parseFloat(ds.paddingLeft) || 0) - (parseFloat(ds.paddingRight) || 0);
    return Math.max(14, Math.min(40, Math.floor((inner - (n - 1) * 6) / n)));
  }

  // 별 (글자 ★은 글꼴마다 위치가 달라 SVG로 가운데를 맞춘다)
  const STAR = '<svg class="star-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 5.95 6.55.8-4.8 4.55 1.22 6.5L12 17.2l-5.82 3.2 1.22-6.5-4.8-4.55 6.55-.8z"/></svg>';

  // ── 도감: 과일 단계와 2048 타일 (32가 7단계, 64가 8단계와 나란하도록 두 칸 밀어 놓는다) ──
  // 데스크톱은 판 옆 세로 두 줄, 폰은 판 아래 가로 두 줄
  let dexShown = { fruit: 0, tile: 0 }; // 마지막으로 그린 단계 (새로 열린 칸에 효과를 주려고)
  function renderDex() {
    const gridEl = $('#dex-grid');
    const n = WM.game.tierCount();
    const top = WM.game.maxTier();
    const maxTile = WM.game.maxTile();
    const goals = WM.game.goals();
    if (top < dexShown.fruit) dexShown.fruit = top; // 새 판
    if (maxTile < dexShown.tile) dexShown.tile = maxTile;
    const boardH = $('#board').offsetHeight;
    if (!boardH) return;
    const dex = $('#dex');
    const row = isMobile();
    dex.classList.toggle('is-row', row);
    gridEl.classList.toggle('is-row', row);

    let size, gap;
    if (row) {
      dex.style.height = '';
      gap = 6;
      size = dexSize(dex.offsetWidth);
      gridEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      gridEl.style.gridTemplateRows = `${size}px ${DEX_LINK}px ${size}px`;
      gridEl.style.rowGap = DEX_ROW_GAP + 'px';
      gridEl.style.columnGap = gap + 'px';
    } else {
      dex.style.height = boardH + 'px';
      const ds = getComputedStyle(dex);
      const inner = boardH - parseFloat(ds.paddingTop) - parseFloat(ds.paddingBottom) - $('.dex-head').offsetHeight - 6;
      const link = 24;
      gap = 8;
      const colW = (dex.clientWidth - parseFloat(ds.paddingLeft) - parseFloat(ds.paddingRight) - link) / 2;
      size = Math.max(10, Math.min(colW - 2, Math.floor((inner - (n - 1) * gap) / n)));
      gridEl.style.gridTemplateColumns = `1fr ${link}px 1fr`;
      gridEl.style.gridTemplateRows = '';
      gridEl.style.rowGap = gap + 'px';
      gridEl.style.columnGap = '';
    }
    gridEl.style.setProperty('--size', size + 'px');
    gridEl.style.setProperty('--gap', gap + 'px');
    const freshFruit = top > dexShown.fruit && dexShown.fruit > 0;
    const freshTile = maxTile > dexShown.tile && dexShown.tile > 0;

    const fruitsEl = [], linksEl = [], tilesEl = [];
    for (let i = 0; i < n; i++) {
      // 과일
      const f = document.createElement('div');
      f.className = 'dex-item' + (i < n - 1 ? ' has-next' : '');
      if (i < top) {
        const cv = document.createElement('canvas');
        WM.paintSprite(cv, i, size);
        f.append(cv);
        f.title = `Tier ${i + 1}`;
        if (i === top - 1) f.classList.add('is-top');
        if (freshFruit && i >= dexShown.fruit) f.classList.add('is-new');
      } else if (i === n - 1) {
        // 목표(마지막 단계)는 ? 대신 회색 별
        f.classList.add('is-goal');
        f.innerHTML = STAR;
        f.title = 'Goal: make Tier 8';
      } else {
        f.classList.add('is-unknown');
        f.style.fontSize = Math.round(size * 0.42) + 'px';
        f.textContent = '?';
      }
      fruitsEl.push(f);

      // 사이 칸은 비워 두고, 7단계 ↔ 32 연결선은 아래에서 따로 긋는다
      linksEl.push(document.createElement('div'));

      // 타일 (2, 4, 8 … 64)
      const v = i >= 2 ? Math.pow(2, i - 1) : 0;
      const t = document.createElement('div');
      if (v) {
        t.className = 'dex-tile' + (i < n - 1 ? ' has-next' : '');
        if (v <= maxTile) {
          const [bg, fg] = WM.TILE_COLORS[v];
          t.style.background = bg;
          t.style.color = fg;
          t.textContent = v;
          if (v === maxTile) t.classList.add('is-top');
          if (freshTile && v > dexShown.tile) t.classList.add('is-new');
          t.style.fontSize = Math.round(size * (v >= 10 ? 0.36 : 0.44)) + 'px';
        } else if (v === 64) {
          // 목표(64)는 ? 대신 회색 별
          t.classList.add('is-goal');
          t.innerHTML = STAR;
          t.title = 'Goal: make 64';
        } else {
          t.classList.add('is-unknown');
          t.textContent = '?';
          t.style.fontSize = Math.round(size * 0.44) + 'px';
        }
      }
      tilesEl.push(t);
    }
    gridEl.innerHTML = '';
    if (row) gridEl.append(...fruitsEl, ...linksEl, ...tilesEl);
    else for (let i = 0; i < n; i++) gridEl.append(fruitsEl[i], linksEl[i], tilesEl[i]);

    // 7단계 ↔ 32: 두 칸 가운데를 잇는 선 + 한가운데 별 배지 (이루면 금색)
    const a = fruitsEl[n - 2], b = tilesEl[n - 2];
    const ax = a.offsetLeft + a.offsetWidth / 2, ay = a.offsetTop + a.offsetHeight / 2;
    const bx = b.offsetLeft + b.offsetWidth / 2, by = b.offsetTop + b.offsetHeight / 2;
    const bond = document.createElement('div');
    bond.className = 'dex-bond' + (row ? ' is-vertical' : '') + (goals.socket ? ' is-done' : '');
    if (row) {
      bond.style.left = ax + 'px';
      bond.style.top = ay + 'px';
      bond.style.height = (by - ay) + 'px';
    } else {
      bond.style.left = ax + 'px';
      bond.style.top = ay + 'px';
      bond.style.width = (bx - ax) + 'px';
    }
    bond.title = 'Goal: Tier 7 into 32';
    bond.innerHTML = `<span class="dex-bond-star">${STAR}</span>`;
    gridEl.append(bond);
    dexShown = { fruit: top, tile: maxTile };
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (screen === 'game') fitBoard();
      else if (screen === 'home') renderHome();
      else WM.renderSettings();
    }, 80);
  });

  document.addEventListener('visibilitychange', () => {
    if (!hasPhysics) return;
    if (document.hidden) WM.game.stop();
    else if (screen === 'game') WM.game.start();
  });

  document.addEventListener('keydown', (e) => {
    if (screen !== 'game' || e.target.closest('input')) return;
    if (WM.game.key(e)) e.preventDefault();
  });

  // ── 방법 · 다크 모드 ──
  const help = $('#help-pop');
  $('#help-btn').addEventListener('click', (e) => { e.stopPropagation(); help.hidden = !help.hidden; });
  document.addEventListener('click', (e) => { if (!help.hidden && !help.contains(e.target)) help.hidden = true; });

  $('#dark-toggle').addEventListener('click', () => {
    const on = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (on) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('daily-dark-mode', on ? '1' : '0'); } catch {}
    if (hasPhysics) WM.game.refreshColors();
  });

  // 새로고침하면 항상 홈에서 시작 (남은 history 상태가 뒤로 가기를 꼬지 않게)
  history.replaceState(null, '');
  show('home', false);
})(window.WM);
