/**
 * TTS-провайдеры. Стриминговый синтез речи.
 *
 * Возвращаем поток PCM-чанков 16kHz mono — единый формат для Voximplant и для
 * браузерного теста через MediaSource.
 */

import type { Readable } from "node:stream";
import { config } from "../config.js";
import { logger } from "../logger.js";

export type TtsChunkHandler = (pcm: Buffer) => void;

export interface TtsProvider {
  /**
   * Сгенерировать речь по тексту, чанк за чанком.
   * Возвращается, когда стрим закрыт (или прерван).
   */
  speak(text: string, opts: { sampleRate: number; onChunk: TtsChunkHandler }): Promise<void>;
  /** Прервать текущую генерацию (нужно для barge-in). */
  cancel(): void;
}

// =================================================================
// ELEVENLABS
// =================================================================

class ElevenLabsTts implements TtsProvider {
  private aborter: AbortController | null = null;

  async speak(text: string, opts: { sampleRate: number; onChunk: TtsChunkHandler }): Promise<void> {
    this.aborter = new AbortController();
    const voiceId = config.ELEVENLABS_VOICE_ID_DMITRY;
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID_DMITRY не задан");

    // Формат: pcm_16000 — линейный PCM 16kHz mono. Подходит для Voximplant.
    const outputFormat = opts.sampleRate === 8000 ? "pcm_8000" : "pcm_16000";
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const res = await fetch(url, {
      method: "POST",
      signal: this.aborter.signal,
      headers: {
        "xi-api-key": config.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/pcm",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        language_code: "ru",
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
        optimize_streaming_latency: 3,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`ElevenLabs HTTP ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error("ElevenLabs: нет body в ответе");

    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) opts.onChunk(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }

  cancel(): void {
    this.aborter?.abort();
    this.aborter = null;
  }
}

// =================================================================
// MOCK — пишет тишину той же длительности, что текст «должен звучать»
// =================================================================

class MockTts implements TtsProvider {
  private cancelled = false;

  async speak(text: string, opts: { sampleRate: number; onChunk: TtsChunkHandler }): Promise<void> {
    this.cancelled = false;
    logger.info({ text }, "[tts/mock] speak");
    // Грубая оценка: ~150 слов в минуту → 0.4 сек на слово
    const durationMs = Math.max(500, text.split(/\s+/).length * 400);
    const samples = Math.floor((opts.sampleRate * durationMs) / 1000);
    const chunkSize = opts.sampleRate / 10; // 100мс чанки
    const buffer = Buffer.alloc(chunkSize * 2); // 16-bit mono
    let written = 0;
    while (written < samples && !this.cancelled) {
      opts.onChunk(buffer);
      written += chunkSize;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  cancel(): void {
    this.cancelled = true;
  }
}

// =================================================================
// FACTORY
// =================================================================

export function createTts(): TtsProvider {
  if (config.ORCHESTRATOR_MODE === "mock" || !config.ELEVENLABS_API_KEY) {
    return new MockTts();
  }
  return new ElevenLabsTts();
}
