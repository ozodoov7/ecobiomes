-- Ecobiome CMS — SQLite schema
PRAGMA foreign_keys = ON;

-- ---------- Auth ----------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','editor')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL
);

-- ---------- Site-wide ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON
);
CREATE TABLE IF NOT EXISTS pages (
  slug            TEXT PRIMARY KEY,  -- home, research, people, projects, publications, news, services
  breadcrumb      TEXT NOT NULL DEFAULT '',
  hero_title      TEXT NOT NULL DEFAULT '',
  hero_lede       TEXT NOT NULL DEFAULT '',
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  og_title        TEXT NOT NULL DEFAULT '',
  og_description  TEXT NOT NULL DEFAULT '',
  og_image        TEXT NOT NULL DEFAULT '',
  cta_enabled     INTEGER NOT NULL DEFAULT 0,
  cta_eyebrow     TEXT NOT NULL DEFAULT '',
  cta_title       TEXT NOT NULL DEFAULT '',
  cta_label       TEXT NOT NULL DEFAULT '',
  cta_url         TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Single-instance content sections (section heads, intro texts, labels)
CREATE TABLE IF NOT EXISTS blocks (
  key        TEXT PRIMARY KEY,       -- home_info, home_about, research_facilities, ...
  page       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',   -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Collections (all have sort + status) ----------
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'header' CHECK (location IN ('header','header_button','footer_1','footer_2')),
  label TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hero_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '', focus TEXT NOT NULL DEFAULT '',
  eyebrow TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
  btn1_label TEXT NOT NULL DEFAULT '', btn1_url TEXT NOT NULL DEFAULT '',
  btn2_label TEXT NOT NULL DEFAULT '', btn2_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS explore_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', link_label TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS research_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', questions TEXT NOT NULL DEFAULT '[]',
  methods TEXT NOT NULL DEFAULT '', current_focus TEXT NOT NULL DEFAULT '', related_projects TEXT NOT NULL DEFAULT '',
  link_label TEXT NOT NULL DEFAULT '', link_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', specs TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collab_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collab_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collab_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, initials TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '', photo_alt TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT 'core' CHECK (grp IN ('pi','core','doctoral','technical')),
  bio TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
  email TEXT NOT NULL DEFAULT '', orcid TEXT NOT NULL DEFAULT '', scholar_url TEXT NOT NULL DEFAULT '', scopus_url TEXT NOT NULL DEFAULT '', links TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, badge TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed')),
  year_start INTEGER, year_end INTEGER,
  overview TEXT NOT NULL DEFAULT '', question TEXT NOT NULL DEFAULT '', objectives TEXT NOT NULL DEFAULT '',
  methods TEXT NOT NULL DEFAULT '', study_system TEXT NOT NULL DEFAULT '', outcomes TEXT NOT NULL DEFAULT '',
  related_label TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
  image TEXT NOT NULL DEFAULT '', image_alt TEXT NOT NULL DEFAULT '',
  link_label TEXT NOT NULL DEFAULT '', link_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_people (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, person_id)
);
CREATE TABLE IF NOT EXISTS pub_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', year INTEGER NOT NULL,
  journal TEXT NOT NULL DEFAULT '', volume TEXT NOT NULL DEFAULT '', issue TEXT NOT NULL DEFAULT '', pages TEXT NOT NULL DEFAULT '',
  doi TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', pdf TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'news' CHECK (kind IN ('news','event')),
  label TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '', cover_alt TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  og_title TEXT NOT NULL DEFAULT '', og_description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_label TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '', applications TEXT NOT NULL DEFAULT '',
  request_label TEXT NOT NULL DEFAULT '', request_url TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Media, messages, history ----------
CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  file          TEXT NOT NULL,         -- public URL of the main file (/uploads/...)
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  width         INTEGER, height INTEGER,
  alt           TEXT NOT NULL DEFAULT '',
  variants      TEXT NOT NULL DEFAULT '{}',   -- JSON {sm, md, lg}
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL, email TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL DEFAULT '', message TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,      -- table name, 'block', 'page', 'settings'
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL,      -- create | update | delete | restore
  label      TEXT NOT NULL DEFAULT '',
  snapshot   TEXT NOT NULL,      -- JSON of the record AFTER the action (BEFORE for delete)
  user_id    INTEGER, user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity, entity_id);

-- Old slugs of renamed records → 301 redirect to the current URL
CREATE TABLE IF NOT EXISTS slug_redirects (
  entity    TEXT NOT NULL,
  old_slug  TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  PRIMARY KEY (entity, old_slug)
);

-- ---------- Multilingual (ready, not yet used by the UI) ----------
-- Base columns hold the default language (settings.default_language).
-- Other languages are stored here per field and read with a fallback to the base value.
CREATE TABLE IF NOT EXISTS translations (
  entity    TEXT NOT NULL,   -- table name or 'block' / 'page' / 'settings'
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  lang      TEXT NOT NULL,   -- 'uz', 'ru', ...
  value     TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id, field, lang)
);
