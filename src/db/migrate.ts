import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import logger from "~/utils/test-logger.ts";
import { db } from "./index.ts";
import { seedDatabase } from "./seed.ts";

export const handler = async () => {
  try {
    logger.log("Starting database migration...");
    logger.log("Migration folder: ./drizzle");
    logger.time("Migration duration");

    await migrate(db, {
      migrationsFolder: "./drizzle",
    });

    logger.timeEnd("Migration duration");
    logger.log("Database migration completed successfully");

    // Run database seeding after migration completes
    logger.log("Starting database seeding (if necessary)...");
    await seedDatabase();

    return { success: true };
  } catch (error) {
    logger.error("Database migration failed:", error);
    throw error;
  }
};
