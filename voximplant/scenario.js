/**
 * Voximplant VoxEngine-сценарий для исходящих звонков Saymen.
 *
 * Что делает:
 *   1. По вызову от внешнего API (StartScenarios) запускает исходящий звонок на calleeNumber.
 *   2. После ответа абонента открывает WebSocket к нашему оркестратору.
 *   3. Бриджит аудио: входящее с линии шлёт в WS как audio_in (base64 PCM 16kHz mono).
 *   4. Принимает audio_out от оркестратора — проигрывает абоненту.
 *   5. На команду transfer/hangup от оркестратора — переводит/завершает.
 *
 * Этот файл заливается в Voximplant Application как scenario.
 *
 * Параметры передаются через customData при StartScenarios:
 *   {
 *     "callerId": "+74950000000",
 *     "calleeNumber": "+79001234567",
 *     "callId": "uuid",
 *     "contactId": "uuid",
 *     "campaignId": "uuid",
 *     "organizationId": "uuid",
 *     "industry": "pharmacy",
 *     "dmName": "Иван Иванович",
 *     "company": "ООО Аптека Плюс",
 *     "wsUrl": "wss://orchestrator.saymen.io/voice",
 *     "wsSecret": "..."
 *   }
 */

require(Modules.WebSocket);

const SAMPLE_RATE = 16000; // PCM16 mono — то, что ждёт оркестратор

VoxEngine.addEventListener(AppEvents.Started, onStarted);

function onStarted(e) {
  const data = JSON.parse(VoxEngine.customData() || "{}");
  if (!data.calleeNumber || !data.wsUrl) {
    Logger.write("[saymen] нет calleeNumber или wsUrl, выходим");
    VoxEngine.terminate();
    return;
  }

  Logger.write(`[saymen] starting outbound call to ${data.calleeNumber}`);

  const call = VoxEngine.callPSTN(data.calleeNumber, data.callerId);
  call.addEventListener(CallEvents.Connected, () => onCallConnected(call, data));
  call.addEventListener(CallEvents.Failed, (ev) => {
    Logger.write(`[saymen] call failed: ${ev.code} ${ev.reason}`);
    VoxEngine.terminate();
  });
  call.addEventListener(CallEvents.Disconnected, () => {
    Logger.write("[saymen] call disconnected");
    VoxEngine.terminate();
  });
}

function onCallConnected(call, data) {
  Logger.write("[saymen] call answered, opening WS to orchestrator");

  const wsUrl = appendQuery(data.wsUrl, {
    secret: data.wsSecret || "",
    callId: data.callId,
    contactId: data.contactId,
    campaignId: data.campaignId,
    organizationId: data.organizationId,
    industry: data.industry,
    dmName: data.dmName,
    company: data.company,
  });

  const ws = VoxEngine.createWebSocket(wsUrl);

  ws.addEventListener(WebSocketEvents.OPEN, () => {
    Logger.write("[saymen] WS open");
    ws.send(
      JSON.stringify({
        type: "hello",
        callId: data.callId,
        sampleRate: SAMPLE_RATE,
        meta: { dmName: data.dmName, company: data.company },
      }),
    );

    // Шлём аудио с линии в WS
    VoxEngine.sendMediaBetween(call, ws, {
      encoding: "linear16", // PCM 16-bit
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });

    // Аудио из WS играем абоненту
    VoxEngine.sendMediaBetween(ws, call, {
      encoding: "linear16",
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });
  });

  ws.addEventListener(WebSocketEvents.MESSAGE, (e) => {
    let msg;
    try {
      msg = JSON.parse(e.text || "{}");
    } catch {
      return;
    }

    if (msg.type === "say") {
      // Опционально: бэкап-озвучка через встроенный TTS Voximplant, если оркестратор отвалился
      call.say(msg.text, Language.RU_RUSSIAN_FEMALE);
    } else if (msg.type === "transfer") {
      Logger.write(`[saymen] transfer to ${msg.phone}`);
      const second = VoxEngine.callPSTN(msg.phone, data.callerId);
      second.addEventListener(CallEvents.Connected, () => {
        VoxEngine.sendMediaBetween(call, second);
        VoxEngine.sendMediaBetween(second, call);
      });
    } else if (msg.type === "hangup") {
      Logger.write(`[saymen] hangup: ${msg.reason || ""}`);
      call.hangup();
    }
  });

  ws.addEventListener(WebSocketEvents.ERROR, (e) => {
    Logger.write(`[saymen] WS error: ${e.error || ""}`);
    call.hangup();
  });

  ws.addEventListener(WebSocketEvents.CLOSE, () => {
    Logger.write("[saymen] WS closed");
    call.hangup();
  });
}

function appendQuery(url, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return url + (url.includes("?") ? "&" : "?") + qs;
}
