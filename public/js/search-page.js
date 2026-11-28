/**
 * Static search results page — dynamic in the browser, no server needed.
 *
 * The index is a build-time JSON file; typing queries it entirely client-side
 * and re-renders the theme-native cards without a page reload. The URL is kept
 * shareable through history.replaceState, and the form still works if JS fails.
 */
(function () {
  'use strict';

  var cfg = window.__SEARCH_PAGE__ || {};
  var indexUrl = cfg.indexUrl || '/search-index.json';
  var root = cfg.root || '/';
  var form = document.querySelector('.search-page-form');
  var input = document.getElementById('search-page-input');
  var grid = document.getElementById('search-page-results');
  var heading = document.getElementById('search-page-heading');
  var count = document.getElementById('search-page-count');
  var status = document.getElementById('search-page-status');
  var indexPromise = null;
  var debounceTimer = null;
  var renderSeq = 0;

  function getQuery() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('s') || params.get('q') || '').trim();
  }

  function syncUrl(q) {
    try {
      var url = q
        ? window.location.pathname + '?s=' + encodeURIComponent(q)
        : window.location.pathname;
      window.history.replaceState(null, '', url);
    } catch (e) { /* file:// or old browser — search still works */ }
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

  function render(q) {
    var token = ++renderSeq;
    loadIndex().then(function (all) {
      if (token !== renderSeq) return; // a newer keystroke already rendered
      var core = window.GwillSearchCore;
      var qtoks = core ? core.toks(q) : [];
      var matches = q
        ? (core ? core.smartMatch(q, all, 60).map(function (m) { return m.p; }) : [])
        : all.filter(function (i) { return i.type === 'post'; }).slice(0, 6);

      if (heading) heading.textContent = q ? 'Results for “' + q + '”' : 'Search';
      if (count) {
        count.innerHTML = q
          ? '<strong style="color:var(--green)">' + matches.length + '</strong> ' +
            (matches.length === 1 ? 'result' : 'results') + ' found'
          : 'Search every guide, tool and page on the site.';
      }
      if (status) status.textContent = q ? matches.length + ' results found.' : 'Search ready.';

      if (!grid) return;
      if (!matches.length && q) {
        grid.innerHTML = '<div class="search-page-empty">No matches for <strong>' + esc(q) +
          '</strong>. Try a shorter phrase, a tag like <strong>android</strong>, or browse <a href="' +
          root + 'all-posts/">all posts</a>.</div>';
        return;
      }
      grid.innerHTML = matches.map(function (item) {
        return card(item, core, qtoks);
      }).join('');
    }).catch(function (err) {
      if (token !== renderSeq) return;
      if (status) status.textContent = 'Search unavailable.';
      if (grid) grid.innerHTML = '<div class="search-page-empty">Search is temporarily unavailable. Browse <a href="' +
        root + 'all-posts/">all posts</a> instead.</div>';
      console.error('search page:', err);
    });
  }

  function renderFromInput(sync) {
    var q = input ? input.value.trim() : getQuery();
    if (sync) syncUrl(q);
    render(q);
  }

  function bind() {
    if (input) {
      input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        var q = this.value.trim();
        if (!q) {
          syncUrl('');
          render('');
          return;
        }
        debounceTimer = setTimeout(function () { renderFromInput(true); }, 130);
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearTimeout(debounceTimer);
        renderFromInput(true);
      });
    }

    window.addEventListener('popstate', function () {
      var q = getQuery();
      if (input) input.value = q;
      render(q);
    });
  }

  var started = false;
  function start() {
    if (!window.GwillSearchCore) {
      setTimeout(start, 50);
      return;
    }
    if (started) return;
    started = true;
    var initial = getQuery();
    if (input) input.value = initial;
    bind();
    render(initial);
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
