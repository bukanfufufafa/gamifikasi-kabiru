/* interpreter.js — menjalankan pohon blok memakai generator.
   yield 1 = satu aksi selesai (UI boleh menggambar & menunggu)
   yield 0 = hanya putaran loop (tanpa jeda, untuk mencegah browser macet)
   Menambah blok baru: tulis satu handler di objek `handlers`. */
Petani.Interpreter = (function () {
  const W = Petani.World;

  const handlers = {
    *jalan(b)  { W.actions.move(b.v); yield 1; },
    *tanam()   { W.actions.plant();   yield 1; },
    *panen()   { W.actions.harvest(); yield 1; },
    *tunggu()  { W.actions.wait();    yield 1; },
    *ulang(b, ctx)  { for (let i = 0; i < b.v && !ctx.halt; i++) { yield* run(b.body, ctx); yield 0; } },
    *jika(b, ctx)   { if (W.test(b.v)) yield* run(b.body, ctx); yield 0; },
    *selama(b, ctx) { while (W.test(b.v) && !ctx.halt) { yield* run(b.body, ctx); yield 0; } }
  };

  function* run(blocks, ctx) {
    for (const b of blocks) {
      if (ctx.halt) return;
      yield* handlers[b.t](b, ctx);
    }
  }

  return { run };
})();
