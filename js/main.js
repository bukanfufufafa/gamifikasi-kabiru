/* main.js — menghubungkan semua modul: tombol, level, loop eksekusi. */
(function () {
  const { Config, World, Interpreter, View, Editor } = Petani;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_YIELDS = 20000; // pengaman program tanpa henti
  let levelIndex = 0, ctx = { halt: true }, running = false;

  function loadLevel(i) {
    levelIndex = i; ctx.halt = true; running = false;
    World.load(i);
    View.showLevel(Config.LEVELS[i]);
    View.message(Config.LEVELS[i].hint);
    View.showNext(false); View.setRunning(false);
    View.drawField();
  }

  async function runProgram() {
    if (running) return;
    const prog = Editor.getProgram();
    if (!prog.length) return View.message("Programmu masih kosong. Tambahkan blok dulu.", "er");

    loadLevel(levelIndex);
    ctx = { halt: false }; running = true;
    Editor.setLocked(true); View.setRunning(true); View.message("Berjalan...");

    let count = 0, won = false;
    const delay = () => 620 - +$("#spd").value * 55;
    for (const step of Interpreter.run(prog, ctx)) {
      if (++count > MAX_YIELDS) { ctx.halt = true; View.message("Program terlalu panjang atau berputar tanpa henti. Periksa blok “selama”.", "er"); break; }
      if (step) { View.drawField(); if (World.isWon()) { won = true; break; } await sleep(delay()); }
      if (ctx.halt) break;
    }
    View.drawField();
    won = won || World.isWon();
    running = false; Editor.setLocked(false); View.setRunning(false);

    const goal = Config.LEVELS[levelIndex].goal, got = World.state.score;
    if (won) {
      ctx.halt = true;
      const last = levelIndex === Config.LEVELS.length - 1;
      View.message(last ? "Selesai! Kamu menamatkan semua level 🏆" : "Hebat! Semua target panen tercapai 🎉", "ok");
      View.showNext(!last);
    } else if (!ctx.halt) {
      View.message("Program selesai, tapi baru " + got + " dari " + goal + " padi yang dipanen. Coba perbaiki blokmu.", "er");
    }
  }

  $("#run").onclick = runProgram;
  $("#rst").onclick = () => { ctx.halt = true; setTimeout(() => loadLevel(levelIndex), 30); };
  $("#nx").onclick = () => loadLevel(levelIndex + 1);
  $("#clr").onclick = () => Editor.clear();
  $("#ex").onclick = () => { if (running) return; Editor.setProgram(Config.SAMPLES[levelIndex]); View.message("Contoh dimuat. Tekan Jalankan, lalu coba ubah sendiri."); };

  Editor.init("#root", "#pal");
  loadLevel(0);
})();
