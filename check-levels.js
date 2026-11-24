/* Run with node check-levels.js. No dependencies or browser required. */
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
global.window = global;
for (const f of ["config", "world", "interpreter"]) {
  new Function(fs.readFileSync(path.join(__dirname, f + ".js"), "utf8")).call(global);
}
const { Config, World, Interpreter } = Petani;
const conditionCount = (e) => !e ? 0 : 1 + conditionCount(e.a) + conditionCount(e.b);
const count = (list) => list.reduce((a, n) => a + 1 + (n.cond ? conditionCount(n.cond) : ["while", "until", "if", "ifelse"].includes(n.t) ? (n.v === "nowheat" ? 2 : n.v ? 1 : 0) : 0) + count(n.body || []) + count(n.orelse || []), 0);
function toCond(v) {
  if (["wheat", "any", "item_here", "dark", "occupied", "emergency"].includes(v)) return { c: v };
  if (v === "nowheat") return { c: "not", a: { c: "wheat" } };
  const [kind, d] = v.split("_");
  return { c: { can: "can", no: "blocked", wheat: "wheat_dir", is: "item_is" }[kind], d };
}
const prep = (list) => list.map((n) => ({ ...n,
  cond: n.cond || (n.v && ["while", "until", "if", "ifelse"].includes(n.t) ? toCond(n.v) : undefined),
  body: n.body && prep(n.body), orelse: n.orelse && prep(n.orelse)
}));
function run(id, tree) {
  const lv = Config.levelById(id), q = Config.questById(lv.questId);
  World.load(q, lv, Config.GRID_SIZE);
  let steps = 0;
  do {
    for (const s of Interpreter.run(prep(tree), { halt: false })) {
      if (++steps > 20000) return "LOOP";
      if (s && World.failure()) return "FAIL";
      if (s && World.isWon()) return "WIN";
    }
    World.finishProgram();
  } while (World.nextScenario());
  return World.failure() ? "FAIL" : World.isWon() ? "WIN" : "INCOMPLETE";
}
assert.equal(Config.QUESTS.length, 6);
for (const j of Config.JENJANG) assert.equal(Config.QUESTS.filter((q) => q.jenjang === j.id).length, 2);
for (const q of Config.QUESTS) for (const lv of q.levels) {
  assert.equal(run(lv.id, lv.sample), "WIN", lv.id + " sample must win");
  const blocks = 1 + count(lv.sample), stars = Config.calculateStars(lv, blocks);
  if (q.engine !== "farm") {
    assert.equal(blocks, lv.minBlocks, lv.id + " sample block count");
    assert.equal(stars, 5, lv.id + " sample stars");
  }
  if (!lv.isExample) {
    const t = lv.starThresholds;
    assert.equal(t.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.ok(Number.isFinite(t[i]) && (!i || t[i] > t[i - 1]));
      assert.equal(Config.calculateStars(lv, t[i]), 5 - i, lv.id + " boundary");
      assert.equal(Config.calculateStars(lv, t[i] + 1), 4 - i, lv.id + " next boundary");
    }
  }
  console.log("PASS", lv.id, "blocks=" + blocks, "stars=" + stars);
}
const mv = (v) => ({ t: "move", v }), rep = (v, ...body) => ({ t: "repeat", v, body });
const tests = [
  ["bekal:1", [{ t: "take", v: 2 }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }], "FAIL"],
  ["bekal:1", [{ t: "take", v: 4 }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }, mv("right"), { t: "deliver" }], "INCOMPLETE"],
  ["bekal:1", [mv("right"), { t: "take", v: 3 }], "FAIL"],
  ["sampah:1", [{ t: "pick" }, { t: "sort", v: "plastik" }], "FAIL"],
  ["sampah:1", [{ t: "sort", v: "kertas" }], "FAIL"],
  ["ekspedisi:1", [mv("right"), { t: "mark" }], "FAIL"],
  ["ekspedisi:2", [rep(3, mv("down")), mv("right"), { t: "mark" }], "FAIL"],
  ["petani:1", [{ t: "harvest" }], "INCOMPLETE"],
  ["petani:1", [{ t: "while", cond: { c: "any" }, body: [] }], "LOOP"],
  ["musik:1", [{ t: "play", v: "bell" }], "FAIL"],
  ["musik:1", [{ t: "play", v: "drum" }], "INCOMPLETE"],
  ["musik:1", [...Config.levelById("musik:1").sample, { t: "play", v: "drum" }], "FAIL"],
  ["lampu:1", [{ t: "lamp", v: "on" }], "INCOMPLETE"],
  ["lampu:1", [{ t: "if", cond: { c: "dark" }, body: [{ t: "lamp", v: "on" }] }], "INCOMPLETE"],
  ["lampu:2", Config.levelById("lampu:1").sample, "INCOMPLETE"],
  ["lampu:3", Config.levelById("lampu:2").sample, "INCOMPLETE"]
];
for (const [id, tree, expected] of tests) assert.equal(run(id, tree), expected, id + " regression");
// No lamp output must remain unset, not inherit the previous scenario's output.
run("lampu:2", [{ t: "if", cond: { c: "not", a: { c: "dark" } }, body: [{ t: "lamp", v: "off" }] }]);
assert.deepEqual(World.state.scenarioResults.map((s) => s.actual), [false, false, null, null]);
assert.ok(World.state.scenarioResults.every((s) => s.tested));
for (const lv of Config.questById("lampu").levels) {
  run(lv.id, lv.sample);
  assert.equal(World.state.scenarioResults.length, 2 ** Number(lv.key));
  assert.ok(World.state.scenarioResults.every((s) => s.tested && s.passed));
}
// Correct alternatives: repeated assignment is legal, and every 1..5 score is reachable.
const lv = Config.levelById("lampu:1");
for (let extra = 0; extra <= 8; extra++) {
  const program = [...Array.from({ length: extra }, () => ({ t: "lamp", v: "off" })), ...lv.sample];
  assert.equal(run(lv.id, program), "WIN");
  assert.equal(Config.calculateStars(lv, 1 + count(program)), extra === 0 ? 5 : extra <= 2 ? 4 : extra <= 4 ? 3 : extra <= 6 ? 2 : 1);
}
console.log("PASS all samples, 1–5 star boundaries, negative programs, scenario isolation and complete truth tables");
