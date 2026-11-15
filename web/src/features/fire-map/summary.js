/**
 * Cálculo del panel de selección. Puro (sin DOM ni deck.gl): se puede usar y probar fuera del mapa.
 *
 * Todo se calcula en la resolución de la serie (H3 r7), sea cual sea el zoom del mapa:
 *
 * - **Focos equivalentes** (lo citable): suma de la serie armonizada sobre las celdas y meses elegidos, con
 *   el intervalo p05–p95 del bootstrap de k, el origen de cada mes (MODIS directo, o VIIRS / Terra sola
 *   convertidos a la escala MODIS) y su cobertura.
 * - **Detecciones** (descriptivo): focos de FIRMS dentro de las celdas. No son comparables entre sensores
 *   ni entre años.
 * - **Biomasa** (exploratorio, no validado): energía radiativa del fuego (FRE) × coeficiente de combustión.
 *     1. Por día local se suma el FRP de una sola familia de sensores (MODIS si ese día hubo detecciones
 *        MODIS, si no VIIRS), para no contar dos veces el mismo fuego.
 *     2. FRP medio diario = ΣFRP / pasadas nominales (2 por satélite en operación ese día, según
 *        meta.platform_periods).
 *     3. FRE diaria (MJ) = FRP medio (MW) × 86 400 s.
 *     4. Biomasa (kg de materia seca) = FRE × 0,368 kg/MJ (Wooster et al. 2005, JGR 110, D24311).
 *     5. CO₂ ≈ biomasa × 1,6 kg/kg (factor medio de Andreae 2019, ACP 19, 8523).
 *   Para un mismo día, calcularla con MODIS o con VIIRS cambia el resultado típicamente ×2 y hasta ×10
 *   (medido en la zona de la demo): sirve para órdenes de magnitud, no para citar.
 */
import { latLngToCell, cellArea } from 'h3-js';
import { dayToIso } from './period.js';

export const COMBUSTION_COEF = 0.368; // kg de materia seca por MJ (Wooster et al. 2005)
export const EF_CO2 = 1.6;            // kg de CO₂ por kg de materia seca (Andreae 2019)
const MODIS = new Set(['terra', 'aqua']);
const familyOf = (platform) => (MODIS.has(platform) ? 'MODIS' : 'VIIRS');

export const ORIGIN = {
  modis: 'MODIS (directo)',
  viirs: 'VIIRS convertido a escala MODIS',
  terra: 'Terra sola, convertida a escala MODIS',
};

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

/**
 * Lo que el cálculo necesita de meta.json:
 *   origin(mes)          'modis' | 'viirs' | 'terra' según la composición de la serie
 *   coverage(mes)        fracción del mes con datos de la serie (1 = completo)
 *   overpasses(fam, d)   pasadas nominales de la familia el día `d` (días desde 1970), o null si meta no
 *                        trae platform_periods (publicación vieja)
 */
export function seriesInfo(meta) {
  const periods = meta.platform_periods ?? null;
  const aquaStart = periods?.filter((p) => p.platform === 'aqua' && p.kind === 'operación')
    .map((p) => p.valid_from).sort()[0] ?? '2002-07-04';
  const aquaMonth = aquaStart.slice(0, 7);
  const switchMonth = meta.switch_date.slice(0, 7);
  const reduced = new Map((meta.reduced_coverage_months ?? [])
    .map((r) => [`${r.year}-${String(r.month).padStart(2, '0')}`, r.coverage_frac]));
  const covers = (p, iso) => p.valid_from <= iso && (p.valid_to == null || iso <= p.valid_to);
  const byPlatform = new Map();
  for (const p of periods ?? []) {
    if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, { operación: [], corte: [], datos: [] });
    byPlatform.get(p.platform)[p.kind]?.push(p);
  }
  const hasDataKind = (periods ?? []).some((p) => p.kind === 'datos');
  const cache = new Map();
  function overpasses(fam, d) {
    if (!periods) return null;
    const key = `${fam}|${d}`;
    if (!cache.has(key)) {
      const iso = dayToIso(d);
      let n = 0;
      for (const [platform, k] of byPlatform) {
        if (familyOf(platform) !== fam) continue;
        if (!k['operación'].some((p) => covers(p, iso))) continue;
        if (k.corte.some((p) => covers(p, iso))) continue;
        if (hasDataKind && !k.datos.some((p) => covers(p, iso))) continue; // plataforma sin archivos en la corrida
        n++;
      }
      cache.set(key, 2 * Math.max(1, n));
    }
    return cache.get(key);
  }
  return {
    // El mes en que empieza Aqua cuenta como MODIS (solo sus primeros días son de Terra sola)
    origin: (m) => (m >= switchMonth ? 'viirs' : m < aquaMonth ? 'terra' : 'modis'),
    coverage: (m) => reduced.get(m) ?? 1,
    overpasses,
  };
}

/**
 * Resume la selección en los meses pedidos. Recibe las tablas ya bajadas.
 *   sel          { res, cells: Set<string>, bbox: [w, s, e, n] }  (res = resolución de la serie)
 *   cellTables   Map mes → tabla de celdas en sel.res
 *   pointTables  Map mes → tablas de focos de las teselas madre de las celdas
 *   extra        { info: seriesInfo(meta), estTables: Map mes → tabla est, ratios: { reps, ratio } }
 *                Sin `ratios` no hay intervalo; sin `info` todos los meses figuran como MODIS directo.
 */
export function summarize(sel, months, cellTables, pointTables, extra = {}) {
  const { info = null, estTables = null, ratios = null } = extra;
  const reps = ratios?.reps ?? 0;
  const [w, s, e, n] = sel.bbox;
  const fireCells = new Set();
  const frps = [];
  const byPlatform = {};
  const total = { nEquiv: 0, nConverted: 0, detections: 0, dayDet: 0, nightDet: 0, frpSum: 0, fre: 0, biomass: 0,
    activeDays: 0, first: null, last: null, peak: null, cx: 0, cy: 0 };
  const totalReps = new Float64Array(reps);
  let intervalOk = reps > 0;
  const rows = [];
  for (const m of months) {
    const origin = info?.origin(m) ?? 'modis';
    const row = { month: m, nEquiv: 0, nConverted: 0, lo: null, hi: null, origin, coverage: info?.coverage(m) ?? 1,
      fireCells: 0, detections: 0, detModis: 0, detViirs: 0, frpSum: 0, frpMax: 0, fre: 0, biomass: 0, co2: 0, activeDays: 0, family: null };
    const ct = cellTables.get(m);
    const monthCells = new Set();
    if (ct) {
      for (let i = 0; i < ct.length; i++) {
        if (sel.cells.has(ct.cell[i])) {
          row.nEquiv += ct.n_equiv[i];
          monthCells.add(ct.cell[i]);
          fireCells.add(ct.cell[i]);
        }
      }
    }
    row.fireCells = monthCells.size;

    // Intervalo: lo observado con la referencia es fijo; lo convertido se multiplica por el cociente de
    // cada réplica del bootstrap y se toman los percentiles (mismo cálculo que la serie de la zona).
    if (origin === 'modis') {
      row.lo = row.hi = row.nEquiv;
    } else if (reps > 0 && estTables?.has(m)) {
      const et = estTables.get(m);
      const monthReps = new Float64Array(reps);
      for (let i = 0; i < et.length; i++) {
        if (!sel.cells.has(et.cell[i])) continue;
        const v = et.n_est[i];
        row.nConverted += v;
        const r = et.g[i] >= 0 ? ratios.ratio[et.g[i]] : null;
        for (let j = 0; j < reps; j++) monthReps[j] += r ? v * r[j] : v;
      }
      for (let j = 0; j < reps; j++) totalReps[j] += monthReps[j];
      const fixed = Math.max(0, row.nEquiv - row.nConverted);
      const sorted = Array.from(monthReps).sort((a, b) => a - b);
      row.reps = monthReps; // para sumar el intervalo entre meses (p. ej. por año): no se suman percentiles
      row.lo = fixed + quantile(sorted, 0.05);
      row.hi = fixed + quantile(sorted, 0.95);
    } else if (row.nEquiv > 0) {
      intervalOk = false; // mes convertido sin datos para el intervalo
    } else {
      row.lo = row.hi = 0;
    }

    // --- Focos dentro de las celdas ---
    const seen = { MODIS: new Set(), VIIRS: new Set() }; // respaldo si meta no trae platform_periods
    const days = new Map(); // d → { MODIS: ΣFRP, VIIRS: ΣFRP }
    for (const t of pointTables.get(m) ?? []) {
      for (let i = 0; i < t.length; i++) {
        const fam = familyOf(t.platform[i]);
        seen[fam].add(t.platform[i]);
        const lat = t.lat[i], lon = t.lon[i];
        if (lon < w || lon > e || lat < s || lat > n) continue;
        if (!sel.cells.has(latLngToCell(lat, lon, sel.res))) continue;
        const frp = t.frp[i] ?? 0;
        row.detections++;
        if (fam === 'MODIS') row.detModis++; else row.detViirs++;
        row.frpSum += frp;
        if (frp > row.frpMax) row.frpMax = frp;
        frps.push(frp);
        byPlatform[t.platform[i]] = (byPlatform[t.platform[i]] ?? 0) + 1;
        if (t.day[i]) total.dayDet++; else total.nightDet++;
        total.cx += lon * frp; total.cy += lat * frp;
        const d = t.d[i];
        if (total.first == null || d < total.first) total.first = d;
        if (total.last == null || d > total.last) total.last = d;
        const acc = days.get(d) ?? { MODIS: 0, VIIRS: 0 };
        acc[fam] += frp;
        days.set(d, acc);
      }
    }
    const fams = new Set();
    for (const [d, acc] of days) {
      const fam = acc.MODIS > 0 ? 'MODIS' : 'VIIRS';
      fams.add(fam);
      const overpasses = info?.overpasses(fam, d) ?? 2 * Math.max(1, seen[fam].size);
      const fre = (acc[fam] / overpasses) * 86400; // MJ
      row.fre += fre;
      if (!total.peak || fre > total.peak.fre) total.peak = { day: d, fre };
    }
    row.activeDays = days.size;
    row.family = [...fams].join(' + ') || null;
    row.biomass = (row.fre * COMBUSTION_COEF) / 1000; // t
    row.co2 = row.biomass * EF_CO2;
    rows.push(row);
    total.nEquiv += row.nEquiv; total.nConverted += row.nConverted; total.detections += row.detections;
    total.frpSum += row.frpSum; total.fre += row.fre; total.biomass += row.biomass; total.activeDays += row.activeDays;
  }
  frps.sort((a, b) => a - b);
  let fireArea = 0;
  for (const c of fireCells) fireArea += cellArea(c, 'km2');
  // Intervalo del total: las réplicas se suman entre meses (el mismo k se usa todos los años), no los percentiles
  let lo = null, hi = null;
  if (intervalOk) {
    const fixed = Math.max(0, total.nEquiv - total.nConverted);
    const sorted = Array.from(totalReps).sort((a, b) => a - b);
    lo = fixed + (quantile(sorted, 0.05) ?? 0);
    hi = fixed + (quantile(sorted, 0.95) ?? 0);
  } else if (rows.every((r) => r.origin === 'modis')) {
    lo = hi = total.nEquiv;
  }
  const withFire = rows.filter((r) => r.nEquiv > 0);
  const peakMonth = withFire.reduce((best, r) => (!best || r.nEquiv > best.nEquiv ? r : best), null);
  const { cx, cy, ...rest } = total;
  return {
    months, rows,
    total: {
      ...rest,
      lo, hi,
      monthsWithFire: withFire.length,
      peakMonth: peakMonth ? { month: peakMonth.month, nEquiv: peakMonth.nEquiv } : null,
      convertedMonths: withFire.filter((r) => r.origin !== 'modis').length,
      partialMonths: rows.filter((r) => r.coverage < 1).length,
      co2: total.biomass * EF_CO2,
      fireCells: fireCells.size,
      fireArea,
      frpMax: frps.at(-1) ?? null,
      frpMedian: quantile(frps, 0.5),
      frpP90: quantile(frps, 0.9),
      byPlatform,
      centroid: total.frpSum > 0 ? [cx / total.frpSum, cy / total.frpSum] : null,
    },
    fireCellIds: fireCells,
  };
}

/**
 * Agrupa las filas mensuales de summarize() por año calendario (para graficar rangos largos). El intervalo
 * del año sale de sumar las réplicas de sus meses, igual que el del total.
 */
export function groupByYear(rows) {
  const out = [];
  for (const r of rows) {
    const year = r.month.slice(0, 4);
    let g = out.at(-1);
    if (!g || g.year !== year) {
      g = { year, from: r.month, to: r.month, months: 0, nEquiv: 0, detModis: 0, detViirs: 0, coverage: 1, origins: new Set(),
        fixed: 0, reps: null, intervalOk: true };
      out.push(g);
    }
    g.to = r.month; g.months++;
    g.nEquiv += r.nEquiv; g.detModis += r.detModis; g.detViirs += r.detViirs;
    g.coverage = Math.min(g.coverage, r.coverage);
    if (r.nEquiv > 0 || r.origin === 'modis') g.origins.add(r.origin);
    if (r.reps) {
      g.fixed += Math.max(0, r.nEquiv - r.nConverted);
      g.reps ??= new Float64Array(r.reps.length);
      for (let j = 0; j < r.reps.length; j++) g.reps[j] += r.reps[j];
    } else {
      g.fixed += r.nEquiv;
      if (r.lo == null) g.intervalOk = false;
    }
  }
  return out.map(({ origins, fixed, reps, intervalOk, ...g }) => {
    let lo = null, hi = null;
    if (intervalOk) {
      const sorted = reps ? Array.from(reps).sort((a, b) => a - b) : [0];
      lo = fixed + quantile(sorted, 0.05); hi = fixed + quantile(sorted, 0.95);
    }
    const origin = origins.size > 1 ? 'mixto' : [...origins][0] ?? 'modis';
    return { ...g, lo, hi, origin };
  });
}
