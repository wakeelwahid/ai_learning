<?php
require_once __DIR__ . '/includes/functions.php';

$pageTitle = 'About Us — ' . SITE_NAME;
$pageDescription = 'Discover hotels and connect directly with hotels for easy booking. Learn more about our mission and why we skip logins and online payments.';
$pageCanonical = 'about.php';
$activeNav = 'about';

include __DIR__ . '/includes/header.php';
?>

<section class="section-sm bg-alt">
    <div class="container">
        <div class="about-hero">
            <div>
                <span class="eyebrow" style="color:var(--color-primary); font-weight:700; text-transform:uppercase; font-size:0.85rem;">About Us</span>
                <h1 style="font-size:clamp(1.8rem,4vw,2.6rem); margin:12px 0 20px;">Discover Hotels. Connect Directly. Book Easily.</h1>
                <p style="color:var(--color-text-muted); font-size:1.05rem; margin-bottom:20px;">
                    <?= e(SITE_NAME) ?> is a simple hotel discovery platform built for travelers who want to skip the
                    complicated booking process. We showcase hotels with real photos, honest details, and — most
                    importantly — a direct line to the hotel itself.
                </p>
                <p style="color:var(--color-text-muted); font-size:1.05rem;">
                    No accounts. No online payments. No middlemen. Just find a hotel you like and call to confirm
                    your stay, the way booking used to work — only faster and better organized.
                </p>
            </div>
            <img src="https://images.unsplash.com/photo-1590490360182-c33d57733427?w=900&q=80" alt="Modern hotel lobby" loading="lazy">
        </div>
    </div>
</section>

<section class="section">
    <div class="container">
        <div class="section-header">
            <span class="eyebrow">Our Mission</span>
            <h2>Making Hotel Discovery Effortless</h2>
            <p>We believe booking a hotel shouldn't require creating an account or paying online in advance. Our mission is to connect travelers with hotels through the simplest channel there is — a phone call.</p>
        </div>

        <div class="why-grid">
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-phone-volume"></i></div>
                <h3>Direct Hotel Calling</h3>
                <p>Every listing features a prominent, clickable phone number so you can speak to the hotel directly and confirm availability in real time.</p>
            </div>
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-user-check"></i></div>
                <h3>No Complicated Signup</h3>
                <p>Browse hotels, view galleries, and get all the information you need without ever creating an account.</p>
            </div>
            <div class="why-card">
                <div class="icon-circle"><i class="fa-solid fa-images"></i></div>
                <h3>Real Hotel Photos</h3>
                <p>Every hotel comes with a gallery of images so you know exactly what to expect before you call.</p>
            </div>
        </div>
    </div>
</section>

<section class="section bg-alt">
    <div class="container text-center">
        <h2 style="margin-bottom:16px;">Why Choose Us?</h2>
        <p style="color:var(--color-text-muted); max-width:600px; margin:0 auto 32px;">
            We keep things simple so you can spend less time booking and more time traveling.
        </p>
        <a href="hotels.php" class="btn btn-primary">Explore Hotels <i class="fa-solid fa-arrow-right"></i></a>
    </div>
</section>

<?php include __DIR__ . '/includes/footer.php'; ?>
