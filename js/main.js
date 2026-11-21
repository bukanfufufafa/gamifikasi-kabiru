/* main.js — wires all modules together: navigation (jenjang -> quest -> level), mission panel, stars, and Blockly gameplay. */
(function () {
  const { Config, World, Interpreter, View, Editor, Progress } = Petani;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_YIELDS = 20000; // safety limit for endless programs
  const gridSize = Config.GRID_SIZE;

  let curQuest = null, curLevel = null;
  let ctx = { halt: true };
  let running = false;
  let nav = { jenjang: null, quest: null }; // what the selector screen is showing
  let hintShown = 0, extraMode = null;

  const jenjangOf = (id) => Config.JENJANG.find((j) => j.id === id);
  const questsOf = (jid) => Config.QUESTS.filter((q) => q.jenjang === jid);
  const realOf = (q) => q.levels.filter((lv) => !lv.isExample);
  const allReal = () => Config.QUESTS.flatMap((q) => realOf(q).map((lv) => ({ q, lv })));

  // ===== STAR RATING SYSTEM (1 - 5 BINTANG) =====
  // Quests with starMode "learning": finishing the mission is always worth >= 3 stars; a shorter program only adds bonus stars.
  function calculateStars(lv, blockCount) {
    const t = lv.starThresholds || [6, 8, 10, 13];
    if (blockCount <= t[0]) return 5;
    if (blockCount <= t[1]) return 4;
    if (blockCount <= t[2]) return 3;
    if (blockCount <= t[3]) return 2;
    return 1;
  }

  function renderStarsHtml(count, max = 5) {
    let html = "";
    for (let i = 1; i <= max; i++) html += i <= count ? '<span class="star-filled">★</span>' : '<span class="star-empty">★</span>';
    return html;
  }

  const isLearning = (q) => q && q.starMode === "learning";

  // ===== ESTIMASI BINTANG LANGSUNG =====
  function updateLiveBlockCounter(count) {
    if (!curLevel) return;
    const blockCount = typeof count === "number" ? count : Editor.getBlockCount();
    const row = $(".star-row");
    if (row) row.hidden = !!curLevel.isExample;
    const starsEl = $("#live-stars-icons");
    if (starsEl && !curLevel.isExample) starsEl.innerHTML = renderStarsHtml(calculateStars(curLevel, blockCount));
  }

  // ===== POPUP KETERANGAN BINTANG =====
  function openStarInfo() {
    const lv = curLevel;
    if (!lv || lv.isExample) return;
    const t = lv.starThresholds || [6, 8, 10, 13], used = Editor.getBlockCount();
    let rows, intro;
    if (isLearning(curQuest)) {
      intro = "Menyelesaikan misi dengan benar <b>selalu</b> mendapat minimal 3 bintang. Bintang bonus diberikan kalau kodemu lebih ringkas.";
      rows = [[5, `${t[0]} blok atau kurang`], [4, `${t[0] + 1} – ${t[1]} blok`], [3, "Misi selesai"]];
    } else {
      intro = "Jumlah bintang <b>berkurang</b> seiring bertambahnya jumlah blok kode yang kamu pakai. Semakin sedikit blok, semakin banyak bintang. Gunakan perulangan agar kodemu lebih ringkas!";
      rows = [[5, `${t[0]} blok atau kurang`], [4, `${t[0] + 1} – ${t[1]} blok`], [3, `${t[1] + 1} – ${t[2]} blok`],
              [2, `${t[2] + 1} – ${t[3]} blok`], [1, `lebih dari ${t[3]} blok`]];
    }
    $("#star-modal-intro").innerHTML = intro;
    $("#star-table").innerHTML = rows.map(([n, txt]) => `<tr><td>${renderStarsHtml(n)}</td><td>${txt}</td></tr>`).join("");
    $("#star-modal-now").innerHTML = `Saat ini kamu memakai <b>${used} blok</b> (termasuk blok "ketika diklik") → <b>${calculateStars(lv, used)} bintang</b> bila misi selesai.`;
    $("#star-modal").hidden = false;
  }
  function closeStarInfo() { $("#star-modal").hidden = true; }

  // ===== TOAST NOTIFICATION =====
  let toastTimeout = null;
  function showToast(msg) {
    let toast = $("#app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "toast-msg";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  const setHash = (h) => { if (location.hash !== h) history.replaceState(null, "", h); };

  // ===== MINI MAP HTML GENERATOR (cadangan jika WebGL tidak tersedia) =====
  const EMOJI = {
    farm: { W: "🌾", "#": "🪨", start: "🧑‍🌾" },
    bekal: { D: "🏠", T: "🧒", "#": "🌳", start: "🤖" },
    sampah: { "#": "🪨", start: "🤖" },
    koordinat: { "#": "🪨", start: "🤖" }
  };
  function generateMiniMapHtml(q, lv) {
    const img = View.thumbnail(q, lv);
    if (img) return `<img class="thumb3d" src="${img}" alt="Pratinjau 3D ${lv.title}">`;
    const map = Config.mapOf(lv) || [], n = map.length, [sx, sy] = lv.start || [0, 0], em = EMOJI[q.engine];
    let cellsHtml = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ch = (map[y] || "")[x] || ".";
        const soil = (x + y) % 2 === 0 ? "m-soil-1" : "m-soil-2";
        const start = x === sx && y === sy;
        const icon = start ? em.start : ch in Config.ITEMS ? Config.ITEMS[ch].emoji : em[ch] || "";
        cellsHtml += `<div class="m-cell ${soil}${ch === "W" ? " m-wheat" : ""}${ch === "#" ? " m-rock" : ""}${start ? " m-start" : ""}">${icon}</div>`;
      }
    }
    return `<div class="mini-map" style="grid-template-columns: repeat(${n}, 1fr); grid-template-rows: repeat(${n}, 1fr);">${cellsHtml}</div>`;
  }

  // ===== RENDER PEMILIH (jenjang -> quest -> level) =====
  function resumeTarget() {
    const last = Progress.lastLevel && Config.levelById(Progress.lastLevel);
    if (last && !last.isExample) {
      const q = Config.questById(last.questId);
      if (!Progress.isCompleted(last.id) && Progress.isUnlocked(q, last)) return { q, lv: last };
    }
    return allReal().find(({ q, lv }) => !Progress.isCompleted(lv.id) && Progress.isUnlocked(q, lv)) || null;
  }

  function renderProgressCard() {
    const real = allReal();
    let done = 0, stars = 0;
    real.forEach(({ lv }) => { if (Progress.isCompleted(lv.id)) done++; stars += Progress.stars(lv.id); });
    const pct = real.length ? Math.round((done / real.length) * 100) : 0;
    $("#stats-progress-text").textContent = `${pct}% (${done}/${real.length} Selesai)`;
    $("#stats-bar-fill").style.width = `${pct}%`;
    $("#stats-stars-count").textContent = `${stars}`;
    $("#stats-stars-max").textContent = `${real.length * 5}`;

    const unlockBtn = $("#btn-toggle-unlock");
    unlockBtn.textContent = Progress.unlockedAll ? "🔒 Kunci Bertahap" : "🔓 Buka Semua Level";
    unlockBtn.className = Progress.unlockedAll ? "btn-primary-action" : "btn-subtle";

    const resumeBtn = $("#btn-quick-resume"), target = resumeTarget();
    if (!target) {
      resumeBtn.textContent = `🏆 Semua Misi Selesai (${stars}/${real.length * 5} ⭐) – Main Lagi`;
      resumeBtn.onclick = () => openGameLevel(real[0].lv.id);
    } else {
      resumeBtn.textContent = `▶ Lanjutkan Petualangan (${target.q.title} – ${target.lv.title.split(":")[0]})`;
      resumeBtn.onclick = () => openGameLevel(target.lv.id);
    }
  }

  function renderJenjang() {
    const grid = $("#jenjang-grid");
    grid.innerHTML = "";
    Config.JENJANG.forEach((j) => {
      let done = 0, total = 0, stars = 0;
      questsOf(j.id).forEach((q) => { const s = Progress.summary(q); done += s.done; total += s.total; stars += s.stars; });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jenjang-card" + (nav.jenjang === j.id ? " is-selected" : "");
      btn.setAttribute("aria-pressed", nav.jenjang === j.id ? "true" : "false");
      btn.innerHTML = `
        <span class="jenjang-icon">${j.icon}</span>
        <span class="jenjang-text">
          <span class="jenjang-name">${j.label} <small>${j.kelas}</small></span>
          <span class="jenjang-desc">${j.desc}</span>
          <span class="jenjang-prog">${done}/${total} level · ⭐ ${stars}/${total * 5}</span>
        </span>`;
      btn.onclick = () => goNav(j.id, null);
      grid.appendChild(btn);
    });
  }

  function questCard(q) {
    const s = Progress.summary(q), pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const card = document.createElement("div");
    card.className = "quest-card" + (s.done === s.total ? " is-completed" : "");
    card.innerHTML = `
      <div class="quest-banner qb-${q.engine}"><span class="quest-emoji">${q.icon}</span></div>
      <div class="card-body">
        <div class="quest-chips"><span class="chip">${q.subject}</span><span class="chip chip-alt">${q.skill}</span></div>
        <h4 class="card-title">${q.title}</h4>
        <p class="card-desc">${q.desc}</p>
        <ul class="quest-goals">${q.goals.map((g) => `<li>${g}</li>`).join("")}</ul>
        <div class="quest-prog">
          <div class="progres-track"><div class="progres-fill" style="width:${pct}%"></div></div>
          <div class="card-meta-row"><span>${s.done}/${s.total} level selesai</span><span>⭐ ${s.stars}/${s.maxStars}</span></div>
        </div>
        <button class="btn-card-blue">${s.done === 0 ? "Mulai Quest" : s.done === s.total ? "Lihat Level" : "Lanjutkan Quest"}</button>
      </div>`;
    card.onclick = () => goNav(q.jenjang, q.id);
    return card;
  }

  function levelCard(q, lv) {
    const example = !!lv.isExample;
    const completed = !example && Progress.isCompleted(lv.id);
    const unlocked = Progress.isUnlocked(q, lv);
    const starsEarned = Progress.stars(lv.id);
    const card = document.createElement("div");
    const cls = ["kabiru-card"];
    if (example) cls.push("is-example");
    if (completed) cls.push("is-completed");
    if (!unlocked) cls.push("is-locked");
    card.className = cls.join(" ");

    const btnLabel = !unlocked ? "🔒 Level Terkunci" : example ? "Lihat Contoh" : "Mainkan";
    const starsRow = example
      ? `<div class="card-stars-row card-example-tag">Contoh · kode sudah terisi</div>`
      : `<div class="card-stars-row" title="${starsEarned} dari 5 bintang">${renderStarsHtml(starsEarned)}</div>`;

    card.innerHTML = `
      <div class="card-banner-preview">${generateMiniMapHtml(q, lv)}</div>
      <div class="card-body">
        <h4 class="card-title">${lv.title}</h4>
        ${starsRow}
        <p class="card-desc">${lv.hint}</p>
        <div class="card-meta-row"><span>Target: <b class="card-goal-val">${Config.goalLabel(q, lv)}</b></span></div>
        <button class="btn-card-blue${!unlocked ? " locked" : ""}" ${!unlocked ? "disabled" : ""}>${btnLabel}</button>
      </div>`;
    card.onclick = () => {
      if (!unlocked) return showToast(`⚠️ Selesaikan level sebelumnya dulu, atau klik "Buka Semua Level".`);
      openGameLevel(lv.id);
    };
    return card;
  }

  function renderContent() {
    const area = $("#cards-area"), head = $("#cards-heading"), sub = $("#cards-subheading"), back = $("#btn-back-quests");
    area.innerHTML = "";
    const j = jenjangOf(nav.jenjang), q = nav.quest && Config.questById(nav.quest);
    if (q) {
      back.hidden = false;
      back.textContent = `← Semua quest ${j.label}`;
      head.textContent = `${q.icon} ${q.title}`;
      sub.textContent = `${q.subject} · ${q.skill} — pilih level untuk bermain`;
      const grid = document.createElement("div");
      grid.className = "kabiru-cards-grid";
      q.levels.forEach((lv) => grid.appendChild(levelCard(q, lv)));
      area.appendChild(grid);
    } else {
      back.hidden = true;
      head.textContent = `Quest untuk ${j.label} (${j.kelas})`;
      sub.textContent = "Pilih salah satu quest untuk memulai petualangan coding";
      const grid = document.createElement("div");
      grid.className = "kabiru-cards-grid quest-grid";
      questsOf(j.id).forEach((qq) => grid.appendChild(questCard(qq)));
      area.appendChild(grid);
    }
  }

  function renderSelector() {
    renderProgressCard();
    renderJenjang();
    renderContent();
  }

  function goNav(jenjangId, questId) {
    nav.jenjang = jenjangId; nav.quest = questId;
    Progress.setLastJenjang(jenjangId);
    renderSelector();
    setHash(questId ? `#quest=${questId}` : `#jenjang=${jenjangId}`);
  }

  // ===== NAVIGASI =====
  function stopRun() {
    ctx.halt = true;
    running = false;
    Editor.setLocked(false);
    View.setRunning(false);
  }

  function openSideQuestSelector(opts) {
    stopRun();
    if (opts && opts.quest && Config.questById(opts.quest)) {
      nav.quest = opts.quest; nav.jenjang = Config.questById(opts.quest).jenjang;
    } else if (opts && opts.jenjang && jenjangOf(opts.jenjang)) {
      nav.jenjang = opts.jenjang; nav.quest = null;
    }
    $("#view-sidequest-selector").classList.add("active");
    $("#view-gameplay").classList.remove("active");
    renderSelector();
    setHash(nav.quest ? `#quest=${nav.quest}` : `#jenjang=${nav.jenjang}`);
  }

  function setTab(name) { // small screens: switch between the code editor and the arena
    $(".app").dataset.tab = name;
    $$(".mobile-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    requestAnimationFrame(() => { Editor.resize(); View.drawField(); });
  }

  function openGameLevel(id) {
    const lv = Config.levelById(id);
    if (!lv) return openSideQuestSelector();
    const q = Config.questById(lv.questId);
    nav.jenjang = q.jenjang; nav.quest = q.id;
    Progress.setLastJenjang(q.jenjang);
    $("#view-sidequest-selector").classList.remove("active");
    $("#view-gameplay").classList.add("active");

    Editor.setTools(Config.toolsOf(q, lv));
    loadLevel(q, lv);
    renderMission(lv);

    // Level contoh: blok sudah terisi. Level lain: mulai dari kosong.
    if (lv.isExample) Editor.setProgram(lv.sample); else Editor.clear();
    updateLiveBlockCounter();
    setTab("stage");
    setHash(`#level=${lv.id}`);

    const refresh = () => { Editor.resize(); View.drawField(); updateLiveBlockCounter(); };
    requestAnimationFrame(refresh);
    setTimeout(refresh, 60);
  }

  // ===== MISI, MATERI, PETUNJUK =====
  function renderMission(lv) {
    hintShown = 0; extraMode = null;
    $("#mission-card").hidden = !lv.mission;
    $("#mission-text").textContent = lv.mission || "";
    $("#mission-extra").hidden = true;
    $("#btn-learn").hidden = !lv.learn;
    $("#btn-hint").hidden = !(lv.hints && lv.hints.length);
    $("#btn-hint").textContent = "💡 Petunjuk";
  }
  function toggleLearn() {
    const box = $("#mission-extra");
    if (extraMode === "learn") { box.hidden = true; extraMode = null; return; }
    extraMode = "learn";
    box.innerHTML = `<b>📘 Materi</b><p>${curLevel.learn}</p>`;
    box.hidden = false;
  }
  function nextHint() {
    const hs = curLevel.hints || [];
    if (!hs.length) return;
    hintShown = Math.min(hintShown + 1, hs.length);
    extraMode = "hint";
    $("#mission-extra").innerHTML = `<b>💡 Petunjuk ${hintShown}/${hs.length}</b><ol>${hs.slice(0, hintShown).map((h) => `<li>${h}</li>`).join("")}</ol>`;
    $("#mission-extra").hidden = false;
    $("#btn-hint").textContent = hintShown < hs.length ? `💡 Petunjuk berikutnya (${hintShown}/${hs.length})` : `💡 Petunjuk (${hintShown}/${hs.length})`;
  }

  // ===== GAMEPLAY ENGINE =====
  function loadLevel(q, lv) {
    curQuest = q; curLevel = lv;
    Progress.setLastLevel(lv.id);

    ctx.halt = true;
    running = false;
    World.load(q, lv, gridSize);
    const j = jenjangOf(q.jenjang);
    View.showLevel(lv.title);
    $("#game-chip").textContent = `${j.icon} ${j.label} · ${q.icon} ${q.title}`;
    View.message(lv.mission ? "Tekan bendera hijau ▶ untuk menjalankan programmu." : lv.hint);
    View.showNext(false);
    View.setRunning(false);
    Editor.setLocked(false);
    View.drawField();

    updateLiveBlockCounter();
  }

  function reset() {
    ctx.halt = true;
    setTimeout(() => {
      loadLevel(curQuest, curLevel);
      updateLiveBlockCounter();
    }, 30);
  }

  function successMessage(q, lv, stars, blocksUsed) {
    if (!isLearning(q)) {
      const minOptimal = lv.minBlocks || 6;
      if (stars === 5) return `🏆 Sempurna! 5/5 bintang dengan ${blocksUsed} blok.`;
      if (stars === 4) return `🌟 Hebat! 4/5 bintang (${blocksUsed} blok). Kurangi blok hingga ≤ ${minOptimal} untuk 5 bintang.`;
      if (stars === 3) return `👍 Bagus! 3/5 bintang (${blocksUsed} blok). Pakai perulangan agar ≤ ${minOptimal} blok.`;
      return `🎉 Berhasil! ${stars}/5 bintang (${blocksUsed} blok). Pakai perulangan agar kodemu lebih ringkas.`;
    }
    const t = lv.starThresholds || [6, 8];
    const bonus = stars === 5 ? "Kodemu ringkas sekali, bonus bintang penuh! 🏆"
      : stars === 4 ? `Kodemu ringkas, bonus 1 bintang! Kurangi hingga ≤ ${t[0]} blok untuk 5 bintang.`
      : `Bonus bintang: coba buat kodemu lebih ringkas (≤ ${t[1]} blok untuk 4 bintang).`;
    return `✅ Misi selesai! ${lv.explain} Kamu mendapat ${stars}/5 bintang (${blocksUsed} blok). ${bonus}`;
  }

  async function runProgram() {
    if (running) return;
    setTab("stage"); // layar kecil: tampilkan arena agar pesan dan animasi terlihat
    const prog = Editor.getProgram();
    if (!prog) return View.message("Tambahkan blok \"ketika 🏁 diklik\" dari kategori Kejadian untuk memulai program.", "er");
    if (!prog.length) return View.message("Program masih kosong. Hubungkan blok aksi di bawah blok \"ketika diklik\".", "er");

    loadLevel(curQuest, curLevel);
    const mine = (ctx = { halt: false, hl: Editor.highlight });
    running = true;
    Editor.setLocked(true);
    View.setRunning(true);
    View.message("Menjalankan program...");

    let count = 0, won = false;
    const delay = () => 620 - +$("#spd").value * 55;

    for (const step of Interpreter.run(prog, mine)) {
      if (++count > MAX_YIELDS) {
        mine.halt = true;
        View.message("Program terlalu panjang atau terjadi infinite loop. Periksa blok while / repeat until.", "er");
        break;
      }
      if (step) {
        View.drawField();
        if (World.failure()) { mine.halt = true; break; } // rule broken (e.g. wrong bin)
        if (World.isWon()) {
          won = true;
          break;
        }
        await sleep(delay());
      }
      if (mine.halt) break;
    }

    if (ctx !== mine) return;
    View.drawField();
    won = won || World.isWon();
    running = false;
    Editor.setLocked(false);
    View.setRunning(false);

    const failure = World.failure();
    if (failure) {
      mine.halt = true;
      View.message("⚠️ " + failure, "er");
      return;
    }

    if (won) {
      mine.halt = true;
      const q = curQuest, lv = curLevel, nextLv = q.levels[lv.index + 1];

      if (lv.isExample) {
        View.message("Contoh berhasil dijalankan! Sekarang coba susun kodemu sendiri di Level 1.", "ok");
        View.showNext(!!nextLv);
      } else {
        const blocksUsed = Editor.getBlockCount();
        const starsEarned = calculateStars(lv, blocksUsed);
        Progress.recordCompletion(lv.id, starsEarned, blocksUsed);
        renderSelector();
        const fb = successMessage(q, lv, starsEarned, blocksUsed);
        View.message(nextLv ? fb : `${fb} Kamu menyelesaikan semua level di ${q.title}! ${q.icon}`, "ok");
        View.showNext(!!nextLv);
      }
    } else if (!mine.halt) {
      View.message(World.incomplete(), "er");
    }
  }

  // ===== EVENT LISTENER =====
  $("#btn-back-to-selector").onclick = () => openSideQuestSelector({ quest: curQuest && curQuest.id });
  $("#btn-back-quests").onclick = () => goNav(nav.jenjang, null);

  // Run / Reset / Next in Gameplay
  $("#run").onclick = runProgram;
  $("#rst").onclick = reset;
  $("#nx").onclick = () => {
    const nextLv = curQuest.levels[curLevel.index + 1];
    if (nextLv) openGameLevel(nextLv.id); else openSideQuestSelector({ quest: curQuest.id });
  };
  $("#clr").onclick = () => {
    Editor.clear();
    updateLiveBlockCounter();
  };
  $("#btn-learn").onclick = toggleLearn;
  $("#btn-hint").onclick = nextHint;
  $$(".mobile-tabs button").forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  $("#btn-star-info").onclick = openStarInfo;
  $("#star-modal-close").onclick = closeStarInfo;
  $("#star-modal").onclick = (e) => { if (e.target.id === "star-modal") closeStarInfo(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeStarInfo(); });

  // Level Selector Action Buttons
  $("#btn-toggle-unlock").onclick = () => {
    Progress.setUnlockedAll(!Progress.unlockedAll);
    renderSelector();
    showToast(Progress.unlockedAll ? "🔓 Semua level sekarang terbuka!" : "🔒 Mode kunci bertahap aktif kembali.");
  };

  $("#btn-reset-progress").onclick = () => {
    if (confirm("Apakah kamu yakin ingin mereset seluruh progres bermain dan bintang?")) {
      Progress.reset();
      renderSelector();
      showToast("Progres dan bintang berhasil di-reset ke awal.");
    }
  };

  // URL Hash routing: #jenjang=<id> | #quest=<id> | #level=<quest>:<level>   (#level=<angka> = tautan lama Petani Blok)
  function handleRoute() {
    const hash = location.hash;
    let m;
    if ((m = /^#level=(.+)$/.exec(hash))) {
      let id = decodeURIComponent(m[1]);
      if (/^\d+$/.test(id)) id = "petani:" + (+id === 0 ? "contoh" : id);
      if (Config.levelById(id)) return openGameLevel(id);
    } else if ((m = /^#quest=(.+)$/.exec(hash)) && Config.questById(m[1])) {
      return openSideQuestSelector({ quest: m[1] });
    } else if ((m = /^#jenjang=(.+)$/.exec(hash)) && jenjangOf(m[1])) {
      return openSideQuestSelector({ jenjang: m[1] });
    }
    openSideQuestSelector(); // default: pemilih jenjang
  }

  window.addEventListener("hashchange", handleRoute);

  // ===== INITIALIZATION =====
  Progress.load();
  const lastLv = Progress.lastLevel && Config.levelById(Progress.lastLevel);
  nav.jenjang = (lastLv && Config.questById(lastLv.questId).jenjang) || Progress.lastJenjang || Config.JENJANG[0].id;
  if (!jenjangOf(nav.jenjang)) nav.jenjang = Config.JENJANG[0].id;
  Editor.init("#blockly", []);
  Editor.onChange((count) => updateLiveBlockCounter(count));
  handleRoute();
})();
