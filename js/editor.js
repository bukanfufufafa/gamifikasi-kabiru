/* editor.js — palet blok dan area program (drag & drop / ketuk).
   Menyimpan program sebagai pohon: [{t, v, body?}, ...]. Tidak tahu apa-apa soal game. */
Petani.Editor = (function () {
  const B = Petani.Config.BLOCKS;
  let prog = [], active = null, locked = false, rootEl;

  const make = (t) => {
    const d = B[t], b = { t };
    if (d.value) b.v = d.value.def;
    if (d.container) b.body = [];
    return b;
  };
  const inTree = (arr, target) => arr === target || arr.some((b) => b.body && inTree(b.body, target));

  function add(arr, t) { if (locked) return; arr.push(make(t)); render(); }

  function control(b, spec) {
    if (spec.type === "select") {
      const s = document.createElement("select");
      for (const k in spec.options) s.add(new Option(spec.options[k], k));
      s.value = b.v; s.onchange = () => (b.v = s.value);
      return s;
    }
    const n = document.createElement("input");
    n.type = "number"; n.min = spec.min; n.max = spec.max; n.value = b.v;
    n.oninput = () => (b.v = Math.max(spec.min, Math.min(spec.max, +n.value || spec.min)));
    return n;
  }

  function renderBlock(b, arr, i) {
    const d = B[b.t], div = document.createElement("div"), row = document.createElement("div");
    div.className = "blk " + d.kind; row.className = "row";
    row.append(d.label);
    if (d.value) row.append(control(b, d.value));
    if (d.suffix) row.append(d.suffix);
    const x = document.createElement("button");
    x.className = "x"; x.textContent = "×"; x.title = "Hapus blok";
    x.onclick = (e) => { e.stopPropagation(); if (locked) return; arr.splice(i, 1); if (active && !inTree(prog, active)) active = null; render(); };
    row.append(x); div.append(row);
    div.onclick = (e) => e.stopPropagation();
    if (b.body) { const s = document.createElement("div"); s.className = "slot"; renderSlot(s, b.body); div.append(s); }
    return div;
  }

  function renderSlot(el, arr) {
    el.innerHTML = "";
    if (arr === active) el.classList.add("act");
    el.onclick = (e) => { e.stopPropagation(); active = arr; render(); };
    el.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); };
    el.ondragleave = () => el.classList.remove("over");
    el.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); const t = e.dataTransfer.getData("text/plain"); if (B[t]) add(arr, t); };
    arr.forEach((b, i) => el.append(renderBlock(b, arr, i)));
  }

  function render() { rootEl.classList.remove("act"); renderSlot(rootEl, prog); }

  function buildPalette(palEl) {
    for (const t in B) {
      const e = document.createElement("div");
      e.className = "blk " + B[t].kind; e.textContent = B[t].label; e.draggable = true; e.tabIndex = 0;
      e.ondragstart = (ev) => ev.dataTransfer.setData("text/plain", t);
      e.onclick = () => add(active || prog, t);
      e.onkeydown = (ev) => { if (ev.key === "Enter") add(active || prog, t); };
      palEl.append(e);
    }
  }

  return {
    init(rootSel, palSel) { rootEl = document.querySelector(rootSel); buildPalette(document.querySelector(palSel)); render(); },
    getProgram: () => prog,
    setProgram(p) { prog.length = 0; prog.push(...JSON.parse(JSON.stringify(p))); active = null; render(); },
    clear() { if (!locked) { prog.length = 0; active = null; render(); } },
    setLocked(v) { locked = v; }
  };
})();
