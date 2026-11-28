/**
 * GWill Tech — Reading Progress Bar
 *
 * Runs only where #reading-progress exists (blog posts).
 *
 * The bar measures the CONTENT, not the whole page: it reaches 100% when the
 * bottom of the post content — the post navigation / share footer — reaches the
 * bottom of the viewport. Scrolling through comments, related posts and the
 * site footer does not advance it further.
 *
 * transform: scaleX() is compositor-only, so scroll updates never reflow.
 */
(function () {
  'use strict';

  var pb = document.getElementById('reading-progress');
  if (!pb) return;

  var article = document.querySelector('#article-scroll-area') || document.querySelector('.article-layout') || document.querySelector('article');
  var marker = document.querySelector('.post-nav') || document.querySelector('.share-row') || article;
  var ticking = false;

  function contentBottom() {
    if (!marker) return document.documentElement.scrollHeight;
    var r = marker.getBoundingClientRect();
    return r.bottom + window.scrollY;
  }

  function update() {
    ticking = false;
    var end = contentBottom() - window.innerHeight;
    var pc = end > 0 ? Math.min(1, Math.max(0, window.scrollY / end)) : 0;
    pb.style.transform = 'scaleX(' + pc + ')';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.addEventListener('load', schedule);
  update();
})();
