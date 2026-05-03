import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createVoximplantClient } from "@/lib/voximplant";
import { db, calls } from "@db/index";

/**
 * POST /api/calls/test-call
 *
 * Запускает один исходящий звонок. Используется со страницы /dev/test-call.
 * В проде эту же логику будет вызывать менеджер кампаний для каждого контакта.
 *
 * Body:
 *   {
 *     "phone": "+79001234567",
 *     "name": "Иван Иванович",      // опционально, попадёт в промт
 *     "company": "ООО Аптека",      // опционально
 *     "industry": "pharmacy"        // опционально
 *   }
 */

const bodySchema = z.object({
  phone: z
    .string()
    .regex(/^\+7\d{10}$/, "Телефон в формате +7XXXXXXXXXX (11 цифр после +7)"),
  name: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
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

  const ruleIdStr = process.env.VOXIMPLANT_RULE_ID;
  const callerId = process.env.VOXIMPLANT_CALLER_ID;
  const wsUrl = process.env.VOXIMPLANT_PUBLIC_WS_URL;
  const wsSecret = process.env.VOXIMPLANT_WEBHOOK_SECRET ?? "";

  if (!ruleIdStr || !callerId || !wsUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Voximplant не настроен. В .env.local заполните VOXIMPLANT_RULE_ID, VOXIMPLANT_CALLER_ID, VOXIMPLANT_PUBLIC_WS_URL.",
      },
      { status: 503 },
    );
  }

  const callId = randomUUID();
  const organizationId = "demo-org"; // TODO: брать из сессии пользователя
  const ruleId = Number(ruleIdStr);

  // Создаём запись звонка ДО вызова Voximplant — чтобы webhook от него мог обновить
  try {
    await db.insert(calls).values({
      id: callId,
      organizationId,
      direction: "outbound",
      callerNumber: callerId,
      calleeNumber: body.phone,
    });
  } catch (e) {
    // Если БД не поднята — это допустимо, оркестратор всё равно создаст запись потом
    console.warn("[test-call] не записали call в БД:", e);
  }

  let vox;
  try {
    vox = createVoximplantClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "voximplant config error" },
      { status: 503 },
    );
  }

  const result = await vox.startScenarios({
    ruleId,
    customData: {
      callerId,
      calleeNumber: body.phone,
      callId,
      contactId: null,
      campaignId: null,
      organizationId,
      industry: body.industry ?? null,
      dmName: body.name ?? null,
      company: body.company ?? null,
      wsUrl,
      wsSecret,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: `Voximplant: ${result.errorCode} ${result.errorMsg}`, raw: result.raw },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    callId,
    callSessionHistoryId: result.callSessionHistoryId,
    voximplantRaw: result.raw,
  });
}
