export type ScoreMap = Map<string, string>;

export const scoreKey = (pid: string, sid: string) => `${pid}:${sid}`;

export interface ScoresPayloadEntry {
  participantId: string;
  scores: Array<{ subjectId: string; score: number | null }>;
}

export type BuildScoresResult =
  | { ok: true; participants: ScoresPayloadEntry[] }
  | { ok: false; error: string };

/**
 * `/scores/bulk` so'rovi. O'zgargan ishtirokchilar uchun:
 * - kiritilgan katak → son;
 * - ilgari bahosi bo'lib, endi bo'shatilgan katak → `null` (server o'chiradi).
 *   Ilgari bunday katak so'rovga umuman kirmasdi, shuning uchun xato
 *   kiritilgan bahoni o'chirib bo'lmasdi;
 * - hech qachon kiritilmagan bo'sh katak → yuborilmaydi (mavjudini 0 ga
 *   aylantirib yubormaslik uchun).
 */
export function buildScoresPayload(
  subjects: Array<{ id: string; name: string; maxScore: number }>,
  dirtyParticipantIds: Iterable<string>,
  edits: ScoreMap,
  initial: ScoreMap,
): BuildScoresResult {
  const participants: ScoresPayloadEntry[] = [];

  for (const pid of dirtyParticipantIds) {
    const scores: ScoresPayloadEntry["scores"] = [];
    for (const subject of subjects) {
      const key = scoreKey(pid, subject.id);
      const raw = edits.get(key);
      if (raw === undefined) {
        if (initial.has(key))
          scores.push({ subjectId: subject.id, score: null });
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          error: `Ball noto'g'ri kiritildi: ${subject.name}`,
        };
      }
      if (n < 0 || n > subject.maxScore) {
        return {
          ok: false,
          error: `Ball 0 dan ${subject.maxScore} gacha bo'lishi kerak (${subject.name})`,
        };
      }
      scores.push({ subjectId: subject.id, score: n });
    }
    if (scores.length > 0) participants.push({ participantId: pid, scores });
  }

  return { ok: true, participants };
}
