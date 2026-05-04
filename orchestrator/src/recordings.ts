/**
 * Сохранение аудио-фрагментов разговоров на диск.
 *
 * Файлы пишем в общую папку `data/recordings/` (gitignored), относительно
 * корня проекта Saymen_bot. Next.js админка отдаёт их через /api/recordings/[file].
 *
 * Имя файла: `{callId}_{turnIndex}_{speaker}.{ext}` — easily linkable from DB.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// orchestrator/src → ../../data/recordings
const RECORDINGS_DIR = resolve(__dirname, "..", "..", "data", "recordings");
let dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await mkdir(RECORDINGS_DIR, { recursive: true });
  dirEnsured = true;
}

export async function saveAudio(opts: {
  callId: string;
  turnIndex: number;
  speaker: "bot" | "human";
  /** Расширение файла без точки: "ogg", "mp3" */
  ext: string;
  data: Buffer;
}): Promise<string | null> {
  try {
    await ensureDir();
    const filename = `${opts.callId}_${String(opts.turnIndex).padStart(3, "0")}_${opts.speaker}.${opts.ext}`;
    const fullPath = join(RECORDINGS_DIR, filename);
    await writeFile(fullPath, opts.data);
    // Возвращаем именно путь, который потом подаст /api/recordings/{filename}
    return `/api/recordings/${filename}`;
  } catch (e) {
    logger.warn(
      { err: String(e), callId: opts.callId },
      "[recordings] не смогли сохранить аудио",
    );
    return null;
  }
}
