#!/usr/bin/env node
// Compare the visible text of two shoot.mjs reports screen by screen: after
// moving strings into i18n, the source locale must look exactly as before.
//
//   node compare-text.mjs before/report.json after/report.json [--locale ru] [--mask-numbers]
//
// Exits 1 if any screen differs, printing the differing lines.

import { readFile } from 'node:fs/promises';

const [a, b, ...rest] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: compare-text.mjs <before/report.json> <after/report.json> [--locale ru] [--mask-numbers]');
  process.exit(2);
}
const locale = rest.includes('--locale') ? rest[rest.indexOf('--locale') + 1] : 'ru';
const mask = rest.includes('--mask-numbers');
const load = async f => JSON.parse(await readFile(f, 'utf8')).filter(r => r.locale === locale);
const norm = t => (mask ? t.replace(/\d[\d\s,.]*/g, 'N') : t).split('\n').map(l => l.trim()).filter(Boolean);
const before = await load(a), after = await load(b);
let bad = 0;
for (const x of before) {
  const y = after.find(r => r.screen === x.screen && r.viewport === x.viewport);
  const id = `${x.screen} ${x.viewport}`;
  if (!y) { console.log(`${id}: missing in ${b}`); bad++; continue; }
  const xl = norm(x.text || ''), yl = norm(y.text || '');
  if (xl.join('\n') === yl.join('\n')) { console.log(`${id}: same`); continue; }
  bad++;
  console.log(`${id}: DIFFERENT`);
  const xs = new Set(xl), ys = new Set(yl);
  for (const l of xl) if (!ys.has(l)) console.log(`   - ${l}`);
  for (const l of yl) if (!xs.has(l)) console.log(`   + ${l}`);
}
process.exit(bad ? 1 : 0);
