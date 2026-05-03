/**
 * Инструменты, которые LLM может вызывать во время разговора.
 * Описание соответствует тому, что в промте Дмитрия.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { logger } from "./logger.js";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "record_email",
    description:
      "Сохранить email ЛПР. Вызывать ТОЛЬКО после побуквенного подтверждения собеседником.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email в формате user@domain.tld" },
      },
      required: ["email"],
    },
  },
  {
    name: "record_unclear_email",
    description: "Если не смог разобрать email после двух попыток.",
    parameters: {
      type: "object",
      properties: {
        heard: { type: "string", description: "Что услышал" },
        attempts: { type: "integer" },
      },
      required: ["heard", "attempts"],
    },
  },
  {
    name: "add_to_stop_list",
    description: "Добавить номер в стоп-лист — вызывать при «не звоните больше», «это спам».",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "schedule_callback",
    description: "Перезвонить позже по запросу собеседника.",
    parameters: {
      type: "object",
      properties: {
        when: { type: "string", description: "ISO datetime или описание времени" },
      },
      required: ["when"],
    },
  },
  {
    name: "detect_voicemail",
    description: "Определён автоответчик — звонок завершить.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "transfer_to_human",
    description: "Перевести разговор на живого менеджера.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "end_call",
    description: "Завершить звонок. ОБЯЗАТЕЛЬНЫЙ финальный вызов.",
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["email_collected", "refused", "callback", "voicemail", "no_answer", "wrong_number"],
        },
      },
      required: ["outcome"],
    },
  },
];

/**
 * Создать набор обработчиков для конкретного звонка.
 * Каждый handler знает callId через замыкание.
 */
export function createToolHandlers(opts: {
  callId: string;
  onEnd: (outcome: string) => void;
  onTransfer: () => void;
  onRecordEmail: (email: string) => void;
  onAddStopList: (reason: string) => void;
  onScheduleCallback: (when: string) => void;
}): Record<string, ToolHandler> {
  return {
    record_email: async (args) => {
      const email = String(args.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: "invalid_email_format" };
      }
      opts.onRecordEmail(email);
      return { ok: true, result: { email } };
    },

    record_unclear_email: async (args) => {
      logger.warn({ heard: args.heard, attempts: args.attempts }, "unclear email");
      return { ok: true };
    },

    add_to_stop_list: async (args) => {
      opts.onAddStopList(String(args.reason ?? "user_request"));
      return { ok: true };
    },

    schedule_callback: async (args) => {
      opts.onScheduleCallback(String(args.when ?? ""));
      return { ok: true };
    },

    detect_voicemail: async () => {
      opts.onEnd("voicemail");
      return { ok: true };
    },

    transfer_to_human: async () => {
      opts.onTransfer();
      return { ok: true };
    },

    end_call: async (args) => {
      opts.onEnd(String(args.outcome ?? "no_answer"));
      return { ok: true };
    },
  };
}
