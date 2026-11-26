const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const PAGES=['/about/','/privacy-policy/','/disclaimer/','/resources/','/start-here/','/contact/','/tools/'];
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
const probe=async(u)=>{const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2000));
await pg.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
await new Promise(r=>setTimeout(r,250));
const d=await pg.evaluate(()=>({docH:Math.round(document.documentElement.scrollHeight),h1:document.querySelectorAll('h1').length,bc:document.querySelectorAll('.breadcrumb-list li').length,ads:document.querySelectorAll('.ad-slot').length,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
await pg.close();return d;};
let exact=0;
for(const u of PAGES){
 const L=await probe('https://gwillchijioke.qzz.io'+u);
 const T=await probe('http://127.0.0.1:8099/gwillchijioke-tech-astro'+u);
 const ok=String(L.docH)===String(T.docH)&&L.h1===T.h1&&L.ads===T.ads&&L.over===T.over;
 if(ok)exact++;
 console.log(`${u.padEnd(18)} live ${String(L.docH).padStart(6)} h1=${L.h1} ads=${L.ads} | port ${String(T.docH).padStart(6)} h1=${T.h1} ads=${T.ads}  ${ok?'EXACT':'DIFF'}`);
}
console.log(`\n${exact}/${PAGES.length} content pages EXACT`);
await b.close();})().catch(e=>console.error('FATAL',e.message));
