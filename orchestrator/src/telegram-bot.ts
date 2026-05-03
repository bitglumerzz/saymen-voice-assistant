/**
 * Telegram-бот «Дмитрий».
 *
 * Канал-демонстратор для проверки голосового ассистента без WebRTC и телефонии.
 * Пользователь шлёт голосовое сообщение → транскрибируем (Deepgram, batch-режим) →
 * GPT-4o генерирует ответ → ElevenLabs озвучивает → отправляем как audio.
 *
 * Полностью отдельный от WebSocket-оркестратора код — у Telegram батчевый цикл,
 * нет смысла тянуть стриминговую CallSession.
 *
 * Запускается из server.ts, если задан TELEGRAM_BOT_TOKEN.
 */

import { randomUUID } from "node:crypto";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { buildSystemPrompt } from "./prompt-loader.js";
import { insertCall, insertTranscriptTurn, updateCall, dbEnabled, DEMO_ORG_ID } from "./db.js";
import type { LlmMessage } from "./types.js";

type ChatState = {
  /** UUID нашей записи в calls, чтобы транскрипт ложился в общий журнал */
  callId: string;
  messages: LlmMessage[];
  startedAt: number;
  turnCounter: number;
  collectedEmail?: string;
  ended?: boolean;
  telegramUserName?: string;
  telegramUserId?: number;
};

const states = new Map<number, ChatState>();

const WELCOME =
  "Здравствуйте! Я Дмитрий — голосовой ассистент компании Saymen. " +
  "Отправьте мне голосовое сообщение или напишите текст — я отвечу. " +
  "Это демо нашей технологии: такой же бот может звонить вашим клиентам, " +
  "принимать входящие, проводить опросы.\n\n" +
  "Команды: /start — начать сначала · /reset — сбросить контекст";

export function startTelegramBot(): TelegramBot | null {
  const token = config.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.info("[telegram] TELEGRAM_BOT_TOKEN не задан — бот не запускается");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.on("polling_error", (e) =>
    logger.error({ err: String(e) }, "[telegram] polling error"),
  );

  bot.onText(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    // Закрыть предыдущую сессию, если была
    const prev = states.get(chatId);
    if (prev && !prev.ended) await finalizeCall(prev, "no_answer");

    const state = await freshState(msg.from?.first_name, msg.from?.id);
    states.set(chatId, state);
    await bot.sendMessage(chatId, WELCOME);
  });

  bot.onText(/^\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const prev = states.get(chatId);
    if (prev && !prev.ended) await finalizeCall(prev, "refused");
    states.delete(chatId);
    await bot.sendMessage(chatId, "Контекст сброшен. Скажите /start, чтобы начать заново.");
  });

  bot.on("message", async (msg) => {
    if (msg.text?.startsWith("/")) return; // команды обработаны выше
    const chatId = msg.chat.id;

    let state = states.get(chatId);
    if (!state) {
      state = await freshState(msg.from?.first_name, msg.from?.id);
      states.set(chatId, state);
      await bot.sendMessage(chatId, WELCOME);
    }
    const session = state; // narrow для TS

    // Распознать что прислал пользователь
    let userText: string | null = null;
    if (msg.voice) {
      await bot.sendChatAction(chatId, "typing");
      try {
        const link = await bot.getFileLink(msg.voice.file_id);
        const audio = Buffer.from(await (await fetch(link)).arrayBuffer());
        userText = await transcribe(audio, msg.voice.mime_type ?? "audio/ogg");
      } catch (e) {
        logger.error({ err: String(e), chatId }, "[telegram] ASR failed");
        await bot.sendMessage(chatId, "Не смог распознать голосовое. Попробуйте ещё раз?");
        return;
      }
      if (!userText) {
        await bot.sendMessage(chatId, "Не разобрал. Повторите, пожалуйста?");
        return;
      }
      // Эхо-подтверждение, что услышали (полезно при отладке)
      await bot.sendMessage(chatId, `🎙 _Услышал:_ «${userText}»`, {
        parse_mode: "Markdown",
      });
    } else if (msg.text) {
      userText = msg.text;
    } else {
      return;
    }

    // Запросить ответ у LLM
    session.messages.push({ role: "user", content: userText });
    void persistTurn(session, "human", userText);
    await bot.sendChatAction(chatId, "typing");

    let replyText: string | null;
    try {
      replyText = await generateReply(session);
    } catch (e) {
      logger.error({ err: String(e), chatId }, "[telegram] LLM failed");
      await bot.sendMessage(chatId, "Что-то пошло не так с моделью. Попробуйте ещё раз через минуту.");
      return;
    }

    if (!replyText) {
      await bot.sendMessage(chatId, "(пустой ответ от модели)");
      return;
    }

    session.messages.push({ role: "assistant", content: replyText });
    void persistTurn(session, "bot", replyText);

    // Сначала текст (мгновенно), потом голос (если настроен ElevenLabs)
    await bot.sendMessage(chatId, replyText);

    try {
      await bot.sendChatAction(chatId, "upload_voice");
      const audio = await synthesize(replyText);
      if (audio) {
        // sendAudio принимает MP3 без конвертации (UI: трек, не «голосовой бабл»).
        // Когда поставим ffmpeg и научимся конвертить в OGG Opus — переключим на sendVoice.
        await bot.sendAudio(
          chatId,
          audio,
          { performer: "Дмитрий (Saymen)", title: "Ответ" },
          { filename: "reply.mp3", contentType: "audio/mpeg" },
        );
      }
    } catch (e) {
      logger.warn({ err: String(e), chatId }, "[telegram] TTS failed (текст уже отправлен)");
    }
  });

  logger.info("📱 telegram bot started (polling)");
  return bot;
}

async function freshState(firstName?: string, telegramUserId?: number): Promise<ChatState> {
  const callId = randomUUID();
  const state: ChatState = {
    callId,
    startedAt: Date.now(),
    turnCounter: 0,
    telegramUserName: firstName,
    telegramUserId,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({ decisionMakerName: firstName }),
      },
    ],
  };

  // Сразу создаём запись в calls — Telegram-чат равен одному «звонку»
  if (dbEnabled) {
    try {
      await insertCall({
        callId,
        organizationId: DEMO_ORG_ID,
        direction: "inbound", // в Telegram пользователь сам инициирует
        callerNumber: telegramUserId ? `tg:${telegramUserId}` : "tg:unknown",
        calleeNumber: "telegram-bot",
      });
    } catch (e) {
      logger.warn({ err: String(e), callId }, "[telegram] не записали call в БД (продолжаем)");
    }
  }

  return state;
}

async function persistTurn(state: ChatState, speaker: "bot" | "human", text: string): Promise<void> {
  if (!dbEnabled) return;
  const turnIndex = state.turnCounter++;
  try {
    await insertTranscriptTurn({ callId: state.callId, turnIndex, speaker, text });
  } catch (e) {
    logger.warn({ err: String(e), callId: state.callId }, "[telegram] не записали transcript_turn");
  }
}

async function finalizeCall(state: ChatState, outcome: string): Promise<void> {
  state.ended = true;
  if (!dbEnabled) return;
  try {
    await updateCall(state.callId, {
      outcome,
      duration: Math.round((Date.now() - state.startedAt) / 1000),
      collectedEmail: state.collectedEmail,
      summary: telegramSummary(state),
    });
  } catch (e) {
    logger.warn({ err: String(e), callId: state.callId }, "[telegram] не обновили call");
  }
}

function telegramSummary(state: ChatState): string {
  const human = state.messages.filter((m) => m.role === "user");
  if (human.length === 0) return "Telegram: пользователь не отвечал";
  if (state.collectedEmail) return `Telegram: email собран ${state.collectedEmail}`;
  return `Telegram: ${human.length} реплик(и) от ${state.telegramUserName ?? "пользователя"}`;
}

// =================================================================
// Deepgram batch
// =================================================================

async function transcribe(audio: Buffer, mimeType: string): Promise<string | null> {
  if (config.ORCHESTRATOR_MODE === "mock" || !config.DEEPGRAM_API_KEY) {
    return mockTranscribe();
  }

  const dg = createDeepgramClient(config.DEEPGRAM_API_KEY);
  const { result, error } = await dg.listen.prerecorded.transcribeFile(audio, {
    model: "nova-3",
    language: "ru",
    smart_format: true,
    mimetype: mimeType,
  });
  if (error) {
    logger.error({ err: String(error) }, "[deepgram/batch] error");
    return null;
  }
  const text = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return text && text.trim() ? text : null;
}

// =================================================================
// LLM (chat completions, batch)
// =================================================================

async function generateReply(state: ChatState): Promise<string | null> {
  if (config.ORCHESTRATOR_MODE === "mock") {
    return mockReply(state);
  }

  // Выбор провайдера: явный из LLM_PROVIDER, иначе авто (Claude если есть ключ)
  const provider =
    config.LLM_PROVIDER ??
    (config.ANTHROPIC_API_KEY ? "anthropic" : config.OPENAI_API_KEY ? "openai" : null);

  if (provider === "anthropic" && config.ANTHROPIC_API_KEY) {
    return generateReplyAnthropic(state);
  }
  if (provider === "openai" && config.OPENAI_API_KEY) {
    return generateReplyOpenAI(state);
  }
  // Ни один LLM не сконфигурирован — fallback на mock
  logger.warn("[telegram] LLM не сконфигурирован, использую mock-ответы");
  return mockReply(state);
}

async function generateReplyOpenAI(state: ChatState): Promise<string | null> {
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
  const messages = state.messages
    .map((m) => {
      if (m.role === "system") return { role: "system" as const, content: m.content };
      if (m.role === "user") return { role: "user" as const, content: m.content };
      if (m.role === "assistant" && typeof m.content === "string") {
        return { role: "assistant" as const, content: m.content };
      }
      return null;
    })
    .filter((x): x is { role: "system" | "user" | "assistant"; content: string } => !!x);

  const completion = await client.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages,
    temperature: 0.6,
    max_tokens: 250,
  });
  return completion.choices[0]?.message?.content ?? null;
}

async function generateReplyAnthropic(state: ChatState): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! });

  // Anthropic API требует system как отдельный параметр, а messages — только user/assistant.
  const systemMsg = state.messages.find((m) => m.role === "system");
  const systemText = typeof systemMsg?.content === "string" ? systemMsg.content : undefined;

  const messages = state.messages
    .map((m) => {
      if (m.role === "user") return { role: "user" as const, content: m.content };
      if (m.role === "assistant" && typeof m.content === "string") {
        return { role: "assistant" as const, content: m.content };
      }
      return null;
    })
    .filter((x): x is { role: "user" | "assistant"; content: string } => !!x);

  // Anthropic не принимает messages, начинающиеся с assistant — на всякий случай отрежем
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  const safeMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages;

  if (safeMessages.length === 0) {
    return null;
  }

  const resp = await client.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: 350,
    temperature: 0.6,
    system: systemText,
    messages: safeMessages,
  });

  // Берём первый текстовый блок ответа
  const textBlock = resp.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : null;
}

// =================================================================
// ElevenLabs (TTS, batch — получаем готовый MP3/OGG)
// =================================================================

async function synthesize(text: string): Promise<Buffer | null> {
  if (config.ORCHESTRATOR_MODE === "mock" || !config.ELEVENLABS_API_KEY) {
    return null; // mock-режим — без аудио, только текст
  }
  const voiceId = config.ELEVENLABS_VOICE_ID_DMITRY;
  if (!voiceId) {
    logger.warn("[telegram] ELEVENLABS_VOICE_ID_DMITRY не задан, пропускаю TTS");
    return null;
  }

  // ElevenLabs не выдаёт OGG Opus напрямую — берём MP3 и шлём в Telegram как audio.
  // Для «настоящего» voice-сообщения (круглый бабл с волнограммой) понадобится
  // конвертация MP3→OGG Opus через ffmpeg — добавим позже.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      language_code: "ru",
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logger.error({ status: res.status, errBody }, "[elevenlabs/batch] error");
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// =================================================================
// Mock-fallbacks (без оплаты API)
// =================================================================

const MOCK_USER_PHRASES = [
  "Здравствуйте",
  "Да, минута есть, рассказывайте",
  "А сколько это стоит?",
  "Запишите info собака example точка ru",
];

function mockTranscribe(): string {
  return MOCK_USER_PHRASES[Math.floor(Math.random() * MOCK_USER_PHRASES.length)] ?? "Алло";
}

function mockReply(state: ChatState): string {
  const last = state.messages[state.messages.length - 1];
  const text = last?.role === "user" ? (last.content as string) : "";

  if (/email|info|собака/i.test(text)) {
    return "Записал. Повторю по буквам: и-н-ф-о собака example точка ру. Всё верно?";
  }
  if (/сколько|стоит|цен/i.test(text)) {
    return "В районе шести рублей за минуту разговора. Точную цифру под ваш объём пришлю в письме.";
  }
  if (/спасибо|до свидан|пока/i.test(text)) {
    return "Хорошего дня! Письмо отправлю в течение пяти минут.";
  }
  return "Понял вас. Скажите, у вас сейчас живой человек принимает входящие или есть автоответчик?";
}
