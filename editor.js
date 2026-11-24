/* editor.js — Scratch-style block editor built on Blockly (blockly.min.js, built from blockly-main).
   - Defines the blocks for all quests, the toolbox (colored categories, filtered per level) and the Scratch look (Zelos renderer + custom theme).
   - Converts the workspace into the program tree that interpreter.js runs, and back (for "Show example").
   - Highlights the block that is running, like Scratch.
   API: init, setTools, getProgram, setProgram, clear, setLocked, highlight, resize
   The tree: [{ id, t, v?, cond?, body?, orelse? }, ...]  (see interpreter.js) */
Petani.Editor = (function () {
  let ws = null, lockEl = null, locked = false;

  // ===== Block definitions (colors come from the theme styles below) =====
  const DIRS = [["↑ atas", "up"], ["↓ bawah", "down"], ["← kiri", "left"], ["→ kanan", "right"]];
  const dirField = { type: "field_dropdown", name: "DIR", options: DIRS };
  const binField = { type: "field_dropdown", name: "CAT", options: Petani.Config.BINS.map((b) => [b.emoji + " " + b.label.toLowerCase(), b.id]) };
  const flag = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M5 21V4" stroke="#4c7d2e" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M5.6 4.6c3.6-2 6.2 1.8 12.4-.4v9c-6.2 2.2-8.8-1.6-12.4.4z" fill="#4cbf56" stroke="#2f8a3a" stroke-width="1.4" stroke-linejoin="round"/></svg>');

  const BLOCK_DEFS = [
    { type: "petani_start", style: "event_blocks", tooltip: "Program dimulai dari sini saat bendera hijau ditekan.",
      message0: "ketika %1 diklik", args0: [{ type: "field_image", src: flag, width: 22, height: 22, alt: "flag" }], nextStatement: null },

    { type: "petani_move", style: "motion_blocks", tooltip: "Gerakkan tokoh satu petak.",
      message0: "gerak %1", args0: [dirField], previousStatement: null, nextStatement: null },
    { type: "petani_harvest", style: "action_blocks", tooltip: "Panen gandum di petak ini.",
      message0: "panen 🌾", previousStatement: null, nextStatement: null },
    { type: "petani_take", style: "action_blocks", tooltip: "Ambil bekal. Hanya bisa dilakukan di dapur.",
      message0: "ambil %1 bekal 🍱", args0: [{ type: "field_number", name: "NUM", value: 1, min: 1, max: 9, precision: 1 }], previousStatement: null, nextStatement: null },
    { type: "petani_deliver", style: "action_blocks", tooltip: "Antar satu bekal ke teman di petak ini.",
      message0: "antar bekal 🧒", previousStatement: null, nextStatement: null },
    { type: "petani_pick", style: "action_blocks", tooltip: "Ambil benda di petak ini.",
      message0: "ambil benda ✋", previousStatement: null, nextStatement: null },
    { type: "petani_sort", style: "action_blocks", tooltip: "Masukkan benda yang dipegang ke tong sampah yang dipilih.",
      message0: "pilah ke tong %1", args0: [binField], previousStatement: null, nextStatement: null },
    { type: "petani_mark", style: "action_blocks", tooltip: "Tandai titik tempat robot berdiri.",
      message0: "tandai titik 📍", previousStatement: null, nextStatement: null },
    { type: "petani_sample", style: "action_blocks", tooltip: "Ambil sampel di titik tempat robot berdiri.",
      message0: "ambil sampel 🧪", previousStatement: null, nextStatement: null },
    { type: "petani_play", style: "action_blocks", tooltip: "Mainkan alat musik yang dipilih.",
      message0: "mainkan %1", args0: [{ type: "field_dropdown", name: "INST", options: [["drum", "drum"], ["lonceng", "bell"], ["tepuk", "clap"]] }], previousStatement: null, nextStatement: null },
    { type: "petani_lamp", style: "action_blocks", tooltip: "Nyalakan atau matikan lampu.",
      message0: "lampu %1", args0: [{ type: "field_dropdown", name: "STATE", options: [["nyala", "on"], ["mati", "off"]] }], previousStatement: null, nextStatement: null },

    { type: "petani_repeat", style: "control_blocks", tooltip: "Ulangi blok di dalamnya beberapa kali.",
      message0: "ulangi %1 kali", args0: [{ type: "field_number", name: "TIMES", value: 3, min: 1, max: 99, precision: 1 }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_while", style: "control_blocks", tooltip: "Ulangi selama kondisi benar.", inputsInline: true,
      message0: "selama %1", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_until", style: "control_blocks", tooltip: "Ulangi sampai kondisi menjadi benar.", inputsInline: true,
      message0: "ulangi sampai %1", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_if", style: "control_blocks", tooltip: "Jalankan blok di dalamnya hanya jika kondisi benar.", inputsInline: true,
      message0: "jika %1 maka", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null },
    { type: "petani_ifelse", style: "control_blocks", tooltip: "Jalankan blok pertama jika benar, jika tidak jalankan blok \"selain itu\".", inputsInline: true,
      message0: "jika %1 maka", args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
      message2: "selain itu", message3: "%1", args3: [{ type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null },

    { type: "petani_wheat_here", style: "sensing_blocks", message0: "ada gandum di sini?", output: "Boolean", tooltip: "Benar jika petani berdiri di atas gandum." },
    { type: "petani_wheat_any", style: "sensing_blocks", message0: "masih ada gandum?", output: "Boolean", tooltip: "Benar selama masih ada gandum di ladang." },
    { type: "petani_can_move", style: "sensing_blocks", message0: "bisa gerak %1 ?", args0: [dirField], output: "Boolean", tooltip: "Benar jika petani bisa melangkah ke arah itu (tanpa batu atau tepi)." },
    { type: "petani_blocked", style: "sensing_blocks", message0: "terhalang %1 ?", args0: [dirField], output: "Boolean", tooltip: "Benar jika ada batu atau tepi ladang di arah itu." },
    { type: "petani_wheat_dir", style: "sensing_blocks", message0: "ada gandum di %1 ?", args0: [dirField], output: "Boolean", tooltip: "Benar jika petak berikutnya di arah itu berisi gandum." },
    { type: "petani_item_here", style: "sensing_blocks", message0: "ada benda di sini?", output: "Boolean", tooltip: "Benar jika ada benda di petak tempat robot berdiri." },
    { type: "petani_item_is", style: "sensing_blocks", message0: "jenis benda = %1 ?", args0: [binField], output: "Boolean", tooltip: "Benar jika benda di petak ini terbuat dari bahan yang dipilih." },
    { type: "petani_dark", style: "sensing_blocks", message0: "gelap?", output: "Boolean", tooltip: "Benar jika keadaan gelap." },
    { type: "petani_occupied", style: "sensing_blocks", message0: "ada orang?", output: "Boolean", tooltip: "Benar jika ada orang." },
    { type: "petani_emergency", style: "sensing_blocks", message0: "darurat?", output: "Boolean", tooltip: "Benar jika terjadi keadaan darurat." }
  ];

  // ===== Toolbox (Scratch categories) =====
  const blk = (type, fields) => (fields ? { kind: "block", type, fields } : { kind: "block", type });

  // Each level lists the tools it allows (config.js `tools`): action/control names, "s:<sensor>" and "logic".
  // Categories without any allowed block are left out of the toolbox.
  const ACTIONS = ["harvest", "take", "deliver", "pick", "sort", "mark", "sample", "play", "lamp"];
  const CONTROLS = ["repeat", "while", "until", "if", "ifelse"];
  const SENSORS = ["wheat_here", "wheat_any", "can_move", "blocked", "wheat_dir", "item_here", "item_is", "dark", "occupied", "emergency"];
  const SENSOR_DEFAULTS = { can_move: { DIR: "right" }, blocked: { DIR: "right" }, wheat_dir: { DIR: "right" }, item_is: { CAT: "kertas" } };
  const SORT_DEFAULT = { CAT: "kertas" };

  function buildToolbox(tools) {
    const has = (t) => tools.includes(t);
    const cats = [{ kind: "category", name: "Kejadian", categorystyle: "event_category", contents: [blk("petani_start")] }];
    const add = (name, style, contents) => { if (contents.length) cats.push({ kind: "category", name, categorystyle: style, contents }); };
    add("Gerak", "motion_category", has("move") ? ["right", "left", "up", "down"].map((d) => blk("petani_move", { DIR: d })) : []);
    add("Aksi", "action_category", ACTIONS.filter(has).map((a) => blk("petani_" + a, a === "sort" ? SORT_DEFAULT : undefined)));
    add("Kontrol", "control_category", CONTROLS.filter(has).map((c) => blk("petani_" + c)));
    add("Sensor", "sensing_category", SENSORS.filter((s) => has("s:" + s)).map((s) => blk("petani_" + s, SENSOR_DEFAULTS[s])));
    add("Operator", "logic_category", has("logic")
      ? [blk("logic_operation", { OP: "AND" }), blk("logic_operation", { OP: "OR" }), blk("logic_negate")] : []);
    return { kind: "categoryToolbox", contents: cats };
  }

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
      case "petani_item_here":  return { c: "item_here" };
      case "petani_item_is":    return { c: "item_is", d: b.getFieldValue("CAT") };
      case "petani_dark":       return { c: "dark" };
      case "petani_occupied":   return { c: "occupied" };
      case "petani_emergency":  return { c: "emergency" };
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
      case "petani_take":    return { id, t: "take", v: +b.getFieldValue("NUM") || 1 };
      case "petani_deliver": return { id, t: "deliver" };
      case "petani_pick":    return { id, t: "pick" };
      case "petani_sort":    return { id, t: "sort", v: b.getFieldValue("CAT") };
      case "petani_mark":    return { id, t: "mark" };
      case "petani_sample":  return { id, t: "sample" };
      case "petani_play":    return { id, t: "play", v: b.getFieldValue("INST") };
      case "petani_lamp":    return { id, t: "lamp", v: b.getFieldValue("STATE") };
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

  // ===== Program tree (config.js samples: {t, v, cond, body, orelse}) -> Blockly JSON =====
  function condJson(v) {
    if (!v) return null;
    if (typeof v === "object") {
      const inputs = {};
      const add = (name, e) => { const block = condJson(e); if (block) inputs[name] = { block }; };
      if (v.c === "not") {
        add("BOOL", v.a);
        return { type: "logic_negate", inputs };
      }
      if (v.c === "and" || v.c === "or") {
        add("A", v.a);
        add("B", v.b);
        return { type: "logic_operation", fields: { OP: v.c.toUpperCase() }, inputs };
      }
      const type = { wheat: "wheat_here", any: "wheat_any", can: "can_move", blocked: "blocked", wheat_dir: "wheat_dir", item_here: "item_here", item_is: "item_is", dark: "dark", occupied: "occupied", emergency: "emergency" }[v.c];
      if (!type) return null;
      const j = { type: "petani_" + type };
      if (["can", "blocked", "wheat_dir"].includes(v.c)) j.fields = { DIR: v.d };
      if (v.c === "item_is") j.fields = { CAT: v.d };
      return j;
    }
    if (["dark", "occupied", "emergency"].includes(v)) return { type: "petani_" + v };
    if (v === "wheat") return { type: "petani_wheat_here" };
    if (v === "any") return { type: "petani_wheat_any" };
    if (v === "nowheat") return { type: "logic_negate", inputs: { BOOL: { block: { type: "petani_wheat_here" } } } };
    if (v === "item_here") return { type: "petani_item_here" };
    const [kind, dir] = v.split("_");
    if (kind === "is") return { type: "petani_item_is", fields: { CAT: dir } };
    const type = { can: "petani_can_move", no: "petani_blocked", wheat: "petani_wheat_dir" }[kind];
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
    if (n.t === "take") j.fields = { NUM: n.v };
    if (n.t === "sort") j.fields = { CAT: n.v };
    if (n.t === "play") j.fields = { INST: n.v };
    if (n.t === "lamp") j.fields = { STATE: n.v };
    if (["while", "until", "if", "ifelse"].includes(n.t)) {
      const block = condJson(n.cond !== undefined ? n.cond : n.v);
      if (block) inputs.COND = { block };
    }
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
  const changeListeners = [];

  function getBlockCount() {
    if (!ws) return 0;
    const hats = ws.getBlocksByType("petani_start", true);
    if (!hats.length) return ws.getAllBlocks(false).length;
    return hats[0].getDescendants(false).length;
  }

  function onChange(cb) {
    changeListeners.push(cb);
  }

  // Show only the blocks this level allows (see buildToolbox).
  function setTools(tools) {
    if (ws) ws.updateToolbox(buildToolbox(tools));
  }

  function init(hostSel, tools) {
    Object.assign(Blockly.Msg, {
      LOGIC_OPERATION_AND: "dan", LOGIC_OPERATION_OR: "atau", LOGIC_NEGATE_TITLE: "bukan %1",
      LOGIC_OPERATION_TOOLTIP_AND: "Benar jika kedua kondisi benar.", LOGIC_OPERATION_TOOLTIP_OR: "Benar jika salah satu kondisi benar.",
      LOGIC_NEGATE_TOOLTIP: "Membalik kondisi: benar menjadi salah, salah menjadi benar.",
      DELETE_BLOCK: "Hapus Blok", DELETE_X_BLOCKS: "Hapus %1 Blok", DUPLICATE_BLOCK: "Gandakan",
      ADD_COMMENT: "Tambah Komentar", REMOVE_COMMENT: "Hapus Komentar", COLLAPSE_BLOCK: "Ciutkan Blok", EXPAND_BLOCK: "Bentangkan Blok",
      DISABLE_BLOCK: "Nonaktifkan Blok", ENABLE_BLOCK: "Aktifkan Blok", CLEAN_UP: "Rapikan Blok", UNDO: "Urungkan", REDO: "Ulangi",
      DELETE_ALL_BLOCKS: "Hapus semua %1 blok?", COLLAPSE_ALL: "Ciutkan Semua Blok", EXPAND_ALL: "Bentangkan Semua Blok",
      HELP: "Bantuan"
    });
    const host = document.querySelector(hostSel);
    Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFS);
    registerCategory();
    ws = Blockly.inject(host, {
      toolbox: buildToolbox(tools || []), renderer: "zelos", theme: makeTheme(), media: "./", sounds: location.protocol !== "file:",
      zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 1.8, minScale: 0.4, scaleSpeed: 1.2 },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: true, maxInstances: { petani_start: 1 }
    });
    // Overlay that blocks editing while the program runs
    lockEl = document.createElement("div"); lockEl.className = "ws-lock"; lockEl.hidden = true; host.append(lockEl);
    new ResizeObserver(() => Blockly.svgResize(ws)).observe(host);

    ws.addChangeListener((e) => {
      if (e && e.isUiEvent) return;
      const count = getBlockCount();
      for (const cb of changeListeners) cb(count);
    });

    load([]);
  }

  return {
    init, setTools, getProgram, getBlockCount, onChange,
    setProgram: (tree) => {
      load(tree);
      const count = getBlockCount();
      for (const cb of changeListeners) cb(count);
    },
    clear() {
      if (!locked) {
        load([]);
        const count = getBlockCount();
        for (const cb of changeListeners) cb(count);
      }
    },
    setLocked(v) { locked = v; lockEl.hidden = !v; if (!v) ws.highlightBlock(null); },
    highlight(id) { ws.highlightBlock(id); },
    resize() { Blockly.svgResize(ws); }
  };
})();
