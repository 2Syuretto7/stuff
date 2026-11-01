(() => {
  const screen = document.getElementById("screen");
  const wins = [...screen.querySelectorAll(".win")];
  if (!wins.length) return;
  const KEY = "alto-windows";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  const save = () => {
    const o = {};
    wins.forEach(w => { o[w.dataset.name] = { x: +w.dataset.x, y: +w.dataset.y, z: +w.style.zIndex || 0 }; });
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  };
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // Place windows as fractions of the screen, so they stay put when the screen changes size.
  const place = w => {
    const sw = screen.clientWidth, sh = screen.clientHeight;
    const maxX = Math.max(0, sw - w.offsetWidth), maxY = Math.max(0, sh - w.offsetHeight - 24);
    w.style.left = Math.round(Math.min(1, Math.max(0, +w.dataset.x)) * maxX) + "px";
    w.style.top = Math.round(Math.min(1, Math.max(0, +w.dataset.y)) * maxY) + "px";
  };
  let z = 0;
  wins.forEach((w, i) => {
    const s = saved[w.dataset.name], h = hash(w.dataset.name);
    const n = Math.max(1, wins.length - 1);
    w.dataset.x = s ? s.x : (i / n) * .85 + ((h % 100) / 100 - .5) * .12;
    w.dataset.y = s ? s.y : (i / n) * .92 + (((h >> 8) % 100) / 100 - .5) * .06;
    w.style.zIndex = s ? s.z : i + 1;
    z = Math.max(z, +w.style.zIndex);
  });
  const front = w => {
    w.style.zIndex = ++z;
    wins.forEach(o => o.classList.toggle("front", o === w));
  };
  const layout = () => wins.forEach(place);
  layout();
  front(wins.reduce((a, b) => (+a.style.zIndex > +b.style.zIndex ? a : b)));

  wins.forEach(w => {
    w.addEventListener("pointerdown", () => { front(w); save(); });
    w.addEventListener("focusin", () => front(w));
    const tab = w.querySelector(".tab");
    tab.addEventListener("pointerdown", e => {
      if (e.button > 0) return;
      e.preventDefault();
      tab.setPointerCapture(e.pointerId);
      const link = e.target.closest("a[href]");
      const r = w.getBoundingClientRect(), sr = screen.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = ev => {
        // A tab that only gets pressed is a link; a tab that moves is a handle.
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        if (!dragging) { dragging = true; w.classList.add("dragging"); }
        const maxX = Math.max(1, sr.width - w.offsetWidth), maxY = Math.max(1, sr.height - w.offsetHeight - 24);
        const x = Math.min(maxX, Math.max(0, ev.clientX - sr.left - ox)), y = Math.min(maxY, Math.max(0, ev.clientY - sr.top - oy));
        w.style.left = x + "px"; w.style.top = y + "px";
        w.dataset.x = x / maxX; w.dataset.y = y / maxY;
      };
      const up = ev => {
        w.classList.remove("dragging");
        tab.removeEventListener("pointermove", move);
        tab.removeEventListener("pointerup", up);
        tab.removeEventListener("pointercancel", up);
        save();
        if (!dragging && link && ev.type === "pointerup") location.href = link.href;
      };
      tab.addEventListener("pointermove", move);
      tab.addEventListener("pointerup", up);
      tab.addEventListener("pointercancel", up);
    });
    // Mouse clicks are handled above; keyboard activation of a tab link still works on its own.
    tab.addEventListener("click", e => { if (e.detail > 0) e.preventDefault(); });
  });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 80); });
  if (document.fonts) document.fonts.ready.then(layout);
})();
