<?php
/**
 * Global site configuration.
 * Adjust these constants for your environment.
 */

// ---- Database ----
define('DB_HOST', 'localhost');
define('DB_NAME', 'hotel_booking');
define('DB_USER', 'hotelapp_test');
define('DB_PASS', 'test_pass_123');

// ---- Site ----
define('SITE_NAME', 'HotelBook');
define('SITE_TAGLINE', 'Discover comfortable hotels and connect directly with hotels.');
define('SITE_URL', ''); // e.g. 'https://example.com' — leave blank for relative URLs
define('SITE_EMAIL', 'info@example.com');
define('SITE_PHONE', '+919876500000');
define('SITE_ADDRESS', 'MG Road, Gurgaon, Haryana, India');

// ---- Uploads ----
define('UPLOAD_DIR', __DIR__ . '/../uploads/hotels/');
define('UPLOAD_URL', 'uploads/hotels/');
define('MAX_UPLOAD_SIZE', 5 * 1024 * 1024); // 5MB per image
define('MAX_IMAGES_PER_HOTEL', 10);
define('ALLOWED_MIME_TYPES', serialize([
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
]));

// ---- Pagination ----
define('HOTELS_PER_PAGE', 12);

// ---- Session ----
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ---- Error reporting (turn off display_errors in production) ----
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

date_default_timezone_set('Asia/Kolkata');
