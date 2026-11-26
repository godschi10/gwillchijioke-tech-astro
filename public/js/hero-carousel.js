/**
 * GWill Tech - Hero Carousel (homepage featured section)
 *
 * Drives the .hero-carousel built in template-parts/hero-carousel.php:
 * auto-advance with pause on hover/focus, prev/next arrows, dot indicators,
 * arrow-key navigation, touch swipe, aria-live announcements, and the green
 * progress bar under the active slide.
 *
 * Graceful degradation is CSS-first: with this script disabled the first
 * slide renders visible and the controls are hidden - the hero is a static
 * featured card.
 *
 * Deferred + in_footer. Enqueued only on the front page (inc/enqueue.php).
 */

/*
Table of Contents
1. Dots
2. Go to slide
3. goTo
4. Autoplay + progress bar
5. stopAutoplay
6. startProgress
7. restart
8. Arrows + keyboard
9. Touch swipe
10. Init
*/

( function () {
	'use strict';

	var carousel = document.getElementById( 'hero-carousel' );
	if ( ! carousel ) {
		return;
	}

	var slides    = carousel.querySelectorAll( '.hc-slide' );
	var track     = carousel.querySelector( '.hc-track' );
	var dotsWrap  = carousel.querySelector( '.hc-dots' );
	var prevBtn   = carousel.querySelector( '[data-hc-prev]' );
	var nextBtn   = carousel.querySelector( '[data-hc-next]' );
	var toggleBtn = carousel.querySelector( '[data-hc-toggle]' );
	var fill      = carousel.querySelector( '.hc-progress-fill' );

	if ( slides.length < 2 ) {
		// Single slide - no carousel behaviour needed; keep it visible.
		carousel.classList.add( 'hc-single' );
		return;
	}

	var AUTOPLAY_MS = 6000;
	var current     = 0;
	var timer       = null;
	var progressTimer = null;
	var touchStartX = null;
	// Vestibular users: keep manual controls, skip auto-advance entirely.
	var REDUCED_MOTION = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	// Reveal controls (CSS keeps them hidden until JS confirms carousel works).
	carousel.classList.add( 'hc-js' );

	// ── 1. Dots───────────────────────────────────────────────────────
	var dots = [];
	slides.forEach( function ( slide, i ) {
		var dot = document.createElement( 'button' );
		dot.type = 'button';
		dot.className = 'hc-dot' + ( i === 0 ? ' is-active' : '' );
		dot.setAttribute( 'role', 'tab' );
		dot.setAttribute( 'aria-selected', i === 0 ? 'true' : 'false' );
		dot.setAttribute( 'aria-label', 'Go to slide ' + ( i + 1 ) );
		dot.addEventListener( 'click', function () { goTo( i ); restart( true ); } );
		dotsWrap.appendChild( dot );
		dots.push( dot );
	} );
	dotsWrap.setAttribute( 'role', 'tablist' );

	// ── 2. Go to slide────────────────────────────────────────────────
	// ── 3. goTo───────────────────────────────────────────────
	function goTo( index ) {
		current = ( index + slides.length ) % slides.length;
		slides.forEach( function ( slide, i ) {
			var active = i === current;
			slide.classList.toggle( 'is-active', active );
			slide.setAttribute( 'aria-hidden', active ? 'false' : 'true' );
		} );
		dots.forEach( function ( dot, i ) {
			var active = i === current;
			dot.classList.toggle( 'is-active', active );
			dot.setAttribute( 'aria-selected', active ? 'true' : 'false' );
		} );
		startProgress();
	}

	// ── 4. Autoplay + progress bar────────────────────────────────────
	// ── 5. stopAutoplay───────────────────────────────────────
	function stopAutoplay() {
		if ( timer ) { clearInterval( timer ); timer = null; }
		if ( progressTimer ) { clearInterval( progressTimer ); progressTimer = null; }
		if ( fill ) { fill.style.transition = 'none'; fill.style.transform = 'scaleX(0)'; }
	}

	// ── 6. startProgress──────────────────────────────────────
	function startProgress() {
		if ( ! fill ) { return; }
		fill.style.transition = 'none';
		fill.style.transform = 'scaleX(0)';
		// Force reflow so the transition below actually animates from 0.
		void fill.offsetWidth;
		fill.style.transition = 'transform ' + ( AUTOPLAY_MS / 1000 ) + 's linear';
		fill.style.transform = 'scaleX(1)';
	}

	// ── 7. restart────────────────────────────────────────────
	function restart( fromInteraction ) {
		stopAutoplay();
		// Vestibular users + background tab + explicit pause: never resume.
		if ( REDUCED_MOTION || document.hidden || paused ) {
			return;
		}
		// Manual navigation (tap / click / swipe / arrow key) always resumes
		// autoplay. The old guard ALSO required "not hovering AND not
		// focused" - but a touch tap leaves the tapped control focused
		// forever and touch devices never fire mouseleave, so the very
		// first tap on a phone dead-stopped the carousel permanently.
		// (v1.16.86 - King: "why does the carousel stop after clicking
		// any direction".)
		if ( ! fromInteraction && ( carousel.matches( ':hover' ) || carousel.contains( document.activeElement ) ) ) {
			return;
		}
		startProgress();
		timer = setInterval( function () { goTo( current + 1 ); }, AUTOPLAY_MS );
	}

	// Pause on hover / focus; resume after (only when document is visible).
	carousel.addEventListener( 'mouseenter', stopAutoplay );
	carousel.addEventListener( 'mouseleave', restart );
	carousel.addEventListener( 'focusin', function () { stopAutoplay(); } );
	carousel.addEventListener( 'focusout', function () { restart(); } );
	document.addEventListener( 'visibilitychange', function () { document.hidden ? stopAutoplay() : restart(); } );

	// ── 4b. Explicit pause/play toggle (v1.19.22 WCAG 2.2.2) ─────────────
	// Hover/focus pausing alone fails keyboard-only users who never hover and
	// can't hold focus while reading. A dedicated control must exist.
	var paused = false;
	if ( toggleBtn ) {
		var pauseIcon = toggleBtn.querySelector( '.hc-pause-icon' );
		var playIcon  = toggleBtn.querySelector( '.hc-play-icon' );
		toggleBtn.addEventListener( 'click', function () {
			paused = ! paused;
			toggleBtn.setAttribute( 'aria-pressed', paused ? 'true' : 'false' );
			toggleBtn.setAttribute( 'aria-label', paused ? 'Play carousel autoplay' : 'Pause carousel autoplay' );
			if ( pauseIcon && playIcon ) {
				pauseIcon.style.display = paused ? 'none' : '';
				playIcon.style.display  = paused ? '' : 'none';
			}
			if ( paused ) {
				stopAutoplay();
			} else {
				restart( true );
			}
		} );
		// Manual nav while explicitly paused must NOT silently resume - that
		// would negate the control. restart() checks `paused`.
	}

	// ── 8. Arrows + keyboard──────────────────────────────────────────
	prevBtn.addEventListener( 'click', function () { goTo( current - 1 ); restart( true ); } );
	nextBtn.addEventListener( 'click', function () { goTo( current + 1 ); restart( true ); } );

	carousel.addEventListener( 'keydown', function ( e ) {
		if ( e.key === 'ArrowLeft' ) { e.preventDefault(); goTo( current - 1 ); restart( true ); }
		else if ( e.key === 'ArrowRight' ) { e.preventDefault(); goTo( current + 1 ); restart( true ); }
	} );

	// ── 9. Touch swipe────────────────────────────────────────────────
	carousel.addEventListener( 'touchstart', function ( e ) {
		touchStartX = e.touches[ 0 ].clientX;
	}, { passive: true } );

	carousel.addEventListener( 'touchend', function ( e ) {
		if ( touchStartX === null ) { return; }
		var delta = e.changedTouches[ 0 ].clientX - touchStartX;
		if ( Math.abs( delta ) > 40 ) {
			goTo( delta < 0 ? current + 1 : current - 1 );
			restart( true );
		}
		touchStartX = null;
	}, { passive: true } );

	// ── 10. Init──────────────────────────────────────────────────────
	slides.forEach( function ( slide, i ) { slide.setAttribute( 'aria-hidden', i === 0 ? 'false' : 'true' ); } );
	restart();
} )();
