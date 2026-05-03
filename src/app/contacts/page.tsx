import Link from "next/link";
import { db, contacts } from "@db/index";
import { sql, desc } from "drizzle-orm";

export const metadata = { title: "Saymen — контакты" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ContactsPage(props: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const industryFilter = sp.industry;
  const regionFilter = sp.region;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Динамический WHERE через sql template
  const conditions: ReturnType<typeof sql>[] = [];
  if (industryFilter) conditions.push(sql`industry = ${industryFilter}`);
  if (regionFilter) conditions.push(sql`region = ${regionFilter}`);
  const whereClause =
    conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

  // Подсчёт + выборка
  const totalRes = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM contacts ${whereClause}`,
  );
  const total = (totalRes.rows[0] as { count: number } | undefined)?.count ?? 0;

  const rows = await db
    .select()
    .from(contacts)
    .where(
      industryFilter
        ? regionFilter
          ? sql`industry = ${industryFilter} AND region = ${regionFilter}`
          : sql`industry = ${industryFilter}`
        : regionFilter
          ? sql`region = ${regionFilter}`
          : undefined,
    )
    .orderBy(desc(contacts.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Группировка по отрасли для фильтра
  const byIndustry = await db.execute<{ industry: string; count: number }>(
    sql`SELECT industry, COUNT(*)::int as count FROM contacts GROUP BY industry ORDER BY count DESC`,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-blue-700">contacts</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Контакты для обзвона</h1>
          <p className="mt-1 text-slate-600">Всего в базе: {total.toLocaleString("ru-RU")}</p>
        </div>
        <Link
          href="/contacts/import"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          + Импорт из CSV
        </Link>
      </div>

      {byIndustry.rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip href="/contacts" label="Все" active={!industryFilter} />
          {byIndustry.rows.map((row) => (
            <FilterChip
              key={row.industry}
              href={`/contacts?industry=${encodeURIComponent(row.industry)}`}
              label={`${industryLabel(row.industry)} · ${row.count}`}
              active={industryFilter === row.industry}
            />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          Пока пусто.{" "}
          <Link href="/contacts/import" className="text-blue-700 hover:underline">
            Импортируйте первый CSV
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-2">Компания</th>
                <th className="px-4 py-2">Телефон</th>
                <th className="px-4 py-2">Город</th>
                <th className="px-4 py-2">Отрасль</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="max-w-[280px] truncate px-4 py-2 font-medium">{c.companyName}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.phone}</td>
                  <td className="px-4 py-2 text-slate-600">{c.city ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{industryLabel(c.industry)}</td>
                  <td className="max-w-[180px] truncate px-4 py-2 text-slate-600">
                    {c.knownEmail ?? c.collectedEmail ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>
                Стр. {page} из {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`?${new URLSearchParams({ ...sp, page: String(page - 1) }).toString()}`}
                    className="rounded border border-slate-300 px-2 py-1 hover:bg-white"
                  >
                    ← назад
                  </Link>
                )}
                {page * PAGE_SIZE < total && (
                  <Link
                    href={`?${new URLSearchParams({ ...sp, page: String(page + 1) }).toString()}`}
                    className="rounded border border-slate-300 px-2 py-1 hover:bg-white"
                  >
                    вперёд →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full px-3 py-1 text-xs font-medium " +
        (active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
      }
    >
      {label}
    </Link>
  );
}

function industryLabel(industry: string): string {
  const map: Record<string, string> = {
    pharmacy: "Аптеки",
    delivery: "Доставка",
    clinic: "Клиники",
    restaurant: "Рестораны",
    retail: "Розница",
    services: "Услуги",
    logistics: "Логистика",
    construction: "Строительство",
    utilities: "Энергетика/ЖКХ",
    other: "Другое",
  };
  return map[industry] ?? industry;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "новый", cls: "bg-slate-100 text-slate-700" },
    queued: { label: "в очереди", cls: "bg-amber-100 text-amber-800" },
    dialing: { label: "звоним", cls: "bg-blue-100 text-blue-800" },
    called: { label: "обзвонен", cls: "bg-emerald-100 text-emerald-800" },
    done: { label: "готов", cls: "bg-emerald-100 text-emerald-800" },
    error: { label: "ошибка", cls: "bg-rose-100 text-rose-800" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
  );
}
