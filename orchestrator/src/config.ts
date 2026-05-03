/**
 * Конфигурация оркестратора из переменных окружения.
 *
 * dotenv/config — побочный импорт, загружает `.env` из cwd ДО того, как
 * мы начнём читать process.env через zod. Без этого ORCHESTRATOR_MODE,
 * TELEGRAM_BOT_TOKEN и прочие ключи не подцепятся.
 */

import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8181),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Провайдеры
  // LLM-провайдер: "anthropic" (Claude) или "openai" (GPT). Если не задан явно —
  // выбирается автоматически: anthropic если есть ANTHROPIC_API_KEY, иначе openai.
  LLM_PROVIDER: z.enum(["anthropic", "openai"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-2024-11-20"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID_DMITRY: z.string().optional(),

  // База
  DATABASE_URL: z.string().optional(),

  // Режим работы
  // mock — все провайдеры заменены на стабы (для тестов без денег)
  // dev — реальные API, но без сохранения в БД
  // prod — реальные API, всё в БД
  ORCHESTRATOR_MODE: z.enum(["mock", "dev", "prod"]).default("mock"),

  // Защита WebSocket-роута
  VOXIMPLANT_WEBHOOK_SECRET: z.string().optional(),

  // Telegram-бот (опциональный канал — голосовые сообщения)
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Пути к ассетам
  PROMPT_DIR: z.string().default("../prompts"),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export function ensure<K extends keyof Config>(key: K): NonNullable<Config[K]> {
  const v = config[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`Конфигурация: переменная ${key} обязательна в режиме ${config.ORCHESTRATOR_MODE}`);
  }
  return v as NonNullable<Config[K]>;
}
