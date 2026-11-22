/* Non-grid simulation panels. World owns all activity rules and results. */
Petani.ActivityView = (function () {
  const SOUNDS = {
    drum: { label: "Drum", icon: "🥁", letter: "A", frequency: 140, type: "sine" },
    bell: { label: "Bel", icon: "🔔", letter: "B", frequency: 880, type: "sine" },
    clap: { label: "Tepuk tangan", icon: "👏", letter: "C", frequency: 320, type: "triangle" }
  };
  let root, content, live, toggle, panelEngine, panelVersion;
  let previousOutput = [], audioContext = null, audioArmed = false, soundEnabled = true;
  const voices = new Set();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function stopVoices() {
    voices.forEach((voice) => {
      try { voice.stop(); } catch (e) { /* A completed oscillator needs no cleanup. */ }
    });
    voices.clear();
  }

  function stopAudio() {
    audioArmed = false;
    stopVoices();
  }

  function updateToggle() {
    if (!toggle) return;
    toggle.textContent = soundEnabled ? "🔊 Suara aktif" : "🔇 Suara nonaktif";
    toggle.setAttribute("aria-pressed", String(soundEnabled));
    toggle.title = "Suara hanya diputar untuk bunyi baru setelah Jalankan ditekan.";
  }

  // Called synchronously by the Run gesture, never by draw() or routing.
  async function activateAudio() {
    if (!soundEnabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!audioContext || audioContext.state === "closed") audioContext = new Audio();
      audioArmed = true;
      if (audioContext.state === "suspended") await audioContext.resume();
    } catch (e) { audioArmed = false; }
  }

  function playNew(sounds) {
    if (!audioArmed || !soundEnabled || !audioContext || audioContext.state !== "running") return;
    sounds.forEach((name, index) => {
      const sound = SOUNDS[name];
      if (!sound) return;
      try {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const start = audioContext.currentTime + index * 0.14, end = start + 0.12;
        oscillator.type = sound.type;
        oscillator.frequency.setValueAtTime(sound.frequency, start);
        if (name === "drum") oscillator.frequency.exponentialRampToValueAtTime(45, end);
        if (name === "clap") oscillator.frequency.exponentialRampToValueAtTime(90, end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(end);
      } catch (e) { /* Audio is optional; the visual simulation still works. */ }
    });
  }

  function mount(host, st) {
    root = el("section", "activity-panel activity-" + st.engine);
    root.setAttribute("aria-label", st.engine === "musik" ? "Simulasi studio musik" : "Simulasi lampu kelas");
    const header = el("header", "activity-header"), title = el("div");
    title.append(el("p", "activity-eyebrow", "SIMULASI · TANPA PETA"),
      el("h3", "activity-title", st.engine === "musik" ? "🎵 Studio Musik Pola" : "💡 Lampu Pintar"));
    header.append(title);
    toggle = null;
    if (st.engine === "musik") {
      toggle = el("button", "activity-sound");
      toggle.type = "button";
      toggle.addEventListener("click", () => {
        soundEnabled = !soundEnabled;
        if (soundEnabled) activateAudio(); else stopAudio();
        updateToggle();
      });
      updateToggle();
      header.append(toggle);
    }
    content = el("div", "activity-content");
    live = el("p", "activity-summary");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    root.append(header, content, live);
    host.replaceChildren(root);
    panelEngine = st.engine;
  }

  function soundInfo(name) {
    return SOUNDS[name] || { label: String(name), icon: "♪", letter: "?" };
  }

  function chips(sounds, pattern, output) {
    const list = el("ol", "activity-chips");
    list.setAttribute("aria-label", output ? "Urutan bunyi yang dimainkan" : "Urutan bunyi target");
    sounds.forEach((name, index) => {
      const sound = soundInfo(name);
      const result = output ? (pattern[index] === name ? "is-correct" : "is-wrong") : "";
      const chip = el("li", "activity-chip " + result);
      chip.dataset.sound = name;
      if (output && index === sounds.length - 1) chip.classList.add("is-last");
      const icon = el("span", "activity-chip-icon", sound.icon);
      icon.setAttribute("aria-hidden", "true");
      chip.append(el("span", "activity-step", String(index + 1)), icon,
        el("span", "activity-chip-label", sound.letter + " · " + sound.label));
      if (output) chip.append(el("span", "activity-chip-result", result === "is-correct" ? "✓ Sesuai" : "✕ Berbeda"));
      list.append(chip);
    });
    return list;
  }

  function music(st, fresh) {
    const pattern = st.level.pattern || [], output = st.output || [];
    // The first render, reset, and shortened/replaced output establish a silent baseline.
    const appended = !fresh && output.length > previousOutput.length &&
      previousOutput.every((name, index) => output[index] === name);
    if (fresh || output.length < previousOutput.length ||
        !previousOutput.every((name, index) => output[index] === name)) stopVoices();
    if (appended) playNew(output.slice(previousOutput.length));
    previousOutput = output.slice();

    const instruments = el("div", "activity-instruments");
    instruments.setAttribute("role", "group");
    instruments.setAttribute("aria-label", "Instrumen yang dikendalikan blok kode");
    Object.keys(SOUNDS).forEach((name) => {
      const sound = SOUNDS[name], active = output.length > 0 && output[output.length - 1] === name;
      const instrument = el("div", "activity-instrument" + (active ? " is-active" : ""));
      instrument.dataset.sound = name;
      const icon = el("span", "activity-instrument-icon", sound.icon);
      icon.setAttribute("aria-hidden", "true");
      instrument.append(icon, el("strong", "", sound.label), el("span", "activity-instrument-key", sound.letter),
        el("span", "activity-instrument-status", active ? "Terakhir dimainkan" : "Dikendalikan blok"));
      instruments.append(instrument);
    });
    const target = el("section", "activity-sequence"), played = el("section", "activity-sequence");
    target.append(el("h4", "", "Pola target · " + pattern.length + " bunyi"), chips(pattern, pattern, false));
    played.append(el("h4", "", "Hasil program · " + output.length + " / " + pattern.length + " bunyi"));
    if (output.length) played.append(chips(output, pattern, true));
    else played.append(el("p", "activity-empty", "Belum ada bunyi. Susun blok bunyi, lalu tekan Jalankan."));
    content.replaceChildren(instruments, target, played);
    const summary = output.length ? "Bunyi terakhir: " + soundInfo(output[output.length - 1]).label +
      ". Bunyi sesuai: " + st.score + " / " + st.goal + "." : "Siap memainkan pola. Instrumen dikendalikan oleh programmu.";
    if (live.textContent !== summary) live.textContent = summary;
  }

  const lampText = (value) => value === true ? "Menyala" : value === false ? "Mati" : "Belum diatur";

  function lamps(st) {
    const scenarios = st.level.scenarios || [], results = st.scenarioResults || [];
    const index = Number.isInteger(st.scenarioIndex) ? st.scenarioIndex : 0;
    const current = index >= 0 && index < scenarios.length ? index : -1;
    const scenario = current >= 0 ? scenarios[current] : null;
    const classroom = el("section", "activity-classroom" + (scenario && scenario.dark ? " is-dark" : "") +
      (st.lamp === true ? " is-lit" : "") + (scenario && scenario.emergency ? " is-emergency" : ""));
    classroom.setAttribute("aria-label", "Keadaan ruang kelas");
    classroom.append(el("p", "activity-case-label", current >= 0 ? "Skenario saat ini · " + (current + 1) + " / " + scenarios.length : "Pengujian selesai"));
    const scene = el("div", "activity-room-scene");
    scene.setAttribute("aria-hidden", "true");
    scene.append(el("span", "activity-window", scenario ? (scenario.dark ? "☾" : "☀") : "—"),
      el("span", "activity-lamp", "💡"), el("span", "activity-people", scenario && scenario.occupied ? "🧑‍🎓 🧑‍🎓" : "🪑 🪑"));
    const sensors = el("div", "activity-sensors");
    [scenario ? (scenario.dark ? "🌙 Gelap" : "☀ Terang") : "Cahaya: —",
      scenario ? (scenario.occupied ? "Ada orang" : "Ruangan kosong") : "Penghuni: —",
      scenario ? (scenario.emergency ? "⚠ Darurat" : "Tidak darurat") : "Darurat: —"].forEach((text) => sensors.append(el("span", "activity-sensor", text)));
    classroom.append(scene, el("p", "activity-lamp-state", "Lampu: " + lampText(st.lamp)), sensors);
    if (scenario) classroom.append(el("p", "activity-expected", "Target lampu: " + lampText(scenario.expected)));

    const tableWrap = el("div", "activity-table-wrap");
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute("role", "region");
    tableWrap.setAttribute("aria-label", "Semua skenario dan hasil pengujian; geser untuk melihat seluruh kolom");
    const table = el("table", "activity-results");
    table.append(el("caption", "", "Semua skenario · target dan hasil program"));
    const head = el("thead"), heading = el("tr");
    ["Kasus", "Cahaya", "Penghuni", "Darurat", "Target lampu", "Hasil lampu", "Status"].forEach((text) => {
      const cell = el("th", "", text); cell.scope = "col"; heading.append(cell);
    });
    head.append(heading);
    const body = el("tbody");
    scenarios.forEach((item, i) => {
      const result = results[i];
      const tested = !!result && result.tested === true;
      const passed = tested && result.passed === true;
      const row = el("tr", (i === current ? "is-current " : "") + (tested ? (passed ? "is-passed" : "is-failed") : ""));
      if (i === current) row.setAttribute("aria-current", "step");
      const label = el("th", "", String(i + 1) + (i === current ? " · Saat ini" : ""));
      label.scope = "row";
      row.append(label);
      [item.dark ? "Gelap" : "Terang", item.occupied ? "Ada orang" : "Kosong", item.emergency ? "Ya" : "Tidak",
        lampText(item.expected), tested ? lampText(result.actual) : "Belum diatur",
        tested ? (passed ? "✓ Lulus" : "✕ Tidak sesuai") : "Belum diuji"].forEach((text) => row.append(el("td", "", text)));
      body.append(row);
    });
    table.append(head, body); tableWrap.append(table);
    // Keep the table's horizontal position while the program tests each case.
    const oldWrap = content.querySelector(".activity-table-wrap");
    const scrollLeft = oldWrap ? oldWrap.scrollLeft : 0;
    const focused = oldWrap === document.activeElement;
    content.replaceChildren(classroom, tableWrap);
    tableWrap.scrollLeft = scrollLeft;
    if (focused) tableWrap.focus({ preventScroll: true });
    const summary = "Skenario lulus: " + st.score + " / " + st.goal + ". " +
      (current >= 0 ? "Skenario saat ini: " + (current + 1) + ". " : "") + "Lampu: " + lampText(st.lamp) + ".";
    if (live.textContent !== summary) live.textContent = summary;
  }

  function draw(st) {
    const host = document.querySelector("#field");
    if (!host || !st || !["musik", "lampu"].includes(st.engine)) return;
    const fresh = !root || root.parentNode !== host || panelEngine !== st.engine || panelVersion !== st.version;
    if (!root || root.parentNode !== host || panelEngine !== st.engine) mount(host, st);
    host.dataset.engine = st.engine;
    if (st.engine === "musik") music(st, fresh);
    else { stopAudio(); previousOutput = []; lamps(st); }
    panelVersion = st.version;
  }

  return { draw, activateAudio, stopAudio };
})();
