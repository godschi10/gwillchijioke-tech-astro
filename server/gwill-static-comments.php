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
