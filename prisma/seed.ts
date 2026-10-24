import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding hardened auth test accounts...');

  const passHashAA = await bcrypt.hash('aaaaaa', 12);
  const passHashBB = await bcrypt.hash('bbbbbb', 12);

  // Upsert Account AA
  const userAA = await prisma.user.upsert({
    where: { email: 'a@gmail.com' },
    update: {
      displayName: 'AA',
      passwordHash: passHashAA,
      emailVerified: new Date(),
      isSeedAccount: true,
    },
    create: {
      email: 'a@gmail.com',
      displayName: 'AA',
      passwordHash: passHashAA,
      emailVerified: new Date(),
      isSeedAccount: true,
    },
  });
  console.log(`Seeded User AA: ${userAA.email}`);

  // Upsert Account BB
  const userBB = await prisma.user.upsert({
    where: { email: 'b@gmail.com' },
    update: {
      displayName: 'BB',
      passwordHash: passHashBB,
      emailVerified: new Date(),
      isSeedAccount: true,
    },
    create: {
      email: 'b@gmail.com',
      displayName: 'BB',
      passwordHash: passHashBB,
      emailVerified: new Date(),
      isSeedAccount: true,
    },
  });
  console.log(`Seeded User BB: ${userBB.email}`);

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
