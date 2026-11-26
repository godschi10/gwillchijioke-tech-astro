/**
 * GWill Starter - assets/js/main.js
 *
 * PRE-BUILT FILE - do not edit directly.
 * Source: src/main.js  |  Build: npm run build
 *
 * Committed as a pre-built file so the theme works without a build step.
 * Enqueued by inc/enqueue.php with strategy: 'defer' - the DOM is fully
 * parsed before this runs; no DOMContentLoaded wrapper is needed.
 */

/*
Table of Contents
1. lockPage
2. unlockPage
3. openNav
4. closeNav
5. Share - "More" button
6. Mobile nav sub-menus - split-tap accordion toggle
7. isMobileViewport
8. setItem
9. Ad slots - device-aware variants + hide label once filled
10. getDevice
11. hasRealContent
12. markFilled
13. instantiate
14. scan
15. Fullscreen exit - scroll restoration
16. onFullscreenChange
*/

( function () {
	'use strict';

	// ------------------------------------------------------------------------
	// Mobile navigation overlay (matches header.php + footer.php markup)
	// ------------------------------------------------------------------------
	// HTML contract (header.php + footer.php):
	//   <button class="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="mob-nav" data-gwill-mobile-nav-toggle>
	//   <div class="mno" id="mob-nav" role="dialog" aria-modal="true" aria-label="Mobile navigation">
	//     <button class="mno-x" data-gwill-mobile-nav-close>...</button>
	//     <a class="mni" href="...">...</a>
	//   </div>
	//
	// CSS contract (style.css):
	//   .hamburger           - shown on mobile (display:flex)
	//   .mno                 - transform: translateX(100%) off-screen
	//   .mno.open            - transform: translateX(0) visible
	//   .mno-x               - close button
	// ------------------------------------------------------------------------

	const navToggles = document.querySelectorAll( '[data-gwill-mobile-nav-toggle]' );
	const mobileNav = document.getElementById( 'mob-nav' );
	const navClose  = mobileNav ? mobileNav.querySelector( '[data-gwill-mobile-nav-close]' ) : null;

	if ( navToggles.length && mobileNav ) {

		// Overlay-style scrollbar: visible on open and while scrolling,
		// hides ~700ms after the scroll gesture ends, comes back on the
		// next scroll. .mno--idle = hidden state (scroll-end debounce).
		var navScrollTimer = null;
		mobileNav.classList.remove( 'mno--idle' );
		mobileNav.addEventListener( 'scroll', function () {
			mobileNav.classList.remove( 'mno--idle' );
			clearTimeout( navScrollTimer );
			navScrollTimer = setTimeout( function () {
				mobileNav.classList.add( 'mno--idle' );
			}, 700 );
		}, { passive: true } );

		// Scroll-lock state. The lock goes on BOTH html (the real scroller -
		// body overflow alone never locks the viewport) and body (iOS needs
		// the body lock too), and the exact position is restored on close
		// with an INSTANT scroll - html has `scroll-behavior: smooth`, so a
		// plain restore would animate = the "page jerks up" glitch.
		var navScrollY = 0;

		// ── 1. lockPage ───────────────────────────────────────────
		function lockPage() {
			navScrollY = window.scrollY;
			document.documentElement.style.overflow = 'hidden';
			document.body.style.overflow = 'hidden';
		}

		// ── 2. unlockPage ─────────────────────────────────────────
		function unlockPage() {
			document.documentElement.style.overflow = '';
			document.body.style.overflow = '';
			if ( Math.abs( window.scrollY - navScrollY ) > 1 ) {
				window.scrollTo( { top: navScrollY, left: 0, behavior: 'instant' } );
			}
		}

		// ── 3. openNav ────────────────────────────────────────────
		function openNav() {
			navToggles.forEach( function ( t ) { t.setAttribute( 'aria-expanded', 'true' ); } );
			mobileNav.classList.add( 'open' );
			// Reveal to the a11y tree + allow focus inside while open.
			mobileNav.removeAttribute( 'aria-hidden' );
			mobileNav.removeAttribute( 'inert' );
			lockPage();
			// Focus first focusable element in the nav - preventScroll keeps
			// the page from smooth-scrolling to it (scroll-behavior: smooth
			// would turn that into a visible jump).
			const firstFocusable = mobileNav.querySelector( 'a, button' );
			if ( firstFocusable ) {
				setTimeout( () => firstFocusable.focus( { preventScroll: true } ), 50 );
			}
		}

		// ── 4. closeNav ───────────────────────────────────────────
		function closeNav() {
			navToggles.forEach( function ( t ) { t.setAttribute( 'aria-expanded', 'false' ); } );
			mobileNav.classList.remove( 'open' );
			// Hide from the a11y tree + drop focusability when closed -
			// transform off-screen is NOT hidden, so this is what keeps
			// keyboard/screen-reader users out of the invisible panel.
			mobileNav.setAttribute( 'aria-hidden', 'true' );
			mobileNav.setAttribute( 'inert', '' );
			// Reset the scrollbar state so the next open shows it again.
			mobileNav.classList.remove( 'mno--idle' );
			clearTimeout( navScrollTimer );
			unlockPage();
			// Focus the first toggle when closing - preventScroll again:
			// the sticky header is already in view, nothing should move.
			if ( navToggles[0] ) {
				navToggles[0].focus( { preventScroll: true } );
			}
		}

		navToggles.forEach( function ( toggle ) {
			toggle.addEventListener( 'click', function () {
				const expanded = toggle.getAttribute( 'aria-expanded' ) === 'true';
				expanded ? closeNav() : openNav();
			} );
		} );

		if ( navClose ) {
			navClose.addEventListener( 'click', closeNav );
		}

		// Close on Escape
		document.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' && navToggles[0].getAttribute( 'aria-expanded' ) === 'true' ) {
				closeNav();
			}
		} );

		// Close when clicking outside (on overlay backdrop area)
		mobileNav.addEventListener( 'click', function ( e ) {
			if ( e.target === mobileNav ) {
				closeNav();
			}
		} );

		// Trap focus inside mobile nav when open
		// Note: focusin is non-cancelable, so we redirect focus instead.
		document.addEventListener( 'focusin', function ( e ) {
			if ( navToggles[0].getAttribute( 'aria-expanded' ) === 'true' ) {
				if ( ! mobileNav.contains( e.target ) && e.target !== navToggles[0] ) {
					const firstFocusable = mobileNav.querySelector( 'a, button, [tabindex]:not([tabindex=\"-1\"])' );
					if ( firstFocusable ) {
						firstFocusable.focus();
					}
				}
			}
		} );
	}

} )();

// ── 5. Share - "More" button ─────────────────────────────────────────────────────
// Triggers navigator.share() (system share sheet on Android / iOS / modern
// desktop). Falls back to Clipboard API on browsers without Web Share API,
// with brief "Copied!" label feedback.

( function () {
	'use strict';

	var btns = document.querySelectorAll( '.gwill-share__pill--more' );
	if ( ! btns.length ) { return; }

	btns.forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var url   = btn.dataset.shareUrl   || window.location.href;
			var title = btn.dataset.shareTitle || document.title;
			var label = btn.querySelector( '.gwill-share__name' );

			if ( navigator.share ) {
				navigator.share( { title: title, url: url } ).catch( function () {} );
				return;
			}

			// Clipboard fallback - desktop browsers without Web Share API.
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( url ).then( function () {
					if ( label ) {
						label.textContent = 'Copied!';
						setTimeout( function () { label.textContent = 'More'; }, 2000 );
					}
				} ).catch( function () {} );
			}
		} );
	} );

}() );

// ── 6. Mobile nav sub-menus - split-tap accordion toggle ───────────────────────
// .mno-list li.has-submenu: on mobile, tapping the row's CHEVRON toggles the
// sub-menu open/closed (preventDefault), while tapping the parent link TEXT
// navigates normally. This fixes the old bug where the whole parent link was
// swallowed by preventDefault → parents with children couldn't be clicked at
// all, only their sub-links could. Best-practice split-button pattern.
( function () {
	'use strict';

	// ── 7. isMobileViewport ───────────────────────────────────
	function isMobileViewport() {
		// ≤767 always. 768-1023 only for coarse pointers: the desktop nav +
		// hover dropdowns are gated behind (hover:hover)+(pointer:fine) in
		// style.css, so touch tablets get the hamburger overlay - and they
		// need the split-tap accordion here to expand sub-menus.
		return window.matchMedia( '(max-width: 767px)' ).matches ||
			( window.matchMedia( '(min-width: 768px) and (max-width: 1023px)' ).matches &&
			  ! window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches );
	}

	// Open/close a single item, closing siblings for a clean accordion.
	// Keeps aria-expanded on the .mno-caret <button> in sync (split-button).
	// ── 8. setItem ────────────────────────────────────────────
	function setItem( li, open ) {
		li.classList.toggle( 'open', open );
		var caret = li.querySelector( '.mno-parent > .mno-caret' );
		if ( caret ) caret.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		if ( li.parentElement ) {
			Array.prototype.forEach.call( li.parentElement.children, function ( s ) {
				if ( s !== li ) {
					s.classList.remove( 'open' );
					var sc = s.querySelector( '.mno-parent > .mno-caret' );
					if ( sc ) sc.setAttribute( 'aria-expanded', 'false' );
				}
			} );
		}
	}

	document.addEventListener( 'click', function ( e ) {
		// Only the mobile overlay accordion (.mno-caret is a <button>; its native
		// click fires on Enter/Space too, so it is keyboard operable).
		var caret = e.target.closest ? e.target.closest( '.mno-list .mno-caret' ) : null;
		if ( ! caret ) return;
		if ( ! isMobileViewport() ) return;

		var li = caret.closest( 'li' );
		if ( ! li ) return;
		var wasOpen = li.classList.contains( 'open' );
		setItem( li, ! wasOpen );

		// preventDefault stops any parent link from navigating; clicks on the
		// link TEXT (outside the button) are left untouched and navigate normally.
		e.preventDefault();
		e.stopPropagation();
	} );

	// On page load, also treat repeated taps of an ALREADY-open parent's text
	// as "close it" rather than navigating - that mirrors common app menus.
	document.addEventListener( 'click', function ( e ) {
		var link = e.target.closest ? e.target.closest( '.mno-list li.has-submenu.open .mno-parent > a' ) : null;
		if ( ! link ) return;
		if ( ! isMobileViewport() ) return;
		// Only if the tap landed on the link text (not the chip - handled above).
		if ( e.target.closest( '.mno-caret' ) || e.target.closest( '.nav-caret' ) ) return;
		setItem( link.closest( 'li' ), false );
		e.preventDefault();
	} );

}() );

// ── 9. Ad slots - device-aware variants + hide label once filled ───────────────
// Each slot ships with up to 3 inert <template class="ad-variant"> codes
// (desktop base, tablet, mobile). This script:
//   1. picks the visitor's device via matchMedia (mobile ≤767, tablet
//      768-1023, desktop ≥1024),
//   2. instantiates ONLY that variant into .ad-slot__content (one ad
//      request per slot - the other variants' scripts never execute;
//      cache-safe since every cached page carries all variants),
//   3. hides the .ad-slot::before "Advertisement" corner label once the
//      content div has real (non-template) children.
// Covers server-rendered slots AND JS-injected comment ads
// (vibe-comments-ads.js, which builds the same markup).

( function () {
	'use strict';

	// ── 10. getDevice ──────────────────────────────────────────
	function getDevice() {
		if ( window.matchMedia( '(max-width: 767px)' ).matches ) {
			return 'mobile';
		}
		if ( window.matchMedia( '(min-width: 768px) and (max-width: 1023px)' ).matches ) {
			return 'tablet';
		}
		return 'desktop';
	}

	// ── 11. hasRealContent ─────────────────────────────────────
	function hasRealContent( content ) {
		if ( ! content ) { return false; }
		var children = content.children;
		for ( var i = 0; i < children.length; i++ ) {
			if ( children[ i ].nodeName.toLowerCase() !== 'template' ) {
				return true;
			}
		}
		return false;
	}

	// ── 12. markFilled ─────────────────────────────────────────
	function markFilled( slot ) {
		if ( slot.classList.contains( 'ad-slot--filled' ) ) { return; }
		var content = slot.querySelector( '.ad-slot__content' );
		if ( ! hasRealContent( content ) ) { return; }
		// v1.22.22 (King: "why was my loading SVG in the ad blocks not
		// working"): real fill = images ACTUALLY LOADED, not merely in the
		// DOM. The banner codes are self-hosted <img loading="lazy"> - the
		// child element appeared the microsecond the template was
		// instantiated, so 'filled' fired instantly, the spinner vanished,
		// and users saw an empty box instead of the "Ad loading..." state
		// it was built to signal (worse on mobile: lazy images wait for
		// viewport entry). While any img is still pending, the spinner
		// keeps spinning; load/error settles the slot either way.
		var pending = [];
		Array.prototype.forEach.call( content.querySelectorAll( 'img' ), function ( img ) {
			if ( ! img.complete ) { pending.push( img ); }
		} );
		if ( pending.length ) {
			pending.forEach( function ( img ) {
				// v1.22.23 (review): one listener set per img. scan() can
				// re-enter markFilled on the same still-pending slot
				// (instantiate() attaches, then scan's own markFilled call
				// re-attaches); correctness held via the filled short-circuit,
				// but each pass stacked duplicate load/error handlers.
				if ( img.__gwillFillBound ) { return; }
				img.__gwillFillBound = true;
				var settle = function () { markFilled( slot ); };
				img.addEventListener( 'load', settle, { once: true } );
				img.addEventListener( 'error', settle, { once: true } );
			} );
			return; // spinner stays until the banner actually paints
		}
		slot.classList.add( 'ad-slot--filled' );
	}

	// ── 13. instantiate ───────────────────────────────────────
	function instantiate( slot ) {
		var content = slot.querySelector( '.ad-slot__content' );
		if ( ! content || content.dataset.gwillDevice ) { return; }

		var device = getDevice();
		var tpl = content.querySelector( 'template.ad-variant[data-device="' + device + '"]' );
		if ( ! tpl ) {
			// No device-specific code - fall back to the desktop/base variant.
			tpl = content.querySelector( 'template.ad-variant[data-device="desktop"]' );
		}
		if ( ! tpl ) { return; }

		// Instantiate the matching variant; drop the inert templates.
		content.appendChild( tpl.content.cloneNode( true ) );
		content.dataset.gwillDevice = device;

		var templates = content.querySelectorAll( 'template.ad-variant' );
		Array.prototype.forEach.call( templates, function ( t ) { t.remove(); } );

		markFilled( slot );
	}

	// ── 14. scan ──────────────────────────────────────────────
	function scan( root ) {
		var slots = root.querySelectorAll ? root.querySelectorAll( '.ad-slot' ) : [];
		Array.prototype.forEach.call( slots, function ( slot ) {
			instantiate( slot );
			markFilled( slot );
		} );
	}

	// Initial pass - server-rendered slots are in the DOM already.
	scan( document );

	// Watch for dynamically injected slots (comment ads) and runtime fill.
	var mo = new MutationObserver( function ( records ) {
		records.forEach( function ( rec ) {
			rec.addedNodes.forEach( function ( node ) {
				if ( node.nodeType !== 1 ) { return; }
				if ( node.classList && node.classList.contains( 'ad-slot' ) ) {
					instantiate( node );
					markFilled( node );
				}
				scan( node );
			} );
		} );
	} );
	mo.observe( document.body, { childList: true, subtree: true } );

	// ------------------------------------------------------------------------
	// Accordion block - theme-owned behavior (v1.7.3). The core/accordion
	// block's stock behavior depends on WordPress' interactivity runtime
	// (~30KB of modules). The theme refuses that bloat: one delegated click
	// handler drives open/close/autoclose + ARIA directly. The WP view
	// module is stripped in functions.php, so nothing extra ever loads.
	// ------------------------------------------------------------------------
	var setOpen = function ( item, open ) {
		var toggle = item.querySelector( '.wp-block-accordion-heading__toggle' );
		var panel  = item.querySelector( '.wp-block-accordion-panel' );
		item.classList.toggle( 'is-open', open );
		if ( toggle ) { toggle.setAttribute( 'aria-expanded', open ? 'true' : 'false' ); }
		if ( panel ) {
			// v1.16.13: role="region" makes the aria-labelledby on the
			// panel meaningful - axe flags it as aria-prohibited-attr when
			// applied to a role-less div (screen readers ignore it).
			if ( ! panel.getAttribute( 'role' ) ) { panel.setAttribute( 'role', 'region' ); }
			panel.toggleAttribute( 'inert', ! open );
		}
	};

	document.addEventListener( 'click', function ( e ) {
		var toggle = e.target.closest ? e.target.closest( '.wp-block-accordion-heading__toggle' ) : null;
		if ( ! toggle ) { return; }
		var item = toggle.closest( '.wp-block-accordion-item' );
		if ( ! item ) { return; }
		var opening = ! item.classList.contains( 'is-open' );
		// Autoclose siblings (the block's default behavior).
		var group = item.closest( '.wp-block-accordion' );
		if ( group ) {
			group.querySelectorAll( '.wp-block-accordion-item' ).forEach( function ( other ) {
				if ( other !== item ) { setOpen( other, false ); }
			} );
		}
		setOpen( item, opening );
	} );

	// Honour the editor's "open by default" flag on first paint.
	document.querySelectorAll( '.wp-block-accordion-item' ).forEach( function ( item ) {
		var ctx = item.getAttribute( 'data-wp-context' ) || '';
		setOpen( item, /"openByDefault":\s*true/.test( ctx ) );
	} );

}() );

/* Accessibility: make scrollable code blocks keyboard-focusable (WCAG 2.1.1).
   Any <pre>/<code> that scrolls horizontally is a scroll container - keyboard
   and assistive-tech users must be able to focus it, or they can never reach
   the overflowed content. The PHP filter adds tabindex to .prose pre; this
   catches Gutenberg core blocks (pre.wp-block-code) that bypass the filter
   and any other overflow-x auto region. */
( function () {
	'use strict';
	// Any code/pre with a horizontal overflow setting is a potential scroll
	// container; make it keyboard-focusable so overflowed content is reachable.
	// Prefers the CSS overflow signal over a runtime scrollWidth check, which
	// can under-measure before fonts/layout settle (a false "no scroll").
	var scrollables = document.querySelectorAll( 'pre, code, .wp-block-code, figure.wp-block-table, .wp-block-table' );
	scrollables.forEach( function ( el ) {
		if ( el.hasAttribute( 'tabindex' ) ) { return; }
		var cs = getComputedStyle( el );
		var scrollsX = /auto|scroll/.test( cs.overflowX );
		if ( scrollsX ) {
			el.setAttribute( 'tabindex', '0' );
		}
	} );
}() );

// ── 15. Fullscreen exit - scroll restoration ─────────────────────────────────────
// Chromium bug (YouTube AND Vimeo affected): on pages with
// `html { scroll-behavior: smooth }` (this theme sets smooth scrolling, plus
// `overflow-x: clip` on html/body as layout blowout defence), exiting an
// iframe's fullscreen (the player's own fullscreen button) restores the scroll
// position with an ANIMATED scroll that lands at the TOP instead of where the
// reader was. Fix: while fullscreen is active, force `scroll-behavior: auto`
// on <html> so the browser's own exit-restore is instant and lands on the
// saved position; restore the original behavior on exit and double-check the
// position a frame later (safety net for browsers that still misbehave).
( function () {
	'use strict';

	var fs = { active: false, y: 0, behavior: '' };

	// ── 16. onFullscreenChange ────────────────────────────────
	function onFullscreenChange() {
		var el = document.fullscreenElement || document.webkitFullscreenElement || null;

		if ( el ) {
			// Entering fullscreen - remember where the reader is and make the
			// browser's exit-restore instant (no smooth animation, no jump).
			// The anchor only ever RISES: Android Chrome can scroll the page
			// to the top AT the moment of entry (viewport reflow when the
			// browser UI hides) - capturing that would lock in y=0 and
			// destroy the restore. The play-click anchor in embed-facades.js
			// is the floor; entry only deepens it.
			fs.active = true;
			var yNow = window.scrollY || document.documentElement.scrollTop || 0;
			if ( yNow > fs.y ) { fs.y = yNow; }
			fs.behavior = document.documentElement.style.scrollBehavior || '';
			document.documentElement.style.scrollBehavior = 'auto';
			return;
		}

		if ( ! fs.active ) { return; }
		fs.active = false;
		document.documentElement.style.scrollBehavior = fs.behavior;

		// Safety net: if the browser still ended up at the top, put the
		// reader back where they were (double rAF = after the browser's own
		// restore has settled).
		var saved = fs.y;
		fs.y = 0; // reset - the NEXT fullscreen (another video, another
		          // position) re-anchors from scratch instead of inheriting.
		requestAnimationFrame( function () {
			requestAnimationFrame( function () {
				var y = window.scrollY || document.documentElement.scrollTop || 0;
				if ( y === 0 && saved > 0 ) {
					window.scrollTo( 0, saved );
				}
			} );
		} );
	}

	document.addEventListener( 'fullscreenchange', onFullscreenChange );
	document.addEventListener( 'webkitfullscreenchange', onFullscreenChange );
}() );
