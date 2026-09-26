(() => {
  "use strict";

  const SAVE_KEY = "kristallkaskade-save";
  const TYPES = { NORMAL: "normal", H: "stripeH", V: "stripeV", WRAP: "wrapped", BOMB: "bomb" };
  const COLOR_COUNT_MAX = 6;
  const LEVELS = 20;

  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $("menu"),
    levels: $("levels"),
    howto: $("howto"),
    game: $("game"),
  };

  let save = loadSave();
  let state = null;
  let busy = false;
  let selected = null;
  let pointer = null;

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { unlocked: 1, best: {} };
  }
  function persist() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function levelSpec(n) {
    const colors = n <= 2 ? 5 : 6;
    const moves = Math.max(14, 28 - Math.floor((n - 1) * 0.7));
    const target = 1400 + (n - 1) * 850 + (n - 1) * (n - 1) * 35;
    return { id: n, rows: 8, cols: 8, colors, moves, target };
  }

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function makeTile(color, type = TYPES.NORMAL) {
    return { id: uid(), color, type };
  }

  function randomColor(colors) {
    return Math.floor(Math.random() * colors);
  }

  function inBounds(board, r, c) {
    return r >= 0 && c >= 0 && r < board.length && c < board[0].length;
  }

  function sameColor(a, b) {
    return a && b && a.type !== TYPES.BOMB && b.type !== TYPES.BOMB && a.color === b.color;
  }

  function findRuns(board) {
    const rows = board.length;
    const cols = board[0].length;
    const rowRuns = [];
    const colRuns = [];
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const start = board[r][c];
        if (!start || start.type === TYPES.BOMB) { c++; continue; }
        let n = c + 1;
        while (n < cols && sameColor(start, board[r][n])) n++;
        if (n - c >= 3) rowRuns.push({ r, c0: c, c1: n - 1, color: start.color, len: n - c });
        c = n;
      }
    }
    for (let c = 0; c < cols; c++) {
      let r = 0;
      while (r < rows) {
        const start = board[r][c];
        if (!start || start.type === TYPES.BOMB) { r++; continue; }
        let n = r + 1;
        while (n < rows && sameColor(start, board[n][c])) n++;
        if (n - r >= 3) colRuns.push({ c, r0: r, r1: n - 1, color: start.color, len: n - r });
        r = n;
      }
    }
    return { rowRuns, colRuns };
  }

  function key(r, c) { return r + "," + c; }
  function parseKey(k) {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  }

  function collectMatchCells(runs) {
    const cells = new Set();
    const rowAt = new Map();
    const colAt = new Map();
    for (const run of runs.rowRuns) {
      for (let c = run.c0; c <= run.c1; c++) {
        const k = key(run.r, c);
        cells.add(k);
        rowAt.set(k, run);
      }
    }
    for (const run of runs.colRuns) {
      for (let r = run.r0; r <= run.r1; r++) {
        const k = key(r, run.c);
        cells.add(k);
        colAt.set(k, run);
      }
    }
    return { cells, rowAt, colAt };
  }

  function components(cells, board) {
    const left = new Set(cells);
    const groups = [];
    for (const start of cells) {
      if (!left.has(start)) continue;
      const { r: sr, c: sc } = parseKey(start);
      const color = board[sr][sc] && board[sr][sc].color;
      const stack = [start];
      const group = [];
      left.delete(start);
      while (stack.length) {
        const cur = stack.pop();
        group.push(cur);
        const { r, c } = parseKey(cur);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key(r + dr, c + dc);
          if (!left.has(nk)) continue;
          const t = board[r + dr][c + dc];
          if (t && t.color === color && t.type !== TYPES.BOMB) {
            left.delete(nk);
            stack.push(nk);
          }
        }
      }
      groups.push({ color, cells: group });
    }
    return groups;
  }

  function specialForGroup(group, rowAt, colAt, prefer) {
    let five = null;
    let four = null;
    let corner = null;
    for (const k of group.cells) {
      const rr = rowAt.get(k);
      const cr = colAt.get(k);
      if (rr && rr.len >= 5) five = { k, dir: "h", run: rr };
      if (cr && cr.len >= 5) five = { k, dir: "v", run: cr };
      if (rr && cr) corner = k;
      if (rr && rr.len === 4) four = { k, type: TYPES.H };
      if (cr && cr.len === 4) four = { k, type: TYPES.V };
    }
    const pickCell = (fallback) => {
      if (prefer && group.cells.includes(prefer)) return prefer;
      return fallback || group.cells[Math.floor(group.cells.length / 2)];
    };
    if (five) return { at: pickCell(five.k), type: TYPES.BOMB, color: -1 };
    if (corner) return { at: pickCell(corner), type: TYPES.WRAP, color: group.color };
    if (four) return { at: pickCell(four.k), type: four.type, color: group.color };
    return null;
  }

  function addCell(set, r, c, board) {
    if (!inBounds(board, r, c)) return;
    set.add(key(r, c));
  }

  function expandSpecial(board, r, c, into, queue, seenSpec) {
    const tile = board[r][c];
    if (!tile) return;
    if (seenSpec.has(tile.id)) return;
    seenSpec.add(tile.id);
    const rows = board.length;
    const cols = board[0].length;
    if (tile.type === TYPES.H) {
      for (let x = 0; x < cols; x++) addCell(into, r, x, board);
    } else if (tile.type === TYPES.V) {
      for (let y = 0; y < rows; y++) addCell(into, y, c, board);
    } else if (tile.type === TYPES.WRAP) {
      for (let y = r - 1; y <= r + 1; y++) {
        for (let x = c - 1; x <= c + 1; x++) addCell(into, y, x, board);
      }
    } else if (tile.type === TYPES.BOMB) {
      const counts = Array(COLOR_COUNT_MAX).fill(0);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const t = board[y][x];
          if (t && t.type !== TYPES.BOMB && t.color >= 0) counts[t.color]++;
        }
      }
      let best = 0;
      for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const t = board[y][x];
          if (t && t.color === best) addCell(into, y, x, board);
        }
      }
    }
    queue.push(...[...into].map(parseKey));
  }

  function applyCombo(board, a, b) {
    const rows = board.length;
    const cols = board[0].length;
    const clear = new Set();
    const pending = [];
    const ta = board[a.r][a.c];
    const tb = board[b.r][b.c];
    const focus = b;
    const paint = (color, type) => {
      const spots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = board[r][c];
          if (t && t.color === color) {
            t.type = type === "alt" ? ((r + c) % 2 === 0 ? TYPES.H : TYPES.V) : type;
            spots.push({ r, c });
          }
        }
      }
      return spots;
    };
    if (ta.type === TYPES.BOMB && tb.type === TYPES.BOMB) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) clear.add(key(r, c));
    } else if (ta.type === TYPES.BOMB || tb.type === TYPES.BOMB) {
      const other = ta.type === TYPES.BOMB ? tb : ta;
      if (other.type === TYPES.H || other.type === TYPES.V) {
        paint(other.color, "alt").forEach((p) => clear.add(key(p.r, p.c)));
      } else if (other.type === TYPES.WRAP) {
        paint(other.color, TYPES.WRAP).forEach((p) => clear.add(key(p.r, p.c)));
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const t = board[r][c];
            if (t && t.color === other.color) clear.add(key(r, c));
          }
        }
      }
      clear.add(key(a.r, a.c));
      clear.add(key(b.r, b.c));
    } else if ((ta.type === TYPES.H || ta.type === TYPES.V) && (tb.type === TYPES.H || tb.type === TYPES.V)) {
      for (let x = 0; x < cols; x++) clear.add(key(focus.r, x));
      for (let y = 0; y < rows; y++) clear.add(key(y, focus.c));
    } else if (((ta.type === TYPES.H || ta.type === TYPES.V) && tb.type === TYPES.WRAP) || ((tb.type === TYPES.H || tb.type === TYPES.V) && ta.type === TYPES.WRAP)) {
      for (let dr = -1; dr <= 1; dr++) {
        const rr = focus.r + dr;
        if (rr >= 0 && rr < rows) for (let x = 0; x < cols; x++) clear.add(key(rr, x));
      }
      for (let dc = -1; dc <= 1; dc++) {
        const cc = focus.c + dc;
        if (cc >= 0 && cc < cols) for (let y = 0; y < rows; y++) clear.add(key(y, cc));
      }
    } else if (ta.type === TYPES.WRAP && tb.type === TYPES.WRAP) {
      for (let y = focus.r - 2; y <= focus.r + 2; y++) {
        for (let x = focus.c - 2; x <= focus.c + 2; x++) addCell(clear, y, x, board);
      }
      pending.push({ r: focus.r, c: focus.c, kind: "wrap5" });
    } else {
      clear.add(key(a.r, a.c));
      clear.add(key(b.r, b.c));
    }
    return { clear, pending };
  }

  function hasMatch(board) {
    const runs = findRuns(board);
    return runs.rowRuns.length + runs.colRuns.length > 0;
  }

  function wouldMatch(board, r1, c1, r2, c2) {
    const a = board[r1][c1];
    const b = board[r2][c2];
    if (!a || !b) return false;
    if (a.type !== TYPES.NORMAL || b.type !== TYPES.NORMAL) {
      if (a.type !== TYPES.NORMAL && b.type !== TYPES.NORMAL) return true;
      if (a.type === TYPES.BOMB || b.type === TYPES.BOMB) return true;
    }
    board[r1][c1] = b;
    board[r2][c2] = a;
    const ok = hasMatch(board);
    board[r1][c1] = a;
    board[r2][c2] = b;
    return ok;
  }

  function hasMove(board) {
    const rows = board.length;
    const cols = board[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols && wouldMatch(board, r, c, r, c + 1)) return true;
        if (r + 1 < rows && wouldMatch(board, r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  function fillRandom(spec) {
    const board = [];
    for (let r = 0; r < spec.rows; r++) {
      board[r] = [];
      for (let c = 0; c < spec.cols; c++) board[r][c] = makeTile(randomColor(spec.colors));
    }
    return board;
  }

  function generateBoard(spec) {
    for (let i = 0; i < 80; i++) {
      const board = fillRandom(spec);
      if (!hasMatch(board) && hasMove(board)) return board;
    }
    const board = fillRandom(spec);
    scramble(board, spec);
    return board;
  }

  function scramble(board, spec) {
    const tiles = board.flat();
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    let k = 0;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) board[r][c] = tiles[k++];
    }
    if (hasMatch(board) || !hasMove(board)) {
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) board[r][c] = makeTile(randomColor(spec.colors));
      }
    }
  }

  function gravityAndFill(board, spec) {
    const rows = board.length;
    const cols = board[0].length;
    for (let c = 0; c < cols; c++) {
      let write = rows - 1;
      for (let r = rows - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (write !== r) {
            board[write][c] = board[r][c];
            board[r][c] = null;
          }
          write--;
        }
      }
      while (write >= 0) {
        board[write][c] = makeTile(randomColor(spec.colors));
        write--;
      }
    }
  }

  function resolveOnce(board, preferKey, forcedClear, pendingIn) {
    const runs = findRuns(board);
    const found = collectMatchCells(runs);
    const clear = new Set(forcedClear || []);
    found.cells.forEach((k) => clear.add(k));
    const created = [];
    if (found.cells.size) {
      const groups = components(found.cells, board);
      for (const g of groups) {
        const spec = specialForGroup(g, found.rowAt, found.colAt, preferKey);
        if (spec) {
          created.push(spec);
          clear.delete(spec.at);
        }
      }
    }
    const queue = [...clear].map(parseKey);
    const seen = new Set();
    for (const p of queue) {
      const t = board[p.r] && board[p.r][p.c];
      if (t && t.type !== TYPES.NORMAL) expandSpecial(board, p.r, p.c, clear, queue, seen);
    }
    for (const k of [...clear]) {
      const { r, c } = parseKey(k);
      const t = board[r] && board[r][c];
      if (t && t.type !== TYPES.NORMAL && !seen.has(t.id)) expandSpecial(board, r, c, clear, queue, seen);
    }
    const pending = pendingIn ? [...pendingIn] : [];
    let cleared = 0;
    const wrapCenters = [];
    for (const k of clear) {
      const { r, c } = parseKey(k);
      if (!inBounds(board, r, c) || !board[r][c]) continue;
      if (board[r][c].type === TYPES.WRAP) wrapCenters.push({ r, c });
      board[r][c] = null;
      cleared++;
    }
    for (const s of created) {
      const { r, c } = parseKey(s.at);
      board[r][c] = makeTile(s.type === TYPES.BOMB ? -1 : s.color, s.type);
    }
    for (const w of wrapCenters) pending.push({ r: w.r, c: w.c, kind: "wrap2" });
    return { cleared, created: created.length, pending, did: cleared > 0 || created.length > 0 };
  }

  function applyPending(board, pending) {
    const clear = new Set();
    const next = [];
    for (const p of pending) {
      if (p.kind === "wrap2") {
        for (let y = p.r - 1; y <= p.r + 1; y++) {
          for (let x = p.c - 1; x <= p.c + 1; x++) addCell(clear, y, x, board);
        }
      } else if (p.kind === "wrap5") {
        for (let y = p.r - 2; y <= p.r + 2; y++) {
          for (let x = p.c - 2; x <= p.c + 2; x++) addCell(clear, y, x, board);
        }
      }
    }
    return { clear, next };
  }

  function scoreFor(cleared, cascade, specials) {
    return cleared * (40 + cascade * 20) + specials * 120;
  }

  const boardEl = $("board");

  function cellSize() {
    return boardEl.clientWidth / state.spec.cols;
  }

  function gemHTML(tile) {
    if (tile.type === TYPES.BOMB) return `<div class="gem bomb"></div>`;
    const extra =
      tile.type === TYPES.H ? " stripeH" :
      tile.type === TYPES.V ? " stripeV" :
      tile.type === TYPES.WRAP ? " wrapped" : "";
    return `<div class="gem c${tile.color}${extra}"></div>`;
  }

  function renderBoard(popping = new Set()) {
    const spec = state.spec;
    const size = cellSize();
    const byId = new Map([...boardEl.children].map((el) => [el.dataset.id, el]));
    const used = new Set();
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const tile = state.board[r][c];
        if (!tile) continue;
        let el = byId.get(tile.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "tile";
          el.dataset.id = tile.id;
          el.innerHTML = gemHTML(tile);
          boardEl.appendChild(el);
        } else if (el.dataset.sig !== tile.type + tile.color) {
          el.innerHTML = gemHTML(tile);
        }
        el.dataset.sig = tile.type + tile.color;
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.width = size + "px";
        el.style.height = size + "px";
        el.style.transform = `translate(${c * size}px, ${r * size}px)`;
        el.classList.toggle("selected", selected && selected.r === r && selected.c === c);
        el.classList.toggle("pop", popping.has(key(r, c)));
        used.add(tile.id);
      }
    }
    for (const el of [...boardEl.children]) {
      if (!used.has(el.dataset.id)) el.remove();
    }
  }

  function updateHud() {
    $("hud-level").textContent = String(state.spec.id);
    $("hud-score").textContent = String(state.score);
    $("hud-target").textContent = "/ " + state.spec.target;
    $("hud-moves").textContent = String(state.moves);
    $("score-bar").style.width = Math.min(100, (state.score / state.spec.target) * 100) + "%";
  }

  function beep(freq, dur, type = "sine", gain = 0.04) {
    try {
      if (!beep.ctx) beep.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = beep.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.stop(ctx.currentTime + dur);
    } catch (_) {}
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function snapshotIds(board) {
    return board.map((row) => row.map((t) => (t ? t.id : null)));
  }

  async function resolveAll(preferKey, forcedClear) {
    let cascade = 0;
    let pending = [];
    let safety = 0;
    while (safety++ < 40) {
      const before = snapshotIds(state.board);
      const result = resolveOnce(state.board, preferKey, forcedClear, pending);
      forcedClear = null;
      preferKey = null;
      if (!result.did && pending.length === 0) break;
      if (result.did) {
        const popping = new Set();
        for (let r = 0; r < state.spec.rows; r++) {
          for (let c = 0; c < state.spec.cols; c++) {
            const id = before[r][c];
            if (id && (!state.board[r][c] || state.board[r][c].id !== id)) popping.add(key(r, c));
          }
        }
        state.score += scoreFor(result.cleared, cascade, result.created);
        updateHud();
        renderBoard(popping);
        beep(420 + cascade * 80, 0.08, "triangle");
        await wait(160);
        pending = result.pending;
      }
      if (pending.length && !result.did) {
        const blast = applyPending(state.board, pending);
        pending = blast.next;
        if (blast.clear.size) {
          forcedClear = blast.clear;
          continue;
        }
      }
      gravityAndFill(state.board, state.spec);
      renderBoard();
      await wait(180);
      cascade++;
      if (!hasMatch(state.board) && pending.length === 0) break;
    }
    if (!hasMove(state.board)) {
      scramble(state.board, state.spec);
      $("hint").textContent = "Keine Züge – Steine neu gemischt.";
      renderBoard();
      await wait(250);
      $("hint").textContent = "";
    }
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  async function trySwap(a, b) {
    if (busy || !a || !b || !adjacent(a, b)) return;
    if (!inBounds(state.board, a.r, a.c) || !inBounds(state.board, b.r, b.c)) return;
    busy = true;
    selected = null;
    const board = state.board;
    const ta = board[a.r][a.c];
    const tb = board[b.r][b.c];
    board[a.r][a.c] = tb;
    board[b.r][b.c] = ta;
    renderBoard();
    await wait(140);
    const specialCombo = ta && tb && ta.type !== TYPES.NORMAL && tb.type !== TYPES.NORMAL;
    const bombSwap = ta && tb && (ta.type === TYPES.BOMB || tb.type === TYPES.BOMB);
    if (specialCombo || bombSwap) {
      state.moves -= 1;
      const combo = applyCombo(board, a, b);
      updateHud();
      beep(660, 0.12, "square", 0.05);
      await resolveAll(null, combo.clear);
      await finishMove();
      busy = false;
      return;
    }
    if (hasMatch(board)) {
      state.moves -= 1;
      updateHud();
      beep(520, 0.07);
      await resolveAll(key(b.r, b.c));
      await finishMove();
    } else {
      board[a.r][a.c] = ta;
      board[b.r][b.c] = tb;
      renderBoard();
      beep(180, 0.08, "sawtooth", 0.03);
    }
    busy = false;
  }

  async function finishMove() {
    if (state.score >= state.spec.target) {
      const next = state.spec.id + 1;
      if (next > save.unlocked) save.unlocked = Math.min(LEVELS + 1, next);
      const prev = save.best[state.spec.id] || 0;
      if (state.score > prev) save.best[state.spec.id] = state.score;
      persist();
      beep(880, 0.2, "triangle", 0.06);
      overlay(
        "Level geschafft!",
        state.score + " Punkte – die Steine haben sich prächtig verwandelt.",
        state.spec.id < LEVELS ? "Nächstes Level" : "Zur Übersicht",
        "Menü",
        () => { if (state.spec.id < LEVELS) startLevel(state.spec.id + 1); else openLevels(); },
        () => show("menu")
      );
      return;
    }
    if (state.moves <= 0) {
      overlay(
        "Keine Züge mehr",
        "Ziel war " + state.spec.target + " Punkte. Du hattest " + state.score + ".",
        "Nochmal",
        "Menü",
        () => startLevel(state.spec.id),
        () => show("menu")
      );
    }
  }

  function overlay(title, text, primary, secondary, onPrimary, onSecondary) {
    $("overlay-title").textContent = title;
    $("overlay-text").textContent = text;
    $("overlay-primary").textContent = primary;
    $("overlay-secondary").textContent = secondary;
    $("overlay").classList.remove("hidden");
    $("overlay-primary").onclick = () => { $("overlay").classList.add("hidden"); onPrimary(); };
    $("overlay-secondary").onclick = () => { $("overlay").classList.add("hidden"); onSecondary(); };
  }

  function startLevel(n) {
    $("overlay").classList.add("hidden");
    const spec = levelSpec(n);
    state = { spec, board: generateBoard(spec), score: 0, moves: spec.moves };
    selected = null;
    boardEl.innerHTML = "";
    show("game");
    updateHud();
    renderBoard();
    $("hint").textContent = "";
  }

  function tileFromPoint(x, y) {
    const rect = boardEl.getBoundingClientRect();
    const size = cellSize();
    const c = Math.floor((x - rect.left) / size);
    const r = Math.floor((y - rect.top) / size);
    if (!state || !inBounds(state.board, r, c)) return null;
    return { r, c };
  }

  boardEl.addEventListener("pointerdown", (e) => {
    if (busy || !state) return;
    boardEl.setPointerCapture(e.pointerId);
    const t = tileFromPoint(e.clientX, e.clientY);
    pointer = t ? { ...t, x: e.clientX, y: e.clientY } : null;
  });

  boardEl.addEventListener("pointerup", (e) => {
    if (!pointer || !state) return;
    const end = tileFromPoint(e.clientX, e.clientY);
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 18) {
      const dir = Math.abs(dx) > Math.abs(dy)
        ? { r: pointer.r, c: pointer.c + Math.sign(dx) }
        : { r: pointer.r + Math.sign(dy), c: pointer.c };
      if (inBounds(state.board, dir.r, dir.c)) trySwap(pointer, dir);
      pointer = null;
      return;
    }
    if (!end) { pointer = null; return; }
    if (selected && adjacent(selected, end)) trySwap(selected, end);
    else if (selected && selected.r === end.r && selected.c === end.c) { selected = null; renderBoard(); }
    else { selected = end; renderBoard(); }
    pointer = null;
  });

  function openLevels() {
    const grid = $("level-grid");
    grid.innerHTML = "";
    for (let i = 1; i <= LEVELS; i++) {
      const b = document.createElement("button");
      b.className = "level-btn";
      const locked = i > save.unlocked;
      if (locked) b.classList.add("locked");
      if (save.best[i]) b.classList.add("done");
      b.textContent = locked ? "\uD83D\uDD12" : String(i);
      b.disabled = locked;
      b.addEventListener("click", () => startLevel(i));
      grid.appendChild(b);
    }
    show("levels");
  }

  $("btn-continue").addEventListener("click", () => startLevel(Math.min(LEVELS, save.unlocked)));
  $("btn-levels").addEventListener("click", openLevels);
  $("btn-howto").addEventListener("click", () => show("howto"));
  $("levels-back").addEventListener("click", () => show("menu"));
  $("howto-back").addEventListener("click", () => show("menu"));
  $("game-back").addEventListener("click", () => { if (!busy) show("menu"); });
  window.addEventListener("resize", () => {
    if (state && !screens.game.classList.contains("hidden")) renderBoard();
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
