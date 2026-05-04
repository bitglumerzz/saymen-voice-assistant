import Link from "next/link";
import { db, calls, contacts, campaigns } from "@db/index";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  // Метрики одним пакетом — звонки, контакты, email, кампании
  const [statsRes, byOutcomeRes, recentCalls] = await Promise.all([
    db.execute<{ key: string; count: number }>(sql`
      SELECT 'calls_total' AS key, COUNT(*)::int AS count FROM calls
      UNION ALL
      SELECT 'calls_today', COUNT(*)::int FROM calls WHERE created_at >= CURRENT_DATE
      UNION ALL
      SELECT 'emails_collected', COUNT(*)::int FROM calls WHERE collected_email IS NOT NULL
      UNION ALL
      SELECT 'contacts_total', COUNT(*)::int FROM contacts
      UNION ALL
      SELECT 'contacts_called', COUNT(*)::int FROM contacts WHERE last_call_at IS NOT NULL
      UNION ALL
      SELECT 'campaigns_active', COUNT(*)::int FROM campaigns WHERE status IN ('running','scheduled')
    `),
    db.execute<{ outcome: string | null; count: number }>(
      sql`SELECT outcome, COUNT(*)::int AS count FROM calls WHERE outcome IS NOT NULL GROUP BY outcome ORDER BY count DESC LIMIT 6`,
    ),
    db
      .select({
        id: calls.id,
        direction: calls.direction,
        callerNumber: calls.callerNumber,
        calleeNumber: calls.calleeNumber,
        outcome: calls.outcome,
        duration: calls.duration,
        summary: calls.summary,
        collectedEmail: calls.collectedEmail,
        createdAt: calls.createdAt,
      })
      .from(calls)
      .orderBy(desc(calls.createdAt))
      .limit(8),
  ]);

  const stats = Object.fromEntries(statsRes.rows.map((r) => [r.key, r.count])) as Record<
    string,
    number
  >;

  const callsTotal = stats.calls_total ?? 0;
  const callsToday = stats.calls_today ?? 0;
  const emailsCollected = stats.emails_collected ?? 0;
  const conversion = callsTotal > 0 ? Math.round((emailsCollected / callsTotal) * 100) : 0;
  const contactsTotal = stats.contacts_total ?? 0;
  const contactsCalled = stats.contacts_called ?? 0;
  const campaignsActive = stats.campaigns_active ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
        <p className="mt-1 text-slate-600">
          Сводка по голосовым диалогам через Telegram (а в будущем — и по телефонии).
        </p>
      </div>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Всего разговоров" value={callsTotal} hint="Telegram + телефонные" />
        <Stat label="Сегодня" value={callsToday} hint="С 00:00 по местному времени" />
        <Stat
          label="Email собрано"
          value={emailsCollected}
          hint={`${conversion}% конверсия`}
          highlight={emailsCollected > 0}
        />
        <Stat
          label="Контакты в базе"
          value={contactsTotal}
          hint={`Обзвонили ${contactsCalled}`}
        />
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Последние диалоги</h2>
            <Link href="/calls" className="text-xs text-blue-700 hover:underline">
              все звонки →
            </Link>
          </div>
          {recentCalls.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Пока разговоров нет. Откройте Telegram-бота и отправьте голосовое.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentCalls.map((c) => (
                <li key={c.id} className="py-2">
                  <Link href={`/calls/${c.id}`} className="block hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-slate-900">
                          {c.summary ?? "Разговор без резюме"}
                        </div>
                        <div className="mt-0.5 truncate text-xs font-mono text-slate-500">
                          {c.direction === "inbound" ? c.callerNumber : c.calleeNumber}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                        {c.outcome && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                            {c.outcome}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{formatTime(c.createdAt)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">По итогам</h2>
          {byOutcomeRes.rows.length === 0 ? (
            <div className="text-sm text-slate-500">Пока нет данных</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {byOutcomeRes.rows.map((row) => {
                const pct = callsTotal > 0 ? Math.round((row.count / callsTotal) * 100) : 0;
                return (
                  <li key={row.outcome ?? "?"}>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{outcomeLabel(row.outcome ?? "?")}</span>
                      <span>
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickAction href="/contacts/import" title="Импорт CSV" desc="Загрузить базу для обзвона" />
        <QuickAction
          href="/campaigns/new"
          title="Новая кампания"
          desc={`${campaignsActive} активны`}
        />
        <QuickAction href="/dev/voice-test" title="Микрофон-тест" desc="Поговорить локально" />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number;
  hint?: string;
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
        {value.toLocaleString("ru-RU")}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function QuickAction({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-0.5 text-xs text-slate-600">{desc}</div>
    </Link>
  );
}

function outcomeLabel(o: string): string {
  const map: Record<string, string> = {
    email_collected: "Email собран",
    refused: "Отказ",
    callback: "Перезвон",
    voicemail: "Автоответчик",
    no_answer: "Не ответили",
    busy: "Занято",
    wrong_number: "Не туда",
    transfer: "На оператора",
    error: "Ошибка",
  };
  return map[o] ?? o;
}

function formatTime(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diffH = (now.getTime() - date.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.round(diffH * 60)} мин назад`;
  if (diffH < 24) return `${Math.round(diffH)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
