/* world.js — world state and rules for every quest engine. No DOM, no UI.
   Engines: farm (Petani Blok), bekal (Robot Pengantar Bekal), sampah (Misi Bank Sampah), koordinat (Ekspedisi Robot Penjelajah).
   Each engine provides: setup(), test(cond), actions, won(), status(), incomplete(), sig().
   A rule violation sets a failure message (World.failure()); main.js stops the program and shows it. */
Petani.World = (function () {
  const C = Petani.Config;
  let quest, level, engine, N, map, grid, pos, score, goal, bumps, bumpDir, failMsg, E, ENG, version = 0;

  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const free = (x, y) => inside(x, y) && !grid[y][x].rock; // rocks / trees / fences block the way
  const cell = () => grid[pos[1]][pos[0]];
  const fail = (msg) => { if (!failMsg) failMsg = msg; };
  const fmt = (x, y) => "(" + x + ", " + y + ")";

  // Build the field from the level (see config.js)
  function load(q, lv, size) {
    version++; // lets the view know it must rebuild the arena
    quest = q; level = lv; engine = q.engine; ENG = ENGINES[engine];
    map = (lv.maps ? lv.maps[size] : lv.map) || []; N = map.length;
    grid = map.map((row) => [...row].map((ch) => ({
      rock: ch === "#", wheat: ch === "W", kitchen: ch === "D", friend: ch === "T", fed: false,
      item: ch in C.ITEMS ? ch : null, item0: ch in C.ITEMS ? ch : null
    })));
    pos = (lv.start || [0, 0]).slice(); score = 0; bumps = 0; bumpDir = [0, 0]; failMsg = null; E = {};
    ENG.setup();
  }

  // ===== Engines =====
  const ENGINES = {
    // Non-grid activities must finish the whole program before their result is accepted.
    musik: {
      setup() { goal = level.pattern.length; E = { output: [], finished: false }; },
      test: () => false,
      actions: {
        play(instrument) {
          const labels = { drum: "drum", bell: "lonceng", clap: "tepuk" };
          const index = E.output.length;
          E.output.push(instrument);
          if (index >= goal) return fail("Ada bunyi tambahan setelah pola selesai. Hapus blok bunyi yang berlebih atau kurangi jumlah pengulangan.");
          if (instrument !== level.pattern[index]) return fail("Bunyi ke-" + (index + 1) + " seharusnya " + labels[level.pattern[index]] + ", bukan " + labels[instrument] + ". Perhatikan urutan pola contoh.");
          score++;
        }
      },
      won: () => E.finished && score === goal,
      status: () => "Pola cocok: " + score + " / " + goal,
      incomplete: () => "Program baru memainkan " + E.output.length + " dari " + goal + " bunyi. Lengkapi pola sesuai contoh.",
      sig: () => String(E.output.length)
    },
    lampu: {
      setup() {
        goal = level.scenarios.length;
        E = { scenarioIndex: 0, scenarioResults: level.scenarios.map((s) => ({ ...s, actual: null, passed: false, tested: false })), lamp: null, finished: false };
      },
      test(cond) { return !!level.scenarios[E.scenarioIndex][cond]; },
      actions: { lamp(value) { E.lamp = value === "on"; } },
      won: () => E.finished && score === goal,
      status: () => "Skenario cocok: " + score + " / " + goal,
      incomplete() {
        const wrong = E.scenarioResults.find((s) => !s.passed);
        if (!wrong) return "Selesaikan semua pemeriksaan kondisi ruangan.";
        const inputs = (wrong.dark ? "gelap" : "terang") + ", " + (wrong.occupied ? "ada orang" : "kosong") + ", mode darurat " + (wrong.emergency ? "aktif" : "mati");
        return "Belum semua skenario tepat. Saat " + inputs + ", lampu harus " + (wrong.expected ? "menyala" : "mati") + (wrong.actual === null ? ", tetapi program belum menentukan keadaan lampu. Isi kedua cabang jika/selain itu." : ". Periksa aturan kondisi programmu.");
      },
      sig: () => E.scenarioIndex + "|" + E.lamp + "|" + score
    },

    // ---- Petani Blok
    farm: {
      setup() { goal = grid.flat().filter((c) => c.wheat).length; },
      test(cond) {
        if (cond === "wheat") return cell().wheat;
        if (cond === "nowheat") return !cell().wheat;
        if (cond === "any") return grid.some((row) => row.some((c) => c.wheat));
        const [kind, dir] = cond.split("_"), v = C.DIR_VEC[dir], x = pos[0] + v[0], y = pos[1] + v[1];
        if (kind === "wheat") return inside(x, y) && grid[y][x].wheat; // "wheat_<dir>"
        return false;
      },
      actions: { harvest() { const c = cell(); if (c.wheat) { c.wheat = false; score++; } } },
      won: () => score >= goal,
      status: () => "Terpanen: " + score + " / " + goal,
      incomplete: () => "Program selesai, tapi baru " + score + " dari " + goal + " gandum yang terpanen. Coba perbaiki blok kodemu.",
      sig: () => String(score)
    },

    // ---- Robot Pengantar Bekal (SD awal: berhitung & penjumlahan)
    bekal: {
      setup() { goal = grid.flat().filter((c) => c.friend).length; E = { carried: 0, taken: 0 }; },
      test: () => false,
      actions: {
        take(n) {
          if (!cell().kitchen) return fail("Bekal hanya bisa diambil di dapur 🏠. Robot sedang tidak berada di dapur.");
          if (E.carried + n > 9) return fail("Robot hanya kuat membawa 9 bekal sekaligus.");
          E.carried += n; E.taken += n;
        },
        deliver() {
          const c = cell();
          if (!c.friend) return fail("Di sini tidak ada teman. Antar bekal saat robot berdiri di atas teman 🧒.");
          if (c.fed) return fail("Teman ini sudah mendapat bekal.");
          if (E.carried <= 0) return fail("Bekal robot sudah habis! Jumlah bekal yang diambil kurang dari jumlah teman.");
          E.carried--; c.fed = true; score++;
        }
      },
      won: () => score >= goal && E.carried === 0, // semua teman kebagian DAN tidak ada bekal tersisa
      status: () => "Teman kebagian: " + score + " / " + goal + " · Bekal dibawa: " + E.carried,
      incomplete() {
        if (score >= goal) return "Semua teman sudah kebagian, tapi robot masih membawa " + E.carried + " bekal. Ambil bekal sesuai jumlah teman saja.";
        if (E.taken < goal) return "Kamu mengambil " + E.taken + " bekal, padahal ada " + goal + " teman. Hitung lagi jumlah temannya!";
        if (E.taken > goal) return "Kamu mengambil " + E.taken + " bekal, padahal temannya hanya " + goal + ". Hitung lagi jumlah temannya!";
        return "Jumlah bekalnya sudah pas, tapi baru " + score + " dari " + goal + " teman yang kebagian. Periksa lagi rutenya.";
      },
      sig: () => score + "|" + E.carried
    },

    // ---- Misi Bank Sampah (SD akhir: bahan, pola, percabangan)
    sampah: {
      setup() { goal = grid.flat().filter((c) => c.item0).length; E = { carried: null, lastSort: null }; },
      test(cond) {
        const it = cell().item;
        if (cond === "item_here") return !!it;
        if (cond.startsWith("is_")) return !!it && C.ITEMS[it].cat === cond.slice(3);
        return false;
      },
      actions: {
        pick() {
          const c = cell();
          if (E.carried) return fail("Tangan robot masih memegang " + C.ITEMS[E.carried].name + ". Pilah dulu ke tong sebelum mengambil benda lain.");
          if (!c.item) return fail("Tidak ada benda di sini yang bisa diambil.");
          E.carried = c.item; c.item = null;
        },
        sort(cat) {
          if (!E.carried) return fail("Robot belum memegang benda apa pun. Ambil benda dulu dengan blok \"ambil benda\".");
          const it = C.ITEMS[E.carried], bin = C.BINS.find((b) => b.id === cat), mine = C.BINS.find((b) => b.id === it.cat);
          if (it.cat !== cat) return fail(it.name + " termasuk sampah " + mine.label.toLowerCase() + ", bukan " + bin.label.toLowerCase() + ". " + C.CAT_TIP[it.cat]);
          E.lastSort = { cat, item: E.carried }; E.carried = null; score++;
        }
      },
      won: () => score >= goal,
      status: () => "Terpilah: " + score + " / " + goal + (E.carried ? " · Dipegang: " + C.ITEMS[E.carried].emoji : ""),
      incomplete: () => "Program selesai, tapi baru " + score + " dari " + goal + " benda yang terpilah. Periksa lagi blok kodemu.",
      sig: () => score + "|" + (E.carried || "")
    },

    // ---- Ekspedisi Robot Penjelajah (SMP: koordinat Kartesius)
    koordinat: {
      setup() {
        const h = (N - 1) / 2;
        E = { half: h, targets: (level.targets || []).map((t) => Object.assign({ col: t.x + h, row: h - t.y, done: false }, t)) };
        goal = E.targets.length;
      },
      test: () => false,
      actions: {
        mark() {
          const { x, y } = coords();
          if (level.mode === "collect") {
            const t = E.targets.find((t) => t.col === pos[0] && t.row === pos[1]);
            if (!t) return fail("Tidak ada sampel di titik " + fmt(x, y) + ". Periksa lagi koordinatnya.");
            if (t.done) return fail("Sampel di titik " + fmt(x, y) + " sudah diambil.");
            t.done = true; score++; return;
          }
          const next = E.targets.find((t) => !t.done);
          if (!next) return;
          if (pos[0] !== next.col || pos[1] !== next.row) {
            const other = E.targets.find((t) => !t.done && t.col === pos[0] && t.row === pos[1]);
            return fail(other
              ? "Tandai titik " + next.label + " " + fmt(next.x, next.y) + " lebih dulu, baru titik " + other.label + "."
              : "Ini bukan titik yang dicari. Robot ada di " + fmt(x, y) + ", sedangkan titik " + next.label + " ada di " + fmt(next.x, next.y) + ".");
          }
          next.done = true; score++;
        }
      },
      won() {
        if (score < goal) return false;
        return !level.home || (pos[0] === E.half && pos[1] === E.half);
      },
      status() { const { x, y } = coords(); return "Posisi robot: " + fmt(x, y) + " · " + (level.mode === "collect" ? "Sampel" : "Titik") + ": " + score + " / " + goal; },
      incomplete() {
        const { x, y } = coords();
        if (score >= goal) return "Semua sampel sudah terkumpul! Sekarang bawa robot pulang ke titik asal (0, 0). Robot berhenti di " + fmt(x, y) + ".";
        return "Program selesai, tapi baru " + score + " dari " + goal + (level.mode === "collect" ? " sampel" : " titik") + " yang berhasil. Robot berhenti di " + fmt(x, y) + ".";
      },
      sig: () => String(score)
    }
  };

  const coords = () => ({ x: pos[0] - E.half, y: E.half - pos[1] });

  // Conditions for if / while / repeat until
  function test(cond) {
    const [kind, dir] = cond.split("_");
    if (kind === "can" || kind === "no") {
      const v = C.DIR_VEC[dir], free_ = free(pos[0] + v[0], pos[1] + v[1]);
      return kind === "can" ? free_ : !free_;
    }
    return ENG.test(cond);
  }

  // Robot / farmer actions (called by the interpreter)
  const act = (name) => (arg) => { if (!failMsg && ENG.actions[name]) ENG.actions[name](arg); };
  const actions = {
    move(dir) {
      const v = C.DIR_VEC[dir], x = pos[0] + v[0], y = pos[1] + v[1];
      if (free(x, y)) pos = [x, y]; else { bumps++; bumpDir = v; } // blocked by an obstacle or the edge
    },
    harvest: act("harvest"), take: act("take"), deliver: act("deliver"), pick: act("pick"), sort: act("sort"), mark: act("mark"),
    play: act("play"), lamp: act("lamp")
  };
  actions.sample = actions.mark;

  function finishProgram() {
    if (engine === "musik") E.finished = true;
    if (engine === "lampu") {
      const result = E.scenarioResults[E.scenarioIndex];
      result.tested = true;
      result.actual = E.lamp;
      result.passed = E.lamp !== null && E.lamp === result.expected;
      score = E.scenarioResults.filter((s) => s.passed).length;
      E.finished = E.scenarioIndex === goal - 1;
    }
  }

  function nextScenario() {
    if (engine !== "lampu" || E.scenarioIndex >= goal - 1) return false;
    E.scenarioIndex++;
    E.lamp = null; // Each input combination is an independent execution, never a continuation.
    return true;
  }

  return {
    load, test, actions, finishProgram, nextScenario,
    isWon: () => !failMsg && ENG.won(),
    failure: () => failMsg,
    incomplete: () => ENG.incomplete(),
    status: () => ENG.status(),
    get state() {
      return { version, engine, quest, level, size: N, grid, map, pos, score, goal, bumps, bumpDir, sig: ENG.sig(),
               carried: E.carried, lastSort: E.lastSort, targets: E.targets || [], half: E.half,
               output: E.output || [], scenarioIndex: E.scenarioIndex, scenarioResults: E.scenarioResults || [], lamp: E.lamp };
    }
  };
})();
