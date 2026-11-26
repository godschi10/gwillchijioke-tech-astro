const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
for(const [k,u] of [['live','https://gwillchijioke.qzz.io/'],['port','https://godschi10.github.io/gwillchijioke-tech-astro/']]){
const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'networkidle2',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2500));
const d=await pg.evaluate(()=>{
 const gf=n=>{const e=document.querySelector(n);return e?getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g,''):null};
 const loaded=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family);
 return {body:gf('body'), h1:gf('.hc-title'), nav:gf('.nav-link'), label:gf('.label'), cardTitle:gf('.card h3'), fontsLoaded:[...new Set(loaded)].slice(0,6), fontCount:document.fonts.size};
});
console.log(k.padEnd(5), 'body=',d.body,'| h1=',d.h1,'| nav=',d.nav,'| cardTitle=',d.cardTitle);
console.log('     fontsLoaded=',JSON.stringify(d.fontsLoaded),'total=',d.fontCount);
await pg.close();}
await b.close();})().catch(e=>console.error('FATAL',e.message));
