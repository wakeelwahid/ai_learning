<?php
require_once __DIR__ . '/db.php';

/* =====================================================
   GENERAL HELPERS
   ===================================================== */

/** Escape output for safe HTML rendering. */
function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

/** Build a URL-friendly slug from a string. */
function make_slug(string $text): string
{
    $slug = strtolower(trim($text));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    return trim($slug, '-');
}

/** Format price with rupee symbol. */
function format_price($price): string
{
    return '&#8377;' . number_format((float) $price, 0);
}

/** Format a phone number for use in tel: links (strip spaces/dashes). */
function tel_href(string $phone): string
{
    $clean = preg_replace('/[^0-9+]/', '', $phone);
    return 'tel:' . $clean;
}

/** Redirect helper. */
function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

/** Current base path prefix, used so admin pages can link back to public site. */
function base_url(string $path = ''): string
{
    return SITE_URL . '/' . ltrim($path, '/');
}

/* =====================================================
   CSRF PROTECTION
   ===================================================== */

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function csrf_verify(): bool
{
    $token = $_POST['csrf_token'] ?? '';
    return !empty($token) && !empty($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

/* =====================================================
   ADMIN AUTH HELPERS
   ===================================================== */

function admin_logged_in(): bool
{
    return !empty($_SESSION['admin_id']);
}

function require_admin(): void
{
    if (!admin_logged_in()) {
        redirect('admin-login.php');
    }
}

/* =====================================================
   HOTEL QUERIES
   ===================================================== */

/**
 * Fetch hotels with optional filters, search & pagination.
 */
function get_hotels(array $filters = [], int $page = 1, int $perPage = HOTELS_PER_PAGE): array
{
    $pdo = db();
    $where = ['h.status = 1'];
    $params = [];

    if (!empty($filters['q'])) {
        $where[] = '(h.name LIKE :q_name OR h.location LIKE :q_location)';
        $params['q_name'] = '%' . $filters['q'] . '%';
        $params['q_location'] = '%' . $filters['q'] . '%';
    }
    if (!empty($filters['location'])) {
        $where[] = 'h.location LIKE :location';
        $params['location'] = '%' . $filters['location'] . '%';
    }
    if (!empty($filters['min_price'])) {
        $where[] = 'h.price >= :min_price';
        $params['min_price'] = $filters['min_price'];
    }
    if (!empty($filters['max_price'])) {
        $where[] = 'h.price <= :max_price';
        $params['max_price'] = $filters['max_price'];
    }
    if (!empty($filters['rating'])) {
        $where[] = 'h.rating >= :rating';
        $params['rating'] = $filters['rating'];
    }

    $whereSql = implode(' AND ', $where);

    // Count total for pagination
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM hotels h WHERE $whereSql");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $offset = max(0, ($page - 1) * $perPage);

    $sql = "SELECT h.*,
                   (SELECT image_path FROM hotel_images hi WHERE hi.hotel_id = h.id ORDER BY hi.is_primary DESC, hi.sort_order ASC LIMIT 1) AS primary_image
            FROM hotels h
            WHERE $whereSql
            ORDER BY h.created_at DESC
            LIMIT :limit OFFSET :offset";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $val) {
        $stmt->bindValue(":$key", $val);
    }
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $hotels = $stmt->fetchAll();

    return [
        'hotels' => $hotels,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => max(1, (int) ceil($total / $perPage)),
    ];
}

/** Fetch a single hotel (active only, unless $includeInactive true) by id. */
function get_hotel(int $id, bool $includeInactive = false): ?array
{
    $pdo = db();
    $sql = 'SELECT * FROM hotels WHERE id = :id';
    if (!$includeInactive) {
        $sql .= ' AND status = 1';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['id' => $id]);
    $hotel = $stmt->fetch();
    return $hotel ?: null;
}

/** Fetch all images for a hotel, ordered (primary first, then sort_order). */
function get_hotel_images(int $hotelId): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM hotel_images WHERE hotel_id = :id ORDER BY is_primary DESC, sort_order ASC, id ASC');
    $stmt->execute(['id' => $hotelId]);
    return $stmt->fetchAll();
}

/** Get the primary (or first) image path for a hotel; fallback placeholder. */
function get_primary_image(int $hotelId): string
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT image_path FROM hotel_images WHERE hotel_id = :id ORDER BY is_primary DESC, sort_order ASC LIMIT 1');
    $stmt->execute(['id' => $hotelId]);
    $path = $stmt->fetchColumn();
    return $path ?: 'assets/images/placeholder-hotel.svg';
}

/** Get featured hotels (top rated, active) for homepage. */
function get_featured_hotels(int $limit = 8): array
{
    $pdo = db();
    $sql = "SELECT h.*,
                   (SELECT image_path FROM hotel_images hi WHERE hi.hotel_id = h.id ORDER BY hi.is_primary DESC, hi.sort_order ASC LIMIT 1) AS primary_image
            FROM hotels h
            WHERE h.status = 1
            ORDER BY h.rating DESC, h.created_at DESC
            LIMIT :limit";
    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

/** Split a comma-separated amenities string into a trimmed array. */
function parse_amenities(?string $amenities): array
{
    if (empty($amenities)) {
        return [];
    }
    return array_filter(array_map('trim', explode(',', $amenities)));
}

/** Render star rating as HTML (Font Awesome icons). */
function render_stars(float $rating): string
{
    $full = floor($rating);
    $half = ($rating - $full) >= 0.5;
    $html = '';
    for ($i = 1; $i <= 5; $i++) {
        if ($i <= $full) {
            $html .= '<i class="fa-solid fa-star"></i>';
        } elseif ($half && $i == $full + 1) {
            $html .= '<i class="fa-solid fa-star-half-stroke"></i>';
        } else {
            $html .= '<i class="fa-regular fa-star"></i>';
        }
    }
    return $html;
}

/* =====================================================
   IMAGE UPLOAD HELPERS
   ===================================================== */

/**
 * Validate & move an uploaded image file to the uploads directory.
 * Returns the relative path (for DB storage) on success, or throws Exception with message.
 */
function handle_image_upload(array $file): string
{
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Upload error (code ' . $file['error'] . ').');
    }

    if ($file['size'] > MAX_UPLOAD_SIZE) {
        throw new Exception('Image "' . $file['name'] . '" exceeds the 5MB size limit.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowed = unserialize(ALLOWED_MIME_TYPES);

    if (!isset($allowed[$mime])) {
        throw new Exception('Unsupported file type. Only JPG, PNG, and WebP images are allowed.');
    }

    // Verify it is actually an image (extra safety beyond MIME check)
    $imageInfo = @getimagesize($file['tmp_name']);
    if ($imageInfo === false) {
        throw new Exception('The uploaded file is not a valid image.');
    }

    $ext = $allowed[$mime];
    $safeName = bin2hex(random_bytes(16)) . '.' . $ext;
    $destination = UPLOAD_DIR . $safeName;

    if (!is_dir(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        throw new Exception('Failed to save uploaded image.');
    }

    return UPLOAD_URL . $safeName;
}

/** Delete an image file from disk (only if it's a local uploaded file, not an external URL). */
function delete_image_file(string $path): void
{
    if (strpos($path, 'http://') === 0 || strpos($path, 'https://') === 0) {
        return; // external/demo image, nothing to delete
    }
    $fullPath = __DIR__ . '/../' . $path;
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}

/** Resolve an image path (external URL or local upload) into a usable <img> src. */
function image_src(string $path): string
{
    if (strpos($path, 'http://') === 0 || strpos($path, 'https://') === 0) {
        return $path;
    }
    return e($path);
}
