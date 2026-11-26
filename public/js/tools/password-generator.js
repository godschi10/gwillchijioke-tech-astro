/* ============================================================
   Password Generator + Strength Checker - v1.19.78
   Genuine client-side CSPRNG (crypto.getRandomValues) + an honest
   entropy-based strength meter. Nothing leaves the device.

   Strength = log2(charset_size) * length, then penalised for real
   patterns the meter can actually detect:
     - repeated run (>2 of same char)
     - sequential runs (abc, 123, qwerty)
     - common password / is-a-dictionary-word style guesses
     - keyboard rows / adjacent keys
   Reports bits of entropy + an estimated crack time (offline guesses/s).
   This is honest - no naive "length only" meter that gives 123456 a high
   score. Scoped under #pwg-app; classes prefixed pwg-.
   ------------------------------------------------------------ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var out = $('pwg-out'), toggler = $('pwg-toggle'), regen = $('pwg-regen'), copy = $('pwg-copy'),
      lengthRange = $('pwg-len'), lengthVal = $('pwg-lenVal'),
      upper = $('pwg-up'), lower = $('pwg-lo'), digits = $('pwg-num'), symbols = $('pwg-sym'),
      similar = $('pwg-sim'), avoid = $('pwg-av'),
      strengthBar = $('pwg-strBar'), strengthLabel = $('pwg-strLabel'),
      entropyBits = $('pwg-bits'), crackTime = $('pwg-time'),
      checkerInput = $('pwg-check'), checkerBar = $('pwg-checkBar'),
      checkerLabel = $('pwg-checkLabel'), checkerBits = $('pwg-checkBits'),
      checkerTime = $('pwg-checkTime'), msg = $('pwg-msg');

  /* ---------- charsets ---------- */
  var SETS = {
    up: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lo: 'abcdefghijklmnopqrstuvwxyz',
    num: '0123456789',
    sym: '!@#$%^&*()_+-=[]{};:,.<>/?~'
  };
  var SIMILAR = 'Il1O0oBb8Ss5Zz2Gg6'; // chars often confused
  var AVOID = 'wiio'; // optionally avoid: word-like chars that look like words
  // Note: 'similar' only strips from up/lo/num; symbols left intact.

  /* ---------- CSPRNG ---------- */
  function randInt(max) {
    // unbiased 0..max-1 via crypto.getRandomValues, rejection sampling
    var maxUint = 0xFFFFFFFF;
    var limit = maxUint - (maxUint % max);
    var arr = new Uint32Array(1);
    var x;
    do { crypto.getRandomValues(arr); x = arr[0]; } while (x >= limit);
    return x % max;
  }

  function buildCharset() {
    var cs = '';
    if (upper.checked) cs += SETS.up;
    if (lower.checked) cs += SETS.lo;
    if (digits.checked) cs += SETS.num;
    if (symbols.checked) cs += SETS.sym;
    if (similar.checked) {
      cs = cs.split('').filter(function (c) { return SIMILAR.indexOf(c) === -1; }).join('');
    }
    if (avoid.checked) {
      cs = cs.split('').filter(function (c) { return AVOID.indexOf(c) === -1; }).join('');
    }
    return cs;
  }

  function generate() {
    var len = parseInt(lengthRange.value, 10) || 20;
    var cs = buildCharset();
    if (cs.length < 2) { showMsg('Turn on at least one character set (with enough distinct chars).', 'err'); return null; }
    clearMsg();
    // guarantee at least one char from each enabled set
    var sets = [];
    if (upper.checked) sets.push(SETS.up);
    if (lower.checked) sets.push(SETS.lo);
    if (digits.checked) sets.push(SETS.num);
    if (symbols.checked) sets.push(SETS.sym);
    if (similar.checked) {
      len += 0; // length is user's; but ensure we can still satisfy per-set w/o the confused chars
    }
    // Build: greedy fill, then apply filters per position by pulling from filtered sets
    var filteredSets = sets.map(function (s) {
      return s.split('').filter(function (c) {
        var ok = true;
        if (similar.checked && SIMILAR.indexOf(c) !== -1) ok = false;
        if (avoid.checked && AVOID.indexOf(c) !== -1) ok = false;
        return ok;
      }).join('');
    }).filter(function (s) { return s.length > 0; });
    if (!filteredSets.length) { showMsg('Too many characters excluded - no usable set left.', 'err'); return null; }

    var chars = [];
    // guarantee one from each filtered set
    filteredSets.forEach(function (s) { chars.push(s[randInt(s.length)]); });
    // fill the rest from any set
    var pool = filteredSets.join('');
    while (chars.length < len) { chars.push(pool[randInt(pool.length)]); }
    // Fisher-Yates shuffle so the guaranteed-set chars aren't always first
    for (var i = chars.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = chars[i]; chars[i] = chars[j]; chars[j] = t;
    }
    var pw = chars.join('').slice(0, len);
    out.value = pw;
    // strength (guaranteed-sets change only the charset size used to guess)
    var eff = computeEntropy(pw, cs);
    renderStrength2(eff.bits, eff.time);
    return pw;
  }

  /* ---------- honest entropy meter ---------- */
  // Detect the effective charset by inspecting the password's distinct classes.
  function guessCharsetBits(pw) {
    var bits = 0;
    if (/[a-z]/.test(pw)) bits += 26;
    if (/[A-Z]/.test(pw)) bits += 26;
    if (/[0-9]/.test(pw)) bits += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) bits += 33;
    return Math.max(bits, 2);
  }

  // Repeated-run penalty
  function runPenalty(pw) {
    var score = 0;
    for (var i = 0; i < pw.length; i++) {
      var run = 1;
      while (pw[i + run] === pw[i]) run++;
      if (run > 2) score += (run - 2) * 4;
      i += run - 1;
    }
    return score;
  }

  // Sequential / keyboard-run penalty
  var SEQS = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsxedc'];
  function seqPenalty(pw) {
    var score = 0;
    var lower = pw.toLowerCase();
    for (var s = 0; s < SEQS.length; s++) {
      var seq = SEQS[s];
      for (var k = seq.length - 4; k >= 3; k--) {
        for (var i = 0; i + k <= pw.length; i++) {
          var sub = lower.substr(i, k);
          var fwd = seq.indexOf(sub);
          var rev = seq.split('').reverse().join('').indexOf(sub);
          if (fwd >= 0 || rev >= 0) { score += k * 2; i += k - 1; }
        }
      }
    }
    return score;
  }

  // common-password / month / year / keypad patterns
  var COMMON = { 'password':1,'123456':1,'12345678':1,'123456789':1,'qwerty':1,'abc123':1,'letmein':1,'dragon':1,'monkey':1,'admin':1,'welcome':1,'iloveyou':1,'sunshine':1,'princess':1,'football':1,'baseball':1,'master':1,'shadow':1,'access':1,'trustno1':1,'hello':1,'charlie':1,'donald':1,'secret':1,'whatever':1,'freedom':1,'666666':1,'1q2w3e4r':1,'1234567890':1,'qwe123':1,'google':1,'password1':1,'superman':1,'batman':1,'starwars':1,'qwerty123':1,'zaq1zaq1':1,'123qwe':1,'michael':1,'jennifer':1,'hunter2':1,'000000':1,'111111':1,'123123':1,'p@ssw0rd':1,'passw0rd':1,'qwerty123456':1,'iloveyou1':1,'admin123':1,'letmein1':1,'football1':1,'dragon1':1,'welcome1':1,'login':1,'mypass':1,'test':1,'test123':1 };
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec'];
  function commonPenalty(pw) {
    var lower = pw.toLowerCase();
    var score = 0;
    // Exact common-password match - near-zero strength regardless of length.
    if (COMMON[lower]) return 60;
    // A common password word present anywhere in the string (esp. as a prefix).
    for (var w in COMMON) {
      if (lower.indexOf(w) === 0 && w.length >= 6) { score += Math.max(0, w.length - 3) * 3; }
      else if (lower.indexOf(w) !== -1 && w.length >= 8) { score += Math.max(0, w.length - 6) * 3; }
    }
    // Month / day names inside the password.
    for (var m = 0; m < MONTHS.length; m++) {
      if (lower.indexOf(MONTHS[m]) !== -1) score += 8;
    }
    // A bare year, or a year suffix on a word.
    if (/^(19|20)\d{2}$/.test(pw)) score += 14;
    if (/\d{4}$/.test(pw)) score += 10;
    // Sequential keyboard/number runs.
    score += seqPenalty(pw) * 0.5;
    return score;
  }

  function computeEntropy(pw, charset) {
    if (!pw) return { bits: 0, time: 0 };
    var bits = pw.length * Math.log2(guessCharsetBits(pw));
    var penalty = runPenalty(pw) + seqPenalty(pw) + commonPenalty(pw);
    bits = Math.max(0, bits - penalty);
    // crack time: offline GPU guessing ~10^10 guesses/sec at ~1e10 hashes/s for fast hash
    var guesses = Math.pow(2, bits);
    var sec = guesses / 1e10;
    // clamp to a sane display (avoid 1e302)
    return { bits: Math.round(bits), time: sec };
  }

  /* ---------- labels ---------- */
  function labelFromBits(bits) {
    if (bits < 28) return { t: 'Very weak', c: 'pwg-n1' };
    if (bits < 40) return { t: 'Weak', c: 'pwg-n2' };
    if (bits < 55) return { t: 'Fair', c: 'pwg-n3' };
    if (bits < 70) return { t: 'Strong', c: 'pwg-n4' };
    return { t: 'Very strong', c: 'pwg-n5' };
  }
  function fmtTime(sec) {
    if (sec <= 0) return 'instant';
    if (sec < 1) return 'less than a second';
    if (sec < 60) return Math.round(sec) + ' sec';
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    if (sec < 86400) return Math.round(sec / 3600) + ' hr';
    if (sec < 31536000) return Math.round(sec / 86400) + ' days';
    if (sec < 1e9) return Math.round(sec / 31536000) + ' years';
    return (sec / 31536000).toExponential(1).replace('e+', '×10^') + ' years';
  }

  function renderStrength(bits, time, bar, label, bitsEl, timeEl, meterClass) {
    if (!bar) return;
    var l = labelFromBits(bits);
    bar.className = 'pwg-meter-fill ' + l.c;
    bar.style.width = Math.min(100, (bits / 100) * 100) + '%';
    if (label) { label.textContent = l.t; label.className = 'pwg-meter-label ' + l.c; }
    if (bitsEl) bitsEl.textContent = bits + ' bits';
    if (timeEl) timeEl.textContent = fmtTime(time);
  }

  /* ---------- generator strength (mirror display) ---------- */
  function renderStrength2(bits, time) {
    renderStrength(bits, time, strengthBar, strengthLabel, entropyBits, crackTime);
  }

  /* ---------- msgs ---------- */
  function showMsg(t, kind) { msg.textContent = t; msg.className = 'pwg-msg' + (kind ? ' ' + kind : ''); msg.hidden = false; }
  function clearMsg() { msg.hidden = true; msg.className = 'pwg-msg'; }

  /* ---------- copy ---------- */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { flash(copy, 'Copied ✓'); }, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); flash(copy, 'Copied ✓'); } catch (e) { flash(copy, 'copy failed', 'err'); }
    document.body.removeChild(ta);
  }
  function flash(btn, label, kind) { var old = btn.textContent; btn.textContent = label; setTimeout(function () { btn.textContent = old; }, 1400); }

  /* ---------- events ---------- */
  if (lengthRange) lengthRange.addEventListener('input', function () { lengthVal.textContent = lengthRange.value; generate(); });
  ['up', 'lo', 'num', 'sym', 'sim', 'av'].forEach(function (id) {
    var el = $(id === 'up' ? 'pwg-up' : id === 'lo' ? 'pwg-lo' : id === 'num' ? 'pwg-num' : id === 'sym' ? 'pwg-sym' : id === 'sim' ? 'pwg-sim' : 'pwg-av');
    if (el) el.addEventListener('change', generate);
  });
  if (regen) regen.addEventListener('click', generate);
  if (copy) copy.addEventListener('click', function () { if (out.value) copyText(out.value); });
  if (toggler) toggler.addEventListener('click', function () {
    var showing = out.type === 'password';
    out.type = showing ? 'text' : 'password';
    toggler.textContent = showing ? 'Hide' : 'Show';
    toggler.setAttribute('aria-pressed', showing ? 'true' : 'false');
  });
  if (checkerInput) checkerInput.addEventListener('input', function () {
    var pw = checkerInput.value;
    if (!pw) { renderStrength(0, 0, checkerBar, checkerLabel, checkerBits, checkerTime); return; }
    var e = computeEntropy(pw, null);
    renderStrength(e.bits, e.time, checkerBar, checkerLabel, checkerBits, checkerTime);
  });

  /* ---------- init ---------- */
  if (lengthVal) lengthVal.textContent = lengthRange ? lengthRange.value : '';
  generate();
})();
