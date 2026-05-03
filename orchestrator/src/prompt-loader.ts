/**
 * Загрузка системного промта из файла prompts/dmitry_persona.md.
 * Берём содержимое блока ```...``` под заголовком "## SYSTEM PROMPT".
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: string | null = null;

export function loadDmitryPrompt(): string {
  if (cached) return cached;
  // orchestrator/src → ../../prompts/dmitry_persona.md
  const path = join(__dirname, "..", "..", "prompts", "dmitry_persona.md");

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    logger.warn({ path, err: String(e) }, "не нашли dmitry_persona.md, используем встроенный fallback");
    cached = FALLBACK_PROMPT;
    return cached;
  }

  // Ищем "## SYSTEM PROMPT" и следующий за ним fenced block
  const sysIdx = raw.indexOf("## SYSTEM PROMPT");
  if (sysIdx === -1) {
    logger.warn("в dmitry_persona.md не найден ## SYSTEM PROMPT, используем весь файл");
    cached = raw;
    return cached;
  }
  const afterHeader = raw.slice(sysIdx);
  const fenceStart = afterHeader.indexOf("```");
  if (fenceStart === -1) {
    cached = afterHeader;
    return cached;
  }
  const codeStart = afterHeader.indexOf("\n", fenceStart) + 1;
  const fenceEnd = afterHeader.indexOf("```", codeStart);
  cached = fenceEnd === -1 ? afterHeader.slice(codeStart) : afterHeader.slice(codeStart, fenceEnd).trim();
  return cached;
}

const FALLBACK_PROMPT = `Ты — Дмитрий, голосовой ассистент Saymen. Звонишь B2B-клиентам с целью получить email и согласие на отправку коммерческого предложения. Говоришь коротко, по-человечески, без канцелярита. Если спросят «вы робот?» — честно: «Да, я голосовой ассистент Saymen». В конце звонка ОБЯЗАТЕЛЬНО вызови end_call с подходящим outcome.`;

/**
 * Подмешать переменные звонка в промт.
 */
export function buildSystemPrompt(ctx: {
  industry?: string;
  companyName?: string;
  decisionMakerName?: string;
}): string {
  const base = loadDmitryPrompt();
  const lines: string[] = [base, "", "## КОНТЕКСТ ЗВОНКА"];
  if (ctx.companyName) lines.push(`- Компания: ${ctx.companyName}`);
  if (ctx.industry) lines.push(`- Отрасль: ${ctx.industry}`);
  if (ctx.decisionMakerName) lines.push(`- ЛПР: ${ctx.decisionMakerName} — обращайся по имени, если уместно.`);
  return lines.join("\n");
}
