const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
for(const u of ['/category/','/author/gwill/']){
for(const [k,base] of [['live','https://gwillchijioke.qzz.io'],['port','http://127.0.0.1:8099/gwillchijioke-tech-astro']]){
const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(base+u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2000));
const d=await pg.evaluate(()=>({all:document.querySelectorAll('.ad-slot').length,bf:document.querySelectorAll('.ad-slot--before-footer').length,lb:document.querySelectorAll('.ad-slot--leaderboard').length}));
console.log(`${u.padEnd(16)} ${k.padEnd(5)} total=${d.all} before-footer=${d.bf} leaderboard=${d.lb}`);await pg.close();}}
await b.close();})().catch(e=>console.error('FATAL',e.message));
