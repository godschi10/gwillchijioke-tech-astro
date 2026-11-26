const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const SLUGS=['apk-size-analyzer','bulk-htaccess-redirect','config-explainer','conventional-commits','cron-expression-generator','debug-log-analyzer','docker-compose-validator','htaccess-generator','htaccess-nginx-converter','image-compressor','json-formatter','nginx-config-generator','password-generator','qr-generator','schema-generator','serialize-unserialize','sqlite-mysql-converter','wp-config-generator'];
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
let ok=0,bad=[];
for(const s of SLUGS){
 const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,60)));
 try{await pg.goto(`http://127.0.0.1:8099/gwillchijioke-tech-astro/tools/${s}/`,{waitUntil:'networkidle2',timeout:45000})}catch(e){bad.push([s,'nav '+e.message.slice(0,40)]);await pg.close();continue}
 await new Promise(r=>setTimeout(r,1200));
 const d=await pg.evaluate(()=>({mainLen:document.querySelector('main')?document.querySelector('main').innerHTML.length:0,controls:document.querySelectorAll('main input,main textarea,main button,main select').length,js:[...document.querySelectorAll('script[src*="tools/"]')].length,css:[...document.styleSheets].some(x=>(x.href||'').includes('tools/'))}));
 if(d.mainLen>3000&&d.controls>=2&&d.js>0&&d.css&&errs.length===0){ok++}else{bad.push([s,`main=${d.mainLen} controls=${d.controls} js=${d.js} css=${d.css} errs=${errs.length}:${errs[0]||''}`])}
 await pg.close();
}
console.log(`tools OK: ${ok}/${SLUGS.length}`);
bad.forEach(([s,r])=>console.log('  FAIL',s,r));
await b.close();})().catch(e=>console.error('FATAL',e.message));
