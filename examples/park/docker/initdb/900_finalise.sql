BEGIN;
SELECT setval(pg_get_serial_sequence('"public"."parks"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "public"."parks"));
SELECT setval(pg_get_serial_sequence('"public"."pitches"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "public"."pitches"));
SELECT setval(pg_get_serial_sequence('"public"."holiday_homes"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "public"."holiday_homes"));
SELECT setval(pg_get_serial_sequence('"public"."lettings"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "public"."lettings"));
SELECT setval(pg_get_serial_sequence('"public"."lettings"', 'holiday_home_id'), (SELECT COALESCE(MAX("holiday_home_id"), 1) FROM "public"."lettings"));
COMMIT;
ANALYZE;
