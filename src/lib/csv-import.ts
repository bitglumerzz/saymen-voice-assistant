/**
 * CSV-импортёр баз контактов от парсинг-проекта.
 *
 * Особенности:
 * - Кириллические заголовки (Название, Телефон, Город, Регион…)
 * - Колонка «Все телефоны» с несколькими номерами через `;` — берём первый
 * - Телефоны бывают в формате `+7 952 285-90-00` и `+79522859000` — нормализуем
 * - Категории компаний на русском — мапим на наш industry-enum
 * - Дедупликация по (organization_id, phone)
 *
 * Используется и в API-роуте /api/contacts/import, и в CLI-скрипте.
 */

import { z } from "zod";

export type ImportRow = {
  companyName: string;
  phone: string; // +7XXXXXXXXXX
  industry: string;
  region?: string;
  city?: string;
  decisionMakerName?: string;
  decisionMakerRole?: string;
  website?: string;
  knownEmail?: string;
  source: string;
  notes?: string;
};

export type ImportError = {
  rowIndex: number;
  raw: Record<string, string>;
  reason: string;
};

export type ImportPreview = {
  detectedColumns: Record<keyof ImportRow, string | null>;
  totalRows: number;
  validRows: ImportRow[];
  errors: ImportError[];
};

// =================================================================
// 1. Парсинг CSV (без зависимостей: достаточно простого парсера для наших файлов)
// =================================================================

/**
 * Простой CSV-парсер с поддержкой кавычек и BOM в начале.
 * Не претендует на RFC 4180 во всей красе, но для UTF-8 CSV из 2GIS/etc — ок.
 */
export function parseCsv(text: string): string[][] {
  // Снять BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// =================================================================
// 2. Автодетекция колонок по заголовку
// =================================================================

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
  companyName: ["название", "name", "company", "компания", "наименование"],
  phone: ["все телефоны", "телефон", "phone", "телефоны", "номер"],
  industry: ["категория", "industry", "отрасль", "сфера"],
  region: ["регион", "region", "область", "субъект"],
  city: ["город", "city"],
  decisionMakerName: ["лпр", "контакт", "contact", "person"],
  decisionMakerRole: ["должность", "role"],
  website: ["сайт", "website", "url"],
  knownEmail: ["email", "почта", "e-mail"],
  source: ["источник", "source", "google maps"],
  notes: ["адрес", "notes", "комментарий", "примечание"],
};

export function detectColumns(headers: string[]): Record<keyof ImportRow, string | null> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const result: Partial<Record<keyof ImportRow, string | null>> = {};
  const headerNorms = headers.map(norm);

  for (const field of Object.keys(COLUMN_ALIASES) as Array<keyof ImportRow>) {
    const aliases = COLUMN_ALIASES[field].map(norm);
    let foundIdx = -1;
    // приоритет — наиболее точный alias первым в списке (например, "все телефоны" раньше "телефон")
    for (const alias of aliases) {
      const idx = headerNorms.findIndex((h) => h === alias);
      if (idx !== -1) {
        foundIdx = idx;
        break;
      }
    }
    // partial match как fallback
    if (foundIdx === -1) {
      for (const alias of aliases) {
        const idx = headerNorms.findIndex((h) => h.includes(alias));
        if (idx !== -1) {
          foundIdx = idx;
          break;
        }
      }
    }
    result[field] = foundIdx === -1 ? null : (headers[foundIdx] ?? null);
  }
  return result as Record<keyof ImportRow, string | null>;
}

// =================================================================
// 3. Нормализация телефона
// =================================================================

/**
 * Принимаем что угодно (`+7 952 285-90-00`, `89522859000`, `+79522859000;+...`),
 * возвращаем единый формат `+7XXXXXXXXXX` или null если невалидно.
 *
 * Если в строке несколько номеров через `;` или `,` — берём первый.
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // Берём первый номер если их несколько
  const first = raw.split(/[;,]/)[0]?.trim();
  if (!first) return null;
  const digits = first.replace(/\D/g, "");
  if (digits.length === 11) {
    if (digits[0] === "8") return "+7" + digits.slice(1);
    if (digits[0] === "7") return "+" + digits;
    return null;
  }
  if (digits.length === 10) {
    return "+7" + digits;
  }
  if (digits.length === 12 && digits.startsWith("00")) {
    // +XX...
    return "+" + digits.slice(2);
  }
  return null;
}

// =================================================================
// 4. Маппинг отрасли (русская категория → enum)
// =================================================================

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  pharmacy: ["аптек", "фармац"],
  delivery: ["доставк", "курьер", "логистик"],
  clinic: ["клиник", "медиц", "стомат", "врач"],
  restaurant: ["ресторан", "кафе", "общепит", "пицц", "еда"],
  retail: ["магазин", "рознич", "торгов"],
  services: ["услуг", "сервис", "консалт", "юрид", "бухгалт"],
  logistics: ["перевозк", "грузо", "логистик", "склад"],
  construction: ["строит", "ремонт", "застройщ", "монтаж", "стройк"],
  utilities: ["энергосбыт", "энерг", "коммунал", "тепло", "газоснаб", "водоснаб", "электро"],
};

export function inferIndustry(category: string | undefined | null): string {
  if (!category) return "other";
  const lower = category.toLowerCase();
  for (const [industry, kws] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) return industry;
  }
  return "other";
}

// =================================================================
// 5. Главная функция: CSV-текст → ImportPreview
// =================================================================

const phoneSchema = z.string().regex(/^\+7\d{10}$/, "Невалидный телефон");

export function buildImportPreview(csvText: string, sourceName = "csv-upload"): ImportPreview {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return {
      detectedColumns: {} as Record<keyof ImportRow, string | null>,
      totalRows: 0,
      validRows: [],
      errors: [{ rowIndex: 0, raw: {}, reason: "Файл пустой или нет данных кроме заголовка" }],
    };
  }

  const headers = rows[0]!.map((h) => h.trim());
  const detected = detectColumns(headers);

  if (!detected.companyName || !detected.phone) {
    return {
      detectedColumns: detected,
      totalRows: rows.length - 1,
      validRows: [],
      errors: [
        {
          rowIndex: 0,
          raw: Object.fromEntries(headers.map((h, i) => [h, String(i)])),
          reason: `Не нашли обязательные колонки. Нужны: «Название» и «Телефон» (или «Все телефоны»). Найдено заголовков: ${headers.join(", ")}`,
        },
      ],
    };
  }

  const colIdx = (header: string | null) => (header ? headers.indexOf(header) : -1);
  const idx = {
    companyName: colIdx(detected.companyName),
    phone: colIdx(detected.phone),
    industry: colIdx(detected.industry),
    region: colIdx(detected.region),
    city: colIdx(detected.city),
    decisionMakerName: colIdx(detected.decisionMakerName),
    decisionMakerRole: colIdx(detected.decisionMakerRole),
    website: colIdx(detected.website),
    knownEmail: colIdx(detected.knownEmail),
    notes: colIdx(detected.notes),
  };

  const validRows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenPhones = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.length === 0 || row.every((c) => c.trim() === "")) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => (raw[h] = row[i] ?? ""));

    const companyName = (row[idx.companyName] ?? "").trim();
    const phoneRaw = row[idx.phone] ?? "";
    const phone = normalizePhone(phoneRaw);

    if (!companyName) {
      errors.push({ rowIndex: r, raw, reason: "Пустое название" });
      continue;
    }
    if (!phone) {
      errors.push({ rowIndex: r, raw, reason: `Невалидный/пустой телефон: «${phoneRaw}»` });
      continue;
    }
    if (!phoneSchema.safeParse(phone).success) {
      errors.push({ rowIndex: r, raw, reason: `Телефон не соответствует +7XXXXXXXXXX: «${phone}»` });
      continue;
    }
    if (seenPhones.has(phone)) {
      errors.push({ rowIndex: r, raw, reason: `Дубль в файле: ${phone}` });
      continue;
    }
    seenPhones.add(phone);

    const industry = inferIndustry(idx.industry >= 0 ? row[idx.industry] : undefined);

    const item: ImportRow = {
      companyName,
      phone,
      industry,
      region: nonEmpty(row[idx.region]),
      city: nonEmpty(row[idx.city]),
      decisionMakerName: nonEmpty(row[idx.decisionMakerName]),
      decisionMakerRole: nonEmpty(row[idx.decisionMakerRole]),
      website: nonEmpty(row[idx.website]),
      knownEmail: takeFirstEmail(row[idx.knownEmail]),
      source: sourceName,
      notes: nonEmpty(row[idx.notes]),
    };
    validRows.push(item);
  }

  return {
    detectedColumns: detected,
    totalRows: rows.length - 1,
    validRows,
    errors,
  };
}

function nonEmpty(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

function takeFirstEmail(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const first = s.split(/[;,]/)[0]?.trim().toLowerCase();
  if (!first) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) return undefined;
  return first;
}
