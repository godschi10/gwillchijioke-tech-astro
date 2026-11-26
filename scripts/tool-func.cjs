const p=require('puppeteer-core');const C='/home/opc/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome';
const LIVE='https://gwillchijioke.qzz.io/tools/';
const PORT='http://127.0.0.1:8099/gwillchijioke-tech-astro/tools/';
(async()=>{const b=await p.launch({executablePath:C,headless:'new',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--ignore-certificate-errors']});
async function run(base,slug,script){
 const pg=await b.newPage();await pg.setViewport({width:1440,height:1000});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,70)));
 try{await pg.goto(base+slug+'/',{waitUntil:'networkidle2',timeout:60000})}catch{}
 await new Promise(r=>setTimeout(r,2000));
 let out='';try{out=await pg.evaluate(script)}catch(e){out='EVALERR '+e.message.slice(0,60)}
 await pg.close();return {out,errs:errs.length};
}
// json-formatter: put JSON in, click Format, read output
const jsonTest=`(()=>{const ta=document.querySelector('.gt-tool textarea')||document.querySelector('.gt-tool input');const btn=document.getElementById('btn-format');if(!ta||!btn)return 'MISSING ta='+!!ta+' btn='+!!btn;ta.value='{"b":2,"a":1}';ta.dispatchEvent(new Event('input',{bubbles:true}));btn.click();const outs=[...document.querySelectorAll('.gt-tool textarea, .gt-tool pre, .gt-outwrap')];const o=outs.map(e=>e.value||e.textContent).filter(Boolean).join('|');return (o.includes('\\n')||o.includes('"a"'))?'FORMATS: '+o.slice(0,40).replace(/\\n/g,'\\\\n'):'NO OUTPUT len='+o.length;})()`;
for(const slug of ['json-formatter','password-generator']){
 const L=await run(LIVE,slug,jsonTest), P=await run(PORT,slug,jsonTest);
 console.log(`${slug.padEnd(20)} live: ${L.out.slice(0,46).padEnd(48)} errs=${L.errs}`);
 console.log(`${''.padEnd(20)} port: ${P.out.slice(0,46).padEnd(48)} errs=${P.errs}  ${L.out===P.out?'MATCH':'DIFF'}`);
}
await b.close();})().catch(e=>console.error('FATAL',e.message));
