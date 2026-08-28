import type { AudioSegment } from './align';

/**
 * Whisper bo'lagining chegarasini jimlik bo'yicha toraytiradi.
 *
 * Whisper bir bo'lakning oxirini keyingisining boshigacha cho'zadi:
 * «Hallo» aslida 3.64–4.21 da aytiladi, lekin bo'lak 3.38–6.34 deb
 * keladi, ya'ni ichida ikki soniyalik jimlik bor. Shu holicha o'ynatilsa
 * so'z tugagach jimlik davom etadi va o'quvchi keyingi tugmani bosishga
 * shoshadi.
 *
 * ffmpeg'ning jimlik ro'yxati esa aniq chegara beradi, lekin qaysi
 * bo'lak qaysi so'z ekanini bilmaydi. Shuning uchun ikkalasi birga:
 * matn Whisper'dan, chegara jimlikdan.
 */

export interface SpeechSpan {
  startMs: number;
  endMs: number;
}

/**
 * `silencedetect` chiqishini nutq oraliqlariga aylantiradi.
 *
 * ffmpeg jimliklarni beradi, bizga esa ular orasidagi nutq kerak.
 */
export function speechSpans(
  silences: { startMs: number; endMs: number }[],
  durationMs: number,
): SpeechSpan[] {
  const spans: SpeechSpan[] = [];
  let cursor = 0;

  for (const s of silences) {
    if (s.startMs > cursor) spans.push({ startMs: cursor, endMs: s.startMs });
    cursor = Math.max(cursor, s.endMs);
  }
  if (cursor < durationMs) spans.push({ startMs: cursor, endMs: durationMs });

  return spans;
}

/** `silencedetect` matnidan jimlik oraliqlarini o'qiydi. */
export function parseSilences(
  output: string,
): { startMs: number; endMs: number }[] {
  const starts = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) =>
    Math.round(Number(m[1]) * 1000),
  );
  const ends = [...output.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) =>
    Math.round(Number(m[1]) * 1000),
  );

  return starts.map((startMs, i) => ({
    startMs,
    // Oxirgi jimlik fayl oxirigacha davom etishi mumkin — unda `end` yo'q.
    endMs: ends[i] ?? startMs,
  }));
}

/**
 * Bo'lakni ichidagi haqiqiy nutqqa qisqartiradi.
 *
 * Bo'lak bilan kesishgan nutq oraliqlari topiladi va chegara ularning
 * eng chetkilariga tortiladi. Kesishma topilmasa bo'lak O'ZGARMAY
 * qoladi: jimlik aniqlash sozlamasi bu fayl uchun to'g'ri kelmagan
 * bo'lishi mumkin, va bunday holatda kengroq oraliq noto'g'risidan
 * yaxshiroq.
 */
export function tighten(
  segment: AudioSegment,
  spans: SpeechSpan[],
  padMs = 60,
): AudioSegment {
  const inside = spans.filter(
    (s) => s.endMs > segment.startMs && s.startMs < segment.endMs,
  );
  if (inside.length === 0) return segment;

  const startMs = Math.max(
    segment.startMs,
    Math.min(...inside.map((s) => s.startMs)) - padMs,
  );
  const endMs = Math.min(
    segment.endMs,
    Math.max(...inside.map((s) => s.endMs)) + padMs,
  );

  return endMs > startMs ? { ...segment, startMs, endMs } : segment;
}
