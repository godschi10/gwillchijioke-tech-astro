/**
 * Share row: working copy-link feedback + current-page share URLs.
 *
 * The captured WordPress share fragment contains absolute WP URLs. On the
 * static port those would share the old origin, so each network URL is
 * repointed to the page the reader is actually on. Copy link uses Clipboard
 * API with an execCommand fallback and a visible inline confirmation.
 */
(function () {
  'use strict';

  var copyBtn = document.getElementById('gwill-copy-link');
  var shareRow = document.querySelector('.share-row');
  var pageUrl = window.location.origin + window.location.pathname + window.location.search;
  var resetTimer = null;

  function rewriteNetworkLinks() {
    if (!shareRow) return;
    var links = shareRow.querySelectorAll('.share-buttons a[href]');
    links.forEach(function (a) {
      try {
        var u = new URL(a.href);
        var host = u.hostname.replace(/^www\./, '');
        if (host === 'twitter.com' || host === 'x.com') {
          u.searchParams.set('url', pageUrl);
        } else if (host === 'linkedin.com') {
          u.searchParams.set('url', pageUrl);
        } else if (host === 'facebook.com') {
          u.searchParams.set('u', pageUrl);
        } else if (host === 'wa.me') {
          var waText = u.searchParams.get('text') || '';
          waText = waText.replace(/https?:\/\/gwillchijioke\.qzz\.io\/\S*/i, pageUrl);
          if (waText.indexOf(pageUrl) === -1) waText = (waText + ' ' + pageUrl).trim();
          u.searchParams.set('text', waText);
        } else if (host === 't.me') {
          u.searchParams.set('url', pageUrl);
        } else if (host === 'threads.net') {
          var thText = u.searchParams.get('text') || '';
          thText = thText.replace(/https?:\/\/gwillchijioke\.qzz\.io\/\S*/i, pageUrl);
          if (thText.indexOf(pageUrl) === -1) thText = (thText + ' ' + pageUrl).trim();
          u.searchParams.set('text', thText);
        } else if (host === 'reddit.com') {
          u.searchParams.set('url', pageUrl);
        } else if (host === 'pinterest.com') {
          u.searchParams.set('url', pageUrl);
        }
        a.href = u.toString();
      } catch (e) { /* leave an unparseable third-party URL alone */ }
    });
  }

  function setCopied() {
    if (!copyBtn) return;
    if (resetTimer) clearTimeout(resetTimer);
    copyBtn.classList.add('is-copied');
    copyBtn.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied link';
    var status = document.getElementById('share-status');
    if (status) status.textContent = 'Link copied to clipboard.';
    resetTimer = setTimeout(function () {
      copyBtn.classList.remove('is-copied');
      copyBtn.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Copy link';
      if (status) status.textContent = '';
    }, 2200);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pageUrl).then(setCopied).catch(function () {
        fallbackCopy(pageUrl);
        setCopied();
      });
    } else {
      fallbackCopy(pageUrl);
      setCopied();
    }
  });

  if (shareRow && !document.getElementById('share-status')) {
    var status = document.createElement('span');
    status.id = 'share-status';
    status.className = 'screen-reader-text';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    shareRow.appendChild(status);
  }

  rewriteNetworkLinks();
})();
