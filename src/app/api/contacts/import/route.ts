import { NextResponse } from "next/server";
import { db, contacts, organizations } from "@db/index";
import { sql } from "drizzle-orm";
import { buildImportPreview } from "@/lib/csv-import";

/**
 * POST /api/contacts/import
 *
 * multipart/form-data:
 *   file: CSV-файл с базой контактов
 *   campaignId: (опционально) UUID кампании, к которой привязать
 *   dryRun: "1" — только preview, без записи в БД
 *
 * Авто-детекция колонок и нормализация телефонов — в src/lib/csv-import.ts.
 */

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const campaignId = form.get("campaignId");
  const dryRun = form.get("dryRun") === "1";

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл не передан" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const text = buf.toString("utf-8");
  const preview = buildImportPreview(text, file.name);

  if (preview.validRows.length === 0) {
    return NextResponse.json({
      ok: false,
      preview,
      error: "Не нашли ни одной валидной строки. Проверьте отчёт об ошибках.",
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      preview: {
        ...preview,
        // Урезаем validRows до первых 10 для preview (UX)
        validRows: preview.validRows.slice(0, 10),
        totalValid: preview.validRows.length,
      },
    });
  }

  // Реальный импорт
  // 1. Идемпотентно создаём демо-организацию
  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, name: "Demo (saymen_bot)", slug: "demo" })
    .onConflictDoNothing();

  // 2. Bulk-insert контактов с дедупом по (organization_id, phone)
  let inserted = 0;
  let skipped = 0;
  // Пакетами по 200 — чтобы не упереться в лимиты pg
  const batchSize = 200;
  for (let i = 0; i < preview.validRows.length; i += batchSize) {
    const batch = preview.validRows.slice(i, i + batchSize);
    const result = await db
      .insert(contacts)
      .values(
        batch.map((r) => ({
          organizationId: DEMO_ORG_ID,
          campaignId: typeof campaignId === "string" && campaignId ? campaignId : undefined,
          companyName: r.companyName,
          phone: r.phone,
          industry: r.industry as
            | "pharmacy"
            | "delivery"
            | "clinic"
            | "restaurant"
            | "retail"
            | "services"
            | "logistics"
            | "construction"
            | "utilities"
            | "other",
          region: r.region,
          city: r.city,
          decisionMakerName: r.decisionMakerName,
          decisionMakerRole: r.decisionMakerRole,
          website: r.website,
          knownEmail: r.knownEmail,
          source: r.source.slice(0, 64),
          notes: r.notes,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: contacts.id });
    inserted += result.length;
    skipped += batch.length - result.length;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    errorsCount: preview.errors.length,
    detectedColumns: preview.detectedColumns,
    sampleErrors: preview.errors.slice(0, 10),
  });
}

/** Краткая инфо для GET — посчитать сколько уже контактов в БД. */
export async function GET() {
  const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM contacts`);
  const count = (result.rows[0] as { count: number } | undefined)?.count ?? 0;
  return NextResponse.json({ totalContacts: count });
}
