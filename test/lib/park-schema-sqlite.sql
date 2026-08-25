CREATE TABLE parks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  latitude REAL,
  amenities TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pitches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  park_id INTEGER NOT NULL REFERENCES parks (id),
  reference TEXT NOT NULL,
  area_sqm REAL,
  has_electricity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  member_since INTEGER NOT NULL,
  loyalty_points BLOB,
  referred_by_owner_id INTEGER REFERENCES owners (id)
);

CREATE TABLE holiday_homes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pitch_id INTEGER NOT NULL REFERENCES pitches (id),
  owner_id INTEGER NOT NULL REFERENCES owners (id),
  model TEXT NOT NULL,
  purchase_price TEXT,
  specification TEXT,
  inspected_at INTEGER
);

CREATE TABLE lettings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_home_id INTEGER NOT NULL REFERENCES holiday_homes (id),
  guest_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  start_date INTEGER NOT NULL,
  site_fee REAL NOT NULL,
  notes TEXT,
  CONSTRAINT lettings_holiday_home_id_start_date_key UNIQUE (holiday_home_id, start_date)
);

CREATE TABLE park_owners (
  park_id INTEGER NOT NULL REFERENCES parks (id),
  owner_id INTEGER NOT NULL REFERENCES owners (id),
  PRIMARY KEY (park_id, owner_id)
);
