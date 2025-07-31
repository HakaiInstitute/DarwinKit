import "dotenv/config";
import { db } from "./index";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { seedDatabase } from "./seed";

export const handler = async () => {
  try {
    console.log("Starting database migration...");
    console.log("Migration folder: ./drizzle");
    console.time("Migration duration");

    await migrate(db, {
      migrationsFolder: "./drizzle",
    });

    console.timeEnd("Migration duration");
    console.log("Database migration completed successfully");

    // Run database seeding after migration completes
    console.log("Starting database seeding (if necessary)...");
    await seedDatabase();

    return { success: true };
  } catch (error) {
    console.error("Database migration failed:", error);
    throw error;
  }
};
