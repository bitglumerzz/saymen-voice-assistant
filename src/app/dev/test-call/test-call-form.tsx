"use client";

import { useState } from "react";

type Result =
  | { ok: true; callId: string; callSessionHistoryId?: number }
  | { ok: false; error: string };

export function TestCallForm({ disabled }: { disabled: boolean }) {
  const [phone, setPhone] = useState("+7");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("other");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/calls/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name || undefined, company: company || undefined, industry }),
      });
      const data = (await res.json()) as Result;
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Телефон</label>
        <input
          type="tel"
          required
          pattern="^\+7\d{10}$"
          placeholder="+79001234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-1 text-xs text-slate-500">Формат +7XXXXXXXXXX, 11 цифр после +7</div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Имя (опционально)
        </label>
        <input
          type="text"
          placeholder="Иван Иванович"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-1 text-xs text-slate-500">Бот будет обращаться по имени</div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Компания (опционально)
        </label>
        <input
          type="text"
          placeholder="ООО Аптека Плюс"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Отрасль</label>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="pharmacy">Аптека</option>
          <option value="delivery">Доставка</option>
          <option value="clinic">Медклиника</option>
          <option value="restaurant">Ресторан</option>
          <option value="retail">Розница</option>
          <option value="services">Услуги</option>
          <option value="logistics">Логистика</option>
          <option value="other">Другое</option>
        </select>
        <div className="mt-1 text-xs text-slate-500">Влияет на industry hook в скрипте</div>
      </div>

      <button
        type="submit"
        disabled={busy || disabled}
        className="rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Запускаю звонок…" : "Позвонить"}
      </button>

      {result && (
        <div
          className={
            result.ok
              ? "rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900"
          }
        >
          {result.ok ? (
            <div>
              <div className="font-semibold">Звонок запущен ✓</div>
              <div className="mt-1 text-xs">
                callId: <code>{result.callId}</code>
                {result.callSessionHistoryId && (
                  <>
                    <br />
                    Voximplant session: <code>{result.callSessionHistoryId}</code>
                  </>
                )}
              </div>
              <div className="mt-2 text-xs text-emerald-700">
                Через 5–15 секунд должен зазвонить указанный телефон. После разговора запись и
                транскрипт появятся в журнале звонков.
              </div>
            </div>
          ) : (
            <div>
              <div className="font-semibold">Не удалось запустить</div>
              <div className="mt-1">{result.error}</div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
