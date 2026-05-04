import { NextResponse } from "next/server";
import { db, stopList, contacts } from "@db/index";
import { eq, and } from "drizzle-orm";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  // Найти запись чтобы знать какой телефон разблокировать
  const [entry] = await db.select().from(stopList).where(eq(stopList.id, id)).limit(1);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  await db.delete(stopList).where(eq(stopList.id, id));

  // Снять флаг do_not_call с контактов с этим телефоном
  await db
    .update(contacts)
    .set({ doNotCall: false, doNotCallReason: null })
    .where(and(eq(contacts.organizationId, DEMO_ORG_ID), eq(contacts.phone, entry.phone)));

  return NextResponse.redirect(new URL("/stop-list", _req.url), { status: 303 });
}
