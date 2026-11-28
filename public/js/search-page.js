/**
 * Static search results page.
 *
 * Uses the SAME index + scoring + highlighting as the header dropdown
 * (window.GwillSearchCore, exposed by search-dropdown.js). The page accepts
 * both WordPress `?s=` and `?q=` dialects, then renders theme-native cards.
 */
(function () {
  'use strict';

  var cfg = window.__SEARCH_PAGE__ || {};
  var indexUrl = cfg.indexUrl || '/search-index.json';
  var root = cfg.root || '/';
  var input = document.getElementById('search-page-input');
  var grid = document.getElementById('search-page-results');
  var heading = document.getElementById('search-page-heading');
  var count = document.getElementById('search-page-count');
  var status = document.getElementById('search-page-status');
  var indexPromise = null;

  function getQuery() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('s') || params.get('q') || '').trim();
  }

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(indexUrl, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('search index HTTP ' + r.status);
        return r.json();
      });
    return indexPromise;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function dateLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function card(item, core, qtoks) {
    var title = core ? core.highlight(item.title, qtoks) : esc(item.title);
    var excerpt = core ? core.highlight(item.excerpt || '', qtoks) : esc(item.excerpt || '');
    var cat = esc(item.cat || 'Guide');
    var date = dateLabel(item.date);
    return '<article class="card reveal">' +
      '<div class="card-body">' +
        '<span class="badge badge-cat">' + cat + '</span>' +
        '<h3><a href="' + esc(item.url) + '">' + title + '</a></h3>' +
        (excerpt ? '<div class="card-excerpt">' + excerpt + '</div>' : '') +
        '<div class="card-meta">' +
          (item.type ? '<span>' + esc(item.type) + '</span><span>&middot;</span>' : '') +
          (date ? '<time datetime="' + esc(item.date) + '">' + date + '</time>' : '') +
        '</div>' +
        '<a href="' + esc(item.url) + '" class="card-cta-link">Read guide <span aria-hidden="true">&rarr;</span></a>' +
      '</div>' +
    '</article>';
  }

  function render() {
    var q = getQuery();
    if (input) input.value = q;

    loadIndex().then(function (all) {
      var core = window.GwillSearchCore;
      var qtoks = core ? core.toks(q) : [];
      var matches = q
        ? (core ? core.smartMatch(q, all, 60).map(function (m) { return m.p; }) : [])
        : all.filter(function (i) { return i.type === 'post'; }).slice(0, 6);
      var label = q ? 'Results for “' + q + '”' : 'Search';
      if (heading) heading.textContent = label;
      if (count) {
        count.innerHTML = q
          ? '<strong style="color:var(--green)">' + matches.length + '</strong> ' + (matches.length === 1 ? 'result' : 'results') + ' found'
          : 'Search every guide, tool and page on the site.';
      }
      if (status) status.textContent = q ? matches.length + ' results found.' : 'Search ready.';

      if (!grid) return;
      if (!matches.length && q) {
        grid.innerHTML = '<div class="search-page-empty">No matches for <strong>' + esc(q) + '</strong>. Try a shorter phrase, a tag like <strong>android</strong>, or browse <a href="' + root + 'all-posts/">all posts</a>.</div>';
        return;
      }
      grid.innerHTML = matches.map(function (item) { return card(item, core, qtoks); }).join('');
    }).catch(function (err) {
      if (status) status.textContent = 'Search unavailable.';
      if (grid) grid.innerHTML = '<div class="search-page-empty">Search is temporarily unavailable. Browse <a href="' + root + 'all-posts/">all posts</a> instead.</div>';
      console.error('search page:', err);
    });
  }

  function start() {
    if (!window.GwillSearchCore) {
      setTimeout(start, 50);
      return;
    }
    render();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
