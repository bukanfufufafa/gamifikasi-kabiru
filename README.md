# Kabiru — Side Quest Blok Coding

Modul front-end mandiri menggunakan HTML, CSS, JavaScript, Blockly lokal, dan Three.js dari CDN. Tidak memerlukan build atau instalasi npm untuk dimainkan.

## Menjalankan

Dari folder proyek:

```sh
py -m http.server 8000
```

Buka http://localhost:8000. Three.js memerlukan internet; musik dan lampu menggunakan panel DOM, bukan WebGL. Suara musik opsional dan dibuat dengan Web Audio setelah pengguna menekan Jalankan. Tidak ada layanan audio eksternal.

## Konten

| Jenjang | Quest | Materi / mekanik |
| --- | --- | --- |
| SD awal (1–3) | Robot Pengantar Bekal | Menghitung, menjumlah, merencanakan pengiriman |
| SD awal (1–3) | Studio Musik Pola | Pola AB/AAB/ABC, urutan keluaran dan perulangan |
| SD akhir (4–6) | Misi Bank Sampah | Material, pola, klasifikasi dengan kondisi |
| SD akhir (4–6) | Petani Blok | Rute, pengulangan dan sensor; contoh dan lima level lama dipertahankan |
| SMP (7–9) | Ekspedisi Robot Penjelajah | Koordinat Kartesius dan perencanaan rute |
| SMP (7–9) | Laboratorium Lampu Pintar | Boolean, DAN/ATAU, percabangan dan pengujian skenario |

Total: 20 tantangan dan satu contoh. Pemetaan materi/usia masih perlu validasi pendidik. Lampu Pintar merupakan simulasi aturan kendali, bukan simulasi fisika rangkaian listrik.

### Aturan aktivitas baru

- Musik: jenis, urutan, dan jumlah keluaran harus tepat. Pola benar yang disusul bunyi tambahan tetap gagal. Ikon dan nama alat musik membuat aktivitas dapat diselesaikan tanpa suara; tempo bukan unsur penilaian.
- Lampu: program yang sama dijalankan ulang untuk setiap kombinasi masukan relevan (2, 4, atau 8 skenario). Keadaan lampu direset menjadi belum diatur pada setiap kasus. Semua skenario harus lulus; cabang yang tidak mengatur lampu bukan otomatis berarti mati.
- Semua quest memakai rentang 1–5 bintang berdasarkan jumlah blok terhubung, termasuk blok mulai dan kondisi. Empat batas inklusif `starThresholds` menentukan 5, 4, 3, 2 bintang; di atas batas terakhir mendapat 1. Bintang diberikan hanya setelah misi selesai. Ambang Petani lama tidak diubah.
- Hasil terbaik yang sudah tersimpan tidak diturunkan ketika ambang bintang diperbarui. Pengulangan level mengikuti aturan baru.

## Struktur

Semua berkas aplikasi berada langsung di folder proyek tanpa subfolder.

- `config.js`: jenjang, quest, level, solusi contoh, ambang dan kalkulasi bintang.
- `world.js`: keadaan permainan dan aturan keberhasilan, termasuk finalisasi program serta isolasi skenario lampu.
- `interpreter.js`: menjalankan AST blok, tanpa evaluasi kode JavaScript siswa.
- `editor.js`: definisi Blockly, toolbox per level, konversi AST.
- `view.js`: arena 3D dan routing tampilan; `activity-view.js`: arena musik/lampu dan audio opsional.
- `main.js`: navigasi, eksekusi, pembatalan, feedback, dan popup bintang.
- `progress.js`: progres localStorage berbasis ID stabil; bukan progres akun siswa/API website induk.

## Validasi

Dengan Node.js:

```sh
node check-levels.js
```

Menguji solusi contoh seluruh level, batas semua tingkat bintang, keluaran musik salah/kurang/berlebih, aturan lampu salah, seluruh kombinasi masukan, isolasi antar-skenario, dan penjaga loop pada test runner.

Checklist browser:

- Jalankan tiap quest dan buka info bintang: semua lima tingkat harus terlihat.
- Coba musik tanpa audio, salah urutan, bunyi tambahan, serta Berhenti saat berjalan.
- Coba lampu selalu menyala dan kondisi tanpa cabang selain itu: tidak boleh lulus semua kasus.
- Berpindah musik/lampu ke Petani dan kembali: arena 3D harus pulih.
- Uji tab Kode/Arena, scrolling tabel skenario, dan drag blok pada HP fisik.

Detail integrasi website induk, login, dan sinkronisasi progres masih menunggu kontrak dari tim platform.
