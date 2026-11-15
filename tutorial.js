/* =====================================================================
   TUTORIALS
   1–3 · spotlight coach: dims the screen, cuts a glowing hole around the
         target, points at it with a bobbing arrow and waits for the action
   4–5 · pop-up schools with pixel animations (flight, survey)
   Each tutorial runs once (remembered in this browser); every screen has
   a replay button. Window.Tutorial is the public API.
   ===================================================================== */
(function () {
  "use strict";
  const KEY = "lp_tutorials_v1";
  let store = { seen: {}, off: false };
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && typeof j === "object") store = Object.assign(store, j); } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };
  let disabled = false;
  const seen = (k) => !!store.seen[k];
  const mark = (k) => { store.seen[k] = 1; save(); };
  const $ = (id) => document.getElementById(id);
  const qs = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  // =====================================================================
  // 1. SPOTLIGHT COACH
  // =====================================================================
  let C = null;
  function coach(cfg) {
    if (C) endCoach(false);
    const root = document.createElement("div");
    root.className = "tut-root";
    root.innerHTML = `
      <div class="tut-dim"></div>
      <div class="tut-block"></div><div class="tut-block"></div><div class="tut-block"></div><div class="tut-block"></div>
      <div class="tut-spot"></div>
      <button class="tut-proxy" type="button" aria-label="Select the highlighted target"></button>
      <div class="tut-arrow"><i></i></div>
      <div class="tut-bubble" role="dialog" aria-live="polite">
        <div class="tut-kick"></div>
        <h3></h3>
        <div class="tut-text"></div>
        <div class="tut-do"></div>
        <div class="tut-btns">
          <button class="tut-skip" type="button">Skip tutorial</button>
          <button class="tut-off" type="button" title="Never show tutorials automatically">Turn off all</button>
          <span class="tut-grow"></span>
          <button class="tut-back" type="button" aria-label="Previous step">◂</button>
          <button class="tut-next" type="button">Next ▸</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    C = { cfg, root, i: -1, raf: 0, advancing: false, blocks: root.querySelectorAll(".tut-block"),
      dim: root.querySelector(".tut-dim"), spot: root.querySelector(".tut-spot"), proxy: root.querySelector(".tut-proxy"),
      arrow: root.querySelector(".tut-arrow"), bubble: root.querySelector(".tut-bubble") };
    root.querySelector(".tut-next").addEventListener("click", () => go(C.i + 1));
    root.querySelector(".tut-back").addEventListener("click", () => go(Math.max(0, C.i - 1)));
    root.querySelector(".tut-skip").addEventListener("click", () => endCoach(false));
    root.querySelector(".tut-off").addEventListener("click", () => { store.off = true; save(); endCoach(false); });
    C.proxy.addEventListener("click", () => { const st = C && C.cfg.steps[C.i]; if (st && st.proxy) st.proxy(); });
    go(0);
    C.raf = requestAnimationFrame(loop);
  }
  function go(i) {
    if (!C) return;
    const steps = C.cfg.steps;
    if (i >= steps.length) { endCoach(true); return; }
    const prev = steps[C.i];
    if (prev && prev.onLeave) try { prev.onLeave(); } catch (e) { console.warn(e); }
    C.i = i; C.advancing = false;
    const st = steps[i];
    if (st.onEnter) try { st.onEnter(); } catch (e) { console.warn(e); }
    const b = C.bubble;
    b.querySelector(".tut-kick").textContent = `${C.cfg.name} · STEP ${i + 1} / ${steps.length}`;
    b.querySelector("h3").textContent = st.title || "";
    b.querySelector(".tut-text").innerHTML = typeof st.text === "function" ? st.text() : (st.text || "");
    const doEl = b.querySelector(".tut-do");
    doEl.textContent = st.doText || "";
    doEl.style.display = st.doText ? "" : "none";
    b.querySelector(".tut-next").style.display = st.wait ? "none" : "";
    b.querySelector(".tut-next").textContent = i === steps.length - 1 ? "Done ✓" : "Next ▸";
    b.querySelector(".tut-back").style.display = i === 0 || st.noBack ? "none" : "";
    b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    const t = resolveEl(st);
    if (t && t.scrollIntoView && st.scroll !== false) try { t.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* ignore */ }
  }
  function resolveEl(st) {
    if (!st.target) return null;
    try { const v = st.target(); return v instanceof Element ? v : null; } catch (e) { return null; }
  }
  function resolveRect(st) {
    if (!st.target) return null;
    let v = null;
    try { v = st.target(); } catch (e) { v = null; }
    if (!v) return null;
    if (v instanceof Element) { if (!visible(v)) return null; const r = v.getBoundingClientRect(); return r.width || r.height ? r : null; }
    return v;
  }
  function endCoach(done) {
    if (!C) return;
    const cfg = C.cfg, st = cfg.steps[C.i];
    if (st && st.onLeave) try { st.onLeave(); } catch (e) { /* ignore */ }
    cancelAnimationFrame(C.raf);
    C.root.remove();
    C = null;
    mark(cfg.id);
    if (cfg.onEnd) try { cfg.onEnd(done); } catch (e) { console.warn(e); }
  }
  function place(el, x, y, w, h) { el.style.left = x + "px"; el.style.top = y + "px"; el.style.width = Math.max(0, w) + "px"; el.style.height = Math.max(0, h) + "px"; }
  function loop() {
    if (!C) return;
    const st = C.cfg.steps[C.i];
    if (st.wait && !C.advancing) {
      let ok = false;
      try { ok = st.wait(); } catch (e) { ok = false; }
      if (ok) { C.advancing = true; const at = C.i; setTimeout(() => { if (C && C.i === at) go(at + 1); }, st.waitDelay || 450); }
    }
    const W = innerWidth, H = innerHeight;
    const r = resolveRect(st);
    const bub = C.bubble, bw = bub.offsetWidth, bh = bub.offsetHeight;
    if (!r) {
      C.dim.style.display = "block";
      C.spot.style.display = "none"; C.arrow.style.display = "none"; C.proxy.style.display = "none";
      C.blocks.forEach((b) => (b.style.display = "none"));
      bub.style.left = Math.round((W - bw) / 2) + "px"; bub.style.top = Math.round((H - bh) / 2) + "px";
    } else {
      C.dim.style.display = "none";
      const pad = st.pad == null ? 6 : st.pad;
      const x = clamp(r.left - pad, 2, W - 4), y = clamp(r.top - pad, 2, H - 4);
      const x2 = clamp(r.left + r.width + pad, x + 4, W - 2), y2 = clamp(r.top + r.height + pad, y + 4, H - 2);
      const w = x2 - x, h = y2 - y;
      C.spot.style.display = "block"; place(C.spot, x, y, w, h);
      C.spot.classList.toggle("round", !!st.round);
      const lock = st.lock !== false;
      const bl = C.blocks;
      bl.forEach((b) => (b.style.display = lock ? "block" : "none"));
      if (lock) { place(bl[0], 0, 0, W, y); place(bl[1], 0, y2, W, H - y2); place(bl[2], 0, y, x, h); place(bl[3], x2, y, W - x2, h); }
      if (st.proxy) { C.proxy.style.display = "block"; place(C.proxy, x, y, w, h); } else C.proxy.style.display = "none";
      // bubble on the side with room (preferred order per step)
      const gap = 30, cx = x + w / 2, cy = y + h / 2;
      const sides = st.side || ["bottom", "top", "right", "left"];
      const fits = { bottom: H - y2 - gap >= bh + 8, top: y - gap >= bh + 8, right: W - x2 - gap >= bw + 8, left: x - gap >= bw + 8 };
      const side = sides.find((s) => fits[s]) || (fits.bottom ? "bottom" : fits.top ? "top" : fits.right ? "right" : fits.left ? "left" : "over");
      let bx, by, ax, ay, rot;
      if (side === "bottom") { bx = cx - bw / 2; by = y2 + gap; ax = cx; ay = y2 + 4; rot = 0; }
      else if (side === "top") { bx = cx - bw / 2; by = y - gap - bh; ax = cx; ay = y - 4; rot = 180; }
      else if (side === "right") { bx = x2 + gap; by = cy - bh / 2; ax = x2 + 4; ay = cy; rot = -90; }
      else if (side === "left") { bx = x - gap - bw; by = cy - bh / 2; ax = x - 4; ay = cy; rot = 90; }
      else { bx = W - bw - 16; by = H - bh - 16; ax = null; }
      bub.style.left = Math.round(clamp(bx, 8, W - bw - 8)) + "px";
      bub.style.top = Math.round(clamp(by, 8, H - bh - 8)) + "px";
      if (ax == null) C.arrow.style.display = "none";
      else { C.arrow.style.display = "block"; C.arrow.style.left = Math.round(ax) + "px"; C.arrow.style.top = Math.round(ay) + "px"; C.arrow.style.setProperty("--rot", rot + "deg"); }
    }
    C.raf = requestAnimationFrame(loop);
  }
  // keyboard while a coach is open: Enter/→ next, Esc skip (captured so the game does not react)
  window.addEventListener("keydown", (e) => {
    if (C) {
      const st = C.cfg.steps[C.i];
      if ((e.key === "Enter" || e.key === "ArrowRight") && !st.wait) { e.preventDefault(); e.stopImmediatePropagation(); go(C.i + 1); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); endCoach(false); }
      return;
    }
    if (Wd) {
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopImmediatePropagation(); wPage(Wd.i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); wPage(Wd.i - 1); }
      else if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === "Enter" && Wd.i < Wd.cfg.pages.length - 1) wPage(Wd.i + 1); else closeWidget(); }
      else if (e.key === " " || e.key.length === 1) { e.stopImmediatePropagation(); }
    }
  }, true);

  // =====================================================================
  // 2. POP-UP SCHOOL WIDGET (animated pages)
  // =====================================================================
  let Wd = null;
  function widget(cfg) {
    if (Wd) closeWidget();
    const root = document.createElement("div");
    root.className = "tut-wroot";
    root.innerHTML = `
      <div class="tut-wcard" role="dialog" aria-modal="true">
        <div class="tut-whead">
          <div><div class="tut-kick">${cfg.kicker}</div><h2>${cfg.title}</h2></div>
          <button class="tut-wclose" type="button" aria-label="Close">✕</button>
        </div>
        <div class="tut-wbody">
          <div class="tut-wstage"><canvas width="480" height="270"></canvas></div>
          <div class="tut-wtext"><h3></h3><div class="tut-wcopy"></div></div>
        </div>
        <div class="tut-wfoot">
          <div class="tut-dots"></div>
          <span class="tut-grow"></span>
          <button class="tut-wprev" type="button">◂ Back</button>
          <button class="tut-wnext" type="button">Next ▸</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const cv = root.querySelector("canvas");
    Wd = { cfg, root, cv, g: cv.getContext("2d"), i: 0, t0: performance.now(), raf: 0 };
    Wd.g.imageSmoothingEnabled = false;
    root.querySelector(".tut-dots").innerHTML = cfg.pages.map((p, k) => `<button type="button" data-k="${k}" title="${p.title}"></button>`).join("");
    root.querySelectorAll(".tut-dots button").forEach((b) => b.addEventListener("click", () => wPage(+b.dataset.k)));
    root.querySelector(".tut-wclose").addEventListener("click", closeWidget);
    root.querySelector(".tut-wprev").addEventListener("click", () => wPage(Wd.i - 1));
    root.querySelector(".tut-wnext").addEventListener("click", () => { if (Wd.i >= Wd.cfg.pages.length - 1) closeWidget(); else wPage(Wd.i + 1); });
    root.addEventListener("click", (e) => { if (e.target === root) closeWidget(); });
    if (cfg.onOpen) try { cfg.onOpen(); } catch (e) { /* ignore */ }
    wPage(cfg.start || 0);
    const tick = (now) => {
      if (!Wd) return;
      const p = Wd.cfg.pages[Wd.i];
      try { p.anim(Wd.g, (now - Wd.t0) / 1000, 480, 270); } catch (e) { console.warn(e); }
      Wd.raf = requestAnimationFrame(tick);
    };
    Wd.raf = requestAnimationFrame(tick);
  }
  function wPage(i) {
    if (!Wd) return;
    const n = Wd.cfg.pages.length;
    i = clamp(i, 0, n - 1);
    Wd.i = i; Wd.t0 = performance.now();
    const p = Wd.cfg.pages[i];
    Wd.root.querySelector(".tut-wtext h3").textContent = `${i + 1}. ${p.title}`;
    Wd.root.querySelector(".tut-wcopy").innerHTML = p.html;
    Wd.root.querySelectorAll(".tut-dots button").forEach((b, k) => b.classList.toggle("on", k === i));
    Wd.root.querySelector(".tut-wprev").disabled = i === 0;
    Wd.root.querySelector(".tut-wnext").textContent = i === n - 1 ? "Got it ✓" : "Next ▸";
  }
  function closeWidget() {
    if (!Wd) return;
    const cfg = Wd.cfg;
    cancelAnimationFrame(Wd.raf);
    Wd.root.remove();
    Wd = null;
    mark(cfg.id);
    if (cfg.onClose) try { cfg.onClose(); } catch (e) { /* ignore */ }
  }

  // =====================================================================
  // 3. PIXEL DRAWING HELPERS (for the school animations)
  // =====================================================================
  const PAL = { void: "#0A0E17", panel: "#131A26", panel2: "#1C2536", line: "#2E3B52", text: "#E2E8F0", muted: "#8B9BB4",
    amber: "#F0A030", green: "#3CC46B", red: "#F05A5A", blue: "#6E9BF0", cyan: "#22D3EE", yellow: "#FDE047", lime: "#A3E635", pink: "#E879F9" };
  const STARS = Array.from({ length: 70 }, (_, k) => [(k * 97.13) % 480, (k * 53.71) % 270, k % 3]);
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function txt(g, s, x, y, c, size, align) { g.fillStyle = c; g.font = `${size || 16}px VT323, "IBM Plex Mono", monospace`; g.textAlign = align || "left"; g.fillText(s, Math.round(x), Math.round(y)); }
  function bg(g, W, H, sky) {
    px(g, 0, 0, W, H, sky || PAL.void);
    for (const [x, y, l] of STARS) px(g, x, y, l === 2 ? 2 : 1, l === 2 ? 2 : 1, l ? "#C8D4EA" : "#56637E");
  }
  function key(g, label, x, y, on, w) {
    const ww = w || Math.max(26, label.length * 8 + 14);
    px(g, x, y + 2, ww, 22, "#05070C");
    px(g, x, y, ww, 22, on ? PAL.amber : PAL.panel2);
    g.strokeStyle = on ? PAL.yellow : "#44557A"; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, ww - 2, 20);
    txt(g, label, x + ww / 2, y + 16, on ? PAL.void : PAL.text, 16, "center");
    return ww;
  }
  function circle(g, x, y, r, fill, stroke, lw) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); } }
  function moon(g, x, y, r) {
    circle(g, x, y, r, "#9AA0AA");
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    for (const [dx, dy, cr] of [[-.4, -.3, .22], [.3, .2, .16], [.1, -.5, .1], [-.2, .45, .13], [.5, -.25, .09]]) circle(g, x + dx * r, y + dy * r, cr * r, "#7C828C");
    px(g, x - r, y - r, r * 0.35, 2 * r, "rgba(0,0,0,.25)");
    g.restore();
  }
  function earth(g, x, y, r) {
    circle(g, x, y, r, "#3A86D8");
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    circle(g, x - r * .3, y - r * .2, r * .45, "#45A049"); circle(g, x + r * .4, y + r * .35, r * .3, "#45A049");
    px(g, x - r, y - r, 2 * r, r * .18, "#F4F8FF"); g.restore();
  }
  // rocket standing on (x, yBottom); ang in rad (0 = up)
  function rocket(g, x, y, s, ang, flame, stages) {
    g.save(); g.translate(x, y); g.rotate(ang || 0);
    const w = 10 * s, n = stages == null ? 2 : stages;
    let top = 0;
    if (flame) { const f = (14 + Math.random() * 8) * s * flame; g.fillStyle = "#FDE047"; g.beginPath(); g.moveTo(-w / 2 + 2, 0); g.lineTo(0, f); g.lineTo(w / 2 - 2, 0); g.fill(); g.fillStyle = "#F0A030"; g.beginPath(); g.moveTo(-w / 4, 0); g.lineTo(0, f * .6); g.lineTo(w / 4, 0); g.fill(); }
    for (let k = 0; k < n; k++) { const h = 22 * s; px(g, -w / 2, top - h, w, h, "#E2E8F0"); px(g, -w / 2 + w * .62, top - h, w * .2, h, "#C0562A"); px(g, -w / 2, top - 2, w, 2, "#5A6578"); top -= h; }
    px(g, -w / 2, top - 10 * s, w, 10 * s, "#E2E8F0"); px(g, -w / 2 + 3 * s, top - 7 * s, w * .35, 5 * s, "#D4A017");
    g.fillStyle = "#E2E8F0"; g.beginPath(); g.moveTo(-w / 2, top - 10 * s); g.lineTo(0, top - 20 * s); g.lineTo(w / 2, top - 10 * s); g.fill();
    g.restore();
  }
  // 2D attitude dial; angles screen-clockwise from up
  function dial(g, cx, cy, R, needle, bug, retro) {
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    px(g, cx - R, cy - R, 2 * R, R, "#1E3A8A"); px(g, cx - R, cy, 2 * R, R, "#5B3A1E"); px(g, cx - R, cy - 1, 2 * R, 2, "rgba(226,232,240,.8)");
    g.restore(); circle(g, cx, cy, R, null, "#38BDF8", 2);
    const at = (a, r) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
    if (bug != null) { const [bx, by] = at(bug, R - 6); g.fillStyle = PAL.pink; g.beginPath(); g.moveTo(bx, by - 6); g.lineTo(bx - 5, by + 4); g.lineTo(bx + 5, by + 4); g.fill(); }
    if (retro != null) { const [rx, ry] = at(retro, R - 7); circle(g, rx, ry, 5, null, PAL.amber, 2); g.strokeStyle = PAL.amber; g.beginPath(); g.moveTo(rx - 3, ry - 3); g.lineTo(rx + 3, ry + 3); g.moveTo(rx + 3, ry - 3); g.lineTo(rx - 3, ry + 3); g.stroke(); }
    g.save(); g.translate(cx, cy); g.rotate(needle); px(g, -2, -R + 6, 4, R - 8, PAL.yellow); g.fillStyle = PAL.yellow; g.beginPath(); g.moveTo(0, -R + 2); g.lineTo(-6, -R + 12); g.lineTo(6, -R + 12); g.fill(); g.restore();
  }
  function arrowTo(g, x1, y1, x2, y2, c) {
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 8 * Math.cos(a - .5), y2 - 8 * Math.sin(a - .5)); g.lineTo(x2 - 8 * Math.cos(a + .5), y2 - 8 * Math.sin(a + .5)); g.fill();
  }
  function bar(g, x, y, w, h, frac, c) { px(g, x, y, w, h, PAL.void); g.strokeStyle = PAL.line; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); px(g, x + 3, y + 3, (w - 6) * clamp(frac, 0, 1), h - 6, c); }
  const ease = (p) => p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p);
  const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // =====================================================================
  // 4. TUTORIAL 1 · choose a destination (opening, solar system)
  // =====================================================================
  function startT1() {
    const O = window.Opening; if (!O) return;
    coach({
      id: "t1", name: "TUTORIAL 1 · CHOOSE A DESTINATION",
      onEnd: () => O.setMoonSpeed(1),
      steps: [
        { title: "Welcome, mission specialist!", text: "This is our <b>Solar System</b>. You will plan and fly a real NASA-style science mission, just like <b>Lunar Prospector</b> did in 1998. First, choose where to go." },
        { title: "Look around", text: "<b>Drag</b> to move the view and <b>scroll</b> (or press <b>+ / −</b>) to zoom. Click any planet to read about it.", target: () => $("help"), side: ["right", "top"] },
        { title: "Find the Moon", text: "The little grey world circling the Earth is the <b>Moon</b>, our target. We slowed it down so it is easy to catch.",
          target: () => O.moonRect(), proxy: () => O.selectMoon(), round: true, pad: 4, doText: "👉 Click the Moon", wait: () => O.selected() === "Moon",
          onEnter: () => O.setMoonSpeed(0.12) },
        { title: "Target details", text: "The <b>Details</b> panel shows facts (<b>Info</b>) and a short lesson (<b>Education</b>). Only the Moon is open for missions right now; the other planets say <i>Incoming</i>.", target: () => $("det"), side: ["left", "bottom", "top"] },
        { title: "Continue to the missions", text: "Fly in to the Moon's surface to choose what you will study.", target: () => $("go"), doText: "👉 Click “Continue to Missions”", wait: () => O.section() === 2, side: ["left", "top", "bottom"] }
      ]
    });
  }

  // =====================================================================
  // 5. TUTORIAL 2 · missions on the Moon
  // =====================================================================
  function startT2() {
    const O = window.Opening; if (!O) return;
    coach({
      id: "t2", name: "TUTORIAL 2 · CHOOSE YOUR MISSIONS",
      steps: [
        { title: "Welcome to the Moon", text: "Each square marks a <b>mission area</b>. Hover one to preview it: the poles zoom in on <b>ice</b>, Minerals splits the Moon into <b>layers</b>, Gravity paints the <b>gravity map</b>.", target: () => $("surf"), lock: false, side: ["right", "left", "bottom"] },
        { title: "Mission brief", text: "Hovering an area fills this panel: what the mission does, whether it is <b>ACTIVE</b> (you play it) or <b>PASSIVE</b> (it collects data by itself), and the <b>instrument</b> it needs. <i>Incoming</i> missions are not ready yet.", target: () => $("bf"), side: ["left", "bottom"] },
        { title: "Goals & requirements", text: "<b>Tasks</b> are the missions you picked: your goals. <b>Requirements</b> list the instrument each one needs on your spacecraft. <b>Difficulty</b> rises with every mission you add.", target: () => $("ip"), side: ["left", "bottom"] },
        { title: "Pick Polar Ice", text: "<b>Polar Ice</b> uses the <b>Neutron Spectrometer</b> to hunt for water ice hiding in dark polar craters.", target: () => $("h0"), pad: 12, doText: "👉 Click the Polar Ice square", wait: () => O.getMissions().includes("ice"), side: ["right", "bottom", "left"] },
        { title: "Add more if you like", text: "<b>Minerals</b> (centre) identifies what the surface is made of; <b>Luna Mini Magneto</b> measures magnetism. Click to add, click again to remove. More missions = more science, but a heavier and pricier spacecraft.", target: () => $("hs"), lock: false, side: ["right", "left", "bottom"] },
        { title: "Start the mission", text: "Happy with your list? Press <b>Start Missions</b>.", target: () => $("start"), doText: "👉 Click “Start Missions”", wait: () => O.popupOpen(), side: ["top"] },
        { title: "Choose a flight mode", text: "<b>Cadet</b>: auto-aim keeps your orbit safe while you brake at the Moon. <b>Commander</b>: you steer that burn yourself, for bonus points.", target: () => $("modeRow"), side: ["top", "bottom"] },
        { title: "To the hangar!", text: "Next you design the rocket and spacecraft that carry your instruments.", target: () => $("toHangar"), doText: "👉 Click “Go to the hangar”", wait: () => !O.isActive(), side: ["bottom", "top"] }
      ]
    });
  }

  // =====================================================================
  // 6. TUTORIAL 3 · the hangar (parts, specs, checklist and how they interact)
  // =====================================================================
  const WHY = {
    thrust: "A rocket must push harder than its own weight (<b>thrust-to-weight &gt; 1</b>) or it never leaves the pad. More engines or boosters add thrust, but also mass.",
    fit: "The spacecraft must fit inside the <b>fairing</b>, the nose cover that protects it while the rocket punches through the air.",
    dv: "<b>Δv</b> is the total change of speed the rocket can make (the <b>rocket equation</b>: efficient engines and light stages give more). Reaching the Moon needs about <b>12.6 km/s</b>; less and you never get there.",
    mass: "Spacecraft always get heavier while they are designed, so engineers keep a <b>≥ 35% mass margin</b>: the limit is what the bus can hold or what the rocket can lift, whichever is lower.",
    power: "Solar panels must power every instrument and system <b>and</b> recharge the battery.",
    energy: "Behind the Moon there is no sunlight (an <b>eclipse</b>). The battery must keep everything alive until the Sun comes back.",
    link: "The radio must reach NASA's <b>Deep Space Network</b> with enough signal margin (dB). No link, no science comes home.",
    act: "Thrusters must be strong enough to <b>turn and steady</b> the spacecraft for engine burns and for pointing the instruments.",
    sci: "The instruments you fit must earn enough <b>science points</b>: answering the mission questions is why we fly at all.",
    budget: "Keep at least <b>15% of the money</b> in reserve for surprises. Real missions get cancelled when they overspend."
  };
  const CK_ORDER = ["thrust", "fit", "dv", "mass", "power", "energy", "link", "act", "sci", "budget"];
  const LAMP = { G: '<b class="tut-g">GREEN ✓</b>', Y: '<b class="tut-y">YELLOW (close)</b>', R: '<b class="tut-r">RED ✗</b>' };
  function checks() { const ev = window.HangarAPI && window.HangarAPI.getEval && window.HangarAPI.getEval(); return ev ? ev.checks : []; }
  const checkName = (id) => { try { return window.HangarAPI.t("ck_" + id); } catch (e) { return id; } };
  function startT3() {
    const H = window.HangarAPI; if (!H) return;
    let snap = null, designSnap = "", clickedItem = false;
    const designKey = () => JSON.stringify(window.GameState && window.GameState.design ? { lv: window.GameState.design.lv, sc: window.GameState.design.sc } : {});
    const firstBad = () => qs('#checklist li.fixable[data-ck]') || qs('#checklist li[data-ck="dv"]');
    const onDocClick = (e) => { if (e.target.closest && e.target.closest("#checklist li")) clickedItem = true; };
    const itemSteps = CK_ORDER.map((id, k) => ({
      title: `Checklist ${k + 1}/10 · ${checkName(id)}`,
      text: () => { const c = checks().find((x) => x.id === id); return `${WHY[id]}<div class="tut-now">Right now: ${c ? LAMP[c.status] + " · " + c.value : "—"}</div>`; },
      target: () => qs(`#checklist li[data-ck="${id}"]`), side: ["left", "bottom", "top"], pad: 3
    }));
    coach({
      id: "t3", name: "TUTORIAL 3 · DESIGN YOUR MISSION",
      onEnd: () => document.removeEventListener("click", onDocClick, true),
      steps: [
        { title: "Welcome to the hangar", text: "Here you build the <b>rocket</b> (launch vehicle) and the <b>spacecraft</b>. Every part is a real one, with real mass, power and price. Good engineering is all about <b>trade-offs</b>." },
        { title: "Two parts to design", text: "<b>1 Launch Vehicle</b> gets you off Earth. <b>2 Spacecraft</b> does the science at the Moon. The coloured dot on each tab shows its worst checklist light.", target: () => qs("#phase1 .tabs"), side: ["bottom"], onEnter: () => H.switchTab("lv") },
        { title: "The parts catalogue", text: "Parts are grouped by job: each stage's engine, strap-on boosters, the fairing. On the Spacecraft tab you get the bus, power, radio, thrusters and instruments.", target: () => $("inventory"), side: ["right"] },
        { title: "A part card", text: "Each card shows the part's <b>mass</b>, its key spec (here <b>thrust in kN</b>) and its <b>price</b>. Click a card to fit it; the selected one glows amber. Greyed-out parts don't fit this design.", target: () => qs("#inventory .card"), side: ["right", "bottom"], pad: 4 },
        { title: "Full spec sheet", text: "The <b>i</b> button opens the part's spec sheet: efficiency (<b>Isp</b>), thrust, burn time, mass, cost and where the real part flew.", target: () => qs("#inventory .card .info-btn"), side: ["right", "bottom"], pad: 6 },
        { title: "Live blueprint", text: "The blueprint redraws instantly with every part you choose, labelled by name.", target: () => qs("#phase1 .viewport"), side: ["right", "left"] },
        { title: "Key numbers", text: "<b>Liftoff TWR</b> (thrust ÷ weight), <b>Δv / required</b>, <b>max payload</b>, liftoff mass, dry/propellant mass and cost: the numbers the checklist judges.", target: () => $("stats"), side: ["top", "right"] },
        { title: "Budget", text: "You have <b>$150M</b> for the launcher, the spacecraft and operations. The bar shows how it is split.", target: () => $("budgetBar") && $("budgetBar").parentElement, side: ["bottom"] },
        { title: "The launch checklist", text: "NASA reviews a mission before it may fly (a <b>Key Decision Point</b>). To launch you need <b>≥ 80% green lights and no red</b>. Let's see why each item matters.", target: () => $("checklist"), side: ["left"] },
        ...itemSteps,
        { title: "Your Systems Engineer", text: "The advisor explains every red or yellow light in plain words and suggests a fix.", target: () => $("advisor"), side: ["left", "top"] },
        { title: "See how they connect", text: () => { const b = firstBad(); const id = b && b.dataset.ck; return `Parts and checklist are linked. Click this ${id ? "<b>" + checkName(id) + "</b> " : ""}item: the hangar jumps to the parts that can fix it.`; },
          target: () => firstBad(), side: ["left", "bottom"], pad: 3, doText: "👉 Click the highlighted checklist item", wait: () => clickedItem,
          onEnter: () => { clickedItem = false; document.addEventListener("click", onDocClick, true); } },
        { title: "Now change a part", text: "Pick a <b>different part</b> in the highlighted section (or anywhere) and watch the checklist lights.", target: () => $("inventory"), lock: false, side: ["right"],
          doText: "👉 Click any part card", onEnter: () => { snap = Object.fromEntries(checks().map((c) => [c.id, c])); designSnap = designKey(); },
          wait: () => designKey() !== designSnap, waitDelay: 700 },
        { title: "Everything is connected", text: () => {
            const now = checks(), changed = now.filter((c) => snap && snap[c.id] && (snap[c.id].status !== c.status || snap[c.id].value !== c.value));
            if (!changed.length) return "That part changed no number on the checklist. Try a heavier or more powerful one!";
            return "One part changed <b>" + changed.length + "</b> item" + (changed.length > 1 ? "s" : "") + ":<ul class=\"tut-diff\">" + changed.slice(0, 6).map((c) => {
              const o = snap[c.id];
              return `<li><b>${checkName(c.id)}</b>: ${o.value} → ${c.value}${o.status !== c.status ? ` (${o.status}→${c.status})` : ""}</li>`;
            }).join("") + "</ul>Heavier parts lower thrust-to-weight and Δv; more instruments need more power, a bigger battery and more money. Balance them!";
          }, target: () => $("checklist"), side: ["left"] },
        { title: "Ready for launch", text: "When the gate opens (≥ 80% green, no red), <b>Proceed to Launch</b> lights up and you fly the rocket you built.", target: () => $("launchBtn"), side: ["left", "top"] }
      ]
    });
  }

  // =====================================================================
  // 7. TUTORIAL 4 · FLIGHT SCHOOL (pop-up with animations)
  // =====================================================================
  const FLIGHT_PAGES = [
    { title: "Engine & staging", html: "<p><kbd>SPACE</kbd> switches the engine <b>on / off</b>. Hold <kbd>SHIFT+SPACE</kbd> for a gentle <b>25%</b> burn. When a stage runs dry, press <kbd>G</kbd> to drop it and light the next one.</p><p>Watch the throttle bar on the attitude dial and the stage list in TELEMETRY.</p>",
      anim(g, t, W, H) {
        bg(g, W, H, "#0F1E44"); px(g, 0, H - 30, W, 30, "#1E2A3D");
        const c = t % 8, on = c >= 1.5 && c < 4.5, half = c >= 4.5 && c < 6, stg = c >= 6;
        const lift = on ? (c - 1.5) * 18 : half ? 54 + (c - 4.5) * 8 : stg ? 66 + (c - 6) * 14 : 0;
        if (stg) { const d = (c - 6) * 30; rocket(g, 150, H - 30 - lift + d * 1.2, 1.4, .3 * (c - 6), 0, 1); }
        rocket(g, 150, H - 30 - lift, 1.4, 0, on ? 1 : half ? .45 : stg ? 1 : 0, stg ? 1 : 2);
        key(g, "SPACE", 270, 70, on || stg, 90); txt(g, on || stg ? "ENGINE ON" : "ENGINE OFF", 370, 87, on || stg ? PAL.green : PAL.muted, 18);
        key(g, "SHIFT", 270, 110, half, 56); key(g, "SPACE", 330, 110, half, 70); txt(g, "25%", 408, 127, half ? PAL.amber : PAL.muted, 18);
        key(g, "G", 270, 150, stg && c < 6.6); txt(g, "DROP EMPTY STAGE", 304, 167, stg ? PAL.text : PAL.muted, 18);
        bar(g, 270, 196, 180, 14, on || stg ? 1 : half ? .25 : 0, PAL.amber); txt(g, "THROTTLE", 270, 228, PAL.muted, 16);
      } },
    { title: "Turning the nose", html: "<p><kbd>A</kbd> / <kbd>D</kbd> rotate the nose. <kbd>Q</kbd> turns <b>auto-aim</b> on or off: it turns the nose to the guidance arrow <span class='tut-pink'>▼</span> for you. <kbd>S</kbd> (SAS) stops the spin.</p><p>The dial buttons <b>PRO / RETRO / R-OUT / R-IN</b> make auto-aim hold that direction instead.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const c = t % 9, bug = 0.9;
        let needle;
        if (c < 2) needle = -0.4 * ease(c / 2);
        else if (c < 4) needle = -0.4 + 0.5 * ease((c - 2) / 2);
        else if (c < 6.5) needle = 0.1 + (bug - 0.1) * ease((c - 4) / 2.2);
        else needle = bug;
        dial(g, 120, 140, 82, needle, bug);
        key(g, "A", 250, 60, c < 2); key(g, "D", 284, 60, c >= 2 && c < 4); txt(g, "rotate", 322, 77, PAL.muted, 18);
        key(g, "Q", 250, 100, c >= 4 && c < 6.5); txt(g, "auto-aim → ▼", 284, 117, c >= 4 ? PAL.pink : PAL.muted, 18);
        key(g, "S", 250, 140, c >= 6.5); txt(g, "SAS: hold steady", 284, 157, PAL.muted, 18);
        txt(g, Math.abs(ang(needle - bug)) < 0.05 ? "● ALIGNED" : "TURNING…", 250, 210, Math.abs(ang(needle - bug)) < 0.05 ? PAL.green : PAL.amber, 26);
      } },
    { title: "Camera views", html: "<p><kbd>M</kbd> cycles the views: <b>Rocket</b> (close-up), <b>Flight</b> (follows you), <b>Moon lock</b> and the whole <b>Map</b>. <kbd>+</kbd> / <kbd>−</kbd> zoom, <kbd>B</kbd> switches the reference frame.</p><p><kbd>W</kbd> warps time to just before the next burn; <kbd>0</kbd>–<kbd>6</kbd> pick a warp speed.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const k = Math.floor(t / 1.6) % 4, names = ["ROCKET", "FLIGHT", "MOON LOCK", "MAP"];
        const boxes = [[16, 40], [130, 40], [244, 40], [358, 40]];
        boxes.forEach(([x, y], i) => {
          px(g, x, y, 106, 110, i === k ? "#16223A" : PAL.panel); g.strokeStyle = i === k ? PAL.amber : PAL.line; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 104, 108);
          g.save(); g.beginPath(); g.rect(x + 3, y + 3, 100, 104); g.clip();
          if (i === 0) { px(g, x, y + 80, 106, 30, "#1E2A3D"); rocket(g, x + 53, y + 86, 1, 0, 1, 2); }
          if (i === 1) { earth(g, x + 30, y + 90, 40); g.strokeStyle = PAL.cyan; g.setLineDash([3, 3]); g.beginPath(); g.arc(x + 30, y + 90, 62, -1.4, -0.2); g.stroke(); g.setLineDash([]); px(g, x + 80, y + 50, 4, 4, PAL.yellow); }
          if (i === 2) { moon(g, x + 53, y + 58, 26); circle(g, x + 53, y + 58, 38, null, PAL.green, 1); px(g, x + 53 + 38 * Math.cos(t * 2), y + 58 + 38 * Math.sin(t * 2), 4, 4, PAL.yellow); }
          if (i === 3) { earth(g, x + 20, y + 60, 9); moon(g, x + 88, y + 40, 5); g.strokeStyle = PAL.amber; g.beginPath(); g.moveTo(x + 26, y + 56); g.quadraticCurveTo(x + 60, y + 0, x + 86, y + 44); g.stroke(); }
          g.restore();
          txt(g, names[i], x + 53, y + 132, i === k ? PAL.amber : PAL.muted, 16, "center");
        });
        key(g, "M", 30, 200, (t % 1.6) < 0.35); txt(g, "next view", 62, 217, PAL.muted, 18);
        key(g, "W", 180, 200, false); txt(g, "warp to burn", 212, 217, PAL.muted, 18);
        key(g, "0–6", 340, 200, false, 40); txt(g, "warp", 386, 217, PAL.muted, 18);
      } },
    { title: "Reading your telemetry", html: "<ul><li><b>Velocity</b>: top of the attitude dial (click it for orbit / surface speed).</li><li><b>Angle / heading</b>: the yellow needle is your nose, <span class='tut-pink'>▼</span> is where guidance wants it.</li><li><b>Altitude, AP, PE</b>: the slim bar at the top centre.</li><li><b>Fuel & stage</b>: TELEMETRY column (opens by itself during burns) and STG on the dial.</li></ul>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const k = Math.floor(t / 1.5) % 5;
        // mock HUD
        px(g, 140, 14, 300, 30, PAL.panel); g.strokeStyle = k === 2 ? PAL.amber : PAL.line; g.lineWidth = 2; g.strokeRect(141, 15, 298, 28);
        txt(g, "ALT 000185.4 km · AP 186 · PE 184", 290, 34, PAL.text, 16, "center");
        px(g, 12, 60, 120, 120, PAL.panel); g.strokeStyle = k === 3 ? PAL.amber : PAL.line; g.strokeRect(13, 61, 118, 118);
        txt(g, "TELEMETRY", 20, 78, PAL.blue, 16);
        ["S1", "S2", "S3", "KK"].forEach((s, i) => { txt(g, s, 20, 100 + i * 20, PAL.text, 14); bar(g, 46, 90 + i * 20, 78, 12, [0, .6, 1, 1][i], i === 1 ? PAL.amber : PAL.blue); });
        const dx = 300, dy = 170;
        px(g, dx - 70, dy - 80, 140, 26, PAL.panel); g.strokeStyle = k === 0 ? PAL.amber : PAL.line; g.strokeRect(dx - 69, dy - 79, 138, 24);
        txt(g, "ORBIT 7.79 km/s", dx, dy - 61, PAL.lime, 16, "center");
        dial(g, dx, dy + 20, 52, 0.25 + Math.sin(t) * 0.05, 0.3);
        if (k === 1) circle(g, dx, dy + 20, 56, null, PAL.amber, 3);
        txt(g, "STG 2/5", dx + 66, dy + 40, k === 4 ? PAL.amber : PAL.muted, 16);
        const labels = [["VELOCITY", 160, 75], ["HEADING: needle vs ▼", 16, 250], ["ALTITUDE · AP · PE", 160, 75], ["FUEL per stage", 16, 205], ["STAGE", 380, 250]];
        const [lb, lx, ly] = labels[k];
        txt(g, "▶ " + lb, lx, ly, PAL.amber, 20);
      } },
    { title: "Matching the target trajectory", html: "<p>The <b class='tut-cyan'>dashed cyan line</b> is the path you should fly; the <b class='tut-amber'>orange line</b> is where you are going now.</p><ol><li>Turn the nose to the guidance arrow <span class='tut-pink'>▼</span> (auto-aim does it).</li><li>Burn (<kbd>SPACE</kbd>) and watch the orange line bend onto the cyan one.</li><li>When they match, the engine cuts off automatically.</li></ol>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const c = t % 8, cx = 70, cy = 210;
        earth(g, cx, cy, 46);
        const turn = ease((c - 1) / 1.5), burn = ease((c - 3) / 3);
        const path = (bend, col, dash) => { g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); g.moveTo(cx + 40, cy - 60); g.bezierCurveTo(cx + 120, cy - 150, cx + 240, cy - 190 + bend, cx + 400, cy - 150 + bend * 1.6); g.stroke(); g.setLineDash([]); };
        path(0, PAL.cyan, [6, 5]);
        path(70 * (1 - burn), PAL.amber);
        const sx = cx + 120, sy = cy - 132;
        g.save(); g.translate(sx, sy); g.rotate(-0.2 + 0.9 * turn);
        px(g, -5, -10, 10, 18, PAL.text); g.fillStyle = PAL.text; g.beginPath(); g.moveTo(-5, -10); g.lineTo(0, -18); g.lineTo(5, -10); g.fill();
        if (c > 3 && c < 6) { g.fillStyle = PAL.yellow; g.beginPath(); g.moveTo(-4, 8); g.lineTo(0, 18 + Math.random() * 6); g.lineTo(4, 8); g.fill(); }
        g.restore();
        dial(g, 400, 214, 40, -0.2 + 0.9 * turn, 0.7);
        txt(g, c < 1 ? "OFF TARGET" : c < 3 ? "1 · ALIGN TO ▼" : c < 6 ? "2 · BURN [SPACE]" : "3 · ON TARGET · CUTOFF", 240, 30, c >= 6 ? PAL.green : PAL.amber, 22, "center");
      } },
    { title: "Braking into lunar orbit", html: "<p>You arrive <b>too fast</b> to stay at the Moon. At <b>BRAKE NOW</b> (the burn is centred on your lowest point, the <b>perilune</b>) press <kbd>SPACE</kbd> with the nose <b>retrograde</b> <span class='tut-amber'>⊗</span>, against your motion.</p><p>Your path closes from a fly-by into an orbit, and the engine stops by itself once the high point (<b>AP</b>) is ≤ 150 km. If PE drops below 25 km the engine stops for safety: raise it first.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const c = t % 10, mx = 250, my = 140, R = 52;
        moon(g, mx, my, R);
        const p = ease((c - 3.5) / 3.5);   // 0 fly-by → 1 captured
        const rp = R + 18, ra = rp + 260 * (1 - p) + 14 * p, e = (ra - rp) / (ra + rp), a = (ra + rp) / 2, pp = a * (1 - e * e);
        g.strokeStyle = p > 0.95 ? PAL.green : PAL.amber; g.lineWidth = 2; g.beginPath();
        const span = 3.14 * (0.55 + 0.45 * p);
        for (let k = 0; k <= 80; k++) { const th = -span + (2 * span * k) / 80, r = pp / (1 + e * Math.cos(th)); const x = mx + r * Math.cos(th + Math.PI / 2) * -1, y = my - r * Math.sin(th + Math.PI / 2); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        let th = c < 3.5 ? -1.6 + (c / 3.5) * 1.6 : (c - 3.5) * 1.1;
        const r = pp / (1 + e * Math.cos(th)), sx = mx - r * Math.cos(th + Math.PI / 2), sy = my - r * Math.sin(th + Math.PI / 2);
        px(g, sx - 3, sy - 3, 7, 7, PAL.text);
        const braking = c >= 3.2 && c < 7;
        if (braking) { g.fillStyle = PAL.yellow; g.beginPath(); g.arc(sx, sy, 7 + Math.random() * 3, 0, Math.PI * 2); g.globalAlpha = .55; g.fill(); g.globalAlpha = 1; }
        txt(g, c < 3.2 ? `BRAKE IN 0:0${Math.max(0, Math.ceil(3.2 - c))}` : braking ? "🔥 BRAKING · RETROGRADE ⊗" : "✓ CAPTURED · SCIENCE ORBIT", 20, 30, c < 3.2 ? PAL.amber : braking ? PAL.yellow : PAL.green, 22);
        txt(g, `PE ${Math.round(rp - R + 30)} km`, 20, 240, PAL.text, 18);
        txt(g, `AP ${p > .98 ? 140 : Math.round(ra - R) * 6} km`, 20, 260, p > .98 ? PAL.green : PAL.amber, 18);
        key(g, "SPACE", 380, 230, braking, 80);
      } }
  ];
  const LOI_PAGE = FLIGHT_PAGES.length - 1;
  let gamePausedBefore = null;
  function pauseFlight(on) {
    const sim = window.sim; if (!sim) return;
    if (on) { gamePausedBefore = !!sim.paused; sim.paused = true; }
    else if (gamePausedBefore !== null) { sim.paused = gamePausedBefore; gamePausedBefore = null; }
  }
  function flightSchool(start, manual, id) {
    widget({ id: id || "t4", kicker: "TUTORIAL 4 · FLIGHT SCHOOL", title: "How to fly your rocket", pages: FLIGHT_PAGES, start: start || 0,
      onOpen: () => pauseFlight(true), onClose: () => pauseFlight(false) });
  }

  // =====================================================================
  // 8. TUTORIAL 5 · SURVEY SCHOOL
  // =====================================================================
  const SURVEY_PAGES = [
    { title: "The survey rules", html: "<p>You fly <b>one full orbit</b> of the Moon. The <b>progress bar</b> shows how far round you are, with the two poles marked. Points come from science you confirm; mistakes cost points.</p><p>Altitude matters: <b class='tut-green'>30–150 km</b> full data, <b class='tut-amber'>150–350 km</b> partial, <b class='tut-red'>&lt; 25 km</b> crash risk.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const p = (t % 7) / 7;
        txt(g, "ORBIT PROGRESS", 40, 50, PAL.muted, 18); txt(g, Math.round(p * 100) + "%", 440, 50, PAL.text, 18, "right");
        bar(g, 40, 58, 400, 20, p, PAL.blue);
        for (const [f, l] of [[0.25, "N"], [0.75, "S"]]) { px(g, 40 + 400 * f, 54, 3, 28, PAL.cyan); txt(g, l, 40 + 400 * f, 98, PAL.cyan, 16, "center"); }
        for (const f of [0.38, 0.5, 0.6, 0.86, 0.95]) px(g, 40 + 400 * f, 82, 10, 4, "#E8D27A");
        txt(g, "SCIENCE POINTS " + Math.round(p * 95), 40, 140, PAL.green, 24);
        [["30–150 km", "FULL DATA", PAL.green], ["150–350 km", "PARTIAL", PAL.amber], ["< 25 km", "CRASH RISK", PAL.red]].forEach(([a, b, c], i) => {
          px(g, 40 + i * 136, 170, 126, 60, PAL.panel); px(g, 40 + i * 136, 170, 126, 5, c); txt(g, a, 50 + i * 136, 198, PAL.text, 18); txt(g, b, 50 + i * 136, 220, c, 16);
        });
      } },
    { title: "The minimap", html: "<p>The <b>Lunar Orbit</b> map shows your path round the Moon (altitude stretched ×4). <span class='tut-blue'>Blue arcs</span> are the <b>polar zones</b>, <span class='tut-yellow'>yellow arcs</span> the <b>mineral regions</b>. Your trail is coloured by data quality.</p><p>The tag says <b>NEAR SIDE</b> (Earth can hear you) or <b>FAR SIDE</b> (no radio contact). The thin line points to Earth.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const cx = 170, cy = 140, R = 62;
        moon(g, cx, cy, R);
        g.lineWidth = 5;
        for (const c of [90, -90]) { g.strokeStyle = PAL.blue; g.beginPath(); g.arc(cx, cy, R + 4, (-(c + 20)) * Math.PI / 180, (-(c - 20)) * Math.PI / 180); g.stroke(); }
        for (const c of [10, 40, 160, 200, 230]) { g.strokeStyle = "#E8D27A"; g.beginPath(); g.arc(cx, cy, R + 4, (-(c + 10)) * Math.PI / 180, (-(c - 10)) * Math.PI / 180); g.stroke(); }
        const a = (t * 0.8) % (Math.PI * 2);
        g.lineWidth = 2;
        for (let k = 0; k < 60; k++) { const b = a - k * 0.05, rr = R + 26 + 10 * Math.sin(b * 2); g.strokeStyle = rr > R + 32 ? PAL.amber : PAL.green; const x = cx + rr * Math.cos(b), y = cy - rr * Math.sin(b); px(g, x - 1, y - 1, 2, 2, g.strokeStyle); }
        const rr = R + 26 + 10 * Math.sin(a * 2);
        px(g, cx + rr * Math.cos(a) - 3, cy - rr * Math.sin(a) - 3, 7, 7, PAL.text);
        const near = Math.cos(a) < 0.2;
        arrowTo(g, cx - 90, cy, cx - 130, cy, PAL.blue); txt(g, "EARTH", cx - 156, cy + 4, PAL.blue, 16);
        px(g, 300, 40, 150, 26, near ? "rgba(60,196,107,.15)" : "rgba(240,90,90,.15)");
        txt(g, near ? "NEAR SIDE" : "FAR SIDE", 375, 59, near ? PAL.green : PAL.red, 20, "center");
        txt(g, "■ polar zone", 300, 110, PAL.blue, 18); txt(g, "■ mineral region", 300, 134, "#E8D27A", 18);
        txt(g, "■ full data", 300, 158, PAL.green, 18); txt(g, "■ partial data", 300, 182, PAL.amber, 18);
      } },
    { title: "Mini-game 1 · Polar water ice", html: "<p>The <b>neutron spectrometer</b> counts neutrons from the surface. Hydrogen (water ice) slows them down, so the count <b>dips</b> over icy polar craters.</p><p>When the line drops <b>below the ice threshold</b>, hold <kbd>SPACE</kbd> until confidence reaches <b>100%</b>. Do it at <b>both poles</b>. Capturing outside a dip wastes storage and costs points.</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const gx = 20, gy = 40, gw = 300, gh = 150, thr = gy + gh * 0.45;
        px(g, gx, gy, gw, gh, PAL.panel); g.strokeStyle = PAL.line; g.lineWidth = 2; g.strokeRect(gx + 1, gy + 1, gw - 2, gh - 2);
        g.setLineDash([4, 4]); g.strokeStyle = PAL.amber; g.beginPath(); g.moveTo(gx, thr); g.lineTo(gx + gw, thr); g.stroke(); g.setLineDash([]);
        txt(g, "ICE THRESHOLD", gx + 6, thr - 4, PAL.amber, 14);
        const c = t % 9, shift = c * 40;
        g.strokeStyle = PAL.green; g.beginPath();
        let inDip = false;
        for (let x = 0; x < gw; x += 2) {
          const s = x + shift, d = Math.exp(-Math.pow((s - 260) / 30, 2)) * 0.62;
          const y = gy + gh * (0.2 + d) + Math.sin(s * 0.7) * 3;
          if (x === 0) g.moveTo(gx + x, y); else g.lineTo(gx + x, y);
          if (x > gw - 6) inDip = y > thr;
        }
        g.stroke();
        const holding = inDip;
        const conf = clamp((c - 4.2) / 2.2, 0, 1);
        key(g, "SPACE", 340, 60, holding, 100); txt(g, holding ? "HOLD!" : "wait…", 340, 104, holding ? PAL.yellow : PAL.muted, 18);
        txt(g, "CONFIDENCE", 340, 140, PAL.muted, 16); bar(g, 340, 146, 120, 16, conf, PAL.green);
        txt(g, conf >= 1 ? "▼ ICE CONFIRMED ✓" : Math.round(conf * 100) + "%", 340, 190, conf >= 1 ? PAL.green : PAL.text, 20);
        txt(g, "NEUTRON SPECTROMETER", gx, gy - 8, PAL.muted, 16);
      } },
    { title: "Mini-game 2 · Mineral spectroscopy", html: "<p>Crossing a <b>mineral region</b>, the gamma-ray spectrometer builds up <b>peaks</b>. At the end of the region the orbit <b>pauses</b> so you can label them.</p><ol><li>Click a peak: it shows its energy, e.g. <b>≈ 1781 ± 20 keV</b>.</li><li>Pick the element whose line is in that window (open the <kbd>H</kbd> handbook).</li><li>Label every peak, then resume.</li></ol>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const gx = 20, gy = 30, gw = 440, gh = 150;
        px(g, gx, gy, gw, gh, PAL.panel); g.strokeStyle = PAL.line; g.lineWidth = 2; g.strokeRect(gx + 1, gy + 1, gw - 2, gh - 2);
        const peaks = [[1014, "Al", "#C9CED6"], [1779, "Si", "#E8D27A"], [2211, "Al", "#C9CED6"]];
        const c = t % 9, grow = ease(c / 2);
        g.strokeStyle = PAL.text; g.beginPath();
        for (let x = 0; x <= gw; x += 2) {
          const e = (x / gw) * 3000; let v = 0.12 + 0.05 * Math.sin(x * 0.9);
          for (const [pe] of peaks) v += 0.7 * grow * Math.exp(-Math.pow((e - pe) / 40, 2));
          const y = gy + gh - v * gh * 0.9; if (x) g.lineTo(gx + x, y); else g.moveTo(gx + x, y);
        }
        g.stroke();
        const sel = Math.floor(clamp((c - 2.5) / 2, 0, 2.99));
        peaks.forEach(([pe, sym, col], i) => {
          const x = gx + (pe / 3000) * gw, done = c > 3.5 + i * 2;
          if (c > 2.5 && i === sel) { g.strokeStyle = PAL.amber; g.strokeRect(x - 16, gy + 10, 32, gh - 20); }
          txt(g, "#" + (i + 1), x, gy + 24, PAL.muted, 16, "center");
          if (done) { px(g, x - 15, gy + 30, 30, 20, col); txt(g, sym, x, gy + 46, PAL.void, 18, "center"); }
        });
        ["Fe", "Ti", "Si", "Al", "Mg"].forEach((s, i) => {
          const hot = c > 2.5 && peaks[sel][1] === s && (c - 2.5) % 2 > 0.9;
          px(g, 40 + i * 84, 210, 70, 34, hot ? PAL.amber : PAL.panel2); g.strokeStyle = hot ? PAL.yellow : PAL.line; g.strokeRect(41 + i * 84, 211, 68, 32);
          txt(g, s, 75 + i * 84, 234, hot ? PAL.void : PAL.text, 22, "center");
        });
        txt(g, c > 2.5 ? `peak #${sel + 1} ≈ ${peaks[sel][0]} ± 20 keV` : "recording…", gx + gw - 8, gy + gh + 18, PAL.amber, 18, "right");
      } },
    { title: "Sending data home", html: "<p>Every capture fills <b>storage</b>. Only on the <b>near side</b> can Earth hear you: press <kbd>T</kbd> to <b>downlink</b> the data through NASA's Deep Space Network. On the far side there is no link.</p><p>If storage fills up, the next near-side pass is <b>forced</b> into downlinking and the <b>gravity map</b> can't record. Downlink early!</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const mx = 280, my = 140; moon(g, mx, my, 50); earth(g, 40, 140, 26); txt(g, "EARTH", 40, 186, PAL.blue, 16, "center");
        const a = (t * 0.9) % (Math.PI * 2), sx = mx + 82 * Math.cos(a), sy = my - 82 * Math.sin(a);
        const near = Math.cos(a) < 0.15;
        circle(g, mx, my, 82, null, "rgba(226,232,240,.2)", 1);
        px(g, sx - 3, sy - 3, 7, 7, PAL.text);
        const store = near ? clamp(1 - ((t * 0.9) % (Math.PI * 2) - 1.4) / 2.6, 0.05, 1) : clamp(((t * 0.9) % (Math.PI * 2) - 4.6) / 3 + 0.3, 0.05, 1);
        if (near) { g.setLineDash([5, 5]); g.strokeStyle = PAL.green; g.beginPath(); g.moveTo(sx, sy); g.lineTo(66, 140); g.stroke(); g.setLineDash([]); }
        txt(g, near ? "NEAR SIDE · LINK ✓" : "FAR SIDE · NO LINK", 470, 30, near ? PAL.green : PAL.red, 20, "right");
        txt(g, "STORAGE", 340, 220, PAL.muted, 16); bar(g, 340, 226, 120, 16, store, store > .8 ? PAL.red : PAL.amber);
        key(g, "T", 300, 224, near);
      } },
    { title: "Orbit trims", html: "<p>The Moon's lumpy gravity (<b>mascons</b>) slowly pulls your orbit down. Use the four <b>trim</b> buttons to fix it: <b>RAISE / LOWER PE</b> (low point) and <b>RAISE / LOWER AP</b> (high point), 20 km each.</p><p>Hover to see a dotted preview and the fuel cost. The burn fires automatically on the <b>opposite side</b> of the orbit. Save fuel for the final impact!</p>",
      anim(g, t, W, H) {
        bg(g, W, H);
        const mx = 200, my = 140, R = 48, c = t % 8, done = c > 5;
        moon(g, mx, my, R);
        const ell = (rp, ra, col, dash, w) => { const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), pp = a * (1 - e * e); g.strokeStyle = col; g.lineWidth = w || 2; g.setLineDash(dash || []); g.beginPath(); for (let k = 0; k <= 90; k++) { const th = (k / 90) * Math.PI * 2, r = pp / (1 + e * Math.cos(th)); const x = mx + r * Math.cos(th), y = my - r * Math.sin(th); if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.setLineDash([]); };
        ell(R + 14, done ? R + 50 : R + 90, done ? PAL.green : PAL.text);
        if (c > 1.5 && !done) ell(R + 14, R + 50, PAL.yellow, [3, 3]);
        const th = (c * 1.2) % (Math.PI * 2), rp = R + 14, ra = done ? R + 50 : R + 90, a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), r = a * (1 - e * e) / (1 + e * Math.cos(th));
        px(g, mx + r * Math.cos(th) - 3, my - r * Math.sin(th) - 3, 7, 7, PAL.text);
        if (c > 4.6 && c < 5.4) { g.fillStyle = PAL.yellow; g.beginPath(); g.arc(mx + rp, my, 9, 0, Math.PI * 2); g.fill(); }
        key(g, "▲ RAISE PE", 330, 60, false, 120); key(g, "▼ LOWER AP", 330, 96, c > 1.5 && c < 5, 120);
        txt(g, c < 1.5 ? "hover a trim" : c < 4.6 ? "queued: fires at perilune" : done ? "TRIM DONE · −0.4 kg" : "🔥 trim burn", 330, 150, done ? PAL.green : PAL.amber, 18);
      } }
  ];
  function surveySchool(start, manual) {
    let before = null;
    widget({ id: "t5", kicker: "TUTORIAL 5 · SURVEY SCHOOL", title: "Collecting science at the Moon", pages: SURVEY_PAGES, start: start || 0,
      onOpen: () => { const S = window.Phase3 && window.Phase3._state && window.Phase3._state(); if (S) { before = S.paused; S.paused = true; } },
      onClose: () => { const S = window.Phase3 && window.Phase3._state && window.Phase3._state(); if (S && before !== null) S.paused = before; } });
  }

  // =====================================================================
  // 9. AUTO-START WATCHER + REPLAY BUTTONS
  // =====================================================================
  let phaseSince = { p: null, t: 0 };
  function watch() {
    if (disabled || C || Wd) return;
    const GS = window.GameState || {}, O = window.Opening, now = performance.now();
    if (GS.phase !== phaseSince.p) phaseSince = { p: GS.phase, t: now };
    const settled = now - phaseSince.t > 1300;   // let wipes and pop-ins finish
    const fxBusy = $("launchFx") && !$("launchFx").classList.contains("hidden");
    if (store.off) return;
    if (O && O.isActive() && !O.introOn()) {
      if (O.section() === 1 && !seen("t1")) return startT1();
      if (O.section() === 2 && O.surfReady() && !seen("t2")) return startT2();
      return;
    }
    if (GS.phase === "hangar" && settled && !fxBusy && visible($("phase1")) && !seen("t3")) return startT3();
    if (GS.phase === "flight" && settled && !fxBusy) {
      if (!seen("t4")) return flightSchool(0, false, "t4");
      if (window.sim && window.sim.currentStage === 3 && !seen("t4loi")) return flightSchool(LOI_PAGE, false, "t4loi");
    }
    if (GS.phase === "survey" && settled && !seen("t5")) return surveySchool(0, false);
  }
  setInterval(watch, 400);

  function wireButtons() {
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", (e) => { e.currentTarget.blur(); fn(); }); };
    on("tutReplayOpening", () => { const O = window.Opening; if (!O || O.introOn()) return; if (O.section() === 2) startT2(); else startT1(); });
    on("btnHangarTut", () => startT3());
    on("btnFlightSchool", () => flightSchool(0, true, "t4"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireButtons); else wireButtons();

  window.Tutorial = {
    disable() { disabled = true; if (C) endCoach(false); if (Wd) closeWidget(); },
    enable() { disabled = false; },
    reset() { store = { seen: {}, off: false }; save(); },
    turnOn() { store.off = false; save(); },
    start(n) { ({ 1: startT1, 2: startT2, 3: startT3, 4: () => flightSchool(0, true), 5: () => surveySchool(0, true) })[n](); },
    flightSchool, surveySchool,
    isOpen: () => !!(C || Wd),
    _coachStep: () => (C ? C.i : -1)
  };
})();
