
(function(){
'use strict';
function $(id){return document.getElementById(id);}
var logIn=$('logIn'), fileInput=$('fileInput'), fileName=$('fileName'), analyzeBtn=$('analyzeBtn'),
    clearBtn=$('clearBtn'), srcNote=$('srcNote'), prog=$('prog'), progText=$('progText'), progBar=$('progBar'),
    msg=$('msg'), dash=$('dash'), totalN=$('totalN'), totalSub=$('totalSub'), groupN=$('groupN'),
    chips=$('chips'), search=$('search'), groupsEl=$('groups'), rawList=$('rawList'),
    rawToggle=$('rawToggle'), moreBtn=$('moreBtn'), copyBtn=$('copyBtn'), dlBtn=$('dlBtn');

var parsedEntries=[], parsedGroups=[], curFilter=null, curQuery='', shownGroups=0, rawMode=false, lastSource='';

/* ---------- helpers ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function showMsg(t,kind){msg.hidden=false;msg.className='wlda-msg'+(kind?' wlda-'+kind:'');msg.textContent=t;}
function clearMsg(){msg.hidden=true;}
function fmtCount(n){return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);}

/* ---------- R2: robust line parser ---------- */
var HEADER_RE=/^\[([^\]]+)\]\s+(.*)$/;
/* anchored + longer levels FIRST so "Error" never matches inside "database error" */
var LEVEL_RE=/^(?:PHP\s+)?(WordPress database error|Fatal error|Parse error|Fatal|Parse|Warning|Notice|Deprecated|Error)\s*:?\s*(.*)$/i;
/* greedy ([\\s\\S]+) backtracks to the LAST " in <file> on line <n>" - the file:line phrase is always at the
   end of a header/multiline message, so we must anchor to the last one, never the first ("in your SQL syntax"). */
var FILERELINE_RE=/^([\s\S]+)\s+in\s+(.+?)\s+on\s+line\s+(\d+)\s*$/i;

function normalizeLevel(s){
  s=String(s).toLowerCase();
  if(s.indexOf('database')>-1)return 'Database';
  if(s.indexOf('fatal')>-1)return 'Fatal';
  if(s.indexOf('parse')>-1)return 'Parse';
  if(s.indexOf('deprecated')>-1)return 'Deprecated';
  if(s.indexOf('warning')>-1)return 'Warning';
  if(s.indexOf('notice')>-1)return 'Notice';
  return 'Error';
}
function matchHeader(line){
  var m=line.match(HEADER_RE);
  if(!m)return null;
  var body=m[2], lv=body.match(LEVEL_RE);
  if(!lv)return null; // banner line / non-error -> skip
  return {ts:m[1].trim(), level:normalizeLevel(lv[1]), message:lv[2]};
}
function isStackFrame(line){return /^\s*#\d+\s/.test(line)||/^\s*#\d+$/.test(line);}
function isStackHeader(line){return /^\s*(?:PHP\s+)?Stack trace:?\s*$/i.test(line);}

/* synchronous line classification; R6 pacing happens in parseLog via chunking */
function classifyAndBuild(lines, start, end, out){
  var cur=null, inStack=false;
  function finalize(){ if(cur){ finalizeEntry(cur); out.entries.push(cur); cur=null; inStack=false; } }
  for(var i=start;i<end;i++){
    var line=lines[i];
    var h=matchHeader(line);
    if(h){ finalize(); cur={ts:h.ts, level:h.level, msgLines:[h.message], stack:[], raw:line}; inStack=false; }
    else if(cur){
      if(isStackFrame(line)){ inStack=true; cur.stack.push(line.replace(/^\s+/,'')); }
      else if(isStackHeader(line)){ inStack=true; }
      else if(inStack){ if(line.trim())cur.stack.push(line.trim()); }
      else if(/^\[[^\]]+\]/.test(line)){ finalize(); }  // banner/other timestamped line = separate entry, never a continuation
      else { if(line.trim())cur.msgLines.push(line.trim()); }
    }
    // garbage before any entry: silently skipped
  }
  finalize();
}
function finalizeEntry(cur){
  var joined=cur.msgLines.join('\n').trim();
  var file='',line='',m=joined.match(FILERELINE_RE);
  if(m){ joined=m[1].trim(); file=m[2].trim(); line=m[3]; }
  cur.message=joined; cur.file=file; cur.line=line;
  cur.key=cur.level+'|'+joined+'|'+file+'|'+line;
}

/* ---------- R3: aggregate ---------- */
var LEVEL_ORDER={Fatal:0,Parse:1,Database:2,Warning:3,Notice:4,Deprecated:5,Error:6};
function aggregate(entries){
  var map={}, order=[];
  for(var i=0;i<entries.length;i++){
    var e=entries[i];
    if(!Object.prototype.hasOwnProperty.call(map,e.key)){ map[e.key]=e; e.count=1; order.push(e.key); }
    else { map[e.key].count++; }
  }
  var arr=order.map(function(k){return map[k];});
  arr.sort(function(a,b){
    if(b.count!==a.count)return b.count-a.count;
    var al=LEVEL_ORDER[a.level]==null?99:LEVEL_ORDER[a.level], bl=LEVEL_ORDER[b.level]==null?99:LEVEL_ORDER[b.level];
    if(al!==bl)return al-bl;
    return a.message<b.message?-1:a.message>b.message?1:0;
  });
  return arr;
}

/* ---------- R5: plain-language hints (accurate, non-generic) ---------- */
function buildHint(a){
  var msg=a.message.toLowerCase();
  if(a.level==='Fatal')return {
    what:'The PHP script stopped running at this point. This is usually the immediate cause of a white screen or a <b>500</b> error.',
    dbg:'Start at the <b>file:line</b> shown. If the path is in a plugin/theme, that add-on is the prime suspect - try deactivating it to confirm.'
  };
  if(a.level==='Parse')return {
    what:'A <b>syntax error</b> - this file cannot even be loaded or compiled, so nothing using it will run.',
    dbg:'Open the file the <b>line</b> points to and look for a missing <code>;</code>, <code>;</code>, unmatched <code>{ }</code> or <code>( )</code>, or a stray quote.'};
  if(a.level==='Database')return {
    what:'An <b>SQL / query problem</b> - WordPress failed to run a database query. Most often a bad plugin, theme, or custom query.',
    dbg:'The raw query text is usually right after the message. Check the table/column names and run the same query via phpMyAdmin / wp-cli to reproduce it.'
  };
  if(a.level==='Warning')return {
    what:'Non-fatal, but warnings almost always point to a <b>real bug</b> (undefined key, missing file, a failed function call). Worth fixing.',
    dbg:'Read the message, then go to the <b>file:line</b>. Undefined-key/entry warnings mean you are reading something that was never set - initialise it or check the source.'
  };
  if(a.level==='Notice')return {
    what:'Low severity. Often cosmetic, but it can signal a coding issue that will bite later.',
    dbg:'Same drill as a warning: locate the <b>file:line</b> and confirm the variable/key actually exists before you read it.'
  };
  if(a.level==='Deprecated')return {
    what:'The function or feature is <b>removed in a future PHP version</b>. Not broken today, but plan a migration soon.',
    dbg:'Note the function name in the message and find where your code (or a plugin) still calls it - update to the replacement API.'
  };
  if(msg.indexOf('undefined array key')>-1||msg.indexOf('undefined index')>-1||msg.indexOf('undefined offset')>-1)
    return {what:'A PHP variable you are reading was <b>never set</b> - the key or index you are accessing does not exist in that array.',
      dbg:'Go to the <b>file:line</b>; check the array is populated before you read <code>$array[key]</code>. Initialise it or add an <code>isset()</code> guard.'};
  if(msg.indexOf('undefined variable')>-1)
    return {what:'A PHP variable you are reading was <b>never set</b> before this point.',
      dbg:'Check the <b>file:line</b>; the variable is likely only defined on some path (e.g. inside an <code>if</code>). Initialise it at the top.'};
  if(msg.indexOf('uncaught')>-1)
    return {what:'An <b>uncaught exception</b> bubbled up to PHP and stopped execution.',
      dbg:'The exception class is in the message. Fix the cause in the file:line, or wrap the risky call in a try/catch.'};
  if(a.level==='Error')return {
    what:'A generic PHP error - the script hit a problem. Treat it like a warning: it is a real bug.',
    dbg:'Read the message, locate the <b>file:line</b>, and fix the underlying cause.'
  };
  return {what:'A PHP log entry was recorded.', dbg:'Read the message, then inspect the <b>file:line</b> it points to.'};
}

/* ---------- R6: chunked parse so a 5MB log never freezes the tab ---------- */
var CHUNK=40000, parseId=0;
function parseAsync(text, source){
  var id=++parseId;
  clearMsg();
  prog.hidden=false; progText.textContent='parsing lines…'; progBar.style.width='0%';
  var lines=text.split(/\r?\n/);
  var out={entries:[]};
  var i=0, n=lines.length;
  function step(){
    if(id!==parseId)return; // superseded
    var end=Math.min(i+CHUNK, n);
    classifyAndBuild(lines, i, end, out);
    i=end;
    progText.textContent='parsing '+fmtCount(i)+' / '+fmtCount(n)+' lines…';
    progBar.style.width=Math.round(i/n*100)+'%';
    if(i<n){ setTimeout(step,0); }
    else { finishParse(out.entries, n, source); }
  }
  setTimeout(step,0);
}
function finishParse(entries, totalLines, source){
  prog.hidden=true;
  if(!entries.length){ showNoValid(); return; }
  parsedEntries=entries; parsedGroups=aggregate(entries);
  lastSource=source;
  renderAll(source);
}

/* ---------- R7 / R2: no valid entries ---------- */
function showNoValid(){
  dash.hidden=true; rawList.hidden=true; groupsEl.innerHTML=''; chips.innerHTML='';
  showMsg('no valid PHP log entries found - is this a WordPress debug.log?','warn');
}

/* ---------- render ---------- */
function renderAll(source){
  dash.hidden=false; rawList.hidden=true; rawToggle.textContent='show raw log'; rawMode=false;
  totalN.textContent=fmtCount(parsedEntries.length);
  totalSub.textContent='entries';
  groupN.textContent=fmtCount(parsedGroups.length);
  if(source==='upload') srcNote.textContent='analyzed from uploaded file: '+(fileInput.files[0] ? fileInput.files[0].name : '')+'  ·  pasted text (if any) was preserved';
  else srcNote.textContent='analyzed from pasted text';
  buildChips();
  renderGroups(true);
}

function levelCounts(){
  var c={}; for(var i=0;i<parsedGroups.length;i++){var l=parsedGroups[i].level; c[l]=(c[l]||0)+parsedGroups[i].count;}
  return c;
}
var LEVEL_COLORS={Fatal:'var(--red)',Parse:'var(--red)',Database:'var(--red)',Error:'var(--red)',Warning:'var(--amber)',Notice:'var(--muted)',Deprecated:'var(--muted)'};
var LEVEL_DOT={Fatal:'var(--red)',Parse:'var(--red)',Database:'var(--red)',Error:'var(--red)',Warning:'var(--amber)',Notice:'var(--muted)',Deprecated:'var(--muted)'};
var LEVEL_HUMAN={Fatal:'Fatal',Parse:'Parse',Database:'Database',Warning:'Warning',Notice:'Notice',Deprecated:'Deprecated',Error:'Error'};
var LEVELS=Object.keys(LEVEL_ORDER);

function buildChips(){
  var counts=levelCounts();
  var html='<button class="wlda-chip" data-lvl="" data-on="'+(curFilter===null?1:0)+'"><span>All</span><span class="wlda-n">'+fmtCount(parsedEntries.length)+'</span></button>';
  LEVELS.forEach(function(l){
    if(!counts[l])return;
    html+='<button class="wlda-chip" data-lvl="'+l+'" data-on="'+(curFilter===l?1:0)+'"><span class="wlda-dot" style="background:'+(LEVEL_DOT[l]||'var(--muted)')+'"></span><span>'+LEVEL_HUMAN[l]+'</span><span class="wlda-n">'+fmtCount(counts[l])+'</span></button>';
  });
  chips.innerHTML=html;
  Array.prototype.forEach.call(chips.querySelectorAll('.wlda-chip.wlda-chip'),function(ch){
    ch.addEventListener('click',function(){
      curFilter=ch.getAttribute('data-lvl')||null;
      buildChips(); renderGroups(true);
    });
  });
}

function renderGroups(clear){
  if(clear){ groupsEl.innerHTML=''; shownGroups=0; }
  var q=curQuery.toLowerCase();
  var filtered=curFilter?parsedGroups.filter(function(g){return g.level===curFilter;}):parsedGroups.slice();
  if(q) filtered=filtered.filter(function(g){
    return (g.message+' '+(g.file||'')+' '+g.line+' '+g.level).toLowerCase().indexOf(q)>-1;
  });
  var more=shownGroups+50;
  var slice=filtered.slice(shownGroups, more);
  var html='';
  slice.forEach(function(g){
    var hint=buildHint(g);
    var stackHtml='';
    if(g.stack&&g.stack.length){
      stackHtml='<div class="wlda-stack"><b>Stack trace</b>\n'+g.stack.map(function(s){var m=s.match(/^#(\d+)\s+(.*)$/);return m?'<b>#'+m[1]+'</b> '+esc(m[2]):esc(s);}).join('\n')+'</div>';
    } else {
      stackHtml='<div class="wlda-stack no-stack"><b>Stack trace</b>\n<span class="wlda-no">(none captured for this entry)</span></div>';
    }
    var flTxt=g.file?g.file+(g.line?(' : '+g.line):''):'(no file/line)';
    html+='<details class="wlda-grp" data-k="'+esc(g.key)+'"><summary>'
      +'<span class="wlda-count">'+g.count+'<small> ×</small></span>'
      +'<span class="wlda-lvl" style="color:'+(LEVEL_COLORS[g.level]||'var(--muted)')+';background:color-mix(in srgb,'+(LEVEL_DOT[g.level]||'var(--muted)')+' 12%, transparent)">'+LEVEL_HUMAN[g.level]+'</span>'
      +'<span class="wlda-msg-h">'+esc(g.message||'(empty message)')+'</span>'
      +'<span class="wlda-fl">'+esc(flTxt)+'</span>'
      +'</summary><div class="wlda-body"><div class="wlda-hint"><b>What this means:</b> '+hint.what+'<div class="wlda-dbg"><b>How to start debugging:</b> '+hint.dbg+'</div></div>'
      +('<div class="wlda-hint" style="border-color:var(--cyan);background:rgba(92,200,255,.05)"><b>Example timestamp:</b> '+esc(g.ts||' - ')+'</div>')
      +stackHtml+'</div></details>';
  });
  groupsEl.insertAdjacentHTML('beforeend',html);
  shownGroups=more;
  if(filtered.length>shownGroups){ moreBtn.hidden=false; moreBtn.textContent='load more groups ('+fmtCount(filtered.length-shownGroups)+')'; }
  else moreBtn.hidden=true;
}

function renderRaw(){
  rawList.innerHTML='';
  var slice=parsedEntries.slice(0,400);
  var html='';
  slice.forEach(function(e){
    var flTxt=e.file?e.file+(e.line?(' : '+e.line):''):'';
    html+='<div class="wlda-raw-item"><span class="wlda-lvl" style="color:'+(LEVEL_COLORS[e.level]||'var(--muted)')+'">'+LEVEL_HUMAN[e.level]+'</span> '+esc(e.ts||'')+' <span class="wlda-m">'+esc(e.message||'')+'</span>'+(flTxt?' <span class="wlda-no" style="color:var(--dim)">['+esc(flTxt)+']</span>':'')+'</div>';
  });
  rawList.innerHTML=html;
  if(parsedEntries.length>400){
    var el=document.createElement('button'); el.className='wlda-btn wlda-ghost wlda-loadmore'; el.textContent='load more raw lines ('+fmtCount(parsedEntries.length-400)+')';
    el.addEventListener('click',renderRawMore);
    rawList.appendChild(el);
  }
}
var rawShown=400;
function renderRawMore(){
  var slice=parsedEntries.slice(rawShown,rawShown+400);
  var html='';
  slice.forEach(function(e){var flTxt=e.file?e.file+(e.line?(' : '+e.line):''):'';
    html+='<div class="wlda-raw-item"><span class="wlda-lvl" style="color:'+(LEVEL_COLORS[e.level]||'var(--muted)')+'">'+LEVEL_HUMAN[e.level]+'</span> '+esc(e.ts||'')+' <span class="wlda-m">'+esc(e.message||'')+'</span>'+(flTxt?' <span class="wlda-no" style="color:var(--dim)">['+esc(flTxt)+']</span>':'')+'</div>';});
  rawList.insertAdjacentHTML('beforeend',html);
  rawShown+=400;
  var last=rawList.querySelector('.wlda-loadmore.wlda-loadmore');
  if(last && parsedEntries.length>rawShown){ last.textContent='load more raw lines ('+fmtCount(parsedEntries.length-rawShown)+')'; }
  else if(last)last.remove();
}

/* ---------- report (copy / download) ---------- */
function buildReport(){
  var counts=levelCounts();
  var top=parsedGroups.slice(0,15);
  var s='# WordPress debug.log analysis\n\n';
  s+='- Generated locally in your browser - **your log was never uploaded.**\n';
  s+='- Total entries: **'+parsedEntries.length+'**  ·  repeated groups: **'+parsedGroups.length+'**\n\n';
  s+='## Level breakdown\n\n';
  LEVELS.forEach(function(l){ if(counts[l]) s+='- **'+LEVEL_HUMAN[l]+'**: '+counts[l]+'\n'; });
  s+='\n## Top repeated errors\n\n';
  top.forEach(function(g,i){
    var fl=g.file?g.file+(g.line?(' : '+g.line):''):'';
    s+=(i+1)+'. **'+g.count+'×** '+LEVEL_HUMAN[g.level]+' - '+g.message+(fl?('  ('+fl+')'):'')+'\n';
    if(g.stack&&g.stack.length){ s+='   \n```\n'+g.stack.slice(0,6).join('\n')+'\n```\n'; }
    s+='\n';
  });
  return s;
}
function copyText(t){
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){flash(copyBtn,'Copied ✓');},function(){fallbackCopy(t);}); }
  else fallbackCopy(t);
}
function fallbackCopy(t){
  var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); flash(copyBtn,'Copied ✓'); }catch(e){ flash(copyBtn,'copy failed','err'); }
  document.body.removeChild(ta);
}
function flash(btn,label,kind){
  var old=btn.textContent; btn.textContent=label;
  setTimeout(function(){btn.textContent=old;},1400);
}
function downloadReport(){
  var s=buildReport();
  var blob=new Blob([s],{type:'text/markdown'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='wp-debug-summary.md'; document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}

/* ---------- events ---------- */
var pctDebounce=null, pendingBuffer=null;
function parseBuffer(text, source){
  pendingBuffer=text;
  if(pctDebounce)clearTimeout(pctDebounce);
  pctDebounce=setTimeout(function(){
    if(!pendingBuffer || !pendingBuffer.trim())return;
    parseAsync(pendingBuffer, source);
    pendingBuffer=null;
  },320);
}
/* R1 + R6: read pastes into an in-memory buffer instead of assigning a multi-MB
   value to the <textarea>. Assigning a huge string forces Chromium to lay out the
   whole textarea and can freeze a phone/desktop tab for a minute; reading from a
   variable is ~1ms. Large pastes get a preview note in the textarea instead. */
logIn.addEventListener('paste',function(e){
  var t=(e.clipboardData && e.clipboardData.getData('text'))||'';
  if(!t){ return; } // let the browser handle non-text paste normally
  e.preventDefault();
  if(t.length>40000){
    logIn.value=t.slice(0,4000)+'\n… ['+fmtCount(t.length)+' chars captured - analyzing from memory (preview truncated to keep your device responsive)]';
    srcNote.textContent='large paste ('+fmtCount(t.length)+' chars) captured in memory - the textarea shows only a preview';
    parseBuffer(t,'paste');
  }else{
    logIn.value=t;
    parseBuffer(t,'paste');
  }
});
logIn.addEventListener('input',function(){
  // R6: debounce paste-parsing; typed/small input arrives via .value (cheap to read)
  if(pctDebounce)clearTimeout(pctDebounce);
  pctDebounce=setTimeout(function(){
    var txt=logIn.value.trim();
    if(!txt){ clearMsg(); return; }
    parseBuffer(logIn.value,'paste');
  },500);
});
fileInput.addEventListener('change',function(){
  var f=fileInput.files&&fileInput.files[0];
  if(!f)return;
  fileName.textContent='selected: '+f.name+' ('+fmtCount(f.size)+' bytes) - click Analyze';
  clearMsg();
  srcNote.textContent='';
});
analyzeBtn.addEventListener('click',function(){
  // R1: prefer upload, but never silently discard pasted text
  var f=fileInput.files&&fileInput.files[0];
  if(f){ var rd=new FileReader(); rd.onload=function(){ parseAsync(rd.result,'upload'); }; rd.readAsText(f); return; }
  var txt=logIn.value.trim();
  if(!txt){ showMsg('Paste a log, or choose a debug.log file first.','warn'); return; }
  if(pctDebounce)clearTimeout(pctDebounce);
  parseAsync(logIn.value,'paste');
});
clearBtn.addEventListener('click',function(){
  logIn.value=''; fileInput.value=''; fileName.textContent=''; srcNote.textContent='';
  pendingBuffer=null;
  parsedEntries=[]; parsedGroups=[]; curFilter=null; curQuery=''; shownGroups=0; rawShown=400;
  dash.hidden=true; groupsEl.innerHTML=''; chips.innerHTML=''; rawList.innerHTML=''; rawList.hidden=true;
  rawToggle.textContent='show raw log'; clearMsg(); prog.hidden=true;
});
search.addEventListener('input',function(){ curQuery=search.value.trim(); renderGroups(true); });
rawToggle.addEventListener('click',function(){
  rawMode=!rawMode;
  if(rawMode){ rawShown=400; groupsEl.hidden=true; rawList.hidden=false; rawToggle.textContent='show groups'; renderRaw(); }
  else { rawList.hidden=true; groupsEl.hidden=false; rawToggle.textContent='show raw log'; }
});
moreBtn.addEventListener('click',function(){ renderGroups(); });
copyBtn.addEventListener('click',function(){ copyText(buildReport()); });
dlBtn.addEventListener('click',downloadReport);

clearMsg();
})();
