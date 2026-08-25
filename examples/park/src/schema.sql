CREATE TYPE letting_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE parks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  region VARCHAR(40) NOT NULL,
  opened_at DATE NOT NULL,
  latitude DOUBLE PRECISION,
  amenities JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE pitches (
  id SERIAL PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks (id),
  reference VARCHAR(20) NOT NULL,
  monthly_fee NUMERIC(8, 2) NOT NULL
);

CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  member_since DATE NOT NULL,
  referred_by_owner_id UUID REFERENCES owners (id)
);

CREATE TABLE holiday_homes (
  id BIGSERIAL PRIMARY KEY,
  pitch_id INTEGER NOT NULL REFERENCES pitches (id),
  owner_id UUID NOT NULL REFERENCES owners (id),
  model TEXT NOT NULL
);

CREATE TABLE lettings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  holiday_home_id BIGINT NOT NULL REFERENCES holiday_homes (id),
  guest_name VARCHAR(200) NOT NULL,
  status letting_status NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  cleaning_fee NUMERIC(8, 2) NOT NULL
);
