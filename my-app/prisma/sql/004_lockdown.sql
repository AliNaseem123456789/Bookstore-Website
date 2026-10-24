-- =====================================================================
--  Al-Sehar Bookstore — lock the database down
--
--  The old app shipped the Supabase anon key to the browser and wrote
--  directly from React, so anyone logged in could rewrite any row. The
--  new app talks to Postgres only from the server. This file makes the
--  browser-facing roles powerless, so even if an anon key leaks again
--  it can do nothing.
--
--  Run after 003_integrity.sql.
-- =====================================================================

BEGIN;

-- Row Level Security on, with no policies at all: the anon and
-- authenticated PostgREST roles can read and write nothing. The server
-- connects over DATABASE_URL as the table owner, which bypasses RLS.
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_aliases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE elective_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE restock_batches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys  ENABLE ROW LEVEL SECURITY;

-- Belt and braces: revoke the grants Supabase hands these roles by
-- default, so a future "enable read access" policy added by accident
-- still cannot expose password hashes or rewrite stock.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END
$$;

COMMIT;
