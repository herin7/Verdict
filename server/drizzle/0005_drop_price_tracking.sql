-- Verdict no longer tracks prices or monitors marketplaces. Drop the tables
-- that only existed for buy links, scraped offers, payment/pincode profiles
-- and shopping missions.

DROP TABLE IF EXISTS shopping_missions;
DROP TABLE IF EXISTS marketplace_offers;
DROP TABLE IF EXISTS buy_links;
DROP TABLE IF EXISTS payment_profiles;
