const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
for(const [k,u] of [['live','https://gwillchijioke.qzz.io/the-hidden-cost-of-cheap-hosting/'],['port','http://127.0.0.1:8099/gwillchijioke-tech-astro/the-hidden-cost-of-cheap-hosting/']]){
const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2200));
const d=await pg.evaluate(()=>{const a=document.querySelector('#article-scroll-area');
return a?[...a.children].map(c=>({c:String(c.className).split(' ').slice(0,2).join('.'),h:Math.round(c.getBoundingClientRect().height)})):[];});
console.log(`[${k}]`);d.forEach(x=>console.log(`   ${x.c.padEnd(34)} ${x.h}`));await pg.close();}
await b.close();})().catch(e=>console.error('FATAL',e.message));
