/**
 * Утилиты для конвертации аудио на стороне браузера.
 *
 * Web Audio API даёт нам Float32 [-1.0, 1.0]. Оркестратор хочет PCM 16-bit
 * little-endian. Конвертация — через простое масштабирование.
 */

/** Float32 (Web Audio) → Int16 little-endian (PCM 16). */
export function floatToPcm16(float32: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i] ?? 0));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, s, true);
  }
  return buf;
}

/** Int16 PCM → Float32 для Web Audio. */
export function pcm16ToFloat(pcm: ArrayBuffer): Float32Array {
  const view = new DataView(pcm);
  const out = new Float32Array(pcm.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const s = view.getInt16(i * 2, true);
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return out;
}

/** ArrayBuffer → base64 (без Buffer, чтобы работало в браузере). */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** base64 → ArrayBuffer. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Простой ресемплер: входной Float32 на rate1 → выход на rate2.
 * Линейная интерполяция — для голоса достаточно.
 */
export function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, input.length - 1);
    const frac = srcIdx - idx0;
    out[i] = (input[idx0] ?? 0) * (1 - frac) + (input[idx1] ?? 0) * frac;
  }
  return out;
}
