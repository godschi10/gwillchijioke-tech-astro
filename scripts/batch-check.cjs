const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const SLUGS=['ai-post-1','redis-object-caching-cheap-vps','the-hidden-cost-of-cheap-hosting','gutenberg-elements-showcase','headless-wordpress-when-to-decouple-and-when-not-to'];
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
const probe=async(u)=>{const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
try{await pg.goto(u,{waitUntil:'domcontentloaded',timeout:60000})}catch{}
await new Promise(r=>setTimeout(r,2200));
await pg.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
await new Promise(r=>setTimeout(r,300));
const d=await pg.evaluate(()=>{const a=document.querySelector('#article-scroll-area');const pr=document.querySelector('#article-body');
return{docH:Math.round(document.documentElement.scrollHeight),art:a?Math.round(a.getBoundingClientRect().height):0,prose:pr?Math.round(pr.getBoundingClientRect().height):0,h1:document.querySelectorAll('h1').length,ads:document.querySelectorAll('.ad-slot').length};});
await pg.close();return d;};
console.log('slug'.padEnd(52),'live docH/art/prose','  port docH/art/prose','  verdict');
for(const s of SLUGS){
 const L=await probe(`https://gwillchijioke.qzz.io/${s}/`);
 const P=await probe(`http://127.0.0.1:8099/gwillchijioke-tech-astro/${s}/`);
 const ok=(L.art===P.art&&L.prose===P.prose&&L.h1===P.h1&&L.ads===P.ads)?'MATCH':'DIFF';
 const dh=L.docH-P.docH;
 console.log(`${s.slice(0,50).padEnd(52)} ${L.docH}/${L.art}/${L.prose}`.padEnd(72),`${P.docH}/${P.art}/${P.prose}`.padEnd(20),ok,`docH${dh>=0?'+':''}${dh}`);
}
await b.close();})().catch(e=>{console.error('FATAL',e.message)});
