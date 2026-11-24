/* progress.js — player progress, kept separate from game logic.
   Storage is the browser's localStorage only (per device/browser). It is NOT the student's account progress;
   to connect it to the main Kabiru website later, replace load()/save() with API calls and keep the rest.
   Levels are identified by a stable id ("petani:3", "bekal:1"), never by position. */
Petani.Progress = (function () {
  const KEY = "kabiru_sidequest_progress_v4";
  const OLD_KEY = "kabiru_sidequest_progress_v3"; // v3 saved the farm levels by index (0 = example, 1..5 = levels)
  const fresh = () => ({ completed: {}, stars: {}, bestBlocks: {}, unlockedAll: false, lastLevel: null, lastJenjang: null });
  let data = fresh();

  const obj = (v) => (v && typeof v === "object" ? v : {});

  // Copy v3 progress into v4 under the farm quest ids. The v3 entry itself is left untouched.
  function migrate(old) {
    const out = fresh(), toId = (i) => "petani:" + (+i === 0 ? "contoh" : i);
    for (const k of ["completed", "stars", "bestBlocks"]) {
      for (const i in obj(old[k])) if (/^\d+$/.test(i)) out[k][toId(i)] = old[k][i];
    }
    out.unlockedAll = !!old.unlockedAll;
    if (typeof old.lastLevel === "number") out.lastLevel = toId(old.lastLevel);
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          data = {
            completed: obj(p.completed), stars: obj(p.stars), bestBlocks: obj(p.bestBlocks), unlockedAll: !!p.unlockedAll,
            lastLevel: typeof p.lastLevel === "string" ? p.lastLevel : null,
            lastJenjang: typeof p.lastJenjang === "string" ? p.lastJenjang : null
          };
        }
      } else {
        const old = localStorage.getItem(OLD_KEY);
        if (old) { data = migrate(JSON.parse(old) || {}); save(); }
      }
    } catch (e) {
      console.warn("Storage warning:", e);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage save failed:", e); }
  }

  const realLevels = (q) => q.levels.filter((lv) => !lv.isExample);

  return {
    load, save,
    isCompleted: (id) => !!data.completed[id],
    stars: (id) => data.stars[id] || 0,
    best: (id) => data.bestBlocks[id] || 0,
    get unlockedAll() { return data.unlockedAll; },
    setUnlockedAll(v) { data.unlockedAll = !!v; save(); },
    get lastLevel() { return data.lastLevel; },
    setLastLevel(id) { data.lastLevel = id; save(); },
    get lastJenjang() { return data.lastJenjang; },
    setLastJenjang(id) { data.lastJenjang = id; save(); },

    // A level is open when it is an example, when everything is unlocked, or when the previous level of the SAME quest is done.
    isUnlocked(quest, lv) {
      if (data.unlockedAll || lv.isExample) return true;
      const real = realLevels(quest), pos = real.indexOf(lv);
      return pos <= 0 || !!data.completed[real[pos - 1].id];
    },

    // Stores the best result; returns true when this is the first completion.
    recordCompletion(id, stars, blocks) {
      const first = !data.completed[id];
      data.completed[id] = true;
      if (stars > (data.stars[id] || 0)) data.stars[id] = stars;
      if (!data.bestBlocks[id] || blocks < data.bestBlocks[id]) data.bestBlocks[id] = blocks;
      save();
      return first;
    },

    // Summary of one quest: { done, total, stars, maxStars }
    summary(quest) {
      const real = realLevels(quest);
      return {
        total: real.length, maxStars: real.length * 5,
        done: real.filter((lv) => data.completed[lv.id]).length,
        stars: real.reduce((a, lv) => a + (data.stars[lv.id] || 0), 0)
      };
    },

    reset() { data = fresh(); save(); }
  };
})();
