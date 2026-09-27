-- =====================================================
-- HotelBook — Database Schema & Seed Data
-- =====================================================
-- Import with:
--   mysql -u root -p < database.sql
-- or via phpMyAdmin: Import this file.
-- =====================================================

CREATE DATABASE IF NOT EXISTS hotel_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hotel_booking;

-- ---------------------------------------------------
-- Table: hotels
-- ---------------------------------------------------
DROP TABLE IF EXISTS hotel_images;
DROP TABLE IF EXISTS hotels;

CREATE TABLE hotels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    location VARCHAR(255),
    address TEXT,
    description TEXT,
    price DECIMAL(10,2),
    rating DECIMAL(2,1),
    phone VARCHAR(30) NOT NULL,
    amenities TEXT,
    check_in VARCHAR(50),
    check_out VARCHAR(50),
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_location (location),
    INDEX idx_name (name),
    INDEX idx_slug (slug)
) ENGINE=InnoDB;

-- ---------------------------------------------------
-- Table: hotel_images
-- ---------------------------------------------------
CREATE TABLE hotel_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    is_primary TINYINT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------
-- Table: admin_users
-- ---------------------------------------------------
DROP TABLE IF EXISTS admin_users;

CREATE TABLE admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Default admin account:
--   username: admin
--   password: Admin@123
-- (Hash generated with PHP password_hash('Admin@123', PASSWORD_DEFAULT); verified to match)
INSERT INTO admin_users (username, password, full_name) VALUES
('admin', '$2y$10$EJsfewsRJs2yVKwRMjgUG.Q4p0AlSNZmckmyuamQkBzS1.HfSPCiK', 'Site Administrator');
-- If you ever need a fresh hash, run:
--   php -r "echo password_hash('Admin@123', PASSWORD_DEFAULT);"
-- and UPDATE admin_users SET password = '<new-hash>' WHERE username = 'admin';

-- ---------------------------------------------------
-- Table: contact_messages (optional contact form storage)
-- ---------------------------------------------------
DROP TABLE IF EXISTS contact_messages;

CREATE TABLE contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =====================================================
-- DUMMY HOTEL DATA (10 hotels)
-- =====================================================

INSERT INTO hotels (name, slug, location, address, description, price, rating, phone, amenities, check_in, check_out, status) VALUES
('Grand Palace Hotel', 'grand-palace-hotel-gurgaon', 'Gurgaon, Haryana', 'Sector 29, MG Road, Gurgaon, Haryana 122001', 'A luxurious stay in the heart of Gurgaon offering spacious rooms, modern amenities, and warm hospitality just minutes from the city''s business hub.', 2499.00, 4.7, '+919876543210', 'Free WiFi,Air Conditioning,Swimming Pool,Restaurant,Room Service,Parking,Gym,Power Backup', '12:00 PM', '11:00 AM', 1),
('Royal Heritage Hotel', 'royal-heritage-hotel-jaipur', 'Jaipur, Rajasthan', 'Amer Road, Near City Palace, Jaipur, Rajasthan 302002', 'Experience royal Rajasthani hospitality with heritage architecture, courtyard dining, and easy access to Jaipur''s famous forts and palaces.', 3299.00, 4.6, '+919876543211', 'Free WiFi,Air Conditioning,Restaurant,Heritage Decor,Parking,Room Service,Garden', '01:00 PM', '11:00 AM', 1),
('Lake View Residency', 'lake-view-residency-udaipur', 'Udaipur, Rajasthan', 'Lake Pichola Road, Udaipur, Rajasthan 313001', 'Wake up to stunning lake views at this cozy residency, perfectly located near Udaipur''s iconic ghats and palaces.', 2799.00, 4.5, '+919876543212', 'Free WiFi,Lake View,Restaurant,Air Conditioning,Room Service,Parking', '12:00 PM', '10:00 AM', 1),
('City Comfort Hotel', 'city-comfort-hotel-delhi', 'Delhi', 'Karol Bagh, New Delhi, Delhi 110005', 'A budget-friendly yet comfortable hotel in central Delhi, ideal for business travelers and tourists alike.', 1899.00, 4.2, '+919876543213', 'Free WiFi,Air Conditioning,24-Hour Front Desk,Restaurant,Parking', '12:00 PM', '11:00 AM', 1),
('Ocean Pearl Resort', 'ocean-pearl-resort-goa', 'Goa', 'Calangute Beach Road, North Goa, Goa 403516', 'A beachside resort with a sparkling pool, vibrant nightlife nearby, and rooms just steps away from the golden sands of Calangute.', 4599.00, 4.8, '+919876543214', 'Free WiFi,Swimming Pool,Beach Access,Bar,Restaurant,Air Conditioning,Spa', '02:00 PM', '11:00 AM', 1),
('Mountain View Stay', 'mountain-view-stay-manali', 'Manali, Himachal Pradesh', 'Mall Road, Manali, Himachal Pradesh 175131', 'Surrounded by snow-capped peaks, this cozy mountain stay offers bonfire evenings, valley views, and a peaceful escape from city life.', 2199.00, 4.6, '+919876543215', 'Free WiFi,Mountain View,Bonfire Area,Restaurant,Room Heater,Parking', '12:00 PM', '10:00 AM', 1),
('The Urban Nest', 'the-urban-nest-bangalore', 'Bangalore, Karnataka', 'MG Road, Bangalore, Karnataka 560001', 'A modern boutique hotel in the tech capital, offering stylish interiors, fast WiFi, and a rooftop cafe with skyline views.', 2999.00, 4.4, '+919876543216', 'Free WiFi,Rooftop Cafe,Air Conditioning,Gym,Work Desk,Parking', '01:00 PM', '11:00 AM', 1),
('Royal Orchid Stay', 'royal-orchid-stay-mumbai', 'Mumbai, Maharashtra', 'Andheri West, Mumbai, Maharashtra 400058', 'Conveniently located near Mumbai''s airport, this stay combines elegant decor with quick access to the city''s business and entertainment districts.', 3799.00, 4.5, '+919876543217', 'Free WiFi,Air Conditioning,Restaurant,Airport Shuttle,Room Service,Gym', '02:00 PM', '11:00 AM', 1),
('Sunrise Backwater Inn', 'sunrise-backwater-inn-kochi', 'Kochi, Kerala', 'Fort Kochi, Ernakulam, Kerala 682001', 'A tranquil backwater-facing inn offering authentic Kerala cuisine, houseboat tour bookings, and serene sunset views.', 2599.00, 4.6, '+919876543218', 'Free WiFi,Backwater View,Restaurant,Air Conditioning,Houseboat Assistance,Parking', '12:00 PM', '10:00 AM', 1),
('Heritage Fort Stay', 'heritage-fort-stay-jodhpur', 'Jodhpur, Rajasthan', 'Near Mehrangarh Fort, Jodhpur, Rajasthan 342001', 'A charming heritage property nestled beneath the majestic Mehrangarh Fort, blending old-world charm with modern comforts.', 3099.00, 4.7, '+919876543219', 'Free WiFi,Fort View,Restaurant,Air Conditioning,Rooftop Dining,Parking', '01:00 PM', '11:00 AM', 1);

-- =====================================================
-- DUMMY HOTEL IMAGES (using picsum/unsplash-style placeholder demo images)
-- Each hotel gets 5 images: exterior, room, lobby, pool/restaurant, bathroom
-- =====================================================

INSERT INTO hotel_images (hotel_id, image_path, is_primary, sort_order) VALUES
-- Grand Palace Hotel (id 1)
(1, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80', 1, 1),
(1, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80', 0, 2),
(1, 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200&q=80', 0, 3),
(1, 'https://images.unsplash.com/photo-1544124499-58912cbddaad?w=1200&q=80', 0, 4),
(1, 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200&q=80', 0, 5),
-- Royal Heritage Hotel (id 2)
(2, 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80', 1, 1),
(2, 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80', 0, 2),
(2, 'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=1200&q=80', 0, 3),
(2, 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80', 0, 4),
-- Lake View Residency (id 3)
(3, 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80', 1, 1),
(3, 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1200&q=80', 0, 2),
(3, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200&q=80', 0, 3),
(3, 'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1200&q=80', 0, 4),
-- City Comfort Hotel (id 4)
(4, 'https://images.unsplash.com/photo-1455587734955-081b22074882?w=1200&q=80', 1, 1),
(4, 'https://images.unsplash.com/photo-1541971875076-8f970d573be6?w=1200&q=80', 0, 2),
(4, 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=1200&q=80', 0, 3),
-- Ocean Pearl Resort (id 5)
(5, 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80', 1, 1),
(5, 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80', 0, 2),
(5, 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&q=80', 0, 3),
(5, 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1200&q=80', 0, 4),
(5, 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200&q=80', 0, 5),
(5, 'https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=1200&q=80', 0, 6),
-- Mountain View Stay (id 6)
(6, 'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?w=1200&q=80', 1, 1),
(6, 'https://images.unsplash.com/photo-1587381420270-3e1a5b9e6904?w=1200&q=80', 0, 2),
(6, 'https://images.unsplash.com/photo-1499696010180-025ef6e1a8f9?w=1200&q=80', 0, 3),
(6, 'https://images.unsplash.com/photo-1519821172141-b5d8342f30bf?w=1200&q=80', 0, 4),
-- The Urban Nest (id 7)
(7, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80', 1, 1),
(7, 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200&q=80', 0, 2),
(7, 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80', 0, 3),
(7, 'https://images.unsplash.com/photo-1587985064135-0366536eab42?w=1200&q=80', 0, 4),
-- Royal Orchid Stay (id 8)
(8, 'https://images.unsplash.com/photo-1587874522486-1ac9f3d7f8d8?w=1200&q=80', 1, 1),
(8, 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80', 0, 2),
(8, 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200&q=80', 0, 3),
-- Sunrise Backwater Inn (id 9)
(9, 'https://images.unsplash.com/photo-1602391833977-358a52198938?w=1200&q=80', 1, 1),
(9, 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200&q=80', 0, 2),
(9, 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80', 0, 3),
(9, 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=1200&q=80', 0, 4),
-- Heritage Fort Stay (id 10)
(10, 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80', 1, 1),
(10, 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80', 0, 2),
(10, 'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=1200&q=80', 0, 3),
(10, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80', 0, 4);
