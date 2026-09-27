<?php
require_once __DIR__ . '/includes/functions.php';

$id = (int) ($_GET['id'] ?? 0);
$hotel = $id ? get_hotel($id) : null;

if (!$hotel) {
    http_response_code(404);
    $pageTitle = 'Hotel Not Found — ' . SITE_NAME;
    $activeNav = 'hotels';
    include __DIR__ . '/includes/header.php';
    ?>
    <div class="container">
        <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Hotel Not Found</h3>
            <p>The hotel you're looking for doesn't exist or is no longer listed.</p>
            <a href="hotels.php" class="btn btn-primary">Browse All Hotels</a>
        </div>
    </div>
    <?php
    include __DIR__ . '/includes/footer.php';
    exit;
}

$images = get_hotel_images($hotel['id']);
if (empty($images)) {
    $images = [['image_path' => 'assets/images/placeholder-hotel.svg']];
}
$amenities = parse_amenities($hotel['amenities']);
$telHref = tel_href($hotel['phone']);

$pageTitle = $hotel['name'] . ' - ' . $hotel['location'] . ' | ' . SITE_NAME;
$pageDescription = mb_substr($hotel['description'] ?? '', 0, 155);
$pageCanonical = 'hotel-details.php?id=' . $hotel['id'];
$ogImage = image_src($images[0]['image_path']);
$activeNav = 'hotels';
$showStickyCall = true;
$stickyPhone = $hotel['phone'];
$stickyDetailsUrl = '#details-info';

include __DIR__ . '/includes/header.php';
?>

<div class="container details-hero">
    <nav aria-label="Breadcrumb" style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:16px;">
        <a href="index.php">Home</a> / <a href="hotels.php">Hotels</a> / <span><?= e($hotel['name']) ?></span>
    </nav>

    <!-- Gallery -->
    <div class="gallery-main" id="galleryMain" data-gallery-src="<?= e(image_src($images[0]['image_path'])) ?>" data-gallery-alt="<?= e($hotel['name']) ?>">
        <img src="<?= image_src($images[0]['image_path']) ?>" alt="<?= e($hotel['name']) ?> - main photo" id="galleryMainImg" onerror="this.src='assets/images/placeholder-hotel.svg'">
    </div>
    <?php if (count($images) > 1): ?>
    <div class="gallery-thumbs">
        <?php foreach ($images as $i => $img): ?>
        <div class="thumb <?= $i === 0 ? 'active' : '' ?>" data-gallery-src="<?= e(image_src($img['image_path'])) ?>" data-gallery-alt="<?= e($hotel['name']) ?> photo <?= $i + 1 ?>">
            <img src="<?= image_src($img['image_path']) ?>" alt="<?= e($hotel['name']) ?> photo <?= $i + 1 ?>" loading="lazy" onerror="this.src='assets/images/placeholder-hotel.svg'">
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div class="details-title-row" style="margin-top:28px;">
        <div>
            <h1><?= e($hotel['name']) ?></h1>
            <div class="hotel-location"><i class="fa-solid fa-location-dot"></i> <?= e($hotel['location']) ?></div>
        </div>
        <div class="details-badges">
            <span class="rating-pill"><i class="fa-solid fa-star"></i> <?= e(number_format((float) $hotel['rating'], 1)) ?> Rating</span>
            <span class="rating-pill" style="background:#eff6ff; color:var(--color-primary);"><?= format_price($hotel['price']) ?> / night</span>
        </div>
    </div>

    <div class="details-layout" id="details-info">
        <div class="details-main">
            <div class="details-block">
                <h2>About This Hotel</h2>
                <p><?= nl2br(e($hotel['description'])) ?></p>
            </div>

            <?php if (!empty($amenities)): ?>
            <div class="details-block">
                <h2>Amenities</h2>
                <div class="amenities-grid">
                    <?php foreach ($amenities as $amenity): ?>
                    <div class="amenity-item"><i class="fa-solid fa-circle-check"></i> <?= e($amenity) ?></div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>

            <div class="details-block">
                <h2>Hotel Information</h2>
                <div class="info-cards">
                    <div class="info-card">
                        <i class="fa-solid fa-right-to-bracket"></i>
                        <strong><?= e($hotel['check_in'] ?: 'N/A') ?></strong>
                        <span>Check-in</span>
                    </div>
                    <div class="info-card">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <strong><?= e($hotel['check_out'] ?: 'N/A') ?></strong>
                        <span>Check-out</span>
                    </div>
                    <div class="info-card">
                        <i class="fa-solid fa-map-pin"></i>
                        <strong><?= e($hotel['location']) ?></strong>
                        <span>Location</span>
                    </div>
                </div>
                <?php if (!empty($hotel['address'])): ?>
                <p style="margin-top:16px;"><i class="fa-solid fa-location-dot" style="color:var(--color-primary); margin-right:6px;"></i><?= e($hotel['address']) ?></p>
                <?php endif; ?>
            </div>

            <div class="details-block">
                <h2>Location Map</h2>
                <div class="map-embed">
                    <iframe
                        src="https://maps.google.com/maps?q=<?= urlencode($hotel['address'] ?: $hotel['location']) ?>&output=embed"
                        loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                        title="Map showing location of <?= e($hotel['name']) ?>"></iframe>
                </div>
            </div>
        </div>

        <div class="details-sidebar">
            <div class="call-box">
                <h3>Need to Book?</h3>
                <p>Call the hotel directly — no forms, no waiting.</p>
                <a href="<?= e($telHref) ?>" class="phone-number"><i class="fa-solid fa-phone"></i> <?= e($hotel['phone']) ?></a>
                <a href="<?= e($telHref) ?>" class="btn btn-call btn-pulse"><i class="fa-solid fa-phone"></i> CALL &amp; BOOK HOTEL</a>
            </div>
        </div>
    </div>
</div>

<div style="height:40px;"></div>

<!-- Lightbox -->
<div class="lightbox" id="lightbox">
    <div class="lightbox-stage">
        <button class="lightbox-prev" id="lightboxPrev" aria-label="Previous image"><i class="fa-solid fa-chevron-left"></i></button>
        <img src="" alt="" id="lightboxImage">
        <button class="lightbox-next" id="lightboxNext" aria-label="Next image"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="lightbox-close" id="lightboxClose" aria-label="Close gallery"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="lightbox-counter" id="lightboxCounter">1 / <?= count($images) ?></div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
