
(function(){
'use strict';
function $(id){return document.getElementById(id);}
var current={minute:'*',hour:'*',dom:'*',month:'*',dow:'*'};
var SITE_INPUT=false;

/* ---------- cron semantics ---------- */
function parsedMinuteFine(){return true;}
// cron day-of-week: 0 or 7 = Sunday. We normalise to 0-6 (7->0) for matching.
function dowMatch(dowField, jsDay){
  // jsDay: Date.getDay() 0-6
  return dowTest(dowField, jsDay===0?7:jsDay); // treat Sunday as 0 OR 7 allowed
}
function dowTest(dowField, d){
  // d is 1-7 (Mon=1..Sat=6,Sun=7)
  var spec=String(dowField).trim();
  if(spec==='*')return true;
  // build set of allowed dow numbers (0-6 expanded to also allow 7 for Sun)
  var allowed=expandField(spec,0,7);
  // map: field uses 0-6 (Sun=0); 7 may be supplied as Sun too. We test d in 1-7.
  // convert allowed (0-6,7) into the 1-7 frame: 0->7,1->1..6->6,7->7
  var norm={};
  allowed.forEach(function(v){ var n=(v===0)?7:v; norm[n]=true; });
  return !!norm[d];
}
function expandField(spec,min,max){
  // return sorted array of matching integers. Handles *, */n, a-b, a-b/n, comma, ?
  var out=[];
  spec=String(spec).trim();
  if(spec===''||spec==='*'||spec==='?'){ for(var i=min;i<=max;i++)out.push(i); return out; }
  spec.split(',').forEach(function(part){
    part=part.trim();
    if(part==='*'){ for(var i=min;i<=max;i++)out.push(i); return; }
    var m;
    // */n  (step across the whole field range)
    if(m=part.match(/^\*\/(\d+)$/)){
      var st=parseInt(m[1],10);
      for(var x=min;x<=max;x+=st)out.push(x);
      return;
    }
    if(m=part.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/)){
      var a=parseInt(m[1],10);
      var b=(m[2]!==undefined)?parseInt(m[2],10):((m[3]!==undefined)?max:a);
      var step=(m[3]!==undefined)?parseInt(m[3],10):1;
      if(isNaN(b)||b<min)b=max;
      for(var x2=a;x2<=b;x2+=step)out.push(x2);
    }
  });
  // unique + sort + clamp
  var seen={};var r=[];
  out.forEach(function(x){ if(x>=min&&x<=max&&!seen[x]){seen[x]=1;r.push(x);} });
  r.sort(function(a,b){return a-b;});
  return r;
}
function monthName(m){
  var n=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return n[m-1];
}
function dowName(d){
  var a=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return a[d%7];
}

/* ---------- build expression from builder state, with validation ---------- */
function fieldLabel(f){
  return {minute:'Minute',hour:'Hour',dom:'Day of month',month:'Month',dow:'Day of week'}[f];
}
/* Friendly "what this controls" line - shown under each builder row so a
   first-time user understands the field without knowing cron. */
function fieldExplain(f){
  return {
    minute:'How often to run - <b>0</b> = on the hour, <b>*/5</b> = every 5 minutes, <b>*</b> = every minute.',
    hour:'Which hour of the day (<b>0-23</b>). <b>0</b> = midnight, <b>14</b> = 2pm. <b>*</b> = every hour.',
    dom:'Which day of the <b>month</b> (<b>1-31</b>). <b>1</b> = the 1st. Leave as <b>*</b> for every day.',
    month:'Which <b>month</b> (<b>1-12</b>, or JAN - DEC). <b>1</b> = January. <b>*</b> = every month.',
    dow:'Which <b>weekday</b> (<b>0-6</b>, 0 = Sunday; 7 = Sunday too). <b>1</b> = Monday. <b>*</b> = every day.'
  }[f];
}
function fieldRange(f){
  return {minute:[0,59],hour:[0,23],dom:[1,31],month:[1,12],dow:[0,7]}[f];
}
function fieldStepMin(f){
  return {minute:1,hour:1,dom:1,month:1,dow:1}[f];
}
function validateField(f, val, bldmsg){
  var rng=fieldRange(f);
  var spec=String(val).trim();
  if(spec==='*'||spec==='?')return true;
  // step shorthand: */N (the builder's own step mode) - N must be >= 1
  var sm=spec.match(/^\*\/(\d+)$/);
  if(sm){ return parseInt(sm[1],10)>=1; }
  var bad=[];
  spec.split(',').forEach(function(part){
    part=part.trim();
    if(part===''){bad.push('empty item');return;}
    var m=part.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if(!m){bad.push('`'+part+'`');return;}
    var a=parseInt(m[1],10);
    var b=(m[2]!==undefined)?parseInt(m[2],10):a;
    if(a<rng[0]||a>rng[1])bad.push('`'+part+'` out of '+rng[0]+' - '+rng[1]);
    if(b<rng[0]||b>rng[1])bad.push('`'+part+'` out of '+rng[0]+' - '+rng[1]);
    if(b<a)bad.push('`'+part+'` range start > end');
    var step=(m[3]!==undefined)?parseInt(m[3],10):1;
    if(step<1)bad.push('`'+part+'` step < 1');
  });
  if(bad.length){
    if(bldmsg){ $('bldmsg').hidden=false; $('bldmsg').className='msg err'; $('bldmsg').textContent=fieldLabel(f)+': invalid - '+bad.slice(0,2).join(', '); }
    return false;
  }
  return true;
}

/* ---------- human description ---------- */
function descField(f, val){
  var rel={minute:'every minute',hour:'at minute 0',dom:'every day',month:'every month',dow:'every day of the week'};
  if(val==='*'||val==='?')return rel[f];
  var rng=fieldRange(f), stepMin=fieldStepMin(f);
  var parts=String(val).split(',');
  var out=[];
  parts.forEach(function(part){
    var m=part.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if(m){
      var a=parseInt(m[1],10), b=(m[2]!==undefined)?parseInt(m[2],10):a, st=(m[3]!==undefined)?parseInt(m[3],10):1;
      if(m[2]!==undefined) out.push((st>1?('every '+st+'th from '):'')+a+' to '+b);
      else if(m[3]!==undefined) out.push(((a===0||a===rng[0])?'':'')+'every '+st+' starting at '+a);
      else out.push(String(a));
    }
  });
  return out.join(', ');
}
function buildDesc(){
  var minute=current.minute, hour=current.hour, dom=current.dom, month=current.month, dow=current.dow;
  var dm=descField('minute',minute), dh=descField('hour',hour), dd=descField('dom',dom), dmo=descField('month',month), ddw=descField('dow',dow);

  var minutePhrase, hourPhrase, domPhrase, monthPhrase, dowPhrase;

  // minute
  if(minute==='*') minutePhrase='Every minute';
  else if(/^\d+$/.test(minute)) minutePhrase='At minute '+minute;
  else if(/^\*\//.test(minute)) minutePhrase='Every '+minute.split('/')[1]+' minutes';
  else if(/^\d+-\d+/.test(minute)) minutePhrase='During minutes '+minute;
  else minutePhrase='At minutes '+minute.replace(/,/g,', ');

  // hour
  if(hour==='*') hourPhrase='every hour';
  else if(/^\d+$/.test(hour)) hourPhrase='at '+pad(hour)+':00';
  else if(/^\*\//.test(hour)){ var hn=hour.split('/')[1]; hourPhrase='every '+hn+' hours'; }
  else if(/^\d+-\d+/.test(hour)) hourPhrase='during hours '+hour.replace(/,/g,', ');
  else hourPhrase='at hours '+hour.replace(/,/g,', ');
  // dom
  if(dom==='*') domPhrase='on every day of the month';
  else if(/^\d+$/.test(dom)) domPhrase='on the '+ordinal(dom)+' of the month';
  else if(/^(\d+)-(\d+)/.test(dom)) domPhrase='on days '+dom+' of the month';
  else if(/^\*\/\d+/.test(dom)) domPhrase='every '+dom.split('/')[1]+' days';
  else domPhrase='on days '+dom.replace(/,/g,', ');

  // month
  if(month==='*') monthPhrase='every month';
  else if(/^\d+$/.test(month)) monthPhrase='in '+monthName(parseInt(month,10));
  else if(/^\*\/\d+/.test(month)) monthPhrase='every '+month.split('/')[1]+' months';
  else if(/^\d+-\d+/.test(month)) monthPhrase='from '+monthName(parseInt(month.split('-')[0],10))+' through '+monthName(parseInt(month.split('-')[1],10));
  else monthPhrase='in months '+month.split(',').map(function(x){return monthName(parseInt(x,10));}).join(', ');

  // dow
  if(dow==='*') dowPhrase='on every day of the week';
  else if(/^\d+$/.test(dow)) dowPhrase='on '+dowName(parseInt(dow,10)===7?0:parseInt(dow,10))+'s';
  else if(/^\*\/\d+/.test(dow)) dowPhrase='every '+dow.split('/')[1]+' days of the week';
  else if(/^\d+-\d+/.test(dow)) dowPhrase='from '+dowName(parseInt(dow.split('-')[0],10)===7?0:parseInt(dow.split('-')[0],10))+' through '+dowName(parseInt(dow.split('-')[1],10)===7?0:parseInt(dow.split('-')[1],10));
  else dowPhrase='on '+dow.split(',').map(function(x){return dowName(parseInt(x,10)===7?0:parseInt(x,10))+'s';}).join(', ');

  var domRestricted=(dom!=='*'&&dom!=='?');
  var dowRestricted=(dow!=='*'&&dow!=='?')||(dow.indexOf(',')>-1)||(dow.indexOf('-')>-1);
  if(dow==='*')dowRestricted=false;
  var leading;
  if(minute==='0' && hour==='*') leading='At the top of every hour';
  else if(minute==='0') leading='At minute 0';
  else if(/^\d+$/.test(minute)) leading='At minute '+minute;
  else if(/^\*\//.test(minute)) leading='Every '+minute.split('/')[1]+' minutes';
  else leading=cap(minutePhrase);
  var html='';
  // When hour is *, "every hour" is already implied by the minute phrasing - don't double it.
  html+=leading+(hour==='*'?'':' '+hourPhrase);
  if(domRestricted||dowRestricted){
    html+=' - ';
    if(domRestricted)html+='on the '+domShort(dom)+' of the month';
    html+=(domRestricted&&dowRestricted)?' and ':'';
    if(dowRestricted)html+='on '+dowShort(dow);
    html+=', '+monthPhrase+'.';
  }else{
    html+=', '+domPhrase+', '+monthPhrase+', and '+dowPhrase+'.';
  }
  if(domRestricted&&dowRestricted){
    html+=' <span class="note">⚠ Day-of-month and day-of-week are <b>OR</b>’d in most cron implementations - the job runs if <i>either</i> matches, not both. Your host may differ; check the man page.</span>';
  }
  return html;
}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function pad(n){return (n<10?'0':'')+n;}
function ordinal(n){var s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
function domShort(dom){
  if(dom==='*')return 'every day';
  if(/^\d+$/.test(dom))return 'the '+ordinal(dom);
  return dom;
}
function dowShort(dow){
  if(dow==='*')return 'every weekday';
  if(/^\d+$/.test(dow))return dowName(parseInt(dow,10)===7?0:parseInt(dow,10))+'s';
  if(/-/.test(dow)){var p=dow.split('-');return dowName(parseInt(p[0],10)===7?0:parseInt(p[0],10))+'s through '+dowName(parseInt(p[1],10)===7?0:parseInt(p[1],10))+'s';}
  return dow;
}

/* ---------- next-run simulator (correct, capped, day-stepped) ---------- */
// Match a given Date against the cron fields. dOM/dOW use OR semantics (R2).
function dateMatches(d, spec){
  var mi=expandField(spec.minute,0,59);
  var hr=expandField(spec.hour,0,23);
  var mo=expandField(spec.month,1,12);
  var dom=(spec.dom==='?'||spec.dom==='*')?null:expandField(spec.dom,1,31);
  var dow=(spec.dow==='?'||spec.dow==='*')?null:expandField(spec.dow,0,7);

  if(mi.indexOf(d.getMinutes())<0)return false;
  if(hr.indexOf(d.getHours())<0)return false;
  if(mo.indexOf(d.getMonth()+1)<0)return false;

  if(dom!==null && dow!==null){
    // OR semantics: runs if EITHER the day-of-month OR the day-of-week matches
    var domOk=dom.indexOf(d.getDate())>=0;
    var dowOk=dowTest(spec.dow, (d.getDay()===0?7:d.getDay()));
    return domOk||dowOk;
  }
  if(dom!==null){ if(dom.indexOf(d.getDate())<0)return false; }
  if(dow!==null){ if(!dowTest(spec.dow,(d.getDay()===0?7:d.getDay())))return false; }
  return true;
}

// day-level match (month + dom/dow OR) - used to skip whole days fast
function dayMatches(d, spec){
  var mo=expandField(spec.month,1,12);
  if(mo.indexOf(d.getMonth()+1)<0)return false;
  var dom=(spec.dom==='?'||spec.dom==='*')?null:expandField(spec.dom,1,31);
  var dow=(spec.dow==='?'||spec.dow==='*')?null:expandField(spec.dow,0,7);
  if(dom===null && dow===null)return true;
  if(dom!==null && dow!==null){
    var domOk=dom.indexOf(d.getDate())>=0;
    var dowOk=dowTest(spec.dow,(d.getDay()===0?7:d.getDay()));
    return domOk||dowOk;
  }
  if(dom!==null)return dom.indexOf(d.getDate())>=0;
  return dowTest(spec.dow,(d.getDay()===0?7:d.getDay()));
}

function nextRuns(expr, count, fromDate, capYears){
  var spec=parseExpr(expr);
  count=count||6;
  capYears=capYears||3;
  var start=(fromDate instanceof Date)?new Date(fromDate.getTime()):new Date();
  start.setSeconds(0,0);
  var limit=new Date(start.getTime());
  limit.setFullYear(limit.getFullYear()+capYears);
  var results=[];
  var day=new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0,0);
  var guard=0, MAXDAYS=capYears*366+366; // hard safety cap on day iterations
  while(day.getTime()<=limit.getTime() && results.length<count && guard<MAXDAYS){
    if(dayMatches(day,spec)){
      // scan this day's minutes
      var startMin = (sameDay(day,start)) ? (start.getHours()*60+start.getMinutes()) : 0;
      for(var hm=startMin; hm<1440; hm++){
        var h=Math.floor(hm/60), mi=hm%60;
        var d=new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,mi,0,0);
        if(d.getTime()<=start.getTime())continue;  // strictly AFTER the reference time
        if(dateMatches(d,spec)){
          results.push(d);
          if(results.length>=count){ guard=MAXDAYS; break; }
        }
      }
    }
    day.setDate(day.getDate()+1);
    guard++;
  }
  var exhausted=(results.length<count);
  return {runs:results, limit:limit, exhausted:exhausted};
}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function parseExpr(expr){
  var p=String(expr).trim().split(/\s+/);
  return {minute:p[0]||'*',hour:p[1]||'*',dom:p[2]||'*',month:p[3]||'*',dow:p[4]||'*'};
}

/* ---------- WordPress panel ---------- */
function wpNoteHtml(){
  return 'WP-Cron is <b>not a daemon</b> - it fires on <b>page loads</b> (visits). So <code>*/5 * * * *</code> under WP-Cron means "roughly every 5 minutes <b>as long as the site gets traffic</b>". A quiet site can drift badly. The reliable fix is the host-cron recipe below (<span class="amber">DISABLE_WP_CRON</span> stops visit-triggered spawning).';
}
function hostCronHtml(){
  var expr=current.minute+' '+current.hour+' '+current.dom+' '+current.month+' '+current.dow;
  var site=gv('site')||'https://example.com';
  var path=gv('wpcron_path')||'/wp-cron.php';
  if(path.charAt(0)!=='/')path='/'+path;
  // wget variant
  var line1=expr+' wget -q -O - '+site+path+'?doing_wp_cron >/dev/null 2>&1';
  var line2=expr+' php /path/to/wp-cron.php';
  return '<code><b>'+expr+'</b></code> wget -q -O - '+esc(site+path)+'?doing_wp_cron &gt;/dev/null 2&gt;&amp;1\n'+expr+' php /path/to/wp-cron.php <span class="c"># from your web root</span>';
}
function wpMapHtml(){
  var rows=[
    ['Minute','how often it fires. <code>*/5</code> = every 5 minutes; <code>0</code> = on the hour.'],
    ['Hour','<code>0</code> = top of the hour. <code>0 0 * * *</code> = midnight. <code>*/12</code> = every 12 hours.'],
    ['Day of month','<code>1</code> = the 1st. <code>1</code> with Feb = may not fire in a 28-day month.'],
    ['Month','<code>1</code>=Jan, <code>12</code>=Dec. <code>*/3</code> = every 3rd month.'],
    ['Day of week','<code>0</code>=Sun, <code>1</code>=Mon … <code>6</code>=Sat, and <code>7</code>=Sun too.'],
  ];
  return rows.map(function(r){return '<span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span>';}).join('');
}
function disableWpCronHtml(){
  return '// stop visit-triggered WP-Cron - use the host cron above instead\n'+
         'define( \'DISABLE_WP_CRON\', true );';
}

/* ---------- render ---------- */
function gv(id){return $(id)?$(id).value.trim():'';}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function exprStr(){return current.minute+' '+current.hour+' '+current.dom+' '+current.month+' '+current.dow;}

function render(){
  // validate + show error
  $('bldmsg').hidden=true;
  var ok=true;
  ['minute','hour','dom','month','dow'].forEach(function(f){
    var v=current[f];
    if(!validateField(f,v,true))ok=false;
  });

  // expression badge
  ['minute','hour','dom','month','dow'].forEach(function(f){
    $(('v_'+f)).textContent=current[f];
    $(('v_'+f)).className='v';
  });

  // description
  $('desc').innerHTML=buildDesc();

  // timezone
  var tz='', off='';
  try{
    var d=new Date();
    tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown';
    var o=-d.getTimezoneOffset();
    off='UTC'+(o>=0?'+':'-')+pad(Math.floor(Math.abs(o)/60))+':'+pad(Math.abs(o)%60);
  }catch(e){ tz='(Intl unavailable)'; }
  $('tz').textContent='Runs shown in your device\'s local timezone: '+tz+' ('+off+'). Cron uses the SERVER timezone - a real WP gotcha.';

  // next runs
  var res=nextRuns(exprStr(),6);
  var runsHtml='';
  var now=new Date();
  for(var i=0;i<res.runs.length;i++){
    var r=res.runs[i];
    var rel=relTime(r,now);
    runsHtml+='<div class="r"><span class="i">'+(i+1)+'</span><span class="ts">'+fmtDT(r)+'</span><span class="rel">'+rel+'</span></div>';
  }
  $('runs').innerHTML=runsHtml;
  $('cap').hidden=!(res.exhausted);
  if(res.exhausted){
    $('cap').textContent='⚠ No run found within the next '+cap+' years after this start - check your day-of-month vs day-of-week (they are OR’d) and whether the month combo can ever line up.';
  }

  // WordPress panel
  $('wpnote').innerHTML=wpNoteHtml();
  $('hostcron').innerHTML=hostCronHtml();
  $('wpmap').innerHTML=wpMapHtml();
  $('disablewpcron').innerHTML=disableWpCronHtml();

  // OR-semantics note surfaced separately in desc already
}
function fmtDT(d){
  var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()]+' '+mon[d.getMonth()]+' '+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function relTime(d,now){
  var diff=d.getTime()-now.getTime();
  var min=Math.round(diff/60000);
  if(min<1)return 'now';
  if(min<60)return 'in '+min+'m';
  var hr=Math.floor(min/60);
  if(hr<24)return 'in '+hr+'h '+ (min%60)+'m';
  var dy=Math.floor(hr/24);
  return 'in '+dy+'d '+(hr%24)+'h';
}

/* ---------- copy / download ---------- */
function copyText(t,btn){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){flash(btn,'Copied ✓');},function(){fallbackCopy(t,btn);});
  }else fallbackCopy(t,btn);
}
function fallbackCopy(t,btn){
  var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);
  ta.focus();ta.select();
  try{document.execCommand('copy');flash(btn,'Copied ✓');}catch(e){flash(btn,'copy failed');}
  document.body.removeChild(ta);
}
function flash(b,s){var old=b.textContent;b.textContent=s;setTimeout(function(){b.textContent=old;},1400);}
function buildDownload(){
  var site=gv('site')||'https://example.com';
  var path=gv('wpcron_path')||'/wp-cron.php';
  if(path.charAt(0)!=='/')path='/'+path;
  var expr=exprStr();
  return '# cron for '+site+' - generated by cron·min (GWill), safe to re-run\n'+
         '# Expression: '+expr+'\n'+
         '# '+buildDesc().replace(/&[^;]+;/g,'')+'\n\n'+
         expr+' wget -q -O - '+site+path+'?doing_wp_cron >/dev/null 2>&1\n'+
         expr+' php /path/to/wp-cron.php\n'+
         '\n# wp-config.php:\n'+
         "# define( 'DISABLE_WP_CRON', true );  # stop visit-triggered WP-Cron\n";
}
function download(){
  var blob=new Blob([buildDownload()],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='cron.txt';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}

/* ---------- builder field rendering ---------- */
function buildFields(){
  var defs=[
    {f:'minute'},
    {f:'hour'},
    {f:'dom'},
    {f:'month'},
    {f:'dow'},
  ];
  var html='';
  defs.forEach(function(d,idx){
    var f=d.f;
    var unit={minute:'minutes', hour:'hours', dom:'days', month:'months', dow:'weeks'}[f];
    html+='<div class="frow" data-f="'+f+'">'
      +'<div class="flb"><span class="nm">'+fieldLabel(f)+'</span><span class="mg" id="rng_'+f+'">'+(fieldRange(f)[0]+' - '+fieldRange(f)[1])+'</span><span class="cur" id="cur_'+f+'">*</span></div>'
      +'<div class="fctl">'
      +'<select id="mode_'+f+'" aria-label="'+fieldLabel(f)+' mode">'
      +'<option value="star" '+(f==='minute'||f==='hour'||f==='dom'||f==='month'? 'selected':'')+'>Every ( * )</option>'
      +'<option value="step">Every N ( */N )</option>'
      +'<option value="list">Pick specific (1,3,5)</option>'
      +'<option value="range">A range (1-5)</option>'
      +'<option value="steprange">Stepped range (1-5/2)</option>'
      +((f==='dom'||f==='dow')?'<option value="q">Any ( ? )</option>':'')
      +'</select>'
      +'<input type="number" id="n_'+f+'" placeholder="every" min="1" hidden>'
      +'<input type="text" id="list_'+f+'" placeholder="e.g. 1,3,5" inputmode="numeric" hidden>'
      +'<input type="number" id="rng1_'+f+'" placeholder="from" hidden>'
      +'<input type="number" id="rng2_'+f+'" placeholder="to" hidden>'
      +'<input type="number" id="rngN_'+f+'" placeholder="step" hidden>'
      +'</div>'
      +'<div class="fexp" id="exp_'+f+'">'+fieldExplain(f)+'</div>'
      +'</div>';
  });
  $('fields').innerHTML=html;

  defs.forEach(function(d){
    var f=d.f;
    function modeChanged(){
      var mode=$( 'mode_'+f).value;
      hideAllInputs(f);
      $( 'n_'+f).hidden = (mode!=='step');
      $( 'list_'+f).hidden = (mode!=='list');
      $( 'rng1_'+f).hidden = (mode!=='range'&&mode!=='steprange');
      $( 'rng2_'+f).hidden = (mode!=='range'&&mode!=='steprange');
      $( 'rngN_'+f).hidden = (mode!=='steprange');
      recompute();
    }
    function hideAllInputs(f){
      ['n_'+f,'list_'+f,'rng1_'+f,'rng2_'+f,'rngN_'+f].forEach(function(id){$(id).hidden=true;});
    }
    $( 'mode_'+f).addEventListener('change',modeChanged);
    ['n_'+f,'list_'+f,'rng1_'+f,'rng2_'+f,'rngN_'+f].forEach(function(id){
      $(id).addEventListener('input',debounce(recompute,120));
    });
  });

  function recompute(){
    ['minute','hour','dom','month','dow'].forEach(function(f){
      var mode=$( 'mode_'+f).value;
      var v='*';
      if(mode==='star')v='*';
      else if(mode==='step'){ var n=$( 'n_'+f).value; v='*/'+(n||'1'); }
      else if(mode==='list'){ var l=$( 'list_'+f).value.trim(); v=(l||'*'); }
      else if(mode==='range'){ var a=$( 'rng1_'+f).value,b=$( 'rng2_'+f).value; v=(a!==''&&b!=='')?(a+'-'+b):'*'; }
      else if(mode==='steprange'){ var aa=$( 'rng1_'+f).value,bb=$( 'rng2_'+f).value,nn=$( 'rngN_'+f).value; v=(aa!==''&&bb!=='')?(aa+'-'+bb+'/'+(nn||'1')):'*'; }
      else if(mode==='q'){ v='?'; }
      current[f]=v;
      $( 'cur_'+f).textContent=v;
      $( 'cur_'+f).className='v'+(v!=='*'?' hl':'');
      // Keep the friendly explanation in sync with what's chosen, and note the
      // "every" shorthand so the value badge reads naturally.
      if($( 'exp_'+f)) $( 'exp_'+f).innerHTML=fieldExplain(f);
    });
    render();
  }
  recompute();
}

var _deb=[];
function debounce(fn,ms){ var t; return function(){ clearTimeout(t); t=setTimeout(fn,ms); }; }

/* ---------- events ---------- */
$('site').addEventListener('input',debounce(function(){render();},150));
$('wpcron_path').addEventListener('input',debounce(function(){render();},150));
$('copyExpr').addEventListener('click',function(){copyText(exprStr(),this);});
$('copyDesc').addEventListener('click',function(){copyText($('desc').textContent,this);});
$('copyHost').addEventListener('click',function(){copyText($('hostcron').textContent,this);});
$('dlBtn').addEventListener('click',download);

buildFields();
})();
