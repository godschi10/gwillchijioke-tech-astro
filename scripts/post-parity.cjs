const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const LIVE = 'https://gwillchijioke.qzz.io/ai-post-1/';
const PORT = 'http://127.0.0.1:8099/gwillchijioke-tech-astro/ai-post-1/';
const OUT = '/home/opc/work/tech-astro/parity';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'phone-390', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const PROBE = () => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const n = (sel) => document.querySelectorAll(sel).length;
  const cs = (sel, p) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
  const doc = document.documentElement;
  return {
    docH: Math.round(doc.scrollHeight),
    overflow: doc.scrollWidth - doc.clientWidth,
    breadcrumb: r('.breadcrumb'),
    bcItems: n('.breadcrumb-list li'),
    h1: n('h1'),
    artTitle: (() => { const e = document.querySelector('.article-header h1'); return e ? { fs: getComputedStyle(e).fontSize, fw: getComputedStyle(e).fontWeight } : null; })(),
    header: r('.article-header'),
    cover: r('.article-cover'),
    prose: r('#article-body'),
    proseP: n('#article-body p'),
    share: r('.share-row'),
    shareBtns: n('.share-buttons > *'),
    authorBox: r('.author-box'),
    postNav: r('.post-nav'),
    sidebar: r('.sidebar-sticky'),
    widgets: n('.sidebar-widget'),
    layout: r('.article-layout'),
    article: r('#article-scroll-area'),
    ads: n('.ad-slot'),
    footer: r('.site-footer'),
  };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors'] });
  const out = {};
  for (const site of [{ key: 'live', url: LIVE }, { key: 'port', url: PORT }]) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));
      try { await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch {}
      await new Promise((r2) => setTimeout(r2, 3000));
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
      await new Promise((r2) => setTimeout(r2, 300));
      const m = await page.evaluate(PROBE);
      await page.screenshot({ path: `${OUT}/${site.key}-post-${vp.name}.png`, fullPage: false });
      out[`${site.key}-${vp.name}`] = { ...m, errors: errs.slice(0, 4) };
      console.log(`[${site.key} ${vp.name}] docH=${m.docH} h1=${m.h1} proseP=${m.proseP} share=${m.shareBtns} widgets=${m.widgets} ads=${m.ads} errs=${errs.length}`);
      await page.close();
    }
  }
  fs.writeFileSync(`${OUT}/post-parity.json`, JSON.stringify(out, null, 2));
  console.log('\n=== LIVE vs PORT ===');
  for (const vp of VIEWPORTS) {
    const L = out[`live-${vp.name}`]; const P = out[`port-${vp.name}`];
    console.log(`\n--- ${vp.name} ---`);
    const keys = ['docH','overflow','bcItems','h1','proseP','shareBtns','widgets','ads'];
    for (const k of keys) console.log(`  ${String(L[k])===String(P[k])?'OK ':'DIFF'} ${k.padEnd(11)} live=${String(L[k]).padEnd(10)} port=${P[k]}`);
    const rects = ['breadcrumb','header','cover','prose','share','authorBox','postNav','sidebar','layout','article','footer'];
    for (const k of rects) {
      const a = L[k] ? `${L[k].w}x${L[k].h}` : 'null'; const b = P[k] ? `${P[k].w}x${P[k].h}` : 'null';
      console.log(`  ${a===b?'OK ':'DIFF'} ${k.padEnd(11)} live=${a.padEnd(10)} port=${b}`);
    }
    const ta = L.artTitle ? `${L.artTitle.fs}/${L.artTitle.fw}` : 'null'; const tb = P.artTitle ? `${P.artTitle.fs}/${P.artTitle.fw}` : 'null';
    console.log(`  ${ta===tb?'OK ':'DIFF'} artTitle    live=${ta.padEnd(10)} port=${tb}`);
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
