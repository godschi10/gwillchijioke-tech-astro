/**
 * Footer "Back to top" — reliable, exact scroll to zero.
 *
 * The captured link was an inert href="#top". The theme sets
 * `html { scroll-behavior: smooth }`, and native anchor navigation can stop
 * short on long mobile pages when layout/images settle. This drives the
 * scroll explicitly and forces a final 0, then removes the hash.
 */
(function () {
  'use strict';

  var links = document.querySelectorAll('.js-to-top, [data-to-top]');
  if (!links.length) return;

  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var start = window.scrollY || document.documentElement.scrollTop || 0;
      if (start <= 0) return;

      var root = document.documentElement;
      var previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';

      var duration = 420;
      var t0 = performance.now();
      function step(now) {
        var p = Math.min(1, (now - t0) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        window.scrollTo(0, Math.max(0, Math.round(start * (1 - eased))));
        if (p < 1) {
          window.requestAnimationFrame(step);
        } else {
          window.scrollTo(0, 0);
          root.style.scrollBehavior = previous;
          try {
            if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
          } catch (ignore) { /* optional */ }
        }
      }
      window.requestAnimationFrame(step);
    });
  });
})();
