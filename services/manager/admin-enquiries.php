<?php
require_once __DIR__ . '/includes/functions.php';
require_admin();

$messages = db()->query('SELECT * FROM contact_messages ORDER BY created_at DESC')->fetchAll();

$pageTitle = 'Enquiries — Admin';
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($pageTitle) ?></title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="admin-body">

<div class="admin-mobile-bar">
    <div class="logo" style="color:#fff;"><i class="fa-solid fa-hotel"></i> <?= e(SITE_NAME) ?> Admin</div>
    <a href="admin-logout.php" style="color:#fff;"><i class="fa-solid fa-right-from-bracket"></i></a>
</div>

<div class="admin-main" style="max-width:1000px; margin:0 auto; padding:28px 20px;">

    <div class="admin-topbar">
        <h1>Enquiries</h1>
        <div style="display:flex; gap:10px;">
            <a href="admin-manage.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-hotel"></i> Manage Hotels</a>
            <a href="admin-logout.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
        </div>
    </div>

    <div class="admin-card">
        <h2>Contact Form Enquiries (<?= count($messages) ?>)</h2>
        <div style="overflow-x:auto;">
        <table class="admin-table">
            <thead>
                <tr><th>Name</th><th>Email</th><th>Mobile Number</th><th>Message</th><th>Received</th></tr>
            </thead>
            <tbody>
                <?php if (empty($messages)): ?>
                <tr><td colspan="5" style="text-align:center; color:var(--color-text-muted); padding:30px 0;">No enquiries yet.</td></tr>
                <?php endif; ?>
                <?php foreach ($messages as $msg): ?>
                <tr>
                    <td data-label="Name"><?= e($msg['name']) ?></td>
                    <td data-label="Email"><a href="mailto:<?= e($msg['email']) ?>"><?= e($msg['email']) ?></a></td>
                    <td data-label="Mobile Number"><a href="<?= e(tel_href($msg['phone'])) ?>"><?= e($msg['phone']) ?></a></td>
                    <td data-label="Message"><?= e($msg['message']) ?></td>
                    <td data-label="Received"><?= e(date('M j, Y g:i A', strtotime($msg['created_at']))) ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </div>
</div>
</body>
</html>
