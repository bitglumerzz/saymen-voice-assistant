import { NextResponse } from "next/server";
import { z } from "zod";
import { db, campaigns, contacts } from "@db/index";
import { eq, sql, and } from "drizzle-orm";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

const bodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  industry: z.enum([
    "pharmacy",
    "delivery",
    "clinic",
    "restaurant",
    "retail",
    "services",
    "logistics",
    "construction",
    "utilities",
    "other",
  ]),
  callWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default("10:00"),
  callWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  maxAttemptsPerContact: z.number().int().min(1).max(10).default(3),
  retryIntervalHours: z.number().int().min(1).max(168).default(24),
  maxConcurrentCalls: z.number().int().min(1).max(50).default(5),
  dailyCallLimit: z.number().int().min(10).max(5000).default(150),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "invalid body" },
      { status: 400 },
    );
  }

  // Создаём кампанию
  const [created] = await db
    .insert(campaigns)
    .values({
      organizationId: DEMO_ORG_ID,
      name: body.name,
      description: body.description,
      industry: body.industry,
      callWindowStart: body.callWindowStart,
      callWindowEnd: body.callWindowEnd,
      maxAttemptsPerContact: body.maxAttemptsPerContact,
      retryIntervalHours: body.retryIntervalHours,
      maxConcurrentCalls: body.maxConcurrentCalls,
      dailyCallLimit: body.dailyCallLimit,
    })
    .returning({ id: campaigns.id });

  if (!created) {
    return NextResponse.json({ ok: false, error: "не удалось создать" }, { status: 500 });
  }

  // Привязываем все контакты этой отрасли (без стоп-листа) к кампании
  const updateRes = await db
    .update(contacts)
    .set({ campaignId: created.id, status: "queued" })
    .where(
      and(
        eq(contacts.organizationId, DEMO_ORG_ID),
        eq(contacts.industry, body.industry),
        eq(contacts.doNotCall, false),
        // Только те, что не в кампании или со status=new
        sql`(campaign_id IS NULL OR status = 'new')`,
      ),
    )
    .returning({ id: contacts.id });

  // Обновим totalContacts в кампании
  await db
    .update(campaigns)
    .set({ totalContacts: updateRes.length })
    .where(eq(campaigns.id, created.id));

  return NextResponse.json({
    ok: true,
    id: created.id,
    contactsAttached: updateRes.length,
  });
}
