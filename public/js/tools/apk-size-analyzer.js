/* ============================================================
   APK Size Analyzer - v1.21.0
   100% client-side, ZERO dependencies (no JSZip - the tool law).
   Reads the APK (a ZIP) in the browser and answers:
     "where is my bloat?" - dex / libs per ABI / res / assets /
     resources.arsc / everything else - plus trim tips.

   How it works, honestly:
   1. ZIP central directory (at the end of the file) gives every
      entry's name + compressed + UNCOMPRESSED size - pure
      metadata, no decompression needed for the size breakdown.
   2. For AndroidManifest.xml only, we inflate it (raw DEFLATE,
      hand-rolled - ~180 lines) and parse the binary AXML to pull
      package name, versionName, minSdk and targetSdk.
   3. Nothing is uploaded; the file never leaves the device.
   ============================================================ */
(function () {
	'use strict';

	/* ── 1. raw DEFLATE inflater (RFC 1951) ───────────────────
	   Minimal but correct: stored, fixed-Huffman and dynamic-
	   Huffman blocks. Good enough for any APK's manifest. */
	function inflateRaw(u8) {
		var out = [];
		var pos = 0;
		var bitbuf = 0, bitcnt = 0;

		function need(n) {
			while (bitcnt < n) {
				if (pos >= u8.length) throw new Error('deflate: out of input');
				bitbuf |= u8[pos++] << bitcnt;
				bitcnt += 8;
			}
		}
		function bits(n) { need(n); var v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v; }

		function buildHuff(lengths) {
			// returns a decode table: [counts, symbols] like puff.c
			var MAXBITS = 15;
			var count = new Array(MAXBITS + 1).fill(0);
			var i;
			for (i = 0; i < lengths.length; i++) count[lengths[i]]++;
			count[0] = 0;
			var offs = new Array(MAXBITS + 2).fill(0);
			for (i = 1; i <= MAXBITS; i++) offs[i + 1] = offs[i] + count[i];
			var symbols = new Array(lengths.length);
			for (i = 0; i < lengths.length; i++) if (lengths[i] !== 0) symbols[offs[lengths[i]]++] = i;
			return { count: count, symbol: symbols };
		}
		function decode(h) {
			var code = 0, first = 0, index = 0, len;
			for (len = 1; len <= 15; len++) {
				code |= bits(1);
				var cnt = h.count[len];
				if (code - first < cnt) return h.symbol[index + (code - first)];
				index += cnt;
				first = (first + cnt) << 1;
				code <<= 1;
			}
			throw new Error('deflate: bad huffman code');
		}

		var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
		var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
		var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
		var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
		var CLIDX = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

		function codes(lit, dist) {
			for (;;) {
				var sym = decode(lit);
				if (sym < 256) { out.push(sym); continue; }
				if (sym === 256) return;
				sym -= 257;
				if (sym >= 29) throw new Error('deflate: bad length symbol');
				var len = LBASE[sym] + bits(LEXT[sym]);
				var dsym = decode(dist);
				if (dsym >= 30) throw new Error('deflate: bad distance symbol');
				var d = DBASE[dsym] + bits(DEXT[dsym]);
				if (d > out.length) throw new Error('deflate: distance too far back');
				var from = out.length - d;
				for (var i = 0; i < len; i++) out.push(out[from + i]);
			}
		}

		for (;;) {
			var last = bits(1);
			var type = bits(2);
			if (type === 0) {
				// stored
				bitbuf = 0; bitcnt = 0;
				if (pos + 4 > u8.length) throw new Error('deflate: stored overrun');
				var len = u8[pos] | (u8[pos + 1] << 8);
				pos += 4;
				for (var i = 0; i < len; i++) out.push(u8[pos++]);
			} else if (type === 1) {
				var litLens = new Array(288);
				for (var i = 0; i < 144; i++) litLens[i] = 8;
				for (; i < 256; i++) litLens[i] = 9;
				for (; i < 280; i++) litLens[i] = 7;
				for (; i < 288; i++) litLens[i] = 8;
				var distLens = new Array(30).fill(5);
				codes(buildHuff(litLens), buildHuff(distLens));
			} else if (type === 2) {
				var hlit = bits(5) + 257;
				var hdist = bits(5) + 1;
				var hclen = bits(4) + 4;
				var clLens = new Array(19).fill(0);
				for (var i = 0; i < hclen; i++) clLens[CLIDX[i]] = bits(3);
				var clHuff = buildHuff(clLens);
				var lens = [];
				while (lens.length < hlit + hdist) {
					var sym = decode(clHuff);
					if (sym < 16) lens.push(sym);
					else if (sym === 16) {
						var prev = lens[lens.length - 1];
						var rep16 = 3 + bits(2); // read ONCE - never inside the loop condition
						for (var r = 0; r < rep16; r++) lens.push(prev);
					}
					else if (sym === 17) {
						var rep17 = 3 + bits(3);
						for (var r = 0; r < rep17; r++) lens.push(0);
					}
					else {
						var rep18 = 11 + bits(7);
						for (var r = 0; r < rep18; r++) lens.push(0);
					}
				}
				codes(buildHuff(lens.slice(0, hlit)), buildHuff(lens.slice(hlit, hlit + hdist)));
			} else {
				throw new Error('deflate: bad block type');
			}
			if (last) break;
		}
		return Uint8Array.from(out);
	}

	/* ── 2. ZIP central-directory reader ────────────────────── */
	function findEOCD(u8) {
		// End-of-central-directory record: scan back up to 64KB
		var lo = Math.max(0, u8.length - 65557);
		for (var i = u8.length - 22; i >= lo; i--) {
			if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) return i;
		}
		throw new Error('not a ZIP/APK (no end-of-central-directory found)');
	}
	function readU16(u8, p) { return u8[p] | (u8[p + 1] << 8); }
	function readU32(u8, p) { return (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0; }

	function readCentralDirectory(u8) {
		var eocd = findEOCD(u8);
		var total = readU16(u8, eocd + 10);
		var cdOff = readU32(u8, eocd + 16);
		var entries = [];
		var p = cdOff;
		for (var n = 0; n < total; n++) {
			if (readU32(u8, p) !== 0x02014b50) break; // central file header sig
			var method = readU16(u8, p + 10);
			var csize = readU32(u8, p + 20);
			var usize = readU32(u8, p + 24);
			var nameLen = readU16(u8, p + 28);
			var extraLen = readU16(u8, p + 30);
			var commentLen = readU16(u8, p + 32);
			var lfhOff = readU32(u8, p + 42);
			var name = '';
			for (var i = 0; i < nameLen; i++) name += String.fromCharCode(u8[p + 46 + i]);
			entries.push({ name: name, method: method, csize: csize, usize: usize, lfhOff: lfhOff });
			p += 46 + nameLen + extraLen + commentLen;
		}
		if (!entries.length) throw new Error('ZIP central directory is empty');
		return entries;
	}

	/* ── 3. binary AXML (AndroidManifest.xml) reader ──────────
	   Only what we need: string pool + start-element walk to find
	   manifest/package, uses-sdk minSdkVersion, targetSdkVersion,
	   and application/versionName attribute values. */
	function parseAxml(u8) {
		var magic = readU32(u8, 0);
		if (magic !== 0x00080003 && magic !== 0x00080001) throw new Error('axml: unexpected header');

		// --- RES_STRING_POOL_TYPE at offset 8 ---
		// chunk: type(2)@0 headerSize(2)@2 size(4)@4 | strCount(4)@8 styleCount(4)@12
		// flags(4)@16 stringsStart(4)@20 stylesStart(4)@24 | offsets@28
		var spOff = 8;
		var strCount = readU32(u8, spOff + 8);
		var flags = readU32(u8, spOff + 16);
		var strStart = readU32(u8, spOff + 20);
		var isUtf8 = (flags & (1 << 8)) !== 0;
		var strings = [];
		var i;
		for (i = 0; i < strCount; i++) {
			var off = spOff + strStart + readU32(u8, spOff + 28 + i * 4);
			var s = '';
			if (isUtf8) {
				// utf8: [u16 len] [u8 len] bytes [u8 0]  (2-byte len if high bit)
				var l1 = u8[off]; off++;
				if (l1 & 0x80) { l1 = ((l1 & 0x7f) << 8) | u8[off]; off++; }
				var l2 = u8[off]; off++;
				if (l2 & 0x80) { l2 = ((l2 & 0x7f) << 8) | u8[off]; off++; }
				for (var j = 0; j < l2; j++) s += String.fromCharCode(u8[off + j]);
			} else {
				var len = readU16(u8, off); off += 2;
				if (len & 0x8000) { len = ((len & 0x7fff) << 16) | readU16(u8, off); off += 2; }
				for (var j = 0; j < len; j++) {
					var c = readU16(u8, off + j * 2);
					if (c !== 0) s += String.fromCharCode(c);
				}
			}
			strings.push(s);
		}

		// --- walk the chunk stream for START elements ---
		var res = { package: null, versionName: null, minSdk: null, targetSdk: null };
		var p = spOff + readU32(u8, spOff + 4); // skip the string pool chunk
		while (p + 8 <= u8.length) {
			var type = readU16(u8, p);          // chunk type @ +0
			var size = readU32(u8, p + 4);      // chunk size @ +4
			if (size < 8) break;
			if (type === 0x0102) { // RES_XML_START_ELEMENT_TYPE
				var nameIdx = readU32(u8, p + 20);
				var elName = strings[nameIdx] || '';
				var attrCount = readU16(u8, p + 28);
				var attrBase = p + 36;
				for (var a = 0; a < attrCount; a++) {
					var ap = attrBase + a * 20;
					var aNameIdx = readU32(u8, ap + 4);
					var aName = strings[aNameIdx] || '';
					var aType = (readU32(u8, ap + 12) >> 24) & 0xff;
					var aVal;
					if (aType === 3) aVal = strings[readU32(u8, ap + 16)] || '';
					else aVal = String(readU32(u8, ap + 16) >>> 0);
					if (elName === 'manifest') {
						if (aName === 'package') res.package = aVal;
						if (aName === 'versionName') res.versionName = aVal;
						if (aName === 'versionCode') res.versionCode = aVal;
					} else if (elName === 'uses-sdk') {
						if (aName === 'minSdkVersion') res.minSdk = aVal;
						if (aName === 'targetSdkVersion') res.targetSdk = aVal;
					}
				}
			}
			p += size;
		}
		return res;
	}

	/* expose for tests */
	if (typeof window !== 'undefined') {
		window.__apkInternals = { inflateRaw: inflateRaw, readCentralDirectory: readCentralDirectory, parseAxml: parseAxml };
	}

	/* ── 4. analysis: group + flags + tips ──────────────────── */
	function human(n) {
		if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
		if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
		return n + ' B';
	}

	function analyze(entries) {
		var groups = {
			dex: { label: 'Code (classes*.dex)', size: 0, files: 0, items: [] },
			lib: { label: 'Native libs (lib/)', size: 0, files: 0, items: [] },
			res: { label: 'Resources (res/)', size: 0, files: 0, items: [] },
			assets: { label: 'Assets (assets/)', size: 0, files: 0, items: [] },
			arsc: { label: 'resources.arsc', size: 0, files: 0, items: [] },
			other: { label: 'Everything else', size: 0, files: 0, items: [] },
		};
		var flags = [];
		var tips = [];
		var totalU = 0;

		entries.forEach(function (e) {
			if (e.name.endsWith('/')) return; // directory entries
			var sz = e.usize || e.csize;
			totalU += sz;
			var g;
			if (/^classes\d*\.dex$/.test(e.name)) g = groups.dex;
			else if (/^lib\//.test(e.name)) g = groups.lib;
			else if (/^res\//.test(e.name)) g = groups.res;
			else if (/^assets\//.test(e.name)) g = groups.assets;
			else if (e.name === 'resources.arsc') g = groups.arsc;
			else g = groups.other;
			g.size += sz; g.files++;
			g.items.push({ name: e.name, size: sz });
		});

		// libs per ABI
		var abis = {};
		entries.forEach(function (e) {
			var m = /^lib\/([^/]+)\//.exec(e.name);
			if (m) { abis[m[1]] = (abis[m[1]] || 0) + (e.usize || e.csize); }
		});

		// flags + tips (honest thresholds - an APK is not an iOS app; multi-ABI is normal)
		if (groups.lib.size > 8 * 1048576) flags.push({ sev: 'warn', txt: 'Native libs are ' + human(groups.lib.size) + ' - check if you ship every ABI you actually need.' });
		var abiNames = Object.keys(abis);
		if (abiNames.length >= 4) flags.push({ sev: 'info', txt: 'You ship ' + abiNames.length + ' ABIs (' + abiNames.join(', ') + ') - an App Bundle strips these per device; a raw APK carries them all.' });
		if (groups.dex.size > 8 * 1048576) flags.push({ sev: 'warn', txt: 'Dex code is ' + human(groups.dex.size) + ' - R8/ProGuard shrinking and the legacy-dex handoff are the usual wins.' });
		if (groups.res.size > 10 * 1048576) flags.push({ sev: 'warn', txt: 'res/ is ' + human(groups.res.size) + ' - look for oversized drawables, raw PNGs that could be WebP, and density buckets you do not use.' });
		if (groups.arsc.size > 4 * 1048576) flags.push({ sev: 'info', txt: 'resources.arsc is ' + human(groups.arsc.size) + ' - often translations and unused resources; resource shrinking helps.' });
		if (groups.assets.size > 10 * 1048576) flags.push({ sev: 'warn', txt: 'assets/ is ' + human(groups.assets.size) + ' - fonts, videos and bundled models live here; verify each is actually used.' });
		var mf = entries.filter(function (e) { return /(^|\/)META-INF\//.test(e.name) && !/\.SF$|\.RSA$|\.MF$/.test(e.name); });
		if (mf.length) tips.push('META-INF carries ' + mf.length + ' non-signature entries - usually fine, but check for stray files.');

		tips.push('Ship an App Bundle (.aab) and let Play strip densities/ABIs per device - the raw APK you test locally is always bigger.');
		if (groups.lib.size > 0) tips.push('If you only need arm64-v8a + armeabi-v7a, abiFilters in Gradle removes the rest from local builds.');
		if (groups.res.size > 0) tips.push('Convert large PNGs to WebP (lossless is ~26% smaller), and prefer vector drawables for icons.');
		tips.push('Enable resource shrinking (shrinkResources true with minifyEnabled) - it strips unused strings/drawables from res/ and arsc.');
		tips.push('Check debug symbols: release .so files should be unstripped only in your symbol upload, never in the APK itself.');

		return { groups: groups, abis: abis, flags: flags, tips: tips, total: totalU };
	}

	/* ── 5. UI wiring ───────────────────────────────────────── */
	function $(id) { return document.getElementById(id); }
	var fileIn = $('apk-file'), fileLabel = $('apk-filelabel'), drop = $('apk-drop'),
		resWrap = $('apk-results'), errEl = $('apk-err'), metaEl = $('apk-meta'),
		summaryEl = $('apk-summary'), flagsEl = $('apk-flags'), tipsEl = $('apk-tips'),
		abisEl = $('apk-abis'), topEl = $('apk-top');

	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

	function fail(msg) {
		errEl.hidden = false;
		errEl.textContent = msg;
		resWrap.hidden = true;
	}

	function renderReport(rep, manifest) {
		var g = rep.groups;
		var parts = [];
		var order = ['dex', 'lib', 'res', 'arsc', 'assets', 'other'];
		order.forEach(function (k) {
			var grp = g[k];
			var pct = rep.total ? Math.round(grp.size / rep.total * 100) : 0;
			var bar = pct > 100 ? 100 : pct;
			parts.push(
				'<div class="apk-row">' +
				'<div class="apk-row-top"><span class="apk-name">' + esc(grp.label) + '</span>' +
				'<span class="apk-size">' + human(grp.size) + ' · ' + pct + '% · ' + grp.files + ' files</span></div>' +
				'<div class="apk-bar"><span class="apk-fill" style="width:' + bar + '%"></span></div>' +
				'</div>'
			);
		});

		summaryEl.innerHTML = parts.join('');
		metaEl.textContent = manifest && manifest.package
			? manifest.package + (manifest.versionName ? ' v' + manifest.versionName : '') +
			  (manifest.versionCode ? ' (' + manifest.versionCode + ')' : '') +
			  (manifest.minSdk ? ' · minSdk ' + manifest.minSdk : '') +
			  (manifest.targetSdk ? ' · target ' + manifest.targetSdk : '')
			: '';

		var abisRows = Object.keys(rep.abis).sort().map(function (a) {
			return '<span class="apk-abi">' + esc(a) + ' · ' + human(rep.abis[a]) + '</span>';
		}).join('');
		abisEl.innerHTML = abisRows || '';

		flagsEl.innerHTML = rep.flags.map(function (f) {
			return '<div class="apk-flag apk-' + f.sev + '">' + esc(f.txt) + '</div>';
		}).join('') || '<div class="apk-flag apk-info">No bloat flags - this APK looks lean.</div>';

		tipsEl.innerHTML = rep.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

		// top 12 largest files
		var all = [];
		order.forEach(function (k) { g[k].items.forEach(function (it) { all.push(it); }); });
		all.sort(function (a, b) { return b.size - a.size; });
		topEl.innerHTML = all.slice(0, 12).map(function (it) {
			return '<div class="apk-toprow"><span class="apk-topname" title="' + esc(it.name) + '">' + esc(it.name) + '</span><span class="apk-topsize">' + human(it.size) + '</span></div>';
		}).join('');

		resWrap.hidden = false;
	}

	function handleFile(file) {
		errEl.hidden = true;
		fileLabel.textContent = file.name + ' · ' + human(file.size);
		var rd = new FileReader();
		rd.onload = function () {
			try {
				var u8 = new Uint8Array(rd.result);
				var entries = readCentralDirectory(u8);
				var rep = analyze(entries);

				// try the manifest (inflate + AXML) - failure is non-fatal
				var manifest = null;
				try {
					var mf = entries.find(function (e) { return e.name === 'AndroidManifest.xml'; });
					if (mf) {
						// local file header: nameLen at +26, extra at +28; data follows
						var nl = readU16(u8, mf.lfhOff + 26);
						var el = readU16(u8, mf.lfhOff + 28);
						var dataOff = mf.lfhOff + 30 + nl + el;
						var raw;
						if (mf.method === 8) raw = inflateRaw(u8.subarray(dataOff, dataOff + mf.csize));
						else raw = u8.subarray(dataOff, dataOff + mf.csize);
						manifest = parseAxml(raw);
					}
				} catch (axErr) {
					manifest = null; // honest: analysis continues without it
				}
				renderReport(rep, manifest);
			} catch (e) {
				fail('Could not read this APK: ' + (e && e.message ? e.message : 'unknown error'));
			}
		};
		rd.onerror = function () { fail('Could not read the file.'); };
		rd.readAsArrayBuffer(file);
	}

	fileIn.addEventListener('change', function () {
		var f = this.files && this.files[0];
		if (f) handleFile(f);
	});
	if (drop) {
		drop.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); }
		});
		['dragover', 'dragenter'].forEach(function (ev) {
			drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('apk-over'); });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('apk-over'); });
		});
		drop.addEventListener('drop', function (e) {
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (f) handleFile(f);
		});
	}
})();