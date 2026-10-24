-- =====================================================================
--  Al-Sehar Bookstore — sales, money and the stock ledger
--  Run after 001_init.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- sales

CREATE TABLE sales (
  id               serial PRIMARY KEY,
  code             text        NOT NULL UNIQUE DEFAULT fn_next_sale_code(),
  buyer_name       text        NOT NULL,
  buyer_phone      text,
  sold_by_user_id  integer     NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status           "SaleStatus" NOT NULL DEFAULT 'COMPLETED',

  -- Written once at checkout, never changed.
  subtotal         numeric(12,2) NOT NULL,
  discount_total   numeric(12,2) NOT NULL DEFAULT 0,
  gross_total      numeric(12,2) NOT NULL,

  -- I4: derived by trigger from the payment and return ledgers.
  return_credit    numeric(12,2) NOT NULL DEFAULT 0,
  amount_received  numeric(12,2) NOT NULL DEFAULT 0,
  amount_refunded  numeric(12,2) NOT NULL DEFAULT 0,
  balance_due      numeric(12,2) NOT NULL DEFAULT 0,
  is_settled       boolean     NOT NULL DEFAULT false,

  note             text,
  sold_at          timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_amounts_non_negative
    CHECK (subtotal >= 0 AND discount_total >= 0 AND gross_total >= 0),
  CONSTRAINT sales_discount_within_subtotal
    CHECK (discount_total <= subtotal)
);
CREATE INDEX sales_sold_at_idx       ON sales (sold_at DESC);
CREATE INDEX sales_seller_idx        ON sales (sold_by_user_id, sold_at DESC);
CREATE INDEX sales_settled_idx       ON sales (is_settled, sold_at DESC);
CREATE INDEX sales_buyer_trgm_idx    ON sales USING gin (buyer_name gin_trgm_ops);

CREATE TABLE sale_lines (
  id                  serial PRIMARY KEY,
  sale_id             integer NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  item_id             integer NOT NULL REFERENCES items (id) ON DELETE RESTRICT,

  -- Snapshots so history never changes when the catalogue does.
  item_name_snapshot  text    NOT NULL,
  unit_price          numeric(12,2) NOT NULL,

  qty                 integer NOT NULL,
  line_discount       numeric(12,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL,

  -- Fulfilment counters. ordered = delivered + backordered + cancelled,
  -- always. Returns are counted separately and can only ever apply to
  -- units the buyer actually received.
  qty_delivered       integer NOT NULL DEFAULT 0,
  qty_backordered     integer NOT NULL DEFAULT 0,
  qty_cancelled       integer NOT NULL DEFAULT 0,
  qty_returned        integer NOT NULL DEFAULT 0,

  class_id            integer REFERENCES classes (id) ON DELETE SET NULL,
  from_full_course    boolean NOT NULL DEFAULT false,

  CONSTRAINT sale_lines_qty_positive CHECK (qty > 0),
  -- I5: the pieces must always add up, and you can never over-return.
  CONSTRAINT sale_lines_fulfilment_balances
    CHECK (qty_delivered + qty_backordered + qty_cancelled = qty),
  CONSTRAINT sale_lines_counters_non_negative
    CHECK (qty_delivered >= 0 AND qty_backordered >= 0
           AND qty_cancelled >= 0 AND qty_returned >= 0),
  -- You cannot return what you were never given.
  CONSTRAINT sale_lines_returned_within_delivered
    CHECK (qty_returned <= qty_delivered),
  CONSTRAINT sale_lines_amounts_non_negative
    CHECK (unit_price >= 0 AND line_discount >= 0 AND line_total >= 0)
);
CREATE INDEX sale_lines_sale_idx        ON sale_lines (sale_id);
CREATE INDEX sale_lines_item_idx        ON sale_lines (item_id);
CREATE INDEX sale_lines_backorder_idx   ON sale_lines (qty_backordered)
  WHERE qty_backordered > 0;

-- ------------------------------------------------------------- returns

CREATE TABLE sale_returns (
  id            serial PRIMARY KEY,
  code          text    NOT NULL UNIQUE DEFAULT fn_next_return_code(),
  sale_id       integer NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  created_by_id integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason        text,
  credit_total  numeric(12,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_returns_sale_idx ON sale_returns (sale_id);
CREATE INDEX sale_returns_created_idx ON sale_returns (created_at DESC);

CREATE TABLE return_lines (
  id            serial PRIMARY KEY,
  return_id     integer NOT NULL REFERENCES sale_returns (id) ON DELETE RESTRICT,
  sale_line_id  integer NOT NULL REFERENCES sale_lines (id) ON DELETE RESTRICT,
  qty           integer NOT NULL,
  refund_amount numeric(12,2) NOT NULL,
  condition     "ReturnCondition" NOT NULL DEFAULT 'RESELLABLE',

  CONSTRAINT return_lines_qty_positive CHECK (qty > 0),
  CONSTRAINT return_lines_refund_non_negative CHECK (refund_amount >= 0)
);
CREATE INDEX return_lines_return_idx ON return_lines (return_id);
CREATE INDEX return_lines_sale_line_idx ON return_lines (sale_line_id);

-- -------------------------------------------------------------- money

CREATE TABLE payments (
  id                   serial PRIMARY KEY,
  sale_id              integer NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  -- Signed: positive = money in, negative = money handed back.
  amount               numeric(12,2) NOT NULL,
  method               "PaymentMethod" NOT NULL DEFAULT 'CASH',
  received_by_user_id  integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  return_id            integer REFERENCES sale_returns (id) ON DELETE RESTRICT,
  note                 text,
  received_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payments_amount_non_zero CHECK (amount <> 0),
  -- Money out must be labelled as such, and money in must not be.
  CONSTRAINT payments_sign_matches_method CHECK (
    (method IN ('REFUND_CASH', 'WRITE_OFF') AND amount < 0)
    OR (method IN ('CASH', 'CARD', 'BANK_TRANSFER') AND amount > 0)
  )
);
CREATE INDEX payments_sale_idx     ON payments (sale_id);
CREATE INDEX payments_received_idx ON payments (received_at DESC);
CREATE INDEX payments_cashier_idx  ON payments (received_by_user_id, received_at DESC);

-- ------------------------------------------------------- stock ledger

CREATE TABLE stock_movements (
  id                  serial PRIMARY KEY,
  -- RESTRICT, not CASCADE: an item with stock history can never be
  -- deleted, only deactivated. Cascading here would attempt a DELETE on
  -- this append-only table and fail with a confusing error.
  item_id             integer NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  delta               integer NOT NULL,
  reason              "MovementReason" NOT NULL,
  ref_type            text,
  ref_id              integer,
  -- Stamped by the trigger below; never supplied by the caller.
  balance_after       integer NOT NULL DEFAULT 0,
  -- Likewise: a user who has moved stock is deactivated, never deleted.
  created_by_user_id  integer REFERENCES users (id) ON DELETE RESTRICT,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stock_movements_delta_non_zero CHECK (delta <> 0)
);
CREATE INDEX stock_movements_item_idx   ON stock_movements (item_id, created_at DESC);
CREATE INDEX stock_movements_reason_idx ON stock_movements (reason, created_at DESC);
CREATE INDEX stock_movements_ref_idx    ON stock_movements (ref_type, ref_id);

CREATE TABLE restock_batches (
  id              serial PRIMARY KEY,
  code            text    NOT NULL UNIQUE DEFAULT fn_next_restock_code(),
  received_by_id  integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  supplier        text,
  note            text,
  total_units     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restock_batches_created_idx ON restock_batches (created_at DESC);

-- ----------------------------------------------------------- plumbing

CREATE TABLE audit_log (
  id            serial PRIMARY KEY,
  actor_user_id integer REFERENCES users (id) ON DELETE SET NULL,
  action        text    NOT NULL,
  entity_type   text    NOT NULL,
  entity_id     text,
  summary       text,
  before        jsonb,
  after         jsonb,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_action_idx  ON audit_log (action, created_at DESC);
CREATE INDEX audit_log_entity_idx  ON audit_log (entity_type, entity_id);

CREATE TABLE idempotency_keys (
  key          text PRIMARY KEY,
  endpoint     text NOT NULL,
  request_hash text NOT NULL,
  status_code  integer NOT NULL,
  response     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at);

COMMIT;
