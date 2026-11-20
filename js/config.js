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
  const ID_DIR = { up: "atas", down: "bawah", left: "kiri", right: "kanan" };
  const DIR_LABEL = {};
  for (const d in DIR_VEC) DIR_LABEL[d] = ARROW[d] + " " + ID_DIR[d];

  // Conditions for if / while / repeat until: key -> dropdown text
  const COND_LABEL = { wheat: "ada gandum di sini", nowheat: "tidak ada gandum di sini", any: "masih ada gandum" };
  for (const d in DIR_VEC) COND_LABEL["can_" + d] = "bisa gerak " + ARROW[d];
  for (const d in DIR_VEC) COND_LABEL["no_" + d] = "terhalang " + ARROW[d];
  for (const d in DIR_VEC) COND_LABEL["wheat_" + d] = "gandum di " + ARROW[d];

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
    { title: "Contoh: Panen Satu Baris",
      isExample: true,
      hint: "Kode sudah terisi. Tekan bendera hijau, lalu coba ubah blok-bloknya!",
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

    { title: "Level 1: Baris Pertama",
      hint: "Baris atas penuh gandum. Panen semuanya!",
      minBlocks: 6,
      starThresholds: [6, 8, 10, 13],
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

    { title: "Level 2: Ladang Penuh",
      hint: "Semua petak berisi gandum. Coba perulangan di dalam perulangan.",
      minBlocks: 9,
      starThresholds: [9, 13, 17, 24],
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

    { title: "Level 3: Tangga Batu",
      hint: "Batu menghalangi jalan. Gunakan \"bisa gerak\" untuk menemukan ujung tiap baris.",
      minBlocks: 11,
      starThresholds: [11, 14, 18, 24],
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

    { title: "Level 4: Papan Catur",
      hint: "Hanya sebagian petak berisi gandum. Gunakan \"jika ada gandum\".",
      minBlocks: 13,
      starThresholds: [13, 17, 22, 28],
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

    { title: "Level 5: Jalur Zigzag",
      hint: "Ikuti jalur gandum di antara batu. Coba \"selama masih ada gandum\" dengan jika / selain itu.",
      minBlocks: 9,
      starThresholds: [9, 12, 15, 20],
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
    const name = "Level " + i, out = Object.assign({ start: [0, 0], sample: [] }, lv);
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
