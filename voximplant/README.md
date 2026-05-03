# Voximplant — сценарий и инструкция по подключению

Это серверная часть, которая живёт на платформе Voximplant и связывает PSTN-звонок с нашим оркестратором.

## scenario.js

JS-сценарий VoxEngine. Запускается на серверах Voximplant при каждом исходящем звонке. Не наш Node.js.

### Что делает

1. Принимает параметры через `customData` при `StartScenarios` — номер абонента, контекст звонка, URL оркестратора.
2. Вызывает PSTN-номер с нашего арендованного caller ID.
3. После ответа абонента открывает WebSocket к нашему оркестратору на `/voice`.
4. Бриджит аудио в обе стороны (PCM 16-bit linear, 16 kHz, mono).
5. Слушает control-команды от оркестратора: `say`, `transfer`, `hangup`.

### Подключение к Voximplant

1. Зарегистрироваться: [voximplant.com](https://voximplant.com/) → Sign Up.
2. Создать **Application** — например, `saymen-outbound`.
3. В **Scenarios** загрузить этот файл, привязать к Application.
4. В **Routing** добавить правило: пустое условие → этот сценарий (для исходящих).
5. Купить номер в **Numbers** (РФ городской или 8-800).

### Запуск исходящего звонка

Со стороны нашего бэкенда:

```ts
import { VoximplantApiClient } from "@voximplant/apiclient-nodejs";

const client = new VoximplantApiClient({ /* credentials */ });

await client.Scenarios.startScenarios({
  ruleId: 12345, // ID правила в Voximplant
  scriptCustomData: JSON.stringify({
    calleeNumber: "+79001234567",
    callerId: "+74950000000",
    callId: "uuid-of-our-call",
    contactId: "...",
    campaignId: "...",
    organizationId: "...",
    industry: "pharmacy",
    dmName: "Иван Иванович",
    company: "ООО Аптека Плюс",
    wsUrl: "wss://orchestrator.saymen.io/voice",
    wsSecret: "<секрет из VOXIMPLANT_WEBHOOK_SECRET>",
  }),
});
```

### Локальное тестирование

Сценарий запустится только на серверах Voximplant — локально его не выполнить. Альтернативный способ протестировать оркестратор без телефонии — браузерный режим (см. `orchestrator/README.md`, секция «Dev mode без телефонии»).

### Стоимость

- Аренда номера РФ городского: ~150–300 ₽/мес.
- Исходящий звонок по РФ (городские/мобильные): 1.5–4 ₽/мин в зависимости от направления.
- WebSocket-трафик и сценарий: бесплатно при наличии активного баланса.
