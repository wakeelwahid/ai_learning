<?php
require_once __DIR__ . '/includes/functions.php';

$posts = require __DIR__ . '/includes/blog-data.php';
$slug = trim($_GET['slug'] ?? '');

$post = null;
foreach ($posts as $p) {
    if ($p['slug'] === $slug) { $post = $p; break; }
}

if (!$post) {
    http_response_code(404);
    $pageTitle = 'Article Not Found — ' . SITE_NAME;
    $activeNav = 'blog';
    include __DIR__ . '/includes/header.php';
    ?>
    <div class="container">
        <div class="empty-state">
            <i class="fa-solid fa-newspaper"></i>
            <h3>Article Not Found</h3>
            <p>The blog post you're looking for doesn't exist.</p>
            <a href="blogs.php" class="btn btn-primary">Back to Blog</a>
        </div>
    </div>
    <?php
    include __DIR__ . '/includes/footer.php';
    exit;
}

$pageTitle = $post['title'] . ' | ' . SITE_NAME;
$pageDescription = $post['excerpt'];
$pageCanonical = 'blog-details.php?slug=' . $post['slug'];
$ogImage = $post['image'];
$activeNav = 'blog';

// Related posts (excluding current)
$related = array_slice(array_filter($posts, fn($p) => $p['slug'] !== $slug), 0, 3);

include __DIR__ . '/includes/header.php';
?>

<article class="section-sm">
    <div class="container" style="max-width: 800px;">
        <nav aria-label="Breadcrumb" style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:20px;">
            <a href="index.php">Home</a> / <a href="blogs.php">Blog</a> / <span><?= e($post['title']) ?></span>
        </nav>

        <div class="blog-meta" style="margin-bottom:14px;">
            <span class="blog-category"><?= e($post['category']) ?></span>
            <span><?= e(date('F j, Y', strtotime($post['date']))) ?></span>
        </div>

        <h1 style="font-size:clamp(1.6rem,4vw,2.4rem); margin-bottom:24px;"><?= e($post['title']) ?></h1>

        <img src="<?= e($post['image']) ?>" alt="<?= e($post['title']) ?>" style="width:100%; border-radius:var(--radius-md); margin-bottom:32px; box-shadow:var(--shadow-sm);" loading="lazy">

        <div class="blog-content" style="color:var(--color-text); font-size:1.02rem; line-height:1.8;">
            <?= $post['content'] /* trusted static content defined in includes/blog-data.php */ ?>
        </div>

        <div class="call-box" style="margin-top:48px;">
            <h3>Ready to Book Your Stay?</h3>
            <p>Browse our hotels and call directly — no forms, no fuss.</p>
            <a href="hotels.php" class="btn btn-light">Browse Hotels <i class="fa-solid fa-arrow-right"></i></a>
        </div>
    </div>
</article>

<?php if (!empty($related)): ?>
<section class="section-sm bg-alt">
    <div class="container">
        <div class="section-header">
            <span class="eyebrow">Keep Reading</span>
            <h2>Related Articles</h2>
        </div>
        <div class="blog-grid">
            <?php foreach ($related as $r): ?>
            <div class="blog-card">
                <a href="blog-details.php?slug=<?= e($r['slug']) ?>" class="blog-card-img">
                    <img src="<?= e($r['image']) ?>" alt="<?= e($r['title']) ?>" loading="lazy">
                </a>
                <div class="blog-card-body">
                    <div class="blog-meta">
                        <span class="blog-category"><?= e($r['category']) ?></span>
                        <span><?= e(date('M j, Y', strtotime($r['date']))) ?></span>
                    </div>
                    <h3><a href="blog-details.php?slug=<?= e($r['slug']) ?>"><?= e($r['title']) ?></a></h3>
                    <a href="blog-details.php?slug=<?= e($r['slug']) ?>" class="read-more">Read More <i class="fa-solid fa-arrow-right"></i></a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>
<?php endif; ?>

<?php include __DIR__ . '/includes/footer.php'; ?>
