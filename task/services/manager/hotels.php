<?php
require_once __DIR__ . '/includes/functions.php';

$q = trim($_GET['q'] ?? '');
$location = trim($_GET['location'] ?? '');
$maxPrice = trim($_GET['max_price'] ?? '');
$minRating = trim($_GET['rating'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));

$filters = [];
if ($q !== '') $filters['q'] = $q;
if ($location !== '') $filters['location'] = $location;
if ($maxPrice !== '' && is_numeric($maxPrice)) $filters['max_price'] = $maxPrice;
if ($minRating !== '' && is_numeric($minRating)) $filters['rating'] = $minRating;

$result = get_hotels($filters, $page);
$hotels = $result['hotels'];

$pageTitle = 'Browse Hotels — ' . SITE_NAME;
$pageDescription = 'Browse and search hotels by location, name, price and rating. Call directly to book — no login required.';
$pageCanonical = 'hotels.php';
$activeNav = 'hotels';

include __DIR__ . '/includes/header.php';
?>

<section class="hero" style="min-height: 320px; background-image:url('https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1600&q=80');">
    <div class="hero-content" style="padding: 60px 20px 30px;">
        <h1 style="font-size:clamp(1.8rem,4vw,2.6rem);">Browse Hotels</h1>
        <p class="subtitle" style="margin-bottom:0;">Find the perfect hotel and call to book directly.</p>
    </div>
</section>

<div class="container">
    <div class="filter-bar">
        <form class="filter-form" method="get" action="hotels.php" data-validate>
            <div class="filter-field">
                <label for="f_q">Hotel Name</label>
                <input type="text" id="f_q" name="q" value="<?= e($q) ?>" placeholder="e.g. Grand Palace">
            </div>
            <div class="filter-field">
                <label for="f_location">Location</label>
                <input type="text" id="f_location" name="location" value="<?= e($location) ?>" placeholder="e.g. Jaipur">
            </div>
            <div class="filter-field">
                <label for="f_price">Max Price</label>
                <select id="f_price" name="max_price">
                    <option value="">Any Price</option>
                    <?php foreach ([2000, 3000, 4000, 5000, 6000] as $p): ?>
                    <option value="<?= $p ?>" <?= (string)$maxPrice === (string)$p ? 'selected' : '' ?>>Under <?= format_price($p) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="filter-submit"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
        </form>
    </div>

    <div class="results-bar">
        <p>
            <?php if ($result['total'] > 0): ?>
                Showing <?= (($page - 1) * $result['per_page']) + 1 ?>&ndash;<?= min($page * $result['per_page'], $result['total']) ?> of <?= $result['total'] ?> Hotels
            <?php else: ?>
                No hotels found
            <?php endif; ?>
        </p>
    </div>

    <?php if (empty($hotels)): ?>
        <div class="empty-state">
            <i class="fa-solid fa-hotel"></i>
            <h3>No hotels found</h3>
            <p>Try searching for another location or hotel name.</p>
            <a href="hotels.php" class="btn btn-primary">Browse All Hotels</a>
        </div>
    <?php else: ?>
        <div class="hotel-grid" style="margin-bottom: 20px;">
            <?php foreach ($hotels as $i => $hotel): ?>
            <div class="hotel-card" style="animation-delay: <?= min($i * 0.06, 0.4) ?>s;">
                <a href="hotel-details.php?id=<?= (int) $hotel['id'] ?>" class="hotel-card-img">
                    <img src="<?= image_src($hotel['primary_image'] ?: 'assets/images/placeholder-hotel.svg') ?>"
                         alt="<?= e($hotel['name']) ?>" loading="lazy"
                         onerror="this.src='assets/images/placeholder-hotel.svg'">
                    <span class="hotel-rating-badge"><i class="fa-solid fa-star"></i> <?= e(number_format((float) $hotel['rating'], 1)) ?></span>
                </a>
                <div class="hotel-card-body">
                    <h3><a href="hotel-details.php?id=<?= (int) $hotel['id'] ?>"><?= e($hotel['name']) ?></a></h3>
                    <div class="hotel-location"><i class="fa-solid fa-location-dot"></i> <?= e($hotel['location']) ?></div>
                    <p class="hotel-desc"><?= e($hotel['description']) ?></p>
                    <div class="hotel-price">From <?= format_price($hotel['price']) ?> <span>/ night</span></div>
                    <a href="<?= e(tel_href($hotel['phone'])) ?>" class="hotel-phone-cta">
                        <i class="fa-solid fa-phone"></i> <?= e($hotel['phone']) ?>
                    </a>
                    <div class="hotel-card-actions">
                        <a href="hotel-details.php?id=<?= (int) $hotel['id'] ?>" class="btn btn-outline">View Details</a>
                        <a href="<?= e(tel_href($hotel['phone'])) ?>" class="btn btn-call"><i class="fa-solid fa-phone"></i> Call</a>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <?php if ($result['total_pages'] > 1):
            $qs = $_GET;
            function page_url($qs, $p) { $qs['page'] = $p; return 'hotels.php?' . http_build_query($qs); }
        ?>
        <div class="pagination">
            <?php if ($page > 1): ?>
                <a href="<?= e(page_url($qs, $page - 1)) ?>">&lsaquo; Previous</a>
            <?php else: ?>
                <span class="disabled">&lsaquo; Previous</span>
            <?php endif; ?>

            <?php for ($p = 1; $p <= $result['total_pages']; $p++): ?>
                <?php if ($p === $page): ?>
                    <span class="active"><?= $p ?></span>
                <?php else: ?>
                    <a href="<?= e(page_url($qs, $p)) ?>"><?= $p ?></a>
                <?php endif; ?>
            <?php endfor; ?>

            <?php if ($page < $result['total_pages']): ?>
                <a href="<?= e(page_url($qs, $page + 1)) ?>">Next &rsaquo;</a>
            <?php else: ?>
                <span class="disabled">Next &rsaquo;</span>
            <?php endif; ?>
        </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<div style="height:60px;"></div>

<?php include __DIR__ . '/includes/footer.php'; ?>
