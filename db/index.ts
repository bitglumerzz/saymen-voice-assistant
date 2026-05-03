/**
 * Drizzle DB-клиент.
 *
 * В Next.js используется через `import { db } from "@db/index"`.
 * В оркестраторе (отдельный Node-процесс) — тот же импорт.
 *
 * Подключение через node-postgres (pg) Pool — поддерживает long-running connections,
 * что важно для оркестратора со стримами.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Скопируйте .env.example в .env.local и заполните DATABASE_URL.",
  );
}

// В Next.js dev-режиме модули перезагружаются — храним пул в global, чтобы не плодить соединения
declare global {
  // eslint-disable-next-line no-var
  var __saymen_pg_pool: Pool | undefined;
}

const pool =
  globalThis.__saymen_pg_pool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__saymen_pg_pool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };
export * from "./schema";
