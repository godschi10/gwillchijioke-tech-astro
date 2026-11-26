
(function(){
'use strict';
function $(id){return document.getElementById(id);}
var inp=$('inp'), tok=$('tok'), tree=$('tree'), treemsg=$('treemsg'), rootstat=$('rootstat'),
    out=$('out'), outmsg=$('outmsg'), mb=$('mb'), changed=$('changed');
var currentRoot=null, lastOut='';

/* ---------- byte helpers ---------- */
function utf8Len(s){ try{ return new TextEncoder().encode(s).byteLength; }catch(e){ var n=0; for(var i=0;i<s.length;i++){ var c=s.charCodeAt(i); if(c<0x80)n+=1; else if(c<0x800)n+=2; else if(c>=0xd800&&c<=0xdbff&&i+1<s.length){var c2=s.charCodeAt(i+1); if(c2>=0xdc00&&c2<=0xdfff){n+=4;i++;}else n+=3;} else n+=3; } return n; } }
function charLen(s){return s.length;}

/* ---------- parser ---------- */
function Parser(str){
  this.str=str; this.pos=0;
}
Parser.prototype.eof=function(){return this.pos>=this.str.length;}
Parser.prototype.peek=function(){return this.str[this.pos];}
Parser.prototype.skipWs=function(){}
/* read a single token char (function code) */
Parser.prototype.parseValue=function(warnings, depth){
  if(depth>1000) throw this.err('Max nested depth exceeded - input is pathological', this.pos);
  if(this.eof()) throw this.err('Unexpected end of input (string is incomplete)', this.pos);
  var ch=this.str[this.pos];
  if(ch==='s') return this.parseString(warnings);
  if(ch==='i') return this.parseInt();
  if(ch==='d') return this.parseFloat();
  if(ch==='b') return this.parseBool();
  if(ch==='N'){ this.pos+=2; return {type:'null', start:this.pos-2, end:this.pos}; }
  if(ch==='a') return this.parseArray(warnings, depth);
  if(ch==='O') return this.parseObject(warnings, depth);
  if(ch==='C') return this.parseCustom(warnings, depth);
  throw this.err("Unknown PHP-serialized type marker '"+(ch===' '?'[space]':ch)+"' at offset "+this.pos, this.pos);
};
Parser.prototype.expect=function(s,what){
  if(this.str.substr(this.pos,s.length)!==s) throw this.err("Expected `"+what+"` at offset "+this.pos+" but found `"+this.str.substr(this.pos,8).replace(/\n/g,'\\n')+"`", this.pos);
  this.pos+=s.length;
};
Parser.prototype.readUntil=function(delim){
  var start=this.pos; var idx=this.str.indexOf(delim,this.pos);
  if(idx<0) throw this.err('Unterminated string - no closing `'+delim+'` found', start);
  this.pos=idx+delim.length;
  return this.str.slice(start,idx);
};
Parser.prototype.parseString=function(warnings){
  var start=this.pos;
  this.expect('s:','s:');
  var lenStr=this.readUntil(':"');
  var declared=parseInt(lenStr,10);
  if(!/^\d+$/.test(lenStr)) throw this.err('String length `'+lenStr+'` is not a valid integer', start);
  // readUntil(':"') already consumed the `:"` - pos now points at the first content char
  var contentStart=this.pos;
  var closeIdx=this.str.indexOf('";', this.pos);
  if(closeIdx<0){ this.pos=this.str.length; throw this.err('Unterminated string - no closing `";` found', start); }
  var content=this.str.slice(this.pos, closeIdx);
  this.pos=closeIdx+2;
  var actual=utf8Len(content);
  var bad=(actual!==declared);
  if(bad){
    warnings.push({offset:start, kind:'len', declared:declared, actual:actual,
      msg:'s:'+declared+' declares '+declared+' bytes but the content is '+actual+' bytes'+(actual>declared?' (search/replace grew it without updating the length)':' (value was truncated/over-short)')});
  }
  return {type:'string', declared:declared, value:content, actualBytes:actual, start:start, end:this.pos, bad:bad};
};
Parser.prototype.parseInt=function(){
  var start=this.pos; this.expect('i:','i:'); var s=this.readUntil(';'); var v=parseInt(s,10);
  return {type:'int', value:v, start:start, end:this.pos};
};
Parser.prototype.parseFloat=function(){
  var start=this.pos; this.expect('d:','d:'); var s=this.readUntil(';'); var v=parseFloat(s);
  if(isNaN(v)) throw this.err('Invalid float `'+s+'`', start);
  return {type:'float', value:v, raw:s, start:start, end:this.pos};
};
Parser.prototype.parseBool=function(){
  var start=this.pos; this.expect('b:','b:'); var s=this.readUntil(';');
  if(s!=='0'&&s!=='1') throw this.err('Invalid boolean `'+s+'`', start);
  return {type:'bool', value:s==='1', start:start, end:this.pos};
};
Parser.prototype.count=function(){
  var start=this.pos; this.expect('a:','a:'); return {start:start, n:parseInt(this.readUntil(':{'),10)};
};
Parser.prototype.parseArray=function(warnings, depth){
  var start=this.pos; this.expect('a:','a:'); var c=this.readUntil(':{');
  var count=parseInt(c,10);
  if(!/^\d+$/.test(c)) throw this.err('Array count `'+c+'` not valid', start);
  var elems=[];
  var actualCount=0;
  while(!this.eof() && this.peek()!=='}'){
    var key=this.parseValue(warnings, depth+1);
    var val=this.parseValue(warnings, depth+1);
    elems.push({key:key, value:val});
    actualCount++;
  }
  if(this.eof()) throw this.err('Array is truncated - expected `}` to close, reached end of input', start);
  this.pos++; // }
  var bad=(actualCount!==count);
  if(bad) warnings.push({offset:start, kind:'count', declared:count, actual:actualCount,
    msg:'Array declares a:'+count+': but contains '+actualCount+' elements'});
  return {type:'array', declared:count, count:actualCount, elems:elems, start:start, end:this.pos, bad:bad};
};
Parser.prototype.parseObject=function(warnings, depth){
  var start=this.pos; this.expect('O:','O:'); var clsLenStr=this.readUntil(':"');
  var clsLen=parseInt(clsLenStr,10);
  var cls=this.readUntil('":');
  var cntStr=this.readUntil(':{');
  var count=parseInt(cntStr,10);
  var props=[];
  var actualCount=0;
  while(!this.eof() && this.peek()!=='}'){
    var key=this.parseValue(warnings, depth+1);
    var val=this.parseValue(warnings, depth+1);
    props.push({key:key, value:val});
    actualCount++;
  }
  if(this.eof()) throw this.err('Object is truncated - expected `}` to close', start);
  this.pos++;
  var bad=(actualCount!==count)||(utf8Len(cls)!==clsLen);
  if(actualCount!==count) warnings.push({offset:start,kind:'count',declared:count,actual:actualCount,msg:'Object declares '+count+' props but has '+actualCount});
  return {type:'object', className:cls, props:props, start:start, end:this.pos, bad:bad};
};
Parser.prototype.parseCustom=function(warnings, depth){
  var start=this.pos; this.expect('C:','C:'); var clsLenStr=this.readUntil(':"');
  var cls=this.readUntil('":');
  var payloadLen=parseInt(this.readUntil(':{'),10);
  var data=this.readUntil('}');
  this.pos+=1; // }
  if(utf8Len(data)!==payloadLen) warnings.push({offset:start,kind:'len',msg:'Custom object payload is '+utf8Len(data)+' bytes but declares '+payloadLen});
  return {type:'custom', className:cls, data:data, start:start, end:this.pos};
};
Parser.prototype.err=function(message,offset){ var e=new Error(message); e.offset=offset; return e; };

/* ---------- re-serializer (byte-accurate) ---------- */
function serialize(node, buf){
  switch(node.type){
    case 'string': buf.push('s:'+utf8Len(node.value)+':"'+node.value+'";'); break;
    case 'int': buf.push('i:'+node.value+';'); break;
    case 'float': buf.push('d:'+node.raw+';'); break;
    case 'bool': buf.push('b:'+(node.value?'1':'0')+';'); break;
    case 'null': buf.push('N;'); break;
    case 'array':
      buf.push('a:'+node.elems.length+':{');
      node.elems.forEach(function(e){ serialize(e.key,buf); serialize(e.value,buf); });
      buf.push('}'); break;
    case 'object': buf.push('O:'+utf8Len(node.className)+':"'+node.className+'":'+node.props.length+':{');
      node.props.forEach(function(p){ serialize(p.key,buf); serialize(p.value,buf); }); buf.push('}'); break;
    case 'custom': buf.push('C:'+utf8Len(node.className)+':"'+node.className+'":'+utf8Len(node.data)+':{'+node.data+'}'); break;
  }
}
function toPhp(node){ var buf=[]; serialize(node,buf); return buf.join(''); }

/* ---------- search/replace over string nodes ---------- */
function walkStrings(node, fn){
  if(node.type==='string'){ fn(node); }
  else if(node.type==='array'){ node.elems.forEach(function(e){ walkStrings(e.key,fn); walkStrings(e.value,fn); }); }
  else if(node.type==='object'){ node.props.forEach(function(p){ walkStrings(p.key,fn); walkStrings(p.value,fn); }); }
}
function applyReplace(root, find, repl, caseInsensitive, matchBytes){
  var count=0;
  walkStrings(root, function(n){
    var old=n.value, next=null;
    if(matchBytes){
      // operate on raw bytes so a multibyte needle is never matched half-way;
      // case-insensitive = ASCII-byte folding (A-Z==a-z), all other bytes exact
      var enc=new TextEncoder(), dec=new TextDecoder();
      var hay=enc.encode(old), needle=enc.encode(find);
      if(needle.length===0||hay.length<needle.length){ return; }
      var rb=enc.encode(repl), parts=[], i=0, hit=0;
      while(i<=hay.length-needle.length){
        var match=true;
        for(var j=0;j<needle.length;j++){
          var a=hay[i+j], b=needle[j];
          var al=(a>=65&&a<=90)?a+32:a, bl=(b>=65&&b<=90)?b+32:b;
          if(a!==b&&!(caseInsensitive&&al===bl)){ match=false; break; }
        }
        if(match){ parts.push(hay.slice(0,i),rb); hay=hay.slice(i+needle.length); i=0; hit++; continue; }
        i++;
      }
      if(!hit){ return; }
      parts.push(hay);
      var total=0; parts.forEach(function(p){ total+=p.length; });
      var merged=new Uint8Array(total), off=0;
      parts.forEach(function(p){ merged.set(p,off); off+=p.length; });
      next=dec.decode(merged);
    } else {
      if(caseInsensitive){
        var lh=old.toLowerCase(), lf=find.toLowerCase();
        if(lh.indexOf(lf)<0){ return; }
        var res='', i2=0;
        while(i2<old.length){
          var k=lh.indexOf(lf,i2);
          if(k<0){ res+=old.slice(i2); break; }
          res+=old.slice(i2,k)+repl; i2=k+find.length;
        }
        next=res;
      } else {
        if(old.indexOf(find)<0){ return; }
        next=old.split(find).join(repl);
      }
    }
    if(next!==null&&next!==old){ n.value=next; count++; n.changed={from:old,to:next}; n.afterBytes=utf8Len(next); }
  });
  return count;
}

/* ---------- rendering ---------- */
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
function nodeHtml(node, isKey){
  // `open` = expanded by default so the tree is legible immediately (still collapsible)
  var html='<details class="ser-node" open><summary>';
  var ty=node.type;
  var tcls=ty;
  html+='<span class="ser-caret">▸</span>';
  html+='<span class="ser-ty ser-'+tcls+'">'+ty+'</span>';
  if(ty==='string'){
    html+='<span class="ser-val ser-quote">"'+esc(node.value)+'"</span>';
    var cc=charLen(node.value), bb=utf8Len(node.value);
    html+='<span class="ser-len">';
    if(node.bad){ html+='<span class="ser-bad">decl '+node.declared+'B · actual '+bb+'B</span>'; }
    else if(cc!==bb){ html+='<span class="ser-ok">'+bb+'B ('+cc+' ch)</span>'; }
    else { html+='<span class="ser-ok">'+bb+'B</span>'; }
    html+='</span>';
  } else if(ty==='int'||ty==='float'||ty==='bool'){ html+='<span class="ser-val">'+esc(String(node.value))+'</span>'; }
  else if(ty==='null'){ html+='<span class="ser-val">null</span>'; }
  else if(ty==='array'){ html+='<span class="ser-val">['+node.count+' elem]</span>'+((node.bad)?'<span class="ser-len"><span class="ser-bad">count mismatch</span></span>':''); }
  else if(ty==='object'){ html+='<span class="ser-val">'+esc(node.className)+' ('+node.props.length+' props)</span>'; }
  else if(ty==='custom'){ html+='<span class="ser-val">'+esc(node.className)+'</span>'; }
  html+='</summary>';
  if(ty==='array'||ty==='object'){
    var kids=(ty==='array')?node.elems:node.props;
    if(kids.length){
      html+='<div class="ser-ch">';
      kids.forEach(function(k){
        var keyNode=k.key, valNode=k.value;
        var keyLabel;
        if(keyNode.type==='string'){
          var kl=charLen(keyNode.value), kb=utf8Len(keyNode.value);
          keyLabel='<span class="ser-ty ser-string">string</span> "'+esc(keyNode.value)+'" <span class="ser-len">'+(keyNode.bad?('<span class="ser-bad">decl '+keyNode.declared+'B · actual '+kb+'B</span>'):(kl!==kb?('<span class="ser-ok">'+kb+'B ('+kl+' ch)</span>'):('<span class="ser-ok">'+kb+'B</span>')))+'</span>';
        } else if(keyNode.type==='int'){ keyLabel='<span class="ser-ty ser-int">int</span> '+keyNode.value; }
        else { keyLabel='<span class="ser-ty ser-'+keyNode.type+'">'+keyNode.type+'</span>'; }
        html+='<div class="ser-nk">'+keyLabel+' <span class="ser-v">→</span></div>';
        html+=nodeHtml(valNode);
      });
      html+='</div>';
    }
  }
  html+='</details>';
  return html;
}

function renderTree(root, warnings){
  rootstat.hidden=false;
  var typeLabel={string:'string',int:'int',float:'float',bool:'bool',null:'null',array:'array',object:'object',custom:'object'}[root.type]||root.type;
  rootstat.innerHTML='root: <b>'+typeLabel+'</b>'+(root.type==='array'?' · <b>'+root.count+'</b> elements':'')+(root.type==='object'?' · <b>'+root.props.length+'</b> props':'')+'';
  tree.innerHTML=nodeHtml(root);
  if(warnings.length){
    treemsg.hidden=false; treemsg.className='ser-msg ser-warn';
    treemsg.innerHTML='<b>'+warnings.length+' problem'+(warnings.length!==1?'s':'')+' found:</b><ul style="margin:4px 0 0;padding-left:16px">'
      +warnings.slice(0,8).map(function(w){return '<li>'+esc(w.msg)+' <span style="color:var(--dim)">(offset '+w.offset+')</span></li>';}).join('')
      +(warnings.length>8?'<li>…'+(warnings.length-8)+' more</li>':'')+'</ul>';
  } else {
    treemsg.hidden=true;
  }
}

function renderOut(str, note){
  lastOut=str; // canonical plain text for Copy/Download - never out.innerText
  out.hidden=false; outmsg.hidden=false;
  out.innerHTML='<span class="ser-cmt"># byte-lengths recalculated from real UTF-8 bytes</span>\n'+esc(str);
  if(note){ outmsg.hidden=false; outmsg.className='ser-msg '+(note.ok?'ser-info':'ser-warn'); outmsg.textContent=(note.ok?'✓ ':'')+note.text; }
  else { outmsg.hidden=true; }
}

function multibyteCheck(root){
  var hits=[];
  walkStrings(root, function(n){ if(charLen(n.value)!==utf8Len(n.value)) hits.push({v:n.value, c:charLen(n.value), b:utf8Len(n.value)}); });
  if(hits.length){
    mb.hidden=false;
    mb.innerHTML='<b>Multibyte strings:</b> '+hits.slice(0,3).map(function(h){return '<code>'+esc(h.v.length>18?h.v.slice(0,18)+'…':h.v)+'</code> ('+h.c+' chars → '+h.b+' bytes)';}).join(', ')
      +(hits.length>3?' +'+(hits.length-3)+' more':'')+'. PHP <code>strlen</code> counts <b>bytes</b>, so these are handled correctly - this is the #1 migration-breaker.';
  } else mb.hidden=true;
}

function updateTok(){
  var t=inp.value;
  tok.textContent=t.split(/\r?\n/).length+' lines · '+t.length+' chars · '+utf8Len(t)+' bytes';
}

/* ---------- length-fix (simple) ---------- */
function lengthFix(){
  parseFromInput(); if(!currentRoot)return; // fresh parse every click - never mutate a stale tree
  changed.hidden=true;
  var fixed=toPhp(currentRoot);
  var wrong=0;
  walkStrings(currentRoot, function(n){ if(n.bad)wrong++; });
  var note={ok:true, text:'Rebuilt with corrected string lengths'+(wrong?(' - fixed '+wrong+' bad length'+(wrong!==1?'s':'')+''):' (no lengths needed fixing).')};
  renderOut(fixed, note);
}

/* ---------- parse ---------- */
function parseFromInput(){
  var text=inp.value;
  if(!text.trim()){ treemsg.hidden=false; treemsg.className='ser-msg ser-info'; treemsg.textContent='Paste a PHP-serialized string first.'; return null; }
  var p=new Parser(text);
  var warnings=[];
  try{
    var root=p.parseValue(warnings,0);
    currentRoot=root; // fresh tree object; no stale module state
    renderTree(root, warnings);
    multibyteCheck(root);
    // if root parsed but there's trailing garbage
    if(!p.eof() && p.pos<text.length){
      var trailing=text.slice(p.pos);
      if(trailing.trim()!==''){
        var w2=warnings.slice(); w2.push({offset:p.pos, msg:'Trailing content after the top-level value: `'+trailing.slice(0,20).replace(/\n/g,'\\n')+'` - the string may contain extra data.'});
        renderTree(root,w2);
      }
    }
    return root;
  }catch(e){
    currentRoot=null;
    var off=(e.offset!=null)?e.offset:0;
    treemsg.hidden=false; treemsg.className='ser-msg ser-err';
    treemsg.innerHTML='<b>Cannot parse - PHP would reject this too.</b><pre>'+esc(e.message)+'</pre><span style="color:var(--muted)">Offset '+off+'. This is what happens when a search/replace changes a serialized value without updating its length, or a migration truncated the data. Fix the source or re-paste - the tool won’t pretend to recover data PHP can’t unserialize.</span>';
    tree.innerHTML=''; rootstat.hidden=true; out.hidden=true; outmsg.hidden=true; mb.hidden=true; changed.hidden=true;
    return null;
  }
}

function doReserialize(){
  parseFromInput(); if(!currentRoot)return; // fresh parse every click - tree rebuilt from the textarea, never mutated in place
  var find=$('find').value, repl=$('repl').value;
  if(find===''){
    // no find term - re-emit unchanged with corrected lengths (the round-trip path)
    var wrong0=0; walkStrings(currentRoot,function(n){if(n.bad)wrong0++;});
    renderOut(toPhp(currentRoot),{ok:true,text:'No find term - re-serialized unchanged with correct byte-lengths'+(wrong0?(' (fixed '+wrong0+' bad length'+(wrong0!==1?'s':'')+')'):' (no bad lengths).')});
    changed.hidden=true;
    multibyteCheck(currentRoot);
    return;
  }
  var ci=$('ci').checked, bytes=$('bytes').checked;
  var count=applyReplace(currentRoot, find, repl, ci, bytes);
  walkStrings(currentRoot, function(n){ n.bad=false; }); // emitted blob has corrected lengths - clear stale input badges
  var dtl=[];
  walkStrings(currentRoot, function(n){ if(n.changed){ dtl.push({from:n.changed.from,to:n.value,fromB:utf8Len(n.changed.from),toB:n.afterBytes!=null?n.afterBytes:utf8Len(n.value)}); } });
  renderOut(toPhp(currentRoot),{ok:true,text:count+' string'+(count!==1?'s':'')+' replaced; every s:<len>: recalculated from the new byte length.'});
  if(dtl.length){
    changed.hidden=false;
    changed.innerHTML='<b>changed lengths:</b> '+dtl.slice(0,5).map(function(d){return '<code>'+esc(d.from.length>14?d.from.slice(0,14)+'…':d.from)+'</code> '+d.fromB+'B → <code>'+esc(d.to.length>14?d.to.slice(0,14)+'…':d.to)+'</code> '+d.toB+'B';}).join(', ')+(dtl.length>5?' +'+(dtl.length-5)+' more':'')+'.';
  } else { changed.hidden=true; }
  renderTree(currentRoot, []);
  multibyteCheck(currentRoot);
}

/* ---------- copy / download ---------- */
function copyText(t,btn){
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){flash(btn,'Copied ✓');},function(){fallbackCopy(t,btn);}); }
  else fallbackCopy(t,btn);
}
function fallbackCopy(t,btn){
  var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');flash(btn,'Copied ✓');}catch(e){flash(btn,'copy failed');}
  document.body.removeChild(ta);
}
function flash(b,s){var old=b.textContent;b.textContent=s;setTimeout(function(){b.textContent=old;},1400);}
function download(){
  if(!lastOut)return; // canonical plain text - no innerText scraping
  var blob=new Blob([lastOut+'\n'],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='serialized.txt';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}

/* ---------- events ---------- */
function debounce(fn,ms){var t;return function(){clearTimeout(t);t=setTimeout(fn,ms);};}
inp.addEventListener('input',debounce(updateTok,120));
$('parseBtn').addEventListener('click',parseFromInput);
$('reserBtn').addEventListener('click',doReserialize);
$('fixBtn').addEventListener('click',lengthFix);
$('demoBtn').addEventListener('click',function(){
  // A realistic migration break: change `Home` and shrink `show_logo`'s length without updating it.
  // ("show_logo" is 9 bytes but s:8 declares 8 - exactly the search/replace-migration bug.)
  inp.value='a:2:{s:8:"show_logo";b:1;s:9:"nav_label";s:5:"Home";}';
  updateTok(); parseFromInput();
});
$('copyBtn').addEventListener('click',function(){ if(!lastOut)return; copyText(lastOut,this); });
$('dlBtn').addEventListener('click',download);

/* ---------- boot : initial example (R5) ---------- */
/* Note: "show_logo" is 9 bytes and "Home" is 4 bytes - the prompt's own example
   (s:8/s:5) is itself a length bug. We pre-load the CORRECTED version so the user
   sees a clean parse immediately; the "corrupt the length" button injects the bug. */
inp.value='a:2:{s:9:"show_logo";b:1;s:9:"nav_label";s:4:"Home";}';
updateTok();
parseFromInput();
})();
