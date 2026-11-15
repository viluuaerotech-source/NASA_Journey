/* =====================================================================
   SPACE MISSION DESIGNER — JPL CML 2 ↔ 3 ↔ 4 educational game
   Space Apps 2026 HCMC
   ---------------------------------------------------------------------
   File layout
     1. CONFIG ............ game rules / thresholds (edit freely)
     2. DATA .............. parts pre-populated from the team Google Sheet
                            (src:'sheet' = value from sheet,
                             src:'est'   = public-reference estimate that
                                           fills a gap the sheet left blank)
     3. ICON_PATHS ........ hooks to swap in custom .png pixel icons
     4. TEXT .............. English UI strings
     5. MODEL ............. physics + checklist evaluation (pure functions)
     6. PIXEL ART ......... procedural icons + rocket / spacecraft renderers
     7. UI ................ inventory cards, stats, checklist, advisor
     8. LAUNCH ............ launch transition + GameState hand-off to Phase 2
   ===================================================================== */
'use strict';

/* =====================================================================
   1. CONFIG
   ===================================================================== */
const CONFIG = {
  g0: 9.80665,                 // m/s²
  totalBudgetM: 150,           // M$ shared by Part 1 + Part 2
  opsCostM: 12,                // M$ mission ops, integration & test (fixed)
  scMassMarginGreen: 0.35,     // JPL CML: S/C dry-mass margin ≥ 35 % → Green
  techMarginGreen: 0.35,       // power / energy / actuator margins ≥ 35 % → Green
  reserveGreen: 0.15,          // ≥ 15 % budget left as contingency → Green
  launchGateGreenRatio: 0.80,  // ≥ 80 % Green and 0 Red to launch
  batteryChargeEff: 0.90,      // battery round-trip efficiency
  batteryDoD: 0.65,            // allowed Li-ion depth of discharge per eclipse
  housekeepingKbps: 0.5,       // bus telemetry always downlinked
  liquidTankMinFraction: 0.30, // liquid tank structure at 0 % load (fraction of full tank mass)
  threshold: { science: 40, requires: ['ns'] }, // Threshold science (water-ice objective needs NS)
  baseline:  { science: 70 },                   // Baseline science
  tier: {                      // instrument tier multipliers (0 = off, 1 = standard, 2 = enhanced)
    2: { mass: 1.6, power: 1.5, data: 2.5, cost: 1.8, sci: 1.5 },
  },
};

/* =====================================================================
   2. DATA — from Google Sheet "SpaceApps2026_HCMC_Team-Meeting"
   ===================================================================== */

/* ---------- Mission targets ---------- */
const MISSIONS = [
  {
    id: 'lunar',
    name: 'Lunar polar orbit (TLI)',
    // Ideal (Tsiolkovsky) Δv the launcher must give, gravity/drag losses lumped in.
    // Calibrated against the Phase 2 flight physics (RK4 + drag + adaptive ascent guidance):
    // ≈ 9.5 km/s to the 186 km parking orbit + ≈ 3.1 km/s TLI. The spacecraft's own
    // hydrazine is then kept for mid-course correction and lunar orbit insertion (~0.9 km/s).
    dvReq: 12600,
    orbitMin: 118, eclipseMin: 47,      // Lunar Prospector 100 km polar orbit
    linkReqDb: 3,                       // deep-space link margin rule
    rateFactor: 1,                      // telecom rates in DATA are quoted at lunar distance
    contactFraction: 0.6,               // fraction of time in view of DSN
    deep: true,
  },
  {
    id: 'leo',
    name: 'Low Earth Orbit (200 km)',
    dvReq: 9500,                        // flight-measured: 9.1–9.7 km/s to a 186 km orbit incl. gravity & drag losses
    orbitMin: 90, eclipseMin: 36,
    linkReqDb: 6,                       // near-Earth orbit link margin rule
    rateFactor: 2000,                   // ~1/r² gain vs lunar distance (capped)
    contactFraction: 0.08,              // few ground-station passes per day
    deep: false,
  },
];

/* ---------- Propellants ---------- */
const PROPELLANTS = [
  { id: 'SOLID',     icon: 'propSolid',
    name: 'Solid HTPB/AP',
    density: 1800, ispRange: '230–295 s', costPerKg: 9, color: '#b5523b', src: 'sheet',
    desc: 'Cast grain inside the motor case (86% solids HTPB per SRM-1 row). Dense, cheap in bulk, cannot be shut down/restarted.' },
  { id: 'KEROLOX',   icon: 'propKerolox',
    name: 'LOX / Kerosene (RP-1)',
    density: 1030, ispRange: '310–340 s', costPerKg: 0.7, color: '#e0a03a', src: 'sheet',
    desc: 'Liquid oxygen + refined kerosene. High density → compact tanks, high thrust – ideal for stage 1 (RD-180).' },
  { id: 'HYDROLOX',  icon: 'propHydrolox',
    name: 'LOX / LH2 (Liquid hydrogen)',
    density: 360, ispRange: '420–465 s', costPerKg: 1.1, color: '#8fe3ff', src: 'sheet',
    desc: 'Highest chemical Isp (RL-10: 451 s) but hydrogen is very light → big, cryogenic tanks. Best for upper stages.' },
  { id: 'HYDRAZINE', icon: 'propHydrazine',
    name: 'Hydrazine (N₂H₄)',
    density: 1010, ispRange: '220–230 s', costPerKg: 220, color: '#7dff8a', src: 'sheet',
    desc: 'Monopropellant decomposed over a catalyst – simple, reliable, restartable. Used for trajectory trim (OAM, MR-107).' },
];

/* ---------- Launch-vehicle stages / engines (sheet "SLSLaunch Vehicle (Propulsion)") ----------
   thrustVac kN · isp s · masses kg · dia/len m · cost M$
   engineMass  = fixed hardware mass (engine, casing, avionics)
   tankMassMax = liquid-tank structure at 100 % load (scales with propellant load)          */
const LV_ENGINES = [
  { id: 'castor120', icon: 'solidMotor', name: 'Castor 120', engineType: 'Solid', stageClass: 'Stage 1, Stage 2',
    prop: 'SOLID', thrustVac: 1606.594, ispVac: 286, ispSL: 229, engineMass: 4211, tankMassMax: 0, propMax: 48809,
    burn: 83, dia: 2.36, len: 10.70, engineLen: 0, cost: 14, color: '#d9dbe6', src: 'sheet', estFields: ['cost'],
    desc: 'Thiokol solid motor, similar in size to Peacekeeper stage 1. First flight 1989. Athena II uses two (stage 1 and stage 2).' },
  { id: 'srm1', icon: 'solidMotor', name: 'ESBM/SRM-1 (Orbus 21)', engineType: 'Solid', stageClass: 'Stage 3',
    prop: 'SOLID', thrustVac: 189.2, ispVac: 293, ispSL: null, engineMass: 1030, tankMassMax: 0, propMax: 9780,
    burn: 150, dia: 2.30, len: 3.00, engineLen: 0, cost: 9, color: '#c9ccd8', src: 'sheet', estFields: ['cost'],
    desc: 'CSD solid motor (Orbus 21), 86% HTPB solids. Flown on IUS/TOS, Titan 34D. An ideal 3rd stage for transfer-orbit injection.' },
  { id: 'oam', icon: 'kick', name: 'OAM — 4× MR-107', engineType: 'Chemical', stageClass: 'In-space',
    prop: 'HYDRAZINE', thrustVac: 0.882, ispVac: 222, ispSL: null, engineMass: 360, tankMassMax: 0, propMax: 354,
    burn: 1500, dia: 2.30, len: 1.00, engineLen: 0, cost: 3, color: '#b0b8c8', src: 'sheet', estFields: ['cost'],
    desc: 'Orbit Adjust Module with four hydrazine MR-107 thrusters for final trajectory insertion.' },
  { id: 'rd180', icon: 'liquidEngine', name: 'RD-180 (Atlas V CCB)', engineType: 'Chemical', stageClass: 'Stage 1',
    prop: 'KEROLOX', thrustVac: 4152, ispVac: 338, ispSL: 311, engineMass: 5480, tankMassMax: 15574, propMax: 284089,
    burn: 253, dia: 3.81, len: 32.46, engineLen: 3.6, cost: 55, color: '#e08a3a', src: 'est',
    estFields: ['thrust', 'isp', 'mass', 'prop', 'dims', 'cost'],
    desc: 'Two-chamber derivative of the four-chamber RD-170, powering Atlas V stage 1. (Sheet had no numbers – public Atlas V Common Core Booster data used.)' },
  { id: 'rl10', icon: 'liquidEngine', name: 'RL-10A-4-2 (Centaur)', engineType: 'Chemical', stageClass: 'Stage 2',
    prop: 'HYDROLOX', thrustVac: 99.194, ispVac: 451, ispSL: null, engineMass: 168, tankMassMax: 1858, propMax: 20799,
    burn: 894, dia: 3.05, len: 12.68, engineLen: 2.3, cost: 32, color: '#e8ecf4', src: 'sheet', estFields: ['cost'],
    desc: 'Centaur stage with one RL-10 (LOX/LH2) for high-energy missions. Isp 451 s – best in the list, but low thrust.' },
];
const SRB = { id: 'aerojetSrb', icon: 'srb', name: 'Aerojet SRB (Atlas V)', engineType: 'Solid', stageClass: 'SRB',
  prop: 'SOLID', thrustVac: 1270, ispVac: 275, ispSL: 245, engineMass: 4000, tankMassMax: 0, propMax: 36824,
  burn: 94, dia: 1.55, len: 17.70, cost: 8, color: '#f2f2f2', src: 'sheet', estFields: ['cost'], maxCount: 4,
  desc: 'Aerojet strap-on solid booster for Atlas V (first flight 2002). Adds liftoff thrust beside stage 1.' };

/* Which engines may go in each stage slot (null = no stage) */
const STAGE_SLOTS = [
  { key: 's1',   label: 'Stage 1 (liftoff)', options: ['castor120', 'rd180'], required: true },
  { key: 's2',   label: 'Stage 2',                    options: [null, 'castor120', 'rl10', 'srm1'] },
  { key: 's3',   label: 'Stage 3',                    options: [null, 'srm1', 'rl10'] },
  { key: 'kick', label: 'Kick stage',     options: [null, 'oam'] },
];

/* ---------- Structure / payload fairing ---------- */
const FAIRINGS = [
  { id: 'f234', icon: 'fairing', name: 'Athena 2.34 m fairing',
    mass: 450, dia: 2.34, len: 7.0, volume: 14, cost: 2.5, src: 'est',
    desc: '92-inch Athena II fairing (Lunar Prospector launcher – sheet: Athena 2). Light and cheap but fits only small spacecraft.' },
  { id: 'f4m', icon: 'fairing', name: '4 m LPF (Atlas V 4xx)',
    mass: 2127, dia: 4.2, len: 12.0, volume: 60, cost: 7, src: 'est',
    desc: 'Large payload fairing, 4 m – fits medium to large spacecraft.' },
  { id: 'f5m', icon: 'fairing', name: '5 m short (Atlas V 5xx)',
    mass: 3524, dia: 5.4, len: 20.7, volume: 140, cost: 12, src: 'est',
    desc: '5 m composite fairing – roomy for LRO-class spacecraft but very heavy.' },
];

/* ---------- Spacecraft bus (sheet "Spacecraft": lunar = medium, LRO = large) ----------
   propKg = hydrazine already included in baseMass (used in flight for MCC / LOI / de-orbit)
   widthM = physical width, used to scale the pixel sprite in the flight close-up view       */
const BUSES = [
  { id: 'small', icon: 'busS', name: 'Small bus (Microsat)',
    baseMass: 55, maxMass: 180, slots: 6, basePower: 18, volume: 0.5, cost: 12, dims: '0.6×0.6×0.6 m', propKg: 18, widthM: 0.6, src: 'est',
    desc: 'Small, cheap chassis. Few slots, low mass limit. Carries only ~18 kg of hydrazine.' },
  { id: 'medium', icon: 'busM', name: 'Medium bus (Lunar Prospector-class)',
    baseMass: 165, maxMass: 420, slots: 9, basePower: 35, volume: 2.2, cost: 28, dims: 'Ø1.4 × 1.3 m', propKg: 138, widthM: 1.4, src: 'sheet',
    desc: 'Spin-stabilised drum like Lunar Prospector – sheet: "lunar", size "medium". Includes ~138 kg hydrazine for lunar orbit insertion.' },
  { id: 'large', icon: 'busL', name: 'Large bus (LRO-class)',
    baseMass: 1350, maxMass: 2300, slots: 12, basePower: 260, volume: 24, cost: 60, dims: '3.9×2.7×2.6 m', propKg: 700, widthM: 2.7, src: 'sheet',
    desc: '3-axis LRO-sized chassis – sheet: "LRO", size "large". Many slots and ~700 kg of propellant, but heavy, power-hungry and expensive.' },
];

/* ---------- Battery (sheet values: 150 / 300 / 800 / 1600 Wh) ---------- */
const BATTERIES = [
  { id: 'b150',  icon: 'battery', level: 1, name: '150 Wh',  capWh: 150,  mass: 5,  power: 0, cost: 0.6, fits: ['small', 'medium'], sheetTag: 'lunar · medium', src: 'sheet' },
  { id: 'b300',  icon: 'battery', level: 2, name: '300 Wh',  capWh: 300,  mass: 9,  power: 0, cost: 1.0, fits: ['medium'],           sheetTag: 'lunar · medium extended', src: 'sheet' },
  { id: 'b800',  icon: 'battery', level: 3, name: '800 Wh',  capWh: 800,  mass: 22, power: 0, cost: 2.2, fits: ['large'],            sheetTag: 'LRO · large basic', src: 'sheet' },
  { id: 'b1600', icon: 'battery', level: 4, name: '1600 Wh', capWh: 1600, mass: 42, power: 0, cost: 3.8, fits: ['large'],            sheetTag: 'LRO · large super', src: 'sheet' },
];

/* ---------- Solar panels (sheet: unfoldable 200 W / face, foldable 400–600 W) ----------
   eff = average illumination factor (body-mounted panels on a spinning drum ≈ 0.7) */
const SOLAR_PANELS = [
  { id: 'unf200', icon: 'solarUnfold', name: 'Unfoldable · 1 face',   watts: 200, eff: 0.7, mass: 9,  cost: 1.0, deploy: false, src: 'sheet',
    desc: 'Body-mounted. Charges the battery for eclipse according to the spin sequence of the spacecraft (sheet) → ~70% average output.' },
  { id: 'fold400', icon: 'solarFold', name: 'Foldable · 400 W',          watts: 400, eff: 1.0, mass: 13, cost: 4.0, deploy: true, src: 'sheet',
    desc: 'Once in a safe orbit the panels unfold radially into the gaps between equipment booms (sheet). Sun-tracking → 100%.' },
  { id: 'fold600', icon: 'solarFold', name: 'Foldable · 600 W',          watts: 600, eff: 1.0, mass: 18, cost: 6.0, deploy: true, src: 'sheet',
    desc: 'Larger foldable array (sheet: 400–600 W). More power, more mass and cost.' },
];
const SOLAR_MAX_COUNT = 4;

/* ---------- Actuators / attitude control (sheet "Actuator") ----------
   capKg = max spacecraft mass the set can stabilise with ≥ 0 % control margin
   thrustN / isp = combined maneuvering thrust and specific impulse used in Phase 2 flight */
const ACTUATORS = [
  { id: 'h20x4', icon: 'thruster', name: '4× 20N hydrazine', mass: 4, power: 10, capKg: 250, thrustN: 80, isp: 222, cost: 1.5, src: 'sheet',
    desc: '20N monopropellant hydrazine thruster for attitude, trajectory and orbit control (sheet). Dual-seat valve, redundant catalyst-bed heaters.' },
  { id: 'h20x8', icon: 'thruster', name: '8× 20N hydrazine', mass: 8, power: 18, capKg: 600, thrustN: 160, isp: 222, cost: 3.0, src: 'sheet',
    desc: 'Set of eight 20N thrusters – redundancy and twice the torque.' },
  { id: 'mt6x4', icon: 'thrusterBig', name: '4× MT-6 50N (IHI)', mass: 7, power: 14, capKg: 1500, thrustN: 200, isp: 227, cost: 4.0, src: 'sheet',
    desc: '50N MT-6 hydrazine monopropellant thruster by IHI Aerospace (sheet).' },
  { id: 'td339', icon: 'thrusterBig', name: '3× Thiokol TD-339', mass: 93, power: 20, capKg: 3000, thrustN: 1390, isp: 287, cost: 6.0, src: 'sheet',
    desc: 'Throttleable liquid vernier (Surveyor III): 30–104 lbf each, two fixed + one gimballed. Carries ≥178.3 lb propellant (included in 93 kg).' },
];

/* ---------- Telecom (sheet: Athena 2 / Lunar Prospector S-band, link margin > 3 dB) ----------
   rate0Kbps = data rate that closes the link at exactly 0 dB at lunar distance */
const TELECOMS = [
  { id: 'lga', icon: 'antLGA', name: 'Omni LGA (S-band)', rate0Kbps: 2, mass: 2, power: 6, cost: 0.8, transponder: false, src: 'est',
    desc: 'Omni antenna only – light, no pointing, but very low data rate.' },
  { id: 'lpS', icon: 'antMGA', name: '2× S-band + phased-array MGA', rate0Kbps: 8.06, mass: 8, power: 22, cost: 3.0, transponder: true, src: 'sheet',
    desc: 'As Lunar Prospector/Athena 2 (sheet): two S-band transponders, slotted phased-array MGA + LGA. 3.6 kbps telemetry, link margin > 3 dB.' },
  { id: 'hgaS', icon: 'antHGA', name: 'S-band 1 m HGA', rate0Kbps: 120, mass: 15, power: 35, cost: 7.0, transponder: true, src: 'est',
    desc: 'High-gain dish – far higher rate but needs accurate pointing.' },
  { id: 'hgaKa', icon: 'antKa', name: 'Ka-band HGA (LRO-class)', rate0Kbps: 100000, mass: 32, power: 110, cost: 18.0, transponder: true, src: 'est',
    desc: 'Ka-band ~100 Mbps link like LRO. Power-hungry.' },
];

/* ---------- Scientific instruments (sheet "Spacecraft (Scientific Instruments)") ---------- */
const INSTRUMENTS = [
  { id: 'er', icon: 'instMag', short: 'ER/MAG', name: 'Electron Reflectometer & Magnetometer (ER)',
    mass: 5.0, power: 4.5, dataKbps: 0.7, cost: 5, sci: 15, slot: 1, src: 'sheet',
    desc: 'Measures the Moon’s very weak global field and crustal magnetic anomalies – tiny “umbrellas” that deflect the solar wind.' },
  { id: 'grs', icon: 'instGamma', short: 'GRS', name: 'Gamma-Ray Spectrometer (GRS)',
    mass: 6.5, power: 3.0, dataKbps: 0.8, cost: 7, sci: 20, slot: 1, src: 'sheet',
    desc: 'Maps Fe, Ti, U, Th, K, O, Si… from gamma rays; cross-checks the hydrogen found by NS.' },
  { id: 'ns', icon: 'instNeutron', short: 'NS', name: 'Neutron Spectrometer (NS)',
    mass: 3.9, power: 2.5, dataKbps: 0.1, cost: 4, sci: 25, slot: 1, src: 'sheet',
    desc: 'Detects hydrogen (water ice) in permanently shadowed polar craters via epithermal-neutron dips. REQUIRED for Threshold Science.' },
  { id: 'aps', icon: 'instAlpha', short: 'APS', name: 'Alpha Particle Spectrometer (APS)',
    mass: 4.5, power: 7.0, dataKbps: 0.2, cost: 4, sci: 10, slot: 1, src: 'sheet',
    desc: 'Detects alpha particles from radon/polonium outgassing through tectonic cracks → volatile release history.' },
  { id: 'dge', icon: 'instDoppler', short: 'DGE', name: 'Doppler Gravity Experiment (DGE)',
    mass: 0, power: 0, dataKbps: 0, cost: 1.5, sci: 15, slot: 0, needsTransponder: true, src: 'sheet',
    desc: 'Uses the S-band signal itself to measure tiny velocity shifts → gravity map, mascons, iron core. No hardware, needs a transponder.' },
];

/* =====================================================================
   3. ICON_PATHS — custom .png hooks
   Put a path (e.g. 'img/castor120.png') to replace the procedural icon of
   any part id. Images are drawn with pixelated scaling on cards and on the
   spacecraft canvas (subsystems). Leave '' to keep procedural art.
   ===================================================================== */
const ICON_PATHS = {
  castor120: '', srm1: '', oam: '', rd180: '', rl10: '', aerojetSrb: '',
  SOLID: '', KEROLOX: '', HYDROLOX: '', HYDRAZINE: '',
  f234: '', f4m: '', f5m: '',
  small: '', medium: '', large: '',
  b150: '', b300: '', b800: '', b1600: '',
  unf200: '', fold400: '', fold600: '',
  h20x4: '', h20x8: '', mt6x4: '', td339: '',
  lga: '', lpS: '', hgaS: '', hgaKa: '',
  er: '', grs: '', ns: '', aps: '', dge: '',
};

/* =====================================================================
   4. TEXT (English-only UI strings)
   ===================================================================== */
const TEXT = {
    title: 'SPACE MISSION DESIGNER', subtitle: 'JPL CML 2 ↔ 3 ↔ 4 · Space Apps 2026 HCMC',
    missionTarget: 'Target', budget: 'Budget',
    tabLV: 'Launch Vehicle', tabSC: 'Spacecraft', tabHint: '↔ Switch between both parts to balance trade-offs',
    checklistTitle: 'CML 4 / KDP Readiness Checklist', advisorTitle: 'Systems Engineer Advisor',
    launchBtn: 'PROCEED TO LAUNCH', close: 'Close',
    legLV: 'Launcher', legSC: 'Spacecraft', legOps: 'Ops', legRes: 'Reserve',
    secStages: 'Engines / stages', secSRB: 'Strap-on boosters (SRB)', secProp: 'Propellant & fuel load', secFairing: 'Structure / Fairing',
    secBus: 'Spacecraft bus', secBattery: 'Battery', secSolar: 'Solar panels', secAct: 'Actuators (attitude control)',
    secTel: 'Telecom', secInst: 'Scientific instruments',
    hintProp: 'Pick the propellant for each stage and drag the slider to decide how much to load.',
    hintSolar: 'Number of arrays (1 slot each):', hintInst: 'Off / Standard / Enhanced — higher tier: more science but more mass, power, data and cost.',
    none: 'None', noneDesc: 'Leave this stage empty', count: 'Count',
    thrust: 'Thrust', isp: 'Isp', empty: 'Empty mass', propMax: 'Max propellant', dims: 'Size', burn: 'Burn time',
    density: 'Density', costKg: 'Price', mass: 'Mass', volume: 'Payload vol.', power: 'Power', data: 'Data', science: 'Science',
    slots: 'Slots', maxMass: 'Limit', cap: 'Capacity', control: 'Stabilises', rate0: 'Rate @0 dB',
    fitsOnly: 'Fits bus only: {b}', slotFull: 'No free slots on the bus! ({u}/{s})',
    tierOff: 'Off', tierStd: 'Std', tierEnh: 'Enh',
    stageLabel: 'Stage', compatible: 'compatible', incompatible: 'INCOMPATIBLE',
    stTWR: 'Liftoff TWR', stDV: 'Δv / required', stCap: 'Max payload', stLaunchMass: 'Liftoff mass',
    stSCMass: 'S/C mass', stPower: 'Power: gen / load', stLink: 'Link margin', stSci: 'Science pts',
    stSlots: 'Slots used', stEnergy: 'Battery: have / need', stData: 'Data needed', stCost: 'Cost of this part',
    ck_thrust: 'Launch thrust', ck_thrust_s: 'Thrust ≥ total weight (TWR ≥ 1)',
    ck_fit: 'Fairing fit', ck_fit_s: 'S/C volume ≤ payload volume',
    ck_dv: 'Orbital Δv', ck_dv_s: 'Tsiolkovsky Δv ≥ requirement',
    ck_mass: 'S/C dry mass margin', ck_mass_s: '≥35% (min of bus, LV capacity)',
    ck_power: 'Power margin', ck_power_s: 'Solar covers load + recharge',
    ck_energy: 'Energy (battery) margin', ck_energy_s: 'Survives eclipse',
    ck_link: 'Telecom link margin', ck_link_s: '≥{db} dB ({k})',
    ck_act: 'Actuator margin', ck_act_s: 'Enough torque to stabilise',
    ck_sci: 'Science objectives', ck_sci_s: 'Threshold {th} · Baseline {bl}',
    ck_budget: 'Budget reserve', ck_budget_s: '≥15% of budget left',
    deepSpace: 'deep space', orbitK: 'near-Earth orbit',
    gateText: '<b>{g}/{n}</b> Green ({p}%) · <b>{r}</b> Red — needs ≥80% Green and 0 Red',
    gateOpen: '✅ KDP criteria met — ready for launch!',
    rocketTitle: 'LAUNCH VEHICLE', scTitle: 'SPACECRAFT', height: 'Height', liftoff: 'Liftoff',
    adv_allGood: '<b>Excellent!</b> Every item is green. Hit PROCEED TO LAUNCH, or keep optimising for more science and budget reserve.',
    adv_gateAlmost: 'No Red items, but only {p}% Green (needs 80%). Turn the Yellow items Green.',
    adv_thrust: '<b>Cannot lift off:</b> thrust {f} kN < weight {w} kN (TWR {twr}). The heavier the propellant and upper stages, the harder it is to leave the pad. Reduce upper-stage fuel, add Aerojet SRBs, or use a stronger stage 1 (RD-180).',
    adv_s1Incompat: '<b>{e}</b> is designed for <b>{p}</b>. Wrong propellant → engine produces no thrust. Pick the right propellant under "Propellant & fuel load".',
    adv_stageIncompat: 'Stage <b>{e}</b> is loaded with an incompatible propellant → it is dead weight and adds no Δv.',
    adv_dv: '<b>Not enough Δv:</b> {dv} km/s < {req} km/s (short by {gap} km/s). By Tsiolkovsky, Δv grows with Isp and the mass ratio m₀/m_f. Add propellant, add a high-Isp upper stage (RL-10: 451 s), or lighten the spacecraft. Current max payload: {cap} kg.',
    adv_dvTwr: 'Trade-off: more propellant raises Δv but makes the rocket heavier → TWR drops (now {twr}).',
    adv_fit: '<b>Spacecraft does not fit:</b> needs {v} m³ but the fairing holds {fv} m³. Pick a larger fairing in Part 1 (heavier → less Δv) or a smaller bus.',
    adv_mass: '<b>S/C mass margin {m}%</b> (needs ≥35% per JPL CML rule). Spacecraft is {kg} kg; allowed {alloc} kg, set by <b>{lim}</b>. Drop equipment, lower tiers, or go back to Part 1 and upgrade the launcher to raise max payload.',
    adv_limBus: 'the bus limit', adv_limLV: 'the launcher’s max payload',
    adv_slots: '<b>Slot overflow:</b> using {u}/{s} bus slots. Remove equipment or choose a larger bus.',
    adv_power: '<b>Power margin {m}%:</b> solar arrays average {avail} W but {need} W is needed (load {load} W + recharging after {ecl} min of eclipse each orbit). Add arrays, use foldable panels (sun-tracking, no 0.7 spin factor), or cut power-hungry equipment.',
    adv_energy: '<b>Battery margin {m}%:</b> usable {use} Wh (at {dod}% depth of discharge) but each eclipse needs {need} Wh. Choose a bigger battery or cut load.',
    adv_noBattery: '<b>No battery:</b> the spacecraft will brown out every eclipse ({ecl} min/orbit).',
    adv_noSolar: '<b>No solar arrays:</b> nothing can recharge the battery.',
    adv_link: '<b>Link margin {db} dB</b> (needs ≥{req} dB). Instruments must downlink {rate} kbps during {c}% contact time. Choose a higher-gain antenna or lower the tier of data-heavy instruments (GRS, ER).',
    adv_noTel: '<b>No telecom:</b> data cannot reach Earth.',
    adv_act: '<b>Actuator margin {m}%:</b> {a} can stabilise ~{cap} kg, spacecraft is {kg} kg. Larger buses and heavy payloads need higher-torque actuators.',
    adv_noAct: '<b>No actuators:</b> cannot hold antenna/array pointing or trim the orbit.',
    adv_sciNS: '<b>NS missing:</b> the Threshold objective is polar water ice → the Neutron Spectrometer is mandatory.',
    adv_sciLow: '<b>Science {s} pts</b> < Threshold {th}. Add instruments or raise tiers (at the cost of mass, power, data and money).',
    adv_sciY: 'Threshold met ({s} pts). Reach {bl} pts for Baseline Science → Green.',
    adv_dge: 'DGE needs a transponder for Doppler tracking – the bare LGA has none → DGE scores nothing.',
    adv_budget: '<b>Reserve {r}%</b> (needs ≥15%). Spent {c} M$ / {b} M$: launcher {lv} M$, spacecraft {sc} M$, ops {ops} M$. Big launchers (RD-180, Centaur) and the large bus are the costliest items.',
    adv_hammer: 'Fairing Ø{f} m is much wider than stage 1 Ø{s} m ("hammerhead") → high aerodynamic loads. Consider a smaller fairing.',
    adv_battFit: '{b} cannot be fitted on {bus} (per sheet).',
    adv_intro: 'Start with <b>Part 1</b>: choose stages, propellant, fuel load and fairing. Then move to <b>Part 2</b> to design the spacecraft. Red items will be explained here.',
    l_liftoff: 'LIFTOFF!', l_srbsep: 'SRB separation', l_sep: '{s} separation', l_fairing: 'Fairing jettison', l_orbit: 'Orbit achieved!', l_tli: 'Trans-lunar injection!',
    r_title: 'MISSION REPORT', r_success: 'Mission success', r_grade: 'Science level', r_baseline: 'Baseline ✓', r_threshold: 'Threshold ✓',
    r_score: 'Total score', r_sci: 'Science points', r_reserve: 'Budget reserve', r_dvMargin: 'Δv margin', r_mass: 'S/C mass margin', r_greens: 'Green items',
};

/* ---------- part inspector, physics notes, launch sequence ---------- */
Object.assign(TEXT, {
  infoTip: 'Part details', physTitle: 'PHYSICS', estFields: 'Estimated', costLbl: 'Cost', fitsShort: 'Fits bus',
  sheetTagLbl: 'Sheet', bodyMounted: 'Body-mounted', deployable: 'Deployable', transponder: 'Transponder', yes: 'Yes', no: 'No',
  tierLbl: 'Current tier', slotLbl: 'Slots used',
  cat_engine: 'ENGINE / STAGE', cat_srb: 'STRAP-ON BOOSTER', cat_prop: 'PROPELLANT', cat_fairing: 'PAYLOAD FAIRING',
  cat_bus: 'SPACECRAFT BUS', cat_battery: 'BATTERY', cat_solar: 'SOLAR ARRAY', cat_act: 'ATTITUDE CONTROL',
  cat_tel: 'TELECOM', cat_inst: 'SCIENCE INSTRUMENT', cat_dge: 'SCIENCE INSTRUMENT (RADIO)',
  bat_desc: 'Li-ion battery that powers the whole spacecraft while it is in the shadow of the Moon or Earth, then is recharged by the solar arrays in sunlight.',
  phy_engine: '<p>Rocket equation (Tsiolkovsky): <code>Δv = Isp · g₀ · ln(m₀ / m_f)</code>. Higher Isp or a bigger mass ratio m₀/m_f gives more Δv.</p><p>Stage 1 must also beat gravity at liftoff: <code>TWR = F_SL / (m₀ · g₀) ≥ 1</code>. Sea-level Isp is lower than vacuum Isp because ambient pressure pushes back on the exhaust.</p><p>Each stage carries everything above it, so a light, high-Isp upper stage buys Δv cheaply.</p>',
  phy_srb: '<p>Strap-on boosters burn in parallel with stage 1: <code>F_total = F_S1 + n · F_SRB</code> → higher liftoff TWR.</p><p>While burning together they drag the blended Isp down: <code>Isp_mix = ΣF / Σ(F / Isp)</code>. Empty casings are dropped once spent.</p>',
  phy_prop: '<p>Density sets tank volume: <code>V = m / ρ</code>. Dense kerosene → compact tanks; very light LH₂ → huge cryogenic tanks, but the best Isp.</p><p>Each engine runs on one propellant pair only — a mismatched load gives zero thrust and is dead mass. Liquid tank structure scales with the load (minimum 30%).</p>',
  phy_fairing: '<p>The fairing shields the spacecraft from aerodynamic heating and pressure during ascent. Rule: <code>V_payload ≥ V_spacecraft</code>.</p><p>Its mass rides through the stage-1 burn and lowers the mass ratio — a bigger fairing costs Δv. A fairing much wider than stage 1 ("hammerhead") adds bending loads.</p>',
  phy_bus: '<p>The bus is the structural chassis. Allowed mass: <code>min(bus limit, launcher max payload)</code>.</p><p>JPL CML rule: dry-mass margin <code>allowed / mass − 1 ≥ 35%</code>. Slots cap how many subsystems fit; base power is drawn continuously by avionics and heaters.</p>',
  phy_battery: '<p>In eclipse the battery carries the entire load: <code>E_need = P_load · t_eclipse</code>. Usable energy <code>= C · DoD</code>.</p><p>Li-ion cells wear out faster when drained deeply, so the design rule allows a <code>65%</code> depth of discharge per eclipse.</p>',
  phy_solar: '<p>Output in sunlight: <code>P = P_peak · η</code>.</p><p>Arrays must cover the load AND recharge the battery: <code>P_need = P_load + P_load · t_e / (0.9 · t_sun)</code>. Body-mounted cells on a spinning drum see the Sun ~70% of the time (η = 0.7); sun-tracking deployable wings get η = 1.</p>',
  phy_act: '<p>Actuators produce torque to point antennas and arrays and to trim the orbit. More mass → larger moment of inertia → more torque needed.</p><p>Margin <code>= stabilising capacity / S/C mass − 1</code>, Green at ≥ 35%.</p>',
  phy_tel: '<p>Link margin in decibels: <code>M = 10 · log₁₀(R_available / R_required)</code>. Received power falls as <code>1 / r²</code> — a link that closes easily in LEO is ~2000× harder at the Moon.</p><p>Required rate = (instrument data + 0.5 kbps housekeeping) / fraction of time in DSN contact. Deep-space rule: M ≥ 3 dB.</p>',
  phy_inst: '<p>Every instrument earns science points but costs mass, power, data and money. Enhanced tier: science ×1.5 · mass ×1.6 · power ×1.5 · data ×2.5 · cost ×1.8.</p><p>Threshold = 40 pts and the Neutron Spectrometer is mandatory (water ice); Baseline = 70 pts.</p>',
  phy_dge: '<p>DGE measures the Doppler shift of the S-band carrier: <code>Δf = f · v / c</code>. Velocity changes of a few mm/s over mascons reveal the gravity field.</p><p>It needs a coherent transponder to phase-lock with the DSN station — a bare LGA cannot do it.</p>',
  l_ignition: 'IGNITION SEQUENCE START', l_liftoff2: 'LIFTOFF!', l_stack: 'LAUNCH STACK', l_craft: 'S/C',
  fixHint: 'click to fix', propSc: 'Hydrazine (included)', scDv: 'S/C Δv', thrustMan: 'Maneuver thrust',
});

/* =====================================================================
   STATE
   ===================================================================== */
const state = {
  tab: 'lv',
  missionId: 'lunar',
  lv: {
    stages: {
      s1:   { engine: 'castor120', prop: 'SOLID', load: 1.0 },
      s2:   { engine: null, prop: 'SOLID', load: 1.0 },
      s3:   { engine: null, prop: 'SOLID', load: 1.0 },
      kick: { engine: null, prop: 'HYDRAZINE', load: 1.0 },
    },
    srbCount: 0,
    fairing: 'f234',
  },
  sc: {
    bus: 'medium',
    battery: null,
    solar: null,
    solarCount: 1,
    actuator: null,
    telecom: null,
    instruments: { er: 0, grs: 0, ns: 0, aps: 0, dge: 0 },
  },
  flash: null, // transient advisor message
};

/* ---------- Shared GameState (Phase 1 hangar ⇄ launch transition ⇄ Phase 2 flight) ----------
   phase : 'opening' | 'hangar' | 'launching' | 'flight' | 'survey'
   missions: mission ids chosen on the opening menu (ice, min, mag, …)
   design: live hangar state (LV + spacecraft selections)
   build : frozen snapshot of the player's exact build taken at PROCEED TO LAUNCH,
           incl. the composite pixel sprites Phase 2 flies with                       */
const GameState = (typeof window !== 'undefined') ? (window.GameState = window.GameState || {}) : {};
Object.assign(GameState, { phase: 'hangar', design: state, build: null });

/* =====================================================================
   5. MODEL — pure physics / evaluation
   ===================================================================== */
const byId = (arr, id) => arr.find(x => x.id === id) || null;
const engineById = id => (id === SRB.id ? SRB : byId(LV_ENGINES, id));
const mission = () => byId(MISSIONS, state.missionId);

/** Build the list of active stages bottom → top with their masses. */
function buildStages(s = state) {
  const out = [];
  for (const slot of STAGE_SLOTS) {
    const st = s.lv.stages[slot.key];
    if (!st.engine) continue;
    const eng = engineById(st.engine);
    const load = Math.max(0, Math.min(1, st.load));
    const propMass = eng.propMax * load;
    const tankFactor = CONFIG.liquidTankMinFraction + (1 - CONFIG.liquidTankMinFraction) * load;
    const dryMass = eng.engineMass + eng.tankMassMax * tankFactor;
    const compatible = st.prop === eng.prop;
    // liquid tanks shrink with load → drawn length too
    const len = eng.tankMassMax > 0 ? eng.engineLen + (eng.len - eng.engineLen) * tankFactor : eng.len;
    out.push({ key: slot.key, eng, load, prop: st.prop, propMass, dryMass, compatible, len });
  }
  return out;
}

/** Tsiolkovsky Δv of the whole stack for a given payload mass. */
function computeLV(payloadKg, s = state) {
  const g0 = CONFIG.g0;
  const stages = buildStages(s);
  const fairing = byId(FAIRINGS, s.lv.fairing);
  const nSRB = s.lv.srbCount;
  const srbDry = nSRB * SRB.engineMass, srbProp = nSRB * SRB.propMax;

  // mass above each stage
  const above = new Array(stages.length).fill(0);
  let acc = payloadKg;
  for (let i = stages.length - 1; i >= 0; i--) { above[i] = acc; acc += stages[i].dryMass + stages[i].propMass; }
  const liftoffMass = acc + fairing.mass + srbDry + srbProp;
  const lvDry = stages.reduce((a, x) => a + x.dryMass, 0) + fairing.mass + srbDry;
  const lvProp = stages.reduce((a, x) => a + x.propMass, 0) + srbProp;

  // --- liftoff thrust (sea level) ---
  const slThrust = e => e.thrustVac * ((e.ispSL || e.ispVac * 0.8) / e.ispVac);
  const s1 = stages[0];
  const fS1 = s1 && s1.compatible && s1.propMass > 0 ? slThrust(s1.eng) : 0;
  const fSRB = nSRB * slThrust(SRB);
  const liftoffThrustKN = fS1 + fSRB;
  const weightKN = liftoffMass * g0 / 1000;
  const twr = liftoffThrustKN / weightKN;

  // --- Δv per stage ---
  const perStage = [];
  let dv = 0;
  stages.forEach((st, i) => {
    let m0, mf, isp;
    if (i === 0) {
      m0 = liftoffMass;
      const burners = [];
      if (st.compatible && st.propMass > 0) burners.push({ F: st.eng.thrustVac, I: (st.eng.ispVac + (st.eng.ispSL || st.eng.ispVac)) / 2, p: st.propMass });
      if (nSRB) burners.push({ F: SRB.thrustVac * nSRB, I: (SRB.ispVac + SRB.ispSL) / 2, p: srbProp });
      const F = burners.reduce((a, b) => a + b.F, 0);
      const mdot = burners.reduce((a, b) => a + b.F / b.I, 0);
      isp = F > 0 ? F / mdot : 0;
      mf = m0 - burners.reduce((a, b) => a + b.p, 0);
    } else {
      m0 = above[i] + st.dryMass + st.propMass;
      isp = st.compatible ? st.eng.ispVac : 0;
      mf = m0 - (st.compatible ? st.propMass : 0);
    }
    const sdv = isp > 0 && mf > 0 ? isp * g0 * Math.log(m0 / mf) : 0;
    perStage.push({ ...st, m0, mf, isp, dv: sdv });
    dv += sdv;
  });
  // SRB-only stack with no stage 1 is impossible (s1 required)

  const lvCost = stages.reduce((a, x) => a + x.eng.cost + x.propMass * propellantCost(x.prop) / 1e6, 0)
    + nSRB * (SRB.cost + SRB.propMax * propellantCost('SOLID') / 1e6) + fairing.cost;

  return { stages: perStage, fairing, nSRB, liftoffMass, lvDry, lvProp, liftoffThrustKN, weightKN, twr, dv, cost: lvCost };
}
function propellantCost(id) { const p = byId(PROPELLANTS, id); return p ? p.costPerKg : 0; }

/** Max payload such that Δv ≥ mission requirement (binary search). */
function maxPayload(s = state) {
  const req = byId(MISSIONS, s.missionId).dvReq;
  if (computeLV(0, s).dv < req) return 0;
  let lo = 0, hi = 60000;
  if (computeLV(hi, s).dv >= req) return hi;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (computeLV(mid, s).dv >= req) lo = mid; else hi = mid; }
  return lo;
}

function computeSC(s = state) {
  const m = byId(MISSIONS, s.missionId);
  const bus = byId(BUSES, s.sc.bus);
  const bat = byId(BATTERIES, s.sc.battery);
  const sol = byId(SOLAR_PANELS, s.sc.solar);
  const act = byId(ACTUATORS, s.sc.actuator);
  const tel = byId(TELECOMS, s.sc.telecom);
  const nSol = sol ? s.sc.solarCount : 0;

  let mass = bus.baseMass, load = bus.basePower, cost = bus.cost, slots = 0, dataKbps = 0, sci = 0;
  const batFits = bat ? bat.fits.includes(bus.id) : true;
  if (bat) { mass += bat.mass; cost += bat.cost; slots += 1; }
  if (sol) { mass += sol.mass * nSol; cost += sol.cost * nSol; slots += nSol; }
  if (act) { mass += act.mass; load += act.power; cost += act.cost; slots += 1; }
  if (tel) { mass += tel.mass; load += tel.power; cost += tel.cost; slots += 1; }

  const instList = [];
  for (const ins of INSTRUMENTS) {
    const tier = s.sc.instruments[ins.id] || 0;
    if (!tier) continue;
    const k = tier === 2 ? CONFIG.tier[2] : { mass: 1, power: 1, data: 1, cost: 1, sci: 1 };
    mass += ins.mass * k.mass; load += ins.power * k.power; dataKbps += ins.dataKbps * k.data;
    cost += ins.cost * k.cost; slots += ins.slot;
    let pts = ins.sci * k.sci;
    if (ins.needsTransponder && !(tel && tel.transponder)) pts = 0;
    sci += pts;
    instList.push({ ins, tier, pts });
  }

  // ---- power (orbit average incl. battery recharge) ----
  const tOrb = m.orbitMin, tE = m.eclipseMin, tSun = tOrb - tE;
  const genPeak = sol ? sol.watts * nSol : 0;
  const genAvgSun = genPeak * (sol ? sol.eff : 0);                 // W while in sunlight
  const needSun = load + (load * tE / CONFIG.batteryChargeEff) / tSun; // W needed while in sunlight
  const powerMargin = needSun > 0 ? genAvgSun / needSun - 1 : 1;

  // ---- energy ----
  const dod = CONFIG.batteryDoD;
  const usableWh = bat ? bat.capWh * dod : 0;
  const needWh = load * tE / 60;
  const energyMargin = needWh > 0 ? usableWh / needWh - 1 : 1;

  // ---- telecom link ----
  const totalData = dataKbps + CONFIG.housekeepingKbps;
  const reqRate = totalData / m.contactFraction;
  const linkDb = tel ? 10 * Math.log10((tel.rate0Kbps * m.rateFactor) / reqRate) : -Infinity;

  // ---- actuators ----
  const actMargin = act ? act.capKg / mass - 1 : -1;

  // ---- own propulsion (bus hydrazine, burned by the actuator thrusters) ----
  const propKg = bus.propKg || 0;
  const scDv = act && propKg > 0 ? act.isp * CONFIG.g0 * Math.log(mass / Math.max(1, mass - propKg)) : 0;

  const volume = bus.volume;
  return { propKg, scDv, bus, bat, sol, act, tel, nSol, mass, load, cost, slots, slotsMax: bus.slots, dataKbps, totalData, reqRate,
    sci, instList, genPeak, genAvgSun, needSun, powerMargin, dod, usableWh, needWh, energyMargin, linkDb, actMargin, volume, batFits };
}

/** Full evaluation: RYG checklist + advisor messages. */
function evaluate(s = state) {
  const m = byId(MISSIONS, s.missionId);
  const sc = computeSC(s);
  const lv = computeLV(sc.mass, s);
  const cap = maxPayload(s);
  const alloc = Math.min(sc.bus.maxMass, cap);
  const massMargin = alloc / sc.mass - 1;

  const lvCost = lv.cost, scCost = sc.cost, ops = CONFIG.opsCostM;
  const total = lvCost + scCost + ops;
  const reserve = (CONFIG.totalBudgetM - total) / CONFIG.totalBudgetM;

  const margin3 = (v, green = CONFIG.techMarginGreen) => (v >= green ? 'G' : v >= 0 ? 'Y' : 'R');
  const pct = v => (isFinite(v) ? Math.round(v * 100) + '%' : '—');

  const hasNS = (s.sc.instruments.ns || 0) > 0;
  const sciStatus = !hasNS || sc.sci < CONFIG.threshold.science ? 'R' : sc.sci >= CONFIG.baseline.science ? 'G' : 'Y';

  const checks = [
    { id: 'thrust', part: 'all', status: lv.twr >= 1 ? 'G' : 'R', value: lv.twr.toFixed(2) },
    { id: 'fit',    part: 'all', status: sc.volume <= lv.fairing.volume ? 'G' : 'R', value: `${fmt(sc.volume, 1)}/${lv.fairing.volume} m³` },
    { id: 'dv',     part: 'lv',  status: lv.dv >= m.dvReq ? 'G' : 'R', value: `${fmt(lv.dv / 1000, 2)} km/s` },
    { id: 'mass',   part: 'sc',  status: sc.slots > sc.slotsMax ? 'R' : margin3(massMargin, CONFIG.scMassMarginGreen), value: pct(massMargin) },
    { id: 'power',  part: 'sc',  status: margin3(sc.powerMargin), value: pct(sc.powerMargin) },
    { id: 'energy', part: 'sc',  status: margin3(sc.energyMargin), value: pct(sc.energyMargin) },
    { id: 'link',   part: 'sc',  status: sc.linkDb >= m.linkReqDb ? 'G' : sc.linkDb >= 0 ? 'Y' : 'R', value: isFinite(sc.linkDb) ? `${fmt(sc.linkDb, 1)} dB` : '—' },
    { id: 'act',    part: 'sc',  status: margin3(sc.actMargin), value: pct(sc.actMargin) },
    { id: 'sci',    part: 'sc',  status: sciStatus, value: `${Math.round(sc.sci)} pts` },
    { id: 'budget', part: 'all', status: reserve >= CONFIG.reserveGreen ? 'G' : reserve >= 0 ? 'Y' : 'R', value: pct(reserve) },
  ];
  const greens = checks.filter(c => c.status === 'G').length;
  const reds = checks.filter(c => c.status === 'R').length;
  const gateOpen = greens / checks.length >= CONFIG.launchGateGreenRatio && reds === 0;

  return { m, sc, lv, cap, alloc, massMargin, lvCost, scCost, ops, total, reserve, checks, greens, reds, gateOpen };
}

/* =====================================================================
   Helpers
   ===================================================================== */
function t(key, vars = {}) {
  let s = TEXT[key] || key;
  for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
function fmt(n, d = 0) {
  if (!isFinite(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const tonnes = kg => fmt(kg / 1000, kg < 10000 ? 2 : 1) + ' t';

/* =====================================================================
   6. PIXEL ART
   ===================================================================== */
/* Unified NASA mission-control palette (shared with Phase 2 HUD) */
const PAL = {
  outline: '#0A0E17', white: '#E8ECF4', grey: '#9AA6BC', dgrey: '#56627A', steel: '#C3CAD6',
  orange: '#E07A2E', bronze: '#B8692A', yellow: '#F0B43C', red: '#DC2626', green: '#16A34A',
  blue: '#2563EB', cyan: '#6E9BF0', navy: '#1C2B57', gold: '#C99A3A', goldD: '#8E6A22',
  cell: '#1E3F99', cellL: '#3E6BD8', flame1: '#FFF1B8', flame2: '#F5A524', flame3: '#D9480F',
  void: '#0A0E17', panel: '#131A26', panel2: '#1C2536', line: '#2E3B52',
  text: '#E2E8F0', muted: '#8B9BB4', amberHi: '#F0A030',
};
function px(ctx, x, y, w = 1, h = 1, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

/* --- custom png hook cache --- */
const IMG_CACHE = {};
function customImage(id) {
  const path = ICON_PATHS[id];
  if (!path) return null;
  if (!IMG_CACHE[id]) {
    const img = new Image();
    img.onload = () => { IMG_CACHE[id].ready = true; scheduleRender(); };
    img.src = path;
    IMG_CACHE[id] = { img, ready: false };
  }
  return IMG_CACHE[id].ready ? IMG_CACHE[id].img : null;
}

/** Procedural 16×16 icons */
function drawIcon(ctx, key, opt = {}) {
  ctx.clearRect(0, 0, 16, 16);
  const o = PAL.outline;
  switch (key) {
    case 'solidMotor':
      px(ctx, 5, 1, 6, 11, o); px(ctx, 6, 1, 4, 11, PAL.steel); px(ctx, 6, 3, 4, 1, PAL.dgrey); px(ctx, 6, 8, 4, 1, PAL.dgrey);
      px(ctx, 7, 1, 1, 11, PAL.white); px(ctx, 5, 12, 6, 1, o); px(ctx, 6, 12, 4, 2, PAL.dgrey); px(ctx, 5, 14, 6, 1, PAL.grey);
      px(ctx, 7, 15, 2, 1, PAL.flame2); break;
    case 'liquidEngine':
      px(ctx, 5, 1, 6, 4, opt.color || PAL.orange); px(ctx, 6, 2, 1, 2, PAL.white); px(ctx, 4, 5, 8, 2, PAL.dgrey);
      px(ctx, 6, 7, 4, 2, PAL.grey); px(ctx, 5, 9, 6, 2, PAL.steel); px(ctx, 4, 11, 8, 2, PAL.grey); px(ctx, 3, 13, 10, 1, PAL.dgrey);
      px(ctx, 11, 6, 2, 3, PAL.yellow); px(ctx, 6, 14, 4, 1, PAL.flame2); px(ctx, 7, 15, 2, 1, PAL.flame3); break;
    case 'srb':
      px(ctx, 7, 0, 2, 2, PAL.white); px(ctx, 6, 2, 4, 1, PAL.white); px(ctx, 6, 3, 4, 10, PAL.white); px(ctx, 6, 3, 1, 10, PAL.grey);
      px(ctx, 9, 3, 1, 10, PAL.grey); px(ctx, 6, 7, 4, 1, PAL.dgrey); px(ctx, 6, 13, 4, 2, PAL.dgrey); px(ctx, 7, 15, 2, 1, PAL.flame2); break;
    case 'kick':
      px(ctx, 3, 5, 10, 6, PAL.grey); px(ctx, 3, 5, 10, 1, PAL.white); px(ctx, 6, 6, 4, 4, PAL.green); px(ctx, 7, 7, 1, 1, PAL.white);
      [[2, 11], [12, 11], [2, 3], [12, 3]].forEach(([x, y]) => { px(ctx, x, y, 2, 2, PAL.dgrey); });
      px(ctx, 2, 13, 2, 1, PAL.flame2); px(ctx, 12, 13, 2, 1, PAL.flame2); break;
    case 'none':
      px(ctx, 3, 3, 10, 10, PAL.dgrey); px(ctx, 4, 4, 8, 8, '#141a33');
      for (let i = 0; i < 6; i++) { px(ctx, 5 + i, 5 + i, 1, 1, PAL.red); px(ctx, 10 - i, 5 + i, 1, 1, PAL.red); } break;
    case 'fairing': {
      const w = opt.w || 8;
      for (let y = 0; y < 13; y++) { const ww = y < 6 ? Math.max(2, Math.round(w * (y + 1) / 7)) : w; px(ctx, 8 - ww / 2, 1 + y, ww, 1, y % 4 === 0 ? PAL.steel : PAL.white); }
      px(ctx, 8 - w / 2, 14, w, 1, PAL.dgrey); px(ctx, 8, 3, 1, 10, PAL.grey); break; }
    case 'propSolid':
      px(ctx, 3, 3, 10, 10, '#7a3526'); px(ctx, 4, 4, 8, 8, '#b5523b'); px(ctx, 7, 5, 2, 6, '#2a1210'); px(ctx, 5, 7, 6, 2, '#2a1210');
      px(ctx, 4, 4, 2, 1, '#e48a6c'); break;
    case 'propKerolox':
      px(ctx, 2, 2, 5, 12, PAL.navy); px(ctx, 3, 3, 3, 10, '#6fb6ff'); px(ctx, 9, 2, 5, 12, '#6b4416'); px(ctx, 10, 3, 3, 10, '#e0a03a');
      px(ctx, 3, 3, 1, 3, PAL.white); px(ctx, 10, 3, 1, 3, '#ffe0a0'); break;
    case 'propHydrolox':
      px(ctx, 2, 2, 5, 12, PAL.navy); px(ctx, 3, 3, 3, 10, '#6fb6ff'); px(ctx, 9, 1, 5, 14, '#2a6c80'); px(ctx, 10, 2, 3, 12, '#8fe3ff');
      px(ctx, 11, 5, 1, 1, PAL.white); px(ctx, 10, 6, 3, 2, PAL.white); break;
    case 'propHydrazine':
      px(ctx, 6, 1, 4, 2, PAL.dgrey); px(ctx, 4, 3, 8, 11, '#1f6b2a'); px(ctx, 5, 4, 6, 9, PAL.green); px(ctx, 5, 4, 1, 4, PAL.white);
      px(ctx, 6, 8, 4, 3, '#1f6b2a'); break;
    case 'busS':
      px(ctx, 4, 4, 8, 8, PAL.gold); px(ctx, 4, 4, 8, 1, PAL.yellow); px(ctx, 4, 11, 8, 1, PAL.goldD); px(ctx, 6, 6, 4, 4, PAL.goldD); break;
    case 'busM':
      px(ctx, 3, 3, 10, 10, PAL.cell); for (let x = 3; x < 13; x += 2) px(ctx, x, 3, 1, 10, PAL.cellL);
      px(ctx, 3, 3, 10, 1, PAL.steel); px(ctx, 3, 12, 10, 1, PAL.steel); px(ctx, 7, 0, 2, 3, PAL.grey); break;
    case 'busL':
      px(ctx, 2, 2, 12, 12, PAL.gold); px(ctx, 2, 2, 12, 1, PAL.yellow); for (let y = 4; y < 14; y += 3) px(ctx, 2, y, 12, 1, PAL.goldD);
      px(ctx, 9, 5, 4, 4, PAL.steel); px(ctx, 3, 9, 4, 4, PAL.dgrey); break;
    case 'battery': {
      const lv = opt.level || 2;
      px(ctx, 3, 4, 10, 9, PAL.dgrey); px(ctx, 6, 3, 4, 1, PAL.grey); px(ctx, 4, 5, 8, 7, '#141a33');
      for (let i = 0; i < lv; i++) px(ctx, 5, 10 - i * 2, 6, 1, PAL.green); break; }
    case 'solarUnfold':
      px(ctx, 2, 3, 12, 10, PAL.steel); px(ctx, 3, 4, 10, 8, PAL.cell); for (let x = 3; x < 13; x += 3) px(ctx, x, 4, 1, 8, PAL.cellL);
      px(ctx, 3, 8, 10, 1, PAL.cellL); break;
    case 'solarFold':
      px(ctx, 7, 6, 2, 4, PAL.grey);
      for (let i = 0; i < 3; i++) { px(ctx, 0 + i * 2, 4, 2, 8, i % 2 ? PAL.cellL : PAL.cell); px(ctx, 10 + i * 2, 4, 2, 8, i % 2 ? PAL.cellL : PAL.cell); }
      px(ctx, 6, 7, 4, 2, PAL.gold); break;
    case 'thruster':
      px(ctx, 6, 2, 4, 4, PAL.grey); px(ctx, 5, 6, 6, 2, PAL.dgrey); px(ctx, 6, 8, 4, 3, PAL.steel); px(ctx, 5, 11, 6, 1, PAL.grey);
      px(ctx, 7, 12, 2, 2, PAL.flame1); px(ctx, 7, 14, 2, 1, PAL.flame2); break;
    case 'thrusterBig':
      px(ctx, 5, 1, 6, 4, PAL.grey); px(ctx, 4, 5, 8, 2, PAL.dgrey); px(ctx, 4, 7, 8, 4, PAL.steel); px(ctx, 3, 11, 10, 1, PAL.grey);
      px(ctx, 5, 12, 6, 2, PAL.flame1); px(ctx, 6, 14, 4, 2, PAL.flame2); break;
    case 'antLGA':
      px(ctx, 7, 4, 2, 10, PAL.grey); px(ctx, 6, 2, 4, 3, PAL.white); px(ctx, 5, 14, 6, 1, PAL.dgrey); break;
    case 'antMGA':
      px(ctx, 7, 9, 2, 6, PAL.grey); px(ctx, 5, 1, 6, 9, PAL.steel); for (let y = 2; y < 9; y += 2) px(ctx, 6, y, 4, 1, PAL.dgrey);
      px(ctx, 12, 3, 1, 6, PAL.white); px(ctx, 11, 2, 3, 1, PAL.white); break;
    case 'antHGA':
      for (let y = 0; y < 5; y++) { const w = 12 - y * 2; px(ctx, 8 - w / 2, 3 + y, w, 1, y === 0 ? PAL.white : PAL.steel); }
      px(ctx, 7, 8, 2, 6, PAL.grey); px(ctx, 7, 1, 2, 2, PAL.yellow); px(ctx, 5, 14, 6, 1, PAL.dgrey); break;
    case 'antKa':
      for (let y = 0; y < 6; y++) { const w = 14 - y * 2; px(ctx, 8 - w / 2, 2 + y, w, 1, y === 0 ? PAL.white : PAL.steel); }
      px(ctx, 7, 8, 2, 6, PAL.grey); px(ctx, 7, 0, 2, 2, PAL.cyan); px(ctx, 4, 14, 8, 1, PAL.dgrey); break;
    case 'instMag':
      px(ctx, 2, 7, 9, 1, PAL.grey); px(ctx, 10, 5, 4, 5, PAL.red); px(ctx, 10, 5, 2, 5, PAL.blue); px(ctx, 3, 4, 3, 7, PAL.steel);
      px(ctx, 12, 2, 1, 2, PAL.yellow); px(ctx, 12, 11, 1, 2, PAL.yellow); break;
    case 'instGamma':
      px(ctx, 4, 4, 8, 9, PAL.steel); px(ctx, 5, 5, 6, 7, PAL.navy); px(ctx, 6, 7, 4, 3, PAL.cyan);
      px(ctx, 1, 1, 1, 1, PAL.yellow); px(ctx, 2, 2, 1, 1, PAL.yellow); px(ctx, 3, 3, 1, 1, PAL.yellow); px(ctx, 14, 1, 1, 1, PAL.yellow); px(ctx, 13, 2, 1, 1, PAL.yellow); break;
    case 'instNeutron':
      px(ctx, 5, 2, 6, 12, PAL.steel); px(ctx, 6, 3, 4, 10, '#3a2a6b'); px(ctx, 7, 5, 2, 2, PAL.white); px(ctx, 7, 9, 2, 2, PAL.cyan);
      px(ctx, 2, 7, 2, 2, PAL.cyan); px(ctx, 12, 4, 2, 2, PAL.white); break;
    case 'instAlpha':
      px(ctx, 4, 6, 8, 8, PAL.steel); px(ctx, 5, 7, 6, 6, '#6b2a3a'); px(ctx, 7, 9, 2, 2, PAL.red);
      px(ctx, 7, 2, 2, 2, PAL.red); px(ctx, 6, 3, 1, 1, PAL.red); px(ctx, 9, 3, 1, 1, PAL.red); break;
    case 'instDoppler':
      px(ctx, 2, 7, 2, 2, PAL.white);
      for (let r = 0; r < 3; r++) { const x = 5 + r * 3; px(ctx, x, 5 - r, 1, 6 + r * 2, PAL.cyan); } break;
    default:
      px(ctx, 4, 4, 8, 8, PAL.grey);
  }
}
function makeIconCanvas(id, key, opt) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16; c.className = 'icon';
  const ctx = c.getContext('2d');
  const img = id && customImage(id);
  if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 16, 16); }
  else drawIcon(ctx, key, opt);
  return c;
}

/* --- shared scene background --- */
const STARS = Array.from({ length: 90 }, (_, i) => ({ x: (i * 73.13) % 140, y: (i * 41.7 + i * i * 0.37) % 160, b: i % 3 }));
function drawStars(ctx, W, H, shift = 0) {
  for (const s of STARS) px(ctx, s.x % W, (s.y + shift) % H, 1, 1, s.b === 0 ? '#E2E8F0' : s.b === 1 ? '#8B9BB4' : '#3F4B63');
}

/* ---------------- ROCKET RENDERER ----------------
   Draws on a low-res buffer (PW×PH) then scales ×SCALE onto the main canvas.
   Returns component boxes (pixel coords) for call-out labels.                */
const PW = 140, PH = 160, SCALE = 4;
function renderRocketPixels(ctx, ev, opts = {}) {
  const lv = ev.lv;
  const groundY = PH - 8;
  const parts = [];
  // total length
  const fair = lv.fairing;
  const totalLen = lv.stages.reduce((a, s) => a + s.len, 0) + fair.len;
  const ppm = Math.min(5, (groundY - (opts.noBackground ? 4 : 26)) / Math.max(totalLen, 1));
  const cx = opts.cx || 46;
  const s1dia = lv.stages[0] ? lv.stages[0].eng.dia : 2.4;

  if (!opts.noBackground) {
    ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, PW, PH);
    drawStars(ctx, PW, PH);
    // ground & pad
    px(ctx, 0, groundY, PW, PH - groundY, PAL.panel); px(ctx, 0, groundY, PW, 1, PAL.line);
    px(ctx, cx - 16, groundY - 2, 32, 2, PAL.dgrey); px(ctx, cx - 16, groundY - 2, 32, 1, PAL.grey);
    // tower
    const tH = Math.min(groundY - 10, totalLen * ppm * 0.85);
    px(ctx, cx - 26, groundY - tH, 3, tH, '#7a2a2a');
    for (let y = groundY - tH; y < groundY; y += 4) px(ctx, cx - 26, y, 3, 1, '#c24a3a');
  }

  let y = groundY - 2 - (opts.lift || 0);
  // SRBs
  const srbLen = SRB.len * ppm, srbW = Math.max(3, Math.round(SRB.dia * ppm));
  const s1w = Math.max(5, Math.round(s1dia * ppm));
  if (lv.nSRB > 0 && !opts.hideSRB && (opts.onlyStage == null || opts.onlyStage === 0)) {
    for (let i = 0; i < lv.nSRB; i++) {
      const side = i % 2 === 0 ? -1 : 1, k = Math.floor(i / 2);
      const x = side < 0 ? cx - s1w / 2 - srbW - k * (srbW - 1) : cx + s1w / 2 + k * (srbW - 1);
      const top = y - srbLen;
      px(ctx, x, top + 2, srbW, srbLen - 2, PAL.white); px(ctx, x, top + 2, 1, srbLen - 2, PAL.grey);
      px(ctx, x + 1, top, srbW - 2, 2, PAL.white); px(ctx, x, top + srbLen * 0.5, srbW, 1, PAL.dgrey);
      px(ctx, x, y, srbW, 2, PAL.dgrey);
      if (i === 0) parts.push({ kind: 'srb', key: 'srb', x0: x, x1: x + srbW, y0: top, y1: y, label: `${lv.nSRB}× Aerojet SRB`, sub: `${tonnes(lv.nSRB * (SRB.engineMass + SRB.propMax))} · Ø${SRB.dia} m` });
      if (opts.flame) drawFlame(ctx, x + srbW / 2, y + 2, srbW, opts.flame);
    }
  }

  // stages
  lv.stages.forEach((st, i) => {
    if (opts.dropStages && i < opts.dropStages) return;
    if (opts.onlyStage != null && i !== opts.onlyStage) return;
    const e = st.eng;
    const h = Math.max(4, Math.round(st.len * ppm));
    const w = Math.max(5, Math.round(e.dia * ppm));
    const x = Math.round(cx - w / 2);
    const top = y - h;
    const propC = (byId(PROPELLANTS, st.prop) || {}).color || '#888';
    // nozzle
    const nzH = Math.max(2, Math.round(h * 0.12));
    if (i === 0 || opts.dropStages === i || opts.onlyStage === i) {
      px(ctx, x + 1, y - nzH, w - 2, nzH, PAL.dgrey); px(ctx, x, y - 1, w, 1, PAL.grey);
      if (opts.flame && st.compatible) drawFlame(ctx, cx, y, w, opts.flame);
    }
    const bodyTop = top, bodyH = h - (i === 0 || opts.dropStages === i || opts.onlyStage === i ? nzH : 0);
    // body
    px(ctx, x, bodyTop, w, bodyH, e.color);
    px(ctx, x, bodyTop, 1, bodyH, PAL.white);
    px(ctx, x + w - 1, bodyTop, 1, bodyH, PAL.dgrey);
    // cut-away showing propellant level
    const win = Math.max(1, Math.floor(w / 3));
    const wx = x + w - win - 1;
    px(ctx, wx, bodyTop + 1, win, bodyH - 2, '#141a33');
    const shownFill = e.tankMassMax > 0 ? 1 : st.load;
    const fh = Math.round((bodyH - 2) * shownFill);
    px(ctx, wx, bodyTop + 1 + (bodyH - 2 - fh), win, fh, st.compatible ? propC : PAL.red);
    // bands
    px(ctx, x, bodyTop, w, 1, PAL.dgrey);
    if (bodyH > 10) px(ctx, x, bodyTop + Math.round(bodyH / 2), w - win - 1, 1, PAL.grey);
    parts.push({ kind: 'stage', key: 'stage:' + st.key, idx: i, x0: x, x1: x + w, y0: top, y1: y,
      label: `${t('stageLabel')} ${i + 1}: ${e.name}`,
      sub: `${tonnes(st.dryMass + st.propMass)} · Ø${e.dia} m · ${Math.round(st.load * 100)}% ${byId(PROPELLANTS, st.prop).name}` });
    y = top;
    // interstage band
    if (i < lv.stages.length - 1) { px(ctx, cx - w / 2, y - 1, w, 1, PAL.dgrey); }
  });

  // payload + fairing
  if (!opts.hideFairing && opts.onlyStage == null) {
    const fh = Math.max(6, Math.round(fair.len * ppm));
    const fw = Math.max(6, Math.round(fair.dia * ppm));
    const top = y - fh;
    const ogive = Math.round(fh * 0.45);
    for (let r = 0; r < fh; r++) {
      const yy = top + r;
      const ww = r < ogive ? Math.max(2, Math.round(fw * Math.sqrt((r + 1) / ogive))) : fw;
      px(ctx, cx - ww / 2, yy, ww, 1, PAL.white);
      px(ctx, cx - ww / 2, yy, 1, 1, PAL.steel);
      px(ctx, cx + ww / 2 - 1, yy, 1, 1, PAL.grey);
    }
    // boat-tail to stage below
    px(ctx, cx - fw / 2, y - 1, fw, 1, PAL.dgrey);
    // spacecraft silhouette window
    const sw = Math.max(2, Math.round(fw * 0.4)), sh = Math.max(2, Math.round((fh - ogive) * 0.6));
    px(ctx, cx - sw / 2, y - 2 - sh, sw, sh, PAL.gold);
    parts.push({ kind: 'fairing', key: 'fairing', x0: cx - fw / 2, x1: cx + fw / 2, y0: top, y1: y,
      label: fair.name, sub: `${fmt(fair.mass)} kg · ${fair.volume} m³ · S/C ${fmt(ev.sc.mass)} kg` });
    y = top;
  } else if (!opts.noPayload && opts.onlyStage == null) {
    const sc = 5;
    px(ctx, cx - sc / 2, y - sc, sc, sc, PAL.gold);
  }
  return { parts, ppm, totalLen, topY: y, groundY };
}
function drawFlame(ctx, cx, y, w, phase) {
  const len = 6 + Math.round(Math.abs(Math.sin(phase * 7)) * 4);
  for (let r = 0; r < len; r++) {
    const ww = Math.max(1, Math.round(w * (1 - r / len) * 0.9));
    const c = r < len * 0.3 ? PAL.flame1 : r < len * 0.65 ? PAL.flame2 : PAL.flame3;
    px(ctx, cx - ww / 2, y + r, ww, 1, c);
  }
}

/* ---------------- SPACECRAFT RENDERER ---------------- */
function renderSpacecraftPixels(ctx, ev, opts = {}) {
  const m = ev.m;
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, PW, PH);
  drawStars(ctx, PW, PH);
  // planet
  if (m.id === 'lunar') {
    ctx.fillStyle = '#8b8f9e'; ctx.beginPath(); ctx.arc(128, 160, 46, 0, Math.PI * 2); ctx.fill();
    [[110, 128, 4], [128, 138, 6], [100, 146, 3], [140, 124, 3]].forEach(([x, y, r]) => { ctx.fillStyle = '#6c7080'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  } else {
    ctx.fillStyle = PAL.blue; ctx.beginPath(); ctx.arc(128, 168, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.green; ctx.fillRect(98, 128, 14, 6); ctx.fillRect(118, 122, 10, 5);
  }
  return drawSpacecraftSprite(ctx, ev.sc, 62, 78, { ...opts, dge: (state.sc.instruments.dge || 0) > 0 });
}

/**
 * Composite pixel-art spacecraft (bus + subsystems) — the SINGLE source of truth
 * for the spacecraft look. Used by the Phase 1 blueprint AND the Phase 2 flight
 * renderer (via HangarAPI.buildFlightSprites), so the ship flying in orbit is
 * pixel-identical to the one assembled in the hangar.
 *   sc   = computeSC() result,  cx/cy = centre in low-res pixels
 *   opts = { puff, dge }
 */
function drawSpacecraftSprite(ctx, sc, cx, cy, opts = {}) {
  const parts = [];
  const dims = { small: [18, 18], medium: [26, 24], large: [38, 40] }[sc.bus.id];
  const [bw, bh] = dims;
  const bx = Math.round(cx - bw / 2), by = Math.round(cy - bh / 2);

  // ---- instrument booms (behind bus) ----
  const boomDirs = { er: [-1, -1], grs: [1, -1], ns: [-1, 1], aps: [1, 1] };
  for (const it of sc.instList) {
    if (it.ins.id === 'dge') continue;
    const [dx, dy] = boomDirs[it.ins.id];
    const L1 = it.tier === 2 ? 20 : 16;
    const sx = dx < 0 ? bx : bx + bw, sy = dy < 0 ? by : by + bh;
    for (let k = 0; k < L1; k++) px(ctx, sx + dx * k, sy + dy * k, 1, 1, PAL.grey);
    const ex = sx + dx * L1, ey = sy + dy * L1;
    const sz = it.tier === 2 ? 10 : 8;
    const img = customImage(it.ins.id);
    if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, ex - sz / 2, ey - sz / 2, sz, sz); }
    else { ctx.save(); ctx.translate(ex - sz / 2, ey - sz / 2); ctx.scale(sz / 16, sz / 16); drawIcon(ctx, it.ins.icon); ctx.restore(); }
    if (it.tier === 2) { px(ctx, ex - sz / 2 - 1, ey - sz / 2 - 1, sz + 2, 1, PAL.yellow); }
    parts.push({ key: 'inst:' + it.ins.id, x0: ex - sz / 2, x1: ex + sz / 2, y0: ey - sz / 2, y1: ey + sz / 2, label: `${it.ins.short}${it.tier === 2 ? ' ★' : ''}`,
      sub: `${fmt(it.ins.mass * (it.tier === 2 ? CONFIG.tier[2].mass : 1), 1)} kg · ${Math.round(it.pts)} pts`, left: dx < 0 });
  }

  // ---- foldable solar wings ----
  if (sc.sol && sc.sol.deploy) {
    const panels = sc.sol.watts >= 600 ? 4 : 3;
    for (let n = 0; n < sc.nSol; n++) {
      const yy = cy - 4 + (n - (sc.nSol - 1) / 2) * 11;
      for (const side of [-1, 1]) {
        const sx = side < 0 ? bx - 3 : bx + bw;
        px(ctx, sx, yy + 3, 3, 1, PAL.grey);
        for (let p = 0; p < panels; p++) {
          const x = side < 0 ? sx - (p + 1) * 7 : sx + 3 + p * 7;
          px(ctx, x, yy, 6, 8, PAL.cell); px(ctx, x, yy, 6, 1, PAL.steel); px(ctx, x + 2, yy + 1, 1, 7, PAL.cellL); px(ctx, x, yy + 4, 6, 1, PAL.cellL);
        }
      }
    }
    parts.push({ key: 'solar', x0: bx - 3 - panels * 7, x1: bx + bw + 3 + panels * 7, y0: cy - 6, y1: cy + 2, label: `${sc.nSol}× ${sc.sol.name}`, sub: `${fmt(sc.genPeak)} W`, left: true });
  }

  // ---- bus body ----
  const busImg = customImage(sc.bus.id);
  if (busImg) { ctx.imageSmoothingEnabled = false; ctx.drawImage(busImg, bx, by, bw, bh); }
  else if (sc.bus.id === 'medium') {
    px(ctx, bx, by, bw, bh, '#3a4470'); px(ctx, bx, by, bw, 2, PAL.steel); px(ctx, bx, by + bh - 2, bw, 2, PAL.steel);
  } else {
    px(ctx, bx, by, bw, bh, PAL.gold); px(ctx, bx, by, bw, 1, PAL.yellow); px(ctx, bx + bw - 1, by, 1, bh, PAL.goldD);
    for (let yy = by + 4; yy < by + bh; yy += 5) px(ctx, bx + 1, yy, bw - 2, 1, PAL.goldD);
  }
  // body-mounted (unfoldable) panels
  if (sc.sol && !sc.sol.deploy) {
    const faces = Math.min(sc.nSol, 4);
    const cover = Math.min(1, faces / 2);
    const cw = Math.round((bw - 2) * cover);
    px(ctx, bx + 1, by + 2, cw, bh - 4, PAL.cell);
    for (let x = bx + 2; x < bx + 1 + cw; x += 3) px(ctx, x, by + 2, 1, bh - 4, PAL.cellL);
    for (let yy = by + 4; yy < by + bh - 2; yy += 4) px(ctx, bx + 1, yy, cw, 1, PAL.cellL);
    parts.push({ key: 'solar', x0: bx, x1: bx + cw, y0: by + 2, y1: by + bh - 2, label: `${sc.nSol}× ${sc.sol.name}`, sub: `${fmt(sc.genPeak)} W · eff 70%`, left: true });
  }
  parts.push({ key: 'bus', x0: bx, x1: bx + bw, y0: by, y1: by + bh, label: sc.bus.name, sub: `${fmt(sc.mass)} kg · ${sc.slots}/${sc.slotsMax} slots` });

  // battery cut-away
  if (sc.bat) {
    const cells = Math.min(6, sc.bat.level + 1);
    const ww = cells * 2 + 2, hh = 5;
    const wx = Math.round(cx - ww / 2), wy = by + bh - hh - 2;
    px(ctx, wx, wy, ww, hh, PAL.outline);
    for (let i = 0; i < cells; i++) px(ctx, wx + 1 + i * 2, wy + 1, 1, hh - 2, sc.batFits ? PAL.green : PAL.red);
    parts.push({ key: 'battery', x0: wx, x1: wx + ww, y0: wy, y1: wy + hh, label: `BATT ${sc.bat.name}`, sub: `${fmt(sc.usableWh)} Wh usable` });
  }

  // ---- thrusters ----
  if (sc.act) {
    const big = sc.act.icon === 'thrusterBig';
    const n = sc.act.id === 'h20x8' ? 8 : sc.act.id === 'td339' ? 3 : 4;
    const pts = [[bx, by + bh], [bx + bw - 2, by + bh], [bx, by - 2], [bx + bw - 2, by - 2], [bx - 2, cy], [bx + bw, cy], [cx - 1, by + bh], [cx - 1, by - 2]];
    for (let i = 0; i < n; i++) {
      const [x, y] = sc.act.id === 'td339' ? [[bx + 2, by + bh], [cx - 1, by + bh], [bx + bw - 4, by + bh]][i] : pts[i];
      px(ctx, x, y, big ? 3 : 2, big ? 3 : 2, PAL.dgrey);
      if (opts.puff && (Math.floor(opts.puff * 4) + i) % 3 === 0) px(ctx, x, y + (big ? 3 : 2), 2, 2, PAL.flame1);
    }
    if (sc.act.id === 'td339') { ctx.fillStyle = PAL.steel; ctx.beginPath(); ctx.arc(cx, by + bh + 6, 4, 0, 7); ctx.fill(); }
    parts.push({ key: 'act', x0: bx, x1: bx + bw, y0: by + bh - 1, y1: by + bh + 4, label: sc.act.name, sub: `≤ ${fmt(sc.act.capKg)} kg`, left: true });
  }

  // ---- telecom on top ----
  if (sc.tel) {
    const topY = by;
    const img = customImage(sc.tel.id);
    let tx0 = cx - 4, tx1 = cx + 4, ty0 = topY - 12;
    if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, cx - 6, topY - 13, 12, 12); }
    else if (sc.tel.id === 'lga') {
      px(ctx, cx, topY - 8, 1, 8, PAL.grey); px(ctx, cx - 1, topY - 10, 3, 3, PAL.white); ty0 = topY - 10;
    } else if (sc.tel.id === 'lpS') {
      px(ctx, cx, topY - 4, 1, 4, PAL.grey); px(ctx, cx - 2, topY - 14, 5, 10, PAL.steel);
      for (let yy = topY - 13; yy < topY - 4; yy += 2) px(ctx, cx - 1, yy, 3, 1, PAL.dgrey);
      px(ctx, cx, topY - 17, 1, 3, PAL.white); ty0 = topY - 17;
    } else {
      const r = sc.tel.id === 'hgaKa' ? 11 : 8;
      px(ctx, cx, topY - 5, 1, 5, PAL.grey);
      // Parabolic dish opens OUTWARD (away from the bus): narrow vertex on the mast, wide rim on top
      for (let k = 0; k < 4; k++) { const w = r * 2 - (3 - k) * 4; px(ctx, cx - w / 2, topY - 6 - k, w, 1, k === 3 ? PAL.white : PAL.steel); }
      // feed horn on struts in front of the dish (further out)
      px(ctx, cx - Math.round(r * 0.6), topY - 12, 1, 3, PAL.grey); px(ctx, cx + Math.round(r * 0.6), topY - 12, 1, 3, PAL.grey);
      px(ctx, cx - Math.round(r * 0.6), topY - 13, Math.round(r * 1.2) + 1, 1, PAL.grey);
      px(ctx, cx - 1, topY - 15, 3, 2, sc.tel.id === 'hgaKa' ? PAL.cyan : PAL.yellow);
      tx0 = cx - r; tx1 = cx + r; ty0 = topY - 15;
    }
    // DGE radio waves
    if (opts.dge) {
      const ok = sc.tel.transponder;
      for (let k = 1; k <= 3; k++) {
        ctx.strokeStyle = ok ? PAL.cyan : PAL.red; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx + 0.5, ty0, 3 + k * 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
      parts.push({ key: 'inst:dge', x0: cx + 4, x1: cx + 8, y0: ty0 - 14, y1: ty0 - 10, label: 'DGE (Doppler)', sub: ok ? 'S-band ✓' : '✗ transponder' });
    }
    parts.push({ key: 'tel', x0: tx0, x1: tx1, y0: ty0, y1: topY, label: sc.tel.name, sub: isFinite(sc.linkDb) ? `${fmt(sc.linkDb, 1)} dB` : '' });
  }
  return parts;
}

/* --- shared call-out drawing on hi-res canvas --- */
function drawCallouts(ctx, parts, scale) {
  // Blueprint call-outs show equipment NAMES only — the numbers live in the side panels.
  const right = parts.filter(p => !p.left).sort((a, b) => a.y0 - b.y0);
  const left = parts.filter(p => p.left).sort((a, b) => a.y0 - b.y0);
  const place = (list, colX, align) => {
    let lastY = 44;
    for (const p of list) {
      const ty = Math.max(lastY + 24, ((p.y0 + p.y1) / 2) * scale);
      lastY = ty;
      const ax = (align === 'left' ? p.x1 : p.x0) * scale + (align === 'left' ? 2 : -2);
      const ay = ((p.y0 + p.y1) / 2) * scale;
      ctx.strokeStyle = 'rgba(240,160,48,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(colX + (align === 'left' ? -8 : 8), ty); ctx.lineTo(colX, ty); ctx.stroke();
      ctx.fillStyle = PAL.amberHi; ctx.fillRect(ax - 2, ay - 2, 4, 4);
      ctx.textAlign = align;
      ctx.font = '700 12px "Be Vietnam Pro", sans-serif';
      const tw = ctx.measureText(p.label).width;
      ctx.fillStyle = 'rgba(10,14,23,0.86)';
      ctx.fillRect(align === 'left' ? colX - 3 : colX - tw - 3, ty - 12, tw + 6, 18);
      ctx.fillStyle = PAL.text;
      ctx.fillText(p.label, colX, ty + 2);
    }
  };
  place(right, ctx.canvas.width - 236, 'left');
  place(left, 230, 'right');
  ctx.textAlign = 'left';
}

/* =====================================================================
   7. UI
   ===================================================================== */
let lastEval = null;
let renderQueued = false;
function scheduleRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); } }

const $ = id => document.getElementById(id);

function srcBadge(src) { return `<span class="src ${src === 'sheet' ? 'sheet' : 'est'}">${src === 'sheet' ? 'SHEET' : 'EST'}</span>`; }
const kgTxt = v => (v >= 10000 ? tonnes(v) : `${fmt(v, v < 10 && v % 1 ? 1 : 0)} kg`);
const moneyTxt = c => `$${fmt(c, c < 10 ? 1 : 0)}M`;

/* ---------- selection / install feedback state ---------- */
const UI = { justPicked: null };
function armPick(uid, fxKey) {
  UI.justPicked = uid || null;
  if (fxKey) triggerInstallFx(fxKey);
}

/**
 * Compact equipment card: pixel icon + name + core numbers (mass · key stat · cost).
 * Full description & physics live behind the [i] button (part inspector).
 */
function makeCard({ uid, id, iconKey, iconOpt, title, mass, stat, cost, selected, disabled, info, onClick, extra, fxKey }) {
  const el = document.createElement('div');
  el.className = 'card' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '');
  if (selected && uid && UI.justPicked === uid) el.classList.add('just-picked');
  const top = document.createElement('div'); top.className = 'card-top';
  top.appendChild(makeIconCanvas(id, iconKey, iconOpt));
  const nm = document.createElement('div'); nm.className = 'name'; nm.innerHTML = title;
  top.appendChild(nm);
  el.appendChild(top);
  const nums = document.createElement('div'); nums.className = 'nums';
  nums.innerHTML = (mass != null ? `<span>${mass}</span>` : '') + (stat ? `<span class="stat-k">${stat}</span>` : '') +
    (cost != null ? `<span class="cost">${moneyTxt(cost)}</span>` : '');
  if (nums.innerHTML) el.appendChild(nums);
  if (info) el.appendChild(infoButton(info));
  if (extra) el.appendChild(extra);
  if (onClick && !disabled) el.addEventListener('click', () => { if (!selected) armPick(uid, fxKey); onClick(); });
  if (disabled && typeof disabled === 'string') el.title = disabled;
  return el;
}
function infoButton(info) {
  const b = document.createElement('button');
  b.className = 'info-btn'; b.type = 'button'; b.textContent = 'i'; b.title = t('infoTip');
  b.setAttribute('aria-label', t('infoTip'));
  b.addEventListener('click', e => { e.stopPropagation(); openInfo(info); });
  return b;
}
function section(title, sub, hint, key) {
  const s = document.createElement('div'); s.className = 'section';
  if (key) s.dataset.sec = key;
  s.innerHTML = `<h3>${title}${sub ? `<small>${sub}</small>` : ''}</h3>${hint ? `<div class="hint">${hint}</div>` : ''}`;
  return s;
}
function cardsWrap(sec) { const c = document.createElement('div'); c.className = 'cards'; sec.appendChild(c); return c; }

/* ---------- Part inspector (info modal) ---------- */
let currentInfo = null;
function openInfo(fn) { currentInfo = fn; renderInfo(); $('infoDrawer').classList.add('open'); $('infoDrawer').setAttribute('aria-hidden', 'false'); }
function closeInfo() { currentInfo = null; const d = $('infoDrawer'); if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); } }
function renderInfo() {
  if (!currentInfo) return;
  const d = currentInfo();
  const meta = (d.sub ? `<span>${d.sub}</span>` : '') + (d.src ? srcBadge(d.src) : '') +
    (d.est && d.est.length ? `<span>${t('estFields')}: ${d.est.join(', ')}</span>` : '');
  $('infoDrawer').innerHTML =
    `<div class="insp-head"><span class="insp-cat">${t('cat_' + d.cat)}</span><button class="insp-close" id="infoClose" type="button" aria-label="Close">X</button></div>
     <div class="insp-body">
       <div class="insp-hero"><span id="inspIcon"></span><div><h2>${d.title}</h2><div class="insp-meta">${meta}</div></div></div>
       <table class="insp-specs">${d.specs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
       ${d.desc ? `<p class="insp-desc">${d.desc}</p>` : ''}
       <div class="insp-phys"><span class="lbl">${t('physTitle')}</span>${t('phy_' + d.cat)}</div>
     </div>`;
  const ic = makeIconCanvas(d.id, d.iconKey, d.iconOpt); ic.className = '';
  $('inspIcon').replaceWith(ic);
  $('infoClose').addEventListener('click', closeInfo);
}

/* ---------- inspector data builders ---------- */
function engineInfo(e) {
  const p = byId(PROPELLANTS, e.prop);
  return {
    cat: e.id === SRB.id ? 'srb' : 'engine', id: e.id, iconKey: e.icon, iconOpt: { color: e.color },
    title: e.name, sub: `${e.engineType} · ${e.stageClass}`, src: e.src, est: e.estFields,
    specs: [
      [t('thrust'), `${fmt(e.thrustVac, e.thrustVac < 10 ? 3 : 0)} kN`],
      [t('isp'), `${e.ispVac} s${e.ispSL ? ` (SL ${e.ispSL} s)` : ''}`],
      [t('empty'), `${fmt(e.engineMass + e.tankMassMax)} kg`],
      [t('propMax'), `${fmt(e.propMax)} kg · ${p.name}`],
      [t('dims'), `Ø${e.dia} × ${e.len} m`],
      [t('burn'), `${e.burn} s`],
      [t('costLbl'), moneyTxt(e.cost)],
    ],
    desc: e.desc,
  };
}
function propInfo(p) {
  return {
    cat: 'prop', id: p.id, iconKey: p.icon, title: p.name, src: p.src,
    specs: [[t('density'), `${fmt(p.density)} kg/m³`], [t('isp'), p.ispRange], [t('costKg'), `$${p.costPerKg}/kg`]],
    desc: p.desc,
  };
}
function fairingInfo(f) {
  return {
    cat: 'fairing', id: f.id, iconKey: f.icon, iconOpt: { w: Math.round(4 + f.dia * 1.6) }, title: f.name, src: f.src,
    specs: [[t('mass'), `${fmt(f.mass)} kg`], [t('dims'), `Ø${f.dia} × ${f.len} m`], [t('volume'), `${f.volume} m³`], [t('costLbl'), moneyTxt(f.cost)]],
    desc: f.desc,
  };
}
function busInfo(b) {
  return {
    cat: 'bus', id: b.id, iconKey: b.icon, title: b.name, sub: b.dims, src: b.src,
    specs: [[t('mass'), `${fmt(b.baseMass)} kg`], [t('maxMass'), `${fmt(b.maxMass)} kg`], [t('slots'), b.slots],
      [t('power'), `${b.basePower} W`], [t('volume'), `${b.volume} m³`], [t('propSc'), `${b.propKg} kg`], [t('costLbl'), moneyTxt(b.cost)]],
    desc: b.desc,
  };
}
function batteryInfo(b) {
  return {
    cat: 'battery', id: b.id, iconKey: b.icon, iconOpt: { level: b.level }, title: b.name, sub: `${t('sheetTagLbl')}: ${b.sheetTag}`, src: b.src,
    specs: [[t('cap'), `${b.capWh} Wh`], [t('mass'), `${b.mass} kg`], [t('fitsShort'), b.fits.join(', ')], [t('costLbl'), moneyTxt(b.cost)]],
    desc: t('bat_desc'),
  };
}
function solarInfo(p) {
  return {
    cat: 'solar', id: p.id, iconKey: p.icon, title: p.name, sub: p.deploy ? t('deployable') : t('bodyMounted'), src: p.src,
    specs: [[t('power'), `${p.watts} W`], ['η', `${Math.round(p.eff * 100)}%`], [t('mass'), `${p.mass} kg`], [t('costLbl'), moneyTxt(p.cost)]],
    desc: p.desc,
  };
}
function actInfo(a) {
  return {
    cat: 'act', id: a.id, iconKey: a.icon, title: a.name, src: a.src,
    specs: [[t('control'), `${fmt(a.capKg)} kg`], [t('thrustMan'), `${fmt(a.thrustN)} N · Isp ${a.isp} s`], [t('mass'), `${a.mass} kg`], [t('power'), `${a.power} W`], [t('costLbl'), moneyTxt(a.cost)]],
    desc: a.desc,
  };
}
function telInfo(x) {
  return {
    cat: 'tel', id: x.id, iconKey: x.icon, title: x.name, src: x.src,
    specs: [[t('rate0'), `${fmt(x.rate0Kbps, x.rate0Kbps < 10 ? 2 : 0)} kbps`], [t('transponder'), x.transponder ? t('yes') : t('no')],
      [t('mass'), `${x.mass} kg`], [t('power'), `${x.power} W`], [t('costLbl'), moneyTxt(x.cost)]],
    desc: x.desc,
  };
}
function instInfo(ins) {
  const tier = state.sc.instruments[ins.id] || 0;
  const k = tier === 2 ? CONFIG.tier[2] : { mass: 1, power: 1, data: 1, cost: 1, sci: 1 };
  return {
    cat: ins.id === 'dge' ? 'dge' : 'inst', id: ins.id, iconKey: ins.icon, title: ins.name, sub: ins.short, src: ins.src,
    specs: [[t('tierLbl'), [t('tierOff'), t('tierStd'), t('tierEnh')][tier]], [t('science'), `${Math.round(ins.sci * k.sci)} pts`],
      [t('mass'), `${fmt(ins.mass * k.mass, 1)} kg`], [t('power'), `${fmt(ins.power * k.power, 1)} W`],
      [t('data'), `${fmt(ins.dataKbps * k.data, 2)} kbps`], [t('slotLbl'), ins.slot], [t('costLbl'), moneyTxt(ins.cost * k.cost)]],
    desc: ins.desc,
  };
}

/* ---------- Part 1 inventory ---------- */
function buildLVInventory(root) {
  // Stages
  for (const slot of STAGE_SLOTS) {
    const sec = section(`${t('secStages')} · ${slot.label}`, '', '', 'stage:' + slot.key);
    const wrap = cardsWrap(sec);
    const st = state.lv.stages[slot.key];
    for (const opt of slot.options) {
      if (opt === null) {
        wrap.appendChild(makeCard({ uid: slot.key + ':none', id: null, iconKey: 'none', title: t('none'), stat: t('noneDesc'),
          selected: st.engine === null, onClick: () => { st.engine = null; update(); } }));
        continue;
      }
      const e = engineById(opt);
      wrap.appendChild(makeCard({
        uid: slot.key + ':' + e.id, id: e.id, iconKey: e.icon, iconOpt: { color: e.color }, title: e.name,
        mass: kgTxt(e.engineMass + e.tankMassMax), stat: `${fmt(e.thrustVac, e.thrustVac < 10 ? 2 : 0)} kN`, cost: e.cost,
        selected: st.engine === e.id, fxKey: 'stage:' + slot.key, info: () => engineInfo(e),
        onClick: () => { st.engine = e.id; st.prop = e.prop; st.load = 1; update(); },
      }));
    }
    root.appendChild(sec);
  }

  // SRB
  const ssec = section(t('secSRB'), '', '', 'srb');
  const sw = cardsWrap(ssec);
  const stepper = document.createElement('div'); stepper.className = 'stepper';
  stepper.innerHTML = `<button data-d="-1">−</button><b>${state.lv.srbCount}</b><button data-d="1">+</button><span class="tag">/ ${SRB.maxCount}</span>`;
  stepper.querySelectorAll('button').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const d = Number(b.dataset.d);
    const n = Math.max(0, Math.min(SRB.maxCount, state.lv.srbCount + d));
    if (n > state.lv.srbCount) armPick('srb', 'srb');
    state.lv.srbCount = n; update();
  }));
  sw.appendChild(makeCard({ uid: 'srb', id: SRB.id, iconKey: SRB.icon, title: SRB.name,
    mass: kgTxt(SRB.engineMass + SRB.propMax), stat: `${fmt(SRB.thrustVac)} kN`, cost: SRB.cost,
    selected: state.lv.srbCount > 0, info: () => engineInfo(SRB), extra: stepper }));
  root.appendChild(ssec);

  // Propellant & load
  const psec = section(t('secProp'), '', t('hintProp'), 'prop');
  const stages = buildStages();
  stages.forEach((st, i) => {
    const row = document.createElement('div'); row.className = 'prop-row';
    const e = st.eng;
    row.innerHTML = `<div class="prop-head">${t('stageLabel')} ${i + 1}: ${e.name} <span class="${st.compatible ? 'ok' : 'bad'}">${st.compatible ? '✓ ' + t('compatible') : '✗ ' + t('incompatible')}</span></div>`;
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const p of PROPELLANTS) {
      const c = document.createElement('div');
      const sel = state.lv.stages[st.key].prop === p.id;
      c.className = 'chip' + (sel ? (p.id === e.prop ? ' selected' : ' bad') : '');
      const ic = makeIconCanvas(p.id, p.icon); c.appendChild(ic);
      c.insertAdjacentHTML('beforeend', `<span>${p.name}<br><small style="color:var(--muted)">${p.density} kg/m³ · $${p.costPerKg}/kg</small></span>`);
      c.appendChild(infoButton(() => propInfo(p)));
      c.addEventListener('click', () => { if (!sel) armPick(null, 'stage:' + st.key); state.lv.stages[st.key].prop = p.id; update(); });
      chips.appendChild(c);
    }
    row.appendChild(chips);
    const sr = document.createElement('div'); sr.className = 'slider-row';
    sr.innerHTML = `<input type="range" min="0" max="100" step="1" value="${Math.round(st.load * 100)}"><output>${fmt(st.propMass)} kg (${Math.round(st.load * 100)}%)</output>`;
    const inp = sr.querySelector('input'), out = sr.querySelector('output');
    inp.addEventListener('input', () => {
      state.lv.stages[st.key].load = Number(inp.value) / 100;
      out.textContent = `${fmt(e.propMax * Number(inp.value) / 100)} kg (${inp.value}%)`;
      update(false);
    });
    inp.addEventListener('change', () => update());
    row.appendChild(sr);
    psec.appendChild(row);
  });
  if (state.lv.srbCount > 0) {
    const r = document.createElement('div'); r.className = 'prop-row';
    r.innerHTML = `<div class="prop-head">${state.lv.srbCount}× Aerojet SRB <span>${fmt(SRB.propMax * state.lv.srbCount)} kg ${byId(PROPELLANTS, 'SOLID').name} (100%)</span></div>`;
    psec.appendChild(r);
  }
  root.appendChild(psec);

  // Fairing
  const fsec = section(t('secFairing'), '', '', 'fairing');
  const fw = cardsWrap(fsec);
  for (const f of FAIRINGS) {
    fw.appendChild(makeCard({ uid: 'fair:' + f.id, id: f.id, iconKey: f.icon, iconOpt: { w: Math.round(4 + f.dia * 1.6) }, title: f.name,
      mass: kgTxt(f.mass), stat: `${f.volume} m³`, cost: f.cost, selected: state.lv.fairing === f.id,
      fxKey: 'fairing', info: () => fairingInfo(f), onClick: () => { state.lv.fairing = f.id; update(); } }));
  }
  root.appendChild(fsec);
}

/* ---------- Part 2 inventory ---------- */
function slotsAfter(change) {
  const s = JSON.parse(JSON.stringify(state)); change(s); const r = computeSC(s); return { used: r.slots, max: r.slotsMax };
}
function trySelect(change) {
  const r = slotsAfter(change);
  const cur = computeSC();
  if (r.used > r.max && r.used > cur.slots) { UI.justPicked = null; FX.key = null; flash(t('slotFull', { u: r.used, s: r.max })); update(); return; }
  change(state); update();
}
function buildSCInventory(root) {
  const sc = state.sc;
  // Bus
  const bsec = section(t('secBus'), 'Small / Medium / Large', '', 'bus');
  const bw = cardsWrap(bsec);
  for (const b of BUSES) {
    bw.appendChild(makeCard({ uid: 'bus:' + b.id, id: b.id, iconKey: b.icon, title: b.name,
      mass: kgTxt(b.baseMass), stat: `${b.slots} ${t('slots').toLowerCase()}`, cost: b.cost, selected: sc.bus === b.id,
      fxKey: 'bus', info: () => busInfo(b),
      onClick: () => { sc.bus = b.id; const bat = byId(BATTERIES, sc.battery); if (bat && !bat.fits.includes(b.id)) { flash(t('adv_battFit', { b: bat.name, bus: b.name })); sc.battery = null; } update(); } }));
  }
  root.appendChild(bsec);

  // Battery
  const bat = section(t('secBattery'), '', '', 'battery');
  const btw = cardsWrap(bat);
  for (const b of BATTERIES) {
    const fits = b.fits.includes(sc.bus);
    btw.appendChild(makeCard({ uid: 'bat:' + b.id, id: b.id, iconKey: b.icon, iconOpt: { level: b.level }, title: b.name,
      mass: kgTxt(b.mass), stat: b.fits.map(x => x[0].toUpperCase()).join('/'), cost: b.cost,
      selected: sc.battery === b.id, disabled: fits ? false : t('fitsOnly', { b: b.fits.join(', ') }),
      fxKey: 'battery', info: () => batteryInfo(b),
      onClick: () => trySelect(s => { s.sc.battery = s.sc.battery === b.id ? null : b.id; }) }));
  }
  root.appendChild(bat);

  // Solar
  const ssec = section(t('secSolar'), '', t('hintSolar'), 'solar');
  const st = document.createElement('div'); st.className = 'stepper';
  st.innerHTML = `<span class="tag">${t('count')}</span><button data-d="-1">−</button><b>${sc.solarCount}</b><button data-d="1">+</button>`;
  st.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const n = Math.max(1, Math.min(SOLAR_MAX_COUNT, sc.solarCount + Number(b.dataset.d)));
    if (n > sc.solarCount && sc.solar) armPick('sol:' + sc.solar, 'solar');
    if (sc.solar) trySelect(s => { s.sc.solarCount = n; }); else { sc.solarCount = n; update(); }
  }));
  ssec.appendChild(st);
  const sw = cardsWrap(ssec);
  for (const p of SOLAR_PANELS) {
    sw.appendChild(makeCard({ uid: 'sol:' + p.id, id: p.id, iconKey: p.icon, title: p.name,
      mass: kgTxt(p.mass), stat: `${p.watts} W`, cost: p.cost, selected: sc.solar === p.id,
      fxKey: 'solar', info: () => solarInfo(p),
      onClick: () => trySelect(s => { s.sc.solar = s.sc.solar === p.id ? null : p.id; }) }));
  }
  root.appendChild(ssec);

  // Actuators
  const asec = section(t('secAct'), '', '', 'act');
  const aw = cardsWrap(asec);
  for (const a of ACTUATORS) {
    aw.appendChild(makeCard({ uid: 'act:' + a.id, id: a.id, iconKey: a.icon, title: a.name,
      mass: kgTxt(a.mass), stat: `≤${fmt(a.capKg)} kg`, cost: a.cost, selected: sc.actuator === a.id,
      fxKey: 'act', info: () => actInfo(a),
      onClick: () => trySelect(s => { s.sc.actuator = s.sc.actuator === a.id ? null : a.id; }) }));
  }
  root.appendChild(asec);

  // Telecom
  const tsec = section(t('secTel'), '', '', 'tel');
  const tw = cardsWrap(tsec);
  for (const x of TELECOMS) {
    tw.appendChild(makeCard({ uid: 'tel:' + x.id, id: x.id, iconKey: x.icon, title: x.name,
      mass: kgTxt(x.mass), stat: `${fmt(x.rate0Kbps, x.rate0Kbps < 10 ? 1 : 0)} kbps`, cost: x.cost, selected: sc.telecom === x.id,
      fxKey: 'tel', info: () => telInfo(x),
      onClick: () => trySelect(s => { s.sc.telecom = s.sc.telecom === x.id ? null : x.id; }) }));
  }
  root.appendChild(tsec);

  // Instruments
  const isec = section(t('secInst'), `Threshold ${CONFIG.threshold.science} · Baseline ${CONFIG.baseline.science}`, t('hintInst'), 'inst');
  const iw = cardsWrap(isec);
  for (const ins of INSTRUMENTS) {
    const tier = sc.instruments[ins.id] || 0;
    const k = tier === 2 ? CONFIG.tier[2] : { mass: 1, power: 1, data: 1, cost: 1, sci: 1 };
    const uid = 'inst:' + ins.id;
    const row = document.createElement('div'); row.className = 'tier-row';
    [[0, t('tierOff')], [1, t('tierStd')], [2, t('tierEnh')]].forEach(([v, lab]) => {
      const b = document.createElement('button'); b.textContent = lab; if (tier === v) b.className = 'on';
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        if (v > 0 && v !== tier) armPick(uid, 'inst:' + ins.id);
        trySelect(s => { s.sc.instruments[ins.id] = v; });
      });
      row.appendChild(b);
    });
    iw.appendChild(makeCard({ uid, id: ins.id, iconKey: ins.icon, title: ins.name,
      mass: ins.mass ? kgTxt(ins.mass * k.mass) : '0 kg', stat: `${Math.round(ins.sci * k.sci)} pts`, cost: ins.cost * k.cost,
      selected: tier > 0, extra: row, fxKey: 'inst:' + ins.id, info: () => instInfo(ins),
      onClick: () => trySelect(s => { s.sc.instruments[ins.id] = tier ? 0 : 1; }) }));
  }
  root.appendChild(isec);
}

/* ---------- stats strip ---------- */
function statBox(k, v, status) { return `<div class="stat ${status || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }
function renderStats(ev) {
  const C = id => ev.checks.find(c => c.id === id).status;
  let h = '';
  if (state.tab === 'lv') {
    h += statBox(t('stTWR'), ev.lv.twr.toFixed(2), C('thrust'));
    h += statBox(t('stDV'), `${fmt(ev.lv.dv / 1000, 2)}/${fmt(ev.m.dvReq / 1000, 1)}`, C('dv'));
    h += statBox(t('stCap'), `${fmt(ev.cap)} kg`, ev.cap >= ev.sc.mass ? 'G' : 'R');
    h += statBox(t('stLaunchMass'), tonnes(ev.lv.liftoffMass));
    h += statBox(`${t('thrust')} / W`, `${fmt(ev.lv.liftoffThrustKN)}/${fmt(ev.lv.weightKN)} kN`, C('thrust'));
    h += statBox('Dry / Prop', `${tonnes(ev.lv.lvDry)} / ${tonnes(ev.lv.lvProp)}`);
    h += statBox(t('stSCMass'), `${fmt(ev.sc.mass)} kg`);
    h += statBox(t('stCost'), `$${fmt(ev.lvCost, 1)}M`);
  } else {
    h += statBox(t('stSCMass'), `${fmt(ev.sc.mass)}/${fmt(ev.alloc)} kg`, C('mass'));
    h += statBox(t('stPower'), `${fmt(ev.sc.genAvgSun)}/${fmt(ev.sc.needSun)} W`, C('power'));
    h += statBox(t('stEnergy'), `${fmt(ev.sc.usableWh)}/${fmt(ev.sc.needWh)} Wh`, C('energy'));
    h += statBox(t('stLink'), isFinite(ev.sc.linkDb) ? `${fmt(ev.sc.linkDb, 1)} dB` : '—', C('link'));
    h += statBox(t('stData'), `${fmt(ev.sc.reqRate, 2)} kbps`);
    h += statBox(t('stSci'), Math.round(ev.sc.sci), C('sci'));
    h += statBox(t('stSlots'), `${ev.sc.slots}/${ev.sc.slotsMax}`, ev.sc.slots > ev.sc.slotsMax ? 'R' : '');
    h += statBox(t('stCost'), `$${fmt(ev.scCost, 1)}M`);
  }
  $('stats').innerHTML = h;
}

/* ---------- checklist ---------- */
function renderChecklist(ev) {
  const ul = $('checklist'); ul.innerHTML = '';
  for (const c of ev.checks) {
    const li = document.createElement('li');
    const vars = { db: ev.m.linkReqDb, k: ev.m.deep ? t('deepSpace') : t('orbitK'), th: CONFIG.threshold.science, bl: CONFIG.baseline.science };
    const partLbl = c.part === 'lv' ? 'P1' : c.part === 'sc' ? 'P2' : 'P1+2';
    const fixable = c.status === 'R' || c.status === 'Y';
    li.className = fixable ? 'fixable' : '';
    li.innerHTML = `<span class="lamp ${c.status}"></span><span class="lbl">${t('ck_' + c.id)}<span class="part-tag ${c.part}">${partLbl}</span><small>${t('ck_' + c.id + '_s', vars)}</small>${fixable ? `<span class="fix-hint">${t('fixHint')} →</span>` : ''}</span><span class="val">${c.value}</span>`;
    if (fixable) {
      li.tabIndex = 0;
      li.addEventListener('click', () => focusFix(c.id, ev));
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusFix(c.id, ev); } });
    }
    ul.appendChild(li);
  }
  const p = Math.round(ev.greens / ev.checks.length * 100);
  $('gateSummary').innerHTML = (ev.gateOpen ? `<b style="color:var(--green)">${t('gateOpen')}</b><br>` : '') +
    t('gateText', { g: ev.greens, n: ev.checks.length, p, r: ev.reds }) + `<div class="gate-bar"><div style="width:${p}%"></div></div>`;
  $('launchBtn').disabled = !ev.gateOpen;
  // tab dots
  const worst = part => { const l = ev.checks.filter(c => c.part === part || c.part === 'all').map(c => c.status); return l.includes('R') ? 'R' : l.includes('Y') ? 'Y' : 'G'; };
  $('dotLV').className = 'tab-dot ' + worst('lv');
  $('dotSC').className = 'tab-dot ' + worst('sc');
}

/* ---------- click-to-fix: checklist item → inventory tab + affected part sections ---------- */
const FIX_TARGETS = {
  thrust: { tab: 'lv', secs: ['stage:s1', 'srb', 'prop'] },
  fit:    { tab: 'lv', secs: ['fairing'] },
  dv:     { tab: 'lv', secs: ['stage:', 'prop'] },
  mass:   { tab: 'sc', secs: ['bus', 'inst'] },
  power:  { tab: 'sc', secs: ['solar'] },
  energy: { tab: 'sc', secs: ['battery'] },
  link:   { tab: 'sc', secs: ['tel'] },
  act:    { tab: 'sc', secs: ['act'] },
  sci:    { tab: 'sc', secs: ['inst'] },
};
function focusFix(id, ev) {
  let target = FIX_TARGETS[id];
  if (id === 'budget') target = ev.lvCost >= ev.scCost ? { tab: 'lv', secs: ['stage:', 'fairing'] } : { tab: 'sc', secs: ['bus', 'inst'] };
  if (!target) return;
  if (state.tab !== target.tab) switchTab(target.tab);
  const all = Array.from(document.querySelectorAll('#inventory .section[data-sec]'));
  const hits = all.filter(el => target.secs.some(k => (k.endsWith(':') ? el.dataset.sec.startsWith(k) : el.dataset.sec === k)));
  if (!hits.length) return;
  // Scroll only the parts column (not the whole page) so the header stays in view
  const inv = document.getElementById('inventory');
  if (inv && inv.scrollHeight > inv.clientHeight + 2) {
    const top = hits[0].getBoundingClientRect().top - inv.getBoundingClientRect().top + inv.scrollTop - 6;
    inv.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    hits[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  hits.forEach(el => {
    el.classList.remove('fix-pulse'); void el.offsetWidth; el.classList.add('fix-pulse');
    el.querySelectorAll('.card').forEach(c => { c.classList.remove('fix-pulse'); void c.offsetWidth; c.classList.add('fix-pulse'); });
  });
  clearTimeout(focusFix._t);
  focusFix._t = setTimeout(() => document.querySelectorAll('.fix-pulse').forEach(el => el.classList.remove('fix-pulse')), 2600);
}

/* ---------- advisor ---------- */
function advisorMessages(ev) {
  const msgs = [];
  const add = (cls, html) => msgs.push({ cls, html });
  const { lv, sc, m } = ev;
  const pc = v => Math.round(v * 100);
  if (state.flash) add(state.flashCls || 'Y', state.flash);
  const st = id => ev.checks.find(c => c.id === id).status;

  // propellant compatibility
  lv.stages.forEach((s, i) => {
    if (!s.compatible) add('R', i === 0 ? t('adv_s1Incompat', { e: s.eng.name, p: byId(PROPELLANTS, s.eng.prop).name }) : t('adv_stageIncompat', { e: s.eng.name }));
  });
  if (st('thrust') === 'R') add('R', t('adv_thrust', { f: fmt(lv.liftoffThrustKN), w: fmt(lv.weightKN), twr: lv.twr.toFixed(2) }));
  if (st('dv') === 'R') {
    add('R', t('adv_dv', { dv: fmt(lv.dv / 1000, 2), req: fmt(m.dvReq / 1000, 2), gap: fmt((m.dvReq - lv.dv) / 1000, 2), cap: fmt(ev.cap) }));
    if (lv.twr < 1.3) add('I', t('adv_dvTwr', { twr: lv.twr.toFixed(2) }));
  }
  if (st('fit') === 'R') add('R', t('adv_fit', { v: sc.volume, fv: lv.fairing.volume }));
  if (lv.stages[0] && lv.fairing.dia > lv.stages[0].eng.dia * 1.6) add('I', t('adv_hammer', { f: lv.fairing.dia, s: lv.stages[0].eng.dia }));

  if (sc.slots > sc.slotsMax) add('R', t('adv_slots', { u: sc.slots, s: sc.slotsMax }));
  else if (st('mass') !== 'G') add(st('mass'), t('adv_mass', { m: pc(ev.massMargin), kg: fmt(sc.mass), alloc: fmt(ev.alloc), lim: ev.alloc === sc.bus.maxMass ? t('adv_limBus') : t('adv_limLV') }));

  if (!sc.sol) add('R', t('adv_noSolar'));
  else if (st('power') !== 'G') add(st('power'), t('adv_power', { m: pc(sc.powerMargin), avail: fmt(sc.genAvgSun), need: fmt(sc.needSun), load: fmt(sc.load), ecl: m.eclipseMin }));
  if (!sc.bat) add('R', t('adv_noBattery', { ecl: m.eclipseMin }));
  else if (st('energy') !== 'G') add(st('energy'), t('adv_energy', { m: pc(sc.energyMargin), use: fmt(sc.usableWh), dod: pc(sc.dod), need: fmt(sc.needWh) }));
  if (!sc.tel) add('R', t('adv_noTel'));
  else if (st('link') !== 'G') add(st('link'), t('adv_link', { db: fmt(sc.linkDb, 1), req: m.linkReqDb, rate: fmt(sc.reqRate, 2), c: pc(m.contactFraction) }));
  if ((state.sc.instruments.dge || 0) > 0 && !(sc.tel && sc.tel.transponder)) add('Y', t('adv_dge'));
  if (!sc.act) add('R', t('adv_noAct'));
  else if (st('act') !== 'G') add(st('act'), t('adv_act', { m: pc(sc.actMargin), a: sc.act.name, cap: fmt(sc.act.capKg), kg: fmt(sc.mass) }));

  if (!(state.sc.instruments.ns > 0)) add('R', t('adv_sciNS'));
  else if (sc.sci < CONFIG.threshold.science) add('R', t('adv_sciLow', { s: Math.round(sc.sci), th: CONFIG.threshold.science }));
  else if (st('sci') === 'Y') add('Y', t('adv_sciY', { s: Math.round(sc.sci), bl: CONFIG.baseline.science }));

  if (st('budget') !== 'G') add(st('budget'), t('adv_budget', { r: pc(ev.reserve), c: fmt(ev.total, 1), b: CONFIG.totalBudgetM, lv: fmt(ev.lvCost, 1), sc: fmt(ev.scCost, 1), ops: ev.ops }));

  if (ev.gateOpen) msgs.unshift({ cls: 'G', html: t('adv_allGood') });
  else if (ev.reds === 0) msgs.unshift({ cls: 'Y', html: t('adv_gateAlmost', { p: Math.round(ev.greens / ev.checks.length * 100) }) });

  // show current-tab issues first
  const order = { R: 0, Y: 1, I: 2, G: 3 };
  return msgs.sort((a, b) => (a.cls === 'G' ? -1 : b.cls === 'G' ? 1 : order[a.cls] - order[b.cls]));
}
function renderAdvisor(ev) {
  let msgs = advisorMessages(ev);
  if (!state.introSeen) msgs = [{ cls: 'I', html: t('adv_intro') }, ...msgs];
  $('advisor').innerHTML = msgs.slice(0, 7).map(x => `<div class="msg ${x.cls}">${x.html}</div>`).join('');
}

/* ---------- budget ---------- */
function renderBudget(ev) {
  const B = CONFIG.totalBudgetM;
  const w = v => Math.max(0, Math.min(100, v / B * 100)) + '%';
  $('segLV').style.width = w(ev.lvCost);
  $('segSC').style.width = w(Math.min(ev.scCost, Math.max(0, B - ev.lvCost)));
  $('segOps').style.width = w(Math.min(ev.ops, Math.max(0, B - ev.lvCost - ev.scCost)));
  $('budgetBar').classList.toggle('over', ev.total > B);
  $('budgetText').textContent = `$${fmt(ev.total, 1)}M / $${B}M`;
  $('budgetLegend').innerHTML =
    `<span><i style="background:var(--lv)"></i>${t('legLV')} $${fmt(ev.lvCost, 1)}M</span>` +
    `<span><i style="background:var(--sc)"></i>${t('legSC')} $${fmt(ev.scCost, 1)}M</span>` +
    `<span><i style="background:var(--ops)"></i>${t('legOps')} $${ev.ops}M</span>` +
    `<span style="color:${ev.reserve >= CONFIG.reserveGreen ? 'var(--green)' : ev.reserve >= 0 ? 'var(--yellow)' : 'var(--red)'}">${t('legRes')} ${Math.round(ev.reserve * 100)}%</span>`;
}

/* ---------- main canvas ---------- */
const buffer = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (buffer) { buffer.width = PW; buffer.height = PH; }

/* ---------- blueprint install animation (scale-pop + flash + brackets + pixel sparks) ---------- */
const FX = { key: null, t0: 0, sparks: null, raf: 0, dur: 0.75 };
function triggerInstallFx(key) {
  FX.key = key; FX.t0 = performance.now(); FX.sparks = null;
  if (!FX.raf) FX.raf = requestAnimationFrame(fxTick);
}
function fxTick() {
  FX.raf = 0;
  if (!FX.key) return;
  const done = (performance.now() - FX.t0) / 1000 > FX.dur;
  if (done) FX.key = null;
  if (lastEval) renderCanvas(lastEval);
  if (!done) FX.raf = requestAnimationFrame(fxTick);
}
function drawInstallFx(ctx, parts, scale) {
  if (!FX.key) return;
  const p = parts.find(q => q.key === FX.key);
  if (!p) return;
  const age = (performance.now() - FX.t0) / 1000;
  const k = Math.min(1, age / FX.dur);
  const sx = Math.max(0, Math.floor(Math.min(p.x0, p.x1)) - 1), sy = Math.max(0, Math.floor(Math.min(p.y0, p.y1)) - 1);
  const sw = Math.min(PW - sx, Math.ceil(Math.abs(p.x1 - p.x0)) + 3), sh = Math.min(PH - sy, Math.ceil(Math.abs(p.y1 - p.y0)) + 3);
  const cxp = (sx + sw / 2) * scale, cyp = (sy + sh / 2) * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // 1) scale-in bounce: re-blit the freshly installed module slightly enlarged, settling to 1×
  const tp = Math.min(1, age / 0.45);
  const pop = tp < 1 ? 1 + 0.3 * Math.sin(tp * Math.PI) * (1 - tp * 0.55) : 1;
  const dw = sw * scale * pop, dh = sh * scale * pop;
  if (pop > 1.002) ctx.drawImage(buffer, sx, sy, sw, sh, cxp - dw / 2, cyp - dh / 2, dw, dh);
  // 2) brief white/amber flash on the module
  const fl = Math.max(0, 1 - age / 0.3);
  if (fl > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 214, 150, ${0.55 * fl * fl})`;
    ctx.fillRect(cxp - dw / 2, cyp - dh / 2, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }
  // 3) amber bracket corners snapping in
  const pad = scale * (2 + 7 * Math.pow(1 - Math.min(1, age / 0.28), 2));
  const bx0 = cxp - dw / 2 - pad, by0 = cyp - dh / 2 - pad, bx1 = cxp + dw / 2 + pad, by1 = cyp + dh / 2 + pad;
  const arm = Math.max(scale * 2, Math.min(dw, dh) * 0.28);
  ctx.globalAlpha = 1 - Math.pow(k, 3);
  ctx.fillStyle = PAL.amberHi;
  const th = scale * 0.75;
  [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.fillRect(dx > 0 ? x : x - arm, dy > 0 ? y : y - th, arm, th);
    ctx.fillRect(dx > 0 ? x : x - th, dy > 0 ? y : y - arm, th, arm);
  });
  // 4) pixel sparks (snapped to the low-res pixel grid)
  if (!FX.sparks) {
    FX.sparks = Array.from({ length: 22 }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      return { a, v: 70 + Math.random() * 190, c: [PAL.amberHi, PAL.flame1, PAL.cyan, '#FFFFFF'][i % 4], s: Math.random() < 0.3 ? 2 : 1 };
    });
  }
  for (const s of FX.sparks) {
    const d = s.v * age;
    const x = cxp + Math.cos(s.a) * (d + dw * 0.3), y = cyp + Math.sin(s.a) * (d + dh * 0.3) + 160 * age * age;
    const sz = scale * s.s;
    ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
    ctx.fillStyle = s.c;
    ctx.fillRect(Math.round(x / scale) * scale, Math.round(y / scale) * scale, sz, sz);
  }
  ctx.restore();
}

function renderCanvas(ev) {
  const cv = $('mainCanvas'), ctx = cv.getContext('2d');
  const b = buffer.getContext('2d');
  b.imageSmoothingEnabled = false;
  let parts;
  if (state.tab === 'lv') parts = renderRocketPixels(b, ev).parts;
  else parts = renderSpacecraftPixels(b, ev, { puff: performance.now() / 1000 });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(buffer, 0, 0, PW * SCALE, PH * SCALE);
  drawInstallFx(ctx, parts, SCALE);
  drawCallouts(ctx, parts, SCALE);
  // header: title only — numbers live in the side panels (stats strip + checklist)
  ctx.fillStyle = 'rgba(10,14,23,0.86)'; ctx.fillRect(0, 0, cv.width, 40);
  ctx.fillStyle = PAL.line; ctx.fillRect(0, 40, cv.width, 2);
  ctx.fillStyle = PAL.amberHi; ctx.font = '28px VT323, monospace'; ctx.textAlign = 'left';
  ctx.fillText(state.tab === 'lv' ? t('rocketTitle') : t('scTitle'), 12, 28);
}

/* ---------- orchestration ---------- */
function renderInventory() {
  const root = $('inventory');
  const scroll = root.scrollTop;
  root.innerHTML = '';
  if (state.tab === 'lv') buildLVInventory(root); else buildSCInventory(root);
  root.scrollTop = scroll;
  UI.justPicked = null;
}
function renderAll() {
  const ev = evaluate();
  lastEval = ev;
  renderStats(ev); renderChecklist(ev); renderAdvisor(ev); renderBudget(ev); renderCanvas(ev);
}
function update(rebuildInventory = true) {
  if (state._flashShown) { state.flash = null; state._flashShown = false; }
  state.introSeen = true;
  if (rebuildInventory) renderInventory();
  renderAll();
  if (state.flash) state._flashShown = true;
}
function flash(msg, cls) { state.flash = msg; state.flashCls = cls || null; state._flashShown = false; }
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('inventory').scrollTop = 0;
  update();
}
function initStaticUI() {
  const sel = $('missionSelect');
  sel.innerHTML = MISSIONS.map(m => `<option value="${m.id}" ${m.id === state.missionId ? 'selected' : ''}>${m.name} · Δv ${fmt(m.dvReq / 1000, 1)} km/s</option>`).join('');
}

/* =====================================================================
   8. LAUNCH TRANSITION (Phase 1 → Phase 2) + SHARED GameState HAND-OFF
   ===================================================================== */
function computeDesignScore(ev) {
  return Math.round(ev.sc.sci * 10 + ev.reserve * 1000 + Math.min(ev.massMargin, 1) * 300 + ev.greens * 50);
}

/* --- sprite helpers: render with the SAME pixel renderers, then crop to content --- */
function cropCanvas(src) {
  const W = src.width, H = src.height;
  const d = src.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return src;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
function spriteFrom(drawFn) {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const info = drawFn(x);
  const img = cropCanvas(c);
  img.info = info;
  return img;
}

/* ---------------------------------------------------------------------
   Flight vehicle — the hangar build translated into Phase 2 propulsion
   stages. Every number comes from the same model the checklist uses, so
   Tsiolkovsky Δv in flight == Δv shown in the hangar.
     • Flight stage 1 = stage 1 + strap-on SRBs + fairing (burn together,
       fairing mass rides with stage 1 — exactly as in computeLV()).
       Thrust/Isp are the vacuum/sea-level average used by computeLV().
     • Upper stages: vacuum thrust & Isp; incompatible propellant = dead mass.
     • Top stage = the spacecraft itself: bus hydrazine burned by the
       selected actuator thrusters (thrustN / isp).
     • Burn-time compression: small in-space thrusters would need minutes
       to hours of real time. Thrust AND mass flow are both multiplied by
       burnComp, so Isp — and therefore Δv per kg of propellant — is
       unchanged; only the burn finishes sooner.
   --------------------------------------------------------------------- */
const FLIGHT_SYNC = { minUpperAccel: 8.0, minBusAccel: 6.0 }; // m/s² floors for burn-time compression

function buildFlightStages(ev) {
  const { lv, sc } = ev;
  const out = [];
  lv.stages.forEach((st, i) => {
    const e = st.eng;
    const fuel = st.compatible ? st.propMass : 0;
    let dry = st.dryMass + (st.compatible ? 0 : st.propMass);
    let thrustN = st.compatible && fuel > 0 ? e.thrustVac * 1000 : 0;
    let isp = st.compatible ? e.ispVac : 0;
    let name = e.name.toUpperCase();
    if (i === 0) {
      // stage 1 + SRBs burn together; fairing jettisons with this stage
      const burners = [];
      if (thrustN > 0) burners.push({ Fv: e.thrustVac, Iv: e.ispVac, Ia: (e.ispVac + (e.ispSL || e.ispVac)) / 2 });
      if (lv.nSRB) burners.push({ Fv: SRB.thrustVac * lv.nSRB, Iv: SRB.ispVac, Ia: (SRB.ispVac + SRB.ispSL) / 2 });
      const fAvg = burners.reduce((a, b) => a + b.Fv * b.Ia / b.Iv, 0);           // kN, average over the burn
      const mdot = burners.reduce((a, b) => a + b.Fv / b.Iv, 0);                  // true mass flow ∝ F_vac / Isp_vac
      thrustN = fAvg * 1000;
      isp = mdot > 0 ? fAvg / mdot : 0;
      dry += lv.nSRB * SRB.engineMass + lv.fairing.mass;
      if (lv.nSRB) name += ` + ${lv.nSRB}× SRB`;
      out.push({ name, engine: e.name + (lv.nSRB ? ` + ${lv.nSRB}× Aerojet SRB` : ''), role: 'S1',
        dryKg: dry, fuelMaxKg: fuel + lv.nSRB * SRB.propMax, thrustN, realThrustN: thrustN, ispS: isp, burnComp: 1,
        lengthM: Math.max(st.len, lv.nSRB ? SRB.len : 0), diamM: e.dia });
    } else {
      out.push({ name, engine: e.name, role: st.key === 'kick' ? 'KICK' : 'S' + (i + 1),
        dryKg: dry, fuelMaxKg: fuel, thrustN, realThrustN: thrustN, ispS: isp || 1, burnComp: 1,
        lengthM: st.len, diamM: e.dia });
    }
  });
  // spacecraft: bus hydrazine + actuator thrusters
  const act = sc.act;
  const prop = act ? Math.min(sc.propKg, sc.mass * 0.9) : 0;
  out.push({ name: `S/C · ${act ? act.name.toUpperCase() : 'NO THRUSTERS'}`, engine: act ? `${act.name} (${sc.bus.name.split(' (')[0]})` : 'No thrusters',
    role: 'S/C', dryKg: sc.mass - prop, fuelMaxKg: prop, thrustN: act ? act.thrustN : 0, realThrustN: act ? act.thrustN : 0,
    ispS: act ? act.isp : 1, burnComp: 1, lengthM: sc.bus.widthM || 1.4, diamM: sc.bus.widthM || 1.4 });

  // burn-time compression for in-space stages (keeps Isp → identical Δv)
  for (let i = 1; i < out.length; i++) {
    const st = out[i];
    if (st.thrustN <= 0) continue;
    const mIgn = out.slice(i).reduce((a, x) => a + x.dryKg + x.fuelMaxKg, 0);
    const floor = i === out.length - 1 ? FLIGHT_SYNC.minBusAccel : FLIGHT_SYNC.minUpperAccel;
    const k = Math.max(1, floor * mIgn / st.thrustN);
    st.burnComp = k;
    st.thrustN *= k;
  }
  return out;
}
function flightDeltaV(stages) {
  let dv = 0;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    if (st.fuelMaxKg <= 0 || st.thrustN <= 0) continue;
    const up = stages.slice(i + 1).reduce((a, x) => a + x.dryKg + x.fuelMaxKg, 0);
    dv += st.ispS * CONFIG.g0 * Math.log((st.dryKg + st.fuelMaxKg + up) / (st.dryKg + up));
  }
  return dv;
}

/** Sprites Phase 2 uses so the flying vehicle is pixel-identical to the hangar build. */
function buildFlightSprites(ev, nBoost) {
  const dge = (state.sc.instruments.dge || 0) > 0;
  const craft = spriteFrom(x => drawSpacecraftSprite(x, ev.sc, 70, 80, { dge }));
  const busPart = (craft.info || []).find(p => p.key === 'bus');
  const stacks = [], debris = [];
  let ppm = 1;
  for (let i = 0; i < nBoost; i++) {
    stacks.push(spriteFrom(x => { const r = renderRocketPixels(x, ev, { noBackground: true, cx: 70, dropStages: i, hideSRB: i > 0, hideFairing: i > 0 }); ppm = r.ppm; return r; }));
    debris.push(spriteFrom(x => renderRocketPixels(x, ev, { noBackground: true, cx: 70, onlyStage: i })));
  }
  return {
    craft,
    craftPuff: spriteFrom(x => drawSpacecraftSprite(x, ev.sc, 70, 80, { dge, puff: 0.01 })),
    stacks, debris, ppm,                                  // ppm = sprite pixels per metre for launcher sprites
    busPx: busPart ? busPart.x1 - busPart.x0 : 26,        // bus width in sprite pixels (craft scale)
    busWidthM: ev.sc.bus.widthM || 1.4,
  };
}

/** Snapshot of the player's exact build, stored in the shared GameState. */
function snapshotBuild(ev) {
  const stages = buildFlightStages(ev);
  const nBoost = stages.length - 1;
  return {
    missionId: state.missionId,
    lv: JSON.parse(JSON.stringify(state.lv)),
    sc: JSON.parse(JSON.stringify(state.sc)),     // bus, battery, solar(+count), actuator, telecom, instrument tiers
    busId: ev.sc.bus.id,
    busName: ev.sc.bus.name,
    scMassKg: ev.sc.mass,
    scDryKg: ev.sc.mass - stages[stages.length - 1].fuelMaxKg,
    stageNames: ev.lv.stages.map(s => s.eng.name),
    lvDeltaV: ev.lv.dv,
    flight: {
      stages,                                    // dry / fuel / thrust / Isp / burnComp per flight stage
      totalDeltaV: flightDeltaV(stages),
      fairingDiaM: ev.lv && ev.lv.fairing ? ev.lv.fairing.dia : 2.0, // drag reference diameter
      // attitude authority from the actuator set: capacity vs spacecraft mass (1 = exactly enough)
      controlFactor: ev.sc.act ? Math.max(0.3, Math.min(2.5, ev.sc.act.capKg / ev.sc.mass)) : 0.3,
      actuatorName: ev.sc.act ? ev.sc.act.name : 'none',
    },
    sciencePts: Math.round(ev.sc.sci),
    designScore: computeDesignScore(ev),
    sprites: buildFlightSprites(ev, nBoost),
  };
}

let phase2Instance = null;
function ensurePhase2() {
  if (!phase2Instance && typeof window.createPhase2 === 'function') phase2Instance = window.createPhase2();
  return phase2Instance;
}

function paintCraftThumb() {
  const cv = $('craftThumb'); if (!cv || !GameState.build) return;
  const ctx = cv.getContext('2d'); const spr = GameState.build.sprites.craft;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  const k = Math.min((cv.width - 4) / spr.width, (cv.height - 4) / spr.height);
  const w = spr.width * k, h = spr.height * k;
  ctx.drawImage(spr, Math.round((cv.width - w) / 2), Math.round((cv.height - h) / 2), w, h);
  cv.title = `${GameState.build.busName} · ${fmt(GameState.build.scMassKg)} kg`;
}

function enterPhase2() {
  closeInfo();
  $('phase1').classList.add('hidden');
  $('phase2').classList.remove('hidden');
  GameState.phase = 'flight';
  paintCraftThumb();
  const p2 = ensurePhase2();
  if (p2) p2.start();
}
/* ---------- Opening hand-off: missions chosen on the startup menu → hangar ----------
   Each selected mission needs one instrument; it is fitted for the player (they still
   size the launcher, bus, power and telecom themselves).                              */
const MISSION_INSTR = { ice: 'ns', min: 'grs', mag: 'er', alpha: 'aps', grav: 'dge' };
const MISSION_NAME = { ice: 'Polar Ice', min: 'Minerals', mag: 'Luna Mini Magneto', alpha: 'Alpha Particle', grav: 'Gravity Map' };
function paintMissionCount() {
  const el = $('missionCount'); if (!el) return;
  const m = GameState.missions || [];
  const mode = GameState.assistMode === 'commander' ? 'COMMANDER' : 'CADET';
  el.textContent = m.length ? `(${m.length}) · ${mode}` : '';
  const b = $('btnMissions'); if (b) b.title = m.length ? 'Missions: ' + m.map(k => MISSION_NAME[k] || k).join(', ') : 'Back to mission selection';
}
function applyMissions(ids) {
  GameState.missions = (ids || []).slice();
  state.missionId = 'lunar';
  const sel = $('missionSelect'); if (sel) sel.value = 'lunar';
  const fitted = [];
  GameState.missions.forEach(m => {
    const k = MISSION_INSTR[m];
    if (k && !((state.sc.instruments[k] || 0) > 0)) { state.sc.instruments[k] = 1; const ins = byId(INSTRUMENTS, k); fitted.push(ins ? ins.short : k); }
  });
  if (fitted.length) flash('Mission instruments fitted: ' + fitted.join(', ') + '. Now build a rocket that can carry them to the Moon.', 'G');
  paintMissionCount();
  returnToHangar();
}
function returnToHangar() {
  GameState.phase = 'hangar';
  $('phase2').classList.add('hidden');
  $('phase1').classList.remove('hidden');
  update();
}

/**
 * Launch transition (< 1 s): a retro pixel-block wipe covers the hangar, the screens swap
 * while covered (first launch also solves the GMAT golden trajectory, ~1 s), and the wipe
 * reveals the player's own rocket waiting on the pad in the Phase 2 close-up view.
 * The player ignites it with [SPACE] — no pre-recorded liftoff.
 */
function startLaunchTransition(ev) {
  if (!ev || !ev.gateOpen || GameState.phase !== 'hangar') return;
  closeInfo();
  GameState.phase = 'launching';
  GameState.build = snapshotBuild(ev);

  const ov = $('launchFx'), cv = $('launchFxCanvas'), ctx = cv.getContext('2d');
  ov.classList.remove('hidden');
  ov.classList.add('on');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.width = Math.round(innerWidth * dpr), H = cv.height = Math.round(innerHeight * dpr);
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const T_SWAP = 0.38, T_END = 0.8;
  let t0 = performance.now(), swapped = false;

  function frame(now) {
    const tt = (now - t0) / 1000;
    if (tt >= T_SWAP && !swapped) {
      swapped = true;
      const tBlock = performance.now();
      enterPhase2();
      t0 += performance.now() - tBlock;                  // the solve must not eat the reveal
      requestAnimationFrame(frame);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    const cell = Math.ceil(H / 14);
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    const cover = Math.min(1, tt / T_SWAP);
    const reveal = swapped ? Math.min(1, (tt - T_SWAP) / (T_END - T_SWAP)) : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const thr = 1 - ((r / rows) * 0.55 + hash(c, r) * 0.45);
      const on = swapped ? reveal < thr : cover > thr;
      if (!on) continue;
      const edge = swapped ? thr - reveal < 0.07 : cover - thr < 0.07;
      ctx.fillStyle = edge ? PAL.blue : PAL.void;
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
    if (tt < T_END) requestAnimationFrame(frame);
    else { ov.classList.remove('on'); ov.classList.add('hidden'); }
  }
  requestAnimationFrame(frame);
}

/* =====================================================================
   BOOT
   ===================================================================== */
function init() {
  initStaticUI();
  const bi = $('brandIcon'); if (bi) drawIcon(bi.getContext('2d'), 'srb');
  $('missionSelect').addEventListener('change', e => { state.missionId = e.target.value; update(); });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('launchBtn').addEventListener('click', () => { if (lastEval && lastEval.gateOpen) startLaunchTransition(lastEval); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && currentInfo) closeInfo(); });
  $('btnHangar').addEventListener('click', e => { e.currentTarget.blur(); returnToHangar(); });
  $('btnModalHangar').addEventListener('click', returnToHangar);
  const bm = $('btnMissions');
  if (bm) bm.addEventListener('click', e => { e.currentTarget.blur(); if (window.Opening && GameState.phase === 'hangar') window.Opening.reopen(); });
  paintMissionCount();
  renderInventory();
  renderAll();
  // gentle animation on spacecraft view (thruster puffs)
  setInterval(() => { if (GameState.phase === 'hangar' && state.tab === 'sc' && lastEval && !FX.key) renderCanvas(lastEval); }, 250);
  // fonts may load late → redraw canvas text
  if (document.fonts) document.fonts.ready.then(() => renderAll());
}

if (typeof window !== 'undefined') {
  window.HangarAPI = { t, returnToHangar, applyMissions, getBuild: () => GameState.build, flightDeltaV };
  window.addEventListener('DOMContentLoaded', init);
}
if (typeof module !== 'undefined') module.exports = { CONFIG, MISSIONS, LV_ENGINES, SRB, BUSES, ACTUATORS, state, computeLV, computeSC, evaluate, maxPayload, buildStages, buildFlightStages, flightDeltaV };
