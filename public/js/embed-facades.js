/**
 * Embed facades - privacy click-to-load (v1.16.78, watchdog v1.16.83,
 * player load failsafe v1.16.84).
 *
 * Server-side (inc/embeds.php) replaces YouTube/Vimeo oEmbed iframes with
 * `.gwill-embed-facade` buttons so NO third-party request fires until the
 * visitor presses play (zero third-party cookies on page load). This
 * script swaps the facade for the real player on activation.
 *
 * v1.16.83 adds the fullscreen-exit scroll watchdog (event-independent -
 * covers desktop Chromium's smooth-scroll restore AND mobile native
 * players that fire no fullscreenchange).
 * v1.16.84: (1) player load failsafe - if the player host never answers
 * (blocked/throttled network), the facade is replaced with an honest
 * fallback - direct "Open on YouTube/Vimeo" link + Retry - instead of a
 * silent black box; (2) WATCHDOG ANCHOR HARDENING - Android Chrome scrolls
 * the page to the top AT the moment of fullscreen ENTRY (browser-UI
 * reflow); the anchor is now rising-only (play-click is the floor, entry
 * deepens but can never destroy it) and the guard arms at entry too.
 *
 * Listener-bound via document-level delegation - no globals, no
 * inline-onclick, works with cached/async HTML. Deferred + in_footer.
 * The button is a real <button>, so Enter/Space activate it natively.
 */

/*
Table of Contents
1. buildIframe
2. gwillWatchUrl
3. gwillHostName
4. showFallback
5. activate
6. gwillRestorePlayerY
7. gwillArmWatch
8. gwillFsEnter
*/

( function () {
	'use strict';

	// Shared permission allow-list covers both players (unknown permissions
	// are ignored by the browser, so one list is safe).
	var ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

	// Player load timeout - if the host hasn't answered in 10s the network
	// is almost certainly blocking/throttling it (a reachable host answers
	// its document far faster; video buffering does NOT count - the load
	// event fires when the player document loads, not when playback starts).
	var LOAD_TIMEOUT = 10000;

	// ── 1. buildIframe ────────────────────────────────────────
	function buildIframe( src, title ) {
		var iframe = document.createElement( 'iframe' );
		iframe.src = src;
		iframe.title = title || '';
		iframe.setAttribute( 'frameborder', '0' );
		iframe.setAttribute( 'allow', ALLOW );
		iframe.setAttribute( 'referrerpolicy', 'strict-origin-when-cross-origin' );
		iframe.setAttribute( 'allowfullscreen', '' );
		iframe.className = 'gwill-embed-facade__iframe';
		return iframe;
	}

	// Direct watch URL derived from the privacy-mode player URL.
	// ── 2. gwillWatchUrl ──────────────────────────────────────
	function gwillWatchUrl( src ) {
		var m = src.match( /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]+)/ );
		if ( m ) { return 'https://www.youtube.com/watch?v=' + m[1]; }
		var v = src.match( /player\.vimeo\.com\/video\/([0-9]+)/ );
		if ( v ) { return 'https://vimeo.com/' + v[1]; }
		return null;
	}

	// ── 3. gwillHostName ──────────────────────────────────────
	function gwillHostName( src ) {
		if ( src.indexOf( 'youtube' ) !== -1 ) { return 'YouTube'; }
		if ( src.indexOf( 'vimeo' ) !== -1 ) { return 'Vimeo'; }
		return null;
	}

	// Honest failure state: the player host never answered. Replace the
	// silent iframe with a direct-link + retry box (v1.16.84).
	// ── 4. showFallback ───────────────────────────────────────
	function showFallback( iframe, src, title ) {
		var l10n = window.gwillEmbedL10n || {};
		var host = gwillHostName( src );

		var box = document.createElement( 'div' );
		box.className = 'gwill-embed-fallback';
		box.setAttribute( 'role', 'alert' );

		var h = document.createElement( 'p' );
		h.className = 'gwill-embed-fallback__title';
		h.textContent = l10n.blockedTitle || 'Video blocked or unreachable';
		box.appendChild( h );

		var t = document.createElement( 'p' );
		t.className = 'gwill-embed-fallback__text';
		t.textContent = l10n.blockedText || 'Your network may be blocking this player - open it directly instead:';
		box.appendChild( t );

		var actions = document.createElement( 'p' );
		actions.className = 'gwill-embed-fallback__actions';

		var watch = gwillWatchUrl( src );
		if ( watch && host ) {
			var a = document.createElement( 'a' );
			a.className = 'btn btn-primary';
			a.href = watch;
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.textContent = ( l10n.openOn || 'Open on %s' ).replace( '%s', host );
			actions.appendChild( a );
		}

		var retry = document.createElement( 'button' );
		retry.type = 'button';
		retry.className = 'btn btn-ghost';
		retry.textContent = l10n.retry || 'Retry';
		retry.addEventListener( 'click', function () {
			var f = buildIframe( src, title );
			box.replaceWith( f );
			f.focus();
			var timer2 = setTimeout( function () {
				showFallback( f, src, title );
			}, LOAD_TIMEOUT );
			f.addEventListener( 'load', function () {
				clearTimeout( timer2 );
			} );
		} );
		actions.appendChild( retry );

		box.appendChild( actions );
		iframe.replaceWith( box );
	}

	// ── 5. activate ───────────────────────────────────────────
	function activate( btn ) {
		var src = btn.getAttribute( 'data-gwill-src' ) || '';
		var title = btn.getAttribute( 'data-gwill-title' ) || '';
		var iframe = buildIframe( src, title );
		btn.replaceWith( iframe );
		// Move keyboard focus into the player so keyboard users continue
		// where the facade left off.
		iframe.focus();
		// Remember where the reader started watching - the fullscreen-exit
		// watchdog restores this position if the page ever jumps to top.
		watch.y = window.scrollY || document.documentElement.scrollTop || 0;
		// Player load failsafe (v1.16.84).
		var timer = setTimeout( function () {
			showFallback( iframe, src, title );
		}, LOAD_TIMEOUT );
		iframe.addEventListener( 'load', function () {
			clearTimeout( timer );
		} );
	}

	document.addEventListener( 'click', function ( event ) {
		var target = event.target;
		// Climb to the facade (click may land on the img or play glyph).
		while ( target && target !== document ) {
			if ( target.classList && target.classList.contains( 'gwill-embed-facade' ) ) {
				activate( target );
				return;
			}
			target = target.parentNode;
		}
	} );

	// -----------------------------------------------------------------------
	// Fullscreen-exit scroll watchdog (v1.16.83)
	//
	// The King's report: exiting a YouTube/Vimeo fullscreen ALWAYS scrolls
	// the page to the top - on desktop Chromium the cause is
	// `html { scroll-behavior: smooth }`: the browser's exit-restore is an
	// ANIMATED scroll that lands at 0 (main.js section 05 forces
	// `scroll-behavior: auto` during fullscreen to fix that path). On MOBILE
	// the same symptom has a second, EVENT-FREE cause: iOS Safari presents
	// embedded video in its NATIVE fullscreen player, which fires no
	// fullscreenchange on the page at all - an event-driven fix can never
	// fire there. This watchdog depends on no fullscreen event: it arms
	// whenever a player is opened (and on every fullscreen/viewport signal)
	// and, if the page jumps to the top while a player is in use, snaps the
	// reader straight back.
	//
	// Predicates that prevent false restores: the page must be at the very
	// top (y < 10), the saved position must be genuinely mid-page (> 50),
	// and the top must have been reached in a BURST (a jump is one instant
	// with no scrolling since; a deliberate scroll keeps firing scroll
	// events). Restoring uses an instant scroll so `scroll-behavior: smooth`
	// cannot animate the correction.
	// -----------------------------------------------------------------------

	var watch = { y: 0, until: 0, lastScroll: 0, atTopSince: 0 };

	// ── 6. gwillRestorePlayerY ────────────────────────────────
	function gwillRestorePlayerY() {
		if ( Date.now() > watch.until ) { return; }
		var y = window.scrollY || document.documentElement.scrollTop || 0;
		if ( y < 10 && watch.y > 50 ) {
			if ( watch.atTopSince === 0 ) { watch.atTopSince = Date.now(); }
			// Only restore when the top was hit in a burst and nothing has
			// scrolled since - the fullscreen-exit jump pattern.
			if ( ( Date.now() - watch.lastScroll ) > 250 && ( Date.now() - watch.atTopSince ) > 60 ) {
				watch.until = 0; // disarm before restoring - no restore loops
				var html = document.documentElement;
				var prev = html.style.scrollBehavior;
				html.style.scrollBehavior = 'auto';
				window.scrollTo( 0, watch.y );
				html.style.scrollBehavior = prev;
			}
		} else {
			watch.atTopSince = 0;
		}
	}

	// ── 7. gwillArmWatch ──────────────────────────────────────
	function gwillArmWatch( ms ) {
		watch.until = Date.now() + ms;
		setTimeout( gwillRestorePlayerY, 80 );
		setTimeout( gwillRestorePlayerY, 300 );
		setTimeout( gwillRestorePlayerY, 500 );
		setTimeout( gwillRestorePlayerY, 1000 );
	}

	// ── 8. gwillFsEnter ───────────────────────────────────────
	function gwillFsEnter() {
		var y = window.scrollY || document.documentElement.scrollTop || 0;
		// The anchor only ever RISES. Android Chrome can scroll the page to
		// the top AT the moment of fullscreen entry (viewport reflow when
		// the browser UI hides) - re-capturing that moment would lock in
		// y=0 and destroy the restore. The play-click anchor (activate) is
		// the floor; entry only deepens it.
		if ( y > watch.y ) { watch.y = y; }
		// Arm the guard at entry too: if the page jumped to top on the way
		// in, restore mid-fullscreen so the exit lands on the right spot.
		gwillArmWatch( 2500 );
		// Refresh once the entry scroll-into-view has settled (rising-only).
		setTimeout( function () {
			var y2 = window.scrollY || document.documentElement.scrollTop || 0;
			if ( y2 > watch.y ) { watch.y = y2; }
		}, 120 );
	}

	// Desktop + Android Chromium: the standard fullscreen events.
	document.addEventListener( 'fullscreenchange', function () {
		if ( document.fullscreenElement || document.webkitFullscreenElement ) {
			gwillFsEnter();
		} else {
			gwillArmWatch( 2500 );
		}
	} );
	document.addEventListener( 'webkitfullscreenchange', function () {
		if ( document.fullscreenElement || document.webkitFullscreenElement ) {
			gwillFsEnter();
		} else {
			gwillArmWatch( 2500 );
		}
	} );

	// Event-free safety net (iOS native video player): presenting/dismissing
	// the native player resizes the visual viewport with NO fullscreenchange.
	// While a player is in the DOM, any viewport change briefly re-arms the
	// guard; the burst predicate keeps it inert during ordinary scrolling.
	window.addEventListener( 'resize', function () {
		if ( document.querySelector( '.gwill-embed-facade__iframe' ) ) {
			gwillArmWatch( 4000 );
		}
	}, { passive: true } );

	// Catch an already-jumped page and record scroll activity.
	window.addEventListener( 'scroll', function () {
		watch.lastScroll = Date.now();
		gwillRestorePlayerY();
	}, { passive: true } );
} )();
