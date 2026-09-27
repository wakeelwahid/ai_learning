<?php
require_once __DIR__ . '/includes/functions.php';
require_admin();

$errors = [];
$old = [
    'name' => '', 'location' => '', 'address' => '', 'description' => '',
    'price' => '', 'rating' => '', 'phone' => '', 'amenities' => '',
    'check_in' => '12:00 PM', 'check_out' => '11:00 AM', 'status' => '1',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($old as $key => $default) {
        $old[$key] = trim($_POST[$key] ?? $default);
    }

    if (!csrf_verify()) {
        $errors['form'] = 'Your session expired. Please try again.';
    }
    if ($old['name'] === '') $errors['name'] = 'Hotel name is required.';
    if ($old['location'] === '') $errors['location'] = 'Location is required.';
    if ($old['phone'] === '') {
        $errors['phone'] = 'Mobile number is required.';
    } elseif (!preg_match('/^\+?[0-9\s-]{7,20}$/', $old['phone'])) {
        $errors['phone'] = 'Please enter a valid phone number.';
    }
    if ($old['price'] === '' || !is_numeric($old['price']) || $old['price'] < 0) {
        $errors['price'] = 'Please enter a valid price.';
    }
    if ($old['rating'] !== '' && (!is_numeric($old['rating']) || $old['rating'] < 0 || $old['rating'] > 5)) {
        $errors['rating'] = 'Rating must be between 0 and 5.';
    }

    // Validate images
    $uploadedFiles = [];
    if (!empty($_FILES['images']['name'][0])) {
        $fileCount = count($_FILES['images']['name']);
        if ($fileCount > MAX_IMAGES_PER_HOTEL) {
            $errors['images'] = 'You can upload a maximum of ' . MAX_IMAGES_PER_HOTEL . ' images.';
        } else {
            for ($i = 0; $i < $fileCount; $i++) {
                if ($_FILES['images']['error'][$i] === UPLOAD_ERR_NO_FILE) continue;
                $uploadedFiles[] = [
                    'name' => $_FILES['images']['name'][$i],
                    'type' => $_FILES['images']['type'][$i],
                    'tmp_name' => $_FILES['images']['tmp_name'][$i],
                    'error' => $_FILES['images']['error'][$i],
                    'size' => $_FILES['images']['size'][$i],
                ];
            }
        }
    }

    if (empty($errors)) {
        $pdo = db();
        try {
            $pdo->beginTransaction();

            $slugBase = make_slug($old['name'] . '-' . $old['location']);
            $slug = $slugBase;
            $suffix = 1;
            $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM hotels WHERE slug = :slug');
            while (true) {
                $checkStmt->execute(['slug' => $slug]);
                if ((int) $checkStmt->fetchColumn() === 0) break;
                $slug = $slugBase . '-' . (++$suffix);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO hotels (name, slug, location, address, description, price, rating, phone, amenities, check_in, check_out, status)
                 VALUES (:name, :slug, :location, :address, :description, :price, :rating, :phone, :amenities, :check_in, :check_out, :status)'
            );
            $stmt->execute([
                'name' => $old['name'],
                'slug' => $slug,
                'location' => $old['location'],
                'address' => $old['address'],
                'description' => $old['description'],
                'price' => $old['price'],
                'rating' => $old['rating'] !== '' ? $old['rating'] : 0,
                'phone' => $old['phone'],
                'amenities' => $old['amenities'],
                'check_in' => $old['check_in'],
                'check_out' => $old['check_out'],
                'status' => $old['status'] === '1' ? 1 : 0,
            ]);
            $hotelId = (int) $pdo->lastInsertId();

            $sortOrder = 1;
            $imgStmt = $pdo->prepare(
                'INSERT INTO hotel_images (hotel_id, image_path, is_primary, sort_order) VALUES (:hotel_id, :path, :is_primary, :sort_order)'
            );
            foreach ($uploadedFiles as $file) {
                $path = handle_image_upload($file); // throws on invalid file
                $imgStmt->execute([
                    'hotel_id' => $hotelId,
                    'path' => $path,
                    'is_primary' => $sortOrder === 1 ? 1 : 0,
                    'sort_order' => $sortOrder,
                ]);
                $sortOrder++;
            }

            $pdo->commit();
            $_SESSION['flash_success'] = 'Hotel "' . $old['name'] . '" added successfully. It is now live on the website.';
            redirect('admin-manage.php?hotel_id=' . $hotelId);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Add hotel error: ' . $e->getMessage());
            $errors['form'] = $e->getMessage() ?: 'Something went wrong while saving the hotel.';
        }
    }
}

$pageTitle = 'Add Hotel — Admin';
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

<div class="admin-main" style="max-width:900px; margin:0 auto; padding:28px 20px;">

    <div class="admin-topbar">
        <h1>Add New Hotel</h1>
        <div style="display:flex; gap:10px;">
            <a href="admin-manage.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-arrow-left"></i> Manage Hotels</a>
            <a href="admin-logout.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
        </div>
    </div>

    <?php if (!empty($errors['form'])): ?>
    <div class="alert alert-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['form']) ?></div>
    <?php endif; ?>
    <?php if (!empty($errors['images'])): ?>
    <div class="alert alert-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['images']) ?></div>
    <?php endif; ?>

    <form method="post" action="admin-add-hotel.php" enctype="multipart/form-data" novalidate>
        <?= csrf_field() ?>

        <div class="admin-card">
            <h2>Hotel Details</h2>
            <div class="admin-form-grid">
                <div class="form-group <?= isset($errors['name']) ? 'has-error' : '' ?>">
                    <label for="name">Hotel Name *</label>
                    <input type="text" id="name" name="name" value="<?= e($old['name']) ?>" required>
                    <?php if (isset($errors['name'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['name']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['location']) ? 'has-error' : '' ?>">
                    <label for="location">Location (City, State) *</label>
                    <input type="text" id="location" name="location" value="<?= e($old['location']) ?>" required>
                    <?php if (isset($errors['location'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['location']) ?></div><?php endif; ?>
                </div>
                <div class="form-group full">
                    <label for="address">Full Address</label>
                    <input type="text" id="address" name="address" value="<?= e($old['address']) ?>">
                </div>
                <div class="form-group full">
                    <label for="description">Description</label>
                    <textarea id="description" name="description" rows="4"><?= e($old['description']) ?></textarea>
                </div>
                <div class="form-group <?= isset($errors['price']) ? 'has-error' : '' ?>">
                    <label for="price">Price per Night (&#8377;) *</label>
                    <input type="number" id="price" name="price" min="0" step="0.01" value="<?= e($old['price']) ?>" required>
                    <?php if (isset($errors['price'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['price']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['rating']) ? 'has-error' : '' ?>">
                    <label for="rating">Rating (0&ndash;5)</label>
                    <input type="number" id="rating" name="rating" min="0" max="5" step="0.1" value="<?= e($old['rating']) ?>">
                    <?php if (isset($errors['rating'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['rating']) ?></div><?php endif; ?>
                </div>
                <div class="form-group <?= isset($errors['phone']) ? 'has-error' : '' ?>">
                    <label for="phone">Mobile Number *</label>
                    <input type="text" id="phone" name="phone" value="<?= e($old['phone']) ?>" placeholder="+919876543210" required>
                    <?php if (isset($errors['phone'])): ?><div class="field-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($errors['phone']) ?></div><?php endif; ?>
                </div>
                <div class="form-group">
                    <label for="status">Status</label>
                    <select id="status" name="status">
                        <option value="1" <?= $old['status'] === '1' ? 'selected' : '' ?>>Active (visible on site)</option>
                        <option value="0" <?= $old['status'] === '0' ? 'selected' : '' ?>>Inactive (hidden)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="check_in">Check-in Time</label>
                    <input type="text" id="check_in" name="check_in" value="<?= e($old['check_in']) ?>">
                </div>
                <div class="form-group">
                    <label for="check_out">Check-out Time</label>
                    <input type="text" id="check_out" name="check_out" value="<?= e($old['check_out']) ?>">
                </div>
                <div class="form-group full">
                    <label for="amenities">Amenities (comma separated)</label>
                    <input type="text" id="amenities" name="amenities" value="<?= e($old['amenities']) ?>" placeholder="Free WiFi, Swimming Pool, Restaurant, Parking">
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h2>Hotel Images (1&ndash;10)</h2>
            <label class="image-upload-zone" for="hotelImages">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <p><strong>Click to upload images</strong> or drag and drop</p>
                <p style="font-size:0.8rem; color:var(--color-text-muted);">JPG, PNG, or WebP — up to 5MB each, max 10 images</p>
            </label>
            <input type="file" id="hotelImages" name="images[]" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">
        </div>

        <div style="display:flex; gap:12px; justify-content:flex-end;">
            <a href="admin-manage.php" class="btn" style="background:var(--color-bg);">Cancel</a>
            <button type="submit" class="btn btn-primary">Save Hotel <i class="fa-solid fa-check"></i></button>
        </div>
    </form>
</div>

<script>
document.getElementById('hotelImages').addEventListener('change', function () {
    var label = this.closest('.admin-card').querySelector('.image-upload-zone p strong');
    if (label) label.textContent = this.files.length + ' file(s) selected';
});
</script>
</body>
</html>
