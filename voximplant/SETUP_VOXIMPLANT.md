# Настройка Voximplant и первый реальный звонок

Этот гайд проведёт через все шаги от регистрации в Voximplant до момента, когда вы нажимаете «Позвонить» в админке Saymen и через 10 секунд звонит ваш телефон.

Время на всё — около 30–45 минут (часть из этого — ожидание верификации аккаунта и поступления баланса).

---

## Шаг 1. Регистрация в Voximplant

1. Открыть [voximplant.com/sign-up](https://voximplant.com/sign-up).
2. Зарегистрироваться. Дадут $5 на тесты бесплатно.
3. После подтверждения email — войти в [console.voximplant.com](https://console.voximplant.com/).

В правом верхнем углу — ваш `account_id` (число) и кнопка управления API-ключами.

---

## Шаг 2. Получить API-ключ

1. В консоли: **Settings → API keys → + Create**.
2. Назвать `saymen-orchestrator`. Скопировать значение — больше его не покажут.
3. Сохранить в `.env.local` Next.js-проекта:
   ```
   VOXIMPLANT_ACCOUNT_ID=12345
   VOXIMPLANT_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

---

## Шаг 3. Создать Application

В Voximplant вся логика звонков живёт внутри Applications.

1. **Applications → + Create application**.
2. Имя: `saymen-outbound`. Сохранить.
3. Зайти внутрь. На вкладке **Scenarios** загрузить файл `voximplant/scenario.js` из нашего проекта (через **+ Add → Upload from file**).
4. На вкладке **Routing** добавить правило:
   - Name: `default-outbound`
   - Pattern: `.*` (любой номер)
   - Scenarios: выбрать только что загруженный `scenario.js`
   - Сохранить
5. Скопировать **rule_id** правила (число вверху). Сохранить:
   ```
   VOXIMPLANT_RULE_ID=987654
   VOXIMPLANT_APPLICATION_ID=...
   ```

---

## Шаг 4. Купить номер (caller ID)

1. **Numbers → Buy** → выбрать страну РФ.
2. Для тестов берём городской номер любого региона — обычно ~150 ₽/мес. Для серьёзного обзвона лучше 8-800.
3. На вкладке **My numbers** привязать купленный номер к Application `saymen-outbound`.
4. Сохранить номер в формате E.164 (с `+`):
   ```
   VOXIMPLANT_CALLER_ID=+74950000000
   ```

⚠️ **Верификация номера**: для исходящих в РФ Voximplant потребует верификацию (загрузить документы — паспорт ИП/директора + договор). До верификации можно звонить только на ваш собственный номер, который вы укажете при регистрации. Этого достаточно для теста на ваш телефон.

---

## Шаг 5. Пополнить баланс

**Billing → Top-up**. Минимум 500 ₽ — этого хватит на ~50 тестовых звонков.

---

## Шаг 6. Открыть оркестратор для Voximplant

Voximplant запускает наш `scenario.js` на своих серверах. Этот сценарий должен подключиться WebSocket-ом к нашему оркестратору — но `ws://localhost:8080` ему недоступно. Нужен публичный URL.

В разработке — туннель.

### Вариант A: ngrok (5 минут, бесплатно)

```bash
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken <ваш токен с ngrok.com>

# в отдельном терминале (оркестратор должен быть запущен):
ngrok http 8080
```

ngrok покажет URL вида `https://a1b2-c3d4.ngrok-free.app`. WebSocket будет на `wss://a1b2-c3d4.ngrok-free.app/voice`. Сохранить:

```
VOXIMPLANT_PUBLIC_WS_URL=wss://a1b2-c3d4.ngrok-free.app/voice
VOXIMPLANT_WEBHOOK_SECRET=<любая длинная случайная строка>
```

⚠️ Бесплатный ngrok даёт новый URL при каждом перезапуске. На время теста держите его открытым.

### Вариант B: Cloudflare Tunnel (более надёжный, бесплатный)

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8080
```

Также покажет публичный URL `*.trycloudflare.com`, использовать аналогично.

### Вариант C: VPS на проде

Когда будем выходить из dev — арендуем VPS (например, в Yandex.Cloud или Selectel), деплоим оркестратор туда, прописываем DNS `orchestrator.saymen.io`, ставим reverse-proxy с TLS (Caddy умеет всё в одну строку).

---

## Шаг 7. Запустить всю цепочку

### 7.1. Запустить оркестратор в dev-режиме

`orchestrator/.env`:
```
ORCHESTRATOR_MODE=dev
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_DMITRY=...
DATABASE_URL=postgres://saymen:saymen_dev_password@localhost:5432/saymen_dev
VOXIMPLANT_WEBHOOK_SECRET=<тот же, что в .env.local>
```

```bash
cd ~/Code/saymen_next/orchestrator
npm run dev
```

### 7.2. Запустить ngrok

```bash
ngrok http 8080
```

Скопировать публичный wss-URL в `.env.local` Next.js (`VOXIMPLANT_PUBLIC_WS_URL`).

### 7.3. Запустить Next.js

```bash
cd ~/Code/saymen_next
npm run dev
```

### 7.4. Сделать первый звонок

Открыть [http://localhost:3000/dev/test-call](http://localhost:3000/dev/test-call).

Ввести **свой** номер. Имя/компанию/отрасль — на ваше усмотрение.

Нажать «Позвонить». Через 5–15 секунд телефон должен зазвонить — ответьте, услышите Дмитрия.

---

## Шаг 8. Что делать если звонок не идёт

### Voximplant вернул ошибку

В консоли Voximplant: **Logs → Calls** — последний вызов покажет, что случилось. Частые причины:
- Номер абонента не верифицирован (см. шаг 4).
- На балансе ноль.
- Routing не привязан к scenario.js.

### Звонок идёт, но Дмитрий молчит

1. Проверить логи оркестратора — открыл ли он WebSocket.
2. Проверить **Logs → Sessions** в Voximplant — он покажет события сценария.
3. Частая ошибка: `wsUrl` неверный, ngrok-туннель закрылся, не та переменная окружения.

### Дмитрий говорит, но я ничего не слышу

Скорее всего, конфликт sample rate. Voximplant по умолчанию шлёт 8000, а оркестратор ждёт 16000. В `voximplant/scenario.js` строка `const SAMPLE_RATE = 16000;` — должна совпадать с `sampleRate` в `orchestrator/src/session.ts`. По умолчанию у нас 16000 — этого достаточно.

### Качество звука плохое (металлический)

PCM 8 кГц звучит хуже, чем 16 кГц. Если оставите 16 кГц — будет ок. Для совсем хорошего качества можно перейти на 24 кГц (но потребует Voximplant Premium).

---

## Что после первого успешного звонка

Когда вы услышали Дмитрия по реальному телефону — это валидация всего проекта. Дальше:

1. Сделать 5–10 звонков **самому себе**, имитируя разные роли клиентов (директор аптеки, скептик, занятой). Слушать, что бот отвечает.
2. Записать пробелы и проблемы — несоответствия в голосе, странные паузы, неправильно собранный email. Поправить промт.
3. Сделать 10 звонков знакомым — они дадут более честную обратную связь.
4. Только потом — звонок незнакомому из вашей B2B-базы.

Если с первого звонка Дмитрий звучит хорошо — переходим к Фазе 0 как описано в `docs/Фаза_0_playbook_B2B_обзвон.docx`.

Если плохо — итерируем над `prompts/dmitry_persona.md`, голосом ElevenLabs (попробовать другие voice_id), параметрами TTS в `orchestrator/src/providers/tts.ts`.
