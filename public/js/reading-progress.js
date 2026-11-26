/**
 * GWill Tech - Reading Progress Bar
 *
 * Updates a fixed top progress bar based on scroll position.
 * Only runs on singular posts (enqueued conditionally).
 *
 * Premium pass (v1.17.1): the bar is now driven by `transform: scaleX()`
 * instead of `width`. Transforms are compositor-only - the browser rasterizes
 * the bar once and slides its scale on the GPU, so scroll-driven updates
 * never trigger layout or paint of the surrounding page (zero CLS, cheaper
 * frames than width mutation, which reflows on every scroll event).
 *
 * @package GWill_Tech
 * @since   1.0.0
 */

/*
Table of Contents
1. reading progress bar
*/
// ── 1. reading progress bar ──

( function () {
	'use strict';

	var pb = document.getElementById( 'reading-progress' );
	if ( ! pb ) return;

	function update() {
		var st = window.scrollY;
		var sh = document.documentElement.scrollHeight;
		var ch = window.innerHeight;
		var mx = sh - ch;
		var pc = mx > 0 ? Math.min( 1, Math.max( 0, st / mx ) ) : 0;
		pb.style.transform = 'scaleX(' + pc + ')';
	}

	window.addEventListener( 'scroll', update, { passive: true } );
	update();
} )();
