/**
 * LLM-провайдеры. Стриминговая генерация ответа.
 *
 * Интерфейс не зависит от провайдера: можно подключить OpenAI, Anthropic,
 * локальный vLLM (когда мигрируем на свой сервер) — поток событий тот же.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmMessage, LlmStreamEvent, ToolDefinition } from "../types.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export interface LlmProvider {
  /**
   * Получить стримовый ответ. Возвращает async-итератор событий.
   */
  stream(opts: {
    messages: LlmMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<LlmStreamEvent>;
}

// =================================================================
// OPENAI
// =================================================================

class OpenAILlm implements LlmProvider {
  private client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });

  async *stream(opts: {
    messages: LlmMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<LlmStreamEvent> {
    const messages = opts.messages.map(toOpenAIMessage);
    const tools = opts.tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> },
    }));

    const stream = await this.client.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages,
      tools,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 200,
      stream: true,
    });

    // Аккумулируем tool_calls по chunks (OpenAI шлёт их по кусочкам)
    const pendingTools: Record<number, { id?: string; name?: string; argsRaw: string }> = {};

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta?.content) {
        yield { type: "text", delta: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          const acc = (pendingTools[idx] ??= { argsRaw: "" });
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.argsRaw += tc.function.arguments;
        }
      }

      if (choice.finish_reason) {
        // Дофинализировать tool_calls
        for (const acc of Object.values(pendingTools)) {
          if (acc.id && acc.name) {
            let args: Record<string, unknown> = {};
            try {
              args = acc.argsRaw ? JSON.parse(acc.argsRaw) : {};
            } catch (e) {
              logger.warn({ raw: acc.argsRaw, err: String(e) }, "[llm/openai] не смогли распарсить tool args");
            }
            yield { type: "tool_call", id: acc.id, name: acc.name, arguments: args };
          }
        }
        const fr = choice.finish_reason as LlmStreamEvent extends { finishReason: infer F } ? F : never;
        yield { type: "done", finishReason: (fr ?? "stop") as never };
      }
    }
  }
}

function toOpenAIMessage(m: LlmMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (m.role === "system") return { role: "system", content: m.content };
  if (m.role === "user") return { role: "user", content: m.content };
  if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  // assistant
  if ("toolCalls" in m && m.toolCalls) {
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.toolCalls.map((t) => ({
        id: t.id,
        type: "function" as const,
        function: { name: t.name, arguments: JSON.stringify(t.arguments) },
      })),
    };
  }
  return { role: "assistant", content: m.content as string };
}

// =================================================================
// ANTHROPIC (Claude)
// =================================================================

class AnthropicLlm implements LlmProvider {
  private client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! });

  async *stream(opts: {
    messages: LlmMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<LlmStreamEvent> {
    // 1. system отдельным параметром
    const systemMsg = opts.messages.find((m) => m.role === "system");
    const systemText =
      systemMsg && typeof systemMsg.content === "string" ? systemMsg.content : undefined;

    // 2. Конвертируем messages в формат Anthropic
    const anthMessages: Anthropic.Messages.MessageParam[] = [];
    for (const m of opts.messages) {
      if (m.role === "system") continue;

      if (m.role === "user") {
        anthMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        if ("toolCalls" in m && m.toolCalls && m.toolCalls.length > 0) {
          // assistant с tool_use блоками — content в нашем типе всегда null
          const blocks: Array<
            | Anthropic.Messages.TextBlockParam
            | Anthropic.Messages.ToolUseBlockParam
          > = m.toolCalls.map((t) => ({
            type: "tool_use" as const,
            id: t.id,
            name: t.name,
            input: t.arguments,
          }));
          anthMessages.push({ role: "assistant", content: blocks });
        } else if (typeof m.content === "string") {
          anthMessages.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        // tool_result в Anthropic формате — отдельное user-сообщение со специальным блоком.
        // Anthropic нормально склеивает соседние user-сообщения, так что плодим без оптимизации.
        anthMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: m.content,
            },
          ],
        });
      }
    }

    // 3. Tools в формате Anthropic
    const tools = opts.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
    }));

    // 4. Стрим
    const stream = this.client.messages.stream({
      model: config.ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 250,
      temperature: opts.temperature ?? 0.6,
      system: systemText,
      messages: anthMessages,
      tools,
    });

    // tool_use блоки приходят чанками: content_block_start → input_json_delta… → content_block_stop
    const pendingTools: Record<number, { id: string; name: string; argsRaw: string }> = {};

    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        const cb = ev.content_block;
        if (cb.type === "tool_use") {
          pendingTools[ev.index] = { id: cb.id, name: cb.name, argsRaw: "" };
        }
      } else if (ev.type === "content_block_delta") {
        const d = ev.delta;
        if (d.type === "text_delta") {
          yield { type: "text", delta: d.text };
        } else if (d.type === "input_json_delta") {
          const acc = pendingTools[ev.index];
          if (acc) acc.argsRaw += d.partial_json;
        }
      } else if (ev.type === "content_block_stop") {
        const acc = pendingTools[ev.index];
        if (acc) {
          let args: Record<string, unknown> = {};
          try {
            args = acc.argsRaw ? JSON.parse(acc.argsRaw) : {};
          } catch (e) {
            logger.warn({ raw: acc.argsRaw, err: String(e) }, "[llm/anthropic] tool args parse fail");
          }
          yield { type: "tool_call", id: acc.id, name: acc.name, arguments: args };
          delete pendingTools[ev.index];
        }
      } else if (ev.type === "message_stop") {
        const finalMsg = await stream.finalMessage();
        const fr =
          finalMsg.stop_reason === "tool_use"
            ? "tool_calls"
            : finalMsg.stop_reason === "max_tokens"
              ? "length"
              : "stop";
        yield { type: "done", finishReason: fr };
      }
    }
  }
}

// =================================================================
// MOCK
// =================================================================

class MockLlm implements LlmProvider {
  async *stream(opts: { messages: LlmMessage[] }): AsyncIterable<LlmStreamEvent> {
    const last = opts.messages[opts.messages.length - 1];
    const userText = last?.role === "user" ? (last.content as string) : "";
    let response = "Понял вас. Скажите, удобнее по почте или давайте я перезвоню?";

    if (/email|почт|info|собака/i.test(userText)) {
      response = "Записал. Я повторю по буквам: и-н-ф-о собака e-x-a-m-p-l-e точка ру. Всё верно?";
    } else if (/сколько|стоит|цен/i.test(userText)) {
      response = "Около шести рублей за минуту. Точную цифру под ваш объём пришлю в письме.";
    } else if (/спасибо|до свидан|пока/i.test(userText)) {
      response = "Хорошего дня!";
      // Эмитим текст и end_call
      for (const ch of response.split(" ")) {
        yield { type: "text", delta: ch + " " };
        await new Promise((r) => setTimeout(r, 30));
      }
      yield {
        type: "tool_call",
        id: "mock_" + Date.now(),
        name: "end_call",
        arguments: { outcome: "email_collected" },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }

    // Стримим по словам с задержкой
    for (const ch of response.split(" ")) {
      yield { type: "text", delta: ch + " " };
      await new Promise((r) => setTimeout(r, 40));
    }
    yield { type: "done", finishReason: "stop" };
  }
}

// =================================================================
// FACTORY
// =================================================================

export function createLlm(): LlmProvider {
  if (config.ORCHESTRATOR_MODE === "mock") return new MockLlm();

  // Явный выбор через LLM_PROVIDER, иначе авто: Claude если есть ключ, иначе OpenAI, иначе mock
  const provider =
    config.LLM_PROVIDER ??
    (config.ANTHROPIC_API_KEY ? "anthropic" : config.OPENAI_API_KEY ? "openai" : null);

  if (provider === "anthropic" && config.ANTHROPIC_API_KEY) {
    logger.info({ model: config.ANTHROPIC_MODEL }, "[llm] using Anthropic Claude (streaming)");
    return new AnthropicLlm();
  }
  if (provider === "openai" && config.OPENAI_API_KEY) {
    logger.info({ model: config.OPENAI_MODEL }, "[llm] using OpenAI (streaming)");
    return new OpenAILlm();
  }
  logger.warn("[llm] нет ни одного LLM-ключа, fallback на mock");
  return new MockLlm();
}
