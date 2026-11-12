/* main.js — wires all modules together: buttons, levels, grid size, run loop. */
(function () {
  const { Config, World, Interpreter, View, Editor } = Petani;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_YIELDS = 20000; // safety limit for endless programs
  let levelIndex = 0, gridSize = Config.GRID_SIZE, ctx = { halt: true }, running = false;

  function loadLevel(i) {
    levelIndex = i; ctx.halt = true; running = false;
    World.load(i, gridSize);
    View.showLevel(Config.LEVELS[i].title, World.state.goal);
    View.message(Config.LEVELS[i].hint);
    View.showNext(false); View.setRunning(false); Editor.setLocked(false);
    View.drawField();
  }

  function reset() { ctx.halt = true; setTimeout(() => loadLevel(levelIndex), 30); } // lets a running loop stop first

  async function runProgram() {
    if (running) return;
    const prog = Editor.getProgram();
    if (!prog) return View.message("Add the \"when 🏁 clicked\" block from Events to start your program.", "er");
    if (!prog.length) return View.message("Your program is empty. Attach some blocks under the \"when clicked\" block.", "er");

    loadLevel(levelIndex);
    const mine = (ctx = { halt: false, hl: Editor.highlight }); running = true;
    Editor.setLocked(true); View.setRunning(true); View.message("Running...");

    let count = 0, won = false;
    const delay = () => 620 - +$("#spd").value * 55;
    for (const step of Interpreter.run(prog, mine)) {
      if (++count > MAX_YIELDS) { mine.halt = true; View.message("Program too long or looping forever. Check your while / repeat until blocks.", "er"); break; }
      if (step) { View.drawField(); if (World.isWon()) { won = true; break; } await sleep(delay()); }
      if (mine.halt) break;
    }
    if (ctx !== mine) return; // a reset / new run took over while we were waiting
    View.drawField();
    won = won || World.isWon();
    running = false; Editor.setLocked(false); View.setRunning(false);

    const { goal, score } = World.state;
    if (won) {
      mine.halt = true;
      const last = levelIndex === Config.LEVELS.length - 1;
      View.message(last ? "You finished every level! 🏆" : "Great job! All the wheat is harvested 🎉", "ok");
      View.showNext(!last);
    } else if (!mine.halt) {
      View.message("Program finished, but only " + score + " of " + goal + " wheat harvested. Try fixing your blocks.", "er");
    }
  }

  $("#run").onclick = runProgram;
  $("#rst").onclick = reset;
  $("#nx").onclick = () => loadLevel(levelIndex + 1);
  $("#clr").onclick = () => Editor.clear();
  $("#ex").onclick = () => { if (running) return; Editor.setProgram(Config.SAMPLES[levelIndex]); View.message("Example loaded. Press Run, then try changing it yourself."); };

  Editor.init("#blockly");
  loadLevel(0);
})();
