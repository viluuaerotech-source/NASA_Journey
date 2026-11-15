/**
 * phase3.js — PHASE 3 · LUNAR ORBITAL SURVEY (Option A+)
 *
 * Starts from the exact orbit Phase 2 captured (GameState.orbitHandoff) and keeps propagating it
 * with the real Phase 2 physics (LunarPhysics.rk4Step2D: RK4, Moon/Earth/Sun gravity, mascons).
 * One full orbit around the Moon = 0 → 100 % progression. Science:
 *   • Polar water ice (neutron spectrometer): epithermal-neutron dips ONLY inside the polar zones;
 *     hold CAPTURE over a dip to build confidence. Captures cost storage; wasted ones cost points.
 *   • Minerals (gamma-ray spectrometer): energy peaks build up while crossing each region; at the
 *     region's end the orbit pauses and the player labels every peak with its element (hint ladder),
 *     (rock-type quiz removed: labelling the peaks is the whole task).
 *   • Gravity map (Doppler tracking): only on the near side with Earth in view. A full storage
 *     forces the near-side pass to be spent downlinking, which blocks gravity tracking.
 * Data quality depends on the altitude actually flown (green 30–150 km, amber 150–350 km).
 * When the orbit completes, the final state + fuel go back to Phase 2 Stage 4 (de-orbit & impact).
 *
 *   window.Phase3.start(handoff, onDone)   — called by Phase 2 at orbit capture
 *   window.Phase3.showFinalReport(impact)  — called by Phase 2 after the Stage 4 impact
 */
(function () {
  "use strict";
  const P = window.LunarPhysics;
  const CFG = P.GMAT_CONFIG;
  const DEG = 180 / Math.PI;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------------------
  // 1. Science data (consolidated from the gamma-ray isotope data sheet)
  // ---------------------------------------------------------------------------
  const ELEMENTS = {
    Fe: { name: "Iron", sym: "Fe", isotopes: "⁵⁶Fe, ⁵⁷Fe", lines: ["846.8", "7631.2 & 7645.6"], color: "#E0794A" },
    Ti: { name: "Titanium", sym: "Ti", isotopes: "⁴⁸Ti, ⁴⁹Ti", lines: ["1381.7", "6418.4 & 6760.1"], color: "#8FB3FF" },
    Si: { name: "Silicon", sym: "Si", isotopes: "²⁸Si, ²⁹Si", lines: ["1779.0", "3539.0 & 4933.9"], color: "#E8D27A" },
    Al: { name: "Aluminium", sym: "Al", isotopes: "²⁷Al", lines: ["1014.4 & 2211.1"], color: "#C9CED6" },
    Mg: { name: "Magnesium", sym: "Mg", isotopes: "²⁴Mg", lines: ["1368.6"], color: "#5FD08A" }
  };
  const ROCKS = {
    basalt: { name: "Mare basalt", rule: "High Fe + Ti", color: "#4E5A78" },
    anorthosite: { name: "Highland anorthosite", rule: "High Al, low Fe", color: "#D9DCE3" },
    olivine: { name: "Olivine / pyroxene", rule: "Mg-rich", color: "#6FAF7E" }
  };
  // Regions in the order the spacecraft meets them (difficulty rises along the orbit)
  const REGION_TEMPLATES = [
    { name: "Highland Terrae", terrain: "highland", lines: [["Si", 1779.0]], rock: null },
    { name: "Anorthosite Plateau", terrain: "highland", lines: [["Al", 1014.4], ["Si", 1779.0], ["Al", 2211.1]], rock: "anorthosite" },
    { name: "Low-Ti Mare Basalt", terrain: "mare", lines: [["Fe", 846.8], ["Si", 1779.0], ["Fe", 7638.4]], rock: "basalt" },
    { name: "High-Ti Mare Basalt", terrain: "mare", lines: [["Fe", 846.8], ["Ti", 1381.7], ["Ti", 6418.4], ["Ti", 6760.1], ["Fe", 7638.4]], rock: "basalt", trap: true },
    { name: "Basin Rim (Olivine)", terrain: "mixed", lines: [["Fe", 846.8], ["Al", 1014.4], ["Mg", 1368.6], ["Si", 1779.0], ["Si", 3539.0]], rock: "olivine" }
  ];
  const LINE_LABEL = { 7638.4: "7631–7646" }; // the Fe doublet is one merged peak at this resolution

  // ---------------------------------------------------------------------------
  // 2. Tuning (game-seconds = real seconds × speed; sim-seconds = game-seconds × SIM_PER_GAME)
  // ---------------------------------------------------------------------------
  const T = {
    SIM_PER_GAME: 26,          // one ~2 h lunar orbit ≈ 4.5 min of play at 1×
    MAX_STEP: 5,               // RK4 step (sim s)
    POLE_HALF_DEG: 20,         // polar zone = within 20° of a pole
    REGION_WIDTH_DEG: 24,
    ICE_THRESHOLD: 70,
    CAPTURE_STORAGE: 3.2,      // % storage per game-second while capturing
    CAPTURE_GAIN: 34,          // % confidence per game-second at full quality, inside a dip
    GAMMA_STORAGE: 0.9,        // % storage per game-second while recording a region
    GRAVITY_RATE: 0.95,        // % gravity map per game-second of near-side tracking
    FORCE_DUMP_AT: 95, FORCE_DUMP_UNTIL: 30,
    WASTE_AFTER: 0.8           // game-seconds of capturing outside a dip = one wasted capture
  };
  const DOWNLINK_RATE = { lga: 2.5, lpS: 5, hgaS: 9, hgaKa: 18 }; // % storage per game-second

  // ---------------------------------------------------------------------------
  // 3. State
  // ---------------------------------------------------------------------------
  let S = null;            // survey state
  let onDone = null;
  let built = false;
  let raf = 0;
  const $ = (id) => document.getElementById(id);

  function buildInfo() {
    const b = window.GameState && window.GameState.build;
    const sc = (b && b.sc) || {};
    const ins = sc.instruments || {};
    return {
      hasNS: (ins.ns || 0) > 0,
      hasGRS: (ins.grs || 0) > 0,
      hasDGE: (ins.dge || 0) > 0,
      hasER: (ins.er || 0) > 0,
      telecom: sc.telecom || "lpS",
      sprite: b && b.sprites ? b.sprites.craft : null,
      spritePuff: b && b.sprites ? b.sprites.craftPuff : null,
      busName: (b && b.busName) || "Spacecraft",
      scMassKg: (b && b.scMassKg) || 0,
      designScore: (b && b.designScore) || 0,
      missionId: (b && b.missionId) || "lunar"
    };
  }

  const tierOf = (alt) => (alt >= 30 && alt <= 150 ? "green" : alt >= 25 && alt <= 350 ? "amber" : "red");
  function qualityOf(alt) {
    if (alt < 25) return 1.0;
    if (alt <= 150) return 1.0;
    if (alt <= 350) return 1.0 - 0.65 * (alt - 150) / 200;
    return 0.15;
  }

  function moonRel(st, t) {
    const m = P.getMoonStateAtTime(t);
    const rx = st.rx - m[0], ry = st.ry - m[1];
    return { m, rx, ry, vx: st.vx - m[2], vy: st.vy - m[3], r: Math.hypot(rx, ry), ang: Math.atan2(ry, rx) };
  }
  const wrapDeg = (d) => ((d + 540) % 360) - 180;
  function poleOf(angDeg) {
    if (Math.abs(wrapDeg(angDeg - 90)) <= T.POLE_HALF_DEG) return "north";
    if (Math.abs(wrapDeg(angDeg + 90)) <= T.POLE_HALF_DEG) return "south";
    return null;
  }

  /** Place five region windows in the non-polar parts of the sweep, in encounter order. */
  function planRegions(startDeg, dir) {
    const free = [];
    for (let s = 0; s < 360; s += 1) {
      const a = startDeg + dir * s;
      const nearPole = Math.abs(wrapDeg(a - 90)) <= T.POLE_HALF_DEG + 8 || Math.abs(wrapDeg(a + 90)) <= T.POLE_HALF_DEG + 8;
      free.push(!nearPole && s > 10 && s < 350);
    }
    // contiguous free segments in sweep coordinates
    const segs = [];
    let st = -1;
    for (let s = 0; s <= 360; s++) {
      const f = s < 360 && free.at(s);
      if (f && st < 0) st = s;
      if (!f && st >= 0) { segs.push([st, s - 1]); st = -1; }
    }
    const total = segs.reduce((a, g) => a + (g[1] - g[0]), 0);
    const counts = segs.map((g) => Math.max(0, Math.round((5 * (g[1] - g[0])) / total)));
    let diff = 5 - counts.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0 && i < 20; i++) {
      const k = i % counts.length;
      if (diff > 0) { counts[k]++; diff--; } else if (counts[k] > 0) { counts[k]--; diff++; }
    }
    const centers = [];
    segs.forEach((g, i) => {
      const n = counts.at(i);
      for (let j = 0; j < n; j++) centers.push(g[0] + ((j + 0.5) * (g[1] - g[0])) / n);
    });
    centers.sort((a, b) => a - b);
    return centers.slice(0, 5).map((c, i) => {
      const tpl = REGION_TEMPLATES.at(i);
      return {
        idx: i, ...tpl,
        sweepFrom: c - T.REGION_WIDTH_DEG / 2, sweepTo: c + T.REGION_WIDTH_DEG / 2,
        worldCenterDeg: wrapDeg(startDeg + dir * c),
        counts: 0, qSum: 0, qN: 0, done: false, lost: false, result: null
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 4. DOM
  // ---------------------------------------------------------------------------
  function buildDom() {
    if (built) return;
    built = true;
    const root = document.createElement("div");
    root.id = "phase3";
    root.className = "screen hidden";
    root.innerHTML = `
      <header class="p3-top panel">
        <div class="p3-title">
          <span class="status-led" id="p3Led"></span>
          <canvas id="p3Thumb" width="34" height="34" class="craft-thumb"></canvas>
          <div>
            <div class="p3-kicker mono">PHASE 3 · LUNAR ORBITAL SURVEY</div>
            <h1>ONE ORBIT · POLES &amp; MINERALS</h1>
          </div>
        </div>
        <div class="p3-progress">
          <div class="p3-progress-head mono"><span>ORBIT PROGRESS</span><strong id="p3Pct">0%</strong></div>
          <div class="p3-track"><i id="p3Bar"></i><span class="p3-mark n" title="North pole"></span><span class="p3-mark s" title="South pole"></span></div>
        </div>
        <div class="p3-top-right">
          <span class="mono p3-met" id="p3Met">T+ 00:00:00</span>
          <div class="p3-speed" role="group" aria-label="Speed">
            <button class="hud-btn" data-p3speed="1">1×</button><button class="hud-btn" data-p3speed="2">2×</button><button class="hud-btn" data-p3speed="4">4×</button>
          </div>
          <button id="p3Pause" class="hud-btn">❚❚ PAUSE [P]</button>
          <button id="p3HandbookBtn" class="hud-btn">HANDBOOK [H]</button>
          <button id="p3HelpBtn" class="hud-btn">? HELP</button>
          <button id="p3Retry" class="hud-btn warn-outline" title="Restart the survey from the same orbit">↺ RETRY</button>
        </div>
      </header>

      <aside class="p3-left">
        <section class="panel p3-card p3-minimap-card">
          <div class="p3-card-title mono"><span>LUNAR ORBIT</span><span id="p3SideTag" class="pill">NEAR SIDE</span></div>
          <canvas id="p3Minimap" width="220" height="220"></canvas>
          <div class="p3-legend mono"><span><i class="lg-pole"></i>Polar zone</span><span><i class="lg-reg"></i>Mineral region</span><span><i class="lg-g"></i>30–150 km</span><span><i class="lg-a"></i>150–350</span></div>
        </section>
        <section class="panel p3-card">
          <div class="p3-card-title mono"><span>ALTITUDE</span><span id="p3Tier" class="pill green">GREEN</span></div>
          <div class="p3-alt mono"><strong id="p3Alt">--</strong> km</div>
          <div class="p3-kv mono"><span>Lowest / highest</span><b id="p3PeriApo">-- / --</b></div>
          <div class="p3-kv mono"><span>Data quality</span><b id="p3Q">--</b></div>
          <div class="p3-kv mono"><span>Over</span><b id="p3Over">--</b></div>
        </section>
        <section class="panel p3-card">
          <div class="p3-card-title mono"><span>RESOURCES</span></div>
          <div class="p3-res mono"><span>FUEL</span><div class="p3-bar"><i id="p3FuelBar"></i></div><b id="p3Fuel">--</b></div>
          <div class="p3-res mono"><span>STORAGE</span><div class="p3-bar"><i id="p3StoreBar"></i></div><b id="p3Store">0%</b></div>
          <div class="p3-res mono"><span>GRAVITY</span><div class="p3-bar"><i id="p3GravBar"></i></div><b id="p3Grav">0%</b></div>
          <div class="p3-chips mono"><span id="p3IceN" class="chip">N ICE</span><span id="p3IceS" class="chip">S ICE</span><span id="p3Inst" class="chip">--</span></div>
        </section>
      </aside>

      <section class="p3-view panel">
        <canvas id="p3Scene" width="480" height="240"></canvas>
        <div id="p3Banner" class="p3-banner hidden"></div>
      </section>

      <aside class="p3-right">
        <section class="panel p3-card">
          <div class="p3-card-title mono"><span>CONTROLS</span></div>
          <button id="p3Capture" class="hud-btn p3-big">HOLD [SPACE] · CAPTURE ICE</button>
          <div class="p3-conf"><div class="p3-bar"><i id="p3ConfBar"></i></div><span class="mono" id="p3Conf">confidence --</span></div>
          <button id="p3Downlink" class="hud-btn p3-big">[T] DOWNLINK DATA</button>
          <div class="p3-hint mono" id="p3Hint">--</div>
        </section>
        <section class="panel p3-card">
          <div class="p3-card-title mono"><span title="Station-keeping: small burns that keep the orbit in the data band">ORBIT TRIMS</span><span id="p3OrbitPA" class="mono">PE -- · AP --</span></div>
          <div class="p3-trims">
            <button class="hud-btn p3-trim" data-trim="pe+" title="Fires at the highest point (apolune)">▲ RAISE PE</button>
            <button class="hud-btn p3-trim" data-trim="ap+" title="Fires at the lowest point (perilune)">▲ RAISE AP</button>
            <button class="hud-btn p3-trim" data-trim="pe-" title="Fires at the highest point (apolune)">▼ LOWER PE</button>
            <button class="hud-btn p3-trim" data-trim="ap-" title="Fires at the lowest point (perilune)">▼ LOWER AP</button>
          </div>
          <div class="p3-trim-info mono" id="p3TrimInfo">Hover a trim to preview it. Each changes one side of the orbit by 20 km.</div>
        </section>
        <section class="panel p3-card">
          <div class="p3-card-title mono"><span>SCIENCE POINTS</span><strong id="p3Points" class="mono">0</strong></div>
          <ul class="p3-regions mono" id="p3RegionList"></ul>
        </section>
        <section class="panel p3-card p3-log-card">
          <div class="p3-card-title mono"><span>MISSION LOG</span></div>
          <div class="p3-log mono" id="p3Log"></div>
        </section>
      </aside>

      <section class="p3-graphs">
        <div class="panel p3-graph">
          <div class="p3-card-title mono"><span>NEUTRON SPECTROMETER · POLAR ICE</span><span id="p3Flux" class="mono">-- cps</span></div>
          <canvas id="p3Neutron" width="460" height="120"></canvas>
        </div>
        <div class="panel p3-graph">
          <div class="p3-card-title mono"><span>GAMMA-RAY SPECTROMETER · MINERALS</span><span id="p3GammaTag" class="mono">--</span></div>
          <canvas id="p3Gamma" width="460" height="120"></canvas>
        </div>
      </section>

      <!-- Mineral labelling (auto-pauses the orbit) -->
      <div id="p3Label" class="p3-modal hidden" role="dialog" aria-modal="true">
        <div class="panel p3-modal-card p3-label-card">
          <div class="p3-modal-head">
            <div><div class="p3-kicker mono" id="p3LabelKicker">REGION 1 OF 5 · ORBIT PAUSED</div><h2 id="p3LabelTitle">RAW GAMMA-RAY SPECTRUM</h2></div>
            <button class="hud-btn" id="p3LabelHandbook">HANDBOOK [H]</button>
          </div>
          <p class="p3-modal-sub" id="p3LabelSub">Label every peak with the element that produced it. Pick a peak, then an element.</p>
          <canvas id="p3Spectrum" width="760" height="260"></canvas>
          <div class="p3-peaks" id="p3Peaks"></div>
          <div class="p3-elements" id="p3Elements"></div>
          <div class="p3-label-msg mono" id="p3LabelMsg"></div>
          <div class="p3-modal-actions"><button class="hud-btn green-active" id="p3LabelDone" disabled>RESUME ORBIT</button></div>
        </div>
      </div>

      <!-- Handbook drawer: three tabs -->
      <aside id="p3Handbook" class="p3-handbook panel" aria-hidden="true">
        <div class="p3-modal-head"><h2>SPECTROSCOPY HANDBOOK</h2><button class="hud-btn" id="p3HandbookClose">✕ [H]</button></div>
        <div class="hb-tabs mono" role="tablist">
          <button class="hb-tab on" data-hb="elements">ELEMENTS</button>
          <button class="hb-tab" data-hb="read">READ A PEAK</button>
          <button class="hb-tab" data-hb="inst">INSTRUMENTS</button>
        </div>
        <div class="hb-pane" data-pane="elements">
          <p class="hb-sub">Each element gives off gamma rays at fixed energies (keV). The strip shows where its peaks sit on the 0–8000 keV axis of your spectrum.</p>
          <div class="hb-tiles" id="p3HbTiles"></div>
          <div class="p3-hb-warn">⚠ <b>Mg 1368.6</b> and <b>Ti 1381.7</b> are only <b>13 keV</b> apart, too close to tell apart. A peak near 1375 keV is titanium only if Ti's lines at <b>6418</b> and <b>6760 keV</b> are also in the spectrum.</div>
        </div>
        <div class="hb-pane hidden" data-pane="read">
          <ol class="hb-steps">
            <li><b>Pick a peak.</b> Each numbered peak shows its energy, e.g. <code>≈ 1781 ± 20 keV</code>.</li>
            <li><b>Find the element</b> whose line is inside that ± 20 keV window (Elements tab).</li>
            <li><b>Check partner lines.</b> Iron has 847 <i>and</i> 7631–7646; aluminium has 1014 <i>and</i> 2211. Partners confirm the match.</li>
            <li><b>Watch the trap:</b> 1369 vs 1382 keV (Mg vs Ti). Look for Ti's high lines before choosing Ti.</li>
          </ol>
          <h3 class="mono">ALTITUDE &amp; DATA</h3>
          <div class="hb-bands mono">
            <div class="g"><b>30–150 km</b><span>full data</span></div>
            <div class="a"><b>150–350 km</b><span>weaker, partial points</span></div>
            <div class="r"><b>&lt; 25 km</b><span>crash risk</span></div>
          </div>
        </div>
        <div class="hb-pane hidden" data-pane="inst">
          <div class="hb-inst"><b>NS · Neutron Spectrometer</b><span>Counts neutrons leaking from the surface. Hydrogen (likely water ice) slows them, so the count <b>dips</b> over icy polar craters. Hold <kbd>SPACE</kbd> over a dip.</span></div>
          <div class="hb-inst"><b>GRS · Gamma-Ray Spectrometer</b><span>Records the gamma-ray energies of surface elements. Peaks build up while you cross a region; then you label them.</span></div>
          <div class="hb-inst"><b>DGE · Doppler Gravity Experiment</b><span>Earth tracks the radio signal's Doppler shift on the near side to map the Moon's gravity and reveal mascons.</span></div>
          <div class="hb-inst"><b>MAG/ER · Magnetometer</b><span>Passive: measures the weak crustal magnetic fields automatically.</span></div>
          <div class="hb-inst"><b>Orbit trims</b><span>Change the lowest point (PE) by burning at the highest point, and the highest point (AP) by burning at the lowest point. The game fires them for you.</span></div>
        </div>
      </aside>

      <!-- Briefing -->
      <div id="p3Brief" class="p3-modal hidden">
        <div class="panel p3-modal-card">
          <div class="p3-kicker mono">ORBIT CAPTURED · HANDOFF FROM PHASE 2</div>
          <h2>LUNAR ORBITAL SURVEY</h2>
          <div id="p3BriefBody" class="p3-brief"></div>
          <div class="p3-modal-actions"><button class="hud-btn green-active" id="p3BriefGo">START SURVEY</button></div>
        </div>
      </div>`;
    document.body.appendChild(root); // works whatever scripts the host page adds

    // Handbook content
    // Element tiles: big symbol + name + isotopes + energies + a mini 0–8000 keV strip with the peaks
    $("p3HbTiles").innerHTML = Object.values(ELEMENTS).map((e) => {
      const es = e.lines.join(" ").match(/[0-9]+(?:\.[0-9]+)?/g).map(Number);
      const ticks = es.map((v) => `<i style="left:${(v / 8000) * 100}%;background:${e.color}" title="${v} keV"></i>`).join("");
      return `<div class="hb-tile" style="--el:${e.color}"><div class="hb-sym">${e.sym}</div><div class="hb-body"><b>${e.name}</b><small>${e.isotopes}</small><span class="mono">${e.lines.join(" · ")} keV</span><div class="hb-strip">${ticks}</div></div></div>`;
    }).join("") + `<div class="hb-axis mono"><span>0</span><span>2000</span><span>4000</span><span>6000</span><span>8000 keV</span></div>`;
    document.querySelectorAll("#phase3 .hb-tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll("#phase3 .hb-tab").forEach((x) => x.classList.toggle("on", x === t));
      document.querySelectorAll("#phase3 .hb-pane").forEach((pn) => pn.classList.toggle("hidden", pn.dataset.pane !== t.dataset.hb));
      t.blur();
    }));

    // Controls
    const hold = (id, key) => {
      const b = $(id);
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (S) S.keys[key] = true; });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => { if (S) S.keys[key] = false; }));
    };
    hold("p3Capture", "capture");
    document.querySelectorAll("#phase3 .p3-trim").forEach((b) => {
      b.addEventListener("pointerenter", () => { if (S) { S.trimHover = b.dataset.trim; S.trimInfoDirty = true; } });
      b.addEventListener("pointerleave", () => { if (S) { S.trimHover = null; S.trimInfoDirty = true; } });
      b.addEventListener("click", () => { queueTrim(b.dataset.trim); b.blur(); });
    });
    $("p3Retry").addEventListener("click", (e) => { e.currentTarget.blur(); retrySurvey(); });
    $("p3Downlink").addEventListener("click", (e) => { toggleDownlink(); e.currentTarget.blur(); });
    $("p3Pause").addEventListener("click", (e) => { togglePause(); e.currentTarget.blur(); });
    $("p3HandbookBtn").addEventListener("click", (e) => { toggleHandbook(); e.currentTarget.blur(); });
    $("p3LabelHandbook").addEventListener("click", (e) => { toggleHandbook(true); e.currentTarget.blur(); });
    $("p3HandbookClose").addEventListener("click", () => toggleHandbook(false));
    $("p3HelpBtn").addEventListener("click", (e) => { showBrief(); e.currentTarget.blur(); });
    $("p3BriefGo").addEventListener("click", () => { $("p3Brief").classList.add("hidden"); if (S) S.briefOpen = false; });
    $("p3LabelDone").addEventListener("click", finishLabelling);
    document.querySelectorAll("[data-p3speed]").forEach((b) => b.addEventListener("click", () => { if (S) S.speed = +b.dataset.p3speed; b.blur(); }));

    window.addEventListener("keydown", (e) => {
      if (!S || !window.GameState || window.GameState.phase !== "survey") return;
      const k = e.key.toLowerCase();
      if (k === "h") { toggleHandbook(); e.preventDefault(); return; }
      if (S.labelling) return;
      if (e.code === "Space") { S.keys.capture = true; e.preventDefault(); }
      else if (!e.repeat && k === "t") toggleDownlink();
      else if (!e.repeat && (k === "p" || k === "escape")) {
        if (k === "escape" && $("p3Handbook").classList.contains("open")) { toggleHandbook(false); return; }
        if (k === "escape" && S.briefOpen) { $("p3Brief").classList.add("hidden"); S.briefOpen = false; return; }
        togglePause();
      } else if (k === "1" || k === "2" || k === "3") S.speed = k === "1" ? 1 : k === "2" ? 2 : 4;
    });
    window.addEventListener("keyup", (e) => {
      if (!S) return;
      const k = e.key.toLowerCase();
      if (e.code === "Space") S.keys.capture = false;
    });
    window.addEventListener("blur", () => { if (S) S.keys = { capture: false }; });
  }

  // ---------------------------------------------------------------------------
  // 5. Lifecycle
  // ---------------------------------------------------------------------------
  function start(handoff, done) {
    buildDom();
    onDone = done;
    const info = buildInfo();
    const rel = moonRel(handoff, handoff.t);
    const dir = Math.sign(rel.rx * rel.vy - rel.ry * rel.vx) || 1;
    S = {
      info, handoff, dir,
      st: { rx: handoff.rx, ry: handoff.ry, vx: handoff.vx, vy: handoff.vy },
      t: handoff.t, t0: handoff.t,
      fuelKg: handoff.fuelKg, fuelMaxKg: Math.max(1, handoff.fuelMaxKg || handoff.fuelKg),
      dryKg: handoff.dryKg, ispS: handoff.ispS || 220, thrustN: handoff.thrustN || 100,
      startDeg: rel.ang * DEG, lastDeg: rel.ang * DEG, sweep: 0,
      speed: 1, paused: false, briefOpen: true, labelling: null,
      keys: { capture: false }, trim: null, trimHover: null, trimInfoDirty: true, burnFlashUntil: 0, prevRdotV: null, driftWarned: false, retryArmUntil: 0,
      storage: 0, downlink: false, forcedDump: false, gravity: 0, gravityBlockedPasses: 0, lastNear: null,
      conf: 0, captureOutside: 0, wasted: 0, ice: { north: { state: "pending", conf: 0, bestQ: 0 }, south: { state: "pending", conf: 0, bestQ: 0 } },
      neutron: new Array(240).fill(null), sampleAcc: 0, flux: null,
      points: 0, lines: [], log: [], regions: [], trail: [],
      alt: 0, minAlt: 1e9, maxAlt: 0, q: 1, overPole: null, region: null, burnUsedKg: 0,
      crashed: false, finished: false, banner: null, bannerUntil: 0, frame: 0, lastWall: performance.now()
    };
    S.regions = planRegions(S.startDeg, dir);
    { const k0 = orbitNow(); S.peAlt = k0.peAlt; S.apAlt = k0.apAlt; S.aop = k0.k.aopRad; }
    if (window.MoonMap) window.MoonMap.regions = S.regions.map((r) => ({ name: r.name, centerDeg: r.worldCenterDeg, widthDeg: T.REGION_WIDTH_DEG, rock: r.rock }));
    paintThumb();
    logMsg(`Orbit handed over from Phase 2: lowest ${Math.round(handoff.periAltKm)} km, highest ${Math.round(handoff.apoAltKm)} km, ${Math.round(handoff.fuelKg)} kg fuel.`, "info");
    if (!info.hasNS) logMsg("No neutron spectrometer fitted: the polar ice goal cannot be answered.", "bad");
    if (!info.hasGRS) logMsg("No gamma-ray spectrometer fitted: minerals cannot be identified.", "bad");
    if (!info.hasDGE) logMsg("No Doppler gravity experiment fitted: no gravity map this mission.", "bad");
    $("p3Inst").textContent = [info.hasNS ? "NS" : null, info.hasGRS ? "GRS" : null, info.hasDGE ? "DGE" : null].filter(Boolean).join(" · ") || "NO SCIENCE";
    renderRegionList();
    $("phase3").classList.remove("hidden");
    showBrief();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function showBrief() {
    if (!S) return;
    const h = S.handoff;
    const tier = tierOf(h.periAltKm) === "green" && tierOf(h.apoAltKm) === "green" ? "fully inside the green band" : "partly outside the green band";
    $("p3BriefBody").innerHTML = `
      <p>Your orbit (lowest <b>${Math.round(h.periAltKm)} km</b>, highest <b>${Math.round(h.apoAltKm)} km</b>) is ${tier}. The real physics keeps flying it: mascons slowly pull it down.</p>
      <ul>
        <li><b>Polar ice:</b> the neutron graph dips only over the <b>north and south polar zones</b>. Hold <kbd>SPACE</kbd> over a dip until confidence reaches 100%. Capturing elsewhere wastes storage and points.</li>
        <li><b>Minerals:</b> gamma-ray peaks build up as you cross each region. At its end the orbit <b>pauses</b> until you label every peak. Use the <kbd>H</kbd> handbook.</li>
        <li><b>Storage &amp; gravity:</b> downlink with <kbd>T</kbd> on the near side. The gravity map records itself on the near side, but a <b>full storage</b> forces that pass to be spent downlinking.</li>
        <li><b>Altitude:</b> 30–150 km = full data, 150–350 km = partial. Use the <b>orbit trims</b>: change the lowest point (PE) or highest point (AP) by 20 km. Each trim fires automatically on the opposite side of the orbit and uses real fuel you also need for the final impact.</li>
      </ul>`;
    $("p3Brief").classList.remove("hidden");
    S.briefOpen = true;
  }

  function paintThumb() {
    const cv = $("p3Thumb"), spr = S.info.sprite;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!spr) return;
    ctx.imageSmoothingEnabled = false;
    const k = Math.min((cv.width - 4) / spr.width, (cv.height - 4) / spr.height);
    ctx.drawImage(spr, (cv.width - spr.width * k) / 2, (cv.height - spr.height * k) / 2, spr.width * k, spr.height * k);
  }

  function togglePause(force) {
    if (!S || S.labelling) return;
    S.paused = typeof force === "boolean" ? force : !S.paused;
    $("p3Pause").textContent = S.paused ? "▶ RESUME [P]" : "❚❚ PAUSE [P]";
    $("p3Pause").classList.toggle("active", S.paused);
  }
  function toggleHandbook(force) {
    const el = $("p3Handbook");
    const open = typeof force === "boolean" ? force : !el.classList.contains("open");
    el.classList.toggle("open", open);
    el.setAttribute("aria-hidden", open ? "false" : "true");
  }
  function toggleDownlink() {
    if (!S) return;
    if (S.forcedDump) return;
    if (!S.near) { banner("FAR SIDE — NO LINE OF SIGHT TO EARTH", "amber", 1.8); return; }
    if (S.storage <= 0.5 && !S.downlink) { banner("STORAGE EMPTY — NOTHING TO SEND", "", 1.5); return; }
    S.downlink = !S.downlink;
    logMsg(S.downlink ? "Downlink started (gravity tracking paused while sending)." : "Downlink stopped.", "info");
  }

  // ---- orbit trims (station-keeping) ----
  const TRIM_KM = 20;
  function orbitNow() {
    const r = moonRel(S.st, S.t);
    const k = P.cartesianToKeplerian2D(r.rx, r.ry, r.vx, r.vy, CFG.MU_MOON);
    return { k, rel: r, peAlt: k.rp - CFG.R_MOON, apAlt: k.energy < 0 ? k.ra - CFG.R_MOON : Infinity };
  }
  function planTrim(kind) {
    const { k, rel } = orbitNow();
    if (!(k.energy < 0)) return null;
    const mu = CFG.MU_MOON, rp = k.rp, ra = k.ra;
    const peSide = kind[0] === "p", up = kind[1] === "e" ? kind[2] === "+" : kind[2] === "+";
    let at, v0, v1, newPe, newAp;
    if (peSide) { // change perilune → burn at apolune
      at = "apo";
      // the far side moves to rpN; if it ends up above us, our point becomes the new low point (apsides swap)
      const rpN = Math.max(CFG.R_MOON + 5, rp + (up ? TRIM_KM : -TRIM_KM));
      v0 = Math.sqrt(mu * (2 / ra - 2 / (ra + rp))); v1 = Math.sqrt(mu * (2 / ra - 2 / (ra + rpN)));
      newPe = Math.min(rpN, ra) - CFG.R_MOON; newAp = Math.max(rpN, ra) - CFG.R_MOON;
    } else {      // change apolune → burn at perilune
      at = "peri";
      const raN = Math.max(CFG.R_MOON + 5, ra + (up ? TRIM_KM : -TRIM_KM));
      v0 = Math.sqrt(mu * (2 / rp - 2 / (rp + ra))); v1 = Math.sqrt(mu * (2 / rp - 2 / (rp + raN)));
      newPe = Math.min(rp, raN) - CFG.R_MOON; newAp = Math.max(rp, raN) - CFG.R_MOON;
    }
    const dv = v1 - v0; // km/s along the velocity
    const mass = S.dryKg + S.fuelKg;
    const fuel = mass * (1 - Math.exp(-Math.abs(dv) * 1000 / (S.ispS * CFG.G0_MS2)));
    const ap = P.timeToApsides2D(rel.rx, rel.ry, rel.vx, rel.vy, mu);
    let etaSim = at === "peri" ? ap.signedTPeriSec : ap.tApoSec;
    if (!Number.isFinite(etaSim)) etaSim = 0;
    if (at === "peri" && etaSim < 0) etaSim += 2 * Math.PI * Math.sqrt(Math.pow(k.sma, 3) / mu);
    if (k.ecc < 0.004) etaSim = 0;
    return { kind, at, dv, fuel, newPe, newAp, etaSim, label: { "pe+": "▲ RAISE PE", "pe-": "▼ LOWER PE", "ap+": "▲ RAISE AP", "ap-": "▼ LOWER AP" }[kind] };
  }
  function etaText(etaSim) {
    const g = Math.max(0, etaSim) / T.SIM_PER_GAME / Math.max(1, S.speed);
    return g < 60 ? `${Math.round(g)}s` : `${Math.floor(g / 60)}:${String(Math.round(g % 60)).padStart(2, "0")}`;
  }
  function queueTrim(kind) {
    if (!S || S.finished || S.labelling) return;
    if (S.trim && S.trim.kind === kind) { S.trim = null; logMsg("Trim cancelled.", "info"); S.trimInfoDirty = true; return; }
    const p = planTrim(kind);
    if (!p) return;
    if (p.fuel > S.fuelKg) { banner("NOT ENOUGH FUEL FOR THIS TRIM", "red", 2); return; }
    const ecc = orbitNow().k.ecc;
    p.fireAtT = ecc < 0.004 ? S.t : S.t + Math.max(0, p.etaSim) + 5; // circular: any point is an apsis
    S.trim = p; S.prevRdotV = null; S.trimInfoDirty = true;
    logMsg(`${p.label} queued: fires at the ${p.at === "peri" ? "lowest point (perilune)" : "highest point (apolune)"} in ~${etaText(p.etaSim)}.`, "info");
  }
  function fireTrim() {
    const p = planTrim(S.trim.kind); // re-plan at the apsis itself for an exact result
    const q = S.trim; S.trim = null; S.trimInfoDirty = true;
    if (!p) return;
    if (p.fuel > S.fuelKg) { logMsg(`${q.label} skipped: not enough fuel.`, "bad"); return; }
    const rel = moonRel(S.st, S.t), vm = Math.hypot(rel.vx, rel.vy) || 1;
    S.st.vx += p.dv * rel.vx / vm; S.st.vy += p.dv * rel.vy / vm;
    S.fuelKg -= p.fuel; S.burnUsedKg += p.fuel;
    S.burnFlashUntil = performance.now() + 1400;
    banner(`TRIM BURN · ${p.label} · ${Math.round(Math.abs(p.dv) * 1000)} m/s · −${p.fuel.toFixed(1)} kg`, "green", 2.2);
    logMsg(`${p.label}: now lowest ${Math.round(p.newPe)} km / highest ${Math.round(p.newAp)} km (−${p.fuel.toFixed(1)} kg fuel).`, "ok");
  }
  function retrySurvey() {
    if (!S || S.finished) return;
    const now = performance.now();
    if (now > S.retryArmUntil) { S.retryArmUntil = now + 2500; $("p3Retry").textContent = "↺ SURE? CLICK AGAIN"; setTimeout(() => { if ($("p3Retry")) $("p3Retry").textContent = "↺ RETRY"; }, 2500); return; }
    const h = S.handoff, done = onDone;
    cancelAnimationFrame(raf);
    $("p3Label").classList.add("hidden");
    toggleHandbook(false);
    $("p3Retry").textContent = "↺ RETRY";
    start(h, done);
    logMsg("Survey restarted from the same orbit.", "info");
  }

  function addPoints(label, pts) {
    S.points += pts;
    S.lines.push({ label, pts });
    logMsg(`${pts >= 0 ? "+" : "−"}${Math.abs(pts)} · ${label}`, pts >= 0 ? "ok" : "bad");
  }
  function logMsg(text, type) {
    if (!S) return;
    const sec = Math.max(0, S.t - S.t0);
    const tm = `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
    S.log.unshift({ text, type: type || "info", tm });
    if (S.log.length > 40) S.log.pop();
    S.logDirty = true;
  }
  function banner(text, kind, sec) {
    S.banner = { text, kind: kind || "" };
    S.bannerUntil = performance.now() + (sec || 2) * 1000;
  }

  // ---------------------------------------------------------------------------
  // 6. Simulation
  // ---------------------------------------------------------------------------
  function loop(now) {
    if (!S || S.finished) return;
    const dtReal = Math.min(0.05, (now - S.lastWall) / 1000);
    S.lastWall = now;
    S.frame++;
    const running = !S.paused && !S.labelling && !S.briefOpen;
    if (running) step(dtReal * S.speed);
    if (!S || S.finished) return; // the orbit completed inside step()
    render();
    if (S.frame % 4 === 0 || S.logDirty) updateHud();
    if (!S.finished) raf = requestAnimationFrame(loop);
  }

  function step(dtGame) {
    const info = S.info;
    // ---- orbit: real physics + correction burns along the Moon-relative velocity ----
    let simLeft = dtGame * T.SIM_PER_GAME;
    S.burning = performance.now() < S.burnFlashUntil;
    while (simLeft > 1e-6) {
      const h = Math.min(T.MAX_STEP, simLeft);
      if (S.trim) {
        // fire a queued trim the moment we pass its apsis (radial velocity changes sign)
        const rr = moonRel(S.st, S.t), rdv = rr.rx * rr.vx + rr.ry * rr.vy;
        const prev = S.prevRdotV;
        S.prevRdotV = rdv;
        const crossed = prev != null && ((S.trim.at === "peri" && prev < 0 && rdv >= 0) || (S.trim.at === "apo" && prev > 0 && rdv <= 0));
        if (crossed || S.t >= S.trim.fireAtT) fireTrim(); // time fallback: near-circular orbits barely have apsides
      } else S.prevRdotV = null;
      const res = P.rk4Step2D(S.st, S.t, h, { enableDrag: false, ignoreEarthCollision: true, useLunarTopography: true, massKg: S.dryKg + S.fuelKg });
      S.st = { rx: res.rx, ry: res.ry, vx: res.vx, vy: res.vy };
      S.t += h;
      simLeft -= h;
      if (res.impact && res.impact.body === "Moon") { S.crashed = true; break; }
    }
    const rel = moonRel(S.st, S.t);
    const angDeg = rel.ang * DEG;
    let d = wrapDeg(angDeg - S.lastDeg) * S.dir;
    if (d < -90) d += 360;
    S.sweep += Math.max(0, d);
    S.lastDeg = angDeg;
    S.angDeg = angDeg;
    S.alt = rel.r - CFG.R_MOON;
    S.minAlt = Math.min(S.minAlt, S.alt);
    S.maxAlt = Math.max(S.maxAlt, S.alt);
    S.q = qualityOf(S.alt);
    S.tier = tierOf(S.alt);
    const kNow = orbitNow();
    S.peAlt = kNow.peAlt; S.apAlt = kNow.apAlt; S.aop = kNow.k.aopRad;
    if (S.peAlt < 35 && !S.driftWarned) {
      S.driftWarned = true;
      banner("PERILUNE DECAYING — STATION-KEEPING: QUEUE ▲ RAISE PE", "amber", 3.5);
      logMsg(`Mascons pulled the lowest point down to ${Math.round(S.peAlt)} km. Queue ▲ RAISE PE.`, "warn");
    } else if (S.peAlt > 45) S.driftWarned = false;
    if (S.frame % 3 === 0) {
      S.trail.push({ x: rel.rx, y: rel.ry, tier: S.tier });
      if (S.trail.length > 900) S.trail.shift();
    }
    const occ = P.checkDSNOccultation([S.st.rx, S.st.ry], [rel.m[0], rel.m[1]]);
    S.near = !occ.blocked;
    if (S.crashed) { finish(); return; }

    // ---- storage / downlink / gravity ----
    if (S.near && S.storage >= T.FORCE_DUMP_AT && !S.forcedDump) {
      S.forcedDump = true; S.downlink = true; S.gravityBlockedPasses++;
      banner("STORAGE FULL — THIS NEAR-SIDE PASS IS SPENT DOWNLINKING · GRAVITY TRACKING BLOCKED", "red", 3.5);
      logMsg("Storage full on the near side: forced downlink, gravity tracking blocked.", "bad");
    }
    if (!S.near && S.downlink) { S.downlink = false; S.forcedDump = false; if (S.storage > 0.5) logMsg("Lost Earth behind the Moon: downlink interrupted.", "warn"); }
    if (S.downlink) {
      S.storage = Math.max(0, S.storage - (DOWNLINK_RATE[info.telecom] || 5) * dtGame);
      if (S.storage <= (S.forcedDump ? T.FORCE_DUMP_UNTIL : 0)) { S.downlink = false; if (S.forcedDump) logMsg("Forced downlink done.", "info"); S.forcedDump = false; }
    } else if (S.near && info.hasDGE && S.gravity < 100) {
      S.gravity = Math.min(100, S.gravity + T.GRAVITY_RATE * dtGame);
      if (S.gravity >= 100) { addPoints("Gravity map recorded (mascons revealed)", 15); banner("GRAVITY MAP COMPLETE — MASCONS REVEALED", "green", 3); }
    }
    const storageFull = S.storage >= 100;

    // ---- polar ice (neutron spectrometer) ----
    S.overPole = poleOf(angDeg);
    const flux = neutronFlux(angDeg);
    S.sampleAcc += dtGame;
    while (S.sampleAcc > 0.06) { S.sampleAcc -= 0.06; S.neutron.push(info.hasNS ? flux : null); if (S.neutron.length > 240) S.neutron.shift(); }
    S.flux = info.hasNS ? flux : null;
    const inDip = info.hasNS && S.overPole && flux < T.ICE_THRESHOLD;
    if (S.overPole) {
      const ice = S.ice[S.overPole];
      ice.bestQ = Math.max(ice.bestQ, S.q);
      ice.crossed = true;
    }
    if (S.keys.capture && info.hasNS) {
      if (storageFull) {
        if (S.frame % 30 === 0) banner("STORAGE FULL — DOWNLINK ON THE NEAR SIDE", "red", 1.5);
      } else {
        S.storage = Math.min(100, S.storage + T.CAPTURE_STORAGE * dtGame);
        const pole = S.overPole && S.ice[S.overPole];
        if (inDip && pole && pole.state !== "confirmed") {
          const depth = clamp((T.ICE_THRESHOLD - flux) / 30, 0.2, 1);
          pole.conf = Math.min(100, pole.conf + T.CAPTURE_GAIN * S.q * depth * dtGame);
          S.conf = pole.conf;
          S.captureOutside = 0;
          if (pole.conf >= 100) {
            pole.state = "confirmed";
            addPoints(`Water ice confirmed at the ${S.overPole} pole`, 20);
            banner(`▼ HYDROGEN SIGNAL CONFIRMED — ${S.overPole.toUpperCase()} POLE WATER ICE`, "green", 3);
          }
        } else {
          S.captureOutside += dtGame;
          if (S.captureOutside >= T.WASTE_AFTER) {
            S.captureOutside = -1e9; // one penalty per hold
            S.wasted++;
            addPoints(pole && pole.state === "confirmed" ? "Repeated capture of an already confirmed pole" : "Capture outside a polar neutron dip (wasted storage)", -5);
          }
        }
      }
    } else {
      S.captureOutside = 0;
      S.conf = S.overPole ? S.ice[S.overPole].conf : 0;
    }

    // ---- minerals (gamma-ray spectrometer) ----
    S.region = null;
    for (const r of S.regions) {
      if (r.done) continue;
      if (S.sweep >= r.sweepFrom && S.sweep <= r.sweepTo) {
        S.region = r;
        if (info.hasGRS && !storageFull) {
          r.counts += S.q * dtGame;
          S.storage = Math.min(100, S.storage + T.GAMMA_STORAGE * dtGame);
        }
        r.qSum += S.q; r.qN++;
      } else if (S.sweep > r.sweepTo) {
        endRegion(r);
        break;
      }
    }
    // pole out of range penalty once the pole zone is passed
    for (const key of ["north", "south"]) {
      const ice = S.ice[key];
      if (ice.crossed && !S.overPole && ice.state === "pending") {
        ice.crossed = false;
        if (!info.hasNS) ice.state = "missing";
        else if (ice.bestQ < 0.5) { ice.state = "out"; addPoints(`${key[0].toUpperCase() + key.slice(1)} polar crossing flown out of range (dip too faint)`, -15); }
        else ice.state = "missed";
      }
    }
    if (S.sweep >= 360) finish();
  }

  function neutronFlux(angDeg) {
    let f = 100 + 2 * Math.sin(angDeg * 0.21) + (Math.random() + Math.random() + Math.random() - 1.5) * 4.2;
    const pole = poleOf(angDeg);
    if (pole) {
      const center = pole === "north" ? 90 : -90;
      const x = wrapDeg(angDeg - center) / 8;
      const depth = 55 * clamp((S.q - 0.15) / 0.85, 0, 1);
      f -= depth * Math.exp(-x * x);
    }
    return f;
  }

  function endRegion(r) {
    r.done = true;
    const q = r.qN ? r.qSum / r.qN : 0;
    r.quality = q;
    if (!S.info.hasGRS) { r.lost = true; r.result = { status: "missing" }; renderRegionList(); return; }
    if (q < 0.3 || r.counts < 1.2) {
      r.lost = true;
      r.result = { status: "lost" };
      addPoints(`${r.name}: flown out of range, peaks too weak to identify`, -15);
      renderRegionList();
      return;
    }
    openLabelling(r);
  }

  // ---------------------------------------------------------------------------
  // 7. Mineral labelling mini-game
  // ---------------------------------------------------------------------------
  function openLabelling(r) {
    const peaks = r.lines.map(([el, e], i) => ({
      i, el, e,
      meas: Math.round((e + (Math.random() - 0.5) * 12) / 5) * 5,
      label: null, wrong: 0, hinted: false, revealed: false
    }));
    S.labelling = { r, peaks, sel: 0 };
    S.keys = { capture: false, raise: false, lower: false };
    $("p3LabelKicker").textContent = `REGION ${r.idx + 1} OF ${S.regions.length} · ${r.name.toUpperCase()} · ORBIT PAUSED`;
    $("p3LabelSub").textContent = r.quality < 0.7
      ? "Flown in the amber band: the peaks are weaker (partial points). Label every peak, then resume."
      : "Label every peak with the element that produced it. Pick a peak, then an element. The handbook lists every energy.";
    $("p3Elements").innerHTML = Object.values(ELEMENTS).map((e) => `<button class="hud-btn p3-el" data-el="${e.sym}" style="--elc:${e.color}"><b>${e.sym}</b> ${e.name}</button>`).join("");
    $("p3Elements").querySelectorAll(".p3-el").forEach((b) => b.addEventListener("click", () => assign(b.dataset.el)));
    $("p3LabelMsg").textContent = "";
    $("p3LabelMsg").className = "p3-label-msg mono";
    renderPeaks();
    drawSpectrum($("p3Spectrum"), r, peaks, true);
    $("p3Label").classList.remove("hidden");
  }

  function renderPeaks() {
    const L = S.labelling;
    $("p3Peaks").innerHTML = L.peaks.map((p) => {
      const cls = p.label ? (p.revealed ? "revealed" : "ok") : p.i === L.sel ? "sel" : "";
      const txt = p.label ? `${p.label}${p.revealed ? " (revealed)" : " ✓"}` : "?";
      return `<button class="p3-peak ${cls}" data-pk="${p.i}"><span class="n">#${p.i + 1}</span><span class="e">≈ ${p.meas} ± 20 keV</span><span class="l">${txt}</span></button>`;
    }).join("");
    $("p3Peaks").querySelectorAll(".p3-peak").forEach((b) => b.addEventListener("click", () => {
      const p = L.peaks[+b.dataset.pk];
      if (p.label) return;
      L.sel = p.i;
      renderPeaks();
      drawSpectrum($("p3Spectrum"), L.r, L.peaks, true);
    }));
    const allDone = L.peaks.every((p) => p.label);
    $("p3LabelDone").disabled = !allDone;
  }

  function assign(sym) {
    const L = S.labelling;
    if (!L) return;
    const p = L.peaks.find((x) => x.i === L.sel && !x.label) || L.peaks.find((x) => !x.label);
    if (!p) return;
    const msg = $("p3LabelMsg");
    if (sym === p.el) {
      p.label = sym;
      msg.textContent = `Peak #${p.i + 1} = ${ELEMENTS[sym].name}. Correct!`;
      msg.className = "p3-label-msg mono ok";
    } else {
      p.wrong++;
      addPoints(`Wrong label on peak #${p.i + 1} (${L.r.name})`, -2);
      msg.className = "p3-label-msg mono bad shake";
      if (p.wrong === 2) {
        p.hinted = true;
        addPoints("Hint used", -3);
        const lo = Math.round(p.meas - 40), hi = Math.round(p.meas + 40);
        msg.textContent = `Hint: look up ${lo}–${hi} keV in the handbook.` + (L.r.trap && (p.el === "Ti" || p.el === "Mg") ? " Near 1375 keV, check whether Ti's second lines (6418 / 6760 keV) are in this spectrum." : "");
      } else if (p.wrong >= 3) {
        p.label = p.el;
        p.revealed = true;
        addPoints("Answer revealed", -6);
        msg.textContent = `Revealed: peak #${p.i + 1} is ${ELEMENTS[p.el].name} (${p.e} keV).`;
      } else {
        msg.textContent = `Not ${ELEMENTS[sym].name}. Compare the energy with the handbook and try again.`;
      }
      void msg.offsetWidth;
    }
    const next = L.peaks.find((x) => !x.label);
    if (next) L.sel = next.i;
    renderPeaks();
    drawSpectrum($("p3Spectrum"), L.r, L.peaks, true);
  }

  function finishLabelling() {
    const L = S.labelling;
    if (!L) return;
    const r = L.r;
    const clean = L.peaks.every((p) => !p.revealed);
    const full = r.quality >= 0.7;
    r.result = {
      status: full ? "full" : "partial",
      elements: [...new Set(L.peaks.map((p) => p.el))],
      rockCorrect: null
    };
    if (clean) addPoints(`${r.name}: all peaks identified${full ? "" : " (amber band, partial)"}`, full ? 10 : 5);
    S.labelling = null;
    $("p3Label").classList.add("hidden");
    toggleHandbook(false);
    renderRegionList();
    S.lastWall = performance.now();
  }

  // ---------------------------------------------------------------------------
  // 8. Rendering
  // ---------------------------------------------------------------------------
  function spectrumValue(r, peaks, eKeV, strength, noiseSeed) {
    // continuum: falls with energy (log scale), plus noisy Gaussian peaks (σ ≈ 4 % at 1 MeV)
    let v = 900 * Math.exp(-eKeV / 1500) + 40;
    for (const p of peaks) {
      const sigma = 18 + 0.012 * p.e;
      const amp = strength * (p.el === "Fe" && p.e > 7000 ? 260 : p.el === "Si" && p.e < 2000 ? 900 : 520);
      v += amp * Math.exp(-Math.pow((eKeV - p.e) / sigma, 2) / 2);
    }
    const n = Math.sin(eKeV * 12.9898 + noiseSeed) * 43758.5453;
    return Math.max(5, v * (1 + ((n - Math.floor(n)) - 0.5) * 0.35 / Math.sqrt(strength + 0.2)));
  }

  function drawSpectrum(cv, r, peaks, big) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const pad = { l: 46, r: 12, t: 12, b: 28 };
    ctx.fillStyle = "#0A0E17"; ctx.fillRect(0, 0, W, H);
    const strength = big ? clamp(r.counts / 6, 0.35, 1.4) * (r.quality || 1) : clamp(r.counts / 6, 0.05, 1.4);
    const X = (e) => pad.l + (e / 8000) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - ((Math.log10(v) - 0.5) / 3.6) * (H - pad.t - pad.b);
    ctx.strokeStyle = "#1C2536"; ctx.lineWidth = 1;
    ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.fillStyle = "#8B9BB4"; ctx.textAlign = "center";
    for (let e = 0; e <= 8000; e += 1000) {
      ctx.beginPath(); ctx.moveTo(X(e), pad.t); ctx.lineTo(X(e), H - pad.b); ctx.stroke();
      ctx.fillText(String(e), X(e), H - pad.b + 13);
    }
    ctx.textAlign = "right";
    for (const v of [10, 100, 1000]) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(String(v), pad.l - 4, Y(v) + 3);
    }
    ctx.textAlign = "center";
    ctx.fillText("Energy (keV)", (W + pad.l) / 2, H - 2);
    ctx.save(); ctx.translate(10, (H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("counts", 0, 0); ctx.restore();
    if (big && S && S.labelling) {
      const p = peaks.find((x) => x.i === S.labelling.sel && !x.label);
      if (p && p.hinted) { ctx.fillStyle = "rgba(217,119,6,0.18)"; ctx.fillRect(X(p.meas - 40), pad.t, X(p.meas + 40) - X(p.meas - 40), H - pad.t - pad.b); }
    }
    // spectrum as a pixel step-plot
    ctx.strokeStyle = "#6E9BF0"; ctx.lineWidth = big ? 1.5 : 1;
    ctx.beginPath();
    const seed = r.idx * 7.31;
    for (let px = pad.l; px <= W - pad.r; px += big ? 2 : 2) {
      const e = ((px - pad.l) / (W - pad.l - pad.r)) * 8000;
      const y = Y(spectrumValue(r, peaks, e, strength, seed));
      if (px === pad.l) ctx.moveTo(px, y); else { ctx.lineTo(px, y); }
    }
    ctx.stroke();
    if (big) {
      for (const p of peaks) {
        const x = X(p.e), yTop = Y(spectrumValue(r, peaks, p.e, strength, seed)) - 10;
        const col = p.label ? (ELEMENTS[p.label] || {}).color : S.labelling && p.i === S.labelling.sel ? "#F0A030" : "#E2E8F0";
        ctx.fillStyle = col;
        ctx.fillRect(x - 1, yTop - 2, 2, 8);
        ctx.font = "bold 11px 'IBM Plex Mono', monospace";
        ctx.fillText(p.label ? `#${p.i + 1} ${p.label}` : `#${p.i + 1}`, x, yTop - 6);
      }
    }
  }

  function render() {
    renderScene();
    renderMinimap();
    renderNeutron();
    renderGammaLive();
  }

  function renderScene() {
    const cv = $("p3Scene");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0A0E17"; ctx.fillRect(0, 0, W, H);
    // stars
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97.3 - S.sweep * 0.6) % W + W) % W, y = (i * 53.1) % (H * 0.55);
      ctx.fillStyle = i % 4 ? "#2E3B52" : "#8B9BB4";
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
    // Earth on the near side
    if (S.near) {
      const ex = W - 40, ey = 30;
      if (window.PlanetArt) window.PlanetArt.drawEarth(ctx, ex, ey, 11, S.t * CFG.OMEGA_EARTH, Math.PI * 0.8, Math.PI / 2);
      ctx.fillStyle = "#8B9BB4"; ctx.font = "9px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillText("EARTH", ex, ey + 22);
    } else {
      ctx.fillStyle = "#F05A5A"; ctx.font = "bold 9px 'IBM Plex Mono', monospace"; ctx.textAlign = "right"; ctx.fillText("FAR SIDE · NO EARTH LINK", W - 8, 16);
    }
    // altitude scale (log): ground at y0, 350 km near the top
    const yGround = H - 46;
    const altY = (a) => yGround - (Math.log10(1 + Math.max(0, a)) / Math.log10(1 + 420)) * (yGround - 26);
    ctx.fillStyle = "rgba(22,163,74,0.10)"; ctx.fillRect(0, altY(150), W, altY(30) - altY(150));
    ctx.fillStyle = "rgba(217,119,6,0.07)"; ctx.fillRect(0, altY(350), W, altY(150) - altY(350));
    ctx.font = "9px 'IBM Plex Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = "#3CC46B"; ctx.fillText("30–150 km FULL DATA", 6, altY(150) + 10);
    ctx.fillStyle = "#F0A030"; ctx.fillText("150–350 km PARTIAL", 6, altY(350) + 10);
    // terrain (scrolls with the orbit sweep)
    const pole = S.overPole;
    const reg = S.region;
    for (let x = 0; x < W; x++) {
      const a = S.angDeg + (x - W * 0.35) * 0.12 * S.dir;
      const wx = Math.floor(S.sweep * 4) + x;
      const relief = P.getLunarSurfaceReliefKm(a / DEG);
      const y = Math.round(yGround - relief * 1.2 + 2 * Math.sin(wx * 0.11) + 1.2 * Math.sin(wx * 0.37));
      const inPole = poleOf(a);
      const h = (wx * 2654435761) >>> 0;
      let top = "#B9BCC2", mid = "#8E939C", deep = "#4A5468";
      const ar = S.regions.find((r) => {
        const s = S.sweep + (x - W * 0.35) * 0.12;
        return s >= r.sweepFrom && s <= r.sweepTo;
      });
      if (ar && ar.terrain === "mare") { top = "#6E7480"; mid = "#5E6470"; deep = "#323C4F"; }
      if (inPole) { top = "#3A465C"; mid = "#1C2536"; deep = "#151C2A"; }
      ctx.fillStyle = top; ctx.fillRect(x, y, 1, 2);
      ctx.fillStyle = mid; ctx.fillRect(x, y + 2, 1, 6);
      ctx.fillStyle = deep; ctx.fillRect(x, y + 8, 1, H - y);
      if (h % 11 === 0) { ctx.fillStyle = deep; ctx.fillRect(x, y + 3 + (h >>> 9) % 4, 1, 1); }
      if (inPole && S.ice[inPole].state === "confirmed" && h % 5 === 0) { ctx.fillStyle = (S.frame >> 3) % 3 ? "#5B8DEF" : "#E2E8F0"; ctx.fillRect(x, y + 1, 1, 1); }
    }
    // labels
    ctx.textAlign = "center"; ctx.font = "bold 10px 'IBM Plex Mono', monospace";
    if (pole) { ctx.fillStyle = "#6E9BF0"; ctx.fillText(`${pole.toUpperCase()} POLAR ZONE · PSR CRATERS`, W / 2, H - 8); }
    else if (reg) { ctx.fillStyle = "#E8D27A"; ctx.fillText(`${reg.name.toUpperCase()} · GAMMA-RAY RECORDING`, W / 2, H - 8); }
    // spacecraft
    const sx = Math.round(W * 0.35), sy = Math.round(altY(S.alt));
    if (S.info.hasNS) {
      const ice = S.flux != null && S.flux < T.ICE_THRESHOLD;
      ctx.fillStyle = ice ? "rgba(91,141,239,0.28)" : "rgba(60,196,107,0.16)";
      ctx.beginPath(); ctx.moveTo(sx - 2, sy + 6); ctx.lineTo(sx + 2, sy + 6); ctx.lineTo(sx + 18, yGround); ctx.lineTo(sx - 18, yGround); ctx.closePath(); ctx.fill();
    }
    if (S.downlink && S.near) {
      ctx.strokeStyle = "#6E9BF0"; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -S.frame * 0.5;
      ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(W - 40, 30); ctx.stroke(); ctx.setLineDash([]);
    }
    const spr = S.burning && S.info.spritePuff ? S.info.spritePuff : S.info.sprite;
    if (spr) {
      const k = Math.min(1, 44 / Math.max(spr.width, spr.height));
      ctx.drawImage(spr, Math.round(sx - (spr.width * k) / 2), Math.round(sy - (spr.height * k) / 2), Math.round(spr.width * k), Math.round(spr.height * k));
    } else { ctx.fillStyle = "#2563EB"; ctx.fillRect(sx - 5, sy - 4, 10, 8); }
    if (S.burning) {
      ctx.fillStyle = "#F0A030";
      const fx = S.keys.raise ? sx - 18 : sx + 14;
      for (let i = 0; i < 6; i++) ctx.fillRect(fx + (S.keys.raise ? -i : i), sy + ((i * 7) % 3) - 1, 1, 1);
    }
    ctx.fillStyle = "#E2E8F0"; ctx.textAlign = "left"; ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText(`${Math.round(S.alt)} km`, sx + 26, sy + 3);
    if (S.alt < 25) { ctx.fillStyle = (S.frame >> 3) & 1 ? "#F05A5A" : "#F0A030"; ctx.textAlign = "center"; ctx.fillText("⚠ BELOW 25 km · TERRAIN HAZARD", W / 2, 18); }
    // banner (DOM)
    const b = $("p3Banner");
    if (S.banner && performance.now() < S.bannerUntil) { b.textContent = S.banner.text; b.className = "p3-banner " + S.banner.kind; }
    else if (S.paused) { b.textContent = "❚❚ PAUSED — press [P] to resume"; b.className = "p3-banner amber"; }
    else b.className = "p3-banner hidden";
  }

  function renderMinimap() {
    const cv = $("p3Minimap");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    ctx.fillStyle = "#0A0E17"; ctx.fillRect(0, 0, W, H);
    const rMoonPx = W * 0.27;
    const scale = rMoonPx / CFG.R_MOON;
    const exag = (rKm) => rMoonPx + (rKm - CFG.R_MOON) * scale * 4.0; // altitude ×4 for readability
    const pt = (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(y, x), rr = exag(r); return [cx + Math.cos(a) * rr, cy - Math.sin(a) * rr]; };
    // altitude bands
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(60,196,107,0.35)"; ctx.beginPath(); ctx.arc(cx, cy, exag(CFG.R_MOON + 30), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, exag(CFG.R_MOON + 150), 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(240,160,48,0.3)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(cx, cy, exag(CFG.R_MOON + 350), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // Moon
    if (window.PlanetArt) window.PlanetArt.drawMoon(ctx, cx, cy, rMoonPx, Math.PI * 0.85, Math.PI / 2);
    else { ctx.fillStyle = "#8E939C"; ctx.beginPath(); ctx.arc(cx, cy, rMoonPx, 0, TAU); ctx.fill(); }
    // polar zones
    ctx.lineWidth = 5;
    for (const c of [90, -90]) {
      ctx.strokeStyle = "rgba(110,155,240,0.85)";
      ctx.beginPath(); ctx.arc(cx, cy, rMoonPx + 3, -(c + T.POLE_HALF_DEG) / DEG, -(c - T.POLE_HALF_DEG) / DEG); ctx.stroke();
    }
    ctx.fillStyle = "#6E9BF0"; ctx.font = "bold 9px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("N", cx, cy - rMoonPx - 9); ctx.fillText("S", cx, cy + rMoonPx + 16);
    // regions
    for (const r of S.regions) {
      const a0 = r.worldCenterDeg - T.REGION_WIDTH_DEG / 2, a1 = r.worldCenterDeg + T.REGION_WIDTH_DEG / 2;
      ctx.strokeStyle = r.done ? (r.lost ? "#F05A5A" : (ROCKS[r.rock] || { color: "#E8D27A" }).color) : "#E8D27A";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, rMoonPx + 3, -a1 / DEG, -a0 / DEG); ctx.stroke();
    }
    // mascons once the gravity map is complete
    if (S.gravity >= 100 && typeof P.getMasconPositions2D === "function") {
      const m = P.getMoonStateAtTime(S.t);
      for (const mc of P.getMasconPositions2D(m[0], m[1])) {
        const [x, y] = [cx + (mc.x - m[0]) * scale, cy - (mc.y - m[1]) * scale];
        ctx.fillStyle = "rgba(236,72,153,0.8)"; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
    // trail coloured by tier
    ctx.lineWidth = 2;
    for (let i = 1; i < S.trail.length; i++) {
      const a = S.trail[i - 1], b = S.trail[i];
      ctx.strokeStyle = b.tier === "green" ? "#3CC46B" : b.tier === "amber" ? "#F0A030" : "#F05A5A";
      const [x0, y0] = pt(a.x, a.y), [x1, y1] = pt(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // current orbit (thin) + trim preview (dotted)
    const conic = (peAlt, apAlt, w, style, dash) => {
      const rp = CFG.R_MOON + peAlt, ra = CFG.R_MOON + apAlt;
      if (!Number.isFinite(ra) || ra < rp) return;
      const aS = (rp + ra) / 2, e = (ra - rp) / (ra + rp), pp = aS * (1 - e * e);
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const th = (i / 120) * TAU, r = pp / (1 + e * Math.cos(th - (S.aop || 0)));
        const [x, y] = pt(r * Math.cos(th), r * Math.sin(th));
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    if (Number.isFinite(S.apAlt)) conic(S.peAlt, S.apAlt, 1, "rgba(226,232,240,0.35)");
    const pk = S.trimHover || (S.trim && S.trim.kind);
    const pv = pk ? planTrim(pk) : null;
    if (pv) conic(pv.newPe, pv.newAp, 2, "#FDE047", [3, 3]);
    // spacecraft & Earth direction
    const rel = moonRel(S.st, S.t);
    const [sx, sy] = pt(rel.rx, rel.ry);
    ctx.fillStyle = "#E2E8F0"; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 2, 5, 5);
    const ea = Math.atan2(-rel.m[1], -rel.m[0]);
    ctx.strokeStyle = "#6E9BF0"; ctx.lineWidth = 1;
    const ex = cx + Math.cos(ea) * (W * 0.46), ey = cy - Math.sin(ea) * (H * 0.46);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(ea) * (W * 0.38), cy - Math.sin(ea) * (H * 0.38)); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = "#6E9BF0"; ctx.fillText("EARTH", clamp(ex, 18, W - 18), clamp(ey + (ey < cy ? -4 : 10), 10, H - 4));
  }

  function renderNeutron() {
    const cv = $("p3Neutron");
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    g.fillStyle = "#0A0E17"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#1C2536";
    for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 20) g.fillRect(0, y, W, 1);
    const fy = (v) => Math.round(H - 6 - (clamp(v, 0, 130) / 130) * (H - 14));
    const ty = fy(T.ICE_THRESHOLD);
    g.fillStyle = "#F0A030";
    for (let x = 0; x < W; x += 6) g.fillRect(x, ty, 3, 1);
    g.font = "bold 9px 'IBM Plex Mono', monospace"; g.textAlign = "left"; g.fillText("ICE THRESHOLD", 4, ty - 3);
    const arr = S.neutron, dx = W / arr.length;
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      const v = arr.at(i);
      if (v == null) { prev = null; continue; }
      const x = Math.floor(i * dx), y = fy(v), ice = v < T.ICE_THRESHOLD;
      g.fillStyle = ice ? "rgba(91,141,239,0.3)" : "rgba(60,196,107,0.12)";
      g.fillRect(x, y, Math.ceil(dx), H - y);
      g.fillStyle = ice ? "#6E9BF0" : "#3CC46B";
      if (prev != null) g.fillRect(x, Math.min(prev, y), Math.ceil(dx), Math.abs(prev - y) + 1);
      else g.fillRect(x, y, Math.ceil(dx), 1);
      prev = y;
    }
    if (!S.info.hasNS) {
      g.fillStyle = "#131A26"; g.fillRect(W / 2 - 80, H / 2 - 10, 160, 20);
      g.fillStyle = "#F05A5A"; g.textAlign = "center"; g.fillText("NOT INSTALLED", W / 2, H / 2 + 3);
    }
  }

  function renderGammaLive() {
    const cv = $("p3Gamma");
    const r = S.region || [...S.regions].reverse().find((x) => x.done && !x.lost);
    if (!S.info.hasGRS) {
      const g = cv.getContext("2d");
      g.fillStyle = "#0A0E17"; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = "#F05A5A"; g.font = "bold 9px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.fillText("NOT INSTALLED", cv.width / 2, cv.height / 2);
      return;
    }
    if (!r) {
      const g = cv.getContext("2d");
      g.fillStyle = "#0A0E17"; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = "#8B9BB4"; g.font = "9px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.fillText("BETWEEN REGIONS · WAITING FOR THE NEXT MINERAL REGION", cv.width / 2, cv.height / 2);
      return;
    }
    if (S.frame % 6 === 0 || !S.region) {
      const peaks = r.lines.map(([el, e], i) => ({ i, el, e }));
      drawSpectrum(cv, r, peaks, false);
    }
  }

  function renderRegionList() {
    const ul = $("p3RegionList");
    ul.innerHTML = S.regions.map((r) => {
      let st = "UPCOMING", cls = "";
      if (r.done) {
        if (r.result && r.result.status === "full") { st = "IDENTIFIED"; cls = "ok"; }
        else if (r.result && r.result.status === "partial") { st = "PARTIAL"; cls = "warn"; }
        else if (r.result && r.result.status === "missing") { st = "NO GRS"; cls = "bad"; }
        else { st = "LOST"; cls = "bad"; }
      } else if (S.region === r) { st = "RECORDING"; cls = "now"; }
      return `<li class="${cls}"><span>${r.idx + 1}. ${r.name}</span><b>${st}</b></li>`;
    }).join("");
  }

  function updateHud() {
    const pct = clamp(S.sweep / 360, 0, 1) * 100;
    $("p3Pct").textContent = `${pct.toFixed(0)}%`;
    $("p3Bar").style.width = `${pct.toFixed(1)}%`;
    const sec = Math.max(0, S.t - S.t0);
    $("p3Met").textContent = `T+ ${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    // pole marks on the progress bar
    const markAt = (centerDeg) => {
      let s = wrapDeg(centerDeg - S.startDeg) * S.dir;
      if (s < 0) s += 360;
      return `${(s / 360) * 100}%`;
    };
    document.querySelector("#phase3 .p3-mark.n").style.left = markAt(90);
    document.querySelector("#phase3 .p3-mark.s").style.left = markAt(-90);
    $("p3Alt").textContent = Math.round(S.alt);
    const tier = S.tier || "green";
    $("p3Tier").textContent = tier === "green" ? "FULL DATA" : tier === "amber" ? "PARTIAL" : S.alt < 25 ? "DANGER" : "OUT OF RANGE";
    $("p3Tier").className = "pill " + tier;
    $("p3PeriApo").textContent = `${Math.round(S.minAlt)} / ${Math.round(S.maxAlt)} km`;
    $("p3Q").textContent = `${Math.round(S.q * 100)}%`;
    $("p3Over").textContent = S.overPole ? `${S.overPole} polar zone` : S.region ? S.region.name : "transit";
    $("p3SideTag").textContent = S.near ? "NEAR SIDE" : "FAR SIDE";
    $("p3SideTag").className = "pill " + (S.near ? "green" : "red");
    const fuelPct = (S.fuelKg / S.fuelMaxKg) * 100;
    $("p3Fuel").textContent = `${S.fuelKg.toFixed(1)} kg`;
    $("p3FuelBar").style.width = `${clamp(fuelPct, 0, 100)}%`;
    $("p3FuelBar").className = fuelPct < 15 ? "red" : "";
    $("p3Store").textContent = `${Math.round(S.storage)}%`;
    $("p3StoreBar").style.width = `${S.storage}%`;
    $("p3StoreBar").className = S.storage >= 90 ? "red" : S.storage >= 70 ? "amber" : "";
    $("p3Grav").textContent = S.info.hasDGE ? `${Math.round(S.gravity)}%` : "N/A";
    $("p3GravBar").style.width = `${S.gravity}%`;
    for (const [id, key] of [["p3IceN", "north"], ["p3IceS", "south"]]) {
      const st = S.ice[key].state;
      $(id).className = "chip " + (st === "confirmed" ? "on" : st === "out" || st === "missed" || st === "missing" ? "off" : "");
      $(id).textContent = `${key === "north" ? "N" : "S"} ICE ${st === "confirmed" ? "✓" : st === "pending" ? "…" : "✗"}`;
    }
    const conf = S.overPole ? S.ice[S.overPole].conf : S.conf;
    $("p3ConfBar").style.width = `${conf}%`;
    $("p3Conf").textContent = S.overPole ? `confidence ${Math.round(conf)}%` : "confidence -- (not over a pole)";
    $("p3Capture").classList.toggle("active", S.keys.capture);
    $("p3Capture").disabled = !S.info.hasNS;
    $("p3Downlink").textContent = S.forcedDump ? "FORCED DOWNLINK…" : S.downlink ? "[T] STOP DOWNLINK" : "[T] DOWNLINK DATA";
    $("p3Downlink").classList.toggle("active", S.downlink);
    $("p3Downlink").disabled = !S.near;
    $("p3OrbitPA").textContent = `PE ${Math.round(S.peAlt)} · AP ${Number.isFinite(S.apAlt) ? Math.round(S.apAlt) : "∞"} km`;
    document.querySelectorAll("#phase3 .p3-trim").forEach((b) => {
      b.classList.toggle("active", !!(S.trim && S.trim.kind === b.dataset.trim));
      b.classList.toggle("pulse", b.dataset.trim === "pe+" && S.peAlt < 35);
    });
    {
      const kind = S.trimHover || (S.trim && S.trim.kind);
      const p = kind ? planTrim(kind) : null;
      const reserve = S.fuelMaxKg * 0.25;
      $("p3TrimInfo").innerHTML = !p
        ? "Hover a trim to preview it (dotted orbit). Each changes one side of the orbit by 20 km."
        : `${S.trim && S.trim.kind === kind ? "<b>QUEUED</b> · " : ""}${p.label} → PE ${Math.round(p.newPe)} / AP ${Math.round(p.newAp)} km · fires at ${p.at === "peri" ? "perilune" : "apolune"} in ~${etaText(p.etaSim)} · <b>−${p.fuel.toFixed(1)} kg</b>` +
          (S.fuelKg - p.fuel < reserve ? ` <span class="bad">· low fuel for the final impact</span>` : "") +
          (p.newPe < 30 ? ` <span class="bad">· PE under 30 km: crash risk</span>` : "") +
          (S.trim && S.trim.kind === kind ? " · click again to cancel" : "");
    }
    $("p3Flux").textContent = S.flux == null ? "-- cps" : `${Math.round(S.flux)} cps${S.flux < T.ICE_THRESHOLD ? " ▼ HYDROGEN" : ""}`;
    $("p3GammaTag").textContent = S.region ? `${S.region.name} · ${Math.round(clamp(S.region.counts / 6, 0, 1) * 100)}%` : "--";
    $("p3Points").textContent = S.points;
    let hint;
    if (S.overPole && S.info.hasNS) hint = S.flux != null && S.flux < T.ICE_THRESHOLD ? "Neutron dip! Hold [SPACE] to capture." : "Polar zone: wait for the dip below the threshold.";
    else if (S.region) hint = "Gamma-ray recording… the orbit pauses at the region's end for labelling.";
    else if (S.near && S.storage > 60) hint = "Near side: downlink with [T] before storage fills.";
    else if (!S.near) hint = "Far side: no Earth link. Instruments keep recording.";
    else hint = "Transit. Gravity tracking runs on the near side.";
    $("p3Hint").textContent = hint;
    $("p3Led").className = "status-led" + (S.alt < 25 || S.storage >= 95 ? " danger" : S.tier !== "green" ? " warn" : "");
    if (S.logDirty) {
      S.logDirty = false;
      $("p3Log").innerHTML = S.log.map((e) => `<div class="${e.type}"><span>T+${e.tm}</span>${e.text}</div>`).join("");
      renderRegionList();
    }
  }

  // ---------------------------------------------------------------------------
  // 9. End of survey → back to Phase 2 Stage 4
  // ---------------------------------------------------------------------------
  function finish() {
    if (S.finished) return;
    S.finished = true;
    cancelAnimationFrame(raf);
    for (const key of ["north", "south"]) {
      const ice = S.ice[key];
      if (ice.state === "pending") ice.state = S.info.hasNS ? (ice.bestQ < 0.5 ? "out" : "missed") : "missing";
    }
    S.regions.forEach((r) => { if (!r.done) { r.done = true; r.lost = true; r.result = { status: S.crashed ? "lost" : "lost" }; } });
    const gravityMapped = S.gravity >= 100;
    const res = {
      t: S.t, rx: S.st.rx, ry: S.st.ry, vx: S.st.vx, vy: S.st.vy,
      fuelKg: S.fuelKg, fuelAtHandoffKg: S.handoff.fuelKg, burnUsedKg: S.burnUsedKg,
      crashed: S.crashed,
      points: S.points, lines: S.lines.slice(),
      ice: { north: S.ice.north.state, south: S.ice.south.state },
      regions: S.regions.map((r) => ({ name: r.name, centerDeg: r.worldCenterDeg, rock: r.rock, quality: r.quality || 0, status: r.result ? r.result.status : "lost", elements: r.result && r.result.elements})),
      gravityMapped, gravityPct: S.gravity, wastedCaptures: S.wasted, gravityBlockedPasses: S.gravityBlockedPasses,
      minAltKm: S.minAlt, maxAltKm: S.maxAlt,
      instruments: { ns: S.info.hasNS, grs: S.info.hasGRS, dge: S.info.hasDGE, er: S.info.hasER },
      sciencePct: clamp(50 + S.points, 0, 100)
    };
    if (window.GameState) window.GameState.surveyResult = res;
    $("phase3").classList.add("hidden");
    toggleHandbook(false);
    const cb = onDone;
    S = null;
    if (cb) cb(res);
  }

  // ---------------------------------------------------------------------------
  // 10. Final report (after the Stage 4 impact)
  // ---------------------------------------------------------------------------
  function showFinalReport(impact) {
    const gs = window.GameState || {};
    const sr = gs.surveyResult;
    const b = gs.build || {};
    let el = $("finalReport");
    if (!el) {
      el = document.createElement("div");
      el.id = "finalReport";
      el.className = "p3-modal final-report";
      document.body.appendChild(el);
    }
    const lines = sr ? sr.lines.slice() : [];
    if (sr && window.GameState && window.GameState.assistMode === "commander") lines.push({ label: "Commander mode: lunar orbit insertion flown by hand", pts: 15 });
    if (impact && impact.hit) lines.push({ label: "Impact inside Shoemaker crater (plume for Earth telescopes)", pts: 25 });
    else if (impact && !impact.crashedInSurvey) lines.push({ label: "Impact missed Shoemaker crater", pts: 0 });
    const total = lines.reduce((a, l) => a + l.pts, 0);
    const goals = [];
    if (sr) {
      const iceOk = ["north", "south"].filter((k) => sr.ice[k] === "confirmed").length;
      goals.push({ m: "ice", q: "Is there water ice at the lunar poles?", st: !sr.instruments.ns ? "no" : iceOk === 2 ? "yes" : iceOk === 1 ? "part" : "no",
        why: !sr.instruments.ns ? "No neutron spectrometer was fitted in the hangar." : iceOk === 2 ? "Hydrogen dips confirmed over both poles." : iceOk === 1 ? "Only one pole was confirmed." : "Neither pole was confirmed (out of range or missed)." });
      const reg = sr.regions.filter((r) => r.status === "full" || r.status === "partial").length;
      goals.push({ m: "min", q: "What is the Moon's surface made of?", st: !sr.instruments.grs ? "no" : reg === sr.regions.length ? "yes" : reg > 0 ? "part" : "no",
        why: !sr.instruments.grs ? "No gamma-ray spectrometer was fitted." : `${reg} of ${sr.regions.length} regions identified.` });
      goals.push({ m: "grav", q: "How is the Moon's gravity field uneven?", st: !sr.instruments.dge ? "no" : sr.gravityMapped ? "yes" : sr.gravityPct > 40 ? "part" : "no",
        why: !sr.instruments.dge ? "No Doppler gravity experiment was fitted." : sr.gravityMapped ? "Gravity map complete, mascons revealed." : `Gravity map ${Math.round(sr.gravityPct)}%${sr.gravityBlockedPasses ? " (storage full blocked tracking)" : ""}.` });
    }
    // Missions picked on the opening menu decide which goals count. A goal from a mission
    // the player did not pick is shown only if it was answered anyway (as a bonus).
    const picked = Array.isArray(window.GameState && window.GameState.missions) ? window.GameState.missions : null;
    if (sr && picked && picked.includes("mag")) {
      goals.push({ m: "mag", q: "Does the Moon have a magnetic field? (passive)", st: sr.instruments.er ? "yes" : "no",
        why: sr.instruments.er ? "MAG/ER logged the weak crustal fields automatically during the survey." : "No MAG/ER was fitted in the hangar." });
    }
    if (picked) {
      for (let i = goals.length - 1; i >= 0; i--) {
        if (picked.includes(goals[i].m)) continue;
        if (goals[i].st === "no") goals.splice(i, 1); else goals[i].extra = true;
      }
    }
    const stWord = { yes: "ANSWERED", part: "PARTIALLY", no: "NOT ANSWERED" };
    const core = goals.filter((g) => !g.extra);
    // Verdict follows the chosen mission goals (and the impact), not only the point total
    const nYes = core.filter((g) => g.st === "yes").length;
    const nAny = core.filter((g) => g.st !== "no").length;
    const hit = Boolean(impact && impact.hit);
    const verdict = core.length && nYes === core.length && hit ? "FULL SUCCESS"
      : nAny >= Math.min(2, core.length) && nAny > 0 && hit ? "MISSION SUCCESS"
      : nAny >= 1 || hit ? "PARTIAL SUCCESS"
      : "MISSION FAILED";
    el.innerHTML = `
      <div class="panel p3-modal-card report-card">
        <div class="p3-kicker mono">FINAL MISSION REPORT · ${impact && impact.hit ? "IMPACT IN SHOEMAKER CRATER" : impact && impact.crashedInSurvey ? "SPACECRAFT LOST IN SURVEY" : "IMPACT OFF TARGET"}</div>
        <h2>${verdict} · ${total} PTS</h2>
        <canvas id="frPlume" width="760" height="120"></canvas>
        <div class="fr-telescope mono" id="frTele">EARTH TELESCOPES: ANALYSING THE PLUME…</div>
        <div class="fr-grid">
          <div>
            <h3 class="mono">SCIENCE GOALS</h3>
            <ul class="fr-goals">${goals.map((g) => `<li class="${g.st}"><b>${g.extra ? "BONUS" : stWord[g.st]}</b><span>${g.q}</span><small>${g.why}</small></li>`).join("") || "<li>No survey data.</li>"}</ul>
            <h3 class="mono">LUNAR MINERAL LOCATION &amp; DENSITY MAP</h3>
            <canvas id="frMap" width="380" height="230"></canvas>
          </div>
          <div>
            <h3 class="mono">POINTS</h3>
            <table class="fr-points mono">${lines.map((l) => `<tr><td>${l.label}</td><td class="${l.pts < 0 ? "neg" : ""}">${l.pts >= 0 ? "+" : "−"}${Math.abs(l.pts)}</td></tr>`).join("")}<tr class="tot"><td>TOTAL</td><td>${total}</td></tr></table>
            <h3 class="mono">MISSION FACTS</h3>
            <ul class="fr-facts mono">
              <li>Spacecraft: <b>${b.busName || "--"}</b> · ${Math.round(b.scMassKg || 0)} kg · hangar design score ${Math.round(b.designScore || 0)}</li>
              ${sr ? `<li>Survey altitudes: ${Math.round(sr.minAltKm)}–${Math.round(sr.maxAltKm)} km · fuel ${sr.fuelAtHandoffKg.toFixed(1)} → ${sr.fuelKg.toFixed(1)} kg (${sr.burnUsedKg.toFixed(1)} kg on corrections)</li>` : ""}
              ${sr ? `<li>Polar ice: north ${sr.ice.north}, south ${sr.ice.south} · wasted captures ${sr.wastedCaptures}</li>` : ""}
            </ul>
            <p class="fr-history">Real history: on 31 July 1999 NASA crashed Lunar Prospector into a permanently shadowed crater near the south pole, later named Shoemaker. Earth telescopes saw no clear water vapour; NASA's LCROSS impactor confirmed water ice in 2009.</p>
          </div>
        </div>
        <div class="p3-modal-actions"><button class="hud-btn" id="frClose">CLOSE</button><button class="hud-btn green-active" id="frHangar">◀ BACK TO HANGAR</button></div>
      </div>`;
    el.classList.remove("hidden");
    $("frClose").onclick = () => el.classList.add("hidden");
    $("frHangar").onclick = () => { el.classList.add("hidden"); if (window.HangarAPI) window.HangarAPI.returnToHangar(); };
    drawReportMap($("frMap"), sr);
    playPlume($("frPlume"), impact && impact.hit, $("frTele"));
  }

  function drawReportMap(cv, sr) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, cx = 110, cy = H / 2 + 4, R = 78;
    ctx.fillStyle = "#0A0E17"; ctx.fillRect(0, 0, W, H);
    if (window.PlanetArt) window.PlanetArt.drawMoon(ctx, cx, cy, R, Math.PI * 0.8, Math.PI / 2); else { ctx.fillStyle = "#8E939C"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); }
    if (!sr) return;
    ctx.lineWidth = 9;
    for (const r of sr.regions) {
      const a0 = r.centerDeg - 12, a1 = r.centerDeg + 12;
      const col = r.status === "full" || r.status === "partial" ? (ROCKS[r.rock] || { color: "#E8D27A" }).color : "#3A465C";
      ctx.globalAlpha = r.status === "full" ? 1 : r.status === "partial" ? 0.6 : 0.4;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(cx, cy, R + 7, -a1 / DEG, -a0 / DEG); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const [k, c] of [["north", 90], ["south", -90]]) {
      ctx.strokeStyle = sr.ice[k] === "confirmed" ? "#5B8DEF" : "#3A465C"; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(cx, cy, R + 7, -(c + 20) / DEG, -(c - 20) / DEG); ctx.stroke();
    }
    ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.textAlign = "left";
    let y = 18;
    const legend = [["#5B8DEF", "Water ice (pole)"], ...Object.values(ROCKS).map((r) => [r.color, r.name]), ["#3A465C", "No data"]];
    for (const [c, t] of legend) { ctx.fillStyle = c; ctx.fillRect(216, y - 8, 9, 9); ctx.fillStyle = "#E2E8F0"; ctx.fillText(t, 230, y); y += 16; }
    ctx.fillStyle = "#8B9BB4"; ctx.fillText("brighter = denser data", 216, y + 6);
  }

  function playPlume(cv, hit, teleEl) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const parts = [];
    for (let i = 0; i < (hit ? 220 : 90); i++) parts.push({ x: W / 2, y: H - 18, vx: (Math.random() - 0.5) * 120, vy: -(30 + Math.random() * 110), life: 1.5 + Math.random() * 2.5, c: Math.random() < 0.2 && hit ? "#6E9BF0" : ["#B9BCC2", "#8E939C", "#E2E8F0"][(Math.random() * 3) | 0] });
    let t0 = performance.now(), last = t0;
    function fr(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      ctx.fillStyle = "#0A0E17"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4A5468"; ctx.fillRect(0, H - 16, W, 16);
      ctx.fillStyle = "#151C2A"; ctx.fillRect(W / 2 - 60, H - 16, 120, 6);
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt; p.vy += 26 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > H - 16) { p.y = H - 16; p.vy = 0; p.vx *= 0.5; }
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.globalAlpha = 1;
      if (t < 3.2 && document.body.contains(cv)) requestAnimationFrame(fr);
      else if (teleEl) teleEl.textContent = hit
        ? "EARTH TELESCOPES: PLUME ROSE ABOVE THE CRATER RIM — NO CLEAR WATER-VAPOUR SIGNATURE (AS IN 1999)."
        : "EARTH TELESCOPES: IMPACT OUTSIDE THE SHADOWED CRATER — NO ICE IN THE PLUME TO ANALYSE.";
    }
    requestAnimationFrame(fr);
  }

  window.Phase3 = { start, showFinalReport, _state: () => S, _finish: () => S && finish() };
})();
