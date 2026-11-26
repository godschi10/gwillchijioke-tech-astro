/**
 * Sticky ad bar - dismissal persistence + reveal timing.
 *
 * Externalized from footer.php in v1.16.72 (CLEANUP AUDIT S1.6: inline
 * scripts live in files, not templates). Enqueued only when a sticky or
 * leaderboard slot actually has code - see inc/enqueue.php for the
 * matching condition. Deferred, so the DOM is parsed when this runs.
 *
 * @package GWill_Tech
 */

/*
Table of Contents
1. isDismissed
2. showBar
*/

( function () {
	'use strict';
	var bar = document.getElementById( 'ad-sticky' );
	if ( ! bar ) return;

	// Dismissal persistence: once closed, stay closed for this window
	// (1 hour - enough UX relief to feel respected, short enough not
	// to cost meaningful ad revenue). localStorage, not sessionStorage:
	// the choice should survive tab closes and browser restarts.
	var DISMISS_KEY = 'gwill_ad_dismissed_at';
	var DISMISS_WINDOW = 60 * 60 * 1000; // 1 hour

	// ── 1. isDismissed ────────────────────────────────────────
	function isDismissed() {
		try {
			var t = parseInt( localStorage.getItem( DISMISS_KEY ) || '', 10 );
			return ! isNaN( t ) && ( Date.now() - t ) < DISMISS_WINDOW;
		} catch ( e ) {
			return false;
		}
	}

	// The bar only becomes visible 3s after page load - it is a
	// bottom-of-screen slot, so a short delay lets the reader settle
	// into the page before the ad appears (and keeps the above-the-fold
	// first paint clean for Core Web Vitals).
	// ── 2. showBar ────────────────────────────────────────────
	function showBar() {
		setTimeout( function () {
			document.body.classList.add( 'ad-sticky-visible' );
		}, 3000 );
		var x = document.getElementById( 'ad-sticky-x' );
		if ( x ) {
			x.addEventListener( 'click', function () {
				document.body.classList.remove( 'ad-sticky-visible' );
				bar.remove();
				try {
					localStorage.setItem( DISMISS_KEY, String( Date.now() ) );
				} catch ( e ) {}
			} );
		}
	}

	// Already dismissed within the window? Never show it at all.
	if ( isDismissed() ) {
		bar.remove();
		return;
	}

	// The cookie consent banner must never share the bottom with the
	// sticky ad (3-deep stacking = trash UX). If the banner is showing
	// or will show (no 'cc' flag in sessionStorage OR localStorage -
	// v1.15.3 dual storage), defer the ad until the visitor
	// accepts/declines; only then reveal the ad.
	// Cross-browser: storage reads wrapped - Safari private mode throws (v1.19.18).
	var consentPending = false;
	try {
		consentPending = cookie && ! sessionStorage.getItem( 'cc' ) && ! localStorage.getItem( 'cc' );
	} catch ( e ) {
		consentPending = !! cookie;
	}
	if ( consentPending ) {
		var done = false;
		var reveal = function () {
			if ( done ) return;
			done = true;
			showBar();
		};
		var btns = cookie.querySelectorAll( '[data-gwill-cookie-accept], [data-gwill-cookie-decline]' );
		btns.forEach( function ( b ) { b.addEventListener( 'click', reveal ); } );
		// Safety net: if the banner is dismissed some other way,
		// re-check shortly after it would have appeared (2s delay + buffer).
		setTimeout( function () {
			if ( ! cookie.classList.contains( 'show' ) ) reveal();
		}, 3000 );
		return;
	}

	showBar();
} )();
