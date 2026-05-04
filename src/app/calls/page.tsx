import Link from "next/link";
import { db, calls } from "@db/index";
import { sql, desc } from "drizzle-orm";

export const metadata = { title: "Saymen — журнал звонков" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const OUTCOME_LABELS: Record<string, string> = {
  email_collected: "Email собран",
  refused: "Отказался",
  callback: "Перезвонить",
  voicemail: "Автоответчик",
  no_answer: "Не ответили",
  busy: "Занято",
  wrong_number: "Не туда",
  transfer: "На оператора",
  error: "Ошибка",
};

const OUTCOME_CLS: Record<string, string> = {
  email_collected: "bg-emerald-100 text-emerald-800",
  refused: "bg-rose-100 text-rose-800",
  callback: "bg-amber-100 text-amber-800",
  voicemail: "bg-slate-200 text-slate-700",
  no_answer: "bg-slate-100 text-slate-600",
  busy: "bg-slate-100 text-slate-600",
  wrong_number: "bg-slate-100 text-slate-600",
  transfer: "bg-blue-100 text-blue-800",
  error: "bg-rose-100 text-rose-800",
};

export default async function CallsPage(props: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const direction = sp.direction; // "inbound" | "outbound"
  const outcome = sp.outcome;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const conditions: ReturnType<typeof sql>[] = [];
  if (direction === "inbound" || direction === "outbound") {
    conditions.push(sql`direction = ${direction}`);
  }
  if (outcome) {
    conditions.push(sql`outcome = ${outcome}`);
  }
  const whereClause =
    conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const totalRes = await db.execute(sql`SELECT COUNT(*)::int AS count FROM calls ${whereClause}`);
  const total = (totalRes.rows[0] as { count: number } | undefined)?.count ?? 0;

  const rows = await db
    .select({
      id: calls.id,
      direction: calls.direction,
      callerNumber: calls.callerNumber,
      calleeNumber: calls.calleeNumber,
      outcome: calls.outcome,
      duration: calls.duration,
      collectedEmail: calls.collectedEmail,
      summary: calls.summary,
      startedAt: calls.startedAt,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .where(
      direction === "inbound" || direction === "outbound"
        ? outcome
          ? sql`direction = ${direction} AND outcome = ${outcome}`
          : sql`direction = ${direction}`
        : outcome
          ? sql`outcome = ${outcome}`
          : undefined,
    )
    .orderBy(desc(calls.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const byOutcome = await db.execute<{ outcome: string | null; count: number }>(
    sql`SELECT outcome, COUNT(*)::int as count FROM calls GROUP BY outcome ORDER BY count DESC`,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-blue-700">calls</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Журнал звонков</h1>
          <p className="mt-1 text-slate-600">
            Всего: {total.toLocaleString("ru-RU")} (Telegram-чаты + телефонные звонки)
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip href="/calls" label="Все" active={!direction && !outcome} />
        <FilterChip href="/calls?direction=inbound" label="Входящие" active={direction === "inbound"} />
        <FilterChip
          href="/calls?direction=outbound"
          label="Исходящие"
          active={direction === "outbound"}
        />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {byOutcome.rows.map((row) =>
          row.outcome ? (
            <FilterChip
              key={row.outcome}
              href={`/calls?outcome=${encodeURIComponent(row.outcome)}`}
              label={`${OUTCOME_LABELS[row.outcome] ?? row.outcome} · ${row.count}`}
              active={outcome === row.outcome}
              size="sm"
            />
          ) : null,
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          Звонков пока нет. Telegram-диалоги после `/start` появятся здесь.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-2">Когда</th>
                <th className="px-4 py-2">Канал</th>
                <th className="px-4 py-2">С кем</th>
                <th className="px-4 py-2">Длительность</th>
                <th className="px-4 py-2">Итог</th>
                <th className="px-4 py-2">Резюме</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => {
                const startedAt = c.startedAt ?? c.createdAt;
                const counterparty = c.direction === "inbound" ? c.callerNumber : c.calleeNumber;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      <Link href={`/calls/${c.id}`} className="hover:underline">
                        {formatDate(startedAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <ChannelBadge value={counterparty ?? ""} direction={c.direction} />
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 font-mono text-xs text-slate-700">
                      {counterparty ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {c.duration ? formatDuration(c.duration) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {c.outcome ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_CLS[c.outcome] ?? "bg-slate-100 text-slate-700"}`}
                        >
                          {OUTCOME_LABELS[c.outcome] ?? c.outcome}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">в процессе</span>
                      )}
                    </td>
                    <td className="max-w-[300px] truncate px-4 py-2 text-slate-600">
                      <Link href={`/calls/${c.id}`} className="hover:underline">
                        {c.collectedEmail ?? c.summary ?? "—"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
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

function FilterChip({
  href,
  label,
  active,
  size = "md",
}: {
  href: string;
  label: string;
  active: boolean;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "text-xs px-2.5 py-0.5" : "text-xs px-3 py-1";
  return (
    <Link
      href={href}
      className={`rounded-full font-medium ${sz} ${
        active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}

function ChannelBadge({ value, direction }: { value: string; direction: string | null }) {
  if (value.startsWith("tg:")) {
    return (
      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
        Telegram
      </span>
    );
  }
  if (direction === "inbound") {
    return (
      <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
        Звонок ↓
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      Звонок ↑
    </span>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}с`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}м ${s}с`;
}
