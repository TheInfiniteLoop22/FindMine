-- Production hardening (no data is changed):
--  1. Give the PostGIS / pgvector columns real types. The baseline migration
--     declared them as bare `geography` / `vector`, and pgvector cannot build an
--     ANN index on a column without a fixed dimension.
--  2. Add the indexes that were only ever described in scripts/ and never applied:
--     GiST for radius search, HNSW (cosine) for the embeddings, trigram GIN for the
--     LIKE '%q%' text search.
--  3. Make "one active claim per user per post" a database guarantee instead of a
--     check-then-insert in the route.
--  4. Drop the legacy SHOW_PHONE contact mode (the phone data model was removed;
--     no rows use it).
--
-- Requires the postgis and vector extensions to already exist (the baseline
-- migration also depends on them); pg_trgm is created here.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Typed columns
ALTER TABLE "Post" ALTER COLUMN "location" TYPE geography(Point, 4326);
ALTER TABLE "Post" ALTER COLUMN "imageEmbedding" TYPE vector(512);
ALTER TABLE "Post" ALTER COLUMN "textEmbedding" TYPE vector(384);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS "Post_location_gist_idx" ON "Post" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Post_imageEmbedding_hnsw_idx" ON "Post" USING hnsw ("imageEmbedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Post_textEmbedding_hnsw_idx" ON "Post" USING hnsw ("textEmbedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Post_title_trgm_idx" ON "Post" USING GIN (lower("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Post_description_trgm_idx" ON "Post" USING GIN (lower("description") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Post_locationText_trgm_idx" ON "Post" USING GIN (lower("locationText") gin_trgm_ops);

-- 3. At most one PENDING/APPROVED claim per (post, claimant)
CREATE UNIQUE INDEX IF NOT EXISTS "Claim_active_per_claimant_key"
  ON "Claim" ("postId", "claimantId")
  WHERE "status" IN ('PENDING', 'APPROVED');

-- 4. Remove ContactMode.SHOW_PHONE
ALTER TYPE "ContactMode" RENAME TO "ContactMode_old";
CREATE TYPE "ContactMode" AS ENUM ('SHOW_EMAIL', 'RELAY_ONLY');
ALTER TABLE "RegisteredItem" ALTER COLUMN "contactMode" DROP DEFAULT;
ALTER TABLE "RegisteredItem" ALTER COLUMN "contactMode" TYPE "ContactMode" USING ("contactMode"::text::"ContactMode");
ALTER TABLE "RegisteredItem" ALTER COLUMN "contactMode" SET DEFAULT 'RELAY_ONLY';
DROP TYPE "ContactMode_old";
