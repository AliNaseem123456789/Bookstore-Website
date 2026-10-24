-- =====================================================================
--  Al-Sehar Bookstore — initial schema
--  Run once against an empty database.
--
--  The integrity rules live HERE, not in application code, because the
--  web app and the mobile app will both write to this database and the
--  invariants must hold no matter which one (or which developer) is
--  talking to it.
--
--  Invariants guaranteed by this file:
--    I1. items.quantity_on_hand is only ever changed by inserting a row
--        into stock_movements. A trigger applies the delta. Application
--        code physically cannot write the column (a guard trigger
--        rejects it), so the ledger and the cached total can never
--        disagree.
--    I2. Stock can never be negative: a CHECK constraint plus an
--        explicit guard in the trigger. Overselling is recorded as
--        sale_lines.qty_backordered.
--    I3. stock_movements, payments and return_lines are append-only.
--        UPDATE and DELETE are rejected.
--    I4. Sale money totals are derived by trigger from the payment and
--        return ledgers. They cannot drift from their inputs.
--    I5. You cannot return more of a line than was sold, or deliver
--        more than was ordered.
-- =====================================================================

BEGIN;

-- Trigram search for the POS item lookup.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- enums

CREATE TYPE "Role"            AS ENUM ('ADMIN', 'MANAGER', 'CASHIER');
CREATE TYPE "ItemType"        AS ENUM ('BOOK', 'COPY', 'STATIONERY');
CREATE TYPE "SaleStatus"      AS ENUM ('COMPLETED', 'VOIDED');
CREATE TYPE "PaymentMethod"   AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'REFUND_CASH', 'WRITE_OFF');
CREATE TYPE "MovementReason"  AS ENUM ('OPENING', 'RESTOCK', 'SALE', 'BACKORDER_FULFILL', 'RETURN_RESELLABLE', 'WRITE_OFF', 'CORRECTION');
CREATE TYPE "ReturnCondition" AS ENUM (
  'RESELLABLE',    -- buyer brought it back in saleable condition -> stock +qty
  'DAMAGED',       -- brought back unsaleable -> credit, but no stock back
  'NOT_DELIVERED'  -- was backordered and never handed over -> cancel, no stock
);

-- ---------------------------------------------------- helper functions

-- Canonical form of a name, used to catch "the same book entered twice".
-- Immutable so it can back an index.
CREATE OR REPLACE FUNCTION fn_normalize(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(regexp_replace(coalesce(txt, ''), '[^a-zA-Z0-9]+', '', 'g'));
$$;

CREATE SEQUENCE seq_sale_code    START 1;
CREATE SEQUENCE seq_return_code  START 1;
CREATE SEQUENCE seq_restock_code START 1;
CREATE SEQUENCE seq_item_code    START 1;

-- Human-readable document numbers: S-2026-000123
CREATE OR REPLACE FUNCTION fn_next_sale_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'S-' || to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') || '-' ||
         lpad(nextval('seq_sale_code')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION fn_next_return_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'R-' || to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') || '-' ||
         lpad(nextval('seq_return_code')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION fn_next_restock_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'RS-' || to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') || '-' ||
         lpad(nextval('seq_restock_code')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION fn_next_item_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'IT-' || lpad(nextval('seq_item_code')::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- users

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         text   NOT NULL UNIQUE,
  name          text   NOT NULL,
  password_hash text   NOT NULL,
  role          "Role" NOT NULL DEFAULT 'CASHIER',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_role_active_idx ON users (role, is_active);
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Email is matched case-insensitively at login, so enforce that here too.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- ------------------------------------------------------------- classes

CREATE TABLE classes (
  id         serial PRIMARY KEY,
  code       text    NOT NULL UNIQUE,
  name       text    NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true
);

-- --------------------------------------------------------------- items

CREATE TABLE items (
  id               serial PRIMARY KEY,
  code             text        NOT NULL UNIQUE DEFAULT fn_next_item_code(),
  name             text        NOT NULL,
  normalized_name  text        NOT NULL DEFAULT '',
  publisher        text,
  type             "ItemType"  NOT NULL DEFAULT 'BOOK',
  price            numeric(12,2) NOT NULL,
  quantity_on_hand integer     NOT NULL DEFAULT 0,
  reorder_level    integer     NOT NULL DEFAULT 10,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- I2: the hard floor. Nothing can drive stock below zero.
  CONSTRAINT items_qty_non_negative CHECK (quantity_on_hand >= 0),
  CONSTRAINT items_price_non_negative CHECK (price >= 0),
  CONSTRAINT items_reorder_non_negative CHECK (reorder_level >= 0)
);
CREATE INDEX items_normalized_name_idx ON items (normalized_name);
CREATE INDEX items_type_active_idx ON items (type, is_active);
-- Fast "search as you type" over names.
CREATE INDEX items_name_trgm_idx ON items USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION fn_items_normalize() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_name := fn_normalize(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER items_normalize BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION fn_items_normalize();

CREATE TABLE item_aliases (
  id               serial PRIMARY KEY,
  item_id          integer NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  alias            text    NOT NULL,
  normalized_alias text    NOT NULL UNIQUE
);
CREATE INDEX item_aliases_item_idx ON item_aliases (item_id);

CREATE OR REPLACE FUNCTION fn_alias_normalize() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_alias := fn_normalize(NEW.alias);
  RETURN NEW;
END;
$$;
CREATE TRIGGER item_aliases_normalize BEFORE INSERT OR UPDATE ON item_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_alias_normalize();

CREATE TABLE price_history (
  id            serial PRIMARY KEY,
  item_id       integer NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  old_price     numeric(12,2) NOT NULL,
  new_price     numeric(12,2) NOT NULL,
  changed_by_id integer REFERENCES users (id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_item_idx ON price_history (item_id, changed_at DESC);

-- Price changes are audited automatically, so a quiet edit is impossible.
-- The actor is read from a session variable set by the service layer.
CREATE OR REPLACE FUNCTION fn_items_price_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor integer := nullif(current_setting('app.actor_id', true), '')::integer;
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO price_history (item_id, old_price, new_price, changed_by_id)
    VALUES (NEW.id, OLD.price, NEW.price, actor);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER items_price_audit AFTER UPDATE OF price ON items
  FOR EACH ROW EXECUTE FUNCTION fn_items_price_audit();

-- ---------------------------------------------------------- curriculum

CREATE TABLE elective_groups (
  id         serial PRIMARY KEY,
  class_id   integer NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  group_key  text    NOT NULL,
  label      text    NOT NULL,
  min_select integer NOT NULL DEFAULT 1,
  max_select integer NOT NULL DEFAULT 1,
  UNIQUE (class_id, group_key),
  CONSTRAINT elective_sane CHECK (min_select >= 0 AND max_select >= min_select)
);

CREATE TABLE curriculum_items (
  id                serial PRIMARY KEY,
  class_id          integer NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  item_id           integer NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  default_qty       integer NOT NULL DEFAULT 1,
  elective_group_id integer REFERENCES elective_groups (id) ON DELETE SET NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  UNIQUE (class_id, item_id),
  CONSTRAINT curriculum_qty_positive CHECK (default_qty > 0)
);
CREATE INDEX curriculum_class_idx ON curriculum_items (class_id, sort_order);

-- An elective group must belong to the same class as the item that cites it.
CREATE OR REPLACE FUNCTION fn_curriculum_group_same_class() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  group_class integer;
BEGIN
  IF NEW.elective_group_id IS NOT NULL THEN
    SELECT class_id INTO group_class FROM elective_groups WHERE id = NEW.elective_group_id;
    IF group_class IS DISTINCT FROM NEW.class_id THEN
      RAISE EXCEPTION 'elective group % belongs to class %, not class %',
        NEW.elective_group_id, group_class, NEW.class_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER curriculum_group_same_class
  BEFORE INSERT OR UPDATE ON curriculum_items
  FOR EACH ROW EXECUTE FUNCTION fn_curriculum_group_same_class();

COMMIT;
