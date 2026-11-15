/**
 * physics.js — NASA GMAT-Derived 2D Astrodynamics & Mission Simulation Engine
 *
 * Directly grounded in d:\Java code\gmat-git\src\base:
 *   - GmatConstants.hpp / GmatDefaults.hpp: Earth & Luna physical/gravitational constants
 *   - CelestialBody.cpp (KeplersProblem): Universal variable + Stumpff c2/c3 Kepler solver
 *   - PointMassForce.cpp: Direct + Indirect 3rd-body gravitational acceleration
 *   - ExponentialAtmosphere.cpp & DragForce.cpp: 28-band Vallado exponential atmosphere & drag
 *   - FiniteBurn.cpp & ChemicalThruster.cpp: Thrust/mass acceleration & Isp propellant flow
 *   - Barycenter.cpp: Earth-Moon Barycenter (EMB) & Heliocentric solar frame state
 */
(function (globalScope) {
  "use strict";

  // ===========================================================================
  // 1. VERIFIED GMAT CONSTANTS & COMPRESSED 2D ARENA SCALE
  // ===========================================================================
  const GMAT_CONFIG = {
    // GmatConstants.hpp
    G0_MS2: 9.80665,
    UNIVERSAL_G: 6.673e-20,            // km^3 / (kg * s^2)
    SECS_PER_DAY: 86400.0,
    DEG_TO_RAD: Math.PI / 180.0,
    RAD_TO_DEG: 180.0 / Math.PI,
    KEPLER_TOL: 1.0e-10,
    KEPLER_MAX_ITER: 50,

    // GmatDefaults.hpp — Sun, Earth, Luna
    MU_SUN: 132712440017.99,           // km^3 / s^2
    R_SUN: 695990.0,                   // km
    MU_EARTH: 398600.4415,             // km^3 / s^2
    R_EARTH: 6378.1363,                // km (equatorial radius)
    EARTH_FLATTENING: 0.00335270,
    OMEGA_EARTH: 7.2921159e-5,         // rad/s sidereal rotation
    EARTH_HELIO_KEPLER: [
      149653978.9783766,               // SMA (km)
      0.01704556707314489,             // ECC
      23.439034090426388,              // INC (deg)
      0.00018646554487906264,          // RAAN (deg)
      101.7416388084352,               // AOP (deg)
      358.12708491129                  // TA at J2000 (deg)
    ],

    MU_MOON: 4902.8005821478,          // km^3 / s^2
    R_MOON: 1738.2000,                 // km (equatorial radius)
    REAL_R_MOON_ORBIT: 385494.90435,   // km (GMAT MOON_TWO_BODY_ELEMENTS SMA)

    // Earth Atmospheric Boundary (verified against ExponentialAtmosphere.cpp)
    H_KARMAN_KM: 100.0,                // Karman Line boundary
    R_ATMOS_KARMAN: 6378.1363 + 100.0, // 6478.1363 km
    H_ATMOS_DRAG_MAX: 180.0,           // Upper sensible orbital drag threshold in game
    R_ATMOS_BOUNDARY: 6378.1363 + 180.0,// 6558.1363 km
    H_PARKING_KM: 185.0,               // Athena II / Lunar Prospector parking orbit
    R_PARKING: 6378.1363 + 185.0,      // 6563.1363 km

    // True 1:1 NASA Cislunar Scale (384,400 km mean Earth-Moon distance)
    R_MOON_ORBIT: 384400.0,            // km real mean semi-major axis
    MOON_ECC: 0.032,                   // Lunar orbital eccentricity
    TARGET_PERILUNE_ALT_KM: 100.0,     // 100 km Lunar Prospector polar mapping orbit
    CORRIDOR_MIN_ALT_KM: 35.0,
    CORRIDOR_MAX_ALT_KM: 240.0,
    OPTIMAL_CORRIDOR_MIN_KM: 70.0,
    OPTIMAL_CORRIDOR_MAX_KM: 135.0,
    MIN_SAFE_LUNAR_ALT_KM: 25.0,
    LUNAR_HIGHLAND_PEAK_KM: 10.7,

    // Perturbation Harmonics & Solar Radiation Pressure (Curtis / GMATMathSpec Ch. 4)
    J2_EARTH: 1.0826269e-3,
    J4_EARTH: -1.6196216e-6,
    J2_MOON: 2.027e-4,
    SRP_P_1AU: 4.56e-6,                // N / m^2 solar radiation pressure at 1 AU
    CR_DEFAULT: 1.3,                   // Reflectivity coefficient
    SRP_AREA_M2: 3.2,                  // Cross-sectional solar area (m^2)
    AU_KM: 149597870.7,                // 1 Astronomical Unit (km)

    // Pixel Scale Presets (km per pixel)
    ROCKET_VIEW_KM_PER_PX: 0.0012,     // SFS close-up: 1.2 m/px at 1.0x zoom
    FLIGHT_VIEW_KM_PER_PX: 7.5,        // R_Earth ≈ 850.4 px, R_Atmos ≈ 874.4 px
    LUNAR_FLIGHT_KM_PER_PX: 3.6,       // Close-up around Moon: R_Moon ≈ 482.8 px
    MAP_VIEW_KM_PER_PX: 920.0,         // Full 1:1 384,400 km Earth-Moon cislunar arena

    // Lunar South Pole (Shoemaker Crater) Target Corridor (angle in Moon-centered coords)
    SOUTH_POLE_CENTER_DEG: -90.0,      // Straight down (-Y) on Moon
    SOUTH_POLE_HALF_WIDTH_DEG: 32.0,   // [-122 deg, -58 deg]

    // Lunar Mass Concentrations (Mascons) — nearside gravity anomalies discovered by
    // Lunar Prospector's Doppler Gravity Experiment (DGE).
    MASCON_DEPTH_KM: 60.0,
    MASCONS: [
      { name: "IMBRIUM", angDeg: 28.0, muKm3s2: 0.84 },
      { name: "SERENITATIS", angDeg: -6.0, muKm3s2: 0.60 },
      { name: "CRISIUM", angDeg: -52.0, muKm3s2: 0.68 }
    ]
  };

  // Runtime toggles (UI-controlled): Option A Perturbations + Mascons
  GMAT_CONFIG.ENABLE_MASCONS = true;
  GMAT_CONFIG.ENABLE_PERTURBATIONS = true; // Earth J2+J4, Solar 3rd-Body Battin q-Fq & SRP

  function recomputeDerivedConfig() {
    GMAT_CONFIG.MU_SYS = GMAT_CONFIG.MU_EARTH + GMAT_CONFIG.MU_MOON;
    GMAT_CONFIG.V_MOON_CIRC = Math.sqrt(GMAT_CONFIG.MU_SYS / GMAT_CONFIG.R_MOON_ORBIT);
    GMAT_CONFIG.T_MOON_ORBIT =
      2.0 * Math.PI * Math.sqrt(Math.pow(GMAT_CONFIG.R_MOON_ORBIT, 3) / GMAT_CONFIG.MU_SYS);
    GMAT_CONFIG.MOON_SOI =
      GMAT_CONFIG.R_MOON_ORBIT * Math.pow(GMAT_CONFIG.MU_MOON / GMAT_CONFIG.MU_EARTH, 0.4);
    GMAT_CONFIG.V_PARKING = Math.sqrt(GMAT_CONFIG.MU_EARTH / GMAT_CONFIG.R_PARKING);
  }
  recomputeDerivedConfig();

  // ===========================================================================
  // 2. VALLADO 28-BAND EXPONENTIAL ATMOSPHERE (ExponentialAtmosphere.cpp:557-641)
  // [refHeightKm, refDensityKgM3, scaleHeightKm]
  // ===========================================================================
  const EARTH_ATMOSPHERE_BANDS = [
    [0.0, 1.225, 7.249],
    [25.0, 3.899e-2, 6.349],
    [30.0, 1.774e-2, 6.682],
    [40.0, 3.972e-3, 7.554],
    [50.0, 1.057e-3, 8.382],
    [60.0, 3.206e-4, 7.714],
    [70.0, 8.770e-5, 6.549],
    [80.0, 1.905e-5, 5.799],
    [90.0, 3.396e-6, 5.382],
    [100.0, 5.297e-7, 5.877],
    [110.0, 9.661e-8, 7.263],
    [120.0, 2.438e-8, 9.473],
    [130.0, 8.484e-9, 12.636],
    [140.0, 3.845e-9, 16.149],
    [150.0, 2.070e-9, 22.523],
    [180.0, 5.464e-10, 29.740],
    [200.0, 2.789e-10, 37.105],
    [250.0, 7.248e-11, 45.546],
    [300.0, 2.418e-11, 53.628],
    [350.0, 9.518e-12, 53.298],
    [400.0, 3.725e-12, 58.515],
    [450.0, 1.585e-12, 60.828],
    [500.0, 6.967e-13, 63.822],
    [600.0, 1.454e-13, 71.835],
    [700.0, 3.614e-14, 88.667],
    [800.0, 1.170e-14, 124.64],
    [900.0, 5.245e-15, 181.05],
    [1000.0, 3.019e-15, 268.00]
  ];

  /**
   * Computes Earth atmospheric density (kg/m^3) using GMAT's ExponentialAtmosphere formula.
   * @param {number} altKm Altitude above Earth equatorial radius in km.
   * @returns {number} Density in kg/m^3.
   */
  function getAtmosphericDensity(altKm) {
    if (!Number.isFinite(altKm) || altKm > 1200.0) return 0.0;
    const h = Math.max(0.0, altKm);
    let idx = EARTH_ATMOSPHERE_BANDS.length - 1;
    for (let i = 0; i < EARTH_ATMOSPHERE_BANDS.length - 1; i++) {
      if (h < EARTH_ATMOSPHERE_BANDS[i + 1][0]) {
        idx = i;
        break;
      }
    }
    const band = EARTH_ATMOSPHERE_BANDS[idx];
    const exponent = -(h - band[0]) / band[2];
    const rho = band[1] * Math.exp(Math.max(-80.0, exponent));
    return Number.isFinite(rho) ? rho : 0.0;
  }

  // ===========================================================================
  // 3. ANGLE & SAFETY UTILITIES
  // ===========================================================================
  function clamp(v, minV, maxV) {
    return v < minV ? minV : v > maxV ? maxV : v;
  }

  function normalizeAngleRad(a) {
    let r = a % (2.0 * Math.PI);
    if (r > Math.PI) r -= 2.0 * Math.PI;
    if (r <= -Math.PI) r += 2.0 * Math.PI;
    return r;
  }

  function normalizeAnglePosRad(a) {
    const twoPi = 2.0 * Math.PI;
    return ((a % twoPi) + twoPi) % twoPi;
  }

  function kmToPx(km, scaleKmPerPx) {
    return km / Math.max(1e-6, scaleKmPerPx);
  }

  function pxToKm(px, scaleKmPerPx) {
    return px * scaleKmPerPx;
  }

  function safeStateValid(s) {
    return (
      s &&
      Number.isFinite(s.rx) &&
      Number.isFinite(s.ry) &&
      Number.isFinite(s.vx) &&
      Number.isFinite(s.vy)
    );
  }

  // ===========================================================================
  // 4. PORTED GMAT UNIVERSAL VARIABLE KEPLER SOLVER (CelestialBody.cpp:6317)
  // ===========================================================================
  /**
   * Propagates a 2D state [rx, ry, vx, vy] over dtSec under central body mu
   * using GMAT's Universal Variable + Stumpff c2/c3 KeplersProblem algorithm.
   */
  function keplersProblem2D(r0, v0, dtSec, mu) {
    if (!Number.isFinite(dtSec) || Math.abs(dtSec) < 1e-9 || mu <= 0) {
      return [r0[0], r0[1], v0[0], v0[1]];
    }

    const rMag0 = Math.hypot(r0[0], r0[1]);
    const vMag0 = Math.hypot(v0[0], v0[1]);
    if (rMag0 < 1e-6) return [r0[0], r0[1], v0[0], v0[1]];

    const sqrtMu = Math.sqrt(mu);
    let alpha = -(vMag0 * vMag0) / mu + 2.0 / rMag0;
    const rDotV = r0[0] * v0[0] + r0[1] * v0[1];

    // Reduce dt by orbital period for elliptical orbits to keep Newton convergence rapid
    let dTime = dtSec;
    if (alpha > GMAT_CONFIG.KEPLER_TOL) {
      const sma = 1.0 / alpha;
      const period = 2.0 * Math.PI * Math.sqrt((sma * sma * sma) / mu);
      if (Number.isFinite(period) && period > 0) {
        dTime -= period * Math.trunc(dTime / period);
      }
    }
    if (Math.abs(dTime) < 1e-9) return [r0[0], r0[1], v0[0], v0[1]];

    const TOL = GMAT_CONFIG.KEPLER_TOL;
    let x0 = 0.0;
    if (alpha > TOL) {
      x0 = sqrtMu * dTime * alpha;
      if (Math.abs(alpha - 1.0) <= TOL) x0 *= 0.97;
    } else if (Math.abs(alpha) < TOL) {
      const hz = r0[0] * v0[1] - r0[1] * v0[0];
      const p = Math.max(1e-6, (hz * hz) / mu);
      const s = 0.5 * (Math.PI / 2.0 - Math.atan(3.0 * Math.sqrt(mu / (p * p * p)) * dTime));
      const w = Math.atan(Math.cbrt(Math.tan(s)));
      x0 = (Math.sqrt(p) * 2.0) / Math.tan(2.0 * w || 1e-6);
      alpha = 0.0;
    } else {
      const a = 1.0 / alpha;
      const signT = dTime >= 0 ? 1.0 : -1.0;
      const denom = rDotV + signT * Math.sqrt(-mu * a) * (1.0 - rMag0 * alpha);
      const ratio = (-2.0 * mu * alpha * dTime) / (Math.abs(denom) < 1e-12 ? 1e-12 : denom);
      x0 = signT * Math.sqrt(-a) * Math.log(Math.max(1e-12, ratio));
    }

    let xn = Number.isFinite(x0) ? x0 : 0.0;
    let psi = 0.0;
    let c2 = 0.5;
    let c3 = 1.0 / 6.0;

    for (let iter = 0; iter < GMAT_CONFIG.KEPLER_MAX_ITER; iter++) {
      psi = xn * xn * alpha;
      if (psi > TOL) {
        const sp = Math.sqrt(psi);
        c2 = (1.0 - Math.cos(sp)) / psi;
        c3 = (sp - Math.sin(sp)) / (psi * sp);
      } else if (psi < -TOL) {
        const sp = Math.sqrt(-psi);
        c2 = (1.0 - Math.cosh(sp)) / psi;
        c3 = (Math.sinh(sp) - sp) / (-psi * sp);
      } else {
        c2 = 0.5;
        c3 = 1.0 / 6.0;
      }

      const rVal =
        xn * xn * c2 +
        (rDotV / sqrtMu) * xn * (1.0 - psi * c3) +
        rMag0 * (1.0 - psi * c2);
      if (Math.abs(rVal) < 1e-12) break;

      const fVal =
        sqrtMu * dTime -
        xn * xn * xn * c3 -
        (rDotV / sqrtMu) * xn * xn * c2 -
        rMag0 * xn * (1.0 - psi * c3);
      const xNew = xn + fVal / rVal;
      if (!Number.isFinite(xNew)) break;
      if (Math.abs(xn - xNew) < TOL) {
        xn = xNew;
        break;
      }
      xn = xNew;
    }

    const f = 1.0 - ((xn * xn) / rMag0) * c2;
    const g = dTime - ((xn * xn * xn) / sqrtMu) * c3;
    const rx = f * r0[0] + g * v0[0];
    const ry = f * r0[1] + g * v0[1];
    const rMagNew = Math.max(1e-6, Math.hypot(rx, ry));
    const gDot = 1.0 - ((xn * xn) / rMagNew) * c2;
    const fDot = (sqrtMu / (rMagNew * rMag0)) * xn * (psi * c3 - 1.0);
    const vx = fDot * r0[0] + gDot * v0[0];
    const vy = fDot * r0[1] + gDot * v0[1];

    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
      return [r0[0], r0[1], v0[0], v0[1]];
    }
    return [rx, ry, vx, vy];
  }

  /**
   * Computes 2D Osculating Keplerian Elements relative to central body mu.
   */
  function cartesianToKeplerian2D(rx, ry, vx, vy, mu) {
    const rMag = Math.hypot(rx, ry);
    const vMag = Math.hypot(vx, vy);
    if (!Number.isFinite(rMag) || !Number.isFinite(vMag) || rMag < 1e-6 || mu <= 0) {
      return {
        sma: 0,
        ecc: 0,
        rp: 0,
        ra: 0,
        energy: 0,
        hz: 0,
        aopRad: 0,
        taRad: 0,
        rDotV: 0,
        rMag: 0,
        vMag: 0
      };
    }

    const hz = rx * vy - ry * vx;
    const rDotV = rx * vx + ry * vy;
    const c1 = vMag * vMag - mu / rMag;
    const ex = (c1 * rx - rDotV * vx) / mu;
    const ey = (c1 * ry - rDotV * vy) / mu;
    const ecc = Math.hypot(ex, ey);
    const energy = 0.5 * vMag * vMag - mu / rMag;
    const sma = Math.abs(energy) > 1e-12 ? -mu / (2.0 * energy) : Infinity;

    const aopRad = ecc > 1e-9 ? Math.atan2(ey, ex) : 0.0;
    let taRad = 0.0;
    if (ecc > 1e-9) {
      const cosTa = clamp((ex * rx + ey * ry) / (ecc * rMag), -1.0, 1.0);
      taRad = Math.acos(cosTa);
      if (rDotV < 0) taRad = 2.0 * Math.PI - taRad;
    } else {
      taRad = normalizeAnglePosRad(Math.atan2(ry, rx));
    }

    let rp = 0;
    let ra = Infinity;
    if (Number.isFinite(sma)) {
      if (ecc < 1.0) {
        rp = sma * (1.0 - ecc);
        ra = sma * (1.0 + ecc);
      } else {
        rp = sma * (1.0 - ecc); // positive for hyperbolic (sma < 0, 1-e < 0)
        ra = Infinity;
      }
    } else {
      // Parabolic fallback
      rp = (hz * hz) / (2.0 * mu);
    }

    return {
      sma,
      ecc,
      rp,
      ra,
      energy,
      hz,
      aopRad,
      taRad,
      rDotV,
      rMag,
      vMag
    };
  }

  // ===========================================================================
  // 5. EARTH & MOON EPHEMERIS + BARYCENTER (KeplersProblem + Barycenter.cpp)
  // ===========================================================================
  function createMoonEpochState(initialMoonAngleRad) {
    const a = GMAT_CONFIG.R_MOON_ORBIT;
    const e = GMAT_CONFIG.MOON_ECC;
    const mu = GMAT_CONFIG.MU_SYS;
    // Start at periapsis along initialMoonAngleRad
    const rp = a * (1.0 - e);
    const vp = Math.sqrt((mu / a) * ((1.0 + e) / (1.0 - e)));
    const cosA = Math.cos(initialMoonAngleRad);
    const sinA = Math.sin(initialMoonAngleRad);
    return {
      r0: [rp * cosA, rp * sinA],
      v0: [-vp * sinA, vp * cosA]
    };
  }

  let moonEpochData = createMoonEpochState(0.0);

  function setInitialMoonAngle(angleRad) {
    moonEpochData = createMoonEpochState(angleRad);
  }

  /**
   * Returns Moon state [rx, ry, vx, vy] relative to Earth (Geocentric) at simTime tSec.
   */
  function getMoonStateAtTime(tSec) {
    return keplersProblem2D(moonEpochData.r0, moonEpochData.v0, tSec, GMAT_CONFIG.MU_SYS);
  }

  /**
   * Returns Earth's heliocentric state around the Sun via GMAT's KeplersProblem2D
   * and Earth-Moon Barycenter (EMB) wobble in the cislunar frame.
   */
  const earthHelioR0 = (() => {
    const [a, e, , , aopDeg, taDeg] = GMAT_CONFIG.EARTH_HELIO_KEPLER;
    const nu = taDeg * GMAT_CONFIG.DEG_TO_RAD;
    const om = aopDeg * GMAT_CONFIG.DEG_TO_RAD;
    const p = a * (1.0 - e * e);
    const r = p / (1.0 + e * Math.cos(nu));
    const vr = Math.sqrt(GMAT_CONFIG.MU_SUN / p) * e * Math.sin(nu);
    const vt = Math.sqrt(GMAT_CONFIG.MU_SUN / p) * (1.0 + e * Math.cos(nu));
    const ang = om + nu;
    return {
      r0: [r * Math.cos(ang), r * Math.sin(ang)],
      v0: [
        vr * Math.cos(ang) - vt * Math.sin(ang),
        vr * Math.sin(ang) + vt * Math.cos(ang)
      ]
    };
  })();

  function getEarthHelioStateAtTime(tSec) {
    return keplersProblem2D(earthHelioR0.r0, earthHelioR0.v0, tSec, GMAT_CONFIG.MU_SUN);
  }

  /**
   * Computes Earth-Moon Barycenter offset of Earth & Moon so both visually orbit the EMB
   * in Map View while physics stays cleanly in Geocentric EarthMJ2000Eq coordinates.
   */
  function getBarycentricPositions(tSec) {
    const mGeo = getMoonStateAtTime(tSec);
    const mEarth = GMAT_CONFIG.MU_EARTH / GMAT_CONFIG.UNIVERSAL_G;
    const mMoon = GMAT_CONFIG.MU_MOON / GMAT_CONFIG.UNIVERSAL_G;
    const totalM = mEarth + mMoon;
    const wMoon = mMoon / totalM;
    const earthEmb = [-wMoon * mGeo[0], -wMoon * mGeo[1], -wMoon * mGeo[2], -wMoon * mGeo[3]];
    const moonEmb = [
      earthEmb[0] + mGeo[0],
      earthEmb[1] + mGeo[1],
      earthEmb[2] + mGeo[2],
      earthEmb[3] + mGeo[3]
    ];
    return { mGeo, earthEmb, moonEmb };
  }

  // ===========================================================================
  // 5b. LUNAR MASCONS (tidally locked: nearside always faces Earth)
  // ===========================================================================
  function getMasconPositions2D(mx, my) {
    const rm = Math.max(1.0, Math.hypot(mx, my));
    // Sub-Earth direction (Moon -> Earth)
    const ux = -mx / rm;
    const uy = -my / rm;
    const rBuried = GMAT_CONFIG.R_MOON - GMAT_CONFIG.MASCON_DEPTH_KM;
    return GMAT_CONFIG.MASCONS.map((mc) => {
      const a = mc.angDeg * GMAT_CONFIG.DEG_TO_RAD;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const dx = ux * ca - uy * sa;
      const dy = ux * sa + uy * ca;
      return { name: mc.name, mu: mc.muKm3s2, x: mx + rBuried * dx, y: my + rBuried * dy, dirX: dx, dirY: dy };
    });
  }

  function computeMasconAccel2D(rx, ry, mx, my) {
    let ax = 0;
    let ay = 0;
    const list = getMasconPositions2D(mx, my);
    for (const mc of list) {
      const dx = mc.x - rx;
      const dy = mc.y - ry;
      const d = Math.max(Math.hypot(dx, dy), 25.0); // singularity guard
      const k = mc.mu / (d * d * d);
      ax += dx * k;
      ay += dy * k;
    }
    return { ax, ay };
  }

  // ===========================================================================
  // 5c. BATTIN CANCELLATION-FREE 3RD-BODY (q-Fq) & LUNAR SURFACE RELIEF
  // ===========================================================================
  /**
   * Battin's cancellation-free 3rd-body acceleration (Curtis Eqn F.4 exact form):
   *   q = r·(r - 2*rk) / rk^2  =>  d^2 / rk^2 = 1 + q
   *   F(q) = q*(3 + 3q + q^2) / (1 + (1 + q)^1.5)
   *   p_3rd = -(muK / d^3) * (r + F(q)*rk)
   */
  function computeThirdBodyBattin(rx, ry, rkx, rky, muK) {
    const rk2 = rkx * rkx + rky * rky;
    const dx = rkx - rx;
    const dy = rky - ry;
    const d = Math.max(Math.hypot(dx, dy), 10.0);
    if (rk2 < 1e-6) return { ax: 0, ay: 0, dist: d, directMag: 0, indirectMag: 0 };

    const q = (rx * (rx - 2.0 * rkx) + ry * (ry - 2.0 * rky)) / rk2;
    const onePlusQ = Math.max(1e-9, 1.0 + q);
    const Fq = q * ((3.0 + 3.0 * q + q * q) / (1.0 + Math.pow(onePlusQ, 1.5)));
    const k = -muK / (d * d * d);
    return {
      ax: k * (rx + Fq * rkx),
      ay: k * (ry + Fq * rky),
      dist: d,
      directMag: muK / (d * d),
      indirectMag: muK / rk2
    };
  }

  /**
   * Procedural deterministic lunar topography relief [0 .. 10.7 km].
   * Keeps Shoemaker Crater South Pole landing zone flat around 0 km baseline so
   * Stage 4 corridor landings are crisp, while flank ridges present terrain hazards.
   */
  function getLunarSurfaceReliefKm(angleRad) {
    const deg = normalizeAngleRad(angleRad) * GMAT_CONFIG.RAD_TO_DEG;
    const distFromPole = Math.abs(normalizeAngleRad((deg - GMAT_CONFIG.SOUTH_POLE_CENTER_DEG) * GMAT_CONFIG.DEG_TO_RAD)) * GMAT_CONFIG.RAD_TO_DEG;
    if (distFromPole <= GMAT_CONFIG.SOUTH_POLE_HALF_WIDTH_DEG + 4.0) return 0.0;
    const raw =
      4.2 +
      2.8 * Math.sin(angleRad * 5.0 + 0.7) +
      2.1 * Math.cos(angleRad * 11.0 - 1.3) +
      1.6 * Math.sin(angleRad * 19.0 + 2.4);
    return clamp(raw, 0.0, GMAT_CONFIG.LUNAR_HIGHLAND_PEAK_KM);
  }

  // ===========================================================================
  // 6. GMAT FORCE MODEL: J2/J4 + Battin q-Fq (Moon & Sun) + Drag + SRP + Mascons
  // ===========================================================================
  /**
   * Computes spacecraft acceleration [ax, ay] in km/s^2 in Geocentric inertial frame.
   */
  function computeAcceleration2D(rx, ry, vx, vy, tSec, options = {}) {
    if (
      !Number.isFinite(rx) ||
      !Number.isFinite(ry) ||
      !Number.isFinite(vx) ||
      !Number.isFinite(vy)
    ) {
      return {
        ax: 0,
        ay: 0,
        rho: 0,
        dragAccel: 0,
        moonDirect: 0,
        moonIndirect: 0,
        dynPressPa: 0,
        heatFluxKwM2: 0,
        gLoad: 0,
        sunLit: 1
      };
    }

    const rE2 = rx * rx + ry * ry;
    const rE = Math.max(Math.sqrt(rE2), 10.0); // singularity guard
    const invRE3 = 1.0 / (rE * rE * rE);
    const usePerturbations =
      options.enablePerturbations !== undefined
        ? options.enablePerturbations
        : GMAT_CONFIG.ENABLE_PERTURBATIONS;
    const massKg = Math.max(50.0, options.massKg || 500.0);

    // 1. Earth Point Mass Gravity
    let ax = -GMAT_CONFIG.MU_EARTH * rx * invRE3;
    let ay = -GMAT_CONFIG.MU_EARTH * ry * invRE3;

    // 1b. Earth 2D Equatorial Zonal Harmonics J2 + J4 (Curtis Eqn 12.19/12.30)
    if (usePerturbations && rE < 150000.0) {
      const ratioE = GMAT_CONFIG.R_EARTH / rE;
      const r2 = ratioE * ratioE;
      const jTerm = 1.5 * GMAT_CONFIG.J2_EARTH * r2 - 1.875 * GMAT_CONFIG.J4_EARTH * r2 * r2;
      const kJ = -GMAT_CONFIG.MU_EARTH * invRE3 * jTerm;
      ax += kJ * rx;
      ay += kJ * ry;
    }

    // 2. Moon 3rd-Body Perturbation (Battin's q-Fq formulation or Direct-only)
    const moonSt = options.moonState || getMoonStateAtTime(tSec);
    const mx = moonSt[0];
    const my = moonSt[1];
    let dM = Math.max(Math.hypot(mx - rx, my - ry), 10.0);
    let moonDirect = 0;
    let moonIndirect = 0;

    if (options.includeIndirect !== false) {
      const mBattin = computeThirdBodyBattin(rx, ry, mx, my, GMAT_CONFIG.MU_MOON);
      ax += mBattin.ax;
      ay += mBattin.ay;
      dM = mBattin.dist;
      moonDirect = mBattin.directMag;
      moonIndirect = mBattin.indirectMag;
    } else {
      const invDM3 = GMAT_CONFIG.MU_MOON / (dM * dM * dM);
      ax += (mx - rx) * invDM3;
      ay += (my - ry) * invDM3;
      moonDirect = GMAT_CONFIG.MU_MOON / (dM * dM);
    }

    // 2b. Lunar Mascons (uneven lunar gravity) — meaningful inside Lunar vicinity
    if (GMAT_CONFIG.ENABLE_MASCONS && dM < 6000.0) {
      const masc = computeMasconAccel2D(rx, ry, mx, my);
      ax += masc.ax;
      ay += masc.ay;
    }

    // 2c. Solar 3rd-Body (Battin q-Fq) + Solar Radiation Pressure (SRP with Eclipse Shadow)
    let sunLit = 1;
    if (usePerturbations) {
      const eHelio = options.earthHelioState || getEarthHelioStateAtTime(tSec);
      const sunRx = -eHelio[0];
      const sunRy = -eHelio[1];
      const sBattin = computeThirdBodyBattin(rx, ry, sunRx, sunRy, GMAT_CONFIG.MU_SUN);
      ax += sBattin.ax;
      ay += sBattin.ay;

      const rSun = Math.max(1.0, Math.hypot(sunRx, sunRy));
      const uSunX = sunRx / rSun;
      const uSunY = sunRy / rSun;

      // Cylindrical Earth shadow umbra test
      const projE = rx * uSunX + ry * uSunY;
      if (projE < 0.0) {
        const perpE = Math.abs(rx * uSunY - ry * uSunX);
        if (perpE < GMAT_CONFIG.R_EARTH) sunLit = 0;
      }
      // Cylindrical Moon shadow umbra test
      if (sunLit > 0) {
        const rmX = rx - mx;
        const rmY = ry - my;
        const projM = rmX * uSunX + rmY * uSunY;
        if (projM < 0.0) {
          const perpM = Math.abs(rmX * uSunY - rmY * uSunX);
          if (perpM < GMAT_CONFIG.R_MOON) sunLit = 0;
        }
      }

      if (sunLit > 0) {
        const auScale = (GMAT_CONFIG.AU_KM / rSun) * (GMAT_CONFIG.AU_KM / rSun);
        const srpMagKmS2 =
          (GMAT_CONFIG.SRP_P_1AU * auScale * GMAT_CONFIG.CR_DEFAULT * GMAT_CONFIG.SRP_AREA_M2) /
          (massKg * 1000.0);
        ax -= srpMagKmS2 * uSunX;
        ay -= srpMagKmS2 * uSunY;
      }
    }

    // 3. Vallado Exponential Atmosphere Drag + Aerothermal Telemetry
    let rho = 0.0;
    let dragAccel = 0.0;
    let dynPressPa = 0.0;
    let heatFluxKwM2 = 0.0;
    const altKm = rE - GMAT_CONFIG.R_EARTH;
    if (options.enableDrag !== false && altKm > 0.0 && altKm <= GMAT_CONFIG.H_ATMOS_DRAG_MAX) {
      rho = getAtmosphericDensity(altKm);
      if (rho > 0.0) {
        const cdArea = options.cdArea || 4.8; // Cd=2.2 * A=2.18 m^2
        const vAtmX = -GMAT_CONFIG.OMEGA_EARTH * ry;
        const vAtmY = GMAT_CONFIG.OMEGA_EARTH * rx;
        const vRelX = vx - vAtmX;
        const vRelY = vy - vAtmY;
        const vRel = Math.hypot(vRelX, vRelY);
        if (vRel > 1e-6) {
          const factor = -0.5 * (cdArea / massKg) * rho * 1000.0 * vRel;
          const dax = factor * vRelX;
          const day = factor * vRelY;
          ax += dax;
          ay += day;
          dragAccel = Math.hypot(dax, day);
          const vMs = vRel * 1000.0;
          dynPressPa = 0.5 * rho * vMs * vMs;
          heatFluxKwM2 = 1.83e-4 * Math.sqrt(rho / 0.7) * (vMs * vMs * vMs) * 1e-3;
        }
      }
    }

    // 4. Thrust Acceleration (km/s^2)
    const tax = options.thrustAx || 0.0;
    const tay = options.thrustAy || 0.0;
    ax += tax;
    ay += tay;

    // Deceleration / thrust G-load (non-gravitational acceleration / g0)
    const nonGravKmS2 = dragAccel + Math.hypot(tax, tay);
    const gLoad = (nonGravKmS2 * 1000.0) / GMAT_CONFIG.G0_MS2;

    return {
      ax: Number.isFinite(ax) ? ax : 0,
      ay: Number.isFinite(ay) ? ay : 0,
      rho,
      dragAccel,
      moonDirect,
      moonIndirect,
      dynPressPa,
      heatFluxKwM2,
      gLoad,
      sunLit
    };
  }

  // ===========================================================================
  // 7. RK4 INTEGRATOR WITH CRASH DETECTION, TOPOGRAPHY & NaN PROTECTION
  // ===========================================================================
  /**
   * Advances state { rx, ry, vx, vy } by dtSec using 4th-order Runge-Kutta.
   * Detects Earth or Lunar terrain impact cleanly without NaN or division-by-zero.
   */
  function rk4Step2D(state, tSec, dtSec, options = {}) {
    if (!safeStateValid(state) || !Number.isFinite(dtSec) || dtSec === 0) {
      return { rx: state.rx || 0, ry: state.ry || 0, vx: state.vx || 0, vy: state.vy || 0, impact: null };
    }

    const { rx, ry, vx, vy } = state;
    const h = dtSec;
    const m0 = getMoonStateAtTime(tSec);
    const mMid = getMoonStateAtTime(tSec + 0.5 * h);
    const mEnd = getMoonStateAtTime(tSec + h);
    const usePerturb =
      options.enablePerturbations !== undefined
        ? options.enablePerturbations
        : GMAT_CONFIG.ENABLE_PERTURBATIONS;
    const eh0 = usePerturb ? getEarthHelioStateAtTime(tSec) : null;
    const ehMid = usePerturb ? getEarthHelioStateAtTime(tSec + 0.5 * h) : null;
    const ehEnd = usePerturb ? getEarthHelioStateAtTime(tSec + h) : null;

    const a1 = computeAcceleration2D(rx, ry, vx, vy, tSec, { ...options, moonState: m0, earthHelioState: eh0 });
    const k1 = [vx, vy, a1.ax, a1.ay];

    const s2x = rx + 0.5 * h * k1[0];
    const s2y = ry + 0.5 * h * k1[1];
    const s2vx = vx + 0.5 * h * k1[2];
    const s2vy = vy + 0.5 * h * k1[3];
    const a2 = computeAcceleration2D(s2x, s2y, s2vx, s2vy, tSec + 0.5 * h, { ...options, moonState: mMid, earthHelioState: ehMid });
    const k2 = [s2vx, s2vy, a2.ax, a2.ay];

    const s3x = rx + 0.5 * h * k2[0];
    const s3y = ry + 0.5 * h * k2[1];
    const s3vx = vx + 0.5 * h * k2[2];
    const s3vy = vy + 0.5 * h * k2[3];
    const a3 = computeAcceleration2D(s3x, s3y, s3vx, s3vy, tSec + 0.5 * h, { ...options, moonState: mMid, earthHelioState: ehMid });
    const k3 = [s3vx, s3vy, a3.ax, a3.ay];

    const s4x = rx + h * k3[0];
    const s4y = ry + h * k3[1];
    const s4vx = vx + h * k3[2];
    const s4vy = vy + h * k3[3];
    const a4 = computeAcceleration2D(s4x, s4y, s4vx, s4vy, tSec + h, { ...options, moonState: mEnd, earthHelioState: ehEnd });
    const k4 = [s4vx, s4vy, a4.ax, a4.ay];

    let nrx = rx + (h / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]);
    let nry = ry + (h / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]);
    let nvx = vx + (h / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]);
    let nvy = vy + (h / 6.0) * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3]);

    if (!Number.isFinite(nrx) || !Number.isFinite(nry) || !Number.isFinite(nvx) || !Number.isFinite(nvy)) {
      return { rx, ry, vx, vy, impact: null };
    }

    // Impact / Crash checks (with procedural Lunar highland topography)
    let impact = null;
    const distEarth = Math.hypot(nrx, nry);
    const dxM = nrx - mEnd[0];
    const dyM = nry - mEnd[1];
    const distMoon = Math.hypot(dxM, dyM);
    const moonAng = Math.atan2(dyM, dxM);
    const lunarTerrainRad = GMAT_CONFIG.R_MOON + (options.useLunarTopography ? getLunarSurfaceReliefKm(moonAng) : 0.0);

    if (distEarth < GMAT_CONFIG.R_EARTH - 0.05 && !options.ignoreEarthCollision) {
      const ang = Math.atan2(nry, nrx);
      nrx = GMAT_CONFIG.R_EARTH * Math.cos(ang);
      nry = GMAT_CONFIG.R_EARTH * Math.sin(ang);
      impact = {
        body: "Earth",
        speedKms: Math.hypot(nvx, nvy),
        angleDeg: ang * GMAT_CONFIG.RAD_TO_DEG,
        moonState: mEnd
      };
    } else if (distMoon <= lunarTerrainRad) {
      const angDeg = moonAng * GMAT_CONFIG.RAD_TO_DEG;
      nrx = mEnd[0] + lunarTerrainRad * Math.cos(moonAng);
      nry = mEnd[1] + lunarTerrainRad * Math.sin(moonAng);
      const relVx = nvx - mEnd[2];
      const relVy = nvy - mEnd[3];
      const isSouthPole =
        Math.abs(normalizeAngleRad(moonAng - GMAT_CONFIG.SOUTH_POLE_CENTER_DEG * GMAT_CONFIG.DEG_TO_RAD)) <=
        GMAT_CONFIG.SOUTH_POLE_HALF_WIDTH_DEG * GMAT_CONFIG.DEG_TO_RAD;
      impact = {
        body: "Moon",
        speedKms: Math.hypot(relVx, relVy),
        angleDeg: angDeg,
        isSouthPole,
        moonState: mEnd
      };
    }

    return {
      rx: nrx,
      ry: nry,
      vx: nvx,
      vy: nvy,
      rho: a4.rho,
      dragAccel: a4.dragAccel,
      dynPressPa: a4.dynPressPa,
      heatFluxKwM2: a4.heatFluxKwM2,
      gLoad: a4.gLoad,
      sunLit: a4.sunLit,
      impact
    };
  }

  // ===========================================================================
  // 8. LIVE TRAJECTORY PREDICTOR (1-LOOP SWEPT-ANGLE CLIPPING + SYNODIC FREE-RETURN)
  // ===========================================================================
  /**
   * Integrates forward from current spacecraft state using adaptive RK4 steps.
   * Prevents multi-lap overlapping trajectory wraps via swept central-angle tracking,
   * supports 1:1 384,400 km horizons and extended Synodic Figure-8 free-return arcs,
   * and computes Lunar B-Plane encounter metrics.
   */
  function computeLivePredictor(scState, tStartSec, options = {}) {
    if (!safeStateValid(scState)) {
      return {
        points: [],
        predPerilune: null,
        predImpact: null,
        predApogeeKm: 0,
        predPerigeeKm: 0,
        enteredLunarSOI: false
      };
    }

    const mode = options.mode || "cislunar"; // "parking" | "cislunar" | "lunarOrbit" | "impact"
    const synodicExt = Boolean(options.synodicExtended);
    const defaultCislunarHorizon = synodicExt
      ? Math.max(260000.0, GMAT_CONFIG.T_MOON_ORBIT * 0.38)
      : Math.max(140000.0, GMAT_CONFIG.T_MOON_ORBIT * 0.21);
    let maxHorizonSec = options.horizonSec || defaultCislunarHorizon;
    if (mode === "parking") maxHorizonSec = 7200.0;
    else if (mode === "lunarOrbit") maxHorizonSec = 18000.0;
    else if (mode === "impact") maxHorizonSec = 14000.0;

    let t = 0.0;
    let cur = { rx: scState.rx, ry: scState.ry, vx: scState.vx, vy: scState.vy };
    const points = [{ rx: cur.rx, ry: cur.ry, vx: cur.vx, vy: cur.vy, tAbs: tStartSec }];

    let minMoonDist = Infinity;
    let minMoonTimeSec = 0;
    let minMoonPos = null;
    let minMoonVel = null;
    let moonAtPerilune = null;

    let maxEarthDist = Math.hypot(cur.rx, cur.ry);
    let minEarthDist = maxEarthDist;
    let apogeePt = { rx: cur.rx, ry: cur.ry, altKm: maxEarthDist - GMAT_CONFIG.R_EARTH, body: "Earth" };
    let perigeePt = { rx: cur.rx, ry: cur.ry, altKm: minEarthDist - GMAT_CONFIG.R_EARTH, body: "Earth" };
    let maxMoonDist = 0;
    let apolunePt = null;
    let predImpact = null;
    let enteredLunarSOI = false;
    let lastSampleT = 0;
    const useDrag = options.enableDrag !== false;
    const useTopo = Boolean(options.useLunarTopography);
    const massKg = options.massKg || 500.0;

    const maxIters = options.maxIters || 1350;
    let prevMoonRDotV = 0;
    let hasStartedMoonApproach = false;
    let soiExitCount = 0;

    // Track swept central angle to terminate bound orbits cleanly after 1 single loop (<= 2π)
    const mInit = getMoonStateAtTime(tStartSec);
    const initMoonD = Math.hypot(cur.rx - mInit[0], cur.ry - mInit[1]);
    const trackMoonAngle = mode === "lunarOrbit" || mode === "impact" || initMoonD < GMAT_CONFIG.MOON_SOI;
    let prevSweepAng = trackMoonAngle
      ? Math.atan2(cur.ry - mInit[1], cur.rx - mInit[0])
      : Math.atan2(cur.ry, cur.rx);
    let sweptRad = 0.0;
    let flybyCompleted = false;

    for (let i = 0; i < maxIters && t < maxHorizonSec; i++) {
      const mNow = getMoonStateAtTime(tStartSec + t);
      const dE = Math.hypot(cur.rx, cur.ry);
      const dM = Math.hypot(cur.rx - mNow[0], cur.ry - mNow[1]);
      const minD = Math.min(dE, dM);

      // Adaptive step size covering 1:1 384,400 km cislunar scales cleanly without CPU lag
      let h =
        mode === "parking"
          ? Math.min(20.0, Math.max(4.0, 0.003 * dE))
          : mode === "lunarOrbit" || mode === "impact"
          ? Math.min(45.0, Math.max(4.0, 0.012 * dM))
          : Math.min(options.maxStepSec || 1200.0, Math.max(5.0, 0.020 * minD));
      if (dE < 18000.0) {
        h = Math.min(h, Math.max(4.0, 0.003 * dE));
      }
      if (dM < GMAT_CONFIG.MOON_SOI) {
        enteredLunarSOI = true;
        h = Math.min(h, Math.max(3.5, 0.012 * dM));
      }
      const altE = dE - GMAT_CONFIG.R_EARTH;
      if (useDrag && altE < GMAT_CONFIG.H_ATMOS_DRAG_MAX + 20.0) {
        h = Math.min(h, altE < 110.0 ? 1.5 : 4.0);
      }
      if (t + h > maxHorizonSec) h = maxHorizonSec - t;

      // Earth atmospheric reentry interface (sub-85 km descending terminates cleanly)
      const rDotVE = cur.rx * cur.vx + cur.ry * cur.vy;
      if (t > 0 && altE < 85.0 && rDotVE < 0 && mode !== "ascent") {
        predImpact = {
          body: "Earth",
          reentry: true,
          speedKms: Math.hypot(cur.vx, cur.vy),
          angleDeg: Math.atan2(cur.ry, cur.rx) * GMAT_CONFIG.RAD_TO_DEG,
          timeFromNowSec: t,
          rx: cur.rx,
          ry: cur.ry
        };
        points.push({ rx: cur.rx, ry: cur.ry, vx: cur.vx, vy: cur.vy, tAbs: tStartSec + t });
        break;
      }

      const next = rk4Step2D(cur, tStartSec + t, h, {
        enableDrag: useDrag,
        massKg,
        cdArea: options.cdArea,
        ignoreEarthCollision: false,
        useLunarTopography: useTopo
      });
      t += h;
      cur = next;

      const tAbs = tStartSec + t;
      const mEnd = getMoonStateAtTime(tAbs);
      const dEarthNext = Math.hypot(cur.rx, cur.ry);
      const dMoonNext = Math.hypot(cur.rx - mEnd[0], cur.ry - mEnd[1]);

      const nextSweepAng = trackMoonAngle
        ? Math.atan2(cur.ry - mEnd[1], cur.rx - mEnd[0])
        : Math.atan2(cur.ry, cur.rx);
      sweptRad += Math.abs(normalizeAngleRad(nextSweepAng - prevSweepAng));
      prevSweepAng = nextSweepAng;

      if (dEarthNext > maxEarthDist) {
        maxEarthDist = dEarthNext;
        apogeePt = { rx: cur.rx, ry: cur.ry, altKm: dEarthNext - GMAT_CONFIG.R_EARTH, body: "Earth", tAbs };
      }
      if (dEarthNext < minEarthDist) {
        minEarthDist = dEarthNext;
        perigeePt = { rx: cur.rx, ry: cur.ry, altKm: dEarthNext - GMAT_CONFIG.R_EARTH, body: "Earth", tAbs };
      }
      if (dMoonNext < GMAT_CONFIG.MOON_SOI && dMoonNext > maxMoonDist) {
        maxMoonDist = dMoonNext;
        apolunePt = { rx: cur.rx, ry: cur.ry, altKm: dMoonNext - GMAT_CONFIG.R_MOON, body: "Moon", tAbs };
      }

      if (dMoonNext < minMoonDist) {
        minMoonDist = dMoonNext;
        minMoonTimeSec = t;
        minMoonPos = [cur.rx, cur.ry];
        minMoonVel = [cur.vx, cur.vy];
        moonAtPerilune = mEnd;
      }

      const relRx = cur.rx - mEnd[0];
      const relRy = cur.ry - mEnd[1];
      const relVx = cur.vx - mEnd[2];
      const relVy = cur.vy - mEnd[3];
      const moonRDotV = relRx * relVx + relRy * relVy;
      if (moonRDotV < 0) hasStartedMoonApproach = true;

      let sampleStep = mode === "cislunar" ? (synodicExt ? 900.0 : 650.0) : mode === "parking" ? 18.0 : 40.0;
      if (dEarthNext < 18000.0 || dMoonNext < 18000.0) {
        sampleStep = 18.0;
      } else if (dEarthNext < 55000.0 || dMoonNext < 55000.0) {
        sampleStep = 95.0;
      }
      if (t - lastSampleT >= sampleStep || next.impact || i === maxIters - 1) {
        points.push({ rx: cur.rx, ry: cur.ry, vx: cur.vx, vy: cur.vy, tAbs });
        lastSampleT = t;
      }

      if (next.impact) {
        predImpact = { ...next.impact, timeFromNowSec: t, rx: cur.rx, ry: cur.ry };
        break;
      }

      // Single-loop termination for bound parking / lunar orbits (eliminates multi-wrap rings)
      if ((mode === "parking" || mode === "lunarOrbit") && sweptRad >= 2.0 * Math.PI - 0.03) {
        if (points[points.length - 1].tAbs !== tAbs) {
          points.push({ rx: cur.rx, ry: cur.ry, vx: cur.vx, vy: cur.vy, tAbs });
        }
        break;
      }
      // In cislunar mode, if still in an Earth-bound LEO/MEO far below Moon orbit, terminate after 1 orbit
      if (mode === "cislunar" && !enteredLunarSOI && !flybyCompleted && sweptRad >= 2.0 * Math.PI && maxEarthDist < GMAT_CONFIG.R_MOON_ORBIT * 0.45) {
        break;
      }

      if (mode === "cislunar" && hasStartedMoonApproach && prevMoonRDotV < 0 && moonRDotV >= 0 && minMoonDist < GMAT_CONFIG.MOON_SOI) {
        flybyCompleted = true;
      }
      if (mode === "cislunar" && flybyCompleted) {
        if (!synodicExt && t - minMoonTimeSec > 18000.0) break;
        if (synodicExt && dMoonNext > GMAT_CONFIG.MOON_SOI) {
          soiExitCount++;
          if (soiExitCount > 2 && sweptRad >= 2.0 * Math.PI * 0.92 && rDotVE >= 0 && dEarthNext < 30000.0) break;
          if (dEarthNext > GMAT_CONFIG.R_MOON_ORBIT * 1.8) break;
        }
      }
      prevMoonRDotV = moonRDotV;
    }

    let predPerilune = null;
    if (Number.isFinite(minMoonDist) && minMoonPos && minMoonVel && moonAtPerilune) {
      const rvx = minMoonVel[0] - moonAtPerilune[2];
      const rvy = minMoonVel[1] - moonAtPerilune[3];
      const vPeri = Math.hypot(rvx, rvy);
      const specE = 0.5 * vPeri * vPeri - GMAT_CONFIG.MU_MOON / Math.max(10.0, minMoonDist);
      const vInfKms = specE > 0 ? Math.sqrt(2.0 * specE) : 0.0;
      const aimingRadiusKm =
        vInfKms > 1e-4
          ? minMoonDist * Math.sqrt(1.0 + (2.0 * GMAT_CONFIG.MU_MOON) / (minMoonDist * vInfKms * vInfKms))
          : minMoonDist;
      const eccHyp = 1.0 + (minMoonDist * vInfKms * vInfKms) / GMAT_CONFIG.MU_MOON;
      const turnAngleDeg = 2.0 * Math.asin(clamp(1.0 / Math.max(1.0001, eccHyp), -1.0, 1.0)) * GMAT_CONFIG.RAD_TO_DEG;
      const vCircTarget = Math.sqrt(GMAT_CONFIG.MU_MOON / (GMAT_CONFIG.R_MOON + GMAT_CONFIG.TARGET_PERILUNE_ALT_KM));
      const reqLoiDvKms = Math.max(0.0, vPeri - vCircTarget);
      predPerilune = {
        distKm: minMoonDist,
        altKm: minMoonDist - GMAT_CONFIG.R_MOON,
        timeFromNowSec: minMoonTimeSec,
        pos: minMoonPos,
        vel: minMoonVel,
        moonAtPerilune,
        vPeriKms: vPeri,
        vInfKms,
        aimingRadiusKm,
        turnAngleDeg,
        reqLoiDvKms
      };
    }

    return {
      points,
      predPerilune,
      predImpact,
      predApogeeKm: maxEarthDist,
      predPerigeeKm: minEarthDist,
      apogeePt,
      perigeePt,
      apolunePt,
      enteredLunarSOI
    };
  }

  // ===========================================================================
  // 9. GOLDEN TRAJECTORY PRE-CALCULATOR (PHASE LEAD ANGLE & DASHED CYAN LINE)
  // ===========================================================================
  /**
   * Computes optimal Phase Lead Angle and integrates a reference TLI trajectory
   * from the 185 km Earth parking orbit to a ~100 km Lunar Periselene using rk4Step2D.
   */
  function precalculateGoldenTrajectory() {
    // Save current moon epoch and run shooting solver with Moon starting at angle 0 at TLI epoch
    const savedEpoch = moonEpochData;
    setInitialMoonAngle(0.0);

    const rPark = GMAT_CONFIG.R_PARKING;
    const rTarget = GMAT_CONFIG.R_MOON_ORBIT;
    const aTrans = 0.5 * (rPark + rTarget);
    const vHohmann = Math.sqrt(GMAT_CONFIG.MU_EARTH * (2.0 / rPark - 1.0 / aTrans));
    const tHalf = Math.PI * Math.sqrt(Math.pow(aTrans, 3) / GMAT_CONFIG.MU_EARTH);
    const moonTravelRad = (GMAT_CONFIG.V_MOON_CIRC / rTarget) * tHalf;
    const dynamicHorizon = Math.max(125000.0, tHalf * 1.45);
    const isRealScale = rTarget > 200000.0;

    // Target a prograde capture pass on the leading/nearside corridor of the Moon
    let bestThetaDep = moonTravelRad - Math.PI;
    let bestSpeed = vHohmann;
    let bestErr = Infinity;
    let bestResult = null;

    const evalCandidate = (thetaDep, vTli, finePass = false) => {
      const c = Math.cos(thetaDep);
      const s = Math.sin(thetaDep);
      const initState = {
        rx: rPark * c,
        ry: rPark * s,
        vx: -vTli * s,
        vy: vTli * c
      };
      const sim = computeLivePredictor(initState, 0.0, {
        mode: "cislunar",
        horizonSec: dynamicHorizon,
        maxIters: finePass ? 1550 : 850,
        maxStepSec: finePass ? 850.0 : 1600.0
      });
      if (!sim.predPerilune) return { err: 1e9, sim };
      // Target +100 km altitude on leading/nearside pass
      const altErr = Math.abs(sim.predPerilune.altKm - GMAT_CONFIG.TARGET_PERILUNE_ALT_KM);
      const impactPenalty = sim.predImpact ? 5000.0 : 0.0;
      return { err: altErr + impactPenalty, sim, altKm: sim.predPerilune.altKm };
    };

    // Coarse grid search over Phase Lead Angle and TLI injection speed
    const dDegMin = isRealScale ? -24.0 : -14.0;
    const dDegMax = isRealScale ? 12.0 : 14.0;
    const dvMin = isRealScale ? -0.010 : -0.08;
    const dvMax = isRealScale ? 0.045 : 0.12;
    const dvStep = isRealScale ? 0.0045 : 0.02;

    for (let dDeg = dDegMin; dDeg <= dDegMax; dDeg += 2.0) {
      const th = moonTravelRad - Math.PI + dDeg * GMAT_CONFIG.DEG_TO_RAD;
      for (let dv = dvMin; dv <= dvMax; dv += dvStep) {
        const v = vHohmann + dv;
        const res = evalCandidate(th, v, false);
        if (res.err < bestErr) {
          bestErr = res.err;
          bestThetaDep = th;
          bestSpeed = v;
          bestResult = res.sim;
        }
      }
    }

    // Re-evaluate best coarse candidate at full fine resolution
    bestResult = evalCandidate(bestThetaDep, bestSpeed, true).sim;
    bestErr = bestResult && bestResult.predPerilune
      ? Math.abs(bestResult.predPerilune.altKm - GMAT_CONFIG.TARGET_PERILUNE_ALT_KM) + (bestResult.predImpact ? 5000.0 : 0.0)
      : bestErr;

    // Fine refinement
    let stepTh = (isRealScale ? 1.2 : 0.6) * GMAT_CONFIG.DEG_TO_RAD;
    let stepV = isRealScale ? 0.0025 : 0.008;
    const numPasses = isRealScale ? 5 : 4;
    for (let pass = 0; pass < numPasses; pass++) {
      let improved = false;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const th = bestThetaDep + i * stepTh;
          const v = bestSpeed + j * stepV;
          const res = evalCandidate(th, v, true);
          if (res.err < bestErr) {
            bestErr = res.err;
            bestThetaDep = th;
            bestSpeed = v;
            bestResult = res.sim;
            improved = true;
          }
        }
      }
      stepTh *= 0.4;
      stepV *= 0.4;
      if (!improved && bestErr < 4.0) break;
    }

    // Restore original moon epoch
    moonEpochData = savedEpoch;

    // Phase Lead Angle = (Moon angle at TLI) - (Spacecraft TLI departure angle)
    const phaseLeadRad = normalizeAnglePosRad(0.0 - bestThetaDep);
    const phaseLeadDeg = phaseLeadRad * GMAT_CONFIG.RAD_TO_DEG;

    return {
      phaseLeadRad,
      phaseLeadDeg,
      tliSpeedKms: bestSpeed,
      tliDeltaVKms: bestSpeed - GMAT_CONFIG.V_PARKING,
      nominalTransferTimeSec: bestResult && bestResult.predPerilune ? bestResult.predPerilune.timeFromNowSec : tHalf,
      periluneAltKm: bestResult && bestResult.predPerilune ? bestResult.predPerilune.altKm : 100.0,
      // Canonical trajectory points generated with Moon@0 at t=0, TLI departure at -phaseLeadRad
      canonicalPoints: bestResult ? bestResult.points : [],
      canonicalPerilune: bestResult ? bestResult.predPerilune : null
    };
  }

  /**
   * Rotates canonical Golden Trajectory points to align with the Moon's current angle
   * at a given reference TLI epoch.
   */
  function getGoldenTrajectoryAtMoonAngle(moonAngleRad, goldenRef) {
    if (!goldenRef || !goldenRef.canonicalPoints) return [];
    const c = Math.cos(moonAngleRad);
    const s = Math.sin(moonAngleRad);
    return goldenRef.canonicalPoints.map((pt) => ({
      rx: pt.rx * c - pt.ry * s,
      ry: pt.rx * s + pt.ry * c
    }));
  }

  // ===========================================================================
  // 10. AUTO-FIDO MID-COURSE CORRECTION & STAGE GUIDANCE SOLVER
  // ===========================================================================
  /**
   * Computes finite-difference FIDO Mid-Course Correction (MCC) vector in Stage 2
   * so the player gets a concrete Correction Node, Target Angle, and Delta-V.
   */
  function computeFIDOMidCourseCorrection(scState, tSec, options) {
    const isRealScale = GMAT_CONFIG.R_MOON_ORBIT > 200000.0;
    const fastScan = Boolean(options && options.fastScan);
    const skipExpectedPred = Boolean(options && options.skipExpectedPred);
    const solverMaxIters = fastScan
      ? isRealScale ? 720 : 520
      : isRealScale ? 800 : 650;
    const basePred = computeLivePredictor(scState, tSec, {
      mode: "cislunar",
      maxIters: solverMaxIters,
      maxStepSec: fastScan
        ? isRealScale ? 2200.0 : 1200.0
        : isRealScale ? 1200.0 : 900.0
    });
    const targetDist = GMAT_CONFIG.R_MOON + GMAT_CONFIG.TARGET_PERILUNE_ALT_KM;
    const optMin = GMAT_CONFIG.OPTIMAL_CORRIDOR_MIN_KM || GMAT_CONFIG.CORRIDOR_MIN_ALT_KM;
    const optMax = GMAT_CONFIG.OPTIMAL_CORRIDOR_MAX_KM || GMAT_CONFIG.CORRIDOR_MAX_ALT_KM;

    // If currently in optimal corridor without collision, no major MCC needed
    if (
      basePred.predPerilune &&
      !basePred.predImpact &&
      basePred.predPerilune.altKm >= optMin &&
      basePred.predPerilune.altKm <= optMax
    ) {
      const optPred =
        options && options.synodicExtended
          ? computeLivePredictor(scState, tSec, {
              mode: "cislunar",
              synodicExtended: true,
              enableDrag: false,
              useLunarTopography: true,
              massKg: (options && options.massKg) || 500.0
            })
          : basePred;
      return {
        needed: false,
        targetHeadingRad: Math.atan2(scState.vy, scState.vx),
        deltaVKms: 0.0,
        predPeriluneAltKm: basePred.predPerilune.altKm,
        correctionNodePos: null,
        expectedPoints: optPred.points,
        expectedPerilune: optPred.predPerilune
      };
    }

    // Anchor the correction node to a stable target time along the transfer orbit (DEF-205)
    // Scaling leadBack with R_MOON_ORBIT keeps sub-lunar test states pinned while placing
    // cislunar MCC nodes in mid-transfer coast (~1.5 days before perilune on 1:1 scale).
    const timeToPeri = basePred.predPerilune ? basePred.predPerilune.timeFromNowSec : 40000;
    const leadBack = isRealScale ? 220000.0 : 28000.0;
    const periAbsSec = tSec + timeToPeri;
    const stablePlannedEpoch = Math.max(tSec, periAbsSec - leadBack);
    const targetT = options && Number.isFinite(options.targetTimeSec)
      ? options.targetTimeSec
      : stablePlannedEpoch;

    let nodeState = { rx: scState.rx, ry: scState.ry, vx: scState.vx, vy: scState.vy };
    if (targetT > tSec + 1e-3 && basePred.points.length > 2) {
      for (const p of basePred.points) {
        if (p.tAbs >= targetT) {
          nodeState = { rx: p.rx, ry: p.ry, vx: p.vx, vy: p.vy };
          break;
        }
      }
    }

    const evalMaxIters = isRealScale ? 620 : 400;
    const evalMaxStep = isRealScale ? 1400.0 : 1000.0;

    // GMAT Differential Corrector (Finite-Difference Sensitivity + Damped Newton Step)
    const evalPerturb = (dvx, dvy) => {
      const test = {
        rx: scState.rx,
        ry: scState.ry,
        vx: scState.vx + dvx,
        vy: scState.vy + dvy
      };
      const pr = computeLivePredictor(test, tSec, {
        mode: "cislunar",
        maxIters: evalMaxIters,
        maxStepSec: evalMaxStep
      });
      if (!pr.predPerilune) return { score: 1e9, signedMiss: 1e9 };
      const signedMiss = pr.predPerilune.distKm - targetDist;
      const impactPen = pr.predImpact ? 4000.0 : 0.0;
      const dvPen = Math.hypot(dvx, dvy) * 120.0;
      return { score: Math.abs(signedMiss) + impactPen + dvPen, signedMiss };
    };

    let bestDvx = 0.0;
    let bestDvy = 0.0;
    let bestEval = evalPerturb(0.0, 0.0);
    let bestScore = bestEval.score;
    if (
      options &&
      Array.isArray(options.seedDv) &&
      Number.isFinite(options.seedDv[0]) &&
      Number.isFinite(options.seedDv[1])
    ) {
      const sx = options.seedDv[0];
      const sy = options.seedDv[1];
      const sEval = evalPerturb(sx, sy);
      if (sEval.score < bestScore) {
        bestScore = sEval.score;
        bestDvx = sx;
        bestDvy = sy;
      }
    }

    // Seed direction if baseline misses or impacts
    const vMag = Math.max(0.1, Math.hypot(scState.vx, scState.vy));
    const vHatX = scState.vx / vMag;
    const vHatY = scState.vy / vMag;
    const nHatX = -vHatY;
    const nHatY = vHatX;

    if (bestScore > 2500.0) {
      const mags = fastScan
        ? isRealScale ? [0.025, 0.09, 0.22] : [0.05, 0.15]
        : isRealScale ? [0.015, 0.05, 0.14, 0.28] : [0.05, 0.15];
      const nAngles = 12;
      for (const dvProbe of mags) {
        for (let ang = 0; ang < nAngles; ang++) {
          const theta = (ang / nAngles) * 2.0 * Math.PI;
          const dvx = dvProbe * (Math.cos(theta) * vHatX + Math.sin(theta) * nHatX);
          const dvy = dvProbe * (Math.cos(theta) * vHatY + Math.sin(theta) * nHatY);
          const ev = evalPerturb(dvx, dvy);
          if (ev.score < bestScore) {
            bestScore = ev.score;
            bestDvx = dvx;
            bestDvy = dvy;
          }
        }
      }
    }

    // Damped differential-corrector iterations (finite-difference gradient in 2D velocity)
    const eps = isRealScale ? 0.0015 : 0.004;
    const maxRefineIters = fastScan ? 4 : 5;
    for (let iter = 0; iter < maxRefineIters; iter++) {
      const f0 = evalPerturb(bestDvx, bestDvy).score;
      const fx = evalPerturb(bestDvx + eps, bestDvy).score;
      const fy = evalPerturb(bestDvx, bestDvy + eps).score;
      const gx = (fx - f0) / eps;
      const gy = (fy - f0) / eps;
      const gNorm = Math.hypot(gx, gy);
      if (gNorm < 1e-4) break;

      const stepSize = Math.min(isRealScale ? 0.06 : 0.12, Math.max(0.002, f0 / (gNorm * 2.5)));
      const candDvx = clamp(bestDvx - (gx / gNorm) * stepSize, -0.75, 0.75);
      const candDvy = clamp(bestDvy - (gy / gNorm) * stepSize, -0.75, 0.75);
      const candEval = evalPerturb(candDvx, candDvy);
      if (candEval.score < bestScore) {
        bestScore = candEval.score;
        bestDvx = candDvx;
        bestDvy = candDvy;
      } else {
        const halfDvx = 0.5 * (bestDvx + candDvx);
        const halfDvy = 0.5 * (bestDvy + candDvy);
        const halfEval = evalPerturb(halfDvx, halfDvy);
        if (halfEval.score < bestScore) {
          bestScore = halfEval.score;
          bestDvx = halfDvx;
          bestDvy = halfDvy;
        } else {
          break;
        }
      }
      if (bestScore < 30.0) break;
    }

    const dvMag = Math.hypot(bestDvx, bestDvy);
    const targetHeadingRad =
      dvMag > 1e-5 ? Math.atan2(bestDvy, bestDvx) : Math.atan2(scState.vy, scState.vx);

    const postBurnState = {
      rx: scState.rx,
      ry: scState.ry,
      vx: scState.vx + bestDvx,
      vy: scState.vy + bestDvy
    };
    const expectedPred = skipExpectedPred
      ? null
      : computeLivePredictor(postBurnState, tSec, {
          mode: "cislunar",
          enableDrag: false,
          useLunarTopography: true,
          synodicExtended: Boolean(options && options.synodicExtended),
          massKg: (options && options.massKg) || 500.0
        });

    return {
      needed: true,
      targetHeadingRad,
      deltaVKms: dvMag,
      dvVec: [bestDvx, bestDvy],
      predPeriluneAltKm: basePred.predPerilune ? basePred.predPerilune.altKm : Infinity,
      correctionNodePos: [nodeState.rx, nodeState.ry],
      projectedScore: bestScore,
      expectedPoints: expectedPred ? expectedPred.points : [],
      expectedPerilune: expectedPred ? expectedPred.predPerilune : null
    };
  }

  function samplePredictorStateAtTime(pts, tTarget) {
    if (!pts || pts.length === 0) return null;
    if (tTarget <= pts[0].tAbs || pts.length === 1) {
      return { rx: pts[0].rx, ry: pts[0].ry, vx: pts[0].vx, vy: pts[0].vy, tAbs: pts[0].tAbs };
    }
    const last = pts[pts.length - 1];
    if (tTarget >= last.tAbs) {
      return { rx: last.rx, ry: last.ry, vx: last.vx, vy: last.vy, tAbs: last.tAbs };
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (tTarget >= a.tAbs && tTarget <= b.tAbs) {
        const dt = b.tAbs - a.tAbs;
        const u = dt > 1e-6 ? clamp((tTarget - a.tAbs) / dt, 0, 1) : 0;
        return {
          rx: a.rx + (b.rx - a.rx) * u,
          ry: a.ry + (b.ry - a.ry) * u,
          vx: a.vx + (b.vx - a.vx) * u,
          vy: a.vy + (b.vy - a.vy) * u,
          tAbs: tTarget
        };
      }
    }
    return { rx: last.rx, ry: last.ry, vx: last.vx, vy: last.vy, tAbs: last.tAbs };
  }

  /**
   * Scan candidate epochs along the predicted Stage 2 cislunar coast arc and
   * pick a fixed-epoch Optimal TCM Firing Node minimizing required delta-V
   * while cleanly hitting the lunar capture corridor.
   */
  function planOptimalStage2TcmNode(predictorOrPoints, tNowSec, options = {}) {
    const pts = Array.isArray(predictorOrPoints)
      ? predictorOrPoints
      : predictorOrPoints && Array.isArray(predictorOrPoints.points)
        ? predictorOrPoints.points
        : [];
    if (pts.length < 2) return null;

    const predPerilune =
      !Array.isArray(predictorOrPoints) && predictorOrPoints
        ? predictorOrPoints.predPerilune
        : null;
    const tStart = Math.max(Number.isFinite(tNowSec) ? tNowSec : pts[0].tAbs, pts[0].tAbs);
    const tPtsEnd = pts[pts.length - 1].tAbs;
    const tPeri =
      predPerilune && Number.isFinite(predPerilune.timeFromNowSec)
        ? tStart + predPerilune.timeFromNowSec
        : tPtsEnd;
    const totalHorizon = Math.max(0, Math.min(tPtsEnd, tPeri) - tStart);

    const tMax =
      totalHorizon > 600
        ? tStart + Math.min(36000.0, Math.max(600.0, totalHorizon * 0.25))
        : tStart + totalHorizon * 0.5;
    const defaultMinLead = totalHorizon > 12000 ? 600 : totalHorizon > 1800 ? 180 : 0;
    const minLeadSec = Number.isFinite(options.minLeadSec) ? options.minLeadSec : defaultMinLead;
    const tMin = Math.min(tMax, tStart + Math.max(0, minLeadSec));

    const sampleCount = clamp(Number.isFinite(options.sampleCount) ? options.sampleCount : 3, 2, 8);
    const epochs = [];
    if (options.includeNow || tMax - tMin < 60) {
      epochs.push(tStart);
    }
    for (let i = 0; i < sampleCount; i++) {
      const u = sampleCount === 1 ? 0 : i / (sampleCount - 1);
      const tCand = tMin + (tMax - tMin) * u;
      if (epochs.length === 0 || Math.abs(tCand - epochs[epochs.length - 1]) > 1.0) {
        epochs.push(tCand);
      }
    }

    const candidates = [];
    let bestCand = null;
    let bestRankCost = Infinity;
    let prevDv = null;
    for (const tCand of epochs) {
      const state = samplePredictorStateAtTime(pts, tCand);
      if (!state) continue;
      const mcc = computeFIDOMidCourseCorrection(state, tCand, {
        synodicExtended: Boolean(options.synodicExtended),
        massKg: options.massKg || 500.0,
        targetTimeSec: tCand,
        seedDv: prevDv,
        fastScan: true,
        skipExpectedPred: true
      });
      if (!mcc) continue;
      if (Array.isArray(mcc.dvVec)) prevDv = mcc.dvVec;
      const dvMs = (mcc.deltaVKms || 0) * 1000.0;
      const rawScore = mcc.projectedScore != null ? mcc.projectedScore : 0;
      const missPen = Math.max(0, rawScore - (mcc.deltaVKms || 0) * 120.0);
      const converged = !mcc.needed || missPen <= 95.0;
      const rankCost = !mcc.needed
        ? (tCand - tStart) * 1e-6
        : converged
          ? dvMs + missPen * 0.4 + (tCand - tStart) * 1e-5
          : 5000.0 + missPen * 0.6 + dvMs;
      const entry = {
        tAbs: tCand,
        timeFromNowSec: Math.max(0, tCand - tStart),
        state,
        mcc,
        deltaVMs: dvMs,
        missPen,
        converged,
        rankCost
      };
      candidates.push(entry);
      if (rankCost < bestRankCost) {
        bestRankCost = rankCost;
        bestCand = entry;
      }
    }

    if (!bestCand) return null;

    const finalMcc = bestCand.mcc;
    const dvVec = finalMcc.dvVec || [0, 0];
    const postBurnState = {
      rx: bestCand.state.rx,
      ry: bestCand.state.ry,
      vx: bestCand.state.vx + dvVec[0],
      vy: bestCand.state.vy + dvVec[1]
    };
    const expectedPred = computeLivePredictor(postBurnState, bestCand.tAbs, {
      mode: "cislunar",
      enableDrag: false,
      useLunarTopography: true,
      synodicExtended: Boolean(options.synodicExtended),
      massKg: options.massKg || 500.0
    });
    const dvMs = bestCand.deltaVMs;
    return {
      needed: Boolean(finalMcc.needed),
      nodeEpochSec: bestCand.tAbs,
      timeToNodeSec: Math.max(0, bestCand.tAbs - (Number.isFinite(tNowSec) ? tNowSec : tStart)),
      nodePos: [bestCand.state.rx, bestCand.state.ry],
      nodeState: {
        rx: bestCand.state.rx,
        ry: bestCand.state.ry,
        vx: bestCand.state.vx,
        vy: bestCand.state.vy
      },
      deltaVKms: finalMcc.deltaVKms || 0,
      deltaVMs: dvMs,
      dvVec,
      targetHeadingRad: finalMcc.targetHeadingRad,
      correctionNodePos: finalMcc.needed ? [bestCand.state.rx, bestCand.state.ry] : null,
      predPeriluneAltKm: finalMcc.predPeriluneAltKm,
      projectedScore: finalMcc.projectedScore != null ? finalMcc.projectedScore : 0,
      expectedPoints: expectedPred ? expectedPred.points : [],
      expectedPerilune: expectedPred ? expectedPred.predPerilune : null,
      candidates: candidates.map((c) => ({
        tAbs: c.tAbs,
        timeFromNowSec: c.timeFromNowSec,
        deltaVMs: c.deltaVMs,
        converged: Boolean(c.converged),
        rankCost: c.rankCost,
        needed: c.mcc.needed
      }))
    };
  }

  // ===========================================================================
  // 11. DSN LINE-OF-SIGHT OCCULTATION (FARSIDE BLACKOUT CHECK)
  // ===========================================================================
  /**
   * Ray-circle intersection test between Spacecraft and Earth (0,0) against the Moon disk.
   * Returns { blocked: boolean, clearanceKm: number }
   */
  function checkDSNOccultation(scPos, moonPos) {
    const sx = scPos[0];
    const sy = scPos[1];
    const mx = moonPos[0];
    const my = moonPos[1];

    // Vector from Earth (0,0) to Spacecraft (sx, sy)
    const len2 = sx * sx + sy * sy;
    if (len2 < 1e-6) return { blocked: false, clearanceKm: GMAT_CONFIG.R_MOON };

    // Project Moon center onto segment [0 -> SC]
    const tProj = (mx * sx + my * sy) / len2;
    if (tProj <= 0.0 || tProj >= 1.0) {
      // Moon is not between Earth and Spacecraft (SC is on nearside or Earth is between them)
      return { blocked: false, clearanceKm: GMAT_CONFIG.R_MOON };
    }

    const closestX = tProj * sx;
    const closestY = tProj * sy;
    const perpDist = Math.hypot(mx - closestX, my - closestY);
    const clearanceKm = perpDist - GMAT_CONFIG.R_MOON;
    return {
      blocked: clearanceKm <= 0.0,
      clearanceKm
    };
  }

  // ===========================================================================
  // 12. ANALYTIC MANEUVER TIMING (Kepler time-of-flight — cheap, jitter-free cues)
  // ===========================================================================
  /**
   * Time until the next periapsis passage for a 2-body orbit (ellipse or hyperbola).
   * Returns { tPeriSec, signedTPeriSec, tApoSec, rp, ra, ecc, sma, vPeri, vApo, closed }.
   * signedTPeriSec stays finite & signed (+ approaching, 0 at periapsis, - past periapsis)
   * across both hyperbolic flybys and elliptical orbits.
   */
  function timeToApsides2D(rx, ry, vx, vy, mu) {
    const kep = cartesianToKeplerian2D(rx, ry, vx, vy, mu);
    const e = kep.ecc;
    const a = kep.sma;
    const nu = kep.taRad;
    const out = {
      tPeriSec: Infinity,
      signedTPeriSec: Infinity,
      tApoSec: Infinity,
      rp: kep.rp,
      ra: kep.ra,
      ecc: e,
      sma: a,
      vPeri: NaN,
      vApo: NaN,
      closed: e < 1.0 && Number.isFinite(a) && a > 0
    };
    if (!Number.isFinite(e) || !Number.isFinite(a)) return out;

    if (out.closed) {
      const n = Math.sqrt(mu / (a * a * a));
      const E = 2.0 * Math.atan2(Math.sqrt(1.0 - e) * Math.sin(nu / 2.0), Math.sqrt(1.0 + e) * Math.cos(nu / 2.0));
      let M = E - e * Math.sin(E);
      M = normalizeAnglePosRad(M);
      const period = (2.0 * Math.PI) / n;
      out.tPeriSec = (2.0 * Math.PI - M) / n;
      if (out.tPeriSec >= period - 1e-6) out.tPeriSec = 0;
      out.signedTPeriSec = M <= Math.PI ? -M / n : (2.0 * Math.PI - M) / n;
      out.tApoSec = M <= Math.PI ? (Math.PI - M) / n : (3.0 * Math.PI - M) / n;
      out.vPeri = Math.sqrt(mu * (2.0 / kep.rp - 1.0 / a));
      out.vApo = Math.sqrt(Math.max(0, mu * (2.0 / kep.ra - 1.0 / a)));
      out.period = period;
    } else if (e > 1.0 && a < 0) {
      const n = Math.sqrt(mu / Math.pow(-a, 3));
      const tanHalf = Math.tan(normalizeAngleRad(nu) / 2.0);
      const F = 2.0 * Math.atanh(clamp(Math.sqrt((e - 1.0) / (e + 1.0)) * tanHalf, -0.999999, 0.999999));
      const M = e * Math.sinh(F) - F; // negative while approaching, positive past periapsis
      out.signedTPeriSec = -M / n;
      out.tPeriSec = out.signedTPeriSec;
      out.vPeri = Math.sqrt(mu * (2.0 / kep.rp - 1.0 / a));
    }
    return out;
  }

  /**
   * Coast-propagates a state with RK4 (full GMAT force model, no thrust).
   * Records intermediate sample points along the coast arc.
   */
  function propagateCoast2D(state, tSec, dtTotal, options = {}) {
    let cur = { rx: state.rx, ry: state.ry, vx: state.vx, vy: state.vy };
    let t = tSec;
    const points = [{ rx: cur.rx, ry: cur.ry, tAbs: t }];
    if (Math.abs(dtTotal) < 1e-4) {
      return { state: cur, tEnd: t, points, impact: null };
    }
    const stepMax = options.stepMax || 20.0;
    const n = Math.max(1, Math.ceil(Math.abs(dtTotal) / stepMax));
    const h = dtTotal / n;
    for (let i = 0; i < n; i++) {
      const nx = rk4Step2D(cur, t, h, { enableDrag: false, massKg: options.massKg });
      cur = { rx: nx.rx, ry: nx.ry, vx: nx.vx, vy: nx.vy };
      t += h;
      points.push({ rx: cur.rx, ry: cur.ry, tAbs: t });
      if (nx.impact) return { state: cur, tEnd: t, points, impact: nx.impact };
    }
    return { state: cur, tEnd: t, points, impact: null };
  }

  /**
   * LIVE TLI RE-PLANNER.
   * Re-computes the Trans-Lunar Injection maneuver from the player's ACTUAL orbit
   * (not the ideal 185 km circle): when to burn (phase-lead angle) and how much
   * (energy-matched to the GMAT golden solution), then propagates the resulting
   * reference path so the cyan guide line always starts from where you really are.
   * Supports immediate burns when tToNode <= 0 or during TLI_BURN.
   */
  function planTransLunarInjection(scState, tSec, goldenRef, options = {}) {
    const isImmediate = Boolean(
      options.immediate ||
      options.immediateBurn ||
      options.subPhase === "TLI_BURN" ||
      options.isTliBurn ||
      scState.subPhase === "TLI_BURN"
    );
    const mu = GMAT_CONFIG.MU_EARTH;
    const kep = cartesianToKeplerian2D(scState.rx, scState.ry, scState.vx, scState.vy, mu);

    if (!isImmediate) {
      if (!(kep.ecc < 1.0) || !(kep.sma > GMAT_CONFIG.R_EARTH)) return null;
    }

    const nSc = Math.sqrt(mu / Math.pow(Math.max(GMAT_CONFIG.R_EARTH, Math.abs(kep.sma)), 3));
    const nMoon = (2.0 * Math.PI) / GMAT_CONFIG.T_MOON_ORBIT;
    const relRate = Math.max(1e-6, nSc - nMoon);

    const mNow = getMoonStateAtTime(tSec);
    const moonAng = Math.atan2(mNow[1], mNow[0]);
    const scAng = Math.atan2(scState.ry, scState.rx);
    const rawDelta = normalizeAngleRad(moonAng - goldenRef.phaseLeadRad - scAng);

    let tToNode;
    if (isImmediate) {
      tToNode = 0.0;
    } else if (Math.abs(rawDelta) <= 20.0 * GMAT_CONFIG.DEG_TO_RAD) {
      tToNode = Math.max(0.0, rawDelta / relRate);
    } else {
      const dAng = normalizePosAngleSafe(rawDelta);
      tToNode = dAng / relRate;
    }

    let coast;
    let ns;
    let coastPoints;

    if (tToNode <= 0.05) {
      tToNode = 0.0;
      ns = { rx: scState.rx, ry: scState.ry, vx: scState.vx, vy: scState.vy };
      coast = { state: ns, tEnd: tSec, points: [{ rx: ns.rx, ry: ns.ry, tAbs: tSec }], impact: null };
      coastPoints = [{ rx: ns.rx, ry: ns.ry, tAbs: tSec }];
    } else {
      coast = propagateCoast2D(scState, tSec, tToNode, { stepMax: 15.0 });
      if (coast.impact) return null;
      ns = coast.state;
      coastPoints = coast.points;
    }

    const rNode = Math.hypot(ns.rx, ns.ry);
    const vNode = Math.hypot(ns.vx, ns.vy);

    // Energy-match the golden TLI solution at the node radius
    const vGold = goldenRef.tliSpeedKms;
    const energyGold = 0.5 * vGold * vGold - mu / GMAT_CONFIG.R_PARKING;
    let vNeeded = Math.sqrt(Math.max(0, 2.0 * (energyGold + mu / rNode)));

    const isRealScale = GMAT_CONFIG.R_MOON_ORBIT > 200000.0;
    const evalBurn = (vTarget) => {
      const vEff = Math.max(vTarget, vNode);
      const s = vEff / Math.max(1e-6, vNode);
      const st = { rx: ns.rx, ry: ns.ry, vx: ns.vx * s, vy: ns.vy * s };
      const pr = computeLivePredictor(st, coast.tEnd, {
        mode: "cislunar",
        maxIters: isRealScale ? 850 : 420,
        maxStepSec: isRealScale ? 1200.0 : 900.0,
        enableDrag: false
      });
      const peri = pr.predPerilune;
      const miss = peri ? Math.abs(peri.altKm - GMAT_CONFIG.TARGET_PERILUNE_ALT_KM) + (pr.predImpact ? 3000 : 0) : 1e9;
      return { pr, miss };
    };

    // Bounded 1-D refinement on burn magnitude (never diverges)
    let best = evalBurn(vNeeded);
    let bestV = vNeeded;
    let step = isRealScale ? 0.008 : 0.012;
    const maxRefineIters = isRealScale ? 5 : 3;
    for (let i = 0; i < maxRefineIters && best.miss > 20.0; i++) {
      let improved = false;
      for (const sgn of [1, -1]) {
        const cand = evalBurn(bestV + sgn * step);
        if (cand.miss < best.miss) {
          best = cand;
          bestV = bestV + sgn * step;
          improved = true;
          break;
        }
      }
      if (!improved) step *= 0.5;
    }

    const transferPoints = best.pr.points;
    const fullTrajectoryPoints = (coastPoints && coastPoints.length > 1)
      ? [...coastPoints, ...transferPoints.slice(1)]
      : [...transferPoints];

    return {
      tNodeAbs: coast.tEnd,
      tToNodeSec: tToNode,
      nodePos: [ns.rx, ns.ry],
      nodeProgradeRad: Math.atan2(ns.vy, ns.vx),
      targetSpeedKms: bestV,
      dvKms: Math.max(0, bestV - vNode),
      coastPoints: coastPoints,
      transferPoints: transferPoints,
      fullTrajectoryPoints: fullTrajectoryPoints,
      predPeriluneAltKm: best.pr.predPerilune ? best.pr.predPerilune.altKm : NaN
    };
  }

  function normalizePosAngleSafe(a) {
    return normalizeAnglePosRad(Number.isFinite(a) ? a : 0);
  }

  /**
   * LIVE ASCENT TRAJECTORY PREDICTOR (supports 2 to 5 propulsion stages).
   * Forward-propagates from pad/ascent along smooth gravity-turn guidance to 185 km parking
   * orbit insertion, staging sequentially across booster/core ascent stages if vehicle stages
   * are provided, then continues to TLI and trans-lunar transfer.
   */
  /**
   * Adaptive ascent steering shared by the flight guidance and the ascent plan predictor.
   * Burn time-to-go is estimated from the real remaining stack (Tsiolkovsky per stage), and the
   * desired climb rate is the one that reaches the 186 km parking altitude exactly when orbital
   * speed is reached. Low-thrust builds therefore fly a flatter, lower-loss trajectory instead of a
   * fixed steep profile tuned for a single high-thrust rocket.
   * Returns the tilt of the thrust vector away from local prograde (rad, + = towards radial-up).
   */
  function ascentTimeToGoSec(stages, activeIdx, dvNeedMs) {
    if (!Array.isArray(stages) || !stages.length) return 400.0;
    const g0 = GMAT_CONFIG.G0_MS2;
    let tgo = 0.0;
    let acc = 0.0;
    for (let i = Math.max(0, activeIdx); i < stages.length; i++) {
      const st = stages[i];
      if (st.jettisoned) continue;
      let m0 = 0.0;
      for (let j = i; j < stages.length; j++) {
        if (!stages[j].jettisoned) m0 += stages[j].dryKg + Math.max(0, stages[j].fuelKg);
      }
      const fuel = Math.max(0, st.fuelKg);
      if (fuel < 1e-3 || !(st.thrustN > 0) || !(st.ispS > 0)) continue;
      const ve = st.ispS * g0;
      const mdot = st.thrustN / ve;
      const dvSt = ve * Math.log(m0 / Math.max(1e-6, m0 - fuel));
      if (acc + dvSt >= dvNeedMs) {
        const mb = m0 * (1.0 - Math.exp(-(dvNeedMs - acc) / ve));
        return tgo + mb / mdot;
      }
      acc += dvSt;
      tgo += fuel / mdot;
    }
    return Math.max(tgo, 60.0);
  }

  function ascentSteeringTilt(alt, vr, vt, rSafe, aThrust, stages, activeIdx) {
    const dvNeedMs = Math.max(50.0, (GMAT_CONFIG.V_PARKING - vt) * 1000.0 * 1.06);
    const tgo = Math.max(40.0, ascentTimeToGoSec(stages, activeIdx, dvNeedMs));
    const desiredVr = clamp((2.0 * (186.0 - alt)) / tgo, -0.08, 2.05);
    const gEff = GMAT_CONFIG.MU_EARTH / (rSafe * rSafe) - (vt * vt) / rSafe;
    const aRadNeeded = gEff + (desiredVr - vr) * 0.08;
    const lawTilt = Math.asin(clamp(aRadNeeded / Math.max(1e-4, aThrust), -0.35, 0.95));
    const blend = clamp(alt / 18.0, 0.0, 1.0);
    // Vertical rise until the tower is cleared (~0.3 km), then a smooth pitch-over kick to 12° by 2 km
    const kickDeg = alt < 0.3 ? 90.0 : alt < 2.0 ? 90.0 - 12.0 * (alt - 0.3) / 1.7 : 78.0;
    return (1.0 - blend) * (kickDeg * GMAT_CONFIG.DEG_TO_RAD) + blend * lawTilt;
  }

  function predictExpectedAscentPath(scState, tSec, goldenRef, options = {}) {
    const cur = { rx: scState.rx, ry: scState.ry, vx: scState.vx, vy: scState.vy };
    const rCur = Math.hypot(cur.rx, cur.ry);
    const altCur = rCur - GMAT_CONFIG.R_EARTH;
    const ascentPoints = [{ rx: cur.rx, ry: cur.ry, tAbs: tSec }];

    let insState;
    let tIns = tSec;

    if (altCur >= 184.0) {
      const phi = Math.atan2(cur.ry, cur.rx);
      insState = {
        rx: GMAT_CONFIG.R_PARKING * Math.cos(phi),
        ry: GMAT_CONFIG.R_PARKING * Math.sin(phi),
        vx: -GMAT_CONFIG.V_PARKING * Math.sin(phi),
        vy: GMAT_CONFIG.V_PARKING * Math.cos(phi)
      };
      tIns = tSec;
    } else {
      let curRx = cur.rx;
      let curRy = cur.ry;
      let curVx = cur.vx;
      let curVy = cur.vy;

      // Clone active multi-stage stack if provided, else use legacy 2-stage ascent fallback
      const rawStages = (options && Array.isArray(options.stages) && options.stages.length >= 2)
        ? options.stages
        : (Array.isArray(scState.stages) && scState.stages.length >= 2)
        ? scState.stages
        : null;

      let simStages = null;
      if (rawStages) {
        simStages = rawStages.map((st, idx) => ({
          dryKg: st.dryKg,
          fuelKg: st.fuelKg != null ? st.fuelKg : st.fuelMaxKg,
          thrustN: st.thrustN,
          ispS: st.ispS,
          jettisoned: Boolean(st.jettisoned),
          isOrbital: idx === rawStages.length - 1
        }));
      }

      const fallbackFuel = (scState.stage1FuelKg != null)
        ? scState.stage1FuelKg
        : Math.max(500.0, 32800.0 - (Math.max(0, altCur) / 185.0) * 30000.0);
      let curM = simStages
        ? simStages.reduce((acc, st) => acc + (st.jettisoned ? 0 : st.dryKg + Math.max(0, st.fuelKg)), 0)
        : Math.max(2000.0, 2000.0 + fallbackFuel);

      const dt = 3.0;
      let t = tSec;
      let reached = false;

      for (let step = 0; step < 170; step++) {
        const r = Math.hypot(curRx, curRy);
        const alt = r - GMAT_CONFIG.R_EARTH;
        const vMag = Math.hypot(curVx, curVy);
        if (alt >= 184.0 || (alt >= 170.0 && vMag >= GMAT_CONFIG.V_PARKING - 0.1)) {
          const phi = Math.atan2(curRy, curRx);
          insState = {
            rx: GMAT_CONFIG.R_PARKING * Math.cos(phi),
            ry: GMAT_CONFIG.R_PARKING * Math.sin(phi),
            vx: -GMAT_CONFIG.V_PARKING * Math.sin(phi),
            vy: GMAT_CONFIG.V_PARKING * Math.cos(phi)
          };
          tIns = t;
          ascentPoints.push({ rx: insState.rx, ry: insState.ry, tAbs: tIns });
          reached = true;
          break;
        }

        let thrustN = 510000.0;
        let ispS = 350.0;
        let activeIdx = 0;
        if (simStages) {
          activeIdx = simStages.findIndex((st) => !st.jettisoned && st.fuelKg > 1e-3);
          if (activeIdx < 0) activeIdx = simStages.length - 1;
          // Auto-jettison spent booster stages before firing the next stage in prediction
          while (activeIdx < simStages.length - 1 && simStages[activeIdx].fuelKg <= 1e-3) {
            simStages[activeIdx].jettisoned = true;
            activeIdx++;
          }
          const st = simStages[activeIdx];
          thrustN = st.fuelKg > 1e-3 ? st.thrustN : 0.0;
          ispS = st.ispS;
          curM = Math.max(400.0, simStages.reduce((acc, s) => acc + (s.jettisoned ? 0 : s.dryKg + Math.max(0, s.fuelKg)), 0));
        }

        const mDot = thrustN > 0 ? thrustN / (ispS * GMAT_CONFIG.G0_MS2) : 0.0;
        const radialAng = Math.atan2(curRy, curRx);
        const progradeAng = radialAng + Math.PI * 0.5;
        const rSafe = Math.max(1.0, r);
        const vr = (curVx * curRx + curVy * curRy) / rSafe;
        const vt = (-curRy * curVx + curRx * curVy) / rSafe;
        const aThrust = thrustN / (Math.max(100.0, curM) * 1000.0);

        const tiltFromPrograde = ascentSteeringTilt(alt, vr, vt, rSafe, aThrust, simStages, activeIdx);
        const headingRad = progradeAng - tiltFromPrograde;

        const thrustAx = aThrust * Math.cos(headingRad);
        const thrustAy = aThrust * Math.sin(headingRad);

        const gMag = GMAT_CONFIG.MU_EARTH / (r * r * r);
        const gx = -gMag * curRx;
        const gy = -gMag * curRy;

        curVx += (gx + thrustAx) * dt;
        curVy += (gy + thrustAy) * dt;
        curRx += curVx * dt;
        curRy += curVy * dt;

        if (simStages) {
          const st = simStages[activeIdx];
          st.fuelKg = Math.max(0.0, st.fuelKg - mDot * dt);
          if (st.fuelKg <= 1e-3 && !st.isOrbital) {
            st.jettisoned = true;
          }
        } else {
          curM = Math.max(2000.0, curM - mDot * dt);
        }
        t += dt;
        ascentPoints.push({ rx: curRx, ry: curRy, tAbs: t });
      }

      if (!reached) {
        const phi = Math.atan2(curRy, curRx);
        insState = {
          rx: GMAT_CONFIG.R_PARKING * Math.cos(phi),
          ry: GMAT_CONFIG.R_PARKING * Math.sin(phi),
          vx: -GMAT_CONFIG.V_PARKING * Math.sin(phi),
          vy: GMAT_CONFIG.V_PARKING * Math.cos(phi)
        };
        tIns = t;
        ascentPoints.push({ rx: insState.rx, ry: insState.ry, tAbs: tIns });
      }
    }

    // Perf: callers may pass a cached TLI plan (options.tliPlan) — the TLI planner costs ~200 ms,
    // the ascent part above only a few ms. Pass `tliPlan: null` to skip the TLI part entirely.
    const tliPlan = options && options.tliPlan !== undefined
      ? options.tliPlan
      : planTransLunarInjection(insState, tIns, goldenRef);
    const coastPoints = (tliPlan && tliPlan.coastPoints) ? tliPlan.coastPoints : [];
    const transferPoints = (tliPlan && tliPlan.transferPoints) ? tliPlan.transferPoints : [];

    const fullPoints = [...ascentPoints];
    if (coastPoints.length > 1) {
      fullPoints.push(...coastPoints.slice(1));
    } else if (coastPoints.length === 1) {
      fullPoints.push(...coastPoints);
    }
    if (transferPoints.length > 1) {
      fullPoints.push(...transferPoints.slice(1));
    } else if (transferPoints.length === 1) {
      fullPoints.push(...transferPoints);
    }

    return {
      ascentPoints,
      coastPoints,
      transferPoints,
      insertionState: insState,
      insertionTimeSec: tIns,
      tliPlan,
      points: fullPoints
    };
  }

  // ===========================================================================
  // 13. EARTH-MOON LAGRANGE POINTS (SYNODIC / CO-ROTATING REFERENCE)
  // ===========================================================================
  /**
   * Computes Earth-Moon CR3BP Lagrange points L1..L5 in Geocentric world km.
   */
  function computeLagrangePoints2D(moonPosOrState) {
    const mx = moonPosOrState[0];
    const my = moonPosOrState[1];
    const R = Math.max(1000.0, Math.hypot(mx, my));
    const ux = mx / R;
    const uy = my / R;
    const vx = -uy;
    const vy = ux;
    const muStar = GMAT_CONFIG.MU_MOON / (GMAT_CONFIG.MU_EARTH + GMAT_CONFIG.MU_MOON);

    // Euler's quintic for L1 (between Earth and Moon, normalized distance g1 from Moon)
    let g1 = Math.pow(muStar / 3.0, 1.0 / 3.0);
    for (let i = 0; i < 6; i++) {
      const a = 1.0 - g1;
      const f = (1.0 - muStar) / (a * a) - muStar / (g1 * g1) - (1.0 - muStar - g1);
      const df = (2.0 * (1.0 - muStar)) / (a * a * a) + (2.0 * muStar) / (g1 * g1 * g1) + 1.0;
      g1 -= f / df;
    }
    // L2 (beyond Moon, normalized distance g2 beyond Moon)
    let g2 = Math.pow(muStar / 3.0, 1.0 / 3.0);
    for (let i = 0; i < 6; i++) {
      const a = 1.0 + g2;
      const f = (1.0 - muStar) / (a * a) + muStar / (g2 * g2) - (1.0 - muStar + g2);
      const df = (-2.0 * (1.0 - muStar)) / (a * a * a) - (2.0 * muStar) / (g2 * g2 * g2) - 1.0;
      g2 -= f / df;
    }
    const rL1 = R * (1.0 - g1);
    const rL2 = R * (1.0 + g2);
    const rL3 = -R * (1.0 - (7.0 / 12.0) * muStar);
    const c60 = 0.5;
    const s60 = Math.sqrt(3.0) * 0.5;

    return {
      L1: [ux * rL1, uy * rL1],
      L2: [ux * rL2, uy * rL2],
      L3: [ux * rL3, uy * rL3],
      L4: [R * (c60 * ux - s60 * uy), R * (c60 * uy + s60 * ux)],
      L5: [R * (c60 * ux + s60 * uy), R * (c60 * uy - s60 * ux)]
    };
  }

  // ===========================================================================
  // PUBLIC API EXPORT
  // ===========================================================================
  const LunarPhysics = {
    GMAT_CONFIG,
    recomputeDerivedConfig,
    EARTH_ATMOSPHERE_BANDS,
    getAtmosphericDensity,
    clamp,
    normalizeAngleRad,
    normalizeAnglePosRad,
    kmToPx,
    pxToKm,
    keplersProblem2D,
    cartesianToKeplerian2D,
    setInitialMoonAngle,
    getMoonStateAtTime,
    getEarthHelioStateAtTime,
    getBarycentricPositions,
    computeThirdBodyBattin,
    getLunarSurfaceReliefKm,
    computeLagrangePoints2D,
    computeAcceleration2D,
    getMasconPositions2D,
    rk4Step2D,
    computeLivePredictor,
    precalculateGoldenTrajectory,
    getGoldenTrajectoryAtMoonAngle,
    computeFIDOMidCourseCorrection,
    planOptimalStage2TcmNode,
    checkDSNOccultation,
    timeToApsides2D,
    propagateCoast2D,
    planTransLunarInjection,
    predictExpectedAscentPath,
    ascentSteeringTilt,
    ascentTimeToGoSec
  };

  globalScope.LunarPhysics = LunarPhysics;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = LunarPhysics;
  }
})(typeof window !== "undefined" ? window : globalThis);
