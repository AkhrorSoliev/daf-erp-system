/**
 * Jang savollarini admin ko'rigi uchun shakllantiradi — sof funksiya, bazaga
 * tegmaydi (`DafMediaJangService` so'rovni qiladi, bu yer faqat shakl beradi).
 */

export interface JangQuestionRow {
  id: number;
  sourceId: string;
  kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
  prompt: string;
  options: string[];
  answer: string;
  akzeptiert: string[];
  audioKey: string | null;
  audioStartMs: number | null;
  audioEndMs: number | null;
  status: 'DRAFT' | 'APPROVED';
}

export interface JangUnitRow {
  id: number;
  level: string;
  order: number;
  code: string | null;
  titleUz: string;
  titleDe: string;
  battleQuestions: JangQuestionRow[];
}

export interface JangQuestionView {
  id: number;
  sourceId: string;
  /** `sourceId` oxiridagi uch raqam: `023`. */
  raqam: string;
  kind: JangQuestionRow['kind'];
  prompt: string;
  options: string[];
  answer: string;
  akzeptiert: string[];
  status: JangQuestionRow['status'];
  /** Xom `audioKey` HECH QACHON chiqmaydi — faqat ommaviy manzil. */
  audio: { url: string; startMs: number | null; endMs: number | null } | null;
}

export interface JangUnitView {
  unitId: number;
  code: string;
  order: number;
  titleUz: string;
  titleDe: string;
  /** Savollar yashaydigan manba fayl: `a1-u02.json`. */
  fayl: string;
  counts: {
    jami: number;
    tasdiqlangan: number;
    qoralama: number;
    choose: number;
    type: number;
    listen: number;
  };
  questions: JangQuestionView[];
}

export interface JangOverview {
  units: JangUnitView[];
}

export function raqamOf(sourceId: string): string {
  const m = /-(\d{3})$/.exec(sourceId);
  return m ? m[1] : sourceId;
}

export function shakllantir(
  units: JangUnitRow[],
  mediaUrl: (key: string | null) => string | null,
): JangUnitView[] {
  return units
    .filter((u) => u.battleQuestions.length > 0)
    .map((u) => {
      const code = u.code ?? `u${String(u.order).padStart(2, '0')}`;
      const questions: JangQuestionView[] = [...u.battleQuestions]
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
        .map((q) => {
          const url = mediaUrl(q.audioKey);
          return {
            id: q.id,
            sourceId: q.sourceId,
            raqam: raqamOf(q.sourceId),
            kind: q.kind,
            prompt: q.prompt,
            options: q.options,
            answer: q.answer,
            akzeptiert: q.akzeptiert,
            status: q.status,
            audio: url
              ? { url, startMs: q.audioStartMs, endMs: q.audioEndMs }
              : null,
          };
        });
      const count = (f: (q: JangQuestionView) => boolean) =>
        questions.filter(f).length;
      const tasdiqlangan = count((q) => q.status === 'APPROVED');
      return {
        unitId: u.id,
        code,
        order: u.order,
        titleUz: u.titleUz,
        titleDe: u.titleDe,
        fayl: `${u.level.toLowerCase()}-${code}.json`,
        counts: {
          jami: questions.length,
          tasdiqlangan,
          qoralama: questions.length - tasdiqlangan,
          choose: count((q) => q.kind === 'CHOOSE'),
          type: count((q) => q.kind === 'TYPE'),
          listen: count((q) => q.kind === 'LISTEN'),
        },
        questions,
      };
    });
}
