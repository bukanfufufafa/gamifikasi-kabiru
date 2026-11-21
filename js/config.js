/* config.js — game data: jenjang (education levels), quests and levels.
   Structure:  JENJANG -> QUESTS (each has an `engine`) -> levels.
   Adding a level  = add one object to a quest's `levels`.
   Adding a quest  = add one object to RAW_QUESTS (and an engine in world.js + a look in view.js if it needs new rules/visuals).
   Block definitions live in editor.js (built with Blockly). */
window.Petani = window.Petani || {};

Petani.Config = (function () {
  // ===== GRID SIZE for the farm quest (ubah di sini) =====
  // Setiap level Petani Blok harus punya map untuk ukuran ini di `maps`. Bawaan tersedia: 3, 6, 9.
  // Quest lain memakai satu `map` persegi sendiri (ukuran bebas, mis. 5, 6, 7).
  const GRID_SIZE = 6;

  const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // ===== JENJANG =====
  const JENJANG = [
    { id: "sd-awal",  label: "SD Awal",  kelas: "Kelas 1–3", icon: "🌱", desc: "Berhitung dan menyusun perintah langkah demi langkah." },
    { id: "sd-akhir", label: "SD Akhir", kelas: "Kelas 4–6", icon: "🌿", desc: "Mengenali pola, mengulang perintah, dan memilih tindakan." },
    { id: "smp",      label: "SMP",      kelas: "Kelas 7–9", icon: "🌳", desc: "Membaca koordinat dan merencanakan rute." }
  ];

  // ===== TOOLBOX presets (token list, see editor.js buildToolbox) =====
  const TOOLS_FARM = ["move", "harvest", "repeat", "while", "until", "if", "ifelse",
    "s:wheat_here", "s:wheat_any", "s:can_move", "s:blocked", "s:wheat_dir", "logic"];

  // ===== Bank Sampah: items and bins =====
  const ITEMS = {
    k: { name: "Koran",         emoji: "📰", cat: "kertas" },
    d: { name: "Kardus",        emoji: "📦", cat: "kertas" },
    b: { name: "Botol plastik", emoji: "🧴", cat: "plastik" },
    g: { name: "Gelas plastik", emoji: "🥤", cat: "plastik" },
    p: { name: "Kulit pisang",  emoji: "🍌", cat: "organik" },
    a: { name: "Sisa apel",     emoji: "🍎", cat: "organik" }
  };
  const BINS = [
    { id: "kertas",  label: "Kertas",  emoji: "📄", color: 0x3b82f6 },
    { id: "plastik", label: "Plastik", emoji: "🧴", color: 0xeab308 },
    { id: "organik", label: "Organik", emoji: "🍃", color: 0x22c55e }
  ];
  const CAT_TIP = {
    kertas: "Kertas bisa didaur ulang menjadi kertas baru.",
    plastik: "Plastik bisa didaur ulang menjadi barang plastik baru.",
    organik: "Sampah organik berasal dari makhluk hidup dan bisa dijadikan kompos."
  };

  // ===== Farm quest helpers =====
  const TILE = { ".": "soil", "W": "wheat", "#": "rock" };
  const H = { t: "harvest" }, go = (d) => ({ t: "move", v: d });
  const scan = (act) => [ // row-by-row sweep that runs `act` on every tile; works for any size
    { t: "while", v: "can_down", body: [
      { t: "while", v: "can_right", body: [...act, go("right")] }, ...act,
      { t: "while", v: "can_left", body: [go("left")] }, go("down") ] },
    { t: "while", v: "can_right", body: [...act, go("right")] }, ...act
  ];

  // Sample-solution helpers for the other quests
  const rep = (n, ...body) => ({ t: "repeat", v: n, body });
  const take = (n) => ({ t: "take", v: n }), give = { t: "deliver" };
  const pick = { t: "pick" }, sortTo = (c) => ({ t: "sort", v: c });
  const mark = { t: "mark" }, grab = { t: "sample" };
  const handle = (cat) => ({ t: "if", v: "is_" + cat, body: [pick, sortTo(cat)] });

  // ===== QUESTS =====
  //   Level fields (all quests):
  //     key, title, mission (goal text), learn (learning note), hint (shown at start), hints[] (💡 button), explain (shown after success)
  //     tools (optional, overrides quest.tools)   sample (example solution tree {t, v, body, orelse})
  //     minBlocks + starThresholds [5★, 4★, 3★, 2★ max blocks]
  //   Map legend:  farm  . soil  W wheat  # rock
  //                bekal . floor  D dapur  T teman  # pagar
  //                sampah . floor  # rock  + letters of ITEMS (k d b g p a)
  //                koordinat . floor  # rock   (origin = centre tile, 7x7 -> x,y in -3..3)
  const RAW_QUESTS = [
    // ---------------------------------------------------------------- SD AWAL
    { id: "bekal", jenjang: "sd-awal", icon: "🤖", title: "Robot Pengantar Bekal",
      subject: "Matematika", skill: "Urutan instruksi", engine: "bekal", starMode: "learning",
      desc: "Bantu robot mengantar bekal ke teman-temanmu. Hitung dulu berapa bekal yang dibutuhkan, lalu susun perintahnya!",
      goals: ["Menghitung jumlah benda", "Menjumlahkan bilangan sampai 9", "Menyusun perintah secara berurutan"],
      tools: ["move", "take", "deliver", "repeat"],
      levels: [
        { key: "1", title: "Level 1: Bekal untuk Tiga Teman",
          mission: "Ada 3 teman yang menunggu bekal. Robot mulai dari dapur 🏠. Ambil bekal sesuai jumlah teman, lalu antar satu bekal untuk setiap teman.",
          learn: "Menghitung: 1 teman mendapat 1 bekal, jadi jumlah bekal sama dengan jumlah teman. Urutan perintah penting: ambil bekal dulu, baru antar.",
          hint: "Hitung dulu ada berapa teman. Lalu susun: ambil bekal → gerak → antar.",
          hints: ["Hitung teman di peta: ada 3 teman, jadi robot perlu mengambil 3 bekal.",
                  "Robot sudah berdiri di dapur. Pakai blok \"ambil … bekal\" lebih dulu.",
                  "Lalu: gerak ke kanan, antar bekal. Lakukan lagi untuk teman berikutnya."],
          explain: "3 teman, tiap teman 1 bekal: 1 + 1 + 1 = 3 bekal.",
          tools: ["move", "take", "deliver"],
          minBlocks: 8, starThresholds: [8, 11, 999, 999],
          map: [".....",
                ".....",
                "DTTT.",
                ".....",
                "....."],
          start: [0, 2],
          sample: [take(3), go("right"), give, go("right"), give, go("right"), give] },

        { key: "2", title: "Level 2: Dua Kelompok Teman",
          mission: "Ada dua kelompok teman: kelompok atas dan kelompok bawah. Hitung total bekal yang harus dibawa, ambil sekali di dapur, lalu antar sampai tidak ada bekal tersisa.",
          learn: "Penjumlahan: jumlahkan teman di tiap kelompok untuk mendapat total bekal. Contoh: 1 teman di sini + 2 teman di sana → 1 + 2 = 3 bekal.",
          hint: "Hitung teman kelompok atas, lalu kelompok bawah. Jumlahkan, dan bawa bekal sebanyak itu.",
          hints: ["Hitung teman di kelompok atas, lalu di kelompok bawah.",
                  "Jumlahkan kedua kelompok untuk tahu berapa bekal yang harus diambil.",
                  "Blok \"ulangi\" membantu kalau teman berjajar lurus."],
          explain: "Kelompok atas 2 teman + kelompok bawah 3 teman: 2 + 3 = 5 bekal.",
          minBlocks: 13, starThresholds: [13, 17, 999, 999],
          map: ["D.TT..",
                "......",
                "......",
                "..TTT.",
                "......",
                "......"],
          start: [0, 0],
          sample: [take(5), go("right"), rep(2, go("right"), give), go("right"), rep(3, go("down")), give, rep(2, go("left"), give)] },

        { key: "3", title: "Level 3: Pengiriman Mandiri",
          mission: "Ada tiga kelompok teman di tiga tempat, dan ada pohon 🌳 yang menghalangi jalan. Hitung semua kebutuhan bekal, lalu rancang sendiri rute pengirimanmu.",
          learn: "Menjumlahkan tiga bilangan: a + b + c. Susun rute yang tidak menabrak pohon, dan pastikan tidak ada bekal tersisa.",
          hint: "Jumlahkan teman di ketiga kelompok, ambil bekal sekali, lalu rencanakan rutenya.",
          hints: ["Hitung teman di tiap kelompok, lalu jumlahkan ketiganya.",
                  "Kamu cukup mengambil bekal sekali di dapur.",
                  "Rencanakan rute dulu: kelompok atas, tengah, lalu bawah. Hindari pohon 🌳."],
          explain: "3 + 2 + 4 = 9 bekal. Semua teman kebagian!",
          minBlocks: 21, starThresholds: [21, 26, 999, 999],
          map: ["D.TTT.",
                "..#...",
                ".TT#..",
                "......",
                "..TTTT",
                "......"],
          start: [0, 0],
          sample: [take(9), go("right"), rep(3, go("right"), give), rep(3, go("down")), rep(2, go("left")), go("up"), give, go("left"), give,
                   rep(2, go("down")), go("right"), give, rep(3, go("right"), give)] }
      ] },

    // --------------------------------------------------------------- SD AKHIR
    { id: "sampah", jenjang: "sd-akhir", icon: "♻️", title: "Misi Bank Sampah",
      subject: "IPA · Lingkungan", skill: "Pengulangan & kondisi", engine: "sampah", starMode: "learning",
      desc: "Bantu robot memilah sampah ke tong yang tepat. Kenali bahan tiap benda, temukan polanya, dan biarkan robot memilih sendiri!",
      goals: ["Mengenali bahan: kertas, plastik, organik", "Menemukan pola dan memakai perulangan", "Memilih tindakan dengan \"jika\""],
      tools: ["move", "pick", "sort", "repeat"],
      levels: [
        { key: "1", title: "Level 1: Kenali Material",
          mission: "Ada 3 benda di jalur. Ambil tiap benda, lalu pilah ke tong yang sesuai dengan bahannya.",
          learn: "Koran dan kardus terbuat dari kertas. Botol dan gelas plastik terbuat dari plastik. Kertas dan plastik bisa didaur ulang, asal dipilah sesuai bahannya.",
          hint: "Lihat nama benda di atas ubin. Untuk tiap benda: ambil → pilah ke tong → gerak.",
          hints: ["Koran → kertas. Botol plastik → plastik.",
                  "Urutan untuk tiap benda: ambil benda, pilah ke tong, lalu gerak ke benda berikutnya.",
                  "Pilih tong di blok \"pilah ke tong\" sesuai bahan benda."],
          explain: "Koran dan kardus → kertas, botol → plastik. Memilah sampah memudahkan daur ulang.",
          tools: ["move", "pick", "sort"],
          minBlocks: 9, starThresholds: [9, 12, 999, 999],
          map: [".....",
                ".....",
                "kbd..",
                ".....",
                "....."],
          start: [0, 2],
          sample: [pick, sortTo("kertas"), go("right"), pick, sortTo("plastik"), go("right"), pick, sortTo("kertas")] },

        { key: "2", title: "Level 2: Jalur Pengumpulan",
          mission: "Benda di jalur ini berselang-seling. Temukan polanya, lalu pakai blok \"ulangi\" supaya kodemu singkat.",
          learn: "Pola adalah urutan yang berulang. Kalau polanya berulang, pakai perulangan agar tidak menulis perintah yang sama berkali-kali.",
          hint: "Perhatikan urutan bendanya. Bagian mana yang terus berulang?",
          hints: ["Pola bendanya: kertas, plastik, kertas, plastik, …",
                  "Satu putaran pola = ambil, pilah, gerak, ambil, pilah, gerak.",
                  "Masukkan satu putaran itu ke dalam \"ulangi 3 kali\"."],
          explain: "Polanya (kertas, plastik) berulang 3 kali, jadi cukup satu blok \"ulangi\".",
          minBlocks: 8, starThresholds: [8, 12, 999, 999],
          map: ["......",
                "......",
                "kbdgkb",
                "......",
                "......",
                "......"],
          start: [0, 2],
          sample: [rep(3, pick, sortTo("kertas"), go("right"), pick, sortTo("plastik"), go("right"))] },

        { key: "3", title: "Level 3: Muatan Campuran",
          mission: "Sekarang bendanya campur: kertas, plastik, dan sampah organik. Pakai sensor jenis benda dan blok \"jika\" agar robot memilih tong yang tepat.",
          learn: "Percabangan (jika … maka): robot memeriksa kondisi dulu, baru memilih tindakan. Sampah organik seperti sisa makanan dan daun bisa dijadikan kompos.",
          hint: "Periksa jenis benda dengan sensor, lalu pilih tindakan dengan \"jika\".",
          hints: ["Cari blok \"jenis benda = …?\" di kategori Sensor.",
                  "Pakai \"jika\" tiga kali: untuk kertas, plastik, dan organik.",
                  "Bungkus semuanya dalam \"ulangi 6 kali\", dan jangan lupa gerak ke kanan."],
          explain: "Dengan \"jika\", robot memutuskan sendiri tong mana yang tepat untuk tiap benda.",
          tools: ["move", "pick", "sort", "repeat", "if", "ifelse", "s:item_here", "s:item_is"],
          minBlocks: 15, starThresholds: [15, 19, 999, 999],
          map: ["......",
                "......",
                "kpbdag",
                "......",
                "......",
                "......"],
          start: [0, 2],
          sample: [rep(6, handle("kertas"), handle("plastik"), handle("organik"), go("right"))] }
      ] },

    // ------------------------------------------------- SD AKHIR: quest lama (dipertahankan)
    { id: "petani", jenjang: "sd-akhir", icon: "🌾", title: "Petani Blok",
      subject: "Logika & Algoritma", skill: "Perulangan & kondisi", engine: "farm", starMode: "efficiency",
      desc: "Susun blok perintah agar petani memanen semua gandum di ladang. Makin ringkas kodemu, makin banyak bintangnya!",
      goals: ["Menyusun algoritma langkah demi langkah", "Perulangan, bahkan perulangan di dalam perulangan", "Percabangan dengan sensor"],
      tools: TOOLS_FARM,
      levels: [
        { key: "contoh", title: "Contoh: Panen Satu Baris",
          isExample: true,
          hint: "Kode sudah terisi. Tekan bendera hijau, lalu coba ubah blok-bloknya!",
          maps: {
            3: ["WWW",
                "...",
                "..."],
            6: ["WWWWWW",
                "......",
                "......",
                "......",
                "......",
                "......"],
            9: ["WWWWWWWWW",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                "........."] },
          sample: [H, { t: "while", v: "can_right", body: [go("right"), H] }] },

        { key: "1", title: "Level 1: Baris Pertama",
          hint: "Baris atas penuh gandum. Panen semuanya!",
          minBlocks: 6,
          starThresholds: [6, 8, 10, 13],
          maps: {
            3: ["WWW",
                "...",
                "..."],
            6: ["WWWWWW",
                "......",
                "......",
                "......",
                "......",
                "......"],
            9: ["WWWWWWWWW",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                "........."] },
          sample: [H, { t: "while", v: "can_right", body: [go("right"), H] }] },

        { key: "2", title: "Level 2: Ladang Penuh",
          hint: "Semua petak berisi gandum. Coba perulangan di dalam perulangan.",
          minBlocks: 9,
          starThresholds: [9, 13, 17, 24],
          maps: {
            3: ["WWW",
                "WWW",
                "WWW"],
            6: ["WWWWWW",
                "WWWWWW",
                "WWWWWW",
                "WWWWWW",
                "WWWWWW",
                "WWWWWW"],
            9: ["WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW",
                "WWWWWWWWW"] },
          sample: scan([H]) },

        { key: "3", title: "Level 3: Tangga Batu",
          hint: "Batu menghalangi jalan. Gunakan \"bisa gerak\" untuk menemukan ujung tiap baris.",
          minBlocks: 11,
          starThresholds: [11, 14, 18, 24],
          maps: {
            3: ["WWW",
                "WW#",
                "W##"],
            6: ["WWWWWW",
                "WWWWW#",
                "WWWW##",
                "WWW###",
                "WW####",
                "W#####"],
            9: ["WWWWWWWWW",
                "WWWWWWWW#",
                "WWWWWWW##",
                "WWWWWW###",
                "WWWWW####",
                "WWWW#####",
                "WWW######",
                "WW#######",
                "W########"] },
          sample: scan([H]) },

        { key: "4", title: "Level 4: Papan Catur",
          hint: "Hanya sebagian petak berisi gandum. Gunakan \"jika ada gandum\".",
          minBlocks: 13,
          starThresholds: [13, 17, 22, 28],
          maps: {
            3: ["W.W",
                ".W.",
                "W.W"],
            6: ["W.W.W.",
                ".W.W.W",
                "W.W.W.",
                ".W.W.W",
                "W.W.W.",
                ".W.W.W"],
            9: ["W.W.W.W.W",
                ".W.W.W.W.",
                "W.W.W.W.W",
                ".W.W.W.W.",
                "W.W.W.W.W",
                ".W.W.W.W.",
                "W.W.W.W.W",
                ".W.W.W.W.",
                "W.W.W.W.W"] },
          sample: scan([{ t: "if", v: "wheat", body: [H] }]) },

        { key: "5", title: "Level 5: Jalur Zigzag",
          hint: "Ikuti jalur gandum di antara batu. Coba \"selama masih ada gandum\" dengan jika / selain itu.",
          minBlocks: 9,
          starThresholds: [9, 12, 15, 20],
          maps: {
            3: ["WW#",
                ".WW",
                "..W"],
            6: ["WW####",
                ".WW###",
                "..WW##",
                "...WW#",
                "....WW",
                ".....W"],
            9: ["WW#######",
                ".WW######",
                "..WW#####",
                "...WW####",
                "....WW###",
                ".....WW##",
                "......WW#",
                ".......WW",
                "........W"] },
          sample: [H, { t: "while", v: "any", body: [
            { t: "ifelse", v: "wheat_right", body: [go("right")], orelse: [go("down")] }, H ] }] }
      ] },

    // -------------------------------------------------------------------- SMP
    { id: "ekspedisi", jenjang: "smp", icon: "🚀", title: "Ekspedisi Robot Penjelajah",
      subject: "Matematika", skill: "Perencanaan rute", engine: "koordinat", starMode: "learning",
      desc: "Pandu robot menjelajahi planet asing memakai koordinat Kartesius. Baca sumbu x dan y, hitung langkahnya, lalu rencanakan rutenya!",
      goals: ["Membaca dan menuliskan koordinat (x, y)", "Memahami koordinat negatif", "Merencanakan rute dengan selisih koordinat"],
      tools: ["move", "mark", "repeat"],
      levels: [
        { key: "1", title: "Level 1: Titik Pendaratan",
          mission: "Robot mendarat di titik asal (0, 0). Bawa robot ke titik A (3, 2) lalu tandai titik itu.",
          learn: "Koordinat Kartesius ditulis (x, y). x = posisi mendatar (kanan positif, kiri negatif). y = posisi tegak (atas positif, bawah negatif). Titik asal adalah (0, 0).",
          hint: "Titik A ada di (3, 2). Bendera menunjukkan lokasinya, tetapi coba baca juga angka di tepi peta.",
          hints: ["x = 3 artinya 3 langkah ke kanan dari titik asal.",
                  "y = 2 artinya 2 langkah ke atas.",
                  "Setelah sampai di titik A, pakai blok \"tandai titik\"."],
          explain: "Titik (3, 2) berarti 3 satuan ke kanan dan 2 satuan ke atas dari titik asal.",
          tools: ["move", "mark"],
          showTargets: true,
          targets: [{ label: "A", x: 3, y: 2 }],
          minBlocks: 7, starThresholds: [7, 10, 999, 999],
          map: [".......",
                ".......",
                ".......",
                ".......",
                ".......",
                ".......",
                "......."],
          start: [3, 3],
          sample: [go("right"), go("right"), go("right"), go("up"), go("up"), mark] },

        { key: "2", title: "Level 2: Menyeberangi Sumbu",
          mission: "Robot mulai dari (0, 0). Tandai titik A (-2, 1) lebih dulu, lalu titik B (1, -3). Lokasinya tidak diberi tanda, jadi bacalah koordinatnya dari sumbu!",
          learn: "Di sebelah kiri sumbu y, nilai x negatif. Di bawah sumbu x, nilai y negatif. Urutan titik penting: tandai A dulu, baru B.",
          hint: "Titik tidak diberi tanda. Baca angka di tepi peta untuk menemukan A dan B.",
          hints: ["A (-2, 1): x negatif → 2 langkah ke kiri; y positif → 1 langkah ke atas.",
                  "Dari A ke B: x naik dari -2 ke 1 (3 langkah ke kanan), y turun dari 1 ke -3 (4 langkah ke bawah).",
                  "Tandai tiap titik sebelum pindah ke titik berikutnya."],
          explain: "A (-2, 1): 2 ke kiri, 1 ke atas. B (1, -3): 1 ke kanan, 3 ke bawah dari titik asal.",
          showTargets: false,
          targets: [{ label: "A", x: -2, y: 1 }, { label: "B", x: 1, y: -3 }],
          minBlocks: 10, starThresholds: [10, 14, 999, 999],
          map: [".......",
                ".......",
                ".......",
                ".......",
                ".......",
                ".......",
                "......."],
          start: [3, 3],
          sample: [rep(2, go("left")), go("up"), mark, rep(3, go("right")), rep(4, go("down")), mark] },

        { key: "3", title: "Level 3: Ekspedisi Sampel",
          mission: "Kumpulkan 3 sampel di S1 (-3, 2), S2 (2, 2), dan S3 (2, -2). Sampelnya tersembunyi dan ada batu yang menghalangi. Setelah semuanya terkumpul, bawa robot pulang ke titik asal (0, 0).",
          learn: "Merencanakan rute: urutkan titik yang dikunjungi, hitung selisih koordinatnya (selisih x = x tujuan − x sekarang), lalu hindari rintangan.",
          hint: "Hitung selisih koordinat dari posisi sekarang ke tiap sampel, dan jangan lupa pulang.",
          hints: ["Selisih koordinat antara dua titik = jumlah langkah yang harus ditempuh.",
                  "Ada batu di baris y = 2 antara x = -1 dan x = 1. Cari jalan memutar.",
                  "Setelah mengambil sampel terakhir, bawa robot kembali ke (0, 0)."],
          explain: "Rute efisien dibuat dari selisih koordinat antar titik, sambil menghindari rintangan dan pulang ke titik asal.",
          tools: ["move", "sample", "repeat"],
          showTargets: false, mode: "collect", home: true,
          targets: [{ label: "S1", x: -3, y: 2 }, { label: "S2", x: 2, y: 2 }, { label: "S3", x: 2, y: -2 }],
          minBlocks: 20, starThresholds: [20, 26, 999, 999],
          map: [".......",
                "..###..",
                ".......",
                ".......",
                ".....#.",
                ".......",
                "......."],
          start: [3, 3],
          sample: [rep(2, go("right")), rep(2, go("up")), grab, go("up"), rep(5, go("left")), go("down"), grab,
                   rep(4, go("down")), rep(5, go("right")), grab, rep(2, go("left")), rep(2, go("up"))] }
      ] }
  ];

  // ===== Validate + fill defaults, so typos in a map are caught immediately =====
  const LEGAL = {
    farm: (ch) => ch in TILE,
    bekal: (ch) => ".DT#".includes(ch),
    sampah: (ch) => ch === "." || ch === "#" || ch in ITEMS,
    koordinat: (ch) => ".#".includes(ch)
  };

  const QUESTS = RAW_QUESTS.map((q) => {
    q.levels = q.levels.map((lv, index) => {
      const name = q.title + " / " + lv.title;
      const out = Object.assign({ start: [0, 0], sample: [] }, lv, { id: q.id + ":" + lv.key, questId: q.id, index });
      const maps = lv.maps ? lv.maps : { [(lv.map || []).length]: lv.map };
      if (lv.maps && !lv.maps[GRID_SIZE]) throw new Error(name + ": no " + GRID_SIZE + "x" + GRID_SIZE + " map in `maps` (GRID_SIZE = " + GRID_SIZE + ")");
      Object.keys(maps).map(Number).forEach((n) => { // every map that exists must be valid
        const m = maps[n];
        if (!m || m.length !== n) throw new Error(name + ": missing " + n + "x" + n + " map (needs " + n + " rows)");
        m.forEach((row, y) => {
          if (row.length !== n) throw new Error(name + " (" + n + "x" + n + "): row " + (y + 1) + " has " + row.length + " columns, expected " + n);
          for (const ch of row) if (!LEGAL[q.engine](ch)) throw new Error(name + ': unknown map character "' + ch + '" for engine ' + q.engine);
        });
        const [sx, sy] = out.start;
        if (m[sy] === undefined || m[sy][sx] === undefined || m[sy][sx] === "#") throw new Error(name + " (" + n + "x" + n + "): invalid start tile");
      });
      if (q.engine === "koordinat") {
        const n = (lv.map || []).length, half = (n - 1) / 2;
        if (n % 2 === 0) throw new Error(name + ": koordinat map needs an odd size so the origin is in the centre");
        (lv.targets || []).forEach((t) => {
          const row = lv.map[half - t.y], ch = row && row[t.x + half];
          if (ch === undefined || ch === "#") throw new Error(name + ": target " + t.label + " is outside the map or on a rock");
        });
      }
      return out;
    });
    return q;
  });

  const questById = (id) => QUESTS.find((q) => q.id === id) || null;
  const levelById = (id) => {
    const [qid, key] = String(id).split(":"), q = questById(qid);
    return q ? q.levels.find((lv) => lv.key === key) || null : null;
  };
  const mapOf = (lv) => (lv.maps ? lv.maps[GRID_SIZE] : lv.map);
  const toolsOf = (q, lv) => lv.tools || q.tools;

  // Short goal text for level cards
  function goalLabel(q, lv) {
    const map = mapOf(lv) || [], count = (test) => map.reduce((a, row) => a + [...row].filter(test).length, 0);
    switch (q.engine) {
      case "farm":      return count((c) => c === "W") + " Gandum";
      case "bekal":     return count((c) => c === "T") + " Teman";
      case "sampah":    return count((c) => c in ITEMS) + " Benda";
      case "koordinat": return (lv.targets || []).length + (lv.mode === "collect" ? " Sampel" : " Titik");
    }
    return "";
  }

  return { GRID_SIZE, DIR_VEC, JENJANG, QUESTS, ITEMS, BINS, CAT_TIP, TILE, questById, levelById, mapOf, toolsOf, goalLabel };
})();
