import { VoiceTester } from "./voice-tester";

export const metadata = {
  title: "Saymen — голосовой тестер",
};

export default function VoiceTestPage() {
  const wsUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_WS_URL ?? "ws://localhost:8080/voice";
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-wider text-blue-700">
          dev / voice-test
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Голосовой тестер</h1>
        <p className="mt-2 text-slate-600">
          Поговорите с ботом «Дмитрий» через микрофон ноутбука. Без телефонии. Полезно для
          калибровки промта и подбора голоса.
        </p>
      </div>

      <VoiceTester wsUrl={wsUrl} />

      <div className="mt-12 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">Как это работает</div>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Браузер просит доступ к микрофону.</li>
          <li>Открывает WebSocket к оркестратору ({wsUrl}).</li>
          <li>Захватывает аудио, конвертирует в PCM 16 кГц моно, шлёт оркестратору.</li>
          <li>
            Оркестратор гонит ASR → LLM → TTS, шлёт обратно аудио + транскрипт. Браузер играет
            ответ через колонки.
          </li>
        </ol>
        <div className="mt-3 text-xs text-slate-500">
          Если в оркестраторе <code className="rounded bg-slate-100 px-1">ORCHESTRATOR_MODE=mock</code>
          — будут стабовые реплики и тишина вместо речи. Это нормально, проверяет пайплайн без
          оплаты API.
        </div>
      </div>
    </main>
  );
}
