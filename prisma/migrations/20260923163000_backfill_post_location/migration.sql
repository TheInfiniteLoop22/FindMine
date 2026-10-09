-- Data-only migration (no schema change): backfills the PostGIS `location`
-- geography column for every existing Post row that has lat/lng but no
-- location set. This column was never written by application code at
-- create/update time (a real bug, fixed alongside this migration in
-- src/app/api/posts/route.ts and src/app/api/posts/[id]/route.ts), so every
-- post ever created had location = NULL, silently breaking radius search
-- (ST_DWithin/ST_Distance queries filter on `location IS NOT NULL`) and the
-- location-proximity term of the post-matching score for the entire
-- lifetime of this feature.
UPDATE "Post"
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL
  AND lng IS NOT NULL
  AND location IS NULL;
