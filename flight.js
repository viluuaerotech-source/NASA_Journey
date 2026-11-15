/**
 * main.js — LUNAR PROSPECTOR 2D Spaceflight Simulation Game Controller & Renderer
 *
 * Implements:
 *   - 2 to 5 Propulsion Stages with Rigid-Body Rotational Inertia & [S] SAS Stability Assist
 *   - [G] Manual Stage Separation (default) & [AUTO-STAGE] toggle
 *   - [C] / [SPACE] Spin-Pulse Rhythm Bar (Stage 2), [SPACE] Engine Burn, [E] DSN Downlink
 *   - [M] Camera Views (Rocket View / Flight View / Moon Lock / Map View) + [B] Synodic (∞) Co-Rotating Frame
 *   - 0.25x .. 1000x Time Warp ([0]-[6]) + [W] Warp-to-Window & T-45s Auto-Slow
 *   - Smart [R] Retry (restores player organic checkpoint & custom rocket) + [NOMINAL] Stock Reset
 *   - NASA GMAT 1:1 384,400 km 2D Core (Battin 3rd-body, J2+J4, Solar+SRP, Mascons, Relief)
 *
 * MERGED BUILD (Phase 1 hangar ⇄ Phase 2 flight):
 *   - Wrapped in window.createPhase2(); the hangar creates it and calls start() after launch.
 *   - VEHICLE stages come from GameState.build.flight (masses, thrust, Isp, burn compression,
 *     actuator control authority) — the Rocket Lab is replaced by the hangar.
 *   - Vehicle is drawn with the hangar's composite pixel sprites (stack + spacecraft).
 *   - Minimal HUD: Fuel/Propulsion (engine names), Angle, Velocity + Attitude Guidance;
 *     Flight Plan & Controls live in slide-out drawers.
 *   - Out of propellant → non-blocking ABORT / CONTINUE DRIFTING choice (no auto-fail).
 *   - Physics audit: drag on for the whole ascent with stack Cd·A, leftover stage
 *     propellant kept at orbit insertion, staging during TLI, consistent Δv bookkeeping.
 */
window.createPhase2 = function () {
  "use strict";

  const isFlightActive = () => !window.GameState || window.GameState.phase === "flight";

  const P = window.LunarPhysics;
  const CFG = P.GMAT_CONFIG;

  // ===========================================================================
  // 1. CANVAS & DOM REFERENCES
  // ===========================================================================
  const canvas = document.getElementById("simCanvas");
  const ctx = canvas.getContext("2d");

  const $id = (id) => document.getElementById(id);
  const dom = {
    missionLed: document.getElementById("missionLed"),
    met: document.getElementById("hudMet"),
    stageLabel: document.getElementById("hudStageLabel"),
    earthRad: document.getElementById("hudEarthRad"),
    atmPx: document.getElementById("hudAtmPx"),

    btnRocketView: document.getElementById("btnRocketView"),
    btnViewToggle: document.getElementById("btnViewToggle"),
    btnFrameToggle: document.getElementById("btnFrameToggle"),
    btnZoomIn: document.getElementById("btnZoomIn"),
    btnZoomOut: document.getElementById("btnZoomOut"),
    btnWarpToWindow: document.getElementById("btnWarpToWindow"),
    btnAutoAim: document.getElementById("btnAutoAim"),
    btnSasToggle: document.getElementById("btnSasToggle"),
    btnTutorial: document.getElementById("btnTutorial"),
    btnPause: document.getElementById("btnPause"),
    btnRetryStage: document.getElementById("btnRetryStage"),
    btnResetNominal: document.getElementById("btnResetNominal"),
    stageJumpSelect: document.getElementById("stageJumpSelect"),
    warpButtons: Array.from(document.querySelectorAll(".warp-btn")),

    fidoWindowBadge: document.getElementById("fidoWindowBadge"),
    fidoPitchBadge: document.getElementById("fidoPitchBadge"),
    fidoBurnBadge: document.getElementById("fidoBurnBadge"),
    fidoWarpBadge: document.getElementById("fidoWarpBadge"),
    fidoDirectiveText: document.getElementById("fidoDirectiveText"),
    fidoCutoffStatus: document.getElementById("fidoCutoffStatus"),
    barBurnProgress: document.getElementById("barBurnProgress"),

    rhythmBarBox: document.getElementById("rhythmBarBox"),
    rhythmZoneBadge: document.getElementById("rhythmZoneBadge"),
    rhythmErrReadout: document.getElementById("rhythmErrReadout"),
    rhythmCursor: document.getElementById("rhythmCursor"),
    rhythmHintText: document.getElementById("rhythmHintText"),
    stagingPromptBanner: document.getElementById("stagingPromptBanner"),
    terrainHazardBanner: document.getElementById("terrainHazardBanner"),
    dsnCardBlock: document.getElementById("dsnCardBlock"),
    gmatCoreDrawer: document.getElementById("gmatCoreDrawer"),
    flightControlsDrawer: document.getElementById("flightControlsDrawer"),

    kspAltBody: document.getElementById("kspAltBody"),
    kspAltValue: document.getElementById("kspAltValue"),
    kspAtmoBadge: document.getElementById("kspAtmoBadge"),
    kspVertSpeed: document.getElementById("kspVertSpeed"),
    kspApoReadout: document.getElementById("kspApoReadout"),
    kspPeriReadout: document.getElementById("kspPeriReadout"),
    blackoutBanner: document.getElementById("blackoutBanner"),
    impactBanner: document.getElementById("impactCorridorBanner"),

    activeStageBadge: document.getElementById("activeStageBadge"),
    deltaV: document.getElementById("hudDeltaV"),
    dynamicStageBars: document.getElementById("dynamicStageBars"),
    s1FuelPct: document.getElementById("hudS1FuelPct"),
    barS1Fuel: document.getElementById("barS1Fuel"),
    s2FuelPct: document.getElementById("hudS2FuelPct"),
    barS2Fuel: document.getElementById("barS2Fuel"),
    mass: document.getElementById("hudMass"),
    thrustState: document.getElementById("hudThrustState"),
    trimMode: document.getElementById("hudTrimMode"),
    spinRate: document.getElementById("hudSpinRate"),

    alignStatus: document.getElementById("hudAlignStatus"),
    scHeading: document.getElementById("hudScHeading"),
    targetHeading: document.getElementById("hudTargetHeading"),
    turnCue: document.getElementById("hudTurnCue"),
    headingErr: document.getElementById("hudHeadingErr"),
    phaseLead: document.getElementById("hudPhaseLead"),
    altEarth: document.getElementById("hudAltEarth"),
    vel: document.getElementById("hudVel"),
    distMoon: document.getElementById("hudDistMoon"),
    predPeri: document.getElementById("hudPredPeri"),

    centralBody: document.getElementById("hudCentralBody"),
    apoapsis: document.getElementById("hudApoapsis"),
    periapsis: document.getElementById("hudPeriapsis"),
    ecc: document.getElementById("hudEcc"),
    rho: document.getElementById("hudRho"),
    moonPerturb: document.getElementById("hudMoonPerturb"),
    earthHelioV: document.getElementById("hudEarthHelioV"),
    hudDynPress: document.getElementById("hudDynPress"),
    hudLossDv: document.getElementById("hudLossDv"),
    hudBPlane: document.getElementById("hudBPlane"),
    hudDistScale: document.getElementById("hudDistScale"),

    dsnPill: document.getElementById("hudDsnPill"),
    dsnStatus: document.getElementById("hudDsnStatus"),
    bufferPct: document.getElementById("hudBufferPct"),
    barBuffer: document.getElementById("barBuffer"),
    scorePct: document.getElementById("hudScorePct"),
    barScore: document.getElementById("barScore"),
    btnDownlink: document.getElementById("btnDownlink"),
    downlinkHint: document.getElementById("downlinkHint"),
    scaleReadout: document.getElementById("hudScaleReadout"),
    flightPlanItems: Array.from(document.querySelectorAll("#flightPlanList li")),

    modal: document.getElementById("missionModal"),
    modalBadge: document.getElementById("modalBadge"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalStats: document.getElementById("modalStats"),
    btnModalRetryStage: document.getElementById("btnModalRetryStage"),
    btnModalRestartAll: document.getElementById("btnModalRestartAll"),
    btnModalHangar: document.getElementById("btnModalHangar"),
    btnHangar: document.getElementById("btnHangar"),
    fuelOutPrompt: document.getElementById("fuelOutPrompt"),
    fuelOutText: document.getElementById("fuelOutText"),
    btnFuelAbort: document.getElementById("btnFuelAbort"),
    btnFuelDrift: document.getElementById("btnFuelDrift"),

    tutorialModal: document.getElementById("tutorialModal"),
    tutTabs: Array.from(document.querySelectorAll("#tutTabs button")),
    tutContent: document.getElementById("tutContent"),
    btnTutClose: document.getElementById("btnTutClose"),

  };

  // ===========================================================================
  // 2. PRE-CALCULATE GOLDEN TRAJECTORY & STARFIELD
  // ===========================================================================
  const goldenRef = P.precalculateGoldenTrajectory();

  const stars = Array.from({ length: 280 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.4,
    alpha: 0.25 + Math.random() * 0.65
  }));

  // ===========================================================================
  // 3. MULTI-STAGE VEHICLE PRESETS (2 TO 5 STAGES) & DYNAMIC STACK
  // ===========================================================================
  // Fallback vehicle (only used if Phase 2 is opened without a hangar build)
  const FALLBACK_STAGES = [
    { name: "STAGE 1 CORE", engine: "Generic core", role: "S1", dryKg: 2400.0, fuelMaxKg: 34000.0, thrustN: 760000.0, ispS: 315.0, lengthM: 17.0, diamM: 2.8 },
    { name: "STAGE 2 SUSTAINER", engine: "Generic sustainer", role: "S2", dryKg: 600.0, fuelMaxKg: 9800.0, thrustN: 220000.0, ispS: 365.0, lengthM: 10.0, diamM: 2.1 },
    { name: "PROSPECTOR BUS", engine: "Generic bus", role: "S/C", dryKg: 150.0, fuelMaxKg: 950.0, thrustN: 22000.0, ispS: 315.0, lengthM: 3.2, diamM: 1.4 }
  ];

  function cloneStageSpecs(arr) {
    return arr.map((st) => ({ ...st }));
  }

  function getBuild() {
    return window.GameState && window.GameState.build ? window.GameState.build : null;
  }

  /** Phase 1 → Phase 2 sync: flight stages straight from the hangar's model. */
  function loadVehicleFromBuild() {
    const b = getBuild();
    return b && b.flight && Array.isArray(b.flight.stages) && b.flight.stages.length >= 2
      ? cloneStageSpecs(b.flight.stages)
      : cloneStageSpecs(FALLBACK_STAGES);
  }

  const VEHICLE = {
    stages: loadVehicleFromBuild(),
    PULSE_DV_KMS: 0.003,
    SPIN_OMEGA_RAD_S: 4.5,
    RHYTHM_SPIN_OMEGA_RAD_S: 1.05, // Smooth readable ~6s period in Stage 2 fine-trim bar
    TURN_RATE_RAD_S: 1.85
  };

  // Preserve full API & test compatibility (DEF-308, etc.) via array-backed S1_* & S2_* properties
  Object.defineProperties(VEHICLE, {
    S1_DRY_KG: {
      get: () => VEHICLE.stages[0].dryKg,
      set: (v) => { VEHICLE.stages[0].dryKg = v; }
    },
    S1_FUEL_MAX_KG: {
      get: () => VEHICLE.stages[0].fuelMaxKg,
      set: (v) => { VEHICLE.stages[0].fuelMaxKg = v; }
    },
    S1_THRUST_N: {
      get: () => VEHICLE.stages[0].thrustN,
      set: (v) => { VEHICLE.stages[0].thrustN = v; }
    },
    S1_ISP_S: {
      get: () => VEHICLE.stages[0].ispS,
      set: (v) => { VEHICLE.stages[0].ispS = v; }
    },
    S2_DRY_KG: {
      get: () => VEHICLE.stages[VEHICLE.stages.length - 1].dryKg,
      set: (v) => { VEHICLE.stages[VEHICLE.stages.length - 1].dryKg = v; }
    },
    S2_FUEL_MAX_KG: {
      get: () => VEHICLE.stages[VEHICLE.stages.length - 1].fuelMaxKg,
      set: (v) => { VEHICLE.stages[VEHICLE.stages.length - 1].fuelMaxKg = v; }
    },
    S2_THRUST_N: {
      get: () => VEHICLE.stages[VEHICLE.stages.length - 1].thrustN,
      set: (v) => { VEHICLE.stages[VEHICLE.stages.length - 1].thrustN = v; }
    },
    S2_ISP_S: {
      get: () => VEHICLE.stages[VEHICLE.stages.length - 1].ispS,
      set: (v) => { VEHICLE.stages[VEHICLE.stages.length - 1].ispS = v; }
    }
  });

  function buildFlightStagesFromVehicle(initialFuelFrac = 1.0) {
    return VEHICLE.stages.map((spec) => ({
      name: spec.name,
      engine: spec.engine || spec.name,
      role: spec.role || "",
      burnComp: spec.burnComp || 1,
      realThrustN: spec.realThrustN || spec.thrustN,
      dryKg: spec.dryKg,
      fuelMaxKg: spec.fuelMaxKg,
      fuelKg: spec.fuelMaxKg * initialFuelFrac,
      thrustN: spec.thrustN,
      ispS: spec.ispS,
      lengthM: spec.lengthM || 8.0,
      diamM: spec.diamM || 2.0,
      jettisoned: false
    }));
  }

  // ===========================================================================
  // 4. GAME & SIMULATION STATE
  // ===========================================================================
  const input = {
    left: false,
    right: false,
    burnHeld: false,
    throttleLatched: false,
    shiftSpaceHeld: false,
    shiftDown: false,
    spaceDown: false,
    spaceDownAtMs: 0,
    spaceHoldPromoted: false
  };

  /** Stage 3 assist level chosen on the opening menu: 'cadet' (perilune-hold auto-aim) or 'commander'. */
  function getAssistMode() {
    const m = window.GameState && window.GameState.assistMode;
    return m === "commander" ? "commander" : "cadet";
  }
  /** Unit direction (in velocity space) that raises the lunar perilune fastest — numerical gradient of rp. */
  function periRaiseDir(rx, ry, vx, vy) {
    const e = 1e-4;
    const f = (a, b) => P.cartesianToKeplerian2D(rx, ry, a, b, CFG.MU_MOON).rp;
    const gx = (f(vx + e, vy) - f(vx - e, vy)) / (2 * e);
    const gy = (f(vx, vy + e) - f(vx, vy - e)) / (2 * e);
    const n = Math.hypot(gx, gy);
    return n > 0 && Number.isFinite(n) ? [gx / n, gy / n] : [rx / Math.hypot(rx, ry), ry / Math.hypot(rx, ry)];
  }
  /** Reference body for attitude markers: the Moon once near it (or from Stage 3), otherwise the Earth. */
  function attitudeFrame() {
    const s = sim.sc, m = P.getMoonStateAtTime(sim.simTimeSec);
    const dMoon = Math.hypot(s.rx - m[0], s.ry - m[1]);
    const moon = sim.currentStage >= 3 || dMoon < (CFG.MOON_SOI || 66100);
    const rx = moon ? s.rx - m[0] : s.rx, ry = moon ? s.ry - m[1] : s.ry;
    const vx = moon ? s.vx - m[2] : s.vx, vy = moon ? s.vy - m[3] : s.vy;
    return { moon, rx, ry, vx, vy, up: Math.atan2(ry, rx), pro: Math.atan2(vy, vx), speed: Math.hypot(vx, vy) };
  }
  /** Heading auto-aim should hold: a KSP-style hold mode from the dial, or the guidance target. */
  function holdTargetHeading() {
    const m = sim.holdMode;
    if (!m || m === "guide") return sim.fido.targetHeadingRad;
    const fr = attitudeFrame();
    if (m === "pro") return fr.pro;
    if (m === "retro") return P.normalizeAngleRad(fr.pro + Math.PI);
    if (m === "rout") return fr.up;
    if (m === "rin") return P.normalizeAngleRad(fr.up + Math.PI);
    return sim.fido.targetHeadingRad;
  }
  /* ---------- 2D ATTITUDE DIAL (bottom-left, every camera) ----------
     Honest 2D version of KSP's navball: the disc is the local sky (top) and ground (bottom) of the body
     you orbit; rim markers show prograde ⊕, retrograde ⊗, radial-out ⊙, radial-in ⦿ and the guidance
     target ▼; the yellow needle is your nose. Hold buttons make auto-aim track one of them.          */
  const dial = { cv: null, ctx: null, built: false, speedMode: "orbit" };
  function buildDial() {
    dial.built = true;
    dial.cv = document.getElementById("dialCanvas");
    if (!dial.cv) return;
    dial.ctx = dial.cv.getContext("2d");
    const holds = document.getElementById("dialHolds");
    if (holds) holds.addEventListener("click", (e) => {
      const b = e.target.closest("[data-hold]"); if (!b) return;
      const m = b.dataset.hold;
      if (m === "free") toggleAutoAim(false);
      else { sim.holdMode = m === "guide" ? null : m; toggleAutoAim(true); sim.manualOverrideUntilMs = 0; }
      b.blur();
    });
    const sp = document.getElementById("dialSpeed");
    if (sp) sp.addEventListener("click", (e) => { dial.speedMode = dial.speedMode === "orbit" ? "surface" : "orbit"; e.currentTarget.blur(); });
  }
  function drawAttitudeDial() {
    if (!dial.built) buildDial();
    const g = dial.ctx; if (!g) return;
    const s = sim.sc, fr = attitudeFrame();
    const N = dial.cv.width, c = N / 2, R = c - 3;
    const tilt = (h) => -P.normalizeAngleRad(h - fr.up);           // screen-clockwise angle from "up"
    const at = (h, r) => { const t = tilt(h); return [c + Math.sin(t) * r, c - Math.cos(t) * r]; };
    g.clearRect(0, 0, N, N);
    g.imageSmoothingEnabled = false;
    // sky / ground halves
    g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#1E3A8A"; g.fillRect(0, 0, N, c);
    g.fillStyle = fr.moon ? "#4B4F5C" : "#5B3A1E"; g.fillRect(0, c, N, c);
    g.fillStyle = "rgba(226,232,240,.75)"; g.fillRect(3, c - 1, N - 6, 2);  // horizon
    for (let k = 1; k < 6; k++) { const y = c - k * R / 6; g.fillStyle = "rgba(226,232,240,.18)"; g.fillRect(c - 6, Math.round(y), 12, 1); g.fillRect(c - 6, Math.round(2 * c - y), 12, 1); }
    g.restore();
    g.strokeStyle = "#38BDF8"; g.lineWidth = 2; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    // rim markers
    const px = (x, y, w, col) => { g.fillStyle = col; g.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w); };
    const ring = (x, y, col, filled) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke(); if (filled) px(x, y, 4, col); };
    const rm = R - 8;
    let [x, y] = at(fr.pro, rm); ring(x, y, "#A3E635", false); px(x, y, 2, "#A3E635"); px(x, y - 8, 2, "#A3E635"); px(x - 8, y, 2, "#A3E635"); px(x + 8, y, 2, "#A3E635");
    [x, y] = at(fr.pro + Math.PI, rm); ring(x, y, "#F59E0B", false); g.strokeStyle = "#F59E0B"; g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3); g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3); g.stroke();
    [x, y] = at(fr.up, rm); ring(x, y, "#22D3EE", false);
    [x, y] = at(fr.up + Math.PI, rm); ring(x, y, "#22D3EE", true);
    if (Number.isFinite(sim.fido.targetHeadingRad)) {
      const t = tilt(sim.fido.targetHeadingRad);
      g.save(); g.translate(c, c); g.rotate(t); g.fillStyle = "#E879F9";
      g.beginPath(); g.moveTo(0, -R + 1); g.lineTo(-6, -R - 6 + 14); g.lineTo(6, -R - 6 + 14); g.closePath(); g.fill(); g.restore();
    }
    // nose needle + craft chevron
    g.save(); g.translate(c, c); g.rotate(tilt(s.headingRad));
    g.fillStyle = "#FDE047"; g.fillRect(-2, -R + 6, 4, R - 8);
    g.beginPath(); g.moveTo(0, -R + 2); g.lineTo(-6, -R + 12); g.lineTo(6, -R + 12); g.closePath(); g.fill();
    g.fillStyle = "#0A0E17"; g.fillRect(-5, -2, 10, 4); g.fillStyle = "#FDE047"; g.fillRect(-9, -1, 4, 2); g.fillRect(5, -1, 4, 2);
    g.restore();

    // DOM readouts (cheap: only text/width changes)
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
    let spd = fr.speed;
    if (dial.speedMode === "surface") {
      const w = fr.moon ? 2.6617e-6 : CFG.OMEGA_EARTH;
      spd = Math.hypot(fr.vx + w * fr.ry, fr.vy - w * fr.rx);
    }
    set("dialSpeed", `${dial.speedMode === "orbit" ? "ORBIT" : "SURFACE"} ${spd.toFixed(2)} km/s`);
    set("dialStage", `STG ${s.activeStageIdx + 1}/${s.stages.length}`);
    set("dialG", `${(s.lastGLoad || 0).toFixed(1)} G`);
    const mu = fr.moon ? CFG.MU_MOON : CFG.MU_EARTH, Rb = fr.moon ? CFG.R_MOON : CFG.R_EARTH;
    const k = P.cartesianToKeplerian2D(fr.rx, fr.ry, fr.vx, fr.vy, mu);
    const fmtA = (v) => (!Number.isFinite(v) ? "∞" : Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
    set("dialPe", `PE ${fmtA(k.rp - Rb)} km`);
    set("dialAp", `AP ${k.energy < 0 ? fmtA(k.ra - Rb) : "∞"} km`);
    set("dialBody", fr.moon ? "MOON" : "EARTH");
    const thr = s.isThrusting ? (input.shiftSpaceHeld ? 25 : 100) : 0;
    const fill = document.getElementById("dialThrFill"); if (fill) fill.style.height = thr + "%";
    const active = !sim.autoAim ? "free" : (sim.holdMode || "guide");
    document.querySelectorAll("#dialHolds [data-hold]").forEach((b) => b.classList.toggle("on", b.dataset.hold === active));
  }

  /** Science-orbit apolune target: inside the full-data band (≤150 km), or just above a high perilune. */
  function loiTargetApKm(periAltKm) {
    return Math.max(150.0, (Number.isFinite(periAltKm) ? periAltKm : 0) + 15.0);
  }

  function clearThrottleLatch() {
    input.throttleLatched = false;
    input.shiftSpaceHeld = false;
    input.burnHeld = false;
    input.spaceDown = false;
    input.spaceHoldPromoted = false;
  }

  const ZOOM_MIN_KM_PER_PX = 0.0008;
  const ZOOM_MAX_KM_PER_PX = 2500.0;
  const ROCKET_FADE_FULL_KM_PER_PX = 0.005;
  const ROCKET_FADE_ZERO_KM_PER_PX = 0.06;

  function getRocketCrossFadeAlpha(scaleKmPerPx) {
    const sc = Math.max(1e-6, Number.isFinite(scaleKmPerPx) ? scaleKmPerPx : 1.0);
    if (sc <= ROCKET_FADE_FULL_KM_PER_PX) return 1.0;
    if (sc >= ROCKET_FADE_ZERO_KM_PER_PX) return 0.0;
    const t =
      (Math.log(sc) - Math.log(ROCKET_FADE_FULL_KM_PER_PX)) /
      (Math.log(ROCKET_FADE_ZERO_KM_PER_PX) - Math.log(ROCKET_FADE_FULL_KM_PER_PX));
    const s = P.clamp(t, 0.0, 1.0);
    return 1.0 - s * s * (3.0 - 2.0 * s);
  }

  const camera = {
    mode: "flight", // "rocket" | "flight" | "moon" | "map"
    refFrame: "inertial", // "inertial" | "synodic"
    xKm: 0,
    yKm: 0,
    targetXKm: 0,
    targetYKm: 0,
    scaleKmPerPx: CFG.FLIGHT_VIEW_KM_PER_PX,
    targetScaleKmPerPx: CFG.FLIGHT_VIEW_KM_PER_PX,
    // Local-horizon camera: screen rotation (rad, CCW) so "up" (away from Earth/Moon) is screen-up
    // when zoomed in, blending back to the fixed north-up view when zoomed out. DISPLAY ONLY.
    rotRad: 0,
    targetRotRad: 0,
    manualZoomFactor: 1.0,
    rocketAlpha: 0,
    panOffsetXKm: 0,
    panOffsetYKm: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
  };

  const scStateObj = {
    rx: 0,
    ry: 0,
    vx: 0,
    vy: 0,
    headingRad: 0,
    omegaRadS: 0.0,
    spinPhaseRad: 0,
    activeStageIdx: 0,
    stages: buildFlightStagesFromVehicle(1.0),
    fineTrimMode: false,
    isThrusting: false,
    pulseFlashTimer: 0,
    rhythmFeedbackTimer: 0,
    rhythmFeedbackText: "",
    lastRho: 0,
    lastDragAccel: 0,
    lastDynPressPa: 0,
    maxDynPressPa: 0,
    lastHeatFluxKwM2: 0,
    lastGLoad: 1.0,
    gravityLossMs: 0,
    dragLossMs: 0
  };

  // Array-backed legacy properties on sim.sc for 100% compatibility
  Object.defineProperties(scStateObj, {
    stage1Attached: {
      get: () => scStateObj.activeStageIdx < scStateObj.stages.length - 1,
      set: (attached) => {
        const lastIdx = scStateObj.stages.length - 1;
        if (!attached) {
          for (let i = 0; i < lastIdx; i++) {
            scStateObj.stages[i].jettisoned = true;
            scStateObj.stages[i].fuelKg = 0;
          }
          scStateObj.activeStageIdx = lastIdx;
        } else {
          for (let i = 0; i < scStateObj.stages.length; i++) {
            scStateObj.stages[i].jettisoned = false;
          }
          scStateObj.activeStageIdx = 0;
        }
      }
    },
    stage1FuelKg: {
      get: () => {
        const idx = scStateObj.activeStageIdx;
        if (idx >= scStateObj.stages.length - 1) return 0;
        return scStateObj.stages[idx] ? scStateObj.stages[idx].fuelKg : 0;
      },
      set: (val) => {
        const idx = scStateObj.activeStageIdx;
        if (idx < scStateObj.stages.length - 1 && scStateObj.stages[idx]) {
          scStateObj.stages[idx].fuelKg = Math.max(0, val);
        }
      }
    },
    stage2FuelKg: {
      get: () => {
        const bus = scStateObj.stages[scStateObj.stages.length - 1];
        return bus ? bus.fuelKg : 0;
      },
      set: (val) => {
        const bus = scStateObj.stages[scStateObj.stages.length - 1];
        if (bus) bus.fuelKg = Math.max(0, val);
      }
    }
  });

  const sim = {
    simTimeSec: 0,
    moonEpochTheta0: 0,
    paused: false,
    timeWarp: 1,
    warpingToWindow: false,
    autoSlowNoticeTimer: 0,
    autoAim: true,
    sasEnabled: true,
    mccLocked: false,
    vehicle: VEHICLE,
    tliEpochMoonAngle: null,
    committedTliPoints: null,
    minDMoon: Infinity,
    lockedMccHeadingRad: null,
    isAlignedState: true,
    predColorState: "amber",
    lastMccComputeTime: -999,
    lastMccWallMs: -9999,
    lastPredictWallMs: -9999,
    lastAscentPlanWallMs: -9999,
    liveAscentPlan: null,
    lastTliPlanWallMs: -9999,
    lastStage4WallMs: -9999,
    liveTliPlan: null,
    autoCutoffNoticeTimer: 0,
    hasAutoCutStage2Once: false,
    warpBurnFuelUsedPct: 0,
    fuelSafetyLockout: false,
    stage1FuelGuardTriggered: false,
    lastUnrecoverableCheckMs: -9999,
    fuelSafetyBannerTimer: 0,
    fuelSafetyBannerText: "",
    stage2BurnedDvMs: 0,
    stage2TargetDvMs: 0,
    lastCutoffReason: "",
    effectiveBurnWarp: 1,
    burnAttitudeLockRad: null,   // FIX #4: fixed inertial attitude held for the current burn
    manualOverrideUntilMs: 0,    // FIX #4: A/D pauses Auto-Aim briefly instead of disabling it
    attitudeGate: 1.0,           // FIX #4: thrust fraction allowed by alignment (0..1)
    fuelWarnLatch: {},           // FIX #2: one-shot fuel warnings, keyed per mission stage
    resumeBurnAfterStaging: false, // FIX #2: re-light next booster automatically after [G]
    mccDirty: true,
    cachedMcc: null,
    stage2TcmPlan: null,
    _lastAutoMcc: null,
    lastStage1PeMarkerDrawn: false,
    currentStage: 1, // 1, 2, 3, 4
    subPhase: "LAUNCH_PAD",
    outcome: null, // null | "abort" | "victory"

    userCheckpoints: { 1: null, 2: null, 3: null, 4: null },

    timerState: {
      label: "LAUNCH",
      tRemSec: 0,
      burnDurSec: 0,
      isBurnNow: true,
      isPast: false
    },

    sc: scStateObj,

    trail: [],
    jettisonedBooster: null,
    debrisList: [],
    downlinkBeamTimer: 0,
    predictor: null,
    fido: {
      whenText: "LAUNCH READY",
      burnNow: true,
      downlinkReady: false,
      targetHeadingRad: 0,
      neededDvMs: 0,
      maxBurnDvMs: 9200,
      directive: "",
      correctionNodePos: null,
      deorbitTargetHeadingRad: 0
    },

    fuelOut: "none", // "none" | "shown" | "dismissed" — out-of-propellant player choice
    dsnBlocked: false,
    scienceBufferPct: 0,
    scienceScorePct: 0,
    lastPredictTime: -999,
    frameCount: 0
  };

  function setMoonEpochAngle(thetaRad) {
    sim.moonEpochTheta0 = thetaRad;
    P.setInitialMoonAngle(thetaRad);
  }

  // ===========================================================================
  // 5. MASS, INERTIA & DELTA-V HELPERS (GMAT Multi-Stage + Rigid Body)
  // ===========================================================================
  function getActiveStage() {
    const s = sim.sc;
    return s.stages[P.clamp(s.activeStageIdx, 0, s.stages.length - 1)];
  }

  function getTotalMassKg() {
    let m = 0;
    for (let i = sim.sc.activeStageIdx; i < sim.sc.stages.length; i++) {
      const st = sim.sc.stages[i];
      if (!st.jettisoned) m += st.dryKg + Math.max(0, st.fuelKg);
    }
    return Math.max(50, m);
  }

  function getStackHeightMeters() {
    let h = 0;
    for (let i = sim.sc.activeStageIdx; i < sim.sc.stages.length; i++) {
      const st = sim.sc.stages[i];
      if (!st.jettisoned) h += st.lengthM || 6.0;
    }
    return Math.max(2.5, h);
  }

  function getStackMomentOfInertiaKgM2() {
    // Slender multi-cylinder moment of inertia I = sum m_i (L_i^2 / 12 + (z_i - z_cm)^2)
    const parts = [];
    let zBottom = 0;
    let totalM = 0;
    let mZ = 0;
    for (let i = sim.sc.activeStageIdx; i < sim.sc.stages.length; i++) {
      const st = sim.sc.stages[i];
      if (st.jettisoned) continue;
      const m = Math.max(10, st.dryKg + Math.max(0, st.fuelKg));
      const L = st.lengthM || 6.0;
      const zCenter = zBottom + L * 0.5;
      parts.push({ m, L, zCenter });
      totalM += m;
      mZ += m * zCenter;
      zBottom += L;
    }
    if (parts.length === 0 || totalM <= 0) return 350.0;
    const zCm = mZ / totalM;
    let moi = 0;
    for (const p of parts) {
      const dz = p.zCenter - zCm;
      moi += p.m * ((p.L * p.L) / 12.0 + dz * dz);
    }
    return Math.max(250.0, moi);
  }

  /**
   * Aerodynamic Cd·A (m²) of whatever is still attached. Slender launch stack: Cd ≈ 0.5 on the
   * widest section (fairing rides with stage 1); bare spacecraft: Cd 2.2 (GMAT default) on its face.
   */
  function getStackCdA() {
    const s = sim.sc;
    const last = s.stages.length - 1;
    if (s.activeStageIdx >= last) {
      const w = s.stages[last].diamM || 1.4;
      return 2.2 * w * w * 0.8;
    }
    let dMax = 0;
    for (let i = s.activeStageIdx; i <= last; i++) dMax = Math.max(dMax, s.stages[i].diamM || 2.0);
    const b = getBuild();
    if (s.activeStageIdx === 0 && b && b.flight && b.flight.fairingDiaM) dMax = Math.max(dMax, b.flight.fairingDiaM);
    return 0.5 * Math.PI * (dMax * 0.5) * (dMax * 0.5);
  }

  /** Bus propellant left after spending dvMs from a full tank (Tsiolkovsky) — used for stage jumps. */
  function nominalBusFuelKg(dvMs) {
    const bus = sim.sc.stages[sim.sc.stages.length - 1];
    const ve = Math.max(1, bus.ispS * CFG.G0_MS2);
    const m0 = bus.dryKg + bus.fuelMaxKg;
    const m1 = m0 / Math.exp(dvMs / ve);
    return P.clamp(m1 - bus.dryKg, bus.fuelMaxKg * 0.15, bus.fuelMaxKg);
  }

  function getRemainingFuelKg() {
    let f = 0;
    for (let i = sim.sc.activeStageIdx; i < sim.sc.stages.length; i++) {
      const st = sim.sc.stages[i];
      if (!st.jettisoned && st.thrustN > 0) f += Math.max(0, st.fuelKg);
    }
    return f;
  }

  function computeRemainingDeltaVMs(stagesArr = null) {
    const arr = stagesArr || sim.sc.stages;
    const startIdx = stagesArr ? 0 : sim.sc.activeStageIdx;
    let totalDv = 0;
    for (let i = startIdx; i < arr.length; i++) {
      const st = arr[i];
      if (st.jettisoned) continue;
      const fuel = st.fuelKg != null ? st.fuelKg : st.fuelMaxKg;
      if (fuel <= 0.01) continue;
      let upperMass = 0;
      for (let j = i + 1; j < arr.length; j++) {
        if (!arr[j].jettisoned) {
          upperMass += arr[j].dryKg + (arr[j].fuelKg != null ? arr[j].fuelKg : arr[j].fuelMaxKg);
        }
      }
      const m0 = st.dryKg + fuel + upperMass;
      const m1 = st.dryKg + upperMass;
      if (m1 > 0 && m0 > m1) {
        totalDv += st.ispS * CFG.G0_MS2 * Math.log(m0 / m1);
      }
    }
    return totalDv;
  }

  function consumeStage2Impulse(dvKms) {
    const s = sim.sc;
    if (s.stage1Attached) return 0;
    const bus = s.stages[s.stages.length - 1];
    if (bus.fuelKg <= 0.01) return 0;
    const mTotal = bus.dryKg + bus.fuelKg;
    const veKms = (bus.ispS * CFG.G0_MS2) / 1000.0;
    const maxDvKms = veKms * Math.log(mTotal / Math.max(10, bus.dryKg));
    const actualDv = Math.min(dvKms, maxDvKms);
    if (actualDv <= 1e-7) return 0;

    {
      const dm = mTotal * (1.0 - Math.exp(-actualDv / veKms));
      bus.fuelKg = Math.max(0.0, bus.fuelKg - dm);
    }
    s.vx += actualDv * Math.cos(s.headingRad);
    s.vy += actualDv * Math.sin(s.headingRad);
    sim.mccDirty = true;
    return actualDv;
  }

  // ===========================================================================
  // 6. STAGE INITIALIZATION & ORGANIC USER CHECKPOINTS
  // ===========================================================================
  function captureStageCheckpoint(stageNum) {
    const s = sim.sc;
    sim.userCheckpoints[stageNum] = {
      simTimeSec: sim.simTimeSec,
      moonEpochTheta0: sim.moonEpochTheta0,
      tliEpochMoonAngle: sim.tliEpochMoonAngle,
      committedTliPoints: sim.committedTliPoints ? sim.committedTliPoints.map((p) => ({ ...p })) : null,
      currentStage: stageNum,
      subPhase: sim.subPhase,
      scienceBufferPct: sim.scienceBufferPct,
      scienceScorePct: sim.scienceScorePct,
      sc: {
        rx: s.rx,
        ry: s.ry,
        vx: s.vx,
        vy: s.vy,
        headingRad: s.headingRad,
        omegaRadS: 0.0,
        spinPhaseRad: s.spinPhaseRad,
        activeStageIdx: s.activeStageIdx,
        stages: s.stages.map((st) => ({ ...st })),
        fineTrimMode: s.fineTrimMode,
        gravityLossMs: s.gravityLossMs,
        dragLossMs: s.dragLossMs,
        maxDynPressPa: s.maxDynPressPa
      }
    };
  }

  function restoreStageCheckpoint(cp) {
    if (!cp) return false;
    resetCommonState();
    sim.currentStage = cp.currentStage;
    sim.subPhase = cp.subPhase;
    sim.simTimeSec = cp.simTimeSec;
    setMoonEpochAngle(cp.moonEpochTheta0 || 0.0);
    sim.tliEpochMoonAngle = cp.tliEpochMoonAngle;
    sim.committedTliPoints = cp.committedTliPoints ? cp.committedTliPoints.map((p) => ({ ...p })) : null;
    sim.scienceBufferPct = cp.scienceBufferPct;
    sim.scienceScorePct = cp.scienceScorePct;

    const s = sim.sc;
    s.rx = cp.sc.rx;
    s.ry = cp.sc.ry;
    s.vx = cp.sc.vx;
    s.vy = cp.sc.vy;
    s.headingRad = cp.sc.headingRad;
    s.omegaRadS = 0.0;
    s.spinPhaseRad = cp.sc.spinPhaseRad;
    s.activeStageIdx = cp.sc.activeStageIdx;
    s.stages = cp.sc.stages.map((st) => ({ ...st }));
    s.fineTrimMode = cp.sc.fineTrimMode;
    s.gravityLossMs = cp.sc.gravityLossMs || 0;
    s.dragLossMs = cp.sc.dragLossMs || 0;
    s.maxDynPressPa = cp.sc.maxDynPressPa || 0;

    dom.stageJumpSelect.value = String(sim.currentStage);
    setCameraMode(sim.currentStage === 2 ? "map" : sim.currentStage >= 3 ? "moon" : "flight", true);
    refreshPredictor(true);
    updateFidoGuidance(true);
    updateHUD();
    return true;
  }

  function retryCurrentStage() {
    sim.loiPlan = null; sim.loiRescue = false; sim.loiSafetyHold = false; sim.loiAcceptRequested = false; sim._prevPeriAlt = null;
    const cp = sim.userCheckpoints[sim.currentStage];
    if (sim.currentStage > 1 && cp) {
      restoreStageCheckpoint(cp);
    } else {
      initStage(sim.currentStage);
    }
  }

  function resetNominalStage() {
    sim.userCheckpoints[sim.currentStage] = null;
    sim.committedTliPoints = null;
    initStage(sim.currentStage);
  }

  function resetCommonState() {
    sim.simTimeSec = 0;
    sim.paused = false;
    sim.warpingToWindow = false;
    setTimeWarp(1);
    sim.outcome = null;
    sim.trail = [];
    sim.jettisonedBooster = null;
    sim.debrisList = [];
    sim.downlinkBeamTimer = 0;
    sim.lastPredictTime = -999;
    sim.lastPredictWallMs = -9999;
    sim.lastMccComputeTime = -999;
    sim.lastMccWallMs = -9999;
    sim.lastAscentPlanWallMs = -9999;
    sim.liveAscentPlan = null;
    sim._ascentTliCache = null;
    sim._tliPlanImmediate = undefined;
    sim.lastTliPlanWallMs = -9999;
    sim.lastStage4WallMs = -9999;
    sim.liveTliPlan = null;
    sim.autoCutoffNoticeTimer = 0;
    sim.autoSlowNoticeTimer = 0;
    sim.mccDirty = true;
    sim.cachedMcc = null;
    sim.stage2TcmPlan = null;
    sim._lastAutoMcc = null;
    sim._replanTcmAfterBurn = false;
    sim.lastStage1PeMarkerDrawn = false;
    sim.mccLocked = false;
    sim.hasAutoCutStage2Once = false;
    sim.warpBurnFuelUsedPct = 0;
    sim.fuelSafetyLockout = false;
    sim.stage1FuelGuardTriggered = false;
    sim.lastUnrecoverableCheckMs = -9999;
    sim.fuelSafetyBannerTimer = 0;
    sim.fuelSafetyBannerText = "";
    sim.stage2BurnedDvMs = 0;
    sim.stage2TargetDvMs = 0;
    sim.lastCutoffReason = "";
    sim.effectiveBurnWarp = 1;
    sim.burnAttitudeLockRad = null;
    sim.manualOverrideUntilMs = 0;
    sim.attitudeGate = 1.0;
    sim.fuelWarnLatch = {};
    sim.resumeBurnAfterStaging = false;
    sim.lockedMccHeadingRad = null;
    sim.predColorState = "amber";
    clearThrottleLatch();
    sim.sc.fineTrimMode = false;
    sim.sc.isThrusting = false;
    sim.sc.omegaRadS = 0.0;
    sim.sc.pulseFlashTimer = 0;
    sim.sc.rhythmFeedbackTimer = 0;
    sim.sc.lastRho = 0;
    sim.sc.lastDynPressPa = 0;
    sim.sc.maxDynPressPa = 0;
    sim.sc.lastHeatFluxKwM2 = 0;
    sim.sc.lastGLoad = 1.0;
    sim.sc.gravityLossMs = 0;
    sim.sc.dragLossMs = 0;
    sim.dsnBlocked = false;
    sim.fuelOut = "none";
    if (dom.fuelOutPrompt) dom.fuelOutPrompt.classList.add("hidden");
    camera.panOffsetXKm = 0;
    camera.panOffsetYKm = 0;
    camera.manualZoomFactor = 1.0;
    dom.modal.classList.add("hidden");
    dom.btnPause.textContent = "PAUSE";
  }

  function initStage(stageNum) {
    sim.holdMode = null;
    sim.loiPlan = null; sim.loiRescue = false; sim.loiSafetyHold = false; sim.loiAcceptRequested = false; sim._prevPeriAlt = null;
    sim.pendingSurveyHandoff = false;
    if (stageNum <= 3) sim.surveyDone = false;
    resetCommonState();
    sim.currentStage = stageNum;
    dom.stageJumpSelect.value = String(stageNum);
    sim.sc.stages = buildFlightStagesFromVehicle(1.0);
    sim.sc.activeStageIdx = 0;

    if (stageNum === 1) {
      const padAng = -Math.PI * 0.72;
      const tliWindowEstAngle = -Math.PI * 0.36;
      const moonTliAng = tliWindowEstAngle + goldenRef.phaseLeadRad;
      const moonOmega = CFG.V_MOON_CIRC / CFG.R_MOON_ORBIT;
      const moonInitAng = moonTliAng - moonOmega * 650.0;
      setMoonEpochAngle(moonInitAng);

      const vSurf = CFG.OMEGA_EARTH * CFG.R_EARTH;
      sim.sc.rx = CFG.R_EARTH * Math.cos(padAng);
      sim.sc.ry = CFG.R_EARTH * Math.sin(padAng);
      sim.sc.vx = -vSurf * Math.sin(padAng);
      sim.sc.vy = vSurf * Math.cos(padAng);
      sim.sc.headingRad = padAng;
      sim.sc.stage1Attached = true;
      sim.subPhase = "LAUNCH_PAD";
      sim.committedTliPoints = null;
      sim.scienceBufferPct = 0;
      sim.scienceScorePct = 0;
      setCameraMode("flight", true);
    } else if (stageNum === 2) {
      setMoonEpochAngle(0.0);
      sim.tliEpochMoonAngle = 0.0;
      sim.committedTliPoints = null;
      sim.minDMoon = Infinity;
      sim.mccLocked = false;
      sim.lockedMccHeadingRad = null;
      const thetaDep = -goldenRef.phaseLeadRad;
      const vOffNominal = goldenRef.tliSpeedKms + (CFG.R_MOON_ORBIT > 200000 ? 0.0085 : 0.032);
      let st = {
        rx: CFG.R_PARKING * Math.cos(thetaDep),
        ry: CFG.R_PARKING * Math.sin(thetaDep),
        vx: -vOffNominal * Math.sin(thetaDep),
        vy: vOffNominal * Math.cos(thetaDep)
      };
      const coastStartSec = CFG.R_MOON_ORBIT > 200000 ? 18000.0 : 5500.0;
      const stepDt = 60.0;
      const nSteps = Math.round(coastStartSec / stepDt);
      let t = 0;
      for (let i = 0; i < nSteps; i++) {
        st = P.rk4Step2D(st, t, stepDt, { enableDrag: false });
        t += stepDt;
        if (i % 6 === 0) sim.trail.push({ rx: st.rx, ry: st.ry, tAbs: t });
      }
      sim.simTimeSec = t;
      sim.sc.rx = st.rx;
      sim.sc.ry = st.ry;
      sim.sc.vx = st.vx;
      sim.sc.vy = st.vy;
      sim.sc.headingRad = Math.atan2(st.vy, st.vx);
      sim.sc.stage1Attached = false;
      sim.sc.stage2FuelKg = nominalBusFuelKg(0.0); // boosters did the TLI → full spacecraft tank
      sim.sc.fineTrimMode = true;
      sim.subPhase = "MCC_COAST";
      sim.scienceBufferPct = 0;
      sim.scienceScorePct = 0;
      setCameraMode("map", true);
    } else if (stageNum === 3) {
      setMoonEpochAngle(0.0);
      sim.tliEpochMoonAngle = 0.0;
      sim.committedTliPoints = null;
      sim.minDMoon = Infinity;
      sim.mccLocked = false; // DEF-304
      sim.lockedMccHeadingRad = null;
      const thetaDep = -goldenRef.phaseLeadRad;
      const vTli = goldenRef.tliSpeedKms;
      let st = {
        rx: CFG.R_PARKING * Math.cos(thetaDep),
        ry: CFG.R_PARKING * Math.sin(thetaDep),
        vx: -vTli * Math.sin(thetaDep),
        vy: vTli * Math.cos(thetaDep)
      };
      const leadBeforePeri = CFG.R_MOON_ORBIT > 200000 ? 3200.0 : 2800.0;
      const targetT = Math.max(1000, goldenRef.nominalTransferTimeSec - leadBeforePeri);
      // Use accurate RK4 substeps matching cislunar trajectory up to ~3200s before perilune
      let t = 0;
      while (t < targetT) {
        const mTmp = P.getMoonStateAtTime(t);
        const dM = Math.hypot(st.rx - mTmp[0], st.ry - mTmp[1]);
        const dE = Math.hypot(st.rx, st.ry);
        const h = Math.min(targetT - t, Math.max(20.0, Math.min(dE, dM) * 0.015, 30.0));
        st = P.rk4Step2D(st, t, h, { enableDrag: false });
        t += h;
        if (targetT - t < 45000) sim.trail.push({ rx: st.rx, ry: st.ry, tAbs: t });
      }
      sim.simTimeSec = t;
      sim.sc.rx = st.rx;
      sim.sc.ry = st.ry;
      sim.sc.vx = st.vx;
      sim.sc.vy = st.vy;
      const mSt = P.getMoonStateAtTime(t);
      sim.sc.headingRad = Math.atan2(-(st.vy - mSt[3]), -(st.vx - mSt[2]));
      sim.sc.stage1Attached = false;
      sim.sc.stage2FuelKg = nominalBusFuelKg(40.0); // after a nominal ~40 m/s course correction
      sim.subPhase = "LOI_1";
      sim.scienceBufferPct = 0;
      sim.scienceScorePct = 0;
      setCameraMode("moon", true);
    } else if (stageNum === 4) {
      setMoonEpochAngle(0.0);
      sim.mccLocked = false;
      sim.lockedMccHeadingRad = null;
      const mSt = P.getMoonStateAtTime(0);
      const rOrbit = CFG.R_MOON + 110.0;
      const vCirc = Math.sqrt(CFG.MU_MOON / rOrbit);
      const orbAng = Math.PI * 0.35;
      sim.sc.rx = mSt[0] + rOrbit * Math.cos(orbAng);
      sim.sc.ry = mSt[1] + rOrbit * Math.sin(orbAng);
      sim.sc.vx = mSt[2] - vCirc * Math.sin(orbAng);
      sim.sc.vy = mSt[3] + vCirc * Math.cos(orbAng);
      sim.sc.headingRad = Math.atan2(-sim.sc.vy + mSt[3], -sim.sc.vx + mSt[2]);
      sim.sc.stage1Attached = false;
      sim.sc.stage2FuelKg = nominalBusFuelKg(40.0 + 880.0); // after MCC + lunar orbit insertion
      sim.subPhase = "IMPACT_DIVE";
      sim.scienceBufferPct = 0;
      sim.scienceScorePct = 100.0;
      setCameraMode("moon", true);
    }

    refreshPredictor(true);
    updateFidoGuidance(true);
    updateHUD();
  }

  function setCameraMode(mode, snap = false) {
    camera.mode = mode;
    camera.manualZoomFactor = 1.0;
    camera.panOffsetXKm = 0;
    camera.panOffsetYKm = 0;
    const labels = {
      rocket: "[M] ROCKET VIEW",
      flight: "[M] FLIGHT VIEW",
      moon: "[M] MOON LOCK",
      map: "[M] MAP VIEW"
    };
    dom.btnViewToggle.textContent = labels[mode] || "[M] FLIGHT VIEW";
    dom.btnViewToggle.classList.toggle("active", mode !== "map");
    if (dom.btnRocketView) {
      dom.btnRocketView.classList.toggle("active", mode === "rocket");
    }
    if (snap) {
      updateCameraTargets();
      camera.xKm = camera.targetXKm;
      camera.yKm = camera.targetYKm;
      camera.scaleKmPerPx = camera.targetScaleKmPerPx;
      camera.rocketAlpha = getRocketCrossFadeAlpha(camera.scaleKmPerPx);
      camera.rotRad = camera.targetRotRad || 0;
    }
  }

  function cycleCameraMode() {
    const order = ["rocket", "flight", "moon", "map"];
    const next = order[(order.indexOf(camera.mode) + 1) % order.length];
    setCameraMode(next, false);
  }

  function toggleRefFrame(forceFrame) {
    camera.refFrame =
      forceFrame === "inertial" || forceFrame === "synodic"
        ? forceFrame
        : camera.refFrame === "inertial"
        ? "synodic"
        : "inertial";
    camera.panOffsetXKm = 0;
    camera.panOffsetYKm = 0;
    if (dom.btnFrameToggle) {
      const isSyn = camera.refFrame === "synodic";
      dom.btnFrameToggle.textContent = isSyn ? "[B] SYNODIC (∞)" : "[B] J2000";
      dom.btnFrameToggle.classList.toggle("active", isSyn);
    }
    refreshPredictor(true);
    updateHUD();
  }

  // ===========================================================================
  // 7. PREDICTOR & AUTO-FIDO GUIDANCE COMPUTATION
  // ===========================================================================
  function formatTimerShort(sec) {
    if (!Number.isFinite(sec)) return "--";
    const abs = Math.abs(Math.round(sec));
    const days = Math.floor(abs / 86400);
    const hrs = Math.floor((abs % 86400) / 3600);
    const mins = Math.floor((abs % 3600) / 60);
    const secs = abs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (days > 0) return `${days}d ${pad(hrs)}h`;
    if (hrs > 0) return `${hrs}h ${pad(mins)}m`;
    if (mins > 0) return `${pad(mins)}:${pad(secs)}`;
    return `${secs}s`;
  }

  function refreshPredictor(force = false) {
    const nowMs = performance.now();
    if (!force && nowMs - (sim.lastPredictWallMs || 0) < 95) {
      return;
    }
    sim.lastPredictWallMs = nowMs;
    sim.lastPredictTime = sim.simTimeSec;

    let mode = "cislunar";
    if (sim.currentStage === 1 && sim.subPhase !== "TLI_BURN") mode = "parking";
    else if (sim.subPhase === "LOI_1" || sim.subPhase === "LOI_2" || sim.subPhase === "SCIENCE_ORBIT") {
      mode = "lunarOrbit";
    } else if (sim.currentStage === 4) {
      mode = "impact";
    }

    // Physics audit: drag was previously switched off below 20 km (where it matters most)
    const enableDrag = sim.subPhase !== "LAUNCH_PAD";

    sim.predictor = P.computeLivePredictor(sim.sc, sim.simTimeSec, {
      mode,
      enableDrag,
      useLunarTopography: true,
      synodicExtended: camera.refFrame === "synodic" && mode === "cislunar" && sim.currentStage <= 2,
      massKg: getTotalMassKg(),
      cdArea: getStackCdA()
    });

    const pts = sim.predictor && sim.predictor.points;
    if (pts && pts.length > 2 && sim.currentStage === 4 && !sim.predictor.predImpact) {
      let swept = 0;
      const t0 = Number.isFinite(pts[0].tAbs) ? pts[0].tAbs : sim.simTimeSec;
      const m0 = P.getMoonStateAtTime(t0);
      let prevAng = Math.atan2(pts[0].ry - m0[1], pts[0].rx - m0[0]);
      let endIdx = pts.length - 1;
      for (let i = 1; i < pts.length; i++) {
        const ti = Number.isFinite(pts[i].tAbs) ? pts[i].tAbs : sim.simTimeSec;
        const mi = P.getMoonStateAtTime(ti);
        const ang = Math.atan2(pts[i].ry - mi[1], pts[i].rx - mi[0]);
        swept += Math.abs(P.normalizeAngleRad(ang - prevAng));
        prevAng = ang;
        if (swept >= Math.PI * 2.0) {
          endIdx = i;
          break;
        }
      }
      sim.predictor.drawEndIdx = endIdx;
    } else if (sim.predictor && pts) {
      sim.predictor.drawEndIdx = pts.length - 1;
    }
  }

  function computeStage4SouthPoleHeading(mSt) {
    const sc = sim.sc;
    const relVx = sc.vx - mSt[2];
    const relVy = sc.vy - mSt[3];
    const retroAng = Math.atan2(-relVy, -relVx);

    let bestHeading = retroAng;
    let bestScore = Infinity;

    for (let degOff = -80; degOff <= 80; degOff += 10) {
      const ang = retroAng + degOff * CFG.DEG_TO_RAD;
      for (const dv of [0.08, 0.16, 0.28, 0.45]) {
        const test = {
          rx: sc.rx,
          ry: sc.ry,
          vx: sc.vx + dv * Math.cos(ang),
          vy: sc.vy + dv * Math.sin(ang)
        };
        const pr = P.computeLivePredictor(test, sim.simTimeSec, {
          mode: "impact",
          horizonSec: 7500.0,
          maxIters: 260,
          useLunarTopography: true
        });
        if (pr.predImpact && pr.predImpact.body === "Moon") {
          const errRad = Math.abs(
            P.normalizeAngleRad(
              pr.predImpact.angleDeg * CFG.DEG_TO_RAD - CFG.SOUTH_POLE_CENTER_DEG * CFG.DEG_TO_RAD
            )
          );
          const scVal = errRad * 100.0 + dv * 10.0;
          if (scVal < bestScore) {
            bestScore = scVal;
            bestHeading = ang;
          }
        }
      }
    }
    return bestHeading;
  }

  function isSpinPhaseInGoldZone() {
    const ph = P.normalizeAnglePosRad(sim.sc.spinPhaseRad);
    return Math.abs(ph - Math.PI) <= 0.57; // Centered at 50% (0.41..0.59) on Rhythm Bar
  }

  function updateFidoGuidance(force = false) {
    const s = sim.sc;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const moonAngle = Math.atan2(mSt[1], mSt[0]);
    const rEarth = Math.hypot(s.rx, s.ry);
    const altEarth = rEarth - CFG.R_EARTH;
    const relMoonRx = s.rx - mSt[0];
    const relMoonRy = s.ry - mSt[1];
    const relMoonVx = s.vx - mSt[2];
    const relMoonVy = s.vy - mSt[3];
    const dMoon = Math.hypot(relMoonRx, relMoonRy);

    const earthKep = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
    const moonKep = P.cartesianToKeplerian2D(relMoonRx, relMoonRy, relMoonVx, relMoonVy, CFG.MU_MOON);

    const f = sim.fido;
    const activeSt = getActiveStage();
    f.correctionNodePos = null;
    // [SPACE] is a TOGGLE (SHIFT+SPACE is the only hold), so directives say PRESS / ENGINE ON / OFF
    const engineOn = Boolean(s.isThrusting || input.throttleLatched || input.burnHeld || input.shiftSpaceHeld);
    const igniteOr = (onText, offText) => (engineOn ? onText : offText);

    if (sim.outcome === "abort") {
      f.whenText = "MISSION ABORT";
      f.burnNow = false;
      f.directive = "MISSION ABORTED — PRESS [R] TO RETRY STAGE FROM YOUR CHECKPOINT";
      sim.timerState = { label: "ABORT", tRemSec: 0, burnDurSec: 0, isBurnNow: false, isPast: false };
      return;
    }
    if (sim.outcome === "victory") {
      f.whenText = "IMPACT CONFIRMED";
      f.burnNow = false;
      f.directive = "LUNAR SOUTH POLE SHOEMAKER CRATER IMPACT CONFIRMED · MISSION COMPLETE";
      sim.timerState = { label: "COMPLETE", tRemSec: 0, burnDurSec: 0, isBurnNow: false, isPast: false };
      return;
    }

    if (sim.currentStage === 1) {
      if (sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT") {
        const nowMs = performance.now();
        // FIX #1/#3: predictExpectedAscentPath (~25 ms, it also runs the TLI planner) was re-run
        // every 80 ms = ~30% of the main thread. 250 ms is plenty for a guide line.
        if (
          force ||
          !sim.liveAscentPlan ||
          (nowMs - (sim.lastAscentPlanWallMs || 0) > 250)
        ) {
          // FIX #1: reuse the expensive TLI part of the guide unless the predicted insertion point
          // moved > 1.5° or the cache is > 10 s old (was a ~200 ms hitch on every refresh).
          const cache = sim._ascentTliCache;
          let plan = P.predictExpectedAscentPath(s, sim.simTimeSec, goldenRef, {
            stages: s.stages,
            tliPlan: cache ? cache.plan : null
          });
          if (plan && plan.insertionState) {
            const insAng = Math.atan2(plan.insertionState.ry, plan.insertionState.rx);
            const stale =
              !cache ||
              force ||
              nowMs - cache.wallMs > 10000 ||
              Math.abs(P.normalizeAngleRad(insAng - cache.insAng)) > 1.5 * CFG.DEG_TO_RAD;
            if (stale) {
              const tliPlan = P.planTransLunarInjection(plan.insertionState, plan.insertionTimeSec, goldenRef);
              sim._ascentTliCache = { plan: tliPlan, insAng, wallMs: nowMs };
              plan = P.predictExpectedAscentPath(s, sim.simTimeSec, goldenRef, { stages: s.stages, tliPlan });
            }
          }
          if (plan) sim.liveAscentPlan = plan;
          sim.lastAscentPlanWallMs = nowMs;
        }
      }

      if (sim.subPhase === "LAUNCH_PAD") {
        const radialAng = Math.atan2(s.ry, s.rx);
        f.targetHeadingRad = radialAng;   // straight up: no pre-tilt on the pad
        f.whenText = "IGNITION READY";
        f.burnNow = true;
        f.neededDvMs = Math.round(computeRemainingDeltaVMs());
        f.maxBurnDvMs = f.neededDvMs;
        f.directive = "PRESS [SPACE] (ENGINE ON) TO IGNITE STAGE 1 & LAUNCH INTO 185 KM PARKING ORBIT";
        sim.timerState = { label: "IGNITION", tRemSec: 0, burnDurSec: 0, isBurnNow: true, isPast: false };
      } else if (sim.subPhase === "ASCENT") {
        const radialAng = Math.atan2(s.ry, s.rx);
        const progradeAng = radialAng + Math.PI * 0.5;
        const rSafe = Math.max(1.0, rEarth);
        const vr = (s.vx * s.rx + s.vy * s.ry) / rSafe;
        const vt = (-s.ry * s.vx + s.rx * s.vy) / rSafe;
        const aThrust = activeSt.thrustN / (Math.max(100.0, getTotalMassKg()) * 1000.0);

        // Adaptive steering (shared with the plan predictor): flattens the climb for low-thrust builds
        const tiltFromPrograde = P.ascentSteeringTilt(altEarth, vr, vt, rSafe, aThrust, s.stages, s.activeStageIdx);

        const apAlt = Number.isFinite(earthKep.ra) ? earthKep.ra - CFG.R_EARTH : 300;
        const dvToOrbitMs = Math.max(0, (CFG.V_PARKING - earthKep.vMag) * 1000.0);
        const mDot = activeSt.thrustN / (activeSt.ispS * CFG.G0_MS2);
        const stRemSec = activeSt.fuelKg / Math.max(0.1, mDot);
        f.targetHeadingRad = progradeAng - tiltFromPrograde;
        f.whenText = `${activeSt.name} · ${formatTimerShort(stRemSec)}`;
        f.burnNow = true;
        f.maxBurnDvMs = 9200;
        f.neededDvMs = dvToOrbitMs;
        f.directive =
          apAlt < 178
            ? igniteOr(
                `ENGINE ON · CLIMBING (${Math.round(altEarth)}/185 KM ALT) · ${activeSt.name} (${formatTimerShort(stRemSec)} LEFT)`,
                `ENGINE OFF! PRESS [SPACE] TO RE-IGNITE & CLIMB (${Math.round(altEarth)}/185 KM ALT)`
              )
            : igniteOr(
                `CIRCULARIZING AT 185 KM · LEAVE ENGINE ON UNTIL ORBIT LOCK`,
                `CIRCULARIZING AT 185 KM · ENGINE OFF! PRESS [SPACE] TO RE-IGNITE UNTIL ORBIT LOCK`
              );
        sim.timerState = { label: activeSt.name, tRemSec: stRemSec, burnDurSec: stRemSec, isBurnNow: true, isPast: false };
      } else if (sim.subPhase === "WAIT_STAGE") {
        const nowMs = performance.now();
        // FIX #1/#3: planTransLunarInjection costs ~170-210 ms per call; at an 80 ms interval the
        // game ran at a few fps here. The coast plan is deterministic, so refresh it rarely.
        if (
          force ||
          !sim.liveTliPlan ||
          (nowMs - (sim.lastTliPlanWallMs || 0) > 1200)
        ) {
          const plan = P.planTransLunarInjection(s, sim.simTimeSec, goldenRef);
          if (plan) sim.liveTliPlan = plan;
          sim.lastTliPlanWallMs = nowMs;
        }
        const progradeAng = Math.atan2(s.vy, s.vx);
        const isLastBooster = s.activeStageIdx >= s.stages.length - 2;
        const nextSt = s.stages[s.activeStageIdx + 1];
        f.targetHeadingRad = progradeAng;
        f.whenText = "PRESS [G] NOW";
        f.burnNow = false;
        const planDvMs = sim.liveTliPlan ? Math.round(sim.liveTliPlan.dvKms * 1000) : Math.round(goldenRef.tliDeltaVKms * 1000);
        f.maxBurnDvMs = Math.max(100, planDvMs);
        f.neededDvMs = f.maxBurnDvMs;
        f.directive = isLastBooster
          ? `ORBITAL INSERTION COMPLETE · PRESS [G] TO ARM ${nextSt ? nextSt.name : "ORBITAL BUS"} FOR TLI`
          : `${activeSt.name} DEPLETED! PRESS [G] TO SEPARATE & IGNITE ${nextSt ? nextSt.name : "NEXT STAGE"}`;
        sim.timerState = { label: "STAGE SEP", tRemSec: 0, burnDurSec: 0, isBurnNow: true, isPast: false };
      } else if (sim.subPhase === "TLI_BURN") {
        const nowMs = performance.now();
        // FIX #3: previously ALWAYS `immediate: true` -> tNodeAbs == now -> tRemSec == 0, so the
        // "COASTING TO TLI NODE / [W]" branch was unreachable and the panel said BURN NOW at once.
        // Plan to the real phase-angle node while coasting; switch to immediate once the engine is lit.
        const tliBurning = s.isThrusting || input.burnHeld || input.throttleLatched || input.shiftSpaceHeld ||
          Math.hypot(s.rx, s.ry) > CFG.R_PARKING + 450.0;
        // FIX #1/#3: same planner (~170-210 ms/call). Coasting: 1.2 s; burning: 0.35 s (cut-off
        // itself is decided from the live predictor + speed check every frame, not from this plan).
        // Also re-plan immediately when we switch between coast and burn mode.
        const tliModeChanged = sim._tliPlanImmediate !== tliBurning;
        if (
          force ||
          !sim.liveTliPlan ||
          tliModeChanged ||
          (nowMs - (sim.lastTliPlanWallMs || 0) > (tliBurning ? 350 : 1200))
        ) {
          sim._tliPlanImmediate = tliBurning;
          const plan = P.planTransLunarInjection(s, sim.simTimeSec, goldenRef, { immediate: tliBurning });
          if (plan) sim.liveTliPlan = plan;
          sim.lastTliPlanWallMs = nowMs;
        }

        const progradeAng = Math.atan2(s.vy, s.vx);
        f.targetHeadingRad = progradeAng;

        const tliNodeAng = P.normalizeAngleRad(moonAngle - goldenRef.phaseLeadRad);
        const scAng = Math.atan2(s.ry, s.rx);
        const deltaAng = P.normalizeAnglePosRad(tliNodeAng - scAng);
        const degToNode = deltaAng * CFG.RAD_TO_DEG;
        const orbOmega = Math.max(1e-5, earthKep.vMag / Math.max(6500, rEarth));
        const timeToWindowSec = deltaAng / orbOmega;

        const hasLivePlan = Boolean(sim.liveTliPlan);
        const tRemSec = hasLivePlan ? Math.max(0, sim.liveTliPlan.tNodeAbs - sim.simTimeSec) : timeToWindowSec;
        const targetTliKms =
          hasLivePlan && Number.isFinite(sim.liveTliPlan.targetSpeedKms)
            ? sim.liveTliPlan.targetSpeedKms
            : goldenRef.tliSpeedKms;
        const nominalTliDvMs = hasLivePlan
          ? Math.round(sim.liveTliPlan.dvKms * 1000)
          : Math.round(goldenRef.tliDeltaVKms * 1000);
        f.maxBurnDvMs = Math.max(100, nominalTliDvMs);

        const pred = sim.predictor;
        const apAlt = Number.isFinite(earthKep.ra) ? earthKep.ra - CFG.R_EARTH : CFG.R_MOON_ORBIT;
        const minTargetAp = CFG.R_MOON_ORBIT > 200000 ? 280000.0 : 85000.0;
        const matchesCorridor =
          Boolean(pred && pred.predPerilune && !pred.predImpact && pred.predPerilune.distKm < 12000.0 && apAlt > minTargetAp);
        const speedReached = earthKep.vMag >= targetTliKms - 0.005;

        if ((matchesCorridor || speedReached) && (s.isThrusting || input.burnHeld || input.throttleLatched)) {
          clearThrottleLatch();
          s.isThrusting = false;
          sim.autoCutoffNoticeTimer = 2.5;
        }

        const inWindow =
          tRemSec <= 15.0 || degToNode < 18.0 || degToNode > 342.0 || rEarth > CFG.R_PARKING + 450.0;

        if (matchesCorridor || speedReached) {
          f.neededDvMs = 0;
          f.whenText = "TLI CUTOFF ✓";
          f.burnNow = false;
          f.directive =
            "TLI CUTOFF ✓ — ENGINE OFF, DON'T PRESS [SPACE]! TRANSFERRING INTO STAGE 2 CISLUNAR CRUISE";
          sim.timerState = { label: "TLI DONE", tRemSec: 0, burnDurSec: 0, isBurnNow: false, isPast: false };
        } else if (tRemSec > 15.0 && !inWindow && !s.isThrusting && rEarth < CFG.R_PARKING + 450.0) {
          f.neededDvMs = nominalTliDvMs;
          f.whenText = `TLI IN ${formatTimerShort(tRemSec)}`;
          f.burnNow = false;
          f.directive = `COASTING TO CYAN TLI NODE (${formatTimerShort(tRemSec)}) · CLICK [W] WARP TO WINDOW`;
          sim.timerState = { label: "TLI WINDOW", tRemSec, burnDurSec: 0, isBurnNow: false, isPast: false };
        } else {
          f.neededDvMs = Math.max(0, (targetTliKms - earthKep.vMag) * 1000.0);
          f.whenText = "BURN NOW (TLI)";
          f.burnNow = true;
          f.directive =
            igniteOr(
              "ENGINE ON AT TLI NODE — AUTO-CUTOFF WILL STOP IT WHEN TRAJECTORY MATCHES CYAN PATH",
              "AT TLI NODE: PRESS [SPACE] TO IGNITE — AUTO-CUTOFF STOPS IT ON THE CYAN PATH"
            );
          sim.timerState = { label: "TLI BURN", tRemSec: 0, burnDurSec: 0, isBurnNow: true, isPast: false };
        }
      }
    } else if (sim.currentStage === 2) {
      const pred = sim.predictor;
      const inSafeCorridor = Boolean(
        pred &&
        pred.predPerilune &&
        !pred.predImpact &&
        pred.predPerilune.altKm >= CFG.CORRIDOR_MIN_ALT_KM &&
        pred.predPerilune.altKm <= CFG.CORRIDOR_MAX_ALT_KM
      );
      const inOptimalCorridor = Boolean(
        inSafeCorridor &&
        pred.predPerilune.altKm >= CFG.OPTIMAL_CORRIDOR_MIN_KM &&
        pred.predPerilune.altKm <= CFG.OPTIMAL_CORRIDOR_MAX_KM
      );

      if (inSafeCorridor) {
        if (inOptimalCorridor && !sim.hasAutoCutStage2Once && (s.isThrusting || input.burnHeld || input.throttleLatched)) {
          clearThrottleLatch();
          s.isThrusting = false;
          sim.hasAutoCutStage2Once = true;
          sim.autoCutoffNoticeTimer = 3.2;
          sim.lastCutoffReason = "CUTOFF: IN CORRIDOR ✓";
          if (sim.timeWarp > 1) setTimeWarp(1);
        }
        sim.mccLocked = true;
      } else {
        sim.mccLocked = false;
        sim.hasAutoCutStage2Once = false;
      }

      const nowMs = performance.now();
      const isExternalMockMcc =
        !force && !sim.mccDirty && sim.cachedMcc && sim.cachedMcc !== sim._lastAutoMcc;

      if (!isExternalMockMcc && !inOptimalCorridor) {
        if (!inSafeCorridor && !s.isThrusting) {
          const hasValidPlan = Boolean(sim.stage2TcmPlan && Array.isArray(sim.stage2TcmPlan.nodePos));
          const planExpired = hasValidPlan && sim.simTimeSec > sim.stage2TcmPlan.nodeEpochSec + 900.0;
          if (!hasValidPlan || planExpired || sim.mccDirty || sim._replanTcmAfterBurn) {
            const planPred =
              pred && pred.points && pred.points.length > 5 && pred.mode === "cislunar"
                ? pred
                : P.computeLivePredictor(s, sim.simTimeSec, {
                    mode: "cislunar",
                    useLunarTopography: true,
                    massKg: getTotalMassKg(),
                    synodicExtended: camera.refFrame === "synodic"
                  });
            const tcmPlan = P.planOptimalStage2TcmNode(planPred, sim.simTimeSec, {
              synodicExtended: camera.refFrame === "synodic",
              massKg: getTotalMassKg()
            });
            if (tcmPlan) {
              sim.stage2TcmPlan = tcmPlan;
              sim.cachedMcc = tcmPlan;
              sim._lastAutoMcc = tcmPlan;
              sim.lastMccWallMs = nowMs;
              sim.mccDirty = false;
              sim._replanTcmAfterBurn = false;
            }
          }
        } else {
          const refreshMs = s.isThrusting ? 140 : 380;
          if (force || sim.mccDirty || !sim.cachedMcc || nowMs - (sim.lastMccWallMs || 0) > refreshMs) {
            const liveMcc = P.computeFIDOMidCourseCorrection(s, sim.simTimeSec, {
              synodicExtended: camera.refFrame === "synodic",
              massKg: getTotalMassKg()
            });
            sim.cachedMcc = liveMcc;
            sim._lastAutoMcc = liveMcc;
            sim.lastMccWallMs = nowMs;
            sim.mccDirty = false;
            if (s.isThrusting) {
              sim._replanTcmAfterBurn = true;
              if (sim.stage2TcmPlan) {
                sim.stage2TcmPlan = {
                  ...sim.stage2TcmPlan,
                  needed: Boolean(liveMcc.needed),
                  nodeEpochSec: sim.simTimeSec,
                  timeToNodeSec: 0,
                  nodePos: [s.rx, s.ry],
                  deltaVKms: liveMcc.deltaVKms,
                  deltaVMs: liveMcc.deltaVKms * 1000.0,
                  targetHeadingRad: liveMcc.targetHeadingRad,
                  correctionNodePos: liveMcc.needed ? [s.rx, s.ry] : null,
                  expectedPoints: liveMcc.expectedPoints || [],
                  expectedPerilune: liveMcc.expectedPerilune || null
                };
              }
            }
          }
        }

        if (sim.cachedMcc) {
          if (!sim.cachedMcc.needed || sim.cachedMcc.deltaVKms * 1000.0 <= 1.0) {
            if (inSafeCorridor) sim.mccLocked = true;
          } else {
            sim.lockedMccHeadingRad = sim.cachedMcc.targetHeadingRad;
            const mccDvMs = sim.cachedMcc.deltaVKms * 1000.0;
            f.maxBurnDvMs = Math.max(15, mccDvMs);
            sim.stage2TargetDvMs = Math.max(sim.stage2TargetDvMs || 0, sim.stage2BurnedDvMs + mccDvMs);
          }
        }
      }

      const periSec = pred && pred.predPerilune ? pred.predPerilune.timeFromNowSec : Infinity;
      const mcc = sim.cachedMcc;

      if (sim.mccLocked) {
        f.correctionNodePos = null;
        f.targetHeadingRad =
          !inOptimalCorridor && mcc && mcc.needed && Number.isFinite(mcc.targetHeadingRad)
            ? mcc.targetHeadingRad
            : Math.atan2(s.vy, s.vx);
        const isCleanTli = (sim.stage2BurnedDvMs || 0) < 0.5;
        f.whenText = isCleanTli
          ? `CLEAN TLI ✓ · PE ${formatTimerShort(periSec)}`
          : `TCM LOCKED ✓ · PE ${formatTimerShort(periSec)}`;
        f.burnNow = false;
        f.neededDvMs = !inOptimalCorridor && mcc && mcc.needed ? mcc.deltaVKms * 1000.0 : 0;
        f.maxBurnDvMs = Math.max(25, f.neededDvMs);
        const altStr = pred && pred.predPerilune ? pred.predPerilune.altKm.toFixed(0) : "100";
        f.directive = inOptimalCorridor
          ? `LUNAR PROSPECTOR 100 KM CORRIDOR LOCKED (PE ${altStr} KM) · PRESS [W] OR WARP [100x-1000x] TO LUNA`
          : isCleanTli
          ? `CLEAN TLI IN 35-240 KM GATE (PE ${altStr} KM) · PRESS [W] TO WARP TO LUNA OR [SHIFT+SPACE] 25% HOLD FOR 100 KM`
          : `TCM COMPLETE IN 35-240 KM GATE (PE ${altStr} KM) · PRESS [W] TO WARP TO LUNA OR [SHIFT+SPACE] 25% HOLD FOR 100 KM`;
        sim.timerState = { label: "LUNAR SOI", tRemSec: Math.max(0, periSec - 3600.0), burnDurSec: 0, isBurnNow: false, isPast: false };
      } else {
        const activePlan = !isExternalMockMcc ? sim.stage2TcmPlan : null;
        const tToNodeSec =
          activePlan && Number.isFinite(activePlan.nodeEpochSec)
            ? Math.max(0, activePlan.nodeEpochSec - sim.simTimeSec)
            : 0;
        f.correctionNodePos =
          activePlan && activePlan.needed && Array.isArray(activePlan.nodePos)
            ? activePlan.nodePos
            : mcc && mcc.needed && mcc.correctionNodePos
              ? mcc.correctionNodePos
              : null;
        sim.lockedMccHeadingRad = mcc ? mcc.targetHeadingRad : Math.atan2(s.vy, s.vx);
        f.targetHeadingRad = sim.lockedMccHeadingRad;
        f.neededDvMs = mcc ? mcc.deltaVKms * 1000.0 : 0;
        const altStr = pred && pred.predPerilune ? `${pred.predPerilune.altKm.toFixed(0)} km` : "MISS";

        if (tToNodeSec > 45.0 && !s.isThrusting) {
          f.whenText = `TCM IN ${formatTimerShort(tToNodeSec)}`;
          f.burnNow = false;
          f.directive =
            `TCM-1 NODE PLANNED (PE ${altStr} → 100 KM LUNA GATE): PRESS [W] TO WARP TO NODE (AUTO-SLOW T-45S)`;
          sim.timerState = { label: "TCM NODE", tRemSec: tToNodeSec, burnDurSec: 0, isBurnNow: false, isPast: false };
        } else {
          f.whenText = f.neededDvMs <= 2.0
            ? "BURN AT TCM NODE NOW · 25% FEATHER"
            : input.shiftSpaceHeld || input.shiftDown
            ? "BURN AT TCM NODE NOW · 25% HOLD"
            : "BURN AT TCM NODE NOW [SPACE]";
          f.burnNow = true;
          f.directive =
            `BURN AT TCM NODE NOW (PE ${altStr} → 100 KM LUNA GATE): ALIGN [Q] & TOGGLE [SPACE] (OR [SHIFT+SPACE] 25% HOLD)`;
          sim.timerState = { label: "TCM NODE", tRemSec: 0, burnDurSec: 0, isBurnNow: true, isPast: false };
        }
      }

      // FIX #4: BURN ATTITUDE LATCH. While burning, the MCC solver is re-run every 140 ms and returns
      // the direction of the *remaining* Δv. As that residual shrinks its direction becomes noise
      // (and flips between the Δv vector and prograde when `needed` toggles), so the target arrow
      // jumped around and the heavy, slow-turning ship chased it forever. Real TCMs are flown at a
      // fixed inertial attitude; we lock the target at ignition and only accept small refinements.
      const wantsBurnS2 = s.isThrusting || input.throttleLatched || input.burnHeld || input.shiftSpaceHeld;
      if (wantsBurnS2 && Number.isFinite(f.targetHeadingRad)) {
        if (!Number.isFinite(sim.burnAttitudeLockRad)) {
          sim.burnAttitudeLockRad = f.targetHeadingRad;
        } else {
          const dLock = P.normalizeAngleRad(f.targetHeadingRad - sim.burnAttitudeLockRad);
          const residualMs = Number.isFinite(f.neededDvMs) ? f.neededDvMs : 0;
          // accept only genuine refinements (< 20°) while there is still meaningful Δv to fly
          if (residualMs > 3.0 && Math.abs(dLock) < 20.0 * CFG.DEG_TO_RAD) {
            sim.burnAttitudeLockRad = P.normalizeAngleRad(sim.burnAttitudeLockRad + dLock * 0.08);
          }
        }
        f.targetHeadingRad = sim.burnAttitudeLockRad;
      } else {
        sim.burnAttitudeLockRad = null;
      }
    } else if (sim.currentStage === 3) {
      const retroMoon = Math.atan2(-relMoonVy, -relMoonVx);
      f.targetHeadingRad = retroMoon;
      const vRel = Math.hypot(relMoonVx, relMoonVy);
      const vCircMoon = Math.sqrt(CFG.MU_MOON / Math.max(CFG.R_MOON + 30, dMoon));

      if (sim.subPhase === "LOI_1" || sim.subPhase === "LOI_2") {
        const pred = sim.predictor;
        const periAltK = moonKep.rp - CFG.R_MOON;
        const lunarCollisionCourse = Boolean(
          (dMoon < 2800.0 && pred && pred.predImpact && pred.predImpact.body === "Moon") ||
          ((periAltK < 25.0 || sim.loiSafetyHold) && dMoon < 6000.0)
        );
        if (lunarCollisionCourse) {
          sim.loiRescue = true;
          const g = periRaiseDir(relMoonRx, relMoonRy, relMoonVx, relMoonVy);
          const raiseDir = Math.atan2(g[1], g[0]);
          f.targetHeadingRad = raiseDir;
          f.maxBurnDvMs = 950;
          f.neededDvMs = Math.max(80, Math.min(450, vRel * 250.0));
          const errR = Math.abs(P.normalizeAngleRad(raiseDir - s.headingRad));
          const pointed = errR < 15.0 * CFG.DEG_TO_RAD;
          f.whenText = pointed || s.isThrusting ? `⚠ PE ${Math.round(periAltK)} KM · RAISE PERILUNE!` : `⚠ PE ${Math.round(periAltK)} KM · TURNING…`;
          f.burnNow = pointed || s.isThrusting;
          f.directive = s.isThrusting
            ? "⚠ PERILUNE TOO LOW — ENGINE ON ALONG THE ⊙ RAISE-PE ARROW · AUTO-STOP AT 35 KM, THEN BRAKING RESUMES"
            : pointed
            ? "⚠ PERILUNE TOO LOW — POINTED AT THE ⊙ RAISE-PE ARROW · PRESS [SPACE] TO RAISE IT"
            : (sim.autoAim ? "⚠ PERILUNE TOO LOW — AUTO-AIM IS TURNING TO THE ⊙ RAISE-PE ARROW · WAIT…" : "⚠ PERILUNE TOO LOW — PRESS [Q] FOR AUTO-AIM, OR STEER TO THE ⊙ RAISE-PE ARROW");
          f.maxBurnDvMs = 950;
          f.neededDvMs = Math.max(20, Math.min(450, (35 - periAltK) * 4));
          sim.timerState = { label: "PE RESCUE", tRemSec: 0, burnDurSec: 15, isBurnNow: f.burnNow, isPast: false };
          return;
        }

        sim.loiRescue = false;
        const apsides = P.timeToApsides2D(relMoonRx, relMoonRy, relMoonVx, relMoonVy, CFG.MU_MOON);
        let signedT = Number.isFinite(apsides.signedTPeriSec)
          ? apsides.signedTPeriSec
          : Math.max(0, (dMoon - (CFG.R_MOON + 100.0)) / Math.max(0.2, vRel));
        // already captured and past perilune → plan for the NEXT perilune instead of "brake now" on the way up
        if (moonKep.energy < 0 && signedT < -60.0 && Number.isFinite(moonKep.sma) && moonKep.sma > 0) {
          signedT += 2 * Math.PI * Math.sqrt(Math.pow(moonKep.sma, 3) / CFG.MU_MOON);
        }
        const cadet = getAssistMode() === "cadet";
        const periAltNow = moonKep.rp - CFG.R_MOON;
        const apAltNow = Number.isFinite(moonKep.ra) ? moonKep.ra - CFG.R_MOON : Infinity;
        const tgtApKm = loiTargetApKm(periAltNow);
        // Δv to brake from the current orbit energy to the target science ellipse, measured at perilune
        // (energy is conserved while coasting, so this number no longer jumps around frame to frame)
        const rp = Math.max(CFG.R_MOON + 5.0, moonKep.rp);
        const epsNow = (vRel * vRel) / 2 - CFG.MU_MOON / Math.max(1.0, dMoon);
        const vPeriNow = Math.sqrt(Math.max(0, 2 * (epsNow + CFG.MU_MOON / rp)));
        const vPeriTgt = Math.sqrt(CFG.MU_MOON * (2 / rp - 2 / (rp + CFG.R_MOON + tgtApKm)));
        const rawNeedMs = Math.max(0, (vPeriNow - vPeriTgt) * 1000.0);
        const bus = s.stages[s.stages.length - 1];
        const aBusKmS2 = bus.thrustN / (Math.max(50.0, getTotalMassKg()) * 1000.0);
        const estBurnSec = P.clamp((rawNeedMs / 1000.0) / Math.max(1e-5, aBusKmS2), 5.0, 400.0);

        // LOCKED BURN PLAN: ignition centred on perilune, computed once and only re-planned if the
        // perilune time really moves (> 30 s, e.g. after a correction burn). The countdown is steady.
        const tNow = sim.simTimeSec;
        const plan = sim.loiPlan;
        if (!s.isThrusting && signedT > 0 && (!plan || Math.abs(plan.tPeriAbs - (tNow + signedT)) > 30.0)) {
          sim.loiPlan = { tPeriAbs: tNow + signedT, burnSec: estBurnSec, tIgnAbs: tNow + signedT - estBurnSec / 2, peRef: Math.max(40.0, periAltNow), burnStartAbs: null };
        } else if (plan && !s.isThrusting && signedT > 0 && !plan.burnStartAbs) {
          plan.burnSec = estBurnSec; plan.tIgnAbs = plan.tPeriAbs - estBurnSec / 2; // same perilune, refined length
        }
        const P_ = sim.loiPlan || { tIgnAbs: tNow, burnSec: estBurnSec, peRef: Math.max(40.0, periAltNow) };
        if (s.isThrusting && !P_.burnStartAbs) P_.burnStartAbs = tNow;
        const tIgnRem = P_.tIgnAbs - tNow;

        // Attitude: Commander = plain retrograde; Cadet = retrograde tipped radial-out just enough to hold the perilune
        let heading = retroMoon;
        if (cadet) {
          const g = periRaiseDir(relMoonRx, relMoonRy, relMoonVx, relMoonVy);
          let ux = Math.cos(retroMoon), uy = Math.sin(retroMoon);
          const dot = ux * g[0] + uy * g[1];
          if (dot < 0) { ux -= dot * g[0]; uy -= dot * g[1]; }          // braking that no longer lowers the perilune
          const push = P.clamp((P_.peRef - periAltNow) * 0.08, 0, 1.5);  // and nudges it back up if it sagged
          ux += push * g[0]; uy += push * g[1];
          heading = Math.atan2(uy, ux);
        }
        f.targetHeadingRad = heading;
        f.maxBurnDvMs = 950;
        f.neededDvMs = rawNeedMs;
        const aimTxt = sim.autoAim
          ? (cadet ? "AUTO-AIM HOLDS RETROGRADE + PERILUNE" : "AUTO-AIM HOLDS RETROGRADE")
          : "PRESS [Q] FOR AUTO-AIM OR STEER RETROGRADE ⊗";
        const pe = Math.round(periAltNow), apTxt = Number.isFinite(apAltNow) ? `${Math.round(apAltNow)} KM` : "ESCAPE";

        if (s.isThrusting) {
          const el = P_.burnStartAbs ? tNow - P_.burnStartAbs : 0;
          const left = Math.max(0, P_.burnSec - el);
          f.whenText = `🔥 BURNING · ~${Math.round(left)}s LEFT`;
          f.burnNow = true;
          f.directive = `KEEP ENGINE ON · PE ${pe} KM · AP ${apTxt} → ≤${Math.round(tgtApKm)} KM · ${aimTxt} · AUTO-CUTOFF IN SCIENCE ORBIT`;
          sim.timerState = { label: "LOI BURN", tRemSec: 0, burnDurSec: P_.burnSec, burnElapsedSec: el, isBurnNow: true, isPast: false };
        } else if (tIgnRem > 3.0) {
          f.whenText = `BRAKE IN ${formatTimerShort(tIgnRem)}`;
          f.burnNow = false;
          f.directive = sim.loiAcceptable
            ? `ORBIT USABLE (PE ${pe} / AP ${apTxt}) · [ENTER] ACCEPT NOW (LESS DATA UP HIGH) · OR BRAKE AT PERILUNE IN ${formatTimerShort(tIgnRem)}`
            : `COASTING TO PERILUNE (${pe} KM) · IGNITION IN ${formatTimerShort(tIgnRem)} · BURN ~${Math.round(P_.burnSec)}s · [W] WARPS TO 30s BEFORE`;
          sim.timerState = { label: "LOI IGNITION", tRemSec: tIgnRem, burnDurSec: P_.burnSec, isBurnNow: false, isPast: false };
        } else {
          const late = -tIgnRem;
          f.whenText = late > 20 ? `🔥 LATE +${Math.round(late)}s · BRAKE NOW!` : "🔥 BRAKE NOW!";
          f.burnNow = true;
          f.directive = `PRESS [SPACE] TO BRAKE (${Math.round(rawNeedMs)} m/s, ~${Math.round(P_.burnSec)}s) · ${aimTxt}` +
            (late > 20 && !cadet ? " · LATE: TIP NOSE RADIAL-OUT TO KEEP PERILUNE UP" : "");
          sim.timerState = { label: "LOI IGNITION", tRemSec: 0, burnDurSec: P_.burnSec, isBurnNow: true, isPast: late > 20 };
        }
      } else if (sim.subPhase === "SCIENCE_ORBIT") {
        const periAltKm = moonKep.rp - CFG.R_MOON;
        f.neededDvMs = 0;
        f.maxBurnDvMs = 100;
        f.burnNow = false; // DEF-305: Clear burnNow during science orbit to prevent false alarm
        f.downlinkReady = !sim.dsnBlocked && sim.scienceBufferPct > 1.0;

        if (sim.autoCutoffNoticeTimer > 0 && sim.scienceScorePct < 5) {
          f.whenText = "CAPTURED ✓";
          f.directive = "CAPTURED IN SCIENCE ORBIT ✓ — ENGINE OFF, DON'T PRESS [SPACE]! RECORDING LUNAR DATA...";
        } else if (CFG.ENABLE_MASCONS && periAltKm < 38.0) {
          f.targetHeadingRad = Math.atan2(relMoonVy, relMoonVx);
          f.whenText = sim.dsnBlocked ? `MASCON DRIFT (${periAltKm.toFixed(0)}KM)` : "NEARSIDE · [E] / DGE";
          f.directive = `DGE MASCON GRAVITY DRIFT (PE ${periAltKm.toFixed(0)} KM) · RAISE ORBIT OR PRESS [E] TO DOWNLINK`;
        } else {
          f.whenText = sim.dsnBlocked ? "BLACKOUT · BUFFER" : "NEARSIDE · PRESS [E]";
          f.directive = sim.dsnBlocked
            ? "STEP 3B (BEHIND MOON): RECORDING SCIENCE INTO BUFFER... WAIT FOR EARTH LINE-OF-SIGHT"
            : sim.scienceBufferPct > 1.0
            ? "STEP 3B (EARTH IN SIGHT!): PRESS [E] OR CLICK [DOWNLINK DATA] TO UPLOAD SCIENCE!"
            : "STEP 3B: ORBITING MOON & RECORDING DATA... PRESS [E] ONCE BUFFER FILLS";
        }
        sim.timerState = { label: "SCIENCE", tRemSec: 0, burnDurSec: 0, isBurnNow: false, isPast: false };
      }
    } else if (sim.currentStage === 4) {
      const nowMs = performance.now();
      if (force || !f.deorbitTargetHeadingRad || nowMs - (sim.lastStage4WallMs || 0) > 550) {
        f.deorbitTargetHeadingRad = computeStage4SouthPoleHeading(mSt);
        sim.lastStage4WallMs = nowMs;
      }
      f.targetHeadingRad = f.deorbitTargetHeadingRad;
      const impactsPole =
        sim.predictor &&
        sim.predictor.predImpact &&
        sim.predictor.predImpact.body === "Moon" &&
        sim.predictor.predImpact.isSouthPole;

      if (impactsPole && (s.isThrusting || input.burnHeld || input.throttleLatched)) {
        clearThrottleLatch();
        s.isThrusting = false;
        sim.autoCutoffNoticeTimer = 3.0;
        sim.lastCutoffReason = "CUTOFF: SOUTH POLE IMPACT LOCKED ✓";
        if (sim.timeWarp > 1) setTimeWarp(1);
      }

      const tImpSec = impactsPole && Number.isFinite(sim.predictor.predImpact.timeFromNowSec)
        ? sim.predictor.predImpact.timeFromNowSec
        : null;
      f.whenText = impactsPole
        ? (tImpSec !== null ? `IMPACT IN ${formatTimerShort(tImpSec)}` : "IMPACT ON TARGET ✓")
        : "DE-ORBIT NOW";
      f.burnNow = !impactsPole;
      f.neededDvMs = impactsPole ? 0 : 180;
      f.directive = impactsPole
        ? `IMPACT CORRIDOR LOCKED ON SHOEMAKER CRATER (${formatTimerShort(tImpSec || 0)}) · USE TIME WARP TO DESCEND`
        : igniteOr(
            "ENGINE ON ALONG DE-ORBIT VECTOR · AUTO-CUTOFF WHEN IMPACT IS ON THE SOUTH POLE TARGET",
            "ALIGN WITH DE-ORBIT VECTOR [A/D] & PRESS [SPACE] TO IGNITE · AUTO-CUTOFF ON SOUTH POLE TARGET"
          );
      sim.timerState = { label: "IMPACT", tRemSec: tImpSec || 0, burnDurSec: 0, isBurnNow: !impactsPole, isPast: false };
    }
  }

  // ===========================================================================
  // 8. STAGE TRANSITIONS, SCIENCE & TERMINAL EVENTS
  // ===========================================================================
  function triggerOutcome(type, title, body) {
    sim.outcome = type;
    sim.outcomeTitle = title;
    sim.outcomeBody = body;
    sim.subPhase = type === "abort" ? "ABORT" : "VICTORY";
    clearThrottleLatch();
    sim.sc.isThrusting = false;
    sim.paused = true;

    dom.modalBadge.textContent = type === "victory" ? "MISSION ACCOMPLISHED" : "MISSION ABORT";
    dom.modalBadge.className = "modal-badge " + (type === "victory" ? "green" : "red");
    dom.modalTitle.textContent = title;
    dom.modalBody.textContent = body;
    const hasCp = Boolean(sim.userCheckpoints[sim.currentStage] && sim.currentStage > 1);
    dom.btnModalRetryStage.textContent = hasCp
      ? `[R] RETRY STAGE ${sim.currentStage} (YOUR SAVE)`
      : `[R] RETRY CURRENT STAGE`;
    if (dom.fuelOutPrompt) dom.fuelOutPrompt.classList.add("hidden");
    const bld = getBuild();
    dom.modalStats.innerHTML = `
      <div>STAGE REACHED: <strong>STAGE ${sim.currentStage}</strong> &nbsp;|&nbsp; MET: <strong>${formatMET(sim.simTimeSec)}</strong></div>
      <div>REMAINING Δv: <strong>${Math.round(computeRemainingDeltaVMs())} m/s</strong>${window.GameState && window.GameState.surveyResult ? ` &nbsp;|&nbsp; SURVEY POINTS: <strong>${window.GameState.surveyResult.points}</strong>` : ""}</div>
      ${bld ? `<div>SPACECRAFT: <strong>${bld.busName || "--"}</strong> · <strong>${Math.round(bld.scMassKg)} kg</strong> &nbsp;|&nbsp; HANGAR DESIGN SCORE: <strong>${Math.round(bld.designScore || 0)}</strong></div>` : ""}
    `;
    dom.modal.classList.remove("hidden");
  }

  function evaluateUnrecoverableImpact() {
    if (sim.outcome) return false;
    const pred = sim.predictor;
    if (!pred || !pred.predImpact) return false;
    const imp = pred.predImpact;
    if (!Number.isFinite(imp.timeFromNowSec) || imp.timeFromNowSec <= 0) return false;
    if (sim.currentStage === 4) return false;
    const s = sim.sc;
    const remDvMs = computeRemainingDeltaVMs();
    const tImp = Math.max(0, imp.timeFromNowSec);
    if (
      sim.currentStage === 1 &&
      (sim.subPhase === "LAUNCH_PAD" ||
        sim.subPhase === "ASCENT" ||
        (sim.subPhase === "WAIT_STAGE" && s.activeStageIdx < s.stages.length - 1 && remDvMs > 5.0 && tImp > 12.0))
    ) {
      return false;
    }

    const activeSt = getActiveStage();
    const accelMs2 =
      activeSt && !activeSt.jettisoned && sim.subPhase !== "WAIT_STAGE"
        ? activeSt.thrustN / Math.max(50, getTotalMassKg())
        : 0;
    const maxDvBeforeImpactMs = Math.min(remDvMs, accelMs2 * tImp);

    if (remDvMs <= 5.0 || tImp <= 2.5 || maxDvBeforeImpactMs <= 3.0) {
      triggerOutcome(
        "abort",
        "MISSION ABORT · UNRECOVERABLE IMPACT TRAJECTORY",
        `Trajectory is bound to impact ${imp.body} in ${tImp.toFixed(0)}s (available Δv before impact: ${Math.round(maxDvBeforeImpactMs)} m/s is insufficient to recover).`
      );
      return true;
    }

    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (nowMs - (sim.lastUnrecoverableCheckMs || 0) < 250) return false;
    sim.lastUnrecoverableCheckMs = nowMs;

    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const radialOutAng =
      imp.body === "Moon"
        ? Math.atan2(s.ry - mSt[1], s.rx - mSt[0])
        : Math.atan2(s.ry, s.rx);
    const progradeAng =
      imp.body === "Moon"
        ? Math.atan2(s.vy - mSt[3], s.vx - mSt[2])
        : Math.atan2(s.vy, s.vx);

    const impulseEff = accelMs2 * tImp < remDvMs * 1.2 ? 0.55 : 0.90;
    const dvProbeKms = (maxDvBeforeImpactMs * impulseEff) / 1000.0;
    const horizonSec = Math.min(Math.max(tImp * 1.4 + 1800, 3600), 120000);
    const probeOpts = {
      mode: "cislunar",
      horizonSec,
      maxIters: 360,
      useLunarTopography: true,
      massKg: getTotalMassKg()
    };

    const probeEscapes = (ang) => {
      const testSc = {
        rx: s.rx,
        ry: s.ry,
        vx: s.vx + dvProbeKms * Math.cos(ang),
        vy: s.vy + dvProbeKms * Math.sin(ang)
      };
      const pr = P.computeLivePredictor(testSc, sim.simTimeSec, probeOpts);
      if (pr && pr.predImpact) return false;
      const pts = pr && pr.points;
      const tCovered = pts && pts.length > 0 ? pts[pts.length - 1].tAbs - sim.simTimeSec : 0;
      if (tCovered >= Math.min(horizonSec * 0.95, tImp * 1.05)) return true;
      return imp.body === "Earth" && pr && pr.predPerigeeKm > 95.0;
    };

    if (!probeEscapes(radialOutAng) && !probeEscapes(progradeAng)) {
      triggerOutcome(
        "abort",
        "MISSION ABORT · UNRECOVERABLE IMPACT TRAJECTORY",
        `Trajectory is mathematically bound to impact ${imp.body} in ${tImp.toFixed(0)}s (max achievable Δv ${Math.round(maxDvBeforeImpactMs)} m/s cannot clear surface).`
      );
      return true;
    }
    return false;
  }

  function advanceStageTransitions(dtSim) {
    const s = sim.sc;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const rEarth = Math.hypot(s.rx, s.ry);
    const altEarth = rEarth - CFG.R_EARTH;
    const relRx = s.rx - mSt[0];
    const relRy = s.ry - mSt[1];
    const relVx = s.vx - mSt[2];
    const relVy = s.vy - mSt[3];
    const dMoon = Math.hypot(relRx, relRy);
    const altMoon = dMoon - CFG.R_MOON;

    const earthKep = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
    const moonKep = P.cartesianToKeplerian2D(relRx, relRy, relVx, relVy, CFG.MU_MOON);

    if (evaluateUnrecoverableImpact()) {
      return;
    }

    // STAGE 1 FLOW
    if (sim.currentStage === 1) {
      if (sim.subPhase === "LAUNCH_PAD" && rEarth > CFG.R_EARTH + 0.15) {
        sim.subPhase = "ASCENT";
      }

      if (sim.subPhase === "ASCENT") {
        const activeSt = getActiveStage();
        const isLastBooster = s.activeStageIdx >= s.stages.length - 2;
        const inParkingOrbit =
          altEarth >= 175.0 &&
          earthKep.rp >= CFG.R_EARTH + 160.0 &&
          earthKep.vMag >= CFG.V_PARKING - 0.02;

        if (!isLastBooster && activeSt.fuelKg <= 0.5) {
          activeSt.fuelKg = 0;
          s.isThrusting = false;
          {
            // FIX #2: STAGING HOLD. Drop to 1x so the coast while waiting for [G] is short, and
            // remember the burn so the next booster re-lights automatically after separation
            // (previously the engine stayed off after [G] and the stack fell back under warp).
            sim.resumeBurnAfterStaging = true;
            if (sim.timeWarp > 1) setTimeWarp(1, true);
            clearThrottleLatch();
            sim.subPhase = "WAIT_STAGE";
          }
        } else if (activeSt.fuelKg <= 0.5 && s.activeStageIdx < s.stages.length - 1) {
          activeSt.fuelKg = 0;
          s.isThrusting = false;
          clearThrottleLatch();
          sim.subPhase = "WAIT_STAGE";
        } else if (inParkingOrbit) {
          // Physics audit: orbit reached with propellant still in this stage — keep it for TLI
          // (previously it was zeroed and thrown away, breaking the hangar's Δv budget).
          clearThrottleLatch();
          s.isThrusting = false;
          sim.subPhase = "TLI_BURN";
          sim.liveTliPlan = null;
          sim.autoCutoffNoticeTimer = 2.0;
        }
      }

      if (sim.subPhase === "TLI_BURN") {
        const tliSt = getActiveStage();
        if (s.activeStageIdx < s.stages.length - 1 && tliSt.fuelKg <= 0.5) {
          tliSt.fuelKg = 0;
          s.isThrusting = false;
          clearThrottleLatch();
          sim.subPhase = "WAIT_STAGE";
        }
      }

      if (sim.subPhase === "TLI_BURN") {
        const pred = sim.predictor;
        const minTargetAp = CFG.R_MOON_ORBIT > 200000 ? 280000.0 : 85000.0;
        const apAlt = Number.isFinite(earthKep.ra) ? earthKep.ra - CFG.R_EARTH : CFG.R_MOON_ORBIT;
        const highEnergyTransfer = earthKep.ecc >= 0.80 || earthKep.sma > 48000 || !Number.isFinite(earthKep.ra);
        const matchesCorridor =
          pred &&
          pred.predPerilune &&
          pred.predPerilune.distKm < 12000.0 &&
          apAlt > minTargetAp;

        if ((highEnergyTransfer && rEarth > CFG.R_PARKING + 4200.0 && !s.isThrusting) ||
            (matchesCorridor && rEarth > CFG.R_PARKING + 2500.0 && !s.isThrusting)) {
          if (sim.liveTliPlan && sim.liveTliPlan.transferPoints && sim.liveTliPlan.transferPoints.length > 2) {
            sim.committedTliPoints = sim.liveTliPlan.transferPoints.map((p) => ({ ...p }));
          } else if (pred && pred.points && pred.points.length > 2) {
            sim.committedTliPoints = pred.points.map((p) => ({ ...p }));
          }
          sim.currentStage = 2;
          sim.subPhase = "MCC_COAST";
          clearThrottleLatch();
          s.stage1Attached = false;
          s.stage1FuelKg = 0;
          s.fineTrimMode = true; // DEF-209
          sim.tliEpochMoonAngle = Math.atan2(mSt[1], mSt[0]); // DEF-201
          sim.minDMoon = Infinity;
          sim.mccLocked = false;
          sim.stage2TcmPlan = null;
          sim._lastAutoMcc = null;
          sim.lockedMccHeadingRad = null;
          dom.stageJumpSelect.value = "2";
          captureStageCheckpoint(2);
          setCameraMode("map", false);
        }
      }
    }

    // STAGE 2 FLOW
    if (sim.currentStage === 2) {
      const pred = sim.predictor;
      const inCorridor =
        pred &&
        pred.predPerilune &&
        !pred.predImpact &&
        pred.predPerilune.altKm >= CFG.CORRIDOR_MIN_ALT_KM &&
        pred.predPerilune.altKm <= CFG.CORRIDOR_MAX_ALT_KM;

      const isReceding = (relRx * relVx + relRy * relVy) > 0;
      if (dMoon < sim.minDMoon) {
        sim.minDMoon = dMoon;
      }

      // DEF-203 & real-scale flyby escape detection
      const passedAndReceding = isReceding && dMoon > 15000.0 && sim.minDMoon < 35000.0 && !inCorridor;
      const farAfterClosestBlind = sim.minDMoon < 12000.0 && dMoon > Math.max(15000.0, sim.minDMoon * 3.0) && !inCorridor && !(pred && pred.predPerilune);
      if (passedAndReceding || farAfterClosestBlind) {
        triggerOutcome(
          "abort",
          "MISSION ABORT · CISLUNAR TRAJECTORY ESCAPE",
          `Spacecraft bypassed the Moon (closest approach: ${sim.minDMoon.toFixed(0)} km) and escaped into deep space at ${dMoon.toFixed(0)} km without entering the required corridor.`
        );
        return;
      }


      if ((dMoon < 9500.0 && inCorridor) || dMoon < 4500.0) {
        sim.currentStage = 3;
        sim.subPhase = "LOI_1";
        s.fineTrimMode = false;
        sim.loiPlan = null; sim.loiRescue = false; sim.loiSafetyHold = false; sim.loiAcceptRequested = false; sim._prevPeriAlt = null;
        sim.mccLocked = false; // DEF-304
        sim.lockedMccHeadingRad = null;
        sim.warpingToWindow = false;
        setTimeWarp(1);
        dom.stageJumpSelect.value = "3";
        captureStageCheckpoint(3);
        setCameraMode("moon", false);
      }
    }

    // STAGE 3 FLOW
    if (sim.currentStage === 3) {
      if (sim.subPhase === "LOI_1" || sim.subPhase === "LOI_2") {
        const apoAlt = Number.isFinite(moonKep.ra) ? moonKep.ra - CFG.R_MOON : Infinity;
        const periAlt = moonKep.rp - CFG.R_MOON;
        const tgtAp = loiTargetApKm(periAlt);
        const prevPe = sim._prevPeriAlt;
        sim._prevPeriAlt = periAlt;
        sim.loiAcceptable = !s.isThrusting && moonKep.energy < 0 && moonKep.ecc < 0.25 && periAlt >= 25.0 && apoAlt <= 350.0 && !sim.loiSafetyHold;
        if (!sim.loiAcceptable) sim.loiAcceptRequested = false;
        const captureNow = (reason) => {
          sim.subPhase = "SCIENCE_ORBIT";
          clearThrottleLatch();
          s.isThrusting = false;
          sim.autoCutoffNoticeTimer = 3.0;
          sim.lastCutoffReason = reason;
          sim.pendingSurveyHandoff = true; // Option A+: hand the real orbit to the Phase 3 survey
        };
        if (moonKep.energy < 0 && periAlt >= 25.0 && apoAlt <= tgtAp) {
          // target science orbit reached (full-data band, or just above a high perilune)
          captureNow(`CUTOFF: SCIENCE ORBIT ✓ PE ${Math.round(periAlt)} / AP ${Math.round(apoAlt)} KM`);
        } else if (s.isThrusting && sim.loiRescue && periAlt >= Math.min(35.0, Math.hypot(relRx, relRy) - CFG.R_MOON - 2.0)) {
          // perilune rescue done → stop, braking resumes with the normal countdown
          clearThrottleLatch(); s.isThrusting = false;
          sim.autoCutoffNoticeTimer = 3.0;
          sim.lastCutoffReason = `PERILUNE SAFE (${Math.round(periAlt)} KM) · RESUME BRAKING`;
          sim.loiPlan = null; sim.loiSafetyHold = false;
        } else if (s.isThrusting && !sim.loiRescue && periAlt < 25.0 && prevPe != null && periAlt < prevPe) {
          // SAFETY CUTOFF: braking is driving the perilune into the surface — stop instead of a silent crash
          clearThrottleLatch(); s.isThrusting = false;
          sim.autoCutoffNoticeTimer = 4.0;
          sim.lastCutoffReason = `⚠ SAFETY CUTOFF · PERILUNE ${Math.round(periAlt)} KM · RAISE IT FIRST`;
          sim.loiSafetyHold = true;
        } else if (sim.loiAcceptable && sim.loiAcceptRequested) {
          // the player chose to keep a usable (amber) orbit with [ENTER] — Phase 3 trims can lower it
          captureNow(`ORBIT ACCEPTED · PE ${Math.round(periAlt)} / AP ${Math.round(apoAlt)} KM (TRIM IN SURVEY)`);
        } else if (sim.subPhase === "LOI_1" && moonKep.energy < 0 && moonKep.ecc < 0.92 && periAlt > 12.0) {
          sim.subPhase = "LOI_2";
        }
      } else if (sim.subPhase === "SCIENCE_ORBIT" && !sim.pendingSurveyHandoff && !sim.surveyDone) {
        // Science is gathered in Phase 3 (the old Stage 3B buffer/downlink loop is replaced)
        sim.pendingSurveyHandoff = true;      }

    }

    checkFuelOut();

    const occ = P.checkDSNOccultation([s.rx, s.ry], [mSt[0], mSt[1]]);
    sim.dsnBlocked = occ.blocked;
  }

  /** Out of propellant → non-blocking choice instead of an automatic Mission Failed screen. */
  function checkFuelOut() {
    if (sim.outcome || sim.subPhase === "LAUNCH_PAD") {
      if (sim.fuelOut === "shown") { sim.fuelOut = "none"; dom.fuelOutPrompt.classList.add("hidden"); }
      return;
    }
    if (sim.fuelOut !== "none" || getRemainingFuelKg() > 0.05) return;
    sim.fuelOut = "shown";
    input.burnHeld = false;
    sim.sc.isThrusting = false;
    const pred = sim.predictor;
    let outlook = "The predicted line shows where your momentum takes you.";
    if (pred && pred.predImpact && pred.predImpact.body === "Moon") {
      outlook = pred.predImpact.isSouthPole && sim.currentStage === 4
        ? "Good news: your coast already ends inside the South Pole corridor."
        : "Warning: your coast ends in a lunar impact.";
    } else if (pred && pred.predPerilune && sim.currentStage <= 3) {
      outlook = `Predicted closest approach to the Moon: ${pred.predPerilune.altKm.toFixed(0)} km.`;
    }
    dom.fuelOutText.textContent = `No usable propellant remains in any stage. The spacecraft keeps coasting on orbital inertia. ${outlook}`;
    dom.fuelOutPrompt.classList.remove("hidden");
  }

  function resolveFuelOut(choice) {
    dom.fuelOutPrompt.classList.add("hidden");
    if (choice === "abort") {
      triggerOutcome(
        "abort",
        "MISSION ABORTED · OUT OF PROPELLANT",
        "The flight director ended the mission after every stage ran dry. Back in the hangar: more propellant, a higher-Isp stage or a lighter spacecraft adds Δv (Tsiolkovsky)."
      );
    } else {
      sim.fuelOut = "dismissed";
    }
  }

  // ===========================================================================
  // PHASE 3 HANDOFF (Option A+): Stage 3 orbit capture → lunar survey → Stage 4 impact
  // ===========================================================================
  function handoffToSurvey() {
    const s = sim.sc;
    const bus = s.stages[s.stages.length - 1];
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const kep = P.cartesianToKeplerian2D(s.rx - mSt[0], s.ry - mSt[1], s.vx - mSt[2], s.vy - mSt[3], CFG.MU_MOON);
    let otherMass = 0;
    for (let i = 0; i < s.stages.length - 1; i++) {
      if (!s.stages[i].jettisoned) otherMass += s.stages[i].dryKg + Math.max(0, s.stages[i].fuelKg);
    }
    clearThrottleLatch();
    s.isThrusting = false;
    const handoff = {
      t: sim.simTimeSec,
      rx: s.rx, ry: s.ry, vx: s.vx, vy: s.vy,
      headingRad: s.headingRad,
      periAltKm: kep.rp - CFG.R_MOON,
      apoAltKm: Number.isFinite(kep.ra) ? kep.ra - CFG.R_MOON : NaN,
      periAngleDeg: (kep.aopRad || 0) * CFG.RAD_TO_DEG,
      ecc: kep.ecc,
      fuelKg: Math.max(0, bus.fuelKg),
      fuelMaxKg: bus.fuelMaxKg,
      dryKg: bus.dryKg + otherMass,
      ispS: bus.ispS,
      thrustN: bus.realThrustN || bus.thrustN,
      controlFactor: (getBuild() && getBuild().flight && getBuild().flight.controlFactor) || 1
    };
    if (window.GameState) {
      window.GameState.orbitHandoff = handoff;
      window.GameState.surveyResult = null;
      window.GameState.phase = "survey";
    }
    sim.surveyDone = false;
    let surveyStarted = false;
    if (window.Phase3 && typeof window.Phase3.start === "function") {
      try {
        window.Phase3.start(handoff, resumeFromSurvey);
        document.getElementById("phase2").classList.add("hidden"); // hide only once Phase 3 is up
        surveyStarted = true;
      } catch (err) {
        console.error("Phase 3 failed to start — continuing to Stage 4", err);
        const p3 = document.getElementById("phase3");
        if (p3) p3.classList.add("hidden");
      }
    }
    if (!surveyStarted) {
      // no survey module: fall straight through to the impact stage
      resumeFromSurvey({ t: handoff.t, rx: s.rx, ry: s.ry, vx: s.vx, vy: s.vy, fuelKg: handoff.fuelKg, sciencePct: 0 });
    }
  }

  /** Called by Phase 3 when the survey orbit is complete (or the craft was lost). */
  function resumeFromSurvey(res) {
    const s = sim.sc;
    const bus = s.stages[s.stages.length - 1];
    if (window.GameState) {
      window.GameState.surveyResult = res;
      window.GameState.phase = "flight";
    }
    document.getElementById("phase2").classList.remove("hidden");
    sim.surveyDone = true;
    s.rx = res.rx; s.ry = res.ry; s.vx = res.vx; s.vy = res.vy;
    sim.simTimeSec = res.t;
    bus.fuelKg = Math.max(0, res.fuelKg);
    sim.scienceScorePct = Math.max(0, Math.min(100, res.sciencePct || 0));
    sim.scienceBufferPct = 0;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    s.headingRad = Math.atan2(-(s.vy - mSt[3]), -(s.vx - mSt[2])); // face retrograde for the de-orbit burn
    s.omegaRadS = 0;
    sim.paused = false;
    dom.btnPause.textContent = "PAUSE";
    if (res.crashed) {
      triggerOutcome("abort", "SPACECRAFT LOST DURING THE SURVEY", "The orbit decayed into the lunar surface before the survey orbit was complete.");
      if (window.Phase3 && window.Phase3.showFinalReport) window.Phase3.showFinalReport({ hit: false, crashedInSurvey: true });
      return;
    }
    sim.currentStage = 4;
    sim.subPhase = "IMPACT_DIVE";
    s.fineTrimMode = false;
    sim.mccLocked = false;
    dom.stageJumpSelect.value = "4";
    setTimeWarp(1);
    setCameraMode("moon", true);
    captureStageCheckpoint(4);
    lastWallTime = performance.now();
    refreshPredictor(true);
    updateFidoGuidance(true);
    updateHUD();
  }

  function triggerDownlinkData() {
    if (sim.outcome) return;
    if (sim.currentStage !== 3 || sim.subPhase !== "SCIENCE_ORBIT") return;
    if (sim.dsnBlocked) return;
    if (sim.scienceBufferPct <= 0.5) return;

    sim.scienceScorePct = Math.min(100.0, sim.scienceScorePct + sim.scienceBufferPct);
    sim.scienceBufferPct = 0.0;
    sim.downlinkBeamTimer = 1.25;

    if (sim.scienceScorePct >= 100.0) {
      sim.scienceScorePct = 100.0;
      sim.currentStage = 4;
      sim.subPhase = "IMPACT_DIVE";
      dom.stageJumpSelect.value = "4";
      captureStageCheckpoint(4);
    }
    updateFidoGuidance();
    updateHUD();
  }

  // ===========================================================================
  // 9. PHYSICS STEP, RIGID-BODY INERTIA & TIME WARP LOOP
  // ===========================================================================
  // ---------------------------------------------------------------------------
  // FIX #2: PHASE-AWARE FUEL SAFEGUARD
  //  (a) warp limiter (in stepSimulation): never lets a tank empty in < 4 REAL seconds at warp.
  //  (b) one-shot reserve warning: fires ONCE per mission stage when the orbital bus' remaining Δv
  //      drops to what the rest of the mission still needs. A % of tank is a poor trigger here
  //      because Stages 2-4 START with the bus at 22-25% (a 30% rule would fire instantly) and
  //      boosters are supposed to run dry.
  //  (c) the engine is only ever cut where coasting is safe (never during ascent/staging, LOI
  //      braking or the Stage 4 dive) — otherwise only the warp is dropped to 1x.
  // Tune the numbers below; set MISSION_RESERVE_DV_MS to e.g. { 1: 0, ... } to disable a stage.
  // ---------------------------------------------------------------------------
  const FUEL_REACTION_REAL_SEC = 4.0;
  const MISSION_RESERVE_DV_MS = { 1: 1100, 2: 900, 3: 200, 4: 0 }; // TCM+LOI+deorbit / LOI+deorbit / deorbit

  function isSafeToCutEngine() {
    const s = sim.sc;
    if (sim.currentStage === 1 && (sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT" || sim.subPhase === "WAIT_STAGE")) {
      return false; // suborbital: cutting thrust = falling back to Earth
    }
    if (sim.currentStage === 3 && (sim.subPhase === "LOI_1" || sim.subPhase === "LOI_2")) return false; // mid-capture
    if (sim.currentStage === 4) return false;
    const rE = Math.hypot(s.rx, s.ry);
    if (rE < CFG.R_EARTH + 5000.0) {
      const k = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
      if (!(k.rp - CFG.R_EARTH > CFG.H_ATMOS_DRAG_MAX)) return false; // perigee inside the atmosphere
    }
    const pred = sim.predictor;
    if (pred && pred.predImpact && Number.isFinite(pred.predImpact.timeFromNowSec) && pred.predImpact.timeFromNowSec < 3.0 * 3600.0) {
      return false;
    }
    return true;
  }

  function checkMissionFuelReserve() {
    const s = sim.sc;
    if (s.activeStageIdx < s.stages.length - 1) return; // boosters: covered by warp limiter + [G] prompt
    const reserveMs = MISSION_RESERVE_DV_MS[sim.currentStage] || 0;
    if (reserveMs <= 0) return;
    const key = `S${sim.currentStage}`;
    if (sim.fuelWarnLatch[key]) return; // warn ONCE (not re-armed by re-pressing [SPACE])
    const remDvMs = computeRemainingDeltaVMs();
    if (remDvMs > reserveMs) return;
    sim.fuelWarnLatch[key] = true;
    if (sim.timeWarp > 1) setTimeWarp(1, true);
    const cut = isSafeToCutEngine();
    if (cut) {
      clearThrottleLatch();
      sim.fuelSafetyLockout = true; // released by the next [SPACE] press
    }
    sim.fuelSafetyBannerTimer = 5.0;
    sim.fuelSafetyBannerText = cut
      ? `⛽ RESERVE REACHED: ${Math.round(remDvMs)} m/s LEFT FOR LATER STAGES · ENGINE PAUSED (1x) — [SPACE] TO CONTINUE`
      : `⛽ RESERVE REACHED: ${Math.round(remDvMs)} m/s LEFT · DROPPED TO 1x — ENGINE KEPT ON (UNSAFE TO CUT HERE)`;
    sim.lastCutoffReason = cut ? "FUEL RESERVE: ENGINE PAUSED (ONCE)" : "FUEL RESERVE: WARP → 1x (ONCE)";
  }

  function warpToNextWindow() {
    if (sim.outcome) return;
    const t = sim.timerState;
    if (!t || t.isBurnNow || !Number.isFinite(t.tRemSec) || t.tRemSec <= 45.0) {
      setTimeWarp(1);
      sim.warpingToWindow = false;
      return;
    }
    sim.warpingToWindow = true;
    const desiredWarp = sim.currentStage === 2 ? 500 : 25;
    setTimeWarp(desiredWarp);
  }

  function stepSimulation(dtRealSec) {
    const s = sim.sc;

    const activeSpinOmega = s.fineTrimMode ? VEHICLE.RHYTHM_SPIN_OMEGA_RAD_S : VEHICLE.SPIN_OMEGA_RAD_S;
    s.spinPhaseRad = P.normalizeAnglePosRad(s.spinPhaseRad + activeSpinOmega * dtRealSec);
    if (s.pulseFlashTimer > 0) s.pulseFlashTimer = Math.max(0, s.pulseFlashTimer - dtRealSec);
    if (s.rhythmFeedbackTimer > 0) s.rhythmFeedbackTimer = Math.max(0, s.rhythmFeedbackTimer - dtRealSec);
    if (sim.downlinkBeamTimer > 0) sim.downlinkBeamTimer = Math.max(0, sim.downlinkBeamTimer - dtRealSec);
    if (sim.autoCutoffNoticeTimer > 0) sim.autoCutoffNoticeTimer = Math.max(0, sim.autoCutoffNoticeTimer - dtRealSec);
    if (sim.autoSlowNoticeTimer > 0) sim.autoSlowNoticeTimer = Math.max(0, sim.autoSlowNoticeTimer - dtRealSec);
    if (sim.fuelSafetyBannerTimer > 0) sim.fuelSafetyBannerTimer = Math.max(0, sim.fuelSafetyBannerTimer - dtRealSec);

    if (sim.paused || sim.outcome) return;

    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const dMoon = Math.hypot(s.rx - mSt[0], s.ry - mSt[1]);
    const rEarth = Math.hypot(s.rx, s.ry);
    const altEarth = rEarth - CFG.R_EARTH;

    if (sim.timeWarp > 1 && sim.timerState && !sim.timerState.isBurnNow &&
        Number.isFinite(sim.timerState.tRemSec) && sim.timerState.tRemSec > 0 && sim.timerState.tRemSec <= 45.0) {
      setTimeWarp(1);
      sim.warpingToWindow = false;
      sim.autoSlowNoticeTimer = 2.5;
    } else if (sim.warpingToWindow && sim.timerState && sim.timerState.isBurnNow) {
      setTimeWarp(1);
      sim.warpingToWindow = false;
    }

    const wantBurn = input.throttleLatched || input.shiftSpaceHeld || input.burnHeld;

    // FIX #3: drop to 1x whenever a burn window OPENS (false -> true edge), not only when the
    // player used [W]. With manual 100x-1000x the Stage 2 node switched straight to "BURN NOW"
    // and warp kept running straight through it. Edge-triggered so it never traps you at 1x.
    const burnNowFlag = Boolean(sim.timerState && sim.timerState.isBurnNow);
    if (sim.timeWarp > 1 && burnNowFlag && sim._prevTimerBurnNow === false && !wantBurn) {
      setTimeWarp(1, true);
      sim.autoSlowNoticeTimer = 2.5;
    }
    sim._prevTimerBurnNow = burnNowFlag;
    const isBurnActive = wantBurn && !sim.outcome && !sim.fuelSafetyLockout;
    let effectiveWarp = sim.timeWarp;
    if (isBurnActive && sim.timeWarp > 1) {
      if (sim.currentStage === 1) {
        effectiveWarp = sim.subPhase === "ASCENT"
          ? P.clamp(sim.timeWarp * 0.15, 1.5, 4.0)
          : P.clamp(sim.timeWarp * 0.2, 1.5, 8.0);
      } else {
        effectiveWarp = P.clamp(sim.timeWarp * 0.35, 2.0, 25.0);
      }
    }
    sim.effectiveBurnWarp = isBurnActive && sim.timeWarp > 1 ? effectiveWarp : sim.timeWarp;

    let throttleFactor = 1.0;
    if (input.shiftSpaceHeld || (input.shiftDown && !input.throttleLatched)) {
      throttleFactor = 0.25;
    } else if (
      sim.currentStage === 2 &&
      Number.isFinite(sim.fido.neededDvMs) &&
      sim.fido.neededDvMs > 0 &&
      sim.fido.neededDvMs <= 2.0
    ) {
      throttleFactor = 0.25;
    }
    sim.lastThrottleFactor = isBurnActive ? throttleFactor : 0;

    let baseScale = 12.0;
    if (sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT") {
      baseScale = 4.0;
    } else if (sim.subPhase === "WAIT_STAGE" || sim.subPhase === "TLI_BURN") {
      baseScale = isBurnActive ? 2.5 : 8.0;
    } else if (sim.currentStage === 2) {
      baseScale = isBurnActive ? (sim.timeWarp > 1 ? 8.0 : 1.0) : (sim.mccLocked && dMoon > 25000 ? 60.0 : 12.0);
    } else if (sim.currentStage === 3) {
      baseScale = isBurnActive ? (sim.timeWarp > 1 ? 2.5 : 1.0) : (sim.subPhase === "SCIENCE_ORBIT" ? 45.0 : dMoon > 2400 ? 18.0 : 4.0);
    } else if (sim.currentStage === 4) {
      baseScale = isBurnActive ? (sim.timeWarp > 1 ? 3.0 : 1.0) : 16.0;
    }

    let totalSimDt = dtRealSec * baseScale * effectiveWarp;
    // FIX #3: never let ONE frame jump over the T-45s auto-slow point. At 1000x one frame can be
    // 750-2250 sim-seconds, so the old "if tRem <= 45 then slow down" check (run before stepping)
    // was skipped entirely and the panel jumped from "TCM IN 40m" straight to past-the-node.
    if (!isBurnActive && sim.timeWarp > 1 && sim.timerState && !sim.timerState.isBurnNow) {
      const tRemNow = sim.timerState.tRemSec;
      if (Number.isFinite(tRemNow) && tRemNow > 45.0) {
        totalSimDt = Math.min(totalSimDt, Math.max(0.25, tRemNow - 44.0));
      }
    }
    const burnRateScale =
      sim.timeWarp > 1
        ? sim.currentStage === 1
          ? P.clamp(1.0 + 0.35 * Math.log2(Math.max(1, sim.timeWarp)), 1.0, 2.8)
          : P.clamp(1.0 + 0.55 * Math.log2(Math.max(1, sim.timeWarp)), 1.0, 4.2)
        : effectiveWarp;
    const burnBaseScale = sim.currentStage === 1 ? baseScale : 1.0;
    const totalBurnDt = isBurnActive ? dtRealSec * burnBaseScale * burnRateScale : 0.0;

    // DEF-206: Disable LVLH drift in deep space (and while actively piloting with A/D)
    const isDeepSpace = sim.currentStage === 2 || (rEarth >= 10000.0 && dMoon >= 4000.0);
    if (sim.subPhase !== "LAUNCH_PAD" && !isDeepSpace && !input.left && !input.right) {
      const useMoon = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI;
      const rxRel = useMoon ? s.rx - mSt[0] : s.rx;
      const ryRel = useMoon ? s.ry - mSt[1] : s.ry;
      const vxRel = useMoon ? s.vx - mSt[2] : s.vx;
      const vyRel = useMoon ? s.vy - mSt[3] : s.vy;
      const r2 = Math.max(1e6, rxRel * rxRel + ryRel * ryRel);
      const omegaOrb = (rxRel * vyRel - ryRel * vxRel) / r2;
      s.headingRad += omegaOrb * totalSimDt;
    }

    // Rigid-Body Rotational Dynamics: alpha = tau / I_stack
    if (sim.subPhase !== "LAUNCH_PAD") {
      // FIX #4: A/D used to switch Auto-Aim OFF permanently; with the ship's inertia the player then
      // had to null the rotation by hand. Now A/D is a temporary override and Auto-Aim resumes
      // 1.2 s after the key is released ([Q] still turns it fully off).
      if (input.left || input.right) {
        sim.manualOverrideUntilMs = performance.now() + 1200;
      }
      const autoAimActive = sim.autoAim && performance.now() >= (sim.manualOverrideUntilMs || 0);

      const moi = getStackMomentOfInertiaKgM2();
      const activeSt = getActiveStage();
      const gimbalAuthority = s.isThrusting ? (activeSt.thrustN * getStackHeightMeters() * 0.14) : 0.0;
      // Actuator sync: once only the spacecraft is left, its thrusters' capacity (hangar
      // "Actuator margin") scales attitude authority; launcher stages keep gimbal + RCS.
      const b = getBuild();
      const ctrl = s.activeStageIdx >= s.stages.length - 1 && b && b.flight ? b.flight.controlFactor : 1.0;
      const rcsAuthority = Math.max(450.0, moi * 1.15) * ctrl;
      const totalTorque = rcsAuthority + gimbalAuthority;
      const steerBoost = sim.timeWarp > 1 ? 1.45 : 1.0;
      const alphaMax = P.clamp(totalTorque / Math.max(250.0, moi), 0.75, 6.5) * steerBoost;
      const maxOmega = P.clamp(1.1 + 950.0 / Math.max(500.0, Math.sqrt(moi)), 1.25, 2.8) * steerBoost;

      let alphaAero = 0.0;
      if (altEarth > 0.2 && altEarth < CFG.H_KARMAN_KM && s.lastDynPressPa > 5.0 && !sim.autoAim) {
        const velAng = Math.atan2(s.vy, s.vx);
        const aoa = P.normalizeAngleRad(velAng - s.headingRad);
        alphaAero = P.clamp((s.lastDynPressPa * 18.0 * Math.sin(aoa)) / Math.max(500.0, moi), -1.8, 1.8);
      }

      if (input.left) {
        s.omegaRadS = P.clamp(s.omegaRadS + (alphaMax + alphaAero) * dtRealSec, -maxOmega, maxOmega);
      } else if (input.right) {
        s.omegaRadS = P.clamp(s.omegaRadS + (-alphaMax + alphaAero) * dtRealSec, -maxOmega, maxOmega);
      } else if (autoAimActive && Number.isFinite(holdTargetHeading())) {
        const aimHeading = holdTargetHeading();
        const err = P.normalizeAngleRad(aimHeading - s.headingRad);
        const trackRate = P.clamp(1.25 + 650.0 / Math.max(500.0, Math.sqrt(moi)), 1.4, 3.6);
        // FIX #4: braking-aware rate command. The old `err * 5` ignored how long the stack needs to
        // stop, so heavy stacks overshot and hunted around the target. sqrt(2·α·|err|) is the
        // fastest rate we can still brake from (bang-bang profile), with a 0.8 safety factor.
        const alphaCtl = alphaMax * 2.2;
        const errAbs = Math.abs(err);
        const brakeOmega = Math.sqrt(2.0 * alphaCtl * 0.8 * errAbs);
        const desiredOmega = Math.sign(err) * Math.min(trackRate, errAbs * 5.0, brakeOmega);
        const dOmega = P.clamp(desiredOmega - s.omegaRadS, -alphaCtl * dtRealSec, alphaCtl * dtRealSec);
        s.omegaRadS += dOmega;
        if (Math.abs(err) < 0.015 && Math.abs(s.omegaRadS) < 0.08) {
          s.headingRad = aimHeading;
          s.omegaRadS = 0.0;
        }
      } else {
        s.omegaRadS += alphaAero * dtRealSec;
        if (sim.sasEnabled && s.omegaRadS !== 0.0) {
          s.omegaRadS *= Math.exp(-5.5 * dtRealSec);
          if (Math.abs(s.omegaRadS) < 1e-4) s.omegaRadS = 0.0;
        }
      }
      s.headingRad = P.normalizeAngleRad(s.headingRad + s.omegaRadS * dtRealSec);
    }

    if (sim.subPhase === "LAUNCH_PAD") {
      const firstSt = s.stages[0];
      if (wantBurn && firstSt && firstSt.fuelKg > 0) {
        sim.subPhase = "ASCENT";
      } else {
        const ang = Math.atan2(s.ry, s.rx) + CFG.OMEGA_EARTH * totalSimDt;
        const vSurf = CFG.OMEGA_EARTH * CFG.R_EARTH;
        s.rx = CFG.R_EARTH * Math.cos(ang);
        s.ry = CFG.R_EARTH * Math.sin(ang);
        s.vx = -vSurf * Math.sin(ang);
        s.vy = vSurf * Math.cos(ang);
        s.headingRad = ang;               // stands exactly vertical on the pad (pitch-over starts after tower clear)
        s.omegaRadS = 0.0;
        sim.simTimeSec += totalSimDt;
        return;
      }
    }

    // FIX #4: ATTITUDE INTERLOCK. Thrust used to be applied along the nose whatever the alignment,
    // so a burn started while the slow stack was still turning pushed the trajectory the wrong way,
    // the solver then moved the target again, and so on. With Auto-Aim engaged (Stage 2+), thrust
    // is 100% within 5° of the target, ramps to 0% at 15°, and the HUD shows ALIGNING meanwhile.
    sim.attitudeGate = 1.0;
    const aimEngagedForGate = sim.autoAim && performance.now() >= (sim.manualOverrideUntilMs || 0);
    if (isBurnActive && aimEngagedForGate && sim.currentStage >= 2 && Number.isFinite(sim.fido.targetHeadingRad)) {
      const errDegGate = Math.abs(P.normalizeAngleRad(sim.fido.targetHeadingRad - s.headingRad)) * CFG.RAD_TO_DEG;
      sim.attitudeGate = errDegGate <= 5.0 ? 1.0 : errDegGate >= 15.0 ? 0.0 : 1.0 - (errDegGate - 5.0) / 10.0;
    }

    // FIX #2 (a): FUEL-AWARE WARP LIMITER. Instead of cutting the engine, guarantee the player always
    // has >= FUEL_REACTION_REAL_SEC of REAL time before the active tank runs dry: if the current warp
    // would empty it sooner, drop to 1x (engine keeps burning). Works for every booster in a 2-5 stage
    // stack, so ascent can no longer "fall back to Earth" because a guard switched the engine off.
    if (isBurnActive && sim.timeWarp > 1) {
      const stNow = getActiveStage();
      if (stNow && !stNow.jettisoned && stNow.fuelKg > 0.01) {
        const mDotNow = stNow.thrustN / (stNow.ispS * CFG.G0_MS2);
        const fuelPerRealSec = mDotNow * throttleFactor * Math.max(1e-6, burnBaseScale * burnRateScale);
        const realSecToEmpty = stNow.fuelKg / Math.max(1e-6, fuelPerRealSec);
        if (realSecToEmpty < FUEL_REACTION_REAL_SEC) {
          setTimeWarp(1, true);
          sim.fuelSafetyBannerTimer = 3.0;
          sim.fuelSafetyBannerText = `⛽ ${stNow.name} ~${Math.max(1, Math.round(realSecToEmpty))}s OF FUEL AT WARP · DROPPED TO 1x (ENGINE STILL BURNING)`;
          sim.lastCutoffReason = "WARP LIMIT: LOW TANK (1x)";
        }
      }
    }

    const maxSubStep = rEarth < 10000 || dMoon < 6000 || (sim.currentStage === 2 && isBurnActive) ? 2.5 : 45.0;
    const nSub = Math.min(110, Math.max(1, Math.ceil(totalSimDt / maxSubStep)));
    const h = totalSimDt / nSub;
    const hBurn = totalBurnDt / nSub;

    for (let i = 0; i < nSub; i++) {
      let thrustAx = 0;
      let thrustAy = 0;
      s.isThrusting = false;

      const activeSt = getActiveStage();
      const canBurnActive =
        isBurnActive &&
        !sim.fuelSafetyLockout &&
        sim.attitudeGate > 0.0 &&
        activeSt &&
        !activeSt.jettisoned &&
        (sim.subPhase !== "WAIT_STAGE") &&
        activeSt.fuelKg > 0.01;

      if (canBurnActive) {
        const thr = throttleFactor * sim.attitudeGate;
        const totalM = getTotalMassKg();
        const aKmS2 = activeSt.thrustN / (totalM * 1000.0);
        const mDot = activeSt.thrustN / (activeSt.ispS * CFG.G0_MS2);
        const burnScaleInSubStep = (h > 1e-9 ? hBurn / h : 0.0) * thr;
        thrustAx = aKmS2 * burnScaleInSubStep * Math.cos(s.headingRad);
        thrustAy = aKmS2 * burnScaleInSubStep * Math.sin(s.headingRad);
        const fuelBurnedKg = mDot * hBurn * thr;
        if (sim.currentStage === 2) {
          sim.stage2BurnedDvMs += aKmS2 * 1000.0 * hBurn * thr;
        }
        {
          activeSt.fuelKg = Math.max(0.0, activeSt.fuelKg - fuelBurnedKg);
          checkMissionFuelReserve();
        }
        s.isThrusting = !sim.fuelSafetyLockout;
        if (sim.currentStage === 2) sim.mccDirty = true;
      }

      const next = P.rk4Step2D(s, sim.simTimeSec, h, {
        thrustAx,
        thrustAy,
        massKg: getTotalMassKg(),
        enableDrag: true,
        cdArea: getStackCdA(),
        useLunarTopography: true
      });

      const rNow = Math.hypot(s.rx, s.ry);
      if (s.isThrusting && rNow < 18000.0) {
        const vM = Math.max(0.01, Math.hypot(s.vx, s.vy));
        const gLocalMs2 = (CFG.MU_EARTH / Math.max(1e6, rNow * rNow)) * 1000.0;
        const sinGamma = (s.rx * s.vx + s.ry * s.vy) / (Math.max(1.0, rNow) * vM);
        s.gravityLossMs += Math.max(0.0, gLocalMs2 * sinGamma * hBurn);
      }
      if ((next.dragAccel || 0) > 0 && rEarth < CFG.R_ATMOS_BOUNDARY) {
        s.dragLossMs += next.dragAccel * 1000.0 * h;
      }

      s.rx = next.rx;
      s.ry = next.ry;
      s.vx = next.vx;
      s.vy = next.vy;
      s.lastRho = next.rho || 0;
      s.lastDragAccel = next.dragAccel || 0;
      s.lastDynPressPa = next.dynPressPa || 0;
      s.maxDynPressPa = Math.max(s.maxDynPressPa || 0, s.lastDynPressPa);
      s.lastHeatFluxKwM2 = next.heatFluxKwM2 || 0;
      s.lastGLoad = next.gLoad || 1.0;
      sim.simTimeSec += h;
      // FIX #5: record trail per physics sub-step (was once per FRAME -> at 1000x warp
      // consecutive points were ~1/10 orbit apart and drew straight chords across the Moon)
      recordTrailPoint();

      if (next.impact) {
        handleImpact(next.impact);
        break;
      }

      advanceStageTransitions(h);
      if (sim.outcome) break;
    }

    if (sim.jettisonedBooster) {
      const jb = sim.jettisonedBooster;
      jb.rx += jb.vx * totalSimDt;
      jb.ry += jb.vy * totalSimDt;
      jb.angle += 0.6 * dtRealSec;
      jb.life -= dtRealSec;
      if (jb.life <= 0) sim.jettisonedBooster = null;
    }
    for (let k = sim.debrisList.length - 1; k >= 0; k--) {
      const db = sim.debrisList[k];
      db.rx += db.vx * totalSimDt;
      db.ry += db.vy * totalSimDt;
      db.angle += db.spinRate * dtRealSec;
      db.life -= dtRealSec;
      if (db.life <= 0) sim.debrisList.splice(k, 1);
    }

    trimTrail();
  }

  // ---------------------------------------------------------------------------
  // FIX #5: Trail recording & trimming
  // ---------------------------------------------------------------------------
  const TRAIL_MAX_POINTS = 1400;

  function recordTrailPoint() {
    const s = sim.sc;
    const m = P.getMoonStateAtTime(sim.simTimeSec);
    const relX = s.rx - m[0];
    const relY = s.ry - m[1];
    const nearMoon = sim.currentStage >= 3 || Math.hypot(relX, relY) < CFG.MOON_SOI;
    const last = sim.trail[sim.trail.length - 1];
    let spacingKm = Infinity;
    if (last) {
      spacingKm =
        nearMoon && Number.isFinite(last.relMoonX)
          ? Math.hypot(relX - last.relMoonX, relY - last.relMoonY) // spacing in the Moon's frame
          : Math.hypot(s.rx - last.rx, s.ry - last.ry);
    }
    const minSpacingKm = nearMoon ? 25.0 : camera.mode === "map" ? 900.0 : 40.0;
    if (spacingKm > minSpacingKm) {
      // _mx/_my/_mt pre-fill the ptToScreenFast cache (no extra Kepler solves when drawing)
      sim.trail.push({
        rx: s.rx,
        ry: s.ry,
        tAbs: sim.simTimeSec,
        relMoonX: relX,
        relMoonY: relY,
        _mx: m[0],
        _my: m[1],
        _mt: sim.simTimeSec
      });
    }
  }

  function trimTrail() {
    const s = sim.sc;
    // In a CLOSED lunar orbit keep just under one period of trail: the predictor already
    // draws the orbit, and older loops (precessed by mascons) only pile up as extra rings.
    let windowSec = Infinity;
    if (sim.currentStage >= 3) {
      const m = P.getMoonStateAtTime(sim.simTimeSec);
      const k = P.cartesianToKeplerian2D(s.rx - m[0], s.ry - m[1], s.vx - m[2], s.vy - m[3], CFG.MU_MOON);
      if (k.ecc < 1.0 && Number.isFinite(k.sma) && k.sma > 0) {
        windowSec = 0.9 * 2.0 * Math.PI * Math.sqrt((k.sma * k.sma * k.sma) / CFG.MU_MOON);
      }
    }
    const tMin = sim.simTimeSec - windowSec;
    let cut = 0;
    while (cut < sim.trail.length - 2 && sim.trail[cut].tAbs < tMin) cut++;
    const over = sim.trail.length - cut - TRAIL_MAX_POINTS;
    if (over > 0) cut += over;
    if (cut > 0) sim.trail.splice(0, cut);
  }

  function handleImpact(impact) {
    if (impact.body === "Earth") {
      triggerOutcome(
        "abort",
        "VEHICLE LOST · EARTH SURFACE IMPACT",
        `Spacecraft impacted Earth at ${impact.speedKms.toFixed(2)} km/s inside the Karman atmosphere.`
      );
      return;
    }

    if (impact.body === "Moon") {
      if (sim.currentStage === 4 && impact.isSouthPole) {
        triggerOutcome(
          "victory",
          "LUNAR SOUTH POLE IMPACT CONFIRMED",
          `Your spacecraft dived into Shoemaker Crater (${impact.angleDeg.toFixed(1)}°) at ${impact.speedKms.toFixed(2)} km/s, just as Lunar Prospector did on 31 July 1999.`
        );
        if (window.Phase3 && window.Phase3.showFinalReport) window.Phase3.showFinalReport({ hit: true, angleDeg: impact.angleDeg, speedKms: impact.speedKms });
      } else if (sim.currentStage === 4 && !impact.isSouthPole) {
        triggerOutcome(
          "abort",
          "OFF-TARGET LUNAR IMPACT",
          `Spacecraft impacted the Moon at ${impact.angleDeg.toFixed(1)}°, missing the South Pole Shoemaker Crater corridor (-114° to -66°).`
        );
        if (window.Phase3 && window.Phase3.showFinalReport) window.Phase3.showFinalReport({ hit: false, angleDeg: impact.angleDeg, speedKms: impact.speedKms });
      } else {
        const ridgeMsg = (impact.terrainElevKm && impact.terrainElevKm > 0.5)
          ? ` (struck +${impact.terrainElevKm.toFixed(1)} km lunar highland terrain!)`
          : ".";
        triggerOutcome(
          "abort",
          "PREMATURE LUNAR IMPACT",
          `Spacecraft crashed into the Lunar surface at ${impact.speedKms.toFixed(2)} km/s before completing mission science${ridgeMsg}`
        );
      }
    }
  }

  // ===========================================================================
  // 10. CAMERA PROJECTION, SYNODIC ROTATION & SFS ROCKET VIEW
  // ===========================================================================
  function toDisplayWorld(wxKm, wyKm, tAbsSec = sim.simTimeSec) {
    if (camera.refFrame === "synodic") {
      const tUse = Number.isFinite(tAbsSec) ? tAbsSec : sim.simTimeSec;
      const mAtT = P.getMoonStateAtTime(tUse);
      const thetaM = Math.atan2(mAtT[1], mAtT[0]);
      const c = Math.cos(thetaM);
      const s = Math.sin(thetaM);
      return {
        x: wxKm * c + wyKm * s,
        y: -wxKm * s + wyKm * c
      };
    }
    if (camera.mode === "moon" && Number.isFinite(tAbsSec)) {
      const mNow = P.getMoonStateAtTime(sim.simTimeSec);
      const mAtT = P.getMoonStateAtTime(tAbsSec);
      return {
        x: wxKm - mAtT[0] + mNow[0],
        y: wyKm - mAtT[1] + mNow[1]
      };
    }
    return { x: wxKm, y: wyKm };
  }

  function toDisplayAngle(worldRad, tAbsSec = sim.simTimeSec) {
    // Screen-facing angle = reference-frame angle + local-horizon camera rotation
    return toDisplayAngleRaw(worldRad, tAbsSec) + (camera.rotRad || 0);
  }

  function toDisplayAngleRaw(worldRad, tAbsSec = sim.simTimeSec) {
    if (camera.refFrame === "synodic") {
      const tUse = Number.isFinite(tAbsSec) ? tAbsSec : sim.simTimeSec;
      const mAtT = P.getMoonStateAtTime(tUse);
      const thetaM = Math.atan2(mAtT[1], mAtT[0]);
      return P.normalizeAngleRad(worldRad - thetaM);
    }
    return worldRad;
  }

  function worldPtToScreen(wxKm, wyKm, cx, cy, tAbsSec = sim.simTimeSec) {
    const dw = toDisplayWorld(wxKm, wyKm, tAbsSec);
    return worldToScreen(dw.x, dw.y, cx, cy);
  }

  function getBaseModeScaleKmPerPx(dMoon) {
    if (camera.mode === "rocket") return CFG.ROCKET_VIEW_KM_PER_PX || 0.0012;
    if (camera.mode === "flight") {
      return sim.currentStage >= 3 || dMoon < CFG.MOON_SOI
        ? CFG.LUNAR_FLIGHT_KM_PER_PX
        : CFG.FLIGHT_VIEW_KM_PER_PX;
    }
    if (camera.mode === "moon") return 7.2;
    return CFG.MAP_VIEW_KM_PER_PX;
  }

  function adjustCameraZoom(mult) {
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const dMoon = Math.hypot(sim.sc.rx - mSt[0], sim.sc.ry - mSt[1]);
    const baseScale = Math.max(1e-6, getBaseModeScaleKmPerPx(dMoon));
    const curTarget = P.clamp(baseScale * camera.manualZoomFactor, ZOOM_MIN_KM_PER_PX, ZOOM_MAX_KM_PER_PX);
    const nextTarget = P.clamp(curTarget * mult, ZOOM_MIN_KM_PER_PX, ZOOM_MAX_KM_PER_PX);
    camera.manualZoomFactor = nextTarget / baseScale;
  }

  function updateCameraTargets() {
    const s = sim.sc;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const dMoon = Math.hypot(s.rx - mSt[0], s.ry - mSt[1]);
    const scDisp = toDisplayWorld(s.rx, s.ry, sim.simTimeSec);
    const mDisp = toDisplayWorld(mSt[0], mSt[1], sim.simTimeSec);
    const centerFrac = camera.refFrame === "synodic" ? 0.35 : 0.22;
    const mapCenterX = mDisp.x * centerFrac;
    const mapCenterY = mDisp.y * centerFrac;

    const baseScale = getBaseModeScaleKmPerPx(dMoon);
    const targetScale = P.clamp(baseScale * camera.manualZoomFactor, ZOOM_MIN_KM_PER_PX, ZOOM_MAX_KM_PER_PX);
    camera.targetScaleKmPerPx = targetScale;

    let anchorX = scDisp.x;
    let anchorY = scDisp.y;
    if (camera.mode === "map") {
      // Smoothly blend toward spacecraft/Moon when zooming in below ~120 km/px from Map View
      const focusX = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI ? mDisp.x : scDisp.x;
      const focusY = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI ? mDisp.y : scDisp.y;
      const rawT = P.clamp(
        (Math.log(120.0) - Math.log(Math.max(1e-4, targetScale))) / (Math.log(120.0) - Math.log(20.0)),
        0.0,
        1.0
      );
      const scBlend = rawT * rawT * (3.0 - 2.0 * rawT);
      anchorX = mapCenterX + (focusX - mapCenterX) * scBlend;
      anchorY = mapCenterY + (focusY - mapCenterY) * scBlend;
    } else {
      const baseX = camera.mode === "moon" ? mDisp.x : scDisp.x;
      const baseY = camera.mode === "moon" ? mDisp.y : scDisp.y;
      // Smoothly blend toward Earth-Moon map center when zooming out past ~120 km/px
      const rawT = P.clamp(
        (Math.log(Math.max(1e-4, targetScale)) - Math.log(120.0)) / (Math.log(480.0) - Math.log(120.0)),
        0.0,
        1.0
      );
      const mapBlend = rawT * rawT * (3.0 - 2.0 * rawT);
      anchorX = baseX + (mapCenterX - baseX) * mapBlend;
      anchorY = baseY + (mapCenterY - baseY) * mapBlend;
    }

    camera.targetXKm = anchorX + camera.panOffsetXKm;
    camera.targetYKm = anchorY + camera.panOffsetYKm;
    camera.targetRotRad = computeHorizonCameraRot(targetScale, mSt, dMoon);
  }

  // Local-horizon camera: weight 1 below 50 km/px, 0 above 500 km/px (smoothstep in log scale),
  // always 0 in Map view. Up = away from the Moon inside its SOI / in Stages 3-4, else away from Earth.
  const HORIZON_CAM_FULL_KM_PER_PX = 50.0;
  const HORIZON_CAM_ZERO_KM_PER_PX = 500.0;

  function computeHorizonCameraRot(scaleKmPerPx, mSt, dMoon) {
    if (camera.mode === "map") return 0;
    const sc = Math.max(1e-6, scaleKmPerPx);
    const t = P.clamp(
      (Math.log(sc) - Math.log(HORIZON_CAM_FULL_KM_PER_PX)) /
        (Math.log(HORIZON_CAM_ZERO_KM_PER_PX) - Math.log(HORIZON_CAM_FULL_KM_PER_PX)),
      0.0,
      1.0
    );
    const w = 1.0 - t * t * (3.0 - 2.0 * t);
    if (w <= 1e-4) return 0;
    const s = sim.sc;
    const useMoon = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI;
    const upWorld = useMoon ? Math.atan2(s.ry - mSt[1], s.rx - mSt[0]) : Math.atan2(s.ry, s.rx);
    const upDisp = toDisplayAngleRaw(upWorld, sim.simTimeSec);
    return w * P.normalizeAngleRad(Math.PI * 0.5 - upDisp);
  }

  function updateCameraLerp(dtReal) {
    updateCameraTargets();
    const k = 1.0 - Math.exp(-7.5 * dtReal);
    camera.xKm += (camera.targetXKm - camera.xKm) * k;
    camera.yKm += (camera.targetYKm - camera.yKm) * k;
    const logCur = Math.log(Math.max(ZOOM_MIN_KM_PER_PX, camera.scaleKmPerPx));
    const logTarget = Math.log(Math.max(ZOOM_MIN_KM_PER_PX, camera.targetScaleKmPerPx));
    camera.scaleKmPerPx = Math.exp(logCur + (logTarget - logCur) * k);
    camera.rocketAlpha = getRocketCrossFadeAlpha(camera.scaleKmPerPx);
    // Rotation eases along the shortest arc (smooth Earth->Moon "up" handover, no snapping)
    const dRot = P.normalizeAngleRad((camera.targetRotRad || 0) - (camera.rotRad || 0));
    camera.rotRad = P.normalizeAngleRad((camera.rotRad || 0) + dRot * k);
    if (Math.abs(camera.rotRad) < 1e-6 && Math.abs(camera.targetRotRad || 0) < 1e-6) camera.rotRad = 0;
  }

  function worldToScreen(wxKm, wyKm, cx, cy) {
    const dx = wxKm - camera.xKm;
    const dy = wyKm - camera.yKm;
    const rot = camera.rotRad || 0;
    if (rot === 0) {
      return { x: cx + dx / camera.scaleKmPerPx, y: cy - dy / camera.scaleKmPerPx };
    }
    // Rotate the display world about the camera centre (local-horizon camera, display only)
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return {
      x: cx + (dx * c - dy * s) / camera.scaleKmPerPx,
      y: cy - (dx * s + dy * c) / camera.scaleKmPerPx
    };
  }

  // ---------------------------------------------------------------------------
  // FIX #1 (zoom lag): viewport-aware drawing helpers.
  // At rocket/flight cross-fade scales (0.005..1 km/px) the golden TLI line is
  // tens of millions of px long and the Karman ring has a ~1.3M px radius. Canvas
  // computes EVERY dash segment of a dashed path even when off-screen, which is
  // what froze the frame while zooming. We now clip polylines to the viewport and
  // only stroke/fill the visible span of huge circles.
  // ---------------------------------------------------------------------------
  const VIEW_MARGIN_PX = 64;
  const drawCache = { mNow: null, thetaNow: 0, cosNow: 1, sinNow: 0 };

  function beginDrawFrameCache(mNow) {
    drawCache.mNow = mNow;
    drawCache.thetaNow = Math.atan2(mNow[1], mNow[0]);
    drawCache.cosNow = Math.cos(drawCache.thetaNow);
    drawCache.sinNow = Math.sin(drawCache.thetaNow);
  }

  // Liang–Barsky segment clip against [x0,x1]x[y0,y1]
  function clipSegment(ax, ay, bx, by, x0, y0, x1, y1) {
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0.0;
    let t1 = 1.0;
    const pArr = [-dx, dx, -dy, dy];
    const qArr = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (let i = 0; i < 4; i++) {
      const p = pArr[i];
      const q = qArr[i];
      if (p === 0) {
        if (q < 0) return null;
      } else {
        const t = q / p;
        if (p < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }
    return { ax: ax + t0 * dx, ay: ay + t0 * dy, bx: ax + t1 * dx, by: ay + t1 * dy, t0, t1 };
  }

  /** Drop-in replacement for the `idx === 0 ? moveTo : lineTo` pattern that only adds visible pieces. */
  function makeClippedTracer(cx, cy) {
    const x0 = -VIEW_MARGIN_PX;
    const y0 = -VIEW_MARGIN_PX;
    const x1 = cx * 2 + VIEW_MARGIN_PX;
    const y1 = cy * 2 + VIEW_MARGIN_PX;
    let hasPrev = false;
    let penDown = false;
    let px = 0;
    let py = 0;
    return {
      add(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          hasPrev = false;
          penDown = false;
          return;
        }
        if (hasPrev) {
          const seg = clipSegment(px, py, x, y, x0, y0, x1, y1);
          if (seg) {
            if (!penDown || seg.t0 > 0) ctx.moveTo(seg.ax, seg.ay);
            ctx.lineTo(seg.bx, seg.by);
            penDown = seg.t1 >= 1.0;
          } else {
            penDown = false;
          }
        }
        hasPrev = true;
        px = x;
        py = y;
      }
    };
  }

  /**
   * Visible part of a circle of screen radius r centred at (x, y).
   * Returns null (not visible), {full:true}, {inside:true} (screen fully inside disk),
   * or {start, end} canvas angles of the visible arc.
   */
  function visibleArcSpan(x, y, r, cx, cy) {
    const halfDiag = Math.hypot(cx, cy) + VIEW_MARGIN_PX;
    if (!(r > halfDiag * 3.0)) return { full: true };
    const d = Math.hypot(cx - x, cy - y);
    if (Math.abs(d - r) > halfDiag) return d < r ? { inside: true } : null;
    const theta = Math.atan2(cy - y, cx - x);
    const span = Math.min(Math.PI, (halfDiag * 1.6) / r);
    return { start: theta - span, end: theta + span };
  }

  /** Adds a (possibly partial) circle OUTLINE to the current path. Returns false if nothing visible. */
  function addCircleStrokePath(x, y, r, cx, cy) {
    const v = visibleArcSpan(x, y, r, cx, cy);
    if (!v || v.inside) return false;
    if (v.full) ctx.arc(x, y, r, 0, Math.PI * 2);
    else ctx.arc(x, y, r, v.start, v.end);
    return true;
  }

  /** Adds a (possibly partial) filled DISK to the current path. Returns false if nothing visible. */
  function addDiskFillPath(x, y, r, cx, cy) {
    const v = visibleArcSpan(x, y, r, cx, cy);
    if (!v) return false;
    if (v.full) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (v.inside) {
      ctx.rect(-VIEW_MARGIN_PX, -VIEW_MARGIN_PX, cx * 2 + 2 * VIEW_MARGIN_PX, cy * 2 + 2 * VIEW_MARGIN_PX);
    } else {
      // Sector (through the far-away centre) so the whole on-screen part of the disk is covered
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, v.start, v.end);
      ctx.closePath();
    }
    return true;
  }

  /**
   * Fast point projection: caches the Moon position at each point's tAbs ON the point
   * object (_mx/_my), so Moon-Lock / Synodic views no longer run a Kepler solve for
   * every trajectory vertex on every frame.
   */
  function ptToScreenFast(pt, cx, cy) {
    let mx;
    let my;
    if (Number.isFinite(pt.tAbs)) {
      if (pt._mx === undefined || pt._mt !== pt.tAbs) {
        const m = P.getMoonStateAtTime(pt.tAbs);
        pt._mx = m[0];
        pt._my = m[1];
        pt._mt = pt.tAbs;
      }
      mx = pt._mx;
      my = pt._my;
    } else {
      const mNow = drawCache.mNow || P.getMoonStateAtTime(sim.simTimeSec);
      mx = mNow[0];
      my = mNow[1];
    }
    if (camera.refFrame === "synodic") {
      const th = Math.atan2(my, mx);
      const c = Math.cos(th);
      const s = Math.sin(th);
      return worldToScreen(pt.rx * c + pt.ry * s, -pt.rx * s + pt.ry * c, cx, cy);
    }
    if (camera.mode === "moon") {
      const mNow = drawCache.mNow || P.getMoonStateAtTime(sim.simTimeSec);
      return worldToScreen(pt.rx - mx + mNow[0], pt.ry - my + mNow[1], cx, cy);
    }
    return worldToScreen(pt.rx, pt.ry, cx, cy);
  }

  /** Projection for a world point at the CURRENT sim time (no Kepler solve). */
  function worldNowToScreen(wx, wy, cx, cy) {
    if (camera.refFrame === "synodic") {
      const c = drawCache.cosNow;
      const s = drawCache.sinNow;
      return worldToScreen(wx * c + wy * s, -wx * s + wy * c, cx, cy);
    }
    return worldToScreen(wx, wy, cx, cy);
  }

  // ===========================================================================
  // 11. 2D CANVAS RENDERER
  // ===========================================================================
  function drawScene() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(200, Math.round(rect.width * dpr));
    const targetH = Math.max(200, Math.round(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const cx = W * 0.5;
    const cy = H * 0.5;

    ctx.clearRect(0, 0, W, H);

    const rocketAlpha = getRocketCrossFadeAlpha(camera.scaleKmPerPx);
    camera.rocketAlpha = rocketAlpha;
    beginDrawFrameCache(P.getMoonStateAtTime(sim.simTimeSec));

    // Render orbital flight / map canvas whenever not fully zoomed into Rocket Close-Up
    if (rocketAlpha < 0.999) {

    // 1. Deep-space starfield & subtle NASA coordinate grid
    drawStarsAndGrid(W, H, cx, cy);

    const mSt = drawCache.mNow;
    const bary = P.getBarycentricPositions(sim.simTimeSec);

    // 2. Moon Orbit Path / Synodic Lagrange L1..L5 & Lunar SOI Ring
    drawOrbitalReferences(cx, cy, mSt, bary);

    // 3. Stage 1/2 Reference Trajectory (Dashed Cyan Line)
    if (sim.currentStage <= 2) {
      drawGoldenTrajectory(cx, cy, mSt);
    }

    // 4. Live Predictor Trajectory (Solid Amber/Green/Red Line)
    drawLivePredictor(cx, cy);

    // 5. Historical Spacecraft Trail
    drawSpacecraftTrail(cx, cy);

    // 6. Earth & Moon (with Mascons + Highland Relief)
    drawEarth(cx, cy);
    drawMoon(cx, cy, mSt);

    // 7. DSN Radio Communication Beam
    drawDsnLink(cx, cy, mSt);

    // 8. Stage 2 Fixed-Epoch Optimal TCM Node
    if (sim.currentStage === 2 && !sim.mccLocked && sim.fido.correctionNodePos) {
      drawCorrectionNode(cx, cy, sim.fido.correctionNodePos);
    }

    // 9. Jettisoned Boosters & Spin-Stabilized Lunar Prospector Spacecraft
    for (const db of sim.debrisList) {
      drawJettisonedBooster(cx, cy, db);
    }
    drawSpacecraft(cx, cy);
    }

    // Smooth cross-fade overlay into Spaceflight Simulator Rocket Close-Up View
    if (rocketAlpha > 0.001) {
      drawRocketCloseUpView(W, H, cx, cy, rocketAlpha);
    }

    ctx.restore();
  }

  /**
   * Spaceflight Simulator (SFS) style rocket close-up view (~1.2 m/px).
   * Renders atmospheric sky gradient, pad gantry tower, lunar terrain relief,
   * stacked multi-stage vehicle, engine plume, RCS puffs, tumbling debris & SFS navball.
   */
  function drawRocketCloseUpView(W, H, cx, cy, alpha = 1.0) {
    const viewAlpha = P.clamp(alpha, 0.0, 1.0);
    if (viewAlpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= viewAlpha;

    const s = sim.sc;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const dEarth = Math.hypot(s.rx, s.ry);
    const altEarthKm = dEarth - CFG.R_EARTH;
    const relMx = s.rx - mSt[0];
    const relMy = s.ry - mSt[1];
    const dMoon = Math.hypot(relMx, relMy);
    const altMoonKm = dMoon - CFG.R_MOON;
    const useMoon = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI;
    const altKm = useMoon ? altMoonKm : altEarthKm;

    // Frame the player's actual vehicle: the stack (or spacecraft) fills ~42% of the view height
    const vsFrame = currentVehicleSprite(false);
    const frameH = vsFrame ? vsFrame.img.height * vsFrame.metersPerPx : getStackHeightMeters();
    const fitMPerPx = Math.max(0.006, frameH / Math.max(120, H * 0.42));
    const scaleMPerPx = Math.max(0.004, fitMPerPx * camera.manualZoomFactor);
    const skyFrac = useMoon ? 0.0 : P.clamp(1.0 - altEarthKm / 85.0, 0.0, 1.0);

    // 1. Dynamic Sky Gradient (transparent during space cross-fade so underlying orbital trajectories show through)
    if (skyFrac > 0.02 || viewAlpha >= 0.98) {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (skyFrac > 0.02) {
        const rTop = Math.round(2 + 12 * skyFrac);
        const gTop = Math.round(6 + 52 * skyFrac);
        const bTop = Math.round(23 + 115 * skyFrac);
        const rBot = Math.round(6 + 48 * skyFrac);
        const gBot = Math.round(12 + 120 * skyFrac);
        const bBot = Math.round(30 + 185 * skyFrac);
        skyGrad.addColorStop(0, `rgb(${rTop},${gTop},${bTop})`);
        skyGrad.addColorStop(1, `rgb(${rBot},${gBot},${bBot})`);
      } else {
        skyGrad.addColorStop(0, "#020617");
        skyGrad.addColorStop(1, "#060d1f");
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Stars (fade smoothly with atmospheric sky scattering; skip duplicating orbital starfield during cross-fade)
    const starVis = (1.0 - skyFrac * 0.92) * (viewAlpha >= 0.98 ? 1.0 : skyFrac);
    if (starVis > 0.04) {
      for (const st of stars) {
        ctx.fillStyle = `rgba(226, 232, 240, ${st.alpha * starVis})`;
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Local vertical frame: upRad points away from active body center
    const upRad = useMoon ? Math.atan2(relMy, relMx) : Math.atan2(s.ry, s.rx);
    const vsClose = currentVehicleSprite(s.isThrusting || s.pulseFlashTimer > 0);
    const stackH = vsClose ? vsClose.img.height * vsClose.metersPerPx : getStackHeightMeters();
    const stackHPx = stackH / scaleMPerPx;
    const basePadY = cy + stackHPx * 0.5 + (Math.max(0, altKm) * 1000.0) / scaleMPerPx;

    // 3. Surface Terrain & Launchpad Gantry Tower
    if (!useMoon && altEarthKm < 120.0 && basePadY < H + 300) {
      const groundY = Math.max(cy + stackHPx * 0.45, basePadY);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, groundY, W, H - groundY + 100);
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, groundY, W, 10);

      // Concrete Launch Complex Pad Apron + Flame Trench
      ctx.fillStyle = "#475569";
      ctx.fillRect(cx - 120, groundY - 4, 240, 18);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(cx - 28, groundY + 2, 56, 16);

      // Red-Grey Umbilical Gantry Tower next to rocket
      const towerH = Math.max(46, stackHPx * 1.12);
      // stand the tower clear of the widest part of the player's stack (core + strap-on boosters)
      const halfWPx = vsClose
        ? (vsClose.img.width * vsClose.metersPerPx) / scaleMPerPx / 2
        : (s.stages[0].diamM || 2.8) / scaleMPerPx / 2;
      const tx = cx - Math.max(38, halfWPx + 30);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2.2;
      ctx.strokeRect(tx, groundY - towerH, 22, towerH);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let ty = groundY - towerH; ty < groundY - 12; ty += 18) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + 22, ty + 18);
        ctx.moveTo(tx + 22, ty);
        ctx.lineTo(tx, ty + 18);
      }
      ctx.stroke();

      // Swing Umbilical Arms (retract on ignition)
      const armReach = sim.subPhase === "LAUNCH_PAD" ? tx + 22 : tx + 8;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(armReach, groundY - towerH * 0.72);
      ctx.lineTo(sim.subPhase === "LAUNCH_PAD" ? cx - halfWPx * 0.35 : tx + 20, groundY - towerH * 0.72);
      ctx.moveTo(armReach, groundY - towerH * 0.42);
      ctx.lineTo(sim.subPhase === "LAUNCH_PAD" ? cx - halfWPx * 0.35 : tx + 20, groundY - towerH * 0.42);
      ctx.stroke();
    } else if (useMoon && altMoonKm < 80.0 && basePadY < H + 300) {
      const groundY = Math.max(cy + stackHPx * 0.5 + 8, basePadY);
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 24) {
        const angRad = upRad + ((px - cx) / 140.0) * CFG.DEG_TO_RAD;
        const relKm = typeof P.getLunarSurfaceReliefKm === "function" ? P.getLunarSurfaceReliefKm(angRad) : 0;
        const ridgePx = relKm * 3.5;
        ctx.lineTo(px, groundY - ridgePx);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 4. Tumbling Separated Booster Stages / Debris
    for (const db of sim.debrisList) {
      const dxKm = db.rx - s.rx;
      const dyKm = db.ry - s.ry;
      // Project into local vertical screen frame (radial = -Y canvas, tangential east = -X? wait)
      // Since localUp is +90 deg of east-tangent: eastVec = (-sin(upRad), cos(upRad)), Wait: let's match standard rotation:
      // canvasRight = (-sin(upRad), cos(upRad))? Let's verify: upRad=PI/2 => up=(0,1), east=(-1,0) => CW from up is (+1,0)=sin(upRad), -cos(upRad)!
      const dEastM = (dxKm * Math.sin(upRad) - dyKm * Math.cos(upRad)) * 1000.0;
      const dUpM = (dxKm * Math.cos(upRad) + dyKm * Math.sin(upRad)) * 1000.0;
      const sx = cx + dEastM / scaleMPerPx;
      const sy = cy - dUpM / scaleMPerPx;
      if (sx < -120 || sx > W + 120 || sy < -120 || sy > H + 120) continue;

      const dLPx = Math.max(10, (db.lengthM || 14) / scaleMPerPx);
      const dWPx = Math.max(4, (db.diamM || 2.5) / scaleMPerPx);
      const dbTilt = -(db.angle - upRad);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(dbTilt);
      const dSpr = getSprites();
      if (dSpr && dSpr.debris[db.stageIdx]) {
        const img = dSpr.debris[db.stageIdx];
        const kk = 1 / (dSpr.ppm * scaleMPerPx);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -img.width * kk / 2, -img.height * kk / 2, img.width * kk, img.height * kk);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.fillRect(-dWPx * 0.5, -dLPx * 0.5, dWPx, dLPx);
      ctx.strokeRect(-dWPx * 0.5, -dLPx * 0.5, dWPx, dLPx);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-dWPx * 0.5, -dLPx * 0.3, dWPx, Math.max(2, dLPx * 0.14));
      ctx.restore();
    }

    // 5. Render Attached Multi-Stage Vehicle Stack (bottom-up centered at cx, cy)
    const tiltRad = -P.normalizeAngleRad(s.headingRad - upRad);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tiltRad);

    // Reentry Plasma Bow Shock around Nosecone
    // (only at real heating / max-Q levels — not merely low-speed flight in thick air)
    if (altEarthKm < CFG.H_ATMOS_DRAG_MAX && (s.lastHeatFluxKwM2 > 25 || s.lastDynPressPa > 22000)) {
      const pAlpha = P.clamp((s.lastDynPressPa || 500) / 40000.0 + (s.lastHeatFluxKwM2 || 0) / 400.0, 0.12, 0.7);
      const bowR = P.clamp(stackHPx * 0.16, 24, 120);
      const pGrad = ctx.createRadialGradient(0, -stackHPx * 0.45, 4, 0, -stackHPx * 0.45, bowR);
      pGrad.addColorStop(0, `rgba(254, 240, 138, ${pAlpha})`);
      pGrad.addColorStop(0.5, `rgba(249, 115, 22, ${pAlpha * 0.7})`);
      pGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(0, -stackHPx * 0.42, bowR, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // Main Engine Plume below active stage nozzles
    const activeSt = getActiveStage();
    const aftY = stackHPx * 0.5;
    if (s.isThrusting || s.pulseFlashTimer > 0) {
      const plumeBaseW = Math.max(6, ((activeSt.diamM || 2.0) / scaleMPerPx) * 0.75);
      const atmoExpand = 1.0 + (1.0 - skyFrac) * 0.75;
      const plumeLen = (activeSt.thrustN > 100000 ? 64 : 30) * atmoExpand + Math.random() * 14;
      const pGrad = ctx.createLinearGradient(0, aftY + 4, 0, aftY + 4 + plumeLen);
      pGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
      pGrad.addColorStop(0.25, "rgba(253, 224, 71, 0.90)");
      pGrad.addColorStop(0.6, "rgba(249, 115, 22, 0.68)");
      pGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.moveTo(-plumeBaseW * 0.42, aftY + 4);
      ctx.quadraticCurveTo(-plumeBaseW * 0.95 * atmoExpand, aftY + plumeLen * 0.45, 0, aftY + 4 + plumeLen);
      ctx.quadraticCurveTo(plumeBaseW * 0.95 * atmoExpand, aftY + plumeLen * 0.45, plumeBaseW * 0.42, aftY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Cold-Gas RCS Attitude Thruster Puffs ([A]/[D] or SAS Active Damping)
    const rcsLeft = input.left || (sim.sasEnabled && s.omegaRadS < -0.04);
    const rcsRight = input.right || (sim.sasEnabled && s.omegaRadS > 0.04);
    if (rcsLeft || rcsRight) {
      ctx.fillStyle = "rgba(186, 230, 253, 0.78)";
      const rcsY = -stackHPx * 0.32;
      const side = rcsLeft ? 1 : -1; // Firing +X right at nose turns CCW (left)!
      ctx.beginPath();
      ctx.moveTo(side * 6, rcsY);
      ctx.lineTo(side * 22, rcsY - 4);
      ctx.lineTo(side * 22, rcsY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Hangar sprite of the attached stack (or the spacecraft), drawn at true metre scale
    if (vsClose) {
      const kk = vsClose.metersPerPx / scaleMPerPx;
      const w = vsClose.img.width * kk;
      const h = vsClose.img.height * kk;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(vsClose.img, -w / 2, -h / 2, w, h);
    } else {
      const wPx = Math.max(6, (activeSt.diamM || 2.5) / scaleMPerPx);
      ctx.fillStyle = "#E2E8F0";
      ctx.fillRect(-wPx / 2, -stackHPx / 2, wPx, stackHPx);
      ctx.fillStyle = "#94A3B8";
      ctx.fillRect(-wPx / 2, -stackHPx / 2, wPx, Math.max(2, stackHPx * 0.12));
    }
    ctx.restore();

    // (attitude now shown by the shared 2D attitude dial, see drawAttitudeDial)
    ctx.restore();
  }

  function drawStarsAndGrid(W, H, cx, cy) {
    for (const st of stars) {
      const parallax = 0.04 * st.r;
      const sx = (((st.x * W - (camera.xKm / Math.max(10, camera.scaleKmPerPx)) * parallax) % W) + W) % W;
      const sy = (((st.y * H + (camera.yKm / Math.max(10, camera.scaleKmPerPx)) * parallax) % H) + H) % H;
      ctx.fillStyle = `rgba(226, 232, 240, ${st.alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // World-anchored coordinate grid
    const rawStepKm = camera.scaleKmPerPx * 110;
    const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStepKm))));
    const norm = rawStepKm / pow10;
    const niceMult = norm < 2 ? 1 : norm < 5 ? 2 : 5;
    const stepKm = niceMult * pow10;

    // Grid is drawn in the un-rotated frame over the screen diagonal, then the canvas is rotated
    // about the screen centre by the local-horizon camera angle.
    const halfDiagPx = Math.hypot(cx, cy);
    const minX = Math.floor((camera.xKm - halfDiagPx * camera.scaleKmPerPx) / stepKm) * stepKm;
    const maxX = camera.xKm + halfDiagPx * camera.scaleKmPerPx;
    const minY = Math.floor((camera.yKm - halfDiagPx * camera.scaleKmPerPx) / stepKm) * stepKm;
    const maxY = camera.yKm + halfDiagPx * camera.scaleKmPerPx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-(camera.rotRad || 0));
    ctx.translate(-cx, -cy);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.065)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x += stepKm) {
      const sx = cx + (x - camera.xKm) / camera.scaleKmPerPx;
      ctx.moveTo(sx, cy - halfDiagPx);
      ctx.lineTo(sx, cy + halfDiagPx);
    }
    for (let y = minY; y <= maxY; y += stepKm) {
      const sy = cy - (y - camera.yKm) / camera.scaleKmPerPx;
      ctx.moveTo(cx - halfDiagPx, sy);
      ctx.lineTo(cx + halfDiagPx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawOrbitalReferences(cx, cy, mSt, bary) {
    const ePt = worldPtToScreen(0, 0, cx, cy, sim.simTimeSec);
    const mPt = worldPtToScreen(mSt[0], mSt[1], cx, cy, sim.simTimeSec);

    // Parking orbit ring (185 km)
    const rParkPx = P.kmToPx(CFG.R_PARKING, camera.scaleKmPerPx);
    if (rParkPx > 10 && rParkPx < 8000) {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ePt.x, ePt.y, rParkPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Moon Keplerian elliptical orbit (Inertial) or Earth-Moon axis + L1..L5 (Synodic)
    const rMoonOrbPx = P.kmToPx(CFG.R_MOON_ORBIT, camera.scaleKmPerPx);
    if (camera.refFrame === "synodic" && camera.mode === "map") {
      // Synodic Co-Rotating Reference Line (Earth -> Moon along +X) + Lagrange Points L1..L5
      ctx.save();
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = "rgba(167, 139, 250, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ePt.x - rMoonOrbPx * 1.05, ePt.y);
      ctx.lineTo(mPt.x + rMoonOrbPx * 0.25, mPt.y);
      ctx.stroke();

      if (typeof P.computeLagrangePoints2D === "function") {
        const lPts = P.computeLagrangePoints2D(mSt);
        ctx.setLineDash([]);
        ctx.font = "bold 9px monospace";
        for (const [k, pos] of Object.entries(lPts)) {
          const lp = worldPtToScreen(pos[0], pos[1], cx, cy, sim.simTimeSec);
          ctx.strokeStyle = "#a78bfa";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(lp.x, lp.y - 4);
          ctx.lineTo(lp.x + 4, lp.y);
          ctx.lineTo(lp.x, lp.y + 4);
          ctx.lineTo(lp.x - 4, lp.y);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "#c4b5fd";
          ctx.fillText(k, lp.x + 6, lp.y + 3);
        }
      }
      ctx.restore();
    } else if (rMoonOrbPx > 25 && rMoonOrbPx < 6000) {
      const mKep = P.cartesianToKeplerian2D(mSt[0], mSt[1], mSt[2], mSt[3], CFG.MU_SYS);
      const aM = CFG.R_MOON_ORBIT;
      const eM = CFG.MOON_ECC;
      const pM = aM * (1.0 - eM * eM);
      const aop = Number.isFinite(mKep.aopRad) ? mKep.aopRad : 0.0;
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const N_ELLIPSE = 96;
      const ellTracer = makeClippedTracer(cx, cy);
      for (let i = 0; i <= N_ELLIPSE; i++) {
        const nu = (i / N_ELLIPSE) * Math.PI * 2;
        const r = pM / (1.0 + eM * Math.cos(nu));
        const wx = r * Math.cos(aop + nu);
        const wy = r * Math.sin(aop + nu);
        const sp = worldNowToScreen(wx, wy, cx, cy);
        ellTracer.add(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Moon SOI Ring (~66,065 km at real 384,400 km scale)
    const soiPx = P.kmToPx(CFG.MOON_SOI, camera.scaleKmPerPx);
    if (soiPx > 8 && soiPx < 3000) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mPt.x, mPt.y, soiPx, 0, Math.PI * 2);
      ctx.stroke();
      if (camera.mode === "map") {
        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
        ctx.font = "10px monospace";
        ctx.fillText("LUNA SOI", mPt.x + soiPx * 0.72, mPt.y - soiPx * 0.72);
      }
      ctx.restore();
    }

    // Stage 2 Lunar Arrival Gate (Red < 35 km Hazard Zone + Green 35-240 km Corridor + 100 km LP Target)
    if (sim.currentStage === 2) {
      const rMoonPx = Math.max(4.5, P.kmToPx(CFG.R_MOON, camera.scaleKmPerPx));
      const rMinCorrPx = P.kmToPx(CFG.R_MOON + CFG.CORRIDOR_MIN_ALT_KM, camera.scaleKmPerPx);
      const rOptPx = P.kmToPx(CFG.R_MOON + 100.0, camera.scaleKmPerPx);
      const rMaxCorrPx = P.kmToPx(CFG.R_MOON + CFG.CORRIDOR_MAX_ALT_KM, camera.scaleKmPerPx);
      ctx.save();
      if (rOptPx > 14 && rOptPx < 2500) {
        // Red crash hazard ring below 35 km floor
        ctx.strokeStyle = "rgba(239, 68, 68, 0.22)";
        ctx.lineWidth = Math.max(1.5, rMinCorrPx - rMoonPx);
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, (rMoonPx + rMinCorrPx) * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.72)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, rMinCorrPx, 0, Math.PI * 2);
        ctx.stroke();

        // Emerald 35-240 km Arrival Corridor
        const bandWidth = Math.max(2, rMaxCorrPx - rMinCorrPx);
        const rMidCorrPx = (rMinCorrPx + rMaxCorrPx) * 0.5;
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.16)";
        ctx.lineWidth = bandWidth;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, rMidCorrPx, 0, Math.PI * 2);
        ctx.stroke();

        // 100 km Lunar Prospector Target Tick Ring
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(52, 211, 153, 0.88)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, rOptPx, 0, Math.PI * 2);
        ctx.stroke();

        if (rMaxCorrPx > 16 && rMaxCorrPx < 3000) {
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = "rgba(16, 185, 129, 0.48)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mPt.x, mPt.y, rMaxCorrPx, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#6ee7b7";
        ctx.font = "bold 9.5px monospace";
        ctx.fillText("LUNA ARRIVAL GATE (35-240 KM · 100 KM TARGET)", mPt.x - 130, mPt.y - rMaxCorrPx - 7);
      } else if (rOptPx <= 14) {
        // Map-scale fixed-pixel corridor gate reticle + <35 km inner hazard ring
        const gateR = Math.max(16, rMaxCorrPx + 11);
        const hazardR = Math.max(8, gateR * 0.42);
        ctx.fillStyle = "rgba(16, 185, 129, 0.14)";
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, gateR, 0, Math.PI * 2);
        ctx.fill();

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, gateR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, Math.max(11, gateR * 0.65), 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(239, 68, 68, 0.72)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, hazardR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#6ee7b7";
        ctx.font = "bold 9.5px monospace";
        ctx.fillText("LUNA ARRIVAL GATE (35-240 KM · 100 KM TARGET)", mPt.x + gateR + 6, mPt.y + 4);
      }
      ctx.restore();
    } else if (sim.currentStage === 3) {
      const rSciPx = P.kmToPx(CFG.R_MOON + 180.0, camera.scaleKmPerPx);
      const rOuterPx = P.kmToPx(CFG.R_MOON + 350.0, camera.scaleKmPerPx);
      const rFloorPx = P.kmToPx(CFG.R_MOON + CFG.MIN_SAFE_LUNAR_ALT_KM, camera.scaleKmPerPx);
      if (rSciPx > 14 && rSciPx < 2500) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.65)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, rSciPx, 0, Math.PI * 2);
        ctx.stroke();

        if (rOuterPx > 16 && rOuterPx < 3000) {
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mPt.x, mPt.y, rOuterPx, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 25 km Safe Terrain Clearance Floor Ring in Stage 3
        if (rFloorPx > 10 && rFloorPx < 2400) {
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mPt.x, mPt.y, rFloorPx, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = "#6ee7b7";
        ctx.font = "bold 9.5px monospace";
        ctx.fillText("GREEN SCIENCE ORBIT ZONE (50 - 350 KM)", mPt.x - 90, mPt.y - rOuterPx - 6);
        ctx.restore();
      }
    }

    // Earth-Moon Barycenter marker
    if (camera.mode === "map") {
      const embX = -bary.earthEmb[0];
      const embY = -bary.earthEmb[1];
      const embPt = worldPtToScreen(embX, embY, cx, cy, sim.simTimeSec);
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(embPt.x - 5, embPt.y);
      ctx.lineTo(embPt.x + 5, embPt.y);
      ctx.moveTo(embPt.x, embPt.y - 5);
      ctx.lineTo(embPt.x, embPt.y + 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGoldenTrajectory(cx, cy, mSt) {
    let pts = null;
    let isLivePlan = false;
    const s = sim.sc;

    if (
      sim.currentStage === 1 &&
      (sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT") &&
      sim.liveAscentPlan &&
      sim.liveAscentPlan.points &&
      sim.liveAscentPlan.points.length > 1
    ) {
      pts = sim.liveAscentPlan.points;
      if (pts.length > 0) {
        pts[0].rx = s.rx;
        pts[0].ry = s.ry;
      }
      isLivePlan = true;
    } else if (
      sim.currentStage === 1 &&
      (sim.subPhase === "WAIT_STAGE" || sim.subPhase === "TLI_BURN") &&
      sim.liveTliPlan &&
      sim.liveTliPlan.fullTrajectoryPoints &&
      sim.liveTliPlan.fullTrajectoryPoints.length > 1
    ) {
      pts = sim.liveTliPlan.fullTrajectoryPoints;
      if (pts.length > 0) {
        pts[0].rx = s.rx;
        pts[0].ry = s.ry;
      }
      isLivePlan = true;
    } else if (
      sim.currentStage === 1 &&
      sim.liveTliPlan &&
      sim.liveTliPlan.transferPoints &&
      sim.liveTliPlan.transferPoints.length > 1 &&
      (sim.subPhase === "WAIT_STAGE" || sim.subPhase === "TLI_BURN")
    ) {
      pts = sim.liveTliPlan.transferPoints;
      isLivePlan = true;
    } else if (sim.currentStage === 2) {
      // Optional faint historical TLI breadcrumb from Stage 1 handover
      if (sim.committedTliPoints && sim.committedTliPoints.length > 1) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const tliTracer = makeClippedTracer(cx, cy);
        sim.committedTliPoints.forEach((pt) => {
          const sp = ptToScreenFast(pt, cx, cy);
          tliTracer.add(sp.x, sp.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      const activePlan = sim.stage2TcmPlan;
      const tToNodeSec =
        activePlan && Number.isFinite(activePlan.nodeEpochSec)
          ? Math.max(0, activePlan.nodeEpochSec - sim.simTimeSec)
          : 0;
      const waitingAtFutureNode =
        !sim.mccLocked &&
        activePlan &&
        activePlan.expectedPoints &&
        activePlan.expectedPoints.length > 1 &&
        tToNodeSec > 45.0 &&
        !s.isThrusting;

      if (waitingAtFutureNode) {
        pts = activePlan.expectedPoints;
        isLivePlan = true;
      } else if (
        sim.cachedMcc &&
        sim.cachedMcc.expectedPoints &&
        sim.cachedMcc.expectedPoints.length > 1
      ) {
        pts = [
          { ...sim.cachedMcc.expectedPoints[0], rx: s.rx, ry: s.ry, tAbs: sim.simTimeSec },
          ...sim.cachedMcc.expectedPoints.slice(1)
        ];
        isLivePlan = true;
      } else if (
        sim.mccLocked &&
        sim.predictor &&
        sim.predictor.points &&
        sim.predictor.points.length > 1
      ) {
        pts = [
          { ...sim.predictor.points[0], rx: s.rx, ry: s.ry, tAbs: sim.simTimeSec },
          ...sim.predictor.points.slice(1)
        ];
        isLivePlan = true;
      } else if (sim.committedTliPoints && sim.committedTliPoints.length > 1) {
        pts = sim.committedTliPoints;
        isLivePlan = true;
      } else {
        let refMoonAng = 0;
        if (sim.tliEpochMoonAngle !== null && Number.isFinite(sim.tliEpochMoonAngle)) {
          refMoonAng = sim.tliEpochMoonAngle;
        } else {
          const earthKep = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
          if (earthKep && Number.isFinite(earthKep.aopRad) && earthKep.ecc > 0.4) {
            refMoonAng = P.normalizeAngleRad(earthKep.aopRad + goldenRef.phaseLeadRad);
          }
        }
        pts = P.getGoldenTrajectoryAtMoonAngle(refMoonAng, goldenRef);
      }
    } else {
      const moonAng = Math.atan2(mSt[1], mSt[0]);
      const mOrbVel = CFG.V_MOON_CIRC / CFG.R_MOON_ORBIT;
      let refMoonAng = 0;
      if (sim.currentStage === 1) {
        const tliNodeApprox = moonAng - goldenRef.phaseLeadRad;
        const scAng = Math.atan2(s.ry, s.rx);
        const dAng = P.normalizeAnglePosRad(tliNodeApprox - scAng);
        const parkOmega = Math.sqrt(CFG.MU_EARTH / Math.pow(CFG.R_PARKING, 3));
        const orbOmega =
          sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT"
            ? parkOmega
            : Math.max(1e-5, Math.hypot(s.vx, s.vy) / Math.max(6500, Math.hypot(s.rx, s.ry)));
        refMoonAng = moonAng + mOrbVel * (dAng / orbOmega);
      } else {
        // DEF-201: compute refMoonAng based on actual transfer orbit geometry or stored TLI epoch angle
        if (sim.tliEpochMoonAngle !== null && Number.isFinite(sim.tliEpochMoonAngle)) {
          refMoonAng = sim.tliEpochMoonAngle;
        } else {
          const earthKep = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
          if (earthKep && Number.isFinite(earthKep.aopRad) && earthKep.ecc > 0.4) {
            refMoonAng = P.normalizeAngleRad(earthKep.aopRad + goldenRef.phaseLeadRad);
          } else {
            refMoonAng = 0.0;
          }
        }
      }

      pts = P.getGoldenTrajectoryAtMoonAngle(refMoonAng, goldenRef);
    }

    if (!pts || pts.length < 2) return;

    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = isLivePlan ? "rgba(34, 211, 238, 0.9)" : "rgba(56, 189, 248, 0.82)";
    ctx.lineWidth = sim.currentStage === 2 && isLivePlan ? 2.2 : 2.0;
    ctx.beginPath();
    const goldTracer = makeClippedTracer(cx, cy);
    pts.forEach((pt) => {
      const sp = ptToScreenFast(pt, cx, cy);
      goldTracer.add(sp.x, sp.y);
    });
    ctx.stroke();

    if (sim.currentStage === 2 && isLivePlan && pts.length > 3 && !sim.mccLocked) {
      const midPt = pts[Math.floor(pts.length * 0.55)];
      const tMid = Number.isFinite(midPt.tAbs) ? midPt.tAbs : sim.simTimeSec;
      const midSp = worldPtToScreen(midPt.rx, midPt.ry, cx, cy, tMid);
      ctx.setLineDash([]);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(
        "EXPECTED TCM PATH → 100 KM LUNA GATE",
        midSp.x + 8,
        midSp.y - 6
      );

      const expectedPeri =
        sim.stage2TcmPlan &&
        Number.isFinite(sim.stage2TcmPlan.nodeEpochSec) &&
        sim.stage2TcmPlan.nodeEpochSec - sim.simTimeSec > 45.0 &&
        !s.isThrusting &&
        sim.stage2TcmPlan.expectedPerilune
          ? sim.stage2TcmPlan.expectedPerilune
          : sim.cachedMcc && sim.cachedMcc.expectedPerilune;
      if (expectedPeri && expectedPeri.pos) {
        const ep = expectedPeri;
        const tEp = Number.isFinite(ep.tAbs)
          ? ep.tAbs
          : (Number.isFinite(pts[pts.length - 1].tAbs) ? pts[pts.length - 1].tAbs : sim.simTimeSec);
        const epSp = worldPtToScreen(ep.pos[0], ep.pos[1], cx, cy, tEp);
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(epSp.x, epSp.y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // TLI Ignition Node marker in Stage 1 (hidden during active TLI_BURN at the node to avoid label pile-up)
    if (sim.currentStage === 1 && sim.subPhase !== "TLI_BURN") {
      let nodeRx = pts[0].rx;
      let nodeRy = pts[0].ry;
      let nodeT = Number.isFinite(pts[0].tAbs) ? pts[0].tAbs : sim.simTimeSec;
      if (sim.liveTliPlan && sim.liveTliPlan.nodePos) {
        nodeRx = sim.liveTliPlan.nodePos[0];
        nodeRy = sim.liveTliPlan.nodePos[1];
        nodeT = sim.simTimeSec + Math.max(0, sim.liveTliPlan.waitSec || 0);
      } else if (sim.liveAscentPlan && sim.liveAscentPlan.tliPlan && sim.liveAscentPlan.tliPlan.nodePos) {
        nodeRx = sim.liveAscentPlan.tliPlan.nodePos[0];
        nodeRy = sim.liveAscentPlan.tliPlan.nodePos[1];
        nodeT = sim.simTimeSec + Math.max(0, sim.liveAscentPlan.tliPlan.waitSec || 0);
      }
      const nodePt = worldPtToScreen(nodeRx, nodeRy, cx, cy, nodeT);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(nodePt.x, nodePt.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px monospace";
      ctx.fillText(isLivePlan ? "TLI NODE (LIVE PLAN)" : "TLI NODE (GOLDEN)", nodePt.x + 9, nodePt.y - 6);
    }
    ctx.restore();
  }

  function drawLivePredictor(cx, cy) {
    sim.lastStage1PeMarkerDrawn = false;
    const pred = sim.predictor;
    if (!pred || !pred.points || pred.points.length < 2) return;

    const isGoodImpact = sim.currentStage === 4 && pred.predImpact && pred.predImpact.isSouthPole;
    const isSuborbitalAscent = sim.currentStage === 1 && (sim.subPhase === "LAUNCH_PAD" || sim.subPhase === "ASCENT");
    // DEF-204: real collision trajectories always show red; never blinded by mccLocked
    const isCrash = Boolean(!isSuborbitalAscent && pred.predImpact && !isGoodImpact);
    const inLunarCorridor = Boolean(
      !pred.predImpact &&
      pred.predPerilune &&
      pred.predPerilune.altKm >= CFG.CORRIDOR_MIN_ALT_KM &&
      pred.predPerilune.altKm <= CFG.CORRIDOR_MAX_ALT_KM
    );
    const isOnTarget =
      isGoodImpact ||
      (sim.currentStage <= 2 && inLunarCorridor) ||
      (sim.currentStage === 3 && sim.subPhase === "SCIENCE_ORBIT" && !isCrash);

    ctx.save();
    ctx.strokeStyle = isCrash
      ? "rgba(239, 68, 68, 0.92)"
      : isOnTarget
      ? "rgba(16, 185, 129, 0.94)"
      : "rgba(245, 158, 11, 0.92)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let endIdx = Number.isInteger(pred.drawEndIdx)
      ? Math.min(pred.drawEndIdx, pred.points.length - 1)
      : pred.points.length - 1;
    if (!Number.isInteger(pred.drawEndIdx) && sim.currentStage === 4 && !pred.predImpact && pred.points.length > 2) {
      let swept = 0;
      const t0 = Number.isFinite(pred.points[0].tAbs) ? pred.points[0].tAbs : sim.simTimeSec;
      const m0 = P.getMoonStateAtTime(t0);
      let prevAng = Math.atan2(pred.points[0].ry - m0[1], pred.points[0].rx - m0[0]);
      for (let i = 1; i < pred.points.length; i++) {
        const ti = Number.isFinite(pred.points[i].tAbs) ? pred.points[i].tAbs : sim.simTimeSec;
        const mi = P.getMoonStateAtTime(ti);
        const ang = Math.atan2(pred.points[i].ry - mi[1], pred.points[i].rx - mi[0]);
        swept += Math.abs(P.normalizeAngleRad(ang - prevAng));
        prevAng = ang;
        if (swept >= Math.PI * 2.0) {
          endIdx = i;
          break;
        }
      }
    }
    const predTracer = makeClippedTracer(cx, cy);
    for (let idx = 0; idx <= endIdx; idx++) {
      const pt = pred.points[idx];
      // Unified display-frame transform (cached Moon position per point) + viewport clipping
      const sp = ptToScreenFast(pt, cx, cy);
      predTracer.add(sp.x, sp.y);
    }
    ctx.stroke();

    // Diegetic [AP] and [PE] markers directly on the orbit line (scaled up to 750,000 km for real 384,400 km Earth-Moon arena)
    if (sim.currentStage <= 2 && pred.apogeePt && pred.apogeePt.altKm > 80 && pred.apogeePt.altKm < 750000) {
      const tAp = Number.isFinite(pred.apogeePt.tAbs) ? pred.apogeePt.tAbs : sim.simTimeSec;
      const ap = worldPtToScreen(pred.apogeePt.rx, pred.apogeePt.ry, cx, cy, tAp);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`[AP ${Math.round(pred.apogeePt.altKm).toLocaleString()}km]`, ap.x + 7, ap.y - 4);
    }
    if (sim.currentStage === 1 && pred.perigeePt && pred.perigeePt.altKm > 5 && pred.perigeePt.altKm < 30000) {
      const rNow = Math.hypot(sim.sc.rx, sim.sc.ry);
      const vRadNow = (sim.sc.rx * sim.sc.vx + sim.sc.ry * sim.sc.vy) / Math.max(1.0, rNow);
      const tPe = Number.isFinite(pred.perigeePt.tAbs) ? pred.perigeePt.tAbs : sim.simTimeSec;
      const dtPe = tPe - sim.simTimeSec;
      const dPeSc = Math.hypot(pred.perigeePt.rx - sim.sc.rx, pred.perigeePt.ry - sim.sc.ry);
      const pe = worldPtToScreen(pred.perigeePt.rx, pred.perigeePt.ry, cx, cy, tPe);
      const scScreen = worldPtToScreen(sim.sc.rx, sim.sc.ry, cx, cy, sim.simTimeSec);
      const pxDist = Math.hypot(pe.x - scScreen.x, pe.y - scScreen.y);
      // Suppress oscillating outbound [PE] when it is merely tracking the spacecraft's own current position
      const isOutboundTrackingSc =
        (sim.subPhase === "TLI_BURN" || vRadNow > 0.025) &&
        (dtPe < 240.0 || dPeSc < Math.max(250.0, rNow * 0.035) || pxDist < 28.0);
      if (!isOutboundTrackingSc) {
        sim.lastStage1PeMarkerDrawn = true;
        const inAtmo = pred.perigeePt.altKm < CFG.H_ATMOS_DRAG_MAX;
        ctx.fillStyle = inAtmo ? "#ef4444" : "#f59e0b";
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "bold 9.5px monospace";
        ctx.fillText(
          inAtmo ? `[PE ${pred.perigeePt.altKm.toFixed(0)}km · AERO DRAG]` : `[PE ${pred.perigeePt.altKm.toFixed(0)}km]`,
          pe.x + 7,
          pe.y + 11
        );
      }
    }
    if (sim.currentStage === 3 && pred.apolunePt && pred.apolunePt.altKm < 25000) {
      const tAl = Number.isFinite(pred.apolunePt.tAbs) ? pred.apolunePt.tAbs : sim.simTimeSec;
      const al = worldPtToScreen(pred.apolunePt.rx, pred.apolunePt.ry, cx, cy, tAl);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(al.x, al.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`[AP ${pred.apolunePt.altKm.toFixed(0)}km]`, al.x + 7, al.y - 4);
    }

    // Predicted Periselene [PE] Marker
    if (pred.predPerilune && pred.predPerilune.pos && sim.currentStage <= 3) {
      const tPerilune = Number.isFinite(pred.predPerilune.timeFromNowSec)
        ? sim.simTimeSec + pred.predPerilune.timeFromNowSec
        : sim.simTimeSec;
      const pp = worldPtToScreen(pred.predPerilune.pos[0], pred.predPerilune.pos[1], cx, cy, tPerilune);
      const isDangerPe = Boolean(pred.predImpact || pred.predPerilune.altKm < CFG.CORRIDOR_MIN_ALT_KM);
      ctx.fillStyle = inLunarCorridor ? "#10b981" : isDangerPe ? "#ef4444" : "#f59e0b";
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 10px monospace";
      ctx.fillText(`[PE LUNA ${pred.predPerilune.altKm.toFixed(0)}km]`, pp.x - 10, pp.y + 18);
    }

    // Predicted Impact Crosshair (especially critical in Stage 4)
    if (pred.predImpact) {
      const tImp = Number.isFinite(pred.predImpact.timeFromNowSec)
        ? sim.simTimeSec + pred.predImpact.timeFromNowSec
        : sim.simTimeSec;
      const ip = worldPtToScreen(pred.predImpact.rx, pred.predImpact.ry, cx, cy, tImp);
      const isValidPole = sim.currentStage === 4 && pred.predImpact.isSouthPole;
      ctx.strokeStyle = isValidPole ? "#10b981" : "#ef4444";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ip.x - 7, ip.y - 7);
      ctx.lineTo(ip.x + 7, ip.y + 7);
      ctx.moveTo(ip.x + 7, ip.y - 7);
      ctx.lineTo(ip.x - 7, ip.y + 7);
      ctx.stroke();
      ctx.fillStyle = isValidPole ? "#10b981" : "#ef4444";
      ctx.font = "bold 10px monospace";
      ctx.fillText(isValidPole ? "IMPACT IN CORRIDOR" : "PRED IMPACT", ip.x + 10, ip.y + 4);
    }
    ctx.restore();
  }

  function drawSpacecraftTrail(cx, cy) {
    if (sim.trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = "rgba(251, 191, 36, 0.42)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const trailTracer = makeClippedTracer(cx, cy);
    sim.trail.forEach((pt) => {
      const sp = ptToScreenFast(pt, cx, cy);
      trailTracer.add(sp.x, sp.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Direction of the Sun on screen (geocentric: Sun = −Earth heliocentric position)
  function sunDisplayAngle() {
    const h = P.getEarthHelioStateAtTime(sim.simTimeSec);
    return toDisplayAngle(Math.atan2(-h[1], -h[0]), sim.simTimeSec);
  }

  function drawEarth(cx, cy) {
    const ePt = worldPtToScreen(0, 0, cx, cy, sim.simTimeSec);
    const rPx = Math.max(7, P.kmToPx(CFG.R_EARTH, camera.scaleKmPerPx));
    const rAtmPx = Math.max(rPx + 2.5, P.kmToPx(CFG.R_ATMOS_BOUNDARY, camera.scaleKmPerPx));
    const rKarmanPx = Math.max(rPx + 1.5, P.kmToPx(CFG.R_ATMOS_KARMAN, camera.scaleKmPerPx));

    if (ePt.x + rAtmPx < -40 || ePt.x - rAtmPx > cx * 2 + 40 || ePt.y + rAtmPx < -40 || ePt.y - rAtmPx > cy * 2 + 40) {
      return;
    }

    ctx.save();
    const atmGrad = ctx.createRadialGradient(ePt.x, ePt.y, rPx * 0.98, ePt.x, ePt.y, rAtmPx);
    atmGrad.addColorStop(0, "rgba(56, 189, 248, 0.42)");
    atmGrad.addColorStop(0.55, "rgba(56, 189, 248, 0.14)");
    atmGrad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
    ctx.fillStyle = atmGrad;
    ctx.beginPath();
    if (addDiskFillPath(ePt.x, ePt.y, rAtmPx, cx, cy)) ctx.fill();

    if (rKarmanPx > 14) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      // Only the on-screen span: a full dashed ring at 1.3M px radius = ~1M dash segments/frame
      if (addCircleStrokePath(ePt.x, ePt.y, rKarmanPx, cx, cy)) ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pixel-art Earth (style chosen by GameState.visual.planetStyle), lit by the real Sun
    if (window.PlanetArt) {
      window.PlanetArt.drawEarth(
        ctx, ePt.x, ePt.y, rPx,
        sim.simTimeSec * CFG.OMEGA_EARTH,
        sunDisplayAngle(),
        toDisplayAngle(Math.PI * 0.5, sim.simTimeSec),
        { pathFn: () => addDiskFillPath(ePt.x, ePt.y, rPx, cx, cy) }
      );
    } else {
      ctx.fillStyle = "#12407F";
      ctx.beginPath();
      if (addDiskFillPath(ePt.x, ePt.y, rPx, cx, cy)) ctx.fill();
    }

    ctx.fillStyle = "#bae6fd";
    ctx.font = "bold 11px monospace";
    ctx.fillText("EARTH", ePt.x - 18, ePt.y + rPx + 14);
    ctx.restore();
  }

  function drawMoon(cx, cy, mSt) {
    const mPt = worldPtToScreen(mSt[0], mSt[1], cx, cy, sim.simTimeSec);
    const rPx = Math.max(4.5, P.kmToPx(CFG.R_MOON, camera.scaleKmPerPx));

    ctx.save();
    // Lunar disk: pixel-art near side (shared MoonMap), clipped to the highland relief limb when zoomed in
    const traceMoonLimb = () => {
      if (rPx > 28 && typeof P.getLunarSurfaceReliefKm === "function") {
        const N_LIMB = 72;
        for (let i = 0; i <= N_LIMB; i++) {
          const worldDeg = -180 + (360 * i) / N_LIMB;
          const worldRad = worldDeg * CFG.DEG_TO_RAD;
          const reliefKm = P.getLunarSurfaceReliefKm(worldRad);
          const rLocalPx = rPx + P.kmToPx(reliefKm, camera.scaleKmPerPx);
          const cAng = -toDisplayAngle(worldRad, sim.simTimeSec);
          const px = mPt.x + Math.cos(cAng) * rLocalPx;
          const py = mPt.y + Math.sin(cAng) * rLocalPx;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(mPt.x, mPt.y, rPx, 0, Math.PI * 2);
      }
      return true;
    };
    if (window.PlanetArt) {
      window.PlanetArt.drawMoon(ctx, mPt.x, mPt.y, rPx, sunDisplayAngle(), toDisplayAngle(Math.PI * 0.5, sim.simTimeSec), {
        clipFn: traceMoonLimb,
        pathFn: traceMoonLimb
      });
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      traceMoonLimb();
      ctx.fill();
    }

    // Uneven Lunar Gravity Mascons (DGE Gravity Anomalies)
    const masconsRevealed = Boolean(window.GameState && window.GameState.surveyResult && window.GameState.surveyResult.gravityMapped);
    if (masconsRevealed && CFG.ENABLE_MASCONS && rPx > 14 && typeof P.getMasconPositions2D === "function") {
      const mascons = P.getMasconPositions2D(mSt[0], mSt[1]);
      const mPulse = 0.45 + 0.35 * Math.sin(performance.now() * 0.005);
      for (const mc of mascons) {
        const mp = worldPtToScreen(mc.x, mc.y, cx, cy, sim.simTimeSec);
        const rad = Math.max(3, rPx * 0.08);
        ctx.fillStyle = `rgba(236, 72, 153, ${0.22 * mPulse})`;
        ctx.strokeStyle = `rgba(244, 114, 182, ${0.75 * mPulse})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (rPx > 28) {
          ctx.fillStyle = "#f9a8d4";
          ctx.font = "bold 8.5px monospace";
          ctx.fillText(mc.name, mp.x + rad + 4, mp.y + 3);
        }
      }
    }

    // Stage 4 Red Target Zone at Lunar South Pole (Shoemaker Crater)
    if (sim.currentStage === 4) {
      const poleWorldRad = -Math.PI * 0.5;
      const cCenter = -toDisplayAngle(poleWorldRad, sim.simTimeSec);
      const halfSpan = CFG.SOUTH_POLE_HALF_WIDTH_DEG * CFG.DEG_TO_RAD;
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.008);

      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
      ctx.lineWidth = P.clamp(rPx * 0.08, 4, 40); // was unbounded (≈27,000 px wide when zoomed in)
      ctx.beginPath();
      ctx.arc(mPt.x, mPt.y, rPx + 2, cCenter - halfSpan, cCenter + halfSpan);
      ctx.stroke();

      const poleX = mPt.x + Math.cos(cCenter) * (rPx + 3);
      const poleY = mPt.y + Math.sin(cCenter) * (rPx + 3);
      ctx.fillStyle = `rgba(239, 68, 68, ${0.28 * pulse})`;
      ctx.beginPath();
      ctx.arc(poleX, poleY, Math.max(10, rPx * 0.16), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 10.5px monospace";
      ctx.fillText("SHOEMAKER CRATER (SOUTH POLE TARGET)", poleX - 108, poleY + 20);

      const rOrbPx = Math.max(rPx + 10, P.kmToPx(CFG.R_MOON + 110.0, camera.scaleKmPerPx));
      const northCenter = cCenter + Math.PI;
      if (rOrbPx < 20000) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.55 + 0.3 * pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(mPt.x, mPt.y, rOrbPx, northCenter - 0.55, northCenter + 0.55);
      ctx.stroke();
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText("DE-ORBIT BURN ZONE (BRAKE HERE)", mPt.x - 95, mPt.y - rOrbPx - 8);
      ctx.restore();
      }
    }

    // Farside shadow cone indicator during Stage 3
    if (sim.currentStage === 3) {
      const mDisp = toDisplayWorld(mSt[0], mSt[1], sim.simTimeSec);
      const awayAng = -(Math.atan2(mDisp.y, mDisp.x) + (camera.rotRad || 0));
      ctx.save();
      ctx.translate(mPt.x, mPt.y);
      ctx.rotate(awayAng);
      ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
      ctx.fillRect(0, -rPx, rPx * 4.2, rPx * 2);
      ctx.restore();
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 11px monospace";
    ctx.fillText("LUNA", mPt.x - 15, mPt.y - rPx - 8);
    ctx.restore();
  }

  function drawCorrectionNode(cx, cy, nodePos) {
    const plan = sim.stage2TcmPlan;
    const tNode =
      plan && Number.isFinite(plan.nodeEpochSec) ? plan.nodeEpochSec : sim.simTimeSec;
    const np = worldPtToScreen(nodePos[0], nodePos[1], cx, cy, tNode);
    const pulse = 8 + 3 * Math.sin(performance.now() * 0.006);
    const dvMs = Math.round(sim.fido.neededDvMs || (plan && plan.deltaVMs) || 0);
    const tRem =
      plan && Number.isFinite(plan.nodeEpochSec)
        ? Math.max(0, plan.nodeEpochSec - sim.simTimeSec)
        : 0;
    const burnNow = tRem <= 45.0 || sim.sc.isThrusting;
    const col = burnNow ? "#10b981" : "#22d3ee";

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(np.x, np.y, pulse, 0, Math.PI * 2);
    ctx.stroke();

    const r = 5.5;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(np.x, np.y - r);
    ctx.lineTo(np.x + r, np.y);
    ctx.lineTo(np.x, np.y + r);
    ctx.lineTo(np.x - r, np.y);
    ctx.closePath();
    ctx.fill();

    const tStr = burnNow ? "BURN NOW" : `T-${formatTimerShort(tRem)}`;
    ctx.font = "bold 10px monospace";
    ctx.fillText(
      `TCM NODE · Δv ${dvMs} m/s · ${tStr}`,
      np.x + 12,
      np.y - 7
    );
    ctx.restore();
  }

  function drawDsnLink(cx, cy, mSt) {
    if (sim.currentStage !== 3 && sim.downlinkBeamTimer <= 0) return;
    const sc = sim.sc;
    const scPt = worldPtToScreen(sc.rx, sc.ry, cx, cy, sim.simTimeSec);
    const ePt = worldPtToScreen(0, 0, cx, cy, sim.simTimeSec);

    ctx.save();
    if (sim.downlinkBeamTimer > 0) {
      ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
      ctx.lineWidth = 2.4;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(scPt.x, scPt.y);
      ctx.lineTo(ePt.x, ePt.y);
      ctx.stroke();
    } else if (sim.dsnBlocked) {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      const mPt = worldPtToScreen(mSt[0], mSt[1], cx, cy, sim.simTimeSec);
      ctx.beginPath();
      ctx.moveTo(scPt.x, scPt.y);
      ctx.lineTo(mPt.x, mPt.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Hangar sprites (pixel-identical to the Phase 1 build) ----
  function getSprites() {
    const b = getBuild();
    return b && b.sprites ? b.sprites : null;
  }
  // Current vehicle sprite: launcher stack while boosters remain, spacecraft afterwards
  function currentVehicleSprite(firing) {
    const spr = getSprites();
    if (!spr) return null;
    const s = sim.sc;
    if (s.activeStageIdx < s.stages.length - 1 && spr.stacks[s.activeStageIdx]) {
      return { img: spr.stacks[s.activeStageIdx], metersPerPx: 1 / spr.ppm, isStack: true };
    }
    return { img: firing ? spr.craftPuff : spr.craft, metersPerPx: spr.busWidthM / Math.max(1, spr.busPx), isStack: false };
  }
  // Draw a sprite in the nose frame: sprite "up" (nose / antenna) → +x of the current transform
  function blitNoseSprite(img, k) {
    const w = img.width * k;
    const h = img.height * k;
    ctx.save();
    ctx.rotate(Math.PI * 0.5);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return { len: h, wid: w };
  }

  function drawJettisonedBooster(cx, cy, jb) {
    const pt = worldPtToScreen(jb.rx, jb.ry, cx, cy, sim.simTimeSec);
    const ang = toDisplayAngle(jb.angle, sim.simTimeSec);
    const spr = getSprites();
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(-ang);
    const alpha = P.clamp(jb.life / 4.0, 0, 1);
    if (spr && spr.debris && spr.debris[jb.stageIdx]) {
      ctx.globalAlpha = alpha;
      const img = spr.debris[jb.stageIdx];
      const full = spr.stacks[0];
      const k = Math.min(1.5, (camera.mode === "flight" ? 84 : 46) / Math.max(full.width, full.height));
      blitNoseSprite(img, k);
    } else {
      ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
      ctx.fillRect(-10, -4, 16, 8);
    }
    ctx.restore();
  }

  function drawSpacecraft(cx, cy) {
    const sc = sim.sc;
    const scPt = worldPtToScreen(sc.rx, sc.ry, cx, cy, sim.simTimeSec);
    const errDeg = Math.abs(P.normalizeAngleRad(sim.fido.targetHeadingRad - sc.headingRad) * CFG.RAD_TO_DEG);
    if (errDeg <= 8.0) sim.isAlignedState = true;
    else if (errDeg > 12.5) sim.isAlignedState = false;
    const isAligned = sim.isAlignedState;

    ctx.save();
    ctx.translate(scPt.x, scPt.y);

    // 0. Atmospheric Drag / Plasma Bow-Shock Glow when moving fast inside Earth's atmosphere
    const vMag = Math.hypot(sc.vx, sc.vy);
    const altEarth = Math.hypot(sc.rx, sc.ry) - CFG.R_EARTH;
    if (altEarth > 1.0 && altEarth < CFG.H_ATMOS_DRAG_MAX && vMag > 2.2 && (sc.lastRho || 0) > 1e-11) {
      const velCanvasAng = -toDisplayAngle(Math.atan2(sc.vy, sc.vx), sim.simTimeSec);
      const heatAlpha = P.clamp(Math.log10((sc.lastRho || 1e-11) * 1e12) * 0.14 * (vMag / 7.5), 0.15, 0.85);
      ctx.save();
      ctx.rotate(velCanvasAng);
      ctx.strokeStyle = `rgba(249, 115, 22, ${heatAlpha})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(4, 0, 18, -0.95, 0.95);
      ctx.stroke();
      ctx.restore();
    }

    const zoomT = P.clamp(
      Math.log10(Math.max(0.05, camera.scaleKmPerPx) / 1.5) / Math.log10(620.0 / 1.5),
      0.0,
      1.0
    );
    const iconScale = 1.15 - 0.50 * zoomT;
    const ringRadius = Math.round(28 - 12 * zoomT);
    const isCompactMapLod = camera.scaleKmPerPx > 80.0;
    sim.lastSpacecraftLod = {
      isCompactMapLod,
      iconScale,
      ringRadius,
      scaleKmPerPx: camera.scaleKmPerPx
    };

    // 1. Flight-View Target Guidance Ring, Target Ray & Ship Nose Ray
    ctx.strokeStyle = isAligned
      ? "rgba(16, 185, 129, 0.52)"
      : "rgba(56, 189, 248, 0.30)";
    ctx.lineWidth = isAligned ? 1.5 : 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Target Heading Ray + Chevron (Cyan / Green when aligned)
    const fidoCanvasAng = -toDisplayAngle(sim.fido.targetHeadingRad, sim.simTimeSec);
    ctx.save();
    ctx.rotate(fidoCanvasAng);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = isAligned ? "rgba(16, 185, 129, 0.75)" : "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(isCompactMapLod ? 7 : 14, 0);
    ctx.lineTo(ringRadius + (isCompactMapLod ? 10 : 18), 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isAligned ? "#10b981" : "#38bdf8";
    ctx.beginPath();
    const chevTip = ringRadius + (isCompactMapLod ? 7 : 11);
    const chevBase = ringRadius + (isCompactMapLod ? 1 : 2);
    const chevW = isCompactMapLod ? 3.5 : 5;
    ctx.moveTo(chevTip, 0);
    ctx.lineTo(chevBase, -chevW);
    ctx.lineTo(chevBase, chevW);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Diegetic Floating Telemetry Tag positioned below-left to avoid overlapping trajectory markers
    ctx.save();
    ctx.font = "bold 9.5px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = sim.fido.burnNow ? "#fbbf24" : "#bae6fd";
    ctx.fillText(sim.fido.whenText, -ringRadius - 8, ringRadius + 12);
    if (sim.fido.neededDvMs > 0.5) {
      ctx.fillStyle = isAligned ? "#6ee7b7" : "#94a3b8";
      ctx.fillText(`Δv ${Math.round(sim.fido.neededDvMs)} m/s`, -ringRadius - 8, ringRadius + 24);
    }
    ctx.restore();

    // 2. Rotate into Spacecraft Nose Frame (canvas Y is down -> -displayHeading)
    ctx.rotate(-toDisplayAngle(sc.headingRad, sim.simTimeSec));

    if (isCompactMapLod) {
      // Compact ~9 px tactical chevron/diamond marker for cislunar map zoom so ship never dwarfs planets
      ctx.strokeStyle = isAligned ? "rgba(16, 185, 129, 0.85)" : "rgba(248, 250, 252, 0.70)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(ringRadius + 5, 0);
      ctx.stroke();

      if (sc.isThrusting || sc.pulseFlashTimer > 0) {
        const pLen = 10 + Math.random() * 5;
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.moveTo(-4, -2.5);
        ctx.lineTo(-4 - pLen, 0);
        ctx.lineTo(-4, 2.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = isAligned ? "#34d399" : "#38bdf8";
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(5.5, 0);
      ctx.lineTo(-3.5, -4);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      return;
    }

    ctx.scale(iconScale, iconScale);

    // Ship Forward Nose Ray
    ctx.strokeStyle = isAligned ? "rgba(16, 185, 129, 0.85)" : "rgba(248, 250, 252, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(ringRadius + 8, 0);
    ctx.stroke();

    const remBoosters = Math.max(0, sc.stages.length - 1 - sc.activeStageIdx);
    const firing = sc.isThrusting || sc.pulseFlashTimer > 0;
    const vs = currentVehicleSprite(firing);
    let aftX = -4 - remBoosters * 9;
    let k = 1;
    if (vs) {
      const maxPx = vs.isStack ? (camera.mode === "flight" ? 84 : 46) : (camera.mode === "flight" ? 66 : 38);
      k = Math.min(1.5, maxPx / Math.max(vs.img.width, vs.img.height));
      aftX = -(vs.img.height * k) / 2;
    }

    // Engine Exhaust Plume (Continuous or Spin-Pulse)
    if (firing) {
      const len = remBoosters > 0 ? 28 + Math.random() * 10 : sc.pulseFlashTimer > 0 ? 18 : 20 + Math.random() * 6;
      const halfW = vs && vs.isStack ? Math.max(3, vs.img.width * k * 0.35) : 4;
      const flameGrad = ctx.createLinearGradient(aftX, 0, aftX - len, 0);
      flameGrad.addColorStop(0, "#fef08a");
      flameGrad.addColorStop(0.4, "#f59e0b");
      flameGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(aftX, -halfW);
      ctx.lineTo(aftX - len, 0);
      ctx.lineTo(aftX, halfW);
      ctx.closePath();
      ctx.fill();
    }

    if (vs) {
      // The player's exact hangar build (stack, then spacecraft after the last staging)
      blitNoseSprite(vs.img, k);
    } else {
      // Fallback: stock Lunar Prospector drum
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.4;
      ctx.fillRect(-4, -5.5, 11, 11);
      ctx.strokeRect(-4, -5.5, 11, 11);
    }

    ctx.restore();
  }

  // ===========================================================================
  // 12. HUD UPDATE
  // ===========================================================================

  function formatMET(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `T+ ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  let lastStageBarSig = "";

  // FIX #3: anti-flicker for guidance text. The predictor is refreshed every ~95 ms of WALL time,
  // which under warp is thousands of sim-seconds; thresholds (corridor, window, node) then flip
  // back and forth and the panel strobes. A new *kind* of message (digits ignored) must persist
  // for 300 ms before it replaces the current one; countdown digits still update instantly.
  function makeTextDebouncer(holdMs = 300) {
    const st = { shownKey: "", pendingKey: "", pendingSinceMs: 0, lastText: "" };
    return function (text) {
      const t = String(text == null ? "" : text);
      const key = t.replace(/[+\-]?[\d.,:]+/g, "#");
      const urgent = /ABORT|CUTOFF|⚠|COMPLETE|CONFIRMED/.test(t);
      const now = performance.now();
      if (urgent || !st.shownKey || key === st.shownKey) {
        st.shownKey = key;
        st.pendingKey = "";
        st.lastText = t;
        return t;
      }
      if (key !== st.pendingKey) {
        st.pendingKey = key;
        st.pendingSinceMs = now;
      }
      if (now - st.pendingSinceMs >= holdMs) {
        st.shownKey = key;
        st.pendingKey = "";
        st.lastText = t;
        return t;
      }
      return st.lastText;
    };
  }
  const debounceDirective = makeTextDebouncer(300);
  const debounceWhen = makeTextDebouncer(300);

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function updateHUD() {
    hudStepTick();
    const s = sim.sc;
    const mSt = P.getMoonStateAtTime(sim.simTimeSec);
    const rEarth = Math.hypot(s.rx, s.ry);
    const altEarth = rEarth - CFG.R_EARTH;
    const vInert = Math.hypot(s.vx, s.vy);
    const dMoon = Math.hypot(s.rx - mSt[0], s.ry - mSt[1]);
    const relVx = s.vx - mSt[2];
    const relVy = s.vy - mSt[3];

    const useMoonOrigin = sim.currentStage >= 3 || dMoon < CFG.MOON_SOI;
    const kep = useMoonOrigin
      ? P.cartesianToKeplerian2D(s.rx - mSt[0], s.ry - mSt[1], relVx, relVy, CFG.MU_MOON)
      : P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
    const refRad = useMoonOrigin ? CFG.R_MOON : CFG.R_EARTH;

    // Topbar
    dom.met.textContent = formatMET(sim.simTimeSec);
    const stageNames = {
      1: "STAGE 1 · LAUNCH & TLI",
      2: "STAGE 2 · MID-COURSE FIDO",
      3: "STAGE 3 · LOI & DSN DATA",
      4: "STAGE 4 · SOUTH POLE IMPACT"
    };
    dom.stageLabel.textContent = stageNames[sim.currentStage];
    const earthPx = P.kmToPx(CFG.R_EARTH, camera.scaleKmPerPx).toFixed(1);
    const atmPx = P.kmToPx(CFG.R_ATMOS_KARMAN, camera.scaleKmPerPx).toFixed(1);
    if (dom.earthRad) dom.earthRad.textContent = `${CFG.R_EARTH.toFixed(1)} km (${earthPx} px)`;
    if (dom.atmPx) dom.atmPx.textContent = `R_atm ${CFG.R_ATMOS_KARMAN.toFixed(1)} km (${atmPx} px)`;

    dom.missionLed.className =
      "status-led" + (sim.outcome === "abort" || sim.dsnBlocked ? " danger" : "");

    if (dom.btnRetryStage) {
      dom.btnRetryStage.title = sim.userCheckpoints[sim.currentStage]
        ? "Retry stage from your last saved checkpoint (preserves custom rocket) [R]"
        : "Retry current stage (preserves custom rocket) [R]";
    }

    // KSP-Style Top-Center Altimeter & Vertical Speed Tape
    const curAltKm = useMoonOrigin ? dMoon - CFG.R_MOON : altEarth;
    const rxRef = useMoonOrigin ? s.rx - mSt[0] : s.rx;
    const ryRef = useMoonOrigin ? s.ry - mSt[1] : s.ry;
    const vxRef = useMoonOrigin ? relVx : s.vx;
    const vyRef = useMoonOrigin ? relVy : s.vy;
    const rRefMag = Math.max(1.0, Math.hypot(rxRef, ryRef));
    const vertSpeedMs = ((rxRef * vxRef + ryRef * vyRef) / rRefMag) * 1000.0;

    dom.kspAltBody.textContent = useMoonOrigin ? "LUNA (MOON)" : "EARTH";
    dom.kspAltBody.className = "ksp-body-tag " + (useMoonOrigin ? "amber" : "cyan");
    dom.kspAltValue.innerHTML = `${Math.max(0, curAltKm).toFixed(1).padStart(8, "0")} <small>km</small>`;

    if (useMoonOrigin) {
      dom.kspAtmoBadge.textContent = curAltKm < CFG.MIN_SAFE_LUNAR_ALT_KM
        ? "TERRAIN FLOOR HAZARD (< 25 km)"
        : "VACUUM · HIGHLANDS UP TO 10.7 km";
      dom.kspAtmoBadge.style.color = curAltKm < CFG.MIN_SAFE_LUNAR_ALT_KM ? "var(--red)" : "var(--text-muted)";
    } else if (altEarth < CFG.H_KARMAN_KM) {
      dom.kspAtmoBadge.textContent = "DENSE ATMO · DRAG ACTIVE";
      dom.kspAtmoBadge.style.color = "var(--amber)";
    } else if (altEarth < CFG.H_ATMOS_DRAG_MAX) {
      dom.kspAtmoBadge.textContent = "THERMOSPHERE · LIGHT DRAG";
      dom.kspAtmoBadge.style.color = "var(--cyan)";
    } else {
      dom.kspAtmoBadge.textContent = "SPACE · VACUUM (>180 km)";
      dom.kspAtmoBadge.style.color = "var(--green)";
    }

    const vSign = vertSpeedMs >= 0 ? "+" : "";
    dom.kspVertSpeed.textContent = `${vSign}${vertSpeedMs.toFixed(0)} m/s`;
    dom.kspVertSpeed.style.color = vertSpeedMs < -25 ? "var(--amber)" : "var(--text-main)";
    const apoTxt = Number.isFinite(kep.ra) ? `${(kep.ra - refRad).toFixed(0)} km` : "ESCAPE";
    const periTxt = `${(kep.rp - refRad).toFixed(0)} km`;
    dom.kspApoReadout.textContent = apoTxt;
    dom.kspPeriReadout.textContent = periTxt;

    // Auto-Guidance Banner & Burn Progress Bar
    const scDeg = P.normalizeAnglePosRad(s.headingRad) * CFG.RAD_TO_DEG;
    const fidoDeg = P.normalizeAnglePosRad(sim.fido.targetHeadingRad) * CFG.RAD_TO_DEG;
    const errRad = P.normalizeAngleRad(sim.fido.targetHeadingRad - s.headingRad);
    const errDeg = errRad * CFG.RAD_TO_DEG;

    if (Math.abs(errDeg) <= 8.0) sim.isAlignedState = true;
    else if (Math.abs(errDeg) > 12.5) sim.isAlignedState = false;

    const alignShort = sim.isAlignedState
      ? "ALIGNED ✓"
      : errDeg > 0
      ? `◀ TURN ${Math.abs(errDeg).toFixed(0)}° [A]`
      : `TURN ${Math.abs(errDeg).toFixed(0)}° [D] ▶`;

    setTextIfChanged(dom.fidoWindowBadge, `WHEN: ${debounceWhen(sim.fido.whenText)}`);
    dom.fidoWindowBadge.className = "badge-when" + (sim.fido.burnNow ? " burn-now" : sim.fido.downlinkReady ? " downlink-ready" : "");
    dom.fidoPitchBadge.textContent = `TARGET: ${fidoDeg.toFixed(1)}° · ${alignShort}`;
    dom.fidoPitchBadge.className = "badge-pitch " + (sim.isAlignedState ? "aligned" : "turning");

    if (sim.currentStage === 2) {
      const targetDv = Math.max(
        sim.stage2TargetDvMs || 0,
        sim.stage2BurnedDvMs + Math.max(0, sim.fido.neededDvMs || 0)
      );
      dom.fidoBurnBadge.textContent = `BURNED ${sim.stage2BurnedDvMs.toFixed(1)} / ${targetDv.toFixed(1)} m/s`;
      const pct = sim.mccLocked
        ? 100.0
        : targetDv > 0.1
        ? P.clamp((sim.stage2BurnedDvMs / targetDv) * 100.0, 0, 100)
        : 100.0;
      dom.barBurnProgress.style.width = `${pct.toFixed(1)}%`;
    } else {
      dom.fidoBurnBadge.textContent = `BURN Δv: ${Math.round(sim.fido.neededDvMs)} m/s`;
      const maxDv = Math.max(10, sim.fido.maxBurnDvMs || 100);
      const burnRemPct = P.clamp((sim.fido.neededDvMs / maxDv) * 100.0, 0, 100);
      dom.barBurnProgress.style.width = `${burnRemPct.toFixed(1)}%`;
    }

    if (dom.fidoWarpBadge) {
      const showWarpBadge = (s.isThrusting || input.burnHeld) && sim.timeWarp > 1;
      dom.fidoWarpBadge.classList.toggle("hidden", !showWarpBadge);
      if (showWarpBadge) {
        dom.fidoWarpBadge.textContent = `BURN WARP ${Math.round(sim.effectiveBurnWarp || sim.timeWarp)}x (REQ ${sim.timeWarp}x)`;
      }
    }

    setTextIfChanged(dom.fidoDirectiveText, debounceDirective(sim.fido.directive));

    if (dom.fidoCutoffStatus) {
      const hasCutoffStatus = Boolean(
        sim.fuelSafetyLockout ||
        sim.fuelSafetyBannerTimer > 0 ||
        (sim.autoCutoffNoticeTimer > 0 && sim.lastCutoffReason)
      );
      dom.fidoCutoffStatus.classList.toggle("hidden", !hasCutoffStatus);
      if (hasCutoffStatus) {
        dom.fidoCutoffStatus.textContent =
          sim.fuelSafetyLockout || sim.fuelSafetyBannerTimer > 0
            ? (sim.fuelSafetyBannerText || sim.lastCutoffReason || "FUEL GUARD ACTIVE")
            : sim.lastCutoffReason;
      }
    }

    // Option A: Hide legacy Spin-Pulse Rhythm Bar in Stage 2; [SPACE] is unified continuous burn
    const s2MaxKg = Math.max(
      1e-6,
      (s.stages[s.stages.length - 1] && s.stages[s.stages.length - 1].fuelMaxKg) || VEHICLE.S2_FUEL_MAX_KG || 950.0
    );
    const s2FuelPct = P.clamp(Math.round((s.stage2FuelKg / s2MaxKg) * 100), 0, 100);
    if (dom.rhythmBarBox) {
      dom.rhythmBarBox.classList.add("hidden");
    }
    if (dom.rhythmHintText) {
      dom.rhythmHintText.textContent = sim.fuelSafetyLockout
        ? `FUEL GUARD (${s2FuelPct}% LEFT) · DROPPED TO 1x — RE-PRESS [SPACE] TO BURN RESERVE`
        : `TOGGLE [SPACE] TO EXECUTE TCM INTO 100 KM LUNA GATE · [SHIFT+SPACE] 25% HOLD (${s2FuelPct}% LEFT)`;
    }

    // Manual Staging, Fuel Guard, Lunar Terrain Floor & Stage 3/4 Critical Banners
    if (dom.stagingPromptBanner) {
      const waitStage = sim.subPhase === "WAIT_STAGE";
      const showFuelGuard =
        !waitStage && (sim.fuelSafetyLockout || (sim.fuelSafetyBannerTimer > 0 && !!sim.fuelSafetyBannerText));
      dom.stagingPromptBanner.classList.toggle("hidden", !(waitStage || showFuelGuard));
      dom.stagingPromptBanner.classList.toggle("fuel-guard", showFuelGuard);
      if (waitStage) {
        const curSt = getActiveStage();
        dom.stagingPromptBanner.textContent = `${curSt.name} DEPLETED · PRESS [G] TO SEPARATE STAGE!`;
      } else if (showFuelGuard) {
        dom.stagingPromptBanner.textContent =
          sim.fuelSafetyBannerText || "FUEL GUARD: RELEASE & RE-PRESS [SPACE] TO CONTINUE BURN";
      }
    }
    if (dom.terrainHazardBanner) {
      const lowFloor = useMoonOrigin && sim.currentStage < 4 && curAltKm < CFG.MIN_SAFE_LUNAR_ALT_KM;
      dom.terrainHazardBanner.classList.toggle("hidden", !lowFloor);
    }
    dom.blackoutBanner.classList.toggle("hidden", !(sim.currentStage === 3 && sim.dsnBlocked));
    dom.impactBanner.classList.toggle("hidden", sim.currentStage !== 4);

    // Propulsion & Multi-Stage Fuel Bars
    const activeSt = getActiveStage();
    const remDv = computeRemainingDeltaVMs();
    dom.deltaV.textContent = `${Math.round(remDv).toLocaleString()} m/s`;
    dom.activeStageBadge.textContent = `STG ${s.activeStageIdx + 1}/${s.stages.length} · ${activeSt.name}`;
    dom.activeStageBadge.className = "pill " + (s.stage1Attached ? "cyan" : "amber");

    if (dom.dynamicStageBars) {
      const sig = s.stages.map((st) => `${st.name}|${st.engine || ""}`).join("§");
      if (sig !== lastStageBarSig) {
        lastStageBarSig = sig;
        dom.dynamicStageBars.innerHTML = s.stages.map((st, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === s.stages.length - 1;
          const pctIdAttr = isFirst ? `id="hudS1FuelPct"` : isLast ? `id="hudS2FuelPct"` : "";
          const barIdAttr = isFirst ? `id="barS1Fuel"` : isLast ? `id="barS2Fuel"` : "";
          const fillCls = isLast ? "amber" : "cyan";
          return `
            <div class="bar-group" data-stage-group="${idx}">
              <div class="bar-label">
                <span class="stage-name" title="${st.engine || st.name} · Isp ${Math.round(st.ispS || 0)} s"><span class="role">${st.role || (isLast ? "S/C" : "S" + (idx + 1))}</span><span class="eng">${st.engine || st.name}</span></span>
                <span ${pctIdAttr} data-stage-pct="${idx}" class="mono">100.0%</span>
              </div>
              <div class="progress-track">
                <div ${barIdAttr} data-stage-bar="${idx}" class="progress-fill ${fillCls}" style="width: 100%"></div>
              </div>
            </div>
          `;
        }).join("");
        dom.s1FuelPct = document.getElementById("hudS1FuelPct");
        dom.barS1Fuel = document.getElementById("barS1Fuel");
        dom.s2FuelPct = document.getElementById("hudS2FuelPct");
        dom.barS2Fuel = document.getElementById("barS2Fuel");
      }

      for (let idx = 0; idx < s.stages.length; idx++) {
        const st = s.stages[idx];
        const pct = st.jettisoned
          ? 0
          : P.clamp((st.fuelKg / Math.max(1, st.fuelMaxKg)) * 100.0, 0, 100);
        const pctEl = dom.dynamicStageBars.querySelector(`[data-stage-pct="${idx}"]`);
        const barEl = dom.dynamicStageBars.querySelector(`[data-stage-bar="${idx}"]`);
        if (pctEl) {
          const kg = Math.max(0, st.fuelKg);
          const kgTxt = kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 1 : 2)} t` : `${Math.round(kg)} kg`;
          pctEl.textContent = st.jettisoned ? "SEP" : `${kgTxt} · ${pct.toFixed(0)}%`;
        }
        const grp = dom.dynamicStageBars.querySelector(`[data-stage-group="${idx}"]`);
        if (grp) {
          grp.classList.toggle("active", idx === s.activeStageIdx && !st.jettisoned);
          grp.classList.toggle("sep", !!st.jettisoned);
        }
        if (barEl) {
          barEl.style.width = `${pct.toFixed(1)}%`;
        }
      }
    } else {
      const s1Pct = s.stage1Attached ? (s.stage1FuelKg / VEHICLE.S1_FUEL_MAX_KG) * 100 : 0;
      const s2Pct = (s.stage2FuelKg / VEHICLE.S2_FUEL_MAX_KG) * 100;
      if (dom.s1FuelPct) dom.s1FuelPct.textContent = `${s1Pct.toFixed(1)}%`;
      if (dom.barS1Fuel) dom.barS1Fuel.style.width = `${s1Pct.toFixed(1)}%`;
      if (dom.s2FuelPct) dom.s2FuelPct.textContent = `${s2Pct.toFixed(1)}%`;
      if (dom.barS2Fuel) dom.barS2Fuel.style.width = `${s2Pct.toFixed(1)}%`;
    }

    dom.mass.textContent = `${Math.round(getTotalMassKg()).toLocaleString()} kg`;
    const wantsBurnHud = input.throttleLatched || input.burnHeld || input.shiftSpaceHeld;
    dom.thrustState.textContent = s.isThrusting
      ? (sim.attitudeGate < 0.999 ? `FIRING ${Math.round(sim.attitudeGate * 100)}%` : "FIRING")
      : wantsBurnHud && sim.attitudeGate <= 0.0
      ? "ALIGNING…" // FIX #4: attitude interlock holding thrust until the nose is on target
      : s.pulseFlashTimer > 0 ? "PULSE" : "IDLE";
    dom.trimMode.textContent = s.fineTrimMode ? "PULSE [C]" : sim.sasEnabled ? "SAS HOLD" : "MANUAL";
    dom.trimMode.className = "v " + (s.fineTrimMode ? "amber" : "");
    if (dom.spinRate) {
      const rpm = s.fineTrimMode
        ? (VEHICLE.RHYTHM_SPIN_OMEGA_RAD_S * 60.0) / (Math.PI * 2.0)
        : (Math.abs(s.omegaRadS || 0) * 60.0) / (Math.PI * 2.0);
      dom.spinRate.textContent = `${rpm.toFixed(1)} RPM`;
    }

    // Attitude & Guidance Comparison
    dom.scHeading.textContent = `${scDeg.toFixed(1)}°`;
    dom.targetHeading.textContent = `${fidoDeg.toFixed(1)}°`;
    dom.headingErr.textContent = `${errDeg >= 0 ? "+" : ""}${errDeg.toFixed(1)}°`;

    if (Math.abs(errDeg) <= 8.0) sim.isAlignedState = true;
    else if (Math.abs(errDeg) > 12.5) sim.isAlignedState = false;

    if (sim.isAlignedState) {
      dom.turnCue.textContent = "● ALIGNED ●";
      dom.turnCue.style.color = "var(--green)";
      dom.alignStatus.textContent = "ALIGNED";
      dom.alignStatus.className = "pill green";
    } else if (errDeg > 0) {
      dom.turnCue.textContent = "◀ TURN LEFT [A]";
      dom.turnCue.style.color = "var(--amber)";
      dom.alignStatus.textContent = "PITCH [A]";
      dom.alignStatus.className = "pill amber";
    } else {
      dom.turnCue.textContent = "TURN RIGHT [D] ▶";
      dom.turnCue.style.color = "var(--amber)";
      dom.alignStatus.textContent = "PITCH [D]";
      dom.alignStatus.className = "pill amber";
    }

    if (dom.phaseLead) dom.phaseLead.textContent = `${goldenRef.phaseLeadDeg.toFixed(1)}°`;
    if (dom.altEarth) dom.altEarth.textContent = `${altEarth.toFixed(1)} km`;
    dom.vel.textContent = `${vInert.toFixed(2)} km/s`;
    dom.distMoon.textContent = `${Math.round(dMoon).toLocaleString()} km`;
    dom.predPeri.textContent =
      sim.predictor && sim.predictor.predPerilune
        ? `${sim.predictor.predPerilune.altKm.toFixed(0)} km`
        : "--";

    // GMAT Core Readouts (if present in DOM)
    if (dom.centralBody) dom.centralBody.textContent = useMoonOrigin ? "LUNA ORIGIN" : "EARTH ORIGIN";
    if (dom.apoapsis) dom.apoapsis.textContent = Number.isFinite(kep.ra) ? `${(kep.ra - refRad).toFixed(0)} km` : "ESCAPE";
    if (dom.periapsis) dom.periapsis.textContent = `${(kep.rp - refRad).toFixed(0)} km`;
    if (dom.ecc) dom.ecc.textContent = kep.ecc.toFixed(3);
    if (dom.rho) dom.rho.textContent = `${(s.lastRho || 0).toExponential(2)} kg/m³`;
    if (dom.moonPerturb) {
      dom.moonPerturb.textContent =
        (CFG.ENABLE_PERTURBATIONS ? "J2+J4+SOL+SRP" : "2-BODY IDEAL") +
        (CFG.ENABLE_MASCONS ? "+MASCON" : "");
    }
    if (dom.earthHelioV) {
      const helioE = P.getEarthHelioStateAtTime(sim.simTimeSec);
      dom.earthHelioV.textContent = `${Math.hypot(helioE[2], helioE[3]).toFixed(2)} km/s`;
    }

    if (dom.hudDynPress) {
      dom.hudDynPress.textContent = `${((s.lastDynPressPa || 0) / 1000.0).toFixed(2)} kPa · ${(s.lastGLoad || 1.0).toFixed(1)}g`;
    }
    if (dom.hudLossDv) {
      dom.hudLossDv.textContent = `${Math.round(s.gravityLossMs || 0)} / ${Math.round(s.dragLossMs || 0)} m/s`;
    }
    if (dom.hudBPlane) {
      if (sim.predictor && sim.predictor.predPerilune) {
        const pp = sim.predictor.predPerilune;
        dom.hudBPlane.textContent = `${pp.vInfKms.toFixed(2)} km/s · ${Math.round(pp.aimingRadiusKm).toLocaleString()} km`;
      } else {
        dom.hudBPlane.textContent = "--";
      }
    }
    if (dom.hudDistScale) {
      dom.hudDistScale.textContent = `${Math.round(CFG.R_MOON_ORBIT).toLocaleString()} km (${CFG.MOON_DISTANCE_SCALE >= 0.99 ? "1:1" : "SCALED"})`;
    }

    // Bottom Dock Buttons Sync
    if (dom.btnSasToggle) {
      dom.btnSasToggle.textContent = sim.sasEnabled ? "[S] SAS: ON" : "[S] SAS: OFF";
      dom.btnSasToggle.classList.toggle("active", sim.sasEnabled);
    }
    if (dom.btnFrameToggle) {
      const isSyn = camera.refFrame === "synodic";
      dom.btnFrameToggle.textContent = isSyn ? "[B] SYNODIC (∞)" : "[B] J2000";
      dom.btnFrameToggle.classList.toggle("active", isSyn);
    }
    if (dom.btnRocketView) {
      dom.btnRocketView.classList.toggle("active", camera.mode === "rocket");
    }
    if (dom.btnWarpToWindow) {
      dom.btnWarpToWindow.classList.toggle("active", sim.warpingToWindow);
    }

    // DSN & Science Payload
    if (dom.dsnCardBlock) {
      dom.dsnCardBlock.classList.toggle("dsn-inactive", sim.currentStage !== 3);
    }
    if (sim.dsnBlocked) {
      dom.dsnPill.textContent = "BLACKOUT";
      dom.dsnPill.className = "pill red";
      dom.dsnStatus.textContent = "FARSIDE BLACKOUT - BUFFERING";
      dom.dsnStatus.className = "v red";
    } else {
      dom.dsnPill.textContent = "DSN LOCK";
      dom.dsnPill.className = "pill green";
      dom.dsnStatus.textContent = "DSN LOCK · GOLDSTONE";
      dom.dsnStatus.className = "v green";
    }

    dom.bufferPct.textContent = `${sim.scienceBufferPct.toFixed(1)}%`;
    dom.barBuffer.style.width = `${sim.scienceBufferPct.toFixed(1)}%`;
    dom.barBuffer.className = "progress-fill " + (sim.scienceBufferPct >= 95 ? "amber" : "cyan");

    dom.scorePct.textContent = `${sim.scienceScorePct.toFixed(1)}%`;
    dom.barScore.style.width = `${sim.scienceScorePct.toFixed(1)}%`;

    const canDownlink =
      sim.currentStage === 3 &&
      sim.subPhase === "SCIENCE_ORBIT" &&
      !sim.dsnBlocked &&
      sim.scienceBufferPct > 0.5;
    dom.btnDownlink.disabled = !canDownlink;
    dom.btnDownlink.classList.toggle("active", canDownlink);
    dom.btnDownlink.classList.toggle("green-active", canDownlink);

    if (sim.currentStage < 3) {
      dom.downlinkHint.textContent = "Available in Stage 3 after entering Low Lunar Orbit.";
      dom.downlinkHint.className = "downlink-hint mono";
    } else if (sim.currentStage === 3 && (sim.subPhase === "LOI_1" || sim.subPhase === "LOI_2")) {
      dom.downlinkHint.textContent = `Complete ${sim.subPhase === "LOI_1" ? "LOI-1 Capture & LOI-2" : "LOI-2 Circularize"} first to start Science Orbit.`;
      dom.downlinkHint.className = "downlink-hint mono";
    } else if (sim.currentStage === 3 && sim.dsnBlocked) {
      dom.downlinkHint.textContent = "BLACKOUT: Moon blocks Earth. Wait for near side!";
      dom.downlinkHint.className = "downlink-hint mono blocked";
    } else if (sim.currentStage === 3 && sim.scienceBufferPct <= 0.5) {
      dom.downlinkHint.textContent = "Orbiting Moon & collecting science into Buffer...";
      dom.downlinkHint.className = "downlink-hint mono";
    } else if (canDownlink) {
      dom.downlinkHint.textContent = `READY! Press [E] or click above to upload +${sim.scienceBufferPct.toFixed(0)}%`;
      dom.downlinkHint.className = "downlink-hint mono ready";
    } else {
      dom.downlinkHint.textContent = "Science 100% complete! Proceed to Lunar South Pole dive.";
      dom.downlinkHint.className = "downlink-hint mono ready";
    }

    dom.scaleReadout.textContent =
      camera.scaleKmPerPx < 0.05
        ? `${(camera.scaleKmPerPx * 1000.0).toFixed(1)} m/px`
        : `${camera.scaleKmPerPx.toFixed(1)} km/px`;

    // Checklist Highlighting
    const activeStepMap = {
      LAUNCH_PAD: "1a",
      ASCENT: "1a",
      WAIT_STAGE: "1b",
      TLI_BURN: "1c",
      MCC_COAST: "2",
      LOI_1: "3a",
      LOI_2: "3a",
      SCIENCE_ORBIT: "3b",
      IMPACT_DIVE: "4"
    };
    const activeKey = activeStepMap[sim.subPhase] || "";
    const order = ["1a", "1b", "1c", "2", "3a", "3b", "4"];
    const activeIdx = order.indexOf(activeKey);
    dom.flightPlanItems.forEach((li) => {
      const k = li.getAttribute("data-step");
      const idx = order.indexOf(k);
      li.classList.toggle("active", k === activeKey);
      li.classList.toggle("done", idx >= 0 && idx < activeIdx);
    });
  }

  // ===========================================================================
  // 13. INPUT & UI EVENT HANDLERS
  // ===========================================================================
  function setTimeWarp(w, cancelWindowWarp = false) {
    sim.timeWarp = w;
    if (cancelWindowWarp) sim.warpingToWindow = false;
    dom.warpButtons.forEach((b) => {
      b.classList.toggle("active", Math.abs(parseFloat(b.getAttribute("data-warp")) - w) < 1e-4);
    });
  }


  function toggleAutoAim(forceOn) {
    sim.autoAim = typeof forceOn === "boolean" ? forceOn : !sim.autoAim;
    dom.btnAutoAim.textContent = sim.autoAim ? "[Q] AUTO-AIM: ON" : "[Q] AUTO-AIM: OFF";
    dom.btnAutoAim.classList.toggle("active", sim.autoAim);
  }

  function toggleSas(forceOn) {
    sim.sasEnabled = typeof forceOn === "boolean" ? forceOn : !sim.sasEnabled;
    updateHUD();
  }




  const TUTORIAL_PAGES = {
    overview: `
      <h3>YOUR HANGAR BUILD IS NOW ON THE PAD</h3>
      <p>The rocket on screen is exactly what you built in the hangar: same pixel sprite, same masses, engines, Isp and Δv. If the design was marginal on the checklist, you will feel it here.</p>
      <p>Physics run at real <strong>1:1 Earth–Moon scale (384,400 km)</strong> with RK4 integration, Earth J2/J4, Sun and Moon gravity, solar radiation pressure, lunar mascons and an atmosphere with drag on your rocket's real cross-section. All of it is always on.</p>
      <div class="tut-legend">
        <div><span class="tut-swatch" style="background:#22d3ee;"></span><strong>Dashed cyan line:</strong> guidance plan (ascent and TLI).</div>
        <div><span class="tut-swatch" style="background:#f59e0b;"></span><strong>Solid amber / green / red line:</strong> live prediction (amber = adjust, green = on corridor, red = surface impact).</div>
        <div><span class="tut-swatch" style="background:#38bdf8;"></span><strong>Blue arrow:</strong> guidance attitude target. Match your nose with <kbd>A</kbd>/<kbd>D</kbd> or let <kbd>Q</kbd> Auto-Aim do it.</div>
      </div>
      <ul>
        <li><strong>Left:</strong> propulsion (each stage with the engine you picked, fuel left, Δv left) and attitude guidance.</li>
        <li><strong>Top centre:</strong> altimeter with apoapsis and periapsis, then the guidance box telling you what to do next.</li>
        <li><strong>Right:</strong> Deep Space Network link and science, plus the <em>Mission Flight Plan</em> and <em>Flight Controls</em> panels — click their titles to open or collapse them.</li>
      </ul>`,
    stage12: `
      <h3>STAGE 1: LAUNCH &amp; TRANS-LUNAR INJECTION</h3>
      <ul>
        <li><strong>1A. Ascent:</strong> press <kbd>SPACE</kbd> to switch the engine on (press again to switch it off). Follow the blue arrow through the gravity turn. A low thrust-to-weight build climbs slowly and loses more Δv to gravity.</li>
        <li><strong>1B. Staging <kbd>G</kbd>:</strong> when a stage runs dry the banner says <code>PRESS [G] TO SEPARATE STAGE</code>. Staging is always manual: dead mass you keep costs Δv (Tsiolkovsky). The next stage relights by itself after separation.</li>
        <li><strong>1C. TLI:</strong> at the cyan node switch the engine on until auto-cutoff locks your path to the Moon. Fuel left in the upper stage after reaching orbit is kept and used for TLI.</li>
      </ul>
      <h3>STAGE 2: COURSE CORRECTION</h3>
      <ul>
        <li>Put the predicted perilune inside the <strong>green lunar corridor</strong> (70–135 km is ideal).</li>
        <li>Press <kbd>W</kbd> to warp to the correction node, then <kbd>SPACE</kbd> to burn. <kbd>SHIFT</kbd>+<kbd>SPACE</kbd> gives 25% thrust for fine trims. Your spacecraft's thrusters (from the hangar) set how fast you can turn and trim.</li>
      </ul>`,
    stage34: `
      <h3>STAGE 3: LUNAR ORBIT INSERTION &amp; SCIENCE</h3>
      <ul>
        <li><strong>3A. Braking:</strong> the countdown <code>BRAKE IN …</code> is fixed once you approach, and the burn is centred on your lowest point (perilune). At <code>BRAKE NOW!</code> press <kbd>SPACE</kbd> and leave the engine on: it stops by itself in the <strong>science orbit</strong> (apolune ≤ 150 km).</li>
        <li><strong>Cadet:</strong> auto-aim brakes retrograde while keeping the perilune up. <strong>Commander:</strong> auto-aim gives plain retrograde, and you watch <code>PE</code> yourself. If it drops below 25 km the engine stops, and you burn along the ⊙ raise-PE arrow.</li>
        <li><strong>Terrain floor (&lt; 25 km):</strong> highlands rise to 10.7 km and mascons pull the orbit down. Stay above 25 km.</li>
        <li><strong>3B. Science &amp; downlink:</strong> instruments record over the far side; on the near side press <kbd>E</kbd> to send the data to Earth.</li>
      </ul>
      <h3>STAGE 4: SOUTH POLE IMPACT (SHOEMAKER CRATER)</h3>
      <ul>
        <li>Aim retrograde in the de-orbit zone and burn until the impact marker sits inside Shoemaker Crater, just as Lunar Prospector did on 31 July 1999.</li>
      </ul>`,
    tips: `
      <h3>FUEL, CAMERAS &amp; RETRY</h3>
      <ul>
        <li><strong>Out of fuel?</strong> The mission does not end on its own. Your craft keeps coasting on real orbital mechanics, and you choose <code>ABORT MISSION</code> or <code>CONTINUE DRIFTING</code>.</li>
        <li><strong>Low-thrust stages</strong> are time-compressed: thrust and fuel flow scale together, so Isp and Δv stay exactly what the hangar computed — only the burn is shorter.</li>
        <li><strong>Cameras (<kbd>M</kbd>):</strong> rocket close-up, flight, Moon lock and map. <kbd>B</kbd> switches to the Earth–Moon rotating frame with Lagrange points.</li>
        <li><strong><kbd>R</kbd> retry</strong> restores this stage's last checkpoint. <code>NOMINAL</code> resets the stage on the reference trajectory. <code>◀ HANGAR</code> takes you back to redesign.</li>
      </ul>`
  };

  function renderTutorialPage(pageKey) {
    dom.tutContent.innerHTML = TUTORIAL_PAGES[pageKey] || TUTORIAL_PAGES.overview;
    dom.tutTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tut") === pageKey);
    });
  }

  function openTutorial() {
    renderTutorialPage("overview");
    dom.tutorialModal.classList.remove("hidden");
    sim.paused = true;
    dom.btnPause.textContent = "RESUME";
  }

  function closeTutorial() {
    dom.tutorialModal.classList.add("hidden");
    sim.paused = false;
    dom.btnPause.textContent = "PAUSE";
  }

  function handleStageBooster(isAuto = false) {
    const s = sim.sc;
    if (s.activeStageIdx >= s.stages.length - 1) return false;
    const activeSt = getActiveStage();
    const altEarth = Math.hypot(s.rx, s.ry) - CFG.R_EARTH;
    const canSep =
      isAuto ||
      sim.subPhase === "WAIT_STAGE" ||
      activeSt.fuelKg <= 50 ||
      altEarth > 140.0;
    if (!canSep) return false;

    activeSt.jettisoned = true;
    activeSt.fuelKg = 0;

    const cosH = Math.cos(s.headingRad);
    const sinH = Math.sin(s.headingRad);
    const debrisObj = {
      rx: s.rx - cosH * 0.025,
      ry: s.ry - sinH * 0.025,
      vx: s.vx - cosH * 0.035,
      vy: s.vy - sinH * 0.035,
      angle: s.headingRad,
      spinRate: (s.activeStageIdx % 2 === 0 ? 1 : -1) * 0.65,
      lengthM: activeSt.lengthM || 12.0,
      diamM: activeSt.diamM || 2.5,
      stageIdx: s.activeStageIdx,
      life: 14.0
    };
    sim.debrisList.push(debrisObj);
    sim.jettisonedBooster = {
      rx: debrisObj.rx,
      ry: debrisObj.ry,
      vx: debrisObj.vx,
      vy: debrisObj.vy,
      angle: s.headingRad,
      life: 4.0
    };

    s.activeStageIdx = Math.min(s.stages.length - 1, s.activeStageIdx + 1);
    sim.liveAscentPlan = null;
    sim.liveTliPlan = null;

    if (sim.currentStage === 1) {
      const earthKep = P.cartesianToKeplerian2D(s.rx, s.ry, s.vx, s.vy, CFG.MU_EARTH);
      const inParking =
        altEarth >= 165.0 &&
        earthKep.rp >= CFG.R_EARTH + 150.0 &&
        earthKep.vMag >= CFG.V_PARKING - 0.15;
      if (s.activeStageIdx >= s.stages.length - 1 || inParking) {
        sim.subPhase = "TLI_BURN";
        clearThrottleLatch();
      } else {
        sim.subPhase = "ASCENT";
        if (sim.resumeBurnAfterStaging && !isAuto) {
          input.throttleLatched = true; // FIX #2: re-light the next booster right after [G]
          input.burnHeld = true;
          input.spaceHoldPromoted = true;
          sim.fuelSafetyLockout = false;
        }
      }
    }
    sim.resumeBurnAfterStaging = false;

    refreshPredictor(true);
    updateFidoGuidance(true);
    updateHUD();
    return true;
  }

  function handleSpinPulsePress(fromUserKey = false) {
    const s = sim.sc;
    if (s.fineTrimMode && !s.stage1Attached && s.stage2FuelKg > 0.01 && !sim.paused && !sim.outcome) {
      // DEF-207: explicitly check Number.isFinite so neededDvMs = 0 does not fall back to 12.0
      const neededMs = Number.isFinite(sim.fido.neededDvMs) ? sim.fido.neededDvMs : 12.0;
      if (neededMs <= 0.2) return;

      if (fromUserKey && !isSpinPhaseInGoldZone()) {
        s.rhythmFeedbackTimer = 1.4;
        s.rhythmFeedbackText = "LOCKED OUT · WAIT FOR GOLD ZONE (0 FUEL SPENT)";
        updateHUD();
        return;
      }

      const inGold = isSpinPhaseInGoldZone();
      const remKms = Math.max(0.002, neededMs / 1000.0);
      const syncBonus = inGold ? 1.25 : 1.0;
      const pulseKms = Math.min(remKms, P.clamp(remKms * 0.55 * syncBonus, 0.005, 0.040));
      const actualDv = consumeStage2Impulse(pulseKms);
      if (actualDv > 0) {
        s.pulseFlashTimer = 0.28;
        s.rhythmFeedbackTimer = 1.1;
        s.rhythmFeedbackText = `GOLD PULSE ✓ (-${Math.round(actualDv * 1000)} m/s)`;
        if (remKms - actualDv <= 0.003) {
          sim.mccLocked = true;
          clearThrottleLatch();
          s.isThrusting = false;
          sim.autoCutoffNoticeTimer = 2.5;
        }
        refreshPredictor(true);
        updateFidoGuidance(true);
        updateHUD();
      }
    }
  }

  window.addEventListener("keydown", (e) => {
    if (!isFlightActive()) return;
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.key === "Shift") {
      input.shiftDown = true;
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "escape") {
      if (closeAllDrawers()) return;
    }

    if (key === "h") { setCleanView(!sim.cleanView); return; }
    if (key === "enter" && sim.currentStage === 3 && sim.loiAcceptable) { sim.loiAcceptRequested = true; return; }
    if (key === "t") {
      if (dom.tutorialModal.classList.contains("hidden")) openTutorial();
      else closeTutorial();
      return;
    }
    if (key === "a" || key === "arrowleft") input.left = true;
    else if (key === "d" || key === "arrowright") input.right = true;
    else if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      const isShift = Boolean(e.shiftKey || input.shiftDown);
      input.shiftDown = isShift;
      input.spaceDown = true;
      input.spaceDownAtMs = performance.now();
      sim.fuelSafetyLockout = false;
      sim.warpBurnFuelUsedPct = 0;
      sim.fuelSafetyBannerTimer = 0;
      sim.fuelSafetyBannerText = "";
      if (isShift) {
        input.throttleLatched = false;
        input.shiftSpaceHeld = true;
        input.burnHeld = true;
        input.spaceHoldPromoted = true;
      } else {
        input.shiftSpaceHeld = false;
        input.throttleLatched = !input.throttleLatched;
        input.burnHeld = input.throttleLatched;
        input.spaceHoldPromoted = input.throttleLatched;
      }
    } else if (key === "g") {
      handleStageBooster(false);
    } else if (key === "m") {
      cycleCameraMode();
    } else if (key === "b") {
      toggleRefFrame();
    } else if (key === "s") {
      toggleSas();
    } else if (key === "w") {
      warpToNextWindow();
    } else if (key === "q") {
      toggleAutoAim();
    } else if (key === "p") {
      sim.paused = !sim.paused;
      dom.btnPause.textContent = sim.paused ? "RESUME" : "PAUSE";
    } else if (key === "r") {
      retryCurrentStage();
    } else if (key === "0") setTimeWarp(0.25, true);
    else if (key === "1") setTimeWarp(1, true);
    else if (key === "2") setTimeWarp(5, true);
    else if (key === "3") setTimeWarp(25, true);
    else if (key === "4") setTimeWarp(100, true);
    else if (key === "5") setTimeWarp(500, true);
    else if (key === "6") setTimeWarp(1000, true);
  });

  window.addEventListener("keyup", (e) => {
    if (!isFlightActive()) return;
    if (e.key === "Shift") {
      input.shiftDown = false;
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "a" || key === "arrowleft") input.left = false;
    else if (key === "d" || key === "arrowright") input.right = false;
    else if (e.code === "Space") {
      input.spaceDown = false;
      input.shiftDown = Boolean(e.shiftKey);
      if (input.shiftSpaceHeld) {
        input.shiftSpaceHeld = false;
        input.burnHeld = input.throttleLatched;
        input.spaceHoldPromoted = input.throttleLatched;
        sim.warpBurnFuelUsedPct = 0;
      } else {
        input.burnHeld = input.throttleLatched;
        input.spaceHoldPromoted = input.throttleLatched;
        if (!input.throttleLatched) sim.warpBurnFuelUsedPct = 0;
      }
    }
  });

  dom.warpButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.blur();
      setTimeWarp(parseFloat(btn.getAttribute("data-warp")), true);
    });
  });

  if (dom.btnWarpToWindow) {
    dom.btnWarpToWindow.addEventListener("click", warpToNextWindow);
  }
  if (dom.btnRocketView) {
    dom.btnRocketView.addEventListener("click", () => {
      setCameraMode(camera.mode === "rocket" ? "flight" : "rocket", false);
    });
  }
  dom.btnViewToggle.addEventListener("click", cycleCameraMode);
  if (dom.btnFrameToggle) dom.btnFrameToggle.addEventListener("click", () => toggleRefFrame());
  dom.btnAutoAim.addEventListener("click", () => toggleAutoAim());
  if (dom.btnSasToggle) dom.btnSasToggle.addEventListener("click", () => toggleSas());

  dom.btnTutorial.addEventListener("click", openTutorial);
  dom.btnTutClose.addEventListener("click", closeTutorial);
  dom.tutTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      renderTutorialPage(btn.getAttribute("data-tut"));
    });
  });

  dom.btnZoomIn.addEventListener("click", () => {
    adjustCameraZoom(0.72);
  });
  dom.btnZoomOut.addEventListener("click", () => {
    adjustCameraZoom(1.38);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // FIX #1: normalise wheel input. Trackpads fire 60+ tiny events/s and the old fixed
      // ±15% step per event made zoom race through the cross-fade band in a few frames.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16.0;       // lines -> px
      else if (e.deltaMode === 2) dy *= 400.0; // pages -> px
      dy = P.clamp(dy, -240, 240);
      adjustCameraZoom(Math.exp(dy * 0.0015)); // ≈ ×1.16 per classic 100px notch
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    camera.isDragging = true;
    camera.lastMouseX = e.clientX;
    camera.lastMouseY = e.clientY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!camera.isDragging) return;
    const dx = e.clientX - camera.lastMouseX;
    const dy = e.clientY - camera.lastMouseY;
    camera.lastMouseX = e.clientX;
    camera.lastMouseY = e.clientY;
    // Screen drag -> world offset, undoing the local-horizon camera rotation
    const sdx = dx * camera.scaleKmPerPx;
    const sdy = -dy * camera.scaleKmPerPx;
    const rot = camera.rotRad || 0;
    const cR = Math.cos(rot);
    const sR = Math.sin(rot);
    camera.panOffsetXKm -= sdx * cR + sdy * sR;
    camera.panOffsetYKm -= -sdx * sR + sdy * cR;
  });
  window.addEventListener("mouseup", () => {
    camera.isDragging = false;
  });

  dom.btnPause.addEventListener("click", () => {
    sim.paused = !sim.paused;
    dom.btnPause.textContent = sim.paused ? "RESUME" : "PAUSE";
  });

  dom.btnRetryStage.addEventListener("click", () => retryCurrentStage());
  if (dom.btnResetNominal) dom.btnResetNominal.addEventListener("click", () => resetNominalStage());
  dom.btnModalRetryStage.addEventListener("click", () => retryCurrentStage());
  dom.btnModalRestartAll.addEventListener("click", () => initStage(1));
  if (dom.btnFuelAbort) dom.btnFuelAbort.addEventListener("click", () => resolveFuelOut("abort"));
  if (dom.btnFuelDrift) dom.btnFuelDrift.addEventListener("click", () => resolveFuelOut("drift"));

  // ---- Collapsible HUD panels (<details>): Flight Plan & Flight Controls ----
  function closeAllDrawers() {
    let any = false;
    document.querySelectorAll("#phase2 details[open]").forEach((d) => {
      any = true;
      d.open = false;
    });
    return any;
  }

  // ---- Responsive side columns: collapsible to a tab; auto-collapse on narrow screens ----
  // Step-based HUD: each flight step opens only what it needs. Telemetry opens while the engine is on or a
  // burn is due; COMMS & PLAN stays a tab. A player's own toggle wins until the step changes.
  let hudStepKey = null, hudOverride = {};
  let applyHudStep = () => {};
  (function setupCollapsibleColumns() {
    const cols = [
      { id: "left", el: document.querySelector("#phase2 .hud-left"), label: "TELEMETRY" },
      { id: "right", el: document.querySelector("#phase2 .hud-right"), label: "COMMS & PLAN" }
    ].filter((c) => c.el);
    cols.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "col-toggle";
      btn.type = "button";
      c.el.insertBefore(btn, c.el.firstChild);
      c.btn = btn;
      btn.addEventListener("click", () => {
        hudOverride[c.id] = c.el.classList.contains("collapsed"); // true = player wants it open
        c.el.classList.toggle("collapsed", !hudOverride[c.id]);
        paint();
        btn.blur();
      });
    });
    function paint() {
      cols.forEach((c) => {
        const col = c.el.classList.contains("collapsed");
        c.btn.textContent = col ? c.label : `${c.label} ▴`;
        c.btn.title = col ? `Show ${c.label.toLowerCase()}` : `Hide ${c.label.toLowerCase()}`;
      });
    }
    applyHudStep = (key, want) => {
      if (key !== hudStepKey) { hudStepKey = key; hudOverride = {}; }
      cols.forEach((c) => {
        const open = c.id in hudOverride ? hudOverride[c.id] : Boolean(want[c.id]);
        if (c.el.classList.contains("collapsed") === open) c.el.classList.toggle("collapsed", !open);
      });
      paint();
    };
    applyHudStep("boot", { left: false, right: false });
  })();

  function hudStepTick() {
    const s = sim.sc, f = sim.fido || {};
    const burning = Boolean(s.isThrusting || input.throttleLatched);
    const due = Boolean(f.burnNow) && sim.subPhase !== "LAUNCH_PAD";
    const key = `${sim.currentStage}:${sim.subPhase}:${burning || due ? 1 : 0}`;
    applyHudStep(key, { left: burning || due, right: false });
    // a burn window coming up brings the HUD back from clean view
    if (sim.cleanView && due && !sim._dueWas) setCleanView(false);
    sim._dueWas = due;
  }

  (function wireCleanView() {
    const b = document.getElementById("btnCleanView"), c = document.getElementById("cleanViewChip");
    if (b) b.addEventListener("click", (e) => { e.currentTarget.blur(); setCleanView(true); });
    if (c) c.addEventListener("click", (e) => { e.currentTarget.blur(); setCleanView(false); });
  })();
  function setCleanView(on) {
    sim.cleanView = Boolean(on);
    const root = document.getElementById("phase2");
    if (root) root.classList.toggle("hud-clean", sim.cleanView);
    const chip = document.getElementById("cleanViewChip");
    if (chip) chip.classList.toggle("hidden", !sim.cleanView);
  }

  // Keep the centre banners just below the (possibly wrapping) top bar
  (function watchTopbar() {
    const bar = document.querySelector("#phase2 .hud-topbar");
    const root = document.getElementById("phase2");
    if (!bar || !root) return;
    const apply = () => {
      const r = bar.getBoundingClientRect();
      if (r.height > 0) root.style.setProperty("--hud-top", Math.round(r.height + 10) + "px");
    };
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(apply).observe(bar);
    window.addEventListener("resize", apply);
    apply();
  })();

  dom.stageJumpSelect.addEventListener("change", (e) => {
    const st = parseInt(e.target.value, 10);
    initStage(st);
    e.target.blur();
  });

  // ===========================================================================
  // 14. MAIN ANIMATION LOOP
  // ===========================================================================
  let lastWallTime = performance.now();
  let started = false;
  let briefed = false;

  function frameLoop(now) {
    const dtReal = Math.min(0.05, (now - lastWallTime) / 1000.0);
    lastWallTime = now;
    if (!isFlightActive()) {
      // Hangar is on screen: freeze the sim, keep the loop alive cheaply
      requestAnimationFrame(frameLoop);
      return;
    }
    sim.frameCount++;

    stepSimulation(dtReal);
    if (sim.pendingSurveyHandoff && !sim.outcome) {
      sim.pendingSurveyHandoff = false;
      handoffToSurvey();
      requestAnimationFrame(frameLoop);
      return;
    }
    refreshPredictor(false);
    updateFidoGuidance(false);
    updateCameraLerp(dtReal);
    drawScene();
    updateHUD();
    drawAttitudeDial();

    requestAnimationFrame(frameLoop);
  }

  if (typeof window !== "undefined") {
    window.sim = sim;
    window.initStage = initStage;
    window.retryCurrentStage = retryCurrentStage;
    window.resetNominalStage = resetNominalStage;
    window.stepSimulation = stepSimulation;
    window.refreshPredictor = refreshPredictor;
    window.updateFidoGuidance = updateFidoGuidance;
    window.advanceStageTransitions = advanceStageTransitions;
    window.evaluateUnrecoverableImpact = evaluateUnrecoverableImpact;
    window.handleSpinPulsePress = handleSpinPulsePress;
    window.drawSpacecraft = drawSpacecraft;
    window.handleStageBooster = handleStageBooster;
    window.triggerDownlinkData = triggerDownlinkData;
    window.drawGoldenTrajectory = drawGoldenTrajectory;
    window.drawLivePredictor = drawLivePredictor;
    window.updateHUD = updateHUD;
    window.setCameraMode = setCameraMode;
    window.getRocketCrossFadeAlpha = getRocketCrossFadeAlpha;
    window.adjustCameraZoom = adjustCameraZoom;
    window.updateCameraTargets = updateCameraTargets;
    window.updateCameraLerp = updateCameraLerp;
    window.toggleRefFrame = toggleRefFrame;
    window.handoffToSurvey = handoffToSurvey;
    window.toggleSas = toggleSas;
    window.warpToNextWindow = warpToNextWindow;
    window.toDisplayWorld = toDisplayWorld;
    window.camera = camera;
    window.input = input;
  }

  return {
    sim,
    // Called by the hangar every time a new build is launched
    start() {
      VEHICLE.stages = loadVehicleFromBuild();
      sim.userCheckpoints = { 1: null, 2: null, 3: null, 4: null };
      sim.outcome = null;
      dom.modal.classList.add("hidden");
      closeAllDrawers();
      setTimeWarp(1);
      initStage(1);
      setCameraMode("rocket", false); // open on the pad in the close-up rocket view
      if (dom.stageJumpSelect) dom.stageJumpSelect.value = "1";
      lastWallTime = performance.now();
      drawScene();
      updateHUD();
      if (!started) {
        started = true;
        requestAnimationFrame(frameLoop);
      }
      if (!briefed) {
        briefed = true;
        openTutorial();
      }
    }
  };
};
