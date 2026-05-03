"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  floatToPcm16,
  pcm16ToFloat,
  resampleFloat32,
} from "@/lib/audio";

type Status = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error" | "ended";

type TranscriptItem = {
  speaker: "bot" | "human";
  text: string;
  ts: number;
};

const TARGET_SAMPLE_RATE = 16_000;

export function VoiceTester({ wsUrl }: { wsUrl: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const playbackTimeRef = useRef<number>(0);
  const callIdRef = useRef<string>("");

  const stop = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;

    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    playbackQueueRef.current = [];
    setStatus("ended");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setStatus("connecting");
    callIdRef.current = `dev-${Date.now()}`;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (constraintErr) {
        // Некоторые Mac-микрофоны не любят даже базовые constraints — берём «любой»
        console.warn("getUserMedia: constraints rejected, fallback to audio:true", constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      playbackTimeRef.current = audioCtx.currentTime + 0.1;
      const inputRate = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // ScriptProcessorNode устаревший, но самый простой для прототипа.
      // На проде заменить на AudioWorklet.
      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      const wsParam = `?callId=${encodeURIComponent(callIdRef.current)}&organizationId=demo-org&dmName=Тест&company=Demo`;
      const ws = new WebSocket(wsUrl + wsParam);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "hello",
            callId: callIdRef.current,
            sampleRate: TARGET_SAMPLE_RATE,
          }),
        );
        setStatus("listening");

        // Начинаем слать аудио только после открытия WS
        processor.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float = ev.inputBuffer.getChannelData(0);
          const resampled = resampleFloat32(float, inputRate, TARGET_SAMPLE_RATE);
          const pcm = floatToPcm16(resampled);
          ws.send(
            JSON.stringify({
              type: "audio_in",
              data: arrayBufferToBase64(pcm),
            }),
          );
        };

        source.connect(processor);
        // SilentGain, чтобы processor работал, но мы не слышали себя
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        let msg: { type: string; [k: string]: unknown };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === "audio_out" && typeof msg.data === "string") {
          const ab = base64ToArrayBuffer(msg.data);
          const float = pcm16ToFloat(ab);
          schedulePlayback(audioCtx, float);
        } else if (msg.type === "transcript") {
          setTranscript((prev) => [
            ...prev,
            {
              speaker: msg.speaker as "bot" | "human",
              text: String(msg.text ?? ""),
              ts: Number(msg.ts ?? 0),
            },
          ]);
        } else if (msg.type === "status") {
          const s = msg.state as Status;
          if (["listening", "thinking", "speaking", "ended"].includes(s)) setStatus(s);
        } else if (msg.type === "hangup") {
          stop();
        }
      };

      ws.onerror = () => {
        setError("WebSocket error");
        setStatus("error");
      };

      ws.onclose = () => {
        if (status !== "ended") setStatus("ended");
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [wsUrl, status, stop]);

  const schedulePlayback = (audioCtx: AudioContext, float: Float32Array): void => {
    const buffer = audioCtx.createBuffer(1, float.length, TARGET_SAMPLE_RATE);
    buffer.copyToChannel(float, 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);

    const startAt = Math.max(playbackTimeRef.current, audioCtx.currentTime);
    src.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  };

  // Cleanup на unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  const isActive = status !== "idle" && status !== "ended" && status !== "error";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <StatusBadge status={status} />
          <div className="flex gap-2">
            {!isActive ? (
              <button
                onClick={start}
                className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                {status === "ended" || status === "error" ? "Начать заново" : "Начать разговор"}
              </button>
            ) : (
              <button
                onClick={stop}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Остановить
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Ошибка: {error}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">Транскрипт</div>
        {transcript.length === 0 ? (
          <div className="text-sm text-slate-400">
            Нажмите «Начать разговор», разрешите микрофон и говорите. Реплики будут появляться
            здесь.
          </div>
        ) : (
          <div className="space-y-3">
            {transcript.map((t, i) => (
              <div
                key={i}
                className={
                  t.speaker === "bot"
                    ? "rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-900"
                    : "rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-900"
                }
              >
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                  {t.speaker === "bot" ? "Дмитрий (бот)" : "Вы"}
                  <span className="ml-2 font-normal opacity-60">
                    {(t.ts / 1000).toFixed(1)}s
                  </span>
                </div>
                {t.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    idle: { label: "Готов к запуску", cls: "bg-slate-100 text-slate-700" },
    connecting: { label: "Подключаюсь…", cls: "bg-amber-100 text-amber-800" },
    listening: { label: "Слушает вас", cls: "bg-emerald-100 text-emerald-800" },
    thinking: { label: "Думает", cls: "bg-violet-100 text-violet-800" },
    speaking: { label: "Говорит", cls: "bg-blue-100 text-blue-800" },
    ended: { label: "Завершён", cls: "bg-slate-200 text-slate-600" },
    error: { label: "Ошибка", cls: "bg-rose-100 text-rose-800" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
  );
}
