<?php
/**
 * Plugin Name: GWill Static Comments Bridge
 * Description: Public guest-comment submit endpoint for the static tech port. WordPress remains the moderation source of truth.
 * Version: 1.0.0
 * Author: G-Will
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CORS: the static site is hosted on GitHub Pages while WordPress is the
 * comment backend. Only these origins may call the endpoint.
 */
function gwill_static_comment_allowed_origins(): array {
	return array(
		'https://godschi10.github.io',
		'https://gwillchijioke.qzz.io',
		'https://www.gwillchijioke.qzz.io',
		'http://127.0.0.1:8099',
		'http://localhost:8099',
	);
}

function gwill_static_comment_cors(): void {
	$origin = isset( $_SERVER['HTTP_ORIGIN'] ) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
	if ( ! in_array( $origin, gwill_static_comment_allowed_origins(), true ) ) {
		return;
	}
	header( 'Access-Control-Allow-Origin: ' . $origin );
	header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
	header( 'Access-Control-Allow-Headers: Content-Type' );
	header( 'Vary: Origin' );
}

add_action(
	'rest_api_init',
	static function (): void {
		register_rest_route(
			'gwill/v1',
			'/comment',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'gwill_static_comment_submit',
				'args'                => array(
					'post_id' => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'author'  => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
					'email'   => array( 'required' => true, 'sanitize_callback' => 'sanitize_email' ),
					'content' => array( 'required' => true, 'sanitize_callback' => 'sanitize_textarea_field' ),
					'parent'  => array( 'required' => false, 'sanitize_callback' => 'absint' ),
					'gwill_hp'=> array( 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);

		register_rest_route(
			'gwill/v1',
			'/reactions',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => 'gwill_static_reactions_get',
				'args'                => array(
					'post_id' => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'guest'   => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);

		register_rest_route(
			'gwill/v1',
			'/reaction',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'gwill_static_reaction_toggle',
				'args'                => array(
					'post_id'   => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'comment_id'=> array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'kind'      => array( 'required' => true, 'sanitize_callback' => 'sanitize_key' ),
					'guest'     => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);
	}
);

add_action( 'rest_pre_serve_request', static function ( $served ) {
	gwill_static_comment_cors();
	return $served;
} );

/**
 * Accept a guest comment through the same WordPress comment pipeline used by
 * the live theme: spam detection, moderation, email notifications and the
 * admin queue all keep working. This endpoint only removes the REST
 * "login required" gate for the static guest experience.
 */
function gwill_static_comment_submit( WP_REST_Request $request ) {
	$post_id = absint( $request['post_id'] );
	$post    = get_post( $post_id );

	if ( ! $post || 'post' !== $post->post_type || ! comments_open( $post_id ) ) {
		return new WP_Error( 'gwill_comments_closed', 'Comments are closed on this article.', array( 'status' => 403 ) );
	}

	// Honeypot: silently accept so bots do not learn the shape.
	$honeypot = (string) $request['gwill_hp'];
	if ( '' !== $honeypot ) {
		return new WP_REST_Response( array( 'success' => true, 'status' => 'pending' ), 200 );
	}

	$author = trim( (string) $request['author'] );
	$email  = trim( (string) $request['email'] );
	$body   = trim( (string) $request['content'] );
	$parent = absint( $request['parent'] );

	if ( strlen( $author ) < 2 || strlen( $author ) > 80 ) {
		return new WP_Error( 'gwill_comment_name', 'Please enter your name.', array( 'status' => 400 ) );
	}
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'gwill_comment_email', 'Please enter a valid email address.', array( 'status' => 400 ) );
	}
	if ( strlen( $body ) < 2 ) {
		return new WP_Error( 'gwill_comment_empty', 'Please write a comment.', array( 'status' => 400 ) );
	}
	if ( strlen( $body ) > 2000 ) {
		return new WP_Error( 'gwill_comment_long', 'Comment is too long (maximum 2000 characters).', array( 'status' => 400 ) );
	}

	// One submission per 30 seconds per IP; transient lives in the WP database.
	$ip      = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
	$ratekey = 'gwill_comment_rate_' . md5( $ip );
	if ( get_transient( $ratekey ) ) {
		return new WP_Error( 'gwill_comment_rate', 'Please wait a moment before posting again.', array( 'status' => 429 ) );
	}
	set_transient( $ratekey, 1, 30 );

	if ( $parent ) {
		$parent_comment = get_comment( $parent );
		if ( ! $parent_comment || (int) $parent_comment->comment_post_ID !== $post_id || '1' !== (string) $parent_comment->comment_approved ) {
			return new WP_Error( 'gwill_comment_parent', 'The comment you are replying to is unavailable.', array( 'status' => 400 ) );
		}
	}

	$data = array(
		'comment_post_ID'      => $post_id,
		'comment_parent'       => $parent,
		'comment_author'       => $author,
		'comment_author_email' => $email,
		'comment_author_url'   => '',
		'comment_content'      => $body,
		'comment_type'         => 'comment',
		'comment_author_IP'    => $ip,
		'comment_agent'        => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( (string) $_SERVER['HTTP_USER_AGENT'], 0, 254 ) : '',
	);

	$comment_id = wp_new_comment( $data, true );
	if ( is_wp_error( $comment_id ) ) {
		return new WP_Error( 'gwill_comment_failed', $comment_id->get_error_message(), array( 'status' => 400 ) );
	}

	$comment = get_comment( $comment_id );
	$status  = $comment && '1' === (string) $comment->comment_approved ? 'approved' : 'pending';
	$message = 'approved' === $status
		? 'Your comment is live.'
		: 'Thanks — your comment is awaiting moderation.';

	return new WP_REST_Response(
		array(
			'success' => true,
			'status'  => $status,
			'id'      => (int) $comment_id,
			'message' => $message,
		),
		201
	);
}

/**
 * Reactions are lightweight social proof, not a second identity system.
 * A random browser guest id is hashed into the commentmeta key, so one visitor
 * can toggle one reaction per comment. No email, IP or account is stored here.
 */
function gwill_static_guest_key( string $guest ): string {
	$guest = preg_replace( '/[^A-Za-z0-9_-]/', '', $guest );
	return '_gwill_rx_' . substr( hash( 'sha256', $guest ), 0, 28 );
}

function gwill_static_reactions_for_comment( int $comment_id, string $guest_key ): array {
	$counts = array( 'like' => 0, 'heart' => 0, 'fire' => 0, 'laugh' => 0 );
	$mine   = null;
	foreach ( get_comment_meta( $comment_id ) as $key => $values ) {
		if ( 0 !== strpos( (string) $key, '_gwill_rx_' ) ) {
			continue;
		}
		foreach ( (array) $values as $value ) {
			if ( isset( $counts[ $value ] ) ) {
				$counts[ $value ]++;
			}
		}
	}
	$own = get_comment_meta( $comment_id, $guest_key, true );
	if ( is_string( $own ) && isset( $counts[ $own ] ) ) {
		$mine = $own;
	}
	return array( 'counts' => $counts, 'mine' => $mine );
}

function gwill_static_reactions_get( WP_REST_Request $request ) {
	$post_id = absint( $request['post_id'] );
	$guest   = trim( (string) $request['guest'] );
	if ( ! $post_id || strlen( $guest ) < 8 ) {
		return new WP_Error( 'gwill_rx_bad_request', 'Invalid reaction request.', array( 'status' => 400 ) );
	}
	$guest_key = gwill_static_guest_key( $guest );
	$comment_ids = get_comments(
		array(
			'post_id' => $post_id,
			'status'  => 'approve',
			'fields'  => 'ids',
			'number'  => 0,
		)
	);
	$counts = array();
	$mine   = array();
	foreach ( $comment_ids as $cid ) {
		$state = gwill_static_reactions_for_comment( (int) $cid, $guest_key );
		$counts[ (string) $cid ] = $state['counts'];
		if ( $state['mine'] ) {
			$mine[ (string) $cid ] = $state['mine'];
		}
	}
	return new WP_REST_Response(
		array( 'success' => true, 'counts' => $counts, 'mine' => $mine ),
		200
	);
}

function gwill_static_reaction_toggle( WP_REST_Request $request ) {
	$post_id    = absint( $request['post_id'] );
	$comment_id = absint( $request['comment_id'] );
	$kind       = sanitize_key( (string) $request['kind'] );
	$guest      = trim( (string) $request['guest'] );
	$valid      = array( 'like', 'heart', 'fire', 'laugh' );

	if ( ! in_array( $kind, $valid, true ) || strlen( $guest ) < 8 ) {
		return new WP_Error( 'gwill_rx_bad_request', 'Invalid reaction.', array( 'status' => 400 ) );
	}

	$comment = get_comment( $comment_id );
	if ( ! $comment || (int) $comment->comment_post_ID !== $post_id || '1' !== (string) $comment->comment_approved ) {
		return new WP_Error( 'gwill_rx_not_found', 'That comment is unavailable.', array( 'status' => 404 ) );
	}

	// Small per-guest throttle so a held key cannot hammer the DB.
	$rate = 'gwill_rx_rate_' . md5( $guest . '|' . $comment_id );
	if ( get_transient( $rate ) ) {
		return new WP_Error( 'gwill_rx_rate', 'Please wait a moment before reacting again.', array( 'status' => 429 ) );
	}
	set_transient( $rate, 1, 2 );

	$key  = gwill_static_guest_key( $guest );
	$mine = get_comment_meta( $comment_id, $key, true );
	if ( $mine === $kind ) {
		delete_comment_meta( $comment_id, $key );
	} else {
		update_comment_meta( $comment_id, $key, $kind );
	}

	$state = gwill_static_reactions_for_comment( $comment_id, $key );
	return new WP_REST_Response(
		array( 'success' => true, 'counts' => $state['counts'], 'mine' => $state['mine'] ),
		200
	);
}
