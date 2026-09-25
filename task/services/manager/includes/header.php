<?php
/**
 * Shared site header.
 * Expects (optional) variables set by the calling page before including this file:
 *   $pageTitle        string  — <title> text
 *   $pageDescription  string  — meta description
 *   $pageCanonical    string  — canonical relative path, e.g. 'hotels.php'
 *   $ogImage          string  — absolute/relative image URL for Open Graph
 *   $activeNav        string  — one of: home, hotels, blog, about, contact
 */
if (!isset($pageTitle)) {
    $pageTitle = SITE_NAME . ' — Find Your Perfect Stay';
}
if (!isset($pageDescription)) {
    $pageDescription = SITE_TAGLINE;
}
if (!isset($activeNav)) {
    $activeNav = '';
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?= e($pageTitle) ?></title>
<meta name="description" content="<?= e($pageDescription) ?>">
<?php if (!empty($pageCanonical)): ?>
<link rel="canonical" href="<?= e(base_url($pageCanonical)) ?>">
<?php endif; ?>
<meta property="og:title" content="<?= e($pageTitle) ?>">
<meta property="og:description" content="<?= e($pageDescription) ?>">
<meta property="og:type" content="website">
<?php if (!empty($ogImage)): ?>
<meta property="og:image" content="<?= e($ogImage) ?>">
<?php endif; ?>
<meta name="theme-color" content="#0f172a">
<link rel="icon" type="image/svg+xml" href="assets/images/favicon.svg">

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<!-- Font Awesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- App styles -->
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>

<a class="skip-link" href="#main-content">Skip to content</a>

<header class="site-header" id="siteHeader">
    <div class="container header-inner">
        <a href="index.php" class="logo">
            <i class="fa-solid fa-hotel"></i>
            <span><?= e(SITE_NAME) ?></span>
        </a>

        <nav class="main-nav" id="mainNav">
            <a href="index.php" class="<?= $activeNav === 'home' ? 'active' : '' ?>">Home</a>
            <a href="hotels.php" class="<?= $activeNav === 'hotels' ? 'active' : '' ?>">Hotels</a>
            <a href="blogs.php" class="<?= $activeNav === 'blog' ? 'active' : '' ?>">Blog</a>
            <a href="about.php" class="<?= $activeNav === 'about' ? 'active' : '' ?>">About</a>
            <a href="contact.php" class="<?= $activeNav === 'contact' ? 'active' : '' ?>">Contact</a>
        </nav>

        <div class="header-actions">
            <a href="tel:<?= e(SITE_PHONE) ?>" class="btn-header-call">
                <i class="fa-solid fa-phone"></i>
                <span>Call Us</span>
            </a>
            <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobileDrawer">
                <span></span><span></span><span></span>
            </button>
        </div>
    </div>
</header>

<!-- Mobile drawer -->
<div class="mobile-drawer" id="mobileDrawer" aria-hidden="true">
    <div class="mobile-drawer-inner">
        <div class="mobile-drawer-header">
            <a href="index.php" class="logo"><i class="fa-solid fa-hotel"></i><span><?= e(SITE_NAME) ?></span></a>
            <button class="drawer-close" id="drawerClose" aria-label="Close menu">&times;</button>
        </div>
        <nav class="mobile-nav">
            <a href="index.php" class="<?= $activeNav === 'home' ? 'active' : '' ?>"><i class="fa-solid fa-house"></i> Home</a>
            <a href="hotels.php" class="<?= $activeNav === 'hotels' ? 'active' : '' ?>"><i class="fa-solid fa-bed"></i> Hotels</a>
            <a href="blogs.php" class="<?= $activeNav === 'blog' ? 'active' : '' ?>"><i class="fa-solid fa-newspaper"></i> Blog</a>
            <a href="about.php" class="<?= $activeNav === 'about' ? 'active' : '' ?>"><i class="fa-solid fa-circle-info"></i> About</a>
            <a href="contact.php" class="<?= $activeNav === 'contact' ? 'active' : '' ?>"><i class="fa-solid fa-envelope"></i> Contact</a>
        </nav>
        <a href="tel:<?= e(SITE_PHONE) ?>" class="btn btn-primary btn-block mobile-call-btn">
            <i class="fa-solid fa-phone"></i> Call <?= e(SITE_PHONE) ?>
        </a>
    </div>
</div>
<div class="drawer-overlay" id="drawerOverlay"></div>

<main id="main-content">
