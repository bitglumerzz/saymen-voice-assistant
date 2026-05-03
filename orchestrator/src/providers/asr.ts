/**
 * ASR-провайдеры. Стриминговое распознавание речи.
 *
 * Интерфейс одинаковый для Deepgram, Whisper, SaluteSpeech, своего сервера.
 * Замена провайдера = замена строки в createAsr().
 */

import { createClient, LiveTranscriptionEvents, type LiveClient } from "@deepgram/sdk";
import type { AsrPartial } from "../types.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export type AsrEventHandler = (partial: AsrPartial) => void;

export interface AsrProvider {
  /** Открыть стриминговое соединение, начать слать аудио. */
  start(opts: { sampleRate: number; language?: string }): Promise<void>;
  /** Передать чанк PCM 16-bit. */
  sendAudio(pcm: Buffer): void;
  /** Подписаться на распознанные реплики (partial и final). */
  onPartial(handler: AsrEventHandler): void;
  /** Закрыть стрим. */
  close(): Promise<void>;
}

// =================================================================
// DEEPGRAM
// =================================================================

class DeepgramAsr implements AsrProvider {
  private client = createClient(config.DEEPGRAM_API_KEY!);
  private connection: LiveClient | null = null;
  private handlers: AsrEventHandler[] = [];

  async start(opts: { sampleRate: number; language?: string }): Promise<void> {
    this.connection = this.client.listen.live({
      model: "nova-3",
      language: opts.language ?? "ru",
      encoding: "linear16",
      sample_rate: opts.sampleRate,
      channels: 1,
      interim_results: true,
      smart_format: true,
      endpointing: 200, // мс тишины для конца реплики
      vad_events: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      logger.debug("[asr/deepgram] connection open");
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alt = data?.channel?.alternatives?.[0];
      if (!alt?.transcript) return;
      const partial: AsrPartial = {
        text: alt.transcript,
        isFinal: !!data.is_final,
        confidence: alt.confidence,
        startMs: Math.round((data.start ?? 0) * 1000),
        endMs: Math.round(((data.start ?? 0) + (data.duration ?? 0)) * 1000),
      };
      for (const h of this.handlers) h(partial);
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      logger.error({ err }, "[asr/deepgram] error");
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      logger.debug("[asr/deepgram] connection closed");
    });
  }

  sendAudio(pcm: Buffer): void {
    if (!this.connection) return;
    // Deepgram SDK ждёт ArrayBuffer; конвертируем без копирования
    const ab = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
    this.connection.send(ab);
  }

  onPartial(handler: AsrEventHandler): void {
    this.handlers.push(handler);
  }

  async close(): Promise<void> {
    this.connection?.requestClose();
    this.connection = null;
  }
}

// =================================================================
// MOCK — для разработки без оплаты API
// =================================================================

class MockAsr implements AsrProvider {
  private handlers: AsrEventHandler[] = [];
  private timer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    logger.info("[asr/mock] started — будет имитировать речь по таймеру");
    // Имитация распознавания: каждые 3 секунды эмитим реплику из списка
    const fakeUtterances = [
      "Здравствуйте",
      "Да, минута есть, говорите",
      "Сколько это стоит?",
      "Ладно, пишите на info собака example точка ru",
      "И-н-ф-о, всё верно",
      "Хорошо, жду письмо. До свидания",
    ];
    let idx = 0;
    this.timer = setInterval(() => {
      const text = fakeUtterances[idx % fakeUtterances.length];
      if (!text) return;
      idx++;
      for (const h of this.handlers) h({ text, isFinal: true, confidence: 0.95 });
    }, 4000);
  }

  sendAudio(): void {
    /* mock игнорирует аудио */
  }

  onPartial(handler: AsrEventHandler): void {
    this.handlers.push(handler);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }
}

// =================================================================
// FACTORY
// =================================================================

export function createAsr(): AsrProvider {
  if (config.ORCHESTRATOR_MODE === "mock" || !config.DEEPGRAM_API_KEY) {
    return new MockAsr();
  }
  return new DeepgramAsr();
}
