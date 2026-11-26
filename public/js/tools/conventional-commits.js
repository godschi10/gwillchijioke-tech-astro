/* ============================================================
   Conventional Commits Helper - v1.20.3
   100% client-side. Describe a change → a proper
   `type(scope): subject` Conventional Commit message,
   optional body, BREAKING CHANGE footer, and a PR title.
   ============================================================ */
(function () {
	'use strict';

	function $(id) { return document.getElementById(id); }

	var fType = $('ccx-type'), fScope = $('ccx-scope'), fSubject = $('ccx-subject'),
	    fBreaking = $('ccx-breaking'), fBody = $('ccx-body'), fIssue = $('ccx-issue'),
	    fTypeDesc = $('ccx-typedesc'), breakWrap = $('ccx-breakwrap'), breakDesc = $('ccx-breakdesc'),
	    out = $('ccx-out'), outTitle = $('ccx-outtitle'), outBadge = $('ccx-outbadge'),
	    outMeta = $('ccx-outmeta'), hint = $('ccx-hint'),
	    copyBtn = $('ccx-copy'), titleCopyBtn = $('ccx-titlecopy'), dlBtn = $('ccx-dl'),
	    resetBtn = $('ccx-reset');

	/* The Conventional Commits 1.0.0 type taxonomy + a plain-English
	   "when to use it" hint so the user picks correctly. */
	var TYPES = {
		feat:     { label: 'feat', desc: 'A new feature (bumps MINOR version)' },
		fix:      { label: 'fix', desc: 'A bug fix (bumps PATCH version)' },
		docs:     { label: 'docs', desc: 'Documentation only' },
		style:    { label: 'style', desc: 'Formatting, whitespace, missing semi-colons - no code change' },
		refactor: { label: 'refactor', desc: 'Code change that neither fixes a bug nor adds a feature' },
		perf:     { label: 'perf', desc: 'A performance improvement' },
		test:     { label: 'test', desc: 'Adding or correcting tests' },
		chore:    { label: 'chore', desc: 'Build tooling, deps, config - no production code' },
		ci:       { label: 'ci', desc: 'CI/CD pipeline changes' },
		build:    { label: 'build', desc: 'Changes to the build system or external dependencies' },
	};

	/* Populate the type <select> from the taxonomy (alphabetical but feat/fix first). */
	var TYPE_ORDER = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build'];
	TYPE_ORDER.forEach(function (k) {
		var o = document.createElement('option');
		o.value = TYPES[k].label; o.textContent = TYPES[k].label;
		fType.appendChild(o);
	});
	fType.value = 'feat';
	function typeDesc() { if (fTypeDesc) fTypeDesc.textContent = TYPES[typeKey()].desc; }

	function typeKey() {
		var v = fType.value;
		for (var k in TYPES) { if (TYPES[k].label === v) return k; }
		return 'feat';
	}

	function build() {
		var type = typeKey();
		var scope = fScope.value.trim().replace(/[()]/g, '');
		var subject = fSubject.value.trim();
		var breaking = fBreaking.checked;
		var breakText = breakDesc && breakDesc.value.trim() ? breakDesc.value.trim() : null;
		var body = fBody.value.trim();
		var issue = fIssue.value.trim();

		// headline: `type(scope): subject`
		var head = type + (scope ? '(' + scope + ')' : '') + ': ' + (subject || '…');

		var typeInfo = TYPES[type];
		outBadge.textContent = typeInfo.label;
		outBadge.style.background = breaking ? 'var(--red)' : 'var(--green)';
		outBadge.style.color = breaking ? '#1a0606' : '#04160d';
		typeDesc();
		if (breakWrap) breakWrap.hidden = !breaking;

		var lines = [head];

		if (body) {
			lines.push('', body);
		}

		var footerLines = [];
		if (breaking) footerLines.push('BREAKING CHANGE: ' + (breakText || 'describe what breaks and how to migrate'));
		if (issue) footerLines.push(issue);

		if (footerLines.length) {
			lines.push('');
			lines = lines.concat(footerLines.map(function (f) { return f; }));
		}

		// Subject length guard (Conventional Commits recommends ≤ 50 chars for the summary)
		var subjectLen = subject.length;
		if (subjectLen > 50) {
			hint.textContent = '⚠ Subject is ' + subjectLen + ' chars - convention suggests ≤ 50; keep it tight, put detail in the body.';
			hint.style.color = 'var(--amber)';
		} else if (!subject) {
			hint.textContent = 'Type what changed in one line - e.g. "add OAuth login to the admin panel".';
			hint.style.color = 'var(--muted)';
		} else {
			hint.textContent = 'Looks good - every commit answers "why" for the next person who reads the log.';
			hint.style.color = 'var(--green)';
		}

		// PR title = headline, title-cased feel kept as-is
		outTitle.value = head;
		outMeta.textContent = 'type → semantic version bump; scope → area; breaking change → MAJOR. Conventional Commits 1.0.0.';

		var full = lines.join('\n');
		out.value = full;

		// class swap for breaking
		out.classList.toggle('ccx-breaking', breaking);
	}

	function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
	var live = debounce(build, 120);

	[fType, fScope, fSubject, fBreaking, fBody, fIssue, breakDesc].forEach(function (el) {
		el.addEventListener('input', live);
		el.addEventListener('change', live);
	});

	function copy(v, btn) {
		function ok() { flash(btn, 'Copied ✓'); }
		function fb() { flash(btn, 'Copy failed'); }
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(v).then(ok, fb);
		} else {
			var ta = document.createElement('textarea');
			ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0';
			document.body.appendChild(ta); ta.focus(); ta.select();
			try { document.execCommand('copy'); ok(); } catch (e) { fb(); }
			document.body.removeChild(ta);
		}
	}
	function flash(b, s) { var o = b.textContent; b.textContent = s; setTimeout(function () { b.textContent = o; }, 1300); }

	copyBtn.addEventListener('click', function () { copy(out.value, this); });
	titleCopyBtn.addEventListener('click', function () { copy(outTitle.value, this); });
	dlBtn.addEventListener('click', function () {
		var blob = new Blob([out.value + '\n'], { type: 'text/plain' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a'); a.href = url; a.download = 'commit-message.txt';
		document.body.appendChild(a); a.click();
		setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
	});
	resetBtn.addEventListener('click', function () {
		fType.value = 'feat'; fScope.value = ''; fSubject.value = ''; fBreaking.checked = false;
		fBody.value = ''; fIssue.value = ''; if (breakDesc) breakDesc.value = '';
		build();
	});

	build();
})();