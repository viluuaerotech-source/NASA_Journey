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
     4. I18N .............. Vietnamese / English strings
     5. MODEL ............. physics + checklist evaluation (pure functions)
     6. PIXEL ART ......... procedural icons + rocket / spacecraft renderers
     7. UI ................ inventory cards, stats, checklist, advisor
     8. LAUNCH ............ launch animation + mission report
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
  solarDegradationPerYear: 0.025,
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
    name: { vi: 'Quỹ đạo cực Mặt Trăng (TLI)', en: 'Lunar polar orbit (TLI)' },
    // Ideal (Tsiolkovsky) Δv the launcher must give, gravity/drag losses lumped in.
    // Calibrated on the sheet's Athena II stack: Castor 120 + Castor 120 + SRM-1 + OAM
    // delivers ≈ 360 kg to TLI (real Lunar Prospector: 296 kg).
    dvReq: 11100,
    orbitMin: 118, eclipseMin: 47,      // Lunar Prospector 100 km polar orbit
    linkReqDb: 3,                       // deep-space link margin rule
    rateFactor: 1,                      // telecom rates in DATA are quoted at lunar distance
    contactFraction: 0.6,               // fraction of time in view of DSN
    deep: true,
  },
  {
    id: 'leo',
    name: { vi: 'Quỹ đạo Trái Đất thấp (LEO 200 km)', en: 'Low Earth Orbit (200 km)' },
    dvReq: 9000,                        // same calibration: Athena II ≈ 2 t to LEO
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
    name: { vi: 'Rắn HTPB/AP', en: 'Solid HTPB/AP' },
    density: 1800, ispRange: '230–295 s', costPerKg: 9, color: '#b5523b', src: 'sheet',
    desc: { vi: 'Hạt nhiên liệu đúc sẵn trong vỏ động cơ (86% chất rắn HTPB – theo sheet SRM-1). Đặc, rẻ khi sản xuất loạt, không tắt/khởi động lại được.',
            en: 'Cast grain inside the motor case (86% solids HTPB per SRM-1 row). Dense, cheap in bulk, cannot be shut down/restarted.' } },
  { id: 'KEROLOX',   icon: 'propKerolox',
    name: { vi: 'LOX / Kerosene (RP-1)', en: 'LOX / Kerosene (RP-1)' },
    density: 1030, ispRange: '310–340 s', costPerKg: 0.7, color: '#e0a03a', src: 'sheet',
    desc: { vi: 'Ôxy lỏng + dầu hỏa tinh chế. Mật độ cao → bồn nhỏ gọn, lực đẩy lớn – lý tưởng cho tầng 1 (RD-180).',
            en: 'Liquid oxygen + refined kerosene. High density → compact tanks, high thrust – ideal for stage 1 (RD-180).' } },
  { id: 'HYDROLOX',  icon: 'propHydrolox',
    name: { vi: 'LOX / LH2 (Hydro lỏng)', en: 'LOX / LH2 (Liquid hydrogen)' },
    density: 360, ispRange: '420–465 s', costPerKg: 1.1, color: '#8fe3ff', src: 'sheet',
    desc: { vi: 'Isp cao nhất trong hóa học (RL-10: 451 s) nhưng hydro rất nhẹ → bồn to, cách nhiệt lạnh sâu. Tốt nhất cho tầng trên.',
            en: 'Highest chemical Isp (RL-10: 451 s) but hydrogen is very light → big, cryogenic tanks. Best for upper stages.' } },
  { id: 'HYDRAZINE', icon: 'propHydrazine',
    name: { vi: 'Hydrazine (N₂H₄)', en: 'Hydrazine (N₂H₄)' },
    density: 1010, ispRange: '220–230 s', costPerKg: 220, color: '#7dff8a', src: 'sheet',
    desc: { vi: 'Nhiên liệu đơn chất, phân hủy qua chất xúc tác – đơn giản, tin cậy, khởi động lại nhiều lần. Dùng cho chỉnh quỹ đạo (OAM, MR-107).',
            en: 'Monopropellant decomposed over a catalyst – simple, reliable, restartable. Used for trajectory trim (OAM, MR-107).' } },
];

/* ---------- Launch-vehicle stages / engines (sheet "SLSLaunch Vehicle (Propulsion)") ----------
   thrustVac kN · isp s · masses kg · dia/len m · cost M$
   engineMass  = fixed hardware mass (engine, casing, avionics)
   tankMassMax = liquid-tank structure at 100 % load (scales with propellant load)          */
const LV_ENGINES = [
  { id: 'castor120', icon: 'solidMotor', name: 'Castor 120', engineType: 'Solid', stageClass: 'Stage 1, Stage 2',
    prop: 'SOLID', thrustVac: 1606.594, ispVac: 286, ispSL: 229, engineMass: 4211, tankMassMax: 0, propMax: 48809,
    burn: 83, dia: 2.36, len: 10.70, engineLen: 0, cost: 14, color: '#d9dbe6', src: 'sheet', estFields: ['cost'],
    desc: { vi: 'Động cơ rắn Thiokol, cỡ tương đương tầng 1 tên lửa Peacekeeper. Bay lần đầu 1989. Athena II dùng 2 chiếc (tầng 1 và tầng 2).',
            en: 'Thiokol solid motor, similar in size to Peacekeeper stage 1. First flight 1989. Athena II uses two (stage 1 and stage 2).' } },
  { id: 'srm1', icon: 'solidMotor', name: 'ESBM/SRM-1 (Orbus 21)', engineType: 'Solid', stageClass: 'Stage 3',
    prop: 'SOLID', thrustVac: 189.2, ispVac: 293, ispSL: null, engineMass: 1030, tankMassMax: 0, propMax: 9780,
    burn: 150, dia: 2.30, len: 3.00, engineLen: 0, cost: 9, color: '#c9ccd8', src: 'sheet', estFields: ['cost'],
    desc: { vi: 'Động cơ rắn CSD (Orbus 21), 86% chất rắn HTPB. Dùng trên IUS/TOS, Titan 34D. Tầng 3 lý tưởng để đẩy vào quỹ đạo chuyển tiếp.',
            en: 'CSD solid motor (Orbus 21), 86% HTPB solids. Flown on IUS/TOS, Titan 34D. An ideal 3rd stage for transfer-orbit injection.' } },
  { id: 'oam', icon: 'kick', name: 'OAM — 4× MR-107', engineType: 'Chemical', stageClass: 'In-space',
    prop: 'HYDRAZINE', thrustVac: 0.882, ispVac: 222, ispSL: null, engineMass: 360, tankMassMax: 0, propMax: 354,
    burn: 1500, dia: 2.30, len: 1.00, engineLen: 0, cost: 3, color: '#b0b8c8', src: 'sheet', estFields: ['cost'],
    desc: { vi: 'Orbit Adjust Module dùng 4 động cơ hydrazine MR-107 để tinh chỉnh quỹ đạo lần cuối (chèn quỹ đạo chính xác).',
            en: 'Orbit Adjust Module with four hydrazine MR-107 thrusters for final trajectory insertion.' } },
  { id: 'rd180', icon: 'liquidEngine', name: 'RD-180 (Atlas V CCB)', engineType: 'Chemical', stageClass: 'Stage 1',
    prop: 'KEROLOX', thrustVac: 4152, ispVac: 338, ispSL: 311, engineMass: 5480, tankMassMax: 15574, propMax: 284089,
    burn: 253, dia: 3.81, len: 32.46, engineLen: 3.6, cost: 55, color: '#e08a3a', src: 'est',
    estFields: ['thrust', 'isp', 'mass', 'prop', 'dims', 'cost'],
    desc: { vi: 'Phiên bản 2 buồng đốt của RD-170, giữ hiệu suất cao và khả năng vận hành; làm tầng 1 cho Atlas V. (Sheet chưa có thông số – dùng số liệu công bố của Atlas V Common Core Booster.)',
            en: 'Two-chamber derivative of the four-chamber RD-170, powering Atlas V stage 1. (Sheet had no numbers – public Atlas V Common Core Booster data used.)' } },
  { id: 'rl10', icon: 'liquidEngine', name: 'RL-10A-4-2 (Centaur)', engineType: 'Chemical', stageClass: 'Stage 2',
    prop: 'HYDROLOX', thrustVac: 99.194, ispVac: 451, ispSL: null, engineMass: 168, tankMassMax: 1858, propMax: 20799,
    burn: 894, dia: 3.05, len: 12.68, engineLen: 2.3, cost: 32, color: '#e8ecf4', src: 'sheet', estFields: ['cost'],
    desc: { vi: 'Tầng Centaur chạy 1 động cơ RL-10 (LOX/LH2) cho nhiệm vụ năng lượng cao. Isp 451 s – cao nhất trong danh sách nhưng lực đẩy nhỏ.',
            en: 'Centaur stage with one RL-10 (LOX/LH2) for high-energy missions. Isp 451 s – best in the list, but low thrust.' } },
];
const SRB = { id: 'aerojetSrb', icon: 'srb', name: 'Aerojet SRB (Atlas V)', engineType: 'Solid', stageClass: 'SRB',
  prop: 'SOLID', thrustVac: 1270, ispVac: 275, ispSL: 245, engineMass: 4000, tankMassMax: 0, propMax: 36824,
  burn: 94, dia: 1.55, len: 17.70, cost: 8, color: '#f2f2f2', src: 'sheet', estFields: ['cost'], maxCount: 5,
  desc: { vi: 'Tên lửa đẩy phụ rắn của Aerojet cho Atlas V (bay 2002). Gắn bên hông tầng 1 để tăng lực đẩy cất cánh.',
          en: 'Aerojet strap-on solid booster for Atlas V (first flight 2002). Adds liftoff thrust beside stage 1.' } };

/* Which engines may go in each stage slot (null = no stage) */
const STAGE_SLOTS = [
  { key: 's1',   label: { vi: 'Tầng 1 (cất cánh)', en: 'Stage 1 (liftoff)' }, options: ['castor120', 'rd180'], required: true },
  { key: 's2',   label: { vi: 'Tầng 2', en: 'Stage 2' },                    options: [null, 'castor120', 'rl10', 'srm1'] },
  { key: 's3',   label: { vi: 'Tầng 3', en: 'Stage 3' },                    options: [null, 'srm1', 'rl10'] },
  { key: 'kick', label: { vi: 'Tầng chỉnh quỹ đạo', en: 'Kick stage' },     options: [null, 'oam'] },
];

/* ---------- Structure / payload fairing ---------- */
const FAIRINGS = [
  { id: 'f234', icon: 'fairing', name: { vi: 'Chụp mũi Athena 2.34 m', en: 'Athena 2.34 m fairing' },
    mass: 450, dia: 2.34, len: 7.0, volume: 14, cost: 2.5, src: 'est',
    desc: { vi: 'Chụp mũi 92-inch của Athena II (vehicle phóng Lunar Prospector – sheet: Athena 2). Nhẹ, rẻ nhưng chỉ chứa tàu nhỏ.',
            en: '92-inch Athena II fairing (Lunar Prospector launcher – sheet: Athena 2). Light and cheap but fits only small spacecraft.' } },
  { id: 'f4m', icon: 'fairing', name: { vi: 'Chụp mũi 4 m (Atlas V 4xx)', en: '4 m LPF (Atlas V 4xx)' },
    mass: 2127, dia: 4.2, len: 12.0, volume: 60, cost: 7, src: 'est',
    desc: { vi: 'Chụp mũi tải lớn 4 m – vừa tàu cỡ trung đến lớn.', en: 'Large payload fairing, 4 m – fits medium to large spacecraft.' } },
  { id: 'f5m', icon: 'fairing', name: { vi: 'Chụp mũi 5 m (Atlas V 5xx)', en: '5 m short (Atlas V 5xx)' },
    mass: 3524, dia: 5.4, len: 20.7, volume: 140, cost: 12, src: 'est',
    desc: { vi: 'Chụp mũi composite 5 m – chứa tàu lớp LRO thoải mái nhưng rất nặng.', en: '5 m composite fairing – roomy for LRO-class spacecraft but very heavy.' } },
];

/* ---------- Spacecraft bus (sheet "Spacecraft": lunar = trung, LRO = lớn) ---------- */
const BUSES = [
  { id: 'small', icon: 'busS', name: { vi: 'Bus nhỏ (Microsat)', en: 'Small bus (Microsat)' },
    baseMass: 55, maxMass: 180, slots: 6, basePower: 18, volume: 0.5, cost: 12, dims: '0.6×0.6×0.6 m', src: 'est',
    desc: { vi: 'Khung vệ tinh nhỏ, rẻ. Ít slot, giới hạn khối lượng thấp.', en: 'Small, cheap chassis. Few slots, low mass limit.' } },
  { id: 'medium', icon: 'busM', name: { vi: 'Bus trung (lớp Lunar Prospector)', en: 'Medium bus (Lunar Prospector-class)' },
    baseMass: 165, maxMass: 420, slots: 9, basePower: 35, volume: 2.2, cost: 28, dims: 'Ø1.4 × 1.3 m', src: 'sheet',
    desc: { vi: 'Thân trụ quay (spin-stabilized) như Lunar Prospector – sheet: "lunar", cỡ "trung". Đã gồm ~138 kg hydrazine cho chèn quỹ đạo Mặt Trăng.',
            en: 'Spin-stabilised drum like Lunar Prospector – sheet: "lunar", size "trung". Includes ~138 kg hydrazine for lunar orbit insertion.' } },
  { id: 'large', icon: 'busL', name: { vi: 'Bus lớn (lớp LRO)', en: 'Large bus (LRO-class)' },
    baseMass: 1350, maxMass: 2300, slots: 12, basePower: 260, volume: 24, cost: 60, dims: '3.9×2.7×2.6 m', src: 'sheet',
    desc: { vi: 'Khung ổn định 3 trục cỡ LRO – sheet: "LRO", cỡ "lớn". Nhiều slot, nhưng nặng, tốn điện và đắt.',
            en: '3-axis LRO-sized chassis – sheet: "LRO", size "lớn". Many slots but heavy, power-hungry and expensive.' } },
];

/* ---------- Battery (sheet values: 150 / 300 / 800 / 1600 Wh) ---------- */
const BATTERIES = [
  { id: 'b150',  icon: 'battery', level: 1, name: '150 Wh',  capWh: 150,  mass: 5,  power: 0, cost: 0.6, fits: ['small', 'medium'], sheetTag: 'lunar · trung', src: 'sheet' },
  { id: 'b300',  icon: 'battery', level: 2, name: '300 Wh',  capWh: 300,  mass: 9,  power: 0, cost: 1.0, fits: ['medium'],           sheetTag: 'lunar · trung mở rộng', src: 'sheet' },
  { id: 'b800',  icon: 'battery', level: 3, name: '800 Wh',  capWh: 800,  mass: 22, power: 0, cost: 2.2, fits: ['large'],            sheetTag: 'LRO · lớn cơ bản', src: 'sheet' },
  { id: 'b1600', icon: 'battery', level: 4, name: '1600 Wh', capWh: 1600, mass: 42, power: 0, cost: 3.8, fits: ['large'],            sheetTag: 'LRO · lớn siêu cấp', src: 'sheet' },
];

/* ---------- Solar panels (sheet: unfoldable 200 W / face, foldable 400–600 W) ----------
   eff = average illumination factor (body-mounted panels on a spinning drum ≈ 0.7) */
const SOLAR_PANELS = [
  { id: 'unf200', icon: 'solarUnfold', name: { vi: 'Pin không gập · 1 mặt', en: 'Unfoldable · 1 face' },   watts: 200, eff: 0.7, mass: 9,  cost: 1.0, deploy: false, src: 'sheet',
    desc: { vi: 'Gắn cố định lên thân. Sạc pin cho thời kỳ che khuất theo thứ tự và thời gian tự quay của tàu (sheet) → hiệu suất TB ~70%.',
            en: 'Body-mounted. Charges the battery for eclipse according to the spin sequence of the spacecraft (sheet) → ~70% average output.' } },
  { id: 'fold400', icon: 'solarFold', name: { vi: 'Pin gập · 400 W', en: 'Foldable · 400 W' },          watts: 400, eff: 1.0, mass: 13, cost: 4.0, deploy: true, src: 'sheet',
    desc: { vi: 'Khi vào quỹ đạo an toàn, các tấm pin bung mở theo chiều ngang (radial deployment) vào khoảng trống giữa các trục thiết bị (sheet). Bám Mặt Trời → 100%.',
            en: 'Once in a safe orbit the panels unfold radially into the gaps between equipment booms (sheet). Sun-tracking → 100%.' } },
  { id: 'fold600', icon: 'solarFold', name: { vi: 'Pin gập · 600 W', en: 'Foldable · 600 W' },          watts: 600, eff: 1.0, mass: 18, cost: 6.0, deploy: true, src: 'sheet',
    desc: { vi: 'Phiên bản lớn của pin gập (sheet: 400–600 W). Nhiều điện hơn nhưng nặng và đắt hơn.',
            en: 'Larger foldable array (sheet: 400–600 W). More power, more mass and cost.' } },
];
const SOLAR_MAX_COUNT = 4;

/* ---------- Actuators / attitude control (sheet "Actuator") ----------
   capKg = max spacecraft mass the set can stabilise with ≥ 0 % control margin */
const ACTUATORS = [
  { id: 'h20x4', icon: 'thruster', name: { vi: '4× Hydrazine 20N', en: '4× 20N hydrazine' }, mass: 4, power: 10, capKg: 250, cost: 1.5, src: 'sheet',
    desc: { vi: 'Động cơ đẩy hydrazine đơn chất 20N cho điều khiển tư thế, quỹ đạo (sheet). Van 2 tầng, buồng xúc tác có sấy dự phòng.',
            en: '20N monopropellant hydrazine thruster for attitude, trajectory and orbit control (sheet). Dual-seat valve, redundant catalyst-bed heaters.' } },
  { id: 'h20x8', icon: 'thruster', name: { vi: '8× Hydrazine 20N', en: '8× 20N hydrazine' }, mass: 8, power: 18, capKg: 600, cost: 3.0, src: 'sheet',
    desc: { vi: 'Bộ 8 động cơ 20N – dư thừa (redundancy) và mô-men lớn gấp đôi.', en: 'Set of eight 20N thrusters – redundancy and twice the torque.' } },
  { id: 'mt6x4', icon: 'thrusterBig', name: { vi: '4× MT-6 50N (IHI)', en: '4× MT-6 50N (IHI)' }, mass: 7, power: 14, capKg: 1500, cost: 4.0, src: 'sheet',
    desc: { vi: 'Động cơ hydrazine đơn chất 50N MT-6 do IHI Aerospace sản xuất (sheet).', en: '50N MT-6 hydrazine monopropellant thruster by IHI Aerospace (sheet).' } },
  { id: 'td339', icon: 'thrusterBig', name: { vi: '3× Thiokol TD-339', en: '3× Thiokol TD-339' }, mass: 93, power: 20, capKg: 3000, cost: 6.0, src: 'sheet',
    desc: { vi: 'Vernier nhiên liệu lỏng điều tiết được (Surveyor III): 30–104 lbf mỗi chiếc, 2 cố định + 1 gimbal. Mang theo ≥178,3 lb nhiên liệu (đã tính vào 93 kg).',
            en: 'Throttleable liquid vernier (Surveyor III): 30–104 lbf each, two fixed + one gimballed. Carries ≥178.3 lb propellant (included in 93 kg).' } },
];

/* ---------- Telecom (sheet: Athena 2 / Lunar Prospector S-band, link margin > 3 dB) ----------
   rate0Kbps = data rate that closes the link at exactly 0 dB at lunar distance */
const TELECOMS = [
  { id: 'lga', icon: 'antLGA', name: { vi: 'Ăng-ten vô hướng LGA (S-band)', en: 'Omni LGA (S-band)' }, rate0Kbps: 2, mass: 2, power: 6, cost: 0.8, transponder: false, src: 'est',
    desc: { vi: 'Chỉ ăng-ten vô hướng – nhẹ, không cần hướng nhưng tốc độ rất thấp.', en: 'Omni antenna only – light, no pointing, but very low data rate.' } },
  { id: 'lpS', icon: 'antMGA', name: { vi: '2× S-band + MGA mảng pha', en: '2× S-band + phased-array MGA' }, rate0Kbps: 8.06, mass: 8, power: 22, cost: 3.0, transponder: true, src: 'sheet',
    desc: { vi: 'Như Lunar Prospector/Athena 2 (sheet): 2 bộ phát đáp S-band, MGA mảng pha có khe + LGA. Telemetry 3,6 kbps, link margin > 3 dB.',
            en: 'As Lunar Prospector/Athena 2 (sheet): two S-band transponders, slotted phased-array MGA + LGA. 3.6 kbps telemetry, link margin > 3 dB.' } },
  { id: 'hgaS', icon: 'antHGA', name: { vi: 'HGA S-band 1 m', en: 'S-band 1 m HGA' }, rate0Kbps: 120, mass: 15, power: 35, cost: 7.0, transponder: true, src: 'est',
    desc: { vi: 'Ăng-ten parabol độ lợi cao – tốc độ cao hơn nhiều nhưng cần trỏ chính xác.', en: 'High-gain dish – far higher rate but needs accurate pointing.' } },
  { id: 'hgaKa', icon: 'antKa', name: { vi: 'HGA Ka-band (lớp LRO)', en: 'Ka-band HGA (LRO-class)' }, rate0Kbps: 100000, mass: 32, power: 110, cost: 18.0, transponder: true, src: 'est',
    desc: { vi: 'Đường truyền Ka-band ~100 Mbps như LRO. Rất tốn điện.', en: 'Ka-band ~100 Mbps link like LRO. Power-hungry.' } },
];

/* ---------- Scientific instruments (sheet "Spacecraft (Scientific Instruments)") ---------- */
const INSTRUMENTS = [
  { id: 'er', icon: 'instMag', short: 'ER/MAG', name: { vi: 'Phản xạ kế electron & Từ kế (ER)', en: 'Electron Reflectometer & Magnetometer (ER)' },
    mass: 5.0, power: 4.5, dataKbps: 0.7, cost: 5, sci: 15, slot: 1, src: 'sheet',
    desc: { vi: 'Đo từ trường tổng thể cực yếu và dị thường từ trên lớp vỏ cổ – các "chiếc ô" làm lệch gió Mặt Trời.',
            en: 'Measures the Moon’s very weak global field and crustal magnetic anomalies – tiny “umbrellas” that deflect the solar wind.' } },
  { id: 'grs', icon: 'instGamma', short: 'GRS', name: { vi: 'Phổ kế tia Gamma (GRS)', en: 'Gamma-Ray Spectrometer (GRS)' },
    mass: 6.5, power: 3.0, dataKbps: 0.8, cost: 7, sci: 20, slot: 1, src: 'sheet',
    desc: { vi: 'Lập bản đồ Fe, Ti, U, Th, K, O, Si… từ tia gamma; xác nhận chéo mật độ Hydro mà NS tìm thấy.',
            en: 'Maps Fe, Ti, U, Th, K, O, Si… from gamma rays; cross-checks the hydrogen found by NS.' } },
  { id: 'ns', icon: 'instNeutron', short: 'NS', name: { vi: 'Phổ kế Neutron (NS)', en: 'Neutron Spectrometer (NS)' },
    mass: 3.9, power: 2.5, dataKbps: 0.1, cost: 4, sci: 25, slot: 1, src: 'sheet',
    desc: { vi: 'Phát hiện hydro (băng nước) ở các hố tối vĩnh viễn hai cực qua sự sụt giảm neutron epithermal. BẮT BUỘC cho Threshold Science.',
            en: 'Detects hydrogen (water ice) in permanently shadowed polar craters via epithermal-neutron dips. REQUIRED for Threshold Science.' } },
  { id: 'aps', icon: 'instAlpha', short: 'APS', name: { vi: 'Phổ kế hạt Alpha (APS)', en: 'Alpha Particle Spectrometer (APS)' },
    mass: 4.5, power: 7.0, dataKbps: 0.2, cost: 4, sci: 10, slot: 1, src: 'sheet',
    desc: { vi: 'Ghi nhận hạt alpha từ khí Radon/Poloni thoát ra qua vết nứt kiến tạo → lịch sử thoát khí, chất bay hơi.',
            en: 'Detects alpha particles from radon/polonium outgassing through tectonic cracks → volatile release history.' } },
  { id: 'dge', icon: 'instDoppler', short: 'DGE', name: { vi: 'Thí nghiệm trọng lực Doppler (DGE)', en: 'Doppler Gravity Experiment (DGE)' },
    mass: 0, power: 0, dataKbps: 0, cost: 1.5, sci: 15, slot: 0, needsTransponder: true, src: 'sheet',
    desc: { vi: 'Dùng chính tín hiệu S-band để đo vận tốc cực nhỏ → bản đồ trọng trường, mascon, lõi sắt. Không có phần cứng riêng, cần bộ phát đáp.',
            en: 'Uses the S-band signal itself to measure tiny velocity shifts → gravity map, mascons, iron core. No hardware, needs a transponder.' } },
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
   4. I18N
   ===================================================================== */
const I18N = {
  vi: {
    title: 'THIẾT KẾ NHIỆM VỤ KHÔNG GIAN', subtitle: 'JPL CML 2 ↔ 3 ↔ 4 · Space Apps 2026 HCMC',
    missionTarget: 'Mục tiêu', lifetime: 'Tuổi thọ', months: '{n} tháng', budget: 'Ngân sách',
    tabLV: 'Tên lửa đẩy', tabSC: 'Tàu vũ trụ', tabHint: '↔ Chuyển qua lại giữa 2 phần để cân bằng trade-off',
    checklistTitle: 'CML 4 / KDP — Bảng kiểm sẵn sàng', advisorTitle: 'Kỹ sư hệ thống tư vấn',
    launchBtn: 'PROCEED TO LAUNCH', close: 'Đóng',
    legLV: 'Tên lửa', legSC: 'Tàu', legOps: 'Vận hành', legRes: 'Dự phòng',
    secStages: 'Động cơ / tầng đẩy', secSRB: 'Tên lửa đẩy phụ (SRB)', secProp: 'Nhiên liệu & lượng nạp', secFairing: 'Kết cấu / Chụp mũi',
    secBus: 'Khung tàu (Bus)', secBattery: 'Pin (Battery)', secSolar: 'Pin mặt trời', secAct: 'Actuator (điều khiển tư thế)',
    secTel: 'Viễn thông (Telecom)', secInst: 'Thiết bị khoa học',
    hintProp: 'Chọn loại nhiên liệu cho từng tầng và kéo thanh trượt để quyết định nạp bao nhiêu.',
    hintSolar: 'Số bộ pin (mỗi bộ chiếm 1 slot):', hintInst: 'Off / Chuẩn / Nâng cao — tier cao: nhiều khoa học hơn nhưng nặng, tốn điện, nhiều dữ liệu, đắt.',
    none: 'Không có', noneDesc: 'Bỏ trống tầng này', count: 'Số lượng',
    thrust: 'Lực đẩy', isp: 'Isp', empty: 'K.lượng rỗng', propMax: 'Nhiên liệu tối đa', dims: 'Kích thước', burn: 'Thời gian cháy',
    density: 'Mật độ', costKg: 'Giá', mass: 'Khối lượng', volume: 'Thể tích tải', power: 'Điện', data: 'Dữ liệu', science: 'Khoa học',
    slots: 'Slot', maxMass: 'Giới hạn', cap: 'Dung lượng', control: 'Ổn định tới', rate0: 'Tốc độ @0 dB',
    fitsOnly: 'Chỉ lắp cho bus: {b}', slotFull: 'Hết slot trên bus! ({u}/{s})',
    tierOff: 'Off', tierStd: 'Chuẩn', tierEnh: 'Nâng cao',
    stageLabel: 'Tầng', compatible: 'tương thích', incompatible: 'KHÔNG tương thích',
    stTWR: 'TWR cất cánh', stDV: 'Δv / yêu cầu', stCap: 'Tải tối đa', stLaunchMass: 'K.lượng cất cánh',
    stSCMass: 'K.lượng tàu', stPower: 'Điện: tạo / tải', stLink: 'Link margin', stSci: 'Điểm khoa học',
    stSlots: 'Slot dùng', stEnergy: 'Pin: có / cần', stData: 'Dữ liệu cần', stCost: 'Chi phí phần này',
    ck_thrust: 'Lực đẩy cất cánh', ck_thrust_s: 'Thrust ≥ trọng lượng tổng (TWR ≥ 1)',
    ck_fit: 'Vừa chụp mũi', ck_fit_s: 'Thể tích tàu ≤ thể tích tải',
    ck_dv: 'Δv quỹ đạo', ck_dv_s: 'Tsiolkovsky Δv ≥ yêu cầu',
    ck_mass: 'Margin khối lượng tàu', ck_mass_s: '≥35% (min bus, tải tên lửa)',
    ck_power: 'Margin nguồn điện', ck_power_s: 'Pin MT phủ tải + sạc pin',
    ck_energy: 'Margin năng lượng pin', ck_energy_s: 'Đủ cho thời kỳ che khuất',
    ck_link: 'Link margin', ck_link_s: '≥{db} dB ({k})',
    ck_act: 'Margin actuator', ck_act_s: 'Mô-men đủ ổn định tàu',
    ck_sci: 'Mục tiêu khoa học', ck_sci_s: 'Threshold {th} · Baseline {bl}',
    ck_budget: 'Dự phòng ngân sách', ck_budget_s: '≥15% ngân sách còn lại',
    deepSpace: 'không gian sâu', orbitK: 'quỹ đạo gần',
    gateText: '<b>{g}/{n}</b> mục Xanh ({p}%) · <b>{r}</b> Đỏ — cần ≥80% Xanh và 0 Đỏ',
    gateOpen: '✅ Đủ điều kiện KDP — sẵn sàng phóng!',
    rocketTitle: 'TÊN LỬA ĐẨY', scTitle: 'TÀU VŨ TRỤ', height: 'Cao', liftoff: 'Cất cánh',
    // advisor
    adv_allGood: '<b>Tuyệt vời!</b> Mọi chỉ số đều đạt. Bạn có thể bấm PROCEED TO LAUNCH, hoặc tiếp tục tối ưu để tăng điểm khoa học và dự phòng ngân sách.',
    adv_gateAlmost: 'Không còn mục Đỏ, nhưng mới có {p}% Xanh (cần 80%). Hãy nâng các mục Vàng lên Xanh.',
    adv_thrust: '<b>Không cất cánh được:</b> lực đẩy {f} kN < trọng lượng {w} kN (TWR {twr}). Nhiên liệu và tầng trên càng nặng thì càng khó rời bệ. Hãy giảm nạp nhiên liệu tầng trên, thêm SRB Aerojet, hoặc dùng tầng 1 mạnh hơn (RD-180).',
    adv_s1Incompat: '<b>{e}</b> được thiết kế cho nhiên liệu <b>{p}</b>. Nạp sai loại → động cơ không hoạt động (lực đẩy = 0). Hãy chọn đúng nhiên liệu ở mục "Nhiên liệu & lượng nạp".',
    adv_stageIncompat: 'Tầng <b>{e}</b> đang nạp nhiên liệu không tương thích → tầng này chỉ là khối lượng chết, không tạo Δv.',
    adv_dv: '<b>Thiếu Δv:</b> {dv} km/s < {req} km/s (thiếu {gap} km/s). Theo phương trình Tsiolkovsky, Δv tăng theo Isp và tỉ số khối lượng m₀/m_f. Thêm nhiên liệu, thêm tầng trên Isp cao (RL-10: 451 s), hoặc giảm khối lượng tàu. Tải tối đa hiện tại: {cap} kg.',
    adv_dvTwr: 'Lưu ý trade-off: thêm nhiên liệu tăng Δv nhưng làm nặng tên lửa → TWR giảm (hiện {twr}).',
    adv_fit: '<b>Tàu không vừa chụp mũi:</b> cần {v} m³ nhưng chụp mũi chỉ chứa {fv} m³. Chọn chụp mũi lớn hơn ở Phần 1 (nặng hơn → mất Δv) hoặc dùng bus nhỏ hơn.',
    adv_mass: '<b>Margin khối lượng tàu {m}%</b> (cần ≥35% theo luật JPL CML). Tàu nặng {kg} kg; giới hạn cho phép {alloc} kg do <b>{lim}</b>. Bỏ bớt thiết bị, hạ tier, hoặc quay lại Phần 1 nâng cấp tên lửa để tăng tải tối đa.',
    adv_limBus: 'giới hạn của bus', adv_limLV: 'tải tối đa của tên lửa',
    adv_slots: '<b>Vượt slot:</b> đang dùng {u}/{s} slot của bus. Bỏ bớt thiết bị hoặc chọn bus lớn hơn.',
    adv_power: '<b>Margin nguồn {m}%:</b> pin mặt trời cho trung bình {avail} W nhưng cần {need} W (tải {load} W + nạp lại pin sau {ecl} phút che khuất mỗi vòng). Thêm bộ pin, dùng pin gập (bám Mặt Trời, không bị hệ số quay 0,7), hoặc giảm thiết bị tốn điện.',
    adv_energy: '<b>Margin pin {m}%:</b> pin dùng được {use} Wh (độ xả sâu DoD {dod}% để sống {life} tháng) nhưng mỗi lần che khuất cần {need} Wh. Chọn pin dung lượng lớn hơn hoặc giảm tải. Nhiệm vụ càng dài → DoD cho phép càng thấp.',
    adv_noBattery: '<b>Chưa có pin:</b> tàu sẽ tắt nguồn mỗi khi đi vào bóng tối ({ecl} phút/vòng).',
    adv_noSolar: '<b>Chưa có pin mặt trời:</b> không có nguồn điện để nạp pin.',
    adv_link: '<b>Link margin {db} dB</b> (cần ≥{req} dB). Thiết bị tạo dữ liệu → phải downlink {rate} kbps trong {c}% thời gian liên lạc. Chọn ăng-ten độ lợi cao hơn hoặc hạ tier thiết bị nhiều dữ liệu (GRS, ER).',
    adv_noTel: '<b>Chưa có telecom:</b> không thể gửi dữ liệu về Trái Đất.',
    adv_act: '<b>Margin actuator {m}%:</b> bộ {a} ổn định được ~{cap} kg, tàu nặng {kg} kg. Bus lớn và tải nặng cần actuator mô-men lớn hơn.',
    adv_noAct: '<b>Chưa có actuator:</b> tàu không thể giữ hướng ăng-ten/pin, không chỉnh được quỹ đạo.',
    adv_sciNS: '<b>Thiếu NS:</b> mục tiêu Threshold là tìm băng nước ở cực → bắt buộc có Phổ kế Neutron.',
    adv_sciLow: '<b>Khoa học {s} điểm</b> < Threshold {th}. Thêm thiết bị hoặc nâng tier (đổi lại khối lượng, điện, dữ liệu, chi phí).',
    adv_sciY: 'Đạt Threshold ({s} điểm). Cần {bl} điểm cho Baseline Science → Xanh.',
    adv_dge: 'DGE cần bộ phát đáp (transponder) để đo Doppler – LGA đơn không có → DGE không cho điểm.',
    adv_budget: '<b>Dự phòng {r}%</b> (cần ≥15%). Đã chi {c} M$ / {b} M$: tên lửa {lv} M$, tàu {sc} M$, vận hành {ops} M$. Tên lửa lớn (RD-180, Centaur) và bus lớn là các khoản đắt nhất.',
    adv_hammer: 'Chụp mũi Ø{f} m rộng hơn nhiều so với tầng 1 Ø{s} m ("hammerhead") → tải khí động lớn. Cân nhắc chụp mũi nhỏ hơn.',
    adv_battFit: '{b} không lắp được trên {bus} (theo sheet).',
    adv_intro: 'Bắt đầu với <b>Phần 1</b>: chọn tầng đẩy, nhiên liệu, lượng nạp và chụp mũi. Sau đó sang <b>Phần 2</b> thiết kế tàu. Các chỉ số Đỏ sẽ được giải thích ở đây.',
    // launch
    l_liftoff: 'CẤT CÁNH!', l_srbsep: 'Tách SRB', l_sep: 'Tách {s}', l_fairing: 'Tách chụp mũi', l_orbit: 'Vào quỹ đạo!', l_tli: 'Đã đẩy vào quỹ đạo tới Mặt Trăng!',
    r_title: 'BÁO CÁO NHIỆM VỤ', r_success: 'Nhiệm vụ thành công', r_grade: 'Mức khoa học', r_baseline: 'Baseline ✓', r_threshold: 'Threshold ✓',
    r_score: 'Điểm tổng', r_sci: 'Điểm khoa học', r_reserve: 'Dự phòng ngân sách', r_dvMargin: 'Δv dư', r_mass: 'Margin khối lượng tàu', r_greens: 'Mục Xanh',
  },
  en: {
    title: 'SPACE MISSION DESIGNER', subtitle: 'JPL CML 2 ↔ 3 ↔ 4 · Space Apps 2026 HCMC',
    missionTarget: 'Target', lifetime: 'Lifetime', months: '{n} months', budget: 'Budget',
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
    adv_energy: '<b>Battery margin {m}%:</b> usable {use} Wh (depth of discharge {dod}% to last {life} months) but each eclipse needs {need} Wh. Choose a bigger battery or cut load. Longer missions allow shallower DoD.',
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
  },
};

/* =====================================================================
   STATE
   ===================================================================== */
const state = {
  lang: 'vi',
  tab: 'lv',
  missionId: 'lunar',
  lifetimeMonths: 12,
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

/** Depth-of-discharge allowed for a given lifetime (cycle life of Li-ion). */
function allowedDoD(months) { return Math.max(0.35, Math.min(0.75, 0.75 - (months - 6) * (0.35 / 30))); }

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
  const lifeYears = s.lifetimeMonths / 12;
  const degr = Math.pow(1 - CONFIG.solarDegradationPerYear, lifeYears);
  const tOrb = m.orbitMin, tE = m.eclipseMin, tSun = tOrb - tE;
  const genPeak = sol ? sol.watts * nSol : 0;
  const genAvgSun = genPeak * (sol ? sol.eff : 0) * degr;          // W while in sunlight
  const needSun = load + (load * tE / CONFIG.batteryChargeEff) / tSun; // W needed while in sunlight
  const powerMargin = needSun > 0 ? genAvgSun / needSun - 1 : 1;

  // ---- energy ----
  const dod = allowedDoD(s.lifetimeMonths);
  const usableWh = bat ? bat.capWh * dod : 0;
  const needWh = load * tE / 60;
  const energyMargin = needWh > 0 ? usableWh / needWh - 1 : 1;

  // ---- telecom link ----
  const totalData = dataKbps + CONFIG.housekeepingKbps;
  const reqRate = totalData / m.contactFraction;
  const linkDb = tel ? 10 * Math.log10((tel.rate0Kbps * m.rateFactor) / reqRate) : -Infinity;

  // ---- actuators ----
  const actMargin = act ? act.capKg / mass - 1 : -1;

  const volume = bus.volume;
  return { bus, bat, sol, act, tel, nSol, mass, load, cost, slots, slotsMax: bus.slots, dataKbps, totalData, reqRate,
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
  let s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
function L(x) { return x == null ? '' : typeof x === 'string' ? x : x[state.lang] || x.en; }
function fmt(n, d = 0) {
  if (!isFinite(n)) return '—';
  return Number(n).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const tonnes = kg => fmt(kg / 1000, kg < 10000 ? 2 : 1) + ' t';

/* =====================================================================
   6. PIXEL ART
   ===================================================================== */
const PAL = {
  outline: '#0b0f1e', white: '#f2f4ff', grey: '#9aa3bf', dgrey: '#5b6485', steel: '#c9ccd8',
  orange: '#ff8a3d', bronze: '#c9772f', yellow: '#ffcc33', red: '#ff4d5e', green: '#3ddc84',
  blue: '#2f6bff', cyan: '#4fd1ff', navy: '#1b2a6b', gold: '#e2b23a', goldD: '#a77a1c',
  cell: '#2346a8', cellL: '#4a7dff', flame1: '#fff3a0', flame2: '#ffb238', flame3: '#ff5a2a',
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
  for (const s of STARS) px(ctx, s.x % W, (s.y + shift) % H, 1, 1, s.b === 0 ? '#ffffff' : s.b === 1 ? '#8fa0d0' : '#4a5580');
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
    ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, PW, PH);
    drawStars(ctx, PW, PH);
    // ground & pad
    px(ctx, 0, groundY, PW, PH - groundY, '#1b2340'); px(ctx, 0, groundY, PW, 1, '#2f3d6e');
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
  if (lv.nSRB > 0 && !opts.hideSRB) {
    for (let i = 0; i < lv.nSRB; i++) {
      const side = i % 2 === 0 ? -1 : 1, k = Math.floor(i / 2);
      const x = side < 0 ? cx - s1w / 2 - srbW - k * (srbW - 1) : cx + s1w / 2 + k * (srbW - 1);
      const top = y - srbLen;
      px(ctx, x, top + 2, srbW, srbLen - 2, PAL.white); px(ctx, x, top + 2, 1, srbLen - 2, PAL.grey);
      px(ctx, x + 1, top, srbW - 2, 2, PAL.white); px(ctx, x, top + srbLen * 0.5, srbW, 1, PAL.dgrey);
      px(ctx, x, y, srbW, 2, PAL.dgrey);
      if (i === 0) parts.push({ kind: 'srb', x0: x, x1: x + srbW, y0: top, y1: y, label: `${lv.nSRB}× Aerojet SRB`, sub: `${tonnes(lv.nSRB * (SRB.engineMass + SRB.propMax))} · Ø${SRB.dia} m` });
      if (opts.flame) drawFlame(ctx, x + srbW / 2, y + 2, srbW, opts.flame);
    }
  }

  // stages
  lv.stages.forEach((st, i) => {
    if (opts.dropStages && i < opts.dropStages) return;
    const e = st.eng;
    const h = Math.max(4, Math.round(st.len * ppm));
    const w = Math.max(5, Math.round(e.dia * ppm));
    const x = Math.round(cx - w / 2);
    const top = y - h;
    const propC = (byId(PROPELLANTS, st.prop) || {}).color || '#888';
    // nozzle
    const nzH = Math.max(2, Math.round(h * 0.12));
    if (i === 0 || opts.dropStages === i) {
      px(ctx, x + 1, y - nzH, w - 2, nzH, PAL.dgrey); px(ctx, x, y - 1, w, 1, PAL.grey);
      if (opts.flame && st.compatible) drawFlame(ctx, cx, y, w, opts.flame);
    }
    const bodyTop = top, bodyH = h - (i === 0 || opts.dropStages === i ? nzH : 0);
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
    parts.push({ kind: 'stage', idx: i, x0: x, x1: x + w, y0: top, y1: y,
      label: `${t('stageLabel')} ${i + 1}: ${e.name}`,
      sub: `${tonnes(st.dryMass + st.propMass)} · Ø${e.dia} m · ${Math.round(st.load * 100)}% ${L(byId(PROPELLANTS, st.prop).name)}` });
    y = top;
    // interstage band
    if (i < lv.stages.length - 1) { px(ctx, cx - w / 2, y - 1, w, 1, PAL.dgrey); }
  });

  // payload + fairing
  if (!opts.hideFairing) {
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
    parts.push({ kind: 'fairing', x0: cx - fw / 2, x1: cx + fw / 2, y0: top, y1: y,
      label: L(fair.name), sub: `${fmt(fair.mass)} kg · ${fair.volume} m³ · S/C ${fmt(ev.sc.mass)} kg` });
    y = top;
  } else {
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
  const sc = ev.sc;
  const m = ev.m;
  const parts = [];
  ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, PW, PH);
  drawStars(ctx, PW, PH);
  // planet
  if (m.id === 'lunar') {
    ctx.fillStyle = '#8b8f9e'; ctx.beginPath(); ctx.arc(128, 160, 46, 0, Math.PI * 2); ctx.fill();
    [[110, 128, 4], [128, 138, 6], [100, 146, 3], [140, 124, 3]].forEach(([x, y, r]) => { ctx.fillStyle = '#6c7080'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  } else {
    ctx.fillStyle = '#2a5fd0'; ctx.beginPath(); ctx.arc(128, 168, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ddc84'; ctx.fillRect(98, 128, 14, 6); ctx.fillRect(118, 122, 10, 5);
  }
  const cx = 62, cy = 78;
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
    parts.push({ x0: ex - sz / 2, x1: ex + sz / 2, y0: ey - sz / 2, y1: ey + sz / 2, label: `${it.ins.short}${it.tier === 2 ? ' ★' : ''}`,
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
    parts.push({ x0: bx - 3 - panels * 7, x1: bx - 3, y0: cy - 6, y1: cy + 2, label: `${sc.nSol}× ${L(sc.sol.name)}`, sub: `${fmt(sc.genPeak)} W`, left: true });
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
    parts.push({ x0: bx, x1: bx + cw, y0: by + 2, y1: by + bh - 2, label: `${sc.nSol}× ${L(sc.sol.name)}`, sub: `${fmt(sc.genPeak)} W · eff 70%`, left: true });
  }
  parts.push({ x0: bx, x1: bx + bw, y0: by, y1: by + bh, label: L(sc.bus.name), sub: `${fmt(sc.mass)} kg · ${sc.slots}/${sc.slotsMax} slots` });

  // battery cut-away
  if (sc.bat) {
    const cells = Math.min(6, sc.bat.level + 1);
    const ww = cells * 2 + 2, hh = 5;
    const wx = Math.round(cx - ww / 2), wy = by + bh - hh - 2;
    px(ctx, wx, wy, ww, hh, PAL.outline);
    for (let i = 0; i < cells; i++) px(ctx, wx + 1 + i * 2, wy + 1, 1, hh - 2, sc.batFits ? PAL.green : PAL.red);
    parts.push({ x0: wx, x1: wx + ww, y0: wy, y1: wy + hh, label: `🔋 ${sc.bat.name}`, sub: `${fmt(sc.usableWh)} Wh usable` });
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
    parts.push({ x0: bx, x1: bx + 3, y0: by + bh, y1: by + bh + 3, label: L(sc.act.name), sub: `≤ ${fmt(sc.act.capKg)} kg`, left: true });
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
      for (let k = 0; k < 4; k++) { const w = r * 2 - k * 4; px(ctx, cx - w / 2, topY - 6 - k, w, 1, k === 3 ? PAL.white : PAL.steel); }
      px(ctx, cx, topY - 13, 1, 4, PAL.grey); px(ctx, cx - 1, topY - 14, 3, 1, sc.tel.id === 'hgaKa' ? PAL.cyan : PAL.yellow);
      tx0 = cx - r; tx1 = cx + r; ty0 = topY - 14;
    }
    // DGE radio waves
    if ((state.sc.instruments.dge || 0) > 0) {
      const ok = sc.tel.transponder;
      for (let k = 1; k <= 3; k++) {
        ctx.strokeStyle = ok ? PAL.cyan : PAL.red; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx + 0.5, ty0, 3 + k * 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
      parts.push({ x0: cx + 4, x1: cx + 8, y0: ty0 - 14, y1: ty0 - 10, label: 'DGE (Doppler)', sub: ok ? 'S-band ✓' : '✗ transponder' });
    }
    parts.push({ x0: tx0, x1: tx1, y0: ty0, y1: topY, label: L(sc.tel.name), sub: isFinite(sc.linkDb) ? `${fmt(sc.linkDb, 1)} dB` : '' });
  }
  return parts;
}

/* --- shared call-out drawing on hi-res canvas --- */
function drawCallouts(ctx, parts, scale) {
  ctx.font = '600 12px "Be Vietnam Pro", sans-serif';
  const right = parts.filter(p => !p.left).sort((a, b) => a.y0 - b.y0);
  const left = parts.filter(p => p.left).sort((a, b) => a.y0 - b.y0);
  const place = (list, colX, align) => {
    let lastY = 70;
    for (const p of list) {
      const ty = Math.max(lastY + 34, ((p.y0 + p.y1) / 2) * scale);
      lastY = ty;
      const ax = (align === 'left' ? p.x1 : p.x0) * scale + (align === 'left' ? 2 : -2);
      const ay = ((p.y0 + p.y1) / 2) * scale;
      ctx.strokeStyle = '#ffcc33aa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(colX + (align === 'left' ? -8 : 8), ty); ctx.lineTo(colX, ty); ctx.stroke();
      ctx.fillStyle = '#ffcc33'; ctx.fillRect(ax - 2, ay - 2, 4, 4);
      ctx.textAlign = align;
      ctx.font = '700 12px "Be Vietnam Pro", sans-serif';
      const tw = Math.max(ctx.measureText(p.label).width, (ctx.font = '11px "Be Vietnam Pro", sans-serif', ctx.measureText(p.sub || '').width));
      ctx.fillStyle = '#050816cc';
      ctx.fillRect(align === 'left' ? colX - 3 : colX - tw - 3, ty - 15, tw + 6, 31);
      ctx.fillStyle = '#e6ecff'; ctx.font = '700 12px "Be Vietnam Pro", sans-serif';
      ctx.fillText(p.label, colX, ty - 2);
      ctx.fillStyle = '#8fa0d0'; ctx.font = '11px "Be Vietnam Pro", sans-serif';
      ctx.fillText(p.sub || '', colX, ty + 12);
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

function makeCard({ id, iconKey, iconOpt, title, tag, specs, cost, src, selected, disabled, desc, onClick, extra }) {
  const el = document.createElement('div');
  el.className = 'card' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '');
  const top = document.createElement('div'); top.className = 'card-top';
  top.appendChild(makeIconCanvas(id, iconKey, iconOpt));
  const nm = document.createElement('div');
  nm.innerHTML = `<div class="name">${title}</div>${tag ? `<div class="tag">${tag}</div>` : ''}`;
  top.appendChild(nm);
  el.appendChild(top);
  if (specs) { const s = document.createElement('div'); s.className = 'specs'; s.innerHTML = specs; el.appendChild(s); }
  if (cost != null) { const c = document.createElement('div'); c.className = 'cost'; c.textContent = `$${fmt(cost, cost < 10 ? 1 : 0)}M`; el.appendChild(c); }
  if (desc) { const d = document.createElement('div'); d.className = 'desc'; d.textContent = desc; el.appendChild(d); }
  if (src) el.insertAdjacentHTML('beforeend', srcBadge(src));
  if (extra) el.appendChild(extra);
  if (onClick && !disabled) el.addEventListener('click', onClick);
  if (disabled && typeof disabled === 'string') el.title = disabled;
  return el;
}
function section(title, sub, hint) {
  const s = document.createElement('div'); s.className = 'section';
  s.innerHTML = `<h3>${title}${sub ? `<small>${sub}</small>` : ''}</h3>${hint ? `<div class="hint">${hint}</div>` : ''}`;
  return s;
}
function cardsWrap(sec) { const c = document.createElement('div'); c.className = 'cards'; sec.appendChild(c); return c; }

/* ---------- Part 1 inventory ---------- */
function buildLVInventory(root) {
  // Stages
  for (const slot of STAGE_SLOTS) {
    const sec = section(`${t('secStages')} · ${L(slot.label)}`);
    const wrap = cardsWrap(sec);
    for (const opt of slot.options) {
      const st = state.lv.stages[slot.key];
      if (opt === null) {
        wrap.appendChild(makeCard({ id: null, iconKey: 'none', title: t('none'), tag: t('noneDesc'), selected: st.engine === null,
          onClick: () => { st.engine = null; update(); } }));
        continue;
      }
      const e = engineById(opt);
      const p = byId(PROPELLANTS, e.prop);
      wrap.appendChild(makeCard({
        id: e.id, iconKey: e.icon, iconOpt: { color: e.color }, title: e.name, tag: `${e.engineType} · ${e.stageClass}`,
        specs: `${t('thrust')}: <b>${fmt(e.thrustVac, e.thrustVac < 10 ? 3 : 0)} kN</b><br>${t('isp')}: <b>${e.ispVac} s</b>${e.ispSL ? ` (SL ${e.ispSL})` : ''}<br>${t('empty')}: <b>${fmt(e.engineMass + e.tankMassMax)} kg</b><br>${t('propMax')}: <b>${fmt(e.propMax)} kg</b> ${L(p.name)}<br>${t('dims')}: Ø${e.dia} × ${e.len} m · ${t('burn')} ${e.burn} s`,
        cost: e.cost, src: e.src, desc: L(e.desc), selected: st.engine === e.id,
        onClick: () => { st.engine = e.id; st.prop = e.prop; st.load = 1; update(); },
      }));
    }
    root.appendChild(sec);
  }

  // SRB
  const ssec = section(t('secSRB'));
  const sw = cardsWrap(ssec);
  const stepper = document.createElement('div'); stepper.className = 'stepper';
  stepper.innerHTML = `<button data-d="-1">−</button><b>${state.lv.srbCount}</b><button data-d="1">+</button><span class="tag">/ ${SRB.maxCount}</span>`;
  stepper.querySelectorAll('button').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    state.lv.srbCount = Math.max(0, Math.min(SRB.maxCount, state.lv.srbCount + Number(b.dataset.d))); update();
  }));
  sw.appendChild(makeCard({ id: SRB.id, iconKey: SRB.icon, title: SRB.name, tag: `${SRB.engineType} · ${SRB.stageClass}`,
    specs: `${t('thrust')}: <b>${fmt(SRB.thrustVac)} kN</b><br>${t('isp')}: <b>${SRB.ispVac} s</b> (SL ${SRB.ispSL})<br>${t('mass')}: <b>${fmt(SRB.engineMass + SRB.propMax)} kg</b><br>${t('dims')}: Ø${SRB.dia} × ${SRB.len} m`,
    cost: SRB.cost, src: SRB.src, desc: L(SRB.desc), selected: state.lv.srbCount > 0, extra: stepper }));
  root.appendChild(ssec);

  // Propellant & load
  const psec = section(t('secProp'), '', t('hintProp'));
  const stages = buildStages();
  stages.forEach((st, i) => {
    const row = document.createElement('div'); row.className = 'prop-row';
    const e = st.eng;
    row.innerHTML = `<div class="prop-head">${t('stageLabel')} ${i + 1}: ${e.name} <span>${st.compatible ? '✓ ' + t('compatible') : '✗ ' + t('incompatible')}</span></div>`;
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const p of PROPELLANTS) {
      const c = document.createElement('div');
      const sel = state.lv.stages[st.key].prop === p.id;
      c.className = 'chip' + (sel ? (p.id === e.prop ? ' selected' : ' bad') : '');
      c.title = `${L(p.desc)}\n${t('density')}: ${p.density} kg/m³ · Isp ${p.ispRange} · $${p.costPerKg}/kg`;
      const ic = makeIconCanvas(p.id, p.icon); c.appendChild(ic);
      c.insertAdjacentHTML('beforeend', `<span>${L(p.name)}<br><small style="color:var(--muted)">${p.density} kg/m³ · $${p.costPerKg}/kg</small></span>`);
      c.addEventListener('click', () => { state.lv.stages[st.key].prop = p.id; update(); });
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
    r.innerHTML = `<div class="prop-head">${state.lv.srbCount}× Aerojet SRB <span>${fmt(SRB.propMax * state.lv.srbCount)} kg ${L(byId(PROPELLANTS, 'SOLID').name)} (100%)</span></div>`;
    psec.appendChild(r);
  }
  root.appendChild(psec);

  // Fairing
  const fsec = section(t('secFairing'));
  const fw = cardsWrap(fsec);
  for (const f of FAIRINGS) {
    fw.appendChild(makeCard({ id: f.id, iconKey: f.icon, iconOpt: { w: Math.round(4 + f.dia * 1.6) }, title: L(f.name),
      specs: `${t('mass')}: <b>${fmt(f.mass)} kg</b><br>${t('dims')}: Ø${f.dia} × ${f.len} m<br>${t('volume')}: <b>${f.volume} m³</b>`,
      cost: f.cost, src: f.src, desc: L(f.desc), selected: state.lv.fairing === f.id, onClick: () => { state.lv.fairing = f.id; update(); } }));
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
  if (r.used > r.max && r.used > cur.slots) { flash(t('slotFull', { u: r.used, s: r.max })); update(); return; }
  change(state); update();
}
function buildSCInventory(root) {
  const sc = state.sc;
  // Bus
  const bsec = section(t('secBus'), 'Small / Medium / Large');
  const bw = cardsWrap(bsec);
  for (const b of BUSES) {
    bw.appendChild(makeCard({ id: b.id, iconKey: b.icon, title: L(b.name), tag: b.dims,
      specs: `${t('mass')}: <b>${fmt(b.baseMass)} kg</b> · ${t('maxMass')} <b>${fmt(b.maxMass)} kg</b><br>${t('slots')}: <b>${b.slots}</b> · ${t('power')}: <b>${b.basePower} W</b><br>${t('volume')}: ${b.volume} m³`,
      cost: b.cost, src: b.src, desc: L(b.desc), selected: sc.bus === b.id,
      onClick: () => { sc.bus = b.id; const bat = byId(BATTERIES, sc.battery); if (bat && !bat.fits.includes(b.id)) { flash(t('adv_battFit', { b: bat.name, bus: L(b.name) })); sc.battery = null; } update(); } }));
  }
  root.appendChild(bsec);

  // Battery
  const bat = section(t('secBattery'));
  const btw = cardsWrap(bat);
  for (const b of BATTERIES) {
    const fits = b.fits.includes(sc.bus);
    btw.appendChild(makeCard({ id: b.id, iconKey: b.icon, iconOpt: { level: b.level }, title: b.name, tag: `sheet: ${b.sheetTag}`,
      specs: `${t('cap')}: <b>${b.capWh} Wh</b><br>${t('mass')}: <b>${b.mass} kg</b>`, cost: b.cost, src: b.src,
      selected: sc.battery === b.id, disabled: fits ? false : t('fitsOnly', { b: b.fits.join(', ') }),
      onClick: () => trySelect(s => { s.sc.battery = s.sc.battery === b.id ? null : b.id; }) }));
  }
  root.appendChild(bat);

  // Solar
  const ssec = section(t('secSolar'), '', t('hintSolar'));
  const st = document.createElement('div'); st.className = 'stepper';
  st.innerHTML = `<span class="tag">${t('count')}</span><button data-d="-1">−</button><b>${sc.solarCount}</b><button data-d="1">+</button>`;
  st.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const n = Math.max(1, Math.min(SOLAR_MAX_COUNT, sc.solarCount + Number(b.dataset.d)));
    if (sc.solar) trySelect(s => { s.sc.solarCount = n; }); else { sc.solarCount = n; update(); }
  }));
  ssec.appendChild(st);
  const sw = cardsWrap(ssec);
  for (const p of SOLAR_PANELS) {
    sw.appendChild(makeCard({ id: p.id, iconKey: p.icon, title: L(p.name),
      specs: `${t('power')}: <b>${p.watts} W</b> × eff ${Math.round(p.eff * 100)}%<br>${t('mass')}: <b>${p.mass} kg</b>`, cost: p.cost, src: p.src, desc: L(p.desc),
      selected: sc.solar === p.id, onClick: () => trySelect(s => { s.sc.solar = s.sc.solar === p.id ? null : p.id; }) }));
  }
  root.appendChild(ssec);

  // Actuators
  const asec = section(t('secAct'));
  const aw = cardsWrap(asec);
  for (const a of ACTUATORS) {
    aw.appendChild(makeCard({ id: a.id, iconKey: a.icon, title: L(a.name),
      specs: `${t('control')}: <b>${fmt(a.capKg)} kg</b><br>${t('mass')}: <b>${a.mass} kg</b> · ${t('power')}: ${a.power} W`, cost: a.cost, src: a.src, desc: L(a.desc),
      selected: sc.actuator === a.id, onClick: () => trySelect(s => { s.sc.actuator = s.sc.actuator === a.id ? null : a.id; }) }));
  }
  root.appendChild(asec);

  // Telecom
  const tsec = section(t('secTel'));
  const tw = cardsWrap(tsec);
  for (const x of TELECOMS) {
    tw.appendChild(makeCard({ id: x.id, iconKey: x.icon, title: L(x.name),
      specs: `${t('rate0')}: <b>${fmt(x.rate0Kbps, x.rate0Kbps < 10 ? 1 : 0)} kbps</b><br>${t('mass')}: <b>${x.mass} kg</b> · ${t('power')}: ${x.power} W`, cost: x.cost, src: x.src, desc: L(x.desc),
      selected: sc.telecom === x.id, onClick: () => trySelect(s => { s.sc.telecom = s.sc.telecom === x.id ? null : x.id; }) }));
  }
  root.appendChild(tsec);

  // Instruments
  const isec = section(t('secInst'), `Threshold ${CONFIG.threshold.science} · Baseline ${CONFIG.baseline.science}`, t('hintInst'));
  const iw = cardsWrap(isec);
  for (const ins of INSTRUMENTS) {
    const tier = sc.instruments[ins.id] || 0;
    const k = tier === 2 ? CONFIG.tier[2] : { mass: 1, power: 1, data: 1, cost: 1, sci: 1 };
    const row = document.createElement('div'); row.className = 'tier-row';
    [[0, t('tierOff')], [1, t('tierStd')], [2, t('tierEnh')]].forEach(([v, lab]) => {
      const b = document.createElement('button'); b.textContent = lab; if (tier === v) b.className = 'on';
      b.addEventListener('click', ev => { ev.stopPropagation(); trySelect(s => { s.sc.instruments[ins.id] = v; }); });
      row.appendChild(b);
    });
    iw.appendChild(makeCard({ id: ins.id, iconKey: ins.icon, title: L(ins.name), tag: ins.short,
      specs: `${t('science')}: <b>${Math.round(ins.sci * k.sci)}</b> · ${t('mass')}: <b>${fmt(ins.mass * k.mass, 1)} kg</b><br>${t('power')}: ${fmt(ins.power * k.power, 1)} W · ${t('data')}: ${fmt(ins.dataKbps * k.data, 2)} kbps`,
      cost: ins.cost * k.cost, src: ins.src, desc: L(ins.desc), selected: tier > 0, extra: row,
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
    li.innerHTML = `<span class="lamp ${c.status}"></span><span class="lbl">${t('ck_' + c.id)}<span class="part-tag ${c.part}">${partLbl}</span><small>${t('ck_' + c.id + '_s', vars)}</small></span><span class="val">${c.value}</span>`;
    li.addEventListener('click', () => { if (c.part !== 'all') switchTab(c.part); });
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

/* ---------- advisor ---------- */
function advisorMessages(ev) {
  const msgs = [];
  const add = (cls, html) => msgs.push({ cls, html });
  const { lv, sc, m } = ev;
  const pc = v => Math.round(v * 100);
  if (state.flash) add('Y', state.flash);
  const st = id => ev.checks.find(c => c.id === id).status;

  // propellant compatibility
  lv.stages.forEach((s, i) => {
    if (!s.compatible) add('R', i === 0 ? t('adv_s1Incompat', { e: s.eng.name, p: L(byId(PROPELLANTS, s.eng.prop).name) }) : t('adv_stageIncompat', { e: s.eng.name }));
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
  else if (st('energy') !== 'G') add(st('energy'), t('adv_energy', { m: pc(sc.energyMargin), use: fmt(sc.usableWh), dod: pc(sc.dod), life: state.lifetimeMonths, need: fmt(sc.needWh) }));
  if (!sc.tel) add('R', t('adv_noTel'));
  else if (st('link') !== 'G') add(st('link'), t('adv_link', { db: fmt(sc.linkDb, 1), req: m.linkReqDb, rate: fmt(sc.reqRate, 2), c: pc(m.contactFraction) }));
  if ((state.sc.instruments.dge || 0) > 0 && !(sc.tel && sc.tel.transponder)) add('Y', t('adv_dge'));
  if (!sc.act) add('R', t('adv_noAct'));
  else if (st('act') !== 'G') add(st('act'), t('adv_act', { m: pc(sc.actMargin), a: L(sc.act.name), cap: fmt(sc.act.capKg), kg: fmt(sc.mass) }));

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
  drawCallouts(ctx, parts, SCALE);
  // header text
  ctx.fillStyle = '#050816d0'; ctx.fillRect(0, 0, cv.width, state.tab === 'lv' ? 70 : 54);
  ctx.fillStyle = '#ffcc33'; ctx.font = '28px VT323, monospace'; ctx.textAlign = 'left';
  ctx.fillText(state.tab === 'lv' ? t('rocketTitle') : t('scTitle'), 12, 28);
  ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#e6ecff';
  if (state.tab === 'lv') {
    const totalLen = ev.lv.stages.reduce((a, s) => a + s.len, 0) + ev.lv.fairing.len;
    ctx.fillText(`${t('height')} ${fmt(totalLen, 1)} m · ${t('liftoff')} ${tonnes(ev.lv.liftoffMass)} · TWR ${ev.lv.twr.toFixed(2)}`, 12, 46);
    ctx.fillText(`Δv ${fmt(ev.lv.dv / 1000, 2)} / ${fmt(ev.m.dvReq / 1000, 2)} km/s · max payload ${fmt(ev.cap)} kg`, 12, 62);
  } else {
    ctx.fillText(`${fmt(ev.sc.mass)} kg · ${fmt(ev.sc.load)} W · ${fmt(ev.sc.totalData, 2)} kbps · ${Math.round(ev.sc.sci)} pts`, 12, 46);
  }
}

/* ---------- orchestration ---------- */
function renderInventory() {
  const root = $('inventory');
  const scroll = root.scrollTop;
  root.innerHTML = '';
  if (state.tab === 'lv') buildLVInventory(root); else buildSCInventory(root);
  root.scrollTop = scroll;
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
function flash(msg) { state.flash = msg; state._flashShown = false; }
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('inventory').scrollTop = 0;
  update();
}
function applyStaticI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $('langToggle').innerHTML = state.lang === 'vi' ? '<b>VI</b> | en' : 'vi | <b>EN</b>';
  const sel = $('missionSelect');
  sel.innerHTML = MISSIONS.map(m => `<option value="${m.id}" ${m.id === state.missionId ? 'selected' : ''}>${L(m.name)} · Δv ${fmt(m.dvReq / 1000, 1)} km/s</option>`).join('');
  $('lifetimeValue').textContent = t('months', { n: state.lifetimeMonths });
}

/* =====================================================================
   8. LAUNCH SEQUENCE + REPORT
   ===================================================================== */
function startLaunch() {
  const ev = lastEval;
  $('modal').classList.remove('hidden');
  $('report').innerHTML = '';
  const cv = $('launchCanvas'), ctx = cv.getContext('2d');
  const buf = document.createElement('canvas'); buf.width = 120; buf.height = 90;
  const b = buf.getContext('2d');
  // events
  const events = [{ at: 0.3, txt: t('l_liftoff') }];
  if (ev.lv.nSRB) events.push({ at: 1.6, txt: t('l_srbsep'), action: 'srb' });
  events.push({ at: 2.6, txt: t('l_sep', { s: `${t('stageLabel')} 1` }), action: 's1' });
  events.push({ at: 3.0, txt: t('l_fairing'), action: 'fairing' });
  ev.lv.stages.slice(1).forEach((s, i) => events.push({ at: 3.8 + i * 0.9, txt: t('l_sep', { s: `${t('stageLabel')} ${i + 2}` }), action: 'up' + (i + 1) }));
  const end = 4.2 + (ev.lv.stages.length - 1) * 0.9;
  events.push({ at: end, txt: ev.m.id === 'lunar' ? t('l_tli') : t('l_orbit') });

  // build a small rocket sprite using the same renderer
  const sprite = document.createElement('canvas'); sprite.width = PW; sprite.height = PH;
  const probe = renderRocketPixels(sprite.getContext('2d'), ev, { noBackground: true, cx: 70 });
  const fullH = probe.groundY - 2 - probe.topY;
  const rocketScale = Math.min(0.6, 58 / fullH);
  const t0 = performance.now();
  function frame(now) {
    const tt = (now - t0) / 1000;
    const sky = Math.min(1, tt / 3);
    const r = Math.round(40 * (1 - sky)), g = Math.round(90 * (1 - sky)), bl = Math.round(160 * (1 - sky) + 22 * sky);
    b.fillStyle = `rgb(${r},${g},${bl})`; b.fillRect(0, 0, 120, 90);
    if (sky > 0.4) { b.globalAlpha = (sky - 0.4) / 0.6; drawStars(b, 120, 90, tt * 10); b.globalAlpha = 1; }
    // ground
    const groundShift = Math.min(60, tt * tt * 12);
    px(b, 0, 80 + groundShift, 120, 10, '#1b2340');
    // rocket sprite
    const sctx = sprite.getContext('2d'); sctx.clearRect(0, 0, PW, PH);
    const drop = ev.lv.stages.filter((_, i) => events.some(e => e.action === (i === 0 ? 's1' : 'up' + i) && tt > e.at)).length;
    renderRocketPixels(sctx, ev, { noBackground: true, flame: tt > 0.2 && tt < end ? tt : 0, hideSRB: tt > 1.6,
      hideFairing: tt > 3.0, dropStages: Math.min(drop, ev.lv.stages.length - 1), cx: 70 });
    b.imageSmoothingEnabled = false;
    const rise = Math.min(14, tt * tt * 3);            // camera then tracks the rocket
    const bottom = 80 - rise;
    b.drawImage(sprite, 60 - 70 * rocketScale, bottom - (probe.groundY - 2) * rocketScale, PW * rocketScale, PH * rocketScale);
    // Moon / Earth
    if (tt > end - 0.5) { b.fillStyle = ev.m.id === 'lunar' ? '#9a9eae' : '#2a5fd0'; b.beginPath(); b.arc(104, 14, 9, 0, 7); b.fill(); }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    const cur = [...events].reverse().find(e => tt >= e.at);
    if (cur) {
      let fs = 30; ctx.font = `${fs}px VT323, monospace`;
      while (ctx.measureText(cur.txt).width > cv.width - 24 && fs > 14) { fs -= 2; ctx.font = `${fs}px VT323, monospace`; }
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffcc33';
      ctx.fillText(cur.txt, cv.width / 2, cv.height - 18);
    }
    if (tt < end + 1.2) requestAnimationFrame(frame); else showReport(ev);
  }
  requestAnimationFrame(frame);
}
function showReport(ev) {
  const sci = ev.sc.sci;
  const grade = sci >= CONFIG.baseline.science ? t('r_baseline') : t('r_threshold');
  const dvMargin = ev.lv.dv / ev.m.dvReq - 1;
  const score = Math.round(sci * 10 + ev.reserve * 1000 + Math.min(ev.massMargin, 1) * 300 + ev.greens * 50);
  $('report').innerHTML = `<h2>${t('r_title')}</h2>
    <p style="text-align:center">🎉 <b>${t('r_success')}</b> — ${L(ev.m.name)}</p>
    <table>
      <tr><td>${t('r_grade')}</td><td>${grade}</td></tr>
      <tr><td>${t('r_sci')}</td><td>${Math.round(sci)}</td></tr>
      <tr><td>${t('r_reserve')}</td><td>${Math.round(ev.reserve * 100)}%</td></tr>
      <tr><td>${t('r_dvMargin')}</td><td>${Math.round(dvMargin * 100)}%</td></tr>
      <tr><td>${t('r_mass')}</td><td>${Math.round(ev.massMargin * 100)}%</td></tr>
      <tr><td>${t('r_greens')}</td><td>${ev.greens}/${ev.checks.length}</td></tr>
      <tr><td><b>${t('r_score')}</b></td><td style="color:var(--accent)">${fmt(score)}</td></tr>
    </table>`;
}

/* =====================================================================
   BOOT
   ===================================================================== */
function init() {
  applyStaticI18n();
  $('langToggle').addEventListener('click', () => { state.lang = state.lang === 'vi' ? 'en' : 'vi'; applyStaticI18n(); update(); });
  $('missionSelect').addEventListener('change', e => { state.missionId = e.target.value; update(); });
  const ls = $('lifetimeSlider'); ls.value = state.lifetimeMonths;
  ls.addEventListener('input', () => { state.lifetimeMonths = Number(ls.value); $('lifetimeValue').textContent = t('months', { n: state.lifetimeMonths }); update(false); });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('launchBtn').addEventListener('click', () => { if (lastEval && lastEval.gateOpen) startLaunch(); });
  $('closeModal').addEventListener('click', () => $('modal').classList.add('hidden'));
  renderInventory();
  renderAll();
  // gentle animation on spacecraft view (thruster puffs)
  setInterval(() => { if (state.tab === 'sc' && lastEval) renderCanvas(lastEval); }, 250);
  // fonts may load late → redraw canvas text
  if (document.fonts) document.fonts.ready.then(() => renderAll());
}

if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined') module.exports = { CONFIG, MISSIONS, LV_ENGINES, SRB, state, computeLV, computeSC, evaluate, maxPayload, buildStages };