import { ImportForm } from "./import-form";

export const metadata = { title: "Saymen — импорт контактов" };

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">contacts / import</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Импорт базы контактов</h1>
        <p className="mt-2 text-slate-600">
          Загрузите CSV из парсинг-проекта (2GIS, Rusprofile и т.д.). Импортёр сам определит колонки
          по русским заголовкам, нормализует телефоны и проставит отрасль.
        </p>
      </div>

      <ImportForm />

      <div className="mt-12 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">Какие колонки понимает импортёр</div>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-4">Поле в БД</th>
              <th className="py-1">Заголовки в CSV (любой из)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Row field="company_name" hint="«Название», «Компания»" required />
            <Row
              field="phone"
              hint="«Все телефоны» (приоритет), «Телефон» — нормализуем в +7XXXXXXXXXX"
              required
            />
            <Row field="industry" hint="«Категория» — мапим на enum по ключевым словам" />
            <Row field="region" hint="«Регион», «Область»" />
            <Row field="city" hint="«Город»" />
            <Row field="website" hint="«Сайт»" />
            <Row field="known_email" hint="«Email» — берётся первый из списка" />
            <Row field="notes" hint="«Адрес» (или любые свободные заметки)" />
          </tbody>
        </table>
        <div className="mt-3 text-xs text-slate-500">
          Если в файле есть колонки, которых нет в этом списке — они просто игнорируются. Дубли по
          телефону внутри одной организации пропускаются автоматически.
        </div>
      </div>
    </main>
  );
}

function Row({ field, hint, required }: { field: string; hint: string; required?: boolean }) {
  return (
    <tr>
      <td className="py-1.5 pr-4 font-mono text-xs">
        {field}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </td>
      <td className="py-1.5 text-slate-700">{hint}</td>
    </tr>
  );
}
