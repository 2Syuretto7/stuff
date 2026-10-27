(() => {
  const items = (window.STUFF || []).filter(x => x && x.name);
  const cv = document.getElementById("culture");
  const ctx = cv.getContext("2d");
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  const layer = document.getElementById("specimens");
  const card = document.getElementById("card");
  const hint = document.getElementById("hint");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Agent behaviour (after Jones, 2010): sense ahead-left, ahead, ahead-right; turn toward the strongest trail.
  const P = { SA: 0.45, RA: 0.45, SO: 12, SPEED: 1.15, DEP: 3.2, DECAY: 0.88, FOOD: 160, DIFF: 0.25, GAIN: 5.5, FR: 3, CAP: 45, SCENT: 9, REACH: 0.07 };
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) if (k in P && !isNaN(+v)) P[k] = +v;
  const { SA, RA, SO, SPEED, DEP, DECAY, FOOD, DIFF, GAIN, FR, CAP, SCENT, REACH } = P;

  let W, H, S, GW, GH, trail, next, scent, img, px32, N, ax, ay, aa, smell = 0;
  let tick = 0, word = new Int32Array(0);
  const HOLD = 90, RELEASE = 150;
  let nodes = [], pointer = { gx: -1, gy: -1, on: false, down: false }, selected = null, hovered = null;

  // Colour ramp: petri teal, through moss, to amber, to bone.
  const LUT = new Uint32Array(1024);
  (() => {
    const stops = [[0, [18, 60, 55]], [0.28, [34, 104, 86]], [0.55, [126, 168, 96]], [0.78, [255, 207, 110]], [1, [255, 246, 224]]];
    for (let i = 0; i < 1024; i++) {
      const t = 1 - Math.exp(-i / 140);
      let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
      const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      const r = c0[0] + (c1[0] - c0[0]) * f, g = c0[1] + (c1[1] - c0[1]) * f, b = c0[2] + (c1[2] - c0[2]) * f;
      LUT[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  })();

  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // Each thing gets a fixed place, decided by its name. Places keep clear of the text in the corners,
  // of the card's corner, and of each other's labels.
  const meas = document.createElement("canvas").getContext("2d");
  function labelBox(x, y, name, W) {
    meas.font = '15px "Familjen Grotesk", system-ui, sans-serif';
    const w = meas.measureText(name).width + 18 + 28;
    const flip = x > W - 220;
    return flip ? [x - w + 9, y - 18, x + 9, y + 18] : [x - 9, y - 18, x - 9 + w, y + 18];
  }
  const hits = (a, b, m) => a[0] < b[2] + m && a[2] + m > b[0] && a[1] < b[3] + m && a[3] + m > b[1];
  function placeNodes() {
    const W = innerWidth, H = innerHeight, narrow = W < 700;
    const keepOut = narrow
      ? [[0, 0, W, 130], [0, H - 120, W, H]]
      : [[0, 0, 360, 140], [0, H - 330, 420, H], [W - 260, H - 90, W, H], [W / 2 - 160, H - 80, W / 2 + 160, H]];
    const placed = [], boxes = [];
    items.forEach((it, i) => {
      const r = rng(hash(it.name) + i * 7919);
      let best = null, bestScore = -Infinity;
      for (let k = 0; k < 400; k++) {
        const fx = narrow ? 0.08 + r() * 0.84 : 0.08 + r() * 0.84;
        const fy = narrow ? 0.18 + r() * 0.66 : 0.14 + r() * 0.72;
        const x = fx * W, y = fy * H;
        const box = labelBox(x, y, it.name, W);
        if (box[0] < 8 || box[2] > W - 8) continue;
        if (keepOut.some(z => hits(box, z, 6))) continue;
        let d = Infinity;
        for (const p of placed) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
        const overlap = boxes.some(b => hits(box, b, 10));
        const score = (overlap ? -1e6 : 0) + Math.min(d, 600) + Math.min(Math.hypot(W / 2 - x, H / 2 - y), 400) * 0.25;
        if (score > bestScore) { bestScore = score; best = { fx, fy, x, y, box }; }
      }
      if (!best) best = { fx: 0.5, fy: 0.5, x: W / 2, y: H / 2, box: labelBox(W / 2, H / 2, it.name, W) };
      placed.push(best); boxes.push(best.box);
    });
    nodes = items.map((it, i) => ({ it, i, fx: placed[i].fx, fy: placed[i].fy, el: null }));
  }

  function buildButtons() {
    layer.innerHTML = "";
    nodes.forEach(n => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "specimen";
      b.innerHTML = `<i aria-hidden="true"></i><span></span>`;
      b.querySelector("span").textContent = n.it.name;
      b.setAttribute("aria-label", `${n.it.name}${n.it.kind ? ", " + n.it.kind : ""}`);
      b.addEventListener("pointerenter", () => { hovered = n; });
      b.addEventListener("pointerleave", () => { if (hovered === n) hovered = null; });
      b.addEventListener("focus", () => { hovered = n; });
      b.addEventListener("blur", () => { if (hovered === n) hovered = null; });
      b.addEventListener("click", e => { e.stopPropagation(); open(n); });
      layer.appendChild(b);
      n.el = b;
    });
    positionButtons();
  }

  function positionButtons() {
    nodes.forEach(n => {
      const x = n.fx * innerWidth, y = n.fy * innerHeight;
      n.el.style.left = x + "px"; n.el.style.top = y + "px";
      n.el.classList.toggle("flip", x > innerWidth - 220);
    });
  }

  function setup() {
    W = innerWidth; H = innerHeight;
    cv.width = W; cv.height = H;
    S = Math.max(2, Math.ceil(W / 640));
    GW = Math.ceil(W / S); GH = Math.ceil(H / S);
    trail = new Float32Array(GW * GH); next = new Float32Array(GW * GH);
    off.width = GW; off.height = GH;
    img = octx.createImageData(GW, GH);
    px32 = new Uint32Array(img.data.buffer);

    // Seed: the word itself. The culture is born as a name and immediately starts to forget it.
    const t = document.createElement("canvas"); t.width = GW; t.height = GH;
    const tc = t.getContext("2d");
    const fs = Math.min(GW * 0.3, GH * 0.42);
    tc.font = `600 ${fs}px "Familjen Grotesk", system-ui, sans-serif`;
    tc.textAlign = "center"; tc.textBaseline = "middle";
    tc.fillText("stuff", GW / 2, GH * 0.5);
    const d = tc.getImageData(0, 0, GW, GH).data;
    const seeds = [];
    tick = 0;
    for (let i = 0; i < GW * GH; i++) if (d[i * 4 + 3] > 120) { seeds.push(i); trail[i] = 60; }
    word = Int32Array.from(seeds);

    N = Math.min(42000, Math.floor(GW * GH * 0.16));
    ax = new Float32Array(N); ay = new Float32Array(N); aa = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (seeds.length && i < N * 0.8) {
        const c = seeds[(Math.random() * seeds.length) | 0];
        ax[i] = (c % GW) + Math.random(); ay[i] = ((c / GW) | 0) + Math.random();
      } else { ax[i] = Math.random() * GW; ay[i] = Math.random() * GH; }
      aa[i] = Math.random() * Math.PI * 2;
    }
    placeNodes();
    buildButtons();
    buildScent();
  }

  const at = (x, y) => {
    const xi = x < 0 ? 0 : x >= GW ? GW - 1 : x | 0;
    const yi = y < 0 ? 0 : y >= GH ? GH - 1 : y | 0;
    const i = yi * GW + xi;
    return trail[i] + scent[i] * smell;
  };

  // A scent that spreads out from every thing. Agents smell it; nobody sees it.
  function buildScent() {
    scent = new Float32Array(GW * GH);
    const len = Math.max(8, Math.min(GW, GH) * REACH), R = Math.ceil(len * 5);
    for (const n of nodes) {
      const cx = n.fx * GW, cy = n.fy * GH;
      for (let y = Math.max(0, (cy - R) | 0); y < Math.min(GH, cy + R); y++)
        for (let x = Math.max(0, (cx - R) | 0); x < Math.min(GW, cx + R); x++) {
          const d = Math.hypot(x - cx, y - cy);
          scent[y * GW + x] += SCENT * Math.exp(-d / len);
        }
    }
  }

  function feed(gx, gy, amount, r) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = gx + dx, y = gy + dy;
      if (x >= 0 && y >= 0 && x < GW && y < GH) trail[y * GW + x] += amount;
    }
  }

  function step() {
    tick++;
    // The name holds its shape for a moment, then lets go.
    if (tick < RELEASE) {
      const k = tick < HOLD ? 14 : 14 * (1 - (tick - HOLD) / (RELEASE - HOLD));
      for (let j = 0; j < word.length; j++) trail[word[j]] += k;
    }
    for (let i = 0; i < N; i++) {
      let x = ax[i], y = ay[i], a = aa[i];
      const f = at(x + Math.cos(a) * SO, y + Math.sin(a) * SO);
      const l = at(x + Math.cos(a - SA) * SO, y + Math.sin(a - SA) * SO);
      const r = at(x + Math.cos(a + SA) * SO, y + Math.sin(a + SA) * SO);
      if (f > l && f > r) { /* hold course */ }
      else if (f < l && f < r) a += (Math.random() < 0.5 ? -RA : RA);
      else if (l < r) a += RA;
      else if (r < l) a -= RA;
      a += (Math.random() - 0.5) * 0.08;
      x += Math.cos(a) * SPEED; y += Math.sin(a) * SPEED;
      if (x < 1 || x >= GW - 1 || y < 1 || y >= GH - 1) {
        x = Math.min(GW - 2, Math.max(1, x)); y = Math.min(GH - 2, Math.max(1, y));
        a = Math.random() * Math.PI * 2;
      }
      ax[i] = x; ay[i] = y; aa[i] = a;
      trail[(y | 0) * GW + (x | 0)] += DEP;
    }

    smell = tick < HOLD ? 0 : Math.min(1, (tick - HOLD) / 120);

    // Food. Things pulse; the one you are looking at pulses hardest. Food arrives after the name has had a moment.
    if (tick > HOLD) for (const n of nodes) {
      const boost = n === hovered || n === selected ? 3.2 : 1;
      const breath = 0.75 + 0.25 * Math.sin(tick * 0.03 + n.i * 1.7);
      feed((n.fx * GW) | 0, (n.fy * GH) | 0, FOOD * boost * breath, FR);
    }
    if (pointer.on) feed(pointer.gx, pointer.gy, pointer.down ? 70 : 6, pointer.down ? 3 : 1);

    // Diffuse (3x3 mean) and decay.
    for (let y = 0; y < GH; y++) {
      const y0 = y > 0 ? y - 1 : 0, y1 = y < GH - 1 ? y + 1 : GH - 1;
      for (let x = 0; x < GW; x++) {
        const x0 = x > 0 ? x - 1 : 0, x1 = x < GW - 1 ? x + 1 : GW - 1;
        const s = trail[y0 * GW + x0] + trail[y0 * GW + x] + trail[y0 * GW + x1]
                + trail[y * GW + x0] + trail[y * GW + x] + trail[y * GW + x1]
                + trail[y1 * GW + x0] + trail[y1 * GW + x] + trail[y1 * GW + x1];
        const c = trail[y * GW + x];
        const v = (c + (s / 9 - c) * DIFF) * DECAY;
        next[y * GW + x] = v > CAP ? CAP : v;
      }
    }
    const t = trail; trail = next; next = t;
  }

  function render() {
    for (let i = 0; i < trail.length; i++) {
      const v = trail[i] * GAIN;
      px32[i] = LUT[v > 1023 ? 1023 : v | 0];
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0, W, H);
  }

  function frame() { step(); render(); requestAnimationFrame(frame); }

  function open(n) {
    selected = n;
    nodes.forEach(o => o.el.classList.toggle("on", o === n));
    const it = n.it;
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
    nodes.forEach(o => o.el.classList.remove("on"));
    card.classList.remove("shown");
    setTimeout(() => { if (!selected) card.hidden = true; }, 250);
  }
  document.getElementById("close").addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  const toGrid = e => { pointer.gx = (e.clientX / S) | 0; pointer.gy = (e.clientY / S) | 0; };
  cv.addEventListener("pointermove", e => { toGrid(e); pointer.on = true; });
  cv.addEventListener("pointerleave", () => { pointer.on = false; pointer.down = false; });
  cv.addEventListener("pointerdown", e => {
    toGrid(e); pointer.on = true; pointer.down = true;
    if (selected) close();
    hint.classList.add("gone");
  });
  addEventListener("pointerup", () => { pointer.down = false; if (matchMedia("(hover: none)").matches) pointer.on = false; });

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (Math.abs(innerWidth - W) < 2 && Math.abs(innerHeight - H) < 80) { positionButtons(); return; }
      setup(); if (reduce) { for (let i = 0; i < 500; i++) step(); render(); }
    }, 200);
  });

  const go = () => {
    setup();
    if (reduce) { for (let i = 0; i < 500; i++) step(); render(); }
    else frame();
  };
  (document.fonts ? document.fonts.load('600 80px "Familjen Grotesk"').then(go, go) : go());
})();
