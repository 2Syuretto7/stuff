(() => {
  const items = (window.STUFF || []).filter(x => x && x.name);
  const NS = "http://www.w3.org/2000/svg";
  const sky = document.getElementById("sky");
  const ledger = document.getElementById("ledger");
  const clock = document.getElementById("clock");
  const card = document.getElementById("card");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TILT = -16 * Math.PI / 180;

  const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

  const orbitsG = el("g", { class: "orbits" }, sky);
  const backG = el("g", {}, sky);
  const coreG = el("g", { class: "core" }, sky);
  const frontG = el("g", {}, sky);
  const coreHalo = el("circle", { class: "halo" }, coreG);
  const core = el("circle", { class: "sun" }, coreG);
  const coreText = el("text", { class: "sun-label", "text-anchor": "middle", "dominant-baseline": "central" }, coreG);
  coreText.textContent = items.length ? String(items.length) : "0";

  let cx, cy, R0, gap, sx;
  const bodies = items.map((it, i) => {
    const h = hash(it.name + i);
    const g = el("g", { class: "body" }, frontG);
    const ring = el("ellipse", { class: "ring" }, orbitsG);
    const trail = el("path", { class: "trail" }, g);
    const dot = el("circle", { class: "dot" }, g);
    const label = el("text", { class: "label" }, g);
    label.textContent = it.name.toLowerCase();
    const b = { it, i, g, ring, trail, dot, label, a: h * Math.PI * 2, size: 5 + h * 9, dir: h > 0.86 ? -1 : 1, front: true };
    g.addEventListener("pointerenter", () => focusBody(b, true));
    g.addEventListener("pointerleave", () => focusBody(null, true));
    g.addEventListener("click", () => open(b));
    return b;
  });

  bodies.forEach(b => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span class="n"></span><span class="k"></span>`;
    btn.querySelector(".n").textContent = b.it.name;
    btn.querySelector(".k").textContent = [b.it.kind, b.it.year].filter(Boolean).join(", ");
    btn.addEventListener("mouseenter", () => focusBody(b, true));
    btn.addEventListener("mouseleave", () => focusBody(null, true));
    btn.addEventListener("focus", () => focusBody(b, true));
    btn.addEventListener("blur", () => focusBody(null, true));
    btn.addEventListener("click", () => open(b));
    li.appendChild(btn); ledger.appendChild(li);
    b.btn = btn;
  });

  function layout() {
    const W = innerWidth, H = sky.clientHeight || innerHeight;
    sky.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const narrow = W < 760;
    cx = narrow ? W / 2 : W * 0.6;
    cy = H * (narrow ? 0.5 : 0.52);
    const maxR = narrow ? W * 0.46 : Math.min(W * 0.38, H * 0.95);
    sx = 1;
    R0 = Math.max(70, maxR * 0.3);
    gap = bodies.length > 1 ? (maxR - R0) / (bodies.length - 1) : 0;
    core.setAttribute("cx", cx); core.setAttribute("cy", cy); core.setAttribute("r", Math.max(16, R0 * 0.24));
    coreHalo.setAttribute("cx", cx); coreHalo.setAttribute("cy", cy); coreHalo.setAttribute("r", Math.max(16, R0 * 0.24) * 1.9);
    coreText.setAttribute("x", cx); coreText.setAttribute("y", cy);
    bodies.forEach(b => {
      b.rx = R0 + gap * b.i;
      b.ry = b.rx * (narrow ? 0.56 : 0.38);
      b.ring.setAttribute("cx", cx); b.ring.setAttribute("cy", cy);
      b.ring.setAttribute("rx", b.rx); b.ring.setAttribute("ry", b.ry);
      b.ring.setAttribute("transform", `rotate(${TILT * 180 / Math.PI} ${cx} ${cy})`);
      b.omega = 0.9 * Math.pow(R0 / b.rx, 1.5) * b.dir;
    });
  }

  function pos(b, a) {
    const x = b.rx * Math.cos(a), y = b.ry * Math.sin(a);
    return [cx + x * Math.cos(TILT) - y * Math.sin(TILT), cy + x * Math.sin(TILT) + y * Math.cos(TILT), Math.sin(a)];
  }

  let speed = 1, live = 1, target = 1, focused = null, selected = null, last = performance.now();

  function focusBody(b) {
    focused = b;
    bodies.forEach(o => {
      const on = b && o === b;
      o.g.classList.toggle("on", on);
      o.ring.classList.toggle("on", on);
      o.btn.classList.toggle("on", on);
    });
    sky.classList.toggle("focusing", !!b);
  }

  function open(b) {
    selected = b;
    const it = b.it;
    document.getElementById("c-meta").textContent = [it.kind, it.year].filter(Boolean).join(", ");
    document.getElementById("c-name").textContent = it.name;
    document.getElementById("c-note").textContent = it.note || "";
    const link = document.getElementById("c-link");
    if (it.link) { link.href = it.link; link.hidden = false; } else link.hidden = true;
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add("shown"));
  }
  function close() {
    selected = null;
    card.classList.remove("shown");
    setTimeout(() => { if (!selected) card.hidden = true; }, 300);
  }
  document.getElementById("close").addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  addEventListener("wheel", e => {
    if (e.target.closest(".ledger, .card")) return;
    speed = Math.min(12, Math.max(0.05, speed * Math.exp(-e.deltaY * 0.0015)));
    clock.textContent = `time ×${speed < 1 ? speed.toFixed(2) : speed.toFixed(1)}`;
    clock.classList.add("shown");
    clearTimeout(clock._t); clock._t = setTimeout(() => clock.classList.remove("shown"), 1400);
  }, { passive: true });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    target = (focused || selected) ? 0 : speed;
    live += (target - live) * (reduce ? 1 : 0.06);
    const step = reduce ? 0 : live;
    for (const b of bodies) {
      b.a += b.omega * dt * step * 0.5;
      const [x, y, depth] = pos(b, b.a);
      const front = depth > -0.02;
      if (front !== b.front) { (front ? frontG : backG).appendChild(b.g); b.front = front; }
      const s = 0.72 + 0.28 * (depth + 1) / 2;
      b.dot.setAttribute("cx", x); b.dot.setAttribute("cy", y); b.dot.setAttribute("r", b.size * s);
      b.lw = b.label.getComputedTextLength() || b.it.name.length * 8.5;
      const flip = x + b.size * s + 8 + b.lw > innerWidth - 12;
      b.label.setAttribute("text-anchor", flip ? "end" : "start");
      b.label.setAttribute("x", flip ? x - b.size * s - 8 : x + b.size * s + 8);
      b.label.setAttribute("y", y - b.size * s * 0.9);
      b.g.style.opacity = 0.45 + 0.55 * (depth + 1) / 2;
      let d = "";
      for (let k = 0; k <= 14; k++) {
        const [tx, ty] = pos(b, b.a - b.dir * k * 0.045 * Math.min(2.5, 0.4 + Math.abs(live)));
        d += (k ? "L" : "M") + tx.toFixed(1) + " " + ty.toFixed(1);
      }
      b.trail.setAttribute("d", d);
    }
    requestAnimationFrame(frame);
  }

  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { bodies.forEach(b => b.lw = 0); layout(); }, 120); });
  layout();
  requestAnimationFrame(frame);
})();
