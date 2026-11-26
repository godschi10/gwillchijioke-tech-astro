
(function(){
'use strict';
function $(id){return document.getElementById(id);}
var inp=$('cfx-inp'), typeEl=$('cfx-type'), typeName=$('cfx-typename'), typeHint=$('cfx-typehint'),
    summaryEl=$('cfx-summary'), flagsEl=$('cfx-flags'), linesEl=$('cfx-lines'), results=$('cfx-results'),
    filterEl=$('cfx-filter');
var mode='auto'; // auto | apache | nginx

/* ---------- detection ---------- */
function detect(text){
  var n=text;
  var apacheScore=0, nginxScore=0;
  var apacheMarkers=[/RewriteEngine/,/<IfModule/,/Options\s+-Indexes/,/<FilesMatch/,/ErrorDocument/,/RewriteRule/,/Redirect\s+301/,/SetEnvIf/,/mod_rewrite/,/mod_headers/,/mod_expires/,/php_value/,/AddDefaultCharset/,/Deny\s+from/,/DirectoryIndex/];
  var nginxMarkers=[/\bserver\s*\{/,/^\s*location\s+/,/\broot\s+/,/fastcgi_pass/,/listen\s+(80|443)/,/proxy_pass/,/ssl_certificate/,/try_files/,/limit_req/,/auth_basic/,/gzip\s+on/,/server_name/,/add_header/,/server_tokens/,/charset\s+/];
  apacheMarkers.forEach(function(r){ if(r.test(n))apacheScore++; });
  nginxMarkers.forEach(function(r){ if(r.test(n))nginxScore++; });
  var t='apache';
  if(apacheScore!==nginxScore){ t = apacheScore>nginxScore?'apache':'nginx'; }
  else {
    // tie (incl. 0-0): pick the mode whose KB classifies more non-comment lines
    var ac=0, nc=0;
    text.split('\n').forEach(function(l){
      if(l.trim()===''||/^\s*#/.test(l))return;
      var a=classifyApache(l), n=classifyNginx(l);
      if(a && a.unknown) a=null;   // only count lines a KB actually recognises
      if(n && n.unknown) n=null;
      if(a)ac++; if(n)nc++;
    });
    if(ac||nc) t = nc>ac?'nginx':'apache';
    else t = 'apache'; // genuinely empty/opaque -> default Apache
  }
  return {apache:apacheScore, nginx:nginxScore, type:t};
}
function setMode(m){
  mode=m;
  ['cfx-auto','cfx-apache','cfx-nginx'].forEach(function(id){ $(id).className=''; });
  $(m==='auto'?'cfx-auto':(m==='apache'?'cfx-apache':'cfx-nginx')).className='cfx-on';
}
['cfx-auto','cfx-apache','cfx-nginx'].forEach(function(id){
  $(id).addEventListener('click',function(){ setMode(id==='cfx-auto'?'auto':(id==='cfx-apache'?'apache':'nginx')); if(inp.value.trim())analyze(); });
});

/* ---------- directive knowledge base ---------- */
/* Each entry: {regex, sev, sec, what}. Selections: sev = sec|beh|cos, sec = Security|Rewrites & redirects|Caching|Headers|Misc|Comment. */
var APACHE=[
/^#\s*(.*)$/, 'cos','Comment','This is a comment - it does nothing, just a note for humans.',
/^\s*Options\s+-Indexes\b/, 'sec','Security','turns OFF directory file listings - stops people browsing the folders on your site.','directory listing is off, so visitors can\'t browse the raw contents of your folders.',
/^\s*Options\s+[+-]?Indexes\b/i, 'sec','Security','turns ON directory file listings - visitors can browse and download whatever is in that folder.','this re-opens directory browsing; if a folder holds backups, configs or uploads, anyone can list and download them.',
/^\s*DirectoryIndex\b/, 'beh','Misc','sets the default file a directory serves (e.g. DirectoryIndex index.php).',
/^\s*ErrorDocument\s+(\d+)/, 'beh','Misc','shows a custom page when the server returns error {n} - e.g. a friendly 404 instead of the default.',
/^\s*RewriteEngine\s+On/, 'beh','Rewrites & redirects','turns on the rewrite engine (mod_rewrite) so the RewriteRule/RewriteCond lines below do anything.',
/^\s*RewriteEngine\s+Off/, 'beh','Rewrites & redirects','turns OFF the rewrite engine - URL rewriting here does nothing.',
/^\s*RewriteBase\b/, 'beh','Rewrites & redirects','sets the base path URL rewriting is relative to (common for WordPress in a subfolder).',
/^\s*RewriteCond\s+%\{HTTPS\}\s+off/, 'beh','Rewrites & redirects','matches when the request is NOT using HTTPS - the next RewriteRule runs for plain-http pages.',
/^\s*RewriteCond\s+%\{HTTP_REFERER\}/, 'sec','Rewrites & redirects','matches only requests whose Referer (the page the visitor came from) matches - used for hotlink protection.','a foreign site hotlinks your image when it references a file on YOUR server; because it never loads the page, the visitor is still served from your bandwidth',
/^\s*RewriteCond\b/, 'beh','Rewrites & redirects','a condition - the NEXT RewriteRule only runs if this matches (and any other conditions stack).',
/^\s*RewriteRule\s+.*\[.*R=301.*\]/, 'beh','Rewrites & redirects','is a 301 (permanent) redirect - search engines update their bookmarks to the new address.',
/^\s*RewriteRule\s+.*\[.*R=302.*\]/, 'beh','Rewrites & redirects','is a 302 (temporary) redirect - browsers go to the new page but search engines keep the old address.',
/^\s*RewriteRule\s+.*\[.*L.*\]/, 'beh','Rewrites & redirects','the [L] flag means “last rule” - stop processing further rewrite rules after this one.',
/^\s*RewriteRule\s+.*\[.*NC.*\]/, 'beh','Rewrites & redirects','the [NC] flag means case-insensitive - matches URLs regardless of uppercase/lowercase.',
/^\s*RewriteRule\s+.*\[.*OR.*\]/, 'beh','Rewrites & redirects','the [OR] flag inside RewriteCond chains means “or” - the condition passes if EITHER this or the next matches.',
/^\s*RewriteRule\b/, 'beh','Rewrites & redirects','rewrites a URL - maps the request URL to a new one (the heart of pretty permalinks and redirects).',
/^\s*Redirect\s+(301|302)\s+/, 'beh','Rewrites & redirects','is a simple redirect (mod_alias) - tells the server “this old path now lives here”. Unlike RewriteRule it can’t do complex matching, but it’s simpler.',
/^\s*<IfModule\s+mod_headers\.c>/, 'beh','Headers','opens a section that only applies if mod_headers is loaded - so the config never crashes on a host without it.',
/^\s*Header\s+set\s+(Cache-Control|X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security)/, 'beh','Headers','sets an HTTP response header - browsers read these to control caching and security behaviour.',
/^\s*Header\s+set\s+X-Frame-Options/, 'sec','Headers','tells browsers NOT to put this page inside someone else’s frame (clickjacking protection).','a malicious site can embed your page in a hidden frame and trick users into clicking your buttons',
/^\s*Header\s+set\s+X-Content-Type-Options/, 'sec','Headers','stops browsers from guessing the file type - a common sneaky-attack blocker.','servers that sniff types can be tricked into running a disguised script',
/^\s*Header\s+set\s+Strict-Transport-Security/, 'sec','Headers','forces the browser to always use HTTPS for your site (HSTS) - no more plain-http downgrades.','without it, a network attacker can quietly downgrade an https visit to http',
/^\s*Header\s+set\s+Cache-Control/, 'beh','Caching','sets how long browsers may cache files - shorter = fresher, longer = faster but stale.',
/^\s*Header\s+(set|append|unset|add)\b/, 'beh','Headers','adds/removes an HTTP response header.',
/^\s*<IfModule\s+mod_expires\.c>/, 'beh','Caching','opens a cache-expiry section only if mod_expires exists.',
/^\s*ExpiresActive\s+On/, 'beh','Caching','turns on browser caching rules (via mod_expires).',
/^\s*ExpiresByType\s+(\S+)/, 'beh','Caching','tells browsers how long to cache files of type {n} - e.g. images for a month, so repeat visits load fast.',
/^\s*<FilesMatch\s+"?wp-config/, 'sec','Security','blocks ALL direct web access to wp-config.php - the file holding your DB password.','if a plugin or misconfig exposes it, anyone fetching that URL gets your database password',
/^\s*<FilesMatch\s+"?\.htaccess/, 'sec','Security','blocks direct web access to your .htaccess file itself.','.htaccess can contain sensitive rules; serving it leaks your config',
/^\s*<FilesMatch\s+"?\.env/, 'sec','Security','blocks direct web access to a .env file - a common place for API keys.','a leaked .env hands over secrets',
/^\s*<FilesMatch\b/, 'sec','Security','opens a file-matching rule - applies the next directive(s) only to files matching the pattern.',
/^\s*Require\s+all\s+denied/, 'sec','Security','denies access to everyone (Apache 2.4) - used inside <FilesMatch>/<Directory> to lock files away.',
/^\s*Require\s+all\s+granted/, 'sec','Security','allows access to everyone - careful, this can expose what you meant to hide.',
/^\s*Order\s+(allow,deny|deny,allow)/, 'sec','Security','Apache 2.2 access order - legacy; superseded by Require in 2.4.',
/^\s*Deny\s+from\s+all/, 'sec','Security','denies access to everyone (Apache 2.2 style).',
/^\s*Allow\s+from\b/, 'sec','Security','allows access from a set of IPs/hosts.',
/^\s*SetEnvIf\b/, 'beh','Misc','sets an environment variable based on request characteristics (often used to skip caching for logged-in users).',
/^\s*php_value\s+(\S+)/, 'beh','Misc','sets a PHP setting via Apache - e.g. php_value upload_max_filesize 64M.',
/^\s*php_flag\s+(\S+)/, 'beh','Misc','toggles a PHP flag via Apache - e.g. php_flag display_errors Off.',
/^\s*AddType\b/, 'beh','Misc','maps a file extension to a MIME type (tells the server how to serve a file).',
/^\s*AddDefaultCharset\b/, 'beh','Misc','sets the default character encoding sent with responses.',
/^\s*SetOutputFilter\s+DEFLATE/, 'beh','Caching','compresses the output (mod_deflate) before sending - smaller pages, faster loads.',
  /^\s*<\//,'beh','Misc','closes a directive block - the rules inside it no longer apply from here.',
  /^\s*</,'beh','Misc','opens a directive block - the lines until the matching close apply only inside it.'
];
var NGINX=[
/^#\s*(.*)$/, 'cos','Comment','This is a comment - it does nothing, just a note for humans.',
/^\s*server\s*\{/, 'beh','Misc','opens a server block - the set of rules for one virtual host (one site/domain).',
/^\s*listen\s+80/, 'beh','Rewrites & redirects','listens on port 80 (plain HTTP).',
/^\s*listen\s+443\s+ssl/, 'sec','Headers','listens on port 443 (HTTPS) - combined with an SSL certificate this serves encrypted traffic.','plain HTTP lets anyone read what visitors send - this enables encrypted HTTPS for the whole site.',
/^\s*listen\s+443\s+ssl\s+http2/, 'beh','Headers','serves HTTPS over HTTP/2 - faster and more efficient than HTTP/1.1 (and now HTTP/3 where available).',
/^\s*server_name\b/, 'beh','Misc','the domain(s) this server block answers for.',
/^\s*return\s+301\s+https:/, 'beh','Rewrites & redirects','301-redirects everything to HTTPS - a permanent move, so search engines update.','plain-http is insecure; this makes the whole site use encrypted HTTPS',
/^\s*return\s+301\b/, 'beh','Rewrites & redirects','is a permanent 301 redirect (browsers and search engines remember the new URL).',
/^\s*return\s+302\b/, 'beh','Rewrites & redirects','is a temporary 302 redirect (used for short-term moves).',
/^\s*return\s+(301|302|308|307)\b/, 'beh','Rewrites & redirects','redirects to a new location.',
/^\s*root\b/, 'beh','Misc','the filesystem folder that serves as this site’s document root.',
/^\s*index\b/, 'beh','Misc','which file(s) to serve when the URL points at a directory (e.g. index.php, index.html).',
/^\s*try_files\s+\$uri\s+\$uri\/\s+\/index\.php/, 'beh','Rewrites & redirects','the WordPress permalink rule - tries the real file/folder, and if not found hands the request to index.php so WordPress can route it.','without it, pretty permalinks return 404',
/^\s*try_files\b/, 'beh','Rewrites & redirects','tries a series of paths in order and uses the first that exists.',
/^\s*location\s+=\s*/, 'beh','Misc','an EXACT-match location - only the precise URL matches, nothing else.',
/^\s*location\s+~\s*\*?\s*\\?\.php/, 'beh','Misc','a REGEX location matching .php files - Nginx checks these after prefix locations and serves the .php through PHP.',
/^\s*location\s+~\s*/, 'beh','Misc','a REGEX location (matches the URL with a pattern). Nginx checks prefix locations first, then the first matching regex.',
/^\s*location\s+/, 'beh','Misc','a location block - routes URLs that match this path (or pattern) to a specific handler.',
/^\s*fastcgi_pass\b/, 'beh','Rewrites & redirects','forwards PHP requests to PHP-FPM (via a socket or port) - this is how Nginx runs PHP.',
/^\s*fastcgi_param\s+SCRIPT_FILENAME/, 'beh','Rewrites & redirects','tells PHP-FPM which file to execute - missing this is the classic cause of a blank page or 502.',
/^\s*include\s+fastcgi_params/, 'beh','Misc','imports the standard FastCGI parameter set (a shortcut so you don’t write them all).',
/^\s*include\b/, 'beh','Misc','imports another config file into this one (like a #include).',
/^\s*proxy_pass\b/, 'beh','Rewrites & redirects','forwards the request to another app/server (a reverse proxy) - e.g. to Node, or another container.',
/^\s*proxy_set_header\b/, 'beh','Headers','sets a header sent to the proxied app - e.g. proxy_set_header Host $host so it knows the real hostname.',
/^\s*ssl_certificate\b/, 'sec','Headers','the path to your SSL certificate file - proves your https identity.','a mismatched/missing cert means browsers show a scary security error',
/^\s*ssl_certificate_key\b/, 'sec','Headers','the private key that pairs with the certificate - keeps your encryption secure.','the key must stay private; if it leaks, your https is broken',
/^\s*ssl_protocols\b/, 'sec','Headers','restricts which TLS versions are allowed - modern configs allow only TLSv1.2 and TLSv1.3.', 'older TLS versions have known weaknesses',
/^\s*add_header\s+Strict-Transport-Security/, 'sec','Headers','tells browsers to always use HTTPS for your site (HSTS).','blocks a downgrade-to-http attack',
/^\s*add_header\s+X-Frame-Options/, 'sec','Headers','stops your page being framed by another site (clickjacking protection).',
/^\s*add_header\s+X-Content-Type-Options/, 'sec','Headers','stops browsers guessing the content type - a common sneaky-attack blocker.',
/^\s*add_header\s+Cache-Control/, 'beh','Caching','sets how long browsers cache responses.',
/^\s*add_header\b/, 'beh','Headers','adds a custom HTTP response header.',
/^\s*gzip\s+on\b/, 'beh','Caching','compresses responses before sending (gzip) - smaller pages, faster loads.',
/^\s*gzip_types\b/, 'beh','Caching','lists the file types that get compressed by gzip.',
/^\s*client_max_body_size\b/, 'beh','Misc','the maximum upload size Nginx accepts (server-side). PHP also has its own upload limits.',
/^\s*expires\s+/, 'beh','Caching','sets browser caching for that location - e.g. expires 1d = cache static files for a day.',
/^\s*deny\s+all\b/, 'sec','Security','denies access to everyone for this location.',
/^\s*allow\s+\d/, 'sec','Security','allows access from a specific IP/range.',
/^\s*limit_req_zone\b/, 'beh','Misc','defines a rate-limit bucket (in http{}) - a named limit you then apply with limit_req.',
/^\s*limit_req\b/, 'sec','Security','rate-limits requests to this location - e.g. limits /wp-admin/ to stop login brute-forcing.','a brute-force attack tries thousands of passwords; rate-limiting slows it to a crawl',
/^\s*auth_basic\b/, 'sec','Security','asks for a username/password (HTTP Basic auth) before allowing access - a simple password gate.',
/^\s*server_tokens\s+off/, 'sec','Headers','hides the Nginx version number in responses.','leaking the version helps attackers target known exploits',
/^\s*charset\s+/, 'beh','Misc','sets the charset sent with responses (e.g. charset utf-8).',
/^\s*<\//,'beh','Misc','closes a block - the rules inside it no longer apply from here.',
/^\s*\}/,'beh','Misc','closes the block - the rules inside it no longer apply from here.',
/^\s*</,'beh','Misc','opens a block - the lines until the matching close apply only inside it.'
];

/* Build a clean index from the flat KB: each entry is [regex, sev, sec, what(, why?)].
   We walk by "a RegExp starts a new entry", collecting the strings that follow, so
   a redundant 5th field never misaligns the lookup. */
function kbIndex(arr){
  var out=[];
  for(var i=0;i<arr.length;){
    var re=arr[i];
    var j=i+1, f=[];
    while(j<arr.length && typeof arr[j]==='string'){ f.push(arr[j]); j++; }
    out.push({re:re, sev:f[0], sec:f[1], what:f[2], why:f[3]||null});
    i=j;
  }
  return out;
}
var APACHE_KB=kbIndex(APACHE);
var NGINX_KB=kbIndex(NGINX);

function classifyApache(line){
  var t=line.trim(); if(t==='')return null;
  if(t.charAt(0)==='#')return commentEntry();
  for(var i=0;i<APACHE_KB.length;i++){ if(APACHE_KB[i].re.test(line))return APACHE_KB[i]; }
  return unknown(line);
}
function classifyNginx(line){
  var t=line.trim(); if(t==='')return null;
  if(t.charAt(0)==='#')return commentEntry();
  for(var i=0;i<NGINX_KB.length;i++){ if(NGINX_KB[i].re.test(line))return NGINX_KB[i]; }
  return unknown(line);
}
function commentEntry(){ return {sev:'cos', sec:'Comment', what:'This is a comment - it does nothing, just a note for humans.'}; }
function unknown(line){
  return {sev:'cos', sec:'Misc', what:'Not recognised - likely fine but check the docs.', unknown:true};
}

/* ---------- summariser + analysis ---------- */
function analyze(){
  var text=inp.value;
  if(!text.trim()){ results.hidden=true; return; }
  var d=detect(text);
  var chosen=mode==='auto'?d.type:mode;
  if(mode==='auto'){
    typeEl.hidden=false; typeName.textContent=(chosen==='apache'?'Apache .htaccess':'Nginx server block');
    typeHint.textContent='looks like '+(chosen==='apache'?'Apache':'Nginx')+' - switch if wrong';
  } else {
    typeEl.hidden=false; typeName.textContent=(chosen==='apache'?'Apache .htaccess':'Nginx server block');
    typeHint.textContent='';
  }
  var lines=text.split(/\r?\n/);
  var items=[];
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    if(l.trim()==='')continue;
    var cls=(chosen==='apache')?classifyApache(l):classifyNginx(l);
    items.push({line:l, num:i+1, sev:cls.sev, sec:cls.sec, what:cls.what, why:(cls.why||whyFor(chosen,cls,l)), unknown:cls.unknown});
  }

  // group by section, preserve order
  var secOrder=['Security','Rewrites & redirects','Caching','Headers','Comment','Misc'];
  var groups={};
  items.forEach(function(it){ (groups[it.sec]=groups[it.sec]||[]).push(it); });
  // build line-by-line html, grouped
  var html='';
  secOrder.forEach(function(sec){
    var arr=groups[sec]; if(!arr||!arr.length)return;
    html+='<div class="cfx-group"><div class="cfx-ghead"><span class="cfx-gname">'+esc(sec)+'</span><span class="cfx-gcount">'+arr.length+'</span><span class="cfx-gline"></span></div>';
    arr.forEach(function(it){ html+=itemHtml(it); });
    html+='</div>';
  });
  var unknownArr=groups['Misc']?groups['Misc'].filter(function(x){return x.unknown;}):[];
  linesEl.innerHTML=html;

  // summary bullets
  var bullets=[];
  items.forEach(function(it){
    if(it.sec==='Comment')return;
    if(it.sec==='Security' && /denied|wp-config|deny/.test(it.line.toLowerCase())) return;
    var b=bulletFor(it); if(b)bullets.push(b);
  });
  // dedupe + cap
  bullets=dedupe(bullets).slice(0,5);
  summaryEl.innerHTML='<span class="cfx-title">What this config is doing</span><ul>'+bullets.map(function(b){return '<li>'+b+'</li>';}).join('')+'</ul>';

  // red flags
  var reds=items.filter(function(it){return it.sev==='sec';});
  if(reds.length){
    flagsEl.innerHTML='<div class="cfx-flags">'+reds.map(function(it){
      return '<div class="cfx-flag"><span class="cfx-fr">&#9888;</span><span><b>'+esc(shortCode(it.line))+'</b> - '+esc(it.what)+'</span></div>';
    }).join('')+'</div>';
  } else {
    flagsEl.innerHTML='<p class="cfx-ok">No security-critical directives found.</p>';
  }
  results.hidden=false;
}
function whyFor(chosen, cls, line){
  // return the inline "why" when the KB has a why for this line; else null
  var t=line.trim();
  if(/X-Frame-Options/.test(t))return 'a malicious site can frame your page and trick users into clicking your buttons - this blocks that (clickjacking).';
  if(/Strict-Transport/.test(t))return 'without it, a network attacker can quietly downgrade an https visit to plain http and read/modify it.';
  if(/X-Content-Type-Options/.test(t))return 'servers that guess the type can be tricked into executing a disguised script.';
  if(/wp-config/.test(t))return 'that file holds your database password; direct web access would hand it to anyone who fetches the URL.';
  if(/HTTP_REFERER/.test(t))return 'hotlinking makes a foreign site load YOUR images and use YOUR bandwidth without ever serving your page.';
  if(/limit_req/.test(t))return 'brute-force login attacks try thousands of passwords; rate-limiting slows them to a crawl.';
  if(/\.env/.test(t))return 'a .env file is where API keys live; exposing it hands over your secrets.';
  if(/deny all/.test(t))return 'deny all means nobody reaches this - make sure that is what you intend, then whitelist what you need.';
  return null;
}
function bulletFor(it){
  var t=it.line.toLowerCase();
  if(/https/.test(it.line) && /return 301|RewriteRule/.test(it.line) && /R=301|301 https/.test(it.line))return 'Forces HTTPS on everything';
  if(/-Indexes/.test(it.line))return 'Blocks directory listing';
  if(/wp-config/.test(it.line))return 'Protects wp-config.php';
  if(/try_files/.test(it.line)||/index\.php/.test(it.line))return 'Serves a WordPress site via pretty permalinks';
  if(/fastcgi_pass/.test(it.line))return 'Serves PHP via PHP-FPM';
  if(/Cache-Control/.test(it.line)||/expires/.test(it.line)||/gzip/.test(it.line))return 'Caches/compresses static files to speed up loads';
  if(/hotlink|HTTP_REFERER/.test(it.line))return 'Blocks hotlinking';
  if(/limit_req/.test(it.line))return 'Rate-limits to slow brute-force attempts';
  if(/X-Frame-Options/.test(it.line))return 'Adds clickjacking protection';
  if(/HSTS|Strict-Transport/.test(it.line))return 'Forces HTTPS via HSTS';
  return null;
}
function dedupe(arr){var s={},o=[];arr.forEach(function(x){if(x&&!s[x]){s[x]=1;o.push(x);}});return o;}
function shortCode(l){return l.trim().replace(/\s+/g,' ').slice(0,42);}

function itemHtml(it){
  var sevc=it.sev==='sec'?'cfx-sev-sec':(it.sev==='beh'?'cfx-sev-beh':'cfx-sev-cos');
  var imp=it.sev==='sec'?'&#128308;':(it.sev==='beh'?'&#128992;':'&#128993;');
  var code=highlight(it.line);
  var why=it.why?'<div class="cfx-why">'+esc(it.why)+'</div>':'';
  return '<details class="cfx-item '+sevc+'" open><summary><span class="cfx-imp">'+imp+'</span><span class="cfx-code">'+code+'</span></summary>'
    +'<div class="cfx-body"><div class="cfx-what"><b>What it does:</b> '+esc(it.what)+'</div>'+why+'</div></details>';
}
function highlight(line){
  // highlight the directive keyword + common flags
  var t=esc(line.trim());
  t=t.replace(/(RewriteRule|RewriteCond|RewriteEngine|Redirect|Location|location|server|fastcgi_pass|try_files|add_header|ExpiresByType|Header|Require|Deny|Options|FilesMatch|limit_req|proxy_pass|root|index|listen|server_name|ssl_certificate|gzip|return)/g,'<span class="cfx-f">$1</span>');
  t=t.replace(/(R=301|R=302|\[L\]|\[NC\]|\[OR\]|\[L,R=301\]|\[NC,L\]|service_healthy)/g,'<span class="cfx-k">$1</span>');
  // highlight vars
  t=t.replace(/(%\{(?:HTTP_REFERER|HTTPS|HTTP_HOST|REQUEST_URI|REQUEST_FILENAME)\}|\$(?:host|request_uri|args|uri|document_root|fastcgi_script_name))/g,'<span class="cfx-k">$1</span>');
  return t;
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

/* ---------- filter ---------- */
filterEl.addEventListener('input',function(){
  var q=filterEl.value.trim().toLowerCase();
  linesEl.querySelectorAll('details.cfx-item').forEach(function(d){
    var txt=d.textContent.toLowerCase();
    d.style.display=(!q||txt.indexOf(q)>=0)?'':'none';
  });
});

/* ---------- copy / download ---------- */
function fullText(){
  return '## Config explanation (cfg·read)\n\n'+summaryEl.innerText+'\n\n'+linesEl.innerText;
}
function copyText(t,btn){
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){flash(btn,'Copied');},function(){fallback(t,btn);}); }else fallback(t,btn);
}
function fallback(t,btn){var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');flash(btn,'Copied');}catch(e){flash(btn,'copy failed');}document.body.removeChild(ta);}
function flash(b,s){var o=b.textContent;b.textContent=s;setTimeout(function(){b.textContent=o;},1300);}
$('cfx-copy').addEventListener('click',function(){ copyText(fullText(),this); });
$('cfx-dl').addEventListener('click',function(){
  var blob=new Blob([fullText()+'\n'],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='config-explained.md';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
});

/* ---------- events ---------- */
$('cfx-go').addEventListener('click',analyze);
inp.addEventListener('input',function(){ if(inp.value.trim()){ /* no auto; explicit button keeps it deterministic */ } });
$('cfx-file').addEventListener('change',function(){
  var f=$('cfx-file').files&&$('cfx-file').files[0]; if(!f)return;
  $('cfx-filemsg').textContent=f.name+' ('+f.size+' bytes)';
  var rd=new FileReader(); rd.onload=function(){ inp.value=rd.result; analyze(); }; rd.readAsText(f);
});

/* sample: pre-load the Apache example so the tool reads well on open */
inp.value='RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\nOptions -Indexes\n<FilesMatch "wp-config\\.php">\nRequire all denied\n</FilesMatch>';
analyze();
})();
