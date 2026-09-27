/* =====================================================
   HotelBook — Global front-end behaviour
   ===================================================== */
(function () {
    'use strict';

    /* ---------- Mobile nav drawer ---------- */
    var navToggle = document.getElementById('navToggle');
    var drawer = document.getElementById('mobileDrawer');
    var drawerClose = document.getElementById('drawerClose');
    var overlay = document.getElementById('drawerOverlay');

    function openDrawer() {
        if (!drawer) return;
        drawer.classList.add('open');
        overlay.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        navToggle.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
        if (!drawer) return;
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }
    if (navToggle) navToggle.addEventListener('click', openDrawer);
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
    if (overlay) overlay.addEventListener('click', closeDrawer);
    document.querySelectorAll('.mobile-nav a').forEach(function (a) {
        a.addEventListener('click', closeDrawer);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDrawer();
    });

    /* ---------- Lightbox gallery ---------- */
    var lightbox = document.getElementById('lightbox');
    if (lightbox) {
        var lbImg = document.getElementById('lightboxImage');
        var lbCounter = document.getElementById('lightboxCounter');
        var thumbs = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-src]'));
        var currentIndex = 0;

        function showImage(index) {
            if (!thumbs.length) return;
            currentIndex = (index + thumbs.length) % thumbs.length;
            var src = thumbs[currentIndex].getAttribute('data-gallery-src');
            lbImg.setAttribute('src', src);
            lbImg.setAttribute('alt', thumbs[currentIndex].getAttribute('data-gallery-alt') || 'Hotel image');
            lbCounter.textContent = (currentIndex + 1) + ' / ' + thumbs.length;
            document.querySelectorAll('.gallery-thumbs .thumb').forEach(function (t, i) {
                t.classList.toggle('active', i === currentIndex);
            });
        }

        thumbs.forEach(function (el, i) {
            el.addEventListener('click', function () {
                showImage(i);
                lightbox.classList.add('open');
                document.body.style.overflow = 'hidden';
            });
        });

        var lbClose = document.getElementById('lightboxClose');
        var lbPrev = document.getElementById('lightboxPrev');
        var lbNext = document.getElementById('lightboxNext');

        function closeLightbox() {
            lightbox.classList.remove('open');
            document.body.style.overflow = '';
        }

        if (lbClose) lbClose.addEventListener('click', closeLightbox);
        if (lbPrev) lbPrev.addEventListener('click', function () { showImage(currentIndex - 1); });
        if (lbNext) lbNext.addEventListener('click', function () { showImage(currentIndex + 1); });
        lightbox.addEventListener('click', function (e) {
            if (e.target === lightbox) closeLightbox();
        });
        document.addEventListener('keydown', function (e) {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
            if (e.key === 'ArrowRight') showImage(currentIndex + 1);
        });
    }

    /* ---------- Simple inline form validation (no alert()) ---------- */
    document.querySelectorAll('form[data-validate]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            var valid = true;
            form.querySelectorAll('[required]').forEach(function (field) {
                var group = field.closest('.form-group') || field.parentElement;
                var errorEl = group.querySelector('.field-error');
                var isEmpty = !field.value || !field.value.trim();

                if (isEmpty) {
                    valid = false;
                    group.classList.add('has-error');
                    if (!errorEl) {
                        errorEl = document.createElement('div');
                        errorEl.className = 'field-error';
                        errorEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> This field is required.';
                        group.appendChild(errorEl);
                    }
                } else {
                    group.classList.remove('has-error');
                    if (errorEl) errorEl.remove();
                }
            });
            if (!valid) e.preventDefault();
        });
    });

    /* ---------- Admin sidebar toggle (mobile) ---------- */
    var adminToggle = document.getElementById('adminSidebarToggle');
    var adminSidebar = document.getElementById('adminSidebar');
    if (adminToggle && adminSidebar) {
        adminToggle.addEventListener('click', function () {
            adminSidebar.classList.toggle('open');
        });
    }

    /* ---------- Admin: image upload preview with client-side limit ---------- */
    var imageInput = document.getElementById('hotelImages');
    var previewGrid = document.getElementById('imagePreviewGrid');
    if (imageInput && previewGrid) {
        var maxImages = parseInt(imageInput.getAttribute('data-max') || '10', 10);
        var existingCount = parseInt(previewGrid.getAttribute('data-existing-count') || '0', 10);

        imageInput.addEventListener('change', function () {
            var files = Array.prototype.slice.call(imageInput.files);
            var totalAllowed = maxImages - existingCount;
            var warning = document.getElementById('imageUploadWarning');

            if (files.length > totalAllowed) {
                if (warning) {
                    warning.textContent = 'You can add up to ' + totalAllowed + ' more image(s). Only the first ' + totalAllowed + ' will be used.';
                    warning.style.display = 'block';
                }
                files = files.slice(0, Math.max(0, totalAllowed));
            } else if (warning) {
                warning.style.display = 'none';
            }

            document.querySelectorAll('.new-preview').forEach(function (el) { el.remove(); });

            files.forEach(function (file) {
                if (!file.type.match('image.*')) return;
                var reader = new FileReader();
                reader.onload = function (e) {
                    var item = document.createElement('div');
                    item.className = 'image-preview-item new-preview';
                    item.innerHTML = '<img src="' + e.target.result + '" alt="Preview">';
                    previewGrid.appendChild(item);
                };
                reader.readAsDataURL(file);
            });
        });
    }
})();
