/** Períodos: 'YYYY-MM' (mes entero) o 'YYYY-MM-DD'. Internamente, días desde 1970-01-01 (como `d` de los focos). */

const DAY_MS = 86400000;

export function toDay(s, end = false) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) throw new Error(`Fecha inválida: ${s} (se espera YYYY-MM o YYYY-MM-DD)`);
  const [y, mo] = [Number(m[1]), Number(m[2]) - 1];
  if (m[3]) return Date.UTC(y, mo, Number(m[3])) / DAY_MS;
  // mes entero: primer día, o último si es el final del rango
  return end ? Date.UTC(y, mo + 1, 1) / DAY_MS - 1 : Date.UTC(y, mo, 1) / DAY_MS;
}

export const dayToDate = (d) => new Date(d * DAY_MS);
export const dayToIso = (d) => dayToDate(d).toISOString().slice(0, 10);
export const ym = (year, month) => year * 12 + (month - 1);

/** Normaliza { from, to } a días y meses (índice año*12+mes) que toca el rango. */
export function normalizePeriod({ from, to = from }) {
  const d0 = toDay(from);
  const d1 = toDay(to, true);
  if (d1 < d0) throw new Error(`Período invertido: ${from} → ${to}`);
  const a = dayToDate(d0);
  const b = dayToDate(d1);
  const m0 = ym(a.getUTCFullYear(), a.getUTCMonth() + 1);
  const m1 = ym(b.getUTCFullYear(), b.getUTCMonth() + 1);
  const years = [];
  for (let y = a.getUTCFullYear(); y <= b.getUTCFullYear(); y++) years.push(y);
  return { from, to, d0, d1, m0, m1, nMonths: m1 - m0 + 1, years };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function periodLabel(p) {
  const fmt = (d) => {
    const x = dayToDate(d);
    return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
  };
  if (p.from.length === 7 && p.to.length === 7) {
    const f = (m) => `${MESES[m % 12]} ${Math.floor(m / 12)}`;
    return p.m0 === p.m1 ? f(p.m0) : `${f(p.m0)} – ${f(p.m1)}`;
  }
  return `${fmt(p.d0)} – ${fmt(p.d1)}`;
}
