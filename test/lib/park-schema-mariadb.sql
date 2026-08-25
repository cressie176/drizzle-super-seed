CREATE TABLE parks (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  region VARCHAR(40) NOT NULL,
  opened_at DATETIME NOT NULL,
  latitude DOUBLE NULL,
  amenities JSON NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE owners (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  member_since DATETIME NOT NULL,
  loyalty_points BIGINT NOT NULL DEFAULT 0,
  referred_by_owner_id INT NULL,
  CONSTRAINT owners_referred_by_fk FOREIGN KEY (referred_by_owner_id) REFERENCES owners (id)
);

CREATE TABLE pitches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  reference VARCHAR(20) NOT NULL,
  area_sqm DOUBLE NULL,
  has_electricity BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT pitches_park_fk FOREIGN KEY (park_id) REFERENCES parks (id)
);

CREATE TABLE holiday_homes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pitch_id BIGINT UNSIGNED NOT NULL,
  owner_id INT NOT NULL,
  model TEXT NOT NULL,
  purchase_price DECIMAL(10, 2) NULL,
  specification JSON NULL,
  inspected_at DATETIME NULL,
  CONSTRAINT holiday_homes_pitch_fk FOREIGN KEY (pitch_id) REFERENCES pitches (id),
  CONSTRAINT holiday_homes_owner_fk FOREIGN KEY (owner_id) REFERENCES owners (id)
);

CREATE TABLE accessories (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  holiday_home_id BIGINT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  quantity SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT accessories_home_fk FOREIGN KEY (holiday_home_id) REFERENCES holiday_homes (id)
);

CREATE TABLE lettings (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  holiday_home_id BIGINT UNSIGNED NOT NULL,
  guest_name VARCHAR(200) NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  start_date DATETIME NOT NULL,
  arrival_time TIME NOT NULL,
  site_fee DECIMAL(8, 2) NOT NULL,
  notes TEXT NULL,
  CONSTRAINT lettings_home_fk FOREIGN KEY (holiday_home_id) REFERENCES holiday_homes (id),
  CONSTRAINT lettings_holiday_home_id_start_date_key UNIQUE (holiday_home_id, start_date)
);

CREATE TABLE park_owners (
  park_id INT NOT NULL,
  owner_id INT NOT NULL,
  CONSTRAINT park_owners_park_id_owner_id_pk PRIMARY KEY (park_id, owner_id),
  CONSTRAINT park_owners_park_fk FOREIGN KEY (park_id) REFERENCES parks (id),
  CONSTRAINT park_owners_owner_fk FOREIGN KEY (owner_id) REFERENCES owners (id)
);
