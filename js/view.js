/* view.js — 3D field (Three.js), score and messages.
   API: drawField, showLevel, message, setRunning, showNext.
   Axes: tile (x, y) -> world (x, z). "up" = away from the camera (-z), "down" = toward it (+z). */
Petani.View = (function () {
  const $ = (s) => document.querySelector(s);
  const W = Petani.World;
  const S = 1; // size of one tile

  // ===== Model colors (change here) =====
  const COL = { soilA: 0xb5834f, soilB: 0xa5733f, grass: 0x6cbf5c, stalk: 0xd9b84a, grain: 0xf0b400, rock: 0x8d9399, rock2: 0xa4aaaf,
                skin: 0xf1c27d, shirt: 0x3fae4a, pants: 0x3b5ba5, hat: 0xf2d16b, band: 0xc0392b, eye: 0x222222, mark: 0xffd54a };

  let renderer, scene, camera, host, tilesG, farmer, marker, limb, sun, unit, rockGeo, builtMap = null;
  let size = 0, cells = [], lastScore = 0, lastBumps = 0, swing = 0, bump = 0, face = 0, tgtFace = 0;
  let yaw = 0.55, pitch = 0.85;
  const cur = { x: 0, z: 0 }, tgt = { x: 0, z: 0 }, parts = [], mats = {};

  // ----- Shape helpers -----
  const mat = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  function shape(parent, geo, c, x, y, z) {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, w, h, d, c, x, y, z) { const m = shape(parent, unit, c, x, y, z); m.scale.set(w, h, d); return m; }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  // ----- Farmer model (voxel style, faces +z) -----
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
    limb = { legL, legR, armL, armR };
    return g;
  }

  // ----- Wheat and rock models -----
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

  // ----- Build the tile grid -----
  function build(n, grid) {
    size = n; cells = [];
    while (tilesG.children.length) tilesG.remove(tilesG.children[0]);
    box(tilesG, n * S + 0.7, 0.3, n * S + 0.7, COL.grass, 0, -0.2, 0);
    const e = n * 0.85 + 2, sc = sun.shadow.camera; // keep the shadow camera covering the whole field
    sc.left = sc.bottom = -e; sc.right = sc.top = e; sc.updateProjectionMatrix();
    for (let y = 0; y < n; y++) { cells.push([]); for (let x = 0; x < n; x++) {
      const wx = (x - (n - 1) / 2) * S, wz = (y - (n - 1) / 2) * S;
      box(tilesG, 0.94, 0.3, 0.94, (x + y) % 2 ? COL.soilA : COL.soilB, wx, -0.15, wz);
      const slot = pivot(tilesG, wx, 0, wz);
      if (grid[y][x].rock) { slot.add(makeRock(x * 3 + y)); cells[y].push({ rock: true }); continue; }
      const wheat = makeWheat(); wheat.visible = false; slot.add(wheat);
      cells[y].push({ wheat, s: -1, pop: 1, wx, wz, ph: x + y * 1.7 });
    } }
  }

  function burst(x, z) { // grain particles when harvesting
    for (let i = 0; i < 10; i++) parts.push({
      m: box(scene, 0.08, 0.08, 0.08, i % 2 ? COL.grain : COL.stalk, x, 0.5, z),
      vx: (Math.random() - .5) * 2.2, vy: 2 + Math.random() * 1.5, vz: (Math.random() - .5) * 2.2, life: 0.7 });
  }

  // ----- One-time setup (on first draw) -----
  function init() {
    if (renderer) return true;
    host = $("#field");
    const fail = (t) => { host.innerHTML = '<p style="padding:12px;margin:0">' + t + "</p>"; return false; };
    if (typeof THREE === "undefined") return fail("Three.js failed to load. Check your internet connection and reload.");
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return fail("This browser does not support WebGL."); }
    unit = new THREE.BoxGeometry(1, 1, 1); rockGeo = new THREE.DodecahedronGeometry(0.36, 0);
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
    farmer = buildFarmer(); scene.add(farmer);
    marker = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: COL.mark, transparent: true, opacity: 0.45 }));
    marker.rotation.x = -Math.PI / 2; scene.add(marker);

    // Drag to orbit the camera
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
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

    // Farmer: smooth slide, small hop, swinging limbs, turns toward the walking direction
    const dx = tgt.x - cur.x, dz = tgt.z - cur.z, dist = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * 16);
    cur.x += dx * k; cur.z += dz * k;
    const prog = Math.min(dist / S, 1), mv = Math.min(prog * 2, 1);
    let da = tgtFace - face; da = Math.atan2(Math.sin(da), Math.cos(da));
    face += da * (1 - Math.exp(-dt * 18)); farmer.rotation.y = face;
    farmer.position.set(cur.x, Math.sin(prog * Math.PI) * 0.2, cur.z);
    if (bump > 0) { // lurch toward a rock / the edge when blocked
      bump = Math.max(0, bump - dt * 4); const o = Math.sin((1 - bump) * Math.PI) * 0.14;
      farmer.position.x += Math.sin(face) * o; farmer.position.z += Math.cos(face) * o;
    }
    const w = Math.sin(t * 16) * 0.7 * mv;
    limb.legL.rotation.x = w; limb.legR.rotation.x = -w; limb.armL.rotation.x = -w * 0.8; limb.armR.rotation.x = w * 0.8;
    if (swing > 0) { // harvest swing
      swing = Math.max(0, swing - dt * 3);
      limb.armL.rotation.x = limb.armR.rotation.x = -Math.sin((1 - swing) * Math.PI) * 1.4;
    }
    marker.position.set(cur.x, 0.012, cur.z);

    // Wheat: pop-in + sway
    for (const row of cells) for (const c of row) {
      if (c.rock) continue;
      if (c.pop < 1) { c.pop = Math.min(1, c.pop + dt * 3.5); c.wheat.scale.setScalar(0.15 + 0.85 * (1 - Math.pow(1 - c.pop, 3))); }
      c.wheat.rotation.z = Math.sin(t * 2 + c.ph) * 0.05;
    }
    // Harvest particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vy -= 9 * dt; p.life -= dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(Math.max(0.001, p.life / 0.7) * 0.08);
      if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
    }

    // Orbit camera, distance fits the field size
    const d = (size * 1.45 + 3.2) * Math.max(1, 1.3 / camera.aspect), cp = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * cp * d, Math.sin(pitch) * d + 0.3, Math.cos(yaw) * cp * d);
    camera.lookAt(0, 0.2, 0);
    renderer.render(scene, camera);
  }

  // ----- API (called by main.js) -----
  function drawField() {
    const { size: n, grid, map, pos, score, goal, bumps, bumpDir } = W.state;
    $("#sc").textContent = "Harvested: " + score + " / " + goal;
    if (!init()) return;

    let snap = false, changed = false;
    if (map !== builtMap) { build(n, grid); builtMap = map; snap = true; } // new level or grid size
    if (score < lastScore) snap = true; // program restarted
    const tx = (pos[0] - (n - 1) / 2) * S, tz = (pos[1] - (n - 1) / 2) * S;
    if (Math.hypot(tx - cur.x, tz - cur.z) > 1.5 * S) snap = true;

    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = cells[y][x]; if (c.rock) continue;
      const s = grid[y][x].wheat ? 1 : 0;
      if (c.s === s) continue;
      if (c.s === 1 && s === 0 && score > lastScore) burst(c.wx, c.wz);
      c.wheat.visible = s === 1; c.wheat.scale.setScalar(1);
      if (c.s !== -1) { changed = true; if (s) c.pop = 0; }
      c.s = s;
    }

    if (snap) { cur.x = tx; cur.z = tz; face = tgtFace = 0; }
    else if (tx !== tgt.x || tz !== tgt.z) tgtFace = Math.atan2(tx - tgt.x, tz - tgt.z);
    else if (bumps > lastBumps) { tgtFace = Math.atan2(bumpDir[0], bumpDir[1]); bump = 1; }
    else if (changed) swing = 1;
    tgt.x = tx; tgt.z = tz; lastScore = score; lastBumps = bumps;
  }

  function showLevel(title, goal) { $("#lvt").textContent = title; $("#goal").textContent = "Goal: harvest " + goal; }
  function message(text, kind) { const m = $("#msg"); m.textContent = text; m.className = "msg " + (kind || ""); }
  function setRunning(on) { $("#run").disabled = on; }
  function showNext(on) { $("#nx").hidden = !on; }

  return { drawField, showLevel, message, setRunning, showNext };
})();
