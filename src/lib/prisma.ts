import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Verify the DB server's TLS certificate instead of accepting any
// certificate (rejectUnauthorized: false is a MITM gap). Supabase's pooler
// cert is signed by their own CA, not a publicly-trusted one, so Node's
// default trust store can't validate it without the CA file below
// (Dashboard > Project Settings > Database > SSL Configuration). Neon (and
// most other managed Postgres providers) sign with a publicly-trusted CA,
// so Node's default trust store already verifies them - no extra file needed.
const connectionString = process.env.DATABASE_URL || '';
const isSupabase = /supabase\.(co|com)/.test(connectionString);

const caCertPath = path.join(process.cwd(), 'certs', 'supabase-ca.crt');
const caCert = fs.existsSync(caCertPath) ? fs.readFileSync(caCertPath, 'utf8') : undefined;

if (isSupabase && !caCert && process.env.NODE_ENV === 'production') {
  throw new Error(
    `Missing ${caCertPath} - required to verify the database TLS certificate in production. ` +
    `Download it from Supabase Dashboard > Project Settings > Database > SSL Configuration.`
  );
}

const pool = new Pool({
  connectionString,
  ssl: caCert
    ? { ca: caCert, rejectUnauthorized: true }
    // Publicly-trusted providers (Neon, RDS, etc.) verify fine against
    // Node's default trust store. Local/dev without any DB TLS is the only
    // other case that lands here, still encrypted, just not cert-verified.
    : { rejectUnauthorized: true },
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
