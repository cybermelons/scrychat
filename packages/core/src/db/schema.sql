-- scrychat local SQLite mirror schema. All statements must be idempotent
-- (CREATE TABLE/INDEX IF NOT EXISTS) since connection.ts applies this file
-- on every openDb() call.

CREATE TABLE IF NOT EXISTS cards (
  oracle_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mana_cost TEXT,
  cmc REAL,
  type_line TEXT,
  oracle_text TEXT,
  colors TEXT,
  color_identity TEXT,
  ci_mask INTEGER,
  power TEXT,
  toughness TEXT,
  keywords TEXT,
  layout TEXT,
  is_commander INTEGER,
  legal_commander INTEGER,
  rarity TEXT,
  edhrec_rank INTEGER,
  price_usd REAL,
  image TEXT,
  scryfall_uri TEXT,
  arena INTEGER,
  arena_id INTEGER,
  brawl TEXT,
  standardbrawl TEXT,
  historic TEXT,
  timeless TEXT,
  produced_mana TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  name,
  type_line,
  oracle_text,
  content='cards',
  content_rowid='rowid'
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  label TEXT,
  description TEXT,
  is_functional INTEGER,
  source TEXT
);

CREATE TABLE IF NOT EXISTS tag_parents (
  tag_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  PRIMARY KEY (tag_id, parent_id)
);

CREATE TABLE IF NOT EXISTS tag_closure (
  tag_id TEXT NOT NULL,
  ancestor_id TEXT NOT NULL,
  PRIMARY KEY (tag_id, ancestor_id)
);

CREATE TABLE IF NOT EXISTS tag_aliases (
  alias TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_tags (
  oracle_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  weight INTEGER,
  source TEXT,
  PRIMARY KEY (oracle_id, tag_id)
);

CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  identity TEXT,
  ci_mask INTEGER,
  status TEXT,
  description TEXT,
  card_count INTEGER,
  popularity INTEGER,
  price_usd REAL
);

CREATE TABLE IF NOT EXISTS combo_cards (
  combo_id TEXT NOT NULL,
  oracle_id TEXT NOT NULL,
  PRIMARY KEY (combo_id, oracle_id)
);

CREATE TABLE IF NOT EXISTS combo_produces (
  combo_id TEXT NOT NULL,
  feature TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cards_ci_mask ON cards(ci_mask);
CREATE INDEX IF NOT EXISTS idx_cards_price_usd ON cards(price_usd);
CREATE INDEX IF NOT EXISTS idx_cards_edhrec_rank ON cards(edhrec_rank);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag_id ON card_tags(tag_id);
