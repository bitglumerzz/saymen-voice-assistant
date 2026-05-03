# Saymen Orchestrator

Голосовой оркестратор. Отдельный Node.js-процесс с WebSocket-сервером.

Он принимает звонок от Voximplant (или от dev-страницы в браузере), стримит аудио в Deepgram, получает текст реплики, передаёт в GPT-4o, получает ответ, синтезирует голос через ElevenLabs и шлёт обратно.

## Архитектура

```
Voximplant (PSTN)            браузер (dev-режим)
       │                            │
       └───────── WebSocket ────────┘
                     │
                     ▼
            ┌────────────────┐
            │   /voice (WS)  │
            │   server.ts    │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │  CallSession   │  ◄── состояние диалога
            └─┬────┬─────┬───┘
              │    │     │
              ▼    ▼     ▼
            ASR   LLM   TTS    ◄── провайдеры за интерфейсами
            │      │     │
            ▼      ▼     ▼
         Deepgram OpenAI ElevenLabs
```

## Файлы

| Файл | Назначение |
|---|---|
| `src/server.ts` | Точка входа, Fastify + WS-роуты |
| `src/session.ts` | CallSession — состояние одного звонка |
| `src/providers/asr.ts` | ASR: Deepgram + Mock |
| `src/providers/llm.ts` | LLM: OpenAI + Mock |
| `src/providers/tts.ts` | TTS: ElevenLabs + Mock |
| `src/providers/vad.ts` | VAD для barge-in (RMS, TODO: Silero) |
| `src/tools.ts` | Определения и обработчики LLM-инструментов |
| `src/prompt-loader.ts` | Загрузка промта из `prompts/dmitry_persona.md` |
| `src/types.ts` | Общие типы |
| `src/config.ts` | Парсинг ENV |
| `src/logger.ts` | Pino-логгер |

## Режимы работы

Управляется переменной `ORCHESTRATOR_MODE`:

- **`mock`** (по умолчанию) — все провайдеры заменены на стабы. Не нужны API-ключи. Полезно проверить пайплайн и WebSocket-связь.
- **`dev`** — реальные API, но без записи в БД. Считаем стоимость, тестируем качество.
- **`prod`** — всё как в продакшене: реальные API + сохранение в Postgres.

## Запуск

### Mock-режим (без оплаты API)

```bash
cd orchestrator
npm install
npm run dev
```

Запустится на `http://localhost:8080`. Health-check: `curl http://localhost:8080/health`.

### Dev-режим с реальным голосом

Создать `.env` в корне `orchestrator/` (или экспортировать переменные):

```bash
ORCHESTRATOR_MODE=dev
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_DMITRY=...
```

`npm run dev` — теперь оркестратор будет ходить в реальные API.

## Тестирование без телефонии (TODO в следующей итерации)

Будет браузерная страница в Next.js (`/dev/voice-test`), которая:
1. Запрашивает доступ к микрофону через `getUserMedia`.
2. Открывает WebSocket к оркестратору (`ws://localhost:8080/voice`).
3. Конвертирует поток в PCM 16kHz и шлёт как `audio_in`.
4. Принимает `audio_out`, играет через `<audio>`.

Запланировано в задаче «Browser dev tester».

## Что ещё TODO

- [ ] Silero VAD вместо энергетического — лучше работает на шумных линиях.
- [ ] Backchannels («угу», «понимаю») как отдельные предзаписанные семплы.
- [ ] Filler-фразы при > 500мс LLM-задержки.
- [ ] Запись разговора в S3.
- [ ] Persistence: сохранять `calls`, `transcript_turns`, `call_events` в Postgres.
- [ ] Webhook к Voximplant API для отправки команд (transfer на конкретный SIP).
- [ ] Метрики: latency-гистограммы (ASR / LLM / TTS) в Prometheus.
- [ ] Graceful shutdown с дозаписью активных звонков.

## Сценарий проверки в mock-режиме

После `npm run dev` подключиться к `ws://localhost:8080/voice?callId=test1` любым WS-клиентом (например, [websocat](https://github.com/vi/websocat)):

```bash
websocat ws://localhost:8080/voice?callId=test1
```

В логах должно быть видно: бот произнёс открытие, mock-ASR начал имитировать реплики, mock-LLM генерирует ответы. Это подтверждает, что весь пайплайн собран правильно.
