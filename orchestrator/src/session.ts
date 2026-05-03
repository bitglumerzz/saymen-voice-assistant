/**
 * CallSession — состояние и оркестрация одного звонка.
 *
 * Поток:
 *  1) Открыли WebSocket с Voximplant (или браузером в dev-режиме).
 *  2) Получили `hello` с метаданными.
 *  3) Открыли ASR-стрим, начали слать туда аудио.
 *  4) Бот произносит первую реплику (открытие).
 *  5) Цикл: ASR partial → final → LLM stream → TTS stream → audio_out.
 *  6) Tool calls обрабатываются между шагами.
 *  7) end_call → закрываем всё.
 */

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type {
  AsrPartial,
  CallContext,
  LlmMessage,
  VxControlMessage,
} from "./types.js";
import { createAsr, type AsrProvider } from "./providers/asr.js";
import { createLlm, type LlmProvider } from "./providers/llm.js";
import { createTts, type TtsProvider } from "./providers/tts.js";
import { createVad, type VadProvider } from "./providers/vad.js";
import { TOOL_DEFINITIONS, createToolHandlers } from "./tools.js";
import { buildSystemPrompt } from "./prompt-loader.js";
import { logger } from "./logger.js";
import {
  insertCall,
  updateCall,
  insertTranscriptTurn,
  insertCallEvent,
  dbEnabled,
} from "./db.js";

export type SessionEnd = {
  outcome: string;
  collectedEmail?: string;
  durationMs: number;
  transcript: { speaker: "bot" | "human"; text: string; ts: number }[];
};

export class CallSession {
  readonly callId: string;
  private startedAt = Date.now();
  private sampleRate = 16000;

  private asr: AsrProvider;
  private llm: LlmProvider;
  private tts: TtsProvider;
  private vad: VadProvider;

  private messages: LlmMessage[] = [];
  private transcript: SessionEnd["transcript"] = [];

  private isBotSpeaking = false;
  private collectedEmail?: string;
  private outcome?: string;
  private hangupRequested = false;
  private turnCounter = 0;

  private toolHandlers: ReturnType<typeof createToolHandlers>;

  constructor(
    private readonly ws: WebSocket,
    private readonly ctx: CallContext,
    private readonly onEnd: (result: SessionEnd) => void,
  ) {
    this.callId = ctx.callId;
    this.asr = createAsr();
    this.llm = createLlm();
    this.tts = createTts();
    this.vad = createVad({ sampleRate: this.sampleRate });

    this.toolHandlers = createToolHandlers({
      callId: this.callId,
      onEnd: (outcome) => {
        this.outcome = outcome;
        this.hangupRequested = true;
      },
      onTransfer: () => {
        this.send({ type: "transfer", phone: "+7..." }); // TODO: брать из конфига кампании
      },
      onRecordEmail: (email) => {
        this.collectedEmail = email;
      },
      onAddStopList: (reason) => {
        logger.info({ reason, callId: this.callId }, "add_to_stop_list");
      },
      onScheduleCallback: (when) => {
        logger.info({ when, callId: this.callId }, "schedule_callback");
      },
    });
  }

  /** Запустить сессию. Не возвращается, пока звонок не закончится. */
  async run(): Promise<void> {
    // Системный промт
    this.messages.push({ role: "system", content: buildSystemPrompt(this.ctx) });

    // Persistence: создать запись звонка
    if (dbEnabled) {
      try {
        await insertCall({
          callId: this.callId,
          organizationId: this.ctx.organizationId,
          contactId: this.ctx.contactId,
          campaignId: this.ctx.campaignId,
          direction: "outbound",
          calleeNumber: this.ctx.companyName ?? "unknown", // TODO: пробрасывать реальный номер из контекста
        });
      } catch (e) {
        logger.warn({ err: String(e), callId: this.callId }, "не удалось записать call в БД (продолжаем)");
      }
    }

    // ASR
    await this.asr.start({ sampleRate: this.sampleRate, language: "ru" });
    this.asr.onPartial((p) => this.handleAsr(p));

    // Открытие — бот говорит первым
    await this.botSay(
      this.ctx.decisionMakerName
        ? `Здравствуйте, ${this.ctx.decisionMakerName}! Меня зовут Дмитрий, я из компании Saymen. Удобно говорить буквально минуту?`
        : `Здравствуйте! Меня зовут Дмитрий, я из компании Saymen. Удобно говорить буквально минуту?`,
    );

    // Ждём, пока сессия завершится
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (this.hangupRequested || this.ws.readyState >= 2) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });

    await this.shutdown();
  }

  /** Получить аудио-чанк от Voximplant/браузера. */
  pushAudio(pcm: Buffer): void {
    // Отдаём в ASR
    this.asr.sendAudio(pcm);

    // VAD: если бот говорит и в этот момент пользователь начал — barge-in
    const ev = this.vad.process(pcm);
    if (ev === "speech_start" && this.isBotSpeaking) {
      logger.debug({ callId: this.callId }, "barge_in: прерываем TTS");
      this.tts.cancel();
      this.isBotSpeaking = false;
    }
  }

  private async handleAsr(p: AsrPartial): Promise<void> {
    if (!p.isFinal) return; // обрабатываем только финальные реплики
    if (!p.text.trim()) return;
    if (this.isBotSpeaking) return; // ждём, пока бот договорит — но при barge-in уже остановили

    logger.info({ callId: this.callId, text: p.text }, "user said");
    const ts = Date.now() - this.startedAt;
    this.transcript.push({ speaker: "human", text: p.text, ts });
    this.send({ type: "transcript", speaker: "human", text: p.text, ts });
    this.send({ type: "status", state: "thinking" });
    this.messages.push({ role: "user", content: p.text });

    // Persistence: реплика человека
    void this.persistTurn("human", p.text, p.startMs, p.endMs);

    await this.llmTurn();
  }

  /** Один шаг LLM: получить ответ, озвучить, обработать инструменты. */
  private async llmTurn(): Promise<void> {
    let textBuffer = "";
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    for await (const ev of this.llm.stream({ messages: this.messages, tools: TOOL_DEFINITIONS })) {
      if (ev.type === "text") {
        textBuffer += ev.delta;
      } else if (ev.type === "tool_call") {
        toolCalls.push({ id: ev.id, name: ev.name, arguments: ev.arguments });
      } else if (ev.type === "done") {
        // финал — выходим
      }
    }

    // Озвучка текста (если он есть)
    if (textBuffer.trim()) {
      await this.botSay(textBuffer.trim());
      this.messages.push({ role: "assistant", content: textBuffer.trim() });
    }

    // Обработать tool_calls
    if (toolCalls.length > 0) {
      this.messages.push({ role: "assistant", content: null, toolCalls });
      for (const tc of toolCalls) {
        const handler = this.toolHandlers[tc.name];
        if (!handler) {
          logger.warn({ name: tc.name }, "неизвестный tool");
          this.messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify({ ok: false, error: "unknown_tool" }),
          });
          continue;
        }
        const result = await handler(tc.arguments, { callId: this.callId });
        this.messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(result) });
      }
      // После tool-результатов LLM может захотеть ещё раз ответить
      if (!this.hangupRequested) {
        await this.llmTurn();
      }
    }
  }

  private async botSay(text: string): Promise<void> {
    this.isBotSpeaking = true;
    logger.info({ callId: this.callId, text }, "bot says");
    const ts = Date.now() - this.startedAt;
    this.transcript.push({ speaker: "bot", text, ts });
    this.send({ type: "transcript", speaker: "bot", text, ts });
    this.send({ type: "status", state: "speaking" });
    void this.persistTurn("bot", text, ts, ts);

    try {
      await this.tts.speak(text, {
        sampleRate: this.sampleRate,
        onChunk: (pcm) => this.send({ type: "audio_out", data: pcm.toString("base64") }),
      });
    } catch (e) {
      logger.error({ err: String(e), callId: this.callId }, "TTS error");
    }
    this.isBotSpeaking = false;
    this.send({ type: "status", state: "listening" });
  }

  private send(msg: VxControlMessage): void {
    if (this.ws.readyState !== 1 /* OPEN */) return;
    this.ws.send(JSON.stringify(msg));
  }

  private async shutdown(): Promise<void> {
    this.tts.cancel();
    await this.asr.close();
    this.send({ type: "hangup", reason: this.outcome ?? "completed" });

    const durationMs = Date.now() - this.startedAt;
    const outcome = this.outcome ?? "no_answer";

    // Persistence: финализировать call
    if (dbEnabled) {
      try {
        await updateCall(this.callId, {
          outcome,
          duration: Math.round(durationMs / 1000),
          collectedEmail: this.collectedEmail,
          summary: this.summarize(),
        });
      } catch (e) {
        logger.warn({ err: String(e), callId: this.callId }, "не удалось обновить call в БД");
      }
    }

    this.onEnd({
      outcome,
      collectedEmail: this.collectedEmail,
      durationMs,
      transcript: this.transcript,
    });
  }

  private async persistTurn(
    speaker: "bot" | "human",
    text: string,
    startMs?: number,
    endMs?: number,
  ): Promise<void> {
    if (!dbEnabled) return;
    const turnIndex = this.turnCounter++;
    try {
      await insertTranscriptTurn({ callId: this.callId, turnIndex, speaker, text, startMs, endMs });
    } catch (e) {
      logger.warn({ err: String(e), callId: this.callId }, "не записали transcript_turn");
    }
  }

  /** Простое резюме первой и последней реплик клиента — для карточки в админке. */
  private summarize(): string {
    const human = this.transcript.filter((t) => t.speaker === "human");
    if (human.length === 0) return "Клиент не отвечал";
    if (this.collectedEmail) return `Email собран: ${this.collectedEmail}`;
    const first = human[0]?.text ?? "";
    const last = human[human.length - 1]?.text ?? "";
    return first === last ? first.slice(0, 200) : `${first.slice(0, 100)} … ${last.slice(0, 100)}`;
  }

  /** Записать произвольное событие звонка (для отладки latency, VAD, ошибок). */
  private logEvent(eventType: string, payload?: Record<string, unknown>): void {
    if (!dbEnabled) return;
    void insertCallEvent({
      callId: this.callId,
      eventType,
      payload,
      timestampMs: Date.now() - this.startedAt,
    });
  }
  // suppress unused-warning; вызовется в следующих фичах (latency-метрики, ошибки)
  private _markLogEventUsed = this.logEvent;

  static newId(): string {
    return randomUUID();
  }
}
