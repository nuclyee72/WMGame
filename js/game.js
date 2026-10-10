// game.js — 물리(matter.js), 낙하·합체·게임 오버, 2048 타일·스와이프·중력, 목표, 캔버스 그리기
window.WM = window.WM || {};
(function (WM) {
  // ── 판 모양: 가운데 4×4 칸(정사각형) + 네 변의 여백. 중력 반대쪽 여백에서 과일을 놓는다 ──
  const COLS = 4, ROWS = 4;
  const CELL = 100;                 // 칸 한 변
  const G = CELL * COLS;            // 칸 영역 한 변 400
  const PAD = 20;                   // 칸 영역 둘레에 더 둔 과일 자리 (작은 과일은 타일 옆·아래로 빠져 지나간다)
  const EDGE = 70;                  // 받침 바깥 여백 (떨어뜨리는 띠)
  const MARGIN = EDGE + PAD;        // 월드 가장자리에서 칸 영역까지
  const S = G + MARGIN * 2;         // 월드 한 변 580 (화면 크기와 무관)
  const BODY = CELL;                // 타일 몸통은 칸을 꽉 채운다 (이웃 타일·벽과 틈이 없어 과일이 끼지 않는다)
  const TILE = CELL - 6;            // 그림은 조금 작게 그려 칸이 보이게 한다
  const RIM = 14;                   // 받침 테두리 두께
  const LIMIT = EDGE - RIM / 2;     // 제한선 = 떨어뜨리는 쪽 받침 테두리 한가운데 (과일 윗부분이 이보다 바깥이면 위험)
  const TRAY_DEPTH = 6;             // 받침 두께 (그림자 쪽으로 보이는 옆면)
  const STEP = 1000 / 60;           // 고정 물리 스텝
  const SUBSTEPS = 2;               // 한 스텝을 나눠 풀어 겹침·떨림을 줄인다
  const COOLDOWN = 450;             // 다음 과일까지 대기
  const GRACE = 1000;               // 막 떨어진(또는 중력이 바뀐) 과일은 이 시간 동안 위험선 검사 제외
  const OVER_TIME = 2000;           // 제한선 밖으로 이만큼 삐져나와 있으면 게임 오버
  const POP_TIME = 160;             // 합체 팝 효과
  const BOUNCE = 0.3;               // 과일 탄성
  // 잘 구르게: 맞닿은 마찰은 남겨 굴러가며 돌게 하고, 멈춰 붙는 정지 마찰과 공기 저항은 낮춘다
  // (matter.js는 맞닿은 둘 중 정지 마찰이 큰 쪽을 쓰므로 벽·타일에도 같은 값을 준다)
  const FRICTION = 0.22;
  const FRICTION_STATIC = 0.08;
  const FRICTION_AIR = 0.003;
  const SURFACE = { friction: FRICTION, frictionStatic: FRICTION_STATIC };

  // ── 행동 순서: 가끔 과일 대신 스와이프가 나오고, 그때는 꼭 밀어야 한다 ──
  const SWIPE = 'swipe';
  const SWIPE_CHANCE = 0.4;         // 과일 다음에 스와이프가 나올 확률 (연달아 나오지는 않아 전체의 2/7쯤)
  const SPAWN_ROOM = 20;            // 새 타일 칸에 과일이 이만큼보다 덜 걸쳐 있으면 그냥 생겨 살짝 밀어낸다 (더 걸치면 비켜 줄 때까지 기다린다)
  const SETTLE_SPEED = 3;           // 스와이프 뒤 과일이 모두 이보다 느려지면(거의 자리를 잡으면) 새 타일이 생긴다
  const SETTLE_MAX = 800;           // …그래도 이 시간이 지나면 생긴다 (계속 떨어뜨리는 중이어도 너무 오래 기다리지 않게)
  const SWIPE_DIST = 30;            // 이만큼(화면 px) 끌면 스와이프

  // ── 타일 움직임 ──
  const TILE_SPEED0 = 6;            // 출발 속도 (스텝당 월드 px)
  const TILE_ACCEL = 2.5;           // 스텝마다 이만큼 빨라진다
  const TILE_SPEED_MAX = 22;
  const PUSH_SPEED = 5;             // 과일을 밀 때는 이 속도까지 느려진다
  const BOUNCE_SPEED = 14;          // 막혀서 되돌아갈 때 속도
  const TILE_HIT = 4;               // 부딪힌 과일에 실어 주는 타일 속도 상한 (실제로 빨리 움직여도 과일이 튕겨 날아가지 않게)
  const PUSH_AREA = 4500;           // 타일 앞 줄(한 칸 안)에 걸린 과일 면적 합이 이보다 크면 못 밀고 튕긴다
  const JAM_EXTRA = 6;              // 과일이 (지금 속도 + 이만큼)보다 깊이 파고들면 벽·타일에 끼인 것
  const JAM_STEPS = 2;              // …이 상태가 이만큼 이어지면 튕긴다
  const PACKING = 0.72;             // 과일이 빈 공간을 채울 수 있는 비율 (둥글어서 빈틈 없이는 못 채운다)

  // ── 32 타일: 몸통이 없어 과일이 그냥 지나간다 (움직일 때도 걸리지 않는다). 7단계 과일이 가운데에 오면 둘이 합쳐진다 ──
  // 합치기는 판마다 처음 한 번만 된다 (목표를 이룬 뒤의 32는 16처럼 빈 테두리일 뿐)
  const SOCKET = 32;
  const SOCKET_TIER = 6;            // 7단계 (0부터 셈)
  const SOCKET_SNAP = 22;           // 과일 중심이 타일 중심에서 이만큼 안이면 합친다
  const SOCKET_POINTS = 256;

  // ── 16 타일: 몸통이 없어 모든 과일이 그냥 지나간다 (스와이프 땐 다른 타일처럼 움직이고 합쳐진다) ──
  const OPEN = 16;
  const hollow = (v) => v === OPEN || v === SOCKET; // 속이 비어 맨 윗칸에 있어도 떨어뜨리기를 막지 않는다

  // ── 숨은 요소: 8단계 둘 → 9단계 과일, 64 둘 → 128 타일. 만들면 파란 별 (메인 목표 아님) ──
  const HIDDEN_TILE = 128;

  // ── 합체 효과 ──
  const KICK = 1.5;                 // 합쳐질 때 주변 과일을 미는 세기 (스텝당 px)
  const ESCAPE_SPEED = 0.3;         // 끼인 과일이 빈자리로 미끄러져 가는 빠르기 (ms당 월드 px)
  const ESCAPE_MIN = 220, ESCAPE_MAX = 600; // …가까워도 이만큼은 천천히, 멀어도 이보다 오래 걸리지 않게 (ms)
  const ESCAPE_NEAR = CELL;         // 이 안에서 다른 과일과도 덜 겹치는 빈자리를 먼저 찾는다
  const NUDGE = 1.2;                // 끼인 동안 타일 밖으로 조금씩 밀어내는 거리 (스텝당 px)

  // ── 판 밖으로 나가지 않게 ──
  const MAX_SPEED = 21;             // 과일 최고 속도 (스텝당 px). 맨 위에서 바닥까지 떨어질 때가 16쯤이라 그보다 넉넉히 위
  const MAX_GAIN = 3;               // 물리 반 스텝 동안 부딪혀서 붙을 수 있는 속도 (중력은 0.15쯤. 큰 과일에 맞은 작은 과일이 날아가지 않게)
  const BOUNCE_UP_MAX = 5;          // 튕길 때 중력 반대쪽 최고 속도 (맨 위에서 떨어져 바닥에 튕기는 게 4.8쯤)
  const BOUNCE_SIDE_MAX = 8.5;      // 중력에 수직인(옆으로 가는) 최고 속도 (굴러 내려가는 건 거의 6 아래)
  const WALL_SLACK = 0.25;          // 벽 너머로 반지름의 이만큼(최소 4px)보다 더 나가면 안으로 되돌린다
  const WALL_BOUNCE = 0.3;          // 되돌릴 때 바깥으로 가던 속도를 이만큼 거꾸로 튕긴다

  const DIRS = {
    down: { x: 0, y: 1 }, up: { x: 0, y: -1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  // 2048 타일 색 (캔버스 전용 구분색)
  const TILE_COLORS = {
    2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#f9f6f2'],
    16: ['#f59563', '#f9f6f2'], 32: ['#f67c5f', '#f9f6f2'], 64: ['#f65e3b', '#f9f6f2'],
    128: ['#edcf72', '#f9f6f2'], 256: ['#edcc61', '#f9f6f2'], 512: ['#edc850', '#f9f6f2'],
    1024: ['#edc53f', '#f9f6f2'], 2048: ['#edc22e', '#f9f6f2'],
  };
  WM.TILE_COLORS = TILE_COLORS;

  const game = { version: -1 };
  WM.game = game;

  let M, engine = null, canvas, ctx, nextCanvas, nextTileEl, cb = {};
  let settings, radii, N;
  let fruits = new Set(), queue = [], popups = [], walls = [], sparks = [], rings = [];
  let current = 0, next = 0, aim = S / 2, pressing = false, pendingDrop = false, press = null;
  let time = 0, lastDrop = -1e9, overTimer = 0, danger = false;
  let score = 0, maxTier = 0, maxTile = 0, over = false;
  let goals = { g64: false, socket: false, top: false }, hidden = { fruit9: false, tile128: false };
  let banner = null; // 판 가운데 잠깐 뜨는 글
  let gravity = 'down', tiles = new Set(), grid = [], phase = false;
  // 다음 타일: 값은 미리 굴려 두고, 생길 칸(nextSpot)은 스와이프 차례가 오면 정해 스와이프할 때까지 보여 준다
  // pendingTile = 스와이프 뒤 과일이 자리 잡길 기다리는 타일 (spot = 보여 준 칸. 놓을 때 막혔으면 다른 칸을 고른다)
  let nextTile = null, nextSpot = null, plannedSpawn = null, pendingTile = null, noRoom = false; // noRoom = 새 타일을 놓을 칸이 없어 끝났다
  let shadowAngle = Math.PI / 2;    // 그림자 방향 (중력 쪽으로 부드럽게 돈다)
  let raf = 0, lastTs = 0, acc = 0, scale = 1, dpr = 1;
  const colors = {
    rgb: '59, 49, 40', conflict: '#d9483b', green: '#4b8f4a', surface: '#fffbf4',
    tray: '#e7d9c4', trayEdge: '#d3c1a6', slot: '#f3eadd', shadow: '90, 64, 36', dark: false,
  };

  const clamp = WM.clamp;
  const randFruit = () => Math.floor(Math.random() * settings.dropCount);
  const rollNext = (prev) => (prev !== SWIPE && Math.random() < SWIPE_CHANCE ? SWIPE : randFruit());
  const spawnDepth = (r) => Math.max(EDGE / 2, r + 4);
  const rollTile = () => ({ value: Math.random() < 0.6 ? 2 : 4 }); // 4가 40%: 64가 8단계 과일과 비슷한 때쯤 나오게

  // ── 중력 방향 기준 좌표 ──
  // depth = 떨어뜨리는 쪽 바깥 가장자리에서 중력 방향으로 잰 거리
  // along = 그 가장자리를 따라 잰 거리 (칸 영역은 MARGIN ~ MARGIN + G)
  const isVertical = () => gravity === 'down' || gravity === 'up';
  function toWorld(depth, along) {
    switch (gravity) {
      case 'up': return { x: along, y: S - depth };
      case 'left': return { x: S - depth, y: along };
      case 'right': return { x: depth, y: along };
      default: return { x: along, y: depth };
    }
  }
  function depthOf(p) {
    switch (gravity) {
      case 'up': return S - p.y;
      case 'left': return S - p.x;
      case 'right': return p.x;
      default: return p.y;
    }
  }
  // 과일이 들어갈 수 있는 상자 = 4×4 칸과 둘레 PAD + 떨어뜨리는 쪽 여백
  function container() {
    const lo = EDGE, hi = MARGIN + G + PAD;
    switch (gravity) {
      case 'up': return { x0: lo, x1: hi, y0: lo, y1: S };
      case 'left': return { x0: lo, x1: S, y0: lo, y1: hi };
      case 'right': return { x0: 0, x1: hi, y0: lo, y1: hi };
      default: return { x0: lo, x1: hi, y0: 0, y1: hi };
    }
  }

  game.init = function (opts) {
    M = window.Matter;
    canvas = opts.canvas;
    nextCanvas = opts.nextCanvas;
    cb = opts;
    nextTileEl = opts.nextTileEl;
    ctx = canvas.getContext('2d');
    game.refreshColors();

    // 과일 차례: 끌어서 조준하고 떼면 놓기 · 스와이프 차례: 원하는 방향으로 끌기
    canvas.addEventListener('pointerdown', (e) => {
      if (over) return;
      pressing = true;
      press = { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      setAim(e);
    });
    canvas.addEventListener('pointermove', setAim);
    canvas.addEventListener('pointerup', (e) => {
      if (!pressing) return;
      pressing = false;
      if (current === SWIPE) {
        const dir = dragDir(e);
        press = null;
        if (dir) swipe(dir); // 처음 자리 가까이로 되돌려 떼면 취소
        return;
      }
      press = null;
      setAim(e);
      drop();
    });
    canvas.addEventListener('pointercancel', () => { pressing = false; press = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 폰에서 꾹 누를 때 메뉴가 뜨지 않게
  };

  // 누른 곳에서 SWIPE_DIST보다 멀리 끈 방향 (아니면 null)
  function dragDir(e) {
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= SWIPE_DIST) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  function setAim(e) {
    if (current === SWIPE) return;
    const rect = canvas.getBoundingClientRect();
    aim = isVertical()
      ? ((e.clientX - rect.left) / rect.width) * S
      : ((e.clientY - rect.top) / rect.height) * S;
  }

  const SWIPE_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  game.key = function (e) {
    if (!engine || over) return false;
    if (SWIPE_KEYS[e.key]) { swipe(SWIPE_KEYS[e.key]); return true; }
    // 한글 입력 상태에서도 되도록 e.code로 본다
    if (e.code === 'KeyA') { aim = Math.max(EDGE, aim - 14); return true; }
    if (e.code === 'KeyD') { aim = Math.min(S - EDGE, aim + 14); return true; }
    if (e.key === ' ' || e.key === 'Enter') { drop(); return true; }
    return false;
  };

  game.refreshColors = function () {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, def) => cs.getPropertyValue(name).trim() || def;
    colors.rgb = v('--text-given-rgb', colors.rgb);
    colors.conflict = v('--conflict', colors.conflict);
    colors.green = v('--text-input', colors.green);
    colors.surface = v('--surface-solid', colors.surface);
    colors.tray = v('--board-tray', colors.tray);
    colors.slot = v('--board-slot', colors.slot);
    colors.trayEdge = v('--board-tray-edge', colors.trayEdge);
    colors.shadow = v('--shadow-rgb', colors.shadow);
    colors.dark = document.documentElement.getAttribute('data-theme') === 'dark';
    drawNext();
  };

  game.newGame = function () {
    settings = WM.settings;
    radii = WM.radii(settings);
    radii.push(radii[radii.length - 1] * (radii[1] / radii[0])); // 숨은 9단계는 같은 비율로 한 단계 더 크게
    N = settings.tierCount;
    game.version = WM.settingsVersion;

    engine = M.Engine.create();
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    engine.positionIterations = 14;
    engine.velocityIterations = 10;
    M.Events.on(engine, 'collisionStart', onCollide);
    M.Events.on(engine, 'collisionActive', onCollide);

    fruits = new Set(); queue = []; popups = []; walls = []; sparks = []; rings = [];
    tiles = new Set(); phase = false;
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    gravity = 'down'; aim = S / 2; shadowAngle = Math.PI / 2;
    buildWalls();
    time = 0; lastDrop = -1e9; overTimer = 0; danger = false;
    score = 0; maxTier = 0; maxTile = 0; over = false; pendingDrop = false; acc = 0;
    goals = { g64: false, socket: false, top: false };
    hidden = { fruit9: false, tile128: false };
    banner = null;
    nextTile = rollTile(); nextSpot = null; plannedSpawn = null; pendingTile = null; noRoom = false;
    current = randFruit(); next = rollNext(current);
    cb.onScore && cb.onScore(0);
    cb.onDex && cb.onDex();
    cb.onGoals && cb.onGoals(game.goals());
    drawNext();
  };

  game.isActive = () => !!engine && !over && game.version === WM.settingsVersion;
  game.isOver = () => over;
  game.maxTier = () => maxTier;
  game.maxTile = () => maxTile;
  game.goals = () => ({ ...goals, ...hidden });
  game.tierCount = () => N || WM.settings.tierCount;

  // ── 목표 ──
  const starCount = () => (goals.g64 ? 1 : 0) + (goals.socket ? 1 : 0) + (goals.top ? 1 : 0);
  // 별 셋을 다 모아도 게임은 이어진다 (판에 잠깐 알리고, 끝날 때 All clear로 보여 준다)
  function setGoal(key) {
    if (goals[key] || over) return;
    goals[key] = true;
    cb.onGoals && cb.onGoals(game.goals());
    if (starCount() === 3) banner = { text: 'All clear!', sub: 'Keep going', t: time };
  }
  function setHidden(key) {
    if (hidden[key] || over) return;
    hidden[key] = true;
    cb.onGoals && cb.onGoals(game.goals());
  }

  // 상자 네 벽을 지금 중력에 맞춰 다시 세운다
  function buildWalls() {
    if (walls.length) M.Composite.remove(engine.world, walls);
    const c = container(), T = 100;
    const w = c.x1 - c.x0, h = c.y1 - c.y0, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    const opt = { isStatic: true, restitution: 0.2, ...SURFACE };
    walls = [
      M.Bodies.rectangle(c.x0 - T / 2, cy, T, h + T * 2, opt),
      M.Bodies.rectangle(c.x1 + T / 2, cy, T, h + T * 2, opt),
      M.Bodies.rectangle(cx, c.y0 - T / 2, w + T * 2, T, opt),
      M.Bodies.rectangle(cx, c.y1 + T / 2, w + T * 2, T, opt),
    ];
    M.Composite.add(engine.world, walls);
  }

  function advance() {
    current = next;
    next = rollNext(current);
    drawNext();
  }

  function makeFruit(tier, x, y) {
    const r = radii[tier];
    const c = container();
    const b = M.Bodies.circle(clamp(x, c.x0 + r, c.x1 - r), clamp(y, c.y0 + r, c.y1 - r), r, {
      restitution: BOUNCE,
      ...SURFACE,
      frictionAir: FRICTION_AIR,
      density: 0.001,
    });
    b.tier = tier;
    b.born = time;
    b.droppedAt = time;
    b.merged = false;
    fruits.add(b);
    M.Composite.add(engine.world, b);
    if (tier + 1 > maxTier) {
      maxTier = tier + 1;
      cb.onDex && cb.onDex();
    }
    if (tier === N - 1) setGoal('top');
    if (tier === N) setHidden('fruit9');
    return b;
  }

  // 놓는 쪽 맨 윗줄에서 along 위치의 칸에 있는 타일
  function topTile(along) {
    const i = clamp(Math.floor((along - MARGIN) / CELL), 0, COLS - 1);
    const w = toWorld(MARGIN + CELL / 2, MARGIN + (i + 0.5) * CELL);
    return grid[Math.floor((w.y - MARGIN) / CELL)][Math.floor((w.x - MARGIN) / CELL)];
  }

  // 지금 조준 위치에 놓을 과일 자리 (맨 윗칸에 막힌 타일이 있거나 타일과 겹치면 놓을 수 없다. 16·32는 속이 비어 통과)
  // 조준은 판 바닥 끝까지 된다. 칸 영역 옆 여백에 쏙 들어가는 작은 과일은 옆 칸 타일에 막히지 않는다
  function dropSpot() {
    const r = radii[current];
    const along = clamp(aim, EDGE + r, S - EDGE - r);
    const p = toWorld(spawnDepth(r), along);
    const inGrid = along + r > MARGIN + 1 && along - r < MARGIN + G - 1;
    const top = inGrid ? topTile(along) : null;
    const blocker = (top && !hollow(top.value) ? top : null)
      || [...tiles].find((t) => tileOverlap(p, r, t) > 0) || null;
    return { p, r, along, blocker };
  }

  // 맨 윗줄 네 칸이 모두 막혔으면 놓을 곳이 없으니 스와이프 차례를 끼워 넣는다
  function ensurePlayable() {
    if (current === SWIPE || phase) return;
    for (let i = 0; i < COLS; i++) {
      const t = topTile(MARGIN + (i + 0.5) * CELL);
      if (!t || hollow(t.value)) return;
    }
    next = current;
    current = SWIPE;
    drawNext();
  }

  function drop() {
    if (!engine || over || current === SWIPE) return;
    if (time - lastDrop < COOLDOWN) { pendingDrop = true; return; }
    pendingDrop = false;
    const spot = dropSpot();
    if (spot.blocker) return;
    makeFruit(current, spot.p.x, spot.p.y);
    lastDrop = time;
    advance();
  }

  function onCollide(ev) {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.tier === undefined || a.tier !== b.tier || a.merged || b.merged) continue;
      if (a.tier === N && settings.lastMerge === 'keep') continue;
      a.merged = b.merged = true;
      queue.push([a, b]);
    }
  }

  function processMerges() {
    if (!queue.length) return;
    for (const [a, b] of queue) {
      if (!fruits.has(a) || !fruits.has(b)) continue;
      const t = a.tier;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      M.Composite.remove(engine.world, [a, b]);
      fruits.delete(a); fruits.delete(b);
      let gained;
      if (t === N) {
        gained = WM.points(N + 1) * 2; // 숨은 9단계 둘이 만나면 사라지며 보너스
        burst(x, y, radii[t], t, 2);
      } else {
        const spot = findFit(x, y, radii[t + 1]);
        const nb = makeFruit(t + 1, spot.x, spot.y);
        nb.pop = true;
        nb.droppedAt = time - GRACE / 2;
        M.Body.setVelocity(nb, {
          x: (a.velocity.x + b.velocity.x) / 4,
          y: (a.velocity.y + b.velocity.y) / 4,
        });
        burst(spot.x, spot.y, radii[t + 1], t + 1, 1, nb);
        gained = WM.points(t + 2);
      }
      addScore(gained, x, y);
    }
    queue = [];
  }

  function addScore(gained, x, y) {
    score += gained;
    popups.push({ x, y, text: '+' + gained, t: time });
    cb.onScore && cb.onScore(score);
  }

  // ── 합체 효과: 과일 색 조각이 톡 터지고, 주변 과일이 살짝 밀려난다 ──
  const tintCache = new WeakMap();
  function tierColor(tier) {
    const sp = WM.sprites[tier];
    if (!WM.images[tier] || !sp) return WM.DEFAULT_TIERS[tier].color;
    if (!tintCache.has(sp)) {
      // 올린 그림은 작게 줄여 불투명한 픽셀의 평균색을 쓴다
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(sp, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
      }
      tintCache.set(sp, n ? `rgb(${Math.round(r / n)}, ${Math.round(gg / n)}, ${Math.round(b / n)})` : WM.DEFAULT_TIERS[tier].color);
    }
    return tintCache.get(sp);
  }

  function burst(x, y, r, tier, power, born, col) {
    col = col || tierColor(tier);
    rings.push({ x, y, r, t: time, col });
    const n = Math.round((8 + r / 6) * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.4 + Math.random() * 2.6) * (0.8 + r / 120);
      sparks.push({
        x: x + Math.cos(a) * r * 0.55, y: y + Math.sin(a) * r * 0.55,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: (2.2 + Math.random() * 3.2) * (0.8 + r / 140), t: time, life: 320 + Math.random() * 260, col,
      });
    }
    const range = r * 1.8 + 24;
    for (const b of fruits) {
      if (b === born || b.escape) continue;
      const dx = b.position.x - x, dy = b.position.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > range + b.circleRadius) continue;
      const k = KICK * Math.min(power, 1.5) * Math.max(0.2, 1 - d / (range + b.circleRadius));
      M.Body.setVelocity(b, { x: b.velocity.x + (dx / d) * k, y: b.velocity.y + (dy / d) * k });
    }
  }

  function updateEffects() {
    const g = DIRS[gravity];
    sparks = sparks.filter((s) => time - s.t < s.life);
    for (const s of sparks) {
      s.vx = s.vx * 0.94 + g.x * 0.09;
      s.vy = s.vy * 0.94 + g.y * 0.09;
      s.x += s.vx;
      s.y += s.vy;
    }
    rings = rings.filter((r) => time - r.t < 260);
    // 그림자는 중력 쪽으로 부드럽게 돈다
    const target = Math.atan2(g.y, g.x);
    let diff = Math.atan2(Math.sin(target - shadowAngle), Math.cos(target - shadowAngle));
    if (Math.abs(diff) > Math.PI - 1e-3) diff = Math.PI; // 정반대면 한쪽으로 돈다
    shadowAngle += diff * 0.14;
  }

  // ── 2048 타일 ──
  const cellCenter = (col, row) => ({ x: MARGIN + (col + 0.5) * CELL, y: MARGIN + (row + 0.5) * CELL });

  // 원이 정사각형 몸통에 파고든 깊이 (안 닿으면 0 이하)
  function squareOverlap(c, r, tp) {
    const dx = Math.abs(c.x - tp.x) - BODY / 2;
    const dy = Math.abs(c.y - tp.y) - BODY / 2;
    if (dx < 0 && dy < 0) return r + Math.min(-dx, -dy);
    return r - Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  }
  // 원이 타일에 파고든 깊이 (16·32는 모든 과일이 통과하니 겹침 없음)
  function tileOverlap(c, r, t) {
    if (hollow(t.value)) return -Infinity;
    return squareOverlap(c, r, t.body.position);
  }

  function tileBody(value, x, y) {
    // 16·32는 아무것과도 부딪히지 않는 몸통 (자리만 잡아 둔다)
    if (hollow(value)) return M.Bodies.rectangle(x, y, BODY, BODY, { isStatic: true, isSensor: true, collisionFilter: { category: 0, mask: 0, group: 0 } });
    return M.Bodies.rectangle(x, y, BODY, BODY, { isStatic: true, restitution: 0.2, ...SURFACE });
  }

  // 값이 바뀌어 몸통(꽉 찬 타일 · 빈 타일)이 달라지면 갈아 끼운다
  function setTileValue(t, value) {
    const kind = hollow(t.value);
    t.value = value;
    if (value > maxTile) { maxTile = value; cb.onDex && cb.onDex(); }
    if (value >= 64) setGoal('g64');
    if (value === HIDDEN_TILE) setHidden('tile128');
    if (kind === hollow(value)) return;
    const p = { x: t.body.position.x, y: t.body.position.y };
    M.Composite.remove(engine.world, t.body);
    t.body = tileBody(value, p.x, p.y);
    M.Composite.add(engine.world, t.body);
    // 구멍에 있던 과일은 막힌 타일이 되면 물리 계산 전에 바로 빠져나가게 한다 (깊이 겹친 채로 풀면 확 튕겨 나간다)
    for (const b of fruits) if (!b.escape && tileOverlap(b.position, b.circleRadius, t) > stuckDepth(b.circleRadius)) startEscape(b);
  }

  // (x, y)에서 가장 가까운, 반지름 r 원이 벽·타일과 겹치지 않는 자리를 찾는다 (없으면 그대로)
  function fits(x, y, r) {
    const c = container();
    if (x < c.x0 + r || x > c.x1 - r || y < c.y0 + r || y > c.y1 - r) return false;
    for (const t of tiles) if (tileOverlap({ x, y }, r, t) > 0.5) return false;
    return true;
  }
  function findFit(x, y, r) {
    if (fits(x, y, r)) return { x, y };
    for (let rad = 10; rad <= S * 1.5; rad += 10) {
      const n = Math.ceil((2 * Math.PI * rad) / 10);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (fits(px, py, r)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  // 끼인 과일이 갈 빈자리: 가까운 곳에서 다른 과일과도 거의 안 겹치는 자리를 먼저 찾고, 없으면 타일·벽만 피한다
  // (과일 한가운데로 들어가 충돌을 켜면 서로 확 밀어내 튀어 보인다)
  function escapeSpot(b) {
    const { x, y } = b.position, r = b.circleRadius;
    const roomy = (px, py) => {
      if (!fits(px, py, r)) return false;
      for (const o of fruits) {
        if (o === b) continue;
        const q = o.escape ? o.escape.to : o.position;
        if (r + o.circleRadius - Math.hypot(px - q.x, py - q.y) > r * 0.25) return false;
      }
      return true;
    };
    for (let rad = 6; rad <= ESCAPE_NEAR; rad += 6) {
      const n = Math.ceil((2 * Math.PI * rad) / 8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (roomy(px, py)) return { x: px, y: py };
      }
    }
    return findFit(x, y, r);
  }

  // 원 중심을 타일 몸통 밖으로 내보내는 방향 (가장 얕게 빠져나가는 쪽)
  function outOfTile(c, tp) {
    const dx = c.x - tp.x, dy = c.y - tp.y;
    const ex = Math.abs(dx) - BODY / 2, ey = Math.abs(dy) - BODY / 2;
    if (ex < 0 && ey < 0) return ex > ey ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
    const ox = Math.max(ex, 0) * Math.sign(dx), oy = Math.max(ey, 0) * Math.sign(dy), d = Math.hypot(ox, oy) || 1;
    return { x: ox / d, y: oy / d };
  }

  // 타일 반대쪽(밀려날 쪽)이 바로 벽인지 (칸 둘레 여백에서 타일과 벽 사이에 눌린 과일)
  function againstWall(b, n) {
    const c = container(), r = b.circleRadius, p = b.position;
    const gap = n.x > 0.5 ? c.x1 - p.x : n.x < -0.5 ? p.x - c.x0 : n.y > 0.5 ? c.y1 - p.y : n.y < -0.5 ? p.y - c.y0 : Infinity;
    return gap - r < 1.5;
  }

  // 타일·벽 사이에 끼인 과일은 먼저 타일 밖으로 조금씩 밀어내고, 그래도 안 빠지면 가까운 빈자리로 미끄러져 간다
  // 쌓인 무게로 조금 눌리는 건(반지름의 30%까지) 그대로 둔다. 다만 타일과 벽 사이에 눌린 건 얕아도 빼낸다 (둘 다 안 움직여 떤다)
  const stuckDepth = (r) => Math.max(10, r * 0.3), STUCK_STEPS = 24, PINCH_DEPTH = 2.5, PINCH_STEPS = 8;
  function freeStuck() {
    for (const b of fruits) {
      if (b.escape) continue;
      let deep = 0, at = null;
      for (const t of tiles) {
        const ov = tileOverlap(b.position, b.circleRadius, t);
        if (ov > deep) { deep = ov; at = t; }
      }
      const n = at && outOfTile(b.position, at.body.position);
      const pinched = deep > PINCH_DEPTH && againstWall(b, n);
      if (deep <= stuckDepth(b.circleRadius) && !pinched) { b.stuck = 0; continue; }
      b.stuck = (b.stuck || 0) + 1;
      if (b.stuck >= (pinched ? PINCH_STEPS : STUCK_STEPS)) { startEscape(b); continue; }
      if (pinched) continue; // 벽 쪽으로는 밀 수 없으니 기다렸다가 빈자리로
      // 타일 쪽으로 가던 속도는 지우고 바깥으로 살짝 민다 (나머지는 물리가 자연스럽게 풀게 둔다)
      const v = b.velocity;
      const into = v.x * n.x + v.y * n.y;
      if (into < 0) M.Body.setVelocity(b, { x: v.x - into * n.x, y: v.y - into * n.y });
      M.Body.translate(b, { x: n.x * NUDGE, y: n.y * NUDGE });
    }
  }
  // 지금 자리에서 to(없으면 가까운 빈자리)로 미끄러져 간다. 멀수록 오래 걸려 순간 이동처럼 보이지 않게
  function startEscape(b, to) {
    b.stuck = 0;
    to = to || escapeSpot(b);
    const dist = Math.hypot(to.x - b.position.x, to.y - b.position.y);
    if (dist < 1) return;
    // 가는 동안은 다른 것과 부딪히지 않는다 (isSensor는 이미 닿아 있던 상대에겐 안 먹어서 충돌 자체를 끈다)
    const mask = b.escape ? b.escape.mask : b.collisionFilter.mask;
    const dur = clamp(dist / ESCAPE_SPEED, ESCAPE_MIN, ESCAPE_MAX);
    b.escape = { from: { x: b.position.x, y: b.position.y }, to, t0: time, dur, mask };
    b.collisionFilter.mask = 0;
  }

  // 과일을 직접 옮긴다. matter.js가 겹침을 풀려고 쌓아 둔 위치 보정도 비운다
  // (안 비우면 끼어 있던 과일이 옮긴 뒤에도 그 보정만큼 엉뚱한 쪽으로, 판 밖까지 튄다)
  function place(b, pos, vel) {
    M.Body.setPosition(b, pos);
    M.Body.setVelocity(b, vel);
    b.positionImpulse.x = b.positionImpulse.y = 0;
  }

  function updateEscapes() {
    for (const b of fruits) {
      const e = b.escape;
      if (!e) continue;
      const k = Math.min(1, (time - e.t0) / e.dur);
      const ease = k * k * (3 - 2 * k); // 천천히 떠나 천천히 닿는다
      place(b, { x: e.from.x + (e.to.x - e.from.x) * ease, y: e.from.y + (e.to.y - e.from.y) * ease }, { x: 0, y: 0 });
      if (k < 1) continue;
      // 오는 사이 미끄러지던 타일이 그 자리를 차지했으면 다시 빈자리를 찾아 이어 간다 (겹친 채 충돌을 켜면 확 튕긴다)
      if (!fits(b.position.x, b.position.y, b.circleRadius)) {
        startEscape(b);
        if (b.escape !== e) continue;
      }
      // 도착하면 멈춘 채로 다시 물리에 맡긴다
      b.collisionFilter.mask = e.mask;
      b.escape = null;
      b.droppedAt = time;
    }
  }

  // 32 구멍에 7단계 과일이 자리 잡으면 둘이 합쳐져 사라진다 (판마다 한 번만)
  function checkSockets() {
    if (phase || goals.socket) return;
    for (const t of tiles) {
      if (t.value !== SOCKET) continue;
      const p = t.body.position;
      for (const b of fruits) {
        if (b.tier !== SOCKET_TIER || b.merged || b.escape) continue;
        if (Math.abs(b.position.x - p.x) > SOCKET_SNAP || Math.abs(b.position.y - p.y) > SOCKET_SNAP) continue;
        M.Composite.remove(engine.world, [b, t.body]);
        fruits.delete(b);
        tiles.delete(t);
        grid[t.row][t.col] = null;
        burst(p.x, p.y, radii[SOCKET_TIER] * 1.1, SOCKET_TIER, 2.4, null, TILE_COLORS[SOCKET][0]);
        burst(p.x, p.y, radii[SOCKET_TIER], SOCKET_TIER, 1.2);
        addScore(SOCKET_POINTS, p.x, p.y);
        setGoal('socket');
        break;
      }
    }
  }

  function makeTile(col, row, value) {
    const c = cellCenter(col, row);
    const t = {
      col, row, value, body: tileBody(value, c.x, c.y), state: 'done', to: null, mergeInto: null, merged: false,
      jam: 0, speed: 0, pushing: false, born: time, popAt: time,
    };
    grid[row][col] = t;
    tiles.add(t);
    M.Composite.add(engine.world, t.body);
    if (value > maxTile) { maxTile = value; cb.onDex && cb.onDex(); }
    return t;
  }

  function swipe(dir) {
    if (!engine || over || phase || current !== SWIPE) return;
    resolvePending(); // 아직 기다리던 타일은 지금 놓는다
    plannedSpawn = nextSpot || pickSpot(); // 보여 준 칸에 생기게 한다
    nextSpot = null;
    gravity = dir;
    engine.gravity.x = DIRS[dir].x;
    engine.gravity.y = DIRS[dir].y;
    buildWalls();
    // 새 상자 밖(이전에 떨어뜨리던 쪽 여백)에 남은 과일은 안으로 미끄러져 들어온다 (순간 이동하지 않게)
    // 빠져나가던 과일도 도착점이 새 상자 밖일 수 있어 새 상자 안으로 다시 잡는다
    const c = container();
    for (const b of fruits) {
      const r = b.circleRadius, p = b.escape ? b.escape.to : b.position;
      const x = clamp(p.x, c.x0 + r, c.x1 - r), y = clamp(p.y, c.y0 + r, c.y1 - r);
      if (b.escape || x !== b.position.x || y !== b.position.y) startEscape(b, findFit(x, y, r));
      b.droppedAt = time; // 다시 자리 잡을 때까지 위험선 검사를 쉰다
    }
    overTimer = 0;
    lastDrop = time;
    advance();
    phase = true;
    for (const t of tiles) { t.state = 'decide'; t.merged = false; t.jam = 0; t.speed = TILE_SPEED0 - TILE_ACCEL; }
  }

  // 칸 하나 앞으로 갈지 정한다 (2048 규칙: 같은 수의 멈춘 타일이면 합치고, 다르면 멈춘다)
  function decide(t) {
    const d = DIRS[gravity];
    const nc = t.col + d.x, nr = t.row + d.y;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) { t.state = 'done'; return; }
    const o = grid[nr][nc];
    if (!o) {
      grid[nr][nc] = t; // 가는 칸을 미리 잡아 둔다
      t.to = { col: nc, row: nr };
      t.state = 'move';
    } else if (o.state === 'done') {
      if (o.value === t.value && !o.merged) {
        t.to = { col: nc, row: nr };
        t.mergeInto = o;
        t.state = 'move';
      } else t.state = 'done';
    }
    // 앞 타일이 아직 움직이는 중이면 기다린다
  }

  // 막히면 마지막으로 다 들어간 칸으로 튕겨 돌아간다
  function bounce(t) {
    if (!t.mergeInto) grid[t.to.row][t.to.col] = null;
    t.mergeInto = null;
    t.to = null;
    t.jam = 0;
    t.state = 'bounce';
  }

  function arrive(t) {
    grid[t.row][t.col] = null;
    if (t.mergeInto) {
      const o = t.mergeInto;
      M.Composite.remove(engine.world, t.body);
      tiles.delete(t);
      t.state = 'gone';
      setTileValue(o, o.value * 2);
      o.merged = true;
      o.popAt = time;
      const c = cellCenter(o.col, o.row);
      addScore(o.value, c.x, c.y);
      return;
    }
    t.col = t.to.col;
    t.row = t.to.row;
    t.to = null;
    t.state = 'decide';
  }

  // 타일 앞에 과일이 닿아 있으면, 앞 줄 한 칸 안의 과일 면적을 모두 더한다 (줄줄이 밀리는 것까지 센다)
  // jammed = 닿은 과일이 (지금 속도 + 여유)나 반지름의 60%보다 깊이 파고들었다
  function frontContact(t) {
    const d = DIRS[gravity];
    const p = t.body.position;
    const face = p.x * d.x + p.y * d.y + BODY / 2;
    let touching = false, jammed = false, load = 0;
    for (const b of fruits) {
      if (b.escape) continue;
      const r = b.circleRadius;
      const ahead = (b.position.x - p.x) * d.x + (b.position.y - p.y) * d.y;
      if (ahead <= 0) continue;
      const ov = tileOverlap(b.position, r, t);
      if (ov > 0.5) {
        touching = true;
        if (ov > Math.min(t.speed + JAM_EXTRA, r * 0.6)) jammed = true;
      }
      const side = Math.abs((b.position.x - p.x) * d.y) + Math.abs((b.position.y - p.y) * d.x);
      const gap = b.position.x * d.x + b.position.y * d.y - r - face;
      if (side < BODY / 2 + r * 0.5 && gap < CELL * 0.9) load += Math.PI * r * r;
    }
    return { load: touching ? load : 0, jammed };
  }

  // 타일이 가는 칸에 들어가면 앞쪽(다음 막힌 타일이나 벽까지)에 남는 자리로는 앞 과일이 다 못 들어가는지
  // (판이 거의 찼을 때 과일을 억지로 눌러 넣으며 밀지 못하게: 못 들어가면 튕긴다)
  function laneCrowded(t) {
    const d = DIRS[gravity];
    const proj = (q) => q.x * d.x + q.y * d.y;
    const p = t.body.position;
    const c = container();
    let end = d.x > 0 ? c.x1 : d.x < 0 ? -c.x0 : d.y > 0 ? c.y1 : -c.y0;
    for (let col = t.to.col + d.x, row = t.to.row + d.y; col >= 0 && col < COLS && row >= 0 && row < ROWS; col += d.x, row += d.y) {
      const o = grid[row][col];
      if (o && o !== t && !hollow(o.value) && o.state !== 'move') { end = proj(cellCenter(col, row)) - BODY / 2; break; }
    }
    const room = (end - (proj(cellCenter(t.to.col, t.to.row)) + BODY / 2)) * BODY * PACKING;
    const face = proj(p) + BODY / 2;
    let area = 0;
    for (const b of fruits) {
      if (b.escape) continue;
      const r = b.circleRadius, a = proj(b.position);
      if (a + r <= face - 1 || a - r >= end) continue;
      const side = Math.abs((b.position.x - p.x) * d.y) + Math.abs((b.position.y - p.y) * d.x);
      const inLane = clamp((BODY / 2 + r - side) / (2 * r), 0, 1); // 줄 안에 든 만큼만 센다
      area += Math.PI * r * r * inLane;
    }
    return area > room;
  }

  // 타일 앞면에서 가는 길에 있는 가장 가까운 과일까지 거리 (16·32는 속이 비어 있어 따로 보지 않는다)
  function frontGap(t) {
    if (hollow(t.value)) return Infinity;
    const d = DIRS[gravity];
    const p = t.body.position;
    const face = p.x * d.x + p.y * d.y + BODY / 2;
    let gap = Infinity;
    for (const b of fruits) {
      if (b.escape) continue;
      const r = b.circleRadius;
      const side = Math.abs((b.position.x - p.x) * d.y) + Math.abs((b.position.y - p.y) * d.x);
      if (side >= BODY / 2 + r) continue; // 모서리에 스치는 과일도 본다
      const g = b.position.x * d.x + b.position.y * d.y - r - face;
      if (g > -r && g < gap) gap = g;
    }
    return gap;
  }

  // 가는 방향 맨 앞 타일부터
  function frontFirst() {
    const d = DIRS[gravity];
    return [...tiles].sort((a, b) => (b.col * d.x + b.row * d.y) - (a.col * d.x + a.row * d.y));
  }

  // 물리 스텝 전: 타일을 움직인다. 칸에 닿아도 멈추지 않고 남은 거리만큼 다음 칸으로 이어 간다
  function moveTiles() {
    if (!phase) return;
    for (const t of frontFirst()) {
      if (!tiles.has(t)) continue;
      if (t.state === 'decide') {
        decide(t);
        if (t.state === 'decide') { t.speed = TILE_SPEED0 - TILE_ACCEL; continue; } // 기다리는 중
      }
      if (t.state !== 'move' && t.state !== 'bounce') continue;
      let budget;
      if (t.state === 'move') {
        t.speed = Math.min(t.pushing ? PUSH_SPEED : TILE_SPEED_MAX, t.speed + TILE_ACCEL);
        // 앞 과일 바로 앞까지만 빠르게 가고, 닿으면 미는 속도로 (작은 과일을 한 번에 뚫고 지나가지 않게)
        budget = Math.min(t.speed, Math.max(0, frontGap(t)) + PUSH_SPEED);
      } else budget = BOUNCE_SPEED;

      let p = { x: t.body.position.x, y: t.body.position.y };
      while (budget > 0 && (t.state === 'move' || t.state === 'bounce')) {
        const target = t.state === 'move' ? cellCenter(t.to.col, t.to.row) : cellCenter(t.col, t.row);
        const dx = target.x - p.x, dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= budget) {
          p = target;
          budget -= dist;
          if (t.state === 'bounce') t.state = 'done';
          else {
            arrive(t);
            if (t.state === 'decide') decide(t);
          }
        } else {
          p = { x: p.x + (dx / dist) * budget, y: p.y + (dy / dist) * budget };
          budget = 0;
        }
      }
      if (!tiles.has(t)) continue; // 합쳐져서 사라졌다
      // 위치만 옮기고, 부딪힐 때 쓰는 속도는 낮게 따로 준다 (과일은 밀려나기만 하고 날아가지 않는다)
      const dx = p.x - t.body.position.x, dy = p.y - t.body.position.y, moved = Math.hypot(dx, dy);
      M.Body.setPosition(t.body, p, false);
      const k = t.state === 'done' || !moved ? 0 : Math.min(moved, TILE_HIT) / moved;
      M.Body.setVelocity(t.body, { x: dx * k, y: dy * k });
    }
  }

  // 물리 스텝 뒤: 미는 중인지, 끼었는지 보고 스와이프가 끝났는지 확인한다
  function updateTiles() {
    if (!phase) return;
    for (const t of tiles) {
      if (t.state !== 'move') { t.pushing = false; continue; }
      const { load, jammed } = frontContact(t);
      t.pushing = load > 0;
      t.jam = jammed ? t.jam + 1 : 0;
      if (t.jam >= JAM_STEPS || load > PUSH_AREA || (t.pushing && laneCrowded(t))) bounce(t);
    }
    if ([...tiles].every((t) => t.state === 'done')) endPhase();
  }

  function endPhase() {
    phase = false;
    for (const t of tiles) { t.merged = false; t.pushing = false; M.Body.setVelocity(t.body, { x: 0, y: 0 }); }
    placeNextTile();
    checkFull();
  }
  // 16칸이 모두 타일인데 합칠 수도 없으면 다음 스와이프 뒤에도 새 타일을 놓을 칸이 없으니 미리 끝낸다
  function checkFull() {
    if (tiles.size === COLS * ROWS && !canMerge()) { noRoom = true; endGame(); }
  }

  function canMerge() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = grid[row][col].value;
        if ((col + 1 < COLS && grid[row][col + 1].value === v) || (row + 1 < ROWS && grid[row + 1][col].value === v)) return true;
      }
    }
    return false;
  }

  // has(col, row)가 아닌 칸 (윗줄부터 왼쪽→오른쪽 순서)
  function freeCells(has) {
    const free = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) if (!has(col, row)) free.push({ col, row });
    return free;
  }

  // 칸을 과일이 덮은 깊이 (가장 깊이 걸친 과일 기준, 안 걸치면 0 이하)
  function fruitCover(col, row) {
    const c = cellCenter(col, row);
    let d = -Infinity;
    for (const b of fruits) if (!b.escape) d = Math.max(d, squareOverlap(b.position, b.circleRadius, c));
    return d;
  }
  // 타일이 없는 칸 중 랜덤: 과일이 없는 칸 → 과일이 살짝만 걸친 칸 → 가장 덜 덮인 칸 순 (타일 없는 칸이 없으면 null)
  function pickSpot() {
    const free = freeCells((col, row) => grid[row][col]);
    if (!free.length) return null;
    for (const c of free) c.cover = fruitCover(c.col, c.row);
    const clear = free.filter((c) => c.cover <= 0), light = free.filter((c) => c.cover <= SPAWN_ROOM);
    const pool = clear.length ? clear : light.length ? light : [free.reduce((a, c) => (c.cover < a.cover ? c : a))];
    const c = pool[Math.floor(Math.random() * pool.length)];
    return { col: c.col, row: c.row, value: nextTile.value };
  }

  // 스와이프가 끝나면 다음 타일을 기다리게 둔다. 16칸이 모두 타일이면 놓을 칸이 없으니 게임 끝
  function placeNextTile() {
    const spot = plannedSpawn;
    plannedSpawn = null;
    if (!freeCells((col, row) => grid[row][col]).length) {
      noRoom = true;
      endGame();
      return;
    }
    pendingTile = { spot, value: nextTile.value, t: time };
    nextTile = rollTile();
    drawNext();
    trySpawn();
  }
  // 스와이프로 바뀐 중력에 과일이 다 떨어져 자리 잡은 뒤에(또는 다음 스와이프를 하면 바로) 놓는다
  // (날아오는 과일이 막 생긴 타일에 부딪혀 튕기지 않게, 그리고 과일이 어디 있는지 정확히 보고 칸을 고르려고)
  // 보여 준 칸에 타일이 밀려 들어왔으면 다른 칸 중 랜덤. 과일이 덮은 칸에 놓을 땐 과일이 옆으로 비켜 나간다
  function trySpawn(now) {
    const p = pendingTile;
    if (!p || phase) return;
    if (!now && time - p.t < SETTLE_MAX) {
      for (const b of fruits) if (!b.escape && b.speed > SETTLE_SPEED) return;
    }
    const s = p.spot;
    const spot = s && !grid[s.row][s.col] ? s : pickSpot();
    pendingTile = null;
    if (!spot) return;
    const t = makeTile(spot.col, spot.row, p.value);
    for (const b of fruits) if (!b.escape && tileOverlap(b.position, b.circleRadius, t) > SPAWN_ROOM) startEscape(b);
    checkFull();
  }
  function resolvePending() {
    if (!phase) trySpawn(true);
  }

  function checkOver() {
    let above = false, near = false;
    for (const b of fruits) {
      // 상자 밖으로 튕겨 나간 과일은 치운다
      if (b.position.x < -200 || b.position.x > S + 200 || b.position.y < -200 || b.position.y > S + 200) {
        M.Composite.remove(engine.world, b); fruits.delete(b); continue;
      }
      if (b.escape || time - b.droppedAt < GRACE) continue;
      const top = depthOf(b.position) - b.circleRadius;
      if (top < LIMIT) above = true;
      if (top < LIMIT + 40) near = true;
    }
    overTimer = above ? overTimer + STEP : 0;
    danger = near;
    if (overTimer >= OVER_TIME) endGame();
  }

  function endGame() {
    if (over) return;
    over = true;
    pressing = false;
    const stars = starCount(), cleared = stars === 3;
    const blue = (hidden.fruit9 ? 1 : 0) + (hidden.tile128 ? 1 : 0);
    const stats = WM.stats;
    const isBest = score > stats.best;
    stats.games += 1;
    stats.best = Math.max(stats.best, score);
    stats.maxTier = Math.max(stats.maxTier, maxTier);
    stats.bestStars = Math.max(stats.bestStars || 0, stars);
    WM.store.saveStats(stats);
    cb.onOver && cb.onOver({ score, best: stats.best, isBest, maxTier, stars, blue, cleared, noRoom });
  }

  // 타일에 밀리거나 합체·충돌에 튕겨 너무 빨라진 과일을 늦춘다 (빠르면 벽을 뚫고 반대편으로 밀려날 수 있다)
  // 최고 속도와 함께, 한 번에 갑자기 붙는 속도도 막는다 (떨어지며 빨라지는 건 그대로, 맞아서 확 날아가는 것만)
  function capSpeed() {
    for (const b of fruits) {
      const v = b.velocity, sp = Math.hypot(v.x, v.y);
      const lim = Math.min(MAX_SPEED, b.lastSpeed === undefined ? sp : b.lastSpeed + MAX_GAIN);
      let vx = v.x, vy = v.y;
      if (sp > lim) { vx = (vx / sp) * lim; vy = (vy / sp) * lim; }
      // 중력 쪽(떨어지는) 속도는 그대로, 거꾸로 튀거나 옆으로 날아가는 속도는 따로 막는다
      const g = DIRS[gravity];
      const fall = vx * g.x + vy * g.y, side = vx * g.y - vy * g.x;
      const f = Math.max(fall, -BOUNCE_UP_MAX), s = clamp(side, -BOUNCE_SIDE_MAX, BOUNCE_SIDE_MAX);
      if (f !== fall || s !== side) { vx = f * g.x + s * g.y; vy = f * g.y - s * g.x; }
      if (vx !== v.x || vy !== v.y) M.Body.setVelocity(b, { x: vx, y: vy });
      b.lastSpeed = Math.hypot(vx, vy);
    }
  }

  // 벽 너머로 많이 나간 과일은 상자 안으로 되돌리고, 바깥으로 가던 속도는 안쪽으로 튕긴다
  function keepInside() {
    const c = container();
    for (const b of fruits) {
      if (b.escape) continue;
      const r = b.circleRadius, p = b.position, v = b.velocity;
      const slack = Math.max(4, r * WALL_SLACK);
      let x = p.x, y = p.y, vx = v.x, vy = v.y;
      if (x - r < c.x0 - slack) { x = c.x0 + r; if (vx < 0) vx = -vx * WALL_BOUNCE; }
      if (x + r > c.x1 + slack) { x = c.x1 - r; if (vx > 0) vx = -vx * WALL_BOUNCE; }
      if (y - r < c.y0 - slack) { y = c.y0 + r; if (vy < 0) vy = -vy * WALL_BOUNCE; }
      if (y + r > c.y1 + slack) { y = c.y1 - r; if (vy > 0) vy = -vy * WALL_BOUNCE; }
      if (x === p.x && y === p.y) continue;
      place(b, { x, y }, { x: vx, y: vy });
    }
  }

  function step() {
    moveTiles();
    updateEscapes();
    for (let i = 0; i < SUBSTEPS; i++) {
      M.Engine.update(engine, STEP / SUBSTEPS);
      capSpeed();
    }
    keepInside();
    time += STEP;
    updateTiles();
    trySpawn();
    processMerges();
    if (over) return;
    if (tiles.size) { freeStuck(); checkSockets(); }
    updateEffects();
    ensurePlayable();
    // 스와이프 차례가 오면 (앞 타일이 다 놓인 뒤) 다음 타일 칸을 정해 보여 준다
    if (current === SWIPE && !phase && !nextSpot && !pendingTile) nextSpot = pickSpot();
    if (pendingDrop && time - lastDrop >= COOLDOWN) drop();
    checkOver();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = lastTs ? Math.min(100, ts - lastTs) : 0;
    lastTs = ts;
    if (!over) {
      acc += dt;
      while (acc >= STEP) { step(); acc -= STEP; if (over) break; }
    }
    render();
  }

  game.start = function () {
    if (raf || !engine) return;
    lastTs = 0;
    raf = requestAnimationFrame(frame);
  };
  game.stop = function () {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pressing = false;
    press = null;
  };

  game.resize = function (cssW) {
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = canvas.style.height = cssW + 'px';
    canvas.width = canvas.height = Math.round(cssW * dpr);
    scale = cssW / S;
    if (engine) render();
  };

  // ── 그리기 ──
  // 스와이프 표시: 원 안에 네 방향 화살표
  function drawSwipeIcon(g, cx, cy, R, bg, fg) {
    g.save();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fg;
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((i * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -R * 0.72);
      g.lineTo(R * 0.25, -R * 0.4);
      g.lineTo(-R * 0.25, -R * 0.4);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(cx, cy, R * 0.13, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawNext() {
    if (nextTileEl && nextTile) {
      const [bg, fg] = TILE_COLORS[nextTile.value];
      nextTileEl.textContent = nextTile.value;
      nextTileEl.style.background = bg;
      nextTileEl.style.color = fg;
    }
    if (!nextCanvas || !engine) return;
    if (next === SWIPE) {
      const css = 30, px = Math.round(css * (window.devicePixelRatio || 1));
      if (nextCanvas.width !== px) { nextCanvas.width = nextCanvas.height = px; }
      nextCanvas.style.width = nextCanvas.style.height = css + 'px';
      const g = nextCanvas.getContext('2d');
      g.clearRect(0, 0, px, px);
      drawSwipeIcon(g, px / 2, px / 2, px / 2 - 1, colors.green, '#fff');
    } else WM.paintSprite(nextCanvas, next, 30);
  }
  game.redrawNext = drawNext;

  // 그림자 방향 (중력 쪽, 부드럽게 돈다)
  const shade = () => ({ x: Math.cos(shadowAngle), y: Math.sin(shadowAngle) });

  // 그림자 (오프셋·흐림은 화면 픽셀 기준이라 배율을 곱한다)
  function setShadow(alpha, blur, dist) {
    const v = shade();
    ctx.shadowColor = `rgba(${colors.shadow}, ${colors.dark ? Math.min(0.6, alpha * 2.2) : alpha})`;
    ctx.shadowBlur = blur * scale * dpr;
    ctx.shadowOffsetX = v.x * dist * scale * dpr;
    ctx.shadowOffsetY = v.y * dist * scale * dpr;
  }

  // 과일 그림 (shadow면 그림 모양 그대로 그림자를 깐다)
  function drawSprite(tier, x, y, r, angle, alpha, shadow) {
    const sp = WM.sprites[tier];
    if (!sp) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadow) setShadow(0.24, 5, 3);
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(sp, -r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function tileScale(t) {
    const age = time - t.popAt;
    if (age >= POP_TIME) return 1;
    const k = age / POP_TIME;
    return t.born === t.popAt ? 0.3 + 0.7 * k : 1 + 0.1 * Math.sin(k * Math.PI); // 생길 때 커지고, 합쳐질 때 톡
  }

  function drawTile(t, blocked) {
    if (t.value === SOCKET && !goals.socket) { drawSocket(t); return; }
    if (hollow(t.value)) { drawHollow(t); return; }
    const p = t.body.position;
    const s = tileScale(t);
    const v = shade();
    const [bg, fg] = TILE_COLORS[t.value] || ['#3c3a32', '#f9f6f2'];
    const w = TILE * s;
    ctx.save();
    // 그림자 쪽 두께로 살짝 도톰하게
    ctx.fillStyle = `rgba(${colors.shadow}, 0.16)`;
    roundRect(p.x - w / 2 + v.x * 3, p.y - w / 2 + v.y * 3, w, w, 10 * s);
    ctx.fill();
    ctx.fillStyle = bg;
    if (colors.dark) ctx.globalAlpha = 0.78; // 어두운 판에선 2048 색을 조금 눅인다
    roundRect(p.x - w / 2, p.y - w / 2, w, w, 10 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (blocked) {
      ctx.strokeStyle = colors.conflict;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time / 140);
      roundRect(p.x - w / 2 + 1.5, p.y - w / 2 + 1.5, w - 3, w - 3, 9 * s);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const digits = String(t.value).length;
    ctx.font = `700 ${Math.round((digits <= 2 ? 42 : digits === 3 ? 34 : 27) * s)}px Outfit, 'Pretendard Variable', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(t.value, p.x, p.y + 2);
    ctx.restore();
  }

  // 32: 비어 있는 가운데 (7단계 과일 자리를 흐리게 보여 준다)
  function drawSocket(t) {
    const p = t.body.position;
    const s = tileScale(t);
    const [bg] = TILE_COLORS[SOCKET];
    const hole = TILE / 2 - 6; // 7단계 과일 자리 표시 (칸 안쪽에 맞춘다)
    ctx.save();
    ctx.globalAlpha = colors.dark ? 0.75 : 0.9;
    ctx.strokeStyle = bg;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, hole * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawSprite(SOCKET_TIER, p.x, p.y, radii[SOCKET_TIER] * 0.9 * s, 0, 0.16, false);
    ctx.globalAlpha = 1;
    ctx.font = `700 ${Math.round(26 * s)}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = bg;
    ctx.fillText(SOCKET, p.x, p.y + 2);
    ctx.restore();
  }

  // 새 타일이 생길 칸: 연한 초록 점선 + 값. 칸 바닥은 그림자 쪽으로 파여 보이므로(drawTray) 보이는 바닥 한가운데에 맞춘다
  function drawGhost(col, row, value) {
    const v = shade(), c = cellCenter(col, row);
    const x = c.x + v.x * 1.25, y = c.y + v.y * 1.25;
    const w = TILE - Math.abs(v.x) * 2.5 - 10, h = TILE - Math.abs(v.y) * 2.5 - 10;
    const [bg, fg] = TILE_COLORS[value] || ['#3c3a32', '#f9f6f2'];
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = bg;
    roundRect(x - w / 2, y - h / 2, w, h, 8);
    ctx.fill();
    ctx.globalAlpha = colors.dark ? 0.45 : 0.32;
    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    const digits = String(value).length;
    ctx.globalAlpha = 0.5;
    ctx.font = `700 ${digits <= 2 ? 34 : digits === 3 ? 28 : 22}px Outfit, 'Pretendard Variable', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.dark ? '#f9f6f2' : fg === '#f9f6f2' ? bg : fg;
    ctx.fillText(value, x, y + 2);
    ctx.restore();
  }
  // 지금 할 차례가 스와이프일 때만, 스와이프 뒤 새 타일이 생길 칸을 보여 준다
  function drawNextTileSpot() {
    if (over || phase || current !== SWIPE) return;
    if (nextSpot) drawGhost(nextSpot.col, nextSpot.row, nextSpot.value);
  }

  // 16 (그리고 한 번 채운 뒤의 32): 몸통 없는 빈 타일 — 점선 테두리와 숫자만
  function drawHollow(t) {
    const p = t.body.position;
    const s = tileScale(t);
    const [bg] = TILE_COLORS[t.value];
    const w = (TILE - 6) * s;
    ctx.save();
    ctx.globalAlpha = colors.dark ? 0.16 : 0.12;
    ctx.fillStyle = bg;
    roundRect(p.x - w / 2, p.y - w / 2, w, w, 10 * s);
    ctx.fill();
    ctx.globalAlpha = colors.dark ? 0.8 : 0.9;
    ctx.strokeStyle = bg;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.font = `700 ${Math.round(34 * s)}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = bg;
    ctx.fillText(t.value, p.x, p.y + 2);
    ctx.restore();
  }

  function line(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // 떨어뜨리는 쪽 여백: 둥근 띠 + 중력 방향 화살표 (스와이프 차례에는 화살표 대신 스와이프 표시)
  function drawDropZone(swipeTurn) {
    const p0 = toWorld(6, EDGE), p1 = toWorld(EDGE - RIM - 2, S - EDGE);
    const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
    ctx.save();
    ctx.fillStyle = `rgba(${colors.rgb}, 0.035)`;
    roundRect(x, y, Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y), 14);
    ctx.fill();
    const mid = (6 + EDGE - RIM - 2) / 2;
    if (swipeTurn) {
      const c = toWorld(mid, S / 2);
      ctx.globalAlpha = 0.9;
      drawSwipeIcon(ctx, c.x, c.y, 17 * (1 + 0.06 * Math.sin(time / 170)), colors.green, '#fff');
      ctx.restore();
      return;
    }
    const g = DIRS[gravity];
    ctx.strokeStyle = `rgba(${colors.rgb}, 0.13)`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const c = toWorld(mid, MARGIN + (i + 0.5) * CELL);
      const ox = g.y ? 7 : 0, oy = g.x ? 7 : 0; // 화살표 날개 (중력에 수직)
      ctx.beginPath();
      ctx.moveTo(c.x - ox - g.x * 4, c.y - oy - g.y * 4);
      ctx.lineTo(c.x + g.x * 4, c.y + g.y * 4);
      ctx.lineTo(c.x + ox - g.x * 4, c.y + oy - g.y * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 판: 두께가 있는 받침 + 안으로 파인 칸 자리 (두께와 그늘은 그림자 방향을 따른다)
  function drawTray() {
    const x0 = EDGE - RIM, w = S - (EDGE - RIM) * 2, rad = 22;
    const v = shade();
    ctx.save();
    // 옆면(그림자 쪽으로 두께) + 바닥에 깔리는 그림자
    setShadow(0.2, 18, 8);
    ctx.fillStyle = colors.trayEdge;
    roundRect(x0 + v.x * TRAY_DEPTH, x0 + v.y * TRAY_DEPTH, w, w, rad);
    ctx.fill();
    ctx.restore();
    ctx.save();
    // 테두리 벽: 바닥보다 밝게 칠해 솟아 보이게 (벽 안쪽 끝 = 과일이 닿는 진짜 경계)
    ctx.fillStyle = colors.tray;
    roundRect(x0, x0, w, w, rad);
    ctx.fill();
    ctx.fillStyle = colors.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    // 바닥 (과일 상자와 딱 맞는다)
    const f0 = EDGE, fw = S - EDGE * 2, frad = 10; // 모서리는 가장 작은 과일만큼만 둥글게 (물리 벽은 각져 있다)
    ctx.fillStyle = colors.tray;
    roundRect(f0, f0, fw, fw, frad);
    ctx.fill();
    // 벽이 바닥에 드리우는 그늘 + 벽 안쪽 모서리 선
    ctx.save();
    ctx.clip();
    setShadow(0.3, 7, 3);
    ctx.fillStyle = colors.trayEdge;
    ctx.beginPath();
    ctx.rect(-S, -S, S * 3, S * 3);
    ctx.roundRect(f0, f0, fw, fw, frad);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = `rgba(${colors.shadow}, ${colors.dark ? 0.5 : 0.22})`;
    ctx.lineWidth = 1.5;
    roundRect(f0, f0, fw, fw, frad);
    ctx.stroke();
    // 벽 윗면 가장자리 빛
    ctx.strokeStyle = colors.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    roundRect(x0 + 0.75, x0 + 0.75, w - 1.5, w - 1.5, rad - 0.75);
    ctx.stroke();
    // 칸 자리: 빛 쪽 가장자리가 살짝 그늘져 안으로 들어가 보이게
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sx = MARGIN + col * CELL + 3, sy = MARGIN + row * CELL + 3;
        ctx.fillStyle = `rgba(${colors.shadow}, ${colors.dark ? 0.35 : 0.13})`;
        roundRect(sx, sy, TILE, TILE, 10);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = colors.slot;
        roundRect(sx + v.x * 2.5, sy + v.y * 2.5, TILE, TILE, 10);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.imageSmoothingQuality = 'high';
    const swipeTurn = engine && !over && current === SWIPE && !phase;

    drawDropZone(swipeTurn);
    drawTray();

    // 제한선: 떨어뜨리는 쪽 받침 테두리 한가운데
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (danger && !over) {
      const pulse = 0.5 + 0.4 * Math.abs(Math.sin(time / 180));
      ctx.strokeStyle = colors.conflict;
      ctx.globalAlpha = overTimer > 0 ? Math.max(pulse, 0.85) : pulse;
    } else {
      ctx.strokeStyle = `rgba(${colors.rgb}, 0.25)`;
    }
    line(toWorld(LIMIT, EDGE + 6), toWorld(LIMIT, S - EDGE - 6));
    ctx.restore();

    // 떨어뜨릴 과일 + 가이드 선 (맨 윗칸에 타일이 있으면 그 타일을 빨갛게 표시)
    let spot = null;
    if (engine && !over && current !== SWIPE) spot = dropSpot();
    for (const t of tiles) drawTile(t, spot && spot.blocker === t);
    if (engine) drawNextTileSpot();

    if (spot && !spot.blocker) {
      ctx.save();
      ctx.strokeStyle = `rgba(${colors.rgb}, 0.16)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 7]);
      ctx.lineCap = 'round';
      line(toWorld(spawnDepth(spot.r) + spot.r + 4, spot.along), toWorld(S - EDGE, spot.along));
      ctx.restore();
    }
    if (spot) {
      const ready = !spot.blocker && time - lastDrop >= COOLDOWN;
      drawSprite(current, spot.p.x, spot.p.y, spot.r, 0, ready ? 1 : 0.35, ready);
    }

    // 합체 고리
    for (const r of rings) {
      const k = (time - r.t) / 260;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.45;
      ctx.strokeStyle = r.col;
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.9 + 0.55 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 과일
    for (const b of fruits) {
      let s = 1;
      if (b.pop) {
        const age = time - b.born;
        if (age < POP_TIME) { const k = age / POP_TIME; s = 0.6 + 0.4 * (1 - (1 - k) * (1 - k)); }
      }
      if (b.escape) s *= 1 + 0.05 * Math.sin(Math.min(1, (time - b.escape.t0) / b.escape.dur) * Math.PI);
      drawSprite(b.tier, b.position.x, b.position.y, b.circleRadius * s, b.angle, 1, true);
    }

    // 합체 조각
    ctx.save();
    for (const s of sparks) {
      const k = (time - s.t) / s.life;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 점수 팝업
    const live = [];
    ctx.save();
    ctx.font = '700 20px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of popups) {
      const age = time - p.t;
      if (age > 800) continue;
      live.push(p);
      const k = age / 800;
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = 4;
      ctx.strokeStyle = colors.surface;
      ctx.strokeText(p.text, p.x, p.y - 30 * k);
      ctx.fillStyle = colors.green;
      ctx.fillText(p.text, p.x, p.y - 30 * k);
    }
    ctx.restore();
    popups = live;

    // 판 가운데 잠깐 뜨는 글 (별 셋을 다 모았을 때)
    if (banner && time - banner.t < 2600) {
      const age = time - banner.t, k = age / 2600;
      ctx.save();
      ctx.globalAlpha = Math.min(1, age / 200) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.font = '700 44px Outfit, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = colors.surface;
      ctx.strokeText(banner.text, S / 2, S / 2 - 12);
      ctx.fillStyle = '#f2b33d';
      ctx.fillText(banner.text, S / 2, S / 2 - 12);
      ctx.font = '600 20px Outfit, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeText(banner.sub, S / 2, S / 2 + 26);
      ctx.fillStyle = colors.green;
      ctx.fillText(banner.sub, S / 2, S / 2 + 26);
      ctx.restore();
    }
  }
})(window.WM);
