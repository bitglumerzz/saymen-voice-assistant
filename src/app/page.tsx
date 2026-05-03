import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">
          saymen_next
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Голосовой ИИ-ассистент для бизнеса
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          Каркас Фазы 0. Здесь будет админка кампаний, контакты, журнал звонков и аналитика.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <NavCard
          href="/campaigns"
          title="Кампании"
          description="Запуск и мониторинг исходящих обзвонов"
          stub
        />
        <NavCard
          href="/contacts"
          title="Контакты"
          description="Загрузка CSV, сегментация, стоп-лист"
          stub
        />
        <NavCard
          href="/calls"
          title="Журнал звонков"
          description="Транскрипты, аудиозаписи, итоги"
          stub
        />
        <NavCard
          href="/analytics"
          title="Аналитика"
          description="Воронка, конверсии, метрики качества"
          stub
        />
      </section>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <div>
          Версия 0.1 — каркас. Следующие шаги в{" "}
          <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">README.md</code>.
        </div>
        <div className="mt-1 flex flex-wrap gap-4">
          <Link href="/dev/voice-test" className="text-blue-700 hover:underline">
            🎙 Голосовой тестер (без телефонии)
          </Link>
          <Link href="/dev/test-call" className="text-blue-700 hover:underline">
            📞 Тестовый звонок (Voximplant)
          </Link>
          <Link href="/api/health" className="text-blue-700 hover:underline">
            Health-check API
          </Link>
        </div>
      </footer>
    </main>
  );
}

function NavCard({
  href,
  title,
  description,
  stub,
}: {
  href: string;
  title: string;
  description: string;
  stub?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {stub && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            заглушка
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-3 text-sm font-medium text-slate-400">{href}</div>
    </div>
  );
}
