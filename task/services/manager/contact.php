<?php
require_once __DIR__ . '/includes/functions.php';

$errors = [];
$success = false;
$old = ['name' => '', 'email' => '', 'phone' => '', 'message' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $old['name'] = trim($_POST['name'] ?? '');
    $old['email'] = trim($_POST['email'] ?? '');
    $old['phone'] = trim($_POST['phone'] ?? '');
    $old['message'] = trim($_POST['message'] ?? '');

    if (!csrf_verify()) {
        $errors['form'] = 'Your session expired. Please try submitting again.';
    }
    if ($old['name'] === '') {
        $errors['name'] = 'Please enter your name.';
    }
    if ($old['email'] === '' || !filter_var($old['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Please enter a valid email address.';
    }
    if ($old['phone'] === '') {
        $errors['phone'] = 'Please enter your mobile number.';
    } elseif (!preg_match('/^\+?[0-9\s-]{7,20}$/', $old['phone'])) {
        $errors['phone'] = 'Please enter a valid mobile number.';
    }
    if ($old['message'] === '') {
        $errors['message'] = 'Please enter a message.';
    }

    if (empty($errors)) {
        try {
            $stmt = db()->prepare('INSERT INTO contact_messages (name, email, phone, message) VALUES (:name, :email, :phone, :message)');
            $stmt->execute([
                'name' => $old['name'],
                'email' => $old['email'],
                'phone' => $old['phone'],
                'message' => $old['message'],
            ]);
            $success = true;
            $old = ['name' => '', 'email' => '', 'phone' => '', 'message' => ''];
        } catch (Exception $e) {
            error_log('Contact form error: ' . $e->getMessage());
            $errors['form'] = 'Something went wrong while sending your message. Please try again later.';
        }
    }
}

$pageTitle = 'Contact Us — ' . SITE_NAME;
$pageDescription = 'Get in touch with ' . SITE_NAME . '. Call, email, or send us a message.';
$pageCanonical = 'contact.php';
$activeNav = 'contact';

include __DIR__ . '/includes/header.php';
?>

<section class="section-sm bg-alt">
    <div class="container text-center">
        <span class="eyebrow" style="color:var(--color-primary); font-weight:700; text-transform:uppercase; font-size:0.85rem;">Get In Touch</span>
        <h1 style="font-size:clamp(1.8rem,4vw,2.6rem); margin:12px 0 10px;">Contact Us</h1>
        <p style="color:var(--color-text-muted); max-width:560px; margin:0 auto;">Have a question or want to list your hotel with us? Reach out anytime.</p>
    </div>
</section>

<section class="section">
    <div class="container contact-layout">
        <div>
            <div class="contact-info-card">
                <i class="fa-solid fa-phone"></i>
                <div>
                    <h4>Phone</h4>
                    <a href="<?= e(tel_href(SITE_PHONE)) ?>"><?= e(SITE_PHONE) ?></a>
                </div>
            </div>
            <div class="contact-info-card">
                <i class="fa-solid fa-envelope"></i>
                <div>
                    <h4>Email</h4>
                    <a href="mailto:<?= e(SITE_EMAIL) ?>"><?= e(SITE_EMAIL) ?></a>
                </div>
            </div>
            <div class="contact-info-card">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <h4>Address</h4>
                    <p><?= e(SITE_ADDRESS) ?></p>
                </div>
            </div>

            <div class="map-embed" style="margin-top:8px;">
                <iframe
                    src="https://maps.google.com/maps?q=<?= urlencode(SITE_ADDRESS) ?>&output=embed"
                    loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                    title="Map showing our office location"></iframe>
            </div>
        </div>

        <div class="contact-form">
            <h2 style="font-size:1.2rem; margin-bottom:20px;">Send Us a Message</h2>

            <?php if ($success): ?>
            <div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> Thank you! Your message has been sent successfully.</div>
            <?php endif; ?>
            <?php if (!empty($errors['form'])): ?>
            <div class="alert alert-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['form']) ?></div>
            <?php endif; ?>

            <form method="post" action="contact.php" data-validate novalidate>
                <?= csrf_field() ?>
                <div class="form-group <?= isset($errors['name']) ? 'has-error' : '' ?>">
                    <label for="c_name">Full Name</label>
                    <input type="text" id="c_name" name="name" value="<?= e($old['name']) ?>" required>
                    <?php if (isset($errors['name'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['name']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['email']) ? 'has-error' : '' ?>">
                    <label for="c_email">Email Address</label>
                    <input type="email" id="c_email" name="email" value="<?= e($old['email']) ?>" required>
                    <?php if (isset($errors['email'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['email']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['phone']) ? 'has-error' : '' ?>">
                    <label for="c_phone">Mobile Number</label>
                    <input type="text" id="c_phone" name="phone" value="<?= e($old['phone']) ?>" placeholder="+919876543210" required>
                    <?php if (isset($errors['phone'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['phone']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['message']) ? 'has-error' : '' ?>">
                    <label for="c_message">Message</label>
                    <textarea id="c_message" name="message" required><?= e($old['message']) ?></textarea>
                    <?php if (isset($errors['message'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['message']) ?></div><?php endif; ?>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Send Message <i class="fa-solid fa-paper-plane"></i></button>
            </form>
        </div>
    </div>
</section>

<?php include __DIR__ . '/includes/footer.php'; ?>
