import Link from "next/link";
import { notFound } from "next/navigation";
import { db, campaigns, contacts, calls } from "@db/index";
import { eq, sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  scheduled: "Запланирована",
  running: "Идёт",
  paused: "Пауза",
  completed: "Завершена",
  archived: "Архив",
};

export default async function CampaignDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!c) notFound();

  // Распределение контактов по статусам
  const byStatus = await db.execute<{ status: string; count: number }>(
    sql`SELECT status, COUNT(*)::int as count FROM contacts WHERE campaign_id = ${id} GROUP BY status`,
  );

  // Последние звонки в кампании
  const recentCalls = await db
    .select()
    .from(calls)
    .where(eq(calls.campaignId, id))
    .orderBy(desc(calls.createdAt))
    .limit(20);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6">
        <Link href="/campaigns" className="text-sm text-blue-700 hover:underline">
          ← к списку кампаний
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-blue-700">
            <span>campaign</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs">
              {STATUS_LABELS[c.status] ?? c.status}
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{c.name}</h1>
          {c.description && <p className="mt-2 text-slate-600">{c.description}</p>}
        </div>

        {c.status === "draft" && (
          <form action={`/api/campaigns/${id}/launch`} method="POST">
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              disabled
              title="Запуск пока выключен — Voximplant.com не звонит на РФ"
            >
              ▶ Запустить (dry-run)
            </button>
          </form>
        )}
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Всего контактов" value={c.totalContacts} />
        <Stat label="Обработано" value={c.contactsCompleted} />
        <Stat label="Email собран" value={c.emailsCollected} highlight />
        <Stat
          label="Прогресс"
          value={c.totalContacts > 0 ? `${Math.round((c.contactsCompleted / c.totalContacts) * 100)}%` : "0%"}
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Распределение по статусам</h3>
          {byStatus.rows.length === 0 ? (
            <div className="text-sm text-slate-500">Нет контактов</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {byStatus.rows.map((s) => (
                <li key={s.status} className="flex justify-between">
                  <span className="text-slate-600">{s.status}</span>
                  <span className="font-medium">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Параметры обзвона</h3>
          <ul className="space-y-1 text-sm">
            <Row k="Отрасль" v={c.industry} />
            <Row k="Окно дозвона" v={`${c.callWindowStart}–${c.callWindowEnd}`} />
            <Row k="Макс. попыток" v={String(c.maxAttemptsPerContact)} />
            <Row k="Интервал retry" v={`${c.retryIntervalHours} ч`} />
            <Row k="Параллельно" v={String(c.maxConcurrentCalls)} />
            <Row k="В день" v={String(c.dailyCallLimit)} />
            <Row k="Версия промта" v={c.promptVersion} />
          </ul>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Последние звонки</h2>
        {recentCalls.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Звонков по кампании ещё не было.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2">Когда</th>
                  <th className="px-4 py-2">Номер</th>
                  <th className="px-4 py-2">Итог</th>
                  <th className="px-4 py-2">Длит.</th>
                  <th className="px-4 py-2">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      <Link href={`/calls/${call.id}`} className="hover:underline">
                        {formatDate(call.startedAt ?? call.createdAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{call.calleeNumber}</td>
                    <td className="px-4 py-2 text-slate-700">{call.outcome ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{call.duration ? `${call.duration}с` : "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{call.collectedEmail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${highlight ? "text-emerald-900" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-slate-600">{k}</span>
      <span className="font-medium">{v}</span>
    </li>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
