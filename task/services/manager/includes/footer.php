</main>

<footer class="site-footer">
    <div class="container footer-grid">
        <div class="footer-col footer-brand">
            <a href="index.php" class="logo"><i class="fa-solid fa-hotel"></i><span><?= e(SITE_NAME) ?></span></a>
            <p><?= e(SITE_TAGLINE) ?></p>
            <div class="footer-social">
                <a href="#" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
                <a href="#" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
                <a href="#" aria-label="Twitter"><i class="fa-brands fa-x-twitter"></i></a>
            </div>
        </div>

        <div class="footer-col">
            <h4>Quick Links</h4>
            <a href="index.php">Home</a>
            <a href="hotels.php">Hotels</a>
            <a href="blogs.php">Blog</a>
            <a href="about.php">About</a>
            <a href="contact.php">Contact</a>
        </div>

        <div class="footer-col">
            <h4>Contact</h4>
            <a href="tel:<?= e(SITE_PHONE) ?>"><i class="fa-solid fa-phone"></i> <?= e(SITE_PHONE) ?></a>
            <a href="mailto:<?= e(SITE_EMAIL) ?>"><i class="fa-solid fa-envelope"></i> <?= e(SITE_EMAIL) ?></a>
            <p class="footer-address"><i class="fa-solid fa-location-dot"></i> <?= e(SITE_ADDRESS) ?></p>
        </div>

        <div class="footer-col">
            <h4>For Hotels</h4>
            <p class="footer-note">Are you a hotel owner? List your property with us and connect with travelers directly.</p>
            <a href="contact.php" class="btn btn-outline-light btn-sm">Get Listed</a>
        </div>
    </div>

    <div class="footer-bottom">
        <div class="container">
            <p>&copy; <?= date('Y') ?> <?= e(SITE_NAME) ?>. All Rights Reserved.</p>
        </div>
    </div>
</footer>

<!-- Mobile sticky call bar (hidden on desktop via CSS) -->
<?php if (!empty($showStickyCall)): ?>
<div class="sticky-call-bar" id="stickyCallBar">
    <a href="tel:<?= e($stickyPhone ?? SITE_PHONE) ?>" class="sticky-call-btn">
        <i class="fa-solid fa-phone"></i> Call Hotel
    </a>
    <?php if (!empty($stickyDetailsUrl)): ?>
    <a href="<?= e($stickyDetailsUrl) ?>" class="sticky-details-btn">
        <i class="fa-solid fa-circle-info"></i> View Details
    </a>
    <?php endif; ?>
</div>
<?php endif; ?>

<a href="tel:<?= e(SITE_PHONE) ?>" class="floating-call-btn" aria-label="Call now">
    <i class="fa-solid fa-phone"></i>
</a>

<script src="assets/js/app.js"></script>
</body>
</html>
