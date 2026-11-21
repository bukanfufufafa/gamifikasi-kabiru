/* Dev check: runs every level's sample solution through the real world + interpreter and reports
   win/lose, block count (like the editor's counter: hat + blocks + condition blocks) and resulting stars.
   Also checks the failure messages of a few wrong programs.   Usage:  node tools/check-levels.js */
const fs = require("fs"), path = require("path");
global.window = global;
for (const f of ["config", "world", "interpreter"]) {
  new Function(fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8")).call(global);
}
const { Config, World, Interpreter } = Petani;

const condBlocks = (v) => (!v ? 0 : v === "nowheat" ? 2 : 1);
const count = (list) => list.reduce((a, n) => a + 1 + condBlocks(n.v && ["while", "until", "if", "ifelse"].includes(n.t) ? n.v : null) + count(n.body || []) + count(n.orelse || []), 0);
const stars = (lv, n) => { const t = lv.starThresholds || [6, 8, 10, 13]; return n <= t[0] ? 5 : n <= t[1] ? 4 : n <= t[2] ? 3 : n <= t[3] ? 2 : 1; };

// Same conversion the editor does (sample `v` string -> condition tree)
function toCond(v) {
  if (v === "wheat" || v === "any" || v === "item_here") return { c: v };
  if (v === "nowheat") return { c: "not", a: { c: "wheat" } };
  const [kind, d] = v.split("_");
  return { c: { can: "can", no: "blocked", wheat: "wheat_dir", is: "item_is" }[kind], d };
}
const prep = (list) => list.map((n) => Object.assign({}, n, {
  cond: n.cond || (n.v && ["while", "until", "if", "ifelse"].includes(n.t) ? toCond(n.v) : undefined),
  body: n.body && prep(n.body), orelse: n.orelse && prep(n.orelse)
}));

function run(q, lv, tree, limit = 20000) {
  tree = prep(tree);
  World.load(q, lv, Config.GRID_SIZE);
  let steps = 0;
  const ctx = { halt: false };
  for (const s of Interpreter.run(tree, ctx)) {
    if (++steps > limit) return { result: "LOOP" };
    if (s && World.failure()) break;
    if (s && World.isWon()) break;
  }
  return { result: World.failure() ? "FAIL: " + World.failure() : World.isWon() ? "WIN" : "INCOMPLETE: " + World.incomplete() };
}

let bad = 0;
for (const q of Config.QUESTS) for (const lv of q.levels) {
  const r = run(q, lv, lv.sample), blocks = 1 + count(lv.sample), st = stars(lv, blocks);
  const authored = q.starMode === "learning"; // new quests: sample must be the 5-star solution; farm quest keeps its original thresholds
  const ok = r.result === "WIN" && (!authored || (st === 5 && blocks === lv.minBlocks));
  if (!ok) bad++;
  console.log((ok ? "ok  " : "BAD ") + lv.id.padEnd(18) + r.result.padEnd(6) + " blocks=" + blocks + " (minBlocks " + lv.minBlocks + ") stars=" + st);
}

// Wrong programs must give a helpful message
const T = (id) => { const lv = Config.levelById(id); return [Config.questById(lv.questId), lv]; };
const mv = (d) => ({ t: "move", v: d }), rep = (n, ...b) => ({ t: "repeat", v: n, body: b });
const cases = [
  ["bekal:1", "ambil 2 (kurang)", [{ t: "take", v: 2 }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }]],
  ["bekal:1", "ambil 4 (lebih)", [{ t: "take", v: 4 }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }]],
  ["bekal:1", "ambil tidak di dapur", [mv("right"), { t: "take", v: 3 }]],
  ["sampah:1", "salah tong", [{ t: "pick" }, { t: "sort", v: "plastik" }]],
  ["sampah:1", "sort tanpa pegang", [{ t: "sort", v: "kertas" }]],
  ["ekspedisi:1", "titik salah", [mv("right"), { t: "mark" }]],
  ["ekspedisi:2", "urutan terbalik", [mv("down"), mv("down"), mv("down"), mv("right"), { t: "mark" }]],
  ["ekspedisi:3", "belum pulang", [mv("right"), mv("right"), mv("up"), mv("up"), { t: "sample" }, mv("up"), rep(5, mv("left")), mv("down"), { t: "sample" }, rep(4, mv("down")), rep(5, mv("right")), { t: "sample" }]],
  ["petani:1", "kosong sebagian", [{ t: "harvest" }]]
];
for (const [id, name, tree] of cases) console.log("--- " + id + " / " + name + "\n    " + run(...T(id), tree).result);

// Infinite loop guard
const [pq, plv] = T("petani:1");
console.log("--- loop: " + run(pq, plv, [{ t: "while", cond: { c: "any" }, v: "any", body: [] }]).result);

process.exit(bad ? 1 : 0);
