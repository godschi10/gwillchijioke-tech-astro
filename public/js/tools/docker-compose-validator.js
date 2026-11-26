
(function(){
'use strict';
function $(id){return document.getElementById(id);}
var ed=$('ed'), edstat=$('edstat'), report=$('report'), summary=$('summary'),
    runBtn=$('runBtn'), clearBtn=$('clearBtn'), copyBtn=$('copyBtn'), dlBtn=$('dlBtn'), fileInput=$('fileInput'), fileLabel=$('fileLabel');
var lastYaml='', lastReport='';

/* ============================================================ */
/*  PRESETS                                                      */
/* ============================================================ */
var PRESETS={
  wp_mysql:
`# WordPress + MySQL - the simplest working stack.
# MySQL gets a healthcheck; WordPress waits for it with depends_on:condition.
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp
      MYSQL_PASSWORD: wppass
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 10s
      timeout: 5s
      retries: 5
  wordpress:
    image: wordpress:php8.2-apache
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: wppass
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
volumes:
  db_data:
  wp_data:
`,
  wp_nginx_redis:
`# WordPress + NGINX + Redis - the classic stack, done right.
# db healthcheck + depends_on:condition:service_healthy = correct ordering.
# Redis gets an appendonly volume so it survives restarts.
services:
  db:
    image: mariadb:11
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: rootpass
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wp
      MARIADB_PASSWORD: wppass
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5
  wordpress:
    image: wordpress:php8.2-fpm
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: wppass
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    depends_on:
      wordpress:
        condition: service_started
    ports:
      - "80:80"
    volumes:
      - wp_data:/var/www/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
volumes:
  db_data:
  wp_data:
  redis_data:
`,
  web_db_cache:
`# web + db + cache - a generic three-tier starter.
services:
  web:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      api:
        condition: service_started
  api:
    build: ./app
    restart: unless-stopped
    environment:
      DB_HOST: db
      DB_NAME: app
      DB_USER: app
      DB_PASSWORD: app
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 10s
      timeout: 5s
      retries: 5
  cache:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - cache_data:/data
volumes:
  db_data:
  cache_data:
`
};

/* ============================================================ */
/*  LINE + INDENTATION ANALYSIS                                 */
/* ============================================================ */
// Returns {ok, lines:[{n,text,indent,tabs,content,isBlank,isComment}], error}
function analyzeLines(text){
  var raw=text.split(/\r?\n/);
  var lines=[];
  var tabLines=[];
  var indentByLevel={}; // map: depth marker -> how many spaces used first time
  var issues=[];
  for(var i=0;i<raw.length;i++){
    var l=raw[i];
    var hasTab=/\t/.test(l);
    var m=l.match(/^[ \t]*/);
    var ws=m[0];
    var indent=0;
    for(var j=0;j<ws.length;j++){ if(ws[j]===' ')indent++; }
    var content=l.replace(/^[ \t]+/,'');
    var isBlank=(content.trim()==='');
    var isComment=(!isBlank && content.charAt(0)==='#');
    lines.push({n:i+1,text:l,indent:indent,hasTab:hasTab,content:content,isBlank:isBlank,isComment:isComment});
    if(hasTab){ issues.push({sev:'err',line:i+1,msg:'YAML forbids tabs; use 2 spaces (the Compose convention).',fix:'Replace the tab at line '+i+1+' with 2 spaces.'}); }
  }
  // Indentation consistency among sibling content lines: the leading whitespace of
  // consecutive non-blank, non-comment lines at the same structural depth should be uniform.
  // Heuristic: detect a content line whose indent differs by exactly 1 space from its
  // previous content line's indent (a classic accidental one-space slip), or a child
  // block indented MORE than 2 but its parent used a different style.
  var prevContent=null;
  for(var k=0;k<lines.length;k++){
    var L=lines[k];
    if(L.isBlank||L.isComment)continue;
    if(prevContent){
      var diff=L.indent-prevContent.indent;
      if(diff>0 && diff<2){
        issues.push({sev:'warn',line:L.n,msg:'Indentation looks inconsistent - line '+L.n+' is indented '+(L.indent-prevContent.indent)+' space from line '+prevContent.n+'. Compose blocks are indented by 2 spaces.',fix:'Indent line '+L.n+' by 2 spaces to align with its block.'});
      }
    }
    prevContent=L;
  }
  return {issues:issues, lines:lines};
}

// Detect a clearly-wrong base indent: if the first service child (a key at depth 2)
// doesn't align with its siblings, report. Handled by the parser below instead.

/* ============================================================ */
/*  TOLERANT COMPOSE PARSER                                     */
/*  Builds a block tree from indentation, tolerating indent errors */
/* ============================================================ */
function parseTolerant(lines){
  // We parse into a tree of {indent, key, value, line, children:[]}
  // Each non-blank, non-comment line is a node; its indent determines parentage.
  // Lines starting with "- " are list items.
  var nodes=[];
  var prevIndent=-1;
  for(var i=0;i<lines.length;i++){
    var L=lines[i];
    if(L.isBlank||L.isComment)continue;
    var content=L.content;
    if(content.charAt(0)==='#')continue;
    nodes.push({indent:L.indent, content:content, line:L.n});
  }
  // Build tree: node is child of the nearest previous node with SMALLER indent.
  var root={indent:-1,children:[]};
  var stack=[root];
  nodes.forEach(function(nd){
    while(stack.length>1 && stack[stack.length-1].indent>=nd.indent){ stack.pop(); }
    var parent=stack[stack.length-1];
    parent.children=parent.children||[];
    parent.children.push(nd);
    stack.push(nd);
  });
  return root;
}

// Convert parsed tree into a keyed structure (services, volumes,...) for checks.
function treeToMap(children){
  // children: list of nodes. Each node {indent,content,line,children}
  // content may be "key:", "key: value", "- item", "  - item"
  var map={};
  children.forEach(function(nd){
    var cm=nd.content.match(/^([^:]+):\s*(.*)$/);
    if(cm){
      var key=cm[1].trim(), val=cm[2].trim();
      map[key]={line:nd.line, value:val, children:nd.children||[], list:null};
      // detect if value is a list (its children are "- " items)
      if(nd.children&&nd.children.length){
        var hasDash=nd.children.some(function(c){return /^-\s/.test(c.content);});
        if(hasDash){ map[key].list=nd.children.filter(function(c){return /^-\s/.test(c.content);}).map(function(c){return {line:c.line,item:c.content.replace(/^-\s*/,'').trim(),children:c.children||[]};}); }
      }
    }else{
      // top-level scalar or list
      var dm=/^-\s*(.*)$/.exec(nd.content);
      if(dm){ map['__list_'+nd.line]={line:nd.line,value:dm[1],children:nd.children||[]}; }
    }
  });
  return map;
}

/* ============================================================ */
/*  CHECKS                                                       */
/* ============================================================ */
function checks(srcText, analysis){
  var issues=analysis.issues.slice(); // includes tabs + indentation slips
  var root=parseTolerant(analysis.lines);
  var top=treeToMap(root.children);

  // top-level keys
  var knownTop=['version','services','volumes','networks','configs','secrets','x-'];
  var topKeys=Object.keys(top);
  var hasServices=(top.services!==undefined);

  if(!hasServices){
    issues.push({sev:'err',line:1,msg:'No `services:` block found - Compose requires at least one service.',fix:'Add a `services:` map with at least one service key.'});
  }else{
    // services must be a map; each child a service object
    var svcNodes=treeToMap(root.children).services;
    // find the services node in the tree again for its children
    var servicesNode=null;
    (function walk(n){ Object.keys(n).forEach(function(k){ if(k==='services'&&n[k].children){ servicesNode=n[k]; } }); })(top);
    var servicesRaw=(top.services.children||[]);
    // unknown top-level keys
    Object.keys(top).forEach(function(k){
      var isX=k.indexOf('x-')===0;
      if(knownTop.indexOf(k)<0 && !isX && k.indexOf('__list_')!==0){
        issues.push({sev:'warn',line:top[k].line,msg:'Unknown top-level key `'+k+'` - Compose doesn’t recognise it (typo?).',fix:'Check the spelling; it should be one of: version, services, volumes, networks, configs, secrets.'});
      }
    });
    // version obsolete
    if(top.version){
      var v=(top.version.value||'').replace(/['"]/g,'');
      issues.push({sev:'warn',line:top.version.line,msg:'`version: "'+v+'"` is obsolete - Docker Compose v2 ignores it and the modern spec dropped it.',fix:'Remove the `version:` line (it’s optional and ignored).'});
    }

    // each service
    servicesRaw.forEach(function(svcNode){
      var svcName=svcNode.content.replace(/:\s*$/,'').trim();
      var svc=treeToMap(svcNode.children||[]);
      // image vs build
      if(svc.image){
        var im=(svc.image.value||'');
        var imLine=svc.image.line;
        if(im && im.indexOf(':')<0){
          issues.push({sev:'warn',line:imLine,msg:'`image: '+im+'` has no tag - it defaults to `latest`, which can break updates.',fix:'Pin a tag, e.g. `image: '+im+':1.27-alpine`.'});
        }
      }
      if(svc.build && typeof svc.build==='object'){
        var bv=svc.build;
        if((bv.value||'')==='' && (!bv.children||!bv.children.length)){
          issues.push({sev:'info',line:bv.line,msg:'`build:` is empty - a build step needs a context/path.',fix:'Give it a path string (e.g. `build: ./app`) or a map with `context:`.'});
        }
        if(bv.children){
          var bctx=bv.children.find(function(c){return /^context:/.test(c.content);});
          if(!bctx){ issues.push({sev:'warn',line:bv.line,msg:'`build:` has no `context` - Docker won’t know what to build.',fix:'Add `context: ./path` (and an optional `dockerfile:`).'}); }
        }
      }
      // ports shape
      if(svc.ports){
        if(!svc.ports.list){
          issues.push({sev:'err',line:svc.ports.line,msg:'`ports:` must be a list (e.g. `- "8080:80"`).',fix:'Put each mapping on its own `- "host:container"` line.'});
        }else{
          svc.ports.list.forEach(function(p){
            var it=p.item;
            if(/^"\d+:\d+"$/.test(it)||/^\d+:\d+$/.test(it)){ /* ok */ }
            else if(/^\d+$/.test(it)){
              issues.push({sev:'err',line:p.line,msg:'`- '+it+'` is a bare port number - Compose needs a `host:container` mapping.',fix:'Write `- "'+it+':80"` (host:container).'});
            }else if(/^\d+-\d+:\d+$/.test(it)){
              issues.push({sev:'info',line:p.line,msg:'Port range `'+it+'` maps multiple ports - make sure that’s intended.',fix:'If intended, keep it; otherwise use a single `host:container` pair.'});
            }else{
              issues.push({sev:'info',line:p.line,msg:'Port mapping `'+it+'` - check the `host:container` shape.',fix:'Use `- "8080:80"` or the long-form syntax.'});
            }
          });
        }
      }
      // environment shape
      if(svc.environment){
        var envLine=svc.environment.line;
        var envChildren=(svc.environment.children||[]);
        var isList=envChildren.some(function(c){return /^-\s/.test(c.content);});
        if(isList){
          envChildren.filter(function(c){return /^-\s/.test(c.content);}).forEach(function(c){
            var item=c.content.replace(/^-\s*/,'').trim();
            if(item.indexOf('=')<0){
              issues.push({sev:'warn',line:c.line,msg:'Environment list item `'+item+'` has no `=` - should be `KEY=value`.',fix:'Write `- KEY=value`.'});
            }
          });
        }else if(envChildren.length){
          envChildren.forEach(function(c){
            if(!/^[^:]+:\s*/.test(c.content)){ /* fine - map form */ }
          });
        }
      }
      // depends_on shape + healthchecks of referenced services
      if(svc.depends_on){
        var depLine=svc.depends_on.line;
        var isList=svc.depends_on.list || (svc.depends_on.children&&svc.depends_on.children.some(function(c){return /^-\s/.test(c.content);}));
        if(isList){
          // plain list form
          issues.push({sev:'warn',line:depLine,msg:'`depends_on` uses the plain list form - the container starts but waits for nothing.',fix:'Use the long form: `depends_on: { db: { condition: service_healthy } }` so ordering is honoured.'});
        }
      }
      // healthcheck presence for db-like services
      if(/db|mariadb|mysql|postgres/i.test(svcName)||((svc.image&&/mysql|mariadb|postgres/i.test(svc.image.value)))){
        if(!svc.healthcheck){
          issues.push({sev:'warn',line:svcNode.line,msg:'Database service `'+svcName+'` has no healthcheck - downstream services may start before it’s ready.',fix:'Add a healthcheck (e.g. mysqladmin ping / pg_isready) and reference it with `depends_on: condition: service_healthy`.'});
        }
        if(/mysql|mariadb/i.test(svcName)||(svc.image&&/mysql|mariadb/i.test((svc.image.value||'')))){
          var envStr=JSON.stringify(svc.environment&&svc.environment.children?svc.environment.children.map(function(c){return c.content;}):[]);
          if(envStr.indexOf('MYSQL_ROOT_PASSWORD')<0 && envStr.indexOf('MARIADB_ROOT_PASSWORD')<0){
            issues.push({sev:'err',line:(svc.environment?svc.environment.line:svcNode.line),msg:'Database `'+svcName+'` has no root-password env - a MySQL/MariaDB container will start with an insecure or empty root password.',fix:'Set `MYSQL_ROOT_PASSWORD` (or `MARIADB_ROOT_PASSWORD`) in its `environment:`.',});
          }
          if(envStr.indexOf('MYSQL_DATABASE')<0 && envStr.indexOf('MARIADB_DATABASE')<0){
            issues.push({sev:'warn',line:(svc.environment?svc.environment.line:svcNode.line),msg:'Database `'+svcName+'` has no `*_DATABASE` - no initial database is created.',fix:'Set `MYSQL_DATABASE: wordpress` (or `MARIADB_DATABASE`) so WordPress has a DB to connect to.',});
          }
        }
      }
      // Redis persistence
      if(/redis/i.test(svcName)||(svc.image&&/redis/i.test((svc.image.value||'')))){
        var cmd=(svc.command&&svc.command.value)||'';
        if(cmd.indexOf('appendonly')<0){
          issues.push({sev:'warn',line:(svc.command?svc.command.line:svcNode.line),msg:'Redis has no persistence - data is lost on restart.',fix:'Add `command: redis-server --appendonly yes` and a `/data` volume.'});
        }
      }
      // WordPress specifics
      if(/wordpress/i.test(svcName)||(svc.image&&/wordpress/i.test((svc.image.value||'')))){
        var wenv=(svc.environment&&svc.environment.children)?svc.environment.children.map(function(c){return c.content;}):[];
        var envText=wenv.join('\n');
        if(envText.indexOf('WORDPRESS_DB_HOST')<0){
          issues.push({sev:'err',line:(svc.environment?svc.environment.line:svcNode.line),msg:'WordPress has no `WORDPRESS_DB_HOST` - it will try localhost and fail.',fix:'Set `WORDPRESS_DB_HOST: db:3306` (point at the `db` service, not localhost).'});
        }else if(envText.indexOf('WORDPRESS_DB_HOST: localhost')>-1||envText.indexOf('WORDPRESS_DB_HOST: 127.0.0.1')>-1){
          issues.push({sev:'err',line:svc.environment.line,msg:'`WORDPRESS_DB_HOST` points at localhost - WordPress runs in a different container.',fix:'Point it at the db service: `WORDPRESS_DB_HOST: db:3306`.'});
        }
        if(envText.indexOf('WORDPRESS_DB_PASSWORD')<0){
          issues.push({sev:'warn',line:(svc.environment?svc.environment.line:svcNode.line),msg:'WordPress has no `WORDPRESS_DB_PASSWORD` - WP will not connect to a password-protected DB.',fix:'Set `WORDPRESS_DB_PASSWORD` (match the DB env).'});
        }
        // recommend depends_on condition for db (recurses into nested condition:)
        if(svc.depends_on){
          var hasHealthy=false;
          (function scanDep(nd){ nd.children&&nd.children.forEach(function(c){ if(/condition:/.test(c.content)&&/service_healthy/.test(c.content))hasHealthy=true; scanDep(c); }); })(svc.depends_on);
          // also scan raw text for service_healthy under this service's depends_on
          var svcDepLine=(svc.depends_on.line||0);
          for(var li=svcDepLine-1; li<analysis.lines.length; li++){
            var lx=analysis.lines[li];
            if(lx.isBlank||lx.isComment)continue;
            if(/condition: service_healthy/.test(lx.text)){ hasHealthy=true; }
            // stop when we hit the next sibling service (indent 2) after the depends_on block
            if(li>svcDepLine && /^[a-zA-Z]/.test(lx.text.trim())&&lx.indent===2){ break; }
          }
          if(!hasHealthy){
            issues.push({sev:'warn',line:svc.depends_on.line,msg:'WordPress `depends_on` doesn’t use `condition: service_healthy` - it may start before the DB is ready.',fix:'Use the long form with `condition: service_healthy` on the db.'});
          }
        }else{
          issues.push({sev:'warn',line:svcNode.line,msg:'WordPress has no `depends_on` - it may start before the DB is ready.',fix:'Add `depends_on: { db: { condition: service_healthy } }`.'});
        }
      }
      // named volumes used vs declared
      // (detected in the volumes check below via a global registry)
    });

    // volumes used not declared / declared not used
    var declaredVols=top.volumes&&top.volumes.children?top.volumes.children.map(function(c){return c.content.replace(/:\s*/,'').trim();}):[];
    var usedVols=[];
    Object.keys(top.services||{}).forEach(function(){});
    // gather - name:/path references
    var volRefs=[];
    (function walk(n,path){
      if(n.list){ n.list.forEach(function(li){
        var m=li.item.match(/^([A-Za-z0-9_.-]+):/);
        if(m){ volRefs.push({name:m[1],line:li.line}); }
      }); }
      if(n.children){ n.children.forEach(function(c){walk(c,path);}); }
    })(root,[]);
    // Also scan raw text for volume refs that the tree may have missed
    analysis.lines.forEach(function(L){
      if(L.isBlank||L.isComment)return;
      var m=/^[ \t]*-[ \t]+([A-Za-z0-9_.-]+):\//.exec(L.text);
      if(m){ volRefs.push({name:m[1],line:L.n}); }
    });
    volRefs.forEach(function(vr){
      if(declaredVols.indexOf(vr.name)<0){
        // only flag named volumes (not ./path or absolute paths)
        if(!/^\.\.?\//.test(vr.name)&&!/^\//.test(vr.name)&&vr.name.indexOf('$')<0){
          issues.push({sev:'warn',line:vr.line,msg:'Named volume `'+vr.name+'` is used but not declared at the top level.',fix:'Add `volumes:` + `  '+vr.name+':` at the top level to be explicit (it’s auto-created otherwise).'});
        }
      }
    });
    declaredVols.forEach(function(dv){
      if(dv && volRefs.findIndex(function(v){return v.name===dv;})<0){
        issues.push({sev:'info',line:top.volumes.line,msg:'Named volume `'+dv+'` is declared but never used.',fix:'Remove it, or mount it in a service.'});
      }
    });
  }

  // R3: single-path bind mounts (no container target) - look for "- /hostpath" or "- ./path"
  analysis.lines.forEach(function(L){
    if(L.isBlank||L.isComment)return;
    var m=/^[ \t]*-[ \t]+([^:\n]+?)\s*$/.exec(L.text);
    if(m){
      var p=m[1].trim();
      if(p.indexOf(':')<0 && p.indexOf('/')>=0 && p.indexOf('$')<0 && p!=='80:80' && !/^\d/.test(p)){
        issues.push({sev:'err',line:L.n,msg:'Volume `'+p+'` has no container destination (no `:`) - a single path is the host path only, which does nothing useful.',fix:'You likely meant `'+p+':/var/www/html` (host:container).'});
      }
    }
  });

  // sort errors first, then warnings, then info; by line
  var order={err:0,warn:1,info:2};
  issues.sort(function(a,b){ if(order[a.sev]!==order[b.sev])return order[a.sev]-order[b.sev]; return (a.line||0)-(b.line||0); });
  return issues;
}

/* ============================================================ */
/*  RENDER + COPY + DOWNLOAD                                     */
/* ============================================================ */
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
function countSeverity(issues){var c={err:0,warn:0,info:0};issues.forEach(function(i){c[i.sev]++;});return c;}

function validate(){
  var text=ed.value;
  lastYaml=text;
  var analysis=analyzeLines(text);
  var issues=text.trim()===''?[{sev:'info',line:1,msg:'Editor is empty - paste a compose file or pick a preset.',fix:'Click a preset above or paste your docker-compose.yml.'}]:checks(text,analysis);
  var c=countSeverity(issues);
  summary.innerHTML=
    '<span class="bdg err">'+c.err+' error'+(c.err!==1?'s':'')+'</span>'+
    '<span class="bdg warn">'+c.warn+' warning'+(c.warn!==1?'s':'')+'</span>'+
    '<span class="bdg info">'+c.info+' info</span>'+
    (c.err===0?' <span class="clr">✓ clean - no errors (info-level notes only)</span>':' <span class="clr">fix the errors, then re-run</span>');
  if(issues.length===0){
    report.innerHTML='<div class="iss info"><span class="dot"></span><span class="bod"><span class="tx">No issues found - this looks like a valid Compose service stack.</span></span></div>';
  }else{
    report.innerHTML=issues.slice(0,60).map(function(i){
      return '<div class="iss '+i.sev+'"><span class="dot"></span><span class="bod">'
        +'<span class="ln">line '+(i.line||'?')+'</span>'
        +'<span class="tx">'+esc(i.msg)+'</span>'
        +'<span class="fx">→ '+esc(i.fix)+'</span>'
        +'</span></div>';
    }).join('')+(issues.length>60?'<div class="iss info"><span class="dot"></span><span class="bod"><span class="tx">…'+(issues.length-60)+' more issues (fix the first batch, re-run).</span></span></div>':'');
  }
  lastReport=summary.textContent+'\n'+report.textContent;
}

function buildDownload(){
  return '# Docker Compose - validated in-browser (GWill Tech tools)\n# Validate with: docker compose config -q\n'+(lastYaml||'');
}
function copyReport(){
  copyText(lastReport,copyBtn);
}
function download(){
  var blob=new Blob([buildDownload()],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='compose.yml';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}
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
function updateStat(){
  var t=ed.value;
  edstat.textContent=t.split(/\r?\n/).length+' lines · '+t.length+' bytes';
}

/* events */
function debounce(fn,ms){var t;return function(){clearTimeout(t);t=setTimeout(fn,ms);};}
ed.addEventListener('input',debounce(function(){updateStat();validate();},180));
runBtn.addEventListener('click',validate);
clearBtn.addEventListener('click',function(){ed.value='';updateStat();validate();});
copyBtn.addEventListener('click',copyReport);
dlBtn.addEventListener('click',download);
if(fileLabel){
  fileLabel.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fileInput.click(); }
  });
}
fileInput.addEventListener('change',function(){
  var f=fileInput.files&&fileInput.files[0];if(!f)return;
  var rd=new FileReader();rd.onload=function(){ed.value=rd.result;updateStat();validate();};rd.readAsText(f);
});
Array.prototype.forEach.call(document.querySelectorAll('.dc-pbtn'),function(b){
  b.addEventListener('click',function(){ed.value=PRESETS[b.getAttribute('data-preset')];updateStat();validate();});
});

/* boot */
ed.value=PRESETS.wp_nginx_redis;
updateStat();
validate();
})();
