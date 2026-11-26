/* ============================================================
   SQLite ⇄ MySQL Query Syntax Converter - v1.19.89
   Bidirectional: paste SQLite DDL/DML → MySQL, and reverse.
   Handles AUTOINCREMENT, type affinity mapping, quoting dialect,
   the WordPress-SQLite leading-comma style, COLLATE/STRICT, and
   INSERT OR → INSERT IGNORE. 100% client-side.
   ============================================================ */
(function () {
'use strict';
function $(id){ return document.getElementById(id); }
var dirSel=$('dir'), input=$('input'), output=$('output'), outStat=$('outstat'),
    report=$('report'), swapBtn=$('swap'), copyBtn=$('copy'), dlBtn=$('dl'), runBtn=$('run');

/* ---------- type maps ---------- */
// SQLite type affinity → MySQL. Order matters: longest/first.
var SQLITE_TO_MYSQL = [
  [/\bINTEGER\b/gi, 'INT'],
  [/\bINT\b/gi, 'INT'],
  [/\bBIGINT\b/gi, 'BIGINT'],
  [/\bTINYINT\b/gi, 'TINYINT'],
  [/\bSMALLINT\b/gi, 'SMALLINT'],
  [/\bREAL\b/gi, 'DOUBLE'],
  [/\bDOUBLE\b/gi, 'DOUBLE'],
  [/\bFLOAT\b/gi, 'FLOAT'],
  [/\bNUMERIC\b/gi, 'DECIMAL'],
  [/\bDECIMAL\b/gi, 'DECIMAL'],
  [/\bBOOLEAN\b/gi, 'TINYINT(1)'],
  [/\bBLOB\b/gi, 'BLOB'],
  [/\bDATETIME\b/gi, 'DATETIME'],
  [/\bDATE\b/gi, 'DATE'],
  [/\bTIMESTAMP\b/gi, 'DATETIME'],
  [/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'VARCHAR(255)'], // placeholder, replaced below with real len
  [/\bTEXT\b/gi, 'TEXT'],
  [/\bLONGTEXT\b/gi, 'LONGTEXT'],
  [/\bMEDIUMTEXT\b/gi, 'MEDIUMTEXT'],
  [/\bTINYTEXT\b/gi, 'TINYTEXT'],
  [/\bCHAR\s*\(\s*\d+\s*\)/gi, 'CHAR(1)'],
];
var MYSQL_TO_SQLITE = [
  [/\bBIGINT\b/gi, 'INTEGER'],
  [/\bTINYINT\s*\(\s*1\s*\)/gi, 'INTEGER'],
  [/\bTINYINT\b/gi, 'INTEGER'],
  [/\bSMALLINT\b/gi, 'INTEGER'],
  [/\bMEDIUMINT\b/gi, 'INTEGER'],
  [/\bINT\s*\(\s*\d+\s*\)/gi, 'INTEGER'],
  [/\bINT\b/gi, 'INTEGER'],
  [/\bDOUBLE\b/gi, 'REAL'],
  [/\bFLOAT\b/gi, 'REAL'],
  [/\bDECIMAL\s*\([^)]*\)/gi, 'REAL'],
  [/\bNUMERIC\b/gi, 'REAL'],
  [/\bDECIMAL\b/gi, 'REAL'],
  [/\bBYTEA\b/gi, 'BLOB'],
  [/\bVARBINARY\b/gi, 'BLOB'],
  [/\bBLOB\b/gi, 'BLOB'],
  [/\bLONGBLOB\b/gi, 'BLOB'],
  [/\bMEDIUMBLOB\b/gi, 'BLOB'],
  [/\bTINYBLOB\b/gi, 'BLOB'],
  [/\bDATETIME\b/gi, 'DATETIME'],
  [/\bTIMESTAMP\b/gi, 'DATETIME'],
  [/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT'],
  [/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT'],
  [/\bLONGTEXT\b/gi, 'TEXT'],
  [/\bMEDIUMTEXT\b/gi, 'TEXT'],
  [/\bTINYTEXT\b/gi, 'TEXT'],
  [/\bTEXT\b/gi, 'TEXT'],
];

/* MySQL auto-increment column must be a key; WordPress-SQLite PK autoincrement
   already is. For a bare `INTEGER PRIMARY KEY AUTOINCREMENT` we add NOT NULL. */

/* Split a quoted identifier/relation from a line. Returns {quote,name,rest}. */
function splitIdent(s){
  var m=s.match(/^`([^`]+)`|^"([^"]+)"|^\[([^\]]+)\]|^([A-Za-z_][A-Za-z0-9_]*)/);
  if(!m) return {quote:'', name:'', rest:s};
  var name=m[1]||m[2]||m[3]||m[4];
  var quote= m[1]!==undefined?'`':(m[2]!==undefined?'"':(m[3]!==undefined?'[':''));
  return {quote:quote, name:name, rest:s.slice(m[0].length)};
}

function quoteName(name, q){
  if(q==='`') return '`'+name+'`';
  if(q==='"') return '"'+name+'"';
  if(q==='[') return '['+name+']';
  return name;
}

/* Convert identifier quoting: to MySQL -> backticks; to SQLite -> backticks kept
   or double-quotes (SQLite accepts both). We standardise to backticks for MySQL
   and backticks for SQLite (accepted by both), but bracket names become backticks. */
function convertIdentifiers(sql, toMySQL){
  // [bracket] and "double" identifiers -> backticks (MySQL); for SQLite keep backticks too
  if(toMySQL){
    return sql
      .replace(/\[([^\]]+)\]/g, '`$1`')       // [name] -> `name`
      .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`'); // "word" -> `word` (not string literals)
  } else {
    // MySQL backticks -> SQLite double quotes is safe; but keep backticks (SQLite accepts).
    return sql; // leave as-is (SQLite understands backticks)
  }
}

/* Handle CREATE TABLE bodies: convert the leading-comma style, types, autoincrement. */
function convertCreateTable(body, toMySQL){
  // body: the part inside CREATE TABLE `name` ( ... )
  // Split column/constraint definitions on commas that are at depth 0.
  var defs = splitTopLevel(body);
  var out=[];
  for(var i=0;i<defs.length;i++){
    out.push(convertDef(defs[i], toMySQL, i===0));
  }
  // join with a comma between EVERY definition (standard MySQL/SQLite style)
  return out.join(',\n');
}

function splitTopLevel(body){
  // split on commas not inside parens/quotes
  var parts=[], depth=0, cur='', inStr=null;
  for(var i=0;i<body.length;i++){
    var ch=body[i];
    if(inStr){
      cur+=ch;
      if(ch===inStr){ inStr=null; }
      continue;
    }
    if(ch==="'"||ch==='"'){ inStr=ch; cur+=ch; continue; }
    if(ch==='(')depth++;
    else if(ch===')')depth--;
    if(ch===',' && depth===0){ parts.push(cur); cur=''; continue; }
    cur+=ch;
  }
  if(cur.trim()) parts.push(cur);
  return parts;
}

function convertDef(def, toMySQL, first){
  var d=def.trim();
  // strip a leading comma (the WordPress-SQLite leading-comma style)
  d=d.replace(/^\s*,\s*/,'').trim();
  return convertColumnOrConstraint(d, toMySQL, first);
}

function convertColumnOrConstraint(d, toMySQL, first){
  // Constraint lines: PRIMARY KEY(...), UNIQUE(...), FOREIGN KEY(...), CHECK(...)
  var cMatch=d.match(/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT|KEY|INDEX)\s*(.*)$/i);
  if(cMatch){
    var kind=cMatch[1].toUpperCase();
    var rest=cMatch[2]||'';
    // constraint contents may reference `cols` unchanged
    if(kind==='PRIMARY KEY'||kind==='UNIQUE'||kind==='KEY'||kind==='INDEX'){
      return '  '+d;  // standard table-level clause (comma added by join)
    }
    return '  '+d;
  }
  // Column line: the leading comma was already stripped.
  // It looks like:  `name` type ...  OR  name type ...
  var idm=d.match(/^`([^`]+)`|^"([^"]+)"|^\[([^\]]+)\]|^([A-Za-z_][A-Za-z0-9_]*)\s+(.*)$/);
  if(!idm) return '  '+d;
  var colName=idm[1]||idm[2]||idm[3]||idm[4];
  var colQuote=idm[1]!==undefined?'`':(idm[2]!==undefined?'"':(idm[3]!==undefined?'[':''));
  // The regex above captures differently; safer to re-find via index
  var after=d.slice(idm[0].length).replace(/^\s+/,'');
  // Determine the type token(s) at the start of `after`
  var typeMatch=after.match(/^([A-Za-z]+(?:\s*(?:\([^)]*\)))?)/);
  if(!typeMatch){ return '  '+d; }
  var rawType=typeMatch[1];
  var remainder=after.slice(typeMatch[0].length).replace(/^\s+/,'');

  var newType=rawType;
  var tp=toMySQL ? SQLITE_TO_MYSQL : MYSQL_TO_SQLITE;
  // First, preserve explicit VARCHAR(length)/CHAR(length). We must NOT blanket-replace those.
  var lenMatch=rawType.match(/^([A-Za-z]+)\s*\(\s*(\d+)\s*\)$/);
  if(lenMatch){
    var base=lenMatch[1].toUpperCase(), ln=lenMatch[2];
    if(toMySQL){
      // SQLite VARCHAR(n) -> MySQL VARCHAR(n); Char->VARCHAR(n)
      newType = (base==='VARCHAR') ? 'VARCHAR('+ln+')' : ((base==='CHAR')?'VARCHAR('+ln+')':rawType);
    } else {
      // MySQL VARCHAR(n)->SQLite TEXT; keep VARCHAR? SQLite accepts VARCHAR; keep VARCHAR(n)
      newType = (base==='VARCHAR') ? 'VARCHAR('+ln+')' : rawType;
    }
  } else {
    // no explicit length: use the affinity map
    for(var k=0;k<tp.length;k++){
      var re=tp[k][0], repl=tp[k][1];
      if(re.test(rawType)){ newType=rawType.replace(re, repl); break; }
    }
  }

  // Column-level transforms.
  var wouldBe=quoteName(colName,'`')+' '+newType+' '+remainder;
  if(toMySQL){
    // AUTOINCREMENT -> AUTO_INCREMENT ; COLLATE strip
    wouldBe=wouldBe
      .replace(/\bAUTOINCREMENT\b/gi,'AUTO_INCREMENT')
      .replace(/\bCOLLATE\s+\w+\b/gi,'')
      .replace(/\bPRIMARY KEY\s+AUTO_INCREMENT\b/i,'AUTO_INCREMENT PRIMARY KEY')
      .replace(/\bAUTO_INCREMENT\s+PRIMARY KEY\b/i,'AUTO_INCREMENT PRIMARY KEY');
    // MySQL requires an auto-increment column to be NOT NULL and a key.
    if(/\bAUTO_INCREMENT\b/i.test(wouldBe) && !/\bNOT NULL\b/i.test(wouldBe)){
      wouldBe=wouldBe.replace(/\bAUTO_INCREMENT\b/i,'NOT NULL AUTO_INCREMENT');
    }
    return '  '+ wouldBe;
  } else {
    // MySQL -> SQLite
    wouldBe=wouldBe
      .replace(/\bAUTO_INCREMENT\b/gi,'AUTOINCREMENT')
      .replace(/\bTINYINT\s*\(\s*1\s*\)/gi,'INTEGER')
      // SQLite needs INTEGER PRIMARY KEY AUTOINCREMENT as a single column PK
      .replace(/\bNOT NULL\s+AUTOINCREMENT\s+PRIMARY KEY\b/i,'PRIMARY KEY AUTOINCREMENT');
    return '  '+wouldBe;
  }
}

/* Whole-CREATE-TABLE handler. Returns {sql, notes[]}. */
function convertCreateTableStmt(stmt, toMySQL){
  var notes=[];
  var m=stmt.match(/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+(IF\s+NOT\s+EXISTS\s+)?(.*)$/is);
  if(m){
    var kind=m[2]?m[2].toUpperCase():'TABLE';
    var target=m[4].trim();
    if(kind==='TABLE'){
      // split name ( ... )
      var nm=splitIdent(target);
      var open=target.indexOf('(');
      if(open<0){
        // CREATE TABLE name (no columns) - rare (sqlite_sequence)
        notes.push('Table "'+nm.name+'" has no column list (system-internal).');
        return {sql: stmt, notes:notes};
      }
      var tableName=nm.name;
      var body=target.slice(open+1);
      var close=body.lastIndexOf(')');
      var tableTail='';
      if(close>=0){ tableTail=body.slice(close+1); body=body.slice(0,close); }
      // strip table-level keywords at the end (STRICT, WITHOUT ROWID)
      var tailWords=tableTail.trim();
      tableTail=/\bSTRICT\b/i.test(tailWords)?' STRICT':'';
      var newBody=convertCreateTable(body, toMySQL);
      var head='CREATE TABLE '+(m[1]||'')+(m[3]?'IF NOT EXISTS ':'')+'`'+tableName+'` (\n';
      var tail='\n)';
      if(!toMySQL && /\bSTRICT\b/i.test(tableTail)) tail+=' STRICT';
      return {sql: head+newBody+tail, notes:notes};
    } else if(kind==='INDEX'){
      // CREATE [UNIQUE] INDEX `name` ON `t` (...)
      var idx=stmt.replace(/`/g,'`'); // identifiers already backtick
      if(toMySQL){
        // SQLite double-quoted index names -> backticks; nothing else major
        idx=idx.replace(/"idx_[^"]*"/g,function(q){var n=q.slice(1,-1); return '`'+n+'`';});
      }
      return {sql: idx, notes:notes};
    }
  }
  return {sql: stmt, notes:notes};
}

/* Handle INSERT OR REPLACE / OR IGNORE -> MySQL. */
function convertInsert(stmt, toMySQL){
  var out=stmt;
  if(toMySQL){
    out=out.replace(/\bINSERT\s+OR\s+REPLACE\b/gi,'REPLACE');
    out=out.replace(/\bINSERT\s+OR\s+IGNORE\b/gi,'INSERT IGNORE');
  } else {
    out=out.replace(/\bREPLACE\s+INTO\b/gi,'INSERT OR REPLACE INTO');
    out=out.replace(/\bINSERT\s+IGNORE\b/gi,'INSERT OR IGNORE');
  }
  return out;
}

/* Split SQL into statements (respecting quotes + BALANCED parens/BEGIN..END). */
function splitStatements(sql){
  var stmts=[], cur='', inStr=null, depth=0;
  for(var i=0;i<sql.length;i++){
    var ch=sql[i];
    if(inStr){
      cur+=ch;
      if(ch===inStr){ inStr=null; }
      // SQL string '' escape
      if(inStr && ch==="'" && sql[i+1]==="'"){ }
      continue;
    }
    if(ch==="'"||ch==='"'){ inStr=ch; cur+=ch; continue; }
    if(ch==='--'){ cur+=sql.substr(i, sql.indexOf('\n', i)-i); i=sql.indexOf('\n',i); if(i<0)break; continue; }
    if(ch==='(')depth++;
    else if(ch===')')depth--;
    if(ch===';' && depth===0){ stmts.push(cur); cur=''; continue; }
    cur+=ch;
  }
  if(cur.trim()) stmts.push(cur);
  return stmts;
}

/* ---------- main convert ---------- */
function convert(sql, toMySQL){
  if(!sql.trim()) return {out:'', notes:[]};
  var notes=[];
  var dirName= toMySQL ? 'SQLite → MySQL' : 'MySQL → SQLite';
  var stmts=splitStatements(sql);
  var outStmts=[];
  for(var i=0;i<stmts.length;i++){
    var s=stmts[i].replace(/[; \t]+$/,'').trim();
    if(!s) continue;
    // strip sqlite_sequence + other system tables when going to MySQL
    if(toMySQL && /^CREATE\s+TABLE\s+`?(sqlite_sequence|sqlite_stat1|_wp_sqlite_mysql_information_schema_\w+)`?/i.test(s)){
      var skipName=s.match(/^CREATE\s+TABLE\s+`?([\w]+)`?/i);
      notes.push('Skipped SQLite-internal table "'+ (skipName?skipName[1]:'internal') +'" (no MySQL equivalent).');
      continue;
    }
    var res;
    if(/^CREATE\s+(UNIQUE\s+)?TABLE\b/is.test(s)){
      res=convertCreateTableStmt(s, toMySQL);
      outStmts.push(res.sql);
      notes=notes.concat(res.notes);
    } else if(/^CREATE\s+(UNIQUE\s+)?INDEX\b/is.test(s)){
      res=convertCreateTableStmt(s, toMySQL);
      outStmts.push(res.sql);
    } else if(/^(INSERT|REPLACE)\b/is.test(s)){
      outStmts.push(convertInsert(s, toMySQL));
    } else {
      // generic: identifiers + AUTOINCREMENT + quoting
      var g=s;
      if(toMySQL){
        g=convertIdentifiers(g,true);
        g=g.replace(/\bAUTOINCREMENT\b/gi,'AUTO_INCREMENT');
        g=g.replace(/\bCOLLATE\s+\w+\b/gi,'');
        g=g.replace(/\bDEFAULT\s+current_timestamp\b/gi,'DEFAULT CURRENT_TIMESTAMP');
      } else {
        // leave identifiers; but MySQL `\` may be kept (SQLite accepts)
        g=g;
      }
      outStmts.push(g);
    }
  }
  var outText=outStmts.join(';\n');
  if(outText.trim()) outText+=';';
  return {out: outText, notes:notes};
}

/* render */
function render(){
  var inputTxt=$('input').value;
  var toMySQL = ($('dir').value==='sqlite_to_mysql');
  var r=convert(inputTxt, toMySQL);
  $('output').value=r.out;
  $('outstat').textContent=(r.out? r.out.length : 0)+' chars';
  // notes - ALWAYS show something so the panel is never blank.
  var notesHtml='';
  if(!inputTxt.trim()){
    notesHtml='<div class="note"><span class="dot i"></span>'+esc('Paste SQLite or MySQL SQL above (or this goes both ways) - the conversion notes appear here.')+'</div>';
  } else if(r.notes && r.notes.length){
    notesHtml=r.notes.map(function(n){ return '<div class="note"><span class="dot i"></span>'+esc(n)+'</div>'; }).join('');
  } else {
    notesHtml='<div class="note"><span class="dot i"></span>'+esc('Converted cleanly - no SQLite-only tables or clauses to skip.')+'</div>';
  }
  $('report').innerHTML=notesHtml;
}

function esc(s){ return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

/* swap dirs + re-run */
function swap(){
  var d=$('dir').value;
  $('dir').value= d==='sqlite_to_mysql' ? 'mysql_to_sqlite' : 'sqlite_to_mysql';
  render();
}

/* copy + download */
function copy(){
  var t=$('output').value||'';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){flash(copyBtn,'Copied ✓');},function(){fallback(t);});
  } else fallback(t);
}
function fallback(t){
  var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
  ta.focus(); ta.select();
  try{document.execCommand('copy');flash(copyBtn,'Copied ✓');}catch(e){flash(copyBtn,'copy failed');}
  document.body.removeChild(ta);
}
function flash(b,s){ var o=b.textContent; b.textContent=s; setTimeout(function(){b.textContent=o;},1400); }
function download(){
  var blob=new Blob([$('output').value||''],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='converted.sql'; document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove();},400);
}

/* events */
input.addEventListener('input', function(){ render(); });
dirSel.addEventListener('change', function(){ render(); });
swapBtn.addEventListener('click', swap);
runBtn.addEventListener('click', render);
copyBtn.addEventListener('click', copy);
dlBtn.addEventListener('click', download);

/* boot: pre-load a WordPress-SQLite example */
$('input').value =
"CREATE TABLE `wp_options` (\n" +
"  `option_id` integer  NOT NULL PRIMARY KEY AUTOINCREMENT\n" +
",  `option_name` varchar(191) NOT NULL DEFAULT ''\n" +
",  `option_value` longtext NOT NULL\n" +
",  `autoload` varchar(20) NOT NULL DEFAULT 'yes'\n" +
",  UNIQUE (`option_name`)\n" +
");\n" +
"INSERT INTO `wp_options` (`option_name`,`option_value`) VALUES ('siteurl','https://example.com'),('blogname','My Site');";
render();
})();
