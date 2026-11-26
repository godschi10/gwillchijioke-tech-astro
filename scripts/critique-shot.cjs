const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const pg=await b.newPage();await pg.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await pg.goto('https://godschi10.github.io/gwillchijioke-tech-astro/',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await pg.evaluate(()=>{const c=document.querySelector('#cookie'); if(c) c.remove(); document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'));});
await new Promise(r=>setTimeout(r,400));
await pg.screenshot({path:'parity/CRITIQUE-desktop.png'});
// measure the things that make a UI read cheap vs premium
const m=await pg.evaluate(()=>{
 const g=(s,p)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null};
 const card=document.querySelector('.card');
 return {
  cardRadius:g('.card','borderRadius'), cardShadow:g('.card','boxShadow'), cardBorder:g('.card','border'),
  bodyFont:g('body','fontFamily').slice(0,40), bodySize:g('body','fontSize'), bodyLH:g('body','lineHeight'),
  h1:g('.hc-title','fontSize'), h1Weight:g('.hc-title','fontWeight'), h1Spacing:g('.hc-title','letterSpacing'),
  labelSize:g('.label','fontSize'), labelSpacing:g('.label','letterSpacing'),
  cardBg:g('.card','backgroundColor'), pageBg:g('body','backgroundColor'),
  btnRadius:card?getComputedStyle(document.querySelector('.btn')||card).borderRadius:null,
  shadowCount:[...document.styleSheets].length,
  heroHeight:Math.round((document.querySelector('.hero-carousel')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
 };
});
console.log(JSON.stringify(m,null,1));
await b.close();})().catch(e=>console.error('FATAL',e.message));
