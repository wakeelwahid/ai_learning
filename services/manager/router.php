<?php
/**
 * Router for PHP's built-in dev server only (php -S ... router.php).
 * Mirrors the .htaccess rewrite so /admin works the same as on Apache hosting.
 * Not used on real Apache/Nginx hosting — .htaccess handles it there.
 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($uri === '/admin' || $uri === '/admin/') {
    require __DIR__ . '/admin-login.php';
    return true;
}

// Serve real files (css, js, images) as-is; otherwise fall through to the requested script.
if ($uri !== '/' && file_exists(__DIR__ . $uri)) {
    return false;
}

require __DIR__ . '/index.php';
