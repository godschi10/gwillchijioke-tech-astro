const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const LIVE = 'https://gwillchijioke.qzz.io/';
const PORT = 'http://127.0.0.1:8099/gwillchijioke-tech-astro/';
const OUT = '/home/opc/work/tech-astro/parity';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'phone-390', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const PROBE = () => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const count = (sel) => document.querySelectorAll(sel).length;
  const doc = document.documentElement;
  // gap chain through the top-level homepage blocks
  const blocks = [...document.querySelectorAll('#content > *')].map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), cls: String(el.className).split(' ').slice(0, 2).join('.'), h: Math.round(r.height), top: Math.round(r.top + window.scrollY) };
  });
  const gaps = [];
  for (let i = 1; i < blocks.length; i++) gaps.push(blocks[i].top - (blocks[i - 1].top + blocks[i - 1].h));

  return {
    docH: Math.round(doc.scrollHeight),
    overflow: doc.scrollWidth - doc.clientWidth,
    hero: rect('.hero-carousel'),
    heroSlide: rect('.hc-slide'),
    hcTitle: (() => { const e = document.querySelector('.hc-title'); return e ? { fs: getComputedStyle(e).fontSize, fw: getComputedStyle(e).fontWeight } : null; })(),
    secHeads: count('.sec-head'),
    cards: count('.card'),
    leadCards: count('.card-lead'),
    grid2: count('.grid-2'),
    grid3: count('.filter-grid'),
    pills: count('.filter-pills .pill'),
    adSlots: count('.ad-slot'),
    nl: rect('.nl-band'),
    footer: rect('.site-footer'),
    firstCard: rect('.card'),
    blocks,
    gaps,
  };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  const out = {};

  for (const site of [{ key: 'live', url: LIVE }, { key: 'port', url: PORT }]) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));
      try {
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
      // reveal animations: force the '.reveal' state so heights are final
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
      await new Promise((r) => setTimeout(r, 400));
      const m = await page.evaluate(PROBE);
      const shot = `${OUT}/${site.key}-home-${vp.name}.png`;
      await page.screenshot({ path: shot, fullPage: false });
      out[`${site.key}-${vp.name}`] = { ...m, errors: errs.slice(0, 4), shot };
      console.log(`[${site.key} ${vp.name}] docH=${m.docH} overflow=${m.overflow} cards=${m.cards} secHeads=${m.secHeads} pills=${m.pills} ads=${m.adSlots} hero=${m.hero ? m.hero.w + 'x' + m.hero.h : 'null'} nl=${m.nl ? m.nl.w + 'x' + m.nl.h : 'null'} errs=${errs.length}`);
      await page.close();
    }
  }

  fs.writeFileSync(`${OUT}/home-parity.json`, JSON.stringify(out, null, 2));

  // Side-by-side per viewport
  console.log('\n=== LIVE vs PORT ===');
  for (const vp of VIEWPORTS) {
    const L = out[`live-${vp.name}`];
    const P = out[`port-${vp.name}`];
    const rows = [
      ['docH', L.docH, P.docH],
      ['overflow', L.overflow, P.overflow],
      ['cards', L.cards, P.cards],
      ['leadCards', L.leadCards, P.leadCards],
      ['secHeads', L.secHeads, P.secHeads],
      ['grid2', L.grid2, P.grid2],
      ['filterGrid', L.grid3, P.grid3],
      ['pills', L.pills, P.pills],
      ['adSlots', L.adSlots, P.adSlots],
      ['hero', `${L.hero?.w}x${L.hero?.h}`, `${P.hero?.w}x${P.hero?.h}`],
      ['heroSlide', `${L.heroSlide?.w}x${L.heroSlide?.h}`, `${P.heroSlide?.w}x${P.heroSlide?.h}`],
      ['hcTitle', `${L.hcTitle?.fs}/${L.hcTitle?.fw}`, `${P.hcTitle?.fs}/${P.hcTitle?.fw}`],
      ['nl-band', `${L.nl?.w}x${L.nl?.h}`, `${P.nl?.w}x${P.nl?.h}`],
      ['footer', `${L.footer?.w}x${L.footer?.h}`, `${P.footer?.w}x${P.footer?.h}`],
    ];
    console.log(`\n--- ${vp.name} ---`);
    for (const [k, a, b] of rows) {
      const ok = String(a) === String(b) ? 'OK ' : 'DIFF';
      console.log(`  ${ok} ${k.padEnd(12)} live=${String(a).padEnd(12)} port=${b}`);
    }
  }

  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
