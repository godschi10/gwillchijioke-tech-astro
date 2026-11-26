/* ============================================================
   .htaccess → Nginx Converter - v1.20.8
   100% client-side. Paste Apache .htaccess rules → get the
   nginx.conf equivalent, directive by directive, with an
   honest note for anything nginx does differently (or not at all).
   Nothing is uploaded - this runs on your device.
   ============================================================ */
(function () {
	'use strict';

	function $(id) { return document.getElementById(id); }

	/* ── Apache directive → nginx mapping ─────────────────────
	   Each handler gets the parsed pieces of the line and returns
	   { nginx: '...', note: '...' } - note explains subtleties. */
	function mapRewriteFlag(flags, defaultLast) {
		var out = [];
		var last = defaultLast;
		flags.forEach(function (f) {
			if (f === 'L') last = true;
			else if (f === 'R' || /^R=/.test(f)) out.push(/^R=302$/.test(f) || f === 'R' ? 'redirect' : 'permanent');
			else if (f === 'NC') out.push('nocase? (nginx: use (?i) in the pattern)');
			else if (f === 'QSA') out.push('QSA → nginx appends args by default in rewrite ... last;');
			else if (f === 'F') out.push('forbidden → return 403;');
			else if (f === 'G') out.push('gone → return 410;');
			else if (f === 'N') out.push('note: no direct nginx equivalent (internal restart)');
			else if (f === 'NE') out.push('no-escape: nginx does not re-encode by default');
			else if (f === 'T=') out.push('mime-type force: no direct equivalent');
		});
		return { flags: out, last: last };
	}

	function handleRewriteRule(parts) {
		var pat = parts[0], target = parts[1];
		var flags = (parts[2] || '').replace(/^\[|\]$/g, '').split(',').filter(Boolean);
		var fl = mapRewriteFlag(flags, true);
		var lines = [];
		// Apache patterns are anchored to the directory (no leading slash); nginx matches the full URI.
		var ngx = pat.replace(/^\^?/, '^/');
		if (!/^\^/.test(pat)) ngx = '^/.*' + pat; // unanchored - approximate honestly
		if (fl.flags.length && fl.flags.some(function (f) { return /^permanent|^redirect/.test(f); })) {
			lines.push('rewrite ' + ngx + ' ' + target + ' permanent;');
			return { nginx: lines.join('\n'), note: 'RewriteRule with R=301 → nginx rewrite permanent. nginx matches the full URI (leading /); Apache matched relative to the .htaccess directory.' };
		}
		lines.push('rewrite ' + ngx + ' ' + target + (fl.last ? ' last;' : ' break;'));
		return {
			nginx: lines.join('\n'),
			note: fl.flags.length ? 'Flags: ' + fl.flags.join(' · ') : 'L → last (stop processing in this context).' +
				' nginx rewrite lives inside server{} or location{} - outside a location it is server-level.'
		};
	}

	function handleRewriteCond(conds, ruleParts) {
		// The most common Cond → rule pair: HTTPS off + host
		var httpsCond = conds.some(function (c) { return /%\{HTTPS\}\s+off/i.test(c); });
		var hostCond = conds.find(function (c) { return /%\{HTTP_HOST\}/.test(c); });
		if (httpsCond) {
			var host = hostCond ? hostCond.replace(/.*%\{HTTP_HOST\}\s*=?\s*([^,\s]+).*/, '$1').replace(/\s*$/, '') : '$host';
			return {
				nginx: 'if ($scheme = http) {\n    return 301 https://' + (hostCond ? host.replace(/[^\/]*$/, '') : '') + '$request_uri;\n}',
				note: 'RewriteCond %{HTTPS} off + [R=301,L] rule → nginx if ($scheme = http) { return 301 https://...$request_uri; }. nginx if{} is limited - for anything complex use two server blocks (80 → 443 redirect) instead.'
			};
		}
		var hostOnly = conds.some(function (c) { return /%\{HTTP_HOST\}\s+!?\=?.*www/i.test(c); });
		if (hostOnly) {
			return {
				nginx: 'if ($host ~* ^www\\.(.*)$) {\n    return 301 https://$1$request_uri;\n}',
				note: 'www→non-www (or reverse) is cleaner as a separate server block with server_name www.example.com; return 301 https://example.com$request_uri;'
			};
		}
		// generic: pass through with a note
		return {
			nginx: '# RewriteCond carried over - review:\n# ' + conds.join('\n# ') + '\n# (nginx has no RewriteCond; fold the condition into the rewrite regex or an if block)',
			note: 'nginx has no RewriteCond. Fold the condition into the pattern, or use an if() - which is intentionally limited (no nesting, limited operators).'
		};
	}

	var DIRECTIVES = {
		'rewriteengine': function (p) {
			return p[0].toLowerCase() === 'on'
				? { nginx: null, note: 'RewriteEngine On → nothing needed; nginx rewriting is always on (rewrite directive works anywhere).' }
				: { nginx: null, note: 'RewriteEngine Off - nginx: simply omit the rewrite lines.' };
		},
		'rewritebase': function (p) {
			return { nginx: null, note: 'RewriteBase ' + p[0] + ' → not needed; nginx rewrites are absolute (or use root-relative targets).' };
		},
		'rewriterule': function (p) { return handleRewriteRule(p); },
		'redirect': function (p) {
			// Redirect [status] /old /new   (mod_alias)
			var code = /^\d+$/.test(p[0]) ? p.shift() : '301';
			var oldPath = p[0], newTarget = p[1] || '/';
			var ngx = 'rewrite ^' + oldPath.replace(/^[^\/]/, '/$&') + '/?$ ' + newTarget + (code === '301' ? ' permanent;' : ' redirect;');
			return {
				nginx: ngx,
				note: 'mod_alias Redirect ' + code + ' → nginx rewrite ' + (code === '301' ? 'permanent (301)' : 'redirect (302)') + '. The /?$ allows an optional trailing slash.'
			};
		},
		'redirectmatch': function (p) {
			return { nginx: 'rewrite ' + p[0].replace(/^\^?/, '^/') + ' ' + p[1] + ' permanent;', note: 'RedirectMatch → nginx rewrite with the regex directly.' };
		},
		'options': function (p) {
			var hasIdx = /(^|\s)-Indexes/.test(p.join(' '));
			var hasFollow = /(^|\s)\+FollowSymLinks/.test(p.join(' '));
			var out = [];
			if (hasIdx) out.push('autoindex off;');
			if (hasFollow) out.push('# FollowSymLinks: nginx follows symlinks by default - nothing needed');
			return {
				nginx: out.length ? out.join('\n') : null,
				note: 'Options: -Indexes → autoindex off;. +FollowSymLinks is default nginx behaviour (no directive).'
			};
		},
		'directoryindex': function (p) {
			return { nginx: 'index ' + p.join(' ') + ';', note: 'DirectoryIndex → nginx index directive (server or location level).' };
		},
		'errordocument': function (p) {
			return { nginx: 'error_page ' + p[0] + ' ' + p[1] + ';', note: 'ErrorDocument → error_page. Use =response syntax for full redirects if needed.' };
		},
		'header': function (p) {
			// Header set X-Foo "bar"
			var action = p[0].toLowerCase();
			var name = p[1];
			var val = p.slice(2).join(' ');
			if (action === 'set' || action === 'add') {
				return { nginx: 'add_header ' + name + ' ' + val + ' always;', note: 'Header set → add_header (with always so it also applies to error responses). Note: add_header inherits down ONLY if the child block declares none of its own.' };
			}
			if (action === 'unset' || action === 'edit') {
				return { nginx: null, note: 'Header ' + action + ' → no direct nginx equivalent (nginx has fastcgi_hide_header/proxy_hide_header for upstream headers only).' };
			}
			return { nginx: 'add_header ' + name + ' ' + val + ' always;', note: 'Header directive → add_header (approximate).' };
		},
		'expiresactive': function () { return { nginx: null, note: 'ExpiresActive On → nothing needed; nginx expires directive is set per-location.' }; },
		'expiresdefault': function (p) {
			var secs = apachetimeToSecs(p[0]);
			return { nginx: 'expires ' + secsToNginx(secs) + ';', note: 'ExpiresDefault → expires (http, server, or location level).' };
		},
		'expiresbytype': function (p) {
			var type = p[0].toLowerCase();
			var secs = apachetimeToSecs(p[1]);
			var ext = typeToExt(type);
			var inner = 'expires ' + secsToNginx(secs) + ';\n    add_header Cache-Control "public";';
			return {
				nginx: ext ? 'location ~* \\.' + ext + '$' + ' {\n    ' + inner.split('\n').join('\n    ') + '\n}' : inner + ';',
				note: 'ExpiresByType → a location block with expires. ' + (ext ? 'Matched ' + type + ' → .' + ext : 'Type ' + type + ' has no common file extension - set it manually.')
			};
		},
		'adddefaultcharset': function (p) {
			return { nginx: 'charset ' + (p[0] || 'utf-8').toLowerCase() + ';', note: 'AddDefaultCharset → charset.' };
		},
		'serversignature': function (p) {
			return p[0].toLowerCase() === 'off'
				? { nginx: 'server_tokens off;', note: 'ServerSignature Off → server_tokens off; (hides the nginx version).' }
				: { nginx: null, note: 'ServerSignature On - default nginx behaviour.' };
		},
		'limitrequestbody': function (p) {
			return { nginx: 'client_max_body_size ' + p[0] + ';', note: 'LimitRequestBody (bytes) → client_max_body_size (nginx also uses this for uploads).' };
		},
		'order': function () { return { nginx: null, note: 'Order allow,deny → nginx access directives replace the whole trio (allow/deny directly).' }; },
		'deny': function (p) {
			if (/^all$/i.test(p[0])) return { nginx: 'deny all;', note: 'Deny from all → deny all; (valid in http, server, location, limit_except).' };
			return { nginx: 'deny ' + p[0] + ';', note: 'Deny from → deny; (IP or CIDR). Combine with allow for ordering - nginx evaluates in order.' };
		},
		'allow': function (p) {
			return { nginx: 'allow ' + p[0] + ';\ndeny all;', note: 'Allow from X → allow X; then deny all; (nginx stops at the first match).' };
		},
		'authuserfile': function (p) {
			return { nginx: 'auth_basic_user_file ' + p[0] + ';', note: 'AuthUserFile → auth_basic_user_file (same htpasswd format - Apache\'s htpasswd tool output works as-is).' };
		},
		'authtype': function () { return { nginx: 'auth_basic "Restricted";', note: 'AuthType Basic → auth_basic (nginx only supports basic).' };
		},
		'authname': function (p) {
			return { nginx: 'auth_basic "' + p.join(' ').replace(/^"|"$/g, '') + '";', note: 'AuthName → auth_basic (the realm string shown to the user).' };
		},
		'require': function (p) {
			if (/valid-user/i.test(p[0])) return { nginx: null, note: 'Require valid-user → implied: once auth_basic is set, the location requires auth. (Or use satisfy all/any with allow/deny.)' };
			return { nginx: null, note: 'Require ' + p.join(' ') + ' → no direct equivalent; guard with allow/deny or auth_basic.' };
		},
		'addtype': function (p) {
			return { nginx: null, note: 'AddType ' + p[0] + ' ' + p.slice(1).join(' ') + ' → add to nginx mime.types (types { ext type; }) - usually already present.' };
		},
		'addhandler': function (p) {
			return { nginx: null, note: 'AddHandler ' + p.join(' ') + ' → nginx: cgi/fastcgi is configured per-location, not per-extension (except via location regex).' };
		},
		'addcharset': function (p) {
			return { nginx: null, note: 'AddCharset → use charset + a location matching the extensions, or types { } with charset.' };
		},
		'php_value': function (p) {
			return { nginx: null, note: 'php_value ' + p[0] + ' → not nginx: with PHP-FPM set php_admin_value[] in the pool conf (www.conf), or use fastcgi_param PHP_VALUE.' };
		},
		'php_flag': function (p) {
			return { nginx: null, note: 'php_flag ' + p[0] + ' → PHP-FPM pool conf (php_admin_flag[]) or fastcgi_param PHP_VALUE.' };
		},
		'filesmatch': function (p, raw) {
			// <FilesMatch "wp-config"> blocks → location ~
			var pat = (p[0] || '').replace(/^"|"$/g, '');
			return {
				nginx: 'location ~ ' + pat + ' {\n    deny all;\n}',
				note: '<FilesMatch ' + pat + '> → nginx location ~ regex { }. The protections inside (deny) carry over; close the block with }.'
			};
		},
		'files': function (p) {
			var f = (p[0] || '').replace(/^"|"$/g, '');
			return { nginx: 'location = /' + f + ' {\n    deny all;\n}', note: '<Files ' + f + '> → exact-match location = /' + f + ' { }.' };
		},
		'setenv': function (p) {
			return { nginx: null, note: 'SetEnv → fastcgi_param ' + p[0] + ' "' + (p[1] || '') + '"; (for PHP) or env at server level for nginx itself.' };
		},
		'forcetype': function () { return { nginx: null, note: 'ForceType → no direct equivalent; configure per-location types or use fastcgi_param.' }; },
		'directoryindexdefault': function () { return { nginx: null, note: 'No nginx equivalent.' }; },
		'indexignore': function (p) {
			return { nginx: null, note: 'IndexIgnore → autoindex_exact_size off / autoindex_localtime on affect listing format; hiding entries needs a custom autoindex location.' };
		},
		'limitexcept': function (p) {
			return { nginx: 'limit_except ' + p[0] + ' {\n    deny all;\n}', note: '<LimitExcept ' + p[0] + '> → limit_except (same idea: deny all methods except listed).' };
		},
		'ssl_enginedummy': function () { return { nginx: null, note: '' }; },
	};

	/* helpers */
	function apachetimeToSecs(t) {
		t = String(t || '').trim().toLowerCase();
		// Apache base syntax: A2592000 / M604800
		var m = /^([am])(\d+)$/.exec(t);
		if (m) return parseInt(m[2], 10);
		// Apache interval syntax: "access plus 1 month 15 days 2 hours" / "now plus 2 weeks"
		if (/^(access|now|modification)\s*(plus)?\s/.test(t)) {
			var total = 0;
			var re = /(\d+)\s*(years?|months?|weeks?|days?|hours?|minutes?|seconds?)/g;
			var mm;
			while ((mm = re.exec(t)) !== null) {
				var n = parseInt(mm[1], 10);
				var u = mm[2];
				if (/^year/.test(u)) total += n * 31536000;
				else if (/^month/.test(u)) total += n * 2592000;
				else if (/^week/.test(u)) total += n * 604800;
				else if (/^day/.test(u)) total += n * 86400;
				else if (/^hour/.test(u)) total += n * 3600;
				else if (/^minute/.test(u)) total += n * 60;
				else total += n;
			}
			if (total > 0) return total;
		}
		// plain seconds
		if (/^\d+$/.test(t)) return parseInt(t, 10);
		return 2592000; // honest fallback: 30d
	}
	function secsToNginx(s) {
		if (s % 86400 === 0) return (s / 86400) + 'd';
		if (s % 3600 === 0) return (s / 3600) + 'h';
		if (s % 60 === 0) return (s / 60) + 'm';
		return s + 's';
	}
	function typeToExt(t) {
		var map = {
			'text/css': 'css', 'application/javascript': 'js', 'text/javascript': 'js',
			'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/svg+xml': 'svg',
			'image/x-icon': 'ico', 'image/webp': 'webp', 'image/avif': 'avif',
			'font/woff': 'woff', 'font/woff2': 'woff2', 'application/font-woff': 'woff',
			'application/x-font-woff': 'woff', 'application/vnd.ms-fontobject': 'eot',
			'font/ttf': 'ttf', 'application/x-font-ttf': 'ttf', 'font/otf': 'otf',
			'video/mp4': 'mp4', 'video/webm': 'webm',
			'text/html': 'html', 'application/pdf': 'pdf',
		};
		return map[t] || null;
	}

	/* ── the converter ─────────────────────────────────────── */
	function convertApache(text) {
		var srcLines = text.split('\n');
		var out = [];   // nginx config lines
		var notes = []; // per-line explanations
		var pendingConds = [];
		var stats = { mapped: 0, notes: 0, unknown: 0, comments: 0 };
		var inBlock = null; // <FilesMatch>/<Files> context

		srcLines.forEach(function (raw, idx) {
			var line = raw.trim();
			if (!line) return;
			if (/^#/.test(line)) { stats.comments++; out.push('# ' + line.replace(/^#\s*/, '')); return; }
			if (/^<\/(FilesMatch|Files|LimitExcept|IfModule)/i.test(line)) {
				inBlock = null;
				out.push('}');
				notes.push({ ln: idx + 1, src: line, note: 'block close → }' });
				return;
			}

			// RewriteCond accumulates
			if (/^RewriteCond\s/i.test(line)) { pendingConds.push(line); return; }

			// <FilesMatch ...> opener
			var open = /^<(FilesMatch|Files|LimitExcept)\s+(.+)>$/i.exec(line);
			if (open) {
				var h = DIRECTIVES[open[1].toLowerCase()];
				if (h) {
					var r = h([open[2]], line);
					out.push(r.nginx || '');
					if (r.note) notes.push({ ln: idx + 1, src: line, note: r.note });
					stats.mapped++;
				}
				inBlock = open[1];
				return;
			}

			// <IfModule> openers are noise for nginx
			if (/^<IfModule/i.test(line)) { stats.comments++; return; }

			// tokenise: directive + rest
			var toks = line.split(/\s+/);
			var dir = toks.shift().replace(/^__/g, '');
			var key = dir.toLowerCase().replace(/\./g, '_dot_');
			var handler = DIRECTIVES[key];

			if (handler) {
				// if conds pending and this is a RewriteRule → pair them
				if (key === 'rewriterule' && pendingConds.length) {
					var rr = handleRewriteCond(pendingConds, toks);
					out.push(rr.nginx);
					notes.push({ ln: idx + 1, src: pendingConds.join(' | ') + ' ' + line, note: rr.note });
					stats.mapped++;
					pendingConds = [];
					return;
				}
				var res = handler(toks, line);
				if (res.nginx !== null && res.nginx !== undefined) { out.push(res.nginx); stats.mapped++; }
				if (res.note) { notes.push({ ln: idx + 1, src: line, note: res.note }); stats.notes++; }
			} else {
				stats.unknown++;
				out.push('# [no mapping] ' + line);
				notes.push({ ln: idx + 1, src: line, note: 'Not recognised - nginx may handle it differently or it may not apply. Check the nginx docs for: ' + dir });
			}
		});

		if (pendingConds.length) {
			notes.push({ ln: srcLines.length, src: pendingConds.join(' | '), note: 'RewriteCond without a following RewriteRule - dropped.' });
		}

		return { nginx: out.filter(function (l) { return l !== ''; }).join('\n'), notes: notes, stats: stats };
	}

	/* ── UI wiring ─────────────────────────────────────────── */
	var inp = $('h2n-in'), out = $('h2n-out'), notesEl = $('h2n-notes'),
		statsEl = $('h2n-stats'), goBtn = $('h2n-go'), copyBtn = $('h2n-copy'),
		dlBtn = $('h2n-dl'), clearBtn = $('h2n-clear'), sampleBtn = $('h2n-sample'),
		fileIn = $('h2n-file'), fileMsg = $('h2n-filemsg');

	var SAMPLE = [
		'RewriteEngine On',
		'RewriteCond %{HTTPS} off',
		'RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]',
		'RewriteRule ^old-page$ /new-page [R=301,L]',
		'Redirect 301 /legacy /modern',
		'Options -Indexes',
		'DirectoryIndex index.php',
		'ErrorDocument 404 /404.html',
		'Header set X-Content-Type-Options "nosniff"',
		'ExpiresActive On',
		'ExpiresByType text/css "access plus 1 month"',
		'<FilesMatch "^(wp-config|\\.htaccess|readme)">',
		'Order allow,deny',
		'Deny from all',
		'</FilesMatch>',
	].join('\n');

	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

	function render() {
		var src = inp.value.trim();
		if (!src) { statsEl.textContent = 'paste an .htaccess to convert'; out.textContent = ''; notesEl.innerHTML = ''; return; }
		var r = convertApache(src);
		out.textContent = r.nginx;
		statsEl.textContent = r.stats.mapped + ' directives mapped · ' + r.stats.notes + ' notes · ' + r.stats.unknown + ' unmatched' + (r.stats.comments ? ' · ' + r.stats.comments + ' comments' : '');
		notesEl.innerHTML = r.notes.map(function (n) {
			return '<div class="h2n-note"><span class="h2n-note-src">line ' + n.ln + ': ' + esc(n.src.slice(0, 72)) + (n.src.length > 72 ? '…' : '') + '</span><span class="h2n-note-txt">' + esc(n.note) + '</span></div>';
		}).join('');
	}

	function flash(btn, msg) {
		var t = btn.textContent;
		btn.textContent = msg;
		setTimeout(function () { btn.textContent = t; }, 1400);
	}

	function copyText(v, btn) {
		function ok() { flash(btn, 'Copied ✓'); }
		function fb() { flash(btn, 'Copy failed'); }
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(v).then(ok, fb);
		} else {
			var ta = document.createElement('textarea');
			ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0';
			document.body.appendChild(ta); ta.select();
			try { document.execCommand('copy'); ok(); } catch (e) { fb(); }
			ta.remove();
		}
	}

	goBtn.addEventListener('click', render);
	inp.addEventListener('input', render);
	sampleBtn.addEventListener('click', function () { inp.value = SAMPLE; render(); });
	clearBtn.addEventListener('click', function () { inp.value = ''; render(); });
	copyBtn.addEventListener('click', function () { copyText(out.textContent, this); });
	dlBtn.addEventListener('click', function () {
		var blob = new Blob(['# converted from .htaccess → nginx by gwill-tools\n', out.textContent, '\n'], { type: 'text/plain' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a'); a.href = url; a.download = 'nginx-converted.conf';
		document.body.appendChild(a); a.click();
		setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
	});
	fileIn.addEventListener('change', function () {
		var f = this.files && this.files[0];
		if (!f) return;
		var rd = new FileReader();
		rd.onload = function () { inp.value = String(rd.result); fileMsg.textContent = f.name + ' loaded'; render(); };
		rd.onerror = function () { fileMsg.textContent = 'could not read the file'; };
		rd.readAsText(f);
	});

	render();
})();