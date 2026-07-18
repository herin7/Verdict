-- Store currency/country alongside each cached report so a report generated
-- for one country's currency is never silently served to a user in the other
-- (see services/research.ts cache-hit currency check).

ALTER TABLE reports ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS country text;
