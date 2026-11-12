/* config.js — game data: directions, conditions, levels, examples.
   Adding a level = add one object to RAW_LEVELS. (Block definitions now live in editor.js, built with Blockly.) */
window.Petani = window.Petani || {};

Petani.Config = (function () {
  // ===== GRID SIZE (ubah di sini) =====
  // Ukuran ladang yang dipakai gim. Setiap level harus punya map untuk ukuran ini di `maps` (lihat RAW_LEVELS).
  // Bawaan tersedia: 3, 6, 9. Untuk ukuran lain (mis. 5), tambahkan  5: [...]  di maps tiap level.
  const GRID_SIZE = 6;

  const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const ARROW = { up: "↑", down: "↓", left: "←", right: "→" };
  const DIR_LABEL = {};
  for (const d in DIR_VEC) DIR_LABEL[d] = ARROW[d] + " " + d;

  // Conditions for if / while / repeat until: key -> dropdown text
  const COND_LABEL = { wheat: "wheat here", nowheat: "no wheat here", any: "wheat remains" };
  for (const d in DIR_VEC) COND_LABEL["can_" + d] = "can move " + ARROW[d];
  for (const d in DIR_VEC) COND_LABEL["no_" + d] = "blocked " + ARROW[d];
  for (const d in DIR_VEC) COND_LABEL["wheat_" + d] = "wheat on " + ARROW[d];

  // ===== LEVELS =====
  //   title  : level title            hint  : shown when the level starts
  //   maps   : { 3: [...], 6: [...], 9: [...] }  one array of strings per grid size, 1 string = 1 row (top row first)
  //            legend: "." soil | "W" wheat | "#" rock (the farmer cannot step on rocks)
  //   start  : (optional) farmer start [column, row], default [0, 0]
  //   sample : (optional) example solution for the "Show example" button (tree of {t, v, body, orelse})
  //   Goal = number of "W" tiles in the map (harvest everything).
  const TILE = { ".": "soil", "W": "wheat", "#": "rock" };

  // Example-solution helpers
  const H = { t: "harvest" }, go = (d) => ({ t: "move", v: d });
  const scan = (act) => [ // row-by-row sweep that runs `act` on every tile; works for any size
    { t: "while", v: "can_down", body: [
      { t: "while", v: "can_right", body: [...act, go("right")] }, ...act,
      { t: "while", v: "can_left", body: [go("left")] }, go("down") ] },
    { t: "while", v: "can_right", body: [...act, go("right")] }, ...act
  ];

  const RAW_LEVELS = [
    { title: "Level 1: First row",
      hint: "The top row is full of wheat. Harvest all of it! Hint: while can move →",
      maps: {
        3: ["WWW",
            "...",
            "..."],
        6: ["WWWWWW",
            "......",
            "......",
            "......",
            "......",
            "......"],
        9: ["WWWWWWWWW",
            ".........",
            ".........",
            ".........",
            ".........",
            ".........",
            ".........",
            ".........",
            "........."] },
      sample: [H, { t: "while", v: "can_right", body: [go("right"), H] }] },

    { title: "Level 2: Full field",
      hint: "Every tile has wheat. Try a loop inside a loop.",
      maps: {
        3: ["WWW",
            "WWW",
            "WWW"],
        6: ["WWWWWW",
            "WWWWWW",
            "WWWWWW",
            "WWWWWW",
            "WWWWWW",
            "WWWWWW"],
        9: ["WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW",
            "WWWWWWWWW"] },
      sample: scan([H]) },

    { title: "Level 3: Rock staircase",
      hint: "Rocks (#) block the way, so \"can move\" is false next to them. Use that to find the end of each row.",
      maps: {
        3: ["WWW",
            "WW#",
            "W##"],
        6: ["WWWWWW",
            "WWWWW#",
            "WWWW##",
            "WWW###",
            "WW####",
            "W#####"],
        9: ["WWWWWWWWW",
            "WWWWWWWW#",
            "WWWWWWW##",
            "WWWWWW###",
            "WWWWW####",
            "WWWW#####",
            "WWW######",
            "WW#######",
            "W########"] },
      sample: scan([H]) },

    { title: "Level 4: Checkerboard",
      hint: "Only some tiles have wheat. Use \"if wheat here\" so you only harvest where there is something.",
      maps: {
        3: ["W.W",
            ".W.",
            "W.W"],
        6: ["W.W.W.",
            ".W.W.W",
            "W.W.W.",
            ".W.W.W",
            "W.W.W.",
            ".W.W.W"],
        9: ["W.W.W.W.W",
            ".W.W.W.W.",
            "W.W.W.W.W",
            ".W.W.W.W.",
            "W.W.W.W.W",
            ".W.W.W.W.",
            "W.W.W.W.W",
            ".W.W.W.W.",
            "W.W.W.W.W"] },
      sample: scan([{ t: "if", v: "wheat", body: [H] }]) },

    { title: "Level 5: Zigzag path",
      hint: "Follow the wheat path through the rocks. Try \"while wheat remains\" with an if / else.",
      maps: {
        3: ["WW#",
            ".WW",
            "..W"],
        6: ["WW####",
            ".WW###",
            "..WW##",
            "...WW#",
            "....WW",
            ".....W"],
        9: ["WW#######",
            ".WW######",
            "..WW#####",
            "...WW####",
            "....WW###",
            ".....WW##",
            "......WW#",
            ".......WW",
            "........W"] },
      sample: [H, { t: "while", v: "any", body: [
        { t: "ifelse", v: "wheat_right", body: [go("right")], orelse: [go("down")] }, H ] }] }
  ];

  // Validate + fill defaults, so typos in a map are caught immediately
  const LEVELS = RAW_LEVELS.map((lv, i) => {
    const name = "Level " + (i + 1), out = Object.assign({ start: [0, 0], sample: [] }, lv);
    if (!lv.maps[GRID_SIZE]) throw new Error(name + ": no " + GRID_SIZE + "x" + GRID_SIZE + " map in `maps` (GRID_SIZE = " + GRID_SIZE + ")");
    Object.keys(lv.maps).map(Number).forEach((n) => { // every map that exists must be valid
      const m = lv.maps[n];
      if (!m || m.length !== n) throw new Error(name + ": missing " + n + "x" + n + " map (needs " + n + " rows)");
      m.forEach((row, y) => {
        if (row.length !== n) throw new Error(name + " (" + n + "x" + n + "): row " + (y + 1) + " has " + row.length + " columns, expected " + n);
        for (const ch of row) if (!(ch in TILE)) throw new Error(name + ': unknown map character "' + ch + '" (use . W #)');
      });
      const [sx, sy] = out.start;
      if (m[sy] === undefined || m[sy][sx] === undefined || m[sy][sx] === "#") throw new Error(name + " (" + n + "x" + n + "): invalid start tile");
    });
    return out;
  });

  const SAMPLES = LEVELS.map((lv) => lv.sample);

  return { GRID_SIZE, DIR_VEC, DIR_LABEL, COND_LABEL, TILE, LEVELS, SAMPLES };
})();
