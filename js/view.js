/* view.js — 3D arena (Three.js), status text and messages.
   Draws every quest: Petani Blok (farm), Robot Pengantar Bekal (bekal), Misi Bank Sampah (sampah), Ekspedisi (koordinat).
   API: drawField, showLevel, message, setRunning, showNext, thumbnail.
   Axes: tile (x, y) -> world (x, z). "up" = away from the camera (-z), "down" = toward it (+z). */
Petani.View = (function () {
  const $ = (s) => document.querySelector(s);
  const W = Petani.World, C = Petani.Config;
  const S = 1; // size of one tile

  // ===== Model colors (change here) =====
  const COL = { soilA: 0xb5834f, soilB: 0xa5733f, grass: 0x6cbf5c, stalk: 0xd9b84a, grain: 0xf0b400, rock: 0x8d9399, rock2: 0xa4aaaf,
                skin: 0xf1c27d, shirt: 0x3fae4a, pants: 0x3b5ba5, hat: 0xf2d16b, band: 0xc0392b, eye: 0x222222, mark: 0xffd54a,
                steel: 0xa9bccd, steelD: 0x6b8299, glow: 0x38e1ff, visor: 0x1b2a3a,
                wall: 0xf5e6c8, roof: 0xd0583c, door: 0x8a5a33, trunk: 0x7a5230, leaf: 0x3f9d4a, leaf2: 0x57b85a, lunch: 0xff9f43,
                axis: 0xe8b86d, origin: 0xffd166, flag: 0xffc107, flagOk: 0x22c55e, crystal: 0x2dd4bf, concrete: 0xb0bec5 };
  const KID = [0xef4444, 0x3b82f6, 0xa855f7, 0xf97316, 0x14b8a6];
  const ITEM_COL = { k: 0xeeeeee, d: 0xc8955a, b: 0x7dd3fc, g: 0xfbbf24, p: 0xfacc15, a: 0xdc2626 };
  const ITEM_SHORT = { k: "Koran", d: "Kardus", b: "Botol", g: "Gelas", p: "Pisang", a: "Apel" };

  // Look & camera per quest engine. cam = [yaw, pitch]; extra = extra depth (bin row); pad = border around the grid.
  const THEMES = {
    farm:      { a: COL.soilA, b: COL.soilB, base: COL.grass, pad: 0.7, extra: 0, cam: [0.55, 0.85], actor: "farmer" },
    bekal:     { a: 0xeadcb8, b: 0xe0d0a6, base: 0x8fd16f, pad: 0.7, extra: 0, cam: [0.35, 0.95], zoom: 0.88, actor: "robot" },
    sampah:    { a: 0xd3dbe0, b: 0xc6cfd5, base: 0x7fc06a, pad: 0.7, extra: 1.5, cam: [0.3, 0.95], zoom: 0.85, actor: "robot" },
    koordinat: { a: 0xc9805a, b: 0xbd7450, base: 0x6e4331, pad: 1.5, extra: 0, cam: [0, 1.15], zoom: 0.95, actor: "robot" }
  };

  let renderer, scene, camera, host, tilesG, holdG, marker, sun, unit, rockGeo, coneGeo, sphereGeo, octGeo;
  let farmer, robot, actor, theme = THEMES.farm, engine = "farm", builtVersion = -1, heldKey = null;
  let size = 0, cells = [], bins = {}, tgtViews = [], lastSig = "", lastBumps = 0, lastSort = null, swing = 0, bump = 0, face = 0, tgtFace = 0;
  let yaw = 0.55, pitch = 0.85;
  const cur = { x: 0, z: 0 }, tgt = { x: 0, z: 0 }, parts = [], mats = {}, geos = {}, labelMats = {};

  // ----- Shape helpers -----
  const mat = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  function shape(parent, geo, c, x, y, z) {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, w, h, d, c, x, y, z) { const m = shape(parent, unit, c, x, y, z); m.scale.set(w, h, d); return m; }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  const cyl = (r1, r2, h, seg) => { const k = [r1, r2, h, seg].join(); return geos[k] || (geos[k] = new THREE.CylinderGeometry(r1, r2, h, seg || 12)); };

  // Text/emoji label that always faces the camera. Materials are cached by text.
  function label(text, w, h, o) {
    o = o || {};
    const key = [text, o.color, o.bg].join("|");
    let m = labelMats[key];
    if (!m) {
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = Math.max(32, Math.round(256 * h / w));
      const g = cv.getContext("2d");
      if (o.bg) { g.fillStyle = o.bg; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, cv.width, cv.height, cv.height * 0.3); else g.rect(0, 0, cv.width, cv.height); g.fill(); }
      let fs = cv.height * 0.66; g.font = "bold " + fs + "px system-ui, 'Segoe UI Emoji', sans-serif";
      while (g.measureText(text).width > cv.width * 0.92 && fs > 10) { fs -= 2; g.font = "bold " + fs + "px system-ui, 'Segoe UI Emoji', sans-serif"; }
      g.fillStyle = o.color || "#0f172a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, cv.width / 2, cv.height / 2 + 2);
      m = labelMats[key] = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
    }
    const sp = new THREE.Sprite(m); sp.scale.set(w, h, 1); return sp;
  }
  const PILL = { bg: "rgba(255,255,255,.88)" };

  // ----- Character models (voxel style, face +z) -----
  function buildFarmer() {
    const g = new THREE.Group();
    const legL = pivot(g, -0.12, 0.3, 0), legR = pivot(g, 0.12, 0.3, 0);
    box(legL, 0.18, 0.3, 0.2, COL.pants, 0, -0.15, 0); box(legR, 0.18, 0.3, 0.2, COL.pants, 0, -0.15, 0);
    box(g, 0.5, 0.4, 0.28, COL.shirt, 0, 0.5, 0);
    const armL = pivot(g, -0.33, 0.66, 0), armR = pivot(g, 0.33, 0.66, 0);
    for (const a of [armL, armR]) { box(a, 0.14, 0.28, 0.16, COL.shirt, 0, -0.14, 0); box(a, 0.12, 0.1, 0.14, COL.skin, 0, -0.33, 0); }
    box(g, 0.34, 0.32, 0.32, COL.skin, 0, 0.88, 0);
    box(g, 0.05, 0.06, 0.02, COL.eye, -0.08, 0.9, 0.165); box(g, 0.05, 0.06, 0.02, COL.eye, 0.08, 0.9, 0.165);
    shape(g, new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), COL.hat, 0, 1.06, 0);   // straw hat brim
    shape(g, new THREE.CylinderGeometry(0.19, 0.2, 0.16, 14), COL.hat, 0, 1.15, 0);    // hat crown
    shape(g, new THREE.CylinderGeometry(0.205, 0.205, 0.04, 14), COL.band, 0, 1.1, 0); // hat band
    return { g, limb: { legL, legR, armL, armR } };
  }

  function buildRobot() {
    const g = new THREE.Group();
    const legL = pivot(g, -0.12, 0.3, 0), legR = pivot(g, 0.12, 0.3, 0);
    box(legL, 0.18, 0.3, 0.2, COL.steelD, 0, -0.15, 0); box(legR, 0.18, 0.3, 0.2, COL.steelD, 0, -0.15, 0);
    box(g, 0.52, 0.42, 0.3, COL.steel, 0, 0.52, 0);
    box(g, 0.2, 0.12, 0.02, COL.glow, 0, 0.54, 0.16);
    const armL = pivot(g, -0.35, 0.68, 0), armR = pivot(g, 0.35, 0.68, 0);
    for (const a of [armL, armR]) { box(a, 0.14, 0.3, 0.16, COL.steelD, 0, -0.15, 0); box(a, 0.16, 0.1, 0.18, COL.steel, 0, -0.34, 0); }
    box(g, 0.42, 0.34, 0.36, COL.steel, 0, 0.98, 0);
    box(g, 0.34, 0.14, 0.02, COL.visor, 0, 1.0, 0.19);
    box(g, 0.07, 0.07, 0.02, COL.glow, -0.08, 1.0, 0.2); box(g, 0.07, 0.07, 0.02, COL.glow, 0.08, 1.0, 0.2);
    box(g, 0.04, 0.2, 0.04, COL.steelD, 0, 1.25, 0); box(g, 0.09, 0.09, 0.09, COL.band, 0, 1.38, 0);
    return { g, limb: { legL, legR, armL, armR } };
  }

  // ----- Props -----
  function makeWheat() {
    const g = new THREE.Group();
    [[0, 0], [.2, .15], [-.2, .12], [.15, -.2], [-.15, -.18]].forEach(([x, z], i) => {
      const h = 0.5 + (i % 3) * 0.06;
      box(g, 0.05, h, 0.05, COL.stalk, x, h / 2, z);
      box(g, 0.09, 0.2, 0.09, COL.grain, x, h + 0.08, z);
    });
    return g;
  }
  function makeRock(seed) {
    const g = new THREE.Group(), r = ((seed * 37) % 10) / 10;
    const a = shape(g, rockGeo, COL.rock, 0, 0.3, 0); a.scale.set(1, 0.85, 0.9); a.rotation.set(r, r * 6, 0);
    const b = shape(g, rockGeo, COL.rock2, 0.22, 0.13, 0.2); b.scale.setScalar(0.45); b.rotation.y = r * 4;
    return g;
  }
  function makeTree(seed) {
    const g = new THREE.Group(), r = ((seed * 37) % 10) / 10;
    box(g, 0.16, 0.45, 0.16, COL.trunk, 0, 0.22, 0);
    const a = shape(g, coneGeo, COL.leaf, 0, 0.75, 0); a.scale.set(1, 1, 1); a.rotation.y = r;
    const b = shape(g, coneGeo, COL.leaf2, 0, 1.05, 0); b.scale.setScalar(0.7); b.rotation.y = r * 2;
    return g;
  }
  function makeHouse() {
    const g = new THREE.Group();
    box(g, 0.78, 0.46, 0.78, COL.wall, 0, 0.23, 0);
    const roof = shape(g, coneGeo, COL.roof, 0, 0.68, 0); roof.scale.set(1.5, 0.75, 1.5); roof.rotation.y = Math.PI / 4;
    box(g, 0.2, 0.3, 0.02, COL.door, 0, 0.15, 0.4);
    const t = label("Dapur", 0.9, 0.28, PILL); t.position.set(0, 1.25, 0); g.add(t);
    return g;
  }
  function makeFriend(i) {
    const g = new THREE.Group(), shirt = KID[i % KID.length];
    box(g, 0.1, 0.22, 0.12, COL.pants, -0.08, 0.11, 0); box(g, 0.1, 0.22, 0.12, COL.pants, 0.08, 0.11, 0);
    box(g, 0.32, 0.3, 0.2, shirt, 0, 0.37, 0);
    box(g, 0.08, 0.26, 0.1, shirt, -0.21, 0.4, 0); box(g, 0.08, 0.26, 0.1, shirt, 0.21, 0.4, 0);
    box(g, 0.26, 0.26, 0.26, COL.skin, 0, 0.67, 0);
    box(g, 0.28, 0.1, 0.28, 0x3b2a20, 0, 0.82, -0.01);
    box(g, 0.04, 0.05, 0.02, COL.eye, -0.06, 0.68, 0.135); box(g, 0.04, 0.05, 0.02, COL.eye, 0.06, 0.68, 0.135);
    return g;
  }
  function makeItem(k, s) {
    const g = new THREE.Group();
    switch (k) {
      case "k": box(g, 0.44, 0.08, 0.32, ITEM_COL.k, 0, 0.05, 0); box(g, 0.32, 0.09, 0.04, 0x6b7280, 0, 0.055, -0.07); box(g, 0.32, 0.09, 0.04, 0x6b7280, 0, 0.055, 0.05); break;
      case "d": box(g, 0.34, 0.28, 0.34, ITEM_COL.d, 0, 0.14, 0); box(g, 0.07, 0.285, 0.35, 0xe0b97d, 0, 0.14, 0); break;
      case "b": shape(g, cyl(0.1, 0.1, 0.34), ITEM_COL.b, 0, 0.17, 0); shape(g, cyl(0.05, 0.05, 0.07), 0xef4444, 0, 0.38, 0); break;
      case "g": shape(g, cyl(0.14, 0.1, 0.26), ITEM_COL.g, 0, 0.13, 0); break;
      case "p": { const m = box(g, 0.36, 0.07, 0.13, ITEM_COL.p, 0, 0.05, 0); m.rotation.y = 0.5; const t = box(g, 0.07, 0.08, 0.07, 0x5b3a1a, 0.17, 0.06, -0.08); t.rotation.y = 0.5; break; }
      case "a": shape(g, sphereGeo, ITEM_COL.a, 0, 0.16, 0); box(g, 0.03, 0.08, 0.03, 0x3f2a14, 0, 0.34, 0); box(g, 0.08, 0.02, 0.05, 0x22c55e, 0.05, 0.36, 0); break;
    }
    g.scale.setScalar(s || 1);
    return g;
  }
  function makeFlag(color, text, tall) {
    const g = new THREE.Group(), h = tall ? 0.9 : 0.75;
    box(g, 0.05, h, 0.05, 0xf8fafc, 0, h / 2, 0); box(g, 0.34, 0.22, 0.03, color, 0.19, h - 0.12, 0);
    const t = label(text, 0.8, 0.3, PILL); t.position.set(0, h + 0.3, 0); g.add(t);
    return g;
  }
  function makeCrystal(text) {
    const g = new THREE.Group(), c = shape(g, octGeo, COL.crystal, 0, 0.3, 0); c.scale.set(1, 1.5, 1);
    const t = label(text, 0.8, 0.3, PILL); t.position.set(0, 0.95, 0); g.add(t);
    return g;
  }
  function makeBin(b) {
    const g = new THREE.Group();
    box(g, 0.8, 0.7, 0.6, b.color, 0, 0.35, 0); box(g, 0.9, 0.1, 0.7, 0x334155, 0, 0.75, 0);
    const t = label(b.emoji + " " + b.label, 1.3, 0.4, PILL); t.position.set(0, 1.3, 0); g.add(t);
    return g;
  }

  // ----- Build the arena for the loaded level -----
  function build(st) {
    engine = st.engine; theme = THEMES[engine]; size = st.size;
    const n = size, half = (n - 1) / 2;
    host.dataset.engine = engine;
    [yaw, pitch] = theme.cam;
    actor = theme.actor === "farmer" ? farmer : robot; farmer.g.visible = actor === farmer; robot.g.visible = actor === robot;
    while (tilesG.children.length) tilesG.remove(tilesG.children[0]);
    while (holdG.children.length) holdG.remove(holdG.children[0]);
    heldKey = null; bins = {}; tgtViews = []; cells = []; lastSort = null;

    box(tilesG, n * S + theme.pad, 0.3, n * S + theme.pad, theme.base, 0, -0.2, 0);
    const e = (n + theme.extra) * 0.85 + 2, sc = sun.shadow.camera; // keep the shadow camera covering the whole arena
    sc.left = sc.bottom = -e; sc.right = sc.top = e; sc.updateProjectionMatrix();

    if (engine === "sampah") { // bin row behind the field
      const bz = -(n * S + 0.7) / 2 - 0.75, gap = Math.min(2.2, n / 3);
      box(tilesG, n * S + 0.7, 0.3, 1.5, COL.concrete, 0, -0.2, bz);
      C.BINS.forEach((b, i) => { const g = makeBin(b); g.position.set((i - 1) * gap, 0, bz); tilesG.add(g); bins[b.id] = { g, pulse: 0, x: g.position.x, z: bz }; });
    }

    for (let y = 0; y < n; y++) { cells.push([]); for (let x = 0; x < n; x++) {
      const wx = (x - half) * S, wz = (y - half) * S, cd = st.grid[y][x];
      let col = (x + y) % 2 ? theme.a : theme.b;
      if (engine === "koordinat") col = x === half && y === half ? COL.origin : (x === half || y === half ? COL.axis : col);
      box(tilesG, 0.94, 0.3, 0.94, col, wx, -0.15, wz);
      const slot = pivot(tilesG, wx, 0, wz), cell = { wx, wz, s: -1, pop: 1 };
      cells[y].push(cell);
      if (cd.rock) { slot.add(engine === "bekal" ? makeTree(x * 3 + y) : makeRock(x * 3 + y)); cell.rock = true; continue; }
      if (engine === "farm") { cell.prop = cell.popObj = makeWheat(); cell.sway = true; cell.prop.visible = false; slot.add(cell.prop); cell.ph = x + y * 1.7; }
      else if (engine === "bekal" && cd.kitchen) slot.add(makeHouse());
      else if (engine === "bekal" && cd.friend) {
        slot.add(makeFriend(x + y));
        const badge = new THREE.Group(), tick = label("✅", 0.4, 0.4); badge.add(tick); badge.position.set(0, 1.05, 0); badge.visible = false;
        slot.add(badge); cell.kind = "friend"; cell.prop = badge; cell.popObj = badge;
      } else if (engine === "sampah" && cd.item0) {
        const g = new THREE.Group(); g.add(makeItem(cd.item0, 1.25));
        const t = label(ITEM_SHORT[cd.item0], 0.95, 0.3, PILL); t.position.set(0, x % 2 ? 0.95 : 0.7, 0); g.add(t);
        slot.add(g); cell.kind = "item"; cell.prop = g; cell.item = cd.item0;
      }
    } }

    if (engine === "koordinat") { // axis numbers + targets
      for (let i = 0; i < n; i++) {
        const v = i - half, lx = label(String(v), 0.42, 0.34, { color: "#fff", bg: "rgba(15,23,42,.55)" }), ly = label(String(-v), 0.42, 0.34, { color: "#fff", bg: "rgba(15,23,42,.55)" });
        lx.position.set(v * S, 0.12, n * S / 2 + 0.55); ly.position.set(-n * S / 2 - 0.55, 0.12, v * S);
        tilesG.add(lx, ly);
      }
      const axo = { color: "#ffd166", bg: "rgba(15,23,42,.7)" }, ax = label("x", 0.5, 0.42, axo), ay = label("y", 0.5, 0.42, axo);
      ax.position.set(n * S / 2 + 0.6, 0.12, 0); ay.position.set(0, 0.12, -n * S / 2 - 0.6); tilesG.add(ax, ay);
      st.targets.forEach((t) => {
        const wx = (t.col - half) * S, wz = (t.row - half) * S, collect = st.level.mode === "collect";
        const pre = collect ? null : makeFlag(COL.flag, t.label, false), ok = collect ? makeCrystal(t.label + " ✓") : makeFlag(COL.flagOk, t.label + " ✓", true);
        if (pre) { pre.position.set(wx, 0, wz); pre.visible = !!st.level.showTargets; tilesG.add(pre); }
        ok.position.set(wx, 0, wz); ok.visible = false; tilesG.add(ok);
        tgtViews.push({ pre, ok, wx, wz, done: false, pop: 1 });
      });
    }
  }

  function burst(x, z, cols, y0) { // little particles
    for (let i = 0; i < 10; i++) parts.push({
      m: box(scene, 0.08, 0.08, 0.08, cols[i % cols.length], x, y0 || 0.5, z),
      vx: (Math.random() - .5) * 2.2, vy: 2 + Math.random() * 1.5, vz: (Math.random() - .5) * 2.2, life: 0.7 });
  }

  // What the robot is holding (lunch boxes or one item), floating above its head
  function setHeld(st) {
    const key = st.engine + ":" + (st.carried || "");
    if (key === heldKey) return;
    heldKey = key;
    while (holdG.children.length) holdG.remove(holdG.children[0]);
    if (!st.carried) return;
    if (st.engine === "bekal") {
      box(holdG, 0.28, 0.22, 0.28, COL.lunch, 0, 0, 0);
      const t = label("🍱 ×" + st.carried, 0.95, 0.3, { bg: "rgba(255,255,255,.92)", color: "#7c2d12" }); t.position.set(0, 0.32, 0); holdG.add(t);
    } else if (st.engine === "sampah") { const it = makeItem(st.carried, 1.1); it.position.y = -0.1; holdG.add(it); }
  }

  // ----- One-time setup (on first draw) -----
  function init() {
    if (renderer) return true;
    host = $("#field");
    const fail = (t) => { host.innerHTML = '<p style="padding:12px;margin:0">' + t + "</p>"; return false; };
    if (typeof THREE === "undefined") return fail("Three.js gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.");
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return fail("Peramban ini tidak mendukung WebGL."); }
    unit = new THREE.BoxGeometry(1, 1, 1); rockGeo = new THREE.DodecahedronGeometry(0.36, 0);
    coneGeo = new THREE.ConeGeometry(0.38, 0.7, 7); sphereGeo = new THREE.SphereGeometry(0.15, 12, 10); octGeo = new THREE.OctahedronGeometry(0.2, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = renderer.domElement; cv.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.innerHTML = ""; host.append(cv);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.8));
    sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(5, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 30; scene.add(sun);

    tilesG = new THREE.Group(); scene.add(tilesG);
    holdG = new THREE.Group(); scene.add(holdG);
    farmer = buildFarmer(); robot = buildRobot(); scene.add(farmer.g, robot.g);
    actor = farmer; robot.g.visible = false;
    marker = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: COL.mark, transparent: true, opacity: 0.45 }));
    marker.rotation.x = -Math.PI / 2; scene.add(marker);

    // Drag to orbit the camera (optional — the game never requires it)
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      yaw -= (e.clientX - drag.x) * 0.008;
      pitch = Math.max(0.35, Math.min(1.45, pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    });
    const stop = () => (drag = null);
    cv.addEventListener("pointerup", stop); cv.addEventListener("pointercancel", stop);

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host); resize();
    loop();
    return true;
  }

  // ----- Per-frame animation -----
  const clock = typeof THREE === "undefined" ? null : new THREE.Clock();
  const popScale = (p) => 0.15 + 0.85 * (1 - Math.pow(1 - p, 3));
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, limb = actor.limb, body = actor.g;

    // Character: smooth slide, small hop, swinging limbs, turns toward the walking direction
    const dx = tgt.x - cur.x, dz = tgt.z - cur.z, dist = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * 16);
    cur.x += dx * k; cur.z += dz * k;
    const prog = Math.min(dist / S, 1), mv = Math.min(prog * 2, 1);
    let da = tgtFace - face; da = Math.atan2(Math.sin(da), Math.cos(da));
    face += da * (1 - Math.exp(-dt * 18)); body.rotation.y = face;
    body.position.set(cur.x, Math.sin(prog * Math.PI) * 0.2, cur.z);
    if (bump > 0) { // lurch toward an obstacle / the edge when blocked
      bump = Math.max(0, bump - dt * 4); const o = Math.sin((1 - bump) * Math.PI) * 0.14;
      body.position.x += Math.sin(face) * o; body.position.z += Math.cos(face) * o;
    }
    const w = Math.sin(t * 16) * 0.7 * mv;
    limb.legL.rotation.x = w; limb.legR.rotation.x = -w; limb.armL.rotation.x = -w * 0.8; limb.armR.rotation.x = w * 0.8;
    if (swing > 0) { // action swing
      swing = Math.max(0, swing - dt * 3);
      limb.armL.rotation.x = limb.armR.rotation.x = -Math.sin((1 - swing) * Math.PI) * 1.4;
    }
    marker.position.set(cur.x, 0.012, cur.z);
    holdG.position.set(cur.x, 1.75 + Math.sin(t * 3) * 0.03, cur.z);

    // Tile props: pop-in and sway
    for (const row of cells) for (const c of row) {
      if (c.rock) continue;
      if (c.pop < 1 && c.popObj) { c.pop = Math.min(1, c.pop + dt * 3.5); c.popObj.scale.setScalar(popScale(c.pop)); }
      if (c.sway) c.prop.rotation.z = Math.sin(t * 2 + c.ph) * 0.05;
    }
    for (const b of Object.values(bins)) { // bin bounce after sorting
      if (b.pulse > 0) { b.pulse = Math.max(0, b.pulse - dt * 3); b.g.scale.y = 1 + Math.sin((1 - b.pulse) * Math.PI) * 0.25; } else b.g.scale.y = 1;
    }
    for (const v of tgtViews) if (v.pop < 1) { v.pop = Math.min(1, v.pop + dt * 3.5); v.ok.scale.setScalar(popScale(v.pop)); }
    // Particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vy -= 9 * dt; p.life -= dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(Math.max(0.001, p.life / 0.7) * 0.08);
      if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
    }

    // Orbit camera, distance fits the arena size
    const span = size + theme.extra, d = (span * 1.45 + 3.2) * Math.max(1, 1.3 / camera.aspect) * (theme.zoom || 1), cp = Math.cos(pitch), tz = -theme.extra / 2;
    camera.position.set(Math.sin(yaw) * cp * d, Math.sin(pitch) * d + 0.3, Math.cos(yaw) * cp * d + tz);
    camera.lookAt(0, 0.2, tz);
    renderer.render(scene, camera);
  }

  // Sync tile props with the world state (called on every draw)
  function syncProps(st) {
    const n = st.size;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = cells[y][x], g = st.grid[y][x]; if (c.rock || !c.prop) continue;
      if (engine === "farm") {
        const s = g.wheat ? 1 : 0; if (c.s === s) continue;
        if (c.s === 1 && s === 0 && st.score > 0) burst(c.wx, c.wz, [COL.grain, COL.stalk]);
        c.prop.visible = s === 1; c.prop.scale.setScalar(1);
        if (c.s !== -1 && s) c.pop = 0;
        c.s = s;
      } else if (c.kind === "friend") {
        const s = g.fed ? 1 : 0; if (c.s === s) continue;
        c.prop.visible = s === 1;
        if (c.s !== -1 && s) { c.pop = 0; burst(c.wx, c.wz, [COL.lunch, 0xfde68a], 0.9); }
        c.s = s;
      } else if (c.kind === "item") {
        const s = g.item ? 1 : 0; if (c.s === s) continue;
        c.prop.visible = s === 1;
        if (c.s === 1 && s === 0) burst(c.wx, c.wz, [ITEM_COL[c.item], 0xffffff]);
        c.s = s;
      }
    }
    if (engine === "sampah" && st.lastSort !== lastSort) { // item dropped into a bin
      lastSort = st.lastSort;
      const b = lastSort && bins[lastSort.cat];
      if (b) { b.pulse = 1; burst(b.x, b.z, [C.BINS.find((x) => x.id === lastSort.cat).color, 0xffffff], 0.9); }
    }
    if (engine === "koordinat") st.targets.forEach((t, i) => {
      const v = tgtViews[i]; if (!v || v.done === t.done) return;
      v.done = t.done; if (v.pre) v.pre.visible = !t.done && !!st.level.showTargets;
      v.ok.visible = t.done; if (t.done) { v.pop = 0; burst(v.wx, v.wz, [COL.crystal, COL.flagOk, 0xffffff], 0.8); }
    });
  }

  // ----- API (called by main.js) -----
  function drawField() {
    const st = W.state;
    $("#sc").textContent = W.status();
    if (!init()) return;

    let snap = false;
    if (st.version !== builtVersion) { build(st); builtVersion = st.version; snap = true; lastSig = st.sig; lastBumps = st.bumps; }
    const n = st.size, tx = (st.pos[0] - (n - 1) / 2) * S, tz = (st.pos[1] - (n - 1) / 2) * S;
    if (Math.hypot(tx - cur.x, tz - cur.z) > 1.5 * S) snap = true;

    const acted = st.sig !== lastSig;
    syncProps(st); setHeld(st);

    if (snap) { cur.x = tx; cur.z = tz; face = tgtFace = 0; }
    else if (tx !== tgt.x || tz !== tgt.z) tgtFace = Math.atan2(tx - tgt.x, tz - tgt.z);
    else if (st.bumps > lastBumps) { tgtFace = Math.atan2(st.bumpDir[0], st.bumpDir[1]); bump = 1; }
    else if (acted) swing = 1;
    tgt.x = tx; tgt.z = tz; lastSig = st.sig; lastBumps = st.bumps;
  }

  function showLevel(title) { $("#lvt").textContent = title; }
  function message(text, kind) { const m = $("#msg"); m.textContent = text; m.className = "msg " + (kind || ""); }
  function setRunning(on) { $("#run").disabled = on; }
  function showNext(on) { $("#nx").hidden = !on; }

  // ===== Thumbnail 3D untuk kartu level (LOD rendah) =====
  // Satu renderer bersama, tiap level dirender sekali ke gambar PNG lalu di-cache.
  // Model disederhanakan: tanpa bayangan dan tanpa label, bentuk props dibuat dari kotak.
  const thumbCache = {};
  let thumbRenderer = null;
  function thumbnail(q, level) {
    const key = level.id;
    if (key in thumbCache) return thumbCache[key];
    thumbCache[key] = null; // jika gagal, pakai tampilan CSS sebagai cadangan
    if (typeof THREE === "undefined") return null;
    try {
      const eng = q.engine, th = THEMES[eng], map = C.mapOf(level), n = map.length, half = (n - 1) / 2, [sx, sy] = level.start || [0, 0];
      const W_PX = 360, H_PX = 260;
      if (!thumbRenderer) {
        thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbRenderer.setPixelRatio(1); thumbRenderer.setSize(W_PX, H_PX, false); thumbRenderer.setClearColor(0x000000, 0);
      }
      const sc = new THREE.Scene(), tg = [];
      const g = (geo) => (tg.push(geo), geo);
      const unitG = g(new THREE.BoxGeometry(1, 1, 1)), rockG = g(new THREE.DodecahedronGeometry(0.36, 0)), hatG = g(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8));
      const put = (geo, c, x, y, z, w, h, d) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); if (w) m.scale.set(w, h, d); sc.add(m); return m; };

      sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9));
      const sun2 = new THREE.DirectionalLight(0xffffff, 0.6); sun2.position.set(5, 9, 6); sc.add(sun2);

      put(unitG, th.base, 0, -0.2, 0, n + th.pad, 0.3, n + th.pad);
      if (th.extra) { // bin row
        const bz = -(n + 0.7) / 2 - 0.75, gap = Math.min(2.2, n / 3);
        put(unitG, COL.concrete, 0, -0.2, bz, n + 0.7, 0.3, 1.5);
        C.BINS.forEach((b, i) => put(unitG, b.color, (i - 1) * gap, 0.3, bz, 0.8, 0.6, 0.6));
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const wx = x - half, wz = y - half, ch = map[y][x];
        let col = (x + y) % 2 ? th.a : th.b;
        if (eng === "koordinat") col = x === half && y === half ? COL.origin : (x === half || y === half ? COL.axis : col);
        put(unitG, col, wx, -0.15, wz, 0.94, 0.3, 0.94);
        if (ch === "#") {
          if (eng === "bekal") { put(unitG, COL.trunk, wx, 0.22, wz, 0.16, 0.45, 0.16); put(unitG, COL.leaf, wx, 0.7, wz, 0.5, 0.55, 0.5); }
          else { const r = put(rockG, COL.rock, wx, 0.3, wz); r.scale.set(1, 0.85, 0.9); r.rotation.y = (x * 3 + y) * 0.9; }
        } else if (eng === "farm" && ch === "W") { put(unitG, COL.stalk, wx, 0.25, wz, 0.12, 0.5, 0.12); put(unitG, COL.grain, wx, 0.55, wz, 0.2, 0.22, 0.2); }
        else if (eng === "bekal" && ch === "D") { put(unitG, COL.wall, wx, 0.25, wz, 0.78, 0.5, 0.78); put(unitG, COL.roof, wx, 0.62, wz, 0.9, 0.24, 0.9); }
        else if (eng === "bekal" && ch === "T") { put(unitG, KID[(x + y) % KID.length], wx, 0.35, wz, 0.32, 0.32, 0.22); put(unitG, COL.skin, wx, 0.66, wz, 0.26, 0.26, 0.26); }
        else if (eng === "sampah" && ch in ITEM_COL) put(unitG, ITEM_COL[ch], wx, 0.18, wz, 0.34, 0.3, 0.34);
      }
      if (eng === "koordinat" && level.showTargets) (level.targets || []).forEach((t) => {
        put(unitG, 0xf8fafc, t.x, 0.4, -t.y, 0.05, 0.8, 0.05); put(unitG, COL.flag, t.x + 0.19, 0.68, -t.y, 0.34, 0.22, 0.03);
      });
      const fx = sx - half, fz = sy - half;
      if (eng === "farm") { put(unitG, COL.shirt, fx, 0.5, fz, 0.45, 0.45, 0.3); put(unitG, COL.skin, fx, 0.88, fz, 0.32, 0.3, 0.3); put(hatG, COL.hat, fx, 1.08, fz); }
      else { put(unitG, COL.steel, fx, 0.52, fz, 0.5, 0.42, 0.3); put(unitG, COL.steel, fx, 0.98, fz, 0.42, 0.34, 0.36); put(unitG, COL.glow, fx, 1.0, fz + 0.19, 0.3, 0.1, 0.02); }

      const cam = new THREE.PerspectiveCamera(40, W_PX / H_PX, 0.1, 100), tz = -th.extra / 2, d = (n + th.extra) * 1.2 + 3;
      const cp = Math.cos(th.cam[1]);
      cam.position.set(Math.sin(th.cam[0]) * cp * d, Math.sin(th.cam[1]) * d + 0.3, Math.cos(th.cam[0]) * cp * d + tz);
      cam.lookAt(0, 0.1, tz);
      thumbRenderer.render(sc, cam);
      thumbCache[key] = thumbRenderer.domElement.toDataURL("image/png");
      tg.forEach((geo) => geo.dispose());
    } catch (e) { console.warn("Thumbnail 3D gagal:", e); }
    return thumbCache[key];
  }

  return { drawField, showLevel, message, setRunning, showNext, thumbnail };
})();
