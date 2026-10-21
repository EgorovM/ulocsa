#!/usr/bin/env node
// Check a Sakha translation against its Russian source, string by string,
// without a model. The checks catch what models break mechanically:
// placeholders, ICU plurals, look-alike letters, suffixes glued to a
// variable, dropped sentences, text left in Russian.
//
//   node check.mjs ru.json sah.json [--meta .ulocsa/meta.json] [--json]
//
// ru.json and sah.json are flat or nested JSON (key → text). meta.json is
// optional: {key: {role, max_chars}}. Exits 1 if any string has an error.
// No dependencies.

import { readFileSync } from 'node:fs';

// ---------- ICU MessageFormat ----------

function parseICU(s) {
  let i = 0;
  const fail = m => { throw new Error(`ICU at ${i}: ${m}`); };
  const word = () => {
    while (/\s/.test(s[i] || '')) i++;
    const st = i;
    while (i < s.length && !/[\s,{}]/.test(s[i])) i++;
    const w = s.slice(st, i);
    while (/\s/.test(s[i] || '')) i++;
    return w;
  };
  const arg = () => {
    i++;
    const name = word();
    if (!name) fail('empty argument');
    if (s[i] === '}') { i++; return { name, type: '' }; }
    if (s[i] !== ',') fail(`expected , after ${name}`);
    i++;
    const type = word();
    if (s[i] === '}') { i++; return { name, type }; }
    if (s[i] !== ',') fail(`expected , after ${type}`);
    i++;
    if (!['plural', 'select', 'selectordinal'].includes(type)) {
      let depth = 0;
      while (i < s.length) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { if (!depth) { i++; return { name, type }; } depth--; }
        i++;
      }
      fail(`unclosed ${name}`);
    }
    const cases = [];
    for (;;) {
      while (/\s/.test(s[i] || '')) i++;
      if (i >= s.length) fail(`unclosed ${type} ${name}`);
      if (s[i] === '}') { i++; break; }
      const key = word();
      if (key.startsWith('offset:')) continue;
      if (!key) fail('expected a case');
      if (s[i] !== '{') fail(`expected { after ${key}`);
      i++;
      const msg = message(type !== 'select');
      if (s[i] !== '}') fail(`unclosed case ${key}`);
      i++;
      cases.push({ key, msg });
    }
    if (!cases.length) fail(`${type} ${name} has no cases`);
    return { name, type, cases };
  };
  const message = inPlural => {
    const parts = [];
    let text = '';
    const flush = () => { if (text) { parts.push({ text }); text = ''; } };
    while (i < s.length && s[i] !== '}') {
      if (s[i] === "'" && s[i + 1] === "'") { text += "'"; i += 2; }
      else if (s[i] === "'" && '{}#|'.includes(s[i + 1] || '')) {
        i++;
        while (i < s.length && s[i] !== "'") text += s[i++];
        i++;
      } else if (s[i] === '{') { flush(); parts.push({ arg: arg() }); }
      else if (s[i] === '#' && inPlural) { flush(); parts.push({ hash: true }); i++; }
      else text += s[i++];
    }
    flush();
    return parts;
  };
  const parts = message(false);
  if (i < s.length) fail(`unexpected ${s[i]}`);
  return parts;
}

function walk(parts, fn) {
  for (const p of parts) if (p.arg) { fn(p.arg); for (const c of p.arg.cases || []) walk(c.msg, fn); }
}
function texts(parts, out = []) {
  for (const p of parts) {
    if (p.text) out.push(p.text);
    if (p.arg) for (const c of p.arg.cases || []) texts(c.msg, out);
  }
  return out;
}

// ---------- placeholders ----------

const RE_I18NEXT = /\{\{-?\s*[\w.-]+(?:\s*,\s*[\w-]+)?\s*\}\}|\$t\([^)]*\)/g;
const RE_TEMPLATE = /\$\{[^}]+\}/g;
const RE_PRINTF = /%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?(?:ll|l|h)?[sdifuxXoeEgGc@]/g;
const RE_TAG = /<\/?([a-zA-Z][\w-]*)[^<>]*?\/?>/g;

function signature(s) {
  const sig = { syntax: 'plain', parts: null, args: {}, tokens: [], tags: [] };
  if (s.includes('{{')) sig.syntax = 'i18next';
  else if (/[{}]/.test(s.replace(RE_TEMPLATE, ''))) {
    sig.parts = parseICU(s.replace(RE_TEMPLATE, '\u0000'));
    sig.syntax = 'icu';
    walk(sig.parts, a => { sig.args[a.name] = a.type; });
  }
  const spans = [];
  for (const re of [RE_I18NEXT, RE_TEMPLATE, RE_PRINTF]) for (const m of s.matchAll(re)) spans.push([m.index, m[0].replace(/\s+/g, '')]);
  sig.tokens = spans.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const m of s.matchAll(RE_TAG)) {
    const t = m[1].toLowerCase();
    sig.tags.push(m[0].startsWith('</') ? `</${t}>` : m[0].endsWith('/>') || t === 'br' ? `<${t}/>` : `<${t}>`);
  }
  sig.tags.sort();
  return sig;
}

function hashUse(parts) {
  const out = {};
  walk(parts, a => {
    if (a.type !== 'plural' && a.type !== 'selectordinal') return;
    const used = a.cases.some(c => c.msg.some(p => p.hash));
    out[a.name] = out[a.name] || used;
  });
  return out;
}

// ---------- Sakha ----------

const WRONG = { 'ң': 'ҥ', 'Ң': 'Ҥ', 'ғ': 'ҕ', 'Ғ': 'Ҕ', 'ӊ': 'ҥ', 'Ӊ': 'Ҥ', 'ә': 'э', 'Ә': 'Э', 'ұ': 'ү', 'Ұ': 'Ү', 'і': 'и', 'І': 'И', 'ӧ': 'ө', 'Ӧ': 'Ө', 'ӱ': 'ү', 'Ӱ': 'Ү' };
const SAKHA = /[ҔҕҤҥӨөҺһҮү]/;
// Letters native Sakha words never have: a word with them is Russian or an unadapted loan.
const FOREIGN = /[вежзфцшщъёюяВЕЖЗФЦШЩЪЁЮЯ]/;
const RU_STOP = new Set('и в во на не что со по для вы ваш ваша ваше ваши вас вам это или к ко от из за при как так же уже ещё еще только если чтобы все всё можно нет мы нас он она они его её их был была были будет есть нужно пока через после без над под между который которая которые этот эта эти тот та те свой своё свою свои чем тем где когда пожалуйста'.split(' '));
const STRIP = /\{\{[^{}]+\}\}|\$\{[^}]+\}|%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?[a-zA-Z@]|<\/?[a-zA-Z][^<>]*>|https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+/g;
const MARKUP_ARGS = new Set(['br', 'nl', 'newline']);

function visible(s) {
  const t = s.replace(STRIP, ' ');
  try {
    const sig = signature(t);
    if (sig.syntax === 'icu') return texts(sig.parts).join(' ');
  } catch {}
  return t;
}

// Longest visible length: the longest case of a plural/select; an argument counts as 3.
function displayLen(s) {
  let sig;
  try { sig = signature(s); } catch { return [...s.replace(STRIP, 'xxx')].length; }
  if (sig.syntax !== 'icu') return [...s.replace(STRIP, 'xxx')].length;
  const measure = parts => parts.reduce((n, p) => {
    if (p.hash) return n + 2;
    if (p.text) return n + [...p.text.replace(STRIP, '')].length;
    if (MARKUP_ARGS.has(p.arg.name)) return n;
    if (!p.arg.cases) return n + 3;
    return n + Math.max(...p.arg.cases.map(c => measure(c.msg)));
  }, 0);
  return measure(sig.parts);
}

const mechanical = new Set(['syntax', 'arg_missing', 'arg_extra', 'arg_type', 'no_other', 'hash', 'token_missing', 'token_extra', 'token_order', 'tags', 'empty']);

export function check(src, dst, { maxChars = 0, role = '', keep = [] } = {}) {
  const out = [];
  const add = (code, severity, detail) => out.push({ code, severity, detail });
  if (!dst || !dst.trim()) { add('empty', 'error', 'translation is empty'); return out; }

  let s, d;
  try { s = signature(src); } catch { s = { syntax: 'plain', args: {}, tokens: [], tags: [] }; }
  try { d = signature(dst); } catch (e) {
    if (s.syntax === 'icu') { add('syntax', 'error', e.message); return out; }
    d = { syntax: 'plain', args: {}, tokens: [], tags: [] };
  }
  if (s.syntax === 'icu') {
    for (const [name, type] of Object.entries(s.args)) {
      if (!(name in d.args)) add(type === 'select' ? 'arg_dropped' : 'arg_missing', type === 'select' ? 'warn' : 'error', `{${name}} is missing`);
      else if (d.args[name] !== type && !(type === 'select' && d.args[name] === '')) add('arg_type', 'error', `{${name}} was ${type || 'plain'}, now ${d.args[name] || 'plain'}`);
    }
    for (const name of Object.keys(d.args)) if (!(name in s.args)) add('arg_extra', 'error', `{${name}} is not in the source`);
    const hs = hashUse(s.parts), hd = d.parts ? hashUse(d.parts) : {};
    for (const [name, used] of Object.entries(hs)) {
      if (name in hd && hd[name] !== used) add('hash', 'error', used ? `{${name}}: the source prints the number with #, the translation doesn't` : `{${name}}: # added, but the source shows the number outside the plural, so it would appear twice`);
    }
    if (d.parts) walk(d.parts, a => {
      if (!a.cases) return;
      if (!a.cases.some(c => c.key === 'other')) add('no_other', 'error', `${a.type} {${a.name}} has no 'other' case`);
      if (a.type === 'plural') for (const c of a.cases) if (c.key !== 'other' && !c.key.startsWith('=')) add('plural_categories', 'warn', `plural {${a.name}} has '${c.key}': Sakha has only 'other' (the noun stays singular after a number)`);
    });
  }
  const count = ts => ts.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});
  const cs = count(s.tokens), cd = count(d.tokens);
  for (const [t, n] of Object.entries(cs)) if ((cd[t] || 0) < n) add('token_missing', 'error', `${t} is missing`);
  for (const [t, n] of Object.entries(cd)) if ((cs[t] || 0) < n) add('token_extra', 'error', `${t} is not in the source`);
  const order = ts => ts.filter(t => /^%[^$]*[a-z@]$/i.test(t) && !t.includes('$')).join(',');
  if (s.tokens.filter(t => /^%/.test(t) && !t.includes('$')).length > 1 && order(s.tokens) !== order(d.tokens)) add('token_order', 'error', 'printf placeholders changed order: use positional ones (%1$s)');
  if (s.tags.join(' ') !== d.tags.join(' ')) add('tags', 'error', `tags ${s.tags.join(' ')} → ${d.tags.join(' ')}`);

  // Letters
  const keepSet = new Set(keep.flatMap(k => k.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) || []));
  for (const w of visible(dst).match(/[\p{L}\p{N}'’]+/gu) || []) {
    if (keepSet.has(w.toLowerCase())) continue;
    for (const ch of w) if (WRONG[ch]) add('wrong_letter', 'error', `"${w}" has "${ch}" (not a Sakha letter), use "${WRONG[ch]}"`);
    const cyr = /\p{Script=Cyrillic}/u.test(w), lat = /[a-zA-ZÀ-ÿ]/.test(w), dig = /\d/.test(w);
    if (cyr && lat) add('latin_mixed', 'error', `"${w}" mixes Latin and Cyrillic letters (Latin h instead of һ?)`);
    if (cyr && dig && !/^\d+\p{Script=Cyrillic}{1,3}$/u.test(w)) add('digit_letter', 'error', `"${w}" has digits inside a word (old substitute for ҕ ө ҥ?)`);
  }
  // Suffix glued to a variable: {city}га. The suffix depends on the inserted word.
  for (const m of dst.matchAll(/(\{\{[^{}]+\}\}|\{([\w.]+)\}|%(?:\d+\$)?[sd@]|\$\{[^}]+\})(-?)(\p{Script=Cyrillic}{1,5})(?=[^\p{L}]|$)/gu)) {
    if (!MARKUP_ARGS.has(m[2])) add('glued_suffix', 'error', `"${m[3]}${m[4]}" is attached to ${m[1]}: rephrase so the value stands alone ("Куорат: {city}")`);
  }

  // Russian left over
  const words = (visible(dst).match(/[\p{L}\p{N}'’]+/gu) || []).map(w => w.toLowerCase()).filter(w => !keepSet.has(w) && /\p{Script=Cyrillic}/u.test(w));
  const norm = x => visible(x).split(/\s+/).join(' ').trim().toLowerCase();
  if (words.length && norm(src) === norm(dst)) add(words.length >= 2 ? 'untranslated' : 'same_as_source', words.length >= 2 ? 'error' : 'warn', 'same as the source');
  else {
    const ru = words.filter(w => RU_STOP.has(w) || FOREIGN.test(w)).length;
    if (ru >= 2 && ru * 3 >= words.length * 2) add('russian', ru === words.length && !SAKHA.test(dst) ? 'error' : 'warn', `${ru} of ${words.length} words are Russian or in Russian spelling`);
  }

  // Omissions and length
  const trim = x => visible(x).replace(/^[\s.,;:—\- ]+/, '');
  const sentences = x => (trim(x).match(/[.!?…]+(?:\s|$)/g) || []).length;
  if (sentences(src) >= 2 && sentences(dst) < sentences(src)) add('sentences', 'error', `${sentences(src)} sentences in the source, ${sentences(dst)} in the translation: something was left out`);
  const ls = displayLen(src), ld = displayLen(dst);
  if (ls >= 24 && ld * 2 < ls) add('too_short', 'error', `${ld} chars vs ${ls} in the source: something was left out`);
  if (maxChars > 0 && ld > maxChars) add('too_long', 'error', `${ld} chars, limit ${maxChars}`);
  else if (role === 'button' && ld > Math.floor(ls * 3 / 2) + 3) add('long', 'warn', `${ld} chars vs ${ls} in the source`);
  const lead = x => x.match(/^[  ]*/)[0], trail = x => x.match(/[  ]*$/)[0];
  if (lead(src) !== lead(dst) || trail(src) !== trail(dst)) add('edge_space', 'warn', 'leading/trailing spaces differ (the string may be glued in code)');
  const last = x => x.trimEnd().slice(-1);
  if (':?!…'.includes(last(src)) && last(src) !== last(dst)) add('punct', 'warn', `source ends with "${last(src)}", translation with "${last(dst)}"`);
  return out;
}

export const isMechanical = code => mechanical.has(code);

// ---------- CLI ----------

function flatten(v, prefix = '', out = {}) {
  if (typeof v === 'string') out[prefix] = v;
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = [], opts = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '--meta' || argv[i] === '--keep') opts[argv[i].slice(2)] = argv[++i];
    else files.push(argv[i]);
  }
  if (files.length !== 2) {
    console.error('usage: node check.mjs ru.json sah.json [--meta meta.json] [--keep "Brand,Other"] [--json]');
    process.exit(2);
  }
  const [ru, sah] = files.map(f => flatten(JSON.parse(readFileSync(f, 'utf8'))));
  const meta = opts.meta ? JSON.parse(readFileSync(opts.meta, 'utf8')) : {};
  const keep = (opts.keep || '').split(',').map(s => s.trim()).filter(Boolean);
  const report = [];
  let errors = 0, warns = 0, missing = 0;
  for (const [key, src] of Object.entries(ru)) {
    if (!(key in sah)) { missing++; report.push({ key, problems: [{ code: 'missing', severity: 'error', detail: 'no translation' }] }); errors++; continue; }
    const m = meta[key] || {};
    const problems = check(src, sah[key], { maxChars: m.max_chars || 0, role: m.role || '', keep });
    if (problems.length) report.push({ key, src, dst: sah[key], problems });
    if (problems.some(p => p.severity === 'error')) errors++;
    else if (problems.length) warns++;
  }
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report) {
      console.log(`${r.key}`);
      if (r.src) console.log(`   ru:  ${r.src}\n   sah: ${r.dst}`);
      for (const p of r.problems) console.log(`   ${p.severity === 'error' ? '✗' : '·'} ${p.code}: ${p.detail}`);
    }
    console.log(`\n${Object.keys(ru).length} strings: ${errors} with errors, ${warns} with warnings${missing ? `, ${missing} missing` : ''}`);
  }
  process.exit(errors ? 1 : 0);
}
