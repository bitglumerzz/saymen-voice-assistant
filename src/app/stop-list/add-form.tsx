"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StopListAddForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("+7");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stop-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, reason }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Ошибка");
        return;
      }
      setPhone("+7");
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Телефон
          </label>
          <input
            type="tel"
            required
            pattern="^\+7\d{10}$"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
            placeholder="+79001234567"
          />
        </div>
        <div className="flex-[2]">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Причина (опционально)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Просил не звонить"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "Добавляю…" : "Добавить"}
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">{error}</div>
      )}
    </form>
  );
}
