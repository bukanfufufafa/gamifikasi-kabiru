/* main.js — wires all modules together: buttons, levels, level selector, star rating system, and run loop. */
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
  let currentView = "selector"; // 'selector' | 'game'

  // ===== STAR RATING SYSTEM (1 - 5 BINTANG) =====
  // Semakin sedikit blok kode yang digunakan, semakin banyak bintangnya.
  // Ambang batas blok per level didefinisikan di Config.LEVELS[i].starThresholds: [5★, 4★, 3★, 2★]
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
  const STORAGE_KEY = "block_farmer_progress_v2";
  let progress = {
    completed: {},     // { [levelIndex]: true }
    stars: {},         // { [levelIndex]: number (1-5) }
    bestBlocks: {},    // { [levelIndex]: number }
    unlockedAll: false,
    lastLevel: 0
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
            lastLevel: typeof parsed.lastLevel === "number" ? parsed.lastLevel : 0
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

  function isLevelCompleted(i) {
    return !!progress.completed[i];
  }

  function isLevelUnlocked(i) {
    if (progress.unlockedAll) return true;
    if (i === 0) return true;
    return !!progress.completed[i - 1];
  }

  function markLevelCompleted(i, blockCount) {
    progress.completed[i] = true;

    // Hitung bintang yang didapat
    const currentStars = calculateStars(i, blockCount);
    const prevStars = progress.stars[i] || 0;
    if (currentStars > prevStars) {
      progress.stars[i] = currentStars;
    }

    const prevBest = progress.bestBlocks[i] || 999;
    if (blockCount < prevBest) {
      progress.bestBlocks[i] = blockCount;
    }

    saveProgress();
    renderLevelSelector();
  }

  // ===== LIVE BLOCK COUNTER & STAR ESTIMATOR =====
  function updateLiveBlockCounter(count) {
    const blockCount = typeof count === "number" ? count : Editor.getBlockCount();
    const lv = Config.LEVELS[levelIndex];
    if (!lv) return;

    const minTarget = lv.minBlocks || 6;
    const starsEst = calculateStars(levelIndex, blockCount);

    const countEl = $("#live-block-count");
    const targetEl = $("#live-target-count");
    const starsEl = $("#live-stars-icons");

    if (countEl) countEl.textContent = blockCount;
    if (targetEl) targetEl.textContent = `≤ ${minTarget}`;
    if (starsEl) starsEl.innerHTML = renderStarsHtml(starsEst);
  }

  // ===== CONCEPT LABELS =====
  const LEVEL_CONCEPTS = [
    "Perulangan (While Loop)",
    "Loop Bersarang (Sweep)",
    "Deteksi Rintangan (Sensing)",
    "Kondisional (If)",
    "Algoritma Jalur (If / Else)"
  ];

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

  // ===== MINI MAP HTML GENERATOR =====
  function generateMiniMapHtml(levelObj, size) {
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

  // ===== RENDER LEVEL SELECTOR =====
  function renderLevelSelector() {
    const totalLevels = Config.LEVELS.length;
    let completedCount = 0;
    let totalStarsEarned = 0;
    const maxTotalStars = totalLevels * 5;

    for (let i = 0; i < totalLevels; i++) {
      if (isLevelCompleted(i)) completedCount++;
      totalStarsEarned += progress.stars[i] || 0;
    }

    // Update banner stats
    const pct = Math.round((completedCount / totalLevels) * 100);
    $("#stats-progress-text").textContent = `${completedCount} / ${totalLevels} Selesai (${pct}%)`;
    $("#stats-bar-fill").style.width = `${pct}%`;
    $("#stats-stars-count").textContent = `${totalStarsEarned}`;
    $("#stats-grid-size").textContent = `Ladang ${gridSize}x${gridSize}`;

    // Update Unlock All button text
    const unlockBtn = $("#btn-toggle-unlock");
    if (unlockBtn) {
      unlockBtn.textContent = progress.unlockedAll ? "🔒 Kunci Bertahap" : "🔓 Buka Semua Level";
      unlockBtn.className = progress.unlockedAll ? "b btn-primary-resume" : "b g";
    }

    // Quick Resume button
    let nextTarget = 0;
    for (let i = 0; i < totalLevels; i++) {
      if (!isLevelCompleted(i) && isLevelUnlocked(i)) {
        nextTarget = i;
        break;
      }
    }
    const resumeBtn = $("#btn-quick-resume");
    if (completedCount === totalLevels) {
      resumeBtn.textContent = `🏆 Semua Selesai (${totalStarsEarned}/${maxTotalStars} ⭐)! Main Level 1`;
      nextTarget = 0;
    } else {
      resumeBtn.textContent = `▶ Lanjutkan Petualangan (Level ${nextTarget + 1})`;
    }
    resumeBtn.onclick = () => switchView("game", nextTarget);

    // Build Cards Grid
    const gridEl = $("#levels-grid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    Config.LEVELS.forEach((lv, i) => {
      const completed = isLevelCompleted(i);
      const unlocked = isLevelUnlocked(i);
      const isCurrent = levelIndex === i;
      const concept = LEVEL_CONCEPTS[i] || "Logika Algoritma";
      const starsEarned = progress.stars[i] || 0;
      const bestBlocks = progress.bestBlocks[i];
      const minOptimal = lv.minBlocks || 6;

      // Calculate wheat goal
      const map = (lv.maps && lv.maps[gridSize]) || [];
      let goalCount = 0;
      map.forEach(row => {
        for (const c of row) if (c === "W") goalCount++;
      });

      // Card Classes
      const card = document.createElement("div");
      let cardClasses = ["level-card"];
      if (completed) cardClasses.push("is-completed");
      if (isCurrent && unlocked) cardClasses.push("is-current");
      if (!unlocked) cardClasses.push("is-locked");
      card.className = cardClasses.join(" ");

      // Status Badge
      let badgeHtml = "";
      if (completed) {
        badgeHtml = `<span class="badge badge-done">⭐ Selesai (${starsEarned}/5)</span>`;
      } else if (isCurrent && unlocked) {
        badgeHtml = `<span class="badge badge-curr">Sedang Aktif</span>`;
      } else if (unlocked) {
        badgeHtml = `<span class="badge badge-open">Tersedia</span>`;
      } else {
        badgeHtml = `<span class="badge badge-lock">🔒 Terkunci</span>`;
      }

      // Star Row Display
      let starHintText = `Target 5★: ≤ ${minOptimal} blok`;
      if (starsEarned > 0) {
        starHintText = `Rekor: ${bestBlocks} blok (${starsEarned}★)`;
      }

      const starsRowHtml = `
        <div class="card-stars-row">
          <div class="stars-visual" title="${starsEarned > 0 ? starsEarned + ' dari 5 Bintang' : 'Belum diselesaikan'}">
            ${renderStarsHtml(starsEarned)}
          </div>
          <span class="stars-hint-text">${starHintText}</span>
        </div>
      `;

      // Button Label
      let btnLabel = "";
      let btnClass = "";
      if (!unlocked) {
        btnLabel = "🔒 Selesaikan Level Sebelumnya";
        btnClass = "btn-card-action locked";
      } else if (completed) {
        btnLabel = starsEarned === 5 ? "Main Ulang ↺ (Sempurna ⭐)" : `Tingkatkan Bintang ↺ (${starsEarned}/5★)`;
        btnClass = "btn-card-action replay";
      } else {
        btnLabel = "Mainkan Level ▶";
        btnClass = "btn-card-action play";
      }

      card.innerHTML = `
        <div class="card-top">
          <span class="card-num">Tantangan ${i + 1}</span>
          ${badgeHtml}
        </div>
        <div class="card-preview-wrap">
          ${generateMiniMapHtml(lv, gridSize)}
        </div>
        ${starsRowHtml}
        <div class="card-info">
          <h4 class="card-title">${lv.title}</h4>
          <span class="card-concept">🧠 ${concept}</span>
          <p class="card-hint">${lv.hint}</p>
        </div>
        <div class="card-meta">
          <span class="card-goal">🌾 Target: <b>${goalCount} Gandum</b></span>
          <span class="card-blocks-info">🧱 Min: <b>${minOptimal} Blok (5★)</b></span>
        </div>
        <button class="${btnClass}" ${!unlocked ? "disabled" : ""}>${btnLabel}</button>
      `;

      card.onclick = (e) => {
        if (!unlocked) {
          showToast(`⚠️ Selesaikan Level ${i} terlebih dahulu atau gunakan 'Buka Semua Level'!`);
          return;
        }
        switchView("game", i);
      };

      gridEl.appendChild(card);
    });
  }

  // ===== VIEW SWITCHING =====
  function switchView(viewName, targetIndex) {
    currentView = viewName;

    const selectorScreen = $("#view-selector");
    const gameScreen = $("#view-game");
    const navLevelsBtn = $("#btn-nav-levels");
    const navGameBtn = $("#btn-nav-game");
    const menuBadge = $("#menu-badge");

    if (viewName === "selector") {
      // Pause running loop if any
      ctx.halt = true;
      running = false;
      Editor.setLocked(false);
      View.setRunning(false);

      selectorScreen.classList.add("active");
      gameScreen.classList.remove("active");

      navLevelsBtn.classList.add("active");
      navGameBtn.classList.remove("active");
      navGameBtn.hidden = false;
      menuBadge.textContent = "Level Selector";

      renderLevelSelector();
      if (location.hash !== "#levels") {
        history.replaceState(null, "", "#levels");
      }
    } else {
      // Switch to game
      selectorScreen.classList.remove("active");
      gameScreen.classList.add("active");

      navLevelsBtn.classList.remove("active");
      navGameBtn.classList.add("active");
      navGameBtn.hidden = true;
      menuBadge.textContent = "Bermain";

      const idx = typeof targetIndex === "number" ? targetIndex : levelIndex;
      loadLevel(idx);

      if (location.hash !== `#level=${idx + 1}`) {
        history.replaceState(null, "", `#level=${idx + 1}`);
      }

      // Re-adjust Blockly and Three.js layout on reveal
      requestAnimationFrame(() => {
        Editor.resize();
        View.drawField();
        updateLiveBlockCounter();
      });
      setTimeout(() => {
        Editor.resize();
        View.drawField();
        updateLiveBlockCounter();
      }, 60);
    }
  }

  // ===== GAME ENGINE & LEVEL LOADING =====
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
    if (!prog) return View.message("Tambahkan blok \"when 🏁 clicked\" dari kategori Events untuk memulai program.", "er");
    if (!prog.length) return View.message("Program masih kosong. Hubungkan blok tindakan di bawah blok \"when clicked\".", "er");

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
      const blocksUsed = Editor.getBlockCount();
      const starsEarned = calculateStars(levelIndex, blocksUsed);
      markLevelCompleted(levelIndex, blocksUsed);

      const lv = Config.LEVELS[levelIndex];
      const minOptimal = lv.minBlocks || 6;
      const last = levelIndex === Config.LEVELS.length - 1;

      let starIconStr = "";
      for (let s = 1; s <= 5; s++) {
        starIconStr += s <= starsEarned ? "⭐" : "☆";
      }

      let starFeedback = "";
      if (starsEarned === 5) {
        starFeedback = `🏆 SEMPURNA! 5/5 BINTANG! Solusi sangat efisien dengan ${blocksUsed} blok (target ≤ ${minOptimal})!`;
      } else if (starsEarned === 4) {
        starFeedback = `🌟 HEBAT! 4/5 Bintang (${blocksUsed} blok). Coba kurangi ${blocksUsed - minOptimal} blok lagi untuk 5 Bintang Penuh!`;
      } else if (starsEarned === 3) {
        starFeedback = `👍 BAGUS! 3/5 Bintang (${blocksUsed} blok). Coba optimalkan dengan perulangan agar ≤ ${minOptimal} blok!`;
      } else {
        starFeedback = `🎉 BERHASIL! ${starsEarned}/5 Bintang (${blocksUsed} blok). Gunakan perulangan (loop) agar lebih hemat balok!`;
      }

      const finalMsg = last ? `${starFeedback} Kamu telah menyelesaikan semua level! 🏆🌾` : starFeedback;
      View.message(finalMsg, "ok");
      View.showNext(!last);
    } else if (!mine.halt) {
      View.message("Program selesai, tapi baru " + score + " dari " + goal + " gandum yang terpanen. Coba perbaiki blok kodemu.", "er");
    }
  }

  // ===== EVENT LISTENERS =====
  $("#run").onclick = runProgram;
  $("#rst").onclick = reset;
  $("#nx").onclick = () => {
    if (levelIndex + 1 < Config.LEVELS.length) {
      loadLevel(levelIndex + 1);
      history.replaceState(null, "", `#level=${levelIndex + 1}`);
    } else {
      switchView("selector");
    }
  };
  $("#clr").onclick = () => {
    Editor.clear();
    updateLiveBlockCounter();
  };
  $("#ex").onclick = () => {
    if (running) return;
    Editor.setProgram(Config.SAMPLES[levelIndex]);
    updateLiveBlockCounter();
    View.message("Contoh kode dimuat. Tekan tombol bendera hijau (Run) untuk mencoba!");
  };

  // Navigations to Level Selector
  $("#btn-nav-levels").onclick = () => switchView("selector");
  $("#btn-nav-game").onclick = () => switchView("game", levelIndex);
  const tabLevels = $("#tab-to-levels");
  if (tabLevels) tabLevels.onclick = () => switchView("selector");
  const cardLevels = $("#card-to-levels");
  if (cardLevels) cardLevels.onclick = () => switchView("selector");

  // Level Selector Controls
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
      saveProgress();
      renderLevelSelector();
      showToast("Progres dan bintang berhasil di-reset ke awal.");
    }
  };

  // Hash-based routing
  function handleRoute() {
    const hash = location.hash;
    if (hash.startsWith("#level=")) {
      const num = parseInt(hash.replace("#level=", ""), 10);
      if (!isNaN(num) && num >= 1 && num <= Config.LEVELS.length) {
        switchView("game", num - 1);
        return;
      }
    }
    // Default or #levels
    switchView("selector");
  }

  window.addEventListener("hashchange", handleRoute);

  // ===== INITIALIZATION =====
  loadProgress();
  Editor.init("#blockly");
  Editor.onChange((count) => updateLiveBlockCounter(count));
  handleRoute();
})();
