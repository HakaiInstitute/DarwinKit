import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import process from "node:process";
import * as schema from "./schema.ts";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
