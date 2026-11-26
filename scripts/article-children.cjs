const puppeteer=require('puppeteer-core');
const CHROME='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
 for(const [k,u] of [['live','https://gwillchijioke.qzz.io/ai-post-1/'],['port','http://127.0.0.1:8099/gwillchijioke-tech-astro/ai-post-1/']]){
  const p=await b.newPage(); await p.setViewport({width:1440,height:900});
  try{await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000});}catch{}
  await new Promise(r=>setTimeout(r,2500));
  const d=await p.evaluate(()=>{
    const art=document.querySelector('#article-scroll-area');
    const kids=art?[...art.children].map(c=>({cls:String(c.className).split(' ').slice(0,2).join('.'),h:Math.round(c.getBoundingClientRect().height),disp:getComputedStyle(c).display})):[];
    const lay=document.querySelector('.article-layout');
    const lk=lay?[...lay.children].map(c=>({cls:String(c.className).split(' ').slice(0,2).join('.'),h:Math.round(c.getBoundingClientRect().height)})):[];
    return {kids,lk};
  });
  console.log(`[${k}] article children:`);
  d.kids.forEach(c=>console.log(`   ${c.cls.padEnd(30)} h=${c.h} disp=${c.disp}`));
  console.log(`[${k}] layout children:`); d.lk.forEach(c=>console.log(`   ${c.cls.padEnd(30)} h=${c.h}`));
  await p.close();
 }
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
