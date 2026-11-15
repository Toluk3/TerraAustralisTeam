// Claves de idioma: es.json y en.json tienen que tener exactamente las mismas claves y los mismos
// parámetros ({n}, {month}…). También el contenido largo (metodología) tiene que tener la misma forma.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { methodology } from '../src/content/methodology.js';

const load = (l) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), 'utf8'));
const es = load('es');
const en = load('en');

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}
const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('i18n: es y en tienen las mismas claves', () => {
  const a = flatten(es), b = flatten(en);
  const onlyEs = [...a.keys()].filter((k) => !b.has(k));
  const onlyEn = [...b.keys()].filter((k) => !a.has(k));
  assert.deepEqual(onlyEs, [], `faltan en en.json: ${onlyEs.join(', ')}`);
  assert.deepEqual(onlyEn, [], `faltan en es.json: ${onlyEn.join(', ')}`);
});

test('i18n: ningún texto vacío y los mismos parámetros en los dos idiomas', () => {
  const a = flatten(es), b = flatten(en);
  for (const [k, v] of a) {
    assert.ok(String(v).trim(), `es.${k} vacío`);
    assert.ok(String(b.get(k)).trim(), `en.${k} vacío`);
    // summary.rank lleva {suffix} solo en inglés (ordinal 1st/2nd…)
    if (k === 'summary.rank') continue;
    assert.equal(params(v), params(b.get(k)), `parámetros distintos en ${k}`);
  }
});

test('contenido: la metodología tiene la misma forma en es y en', () => {
  const shape = (c) => c.sections.map((s) => [s.id, (s.body ?? []).length, s.table?.rows.length ?? 0,
    (s.after ?? []).length, (s.list ?? []).length, (s.terms ?? []).length, (s.links ?? []).length, Boolean(s.diagram)]);
  assert.deepEqual(shape(methodology.es), shape(methodology.en));
  assert.equal(methodology.es.flow.length, methodology.en.flow.length);
  assert.ok(methodology.es.sections.some((s) => s.id === 'metodologia'), 'falta el ancla #metodologia');
});
