import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function applyPostGISMigration() {
  console.log("Applying PostGIS extension, trigger, and index migration...");

  // 1. Enable PostGIS Extension
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  console.log("✓ PostGIS extension enabled.");

  // 2. Add location column if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Post' AND column_name='location'
      ) THEN
        ALTER TABLE "Post" ADD COLUMN location geography(Point, 4326);
      END IF;
    END $$;
  `);
  console.log("✓ Location geography column created.");

  // 3. Create or replace sync function
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION sync_post_location() RETURNS trigger AS $$
    BEGIN
      IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      ELSE
        NEW.location := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log("✓ Location sync function created.");

  // 4. Create trigger
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'post_location_sync'
      ) THEN
        CREATE TRIGGER post_location_sync
        BEFORE INSERT OR UPDATE ON "Post"
        FOR EACH ROW EXECUTE FUNCTION sync_post_location();
      END IF;
    END $$;
  `);
  console.log("✓ Post location trigger created.");

  // 5. Create GIST index
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS post_location_idx ON "Post" USING GIST (location);
  `);
  console.log("✓ GIST spatial index created.");

  // 6. Backfill existing rows that have lat/lng set
  await prisma.$executeRawUnsafe(`
    UPDATE "Post"
    SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;
  `);
  console.log("✓ Existing posts backfilled with PostGIS geography points.");

  console.log("PostGIS migration completed successfully!");
}

applyPostGISMigration()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
