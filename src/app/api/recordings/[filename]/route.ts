import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * GET /api/recordings/{filename}
 *
 * Отдаёт аудио-файл из data/recordings/. Имя файла валидируется
 * (whitelist символов + только в нашей папке), чтобы исключить path traversal.
 */

const RECORDINGS_DIR = resolve(process.cwd(), "data", "recordings");

export const runtime = "nodejs";

export async function GET(_req: Request, props: { params: Promise<{ filename: string }> }) {
  const { filename } = await props.params;

  // Только латиница, цифры, подчёркивание, дефис, точка. Никаких / .. \
  if (!/^[A-Za-z0-9_.\-]+$/.test(filename)) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }

  const fullPath = join(RECORDINGS_DIR, filename);

  // Дополнительная защита: реальный путь должен начинаться с RECORDINGS_DIR
  if (!resolve(fullPath).startsWith(RECORDINGS_DIR)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const stats = await stat(fullPath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "not a file" }, { status: 404 });
    }
    const buf = await readFile(fullPath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime =
      ext === "mp3"
        ? "audio/mpeg"
        : ext === "ogg"
          ? "audio/ogg"
          : ext === "wav"
            ? "audio/wav"
            : "application/octet-stream";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "ENOENT") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
