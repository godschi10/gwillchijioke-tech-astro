/**
 * Tech blog discussion rail.
 *
 * Click to open (finance/VibeComments pattern), WordPress REST as the data
 * source, scoped guest submit endpoint, client-side sort/search, threaded
 * replies and comment reactions. Comment bodies are treated as plain text and
 * credential-shaped strings are redacted before rendering.
 */
(function () {
  'use strict';

  var cfg = window.__GWILL_COMMENTS__;
  if (!cfg || !cfg.postId) return;

  var postId = String(cfg.postId);
  var apiOrigin = String(cfg.apiOrigin || '').replace(/\/$/, '');
  var REACTIONS = [
    {
      kind: 'like', label: 'Like',
      svg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/><path d="M7 10l4-7a2 2 0 0 1 3 1.8V9h4.2a2 2 0 0 1 2 2.3l-1 7A2 2 0 0 1 17.2 20H7"/></svg>'
    },
    {
      kind: 'heart', label: 'Love',
      svg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>'
    },
    {
      kind: 'fire', label: 'Fire',
      svg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12.1 22.5c4.2 0 7.6-3.3 7.6-7.4 0-3.1-2.1-5.7-3.9-7.5-.3 1.7-1.1 2.9-2.3 3.7.2-2.7-1-5.5-2.6-7.6-.4 3.3-2.4 5-3.6 6.9-.8 1.3-1.3 2.7-1.3 4.3 0 4.1 3.2 7.6 6.1 7.6z"/></svg>'
    },
    {
      kind: 'laugh', label: 'Haha',
      svg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7.6 9.8c.8-1.4 1.9-1.4 2.7 0M13.7 9.8c.8-1.4 1.9-1.4 2.7 0"/><path d="M7.3 13.2h9.4c0 3.2-2.1 5.4-4.7 5.4s-4.7-2.2-4.7-5.4z" fill="currentColor" stroke="none"/><path d="M5.4 8.9c-.7 1.2-1.1 2-1.1 2.7a1.2 1.2 0 0 0 2.4 0c0-.7-.5-1.5-1.3-2.7z" fill="currentColor" stroke="none"/><path d="M18.6 8.9c.8 1.2 1.3 2 1.3 2.7a1.2 1.2 0 0 1-2.4 0c0-.7.4-1.5 1.1-2.7z" fill="currentColor" stroke="none"/></svg>'
    }
  ];

  var openBtn = document.getElementById('comments-open');
  var openLabel = document.getElementById('comments-open-label');
  var closeBtn = document.getElementById('comments-close');
  var panel = document.getElementById('comments-panel');
  var list = document.getElementById('comment-list');
  var empty = document.getElementById('comments-empty');
  var toolbar = document.getElementById('comments-toolbar');
  var searchEl = document.getElementById('comments-search');
  var headingCount = document.getElementById('comments-heading-count');
  var form = document.getElementById('comment-form');
  var nameEl = document.getElementById('comment-author');
  var emailEl = document.getElementById('comment-email');
  var bodyEl = document.getElementById('comment-content');
  var parentEl = document.getElementById('comment-parent');
  var submitEl = document.getElementById('comment-submit');
  var statusEl = document.getElementById('comment-status');
  var replyTitle = document.getElementById('comment-reply-title');
  var charCount = document.getElementById('comment-char-count');
  var sortButtons = Array.prototype.slice.call(document.querySelectorAll('[data-sort]'));

  var state = {
    opened: false,
    loaded: false,
    loading: false,
    comments: [],
    counts: {},
    mine: {},
    sort: 'newest',
    query: '',
    total: null,
    replyId: 0,
    replyName: '',
    guest: getGuest()
  };

  var SECRET_PATTERNS = [
    /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}\b/g,
    /\b\d{6,12}:[A-Za-z0-9_-]{30,45}\b/g,
    /\bsk-[A-Za-z0-9]{20,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  ];

  function getGuest() {
    var key = 'gwill_comment_guest';
    try {
      var existing = localStorage.getItem(key);
      if (existing && existing.length >= 8) return existing;
      var made = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : 'g' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, made);
      return made;
    } catch (e) {
      return 'g' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function redact(text) {
    var value = String(text || '');
    SECRET_PATTERNS.forEach(function (pattern) { value = value.replace(pattern, '[redacted]'); });
    return value;
  }

  function plainText(html) {
    var holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    holder.querySelectorAll('script,style,iframe,object,embed,form,img,svg').forEach(function (el) {
      el.remove();
    });
    holder.querySelectorAll('br').forEach(function (el) { el.replaceWith('\n'); });
    holder.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4').forEach(function (el) { el.append('\n'); });
    return redact(holder.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function dateLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function api(path) {
    return apiOrigin + path;
  }

  function updateOpenLabel() {
    if (!openLabel) return;
    if (state.opened) {
      openLabel.textContent = 'Close comments';
      return;
    }
    if (state.total === null) {
      openLabel.textContent = 'Open comments';
    } else if (state.total === 0) {
      openLabel.textContent = 'Be the first to comment';
    } else {
      openLabel.textContent = 'Open ' + state.total + (state.total === 1 ? ' comment' : ' comments');
    }
  }

  function setCount(total) {
    state.total = Number(total) || 0;
    if (headingCount) headingCount.textContent = state.total > 0 ? '(' + state.total + ')' : '';
    updateOpenLabel();
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.className = 'comment-status' + (type ? ' is-' + type : '');
    statusEl.textContent = message || '';
  }

  function setExpanded(expanded) {
    state.opened = expanded;
    if (panel) panel.hidden = !expanded;
    var rail = document.getElementById('comments');
    if (rail) rail.classList.toggle('is-open', expanded);
    if (openBtn) openBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    updateOpenLabel();
    try {
      if (expanded) history.replaceState(null, '', '#comments');
      else if (location.hash === '#comments') history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* hash is a nicety */ }
  }

  function openPanel() {
    setExpanded(true);
    if (!state.loaded) loadComments();
  }

  function closePanel() {
    setExpanded(false);
    if (openBtn) openBtn.focus();
  }

  function skeleton() {
    if (!list) return;
    list.innerHTML = '<li class="comment-skeleton-row"><span class="comment-skeleton-avatar"></span><span class="comment-skeleton-lines"><span class="comment-skeleton-line"></span><span class="comment-skeleton-line is-short"></span></span></li>' +
      '<li class="comment-skeleton-row"><span class="comment-skeleton-avatar"></span><span class="comment-skeleton-lines"><span class="comment-skeleton-line"></span><span class="comment-skeleton-line is-short"></span></span></li>';
    list.classList.add('is-loading');
  }

  function totalFor(comment) {
    var counts = state.counts[String(comment.id)] || {};
    return REACTIONS.reduce(function (sum, def) { return sum + (Number(counts[def.kind]) || 0); }, 0);
  }

  function sortComments(comments, reverse) {
    return comments.slice().sort(function (a, b) {
      if (state.sort === 'top') {
        var delta = totalFor(b) - totalFor(a);
        if (delta) return delta;
      }
      var da = new Date(a.date || 0).getTime();
      var db = new Date(b.date || 0).getTime();
      var order = state.sort === 'oldest' ? da - db : db - da;
      return reverse ? -order : order;
    });
  }

  function reactionBar(comment) {
    var id = String(comment.id);
    var counts = state.counts[id] || {};
    var mine = state.mine[id] || '';
    return '<div class="comment-reactions" data-comment-id="' + esc(id) + '">' +
      REACTIONS.map(function (def) {
        var count = Number(counts[def.kind]) || 0;
        return '<button type="button" class="comment-reaction" data-reaction-kind="' + def.kind +
          '" data-comment-id="' + esc(id) + '" aria-label="' + def.label + '" aria-pressed="' +
          (mine === def.kind ? 'true' : 'false') + '">' +
          '<span class="reaction-icon" aria-hidden="true">' + def.svg + '</span>' +
          (count > 0 ? '<span class="reaction-count">' + count + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
  }

  function commentMarkup(comment, depth) {
    var id = String(comment.id);
    var avatar = comment.author_avatar_urls && (comment.author_avatar_urls['96'] || comment.author_avatar_urls['48']);
    var content = plainText(comment.content && comment.content.rendered);
    var children = (comment.children || []).map(function (child) { return commentMarkup(child, depth + 1); }).join('');
    return '<li class="comment" id="comment-' + esc(id) + '">' +
      '<article class="comment-body">' +
        (avatar ? '<img class="comment-avatar" src="' + esc(avatar) + '" alt="" width="40" height="40" loading="lazy" decoding="async" />' : '') +
        '<div class="comment-body-inner">' +
          '<header class="comment-meta">' +
            '<span class="fn">' + esc(comment.author_name || 'Guest') + '</span>' +
            (comment.date ? '<time class="comment-date" datetime="' + esc(comment.date) + '">' + esc(dateLabel(comment.date)) + '</time>' : '') +
          '</header>' +
          '<div class="comment-content">' + esc(content).replace(/\n/g, '<br />') + '</div>' +
          '<div class="comment-actions">' + reactionBar(comment) +
            '<button type="button" class="comment-reply-link" data-reply-id="' + esc(id) + '" data-reply-name="' + esc(comment.author_name || 'Guest') + '">Reply</button>' +
          '</div>' +
        '</div>' +
      '</article>' +
      (children ? '<ol class="children">' + children + '</ol>' : '') +
    '</li>';
  }

  function renderThread() {
    if (!list) return;
    var q = state.query.trim().toLowerCase();
    var comments = state.comments;

    if (q) {
      var matching = comments.filter(function (comment) {
        var text = plainText(comment.content && comment.content.rendered).toLowerCase();
        return text.indexOf(q) !== -1 || String(comment.author_name || '').toLowerCase().indexOf(q) !== -1;
      });
      list.innerHTML = matching.length
        ? matching.map(function (comment) { return commentMarkup(comment, 0); }).join('')
        : '<li class="no-comments">No comments match “' + esc(state.query) + '”.</li>';
      if (empty) empty.hidden = true;
      list.setAttribute('aria-busy', 'false');
      return;
    }

    var byId = {};
    comments.forEach(function (comment) {
      comment.children = [];
      byId[String(comment.id)] = comment;
    });
    var roots = [];
    comments.forEach(function (comment) {
      var parent = comment.parent && byId[String(comment.parent)];
      if (parent && parent !== comment) parent.children.push(comment);
      else if (!comment.parent) roots.push(comment);
    });

    roots = sortComments(roots);
    roots.forEach(function (comment) {
      comment.children = sortComments(comment.children, true);
    });

    if (!roots.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      list.innerHTML = roots.map(function (comment) { return commentMarkup(comment, 0); }).join('');
    }
    list.setAttribute('aria-busy', 'false');
    if (toolbar) toolbar.hidden = comments.length === 0;
  }

  function loadReactions() {
    if (!state.comments.length) return Promise.resolve();
    return fetch(api('/wp-json/gwill/v1/reactions?post_id=' + encodeURIComponent(postId) + '&guest=' + encodeURIComponent(state.guest)), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.success) {
          state.counts = data.counts || {};
          state.mine = data.mine || {};
        }
      })
      .catch(function () { /* reactions are an enhancement, not a blocker */ });
  }

  function loadComments() {
    if (!list || state.loading) return;
    state.loading = true;
    skeleton();
    if (toolbar) toolbar.hidden = true;
    if (empty) empty.hidden = true;
    fetch(api('/wp-json/wp/v2/comments?post=' + encodeURIComponent(postId) + '&per_page=50&order=asc&_fields=id,parent,author_name,date,content,author_avatar_urls'), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('comments HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('bad comments response');
        state.comments = data;
        state.loaded = true;
        setCount(data.length);
        return loadReactions().then(renderThread);
      })
      .catch(function (err) {
        if (list) {
          list.classList.remove('is-loading');
          list.innerHTML = '<li class="no-comments">Comments could not load right now. <a href="' + esc(apiOrigin + '/?p=' + postId) + '#comments">View them on WordPress</a>.</li>';
          list.setAttribute('aria-busy', 'false');
        }
        console.error('comments:', err);
      })
      .finally(function () { state.loading = false; });
  }

  function loadCount() {
    fetch(api('/wp-json/wp/v2/comments?post=' + encodeURIComponent(postId) + '&per_page=1&_fields=id'), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('count HTTP ' + res.status);
        var total = Number(res.headers.get('x-wp-total'));
        return total >= 0 ? total : res.json().then(function (data) { return data.length; });
      })
      .then(setCount)
      .catch(function () { /* count is a nicety */ });
  }

  function setReply(id, name) {
    state.replyId = Number(id) || 0;
    state.replyName = name || '';
    if (parentEl) parentEl.value = state.replyId ? String(state.replyId) : '';
    if (replyTitle) {
      replyTitle.innerHTML = state.replyId
        ? 'Reply to ' + esc(state.replyName) + ' <button type="button" class="comment-reply-cancel" id="comment-reply-cancel">Cancel</button>'
        : 'Leave a comment';
    }
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function react(commentId, kind, button) {
    if (button) button.disabled = true;
    fetch(api('/wp-json/gwill/v1/reaction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ post_id: postId, comment_id: commentId, kind: kind, guest: state.guest })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || result.data.success === false) throw new Error(result.data.message || 'Reaction failed.');
        state.counts[String(commentId)] = result.data.counts || {};
        state.mine[String(commentId)] = result.data.mine || '';
        renderThread();
      })
      .catch(function (err) {
        setStatus(err.message || 'Reaction failed.', 'error');
        if (button) button.disabled = false;
      });
  }

  if (openBtn) openBtn.addEventListener('click', function () {
    if (state.opened) closePanel(); else openPanel();
  });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  if (list) list.addEventListener('click', function (e) {
    var reaction = e.target.closest('.comment-reaction');
    if (reaction) {
      react(reaction.getAttribute('data-comment-id'), reaction.getAttribute('data-reaction-kind'), reaction);
      return;
    }
    var reply = e.target.closest('.comment-reply-link');
    if (reply) setReply(reply.getAttribute('data-reply-id'), reply.getAttribute('data-reply-name'));
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'comment-reply-cancel') setReply(0, '');
  });

  if (searchEl) {
    var searchTimer;
    searchEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = searchEl.value;
        renderThread();
      }, 120);
    });
  }

  sortButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.sort = button.getAttribute('data-sort') || 'newest';
      sortButtons.forEach(function (b) { b.classList.toggle('is-active', b === button); });
      renderThread();
    });
  });

  if (bodyEl && charCount) {
    bodyEl.addEventListener('input', function () { charCount.textContent = String(bodyEl.value.length); });
  }

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitEl && submitEl.disabled) return;
    var name = nameEl ? nameEl.value.trim() : '';
    var email = emailEl ? emailEl.value.trim() : '';
    var body = bodyEl ? bodyEl.value.trim() : '';
    var honeypot = document.getElementById('gwill-hp');

    setStatus('', '');
    if (name.length < 2) { setStatus('Please enter your name.', 'error'); nameEl && nameEl.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('Please enter a valid email address.', 'error'); emailEl && emailEl.focus(); return; }
    if (body.length < 2) { setStatus('Please write a comment.', 'error'); bodyEl && bodyEl.focus(); return; }

    if (submitEl) { submitEl.disabled = true; submitEl.value = 'Posting…'; }
    fetch(api('/wp-json/gwill/v1/comment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        post_id: postId,
        author: name,
        email: email,
        content: body,
        parent: state.replyId || 0,
        gwill_hp: honeypot ? honeypot.value : ''
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || result.data.success === false) {
          var msg = result.data.message || 'Your comment could not be posted.';
          if (result.status === 429) msg = 'Please wait a moment before posting again.';
          throw new Error(msg);
        }
        if (bodyEl) { bodyEl.value = ''; if (charCount) charCount.textContent = '0'; }
        setReply(0, '');
        setStatus(result.data.message || (result.data.status === 'approved' ? 'Your comment is live.' : 'Thanks — your comment is awaiting moderation.'), 'ok');
        if (result.data.status === 'approved') loadComments();
      })
      .catch(function (err) { setStatus(err.message || 'Your comment could not be posted.', 'error'); })
      .finally(function () {
        if (submitEl) { submitEl.disabled = false; submitEl.value = 'Post comment'; }
      });
  });

  loadCount();
  if (location.hash === '#comments') openPanel();
})();
