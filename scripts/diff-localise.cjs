const puppeteer = require('puppeteer-core');
const CHROME = '/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto('https://gwillchijioke.qzz.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  const info = await page.evaluate(() => {
    const chain = (el, n = 4) => { const out = []; let a = el; for (let i = 0; i < n && a; i++) { out.push(a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ').slice(0, 3).join('.') : '')); a = a.parentElement; } return out; };
    const hero = document.querySelector('.hero-carousel');
    const heroKids = hero ? [...hero.children].map((c) => ({ cls: String(c.className).split(' ').slice(0, 3).join('.'), h: Math.round(c.getBoundingClientRect().height) })) : [];
    const wrap = hero ? hero.querySelector('.wrap') : null;
    const wrapKids = wrap ? [...wrap.children].map((c) => ({ cls: String(c.className).split(' ').slice(0, 3).join('.'), h: Math.round(c.getBoundingClientRect().height) })) : [];
    const nl = document.querySelector('.nl-band');
    const slots = [...document.querySelectorAll('.ad-slot')].map((s) => ({ cls: String(s.className).replace('ad-slot', '').trim(), h: Math.round(s.getBoundingClientRect().height), parent: String(s.parentElement.className).split(' ').slice(0, 2).join('.') }));
    return {
      heroChain: hero ? chain(hero) : null,
      heroKids, wrapKids,
      heroStyles: hero ? { pt: getComputedStyle(hero).paddingTop, pb: getComputedStyle(hero).paddingBottom, mt: getComputedStyle(hero).marginTop, mb: getComputedStyle(hero).marginBottom } : null,
      nlChain: nl ? chain(nl, 5) : null,
      nlW: nl ? Math.round(nl.getBoundingClientRect().width) : null,
      slots,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
