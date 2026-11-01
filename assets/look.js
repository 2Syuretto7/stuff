(() => {
  const items = (window.STUFF || []).filter(x => x && x.name);
  if (!items.length) return;
  const $ = id => document.getElementById(id);
  const body = document.body, root = document.documentElement;
  const name = $("name"), link = $("link"), meta = $("meta"), note = $("note"), ask = $("ask");

  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // A new order every visit.
  const order = items.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  let k = 0, current = null, since = 0, raf = 0, holding = false, swallow = false;

  const fit = () => {
    const maxH = innerHeight * (body.classList.contains("after") ? 0.7 : 0.5);
    let size = Math.min(innerWidth * 0.24, innerHeight * 0.4, 360);
    name.style.fontSize = size + "px";
    while ((name.scrollHeight > maxH || name.scrollWidth > name.clientWidth + 1) && size > 24) { size *= 0.94; name.style.fontSize = size + "px"; }
  };

  // While you look, the colour slowly drains, the way your eyes tire of it.
  const adapt = () => {
    const t = (performance.now() - since) / 1000;
    root.style.setProperty("--sat", Math.max(38, 92 - t * 9) + "%");
    raf = requestAnimationFrame(adapt);
  };

  const look = () => {
    if (holding) return;
    holding = true;
    swallow = true;
    current = order[k++ % order.length];
    root.style.setProperty("--h", hash(current.name) % 360);
    root.style.setProperty("--sat", "92%");
    link.textContent = current.name;
    if (current.link) link.href = current.link; else link.removeAttribute("href");
    meta.textContent = [current.kind, current.year].filter(Boolean).join(", ");
    note.textContent = current.note || "";
    body.classList.remove("after");
    void name.offsetWidth;
    body.classList.add("looking");
    ask.textContent = "Let go.";
    fit();
    since = performance.now();
    cancelAnimationFrame(raf); adapt();
  };

  // Let go: an afterimage in the opposite colour. The longer you looked, the longer it stays.
  const release = () => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(raf);
    const held = (performance.now() - since) / 1000;
    root.style.setProperty("--fade", Math.min(12, Math.max(2.5, 1.5 + held * 1.4)) + "s");
    body.classList.remove("looking");
    body.classList.add("after");
    fit();
    ask.textContent = current.link ? "Touch the afterimage to go there, or hold to look again." : "Hold to look again.";
  };

  name.addEventListener("animationend", () => { body.classList.remove("after"); ask.textContent = "Hold to look."; });

  addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    if (body.classList.contains("after") && e.target.closest("a[href]")) { swallow = false; return; }
    e.preventDefault();
    look();
  });
  addEventListener("pointerup", release);
  // The click that ends a long look is not a request to leave.
  addEventListener("click", e => { if (swallow && e.target.closest("a")) e.preventDefault(); swallow = false; }, true);
  addEventListener("pointercancel", release);
  addEventListener("blur", release);
  addEventListener("contextmenu", e => e.preventDefault());
  addEventListener("keydown", e => {
    if (e.key === " " && !e.repeat) { e.preventDefault(); look(); }
  });
  addEventListener("keyup", e => { if (e.key === " ") { e.preventDefault(); release(); } });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(fit, 100); });
})();
