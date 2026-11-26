/**
 * Lightbox - click-to-view full-size images in post content
 *
 * Vanilla JS, no dependencies. Applied to all images inside .prose
 * that aren't inside a gallery block (gallery uses its own viewer).
 *
 * Accessibility (v1.16.45): trigger images are made keyboard-operable
 * (tabindex=0 + role=button + aria-label + Enter/Space), focus moves into
 * the dialog on open and back to the trigger on close, and focus is trapped
 * inside while open.
 *
 * @package GWill_Tech
 */

/*
Table of Contents
1. State
2. Build DOM
3. build
4. Touch / swipe
5. open
6. close
7. navigate
8. Show current
9. showImage
10. Gather images in context
11. gatherImages
12. Init: make triggers keyboard-operable + attach handlers
13. init
14. Kick off after DOM
*/

(function() {
  'use strict';

  // ── 1. State──────────────────────────────────────────────────────
  var overlay, img, closeBtn, prevBtn, nextBtn, counterEl, captionEl;
  var currentImg, images, currentIndex;
  var triggerEl = null;   // the <img> that opened the lightbox (for focus return)

  // ── 2. Build DOM──────────────────────────────────────────────────
  // ── 3. build──────────────────────────────────────────────
  function build() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'gl-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image lightbox');
    overlay.innerHTML =
      '<button class="gl-close" aria-label="Close">&times;</button>' +
      '<button class="gl-nav gl-prev" aria-label="Previous image">&lsaquo;</button>' +
      '<div class="gl-image-wrap"><img class="gl-image" src="" alt=""></div>' +
      '<button class="gl-nav gl-next" aria-label="Next image">&rsaquo;</button>' +
      '<div class="gl-counter"></div>' +
      '<div class="gl-caption"></div>';

    document.body.appendChild(overlay);

    img       = overlay.querySelector('.gl-image');
    closeBtn  = overlay.querySelector('.gl-close');
    prevBtn   = overlay.querySelector('.gl-prev');
    nextBtn   = overlay.querySelector('.gl-next');
    counterEl = overlay.querySelector('.gl-counter');
    captionEl = overlay.querySelector('.gl-caption');

    // Events
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
    prevBtn.addEventListener('click', function(e) { e.stopPropagation(); navigate(-1); });
    nextBtn.addEventListener('click', function(e) { e.stopPropagation(); navigate(1); });

    document.addEventListener('keydown', function(e) {
      if (!overlay.classList.contains('gl-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    // Focus trap - keep Tab/Shift+Tab inside the dialog while open.
    document.addEventListener('focusin', function(e) {
      if (!overlay.classList.contains('gl-open')) return;
      if (!overlay.contains(e.target)) {
        closeBtn.focus();
      }
    });

    // ── 4. Touch / swipe──────────────────────────────────────────────
    var touchStartX = 0, touchStartY = 0;
    overlay.addEventListener('touchstart', function(e) {
      if (e.target.closest('.gl-close') || e.target.closest('.gl-nav')) return;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    overlay.addEventListener('touchend', function(e) {
      if (e.target.closest('.gl-close') || e.target.closest('.gl-nav')) return;
      var dx = e.changedTouches[0].screenX - touchStartX;
      var dy = e.changedTouches[0].screenY - touchStartY;
      // Only trigger if horizontal swipe > vertical and > threshold
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        navigate(dx > 0 ? -1 : 1);
      }
    }, { passive: true });
  }

  // ── 5. open───────────────────────────────────────────────
  function open(imgEl, index) {
    build();
    triggerEl = imgEl || null;
    images = gatherImages(imgEl);
    currentIndex = index !== undefined ? index : images.indexOf(imgEl);
    if (currentIndex === -1) currentIndex = 0;
    showImage();
    overlay.classList.add('gl-open');
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog (WCAG 2.4.3) - after the transition begins.
    if (closeBtn) { closeBtn.focus(); }
  }

  // ── 6. close──────────────────────────────────────────────
  function close() {
    overlay.classList.remove('gl-open');
    document.body.style.overflow = '';
    // Return focus to the triggering image (keyboard/AT continuity).
    if (triggerEl && triggerEl.focus) { triggerEl.focus(); }
    triggerEl = null;
  }

  // ── 7. navigate───────────────────────────────────────────
  function navigate(dir) {
    if (images.length < 2) return;
    currentIndex = (currentIndex + dir + images.length) % images.length;
    showImage();
  }

  // ── 8. Show current───────────────────────────────────────────────
  // ── 9. showImage──────────────────────────────────────────
  function showImage() {
    if (!images || !images[currentIndex]) return;
    var el = images[currentIndex];
    var src = el.getAttribute('data-full') || el.src || el.getAttribute('data-src') || '';
    // Use the largest available src
    var fullSrc = el.dataset.fullUrl || el.src;
    // For WP images, try to get the full size
    var srcset = el.srcset || '';
    if (srcset) {
      var sources = srcset.split(',');
      var last = sources[sources.length - 1].trim().split(' ')[0];
      if (last) fullSrc = last;
    }
    img.src = fullSrc || src;
    img.alt = el.alt || '';

    // Caption
    var fig = el.closest('figure');
    var cap = fig ? fig.querySelector('.wp-element-caption, figcaption') : null;
    captionEl.textContent = cap ? cap.textContent : '';

    // Counter
    counterEl.textContent = images.length > 1 ? (currentIndex + 1) + ' / ' + images.length : '';

    // Nav visibility
    prevBtn.style.display = images.length > 1 ? '' : 'none';
    nextBtn.style.display = images.length > 1 ? '' : 'none';
  }

  // ── 10. Gather images in context──────────────────────────────────
  // ── 11. gatherImages───────────────────────────────────────
  function gatherImages(startEl) {
    // If inside a gallery block, get all images in that gallery
    var gallery = startEl.closest('.wp-block-gallery');
    if (gallery) {
      return Array.from(gallery.querySelectorAll('img'));
    }
    // Otherwise, get all images in .prose
    var prose = startEl.closest('.prose');
    if (prose) {
      return Array.from(prose.querySelectorAll('img'));
    }
    return [startEl];
  }

  // ── 12. Init: make triggers keyboard-operable + attach handlers───
  // ── 13. init───────────────────────────────────────────────
  function init() {
    // Make every lightbox-eligible image a keyboard-operable control.
    document.querySelectorAll('.prose img').forEach(function(imgEl) {
      // Skip if the image is inside an <a> (already keyboard-activatable).
      if (imgEl.closest('a')) return;
      if (!imgEl.hasAttribute('tabindex')) imgEl.setAttribute('tabindex', '0');
      imgEl.setAttribute('role', 'button');
      if (!imgEl.hasAttribute('aria-label')) {
        imgEl.setAttribute('aria-label', 'View larger image' + (imgEl.alt ? ': ' + imgEl.alt : ''));
      }
    });

    document.addEventListener('click', function(e) {
      // Only handle clicks on images inside .prose
      var target = e.target.closest ? e.target.closest('.prose img') : null;
      if (!target) return;

      // Skip if the image is inside an <a> tag (already linked)
      if (target.closest('a')) return;

      e.preventDefault();

      // Find index
      var allImgs = gatherImages(target);
      var idx = allImgs.indexOf(target);
      open(target, idx !== -1 ? idx : 0);
    });

    // Keyboard activation - Enter / Space on a focusable trigger image.
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var target = e.target.closest ? e.target.closest('.prose img') : null;
      if (!target || target.closest('a')) return;
      e.preventDefault();
      var allImgs = gatherImages(target);
      var idx = allImgs.indexOf(target);
      open(target, idx !== -1 ? idx : 0);
    });
  }

  // ── 14. Kick off after DOM────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
