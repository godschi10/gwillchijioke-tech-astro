/**
 * GWill Tech - Search Dropdown (Inline Header Search) - SMART (v1.16.80)
 *
 * Smart live search WITHOUT bloat: downloads the theme's compact search
 * index (/wp-json/gwill/v1/search-index - one cached JSON of every post's
 * title/excerpt/category/url) ONCE per session, then matches entirely
 * CLIENT-SIDE: case/diacritic-insensitive, typo-tolerant (edit distance),
 * title-weighted relevance ranking, token AND + phrase bonus, matched-term
 * <mark> highlighting, and a recent-posts fallback on no match. ZERO
 * network per keystroke, ZERO server load per keystroke - no plugin, no
 * search service, works on the SQLite backend where WP's default `s`
 * search has no ranking or typo tolerance.
 *
 * Falls back to the per-keystroke REST posts search only if the index
 * fetch itself fails.
 *
 * @package GWill_Tech
 * @since   1.0.0 (smart engine: 1.16.80)
 */

/*
Table of Contents
1. gwillFetch
2. Normalize / tokens / fuzzy
3. norm
4. toks
5. editDist
6. fuzzyOk
7. escRe
8. Index load (once per page, sessionStorage-cached)
9. loadIndexFromStorage
10. getIndex
11. smartMatch(): relevance scoring
12. smartMatch
13. render + highlight
14. highlight
15. catColor
16. renderItem
17. renderFooter
18. renderPosts
19. fallbackRecent
20. fetchFts
21. renderResults
22. getResultItems
23. highlightActive
24. search() - client-side, instant after the first index load
25. search
26. open/close
27. open
28. syncClear
29. close
30. closeOnly
31. clearOnly
32. escape helpers (v1.16.41: real escaping, & first)
33. escapeHtml
*/

( function () {
	// ── 1. gwillFetch─────────────────────────────────────────
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

	var GwillDropdown = window.GwillDropdown || {};
	var INDEX_URL     = GwillDropdown.indexUrl || '/wp-json/gwill/v1/search-index';
	var FTS_URL       = GwillDropdown.ftsUrl || '';   // v1.16.81 full-coverage endpoint
	var REST_URL      = GwillDropdown.restUrl || '/wp-json/wp/v2/posts?search=';
	var I18N          = GwillDropdown.i18n || {};
	var T_LOADING     = I18N.loading   || 'Searching…';
	var T_NO_RESULTS  = I18N.noResults || 'No results found.';
	var T_NO_MATCHES  = I18N.noMatches || 'No matches for “%s” - try these recent posts:';
	var T_ERROR       = I18N.error     || 'Search unavailable. Press Enter to search.';
	var T_VIEW_ALL    = I18N.viewAll   || 'View all results →';
	var HOME_URL      = GwillDropdown.homeUrl || window.location.origin + '/';

	var DEBOUNCE_MS   = 120; // matching is local now - respond almost instantly
	var MIN_CHARS     = 2;
	var MAX_RESULTS   = 8;
	var STORAGE_KEY   = 'gwill-si';      // sessionStorage cache of the index
	var STORAGE_TTL   = 60 * 60 * 1000;  // 1 hour

	var toggles  = document.querySelectorAll( '[data-gwill-search-toggle]' );
	var dropdown = document.getElementById( 'search-dropdown' );
	var input    = document.getElementById( 'search-input' );
	var results  = document.getElementById( 'search-results' );
	var clearBtn = document.getElementById( 'search-clear' );
	var closeBtn = document.getElementById( 'search-close' );

	if ( ! toggles.length || ! dropdown || ! input ) return;

	// v1.16.94: enforce the X-visibility contract on page load too - the
	// server renders #search-clear with the hidden attribute, but CSS
	// display:flex defeats it; syncClear() (hidden ⇔ empty field) must run
	// at init so the in-field X is in the right state before any interaction.
	syncClear();

	var debounceTimer = null;
	var activeIndex = -1;
	var currentData = [];
	var indexPromise = null;   // module-level: fetch the index at most once per page

	// ── 2. Normalize / tokens / fuzzy─────────────────────────────────
	// ── 3. norm───────────────────────────────────────────────
	function norm( s ) {
		return String( s || '' ).toLowerCase()
			.normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' ) // strip diacritics
			.replace( /[^a-z0-9\s]+/g, ' ' )                       // punctuation → space
			.replace( /\s+/g, ' ' ).trim();
	}

	// ── 4. toks───────────────────────────────────────────────
	function toks( s ) {
		var n = norm( s );
		return n ? n.split( ' ' ) : [];
	}

	// Damerau-Levenshtein (optimal string alignment): insertion, deletion,
	// substitution AND adjacent transposition. A plain Levenshtein scores
	// "andriod" as 2 edits, which is too harsh for real typing mistakes.
	function editDist( a, b ) {
		var la = a.length, lb = b.length;
		if ( a === b ) return 0;
		if ( Math.abs( la - lb ) > 3 ) return 9;
		var prevprev = [], prev = [], cur = [], i, j;
		for ( j = 0; j <= lb; j++ ) prev[ j ] = j;
		for ( i = 1; i <= la; i++ ) {
			cur = [ i ];
			for ( j = 1; j <= lb; j++ ) {
				var cost = a[ i - 1 ] === b[ j - 1 ] ? 0 : 1;
				cur[ j ] = Math.min( prev[ j ] + 1, cur[ j - 1 ] + 1, prev[ j - 1 ] + cost );
				if ( i > 1 && j > 1 && a[ i - 1 ] === b[ j - 2 ] && a[ i - 2 ] === b[ j - 1 ] ) {
					cur[ j ] = Math.min( cur[ j ], prevprev[ j - 2 ] + 1 );
				}
			}
			prevprev = prev; prev = cur;
		}
		return prev[ lb ];
	}

	// Bounded typo match. Long tokens get two edits, very long get three.
	// A first-character mismatch is only allowed for a single edit (qndroid →
	// android) or on long words, which blocks battery↔matter style noise.
	function fuzzyOk( tok, word ) {
		if ( tok === word ) return true;
		var l = Math.max( tok.length, word.length );
		if ( l < 4 ) return false;
		var d = editDist( tok, word );
		var limit = l >= 13 ? 3 : ( l >= 6 ? 2 : 1 );
		if ( d > limit ) return false;
		if ( tok[ 0 ] !== word[ 0 ] && d > 1 && l < 9 ) return false;
		return ( 1 - d / l ) >= 0.62;
	}

	// Very light stemmer so deploy/deployment, cache/caching and test/testing
	// meet in the middle. Returns the original word when no rule applies.
	function stem( w ) {
		if ( w.length > 5 && /ments$/.test( w ) ) return w.slice( 0, -5 );
		if ( w.length > 5 && /ment$/.test( w ) ) return w.slice( 0, -4 );
		if ( w.length > 6 && /tions$/.test( w ) ) return w.slice( 0, -5 );
		if ( w.length > 5 && /tion$/.test( w ) ) return w.slice( 0, -4 );
		if ( w.length > 5 && /ing$/.test( w ) ) return w.slice( 0, -3 );
		if ( w.length > 4 && /ies$/.test( w ) ) return w.slice( 0, -3 ) + 'y';
		if ( w.length > 4 && /ed$/.test( w ) ) return w.slice( 0, -2 );
		if ( w.length > 4 && /ers$/.test( w ) ) return w.slice( 0, -3 );
		if ( w.length > 4 && /er$/.test( w ) ) return w.slice( 0, -2 );
		if ( w.length > 4 && /es$/.test( w ) ) return w.slice( 0, -2 );
		if ( w.length > 3 && /s$/.test( w ) && !/ss$/.test( w ) ) return w.slice( 0, -1 );
		return w;
	}

	// ── 7. escRe──────────────────────────────────────────────
	function escRe( s ) {
		return s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	}

	// ── 8. Index load (once per page, sessionStorage-cached)──────────
	// ── 9. loadIndexFromStorage───────────────────────────────
	function loadIndexFromStorage() {
		try {
			var raw = sessionStorage.getItem( STORAGE_KEY );
			if ( ! raw ) return null;
			var box = JSON.parse( raw );
			if ( ! box || ! Array.isArray( box.d ) || ! box.t ) return null;
			if ( Date.now() - box.t > STORAGE_TTL ) return null;
			return box.d;
		} catch ( e ) {
			return null;
		}
	}

	// ── 10. getIndex───────────────────────────────────────────
	function getIndex() {
		if ( indexPromise ) return indexPromise;
		var fromStorage = loadIndexFromStorage();
		if ( fromStorage ) {
			indexPromise = Promise.resolve( fromStorage );
			return indexPromise;
		}
		indexPromise = gwillFetch( INDEX_URL )
			.then( function ( r ) { return r.json(); } )
			.then( function ( data ) {
				if ( ! Array.isArray( data ) ) throw new Error( 'bad index' );
				try {
					sessionStorage.setItem( STORAGE_KEY, JSON.stringify( { t: Date.now(), d: data } ) );
				} catch ( e ) { /* private mode - cache is a nicety */ }
				return data;
			} );
		return indexPromise;
	}

	// ── 11. smartMatch(): relevance scoring───────────────────────────
	// Score model (title-heavy, Google-ish):
	//   exact title        +150   title prefix       +110
	//   title substring    +70    per token in title word (exact +34, prefix +28, fuzzy +15)
	//   token in title     +20    token in slug      +12
	//   token in excerpt   +8     token in category  +6
	//   ALL tokens in title +40   ALL tokens anywhere +25
	// ── 12. smartMatch─────────────────────────────────────────
	function fieldScore( tok, words, wExact, wStem, wPrefix, wFuzzy ) {
		var best = 0;
		var ts = stem( tok );
		for ( var i = 0; i < words.length; i++ ) {
			var w = words[ i ];
			if ( w === tok ) { best = Math.max( best, wExact ); }
			else if ( stem( w ) === ts ) { best = Math.max( best, wStem ); }
			else if ( w.indexOf( tok ) === 0 || ( ts.length >= 3 && stem( w ).indexOf( ts ) === 0 ) ) { best = Math.max( best, wPrefix ); }
			else if ( tok.length >= 4 && fuzzyOk( tok, w ) ) { best = Math.max( best, wFuzzy ); }
		}
		return best;
	}

	// How many times a query token occurs in a field. A page that discusses the
	// term ten times should beat one that mentions it once in a footer code sample.
	function fieldCount( tok, words ) {
		var count = 0;
		var ts = stem( tok );
		for ( var i = 0; i < words.length; i++ ) {
			var w = words[ i ];
			if ( w === tok || stem( w ) === ts || w.indexOf( tok ) === 0 ||
				( ts.length >= 3 && stem( w ).indexOf( ts ) === 0 ) ||
				( tok.length >= 4 && fuzzyOk( tok, w ) ) ) count++;
		}
		return count;
	}

	// Adjacent words joined: "blue green" → "bluegreen", "java script" → "javascript".
	// This lets one typed token match a compound the author wrote as two words.
	function pairs( words ) {
		var out = [];
		for ( var i = 0; i < words.length - 1; i++ ) out.push( words[ i ] + words[ i + 1 ] );
		return out;
	}

	function smartMatch( query, posts, limit ) {
		var q = norm( query );
		if ( ! q ) return [];
		var qtoks = q.split( ' ' );
		var compactQ = q.replace( /\s+/g, '' );

		var scored = [];
		for ( var pi = 0; pi < posts.length; pi++ ) {
			var p = posts[ pi ];
			var titleN = norm( p.title );
			var excerptN = norm( p.excerpt );
			var bodyN = norm( p.text );
			var catN = norm( p.cat );
			var slugN = norm( ( p.url || '' ).split( '/' ).filter( Boolean ).pop() || '' );

			var tToks = p._tt || ( p._tt = toks( p.title ) );
			var eToks = p._et || ( p._et = toks( p.excerpt ) );
			var bToks = p._bt || ( p._bt = toks( p.text ) );
			var tPairs = p._tp || ( p._tp = pairs( tToks ) );
			var bPairs = p._bp || ( p._bp = pairs( bToks ) );

			var compactTitle = titleN.replace( /\s+/g, '' );
			var compactBody = ( excerptN + ' ' + bodyN ).replace( /\s+/g, '' );

			var score = 0;

			// Whole-phrase relevance, strongest in the title.
			if ( q === titleN ) score += 180;
			else if ( titleN.indexOf( q ) === 0 ) score += 140;
			else if ( q.length >= 3 && titleN.indexOf( q ) !== -1 ) score += 90;
			else if ( q.length >= 4 && bodyN.indexOf( q ) !== -1 ) score += 34;

			// Concatenated forms: nodejs ↔ node js, reactjs ↔ react js.
			if ( compactQ.length >= 5 && compactTitle.indexOf( compactQ ) !== -1 ) score += 110;
			else if ( compactQ.length >= 5 && compactBody.indexOf( compactQ ) !== -1 ) score += 28;

			var allInTitle = true;
			var allAnywhere = true;

			for ( var ti = 0; ti < qtoks.length; ti++ ) {
				var t = qtoks[ ti ];
				var inTitle = fieldScore( t, tToks, 42, 36, 30, 18 );
				var inExcerpt = fieldScore( t, eToks, 14, 12, 9, 6 );
				var inBody = fieldScore( t, bToks, 8, 7, 5, 3 );
				if ( t.length >= 5 ) {
					inTitle = Math.max( inTitle, fieldScore( t, tPairs, 26, 22, 18, 12 ) );
					inBody = Math.max( inBody, fieldScore( t, bPairs, 6, 5, 4, 2 ) );
				}
				var best = Math.max( inTitle, inExcerpt, inBody );
				if ( ! best && t.length >= 3 && catN.indexOf( t ) !== -1 ) best = 7;
				if ( ! best && t.length >= 3 && slugN.indexOf( t ) !== -1 ) best = 9;
				if ( inTitle ) score += Math.min( 2, fieldCount( t, tToks ) ) * 3;
				if ( inBody ) score += Math.min( 4, fieldCount( t, bToks ) ) * 2;

				if ( ! best ) allAnywhere = false;
				if ( inTitle < 15 ) allInTitle = false;
				score += best;
			}

			if ( allInTitle && qtoks.length > 1 ) score += 45;
			if ( allAnywhere && qtoks.length > 1 ) score += 30;

			// Editorial content outranks chrome and utility pages on a tie-ish score.
			// Exact tool queries still win on title-exact points.
			if ( p.type === 'post' ) score = Math.round( score * 1.08 );
			else if ( p.type === 'page' ) score = Math.round( score * 0.94 );

			if ( score > 0 ) scored.push( { p: p, s: score } );
		}

		scored.sort( function ( a, b ) {
			if ( b.s !== a.s ) return b.s - a.s;
			return ( b.p.date || '' ) < ( a.p.date || '' ) ? -1 : 1; // newer first on ties
		} );
		return scored.slice( 0, limit || MAX_RESULTS );
	}

	// ── 13. render + highlight────────────────────────────────────────
	// ── 14. highlight─────────────────────────────────────────
	function highlight( text, qtoks ) {
		var out = escapeHtml( text );
		// Longest tokens first so overlapping marks never double-wrap.
		var ordered = qtoks.slice().sort( function ( a, b ) { return b.length - a.length; } );
		for ( var i = 0; i < ordered.length; i++ ) {
			var tok = ordered[ i ];
			if ( tok.length < 2 ) continue;
			out = out.replace( new RegExp( '(' + escRe( tok ) + ')', 'gi' ), '<mark>$1</mark>' );
		}
		return out;
	}

	// ── 15. catColor──────────────────────────────────────────
	function catColor( slug ) {
		if ( slug.indexOf( 'android' ) !== -1 ) return 'android';
		if ( slug.indexOf( 'web' ) !== -1 || slug.indexOf( 'dev' ) !== -1 ) return 'webdev';
		return 'software';
	}

	// ── 16. renderItem────────────────────────────────────────
	function renderItem( p, index ) {
		var qtoks = toks( input ? input.value : '' );
		var title = highlight( p.title, qtoks );
		var snippet = highlight( p.excerpt || '', qtoks );
		var dateStr = '';
		if ( p.date ) {
			var d = new Date( p.date );
			if ( ! isNaN( d.getTime() ) ) {
				dateStr = '<div class="sr-meta">' + d.toLocaleDateString( 'en-US', { month: 'short', year: 'numeric' } ) + '</div>';
			}
		}
		return '<a href="' + escapeHtml( p.url ) + '" class="search-result-item" id="gwill-sr-' + index + '" role="option" aria-selected="false" data-index="' + index + '">'
			+ '<span class="badge badge-' + catColor( p.cat_slug || '' ) + '">' + escapeHtml( p.cat || 'Article' ) + '</span>'
			+ '<div class="search-result-content">'
			+ '<div class="sr-title">' + title + '</div>'
			+ ( snippet ? '<div class="sr-snippet">' + snippet + '</div>' : '' )
			+ dateStr
			+ '</div></a>';
	}

	// ── 17. renderFooter──────────────────────────────────────
	function renderFooter( q ) {
		return '<div class="search-dropdown-footer"><a href="' + escapeHtml( HOME_URL ) + '?s=' + encodeURIComponent( q ) + '">' + escapeHtml( T_VIEW_ALL ) + '</a></div>';
	}

	// v1.16.81: render a plain array of post objects (local index items or
	// FTS5 endpoint items - same shape) with highlight + footer.
	// ── 18. renderPosts───────────────────────────────────────
	function announce( n ) { var st = document.getElementById( 'search-status' ); if ( st ) { st.textContent = n === 1 ? '1 result found.' : n + ' results found.'; } }
	function renderPosts( q, posts ) {
		currentData = posts;
		activeIndex = -1;
		var html = '';
		for ( var i = 0; i < posts.length; i++ ) {
			html += renderItem( posts[ i ], i );
		}
		html += renderFooter( q );
		results.innerHTML = html;
		results.classList.add( 'has-results' ); announce( posts.length );
	}

	// Smart fallback: "no matches" message + 3 newest posts instead of a
	// dead end. Used when both the local index AND the FTS endpoint agree
	// there is nothing.
	// ── 19. fallbackRecent────────────────────────────────────
	function fallbackRecent( q ) {
		results.innerHTML = '<div class="search-empty">' + escapeHtml( T_NO_MATCHES.replace( '%s', q ) ) + '</div>';
		results.classList.add( 'has-results' ); announce( 0 );
		getIndex().then( function ( all ) {
			if ( ( input.value || '' ).trim() !== q ) return; // superseded keystroke
			var recent = all.slice( 0, 3 );
			currentData = recent;
			var fb = '';
			for ( var i = 0; i < recent.length; i++ ) {
				fb += renderItem( recent[ i ], i );
			}
			results.innerHTML = results.innerHTML + fb + renderFooter( q );
		} );
	}

	// v1.16.81: query the FTS5 full-coverage endpoint. Fired only when local
	// results are thin (< 3) - for common queries the zero-network local
	// layer answers alone. Merges server results after local ones (dedup by
	// id); on failure or empty response the local rendering stands.
	// ── 20. fetchFts──────────────────────────────────────────
	function fetchFts( q, localMatches ) {
		if ( ! FTS_URL ) {
			if ( ! localMatches.length ) fallbackRecent( q );
			return;
		}
		gwillFetch( FTS_URL + encodeURIComponent( q ) )
			.then( function ( r ) { return r.json(); } )
			.then( function ( data ) {
				if ( ( input.value || '' ).trim() !== q ) return;
				if ( Array.isArray( data ) && data.length ) {
					var merged = localMatches.map( function ( m ) { return m.p; } );
					var seen = {};
					merged.forEach( function ( p ) { seen[ p.id ] = true; } );
					data.forEach( function ( p ) {
						// Endpoint shape: { id, title, url, type, excerpt }.
						if ( p.id && ! seen[ p.id ] ) {
							seen[ p.id ] = true;
							merged.push( {
								id: p.id,
								title: p.title,
								url: p.url,
								excerpt: p.excerpt || '',
								cat: p.type || 'Article',
								cat_slug: '',
								date: ''
							} );
						}
					} );
					renderPosts( q, merged.slice( 0, MAX_RESULTS ) );
				} else if ( ! localMatches.length ) {
					fallbackRecent( q );
				}
			} )
			.catch( function () {
				if ( ( input.value || '' ).trim() !== q ) return;
				if ( ! localMatches.length ) fallbackRecent( q );
			} );
	}

	// ── 21. renderResults─────────────────────────────────────
	function renderResults( q, matches ) {
		if ( ! matches.length ) {
			// No local hits: the FTS endpoint gets the final say (it may
			// still find matches in older posts). Without FTS, fall back now.
			fetchFts( q, [] );
			return;
		}
		renderPosts( q, matches.map( function ( m ) { return m.p; } ) );
		if ( matches.length < 3 ) {
			fetchFts( q, matches ); // enrich thin local results in the background
		}
	}

	// ── 22. getResultItems────────────────────────────────────
	function getResultItems() {
		return results
			? Array.from( results.querySelectorAll( '.search-result-item' ) )
			: [];
	}

	// ── 23. highlightActive───────────────────────────────────
	function highlightActive() {
		var items = getResultItems();
		items.forEach( function ( el, i ) {
			el.classList.toggle( 'highlighted', i === activeIndex ); el.setAttribute( 'aria-selected', i === activeIndex ? 'true' : 'false' );
		} );
		if ( items[ activeIndex ] ) {
			input.setAttribute( 'aria-activedescendant', 'gwill-sr-' + activeIndex );
			items[ activeIndex ].scrollIntoView( { block: 'nearest' } );
		} else {
			input.removeAttribute( 'aria-activedescendant' );
		}
	}

	// ── 24. search() - client-side, instant after the first index load───
	// ── 25. search────────────────────────────────────────────
	function search( q ) {
		getIndex()
			.then( function ( all ) {
				// Guard: a newer keystroke may have superseded this one.
				if ( ( input.value || '' ).trim() !== q ) return;
				renderResults( q, smartMatch( q, all ) );
			} )
			.catch( function () {
				if ( ( input.value || '' ).trim() !== q ) return;
				// Index unavailable - fall back to the old per-keystroke REST search.
				results.innerHTML = '<div class="search-loading">' + escapeHtml( T_LOADING ) + '</div>';
				results.classList.add( 'has-results' );
				gwillFetch( REST_URL + encodeURIComponent( q ) )
					.then( function ( r ) { return r.json(); } )
					.then( function ( data ) {
						if ( ! Array.isArray( data ) || ! data.length ) {
							results.innerHTML = '<div class="search-empty">' + escapeHtml( T_NO_RESULTS ) + '</div>';
							currentData = [];
							return;
						}
						renderResults( q, data.map( function ( p ) {
							return { p: { title: ( p.title && p.title.rendered ) || '', url: p.link, excerpt: '', cat: 'Article', cat_slug: '', date: p.date }, s: 1 };
						} ) );
					} )
					.catch( function () {
						results.innerHTML = '<div class="search-empty">' + escapeHtml( T_ERROR ) + '</div>';
					} );
			} );
	}

	// ── 26. open/close────────────────────────────────────────────────
	// ── 27. open──────────────────────────────────────────────
	function open() {
		dropdown.hidden = false;
		toggles.forEach( function ( t ) { t.setAttribute( 'aria-expanded', 'true' ); } );
		input.setAttribute( 'aria-expanded', 'true' );
		syncClear();
		setTimeout( function () { input.focus(); }, 100 );
	}

	// v1.16.92: the in-field "x" is visible only while there is text.
	// ── 28. syncClear─────────────────────────────────────────
	function syncClear() {
		if ( clearBtn ) clearBtn.hidden = !( input && input.value.length > 0 );
	}

	// ── 29. close─────────────────────────────────────────────
	function close() {
		dropdown.hidden = true;
		toggles.forEach( function ( t ) { t.setAttribute( 'aria-expanded', 'false' ); } );
		input.setAttribute( 'aria-expanded', 'false' );
		input.removeAttribute( 'aria-activedescendant' );
		results.innerHTML = '';
		results.classList.remove( 'has-results' );
		currentData = [];
		activeIndex = -1;
		// v1.16.91 (King): close() KEEPS the typed text so the user can
		// edit it - closing the form never touches the query; the inner x
		// (#search-clear) is the ONLY text clearer.
	}

	// X (original form button) = close ONLY, typed text preserved.
	// v1.16.93 (King clarification): the OUTER x must NOT clear the text -
	// it closes the search form; the inner x is the only text clearer.
	// ── 30. closeOnly─────────────────────────────────────────
	function closeOnly() {
		close();
	}

	// v1.16.92 (King clarification): the in-field "x" clears ALL text
	// WITHOUT closing the search form - the dropdown stays open.
	// ── 31. clearOnly─────────────────────────────────────────
	function clearOnly() {
		input.value = '';
		results.innerHTML = '';
		results.classList.remove( 'has-results' );
		currentData = [];
		activeIndex = -1;
		input.removeAttribute( 'aria-activedescendant' );
		syncClear();
		input.focus();
	}

	// In-field "x": clear all text, form stays open.
	if ( clearBtn ) clearBtn.addEventListener( 'click', clearOnly );

	// The King's outer X (#search-close): closes the form ONLY - the
	// typed text stays in the field (v1.16.93). Esc does the same.
	if ( closeBtn ) closeBtn.addEventListener( 'click', function () {
		closeOnly();
		syncClear();
	} );

	toggles.forEach( function ( toggle ) {
		toggle.addEventListener( 'click', function ( e ) {
			e.stopPropagation();
			if ( dropdown.hidden ) open(); else close();
		} );
	} );

	if ( input ) {
		input.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				close();
			}
			if ( e.key === 'ArrowDown' ) {
				e.preventDefault();
				activeIndex = Math.min( activeIndex + 1, currentData.length - 1 );
				highlightActive();
			}
			if ( e.key === 'ArrowUp' ) {
				e.preventDefault();
				activeIndex = Math.max( activeIndex - 1, 0 );
				highlightActive();
			}
			if ( e.key === 'Enter' && activeIndex >= 0 && currentData[ activeIndex ] ) {
				e.preventDefault();
				window.location = currentData[ activeIndex ].url;
			}
		} );

		input.addEventListener( 'input', function () {
			syncClear();
			clearTimeout( debounceTimer );
			var v = this.value.trim();
			if ( v.length < MIN_CHARS ) {
				results.innerHTML = '';
				results.classList.remove( 'has-results' );
				return;
			}
			debounceTimer = setTimeout( function () { search( v ); }, DEBOUNCE_MS );
		} );
	}

	// v1.16.91 (King): the dropdown stays open until the user presses
	// X (clears) or Esc (dismisses) - clicking elsewhere does NOT close
	// it anymore; the typed text is always preserved for editing.

	// ── 32. escape helpers (v1.16.41: real escaping, & first)─────────
	// ── 33. escapeHtml────────────────────────────────────────
	function escapeHtml( str ) {
		return String( str )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /\"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	// Expose the pure matching helpers so /search/ uses the same ranking and
	// highlighting as the header dropdown. One engine, two surfaces.
	window.GwillSearchCore = {
		norm: norm,
		toks: toks,
		smartMatch: smartMatch,
		highlight: highlight,
		escapeHtml: escapeHtml,
		catColor: catColor
	};

} )();
