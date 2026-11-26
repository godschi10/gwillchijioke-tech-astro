/**
 * GWill Tech - Cookie Consent (Session-Based)
 *
 * Simple sessionStorage-based cookie consent banner.
 * Matches the original header.php inline JS behavior.
 *
 * @package GWill_Tech
 * @since   1.0.0
 */

/*
Table of Contents
1. remember
2. hideBanner
*/

( function () {
	'use strict';

	var STORAGE_KEY = 'cc';
	var banner = document.getElementById( 'cookie' );

	if ( ! banner ) return;

	// Remembered consent (v1.15.3): check BOTH storages. sessionStorage is
	// per-TAB - mobile browsers open a new tab for every link tap, so a
	// choice made in one tab used to nag in every new tab ("the widget
	// never disappears"). localStorage is per-origin: one accept/decline
	// hides the banner everywhere until the visitor clears site data.
	// Cross-browser: Safari private mode throws on BOTH getItem and setItem -
	// every storage touch is wrapped (v1.19.18 cross-browser audit).
	function consentStored() {
		try {
			return sessionStorage.getItem( STORAGE_KEY ) || localStorage.getItem( STORAGE_KEY );
		} catch ( e ) {
			return null;
		}
	}
	if ( consentStored() ) {
		banner.style.display = 'none';
		return;
	}

	// Show after 2 seconds
	setTimeout( function () {
		if ( banner ) {
			banner.classList.add( 'show' );
		}
	}, 2000 );

	// Accept button
	var acceptBtn = banner.querySelector( '[data-gwill-cookie-accept]' );
	var declineBtn = banner.querySelector( '[data-gwill-cookie-decline]' );

	// ── 1. remember ───────────────────────────────────────────
	function remember() {
		// try/catch: Safari private mode throws on localStorage.setItem
		try { sessionStorage.setItem( STORAGE_KEY, '1' ); } catch ( e ) {}
		try { localStorage.setItem( STORAGE_KEY, '1' ); } catch ( e ) {}
	}

	// ── 2. hideBanner ─────────────────────────────────────────
	function hideBanner() {
		if ( banner ) {
			banner.classList.remove( 'show' );
			// Belt & braces: hard-hide after the 300ms slide-out so the
			// widget can never linger if a browser drops the transform.
			window.setTimeout( function () {
				if ( banner ) banner.style.display = 'none';
			}, 350 );
		}
		remember();
	}

	if ( acceptBtn ) {
		acceptBtn.addEventListener( 'click', hideBanner );
	}
	if ( declineBtn ) {
		declineBtn.addEventListener( 'click', hideBanner );
	}
} )();