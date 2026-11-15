/* =====================================================================
   AUDIO — music per screen, recorded effects, generated chiptune effects
   Music  : intro (opening) · hangar (lắp ráp) · flight (phóng) · survey (màn chơi)
   Samples: liftoff (rocket launch) · explosion (impact / crash)
   Synth  : clicks, selects, alerts, jingles… made with WebAudio (no files)
   Browsers only allow sound after the first click or key press, so
   everything starts on that first gesture. Settings are remembered.
   ===================================================================== */
(function () {
  "use strict";
  const KEY = "lp_audio_v1";
  let cfg = { music: true, sfx: true, musicVol: 0.45, sfxVol: 0.7 };
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j) cfg = Object.assign(cfg, j); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

  // ---------- sources: embedded base64 (single-file build) or files next to the page ----------
  const EMB = window.__AUDIO || null;
  const urls = {};
  function srcOf(name) {
    if (urls[name]) return urls[name];
    if (EMB && EMB[name]) {
      try {
        const bin = atob(EMB[name]), n = bin.length, u8 = new Uint8Array(n);
        for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        urls[name] = URL.createObjectURL(new Blob([u8], { type: "audio/mpeg" }));
        EMB[name] = null; // free the big string
      } catch (e) { urls[name] = "audio/" + name + ".mp3"; }
    } else urls[name] = "audio/" + name + ".mp3";
    return urls[name];
  }

  // ---------- WebAudio context (synth + sample playback) ----------
  let AC = null, master = null, sfxBus = null, unlocked = false;
  function ctx() {
    if (AC) return AC;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 1; master.connect(AC.destination);
      sfxBus = AC.createGain(); sfxBus.gain.value = cfg.sfx ? cfg.sfxVol : 0; sfxBus.connect(master);
    } catch (e) { AC = null; }
    return AC;
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const c = ctx(); if (c && c.state !== "running") c.resume().catch(() => {});
    syncMusic(true);
    loadBuf("liftoff"); loadBuf("explosion");
  }
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  // ---------- music: two <audio> elements, cross-faded ----------
  const TRACK_VOL = { intro: 1, hangar: 0.9, flight: 0.85, survey: 0.9 };
  const decks = [new Audio(), new Audio()];
  decks.forEach((a) => { a.loop = true; a.preload = "auto"; a.volume = 0; });
  let live = 0, current = null, fadeT = 0;
  function targetVol(name) { return cfg.music ? cfg.musicVol * (TRACK_VOL[name] || 1) * (duck ? 0.35 : 1) : 0; }
  let duck = false;
  function play(name) {
    if (name === current) { decks[live].volume = Math.min(1, targetVol(name)); return; }
    current = name;
    if (!unlocked) return;
    const from = decks[live], to = decks[1 - live];
    live = 1 - live;
    if (name) {
      to.src = srcOf(name); to.currentTime = 0; to.volume = 0;
      const p = to.play(); if (p && p.catch) p.catch(() => {});
    }
    clearInterval(fadeT);
    const steps = 24; let k = 0; const v0 = from.volume, v1 = name ? targetVol(name) : 0;
    fadeT = setInterval(() => {
      k++;
      const f = k / steps;
      from.volume = Math.max(0, v0 * (1 - f));
      if (name) to.volume = Math.min(1, v1 * f);
      if (k >= steps) { clearInterval(fadeT); from.pause(); }
    }, 50);
  }
  function refreshVol() { const a = decks[live]; if (current) a.volume = Math.min(1, targetVol(current)); if (sfxBus) sfxBus.gain.value = cfg.sfx ? cfg.sfxVol : 0; }

  // which track for which screen
  function wantedTrack() {
    const GS = window.GameState || {};
    const fr = document.getElementById("finalReport");
    if (fr && !fr.classList.contains("hidden") && fr.getClientRects().length) return "intro";
    if (GS.phase === "opening") return "intro";
    if (GS.phase === "hangar") return "hangar";
    if (GS.phase === "launching" || GS.phase === "flight") return "flight";
    if (GS.phase === "survey") return "survey";
    return "intro";
  }
  function syncMusic(force) { const w = wantedTrack(); if (force && w === current) { current = null; } play(w); }

  // ---------- recorded effects (decoded once into buffers) ----------
  const buffers = {};
  function loadBuf(name) {
    if (buffers[name] || !ctx()) return;
    buffers[name] = "loading";
    fetchBytes(name).then((ab) => AC.decodeAudioData(ab)).then((b) => { buffers[name] = b; }).catch(() => { buffers[name] = null; });
  }
  function fetchBytes(name) {
    if (EMB && EMB[name]) {
      const bin = atob(EMB[name]), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      EMB[name] = null;
      return Promise.resolve(u8.buffer);
    }
    return fetch("audio/" + name + ".mp3").then((r) => r.arrayBuffer());
  }
  function sample(name, vol) {
    LOG.push("sample:" + name);
    if (!cfg.sfx || !ctx() || !unlocked) return;
    const b = buffers[name];
    if (!b || b === "loading") { loadBuf(name); return; }
    const s = AC.createBufferSource(), g = AC.createGain();
    s.buffer = b; g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(sfxBus); s.start();
  }

  // ---------- chiptune synth ----------
  function tone(freq, dur, opt) {
    if (!cfg.sfx || !ctx() || !unlocked) return;
    const o = opt || {}, t0 = AC.currentTime + (o.delay || 0);
    const osc = AC.createOscillator(), g = AC.createGain();
    osc.type = o.type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const v = (o.vol == null ? 0.12 : o.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, opt) {
    if (!cfg.sfx || !ctx() || !unlocked) return;
    const o = opt || {}, t0 = AC.currentTime + (o.delay || 0);
    if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = o.filter || "lowpass"; f.frequency.setValueAtTime(o.f0 || 800, t0); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const v = o.vol == null ? 0.18 : o.vol;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  const notes = (seq, step, type, vol) => seq.forEach((f, i) => tone(f, step * 1.6, { delay: i * step, type: type || "square", vol: vol || 0.1 }));
  const SFX = {
    click: () => tone(1100, 0.04, { to: 700, vol: 0.07 }),
    select: () => { tone(660, 0.05, { vol: 0.08 }); tone(990, 0.07, { delay: 0.045, vol: 0.08 }); },
    back: () => { tone(620, 0.05, { vol: 0.07 }); tone(420, 0.08, { delay: 0.04, vol: 0.07 }); },
    toggle: () => tone(760, 0.05, { type: "triangle", vol: 0.12 }),
    tab: () => { tone(520, 0.04, { type: "triangle", vol: 0.12 }); tone(780, 0.05, { delay: 0.035, type: "triangle", vol: 0.1 }); },
    pop: () => tone(1250, 0.05, { type: "sine", to: 1600, vol: 0.12 }),
    page: () => { tone(880, 0.04, { vol: 0.06 }); tone(1320, 0.05, { delay: 0.04, vol: 0.06 }); },
    error: () => { tone(230, 0.16, { to: 150, vol: 0.1 }); },
    warn: () => { tone(880, 0.12, { vol: 0.08 }); tone(660, 0.12, { delay: 0.14, vol: 0.08 }); tone(880, 0.12, { delay: 0.28, vol: 0.08 }); tone(660, 0.14, { delay: 0.42, vol: 0.08 }); },
    success: () => notes([523, 659, 784, 1047], 0.08, "square", 0.09),
    gate: () => { notes([392, 523, 659, 784, 1047], 0.07, "square", 0.08); tone(2093, 0.25, { delay: 0.38, type: "triangle", vol: 0.05 }); },
    fanfare: () => { notes([523, 523, 659, 784, 659, 784, 1047], 0.11, "square", 0.09); notes([262, 330, 392, 523], 0.2, "triangle", 0.12); },
    fail: () => notes([523, 440, 349, 262], 0.16, "triangle", 0.14),
    points: () => { tone(988, 0.05, { vol: 0.08 }); tone(1319, 0.12, { delay: 0.05, vol: 0.08 }); },
    lose: () => tone(330, 0.2, { type: "sawtooth", to: 180, vol: 0.06 }),
    stage: () => { noise(0.35, { f0: 900, f1: 120, vol: 0.3 }); tone(90, 0.25, { type: "sine", to: 45, vol: 0.3 }); },
    ignite: () => noise(0.45, { f0: 300, f1: 2200, vol: 0.18, attack: 0.08 }),
    cutoff: () => { noise(0.18, { f0: 1500, f1: 200, vol: 0.12 }); tone(660, 0.08, { delay: 0.08, vol: 0.07 }); tone(990, 0.12, { delay: 0.16, vol: 0.07 }); },
    whoosh: () => noise(0.7, { filter: "bandpass", f0: 300, f1: 3000, vol: 0.22, attack: 0.15 }),
    trim: () => { noise(0.4, { f0: 600, f1: 2400, vol: 0.14, attack: 0.05 }); tone(1500, 0.06, { delay: 0.35, vol: 0.06 }); },
    ice: () => { notes([784, 988, 1175, 1568], 0.07, "square", 0.08); tone(2349, 0.3, { delay: 0.3, type: "sine", vol: 0.08 }); },
    correct: () => { tone(1047, 0.06, { vol: 0.08 }); tone(1568, 0.1, { delay: 0.06, vol: 0.08 }); },
    wrong: () => { tone(196, 0.12, { vol: 0.09 }); tone(185, 0.16, { delay: 0.1, vol: 0.09 }); },
    downlink: () => [1200, 1500, 1800, 2100].forEach((f, i) => tone(f, 0.05, { delay: i * 0.07, type: "sine", vol: 0.08 })),
    pause: () => { tone(988, 0.06, { type: "triangle", vol: 0.12 }); tone(740, 0.1, { delay: 0.07, type: "triangle", vol: 0.12 }); }
  };
  const LOG = [];
  function sfx(name) { LOG.push(name); if (LOG.length > 200) LOG.shift(); try { (SFX[name] || SFX.click)(); } catch (e) { /* ignore */ } }

  // ---------- engine rumble while the engine burns (Phase 2) ----------
  let rumble = null;
  function setRumble(on, level) {
    if (!ctx() || !unlocked) return;
    if (!rumble) {
      if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = "lowpass"; f.frequency.value = 260; g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start();
      rumble = { g, f };
    }
    const v = on && cfg.sfx ? 0.22 * (level || 1) : 0;
    rumble.g.gain.setTargetAtTime(v, AC.currentTime, 0.12);
    rumble.f.frequency.setTargetAtTime(on ? 220 + 160 * (level || 1) : 200, AC.currentTime, 0.2);
  }

  // ---------- button clicks everywhere (one delegated listener) ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("button, .card, .tab, li.fixable, select, .p3-peak, [data-el], [data-hold], [data-trim], .opt, .hot");
    if (!el || el.disabled || el.classList.contains("disabled")) return;
    const id = el.id || "", txt = (el.textContent || "").trim();
    if (id === "launchBtn" || id === "toHangar" || id === "start") return;            // these have their own sounds
    if (el.matches(".tut-wclose, #mx, #p3HandbookClose, #back, .tut-skip") || txt === "✕" || /^✕/.test(txt)) return sfx("back");
    if (el.matches(".tab, .hb-tab, [data-hold]")) return sfx("tab");
    if (el.matches(".card, .hot, .opt, [data-el], .p3-peak, [data-trim], li.fixable")) return sfx("select");
    if (el.matches(".tut-next, .tut-wnext, .tut-dots button")) return sfx("page");
    sfx("click");
  }, true);

  // ---------- game event watcher: turns state changes into sounds ----------
  const W = { phase: null, sub: null, stage: null, thr: false, outcome: null, cutoff: null, gate: null, p3pts: null, p3ice: "", p3lab: false, p3msg: "", p3burn: 0, p3dl: false, report: false, coach: -1, wpage: "" };
  function watch() {
    const GS = window.GameState || {};
    // music follows the screen (quieter while a tutorial pop-up talks)
    const dk = !!document.querySelector(".tut-wroot"); if (dk !== duck) { duck = dk; refreshVol(); }
    if (unlocked) { const w = wantedTrack(); if (w !== current) play(w); }
    if (GS.phase !== W.phase) {
      if (W.phase === "opening" && GS.phase === "hangar") sfx("whoosh");
      if (GS.phase === "launching") sfx("whoosh");
      if (GS.phase === "survey") sfx("success");
      W.phase = GS.phase;
    }
    // hangar: launch gate opens / closes
    const lb = document.getElementById("launchBtn");
    if (lb && GS.phase === "hangar") { const open = !lb.disabled; if (W.gate !== null && open && !W.gate) sfx("gate"); W.gate = open; }
    // Phase 2 flight
    const sim = window.sim;
    if (sim && GS.phase === "flight") {
      const s = sim.sc;
      if (W.sub === "LAUNCH_PAD" && sim.subPhase === "ASCENT") { loadBuf("liftoff"); sample("liftoff", 0.9); }
      if (W.stage !== null && s && s.activeStageIdx > W.stage) sfx("stage");
      const thr = !!(s && s.isThrusting) && !sim.paused;
      if (thr && !W.thr && sim.subPhase !== "ASCENT") sfx("ignite");
      setRumble(thr, s && s.isThrusting && window.input && window.input.shiftSpaceHeld ? 0.45 : 1);
      if (sim.lastCutoffReason && sim.lastCutoffReason !== W.cutoff && sim.autoCutoffNoticeTimer > 0) sfx(/SAFETY|⚠/.test(sim.lastCutoffReason) ? "warn" : "cutoff");
      if (sim.outcome && !W.outcome) {
        const t = String(sim.outcomeTitle || "");
        if (sim.outcome === "victory" || /IMPACT|CRASH|LOST|SURFACE/i.test(t)) { loadBuf("explosion"); sample("explosion", 1); }
        else sfx("fail");
      }
      W.sub = sim.subPhase; W.stage = s ? s.activeStageIdx : null; W.thr = thr; W.outcome = sim.outcome; W.cutoff = sim.lastCutoffReason;
    } else { setRumble(false); if (sim) { W.sub = sim.subPhase; W.outcome = sim.outcome; W.stage = sim.sc ? sim.sc.activeStageIdx : null; } }
    // Phase 3 survey
    const S = window.Phase3 && window.Phase3._state && window.Phase3._state();
    if (S && GS.phase === "survey") {
      if (W.p3pts !== null && S.points !== W.p3pts) sfx(S.points > W.p3pts ? "points" : "lose");
      const ice = (S.ice.north.state + S.ice.south.state);
      if (W.p3ice && ice !== W.p3ice && /confirmed/.test(ice) && (ice.match(/confirmed/g) || []).length > (W.p3ice.match(/confirmed/g) || []).length) sfx("ice");
      if (!!S.labelling && !W.p3lab) sfx("pause");
      const m = document.getElementById("p3LabelMsg");
      if (m) { const key = m.className + "|" + m.textContent; if (key !== W.p3msg && m.textContent) { if (/\bok\b/.test(m.className)) sfx("correct"); else if (/\bbad\b/.test(m.className)) sfx("wrong"); } W.p3msg = key; }
      if (S.burnFlashUntil && S.burnFlashUntil !== W.p3burn) { if (W.p3burn !== 0 || S.burnFlashUntil > performance.now()) sfx("trim"); W.p3burn = S.burnFlashUntil; }
      if (S.downlink && !W.p3dl) sfx("downlink");
      W.p3pts = S.points; W.p3ice = ice; W.p3lab = !!S.labelling; W.p3dl = !!S.downlink;
    } else { W.p3pts = null; W.p3ice = ""; }
    // final report fanfare
    const fr = document.getElementById("finalReport");
    const rep = !!(fr && !fr.classList.contains("hidden") && fr.getClientRects().length);
    if (rep && !W.report) setTimeout(() => { const h = fr.querySelector("h2"); sfx(h && /FAILED/.test(h.textContent) ? "fail" : "fanfare"); }, 1600);
    W.report = rep;
    // tutorials: soft pop per step / page
    const T = window.Tutorial;
    if (T) { const st = T._coachStep ? T._coachStep() : -1; if (st !== W.coach && st >= 0) sfx("pop"); W.coach = st; }
    const wh = document.querySelector(".tut-wtext h3"); const wp = wh ? wh.textContent : "";
    if (wp && wp !== W.wpage && !W.wpage) sfx("pop"); W.wpage = wp;
  }
  setInterval(watch, 120);

  // ---------- on/off controls injected into every screen ----------
  function paintCtl() {
    document.querySelectorAll(".audio-ctl [data-a]").forEach((b) => {
      const on = b.dataset.a === "music" ? cfg.music : cfg.sfx;
      b.classList.toggle("off", !on);
      b.textContent = (b.dataset.a === "music" ? "♪ MUSIC " : "🔊 SFX ") + (on ? "ON" : "OFF");
      b.title = (on ? "Turn off " : "Turn on ") + (b.dataset.a === "music" ? "music" : "sound effects");
    });
    const sd = document.getElementById("sd"); if (sd) sd.textContent = "Sound: " + (cfg.sfx ? "on" : "off");
    const sm = document.getElementById("sdMusic"); if (sm) sm.textContent = "Music: " + (cfg.music ? "on" : "off");
  }
  function makeCtl(cls) {
    const d = document.createElement("span");
    d.className = "audio-ctl " + (cls || "");
    d.innerHTML = '<button type="button" data-a="music"></button><button type="button" data-a="sfx"></button>';
    d.addEventListener("click", (e) => { const b = e.target.closest("[data-a]"); if (!b) return; toggle(b.dataset.a); b.blur(); });
    return d;
  }
  function toggle(which) {
    unlock();
    if (which === "music") cfg.music = !cfg.music; else cfg.sfx = !cfg.sfx;
    save(); refreshVol(); paintCtl();
    if (which === "sfx" && cfg.sfx) sfx("toggle");
  }
  function inject() {
    const spots = [["#phase1 .mission-settings", "ctl-hangar"], ["#phase2 .topbar-controls", "ctl-flight"], ["#phase3 .p3-top-right", "ctl-survey"]];
    for (const [sel, cls] of spots) { const host = document.querySelector(sel); if (host && !host.querySelector(".audio-ctl")) { host.appendChild(makeCtl(cls)); paintCtl(); } }
    // opening: the existing "Sound" button becomes sound effects, plus a Music button next to it
    const sd = document.getElementById("sd");
    if (sd && !sd.dataset.audioWired) {
      sd.dataset.audioWired = "1";
      const clone = sd.cloneNode(true); sd.replaceWith(clone);      // drop the old handler
      clone.addEventListener("click", (e) => { toggle("sfx"); e.currentTarget.blur(); });
      const mb = document.createElement("button"); mb.id = "sdMusic"; mb.type = "button";
      mb.addEventListener("click", (e) => { toggle("music"); e.currentTarget.blur(); });
      clone.after(mb); paintCtl();
    }
  }
  setInterval(inject, 700);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject); else inject();

  window.GameAudio = {
    sfx, sample, play, unlock,
    sfxOn: () => cfg.sfx, musicOn: () => cfg.music,
    setMusic(v) { cfg.music = !!v; save(); refreshVol(); paintCtl(); },
    setSfx(v) { cfg.sfx = !!v; save(); refreshVol(); paintCtl(); },
    duck(v) { duck = !!v; refreshVol(); },
    _log: () => LOG.slice(),
    _state: () => ({ current, unlocked, live, vol: decks[live].volume, paused: decks[live].paused, src: decks[live].src.slice(0, 30) })
  };
})();
