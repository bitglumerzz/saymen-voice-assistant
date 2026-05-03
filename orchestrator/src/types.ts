/**
 * Общие типы оркестратора.
 */

export type AudioChunk = {
  /** PCM 16-bit linear, mono */
  data: Buffer;
  /** Sample rate в Гц (Voximplant обычно 8000 или 16000) */
  sampleRate: number;
  /** Время от начала звонка в мс */
  timestampMs: number;
};

export type AsrPartial = {
  text: string;
  isFinal: boolean;
  confidence?: number;
  startMs?: number;
  endMs?: number;
};

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "assistant";
      content: null;
      toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "done"; finishReason: "stop" | "tool_calls" | "length" | "error" };

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: { callId: string },
) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

export type CallContext = {
  callId: string;
  contactId?: string;
  campaignId?: string;
  organizationId: string;
  industry?: string;
  decisionMakerName?: string;
  companyName?: string;
};

/** Сообщения, которыми обмениваемся с Voximplant-сценарием/браузером поверх WebSocket. */
export type VxControlMessage =
  | { type: "hello"; callId: string; sampleRate: number; meta?: Record<string, unknown> }
  | { type: "audio_in"; data: string /* base64 PCM */ }
  | { type: "audio_out"; data: string /* base64 PCM */ }
  | { type: "say"; text: string }
  | { type: "transfer"; phone: string }
  | { type: "hangup"; reason?: string }
  | { type: "error"; message: string }
  // Дополнительные сообщения для UI / отладки (не используются Voximplant'ом):
  | { type: "transcript"; speaker: "bot" | "human"; text: string; ts: number }
  | { type: "status"; state: "listening" | "thinking" | "speaking" | "ended"; detail?: string };
