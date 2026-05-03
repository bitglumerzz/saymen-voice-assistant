import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://saymen:saymen_dev_password@localhost:5433/saymen_dev",
  },
  verbose: true,
  strict: true,
} satisfies Config;
