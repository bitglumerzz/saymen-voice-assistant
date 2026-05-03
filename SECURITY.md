# Безопасность и обработка секретов

## Что НЕ должно попадать в репозиторий

- `.env`, `.env.local`, `.env.production*`, `.env.backup*` — все файлы с реальными секретами
- `orchestrator/.env` — отдельный файл для оркестратора
- API-ключи в коде в виде литералов
- Дампы БД с реальными данными клиентов
- Аудиозаписи реальных звонков (`*.wav`, `*.mp3`, `*.opus`, директория `recordings/`)
- Загруженные базы контактов (`data/uploads/`, `*.local.csv`)

Все эти пути уже в `.gitignore`. Не убирайте.

## Если случайно закоммитили секрет

1. Немедленно отозвать (revoke) утёкший ключ в консоли провайдера:
   - OpenAI: <https://platform.openai.com/api-keys>
   - Anthropic: <https://console.anthropic.com/settings/keys>
   - Deepgram: <https://console.deepgram.com>
   - ElevenLabs: <https://elevenlabs.io/app/settings/api-keys>
   - Telegram bot: написать `/revoke` в [@BotFather](https://t.me/BotFather)
   - Voximplant: Settings → API Keys → Revoke
2. Создать новый ключ.
3. Удалить из истории git: `git filter-repo --path <file> --invert-paths` (или `git filter-branch`).
4. Force-push. Предупредить всех контрибьюторов перерасклонить репо.

## Безопасный паст ключей в .env

Для macOS/Linux — используйте скрытый ввод и автоочистку от управляющих символов:

```bash
read -rs "KEY?Введите ключ: "
echo
KEY=$(printf '%s' "$KEY" | tr -d '[:cntrl:]' | tr -d ' ')
sed -i '' "s|^MY_API_KEY=.*|MY_API_KEY=${KEY}|" .env
unset KEY
```

`tr -d '[:cntrl:]'` снимает escape-последовательности от стрелок и других управляющих символов, которые иногда попадают в clipboard и не видны глазом, но ломают аутентификацию.

## Уязвимости в зависимостях

`npm audit` показывает текущие CVE. Перед каждым релизом:

```bash
npm audit
npm audit --production    # только prod-зависимости, без dev
```

Critical/High в prod-зависимостях — блокер для деплоя.

## Сообщить об уязвимости

Если нашли security-issue — пишите на `mobilrai7@gmail.com` с темой `[SAYMEN SECURITY]`. Не открывайте публичный issue с деталями уязвимости.
