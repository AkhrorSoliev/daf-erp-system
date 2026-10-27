import type {
  JangKind,
  JangQuestion,
  JangStatus,
  JangUnit,
} from "./media-jang-types";

export interface JangFilter {
  search: string;
  kind: "ALL" | JangKind;
  status: "ALL" | JangStatus;
}

export function filtrFaolmi(f: JangFilter): boolean {
  return f.search.trim() !== "" || f.kind !== "ALL" || f.status !== "ALL";
}

function mosmi(q: JangQuestion, needle: string): boolean {
  if (!needle) return true;
  return [q.prompt, q.answer, q.sourceId, ...q.options, ...q.akzeptiert].some(
    (s) => s.toLowerCase().includes(needle),
  );
}

/**
 * Filtrga mos savollarni qoldiradi; bo'sh qolgan unit tashlanadi. Filtr
 * yo'q bo'lsa kirgan massivning o'zi qaytadi (qayta chizish bo'lmasin).
 */
export function filtrla(units: JangUnit[], f: JangFilter): JangUnit[] {
  if (!filtrFaolmi(f)) return units;
  const needle = f.search.trim().toLowerCase();
  const natija: JangUnit[] = [];
  for (const u of units) {
    const questions = u.questions.filter(
      (q) =>
        (f.kind === "ALL" || q.kind === f.kind) &&
        (f.status === "ALL" || q.status === f.status) &&
        mosmi(q, needle),
    );
    if (questions.length > 0) natija.push({ ...u, questions });
  }
  return natija;
}

export function jamiSonlar(units: JangUnit[]) {
  let jami = 0;
  let tasdiqlangan = 0;
  let qoralama = 0;
  for (const u of units) {
    jami += u.counts.jami;
    tasdiqlangan += u.counts.tasdiqlangan;
    qoralama += u.counts.qoralama;
  }
  return { jami, tasdiqlangan, qoralama };
}

/**
 * «Variantlar» ustuni: variantlar, to'g'risi belgilangan. Javob variantlar
 * orasida bo'lmasa (Yozish savoli yoki nomuvofiqlik) uni alohida to'g'ri chip
 * qilib qo'shamiz — CEO javobni har doim ko'rishi shart.
 */
export function javobChiplari(
  q: JangQuestion,
): { text: string; togri: boolean }[] {
  const chiplar = q.options.map((text) => ({ text, togri: text === q.answer }));
  if (!chiplar.some((c) => c.togri)) chiplar.push({ text: q.answer, togri: true });
  return chiplar;
}
