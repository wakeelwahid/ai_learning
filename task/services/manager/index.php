<?php
require_once __DIR__ . '/includes/functions.php';

$pageTitle = SITE_NAME . ' — Find Your Perfect Stay';
$pageDescription = 'Discover comfortable hotels across India and book directly with the hotel. No login, no payment — just call and confirm your stay.';
$pageCanonical = 'index.php';
$activeNav = 'home';

$featuredHotels = get_featured_hotels(8);

include __DIR__ . '/includes/header.php';
?>

<section class="hero" style="background-image:url('https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1600&q=80');">
    <div class="hero-content">
        <h1>Find Your Perfect Stay</h1>
        <p class="subtitle">Discover comfortable hotels and book directly with the hotel.</p>

        <div class="search-box">
            <form class="search-form" action="hotels.php" method="get" data-validate>
                <div class="search-field">
                    <label for="s_location"><i class="fa-solid fa-location-dot"></i> Location</label>
                    <input type="text" id="s_location" name="location" placeholder="City, e.g. Jaipur">
                </div>
                <div class="search-field">
                    <label for="s_q"><i class="fa-solid fa-hotel"></i> Hotel Name</label>
                    <input type="text" id="s_q" name="q" placeholder="Search hotel name">
                </div>
                <div class="search-field">
                    <label for="s_price"><i class="fa-solid fa-tag"></i> Max Price</label>
                    <select id="s_price" name="max_price">
                        <option value="">Any Price</option>
                        <option value="2000">Under &#8377;2,000</option>
                        <option value="3000">Under &#8377;3,000</option>
                        <option value="4000">Under &#8377;4,000</option>
                        <option value="5000">Under &#8377;5,000</option>
                    </select>
                </div>
                <button type="submit" class="search-submit"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
            </form>
        </div>

        <div class="hero-stats">
            <div class="stat"><strong>10+</strong><span>Hotels Listed</span></div>
            <div class="stat"><strong>8+</strong><span>Cities Covered</span></div>
            <div class="stat"><strong>100%</strong><span>Direct Booking</span></div>
            <div class="stat"><strong>0</strong><span>Login Required</span></div>
        </div>
    </div>
</section>

<section class="section bg-alt">
    <div class="container">
        <div class="section-header">
            <span class="eyebrow">Featured Stays</span>
            <h2>Top Rated Hotels</h2>
            <p>Hand-picked hotels loved by travelers — call directly to book your room.</p>
        </div>

        <div class="hotel-grid">
            <?php foreach ($featuredHotels as $i => $hotel): ?>
            <div class="hotel-card" style="animation-delay: <?= min($i * 0.08, 0.4) ?>s;">
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

        <div class="text-center" style="margin-top:48px;">
            <a href="hotels.php" class="btn btn-primary">View All Hotels <i class="fa-solid fa-arrow-right"></i></a>
        </div>
    </div>
</section>

<section class="section">
    <div class="container">
        <div class="section-header">
            <span class="eyebrow">Why HotelBook</span>
            <h2>Booking Made Simple</h2>
            <p>No accounts, no payments, no waiting — just direct hotel calling.</p>
        </div>
        <div class="why-grid">
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-phone-volume"></i></div>
                <h3>One-Tap Calling</h3>
                <p>Tap the call button and your phone dials the hotel instantly. No forms, no waiting for confirmation emails.</p>
            </div>
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-user-slash"></i></div>
                <h3>No Login Needed</h3>
                <p>Browse and book without creating an account. Your privacy, your convenience.</p>
            </div>
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-shield-heart"></i></div>
                <h3>No Online Payment</h3>
                <p>Pay directly at the hotel — no card details, no online transactions required.</p>
            </div>
        </div>
    </div>
</section>

<?php include __DIR__ . '/includes/footer.php'; ?>
