import { prisma } from '@/lib/prisma';

async function migratePhotoUrls() {
  console.log('Migrating legacy photoUrl fields to PostImage table...');
  const postsWithPhotoUrl = await prisma.post.findMany({
    where: {
      photoUrl: {
        not: null,
      },
    },
    include: {
      images: true,
    },
  });

  let migratedCount = 0;
  for (const post of postsWithPhotoUrl) {
    if (post.photoUrl && post.images.length === 0) {
      await prisma.postImage.create({
        data: {
          url: post.photoUrl,
          isPrimary: true,
          postId: post.id,
        },
      });
      migratedCount++;
    }
  }

  console.log(`Successfully migrated ${migratedCount} posts to PostImage.`);
}

migratePhotoUrls()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
