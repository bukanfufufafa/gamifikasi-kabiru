/* world.js — keadaan dunia (ladang, posisi petani, skor). Tanpa DOM, tanpa UI. */
Petani.World = (function () {
  const C = Petani.Config;
  const EMPTY = 0, YOUNG = 1, RIPE = 2;
  let level, N, grid, pos, score, tick;

  // Membangun ladang dari level.map (lihat LEVELS di config.js)
  function load(index) {
    level = C.LEVELS[index]; N = level.size;
    grid = level.map.map((row) => [...row].map((ch) => ({ s: C.TILE[ch], plantedAt: 0 })));
    pos = level.start.slice(); score = 0; tick = 0;
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const cell = () => grid[pos[1]][pos[0]];

  // Setiap aksi memakan 1 langkah waktu; padi muda tumbuh seiring waktu.
  function advance() {
    tick++;
    for (const row of grid) for (const g of row)
      if (g.s === YOUNG && tick - g.plantedAt >= C.GROW) g.s = RIPE;
  }

  // Cek kondisi untuk blok "jika" / "selama"
  function test(cond) {
    if (cond === "matang") return cell().s === RIPE;
    if (cond === "muda") return cell().s === YOUNG;
    if (cond === "kosong") return cell().s === EMPTY;
    const neg = cond.startsWith("no_");
    const v = C.DIR_VEC[neg ? cond.slice(3) : cond];
    const ok = inside(pos[0] + v[0], pos[1] + v[1]);
    return neg ? !ok : ok;
  }

  // Aksi petani (dipanggil oleh interpreter)
  const actions = {
    move(dir) { const v = C.DIR_VEC[dir], x = pos[0] + v[0], y = pos[1] + v[1]; if (inside(x, y)) pos = [x, y]; advance(); },
    plant() { const g = cell(); if (g.s === EMPTY) { g.s = YOUNG; g.plantedAt = tick; } advance(); },
    harvest() { const g = cell(); if (g.s === RIPE) { g.s = EMPTY; score++; } advance(); },
    wait() { advance(); }
  };

  return {
    EMPTY, YOUNG, RIPE, load, test, actions,
    isWon: () => score >= level.goal,
    get state() { return { size: N, grid, pos, score, level }; }
  };
})();
