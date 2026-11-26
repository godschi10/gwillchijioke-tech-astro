const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const PAGES=[['/all-posts/','/all-posts/'],['/category/','/category/'],['/author/gwill/','/author/gwill/'],['/tag/android/','/tag/android/']];
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
const probe=async(u)=>{const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2200));
await pg.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
await new Promise(r=>setTimeout(r,300));
const d=await pg.evaluate(()=>({docH:Math.round(document.documentElement.scrollHeight),cards:document.querySelectorAll('.card').length,res:document.querySelectorAll('.resource-card').length,h1:document.querySelectorAll('h1').length,bc:document.querySelectorAll('.breadcrumb-list li').length,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
await pg.close();return d;};
for(const [lp,pp] of PAGES){
 const L=await probe('https://gwillchijioke.qzz.io'+lp);
 const T=await probe('http://127.0.0.1:8099/gwillchijioke-tech-astro'+pp);
 const ok=(L.cards===T.cards&&L.res===T.res&&L.h1===T.h1&&L.bc===T.bc&&L.over===T.over)?'MATCH':'DIFF';
 console.log(`${lp.padEnd(16)} live ${String(L.docH).padStart(6)} cards=${L.cards} res=${L.res} h1=${L.h1} bc=${L.bc} | port ${String(T.docH).padStart(6)} cards=${T.cards} res=${T.res} h1=${T.h1} bc=${T.bc}  ${ok}`);
}
await b.close();})().catch(e=>console.error('FATAL',e.message));
