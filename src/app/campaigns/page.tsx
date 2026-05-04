import Link from "next/link";
import { db, campaigns } from "@db/index";
import { desc } from "drizzle-orm";

export const metadata = { title: "Saymen — кампании" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  scheduled: "Запланирована",
  running: "Идёт",
  paused: "Пауза",
  completed: "Завершена",
  archived: "Архив",
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-amber-100 text-amber-800",
  running: "bg-emerald-100 text-emerald-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-slate-200 text-slate-500",
};

export default async function CampaignsPage() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-blue-700">campaigns</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Кампании обзвона</h1>
          <p className="mt-1 text-slate-600">
            Группы контактов с расписанием, лимитами и общим сценарием Дмитрия.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          + Новая кампания
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          Кампаний пока нет.{" "}
          <Link href="/campaigns/new" className="text-blue-700 hover:underline">
            Создайте первую
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((c) => {
            const progress = c.totalContacts > 0 ? Math.round((c.contactsCompleted / c.totalContacts) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h2 className="font-semibold">{c.name}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[c.status] ?? "bg-slate-100"}`}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>
                {c.description && (
                  <p className="mb-3 text-sm text-slate-600">{c.description}</p>
                )}

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Отрасль:</span>
                    <span className="font-medium">{c.industry}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Окно дозвона:</span>
                    <span className="font-mono">
                      {c.callWindowStart}–{c.callWindowEnd}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Лимит в день:</span>
                    <span className="font-medium">{c.dailyCallLimit}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>
                      Прогресс: {c.contactsCompleted} / {c.totalContacts}
                    </span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {c.emailsCollected > 0 && (
                  <div className="mt-3 text-xs text-emerald-700">
                    📧 Email собрано: {c.emailsCollected}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
