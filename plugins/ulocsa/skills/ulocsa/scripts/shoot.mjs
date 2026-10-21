#!/usr/bin/env node
// Visit each screen of a web app in each locale; save a screenshot and a DOM
// report of text that does not fit: clipped by overflow, cut by ellipsis or
// line-clamp, or spilling out of a parent that hides overflow.
//
//   node shoot.mjs --base http://localhost:8000 --screens .ulocsa/screens.json \
//     --locale "localStorage:lang" --locales ru,sah --out .ulocsa/shots
//
// screens.json: [{"id": "start", "path": "/", "steps": [{"click": "text=Начать"}, {"wait": 500}],
//                 "viewports": ["mobile", "desktop"]}]
// --locale says how the app picks its language:
//   localStorage:<key> | cookie:<name> | query:<param> | path  (path: /<locale>/…)
//
// Needs Playwright: npm i -D playwright && npx playwright install chromium

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const base = (args.base || 'http://localhost:3000').replace(/\/$/, '');
const screens = JSON.parse(await readFile(args.screens || '.ulocsa/screens.json', 'utf8'));
const locales = (args.locales || 'ru,sah').split(',');
// Split on the first colon only: storage keys often contain colons (app:lang).
const [mode, ...nameParts] = (args.locale || 'localStorage:lang').split(':');
const name = nameParts.join(':');
const out = args.out || '.ulocsa/shots';
const VIEWPORTS = {
  mobile: { width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

// The script lives in the skill, Playwright in the project: resolve it from the
// working directory first, then from next to the script.
let playwright;
try {
  const req = createRequire(join(process.cwd(), 'package.json'));
  const mod = await import(pathToFileURL(req.resolve('playwright')).href).catch(() => import('playwright'));
  playwright = mod.chromium ? mod : mod.default; // CommonJS entry imported by path: the API is on default
} catch {
  console.error('playwright is not installed: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

function urlFor(path, locale) {
  const u = new URL(mode === 'path' ? `/${locale}${path}` : path, base);
  if (mode === 'query') u.searchParams.set(name, locale);
  return u.toString();
}

// Runs in the page. Returns the text elements that don't fit.
function auditPage() {
  const issues = [];
  const seen = new Set();
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  const label = el => el.closest('[data-i18n-key]')?.getAttribute('data-i18n-key') || null;
  const path = el => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 5; e = e.parentElement) {
      parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''));
    }
    return parts.join(' > ');
  };
  for (const el of document.querySelectorAll('body *')) {
    const text = ownText(el) || (el.matches('input,textarea') ? el.getAttribute('placeholder') || '' : '');
    if (!text || seen.has(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect();
    const add = (kind, extra = {}) => {
      seen.add(el);
      issues.push({ kind, text: text.slice(0, 200), key: label(el), selector: path(el),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, ...extra });
    };
    const hides = v => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
    if (el.scrollWidth > el.clientWidth + 1 && (hides(cs.overflowX) || cs.textOverflow === 'ellipsis')) {
      add(cs.textOverflow === 'ellipsis' ? 'ellipsis' : 'clipped_x', { need: el.scrollWidth, have: el.clientWidth });
      continue;
    }
    if (el.scrollHeight > el.clientHeight + 1 && (hides(cs.overflowY) || cs.webkitLineClamp !== 'none')) {
      add(cs.webkitLineClamp && cs.webkitLineClamp !== 'none' ? 'line_clamp' : 'clipped_y', { need: el.scrollHeight, have: el.clientHeight });
      continue;
    }
    // Text spilling out of an ancestor that clips it (buttons, chips, tabs).
    for (let p = el.parentElement, depth = 0; p && depth < 4; p = p.parentElement, depth++) {
      const ps = getComputedStyle(p);
      if (!hides(ps.overflowX) && !hides(ps.overflowY)) continue;
      const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1) {
        add('spills', { container: path(p) });
      }
      break;
    }
    // Off-screen to the right: horizontal page overflow on mobile.
    if (r.right > document.documentElement.clientWidth + 1 && cs.position !== 'fixed') add('offscreen');
  }
  const attrs = [...document.querySelectorAll('[placeholder],[aria-label],[title],img[alt]')]
    .map(e => ['placeholder', 'aria-label', 'title', 'alt'].map(a => e.getAttribute(a) || '').join('|'));
  return {
    issues,
    pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    lang: document.documentElement.lang,
    // Visible text and text attributes, for the "no visible change" check after a refactor.
    text: document.body.innerText + '\n' + attrs.join('\n'),
  };
}

const browser = await playwright.chromium.launch();
const report = [];
await mkdir(out, { recursive: true });
for (const screen of screens) {
  for (const vp of screen.viewports || ['mobile', 'desktop']) {
    for (const locale of locales) {
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: locale === 'sah' ? 'ru-RU' : `${locale}` });
      if (mode === 'cookie') await ctx.addCookies([{ name, value: locale, url: base }]);
      if (mode === 'localStorage') await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [name, locale]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(urlFor(screen.path || '/', locale), { waitUntil: 'networkidle' });
      for (const step of screen.steps || []) {
        if (step.click) await page.click(step.click);
        if (step.fill) await page.fill(step.fill[0], step.fill[1]);
        if (step.press) await page.keyboard.press(step.press);
        if (step.wait) await page.waitForTimeout(step.wait);
        if (step.waitFor) await page.waitForSelector(step.waitFor);
        if (step.eval) await page.evaluate(step.eval);
      }
      // Fonts load per unicode-range slice: the one with ҕ ҥ ө һ ү only once such text appears.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(screen.settle ?? 300);
      const file = join(out, `${screen.id}.${vp}.${locale}.png`);
      await page.screenshot({ path: file, fullPage: screen.fullPage ?? true });
      const audit = await page.evaluate(auditPage);
      report.push({ screen: screen.id, viewport: vp, locale, screenshot: file, errors, ...audit });
      console.log(`${screen.id} ${vp} ${locale}: ${audit.issues.length} issues${audit.pageOverflowX ? ', page scrolls sideways' : ''}${errors.length ? `, ${errors.length} JS errors` : ''}`);
      await ctx.close();
    }
  }
}
await browser.close();
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`report: ${join(out, 'report.json')}`);
