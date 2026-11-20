/* main.js — wires all modules together: Kabiru navigation, Side Quest, Level Selector, stars, and Blockly gameplay. */
(function () {
  const { Config, World, Interpreter, View, Editor } = Petani;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_YIELDS = 20000; // safety limit for endless programs

  let levelIndex = 0;
  let gridSize = Config.GRID_SIZE;
  let ctx = { halt: true };
  let running = false;

  // ===== STAR RATING SYSTEM (1 - 5 BINTANG) =====
  function calculateStars(lvlIdx, blockCount) {
    const lv = Config.LEVELS[lvlIdx];
    const t = (lv && lv.starThresholds) || [6, 8, 10, 13];
    if (blockCount <= t[0]) return 5;
    if (blockCount <= t[1]) return 4;
    if (blockCount <= t[2]) return 3;
    if (blockCount <= t[3]) return 2;
    return 1;
  }

  function renderStarsHtml(count, max = 5) {
    let html = "";
    for (let i = 1; i <= max; i++) {
      if (i <= count) {
        html += '<span class="star-filled">★</span>';
      } else {
        html += '<span class="star-empty">★</span>';
      }
    }
    return html;
  }

  // ===== PROGRESS & LOCAL STORAGE =====
  const STORAGE_KEY = "kabiru_sidequest_progress_v3";
  let progress = {
    completed: {},     // { [levelIndex]: true }
    stars: {},         // { [levelIndex]: number (1-5) }
    bestBlocks: {},    // { [levelIndex]: number }
    unlockedAll: false,
    lastLevel: 0,
    exp: 10,
    streak: 0
  };

  function loadProgress() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object") {
          progress = {
            completed: parsed.completed || {},
            stars: parsed.stars || {},
            bestBlocks: parsed.bestBlocks || {},
            unlockedAll: !!parsed.unlockedAll,
            lastLevel: typeof parsed.lastLevel === "number" ? parsed.lastLevel : 0,
            exp: typeof parsed.exp === "number" ? parsed.exp : 10,
            streak: typeof parsed.streak === "number" ? parsed.streak : 0
          };
        }
      }
    } catch (e) {
      console.warn("Storage warning:", e);
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn("Storage save failed:", e);
    }
  }

  const isExample = (i) => !!(Config.LEVELS[i] && Config.LEVELS[i].isExample);
  const realLevels = () => Config.LEVELS.map((lv, i) => i).filter((i) => !isExample(i));

  function isLevelCompleted(i) {
    return !!progress.completed[i];
  }

  function isLevelUnlocked(i) {
    if (progress.unlockedAll || isExample(i)) return true;
    const real = realLevels(), pos = real.indexOf(i);
    return pos <= 0 || !!progress.completed[real[pos - 1]];
  }

  function markLevelCompleted(i, blockCount) {
    const isFirstTime = !progress.completed[i];
    progress.completed[i] = true;

    // Hitung bintang
    const currentStars = calculateStars(i, blockCount);
    const prevStars = progress.stars[i] || 0;
    if (currentStars > prevStars) {
      progress.stars[i] = currentStars;
    }

    const prevBest = progress.bestBlocks[i] || 999;
    if (blockCount < prevBest) {
      progress.bestBlocks[i] = blockCount;
    }

    // Tambah EXP jika berhasil (Gamifikasi)
    if (isFirstTime) {
      progress.exp += 25 * currentStars;
      progress.streak = Math.max(progress.streak, 1);
    }

    saveProgress();
    renderLevelSelector();
  }

  // ===== ESTIMASI BINTANG LANGSUNG =====
  function updateLiveBlockCounter(count) {
    const blockCount = typeof count === "number" ? count : Editor.getBlockCount();
    const lv = Config.LEVELS[levelIndex];
    if (!lv) return;
    const row = $(".star-row");
    if (row) row.hidden = !!lv.isExample;
    const starsEl = $("#live-stars-icons");
    if (starsEl && !lv.isExample) starsEl.innerHTML = renderStarsHtml(calculateStars(levelIndex, blockCount));
  }

  // ===== POPUP KETERANGAN BINTANG =====
  function openStarInfo() {
    const lv = Config.LEVELS[levelIndex];
    if (!lv || lv.isExample) return;
    const t = lv.starThresholds || [6, 8, 10, 13];
    const used = Editor.getBlockCount();
    const rows = [
      [5, `${t[0]} blok atau kurang`],
      [4, `${t[0] + 1} – ${t[1]} blok`],
      [3, `${t[1] + 1} – ${t[2]} blok`],
      [2, `${t[2] + 1} – ${t[3]} blok`],
      [1, `lebih dari ${t[3]} blok`]
    ];
    $("#star-table").innerHTML = rows.map(([n, txt]) =>
      `<tr><td>${renderStarsHtml(n)}</td><td>${txt}</td></tr>`).join("");
    $("#star-modal-now").innerHTML = `Saat ini kamu memakai <b>${used} blok</b> (termasuk blok "ketika diklik") → <b>${calculateStars(levelIndex, used)} bintang</b>.`;
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
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  // ===== MINI MAP HTML GENERATOR (In Card Banner) =====
  function generateMiniMapHtml(levelObj, size) {
    const img = View.thumbnail(levelObj, size);
    if (img) return `<img class="thumb3d" src="${img}" alt="Pratinjau 3D ${levelObj.title}">`;
    const map = (levelObj.maps && levelObj.maps[size]) || (levelObj.maps && levelObj.maps[6]) || [];
    const n = map.length;
    const [sx, sy] = levelObj.start || [0, 0];

    let cellsHtml = "";
    for (let y = 0; y < n; y++) {
      const row = map[y] || "";
      for (let x = 0; x < n; x++) {
        const ch = row[x] || ".";
        const soilClass = (x + y) % 2 === 0 ? "m-soil-1" : "m-soil-2";
        let typeClass = "";
        let isStart = x === sx && y === sy ? " m-start" : "";

        if (ch === "W") typeClass = " m-wheat";
        else if (ch === "#") typeClass = " m-rock";

        cellsHtml += `<div class="m-cell ${soilClass}${typeClass}${isStart}"></div>`;
      }
    }

    return `<div class="mini-map" style="grid-template-columns: repeat(${n}, 1fr); grid-template-rows: repeat(${n}, 1fr);">${cellsHtml}</div>`;
  }

  // ===== RENDER PEMILIH LEVEL =====
  function renderLevelSelector() {
    const real = realLevels();
    const totalLevels = real.length;
    let completedCount = 0, totalStarsEarned = 0;
    real.forEach((i) => {
      if (isLevelCompleted(i)) completedCount++;
      totalStarsEarned += progress.stars[i] || 0;
    });

    const pct = Math.round((completedCount / totalLevels) * 100);
    $("#stats-progress-text").textContent = `${pct}% (${completedCount}/${totalLevels} Selesai)`;
    $("#stats-bar-fill").style.width = `${pct}%`;
    $("#stats-stars-count").textContent = `${totalStarsEarned}`;

    const unlockBtn = $("#btn-toggle-unlock");
    unlockBtn.textContent = progress.unlockedAll ? "🔒 Kunci Bertahap" : "🔓 Buka Semua Level";
    unlockBtn.className = progress.unlockedAll ? "btn-primary-action" : "btn-subtle";

    let nextTarget = real[0];
    for (const i of real) {
      if (!isLevelCompleted(i) && isLevelUnlocked(i)) { nextTarget = i; break; }
    }
    const resumeBtn = $("#btn-quick-resume");
    if (completedCount === totalLevels) {
      resumeBtn.textContent = `🏆 Semua Misi Selesai (${totalStarsEarned}/${totalLevels * 5} ⭐) – Main Lagi`;
      nextTarget = real[0];
    } else {
      resumeBtn.textContent = `▶ Lanjutkan Petualangan (Level ${nextTarget})`;
    }
    resumeBtn.onclick = () => openGameLevel(nextTarget);

    const gridEl = $("#levels-grid");
    gridEl.innerHTML = "";

    Config.LEVELS.forEach((lv, i) => {
      const example = !!lv.isExample;
      const completed = !example && isLevelCompleted(i);
      const unlocked = isLevelUnlocked(i);
      const starsEarned = progress.stars[i] || 0;

      const map = (lv.maps && lv.maps[gridSize]) || [];
      let goalCount = 0;
      map.forEach((row) => { for (const c of row) if (c === "W") goalCount++; });

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
        <div class="card-banner-preview">${generateMiniMapHtml(lv, gridSize)}</div>
        <div class="card-body">
          <h4 class="card-title">${lv.title}</h4>
          ${starsRow}
          <p class="card-desc">${lv.hint}</p>
          <div class="card-meta-row"><span>Target: <b class="card-goal-val">${goalCount} Gandum</b></span></div>
          <button class="btn-card-blue${!unlocked ? " locked" : ""}" ${!unlocked ? "disabled" : ""}>${btnLabel}</button>
        </div>`;

      card.onclick = () => {
        if (!unlocked) {
          showToast(`⚠️ Selesaikan level sebelumnya dulu, atau klik "Buka Semua Level".`);
          return;
        }
        openGameLevel(i);
      };
      gridEl.appendChild(card);
    });
  }

  // ===== NAVIGASI =====
  function stopRun() {
    ctx.halt = true;
    running = false;
    Editor.setLocked(false);
    View.setRunning(false);
  }

  function openSideQuestSelector() {
    stopRun();
    $("#view-sidequest-selector").classList.add("active");
    $("#view-gameplay").classList.remove("active");
    renderLevelSelector();
    if (location.hash !== "#sidequest") history.replaceState(null, "", "#sidequest");
  }

  function openGameLevel(targetIdx) {
    const idx = typeof targetIdx === "number" ? targetIdx : levelIndex;
    $("#view-sidequest-selector").classList.remove("active");
    $("#view-gameplay").classList.add("active");
    loadLevel(idx);

    // Level contoh: blok sudah terisi. Level lain: mulai dari kosong.
    const lv = Config.LEVELS[idx];
    if (lv.isExample) Editor.setProgram(lv.sample); else Editor.clear();
    updateLiveBlockCounter();

    if (location.hash !== `#level=${idx}`) history.replaceState(null, "", `#level=${idx}`);

    const refresh = () => { Editor.resize(); View.drawField(); updateLiveBlockCounter(); };
    requestAnimationFrame(refresh);
    setTimeout(refresh, 60);
  }

  // ===== GAMEPLAY ENGINE =====
  function loadLevel(i) {
    levelIndex = i;
    progress.lastLevel = i;
    saveProgress();

    ctx.halt = true;
    running = false;
    World.load(i, gridSize);
    View.showLevel(Config.LEVELS[i].title, World.state.goal);
    View.message(Config.LEVELS[i].hint);
    View.showNext(false);
    View.setRunning(false);
    Editor.setLocked(false);
    View.drawField();

    updateLiveBlockCounter();
  }

  function reset() {
    ctx.halt = true;
    setTimeout(() => {
      loadLevel(levelIndex);
      updateLiveBlockCounter();
    }, 30);
  }

  async function runProgram() {
    if (running) return;
    const prog = Editor.getProgram();
    if (!prog) return View.message("Tambahkan blok \"ketika 🏁 diklik\" dari kategori Kejadian untuk memulai program.", "er");
    if (!prog.length) return View.message("Program masih kosong. Hubungkan blok aksi di bawah blok \"ketika diklik\".", "er");

    loadLevel(levelIndex);
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

    const { goal, score } = World.state;
    if (won) {
      mine.halt = true;
      const lv = Config.LEVELS[levelIndex];
      const next = levelIndex + 1 < Config.LEVELS.length;

      if (lv.isExample) {
        View.message("Contoh berhasil dijalankan! Sekarang coba susun kodemu sendiri di Level 1.", "ok");
        View.showNext(next);
      } else {
        const blocksUsed = Editor.getBlockCount();
        const starsEarned = calculateStars(levelIndex, blocksUsed);
        markLevelCompleted(levelIndex, blocksUsed);
        const minOptimal = lv.minBlocks || 6;
        const last = levelIndex === Config.LEVELS.length - 1;

        let fb;
        if (starsEarned === 5) fb = `🏆 Sempurna! 5/5 bintang dengan ${blocksUsed} blok.`;
        else if (starsEarned === 4) fb = `🌟 Hebat! 4/5 bintang (${blocksUsed} blok). Kurangi blok hingga ≤ ${minOptimal} untuk 5 bintang.`;
        else if (starsEarned === 3) fb = `👍 Bagus! 3/5 bintang (${blocksUsed} blok). Pakai perulangan agar ≤ ${minOptimal} blok.`;
        else fb = `🎉 Berhasil! ${starsEarned}/5 bintang (${blocksUsed} blok). Pakai perulangan agar kodemu lebih ringkas.`;

        View.message(last ? `${fb} Kamu menyelesaikan semua level! 🌾` : fb, "ok");
        View.showNext(!last);
      }
    } else if (!mine.halt) {
      View.message("Program selesai, tapi baru " + score + " dari " + goal + " gandum yang terpanen. Coba perbaiki blok kodemu.", "er");
    }
  }

  // ===== EVENT LISTENER =====
  $("#btn-back-to-selector").onclick = openSideQuestSelector;

  // Run / Reset / Next in Gameplay
  $("#run").onclick = runProgram;
  $("#rst").onclick = reset;
  $("#nx").onclick = () => {
    if (levelIndex + 1 < Config.LEVELS.length) {
      openGameLevel(levelIndex + 1);
    } else {
      openSideQuestSelector();
    }
  };
  $("#clr").onclick = () => {
    Editor.clear();
    updateLiveBlockCounter();
  };
  $("#btn-star-info").onclick = openStarInfo;
  $("#star-modal-close").onclick = closeStarInfo;
  $("#star-modal").onclick = (e) => { if (e.target.id === "star-modal") closeStarInfo(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeStarInfo(); });

  // Level Selector Action Buttons
  $("#btn-toggle-unlock").onclick = () => {
    progress.unlockedAll = !progress.unlockedAll;
    saveProgress();
    renderLevelSelector();
    showToast(progress.unlockedAll ? "🔓 Semua level sekarang terbuka!" : "🔒 Mode kunci bertahap aktif kembali.");
  };

  $("#btn-reset-progress").onclick = () => {
    if (confirm("Apakah kamu yakin ingin mereset seluruh progres bermain dan bintang?")) {
      progress.completed = {};
      progress.stars = {};
      progress.bestBlocks = {};
      progress.unlockedAll = false;
      progress.lastLevel = 0;
      progress.exp = 10;
      progress.streak = 0;
      saveProgress();
      renderLevelSelector();
      showToast("Progres dan bintang berhasil di-reset ke awal.");
    }
  };

  // URL Hash routing
  function handleRoute() {
    const hash = location.hash;
    if (hash.startsWith("#level=")) {
      const num = parseInt(hash.replace("#level=", ""), 10);
      if (!isNaN(num) && num >= 0 && num < Config.LEVELS.length) {
        openGameLevel(num);
        return;
      }
    }
    // Default: pemilih level
    openSideQuestSelector();
  }

  window.addEventListener("hashchange", handleRoute);

  // ===== INITIALIZATION =====
  loadProgress();
  Editor.init("#blockly");
  Editor.onChange((count) => updateLiveBlockCounter(count));
  handleRoute();
})();
