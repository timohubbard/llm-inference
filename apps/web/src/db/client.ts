import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/web/.env.example to .env.local and fill in your Neon connection string.",
    );
  }
  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}

export { schema };
