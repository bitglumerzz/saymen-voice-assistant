/**
 * Минимальный клиент Unisender для отправки транзакционных email.
 *
 * Используется для автоотправки коммерческого предложения после успешного
 * Telegram-диалога/звонка, в котором собран email ЛПР.
 *
 * Документация: https://www.unisender.com/ru/support/api/
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://api.unisender.com/ru/api";

export type UnisenderConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

export type SendEmailArgs = {
  to: string;
  subject: string;
  /** HTML-тело письма с уже подставленными плейсхолдерами */
  html: string;
  /** Опционально: текстовая версия (для клиентов, не понимающих HTML) */
  text?: string;
};

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; raw?: unknown };

export class UnisenderClient {
  constructor(private readonly cfg: UnisenderConfig) {}

  /**
   * Отправить одиночное письмо (transactional, не рассылка).
   * https://www.unisender.com/ru/support/api/messages/sendemail/
   */
  async sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
    const params = new URLSearchParams({
      format: "json",
      api_key: this.cfg.apiKey,
      email: args.to,
      sender_name: this.cfg.fromName,
      sender_email: this.cfg.fromEmail,
      subject: args.subject,
      body: args.html,
      list_id: "1", // Unisender требует list_id даже для transactional — указать любой существующий
    });

    const res = await fetch(`${API_BASE}/sendEmail?${params.toString()}`, {
      method: "POST",
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      return { ok: false, error: `non-JSON response, http=${res.status}` };
    }

    if (data?.error) {
      return { ok: false, error: data.error, raw: data };
    }

    // Unisender возвращает массив с одним объектом; messageId внутри
    const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
    const messageId = String(result?.id ?? "");

    return messageId
      ? { ok: true, messageId }
      : { ok: false, error: "не нашли messageId в ответе", raw: data };
  }
}

export function createUnisenderClient(): UnisenderClient {
  const apiKey = process.env.UNISENDER_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? "hello@saymen.io";
  const fromName = process.env.EMAIL_FROM_NAME ?? "Saymen";
  if (!apiKey) {
    throw new Error("UNISENDER_API_KEY не задан в .env.local");
  }
  return new UnisenderClient({ apiKey, fromEmail, fromName });
}

// =================================================================
// Шаблонизация писем
// =================================================================

let templateCache: string | null = null;

function loadTemplate(): string {
  if (templateCache) return templateCache;
  // src/lib → ../../email_templates/cold_offer_v1.html
  const path = join(__dirname, "..", "..", "email_templates", "cold_offer_v1.html");
  templateCache = readFileSync(path, "utf-8");
  return templateCache;
}

export type TemplateVars = {
  name?: string;
  company: string;
  industry?: string;
  callSummary?: string;
  calendarLink?: string;
  pixelUrl?: string;
  unsubscribeUrl?: string;
};

const INDUSTRY_HOOKS: Record<string, string> = {
  pharmacy:
    "Конкретно для аптек обычно делаем сценарий «есть ли в наличии», «уточнить дозировку», «забронировать товар» — это разгружает фармацевта от телефона, чтобы он работал с клиентом в зале.",
  delivery:
    "Для служб доставки чаще всего — подтверждение заказа голосом и обзвон по NPS. Один ассистент закрывает работу 3–4 диспетчеров на час пик.",
  clinic:
    "Для клиник мы делаем запись на приём, напоминания за сутки, отмены и переносы — без звонков администратору.",
  construction:
    "Для строительных компаний — обзвон по тёплым лидам с лендингов, квалификация по бюджету и срокам, передача горячих ЛПР менеджеру.",
  utilities:
    "Для энергосбытовых организаций — массовые информирующие звонки клиентам (показания, задолженности, плановые отключения) без участия операторов.",
};

const DEFAULT_HOOK =
  "Под вашу задачу мы соберём сценарий за 5–7 дней — обычно это 1–2 итерации с вашими реальными звонками для калибровки.";

/**
 * Подставить переменные в HTML-шаблон cold_offer_v1.
 * Простая замена `{{var}}` → значение, без зависимостей вроде Handlebars.
 */
export function renderColdOfferEmail(vars: TemplateVars): string {
  let html = loadTemplate();
  const replacements: Record<string, string> = {
    "{{name}}": vars.name ? escapeHtml(vars.name) + "," : "Здравствуйте!",
    "{{company}}": escapeHtml(vars.company),
    "{{industry_hook}}": vars.industry ? (INDUSTRY_HOOKS[vars.industry] ?? DEFAULT_HOOK) : DEFAULT_HOOK,
    "{{call_summary}}": vars.callSummary ?? "",
    "{{calendar_link}}": vars.calendarLink ?? "https://saymen.io/demo",
    "{{pixel_url}}": vars.pixelUrl ?? "",
    "{{unsubscribe_url}}": vars.unsubscribeUrl ?? "https://saymen.io/unsubscribe",
  };
  for (const [k, v] of Object.entries(replacements)) {
    html = html.split(k).join(v);
  }
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
