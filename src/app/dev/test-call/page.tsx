import { TestCallForm } from "./test-call-form";

export const metadata = { title: "Saymen — тестовый звонок" };

export default function TestCallPage() {
  const ready = !!(
    process.env.VOXIMPLANT_ACCOUNT_ID &&
    process.env.VOXIMPLANT_API_KEY &&
    process.env.VOXIMPLANT_RULE_ID &&
    process.env.VOXIMPLANT_CALLER_ID &&
    process.env.VOXIMPLANT_PUBLIC_WS_URL
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">
          dev / test-call
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Тестовый звонок через Voximplant</h1>
        <p className="mt-2 text-slate-600">
          Запустить один исходящий звонок на указанный номер. Бот «Дмитрий» проведёт диалог по
          скрипту. Цель — услышать продукт на реальной телефонной линии.
        </p>
      </div>

      {!ready && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Voximplant ещё не настроен</div>
          <div className="mt-1">
            В <code>.env.local</code> заполните <code>VOXIMPLANT_ACCOUNT_ID</code>,{" "}
            <code>VOXIMPLANT_API_KEY</code>, <code>VOXIMPLANT_RULE_ID</code>,{" "}
            <code>VOXIMPLANT_CALLER_ID</code>, <code>VOXIMPLANT_PUBLIC_WS_URL</code>. Подробности —
            в <code>voximplant/README.md</code>.
          </div>
        </div>
      )}

      <TestCallForm disabled={!ready} />

      <div className="mt-12 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">Чек-лист перед первым звонком</div>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Voximplant Application создан, scenario.js загружен, Rule привязан.</li>
          <li>Арендованный номер прописан в VOXIMPLANT_CALLER_ID.</li>
          <li>
            Оркестратор запущен в режиме <code>dev</code> (с реальными ASR/LLM/TTS-ключами).
          </li>
          <li>
            Оркестратор виден извне — туннель ngrok/cloudflared, URL вида{" "}
            <code>wss://...</code> в <code>VOXIMPLANT_PUBLIC_WS_URL</code>.
          </li>
          <li>На балансе Voximplant есть деньги (даже на пробный звонок).</li>
        </ul>
      </div>
    </main>
  );
}
