/* config.js — SEMUA DATA ada di sini: arah, kondisi, definisi blok, level, contoh.
   Menambah level / blok baru cukup mengubah file ini (+ handler di interpreter.js). */
window.Petani = window.Petani || {};

Petani.Config = (function () {
  const GROW = 2; // langkah yang dibutuhkan padi muda untuk matang

  const DIR_VEC = { atas: [0, -1], bawah: [0, 1], kiri: [-1, 0], kanan: [1, 0] };
  const DIR_LABEL = { atas: "↑ atas", bawah: "↓ bawah", kiri: "← kiri", kanan: "→ kanan" };
  const ARROW = { atas: "↑", bawah: "↓", kiri: "←", kanan: "→" };

  // Kondisi untuk blok "jika" dan "selama": kunci -> teks di dropdown
  const COND_LABEL = { matang: "padi matang", muda: "padi muda", kosong: "tanah kosong" };
  for (const d in DIR_VEC) COND_LABEL[d] = "bisa ke " + ARROW[d];
  for (const d in DIR_VEC) COND_LABEL["no_" + d] = "tidak bisa ke " + ARROW[d];

  // Definisi blok. kind = warna (mv/ac/ct), container = punya isi di dalamnya,
  // value = kontrol bawaan blok (select atau number).
  const BLOCKS = {
    jalan:  { label: "jalan ke", kind: "mv", value: { type: "select", options: DIR_LABEL, def: "kanan" } },
    tanam:  { label: "tanam padi 🌱", kind: "ac" },
    panen:  { label: "panen padi 🌾", kind: "ac" },
    tunggu: { label: "tunggu ⏳", kind: "ac" },
    ulang:  { label: "ulangi", kind: "ct", container: true, suffix: "kali", value: { type: "number", min: 1, max: 99, def: 3 } },
    jika:   { label: "jika", kind: "ct", container: true, suffix: "maka", value: { type: "select", options: COND_LABEL, def: "matang" } },
    selama: { label: "selama", kind: "ct", container: true, value: { type: "select", options: COND_LABEL, def: "kanan" } }
  };

  // ===== LEVEL =====
  // Tiap level = satu objek di array LEVELS. Tambah / ubah / hapus / urutkan level cukup di sini.
  //   title  : judul level
  //   hint   : petunjuk yang tampil di awal level
  //   map    : array teks, 1 string = 1 baris ladang (baris pertama = paling atas). Harus persegi (N baris x N kolom).
  //            Legenda: "." tanah kosong | "m" padi muda | "P" padi matang
  //   goal   : (opsional) target jumlah panen. Bawaan = jumlah petak yang berisi padi pada map
  //   start  : (opsional) posisi awal petani [kolom, baris], dihitung dari 0. Bawaan [0, 0]
  //   sample : (opsional) contoh solusi untuk tombol "Lihat contoh" (pohon blok: {t, v, body})
  const TILE = { ".": 0, "m": 1, "P": 2 }; // 0=kosong, 1=muda, 2=matang (sama dengan World.EMPTY/YOUNG/RIPE)

  // Pola ular: menyusuri semua petak baris demi baris, lakukan `act` di tiap petak
  const snake = (act, vert) => [
    { t: "ulang", v: 2, body: [
      { t: "selama", v: "kanan", body: [{ t: act }, { t: "jalan", v: "kanan" }] }, { t: act }, { t: "jalan", v: vert },
      { t: "selama", v: "kiri", body: [{ t: act }, { t: "jalan", v: "kiri" }] }, { t: act }, { t: "jalan", v: vert } ] }
  ];

  const RAW_LEVELS = [
    { title: "Level 1: Baris pertama",
      hint: "Ada 5 padi matang di baris atas. Panen semuanya!",
      map: ["PPPPP",
            ".....",
            ".....",
            ".....",
            "....."],
      goal: 5,
      sample: [{ t: "panen" }, { t: "ulang", v: 4, body: [{ t: "jalan", v: "kanan" }, { t: "panen" }] }] },

    { title: "Level 2: Ladang penuh",
      hint: "Seluruh ladang sudah matang. Coba pakai blok “ulangi” atau “selama”.",
      map: ["PPPP",
            "PPPP",
            "PPPP",
            "PPPP"],
      goal: 16,
      sample: snake("panen", "bawah") },

    { title: "Level 3: Mulai dari nol",
      hint: "Tanah masih kosong. Tanam dulu, tunggu 2 langkah sampai tumbuh, lalu panen.",
      map: ["....",
            "....",
            "....",
            "...."],
      goal: 16,
      sample: snake("tanam", "bawah").concat(snake("panen", "atas")) },

    { title: "Level 4: Papan catur",
      hint: "Padi matang hanya ada di sebagian petak. Panen semuanya, petak kosong dilewati saja.",
      map: ["P.P.",
            ".P.P",
            "P.P.",
            ".P.P"],
      sample: snake("panen", "bawah") }
  ];

  // Validasi + isi nilai bawaan, supaya salah ketik di map langsung ketahuan
  const LEVELS = RAW_LEVELS.map((lv, i) => {
    const name = "Level " + (i + 1), n = lv.map.length;
    lv.map.forEach((row, y) => {
      if (row.length !== n) throw new Error(name + ": map harus persegi (" + n + " baris x " + n + " kolom), baris " + (y + 1) + " panjangnya " + row.length);
      for (const ch of row) if (!(ch in TILE)) throw new Error(name + ': karakter "' + ch + '" tidak dikenal di map (pakai . m P)');
    });
    const out = Object.assign({ size: n, goal: lv.map.join("").replace(/\./g, "").length, start: [0, 0], sample: [] }, lv);
    if (out.start[0] < 0 || out.start[1] < 0 || out.start[0] >= n || out.start[1] >= n) throw new Error(name + ": start di luar ladang");
    return out;
  });

  // Contoh solusi per level (diambil dari properti `sample` tiap level)
  const SAMPLES = LEVELS.map((lv) => lv.sample);

  return { GROW, DIR_VEC, DIR_LABEL, COND_LABEL, BLOCKS, TILE, LEVELS, SAMPLES };
})();
