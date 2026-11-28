/**
 * Comment thread for static posts.
 *
 * Reads approved comments from the live WordPress REST API and submits guest
 * comments to the scoped bridge endpoint. The endpoint uses WordPress's own
 * spam, moderation and notification pipeline. Nothing here trusts rendered HTML:
 * comment bodies are converted to plain text and credential-shaped strings are
 * redacted before insertion.
 */
(function () {
  'use strict';

  var cfg = window.__GWILL_COMMENTS__;
  if (!cfg || !cfg.postId) return;

  var postId = String(cfg.postId);
  var apiOrigin = String(cfg.apiOrigin || '').replace(/\/$/, '');
  var list = document.getElementById('comment-list');
  var countEl = document.getElementById('comment-count');
  var titleEl = document.getElementById('comments-title');
  var form = document.getElementById('comment-form');
  var nameEl = document.getElementById('comment-author');
  var emailEl = document.getElementById('comment-email');
  var bodyEl = document.getElementById('comment-content');
  var parentEl = document.getElementById('comment-parent');
  var submitEl = document.getElementById('comment-submit');
  var statusEl = document.getElementById('comment-status');
  var replyTitle = document.getElementById('comment-reply-title');
  var replyId = 0;
  var replyName = '';
  var loading = false;

  var SECRET_PATTERNS = [
    /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}\b/g, // Discord bot token
    /\b\d{6,12}:[A-Za-z0-9_-]{30,45}\b/g,                                  // Telegram bot token
    /\bsk-[A-Za-z0-9]{20,}\b/g,                                            // OpenAI
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,                                     // GitHub
    /\bAKIA[0-9A-Z]{16}\b/g,                                               // AWS access key
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  ];

  function redact(text) {
    var value = String(text || '');
    SECRET_PATTERNS.forEach(function (pattern) { value = value.replace(pattern, '[redacted]'); });
    return value;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function textFromHtml(html) {
    var holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    holder.querySelectorAll('script,style,iframe,object,embed,form,img,svg').forEach(function (el) {
      el.remove();
    });
    holder.querySelectorAll('br').forEach(function (el) {
      el.replaceWith('\n');
    });
    holder.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4').forEach(function (el) {
      el.append('\n');
    });
    var text = holder.textContent || '';
    text = redact(text);
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function dateLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function commentMarkup(comment, depth) {
    var avatar = comment.author_avatar_urls && (comment.author_avatar_urls['96'] || comment.author_avatar_urls['48']);
    var content = textFromHtml(comment.content && comment.content.rendered);
    var children = (comment.children || []).map(function (child) {
      return commentMarkup(child, depth + 1);
    }).join('');

    return '<li class="comment" id="comment-' + esc(comment.id) + '">' +
      '<article class="comment-body">' +
        (avatar ? '<img class="comment-avatar" src="' + esc(avatar) + '" alt="" width="40" height="40" loading="lazy" decoding="async" />' : '') +
        '<div class="comment-body-inner">' +
          '<header class="comment-meta">' +
            '<span class="fn">' + esc(comment.author_name || 'Guest') + '</span>' +
            (comment.date ? '<time class="comment-date" datetime="' + esc(comment.date) + '">' + esc(dateLabel(comment.date)) + '</time>' : '') +
          '</header>' +
          '<div class="comment-content">' + esc(content).replace(/\n/g, '<br />') + '</div>' +
          '<div class="comment-actions">' +
            '<button type="button" class="comment-reply-link" data-reply-id="' + esc(comment.id) + '" data-reply-name="' + esc(comment.author_name || 'Guest') + '">Reply</button>' +
          '</div>' +
        '</div>' +
      '</article>' +
      (children ? '<ol class="children">' + children + '</ol>' : '') +
    '</li>';
  }

  function render(comments) {
    var byParent = {};
    var roots = [];
    comments.forEach(function (comment) {
      comment.children = [];
      if (comment.parent && byParent[comment.parent]) {
        byParent[comment.parent].children.push(comment);
      } else if (!comment.parent) {
        roots.push(comment);
      }
    });
    // Replies can arrive before their parent; make a second pass for those.
    comments.forEach(function (comment) {
      if (comment.parent && !comment.parentNode) {
        var parent = comments.find(function (c) { return String(c.id) === String(comment.parent); });
        if (parent && parent !== comment && parent.children.indexOf(comment) === -1) parent.children.push(comment);
      }
    });
    comments.forEach(function (comment) { byParent[comment.id] = comment; });

    if (!roots.length) {
      list.innerHTML = '<li class="no-comments">No comments yet. Be the first to share your thoughts.</li>';
    } else {
      list.innerHTML = roots.map(function (comment) { return commentMarkup(comment, 0); }).join('');
    }

    if (countEl) countEl.textContent = comments.length ? '(' + comments.length + ')' : '';
    if (titleEl) titleEl.setAttribute('data-count', String(comments.length));
    list.setAttribute('aria-busy', 'false');
  }

  function load() {
    if (loading) return;
    loading = true;
    if (list) list.setAttribute('aria-busy', 'true');
    var url = apiOrigin + '/wp-json/wp/v2/comments?post=' + encodeURIComponent(postId) +
      '&per_page=50&order=asc&_fields=id,parent,author_name,date,content,author_avatar_urls';
    fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('comments HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('bad comments response');
        render(data);
      })
      .catch(function (err) {
        if (list) {
          list.innerHTML = '<li class="no-comments">Comments could not load right now. <a href="' + esc(apiOrigin + '/?p=' + postId) + '#comments">View them on WordPress</a>.</li>';
          list.setAttribute('aria-busy', 'false');
        }
        console.error('comments:', err);
      })
      .finally(function () { loading = false; });
  }

  function setReply(id, name) {
    replyId = Number(id) || 0;
    replyName = name || 'this comment';
    if (parentEl) parentEl.value = replyId ? String(replyId) : '';
    if (replyTitle) {
      replyTitle.innerHTML = replyId
        ? 'Reply to ' + esc(replyName) + ' <button type="button" class="comment-reply-cancel" id="comment-reply-cancel">Cancel</button>'
        : 'Leave a comment';
    }
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.comment-reply-link');
      if (btn) setReply(btn.getAttribute('data-reply-id'), btn.getAttribute('data-reply-name'));
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'comment-reply-cancel') setReply(0, '');
  });

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitEl && submitEl.disabled) return;
      var name = nameEl ? nameEl.value.trim() : '';
      var email = emailEl ? emailEl.value.trim() : '';
      var body = bodyEl ? bodyEl.value.trim() : '';
      var honeypot = document.getElementById('gwill-hp');

      statusEl.className = 'comment-status';
      statusEl.textContent = '';
      if (name.length < 2) { statusEl.className = 'comment-status is-error'; statusEl.textContent = 'Please enter your name.'; nameEl && nameEl.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { statusEl.className = 'comment-status is-error'; statusEl.textContent = 'Please enter a valid email address.'; emailEl && emailEl.focus(); return; }
      if (body.length < 2) { statusEl.className = 'comment-status is-error'; statusEl.textContent = 'Please write a comment.'; bodyEl && bodyEl.focus(); return; }

      if (submitEl) { submitEl.disabled = true; submitEl.value = 'Posting…'; }
      fetch(apiOrigin + '/wp-json/gwill/v1/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          author: name,
          email: email,
          content: body,
          parent: replyId || 0,
          gwill_hp: honeypot ? honeypot.value : ''
        })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          var data = result.data || {};
          if (!result.ok || data.success === false) {
            var msg = data.message || data.code || 'Your comment could not be posted.';
            if (result.status === 429) msg = 'Please wait a moment before posting again.';
            throw new Error(msg);
          }
          if (bodyEl) bodyEl.value = '';
          setReply(0, '');
          statusEl.className = 'comment-status is-ok';
          statusEl.textContent = data.message || (data.status === 'approved' ? 'Your comment is live.' : 'Thanks — your comment is awaiting moderation.');
          load();
        })
        .catch(function (err) {
          statusEl.className = 'comment-status is-error';
          statusEl.textContent = err.message || 'Your comment could not be posted.';
        })
        .finally(function () {
          if (submitEl) { submitEl.disabled = false; submitEl.value = 'Post comment'; }
        });
    });
  }

  load();
})();
