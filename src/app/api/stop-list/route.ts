import { NextResponse } from "next/server";
import { z } from "zod";
import { db, stopList, contacts } from "@db/index";
import { and, eq } from "drizzle-orm";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

const bodySchema = z.object({
  phone: z.string().regex(/^\+7\d{10}$/, "Формат +7XXXXXXXXXX"),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "invalid" },
      { status: 400 },
    );
  }

  // 1. В стоп-лист (если ещё нет)
  await db
    .insert(stopList)
    .values({
      organizationId: DEMO_ORG_ID,
      phone: body.phone,
      reason: body.reason ?? null,
    })
    .onConflictDoNothing();

  // 2. Контакт с этим телефоном — пометить do_not_call=true чтобы кампании его пропускали
  await db
    .update(contacts)
    .set({ doNotCall: true, doNotCallReason: body.reason ?? "ручное добавление" })
    .where(and(eq(contacts.organizationId, DEMO_ORG_ID), eq(contacts.phone, body.phone)));

  return NextResponse.json({ ok: true });
}
