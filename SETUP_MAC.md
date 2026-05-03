# Развёртывание на Mac mini M4 (Apple Silicon)

Пошаговая инструкция, чтобы запустить весь проект локально на M4 за ~15 минут. Все команды проверены под macOS 14+ на arm64.

---

## 1. Установить инструменты разработчика

Открыть Terminal (`Cmd + Space` → `terminal`).

### Homebrew (если ещё нет)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

После установки выполнить то, что Homebrew попросит вписать в `~/.zprofile` (даст конкретные команды).

### Node.js 20+

```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version    # должно быть v20.x или выше
```

### Git

```bash
brew install git
```

### Docker Desktop

Скачать с [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) — выбрать «Mac with Apple Silicon». Установить, запустить, дождаться зелёной иконки в меню-баре. На M4 он использует виртуализацию через Rosetta или нативные образы — оба работают.

Проверить:

```bash
docker --version           # Docker version 27+
docker compose version     # Docker Compose v2+
```

### (Опционально) Полезные утилиты

```bash
brew install --cask visual-studio-code   # IDE
brew install jq websocat                 # JSON и WebSocket клиенты для отладки
```

---

## 2. Получить код

Если проект ещё не у вас локально, скопируйте папку `saymen_next` (которую мы наполняем в этом чате) на Mac mini, например в `~/Code/saymen_next`. Все следующие команды выполняются из неё:

```bash
cd ~/Code/saymen_next
```

Если у вас Git-репозиторий — просто `git clone <ссылка>` и `cd saymen_next`.

---

## 3. Поднять Postgres + Redis

```bash
docker compose up -d
```

Проверить, что работает:

```bash
docker compose ps
# должно быть два контейнера: saymen_postgres и saymen_redis, status "running (healthy)"
```

Если что-то не запустилось — `docker compose logs postgres` покажет причину.

---

## 4. Настроить Next.js (админка)

```bash
# В корне проекта
cp .env.example .env.local
npm install
```

Ничего в `.env.local` менять не обязательно — дефолты работают для локальной разработки.

Применить схему БД:

```bash
npm run db:push
# увидите список таблиц: organizations, users, campaigns, contacts, calls, ...
```

Запустить:

```bash
npm run dev
```

Открыть [http://localhost:3000](http://localhost:3000) — должна показаться главная страница админки.

Health-check: [http://localhost:3000/api/health](http://localhost:3000/api/health) — должен вернуть `"status": "ok"` и список сконфигурированных провайдеров (пустой пока).

---

## 5. Настроить оркестратор

В **новом окне терминала** (Next.js пусть работает):

```bash
cd ~/Code/saymen_next/orchestrator
npm install
npm run dev
```

В логах должно появиться:

```
🎙  orchestrator started   port=8080  mode=mock
```

Проверка:

```bash
curl http://localhost:8080/health
# {"status":"ok","mode":"mock",...}
```

---

## 6. Услышать бота 🎙

Откройте [http://localhost:3000/dev/voice-test](http://localhost:3000/dev/voice-test).

1. Нажать **«Начать разговор»**.
2. Браузер попросит разрешение на микрофон — разрешить.
3. Бот скажет приветствие (в mock-режиме — тишина той же длительности; реплики появятся в транскрипте).
4. Можно говорить — mock-ASR имитирует распознавание, mock-LLM генерирует ответы.

Если статус-бейдж бегает между `Слушает вас` → `Думает` → `Говорит` — пайплайн собран правильно.

---

## 7. Включить реальный голос (стоит денег)

Чтобы услышать настоящего Дмитрия с голосом ElevenLabs и LLM-ответами от GPT-4o:

### 7.1. Зарегистрироваться у провайдеров

| Провайдер | Что нужно | Минимальный депозит |
|---|---|---|
| **OpenAI** | Аккаунт + API ключ + пополненный баланс | $5–10 (хватит на сотни звонков для теста) |
| **Deepgram** | Аккаунт, API ключ. Дают $200 кредитов на старт | бесплатно |
| **ElevenLabs** | План Starter $5/мес или выше — нужен для streaming + multilingual Turbo v2.5 | $5 |

### 7.2. Подобрать голос Дмитрия

Зайти в [ElevenLabs Voice Library](https://elevenlabs.io/app/voice-library), отфильтровать `male`, `russian` или `multilingual`, послушать 5–10 кандидатов. Скопировать `Voice ID` понравившегося.

Хорошие отправные точки: `Daniel`, `Charlie`, `Adam` в multilingual режиме.

### 7.3. Прописать ключи

В `orchestrator/`:

```bash
cd ~/Code/saymen_next/orchestrator
cat > .env <<'EOF'
ORCHESTRATOR_MODE=dev
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_DMITRY=...
EOF
```

Перезапустить оркестратор (Ctrl+C, потом `npm run dev`). В логах должно быть `mode=dev`.

Снова открыть [http://localhost:3000/dev/voice-test](http://localhost:3000/dev/voice-test) — теперь Дмитрий заговорит реальным голосом и будет реагировать осмысленно.

---

## 8. Что делать, если что-то не работает

### Docker контейнер падает

```bash
docker compose logs postgres        # смотрим причину
docker compose down -v              # сбросить данные
docker compose up -d                # поднять заново
```

### `npm install` ругается на `node-gyp` или нативные модули

На Apple Silicon это бывает с устаревшими пакетами. У нас в стеке такого не должно быть, но если случится:

```bash
xcode-select --install              # установить Command Line Tools
npm rebuild
```

### Браузер не даёт доступ к микрофону

`getUserMedia` работает только на `localhost` и `https://`. На `localhost:3000` всё хорошо. Если открываете с другого устройства по IP — нужен HTTPS.

### Слышу эхо себя при разговоре

В коде включены `echoCancellation` и `noiseSuppression`, но если M4 + наушники с микрофоном дают эхо — попробуйте:
- использовать AirPods или внешний микрофон вместо встроенного;
- закрыть колонки наушниками или уменьшить громкость на 30%.

---

## 9. Запустить «как сервис», чтобы не держать терминал

Когда нужно, чтобы оркестратор работал в фоне 24/7:

```bash
# Вариант 1: pm2
npm install -g pm2
cd ~/Code/saymen_next/orchestrator
pm2 start npm --name saymen-orchestrator -- run dev
pm2 save
pm2 startup       # инструкция, как сделать автозапуск при загрузке Mac
```

Для Next.js:

```bash
cd ~/Code/saymen_next
npm run build
pm2 start npm --name saymen-admin -- run start
```

---

## 10. Чек-лист «всё ли я установил»

```bash
node --version        # >= 20
npm --version
docker --version
docker compose version

cd ~/Code/saymen_next
docker compose ps                                  # 2 контейнера UP
curl -s http://localhost:3000/api/health | jq .    # status: ok
curl -s http://localhost:8080/health | jq .        # status: ok
```

Если все четыре последние команды отвечают как ожидается — Mac mini готов как dev-сервер.

---

## 11. Что делать дальше

После того как услышите голос Дмитрия:

1. Сделать 20–30 ролевых разговоров и записать, что в речи бота звучит «по-роботу». Поправить параметры голоса (Stability/Similarity в `orchestrator/src/providers/tts.ts`) и/или промт в `prompts/dmitry_persona.md`.
2. Зарегистрироваться в Voximplant, купить номер, залить `voximplant/scenario.js`, протестировать живой звонок самому себе.
3. Подключить запись разговоров в S3 (Yandex Object Storage).
4. Допиливать админку: загрузка CSV-базы, страницы кампаний и журнала звонков.

Этот документ — точка входа в проект для разработчика, который придёт помогать. Основная техническая концепция — `docs/Голосовой_ассистент_концепция_v0.1.docx`, тактический план — `docs/Фаза_0_playbook_B2B_обзвон.docx`.
