/**
 * Persistence-слой оркестратора.
 *
 * Используем pg напрямую (не Drizzle), чтобы не тащить кросс-пакетный импорт схемы
 * из ../db/. Запросов немного, явный SQL читается легко.
 *
 * Если DATABASE_URL не задан — все методы становятся no-op (полезно для mock-режима).
 */

import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

if (config.DATABASE_URL) {
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (err) => logger.error({ err: String(err) }, "[db] pool error"));
}

export const dbEnabled = pool !== null;

/**
 * Стабильный UUID демо-организации. Используется в локальной разработке,
 * пока нет полноценной мульти-арендности и аутентификации.
 */
export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Идемпотентно создаёт демо-организацию (если её ещё нет). Вызывается
 * на старте оркестратора, чтобы внешние ключи `organization_id` валидно
 * ссылались на существующую запись.
 */
export async function ensureDemoOrg(): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO organizations (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [DEMO_ORG_ID, "Demo (saymen_bot)", "demo"],
  );
}

// =================================================================
// Calls
// =================================================================

export type CallInsert = {
  callId: string; // наш UUID, тот же что приходит в callId из ws-параметров
  organizationId: string;
  contactId?: string;
  campaignId?: string;
  direction?: "outbound" | "inbound";
  callerNumber?: string;
  calleeNumber: string;
  providerCallId?: string;
};

/** Создать запись звонка. callId идемпотентный — повторный insert не падает. */
export async function insertCall(data: CallInsert): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO calls
       (id, organization_id, contact_id, campaign_id, direction,
        caller_number, callee_number, provider_call_id, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      data.callId,
      data.organizationId,
      data.contactId ?? null,
      data.campaignId ?? null,
      data.direction ?? "outbound",
      data.callerNumber ?? null,
      data.calleeNumber,
      data.providerCallId ?? null,
    ],
  );
}

export type CallUpdate = {
  outcome?: string;
  duration?: number; // секунд
  summary?: string;
  collectedEmail?: string;
  recordingUrl?: string;
  metadata?: Record<string, unknown>;
};

export async function updateCall(callId: string, data: CallUpdate): Promise<void> {
  if (!pool) return;
  // Динамическое построение запроса: пишем только то, что задано
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.outcome !== undefined) {
    sets.push(`outcome = $${i++}`);
    vals.push(data.outcome);
  }
  if (data.duration !== undefined) {
    sets.push(`duration_seconds = $${i++}`);
    vals.push(data.duration);
  }
  if (data.summary !== undefined) {
    sets.push(`summary = $${i++}`);
    vals.push(data.summary);
  }
  if (data.collectedEmail !== undefined) {
    sets.push(`collected_email = $${i++}`);
    vals.push(data.collectedEmail);
  }
  if (data.recordingUrl !== undefined) {
    sets.push(`recording_url = $${i++}`);
    vals.push(data.recordingUrl);
  }
  if (data.metadata !== undefined) {
    sets.push(`metadata = $${i++}`);
    vals.push(JSON.stringify(data.metadata));
  }
  sets.push(`ended_at = NOW()`);
  sets.push(`updated_at = NOW()`);

  if (sets.length === 0) return;
  vals.push(callId);
  await pool.query(`UPDATE calls SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

// =================================================================
// Transcript turns
// =================================================================

export async function insertTranscriptTurn(opts: {
  callId: string;
  turnIndex: number;
  speaker: "bot" | "human";
  text: string;
  audioUrl?: string;
  startMs?: number;
  endMs?: number;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO transcript_turns
       (call_id, turn_index, speaker, text, audio_url, start_ms, end_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (call_id, turn_index) DO NOTHING`,
    [
      opts.callId,
      opts.turnIndex,
      opts.speaker,
      opts.text,
      opts.audioUrl ?? null,
      opts.startMs ?? null,
      opts.endMs ?? null,
    ],
  );
}

// =================================================================
// Call events
// =================================================================

export async function insertCallEvent(opts: {
  callId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  timestampMs?: number;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO call_events (call_id, event_type, payload, timestamp_ms)
     VALUES ($1, $2, $3, $4)`,
    [
      opts.callId,
      opts.eventType,
      opts.payload ? JSON.stringify(opts.payload) : null,
      opts.timestampMs ?? null,
    ],
  );
}

export async function shutdownDb(): Promise<void> {
  await pool?.end();
}
