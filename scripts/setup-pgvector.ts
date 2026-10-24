import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function applyPgVectorMigration() {
  console.log("Applying pgvector extension, columns, and index migration...");

  // 1. Enable pgvector Extension
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  console.log("✓ pgvector extension enabled.");

  // 2. Add imageEmbedding column if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Post' AND column_name='imageEmbedding'
      ) THEN
        ALTER TABLE "Post" ADD COLUMN "imageEmbedding" vector(512);
      END IF;
    END $$;
  `);
  console.log("✓ imageEmbedding column created.");

  // 3. Add textEmbedding column if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Post' AND column_name='textEmbedding'
      ) THEN
        ALTER TABLE "Post" ADD COLUMN "textEmbedding" vector(384);
      END IF;
    END $$;
  `);
  console.log("✓ textEmbedding column created.");

  // 4. Create GIST or IVFFLAT indices for cosine similarity search
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS post_image_embedding_idx ON "Post"
    USING ivfflat ("imageEmbedding" vector_cosine_ops) WITH (lists = 100);
  `);
  console.log("✓ imageEmbedding IVFFlat index created.");

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS post_text_embedding_idx ON "Post"
    USING ivfflat ("textEmbedding" vector_cosine_ops) WITH (lists = 100);
  `);
  console.log("✓ textEmbedding IVFFlat index created.");

  console.log("pgvector SQL migration completed successfully!");
}

applyPgVectorMigration()
  .catch((e) => {
    console.error("PgVector Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
