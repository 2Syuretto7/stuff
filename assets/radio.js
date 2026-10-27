(() => {
  const items = (window.STUFF || []).filter(x => x && x.name);
  const LO = 87.5, HI = 108.0, SPAN = HI - LO;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);
  const cv = $("static"), ctx = cv.getContext("2d");
  const off = document.createElement("canvas"), octx = off.getContext("2d");
  const dial = $("dial"), ticks = $("ticks"), needle = $("needle");
  const signal = $("signal"), hint = $("hint"), freqEl = $("freq"), bars = [...$("bars").children];

  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // Each thing broadcasts on its own frequency, fixed by its name, on an odd tenth like a real station.
  const stations = [];
  items.forEach(it => {
    let f = 88.1 + ((hash(it.name) % 9800) / 9800) * 19.4;
    f = Math.round((f - 0.1) / 0.2) * 0.2 + 0.1;
    let guard = 0;
    while (stations.some(s => Math.abs(s.f - f) < 1.6) && guard++ < 60) { f += 1.6; if (f > 107.9) f = 88.1 + (f - 107.9); }
    stations.push({ it, f: +f.toFixed(1), pitch: 180 + (hash(it.name + "tone") % 220), mask: null });
  });

  // Start somewhere quiet, away from every station.
  let f = LO + Math.random() * SPAN;
  for (let k = 0; k < 200; k++) {
    const c = 88 + Math.random() * 19.5;
    if (stations.every(s => Math.abs(s.f - c) > 2.2)) { f = c; break; }
  }

  // Static is drawn on a coarse grid of cells and scaled up.
  let W, H, CELL, GW, GH, img, px32;
  const R = new Uint8Array(1 << 20);
  for (let i = 0; i < R.length; i++) R[i] = (Math.random() * 256) | 0;
  const LUT = new Uint32Array(256);
  (() => {
    const ink = [29, 26, 22], mid = [148, 141, 130], paper = [244, 240, 232];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const a = t < 0.5 ? ink : mid, b = t < 0.5 ? mid : paper, u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const r = a[0] + (b[0] - a[0]) * u, g = a[1] + (b[1] - a[1]) * u, bl = a[2] + (b[2] - a[2]) * u;
      LUT[i] = (255 << 24) | (bl << 16) | (g << 8) | r;
    }
  })();

  function makeMask(name) {
    const m = document.createElement("canvas"); m.width = GW; m.height = GH;
    const c = m.getContext("2d");
    const maxW = GW * 0.86, top = GH * 0.2, bottom = GH * (W < 640 ? 0.56 : 0.6);
    let size = Math.min(GH * 0.3, GW * 0.3), lines;
    const words = name.split(/\s+/);
    for (; size > 8; size *= 0.92) {
      c.font = `400 ${size}px "Archivo Black", sans-serif`;
      lines = []; let line = "";
      for (const w of words) {
        const tryL = line ? line + " " + w : w;
        if (c.measureText(tryL).width <= maxW || !line) line = tryL; else { lines.push(line); line = w; }
      }
      lines.push(line);
      const tooWide = lines.some(l => c.measureText(l).width > maxW);
      if (!tooWide && lines.length * size * 0.95 <= bottom - top) break;
    }
    c.fillStyle = "#000"; c.textAlign = "center"; c.textBaseline = "middle";
    const lh = size * 0.95, y0 = (top + bottom) / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => c.fillText(l, GW / 2, y0 + i * lh));
    const d = c.getImageData(0, 0, GW, GH).data, mask = new Uint8Array(GW * GH);
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3];
    return mask;
  }

  function setup() {
    W = innerWidth; H = innerHeight;
    CELL = W < 640 ? 3 : 3;
    GW = Math.ceil(W / CELL); GH = Math.ceil(H / CELL);
    cv.width = GW; cv.height = GH;
    off.width = GW; off.height = GH;
    img = ctx.createImageData(GW, GH); px32 = new Uint32Array(img.data.buffer);
    stations.forEach(s => s.mask = makeMask(s.it.name));
    buildTicks();
  }

  function buildTicks() {
    ticks.innerHTML = "";
    for (let k = 0; k <= 205; k++) {
      const v = LO + k * 0.1, x = (k / 205) * 100;
      const i = document.createElement("i");
      const whole = Math.abs(v - Math.round(v)) < 0.01, half = Math.abs(v * 2 - Math.round(v * 2)) < 0.01;
      if (whole) i.className = "whole"; else if (half) i.className = "half";
      i.style.left = x + "%";
      ticks.appendChild(i);
      if (whole && Math.round(v) % 2 === 0) { const b = document.createElement("b"); b.textContent = Math.round(v); b.style.left = x + "%"; ticks.appendChild(b); }
    }
  }

  const clampF = v => Math.min(HI, Math.max(LO, v));
  let lastInput = 0, seekTo = null, frame = 0, wasClear = null, lastNearest = null;
  const touch = () => { lastInput = performance.now(); hint.classList.add("gone"); };

  function nearest() {
    let best = null, d = Infinity;
    for (const s of stations) { const e = Math.abs(s.f - f); if (e < d) { d = e; best = s; } }
    return [best, d];
  }

  function tick() {
    frame++;
    const now = performance.now(), idle = now - lastInput;
    if (seekTo !== null) {
      f += (seekTo - f) * 0.08;
      if (Math.abs(seekTo - f) < 0.004) { f = seekTo; seekTo = null; }
    }
    let [s, d] = nearest();
    // A hand that lets go is caught by the nearest clear signal; otherwise the dial drifts.
    if (seekTo === null && idle > 700 && s && d < 0.35) f += (s.f - f) * 0.05;
    else if (seekTo === null && idle > 9000 && !reduce) f = clampF(f + Math.sin(now / 2700) * 0.004 + Math.sin(now / 1100) * 0.002);
    [s, d] = nearest();
    const x = s ? Math.max(0, 1 - d / 0.9) : 0;
    const lock = x * x * (3 - 2 * x);
    draw(s, lock, now);
    ui(s, lock);
    sound(s, lock);
    if (!reduce || seekTo !== null || frame < 3) requestAnimationFrame(tick); else requestAnimationFrame(() => setTimeout(tick, 120));
  }

  function draw(s, lock, now) {
    const mask = s && lock > 0.02 ? s.mask : null;
    const o = (Math.random() * (R.length - GW * GH)) | 0;
    const roll = ((now / 9) % (GH + 60)) - 30;
    const tear = (1 - lock) * 22;
    const contrast = 1 - lock * 0.4;
    for (let y = 0; y < GH; y++) {
      const shift = mask ? (((R[(o + y * 31) & 0xfffff] - 128) / 128) * tear) | 0 : 0;
      const bandD = Math.abs(y - roll);
      const band = bandD < 26 ? (1 - bandD / 26) * 70 * (1 - lock) : 0;
      const row = y * GW;
      for (let x = 0; x < GW; x++) {
        let v = 150 + (R[o + row + x] - 128) * contrast + band;
        if (mask) {
          let mx = x + shift; mx = mx < 0 ? 0 : mx >= GW ? GW - 1 : mx;
          const m = mask[row + mx];
          if (m) v -= (m / 255) * lock * 210;
        }
        px32[row + x] = LUT[v < 0 ? 0 : v > 255 ? 255 : v | 0];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function ui(s, lock) {
    freqEl.textContent = f.toFixed(1);
    needle.style.left = `calc(10px + (100% - 20px) * ${(f - LO) / SPAN})`;
    dial.setAttribute("aria-valuenow", f.toFixed(1));
    dial.setAttribute("aria-valuetext", `${f.toFixed(1)} megahertz${lock > 0.85 && s ? ", " + s.it.name : ""}`);
    const lit = Math.round(lock * 5);
    bars.forEach((b, i) => b.classList.toggle("on", i < lit));
    const clear = !!(s && lock > 0.85);
    if (clear !== wasClear || (clear && s !== lastNearest)) {
      wasClear = clear; lastNearest = s;
      if (clear) {
        const it = s.it;
        $("s-name").textContent = `${it.name}, on ${s.f.toFixed(1)}`;
        const meta = [it.kind, it.year].filter(Boolean).join(", ");
        $("s-meta").textContent = meta; $("s-meta").hidden = !meta;
        $("s-note").textContent = it.note || ""; $("s-note").hidden = !it.note;
        const a = $("s-link");
        if (it.link) { a.href = it.link; a.hidden = false; } else a.hidden = true;
      }
      signal.classList.toggle("clear", clear);
    }
  }

  // Sound, only if asked for: hiss that gives way to a hum when a station comes in.
  let actx = null, hiss, hum, osc, on = false;
  function sound(s, lock) {
    if (!actx) return;
    const t = actx.currentTime;
    hiss.gain.setTargetAtTime(on ? 0.09 * (1 - lock * 0.92) : 0, t, 0.05);
    hum.gain.setTargetAtTime(on ? 0.05 * lock : 0, t, 0.08);
    if (s) osc.frequency.setTargetAtTime(s.pitch, t, 0.1);
  }
  $("sound").addEventListener("click", e => {
    on = !on;
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.textContent = on ? "Sound on" : "Sound off";
    if (on && !actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
        const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.5;
        hiss = actx.createGain(); hiss.gain.value = 0;
        src.connect(bp).connect(hiss).connect(actx.destination); src.start();
        osc = actx.createOscillator(); osc.type = "triangle"; osc.frequency.value = 220;
        const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 0.35;
        const trem = actx.createGain(); trem.gain.value = 0.65;
        lfo.connect(lg).connect(trem.gain);
        hum = actx.createGain(); hum.gain.value = 0;
        osc.connect(trem).connect(hum).connect(actx.destination); osc.start(); lfo.start();
      } catch (err) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  });

  // Tuning: drag anywhere, drag the dial, scroll, arrow keys, or seek.
  let drag = null;
  cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, f, mode: "free" }; cv.setPointerCapture(e.pointerId); seekTo = null; touch(); });
  const dialSet = e => { const r = dial.getBoundingClientRect(); f = clampF(LO + ((e.clientX - r.left - 10) / (r.width - 20)) * SPAN); };
  dial.addEventListener("pointerdown", e => { drag = { mode: "dial" }; dial.setPointerCapture(e.pointerId); seekTo = null; dialSet(e); touch(); });
  addEventListener("pointermove", e => {
    if (!drag) return;
    touch();
    if (drag.mode === "dial") dialSet(e);
    else f = clampF(drag.f + ((e.clientX - drag.x) / Math.max(320, innerWidth)) * SPAN * 0.6);
  });
  addEventListener("pointerup", () => { drag = null; });
  addEventListener("pointercancel", () => { drag = null; });
  addEventListener("wheel", e => {
    if (e.target.closest(".signal")) return;
    seekTo = null; touch();
    f = clampF(f + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.004);
  }, { passive: true });
  addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target.closest && e.target.closest("a, input, textarea")) return;
    e.preventDefault(); seekTo = null; touch();
    f = clampF(f + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 0.1));
  });
  const seek = dir => {
    if (!stations.length) return;
    touch();
    const sorted = [...stations].sort((a, b) => a.f - b.f);
    const from = seekTo ?? f;
    let next = dir > 0 ? sorted.find(s => s.f > from + 0.05) : [...sorted].reverse().find(s => s.f < from - 0.05);
    if (!next) next = dir > 0 ? sorted[0] : sorted[sorted.length - 1];
    seekTo = next.f;
  };
  $("seek-up").addEventListener("click", () => seek(1));
  $("seek-down").addEventListener("click", () => seek(-1));

  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(setup, 150); });
  const go = () => { setup(); requestAnimationFrame(tick); };
  (document.fonts ? document.fonts.load('400 80px "Archivo Black"').then(go, go) : go());
})();
