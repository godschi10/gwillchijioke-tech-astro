/* ============================================================
   Image Compressor / Resizer / WebP Converter - client-side
   Multi-image batch (v1.19.69). Pure browser: Canvas API to
   decode, resize, and re-encode. NOTHING is uploaded - files
   never leave the device.

   Built on the "img-min" master build (King's pick) + the batch
   upgrade the King ordered:
   - #1  Multi-image upload (select several at once) - each image
         gets its own before/after card + its own Download.
   - #4  Before/after dual display (original vs compressed,
         side by side, so the user sees the result before they
         download it).
   - #5  Type-a-percent input beside the scale slider (both sync).
   - iOS/iPadOS share-sheet download fix (the one pain point).
   - JPEG white fill (transparency never goes black).
   - HEIC: MIME + filename + ftyp byte-sniff.
   ============================================================ */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var input = $('imc-file'),
      zone = $('imc-zone'), chooseBtn = $('imc-chooseBtn'), panel = $('imc-panel'), msg = $('imc-msg'), upcard = $('imc-upcard'), resultscard = $('imc-resultscard'),
      results = $('imc-results'),
      q = $('imc-q'), qTxt = $('imc-qTxt'), qRow = $('imc-qRow'),
      pct = $('imc-pct'), pctTxt = $('imc-pctTxt'), pctRow = $('imc-pctRow'), pxRow = $('imc-pxRow'),
      wIn = $('imc-wIn'), hIn = $('imc-hIn'), lock = $('imc-lockAspect'),
      dlAll = $('imc-dlAll'), dlZip = $('imc-dlZip'), dlAllWrap = $('imc-dlAllWrap'),
      summary = $('imc-summary'), sumOrig = $('imc-sumOrig'), sumNew = $('imc-sumNew'), sumBadge = $('imc-sumBadge');

  var MIMES = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' };
  var EXTS = { webp: 'webp', jpeg: 'jpg', png: 'png' };
  var NAMES = { webp: 'WebP', jpeg: 'JPEG', png: 'PNG' };
  var HEIC_MSG = 'That looks like an HEIC photo (iPhone/Samsung). Export it as JPG or PNG first.';
  var DECODE_MSG = 'Could not decode that image. Try a different file.';

  /* Each entry = one uploaded image + its own decoded src + output. */
  var items = [];
  var seq = 0; // unique item id; also guards stale async work
  var tmr = null;

  /* ---------- helpers ---------- */
  function showMsg(text, kind) { msg.textContent = text; msg.className = 'imc-msg' + (kind ? ' ' + kind : ''); msg.hidden = false; }
  function clearMsg() { msg.hidden = true; msg.className = 'imc-msg'; }
  function fmtSize(n) {
    if (n < 1024) return String(n) + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function baseName(name) {
    var b = String(name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '');
    if (b.length > 60) b = b.slice(0, 60);
    return b || 'image';
  }
  /* King (v1.19.72): downloaded files keep the ORIGINAL name but append the
     site URL - e.g. photo1.webp -> photo1-tech.gwillchijioke.com.webp (the
     "site slug" is the host with 'www.' stripped). Used for per-card, all and
     ZIP so every download carries the brand. */
  function siteSlug() {
    var h = String(location.hostname || '').replace(/^www\./i, '');
    return h || 'gwillchijioke.com';
  }
  function downloadName(fileName, ext) {
    return baseName(fileName) + '-' + siteSlug() + '.' + ext;
  }
  function fmtVal() { var el = document.querySelector('input[name="imc-fmt"]:checked'); return el ? el.value : 'webp'; }
  function modeVal() { var el = document.querySelector('input[name="imc-rmode"]:checked'); return el ? el.value : 'pct'; }
  function schedule() { if (tmr) clearTimeout(tmr); tmr = setTimeout(processAll, 160); }

  /* ---------- decode ---------- */
  function decodeViaImg(f) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(f);
      var im = new Image();
      im.onload = function () { resolve({ src: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.decoding = 'async';
      im.src = url;
    });
  }
  function decodeFile(f) {
    try {
      if (typeof createImageBitmap === 'function') {
        return createImageBitmap(f).then(
          function (b) { return { src: b, url: null }; },
          function () { return decodeViaImg(f); }
        );
      }
    } catch (e) {}
    return decodeViaImg(f);
  }

  /* ---------- HEIC detection (R3) ---------- */
  function looksHeicByName(f) {
    var t = String(f.type || '').toLowerCase();
    if (t.lastIndexOf('image/heic', 0) === 0 || t.lastIndexOf('image/heif', 0) === 0) return true;
    return /\.hei[cf]$/i.test(String(f.name || ''));
  }
  function looksHeicByBytes(f) {
    return f.slice(0, 12).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf), s = '';
      for (var i = 4; i < 12 && i < b.length; i++) s += String.fromCharCode(b[i]);
      return /^ftyp(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1)$/.test(s);
    }, function () { return false; });
  }

  /* ---------- add a batch of files ---------- */
  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name); });
    if (!files.length) { showMsg('No supported images found (PNG / JPG / WebP).', 'imc-err'); return; }
    clearMsg();

    zone.hidden = true; chooseBtn.hidden = true;
    if (upcard) upcard.hidden = true;
    var pending = files.length;
    files.forEach(function (f) {
      var myId = ++seq;
      var it = { id: myId, file: f, dec: null, srcURL: null, outURL: null, outBlob: null, outW: 0, outH: 0, outFmt: '', done: false, err: '' };
      items.push(it);

      // Reserve a card immediately so the user sees all slots.
      renderCard(it);

      (function (it, f) {
        Promise.resolve(looksHeicByName(f)).then(function (nameHeic) {
          return nameHeic ? true : looksHeicByBytes(f);
        }).then(function (heic) {
          if (heic) {
            it.err = HEIC_MSG; it.done = true;
            updateCard(it); return null;
          }
          return decodeFile(f);
        }).then(function (dec) {
          if (!dec) return;
          var w = dec.src.width || dec.src.naturalWidth || 0;
          var h = dec.src.height || dec.src.naturalHeight || 0;
          if (!w || !h) { it.err = DECODE_MSG; it.done = true; updateCard(it); return; }
          it.dec = dec; it.w = w; it.h = h;
          updateCard(it);
          return encodeOne(it);
        }).catch(function () {
          it.err = DECODE_MSG; it.done = true;
          updateCard(it);
        }).then(function () {
          pending--;
          if (pending <= 0) { panel.hidden = false; results.hidden = false; if (resultscard) resultscard.hidden = false;; schedule(); }
        });
      })(it, f);
    });
  }

  /* ---------- render a before/after card ---------- */
  function renderCard(it) {
    var card = document.createElement('div');
    card.className = 'imc-item';
    card.dataset.id = String(it.id);
    var fname = it.file && it.file.name ? it.file.name : 'original';
    var short = fname.length > 28 ? fname.slice(0, 25) + '…' : fname;
    card.innerHTML =
      '<div class="imc-item__head">' +
        '<span class="imc-item__name" data-i18n="name"></span>' +
        '<span class="imc-badge" data-i18n="badge">…</span>' +
      '</div>' +
      '<div class="imc-item__previews">' +
        '<figure class="imc-ba"><img class="imc-ba__img" data-role="before" alt="' + esc(fname) + '"><figcaption class="imc-ba__cap" data-role="beforeCap">' + esc(short) + '</figcaption></figure>' +
        '<figure class="imc-ba"><img class="imc-ba__img" data-role="after" alt="compressed preview"><figcaption class="imc-ba__cap" data-role="afterCap">compressed</figcaption></figure>' +
      '</div>' +
      '<div class="imc-actions">' +
        '<button type="button" class="imc-btn imc-primary imc-disabled" data-role="dl" disabled>Download</button>' +
      '</div>' +
      '<p class="imc-capnote" data-root="capnote" hidden></p>';
    results.appendChild(card);
    var img = card.querySelector('[data-role="before"]');
    it.previewUrl = URL.createObjectURL(it.file);
    img.src = it.previewUrl;
    it.card = card;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- Download-all state ----------
     Enable both buttons when at least one image is encoded; show the wrap
     whenever there's at least one item. */
  function refreshDownloadAll() {
    var done = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].outBlob) done++; }
    if (!dlAllWrap) return;
    dlAllWrap.hidden = items.length === 0;
    if (dlAll) { dlAll.disabled = done === 0; dlAll.textContent = 'Download all' + (done ? ' (' + done + ')' : ''); }
    if (dlZip) { dlZip.disabled = done === 0; dlZip.textContent = 'Download ZIP' + (done ? ' (' + done + ')' : ''); }
    refreshSummary();
  }

  /* Total savings across every compressed image - shown at the top so the
     user sees the aggregate before downloading. */
  function refreshSummary() {
    if (!summary) return;
    var newOrig = 0, newDone = 0, done = 0, i;
    for (i = 0; i < items.length; i++) {
      if (items[i].outBlob) {
        newOrig += items[i].file.size;
        newDone += items[i].outBlob.size;
        done++;
      }
    }
    summary.hidden = done === 0;
    if (done === 0) return;
    if (sumOrig) sumOrig.textContent = fmtSize(newOrig);
    if (sumNew) sumNew.textContent = fmtSize(newDone);
    if (sumBadge) {
      var pct = newOrig > 0 ? Math.round((1 - newDone / newOrig) * 100) : 0;
      if (pct > 0) { sumBadge.textContent = '−' + pct + '%'; sumBadge.className = 'imc-badge imc-summary__badge imc-good'; }
      else if (pct === 0) { sumBadge.textContent = '0%'; sumBadge.className = 'imc-badge imc-summary__badge'; }
      else { sumBadge.textContent = '+' + Math.abs(pct) + '%'; sumBadge.className = 'imc-badge imc-summary__badge imc-bad'; }
    }
  }

  /* Gather every encoded image as a downloadable entry. */
  function readyBlobs() {
    var blobs = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].outBlob) {
        blobs.push({
          blob: items[i].outBlob,
          name: downloadName(items[i].file.name, EXTS[items[i].outFmt || fmtVal()]),
          mime: MIMES[items[i].outFmt || fmtVal()]
        });
      }
    }
    return blobs;
  }

  /* #1: Download all - one file per image, sequential/staggered so the
     browser's multiple-download gate is satisfied on desktop/Android. */
  function downloadAll() {
    var blobs = readyBlobs();
    if (!blobs.length) return;
    blobs.forEach(function (b, i) {
      setTimeout(function () { saveBlob(b.blob, b.name, b.mime); }, i * 350);
    });
  }

  /* ---------- Store-only ZIP writer (no dependency, file://-safe) ----------
     Images are already-compressed (JPEG/WebP/PNG) so deflate adds nothing;
     "stored" ZIP entries (method 0) still produce a fully valid .zip that any
     OS/archive tool opens. Pure JS (Uint8Array + DataView), no dependencies. */
  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
  }
  function crc32(bytes) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) { c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosDateTime() {
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time, date: date };
  }
  // Build a .zip blob from [{ name, data:Uint8Array }] using method 0 (stored).
  function buildZip(entries) {
    var dt = dosDateTime();
    var encoder = new TextEncoder();
    var chunks = [], central = [], localOffset = 0;
    entries.forEach(function (e) {
      var nameBytes = encoder.encode(e.name);
      var data = e.data;
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);        // local file header sig
      local.setUint16(4, 20, true);                // version needed
      local.setUint16(6, 0x0800, true);            // flags: UTF-8 names
      local.setUint16(8, 0, true);                 // method 0 = stored
      local.setUint16(10, dt.time, true);
      local.setUint16(12, dt.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);      // compressed size
      local.setUint32(22, data.length, true);      // uncompressed size
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);                // extra len
      chunks.push(new Uint8Array(local.buffer), nameBytes, data);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);           // central dir sig
      cd.setUint16(4, 20, true);                   // version made by
      cd.setUint16(6, 20, true);                   // version needed
      cd.setUint16(8, 0x0800, true);               // flags
      cd.setUint16(10, 0, true);                   // method 0
      cd.setUint16(12, dt.time, true);
      cd.setUint16(14, dt.date, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0, true);                   // extra
      cd.setUint16(32, 0, true);                   // comment
      cd.setUint16(34, 0, true);                   // disk start
      cd.setUint16(36, 0, true);                   // internal attrs
      cd.setUint32(38, 0, true);                   // external attrs
      cd.setUint32(42, localOffset, true);         // local header offset
      central.push(new Uint8Array(cd.buffer), nameBytes);
      localOffset += 30 + nameBytes.length + data.length;
    });
    var cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);           // EOCD sig
    eocd.setUint16(4, 0, true);                    // disk #
    eocd.setUint16(6, 0, true);                    // cd start disk
    eocd.setUint16(8, entries.length, true);       // entries this disk
    eocd.setUint16(10, entries.length, true);      // total entries
    eocd.setUint32(12, cdSize, true);              // cd size
    eocd.setUint32(16, localOffset, true);         // cd offset
    eocd.setUint16(20, 0, true);                   // comment len
    var total = localOffset + cdSize + 22;
    var out = new Uint8Array(total), pos = 0;
    chunks.concat(central).concat([new Uint8Array(eocd.buffer)]).forEach(function (c) { out.set(c, pos); pos += c.length; });
    return new Blob([out], { type: 'application/zip' });
  }

  /* #1: Download all as ZIP - one archive, many images (store-only). */
  function downloadZip() {
    var blobs = readyBlobs();
    if (!blobs.length) return;
    // Read each blob into bytes, then pack. Async because blob.arrayBuffer().
    var reads = blobs.map(function (b) {
      return b.blob.arrayBuffer().then(function (buf) {
        return { name: b.name, data: new Uint8Array(buf) };
      });
    });
    Promise.all(reads).then(function (entries) {
      var zip = buildZip(entries);
      var stamp = new Date();
      var label = 'gwill-images-' + stamp.getFullYear() + '-' + (stamp.getMonth() + 1) + '-' + stamp.getDate() + '.zip';
      saveBlob(zip, label, 'application/zip');
    }).catch(function (e) {
      showMsg('Could not build the ZIP archive: ' + (e && e.message ? e.message : 'unknown'), 'imc-err');
    });
  }

  function updateCard(it) {
    if (!it.card) return;
    var card = it.card;
    var name = card.querySelector('[data-i18n="name"]');
    var badge = card.querySelector('[data-i18n="badge"]');
    var beforeCap = card.querySelector('[data-role="beforeCap"]');
    var afterCap = card.querySelector('[data-role="afterCap"]');
    var dl = card.querySelector('[data-role="dl"]');
    var capnote = card.querySelector('[data-root="capnote"]');
    if (name) name.textContent = it.file ? it.file.name : 'image';
    if (beforeCap) beforeCap.textContent = 'original · ' + fmtSize(it.file ? it.file.size : 0) + (it.w ? ' · ' + it.w + '×' + it.h : '');

    if (it.err) {
      if (badge) { badge.textContent = '✕'; badge.className = 'imc-badge imc-bad'; }
      if (capnote) { capnote.textContent = it.err; capnote.hidden = false; }
      if (dl) { dl.disabled = true; dl.classList.add('imc-disabled'); }
      return;
    }

    // compressed preview
    var afterImg = card.querySelector('[data-role="after"]');
    if (it.outURL) {
      afterImg.src = it.outURL;
      afterImg.classList.add('is-live');
    }
    if (afterCap && it.outBlob) {
      afterCap.textContent = (it.outFmt || '') + ' · ' + fmtSize(it.outBlob.size) + (it.outW ? ' · ' + it.outW + '×' + it.outH : '');
    }
    if (badge && it.outBlob && it.file) {
      var sv = it.file.size, nv = it.outBlob.size;
      if (nv < sv) { badge.textContent = '−' + Math.round((1 - nv / sv) * 100) + '%'; badge.className = 'imc-badge imc-good'; }
      else if (nv === sv) { badge.textContent = '0%'; badge.className = 'imc-badge'; }
      else { badge.textContent = '+' + Math.round((nv / sv - 1) * 100) + '%'; badge.className = 'imc-badge imc-bad'; }
    }
    if (capnote && it.capText) { capnote.textContent = it.capText; capnote.hidden = false; } else if (capnote) { capnote.hidden = true; }

    if (it.outBlob) {
      dl.disabled = false;
      dl.classList.remove('imc-disabled');
      dl.textContent = 'Download .' + EXTS[it.outFmt || fmtVal()] + ' · ' + fmtSize(it.outBlob.size);
    }
    refreshDownloadAll();
  }

  /* ---------- encode one item ---------- */
  function encodeOne(it) {
    if (!it.dec || !it.file) return Promise.resolve();
    var myId = it.id;
    var fmt = fmtVal(), mode = modeVal();
    var src = it.dec.src, W = it.w, H = it.h;
    var w, h;
    if (mode === 'pct') {
      var p = clampNum(pctTxt.value, 1, 500, 100) / 100;
      w = Math.max(1, Math.round(W * p));
      h = Math.max(1, Math.round(H * p));
    } else {
      w = parseInt(wIn.value, 10) || W; h = parseInt(hIn.value, 10) || H;
      w = Math.max(1, w); h = Math.max(1, h);
    }
    if (w * h > 16777216) {
      var s = Math.sqrt(16777216 / (w * h));
      w = Math.max(1, Math.floor(w * s)); h = Math.max(1, Math.floor(h * s));
      it.capText = 'output capped to ' + w + '×' + h + ' - browser canvas limit';
    } else { it.capText = ''; }

    var cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    var ctx = cnv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    if (fmt === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    try { ctx.drawImage(src, 0, 0, w, h); }
    catch (e) { it.err = DECODE_MSG; it.done = true; updateCard(it); return Promise.resolve(); }

    var mime = MIMES[fmt];
    var quality = (fmt === 'png') ? undefined : Math.max(0.01, Math.min(1, parseInt(q.value, 10) / 100));
    return toBlob(cnv, mime, quality).then(function (blob) {
      if (myId !== it.id) { return; }
      if (!blob) { it.err = 'Encoding failed in this browser. Try PNG output.'; it.done = true; updateCard(it); return; }
      var actual = fmt;
      if (blob.type && blob.type !== mime && fmt !== 'png') {
        actual = TYPEFMT[blob.type] || fmt;
        if (actual !== fmt) showMsg('This browser can\'t encode ' + NAMES[fmt] + ' - saving as ' + NAMES[actual] + ' instead.', 'imc-warn');
      }
      if (it.outURL) { try { URL.revokeObjectURL(it.outURL); } catch (e) {} }
      it.outURL = URL.createObjectURL(blob);
      it.outBlob = blob;
      it.outW = w; it.outH = h;
      it.outFmt = actual;
      it.done = true;
      updateCard(it);
    }).catch(function () {
      it.err = 'Encoding failed in this browser. Try PNG output.'; it.done = true; updateCard(it);
    });
  }

  function clampNum(v, lo, hi, dflt) { var n = parseFloat(v); if (isNaN(n)) n = dflt || lo; return Math.min(hi, Math.max(lo, n)); }

  function toBlob(cnv, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof cnv.toBlob === 'function') {
        cnv.toBlob(function (b) { if (b) resolve(b); else reject(new Error('encode')); }, mime, quality);
        return;
      }
      try {
        var u = cnv.toDataURL(mime, quality);
        var i = u.indexOf(',');
        if (i < 0 || u.slice(0, i).indexOf('base64') < 0) throw new Error('encode');
        var bin = atob(u.slice(i + 1));
        var bytes = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        resolve(new Blob([bytes], { type: mime }));
      } catch (e) { reject(e); }
    });
  }
  var TYPEFMT = { 'image/webp': 'webp', 'image/jpeg': 'jpeg', 'image/png': 'png' };

  /* ---------- re-encode all when a control changes ---------- */
  function processAll() {
    items.forEach(function (it) { if (it.dec && !it.err) { encodeOne(it); } });
  }

  /* ---------- save / download (iOS/iPadOS share-sheet fix) ---------- */
  function isAppleTouch() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function anchorSave(blob, name, newTab) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }
  function saveBlob(blob, name, mime) {
    if (!blob) return;
    if (isAppleTouch()) {
      var f = null, canShare = false;
      try { f = new File([blob], name, { type: mime || 'image/png' }); } catch (e) {}
      try { canShare = !!(f && navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {}
      if (canShare) {
        navigator.share({ files: [f], title: name }).catch(function (err) {
          if (err && err.name !== 'AbortError') { anchorSave(blob, name, true); showMsg('Opened in a new tab - long-press the image, then "Add to Photos".', 'imc-warn'); }
        });
        return;
      }
      anchorSave(blob, name, true);
      showMsg('Opened in a new tab - long-press the image, then "Add to Photos".', 'imc-warn');
      return;
    }
    anchorSave(blob, name, false);
    showMsg('Saved ' + name + ' (' + fmtSize(blob.size) + ')', '');
  }

  /* ---------- events ---------- */
  input.addEventListener('change', function () {
    /* Snapshot the File objects into a plain Array BEFORE clearing the input.
       Setting input.value = '' empties the live FileList, so passing
       input.files straight to addFiles() would arrive empty (0 files) -
       the "images don't upload" bug. */
    var files = input.files ? Array.prototype.slice.call(input.files) : [];
    input.value = '';
    if (files.length) addFiles(files);
  });

  each('imc-fmt', function (r) { r.addEventListener('change', function () { syncQuality(); schedule(); }); });
  each('imc-rmode', function (r) { r.addEventListener('change', function () {
    var px = (modeVal() === 'px');
    pctRow.hidden = px; pxRow.hidden = !px;
    schedule();
  }); });

  q.addEventListener('input', function () {
    qTxt.value = q.value;
    schedule();
  });
  // #5: quality slider <-> type-in stay in sync (both directions)
  qTxt.addEventListener('input', function () {
    var n = Math.min(100, Math.max(10, parseInt(qTxt.value, 10) || 75));
    q.value = String(n);
    schedule();
  });
  qTxt.addEventListener('blur', function () {
    qTxt.value = String(Math.min(100, Math.max(10, parseInt(qTxt.value, 10) || 75)));
  });

  /* #5: slider <-> text input stay in sync (both directions) */
  pct.addEventListener('input', function () {
    pctTxt.value = pct.value;
    schedule();
  });
  pctTxt.addEventListener('input', function () {
    var n = clampNum(pctTxt.value, 1, 500, 100);
    pct.value = String(Math.min(200, n));
    schedule();
  });
  pctTxt.addEventListener('blur', function () {
    pctTxt.value = String(clampNum(pctTxt.value, 1, 500, 100));
  });

  function syncDims(which) {
    // Per-item aspect uses the FIRST decoded item's ratio (all share the
    // control); acceptable for a batch with one shared aspect lock.
    var ref = items[0];
    var ratio = ref && ref.w ? (ref.w / ref.h) : 1;
    if (lock.checked) {
      var v = parseInt(which === 'w' ? wIn.value : hIn.value, 10);
      if (v > 0) {
        if (which === 'w') hIn.value = String(Math.max(1, Math.round(v / ratio)));
        else wIn.value = String(Math.max(1, Math.round(v * ratio)));
      }
    }
    schedule();
  }

  wIn.addEventListener('input', function () { syncDims('w'); });
  hIn.addEventListener('input', function () { syncDims('h'); });

  /* drag & drop - supports multiple files */
  function wireDrop(el) {
    el.addEventListener('dragenter', function (e) { e.preventDefault(); el.classList.add('imc-drag'); });
    el.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) { try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {} } el.classList.add('imc-drag'); });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('imc-drag'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('imc-drag');
      var fl = e.dataTransfer && e.dataTransfer.files;
      if (fl && fl.length) addFiles(fl);
    });
  }
  wireDrop(zone);
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  /* per-card download via event delegation */
  results.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-role="dl"]') : null;
    if (!btn) return;
    var card = btn.closest('.imc-item');
    var it = null;
    for (var i = 0; i < items.length; i++) { if (String(items[i].id) === card.dataset.id) { it = items[i]; break; } }
    if (!it || !it.outBlob) return;
    var name = downloadName(it.file.name, EXTS[it.outFmt || fmtVal()]);
    saveBlob(it.outBlob, name, MIMES[it.outFmt || fmtVal()]);
  });

  /* Download all */
  if (dlAll) {
    dlAll.addEventListener('click', function (e) {
      e.preventDefault();
      downloadAll();
    });
  }
  /* Download all as ZIP */
  if (dlZip) {
    dlZip.addEventListener('click', function (e) {
      e.preventDefault();
      downloadZip();
    });
  }

  function syncQuality() {
    var isPng = (fmtVal() === 'png');
    q.disabled = isPng;
    qTxt.disabled = isPng;
    qRow.classList.toggle('imc-off', isPng);
  }

  function each(name, fn) { Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), fn); }

  syncQuality();
  clearMsg();
})();