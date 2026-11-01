(() => {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const wins = [...screen.querySelectorAll(".win")];
  if (!wins.length) return;
  const body = document.body;
  const KEY = body.dataset.key || "alto-windows";
  const newestFirst = body.dataset.order === "desc";
  const startFromPage = body.dataset.start === "page";
  const GAP = 6, MARGIN = 10, STEP_X = 22, STEP_Y = 26;
  const byName = n => wins.find(w => w.dataset.name === n);

  let state = { open: [], pos: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); if (s && s.pos) state = { open: Array.isArray(s.open) ? s.open : [], pos: s.pos }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: open.map(w => w.dataset.name), pos: state.pos })); } catch (e) {} };

  // Which windows start open. A page that names a window (a post's own address) opens just that one.
  const named = screen.querySelector(".win.front");
  let open;
  if (startFromPage) open = [named || (newestFirst ? wins[wins.length - 1] : wins[0])];
  else {
    open = state.open.map(byName).filter(Boolean);
    if (!open.length) open = [named || (newestFirst ? wins[wins.length - 1] : wins[0])];
  }

  // Every tab gets a close box, which folds its window down into the drawer.
  wins.forEach(w => {
    const tab = w.querySelector(".tab");
    const label = document.createElement("span");
    label.className = "label";
    while (tab.firstChild) label.appendChild(tab.firstChild);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute("aria-label", "Fold away " + label.textContent.trim());
    tab.append(close, label);
    close.addEventListener("pointerdown", e => e.stopPropagation());
    close.addEventListener("click", e => { e.stopPropagation(); fold(w); });
  });

  const drawerOrder = () => {
    const rest = wins.filter(w => !open.includes(w));
    return newestFirst ? rest.reverse() : rest;
  };

  function layout() {
    const sw = screen.clientWidth, sh = screen.clientHeight;
    const front = open[open.length - 1];
    wins.forEach(w => {
      const isOpen = open.includes(w);
      w.classList.toggle("open", isOpen);
      w.classList.toggle("collapsed", !isOpen);
      w.classList.toggle("front", w === front);
      const tab = w.querySelector(".tab");
      tab.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) { tab.removeAttribute("role"); tab.removeAttribute("tabindex"); }
      else { tab.setAttribute("role", "button"); tab.setAttribute("tabindex", "0"); }
    });

    // Folded windows: rows of tabs along the bottom. When crowded, narrower tabs so more fit on a row.
    const pack = cap => {
      screen.style.setProperty("--tabmax", cap + "px");
      const rows = []; let row = [], x = MARGIN;
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
    for (const n of [2, 3, 4, 5]) { packed = pack(Math.floor((inner - (n - 1) * GAP) / n)); if (packed.drawerH <= sh * 0.5) break; }
    let y = sh - packed.drawerH + GAP;
    packed.rows.forEach(r => { r.forEach(([w, rx]) => { w.style.left = rx + "px"; w.style.top = y + "px"; w.style.zIndex = 1; }); y += packed.rowH + GAP; });

    // Open windows share the space above the drawer, stacked with the front one on top.
    const room = sh - packed.drawerH - MARGIN;
    const cascade = Math.min(open.length - 1, 6);
    open.forEach((w, k) => {
      const scroller = w.querySelector(".body") || w.querySelector(".pane");
      scroller.style.maxHeight = "none";
      const chrome = w.offsetHeight - scroller.offsetHeight;
      scroller.style.maxHeight = Math.max(70, room - (parseFloat(getComputedStyle(w).marginTop) || 0) - 10 - chrome - cascade * STEP_Y * 0.6) + "px";
      const lift = parseFloat(getComputedStyle(w).marginTop) || 0;
      const maxX = Math.max(0, sw - w.offsetWidth - 4), maxY = Math.max(0, room - w.offsetHeight - lift - 4);
      let p = state.pos[w.dataset.name];
      if (!p) {
        // Scatter windows across the free space so several open ones each stay readable.
        const i = wins.indexOf(w) % 7;
        p = { x: [0, 1, .5, .12, .88, .3, .7][i], y: [0, .45, .9, .22, .68, 1, .1][i] };
      }
      w.style.left = Math.round(Math.min(1, Math.max(0, p.x)) * maxX) + "px";
      w.style.top = (2 + Math.round(Math.min(1, Math.max(0, p.y)) * maxY)) + "px";
      w.style.zIndex = 10 + k;
      w.dataset.maxX = maxX; w.dataset.maxY = maxY;
    });
  }

  function raise(w) {
    if (open[open.length - 1] === w) return;
    open = open.filter(o => o !== w).concat(w);
    open.forEach((o, k) => { o.style.zIndex = 10 + k; o.classList.toggle("front", o === w); });
    save();
  }
  // A document not carried by this page is fetched from its own page the first time it is opened.
  function fill(w) {
    const b = w.querySelector(".body[data-src]");
    if (!b || b.dataset.loaded) return;
    b.dataset.loaded = "1";
    fetch(b.dataset.src).then(r => r.text()).then(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const src = doc.querySelector(".win.front .body");
      if (!src) return;
      b.innerHTML = src.innerHTML;
      if (window.renderWriting) renderWriting(b);
      layout();
    }).catch(() => { delete b.dataset.loaded; });
  }
  function unfold(w) {
    open = open.filter(o => o !== w).concat(w);
    fill(w);
    layout(); save();
    (w.querySelector(".pane a") || w.querySelector(".close")).focus({ preventScroll: true });
  }
  function fold(w) {
    open = open.filter(o => o !== w);
    layout(); save();
    w.querySelector(".tab").focus({ preventScroll: true });
  }

  wins.forEach(w => {
    const tab = w.querySelector(".tab");
    w.addEventListener("pointerdown", () => { if (open.includes(w)) raise(w); });
    w.addEventListener("focusin", () => { if (open.includes(w)) raise(w); });
    tab.addEventListener("keydown", e => {
      if (!open.includes(w) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); unfold(w); }
    });
    tab.addEventListener("pointerdown", e => {
      if (e.button > 0) return;
      e.preventDefault();
      if (!open.includes(w)) { unfold(w); return; }
      tab.setPointerCapture(e.pointerId);
      const r = w.getBoundingClientRect(), sr = screen.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = ev => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        if (!dragging) { dragging = true; w.classList.add("dragging"); }
        const maxX = Math.max(1, +w.dataset.maxX), maxY = Math.max(1, +w.dataset.maxY);
        const x = Math.min(maxX, Math.max(0, ev.clientX - sr.left - ox)), y = Math.min(maxY, Math.max(0, ev.clientY - sr.top - oy - 2));
        w.style.left = x + "px"; w.style.top = (2 + y) + "px";
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

  open.forEach(fill);
  layout();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 80); });
  if (document.fonts) document.fonts.ready.then(layout);
})();
