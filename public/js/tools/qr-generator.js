/* ============================================================
   QR Code Generator - premium dark-glass (v1.19.74)
   Renders a QR code entirely client-side via the vendored MIT
   qrcode-generator lib (assets/js/vendor/qrcode-generator.js,
   exposes global `qrcode`). Nothing is uploaded - the code is
   generated on-device.

   Style: matte-black premium glass, green glow, soft accent,
   smooth spring-like interactions (the reactiive demo feel, per
   the King's pick).
   ============================================================ */
(function () {
  'use strict';

  var prefersContent = 0; // 0 = url, 1 = text, 2 = email, 3 = tel, 4 = wifi, 5 = sms
  var dataHandlers = [
    { name: 'URL',  build: function (v) { return v; } },
    { name: 'Text', build: function (v) { return v; } },
    { name: 'Email', build: function (v) { var p = v.split('|'); return 'mailto:' + (p[0] || '') + '?subject=' + encodeURIComponent(p[1] || '') + '&body=' + encodeURIComponent(p[2] || ''); } },
    { name: 'Phone', build: function (v) { return 'tel:' + v.replace(/[^\d+]/g, ''); } },
    { name: 'WiFi', build: function (v) { var p = v.split('|'); return 'WIFI:T:' + (/^wpa2?$/i.test(p[0]) ? 'WPA' : (p[0] || 'nopass').toUpperCase()) + ';S:' + escWifi(p[1] || '') + ';P:' + escWifi(p[2] || '') + ';;'; } },
    { name: 'SMS', build: function (v) { var p = v.split('|'); return 'smsto:' + (p[0] || '') + ':' + (p[1] || ''); } }
  ];
  function escWifi(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/:/g, '\\:').replace(/,/g, '\\,'); }

  var EC = ['L', 'M', 'Q', 'H'];

  /* ---------- elements ---------- */
  function $(id) { return document.getElementById(id); }
  var typeTxt = $('qr-typeTxt'),
      urlGroup = $('qr-urlGroup'), textGroup = $('qr-textGroup'),
      otherGroup = $('qr-otherGroup'), otherHint = $('qr-otherHint'),
      qrCanvas = $('qr-canvas'), msg = $('qr-msg'),
      sizeRange = $('qr-size'), sizeVal = $('qr-sizeVal'),
      ecSel = $('qr-ec'), marginRange = $('qr-margin'), marginVal = $('qr-marginVal'),
      fgSel = $('qr-fg'), bgSel = $('qr-bg'), logo = $('qr-logo'), logoClear = $('qr-logoClear'),
      dlPng = $('qr-dlPng'), dlSvg = $('qr-dlSvg'), copyBtn = $('qr-copy');

  var state = {
    kind: 'url', value: '', ec: 'M', size: 320, margin: 2,
    fg: '#00ff91', bg: '#0a0a0a', logoUrl: null, logoImg: null, lastMatrix: null
  };

  /* ---------- helpers ---------- */
  function showMsg(t, kind) { msg.textContent = t; msg.className = 'qr-msg' + (kind ? ' ' + kind : ''); msg.hidden = false; }
  function clearMsg() { msg.hidden = true; msg.className = 'qr-msg'; }

  /* Which visible input holds the value, + placeholder/hint per content kind. */
  var FIELD_CONF = {
    url:  { el: urlGroup,      input: 'input' },
    text: { el: textGroup,     input: 'textarea' },
    email:{ el: otherGroup,    input: 'input', ph: 'you@example.com | subject | message', hint: 'Email - type the address, then | subject | body' },
    tel:  { el: otherGroup,    input: 'input', ph: '+234 801 234 5678', hint: 'Phone - the number as you would dial it' },
    wifi: { el: otherGroup,    input: 'input', ph: 'WPA2 | MyNetwork | MyPassword', hint: 'WiFi - security | network name (SSID) | password' },
    sms:  { el: otherGroup,    input: 'input', ph: '+234 801 234 5678 | Hi, here is your message', hint: 'SMS - the phone number | then the message' }
  };
  function valueEl() {
    var conf = FIELD_CONF[dataHandlers[prefersContent].name.toLowerCase()];
    return conf.el.querySelector(conf.input);
  }

  // Render the QR matrix onto the canvas at the given size with the given margin.
  function renderQR() {
    if (!qrCanvas) return;
    var handler = dataHandlers[prefersContent];
    var data;
    try { data = handler.build(state.value); }
    catch (e) { showMsg('Could not build that ' + handler.name + ' code. Check the fields.', 'qr-err'); return null; }

    var eco = state.ec || 'M';
    var minV = 1, maxV = 40, version = 0;
    var qr = null;
    // Auto-version: try low versions up so the code stays compact; fall back on overflow.
    for (version = 1; version <= maxV; version++) {
      try {
        qr = qrcode(version, eco);
        qr.addData(data);
        qr.make();
        break;
      } catch (e) { qr = null; }
    }
    if (!qr) { showMsg('That content is too large for a QR code (max ~3KB).', 'qr-err'); return null; }

    var n = qr.getModuleCount();
    var margin = Math.max(0, Math.min(16, state.margin | 0));
    var cells = n + margin * 2;
    var size = state.size | 0;
    var px = Math.max(1, Math.floor(size / cells));
    var pad = Math.floor((size - px * cells) / 2);
    var dim = px * cells;

    qrCanvas.width = size; qrCanvas.height = size;
    var ctx = qrCanvas.getContext('2d');
    ctx.fillStyle = state.bg; ctx.fillRect(0, 0, size, size);

    var fg = state.fg;
    ctx.fillStyle = fg;
    for (var r = 0; r < cells; r++) {
      for (var c = 0; c < cells; c++) {
        var mr = r - margin, mc = c - margin;
        var dark = (mr >= 0 && mr < n && mc >= 0 && mc < n) && qr.isDark(mr, mc);
        if (dark) ctx.fillRect(pad + c * px, pad + r * px, px, px);
      }
    }
    // Soft glow behind the whole canvas (premium glass effect)
    qrCanvas.style.boxShadow = '0 0 40px ' + hexA(fg, 0.25) + ', 0 0 80px ' + hexA(fg, 0.10);

    // Logo overlay (centered, with a subtle pad so it reads on the code).
    // Reuses the cached state.logoImg so the preview AND the PNG export draw
    // the same logo - no async onload waiting between render and export.
    if (state.logoImg && state.logoImg.complete && state.logoImg.naturalWidth) {
      var logoSize = Math.floor(dim * 0.18);
      var lx = pad + Math.floor((dim - logoSize) / 2);
      var ly = pad + Math.floor((dim - logoSize) / 2);
      var padBg = Math.floor(logoSize * 0.12);
      ctx.fillStyle = state.bg;
      roundRect(ctx, lx - padBg, ly - padBg, logoSize + padBg * 2, logoSize + padBg * 2, 6);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, lx - padBg, ly - padBg, logoSize + padBg * 2, logoSize + padBg * 2, 6);
      ctx.clip();
      ctx.drawImage(state.logoImg, lx, ly, logoSize, logoSize);
      ctx.restore();
    }

    state.lastMatrix = { qr: qr, n: n, margin: margin, data: data };
    clearMsg();
    updateDownloadSize();
    return { qr: qr, n: n, margin: margin };
  }

  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 'rgba(0,255,145,' + a + ')';
    var h = m[1]; if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- PNG download (canvas bitmap; site CSP already has blob:) ---------- */
  function updateDownloadSize() {
    if (dlPng && state.lastMatrix) {
      dlPng.classList.remove('qr-disabled'); dlPng.removeAttribute('disabled');
    }
  }
  function downloadPng() {
    renderQR(); if (!state.lastMatrix) return;
    try {
      var a = document.createElement('a');
      a.href = qrCanvas.toDataURL('image/png');
      a.download = 'qr-code-' + (state.kind || 'code') + '-' + Date.now() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showMsg('Export failed in this browser.', 'qr-err'); }
  }

  /* ---------- SVG export (vector, crisp) ---------- */
  function svgRect(x, y, w, h) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
  }
  function buildSvg() {
    if (!state.lastMatrix) return null;
    var info = state.lastMatrix, n = info.n, margin = info.margin;
    var cells = n + margin * 2, size = 1024, px = (size / cells).toFixed(3);
    var parts = [];
    for (var r = 0; r < cells; r++) for (var c = 0; c < cells; c++) {
      var mr = r - margin, mc = c - margin;
      var dark = (mr >= 0 && mr < n && mc >= 0 && mc < n) && info.qr.isDark(mr, mc);
      if (dark) parts.push(svgRect((c * parseFloat(px)).toFixed(2), (r * parseFloat(px)).toFixed(2), px, px));
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + size + ' ' + size + '" width="' + state.size + '" height="' + state.size + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="' + state.bg + '"/>' +
      '<g fill="' + state.fg + '">' + parts.join('') + '</g>';
    // Logo overlay - embed the logo as an SVG <image> if one is loaded.
    if (state.logoImg && state.logoImg.complete && state.logoImg.naturalWidth) {
      var logoSize = Math.floor(size * 0.18);
      var lx = Math.floor((size - logoSize) / 2);
      var ly = Math.floor((size - logoSize) / 2);
      var padBg = Math.floor(logoSize * 0.12);
      svg += '<rect x="' + (lx - padBg) + '" y="' + (ly - padBg) + '" width="' + (logoSize + padBg*2) + '" height="' + (logoSize + padBg*2) + '" rx="7" fill="' + state.bg + '"/>';
      svg += '<image href="' + state.logoUrl + '" xlink:href="' + state.logoUrl + '" x="' + lx + '" y="' + ly + '" width="' + logoSize + '" height="' + logoSize + '" preserveAspectRatio="xMidYMid meet"/>';
    }
    svg += '</svg>';
    return svg;
  }
  function downloadSvg() {
    var svg = buildSvg(); if (!svg) return;
    var blob = new Blob([svg], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'qr-code-' + (state.kind || 'code') + '-' + Date.now() + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- copy to clipboard ---------- */
  function copyData() {
    if (!state.lastMatrix) return;
    var text = state.lastMatrix.data;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showMsg('Copied the encoded ' + state.kind + '.', ''); },
        function () { showMsg('Copy failed - select the text manually.', 'qr-err'); });
    } else {
      var ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showMsg('Copied the encoded ' + state.kind + '.', ''); }
      catch (e) { showMsg('Copy failed - select the text manually.', 'qr-err'); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- layout: swap the visible field per kind ---------- */
  function applyKind() {
    var name = dataHandlers[prefersContent].name.toLowerCase();
    var conf = FIELD_CONF[name];
    urlGroup.hidden = textGroup.hidden = otherGroup.hidden = true;
    conf.el.hidden = false;
    if (conf.ph) {
      otherGroup.querySelector('input').placeholder = conf.ph;
      if (otherHint) { otherHint.textContent = conf.hint || ''; otherHint.hidden = false; }
    } else if (otherHint) { otherHint.hidden = true; }
  }
  function rebuild() {
    state.value = valueEl().value;
    renderQR();
  }

  /* ---------- file logo ---------- */
  function loadLogo(file) {
    if (!file || !/^image\//.test(file.type)) { showMsg('Pick an image file for the logo.', 'qr-err'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      state.logoUrl = fr.result;
      var img = new Image();
      img.onload = function () { state.logoImg = img; renderQR(); };
      img.onerror = function () { showMsg('That logo could not be decoded.', 'qr-err'); };
      img.src = state.logoUrl;
    };
    fr.readAsDataURL(file);
  }

  /* ---------- debounce for re-render ---------- */
  var debT = null;
  function debounced() { if (debT) clearTimeout(debT); debT = setTimeout(renderQR, 120); }

  /* ---------- events ---------- */
  // Kind selector - swap the visible field + placeholder/hint per content type.
  if (typeTxt) {
    typeTxt.addEventListener('change', function () {
      prefersContent = parseInt(typeTxt.value, 10) || 0;
      state.kind = dataHandlers[prefersContent].name.toLowerCase();
      applyKind();
      rebuild();
    });
  }
  if (urlGroup) urlGroup.querySelector('input').addEventListener('input', debounced);
  if (textGroup) textGroup.querySelector('textarea').addEventListener('input', debounced);
  if (otherGroup) otherGroup.querySelector('input').addEventListener('input', debounced);

  if (sizeRange) sizeRange.addEventListener('input', function () {
    sizeVal.textContent = sizeRange.value + 'px'; state.size = parseInt(sizeRange.value, 10); debounced();
  });
  if (marginRange) marginRange.addEventListener('input', function () {
    marginVal.textContent = marginRange.value; state.margin = parseInt(marginRange.value, 10); debounced();
  });
  if (ecSel) ecSel.addEventListener('change', function () { state.ec = ecSel.value; renderQR(); });
  if (fgSel) fgSel.addEventListener('change', function () { state.fg = fgSel.value; renderQR(); });
  if (bgSel) bgSel.addEventListener('change', function () { state.bg = bgSel.value; renderQR(); });
  if (logo) logo.addEventListener('change', function () { if (logo.files && logo.files[0]) loadLogo(logo.files[0]); });
  if (logoClear) logoClear.addEventListener('click', function () { state.logoUrl = null; state.logoImg = null; if (logo) logo.value = ''; renderQR(); });
  if (dlPng) dlPng.addEventListener('click', downloadPng);
  if (dlSvg) dlSvg.addEventListener('click', downloadSvg);
  if (copyBtn) copyBtn.addEventListener('click', copyData);

  /* ---------- init ---------- */
  state.fg = fgSel ? fgSel.value : '#00ff91';
  state.bg = bgSel ? bgSel.value : '#0a0a0a';
  state.ec = ecSel ? ecSel.value : 'M';
  state.size = sizeRange ? parseInt(sizeRange.value, 10) : 320;
  state.margin = marginRange ? parseInt(marginRange.value, 10) : 2;
  // default to the URL field populated
  if (urlGroup) { var u = 'https://tech.gwillchijioke.com/'; urlGroup.querySelector('input').value = u; state.value = u; }
  applyKind();
  renderQR();
})();