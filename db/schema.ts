/**
 * Saymen — схема базы данных (Drizzle ORM, PostgreSQL).
 *
 * Структура отражает Фазу 0: организация → кампании → контакты → звонки → транскрипты,
 * плюс рассылка коммерческих email и стоп-лист. Множественные индексы оптимизированы
 * под основные запросы админки (списки звонков по кампании, поиск по телефону).
 *
 * Все enum'ы оформлены через pgEnum, чтобы Postgres валидировал значения на уровне БД.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// =================================================================
// ENUMS
// =================================================================

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "operator", "viewer"]);

export const industryEnum = pgEnum("industry", [
  "pharmacy",
  "delivery",
  "clinic",
  "restaurant",
  "retail",
  "services",
  "logistics",
  "construction",
  "utilities",
  "other",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "archived",
]);

export const contactStatusEnum = pgEnum("contact_status", [
  "new",
  "queued",
  "dialing",
  "called",
  "done",
  "error",
]);

export const callOutcomeEnum = pgEnum("call_outcome", [
  "email_collected", // успех
  "refused", // явный отказ
  "callback", // попросили перезвонить
  "voicemail", // автоответчик
  "no_answer", // не взяли трубку
  "busy", // занято
  "wrong_number", // не туда попали
  "transfer", // передали оператору
  "error", // системная ошибка
]);

export const callDirectionEnum = pgEnum("call_direction", ["outbound", "inbound"]);

export const emailEventTypeEnum = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
]);

// =================================================================
// ORGANIZATIONS (multi-tenancy готовится сразу)
// =================================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// =================================================================
// USERS — пользователи админки
// =================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: userRoleEnum("role").default("operator").notNull(),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    orgIdx: index("users_org_idx").on(t.organizationId),
  }),
);

// =================================================================
// CAMPAIGNS — кампании обзвона
// =================================================================

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: campaignStatusEnum("status").default("draft").notNull(),

    // Конфигурация скрипта
    promptVersion: varchar("prompt_version", { length: 64 }).default("dmitry_v0_1").notNull(),
    industry: industryEnum("industry").default("other").notNull(),

    // Лимиты дозвона
    callWindowStart: varchar("call_window_start", { length: 5 }).default("10:00").notNull(), // HH:MM
    callWindowEnd: varchar("call_window_end", { length: 5 }).default("18:00").notNull(),
    maxAttemptsPerContact: integer("max_attempts_per_contact").default(3).notNull(),
    retryIntervalHours: integer("retry_interval_hours").default(24).notNull(),
    maxConcurrentCalls: integer("max_concurrent_calls").default(5).notNull(),
    dailyCallLimit: integer("daily_call_limit").default(150).notNull(),

    // Статистика (денормализована для быстрого отображения)
    totalContacts: integer("total_contacts").default(0).notNull(),
    contactsCompleted: integer("contacts_completed").default(0).notNull(),
    emailsCollected: integer("emails_collected").default(0).notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("campaigns_org_idx").on(t.organizationId),
    statusIdx: index("campaigns_status_idx").on(t.status),
  }),
);

// =================================================================
// CONTACTS — компании из базы для обзвона
// =================================================================

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),

    // Идентификация
    companyName: varchar("company_name", { length: 500 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(), // нормализованный +7XXXXXXXXXX
    industry: industryEnum("industry").default("other").notNull(),
    region: varchar("region", { length: 128 }),
    city: varchar("city", { length: 128 }),

    // ЛПР (если знаем)
    decisionMakerName: varchar("decision_maker_name", { length: 255 }),
    decisionMakerRole: varchar("decision_maker_role", { length: 128 }),

    // Контакт-инфо
    website: varchar("website", { length: 500 }),
    knownEmail: varchar("known_email", { length: 255 }),

    // Источник
    source: varchar("source", { length: 64 }), // 2gis, rusprofile, manual...
    notes: text("notes"),

    // Состояние в кампании
    status: contactStatusEnum("status").default("new").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),

    // Результат — последний звонок
    lastCallOutcome: callOutcomeEnum("last_call_outcome"),
    collectedEmail: varchar("collected_email", { length: 255 }),
    callbackAt: timestamp("callback_at", { withTimezone: true }),

    // Стоп-лист
    doNotCall: boolean("do_not_call").default(false).notNull(),
    doNotCallReason: text("do_not_call_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("contacts_org_idx").on(t.organizationId),
    campaignIdx: index("contacts_campaign_idx").on(t.campaignId),
    phoneIdx: index("contacts_phone_idx").on(t.phone),
    statusIdx: index("contacts_status_idx").on(t.status),
    nextAttemptIdx: index("contacts_next_attempt_idx").on(t.nextAttemptAt),
    // Уникальный (организация, телефон) — чтобы не дублировать контакт
    orgPhoneUnique: uniqueIndex("contacts_org_phone_unique").on(t.organizationId, t.phone),
  }),
);

// =================================================================
// CALLS — каждая попытка звонка
// =================================================================

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),

    direction: callDirectionEnum("direction").default("outbound").notNull(),

    // Воксимплант / SIP идентификаторы
    providerCallId: varchar("provider_call_id", { length: 128 }), // Voximplant call_id
    callerNumber: varchar("caller_number", { length: 32 }), // наш исходящий
    calleeNumber: varchar("callee_number", { length: 32 }).notNull(), // куда звонили

    // Статус и итог
    outcome: callOutcomeEnum("outcome"),
    duration: integer("duration_seconds").default(0).notNull(),

    // Тайминг
    startedAt: timestamp("started_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    // Качество
    asrLatencyMs: integer("asr_latency_ms"),
    llmLatencyMs: integer("llm_latency_ms"),
    ttsLatencyMs: integer("tts_latency_ms"),

    // Стоимость в копейках, чтобы не возиться с float
    costTelephonyKop: integer("cost_telephony_kop").default(0).notNull(),
    costAsrKop: integer("cost_asr_kop").default(0).notNull(),
    costLlmKop: integer("cost_llm_kop").default(0).notNull(),
    costTtsKop: integer("cost_tts_kop").default(0).notNull(),

    // Аудиозапись
    recordingUrl: text("recording_url"),
    recordingDeleteAt: timestamp("recording_delete_at", { withTimezone: true }),

    // Результаты
    collectedEmail: varchar("collected_email", { length: 255 }),
    summary: text("summary"), // краткое резюме от LLM
    sentiment: varchar("sentiment", { length: 32 }), // positive / neutral / negative
    transferToHuman: boolean("transfer_to_human").default(false).notNull(),

    // Сырой металог — useful для отладки
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("calls_org_idx").on(t.organizationId),
    campaignIdx: index("calls_campaign_idx").on(t.campaignId),
    contactIdx: index("calls_contact_idx").on(t.contactId),
    outcomeIdx: index("calls_outcome_idx").on(t.outcome),
    startedIdx: index("calls_started_idx").on(t.startedAt),
    providerCallIdx: index("calls_provider_call_idx").on(t.providerCallId),
  }),
);

// =================================================================
// TRANSCRIPTS — реплики разговора
// =================================================================

export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: uuid("call_id")
      .references(() => calls.id, { onDelete: "cascade" })
      .notNull(),

    turnIndex: integer("turn_index").notNull(), // 0, 1, 2... — порядок в разговоре
    speaker: varchar("speaker", { length: 16 }).notNull(), // "bot" | "human"
    text: text("text").notNull(),

    // Тайминг внутри звонка (мс от начала)
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),

    // Сырой формат от ASR / LLM (partial transcripts, confidence)
    rawData: jsonb("raw_data"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    callIdx: index("transcript_turns_call_idx").on(t.callId),
    callTurnUnique: uniqueIndex("transcript_turns_call_turn_unique").on(t.callId, t.turnIndex),
  }),
);

// =================================================================
// CALL EVENTS — события (vad, tool_call, error)
// =================================================================

export const callEvents = pgTable(
  "call_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: uuid("call_id")
      .references(() => calls.id, { onDelete: "cascade" })
      .notNull(),

    eventType: varchar("event_type", { length: 64 }).notNull(),
    // Примеры: "vad_speech_start", "vad_speech_end", "asr_partial", "asr_final",
    // "llm_request", "llm_response", "tts_chunk", "tool_call",
    // "barge_in", "voicemail_detected", "transfer_initiated", "error"

    payload: jsonb("payload"),
    timestampMs: integer("timestamp_ms"), // от начала звонка

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    callIdx: index("call_events_call_idx").on(t.callId),
    typeIdx: index("call_events_type_idx").on(t.eventType),
  }),
);

// =================================================================
// EMAIL — рассылки КП после успешных звонков
// =================================================================

export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),

    template: varchar("template", { length: 64 }).default("cold_offer_v1").notNull(),
    subject: text("subject").notNull(),
    fromEmail: varchar("from_email", { length: 255 }).notNull(),
    toEmail: varchar("to_email", { length: 255 }).notNull(),

    // Идентификатор у ESP (Unisender / SendPulse / Mailgun)
    providerMessageId: varchar("provider_message_id", { length: 255 }),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),

    // Сырой HTML на момент отправки — для аудита
    htmlSnapshot: text("html_snapshot"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("email_sends_org_idx").on(t.organizationId),
    contactIdx: index("email_sends_contact_idx").on(t.contactId),
    toEmailIdx: index("email_sends_to_email_idx").on(t.toEmail),
  }),
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailSendId: uuid("email_send_id")
      .references(() => emailSends.id, { onDelete: "cascade" })
      .notNull(),
    eventType: emailEventTypeEnum("event_type").notNull(),
    metadata: jsonb("metadata"), // user-agent, IP, link clicked
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sendIdx: index("email_events_send_idx").on(t.emailSendId),
    typeIdx: index("email_events_type_idx").on(t.eventType),
  }),
);

// =================================================================
// STOP LIST — глобальный для организации
// =================================================================

export const stopList = pgTable(
  "stop_list",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    reason: text("reason"),
    addedByUserId: uuid("added_by_user_id").references(() => users.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgPhoneUnique: uniqueIndex("stop_list_org_phone_unique").on(t.organizationId, t.phone),
  }),
);

// =================================================================
// RELATIONS — для удобных join-ов через Drizzle query API
// =================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  campaigns: many(campaigns),
  contacts: many(contacts),
  calls: many(calls),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [campaigns.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [campaigns.createdByUserId],
    references: [users.id],
  }),
  contacts: many(contacts),
  calls: many(calls),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  campaign: one(campaigns, {
    fields: [contacts.campaignId],
    references: [campaigns.id],
  }),
  calls: many(calls),
  emails: many(emailSends),
}));

export const callsRelations = relations(calls, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [calls.organizationId],
    references: [organizations.id],
  }),
  campaign: one(campaigns, {
    fields: [calls.campaignId],
    references: [campaigns.id],
  }),
  contact: one(contacts, {
    fields: [calls.contactId],
    references: [contacts.id],
  }),
  transcriptTurns: many(transcriptTurns),
  events: many(callEvents),
}));

export const transcriptTurnsRelations = relations(transcriptTurns, ({ one }) => ({
  call: one(calls, {
    fields: [transcriptTurns.callId],
    references: [calls.id],
  }),
}));

export const callEventsRelations = relations(callEvents, ({ one }) => ({
  call: one(calls, {
    fields: [callEvents.callId],
    references: [calls.id],
  }),
}));

export const emailSendsRelations = relations(emailSends, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [emailSends.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [emailSends.contactId],
    references: [contacts.id],
  }),
  call: one(calls, {
    fields: [emailSends.callId],
    references: [calls.id],
  }),
  events: many(emailEvents),
}));

export const emailEventsRelations = relations(emailEvents, ({ one }) => ({
  emailSend: one(emailSends, {
    fields: [emailEvents.emailSendId],
    references: [emailSends.id],
  }),
}));

// =================================================================
// TYPE EXPORTS — для TS-кода во всём приложении
// =================================================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;

export type TranscriptTurn = typeof transcriptTurns.$inferSelect;
export type NewTranscriptTurn = typeof transcriptTurns.$inferInsert;

export type CallEvent = typeof callEvents.$inferSelect;
export type NewCallEvent = typeof callEvents.$inferInsert;

export type EmailSend = typeof emailSends.$inferSelect;
export type NewEmailSend = typeof emailSends.$inferInsert;

export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;

export type StopListEntry = typeof stopList.$inferSelect;
export type NewStopListEntry = typeof stopList.$inferInsert;
