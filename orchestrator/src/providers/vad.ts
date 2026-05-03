/**
 * VAD — Voice Activity Detection.
 *
 * Используется для barge-in: если во время озвучки бота пользователь начал
 * говорить — мгновенно прерываем TTS.
 *
 * v0.1: простой энергетический детектор (RMS поверх PCM 16-bit).
 * TODO: заменить на Silero VAD (ONNX Runtime) для лучшего качества.
 */

export type VadEvent = "speech_start" | "speech_end";

export interface VadProvider {
  /** Подать чанк PCM, получить события VAD. */
  process(pcm: Buffer): VadEvent | null;
}

class EnergyVad implements VadProvider {
  private isSpeaking = false;
  private silenceMs = 0;
  private speechMs = 0;

  constructor(
    private readonly opts: {
      sampleRate: number;
      threshold: number; // RMS порог 0..1
      minSpeechMs: number; // минимум речи, чтобы признать «началась»
      minSilenceMs: number; // минимум тишины, чтобы признать «закончилась»
    } = { sampleRate: 16000, threshold: 0.02, minSpeechMs: 100, minSilenceMs: 500 },
  ) {}

  process(pcm: Buffer): VadEvent | null {
    const samples = pcm.length / 2;
    const durationMs = (samples / this.opts.sampleRate) * 1000;

    // RMS
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i += 2) {
      const sample = pcm.readInt16LE(i) / 32768;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / samples);

    if (rms > this.opts.threshold) {
      this.speechMs += durationMs;
      this.silenceMs = 0;
      if (!this.isSpeaking && this.speechMs >= this.opts.minSpeechMs) {
        this.isSpeaking = true;
        return "speech_start";
      }
    } else {
      this.silenceMs += durationMs;
      this.speechMs = 0;
      if (this.isSpeaking && this.silenceMs >= this.opts.minSilenceMs) {
        this.isSpeaking = false;
        return "speech_end";
      }
    }
    return null;
  }
}

export function createVad(opts?: { sampleRate?: number; threshold?: number }): VadProvider {
  return new EnergyVad({
    sampleRate: opts?.sampleRate ?? 16000,
    threshold: opts?.threshold ?? 0.02,
    minSpeechMs: 100,
    minSilenceMs: 500,
  });
}
