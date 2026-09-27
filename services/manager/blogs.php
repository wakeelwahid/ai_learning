<?php
require_once __DIR__ . '/includes/functions.php';

$pageTitle = 'Travel & Hotel Tips — Blog | ' . SITE_NAME;
$pageDescription = 'Tips and guides for finding, choosing, and booking the perfect hotel for your next trip.';
$pageCanonical = 'blogs.php';
$activeNav = 'blog';

// Static blog content shared with blog-details.php (no DB table needed for this simple feature)
$posts = require __DIR__ . '/includes/blog-data.php';

include __DIR__ . '/includes/header.php';
?>

<section class="section-sm bg-alt">
    <div class="container">
        <div class="section-header">
            <span class="eyebrow">Our Blog</span>
            <h2>Travel &amp; Hotel Tips</h2>
            <p>Helpful guides to make your next hotel stay smoother and smarter.</p>
        </div>

        <div class="blog-grid">
            <?php foreach ($posts as $i => $post): ?>
            <div class="blog-card fade-in-up" style="animation-delay: <?= min($i * 0.08, 0.4) ?>s;">
                <a href="blog-details.php?slug=<?= e($post['slug']) ?>" class="blog-card-img">
                    <img src="<?= e($post['image']) ?>" alt="<?= e($post['title']) ?>" loading="lazy">
                </a>
                <div class="blog-card-body">
                    <div class="blog-meta">
                        <span class="blog-category"><?= e($post['category']) ?></span>
                        <span><?= e(date('M j, Y', strtotime($post['date']))) ?></span>
                    </div>
                    <h3><a href="blog-details.php?slug=<?= e($post['slug']) ?>"><?= e($post['title']) ?></a></h3>
                    <p><?= e($post['excerpt']) ?></p>
                    <a href="blog-details.php?slug=<?= e($post['slug']) ?>" class="read-more">Read More <i class="fa-solid fa-arrow-right"></i></a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<?php include __DIR__ . '/includes/footer.php'; ?>
