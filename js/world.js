/* world.js — world state (field, farmer position, score). No DOM, no UI. */
Petani.World = (function () {
  const C = Petani.Config;
  let level, map, N, grid, pos, score, goal, bumps, bumpDir;

  // Build the field from level.maps[size] (see LEVELS in config.js)
  function load(index, size) {
    level = C.LEVELS[index]; N = size; map = level.maps[size];
    grid = map.map((row) => [...row].map((ch) => ({ wheat: ch === "W", rock: ch === "#" })));
    pos = level.start.slice(); score = 0; bumps = 0; bumpDir = [0, 0];
    goal = grid.flat().filter((c) => c.wheat).length;
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const free = (x, y) => inside(x, y) && !grid[y][x].rock; // the farmer can only walk on non-rock tiles
  const cell = () => grid[pos[1]][pos[0]];

  // Conditions for if / while / repeat until
  function test(cond) {
    if (cond === "wheat") return cell().wheat;
    if (cond === "nowheat") return !cell().wheat;
    if (cond === "any") return grid.some((row) => row.some((c) => c.wheat));
    const [kind, dir] = cond.split("_"), v = C.DIR_VEC[dir], x = pos[0] + v[0], y = pos[1] + v[1];
    if (kind === "can") return free(x, y);
    if (kind === "no") return !free(x, y);
    return inside(x, y) && grid[y][x].wheat; // "wheat_<dir>"
  }

  // Farmer actions (called by the interpreter)
  const actions = {
    move(dir) {
      const v = C.DIR_VEC[dir], x = pos[0] + v[0], y = pos[1] + v[1];
      if (free(x, y)) pos = [x, y]; else { bumps++; bumpDir = v; } // blocked by a rock or the edge
    },
    harvest() { const c = cell(); if (c.wheat) { c.wheat = false; score++; } }
  };

  return {
    load, test, actions,
    isWon: () => score >= goal,
    get state() { return { size: N, grid, map, pos, score, goal, bumps, bumpDir, level }; }
  };
})();
