BEGIN;
INSERT INTO coupons (id,code,discount_type,discount_value,applicable_plans,max_uses,used_count,expires_at,is_active,created_at) VALUES
('802d2b6b-03e7-5a00-bf40-793c1c8d9fb2','WELCOME50','percent',50,'["monthly"]',1000,0,'2026-10-01T12:00:00+00:00',TRUE,'2026-06-03T12:00:00+00:00'),
('355dbcaf-3248-5fab-b21b-ae1f01a76ddd','FIRST100','flat',100,'["monthly","quarterly"]',500,0,'2026-09-01T12:00:00+00:00',TRUE,'2026-06-03T12:00:00+00:00'),
('755e9637-e5be-5de0-b7fb-bb1b1b6eed9e','SUMMER25','percent',25,'["quarterly","annual"]',2000,0,'2026-08-17T12:00:00+00:00',TRUE,'2026-06-23T12:00:00+00:00'),
('c0620745-d249-57a8-975c-1802a1b5fd6f','REFER200','flat',200,'["annual"]',300,0,'2026-10-31T12:00:00+00:00',TRUE,'2026-06-28T12:00:00+00:00') ON CONFLICT DO NOTHING;
UPDATE coupons SET applicable_plans = applicable_plans::jsonb;
COMMIT;