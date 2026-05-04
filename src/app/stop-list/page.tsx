import Link from "next/link";
import { db, stopList } from "@db/index";
import { desc } from "drizzle-orm";
import { StopListAddForm } from "./add-form";

export const metadata = { title: "Saymen — стоп-лист" };
export const dynamic = "force-dynamic";

export default async function StopListPage() {
  const rows = await db.select().from(stopList).orderBy(desc(stopList.addedAt));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">stop-list</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Стоп-лист</h1>
        <p className="mt-1 text-slate-600">
          Номера, которым мы НЕ звоним ни в какой кампании. Сюда автоматически попадают те, кто
          сказал «не звоните больше». Можно добавить вручную.
        </p>
      </div>

      <StopListAddForm />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          Стоп-лист пуст. Хорошо.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-600">
            Всего: {rows.length}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-2">Телефон</th>
                <th className="px-4 py-2">Причина</th>
                <th className="px-4 py-2">Когда</th>
                <th className="px-4 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{s.phone}</td>
                  <td className="px-4 py-2 text-slate-700">{s.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(s.addedAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={`/api/stop-list/${s.id}/remove`} method="POST" className="inline">
                      <button className="text-xs text-rose-600 hover:underline">Удалить</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">Юридический минимум</div>
        <p className="mt-1">
          По 38-ФЗ «О рекламе» — если абонент попросил больше не звонить, обязаны добавить в
          стоп-лист в течение 24 часов и удалить через год. Кампании автоматически фильтруют
          контакты по этому списку.
        </p>
      </div>
    </main>
  );
}
