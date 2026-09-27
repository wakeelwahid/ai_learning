-- Drop and recreate battle tables to pick up new columns.
-- Run against edtech_battle database.
-- WARNING: destroys all existing battle data.

DROP TABLE IF EXISTS battle_stats CASCADE;
DROP TABLE IF EXISTS battle_participants CASCADE;
DROP TABLE IF EXISTS battles CASCADE;

-- Drop enum types so SQLAlchemy can recreate them cleanly
DO $$ BEGIN
  DROP TYPE IF EXISTS battletype CASCADE;
  DROP TYPE IF EXISTS battlestatus CASCADE;
  DROP TYPE IF EXISTS participantstatus CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
