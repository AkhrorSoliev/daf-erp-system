import type { Maqsad, MaqsadDarajasi } from "./types";

/**
 * Oynachadagi uch daraja (spec S2 3.1). Ballar serverdagi `MAQSAD_BALL`
 * (`server/src/daf/uebung/punkte.ts`) — `maqsad.test.ts` ularni o'sha fayldan
 * o'qib solishtiradi.
 */
export const MAQSAD_VARIANTLARI: {
  daraja: MaqsadDarajasi;
  nomi: string;
  ball: number;
  seans: string;
}[] = [
  { daraja: "YENGIL", nomi: "Yengil", ball: 40, seans: "≈ yarim seans" },
  { daraja: "ORTA", nomi: "O'rta", ball: 80, seans: "≈ bir seans" },
  { daraja: "JIDDIY", nomi: "Jiddiy", ball: 160, seans: "≈ ikki seans" },
];

export type MaqsadHolatBelgisi = "jarayon" | "bajarildi" | "bosh";

/**
 * Halqa kartasi nimani aytadi — serverning `bajarildi`/`bosh` bayroqlaridan.
 * Ball bilan bajarilgan maqsad «Maqsad bajarildi» deydi, `bosh` bo'lsa ham.
 */
export function maqsadKartasi(m: Maqsad): {
  holat: MaqsadHolatBelgisi;
  foiz: number;
  sarlavha: string;
  ballMatni: string;
  darajaNomi: string;
} {
  const holat: MaqsadHolatBelgisi = !m.bajarildi
    ? "jarayon"
    : m.hozir >= m.ball
      ? "bajarildi"
      : "bosh";
  const sarlavha = {
    jarayon: "Bugungi maqsad",
    bajarildi: "Maqsad bajarildi",
    bosh: "Bugun mashq qolmadi",
  }[holat];
  return {
    holat,
    foiz:
      holat === "jarayon"
        ? Math.min(100, Math.round((m.hozir / m.ball) * 100))
        : 100,
    sarlavha,
    ballMatni: `${m.hozir} / ${m.ball} ball`,
    darajaNomi:
      MAQSAD_VARIANTLARI.find((v) => v.daraja === m.daraja)?.nomi ?? "O'rta",
  };
}
