// Genera public/latam-outline.svg (fondo del hero) desde ../zona/sudamerica_6.geojson.
//   node scripts/make-outline.mjs [entrada.geojson] [salida.svg]
// - Descarta islas lejanas: se queda con los anillos cuyo centro cae en lon −82…−34, lat −56…6.
// - Simplifica cada anillo con Douglas-Peucker (tolerancia ~0,08°), partiéndolo en dos mitades para que
//   el simplificador no colapse un anillo cerrado (primer punto = último).
// - Proyección equirectangular, viewBox de 1000 de ancho, stroke="currentColor", sin relleno.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ?? path.resolve(here, '../../zona/sudamerica_6.geojson');
const output = process.argv[3] ?? path.resolve(here, '../public/latam-outline.svg');
const TOL = 0.08;
const BOX = { w: -82, e: -34, s: -56, n: 6 };
const MIN_POINTS = 4;

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function dp(points, tol) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(points[k], points[i], points[j]);
      if (d > max) { max = d; idx = k; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return points.filter((_, k) => keep[k]);
}

function simplifyRing(ring) {
  const half = Math.floor(ring.length / 2);
  const a = dp(ring.slice(0, half + 1), TOL);
  const b = dp(ring.slice(half), TOL);
  return [...a, ...b.slice(1)];
}

const centroid = (ring) => {
  let x = 0, y = 0;
  for (const [lo, la] of ring) { x += lo; y += la; }
  return [x / ring.length, y / ring.length];
};

const gj = JSON.parse(fs.readFileSync(input, 'utf8'));
const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
const rings = [];
for (const f of features) {
  const g = f.geometry ?? f;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) {
    for (const ring of poly) {
      const [cx, cy] = centroid(ring);
      if (cx < BOX.w || cx > BOX.e || cy < BOX.s || cy > BOX.n) continue;
      const s = simplifyRing(ring);
      if (s.length >= MIN_POINTS) rings.push(s);
    }
  }
}

let w = 180, e = -180, s = 90, n = -90;
for (const r of rings) for (const [lo, la] of r) { w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la); }
const W = 1000;
const scale = W / (e - w);
const H = Math.round((n - s) * scale);
const px = (lo) => ((lo - w) * scale).toFixed(1);
const py = (la) => ((n - la) * scale).toFixed(1);
const d = rings.map((r) => `M${r.map(([lo, la]) => `${px(lo)} ${py(la)}`).join('L')}Z`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="${d}"/></svg>\n`;
fs.writeFileSync(output, svg);
const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
console.log(`${rings.length} anillos → ${path.relative(process.cwd(), output)} (${kb} KB, ${W}×${H})`);
if (Buffer.byteLength(svg) > 60 * 1024) { console.error('El SVG supera 60 KB: subir la tolerancia'); process.exit(1); }
