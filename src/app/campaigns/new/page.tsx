import { CampaignForm } from "./campaign-form";
import { db, contacts } from "@db/index";
import { sql } from "drizzle-orm";

export const metadata = { title: "Saymen — новая кампания" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  // Список отраслей с числом контактов — для подсказок при создании кампании
  const byIndustry = await db.execute<{ industry: string; count: number }>(
    sql`SELECT industry, COUNT(*)::int as count FROM contacts WHERE do_not_call = false GROUP BY industry ORDER BY count DESC`,
  );

  const totalContacts = byIndustry.rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6">
        <a href="/campaigns" className="text-sm text-blue-700 hover:underline">
          ← к списку кампаний
        </a>
      </div>

      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">campaigns / new</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Новая кампания обзвона</h1>
        <p className="mt-2 text-slate-600">
          Кампания берёт контакты из базы по фильтрам, ставит их в очередь и обзванивает по
          расписанию через Voximplant. До запуска можно сохранить как черновик.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="mb-2 font-semibold text-slate-900">База контактов</div>
        {totalContacts === 0 ? (
          <div className="text-slate-500">
            Контактов нет. Сначала{" "}
            <a href="/contacts/import" className="text-blue-700 hover:underline">
              импортируйте CSV
            </a>
            .
          </div>
        ) : (
          <div>
            <div className="text-slate-600">
              Доступно для обзвона: <strong>{totalContacts}</strong> (без стоп-листа)
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {byIndustry.rows.map((row) => (
                <span
                  key={row.industry}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs"
                >
                  {row.industry}: <strong>{row.count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <CampaignForm industries={byIndustry.rows.map((r) => r.industry)} />

      <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">Ограничения сейчас</div>
        <p className="mt-1">
          Запуск кампании пока не делает реальных звонков — Voximplant.com не звонит на РФ-номера.
          Кампания пока работает в режиме <strong>dry-run</strong>: ставит контакты в очередь и
          логирует «звонок состоялся бы», но трубки не поднимает. Реальные звонки начнутся, когда
          подключится Voximplant.ru или другой РФ-провайдер.
        </p>
      </div>
    </main>
  );
}
