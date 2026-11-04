-- Public demo databases only: run once as the owner role, after migrating and seeding.
-- Lets the running app reset and reseed this database when DEMO_MODE=true (ADR-051). It empties
-- every data table on each reset, so never run this on a database that holds anything you need.
UPDATE demo_state SET reset_enabled = true, last_reset_at = clock_timestamp() WHERE id = 1;
