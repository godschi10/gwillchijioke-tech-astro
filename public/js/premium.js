/*
 * GWill Tech - Premium polish (v1.18.00, King: "more expensive look + features")
 *
 * Two progressive-enhancement features, both safe to run anywhere:
 *   - Scroll-reveal: any .reveal element fades/rises in when scrolled into
 *     view. Honors prefers-reduced-motion (the CSS duration is zeroed by the
 *     global media query, so it simply appears). If IntersectionObserver is
 *     unavailable, everything is shown immediately.
 *   - TOC tracker: on singular posts, highlights the .toc-list link whose
 *     section is currently in view (adds .active). No-ops when no TOC.
 *
 * No dependencies. Deferred + in_footer via enqueue.php.
 *
 * @package GWill_Tech
 * @since   1.18.00
 */

/*
Table of Contents
Table of Contents
1. sticky header scroll-state
2. scroll-reveal
3. TOC active-section tracker
*/

/* ── 1. Sticky header scroll-state (v1.18.10) ───────────────────────────
   Deepens blur + adds a hairline green glow border after 8px of scroll.
   Enhancement only - the transparency the King loves is preserved. */

( function () {
	'use strict';

	// Remove the no-js guard (added inline in <head>) so .reveal elements
	// that never get observed still render if JS is disabled mid-flight.
	document.documentElement.classList.remove( 'no-js' );

	var headerEl = document.querySelector( '.site-header' );
	if ( headerEl ) {
		var onScroll = function () {
			if ( window.scrollY > 8 ) headerEl.classList.add( 'is-scrolled' );
			else headerEl.classList.remove( 'is-scrolled' );
		};
		window.addEventListener( 'scroll', onScroll, { passive: true } );
		onScroll();
	}

	// ── 2. Scroll-reveal ────────────────────────────────────────────────
	var reveals = document.querySelectorAll( '.reveal' );
	if ( reveals.length ) {
		if ( 'IntersectionObserver' in window ) {
			var io = new IntersectionObserver( function ( entries ) {
				entries.forEach( function ( entry ) {
					if ( entry.isIntersecting ) {
						entry.target.classList.add( 'is-visible' );
						io.unobserve( entry.target );
					}
				} );
			}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 } );

			reveals.forEach( function ( el ) { io.observe( el ); } );
		} else {
			// No IO support - show everything.
			reveals.forEach( function ( el ) { el.classList.add( 'is-visible' ); } );
		}
	}

	// ── 3. TOC active-section tracker ──────────────────────────────────
	var tocLinks = document.querySelectorAll( '.toc-list a' );
	if ( tocLinks.length && 'IntersectionObserver' in window ) {
		// Map each TOC link to its target heading by href (#id).
		var map = [];
		tocLinks.forEach( function ( link ) {
			var href = link.getAttribute( 'href' ) || '';
			if ( href.charAt( 0 ) !== '#' ) return;
			var target = document.getElementById( href.slice( 1 ) );
			if ( target ) map.push( { link: link, target: target } );
		} );

		if ( map.length ) {
			var setActive = function ( feedback ) {
				tocLinks.forEach( function ( l ) { l.classList.remove( 'active' ); } );
				feedback.classList.add( 'active' );
			};

			var visible = [];
			var passed  = [];
			var spy = new IntersectionObserver( function ( entries ) {
				entries.forEach( function ( entry ) {
					var rec = map.find( function ( m ) { return m.target === entry.target; } );
					if ( ! rec ) return;
					if ( entry.isIntersecting ) {
						if ( visible.indexOf( rec ) === -1 ) visible.push( rec );
						passed = passed.filter( function ( m ) { return m.rec !== rec; } );
					} else {
						visible = visible.filter( function ( m ) { return m !== rec; } );
						// Exited through the TOP edge -> the whole heading is
						// above the band -> its section has been read past.
						if ( entry.boundingClientRect.bottom <= 0 ) {
							passed = passed.filter( function ( m ) { return m.rec !== rec; } );
							passed.push( { rec: rec, y: entry.boundingClientRect.top + ( window.scrollY || window.pageYOffset || 0 ) } );
						} else {
							passed = passed.filter( function ( m ) { return m.rec !== rec; } );
						}
					}
				} );
				// Highlight the topmost currently-visible section. When the
				// band is EMPTY (heading scrolled past its top - most of the
				// time on phones), follow the deepest heading already passed
				// instead of freezing on the last one touched (v1.18.90 bug).
				// Pure-CSS taps (v1.18.97): the browser's native :active
				// gives tap feedback; JS adds nothing on tap. The observer
				// only tracks reading position - never fights the finger.
				var docY     = document.documentElement;
				var atBottom = window.innerHeight + ( window.scrollY || window.pageYOffset || 0 ) >= docY.scrollHeight - 4;
				if ( visible.length ) {
					setActive( visible[ 0 ].link );
				} else if ( atBottom && map.length ) {
					setActive( map[ map.length - 1 ].link );
				} else if ( passed.length ) {
					var best = passed[ 0 ];
					for ( var p = 1; p < passed.length; p++ ) {
						if ( passed[ p ].y > best.y ) best = passed[ p ];
					}
					setActive( best.rec.link );
				} else {
					tocLinks.forEach( function ( l ) { l.classList.remove( 'active' ); } );
				}
			}, { rootMargin: '0px 0px -70% 0px', threshold: 0 } );

			map.forEach( function ( m ) { spy.observe( m.target ); } );
		}
	}
} )();