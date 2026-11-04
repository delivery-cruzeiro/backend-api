BEGIN;
ALTER TABLE "Address" ADD COLUMN "geocoding_source" TEXT,
  ADD COLUMN "geocoding_source_version" TEXT, ADD COLUMN "geocoding_quality" JSONB;
CREATE TABLE cnefe_datasets (
  id TEXT PRIMARY KEY, municipality_code TEXT NOT NULL, city_key TEXT NOT NULL,
  state TEXT NOT NULL, version TEXT NOT NULL, checksum TEXT NOT NULL,
  source_url TEXT NOT NULL, reference_year INTEGER NOT NULL,
  record_count INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT false,
  imported_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX cnefe_datasets_municipality_code_checksum_key ON cnefe_datasets(municipality_code, checksum);
CREATE INDEX cnefe_datasets_city_key_state_active_idx ON cnefe_datasets(city_key, state, active);
CREATE UNIQUE INDEX cnefe_datasets_one_active_city ON cnefe_datasets(city_key, state) WHERE active;
CREATE TABLE cnefe_addresses (
  dataset_id TEXT NOT NULL REFERENCES cnefe_datasets(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL, zip_code TEXT NOT NULL, street_key TEXT NOT NULL,
  number_key TEXT NOT NULL, latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL, geo_level INTEGER NOT NULL,
  CONSTRAINT cnefe_addresses_pkey PRIMARY KEY(dataset_id, source_id),
  CONSTRAINT cnefe_address_coordinates CHECK(latitude BETWEEN -34 AND 6 AND longitude BETWEEN -74 AND -34),
  CONSTRAINT cnefe_address_level CHECK(geo_level BETWEEN 1 AND 6)
);
CREATE INDEX cnefe_addresses_dataset_id_zip_code_street_key_number_key_idx
  ON cnefe_addresses(dataset_id, zip_code, street_key, number_key);
-- Public reference data: the runtime may read, never import/alter the source.
ALTER TABLE cnefe_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cnefe_datasets FORCE ROW LEVEL SECURITY;
ALTER TABLE cnefe_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cnefe_addresses FORCE ROW LEVEL SECURITY;
GRANT SELECT ON cnefe_datasets, cnefe_addresses TO delivery_app;
CREATE POLICY public_reference_read ON cnefe_datasets FOR SELECT TO delivery_app USING(true);
CREATE POLICY public_reference_read ON cnefe_addresses FOR SELECT TO delivery_app USING(true);
COMMIT;
