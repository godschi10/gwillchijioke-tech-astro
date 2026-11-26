const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
for(const [k,u] of [['live','https://gwillchijioke.qzz.io/ai-post-1/'],['port','http://127.0.0.1:8099/gwillchijioke-tech-astro/ai-post-1/']]){
const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2500));
const d=await pg.evaluate(()=>{const e=document.querySelector('#vibe-comments');const n=document.querySelector('#vibe-comments-container');return {hasSec:!!e,h:e?Math.round(e.getBoundingClientRect().height):0,inner:n?Math.round(n.getBoundingClientRect().height):0};});
console.log(k,'comments section:',d.hasSec,'h=',d.h,'inner=',d.inner);await pg.close();}
await b.close();})().catch(e=>{console.error('FATAL',e.message)});
