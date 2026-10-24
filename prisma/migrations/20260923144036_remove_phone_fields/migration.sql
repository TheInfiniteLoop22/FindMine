-- AlterTable
ALTER TABLE "Message" DROP COLUMN "sharedPhone";

-- AlterTable
ALTER TABLE "RegisteredItem" DROP COLUMN "phone";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "phone",
DROP COLUMN "phoneVerified";
