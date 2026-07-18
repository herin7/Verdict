-- Store the user's delivery pincode once (asked in the app profile) so
-- location-gated scrapes (see marketplaces/registry.ts pincodeActions) can
-- set it via Firecrawl actions before extracting a price.

ALTER TABLE payment_profiles ADD COLUMN IF NOT EXISTS pincode text;
