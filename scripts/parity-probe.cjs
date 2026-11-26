const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const LIVE = 'https://gwillchijioke.qzz.io/';
const PORT = 'http://127.0.0.1:8099/gwill-tech-astro/';
const OUT = '/home/opc/work/tech-astro/parity';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'phone-390', width: 390, height: 844, isMobile: true, hasTouch: true },
];

// Measure the header + footer surfaces both sites share.
const PROBE = () => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  };
  const cs = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  const tokens = {};
  const root = getComputedStyle(document.documentElement);
  for (const t of ['--bg', '--surface', '--green', '--text', '--mid', '--font-mono']) {
    tokens[t] = root.getPropertyValue(t).trim();
  }
  return {
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: getComputedStyle(document.body).fontFamily,
    header: rect('.site-header'),
    headerBg: cs('.site-header', 'backgroundColor'),
    logoName: cs('.logo .name', 'color'),
    navLink: rect('.nav-link'),
    navFont: cs('.nav-link', 'fontSize'),
    footer: rect('.site-footer'),
    footerBg: cs('.site-footer', 'backgroundColor'),
    card: rect('.card'),
    tokens,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    h1: document.querySelectorAll('h1').length,
  };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  const results = {};

  for (const site of [
    { key: 'live', url: LIVE },
    { key: 'port', url: PORT },
  ]) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
      page.on('requestfailed', (r) => errs.push('FAIL ' + r.url().slice(0, 80)));
      try {
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (e) {
        // WP keeps long-poll/ad connections open; DOM content is enough for the shell probe.
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 2500));
      const m = await page.evaluate(PROBE);
      const shot = `${OUT}/${site.key}-${vp.name}.png`;
      await page.screenshot({ path: shot, fullPage: false });
      results[`${site.key}-${vp.name}`] = { ...m, errors: errs.slice(0, 5), shot };
      console.log(
        `[${site.key} ${vp.name}] header=${m.header ? m.header.w + 'x' + m.header.h : 'null'} footer=${m.footer ? m.footer.w + 'x' + m.footer.h : 'null'} bodyBg=${m.bodyBg} font=${String(m.bodyFont).slice(0, 28)} overflow=${m.scrollW - m.clientW}px errs=${errs.length}`
      );
      if (errs.length) errs.slice(0, 3).forEach((e) => console.log('    ', e));
      await page.close();
    }
  }

  fs.writeFileSync(`${OUT}/parity.json`, JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\nwrote', `${OUT}/parity.json`);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
