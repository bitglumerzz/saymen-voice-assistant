# Saymen — голосовой ИИ-ассистент для бизнеса

> Open-source платформа для голосовых ИИ-ассистентов: принимает входящие звонки, обзванивает клиентов, отвечает в мессенджерах. Несколько каналов — единая логика диалога.

Архитектурный аналог Mango Office / Voximplant Avatar / robovoice, но на современных LLM (Claude / GPT-4o) с pluggable-провайдерами для ASR, LLM, TTS и телефонии.

## Что внутри

```
┌────────────────────────────────────────────────────────────┐
│                  Saymen Voice Platform                     │
├────────────────────────────────────────────────────────────┤
│   Каналы                  Статус                           │
│   ─ Telegram-бот          ✓  работает                      │
│   ─ Voximplant SIP        🚧 код готов, нужна настройка    │
│   ─ Web-виджет (WebRTC)   🚧 в разработке                  │
├────────────────────────────────────────────────────────────┤
│   Общий пайплайн (одинаков для всех каналов):              │
│                                                            │
│     Аудио → ASR → LLM → инструменты → TTS → Аудио          │
│                                                            │
│   Провайдеры (за интерфейсами, заменяемы):                 │
│     ASR:   Deepgram Nova-3                                 │
│     LLM:   Claude Sonnet 4.6  /  GPT-4o                    │
│     TTS:   ElevenLabs Turbo v2.5                           │
└────────────────────────────────────────────────────────────┘
```

## Реализация в этом репозитории

В первую очередь — **рабочий Telegram-бот «Дмитрий»**: B2B-ассистент Saymen, помогает кватифицировать клиента и собрать email для коммерческого. Записывает голосовые → распознаёт → генерирует ответ через Claude → озвучивает ElevenLabs → отправляет голосом в чат. Все диалоги пишутся в Postgres (общий журнал звонков и Telegram-чатов).

Параллельно собран и оттестирован каркас для звонков через Voximplant (PSTN/SIP). Код готов, нужна аккаунт + туннель.

## Быстрый старт

Подробная инструкция: [QUICKSTART.md](QUICKSTART.md). Если на macOS / Mac mini — [SETUP_MAC.md](SETUP_MAC.md).

Минимально:

```bash
git clone <ваш-форк-этого-репо>
cd Saymen_bot

# Postgres + Redis в Docker
docker compose up -d

# Зависимости
npm install
(cd orchestrator && npm install)

# Конфиг
cp .env.example .env.local
# Открыть .env.local и заполнить ключи (минимум — DATABASE_URL подцепится из docker-compose)

# Схема БД
npm run db:push

# Запуск (в двух окнах терминала)
npm run dev                                 # админка → http://localhost:3030
cd orchestrator && npm run dev              # оркестратор → :8181
```

**Только для Telegram-бота** — в `orchestrator/.env` дополнительно:
- `TELEGRAM_BOT_TOKEN` (получить в [@BotFather](https://t.me/BotFather))
- `OPENAI_API_KEY` или `ANTHROPIC_API_KEY` (хотя бы один LLM)
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID_DMITRY`
- `ORCHESTRATOR_MODE=dev`

Полный гайд: [orchestrator/SETUP_TELEGRAM.md](orchestrator/SETUP_TELEGRAM.md).

## Структура репозитория

```
Saymen_bot/
├── src/                       # Next.js админка (порт 3030)
│   ├── app/                   # App Router — страницы и API
│   │   ├── api/calls/         # эндпоинт запуска звонка через Voximplant
│   │   ├── dev/voice-test/    # браузерный тестер микрофона
│   │   └── dev/test-call/     # форма для тестового SIP-звонка
│   └── lib/
├── orchestrator/              # Голосовой оркестратор (Node.js, порт 8181)
│   ├── src/
│   │   ├── server.ts          # Fastify + WebSocket
│   │   ├── session.ts         # CallSession — состояние одного звонка
│   │   ├── telegram-bot.ts    # Telegram-канал
│   │   ├── providers/         # ASR / LLM / TTS / VAD за интерфейсами
│   │   ├── tools.ts           # Инструменты, доступные LLM
│   │   ├── prompt-loader.ts   # Чтение system prompt из файла
│   │   └── db.ts              # Persistence (calls, transcript_turns)
│   └── SETUP_TELEGRAM.md      # Гайд по настройке Telegram-канала
├── voximplant/                # JS-сценарий VoxEngine + гайд
├── db/                        # Drizzle ORM-схема (PostgreSQL)
├── prompts/                   # System prompts
│   └── dmitry_persona.md      # Промт «Дмитрий из Saymen»
├── data/                      # CSV-шаблоны и инструкции
├── email_templates/           # HTML-шаблон коммерческого предложения
├── docs/                      # Концепция (Word) + playbook
├── docker-compose.yml         # Postgres + Redis для разработки
├── drizzle.config.ts
└── tsconfig.json
```

## Архитектурные решения

**Pluggable-провайдеры.** Все внешние сервисы (LLM, ASR, TTS, телефония, email) за интерфейсами. Это критически важно для будущей миграции на собственный inference (свой GPU-сервер) — критерии перехода описаны в концепт-документе.

**Multi-tenancy с самого начала.** Все таблицы привязаны к `organization_id`, даже когда организация одна. Поздняя миграция мульти-арендности всегда болезненна.

**Стоимость в копейках.** Все денежные поля — `integer` копейки, никаких `float`/`numeric`.

**Аудио отдельно от БД.** В Postgres только URL, сами записи в S3 (Yandex Object Storage). С TTL на удаление.

**Транскрипт по реплике.** Таблица `transcript_turns` — гибкий поиск и аналитика, не один большой текстовый блоб.

## Roadmap

- [x] Telegram-канал (голосовые в обе стороны, persistence)
- [x] Каркас Voximplant-сценария + Next.js API для запуска звонков
- [x] Браузерный тестер голоса (для калибровки промта без телефонии)
- [ ] Verify Voximplant + первый реальный звонок
- [ ] Импорт CSV-баз контактов (от парсинг-проекта)
- [ ] Менеджер кампаний (расписание, retry, rate limit, стоп-лист)
- [ ] Журнал звонков в админке (прослушивание, поиск по транскриптам)
- [ ] Email-рассылка КП после успешного звонка (Unisender)
- [ ] Интеграции с amoCRM и Bitrix24
- [ ] Web-виджет (LiveKit WebRTC)
- [ ] Миграция на собственный inference (Llama / Qwen на vLLM)

## Документы

- [Концепция продукта (Word)](docs/Голосовой_ассистент_концепция_v0.1.docx) — архитектура, выбор стека, юридические аспекты, метрики, риски.
- [Playbook Фазы 0 (Word)](docs/Фаза_0_playbook_B2B_обзвон.docx) — тактический план запуска холодного B2B-обзвона за 6 недель.

## Контрибуции

Issues и PR welcome. Стиль кода — TypeScript strict, формат — Prettier (запускается через `npm run format`).

## Лицензия

MIT — см. [LICENSE](LICENSE).

## Контакты

Антон Майоров — `mobilrai7@gmail.com`
