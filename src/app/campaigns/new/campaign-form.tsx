"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignForm({ industries }: { industries: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState(industries[0] ?? "other");
  const [callWindowStart, setCallWindowStart] = useState("10:00");
  const [callWindowEnd, setCallWindowEnd] = useState("18:00");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [retryHours, setRetryHours] = useState(24);
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [dailyLimit, setDailyLimit] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          industry,
          callWindowStart,
          callWindowEnd,
          maxAttemptsPerContact: maxAttempts,
          retryIntervalHours: retryHours,
          maxConcurrentCalls: maxConcurrent,
          dailyCallLimit: dailyLimit,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Ошибка");
        return;
      }
      router.push(`/campaigns/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <Field label="Название кампании *">
        <input
          required
          maxLength={255}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Аптеки СПб — март 2026"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </Field>

      <Field label="Описание (опционально)">
        <textarea
          maxLength={1000}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Цель: собрать email ЛПР, отправить КП по голосовому ассистенту"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </Field>

      <Field label="Отрасль (для industry hook в скрипте)">
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          <option value="other">other</option>
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Окно дозвона: с">
          <input
            type="time"
            value={callWindowStart}
            onChange={(e) => setCallWindowStart(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
        <Field label="до">
          <input
            type="time"
            value={callWindowEnd}
            onChange={(e) => setCallWindowEnd(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Макс. попыток на контакт" hint="Если не дозвонились — повторим N раз">
          <input
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Интервал между попытками (часы)">
          <input
            type="number"
            min={1}
            max={168}
            value={retryHours}
            onChange={(e) => setRetryHours(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Параллельных звонков" hint="Сколько за раз">
          <input
            type="number"
            min={1}
            max={50}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Лимит в день" hint="Защита от блокировки номера">
          <input
            type="number"
            min={10}
            max={5000}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy || !name}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "Создаю…" : "Создать кампанию"}
        </button>
        <a
          href="/campaigns"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Отмена
        </a>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
}
