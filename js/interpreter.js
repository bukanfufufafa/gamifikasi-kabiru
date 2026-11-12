/* interpreter.js — runs the program tree using generators.
   The tree comes from editor.js (built from the Blockly workspace):
     [{ id, t, v?, cond?, body?, orelse? }, ...]
     cond = expression tree: { c: "wheat" | "any" | "can" | "blocked" | "wheat_dir" , d } | { c: "not", a } | { c: "and"|"or", a, b }
   yield 1 = one action finished (UI may redraw and wait)
   yield 0 = just a loop iteration (no pause, but counted by the safety limit)
   ctx.hl(id) is called before each block runs, so the editor can highlight it (like Scratch). */
Petani.Interpreter = (function () {
  const W = Petani.World;

  // Evaluate a condition expression. Empty sockets count as false (like Scratch).
  function ev(e) {
    if (!e) return false;
    switch (e.c) {
      case "wheat":     return W.test("wheat");
      case "any":       return W.test("any");
      case "can":       return W.test("can_" + e.d);
      case "blocked":   return W.test("no_" + e.d);
      case "wheat_dir": return W.test("wheat_" + e.d);
      case "not":       return !ev(e.a);
      case "and":       return ev(e.a) && ev(e.b);
      case "or":        return ev(e.a) || ev(e.b);
    }
    return false;
  }

  const handlers = {
    *move(b)    { W.actions.move(b.v); yield 1; },
    *harvest()  { W.actions.harvest(); yield 1; },
    *repeat(b, ctx) { for (let i = 0; i < b.v && !ctx.halt; i++) { yield* run(b.body, ctx); yield 0; } },
    *while(b, ctx)  { while (!ctx.halt && ev(b.cond)) { yield* run(b.body, ctx); yield 0; } },
    *until(b, ctx)  { while (!ctx.halt && !ev(b.cond)) { yield* run(b.body, ctx); yield 0; } },
    *if(b, ctx)     { if (ev(b.cond)) yield* run(b.body, ctx); yield 0; },
    *ifelse(b, ctx) { yield* run(ev(b.cond) ? b.body : b.orelse, ctx); yield 0; }
  };

  function* run(blocks, ctx) {
    for (const b of blocks) {
      if (ctx.halt) return;
      if (ctx.hl) ctx.hl(b.id);
      yield* handlers[b.t](b, ctx);
    }
  }

  return { run, ev };
})();
