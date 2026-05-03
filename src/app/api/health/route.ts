import { NextResponse } from "next/server";
import { db } from "@db/index";
import { sql } from "drizzle-orm";

/**
 * GET /api/health
 *
 * Проверяет: приложение живо, БД доступна, конфигурация валидна.
 * Используется для liveness/readiness probes на проде.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Проверка БД
  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    checks.database = { ok: result.rows.length === 1 };
  } catch (e) {
    checks.database = { ok: false, detail: String(e instanceof Error ? e.message : e) };
  }

  // Какие провайдеры сконфигурированы
  checks.providers = {
    ok: true,
    detail: JSON.stringify({
      openai: !!process.env.OPENAI_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      voximplant: !!process.env.VOXIMPLANT_API_KEY,
      unisender: !!process.env.UNISENDER_API_KEY,
    }),
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      version: "0.1.0",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
