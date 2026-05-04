import Link from "next/link";
import { notFound } from "next/navigation";
import { db, calls, transcriptTurns } from "@db/index";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

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

export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  // UUID валидация — не пытаемся спрашивать БД с мусором в id
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call) notFound();

  const turns = await db
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.callId, id))
    .orderBy(asc(transcriptTurns.turnIndex));

  const isTelegram = call.callerNumber?.startsWith("tg:") || call.calleeNumber?.startsWith("tg:");
  const counterparty = call.direction === "inbound" ? call.callerNumber : call.calleeNumber;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-6">
        <Link href="/calls" className="text-sm text-blue-700 hover:underline">
          ← к журналу
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-blue-700">
            <span>{isTelegram ? "Telegram" : call.direction === "inbound" ? "Входящий звонок" : "Исходящий звонок"}</span>
            {call.outcome && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs">
                {OUTCOME_LABELS[call.outcome] ?? call.outcome}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {call.summary ?? "Разговор"}
          </h1>
          <div className="mt-2 font-mono text-sm text-slate-600">{counterparty}</div>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{formatDate(call.startedAt ?? call.createdAt)}</div>
          {call.duration ? <div className="mt-1">Длительность: {formatDuration(call.duration)}</div> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Канал" value={isTelegram ? "Telegram" : "SIP-телефония"} />
        <Card label="Направление" value={call.direction === "inbound" ? "Входящий" : "Исходящий"} />
        <Card label="Реплик в диалоге" value={String(turns.length)} />
        {call.collectedEmail && <Card label="Email собран" value={call.collectedEmail} highlight />}
        {call.sentiment && <Card label="Настроение" value={call.sentiment} />}
        {call.recordingUrl && (
          <Card label="Аудио" value={<audio controls src={call.recordingUrl} className="mt-1 w-full" />} />
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Транскрипт</h2>
        {turns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Реплик не записано (звонок мог упасть на старте или не было ASR).
          </div>
        ) : (
          <div className="space-y-3">
            {turns.map((t) => {
              const isBot = t.speaker === "bot";
              return (
                <div
                  key={t.id}
                  className={`rounded-lg p-3 text-sm ${
                    isBot ? "bg-blue-50 border border-blue-100" : "bg-slate-100 border border-slate-200"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide opacity-70">
                    <span className={isBot ? "text-blue-800" : "text-slate-700"}>
                      {isBot ? "Дмитрий (бот)" : "Собеседник"}
                    </span>
                    {t.startMs !== null && (
                      <span className="font-normal opacity-60">
                        {formatTimestamp(t.startMs ?? 0)}
                      </span>
                    )}
                  </div>
                  <div className={`mb-2 ${isBot ? "text-blue-950" : "text-slate-900"}`}>
                    {t.text}
                  </div>
                  {t.audioUrl && (
                    <audio
                      controls
                      preload="none"
                      src={t.audioUrl}
                      className="mt-1 h-8 w-full"
                    >
                      Ваш браузер не поддерживает audio
                    </audio>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <div>callId: <span className="font-mono">{call.id}</span></div>
        {call.providerCallId && (
          <div className="mt-1">
            providerCallId: <span className="font-mono">{call.providerCallId}</span>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-medium ${highlight ? "text-emerald-900" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}с`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}м ${s}с`;
}

function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
