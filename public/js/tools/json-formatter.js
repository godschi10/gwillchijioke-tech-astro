(function () {
    'use strict';

    var DOM = {};

    function init() {
        DOM.input   = document.getElementById('json-input');
        DOM.output  = document.getElementById('json-output');
        DOM.error   = document.getElementById('json-error');
        DOM.stats   = document.getElementById('json-stats');
        DOM.format  = document.getElementById('btn-format');
        DOM.minify  = document.getElementById('btn-minify');
        DOM.validate = document.getElementById('btn-validate');
        DOM.copy    = document.getElementById('btn-copy');
        DOM.clear   = document.getElementById('btn-clear');
        DOM.sort    = document.getElementById('btn-sort');
        DOM.download = document.getElementById('btn-download');
        DOM.indent  = document.getElementById('indent-select');
        DOM.tree    = document.getElementById('json-tree');
        DOM.highlight = document.getElementById('highlight-toggle');
        DOM.file    = document.getElementById('file-input');
        DOM.fileMsg = document.getElementById('file-msg');
        DOM.openFile = document.getElementById('btn-openfile');
        DOM.treeCard = document.getElementById('gt-treecard');

        if (!DOM.input) return;

        if (DOM.openFile && DOM.file) {
            DOM.openFile.addEventListener('click', function () { DOM.file.click(); });
        }

        DOM.format.addEventListener('click',  fnFormat);
        DOM.minify.addEventListener('click',  fnMinify);
        DOM.validate.addEventListener('click', fnValidate);
        DOM.copy.addEventListener('click',    fnCopy);
        DOM.clear.addEventListener('click',   fnClear);
        DOM.sort.addEventListener('click',    fnSort);
        DOM.download.addEventListener('click', fnDownload);
        DOM.input.addEventListener('input',   onInput);
        DOM.input.addEventListener('dragover', onDragOver);
        DOM.input.addEventListener('dragleave', onDragLeave);
        DOM.input.addEventListener('drop',    onDrop);
        DOM.indent.addEventListener('change', maybeReformat);
        DOM.highlight.addEventListener('change', maybeReformat);
        if (DOM.file) DOM.file.addEventListener('change', onFile);

        // Load example
        DOM.input.value = JSON.stringify({
            "name": "GWill Tech",
            "version": "1.0",
            "features": ["dark mode", "terminal style", "fast tools"],
            "meta": {
                "author": "Mr. Udedibia",
                "site": (window.GwillToolsConfig && window.GwillToolsConfig.siteHost) || "gwillchijioke.com",
                "year": 2026
            }
        }, null, 2);

        // Deep link: ?json=<urlencoded>
        try {
            var qp = new URLSearchParams(window.location.search).get('json');
            if (qp) {
                var decoded = decodeURIComponent(qp);
                if (decoded.trim()) DOM.input.value = decoded;
            }
        } catch (e) { /* URLSearchParams unsupported - skip */ }

        // Auto-format on load
        fnFormat();
    }

    /* ── Parse helper ─────────────────────────────────────────────────── */

    function parseJSON(text) {
        text = text.trim();
        if (!text) return { ok: false, error: 'Paste some JSON first.' };
        try {
            var val = JSON.parse(text);
            return { ok: true, value: val, bigInt: hasUnsafeInt(text) };
        } catch (e) {
            var msg = e.message;
            // Chrome: "position N" / Firefox: "at line X column Y"
            var pos = msg.match(/position\s+(\d+)/i);
            if (pos) {
                var idx = parseInt(pos[1], 10);
                var before = text.slice(0, idx);
                var lines = before.split('\n');
                var line = lines.length;
                var col = lines[lines.length - 1].length + 1;
                msg = 'Line ' + line + ', column ' + col + ' - ' + msg;
            } else {
                var ff = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
                if (ff) {
                    msg = 'Line ' + ff[1] + ', column ' + ff[2] + ' - ' + msg;
                }
            }
            return { ok: false, error: msg };
        }
    }

    /* Detect integer literals that exceed JS's safe range (2^53): JSON.parse
       silently rounds them - warn honestly instead of corrupting silently. */
    function hasUnsafeInt(text) {
        var re = /(?<=[:\s\[,\[])(-?\d{16,})(?=[\s,\]}]|$)/g;
        var m;
        while ((m = re.exec(text)) !== null) {
            var n = Number(m[1]);
            if (!isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return true;
        }
        return false;
    }

    /* ── Actions ──────────────────────────────────────────────────────── */

    function getIndent() {
        // v1.21.3 audit fix: parseInt('0') || 2 coerced compact → 2, so
        // "No indent (compact)" never worked. NaN/negative guard, keep 0.
        var n = parseInt(DOM.indent.value, 10);
        return (isNaN(n) || n < 0) ? 2 : n;
    }

    function fnFormat() {
        var text = DOM.input.value;
        var parsed = parseJSON(text);
        if (!parsed.ok) {
            setError(parsed.error);
            DOM.output.value = '';
            renderTree(null);
            updateStats(text, 0);
            return;
        }
        var formatted = JSON.stringify(parsed.value, null, getIndent());
        DOM.output.value = formatted;
        clearError();
        setOutOk();
        flashButton(DOM.format, 'Formatted ✓');
        maybeWarnBigInt(parsed.bigInt);
        renderTree(parsed.value);
        updateStats(text, formatted.length, 'formatted');
    }

    function fnMinify() {
        var text = DOM.input.value;
        var parsed = parseJSON(text);
        if (!parsed.ok) {
            setError(parsed.error);
            DOM.output.value = '';
            renderTree(null);
            updateStats(text, 0);
            return;
        }
        var minified = JSON.stringify(parsed.value);
        DOM.output.value = minified;
        clearError();
        setOutOk();
        flashButton(DOM.minify, 'Minified ✓');
        maybeWarnBigInt(parsed.bigInt);
        renderTree(parsed.value);
        updateStats(text, minified.length, 'minified');
    }

    function fnValidate() {
        var text = DOM.input.value;
        var parsed = parseJSON(text);
        if (parsed.ok) {
            DOM.output.value = '✓ Valid JSON';
            setOutOk();
            clearError();
            renderTree(parsed.value);
            maybeWarnBigInt(parsed.bigInt);
            updateStats(text, 0, 'validated');
        } else {
            DOM.output.value = '';
            setError(parsed.error);
            renderTree(null);
            updateStats(text, 0);
        }
    }

    function fnSort() {
        var text = DOM.input.value;
        var parsed = parseJSON(text);
        if (!parsed.ok) {
            setError(parsed.error);
            return;
        }
        var sorted = sortKeys(parsed.value);
        DOM.output.value = JSON.stringify(sorted, null, getIndent());
        clearError();
        setOutOk();
        renderTree(sorted);
        flashButton(DOM.sort, 'Sorted ✓');
        updateStats(DOM.input.value, DOM.output.value.length, 'sorted');
    }

    function sortKeys(v) {
        if (Array.isArray(v)) return v.map(sortKeys);
        if (v && typeof v === 'object') {
            var out = {};
            Object.keys(v).sort().forEach(function (k) { out[k] = sortKeys(v[k]); });
            return out;
        }
        return v;
    }

    function fnDownload() {
        var v = DOM.output.value;
        if (!v || v === '✓ Valid JSON') return;
        if (typeof URL === 'undefined' || !URL.createObjectURL) return; // no-op where unsupported
        var min = DOM.output.value.indexOf('\n') === -1 && DOM.output.value.length < v.length * 2;
        var name = min ? 'minified.json' : 'formatted.json';
        var blob = new Blob([v], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
        flashButton(DOM.download, 'Saved ✓');
    }

    function fnCopy() {
        if (!DOM.output.value) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(DOM.output.value).then(function () {
                flashButton(DOM.copy, 'Copied!');
            }).catch(function () {
                fallbackCopy(DOM.output.value);
            });
        } else {
            fallbackCopy(DOM.output.value);
        }
    }

    function fnClear() {
        DOM.input.value = '';
        DOM.output.value = '';
        clearError();
        renderTree(null);
        updateStats('', 0);
        if (DOM.fileMsg) DOM.fileMsg.textContent = '';
        DOM.input.focus();
    }

    function onInput() {
        clearError();
        DOM.output.value = '';
        DOM.output.style.color = 'var(--text)';
        renderTree(null);
        renderHighlight();
        updateStats(DOM.input.value, 0);
    }

    function maybeReformat() {
        if (DOM.output.value && DOM.output.value !== '✓ Valid JSON' && DOM.output.style.color === 'var(--green)') {
            if (!DOM.input.value.trim()) return;
            fnFormat();
        }
    }

    /* ── file open + drag/drop ────────────────────────────────────────── */
    function onFile() {
        var f = this.files && this.files[0];
        if (f) readFile(f);
    }
    function onDragOver(e) { e.preventDefault(); DOM.input.classList.add('gt-drag'); }
    function onDragLeave() { DOM.input.classList.remove('gt-drag'); }
    function onDrop(e) {
        e.preventDefault();
        DOM.input.classList.remove('gt-drag');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
    }
    function readFile(f) {
        if (f.size > 20 * 1024 * 1024) {
            setError('That file is ' + (f.size / 1048576).toFixed(1) + ' MB - the practical browser limit here is 20 MB.');
            return;
        }
        var rd = new FileReader();
        rd.onload = function () {
            DOM.input.value = String(rd.result);
            if (DOM.fileMsg) DOM.fileMsg.textContent = f.name;
            fnFormat();
        };
        rd.onerror = function () { setError('Could not read ' + f.name + '.'); };
        rd.readAsText(f);
    }

    /* ── tree view ─────────────────────────────────────────────────────── */
    function renderTree(value) {
        if (!DOM.tree) return;
        if (value === null || value === undefined) {
            DOM.tree.innerHTML = '';
            DOM.tree.hidden = true;
            if (DOM.treeCard) DOM.treeCard.hidden = true;
            return;
        }
        DOM.tree.hidden = false;
        if (DOM.treeCard) DOM.treeCard.hidden = false;
        DOM.tree.innerHTML = '';
        DOM.tree.appendChild(treeNode(value, 'root', 0));
    }

    function treeNode(v, key, depth) {
        var wrap = document.createElement('div');
        wrap.className = 'gt-node';
        var isObj = v && typeof v === 'object';
        if (isObj) {
            var details = document.createElement('details');
            details.open = depth < 2;
            var summary = document.createElement('summary');
            var bracket = Array.isArray(v) ? 'array' : 'object';
            var count = Array.isArray(v) ? v.length : Object.keys(v).length;
            summary.innerHTML = '<span class="gt-k">' + esc(key) + '</span> <span class="gt-tt">' + bracket + '</span> <span class="gt-cc">(' + count + ')</span>';
            details.appendChild(summary);
            if (Array.isArray(v)) {
                v.forEach(function (item, i) { details.appendChild(treeNode(item, String(i), depth + 1)); });
            } else {
                Object.keys(v).forEach(function (k) { details.appendChild(treeNode(v[k], k, depth + 1)); });
            }
            wrap.appendChild(details);
        } else {
            var line = document.createElement('div');
            line.className = 'gt-leaf';
            var type = v === null ? 'null' : typeof v;
            line.innerHTML = '<span class="gt-k">' + esc(key) + ':</span> <span class="gt-v gt-' + type + '">' + esc(String(v)) + '</span>';
            wrap.appendChild(line);
        }
        return wrap;
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ── syntax highlight (token <pre> view) ───────────────────────────── */
    function renderHighlight() {
        var hl = document.getElementById('json-hl');
        if (!hl) return;
        var on = DOM.highlight && DOM.highlight.checked;
        var val = DOM.output.value;
        if (!on || !val || val === '✓ Valid JSON') {
            hl.hidden = true;
            DOM.output.classList.remove('gt-hidden-ta');
            return;
        }
        hl.innerHTML = highlightJSON(val);
        hl.hidden = false;
        DOM.output.classList.add('gt-hidden-ta');
    }

    function highlightJSON(src) {
        // Tokenize the RAW JSON (esc would turn quotes into &quot; and the
        // string regex would never match), then escape each token's content
        // as it is wrapped. Structural chars ({}[],:) pass through raw -
        // they are HTML-safe by JSON's grammar.
        return src.replace(
            /("(?:\\.|[^"\\])*")(\s*:)?|(-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g,
            function (m, str, colon, num, bool, nul) {
                if (str && colon) return '<span class="tk-k">' + esc(str) + '</span>' + colon;
                if (str) return '<span class="tk-s">' + esc(str) + '</span>';
                if (num) return '<span class="tk-n">' + num + '</span>';
                if (bool) return '<span class="tk-b">' + bool + '</span>';
                if (nul) return '<span class="tk-nl">' + nul + '</span>';
                return m;
            }
        );
    }

    /* ── Utilities ────────────────────────────────────────────────────── */

    function setOutOk() { DOM.output.style.color = 'var(--green)'; renderHighlight(); }

    function maybeWarnBigInt(unsafe) {
        if (unsafe) {
            var w = document.getElementById('json-warn');
            if (w) {
                w.textContent = '⚠ Heads-up: an integer above 2^53 (9007199254740991) was detected - JavaScript rounds these silently. The formatted output may not byte-match your source for that value.';
                w.hidden = false;
            }
        } else {
            var w = document.getElementById('json-warn');
            if (w) { w.textContent = ''; w.hidden = true; }
        }
    }

    function setError(msg) {
        DOM.error.textContent = '✕ ' + msg;
        DOM.error.hidden = false;
        renderHighlight();
    }

    function clearError() {
        DOM.error.textContent = '';
        DOM.error.hidden = true;
    }

    function fmtKB(n) { return (n / 1024).toFixed(2) + ' KB'; }
    function plural(n, unit) { return n + ' ' + unit + (n === 1 ? '' : 's'); }
    function setStatRow(id, text) {
        var el = document.getElementById(id);
        if (el) el.querySelector('.gt-stat-val').textContent = text;
    }
    function updateStats(input, outputLen, action) {
        var text = input || '';
        var chars = text.length;
        var lines = chars ? text.split('\n').length : 0;
        setStatRow('json-stat-in', lines || chars ? plural(lines, 'line') + ' · ' + chars + ' chars · ' + fmtKB(chars) : ' - ');

        var outText = DOM.output.value || '';
        if (action === 'validated') {
            setStatRow('json-stat-out', 'valid JSON ✓');
            return;
        }
        var outIsResult = outText && outText !== '✓ Valid JSON';
        if (!outIsResult) {
            setStatRow('json-stat-out', ' - ');
            return;
        }
        var oChars = outText.length;
        var oLines = outText ? outText.split('\n').length : 0;
        var base = plural(oLines, 'line') + ' · ' + oChars + ' chars · ' + fmtKB(oChars);
        var tail = '';
        if (action === 'minified' && chars > 0) {
            var saved = chars - oChars;
            var pct = Math.max(0, Math.round((saved / chars) * 100));
            tail = ' · saved ' + saved + ' chars (−' + pct + '%) - minified';
        } else if (action === 'formatted') {
            tail = ' - formatted';
        } else if (action === 'sorted') {
            tail = ' - sorted';
        } else if (action === 'validated') {
            tail = ' - valid ✓';
        }
        setStatRow('json-stat-out', base + tail);
    }

    function flashButton(btn, msg) {
        var orig = btn.textContent;
        btn.textContent = msg;
        btn.style.borderColor = 'var(--green-border)';
        btn.style.color = 'var(--green)';
        setTimeout(function () {
            btn.textContent = orig;
            btn.style.borderColor = '';
            btn.style.color = '';
        }, 1200);
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            flashButton(DOM.copy, 'Copied!');
        } catch (e) {
            flashButton(DOM.copy, 'Failed');
        }
        document.body.removeChild(ta);
    }

    document.addEventListener('DOMContentLoaded', init);
})();