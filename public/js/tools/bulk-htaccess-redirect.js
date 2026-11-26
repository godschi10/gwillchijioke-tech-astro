/* ============================================================
   Bulk .htaccess 301 Redirect Workbench - v1.21.52
   Paste old→new URLs → review/edit each row → choose method,
   status, matching → generate a valid .htaccess redirect block.
   Client-side only, deterministive. Beats the stale tools.
   ============================================================ */
(function () {
'use strict';
function $(id){ return document.getElementById(id); }
var paste=$('paste'), rowsBody=$('rowsbody'), emptyMsg=$('empty'), resCount=$('rescount'),
    pasteCount=$('pastecount'), output=$('output'), outStat=$('outstat'), report=$('report'),
    methodSel=$('method'), codeSel=$('code'), matchSel=$('match'),
    ciChk=$('caseins'), qsChk=$('qschk'), slashSel=$('slash'),
    addRowBtn=$('addrow'), genBtn=$('gen'), clearBtn=$('clear'), copyBtn=$('copy'), dlBtn=$('dl');

var rows=[];           // {id, old, next, status}
var nextId=1;

/* ---------- helpers ---------- */
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function gv(id){ return $(id)?$(id).value:''; }
function pad2(n){ return (n<10?'0':'')+n; }
function today(){ var d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }

/* ---------- parsing text -> rows ---------- */
// Accept comma / tab / semicolon / pipe / 2+ spaces. Header row auto-skipped.
function parseText(text){
  var lines=String(text).split(/\r?\n/);
  var found=[];
  for(var i=0;i<lines.length;i++){
    var L=lines[i];
    if(!L.trim()) continue;
    var sep=null;
    if(L.indexOf('\t')>-1) sep='\t';
    else if(L.indexOf(',')>-1) sep=',';
    else if(L.indexOf(';')>-1) sep=';';
    else if(L.indexOf('|')>-1) sep='|';
    else if(/\s{2,}/.test(L)) sep=/\s{2,}/;
    var parts = sep ? L.split(sep) : L.trim().split(/\s+/);
    parts=parts.map(function(p){return p.trim();}).filter(Boolean);
    if(parts.length<1) continue;
    // skip a header row whose FIRST field is a column name
    if(/^(old|from|source|old_url|oldurl|path|source_url|url|redirect_from)$/i.test(parts[0]) && /^(new|to|destination|new_url|newurl|target|redirect_to)$/i.test(parts[1]||'')) continue;
    found.push({old: parts[0], next: parts[1]||''});
  }
  return found;
}

/* ---------- validation ---------- */
function validateRow(r, seenOld){
  if(!r.old){ r.status='empty'; return; }
  var oldN=normUrl(r.old), newN=normUrl(r.next);
  if(!r.next){ r.status='notgt'; return; }
  if(oldN==='' && newN===''){ r.status='empty'; return; }
  if(oldN===newN){ r.status='self'; return; }
  var key=oldN.toLowerCase();
  if(seenOld[key]){ r.status='dup'; return; }
  seenOld[key]=true;
  r.status='ok';
}
// Normalize a URL to a comparable form (lowercased host; keep path case)
function normUrl(u){
  var s=String(u).trim();
  s=s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//,'');   // strip scheme
  s=s.replace(/^\/\//,'');                            // strip //
  s=s.replace(/\/+$/,'');                             // strip trailing slashes
  return s.toLowerCase();
}
function statusMeta(s){
  return {
    ok:['ok','Valid'],
    empty:['empty','Missing'],
    notgt:['warn','No target'],
    self:['warn','Same URL'],
    dup:['dup','Duplicate'],
  }[s] || ['warn',s];
}
function statusText(r){
  if(r.status==='ok') return 'OK';
  if(r.status==='empty') return 'empty';
  if(r.status==='notgt') return 'no target';
  if(r.status==='self') return 'old = new';
  if(r.status==='dup') return 'duplicate';
  return r.status;
}

/* ---------- render the review table ---------- */
function renderRows(){
  var html='';
  var seenOld={};
  rows.forEach(function(r){
    validateRow(r, seenOld);
    var sm=statusMeta(r.status);
    html+='<tr class="'+sm[0]+'">'
      +'<td class="su"><span class="stat-pill '+sm[0]+'" title="'+esc(statusText(r))+'">'+esc(sm[1])+'</span></td>'
      +'<td><input class="cell col-old" data-id="'+r.id+'" value="'+esc(r.old)+'" placeholder="/old-url"></td>'
      +'<td><input class="cell col-new" data-id="'+r.id+'" value="'+esc(r.next)+'" placeholder="/new-url"></td>'
      +'<td class="su"><button class="rowdel" data-id="'+r.id+'" title="Remove">×</button></td>'
      +'</tr>';
  });
  rowsBody.innerHTML=html;
  emptyMsg.hidden = rows.length>0;
  resCount.textContent = rows.length + (rows.length===1?' redirect':' redirects');
  updateStat();
}
function refreshValidation(){
  // re-run validation on current rows without re-drawing (to keep focus)
  var seenOld={};
  rows.forEach(function(r){ validateRow(r,seenOld); });
  // update pill classes in place
  Array.prototype.forEach.call(rowsBody.querySelectorAll('tr'),function(tr){
    var id=+tr.querySelector('[data-id]').getAttribute('data-id');
    var r=rows.find(function(x){return x.id===id;});
    if(!r) return;
    var sm=statusMeta(r.status);
    tr.className=sm[0];
    var pill=tr.querySelector('.stat-pill');
    if(pill){ pill.className='stat-pill '+sm[0]; pill.textContent=sm[1]; pill.title=statusText(r); }
  });
  updateStat();
}

function updateStat(){
  var t=gv('paste');
  pasteCount.textContent = (t.split(/\r?\n/).length) + ' lines';
}

/* ---------- row input events (delegated) ---------- */
rowsBody.addEventListener('input', function(e){
  var el=e.target;
  if(el.classList && el.classList.contains('cell')){
    var id=+el.getAttribute('data-id');
    var r=rows.find(function(x){return x.id===id;});
    if(!r) return;
    if(el.classList.contains('col-old')) r.old=el.value;
    else r.next=el.value;
    refreshValidation();
  }
});
rowsBody.addEventListener('click', function(e){
  var del=e.target.closest('.rowdel');
  if(del){
    var id=+del.getAttribute('data-id');
    rows=rows.filter(function(x){return x.id!==id;});
    renderRows();
  }
});
addRowBtn.addEventListener('click', function(){
  rows.push({id:nextId++, old:'', next: ''});
  renderRows();
});
clearBtn.addEventListener('click', function(){
  rows=[]; paste.value=''; renderRows(); output.value=''; outStat.textContent='0 chars';
  report.innerHTML='';
});

/* ---------- generate -------- */
function escPattern(p){
  return p
    .replace(/[.\\+?^$(){}|[\]]/g, function(c){ return '\\'+c; })
    .replace(/\*/g, '.*');
}
// path with optional-wildcard awareness
function pathOf(u){
  var s=String(u).trim();
  var m=s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//); if(m) s=s.slice(m[0].length);
  var m2=s.match(/^[^\/?#]*/); if(m2) s=s.slice(m2[0].length);
  if(s==='') return '/';
  return s.replace(/\/+$/,'')||'/';
}
function generate(){
  // The reviewed table IS the source of truth - Generate must not resurrect deleted
  // rows or revert in-table edits by re-reading the paste box (v1.21.52 fix).
  if(rows.length===0){
    rows = parseText(gv('paste')).map(function(p){ return {id:nextId++, old:p.old, next:p.next}; });
  }

  var method=gv('method'), code=gv('code'), match=gv('match');
  var ci=$('caseins')&&$('caseins').checked, qs=$('qschk')&&$('qschk').checked, slash=gv('slash');
  var lines=[]; var skipped=0; var seenOld={};
  rows.forEach(function(r){
    validateRow(r, seenOld);
    if(r.status==='ok'){ }
    else { skipped++; return; }
    var oldPath=pathOf(r.old), newPath=pathOf(r.next)||'/';

    if(match==='exact'){
      // Query strings never reach a RewriteRule pattern (they match the path only) -
      // strip them from the pattern and carry them through with the QSA flag instead.
      var oldQs = '';
      var oldNoQs = oldPath;
      var qm = oldNoQs.indexOf('?');
      if(qm > -1){ oldQs = oldNoQs.slice(qm); oldNoQs = oldNoQs.slice(0, qm); }
      var oldLit=oldNoQs;                     // literal path for mod_alias
      var pat=escPattern(oldNoQs);
      if(slash!=='strict') pat+='/?';
      pat+='$';
      var tgt=newPath;
      if(slash!=='none' && /\/$/.test(r.next.trim())) tgt+='/';
      lines.push(makeRule(method, code, ci, qs, pat, oldLit, tgt));
    } else {
      // prefix / wildcard - strip the query string first (same rule as exact)
      var pNoQs = oldPath, pqm = pNoQs.indexOf('?');
      if(pqm > -1) pNoQs = pNoQs.slice(0, pqm);
      var base=escPattern(pNoQs).replace(/\/+$/,'');
      var tgt2=newPath.replace(/\/+$/,'');
      lines.push(makeRule(method, code, ci, qs, '^'+base+'/(.*)$', pNoQs.replace(/\/+$/,'')+'/', tgt2+'/$1'));
    }
  });
  if(lines.length){
    var block='# BEGIN GWill Bulk Redirects - '+today()+' | '+method.replace('mod_','')+' '+code+'\n'+
      '<IfModule mod_rewrite.c>\nRewriteEngine On\n\n'+lines.join('\n')+
      '\n</IfModule>\n# END GWill Bulk Redirects';
    output.value=block;
    outStat.textContent=block.length+' chars · '+lines.length+' rule'+(lines.length!==1?'s':'')+' · '+skipped+' skipped';
    var hadQs = rows.some(function(r){ return (r.old||'').indexOf('?') > -1; });
    var qsNote = hadQs ? (qs ? ' Query strings carried through with QSA.' : ' Source query strings were stripped (turn on Carry query strings to keep them).') : '';
    report.innerHTML='<div class="note"><span class="dot ok"></span>Generated '+lines.length+' redirect rule'+ (lines.length!==1?'s':'') +'. Place ABOVE the WordPress permalink rules (the [L] stops processing).'+ (skipped?' '+skipped+' invalid row'+(skipped!==1?'s':'')+' skipped - fix them in the table above.':'') + qsNote +'</div>';
  } else {
    output.value=''; outStat.textContent='0 chars';
    report.innerHTML='<div class="note"><span class="dot i"></span>No valid redirects to generate - add old→new URL pairs, or fix the invalid rows in the table above.</div>';
  }
}
/* Build one redirect line. mod_rewrite uses a regex pattern; mod_alias (Redirect)
   uses a literal path (no regex, no NC). `pat` is the regex pattern, `lit` the
   literal source path for Redirect. */
function makeRule(method, code, ci, qs, pat, lit, tgt){
  if(method==='mod_alias'){
    var p=(lit||'/'+'').replace(/\/+$/,'') || '/';
    return '  Redirect '+code+' '+p+' '+tgt;
  }
  return '  RewriteRule ^'+pat+' '+tgt+' ['+(ci?'NC,':'')+(qs?'QSA,':'')+'R='+code+',L]';
}

/* ---------- copy/download ---------- */
function copy(){
  var t=output.value||'';
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){flash(copyBtn,'Copied ✓');},function(){fallback(t);}); }
  else fallback(t);
}
function fallback(t){
  var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
  ta.focus(); ta.select();
  try{document.execCommand('copy');flash(copyBtn,'Copied ✓');}catch(e){flash(copyBtn,'copy failed');}
  document.body.removeChild(ta);
}
function flash(b,s){ var o=b.textContent; b.textContent=s; setTimeout(function(){b.textContent=o;},1400); }
function download(){
  var blob=new Blob([output.value||''],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='redirects.htaccess'; document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}

/* ---------- events ---------- */
paste.addEventListener('input', function(){
  // STAGE ONLY (v1.21.57): paste edits must never silently rebuild the reviewed table -
  // they load on the explicit 'Load paste into table' click (or on Generate when the table is empty).
  var synced=parseText(gv('paste'));
  pasteCount.textContent = (gv('paste') ? gv('paste').split('\n').length : 0) + ' lines · ' + synced.length + ' pairs staged';
});
$('loadpaste').addEventListener('click', function(){
  var synced=parseText(gv('paste'));
  if(synced.length){ rows=synced.map(function(p){ return {id:nextId++, old:p.old, next:p.next}; }); renderRows(); }
  updateStat();
});
['method','code','match','slash'].forEach(function(id){ $(id).addEventListener('change', generate); });
['caseins','qschk'].forEach(function(id){ $(id).addEventListener('change', generate); });
genBtn.addEventListener('click', generate);
copyBtn.addEventListener('click', copy);
dlBtn.addEventListener('click', download);

/* ---------- boot example ---------- */
paste.value =
"/old-blog-post,/new-blog-post\n" +
"/services-pricing,/pricing\n" +
"/contact-us,/about/contact\n" +
"/portfolio,https://example.com/our-work\n";
// run parse + render + generate
(function(){ var synced=parseText(paste.value); rows=synced.map(function(p){return {id:nextId++, old:p.old, next:p.next};}); renderRows(); generate(); })();
})();
