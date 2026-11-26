/**
 * GWill Tech - assets/js/category-filter.js
 *
 * AJAX category-pill filter. Pressing a pill inside a `.filter-pills`
 * container loads that category's posts fresh from the server (rendered as
 * cards by inc/ajax-posts.php) and swaps them into the target grid, with a
 * CSS spinner while the request is in flight.
 *
 * The container carries everything the handler needs via data attributes:
 *   <div class="filter-pills"
 *        data-target="#home-grid"     - CSS selector of the grid to replace
 *        data-cta="#home-cta"         - element whose HTML becomes the
 *                                       "View all …" link for the active pill
 *        data-context="home|blog"     - which card style to render
 *        data-per-page="9"
 *        data-action="gwill_filter_posts">
 *
 * Pills carry data-filter="all|<category-slug>". Loaded via the same relative
 * admin-ajax URL pattern as the contact form (cache/tunnel-safe).
 */

/*
Table of Contents
1. gwillFetch
2. setActive
3. filterGrid
*/

( function () {
	// ── 1. gwillFetch ─────────────────────────────────────────
	/**
	 * gwillFetch - fetch() with an XMLHttpRequest fallback for browsers that
	 * lack the Fetch API (Safari <10.1, Chrome <42, Firefox <39). Resolves
	 * with a fetch-compatible response ({ ok, status, json(), text() }).
	 * The theme's ES6+ floor already requires Promise (Safari 8+, Chrome 32+),
	 * which every fetch-less browser here also has.
	 */
	function gwillFetch( url, options ) {
		options = options || {};
		if ( window.fetch ) {
			return fetch( url, options );
		}
		return new Promise( function ( resolve, reject ) {
			var xhr = new XMLHttpRequest();
			xhr.open( options.method || 'GET', url, true );
			if ( options.headers ) {
				for ( var key in options.headers ) {
					if ( Object.prototype.hasOwnProperty.call( options.headers, key ) ) {
						xhr.setRequestHeader( key, options.headers[ key ] );
					}
				}
			}
			xhr.onload = function () {
				resolve( {
					ok: xhr.status >= 200 && xhr.status < 300,
					status: xhr.status,
					json: function () {
						return Promise.resolve( JSON.parse( xhr.responseText ) );
					},
					text: function () {
						return Promise.resolve( xhr.responseText );
					}
				} );
			};
			xhr.onerror = function () {
				reject( new Error( 'Network request failed' ) );
			};
			xhr.send( options.body || null );
		} );
	}

	'use strict';

	var cfg = window.GwillCategoryFilter || { ajaxUrl: '/wp-admin/admin-ajax.php', i18n: {} };

	// ── 2. setActive ──────────────────────────────────────────
	function setActive( container, btn ) {
		var pills = container.querySelectorAll( '.pill' );
		Array.prototype.forEach.call( pills, function ( p ) {
			p.classList.remove( 'on' );
			p.removeAttribute( 'aria-pressed' );
		} );
		btn.classList.add( 'on' );
		btn.setAttribute( 'aria-pressed', 'true' );
	}

	// ── 3. filterGrid ─────────────────────────────────────────
	function filterGrid( container, btn, cat ) {
		var targetSelector = container.getAttribute( 'data-target' ) || '';
		var grid = targetSelector ? document.querySelector( targetSelector ) : null;
		if ( ! grid ) { return; }

		var context = container.getAttribute( 'data-context' ) || 'blog';
		var perPage = parseInt( container.getAttribute( 'data-per-page' ) || '9', 10 ) || 9;
		var action  = container.getAttribute( 'data-action' ) || 'gwill_filter_posts';
		var ctaSel  = container.getAttribute( 'data-cta' ) || '';

		setActive( container, btn );

		// Loading indicator: a spinner overlay goes ON TOP of the featured
		// image of the first card, so it stays visible even on slow
		// connections while the fresh cards (and their images) arrive.
		var spinHost = grid.querySelector( '.card:first-child .card-media' );
		var spin = null;
		if ( spinHost ) {
			spin = document.createElement( 'span' );
			spin.className = 'filter-grid__spinner';
			spin.setAttribute( 'aria-hidden', 'true' );
			spinHost.appendChild( spin );
		}

		// Build the URL manually so we can control the exact params.
		var url = cfg.ajaxUrl +
			'?action=' + encodeURIComponent( action ) +
			'&category=' + encodeURIComponent( cat ) +
			'&context=' + encodeURIComponent( context ) +
			'&per_page=' + perPage;

		grid.classList.add( 'is-loading' );
		grid.setAttribute( 'aria-busy', 'true' );

		gwillFetch( url, {
			method: 'GET',
			credentials: 'same-origin',
			headers: { 'X-Requested-With': 'XMLHttpRequest' }
		} )
			.then( function ( res ) { return res.json(); } )
			.then( function ( data ) {
				if ( data && data.success ) {
					grid.innerHTML = data.data.html || '';
					if ( ctaSel ) {
						var ctaEl = document.querySelector( ctaSel );
						if ( ctaEl ) { ctaEl.innerHTML = data.data.cta || ''; }
					}
				} else {
					grid.innerHTML = '<p class="filter-grid__error">' +
						( cfg.i18n.error || 'Could not load posts. Please try again.' ) +
						'</p>';
				}
			} )
			.catch( function () {
				grid.innerHTML = '<p class="filter-grid__error">' +
					( cfg.i18n.error || 'Could not load posts. Please try again.' ) +
					'</p>';
			} )
			.finally( function () {
				if ( spin && spin.parentNode ) { spin.parentNode.removeChild( spin ); }
				grid.classList.remove( 'is-loading' );
				grid.removeAttribute( 'aria-busy' );
			} );
	}

	document.addEventListener( 'click', function ( e ) {
		if ( ! e.target.closest ) { return; }
		var btn = e.target.closest( '.filter-pills .pill[data-filter]' );
		if ( ! btn ) { return; }
		e.preventDefault();

		var container = btn.closest( '.filter-pills' );
		if ( ! container ) { return; }

		filterGrid( container, btn, btn.getAttribute( 'data-filter' ) );
	} );

} )();
