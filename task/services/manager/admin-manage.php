<?php
require_once __DIR__ . '/includes/functions.php';
require_admin();

// Which hotel is currently selected (via dropdown)
$hotels = db()->query('SELECT id, name, location, phone FROM hotels ORDER BY name ASC')->fetchAll();
$selectedId = (int) ($_GET['hotel_id'] ?? $_POST['hotel_id'] ?? ($hotels[0]['id'] ?? 0));

$success = '';
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_verify()) {
    $action = $_POST['action'] ?? '';

    // ---------------------------------------------------
    // CRUD 1: Hotel details (phone, price, location, address)
    // ---------------------------------------------------
    if ($action === 'update_details') {
        $phone = trim($_POST['phone'] ?? '');
        $price = trim($_POST['price'] ?? '');
        $location = trim($_POST['location'] ?? '');
        $address = trim($_POST['address'] ?? '');

        if ($phone === '' || !preg_match('/^\+?[0-9\s-]{7,20}$/', $phone)) {
            $errors[] = 'Please enter a valid phone number.';
        }
        if ($price === '' || !is_numeric($price) || $price < 0) {
            $errors[] = 'Please enter a valid price.';
        }
        if ($location === '') {
            $errors[] = 'Please enter a location.';
        }

        if (empty($errors)) {
            $stmt = db()->prepare('UPDATE hotels SET phone = :phone, price = :price, location = :location, address = :address WHERE id = :id');
            $stmt->execute([
                'phone' => $phone,
                'price' => $price,
                'location' => $location,
                'address' => $address,
                'id' => $selectedId,
            ]);
            $success = 'Hotel details updated successfully.';
        }

    // ---------------------------------------------------
    // CRUD 2: Hotel images (upload)
    // ---------------------------------------------------
    } elseif ($action === 'upload_images') {
        $uploadedFiles = [];
        if (!empty($_FILES['images']['name'][0])) {
            $fileCount = count($_FILES['images']['name']);
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

        if (empty($uploadedFiles)) {
            $errors[] = 'Please select at least one image to upload.';
        } else {
            $countStmt = db()->prepare('SELECT COUNT(*) FROM hotel_images WHERE hotel_id = :id');
            $countStmt->execute(['id' => $selectedId]);
            $existingCount = (int) $countStmt->fetchColumn();

            if ($existingCount + count($uploadedFiles) > MAX_IMAGES_PER_HOTEL) {
                $errors[] = 'This would exceed the maximum of ' . MAX_IMAGES_PER_HOTEL . ' images for this hotel.';
            } else {
                try {
                    $pdo = db();
                    $maxOrderStmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) FROM hotel_images WHERE hotel_id = :id');
                    $maxOrderStmt->execute(['id' => $selectedId]);
                    $sortOrder = (int) $maxOrderStmt->fetchColumn() + 1;
                    $hasPrimary = $existingCount > 0;

                    $imgStmt = $pdo->prepare('INSERT INTO hotel_images (hotel_id, image_path, is_primary, sort_order) VALUES (:hotel_id, :path, :is_primary, :sort_order)');
                    foreach ($uploadedFiles as $file) {
                        $path = handle_image_upload($file);
                        $imgStmt->execute([
                            'hotel_id' => $selectedId,
                            'path' => $path,
                            'is_primary' => !$hasPrimary ? 1 : 0,
                            'sort_order' => $sortOrder,
                        ]);
                        $hasPrimary = true;
                        $sortOrder++;
                    }
                    $success = count($uploadedFiles) . ' image(s) uploaded successfully.';
                } catch (Exception $e) {
                    error_log('Image upload error: ' . $e->getMessage());
                    $errors[] = $e->getMessage();
                }
            }
        }

    // ---------------------------------------------------
    // CRUD 2: Hotel images (delete)
    // ---------------------------------------------------
    } elseif ($action === 'delete_image') {
        $imageId = (int) ($_POST['image_id'] ?? 0);
        $stmt = db()->prepare('SELECT * FROM hotel_images WHERE id = :id AND hotel_id = :hotel_id');
        $stmt->execute(['id' => $imageId, 'hotel_id' => $selectedId]);
        $image = $stmt->fetch();

        if ($image) {
            $wasPrimary = (bool) $image['is_primary'];
            delete_image_file($image['image_path']);

            $del = db()->prepare('DELETE FROM hotel_images WHERE id = :id');
            $del->execute(['id' => $imageId]);

            if ($wasPrimary) {
                $next = db()->prepare('SELECT id FROM hotel_images WHERE hotel_id = :hotel_id ORDER BY sort_order ASC LIMIT 1');
                $next->execute(['hotel_id' => $selectedId]);
                $nextId = $next->fetchColumn();
                if ($nextId) {
                    $promote = db()->prepare('UPDATE hotel_images SET is_primary = 1 WHERE id = :id');
                    $promote->execute(['id' => $nextId]);
                }
            }
            $success = 'Image deleted successfully.';
        }
    }
}

// Refresh data after any action
$hotelStmt = db()->prepare('SELECT * FROM hotels WHERE id = :id');
$hotelStmt->execute(['id' => $selectedId]);
$selectedHotel = $hotelStmt->fetch();
$images = $selectedHotel ? get_hotel_images($selectedId) : [];

$pageTitle = 'Manage Hotels — Admin';
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
        <h1>Manage Hotels</h1>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <a href="admin-add-hotel.php" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i> Add Hotel</a>
            <a href="admin-enquiries.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-envelope"></i> Enquiries</a>
            <a href="admin-logout.php" class="btn btn-sm" style="background:var(--color-bg);"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
        </div>
    </div>

    <?php if (!empty($_SESSION['flash_success'])): ?>
    <div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> <?= e($_SESSION['flash_success']) ?></div>
    <?php unset($_SESSION['flash_success']); endif; ?>
    <?php if ($success): ?>
    <div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> <?= e($success) ?></div>
    <?php endif; ?>
    <?php foreach ($errors as $error): ?>
    <div class="alert alert-error"><i class="fa-solid fa-circle-exclamation"></i> <?= e($error) ?></div>
    <?php endforeach; ?>

    <!-- Hotel selector -->
    <div class="admin-card">
        <h2>Select Hotel</h2>
        <form method="get" action="admin-manage.php">
            <div class="form-group" style="margin-bottom:0;">
                <select name="hotel_id" onchange="this.form.submit()" style="width:100%; padding:13px 16px; border-radius:10px; border:1.5px solid var(--color-border); font-size:0.95rem;">
                    <?php foreach ($hotels as $h): ?>
                    <option value="<?= (int) $h['id'] ?>" <?= $h['id'] == $selectedId ? 'selected' : '' ?>>
                        <?= e($h['name']) ?> — <?= e($h['location']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
        </form>
    </div>

    <?php if ($selectedHotel): ?>

    <!-- ===================================================
         CRUD 1: HOTEL DETAILS (phone, price, location, address)
         Fully independent form + button from the image section below.
         =================================================== -->
    <div class="admin-card">
        <h2><i class="fa-solid fa-pen"></i> Hotel Details — <?= e($selectedHotel['name']) ?></h2>
        <form method="post" action="admin-manage.php?hotel_id=<?= (int) $selectedId ?>">
            <?= csrf_field() ?>
            <input type="hidden" name="hotel_id" value="<?= (int) $selectedId ?>">
            <input type="hidden" name="action" value="update_details">

            <div class="admin-form-grid">
                <div class="form-group">
                    <label for="phone">Phone Number</label>
                    <input type="text" id="phone" name="phone" value="<?= e($selectedHotel['phone']) ?>" placeholder="+919876543210" required>
                </div>
                <div class="form-group">
                    <label for="price">Price per Night (&#8377;)</label>
                    <input type="number" id="price" name="price" min="0" step="0.01" value="<?= e($selectedHotel['price']) ?>" required>
                </div>
                <div class="form-group">
                    <label for="location">Location (City, State)</label>
                    <input type="text" id="location" name="location" value="<?= e($selectedHotel['location']) ?>" placeholder="e.g. Jaipur, Rajasthan" required>
                </div>
                <div class="form-group full">
                    <label for="address">Full Address</label>
                    <input type="text" id="address" name="address" value="<?= e($selectedHotel['address']) ?>" placeholder="Street, City, State, PIN">
                </div>
            </div>

            <div style="text-align:right; margin-top:10px;">
                <button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> Update Details</button>
            </div>
        </form>
    </div>

    <!-- ===================================================
         CRUD 2: HOTEL IMAGES (upload / delete)
         Fully independent form + button from the details section above.
         =================================================== -->
    <div class="admin-card">
        <h2><i class="fa-solid fa-images"></i> Hotel Images (<?= count($images) ?>/<?= MAX_IMAGES_PER_HOTEL ?>)</h2>

        <?php if (!empty($images)): ?>
        <div class="image-preview-grid">
            <?php foreach ($images as $img): ?>
            <div class="image-preview-item">
                <img src="<?= image_src($img['image_path']) ?>" alt="Hotel image" onerror="this.src='assets/images/placeholder-hotel.svg'">
                <?php if ($img['is_primary']): ?><span class="primary-badge">Primary</span><?php endif; ?>
                <form method="post" action="admin-manage.php?hotel_id=<?= (int) $selectedId ?>" onsubmit="return confirm('Delete this image?');" style="position:absolute; top:6px; right:6px;">
                    <?= csrf_field() ?>
                    <input type="hidden" name="hotel_id" value="<?= (int) $selectedId ?>">
                    <input type="hidden" name="action" value="delete_image">
                    <input type="hidden" name="image_id" value="<?= (int) $img['id'] ?>">
                    <button type="submit" class="remove-btn" title="Delete image">&times;</button>
                </form>
            </div>
            <?php endforeach; ?>
        </div>
        <?php else: ?>
        <p style="color:var(--color-text-muted);">No images uploaded yet.</p>
        <?php endif; ?>

        <?php if (count($images) < MAX_IMAGES_PER_HOTEL): ?>
        <h2 style="margin-top:24px; font-size:1rem;">Upload New Images</h2>
        <form method="post" action="admin-manage.php?hotel_id=<?= (int) $selectedId ?>" enctype="multipart/form-data">
            <?= csrf_field() ?>
            <input type="hidden" name="hotel_id" value="<?= (int) $selectedId ?>">
            <input type="hidden" name="action" value="upload_images">
            <label class="image-upload-zone" for="newImages">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <p><strong>Click to upload images</strong> or drag and drop</p>
                <p style="font-size:0.8rem; color:var(--color-text-muted);">JPG, PNG, or WebP — up to 5MB each. You can add up to <?= MAX_IMAGES_PER_HOTEL - count($images) ?> more.</p>
            </label>
            <input type="file" id="newImages" name="images[]" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">
            <div style="margin-top:16px; text-align:right;">
                <button type="submit" class="btn btn-primary btn-sm"><i class="fa-solid fa-upload"></i> Upload Images</button>
            </div>
        </form>
        <?php else: ?>
        <div class="alert" style="background:#fef3c7; color:#92400e; margin-top:20px;"><i class="fa-solid fa-circle-info"></i> Maximum of <?= MAX_IMAGES_PER_HOTEL ?> images reached.</div>
        <?php endif; ?>
    </div>

    <?php endif; ?>
</div>

<script>
document.getElementById('newImages')?.addEventListener('change', function () {
    var label = this.closest('form').querySelector('.image-upload-zone p strong');
    if (label) label.textContent = this.files.length + ' file(s) selected';
});
</script>
</body>
</html>
