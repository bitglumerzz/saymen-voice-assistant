"use client";

import { useState } from "react";

type PreviewResult = {
  ok: true;
  preview: {
    detectedColumns: Record<string, string | null>;
    totalRows: number;
    totalValid?: number;
    validRows: Array<Record<string, unknown>>;
    errors: Array<{ rowIndex: number; reason: string }>;
  };
};

type ImportResult = {
  ok: true;
  inserted: number;
  skipped: number;
  errorsCount: number;
  sampleErrors: Array<{ rowIndex: number; reason: string }>;
};

type ErrorResult = { ok: false; error: string };

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | ErrorResult | null>(null);
  const [imported, setImported] = useState<ImportResult | ErrorResult | null>(null);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    if (dryRun) setPreview(null);
    else setImported(null);

    const fd = new FormData();
    fd.append("file", file);
    if (dryRun) fd.append("dryRun", "1");

    try {
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const data = await res.json();
      if (dryRun) setPreview(data);
      else setImported(data);
    } catch (e) {
      const errorData: ErrorResult = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
      if (dryRun) setPreview(errorData);
      else setImported(errorData);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block">
          <div className="mb-2 text-sm font-semibold text-slate-700">CSV-файл</div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setImported(null);
            }}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />
        </label>
        {file && (
          <div className="mt-2 text-xs text-slate-500">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            disabled={!file || busy}
            onClick={() => send(true)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy && preview === null ? "Анализирую…" : "Предпросмотр"}
          </button>
          <button
            disabled={!file || busy || (preview !== null && !preview.ok)}
            onClick={() => send(false)}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy && imported === null ? "Импортирую…" : "Импортировать"}
          </button>
        </div>
      </div>

      {preview && !preview.ok && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="font-semibold">Не получилось распарсить</div>
          <div className="mt-1">{preview.error}</div>
        </div>
      )}

      {preview && preview.ok && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            Предпросмотр · найдено валидных {preview.preview.totalValid ?? preview.preview.validRows.length} из{" "}
            {preview.preview.totalRows}
          </div>

          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Распознанные колонки
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(preview.preview.detectedColumns).map(([field, header]) => (
                <div key={field} className="flex justify-between">
                  <span className="font-mono text-slate-700">{field}</span>
                  <span className={header ? "text-slate-600" : "text-slate-400"}>
                    {header ?? "не найдено"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Первые 10 строк после нормализации
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-1 pr-3">Компания</th>
                    <th className="py-1 pr-3">Телефон</th>
                    <th className="py-1 pr-3">Город</th>
                    <th className="py-1 pr-3">Отрасль</th>
                    <th className="py-1">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.preview.validRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3">{String(r.companyName ?? "")}</td>
                      <td className="py-1.5 pr-3 font-mono">{String(r.phone ?? "")}</td>
                      <td className="py-1.5 pr-3">{String(r.city ?? "")}</td>
                      <td className="py-1.5 pr-3">{String(r.industry ?? "")}</td>
                      <td className="py-1.5">{String(r.knownEmail ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.preview.errors.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                Ошибок: {preview.preview.errors.length}
              </div>
              <ul className="space-y-1 text-xs text-rose-800">
                {preview.preview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    Строка {e.rowIndex}: {e.reason}
                  </li>
                ))}
                {preview.preview.errors.length > 5 && (
                  <li className="text-rose-500">… и ещё {preview.preview.errors.length - 5}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {imported && imported.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">Импорт завершён ✓</div>
          <div className="mt-1">
            Добавлено: <strong>{imported.inserted}</strong> · Пропущено как дубликаты:{" "}
            <strong>{imported.skipped}</strong> · Невалидных строк: <strong>{imported.errorsCount}</strong>
          </div>
        </div>
      )}

      {imported && !imported.ok && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="font-semibold">Не удалось импортировать</div>
          <div className="mt-1">{imported.error}</div>
        </div>
      )}
    </div>
  );
}
