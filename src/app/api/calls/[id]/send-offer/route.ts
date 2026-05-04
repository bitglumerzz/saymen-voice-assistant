import { NextResponse } from "next/server";
import { db, calls, contacts, emailSends } from "@db/index";
import { eq } from "drizzle-orm";
import { createUnisenderClient, renderColdOfferEmail } from "@/lib/unisender";

/**
 * POST /api/calls/{id}/send-offer
 *
 * Отправить email с КП по результатам конкретного звонка/диалога.
 * Берёт email либо из collected_email (если бот собрал в разговоре),
 * либо из known_email связанного контакта (как fallback).
 *
 * Используется как ручная кнопка в UI и автоматически после успешного диалога.
 */

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call) {
    return NextResponse.json({ ok: false, error: "call not found" }, { status: 404 });
  }

  // Достать email и контактные данные
  let toEmail = call.collectedEmail;
  let companyName = "ваша компания";
  let industry: string | undefined;
  let dmName: string | undefined;

  if (call.contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, call.contactId)).limit(1);
    if (contact) {
      toEmail = toEmail ?? contact.knownEmail;
      companyName = contact.companyName;
      industry = contact.industry;
      dmName = contact.decisionMakerName ?? undefined;
    }
  }

  if (!toEmail) {
    return NextResponse.json(
      { ok: false, error: "Нет email получателя — ни в звонке, ни в контакте" },
      { status: 400 },
    );
  }

  // Шаблонизация
  const html = renderColdOfferEmail({
    name: dmName,
    company: companyName,
    industry,
    callSummary: call.summary
      ? `Мы поговорили: ${call.summary.slice(0, 200)}.`
      : "Мы коротко поговорили — спасибо, что уделили время.",
    calendarLink: process.env.CALENDAR_LINK ?? "https://saymen.io/demo",
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3030"}/u/${id}`,
  });

  const subject = `${companyName} — материал по голосовому ассистенту, как и обещал`;

  let unisender;
  try {
    unisender = createUnisenderClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unisender config error" },
      { status: 503 },
    );
  }

  // Запись попытки в email_sends ДО отправки — чтобы сохранилась даже если упадёт
  const [send] = await db
    .insert(emailSends)
    .values({
      organizationId: call.organizationId,
      contactId: call.contactId,
      callId: call.id,
      template: "cold_offer_v1",
      subject,
      fromEmail: process.env.EMAIL_FROM ?? "hello@saymen.io",
      toEmail,
      htmlSnapshot: html,
    })
    .returning({ id: emailSends.id });

  if (!send) {
    return NextResponse.json({ ok: false, error: "DB insert failed" }, { status: 500 });
  }

  // Отправка
  const result = await unisender.sendEmail({ to: toEmail, subject, html });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, sendId: send.id }, { status: 502 });
  }

  // Обновить запись с providerMessageId
  await db
    .update(emailSends)
    .set({ providerMessageId: result.messageId, sentAt: new Date() })
    .where(eq(emailSends.id, send.id));

  return NextResponse.json({
    ok: true,
    sendId: send.id,
    providerMessageId: result.messageId,
    toEmail,
  });
}
