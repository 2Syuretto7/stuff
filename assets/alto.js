(() => {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const wins = [...screen.querySelectorAll(".win")];
  if (!wins.length) return;
  const body = document.body;
  const KEY = body.dataset.key || "alto-windows";
  const newestFirst = body.dataset.order === "desc";
  const GAP = 6, MARGIN = 10;

  let state = { open: null, pos: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); if (s && s.pos) state = s; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  // Tabs behave like buttons when their window is folded away.
  wins.forEach(w => {
    const tab = w.querySelector(".tab");
    tab.setAttribute("tabindex", "0");
    tab.setAttribute("role", "button");
  });

  // The server may say which window belongs in front (a post's own page). Otherwise, the one left open last time, or the first.
  let open = screen.querySelector(".win.front")
    || (state.open && wins.find(w => w.dataset.name === state.open))
    || (newestFirst ? wins[wins.length - 1] : wins[0]);

  const drawerOrder = () => {
    const rest = wins.filter(w => w !== open);
    return newestFirst ? rest.reverse() : rest;
  };

  // Folded windows are packed as rows of tabs along the bottom of the screen, like the edges of cards in a drawer.
  function layout() {
    const sw = screen.clientWidth, sh = screen.clientHeight;
    wins.forEach(w => {
      const isOpen = w === open;
      w.classList.toggle("open", isOpen);
      w.classList.toggle("front", isOpen);
      w.classList.toggle("collapsed", !isOpen);
      const tab = w.querySelector(".tab");
      tab.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) tab.removeAttribute("role"); else tab.setAttribute("role", "button");
      tab.setAttribute("tabindex", isOpen ? "-1" : "0");
    });

    // Pack the folded tabs into rows. If they would fill more than about half the screen, narrow them so more fit on a row.
    const pack = cap => {
      screen.style.setProperty("--tabmax", cap + "px");
      const rows = [];
      let row = [], x = MARGIN;
      for (const w of drawerOrder()) {
        const tw = w.offsetWidth;
        if (row.length && x + tw > sw - MARGIN) { rows.push(row); row = []; x = MARGIN; }
        row.push([w, x]); x += tw + GAP;
      }
      if (row.length) rows.push(row);
      const rowH = (rows[0] && rows[0][0][0].offsetHeight) || 0;
      return { rows, rowH, drawerH: rows.length ? rows.length * (rowH + GAP) + MARGIN : 0 };
    };
    const inner = sw - 2 * MARGIN;
    let packed;
    for (const n of [2, 3, 4, 5]) {
      packed = pack(Math.floor((inner - (n - 1) * GAP) / n));
      if (packed.drawerH <= sh * 0.5) break;
    }
    const { rows, rowH, drawerH } = packed;
    let y = sh - drawerH + GAP;
    rows.forEach(r => { r.forEach(([w, rx]) => { w.style.left = rx + "px"; w.style.top = y + "px"; w.style.zIndex = 1; }); y += rowH + GAP; });

    // The open window takes the space above the drawer. Long writing scrolls inside it.
    const room = sh - drawerH - MARGIN;
    const bodyEl = open.querySelector(".body") || open.querySelector(".pane");
    if (bodyEl) {
      bodyEl.style.maxHeight = "none";
      const chrome = open.offsetHeight - bodyEl.offsetHeight + 30;
      bodyEl.style.maxHeight = Math.max(80, room - chrome) + "px";
    }
    const p = state.pos[open.dataset.name] || { x: .5, y: 0 };
    const maxX = Math.max(0, sw - open.offsetWidth), maxY = Math.max(0, room - open.offsetHeight - 24);
    open.style.left = Math.round(Math.min(1, Math.max(0, p.x)) * maxX) + "px";
    open.style.top = (2 + Math.round(Math.min(1, Math.max(0, p.y)) * maxY)) + "px";
    open.style.zIndex = 5;
    open.dataset.maxX = maxX; open.dataset.maxY = maxY;
  }

  function show(w) {
    if (w === open) return;
    open = w;
    state.open = w.dataset.name; save();
    layout();
    const tab = w.querySelector(".tab");
    const target = w.querySelector(".pane a, .pane [tabindex]") || tab;
    target.focus({ preventScroll: true });
  }

  wins.forEach(w => {
    const tab = w.querySelector(".tab");
    tab.addEventListener("keydown", e => {
      if (w !== open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(w); }
    });
    tab.addEventListener("pointerdown", e => {
      if (e.button > 0) return;
      e.preventDefault();
      if (w !== open) { show(w); return; }
      // The open window can be moved by its tab.
      tab.setPointerCapture(e.pointerId);
      const r = w.getBoundingClientRect(), sr = screen.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = ev => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        if (!dragging) { dragging = true; w.classList.add("dragging"); }
        const maxX = Math.max(1, +w.dataset.maxX), maxY = Math.max(1, +w.dataset.maxY);
        const x = Math.min(maxX, Math.max(0, ev.clientX - sr.left - ox)), y = Math.min(maxY, Math.max(0, ev.clientY - sr.top - oy));
        w.style.left = x + "px"; w.style.top = y + "px";
        state.pos[w.dataset.name] = { x: x / maxX, y: y / maxY };
      };
      const up = () => {
        w.classList.remove("dragging");
        tab.removeEventListener("pointermove", move);
        tab.removeEventListener("pointerup", up);
        tab.removeEventListener("pointercancel", up);
        if (dragging) save();
      };
      tab.addEventListener("pointermove", move);
      tab.addEventListener("pointerup", up);
      tab.addEventListener("pointercancel", up);
    });
  });

  layout();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 80); });
  if (document.fonts) document.fonts.ready.then(layout);
})();
