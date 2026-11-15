/** Rampas de color del mapa: amarillo → rojo para el valor de las celdas, PuOr para la anomalía y azul → verde para los focos. */

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Celdas (focos equivalentes por mes): amarillo → rojo oscuro (YlOrRd de ColorBrewer)
export const CELLS = ['#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a',
  '#e31a1c', '#bd0026', '#800026'].map(hex);

// PuOr invertida: violeta = menos focos que la mediana, naranja = más
export const PUOR = ['#542788', '#8073ac', '#b2abd2', '#d8daeb', '#f7f7f7',
  '#fee0b6', '#fdb863', '#e08214', '#b35806'].map(hex);

// Focos: azul → verde según FRP
export const FIRE = ['#08519c', '#2171b5', '#1d91c0', '#1fa187', '#31c46c', '#7be04a'].map(hex);

/** Interpola una rampa en t ∈ [0, 1] y devuelve [r, g, b, a]. */
export function ramp(stops, t, alpha = 255) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, alpha];
}

/** Escala logarítmica: los valores van de 0,06 a cientos, casi todos chicos. */
export const logScale = (v, max) => Math.log1p(Math.max(0, v)) / Math.log1p(max);

/**
 * Anomalía relativa (−1 = ningún foco, 0 = igual a la mediana, +k = k veces más).
 * Lado negativo lineal; lado positivo logarítmico hasta +10 (×11 la mediana).
 */
export const ANOMALY_MAX = 10;
export function anomalyT(a) {
  if (a == null) return null;
  if (a < 0) return 0.5 + Math.max(-1, a) * 0.5;
  return 0.5 + 0.5 * Math.min(1, Math.log1p(a) / Math.log1p(ANOMALY_MAX));
}

export const FRP_MAX = 200;
export const frpT = (frp) => logScale(frp, FRP_MAX);

export const css = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
export const gradientCss = (stops) => `linear-gradient(to right, ${stops.map(css).join(', ')})`;
