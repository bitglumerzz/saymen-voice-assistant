/**
 * Типизированные переменные окружения.
 * Если что-то обязательное не задано — приложение упадёт на старте, не в рантайме.
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),

    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    DEEPGRAM_API_KEY: z.string().min(1).optional(),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    ELEVENLABS_VOICE_ID_DMITRY: z.string().min(1).optional(),

    VOXIMPLANT_ACCOUNT_ID: z.string().optional(),
    VOXIMPLANT_API_KEY: z.string().optional(),
    VOXIMPLANT_APPLICATION_ID: z.string().optional(),
    VOXIMPLANT_CALLER_ID: z.string().optional(),
    VOXIMPLANT_WEBHOOK_SECRET: z.string().min(8).optional(),

    UNISENDER_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    EMAIL_FROM_NAME: z.string().optional(),

    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),

    TRACKING_URL: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID_DMITRY: process.env.ELEVENLABS_VOICE_ID_DMITRY,
    VOXIMPLANT_ACCOUNT_ID: process.env.VOXIMPLANT_ACCOUNT_ID,
    VOXIMPLANT_API_KEY: process.env.VOXIMPLANT_API_KEY,
    VOXIMPLANT_APPLICATION_ID: process.env.VOXIMPLANT_APPLICATION_ID,
    VOXIMPLANT_CALLER_ID: process.env.VOXIMPLANT_CALLER_ID,
    VOXIMPLANT_WEBHOOK_SECRET: process.env.VOXIMPLANT_WEBHOOK_SECRET,
    UNISENDER_API_KEY: process.env.UNISENDER_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    TRACKING_URL: process.env.TRACKING_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
});
