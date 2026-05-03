# Saymen — быстрый старт на Mac mini M4

Команды по порядку. Каждый блок — копировать и вставить в Terminal.

Подробная версия с пояснениями — в `SETUP_MAC.md`. Если впервые на Mac или впервые в командной строке — пользуйтесь сначала тем гайдом.

---

## 0. Открыть Terminal

`Cmd + Space` → набрать `terminal` → Enter.

## 1. Проверить, что установлено

```bash
node --version
docker --version
```

Должно быть `v20.x` (или выше) и `Docker version 27.x` (или выше). Если нет — пройти раздел 2; если есть — переходить к разделу 3.

## 2. Установить недостающее (только если нужно)

### Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

После завершения — выполнить команды, которые Homebrew сам выведет в конце (про `~/.zprofile`).

### Node.js 20

```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version
```

### Docker Desktop

```bash
brew install --cask docker
open /Applications/Docker.app
```

Docker Desktop запустится — дождаться зелёной иконки в меню-баре (15–30 сек), потом продолжать.

## 3. Перейти в проект

```bash
cd ~/Documents/Claude/Projects/saymen_next
ls
```

В выводе должны быть: `README.md`, `package.json`, `orchestrator/`, `src/`, `db/`, `prompts/`, `voximplant/`, `docker-compose.yml`.

## 4. Поднять Postgres и Redis

```bash
docker compose up -d
docker compose ps
```

Оба контейнера должны быть `running (healthy)`. Если нет — `docker compose logs postgres` покажет почему.

## 5. Установить npm-зависимости

```bash
npm install
cd orchestrator && npm install && cd ..
```

Около 3–5 минут на оба раза. Можно идти заваривать чай.

## 6. Создать .env.local

```bash
cp .env.example .env.local
```

Для первого запуска править не нужно — дефолты подходят.

## 7. Применить схему БД

```bash
npm run db:push
```

На вопрос Drizzle Kit — нажать `y`. Создаст 11 таблиц.

## 8. Запустить серверы (в двух окнах Terminal)

### Окно 1 — Next.js (админка)

```bash
cd ~/Documents/Claude/Projects/saymen_next
npm run dev
```

В логах: `Ready in <ms>` и `Local: http://localhost:3000`.

### Окно 2 — оркестратор

Новый таб: `Cmd + T`.

```bash
cd ~/Documents/Claude/Projects/saymen_next/orchestrator
npm run dev
```

В логах: `🎙 orchestrator started port=8080 mode=mock`.

Оба окна оставить открытыми — серверы работают, пока окна живы.

## 9. Проверить, что всё поднялось

В третьем окне Terminal (`Cmd + T`):

```bash
curl http://localhost:3000/api/health
curl http://localhost:8080/health
```

Оба должны ответить `"status":"ok"`.

## 10. Открыть в браузере

- Главная админка: <http://localhost:3000>
- Голосовой тестер: <http://localhost:3000/dev/voice-test>
- Тестовый звонок (когда Voximplant настроен): <http://localhost:3000/dev/test-call>

В голосовом тестере: «Начать разговор» → разрешить микрофон. В mock-режиме услышите тишину той же длительности, что и реплика бота, но в транскрипте появятся фейковые реплики — пайплайн работает.

---

## Включить реальный голос (когда захотите)

Когда зарегистрируетесь в OpenAI / Deepgram / ElevenLabs:

```bash
cd ~/Documents/Claude/Projects/saymen_next/orchestrator
cat > .env <<'EOF'
ORCHESTRATOR_MODE=dev
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_DMITRY=...
DATABASE_URL=postgres://saymen:saymen_dev_password@localhost:5432/saymen_dev
EOF
```

Перезапустить оркестратор (Ctrl+C, потом `npm run dev`). Теперь Дмитрий заговорит на русском настоящим голосом.

---

## Реальный звонок через Voximplant

Отдельный гайд — `voximplant/SETUP_VOXIMPLANT.md`. Сначала пройдите шаги 1–7 здесь, потом туда.

---

## Полезные команды

```bash
# Остановить Postgres/Redis (данные останутся)
docker compose down

# Полностью сбросить БД и поднять заново
docker compose down -v && docker compose up -d && npm run db:push

# Посмотреть БД через UI
npm run db:studio       # откроет local.drizzle.studio

# Проверка типов
npm run typecheck
cd orchestrator && npx tsc --noEmit && cd ..

# Если порт 3000 или 8080 занят (другое приложение)
lsof -i :3000           # узнать PID
kill -9 <PID>
```

## Если что-то не работает

| Симптом | Что делать |
|---|---|
| `npm install` падает с ошибкой `node-gyp` | `xcode-select --install` затем повторить |
| Docker сообщает «cannot connect to daemon» | Запустить Docker Desktop, дождаться зелёной иконки |
| `npm run db:push` ругается на подключение | `docker compose ps` — Postgres healthy? Если нет — `docker compose logs postgres` |
| Браузер не даёт доступ к микрофону | Проверить, что URL `http://localhost:3000`, а не IP. На localhost разрешено |
| Next.js падает при старте | `rm -rf .next node_modules && npm install && npm run dev` |
| Оркестратор падает с `Cannot find module` | `cd orchestrator && rm -rf node_modules && npm install` |

## Бэкап и git

Чтобы не потерять прогресс — инициализируйте git:

```bash
cd ~/Documents/Claude/Projects/saymen_next
git init
git add .
git commit -m "Saymen: caркас Фазы 0"
```

Завести приватный репозиторий на GitHub и пушить туда регулярно.
