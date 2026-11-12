/* editor.js — Scratch-style block editor built on Blockly (lib/blockly.min.js, built from blockly-main).
   - Defines the farmer blocks, the toolbox (colored categories) and the Scratch look (Zelos renderer + custom theme).
   - Converts the workspace into the program tree that interpreter.js runs, and back (for "Show example").
   - Highlights the block that is running, like Scratch.
   API: init, getProgram, setProgram, clear, setLocked, highlight, resize
   The tree: [{ id, t, v?, cond?, body?, orelse? }, ...]  (see interpreter.js) */
Petani.Editor = (function () {
  let ws = null, lockEl = null, locked = false;

  // ===== Block definitions (colors come from the theme styles below) =====
  const DIRS = [["↑ up", "up"], ["↓ down", "down"], ["← left", "left"], ["→ right", "right"]];
  const dirField = { type: "field_dropdown", name: "DIR", options: DIRS };
  const flag = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M5 21V4" stroke="#4c7d2e" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M5.6 4.6c3.6-2 6.2 1.8 12.4-.4v9c-6.2 2.2-8.8-1.6-12.4.4z" fill="#4cbf56" stroke="#2f8a3a" stroke-width="1.4" stroke-linejoin="round"/></svg>');

  const BLOCK_DEFS = [
    { type: "petani_start", style: "event_blocks", tooltip: "The program starts here when you press the green flag.",
      message0: "when %1 clicked", args0: [{ type: "field_image", src: flag, width: 22, height: 22, alt: "flag" }], nextStatement: null },

    { type: "petani_move", style: "motion_blocks", tooltip: "Move the farmer one tile.",
      message0: "move %1", args0: [dirField], previousStatement: null, nextStatement: null },
    { type: "petani_harvest", style: "action_blocks", tooltip: "Harvest the wheat on this tile.",
      message0: "harvest 🌾", previousStatement: null, nextStatement: null },

    { type: "petani_repeat", style: "control_blocks", tooltip: "Repeat the blocks inside a number of times.",
      message0: "repeat %1 times", args0: [{ type: "field_number", name: "TIMES", value: 3, min: 1, max: 99, precision: 1 }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_while", style: "control_blocks", tooltip: "Repeat while the condition is true.", inputsInline: true,
      message0: "while %1", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_until", style: "control_blocks", tooltip: "Repeat until the condition becomes true.", inputsInline: true,
      message0: "repeat until %1", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_if", style: "control_blocks", tooltip: "Run the blocks inside only if the condition is true.", inputsInline: true,
      message0: "if %1 then", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_ifelse", style: "control_blocks", tooltip: "Run the first blocks if true, otherwise the else blocks.", inputsInline: true,
      message0: "if %1 then", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
      message2: "else", message3: "%1", args3: [{ type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null },

    { type: "petani_wheat_here", style: "sensing_blocks", message0: "wheat here?", output: "Boolean", tooltip: "True if the farmer stands on wheat." },
    { type: "petani_wheat_any", style: "sensing_blocks", message0: "wheat remains?", output: "Boolean", tooltip: "True while there is still wheat somewhere in the field." },
    { type: "petani_can_move", style: "sensing_blocks", message0: "can move %1 ?", args0: [dirField], output: "Boolean", tooltip: "True if the farmer can step that way (no rock, no edge)." },
    { type: "petani_blocked", style: "sensing_blocks", message0: "blocked %1 ?", args0: [dirField], output: "Boolean", tooltip: "True if a rock or the edge is in that direction." },
    { type: "petani_wheat_dir", style: "sensing_blocks", message0: "wheat on %1 ?", args0: [dirField], output: "Boolean", tooltip: "True if the next tile in that direction has wheat." }
  ];

  // ===== Toolbox (Scratch categories) =====
  const blk = (type, fields) => (fields ? { kind: "block", type, fields } : { kind: "block", type });
  const TOOLBOX = {
    kind: "categoryToolbox",
    contents: [
      { kind: "category", name: "Events", categorystyle: "event_category", contents: [blk("petani_start")] },
      { kind: "category", name: "Motion", categorystyle: "motion_category",
        contents: ["right", "left", "up", "down"].map((d) => blk("petani_move", { DIR: d })) },
      { kind: "category", name: "Actions", categorystyle: "action_category", contents: [blk("petani_harvest")] },
      { kind: "category", name: "Control", categorystyle: "control_category",
        contents: [blk("petani_repeat"), blk("petani_while"), blk("petani_until"), blk("petani_if"), blk("petani_ifelse")] },
      { kind: "category", name: "Sensing", categorystyle: "sensing_category",
        contents: [blk("petani_wheat_here"), blk("petani_wheat_any"), blk("petani_can_move", { DIR: "right" }),
                   blk("petani_blocked", { DIR: "right" }), blk("petani_wheat_dir", { DIR: "right" })] },
      { kind: "category", name: "Operators", categorystyle: "logic_category",
        contents: [blk("logic_operation", { OP: "AND" }), blk("logic_operation", { OP: "OR" }), blk("logic_negate")] }
    ]
  };

  // ===== Scratch look: Zelos renderer + Scratch 3 colors =====
  const style = (p, s, t, extra) => Object.assign({ colourPrimary: p, colourSecondary: s, colourTertiary: t }, extra);
  function makeTheme() {
    return Blockly.Theme.defineTheme("scratch", {
      name: "scratch",
      base: Blockly.Themes.Zelos,
      blockStyles: {
        event_blocks:   style("#FFBF00", "#E6AC00", "#CC9900", { hat: "cap" }),
        motion_blocks:  style("#4C97FF", "#4280D7", "#3373CC"),
        action_blocks:  style("#9966FF", "#855CD6", "#774DCB"),
        control_blocks: style("#FFAB19", "#EC9C13", "#CF8B17"),
        sensing_blocks: style("#5CB1D6", "#47A8D1", "#2E8EB8"),
        logic_blocks:   style("#59C059", "#46B946", "#389438")
      },
      categoryStyles: {
        event_category: { colour: "#FFBF00" }, motion_category: { colour: "#4C97FF" }, action_category: { colour: "#9966FF" },
        control_category: { colour: "#FFAB19" }, sensing_category: { colour: "#5CB1D6" }, logic_category: { colour: "#59C059" }
      },
      fontStyle: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: "bold", size: 12 }
    });
  }

  // Toolbox category = colored circle with a label below it (Scratch style). Color is passed to CSS as --cat.
  function registerCategory() {
    class ScratchCategory extends Blockly.ToolboxCategory {
      addColourBorder_(colour) { if (colour) this.rowDiv_.style.setProperty("--cat", colour); }
      setSelected(on) { super.setSelected(on); if (this.rowDiv_) this.rowDiv_.style.backgroundColor = ""; }
    }
    Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, ScratchCategory, true);
  }

  // ===== Workspace -> program tree =====
  const enabled = (b) => !b.isEnabled || b.isEnabled();
  function chain(b) { const out = []; for (; b; b = b.getNextBlock()) if (enabled(b)) out.push(node(b)); return out; }

  function expr(b) {
    if (!b) return null; // empty socket
    switch (b.type) {
      case "petani_wheat_here": return { c: "wheat" };
      case "petani_wheat_any":  return { c: "any" };
      case "petani_can_move":   return { c: "can", d: b.getFieldValue("DIR") };
      case "petani_blocked":    return { c: "blocked", d: b.getFieldValue("DIR") };
      case "petani_wheat_dir":  return { c: "wheat_dir", d: b.getFieldValue("DIR") };
      case "logic_negate":      return { c: "not", a: expr(b.getInputTargetBlock("BOOL")) };
      case "logic_operation":   return { c: b.getFieldValue("OP") === "OR" ? "or" : "and",
                                         a: expr(b.getInputTargetBlock("A")), b: expr(b.getInputTargetBlock("B")) };
    }
    return null;
  }

  function node(b) {
    const id = b.id, body = () => chain(b.getInputTargetBlock("DO")), cond = () => expr(b.getInputTargetBlock("COND"));
    switch (b.type) {
      case "petani_move":    return { id, t: "move", v: b.getFieldValue("DIR") };
      case "petani_harvest": return { id, t: "harvest" };
      case "petani_repeat":  return { id, t: "repeat", v: +b.getFieldValue("TIMES") || 1, body: body() };
      case "petani_while":   return { id, t: "while", cond: cond(), body: body() };
      case "petani_until":   return { id, t: "until", cond: cond(), body: body() };
      case "petani_if":      return { id, t: "if", cond: cond(), body: body() };
      case "petani_ifelse":  return { id, t: "ifelse", cond: cond(), body: body(), orelse: chain(b.getInputTargetBlock("ELSE")) };
    }
    throw new Error("Unknown block: " + b.type);
  }

  // Returns the blocks under the "when flag clicked" hat, or null when there is no hat.
  function getProgram() {
    const hats = ws.getBlocksByType("petani_start", true);
    return hats.length ? chain(hats[0].getNextBlock()) : null;
  }

  // ===== Program tree (config.js samples: {t, v, body, orelse}) -> Blockly JSON =====
  function condJson(v) {
    if (v === "wheat") return { type: "petani_wheat_here" };
    if (v === "any") return { type: "petani_wheat_any" };
    if (v === "nowheat") return { type: "logic_negate", inputs: { BOOL: { block: { type: "petani_wheat_here" } } } };
    const [kind, dir] = v.split("_"), type = { can: "petani_can_move", no: "petani_blocked", wheat: "petani_wheat_dir" }[kind];
    return { type, fields: { DIR: dir } };
  }
  function listJson(list) { // nest a list of blocks with "next"
    let first = null, last = null;
    for (const n of list || []) {
      const j = blockJson(n);
      if (!first) first = j; else last.next = { block: j };
      last = j;
    }
    return first;
  }
  function blockJson(n) {
    const inputs = {}, j = { type: "petani_" + n.t, inputs };
    if (n.t === "move") j.fields = { DIR: n.v };
    if (n.t === "repeat") j.fields = { TIMES: n.v };
    if (["while", "until", "if", "ifelse"].includes(n.t)) inputs.COND = { block: condJson(n.v) };
    if (n.body && n.body.length) inputs.DO = { block: listJson(n.body) };
    if (n.orelse && n.orelse.length) inputs.ELSE = { block: listJson(n.orelse) };
    return j;
  }

  function load(list) {
    const hat = { type: "petani_start", x: 36, y: 28, deletable: false };
    const first = listJson(list);
    if (first) hat.next = { block: first };
    ws.clear();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [hat] } }, ws);
  }

  // ===== Public API =====
  function init(hostSel) {
    const host = document.querySelector(hostSel);
    Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFS);
    registerCategory();
    ws = Blockly.inject(host, {
      toolbox: TOOLBOX, renderer: "zelos", theme: makeTheme(), media: "lib/media/", sounds: location.protocol !== "file:",
      zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 1.8, minScale: 0.4, scaleSpeed: 1.2 },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: true, maxInstances: { petani_start: 1 }
    });
    // Overlay that blocks editing while the program runs
    lockEl = document.createElement("div"); lockEl.className = "ws-lock"; lockEl.hidden = true; host.append(lockEl);
    new ResizeObserver(() => Blockly.svgResize(ws)).observe(host);
    load([]);
  }

  return {
    init, getProgram,
    setProgram: (tree) => load(tree),
    clear() { if (!locked) load([]); },
    setLocked(v) { locked = v; lockEl.hidden = !v; if (!v) ws.highlightBlock(null); },
    highlight(id) { ws.highlightBlock(id); },
    resize() { Blockly.svgResize(ws); }
  };
})();
