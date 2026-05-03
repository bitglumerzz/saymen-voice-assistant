/**
 * Voice Orchestrator — точка входа.
 *
 * Маршруты:
 *   GET  /health        — health-check
 *   WS   /voice         — WebSocket для Voximplant и dev-браузера
 */

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { CallSession } from "./session.js";
import { startTelegramBot } from "./telegram-bot.js";
import { ensureDemoOrg, DEMO_ORG_ID } from "./db.js";
import type { VxControlMessage, CallContext } from "./types.js";

async function main(): Promise<void> {
  const app = Fastify({ loggerInstance: logger as unknown as never });

  await app.register(websocket, {
    options: { maxPayload: 1024 * 1024 }, // 1MB на фрейм — с запасом
  });

  app.get("/health", async () => ({
    status: "ok",
    mode: config.ORCHESTRATOR_MODE,
    timestamp: new Date().toISOString(),
  }));

  app.get("/voice", { websocket: true }, (socket, req) => {
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const secret = params.get("secret");

    if (config.VOXIMPLANT_WEBHOOK_SECRET && secret !== config.VOXIMPLANT_WEBHOOK_SECRET) {
      logger.warn({ ip: req.ip }, "WS отклонён: неверный secret");
      socket.close(1008, "unauthorized");
      return;
    }

    handleVoiceConnection(socket, params).catch((err) => {
      logger.error({ err: String(err) }, "ошибка в обработчике /voice");
      try {
        socket.close(1011, "internal_error");
      } catch {
        /* */
      }
    });
  });

  const port = config.PORT;
  const host = config.HOST;
  await app.listen({ port, host });
  logger.info({ port, host, mode: config.ORCHESTRATOR_MODE }, "🎙  orchestrator started");

  // Идемпотентно создаём демо-организацию для FK-связей в БД
  try {
    await ensureDemoOrg();
  } catch (e) {
    logger.warn({ err: String(e) }, "ensureDemoOrg failed (БД недоступна?)");
  }

  // Параллельный канал — Telegram-бот (если задан токен)
  startTelegramBot();
}

async function handleVoiceConnection(
  socket: import("ws").WebSocket,
  params: URLSearchParams,
): Promise<void> {
  const ctx: CallContext = {
    callId: params.get("callId") ?? CallSession.newId(),
    contactId: params.get("contactId") ?? undefined,
    campaignId: params.get("campaignId") ?? undefined,
    organizationId: params.get("organizationId") ?? DEMO_ORG_ID,
    industry: params.get("industry") ?? undefined,
    decisionMakerName: params.get("dmName") ?? undefined,
    companyName: params.get("company") ?? undefined,
  };

  logger.info({ callId: ctx.callId, ctx }, "новое голосовое соединение");

  const session = new CallSession(socket, ctx, (result) => {
    logger.info(
      {
        callId: ctx.callId,
        outcome: result.outcome,
        email: result.collectedEmail,
        duration: result.durationMs,
      },
      "звонок завершён",
    );
    // TODO: persist в БД (calls + transcript_turns)
  });

  socket.on("message", (data: Buffer | string) => {
    try {
      // Voximplant шлёт JSON-сообщения (control + audio в base64)
      const text = typeof data === "string" ? data : data.toString("utf8");
      const msg = JSON.parse(text) as VxControlMessage;

      if (msg.type === "audio_in") {
        session.pushAudio(Buffer.from(msg.data, "base64"));
      } else if (msg.type === "hello") {
        // метаданные принимаются session-ом при создании; ничего особого
      }
    } catch (e) {
      logger.warn({ err: String(e) }, "не смогли разобрать WS-сообщение");
    }
  });

  socket.on("close", () => {
    logger.debug({ callId: ctx.callId }, "WS закрыт");
  });

  await session.run();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err);
  process.exit(1);
});
