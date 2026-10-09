-- DropForeignKey
ALTER TABLE "RegisteredItem" DROP CONSTRAINT "RegisteredItem_userId_fkey";

-- AddForeignKey
ALTER TABLE "RegisteredItem" ADD CONSTRAINT "RegisteredItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

