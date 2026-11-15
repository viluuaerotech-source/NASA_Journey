/**
 * planets.js — pixel-art Earth & Moon with a swappable art style.
 *
 *   window.PlanetArt.setStyle(name)          → switch every planet render to a registered style
 *   window.PlanetArt.registerStyle(name, def)
 *        def.kind = 'procedural' (built-in, uses the palette + embedded maps)
 *        def.kind = 'image'      (your own artwork): { earthMap: url of an equirectangular Earth
 *                                 texture (2:1), moonFace: url of a square near-side Moon image }
 *   window.PlanetArt.drawEarth(ctx, x, y, rPx, spinRad, sunDirRad, northRad)
 *   window.PlanetArt.drawMoon (ctx, x, y, rPx, sunDirRad, northRad)
 *   window.MoonMap  → shared lunar map (maria, craters, poles, Shoemaker, survey regions) used by
 *                     Phase 2 rendering AND the Phase 3 survey, so both phases show the same Moon.
 *
 * Planets are rendered per pixel into a small cached canvas (lit by the real Sun direction with an
 * ordered-dither terminator) and scaled up with nearest-neighbour sampling. When a planet is far
 * larger than the screen (launch pad, low lunar orbit) a pixel "horizon" fill is used instead.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1. Embedded data
  // ---------------------------------------------------------------------------
  // Real land/sea mask, 128 × 64 equirectangular (lon −180→180, lat 90→−90), 1 bit per cell.
  const EARTH_MASK_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9v+AAAAAAAAAAAAAAAAI////+AP0EgA+AAAAAAABp/7//+ABwABAB8AAAAAAA/v8B//gAAAHAf/yHAAAcAP7v4P/4AAADD/////gIf///f/j/8AB/z/////////////78fw4A//////////F////+uDwMA//////////wf///4PAYAAf////////3gBwf//D8AAAj3//////8HABAD//+/wAA8f///////BwAAAP///8AAP////////4YAAAB///5gAA////////+AAAAAP///AAAH///////+gAAAAD///AAAH/8P/////MAAAAA///gAAB5///////GAAAAAP//wAAA8N//////xAAAAAB//4AAAH8A/////lwAAAAAP/8AAAD/3P////4gAAAAAB/+AAAA////////AAAAAAAfw4AAAf///////gAAAAAAC8MAAAP///+P//8AAAAAAAPJwAAD////h//wAAAAAAAB+KgAA////4PHwQAAAAAAAH4CAAP///4Dg+MAAAAAAAAOIAAD///4A4HhgAAAAAAAAn4AAf///AGBQ4AAAAAAAAD/AAH///wAgQGAAAAAAAAA/8AAc//4AAOMAAAAAAAAAP/gAAH/8AABvcAAAAAAAAH/8AAB/+AAAd88AAAAAAAB//4AAP/gAADLHwAAAAAAAf//AAD/wAAAOAfQAAAAAAD//wAA/8AAAASChAAAAAAA//4AAP/kAAAAOgAAAAAAAH/8AAD/7AAAAPsAAAAAAAAf/AAA/9wAAAH/AAAAAAAAH/wAAP+cAAAH/4EAAAAAAB/4AAB/mAAAD//AAAAAAAAf4AAAfwAAAA//4AAAAAAAP+AAAD4AAAAH/+AAAAAAAD/AAAA+AAAAB//gAAAAAAA/gAAAEAAAAAQHwEAAAAAAPwAAAAAAAAAAA4AwAAAAAHwAAAAAAAAAAAGAYAAAAAB4AAAAAAAAAAAAgMAAAAAAeAAAAAAAAAAAAAGAAAAAAHAAAAAAAAAAAAAAAAAAAAByAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAwAAAAAAwAf+b4AAAAAAAA8AAAAAf/7////+AAAAAAAfgAB//////////+AAD////4AB//////////+AA/////gMf///////////gAr////8Hv///////////gAP///////////////////z//////////////////////////////////////////w==";
  const MASK_W = 128, MASK_H = 64;
  const earthMask = (() => {
    const bin = atob(EARTH_MASK_B64);
    const out = new Uint8Array(MASK_W * MASK_H);
    for (let i = 0; i < out.length; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    return out;
  })();

  /**
   * Shared Moon map. Face coordinates: x east (+) / west (−), y north (+) / south (−), unit disk,
   * as seen from Earth (near side). World angles follow the Phase 2 physics convention:
   * +90° = north pole, −90° = south pole (Shoemaker crater), measured around the Moon.
   */
  const MoonMap = {
    maria: [
      { name: "Oceanus Procellarum", x: -0.56, y: 0.12, rx: 0.27, ry: 0.42 },
      { name: "Mare Imbrium", x: -0.3, y: 0.52, rx: 0.24, ry: 0.2 },
      { name: "Mare Frigoris", x: 0.02, y: 0.8, rx: 0.42, ry: 0.07 },
      { name: "Mare Serenitatis", x: 0.24, y: 0.44, rx: 0.14, ry: 0.13 },
      { name: "Mare Tranquillitatis", x: 0.4, y: 0.16, rx: 0.19, ry: 0.15 },
      { name: "Mare Vaporum", x: 0.05, y: 0.26, rx: 0.07, ry: 0.06 },
      { name: "Mare Crisium", x: 0.74, y: 0.3, rx: 0.1, ry: 0.09 },
      { name: "Mare Fecunditatis", x: 0.64, y: -0.1, rx: 0.12, ry: 0.15 },
      { name: "Mare Nectaris", x: 0.45, y: -0.26, rx: 0.08, ry: 0.08 },
      { name: "Mare Nubium", x: -0.18, y: -0.32, rx: 0.15, ry: 0.11 },
      { name: "Mare Humorum", x: -0.52, y: -0.4, rx: 0.08, ry: 0.08 },
      { name: "Mare Cognitum", x: -0.3, y: -0.16, rx: 0.08, ry: 0.07 }
    ],
    craters: [
      { name: "Tycho", x: -0.14, y: -0.72, r: 0.05, rays: true },
      { name: "Copernicus", x: -0.33, y: 0.17, r: 0.05, rays: true },
      { name: "Kepler", x: -0.62, y: 0.13, r: 0.03, rays: true },
      { name: "Plato", x: -0.12, y: 0.82, r: 0.04 },
      { name: "Clavius", x: -0.22, y: -0.88, r: 0.06 },
      { name: "Langrenus", x: 0.86, y: -0.15, r: 0.05 },
      { name: "Petavius", x: 0.78, y: -0.4, r: 0.05 },
      { name: "Aristarchus", x: -0.72, y: 0.4, r: 0.025, bright: true },
      { name: "Shoemaker", x: 0.0, y: -0.985, r: 0.04, shadowed: true }
    ],
    northDeg: 90,
    southDeg: -90,
    shoemakerDeg: -90,
    // Phase 3 survey regions along the polar ground track (world angle ranges, degrees)
    regions: []
  };

  // ---------------------------------------------------------------------------
  // 2. Styles
  // ---------------------------------------------------------------------------
  const STYLES = {
    nasa16: {
      kind: "procedural",
      label: "NASA realistic 16-bit",
      earthRes: 128,
      moonRes: 112,
      pal: {
        oceanDeep: [11, 42, 91], ocean: [18, 64, 127], oceanShallow: [30, 95, 168],
        land: [62, 125, 58], landDark: [43, 94, 46], desert: [184, 154, 94], steppe: [140, 143, 92],
        ice: [232, 238, 245], cloud: [242, 245, 249], cloudShade: [182, 196, 214],
        nightOcean: [5, 11, 24], nightLand: [14, 22, 38], city: [240, 192, 96],
        atmo: [110, 182, 255], atmoDeep: [58, 123, 213],
        hi: [190, 193, 199], hi2: [168, 172, 180], mare: [94, 100, 112], mare2: [108, 114, 126],
        rim: [218, 221, 226], floor: [134, 139, 148], shadow: [38, 42, 52], ray: [204, 207, 212],
        moonNight: [22, 25, 32]
      }
    }
  };
  let currentStyle = "nasa16";
  const imageCache = {};

  // ---------------------------------------------------------------------------
  // 3. Helpers
  // ---------------------------------------------------------------------------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function valueNoise(x, y, wrapW) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = (v) => ((v % wrapW) + wrapW) % wrapW;
    const a = hash2(w(x0), y0), b = hash2(w(x0 + 1), y0), c = hash2(w(x0), y0 + 1), d = hash2(w(x0 + 1), y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // Cloud field (wraps in longitude): fBm, 64 × 32 cells
  const CLOUD_W = 96, CLOUD_H = 48;
  const cloudField = (() => {
    const f = new Float32Array(CLOUD_W * CLOUD_H);
    for (let y = 0; y < CLOUD_H; y++) {
      for (let x = 0; x < CLOUD_W; x++) {
        let v = 0, amp = 0.55, fr = 1 / 8, tot = 0;
        for (let o = 0; o < 4; o++) {
          v += amp * valueNoise(x * fr, y * fr * 1.6, CLOUD_W * fr);
          tot += amp; amp *= 0.5; fr *= 2;
        }
        const lat = 90 - (y + 0.5) * (180 / CLOUD_H);
        // storm belts at mid-latitudes, clear subtropics
        const belt = 0.08 * Math.cos((Math.abs(lat) - 55) * Math.PI / 50) - 0.05 * Math.cos((Math.abs(lat) - 22) * Math.PI / 30);
        f[y * CLOUD_W + x] = v / tot + belt;
      }
    }
    return f;
  })();
  function landAt(latDeg, lonDeg) {
    const mx = Math.floor(((((lonDeg + 180) % 360) + 360) % 360) / 360 * MASK_W) % MASK_W;
    const my = Math.min(MASK_H - 1, Math.max(0, Math.floor((90 - latDeg) / 180 * MASK_H)));
    return earthMask[my * MASK_W + mx];
  }
  function landColor(pal, latDeg, lonDeg, n) {
    const al = Math.abs(latDeg);
    if (al > 66) return pal.ice;
    if (al > 55) return n > 0.5 ? pal.steppe : pal.landDark;
    if (al > 14 && al < 34) {
      // subtropical deserts (Sahara, Arabia, Australia, Atacama…) with green margins
      const desertBias = (lonDeg > -20 && lonDeg < 60 && latDeg > 0) || (lonDeg > 112 && lonDeg < 150 && latDeg < 0) ? 0.25 : 0.55;
      return n > desertBias ? pal.desert : pal.steppe;
    }
    return n > 0.55 ? pal.landDark : pal.land;
  }
  function mix(c1, c2, k) {
    return [c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k];
  }

  // ---------------------------------------------------------------------------
  // 4. Sprite rendering (cached)
  // ---------------------------------------------------------------------------
  const spriteCache = new Map();
  function getCanvas(key, size, build) {
    let entry = spriteCache.get(key);
    if (!entry) {
      if (spriteCache.size > 24) spriteCache.delete(spriteCache.keys().next().value);
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      build(cv.getContext("2d"), size);
      entry = cv;
      spriteCache.set(key, entry);
    }
    return entry;
  }
  function imagePixels(url) {
    if (!url) return null;
    let e = imageCache[url];
    if (!e) {
      e = imageCache[url] = { ready: false, data: null, w: 0, h: 0 };
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        try { e.data = x.getImageData(0, 0, img.width, img.height).data; e.w = img.width; e.h = img.height; e.ready = true; spriteCache.clear(); } catch (err) { /* tainted */ }
      };
      img.src = url;
    }
    return e.ready ? e : null;
  }

  // Light vector in sprite space (x right, y up, z towards viewer)
  function lightVec(sunDirRad) {
    const lx = Math.cos(sunDirRad), ly = Math.sin(sunDirRad), lz = 0.18;
    const m = Math.hypot(lx, ly, lz);
    return [lx / m, ly / m, lz / m];
  }

  function buildEarth(ctx, size, spinRad, sunDirRad, style) {
    const pal = style.pal || STYLES.nasa16.pal;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const L = lightVec(sunDirRad);
    const R = size / 2 - 3;               // leave room for the atmosphere ring
    const tex = style.kind === "image" ? imagePixels(style.earthMap) : null;
    const spinDeg = (spinRad * 180) / Math.PI;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const sx = (px + 0.5 - size / 2) / R;
        const sy = -(py + 0.5 - size / 2) / R;
        const rr = sx * sx + sy * sy;
        const o = (py * size + px) * 4;
        if (rr > 1.0) {
          // pixel atmosphere ring on the lit limb
          const r = Math.sqrt(rr);
          if (r < 1 + 3 / R) {
            const lit = sx * L[0] + sy * L[1];
            const k = (1 - (r - 1) / (3 / R)) * Math.max(0, Math.min(1, lit / r + 0.35));
            if (k > bayer(px, py) * 0.9) {
              const c = r < 1 + 1.5 / R ? pal.atmo : pal.atmoDeep;
              d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
            }
          }
          continue;
        }
        const sz = Math.sqrt(1 - rr);
        const lat = (Math.asin(sy) * 180) / Math.PI;
        const lon = (Math.atan2(sx, sz) * 180) / Math.PI + spinDeg;
        let c;
        if (tex) {
          const u = Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * tex.w) % tex.w;
          const v = Math.min(tex.h - 1, Math.floor((90 - lat) / 180 * tex.h));
          const i = (v * tex.w + u) * 4;
          c = [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
        } else {
          const n = hash2(Math.floor(lon * 1.4 + 1000), Math.floor(lat * 1.4 + 1000));
          if (landAt(lat, lon)) c = landColor(pal, lat, lon, n);
          else {
            const shelf = landAt(lat + 2.8, lon) || landAt(lat - 2.8, lon) || landAt(lat, lon + 2.8) || landAt(lat, lon - 2.8);
            c = Math.abs(lat) > 70 ? pal.ice : shelf ? pal.oceanShallow : n > 0.75 ? pal.oceanDeep : pal.ocean;
          }
          // clouds (slowly drift relative to the surface)
          const cu = ((((lon + 180 + spinDeg * 0.15) % 360) + 360) % 360) / 360 * CLOUD_W;
          const cv = (90 - lat) / 180 * CLOUD_H;
          const cf = cloudField[Math.min(CLOUD_H - 1, Math.floor(cv)) * CLOUD_W + (Math.floor(cu) % CLOUD_W)];
          if (cf > 0.62) c = cf > 0.7 ? pal.cloud : pal.cloudShade;
        }
        // lighting: diffuse with an ordered-dither terminator (3 tones)
        const diff = sx * L[0] + sy * L[1] + sz * L[2];
        const t = bayer(px, py);
        let out;
        if (diff > 0.12 + t * 0.12) out = mix(c, [255, 255, 255], Math.max(0, diff - 0.85) * 0.25);
        else if (diff > -0.06 + t * 0.12) out = mix(c, pal.nightOcean, 0.55);
        else {
          const isLand = tex ? (c[1] > c[2]) : landAt(lat, lon);
          out = isLand ? pal.nightLand : pal.nightOcean;
          if (isLand && !tex && hash2(Math.floor(lon * 3), Math.floor(lat * 3)) > 0.93 && Math.abs(lat) < 60) out = pal.city;
        }
        d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function moonAlbedo(pal, x, y) {
    // base highlands with fine regolith noise
    const n = hash2(Math.floor(x * 60 + 500), Math.floor(y * 60 + 500));
    let c = n > 0.6 ? pal.hi2 : pal.hi;
    for (const m of MoonMap.maria) {
      const dx = (x - m.x) / m.rx, dy = (y - m.y) / m.ry;
      const edge = 1 + 0.18 * (valueNoise(x * 9 + 40, y * 9 + 40, 1e6) - 0.5);
      if (dx * dx + dy * dy < edge) { c = n > 0.55 ? pal.mare2 : pal.mare; break; }
    }
    for (const cr of MoonMap.craters) {
      const dx = x - cr.x, dy = y - cr.y, dd = Math.hypot(dx, dy);
      if (cr.rays && dd < cr.r * 5 && dd > cr.r * 1.3) {
        const a = Math.atan2(dy, dx);
        if (Math.abs(Math.sin(a * 7 + cr.x * 10)) > 0.93) c = mix(c, pal.ray, 0.6);
      }
      if (dd < cr.r) c = cr.shadowed ? pal.shadow : cr.bright ? pal.rim : pal.floor;
      else if (dd < cr.r * 1.3) c = pal.rim;
    }
    return c;
  }

  function buildMoon(ctx, size, sunDirRad, style) {
    const pal = style.pal || STYLES.nasa16.pal;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const L = lightVec(sunDirRad);
    const R = size / 2 - 1;
    const tex = style.kind === "image" ? imagePixels(style.moonFace) : null;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const sx = (px + 0.5 - size / 2) / R;
        const sy = -(py + 0.5 - size / 2) / R;
        const rr = sx * sx + sy * sy;
        if (rr > 1) continue;
        const o = (py * size + px) * 4;
        const sz = Math.sqrt(1 - rr);
        let c;
        if (tex) {
          const u = Math.min(tex.w - 1, Math.floor((sx * 0.5 + 0.5) * tex.w));
          const v = Math.min(tex.h - 1, Math.floor((0.5 - sy * 0.5) * tex.h));
          const i = (v * tex.w + u) * 4;
          c = [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
        } else c = moonAlbedo(pal, sx, sy);
        const diff = sx * L[0] + sy * L[1] + sz * L[2];
        const t = bayer(px, py);
        let out;
        if (diff > 0.1 + t * 0.12) out = mix(c, [255, 255, 255], Math.max(0, diff - 0.85) * 0.2);
        else if (diff > -0.06 + t * 0.1) out = mix(c, pal.moonNight, 0.6);
        else out = mix(c, pal.moonNight, 0.88);
        d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // 5. Public drawing API
  // ---------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const bucket = (rad, n) => (((Math.round((rad / TAU) * n) % n) + n) % n);

  function horizonFill(ctx, x, y, rPx, baseRGB, accentRGB, pathFn) {
    // planet much larger than the screen: flat pixel-textured fill of the on-screen span
    ctx.save();
    ctx.beginPath();
    if (pathFn) { if (!pathFn()) { ctx.restore(); return; } }
    else ctx.arc(x, y, rPx, 0, TAU);
    const tile = document.createElement("canvas");
    tile.width = tile.height = 32;
    const t = tile.getContext("2d");
    t.fillStyle = `rgb(${baseRGB.join(",")})`;
    t.fillRect(0, 0, 32, 32);
    t.fillStyle = `rgb(${accentRGB.join(",")})`;
    for (let i = 0; i < 46; i++) {
      const hx = Math.floor(hash2(i, 7) * 16) * 2, hy = Math.floor(hash2(i, 13) * 16) * 2;
      t.fillRect(hx, hy, 2, 2);
    }
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fill();
    ctx.restore();
  }

  const PlanetArt = {
    styles: STYLES,
    get style() { return currentStyle; },
    setStyle(name) {
      if (!STYLES[name]) return false;
      currentStyle = name;
      spriteCache.clear();
      if (window.GameState) { window.GameState.visual = window.GameState.visual || {}; window.GameState.visual.planetStyle = name; }
      return true;
    },
    registerStyle(name, def) {
      STYLES[name] = Object.assign({ earthRes: 128, moonRes: 112, pal: STYLES.nasa16.pal }, def);
      return name;
    },
    activeStyle() {
      const want = window.GameState && window.GameState.visual && window.GameState.visual.planetStyle;
      if (want && STYLES[want] && want !== currentStyle) { currentStyle = want; spriteCache.clear(); }
      return STYLES[currentStyle] || STYLES.nasa16;
    },
    /** Earth disk. Returns false if it fell back to the horizon fill (planet ≫ screen). */
    drawEarth(ctx, x, y, rPx, spinRad, sunDirRad, northRad = Math.PI / 2, opts = {}) {
      const st = this.activeStyle();
      const vw = ctx.canvas.width, vh = ctx.canvas.height;
      if (rPx > Math.max(vw, vh) * 2.5) {
        // ground colour under the screen centre
        const pal = st.pal;
        horizonFill(ctx, x, y, rPx, pal.ocean, pal.oceanShallow, opts.pathFn);
        return false;
      }
      // more texels when the planet fills the screen, so pixels stay a readable size
      const size = st.earthRes * (rPx > 700 ? 3 : rPx > 260 ? 2 : 1);
      const rot = northRad - Math.PI / 2;
      const key = `E|${currentStyle}|${size}|${bucket(spinRad, size)}|${bucket(sunDirRad - rot, 72)}`;
      const spr = getCanvas(key, size, (c, s) => buildEarth(c, s, (bucket(spinRad, size) / size) * TAU, ((bucket(sunDirRad - rot, 72) / 72) * TAU), st));
      const scale = rPx / (size / 2 - 3);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, y);
      ctx.rotate(-rot);
      ctx.drawImage(spr, (-size / 2) * scale, (-size / 2) * scale, size * scale, size * scale);
      ctx.restore();
      return true;
    },
    drawMoon(ctx, x, y, rPx, sunDirRad, northRad = Math.PI / 2, opts = {}) {
      const st = this.activeStyle();
      const vw = ctx.canvas.width, vh = ctx.canvas.height;
      if (rPx > Math.max(vw, vh) * 2.5) {
        horizonFill(ctx, x, y, rPx, st.pal.hi2, st.pal.mare2, opts.pathFn);
        return false;
      }
      const size = st.moonRes * (rPx > 700 ? 3 : rPx > 260 ? 2 : 1);
      const rot = northRad - Math.PI / 2;
      const key = `M|${currentStyle}|${size}|${bucket(sunDirRad - rot, 72)}`;
      const spr = getCanvas(key, size, (c, s) => buildMoon(c, s, (bucket(sunDirRad - rot, 72) / 72) * TAU, st));
      const scale = rPx / (size / 2 - 1);
      ctx.save();
      if (opts.clipFn) { ctx.beginPath(); opts.clipFn(); ctx.clip(); }
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, y);
      ctx.rotate(-rot);
      ctx.drawImage(spr, (-size / 2) * scale, (-size / 2) * scale, size * scale, size * scale);
      ctx.restore();
      return true;
    },
    /** Small square preview of a planet (e.g. Phase 3 minimap). */
    moonSprite(sunDirRad = Math.PI * 0.25) {
      const st = this.activeStyle();
      const size = st.moonRes;
      return getCanvas(`M|${currentStyle}|${size}|${bucket(sunDirRad, 72)}`, size, (c, s) => buildMoon(c, s, (bucket(sunDirRad, 72) / 72) * TAU, st));
    },
    landAt
  };

  window.PlanetArt = PlanetArt;
  window.MoonMap = MoonMap;
})();
