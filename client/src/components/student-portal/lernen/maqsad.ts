import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "./liga";
import type { Maqsad, MaqsadDarajasi } from "./types";

/**
 * Oynachadagi uch daraja (spec S2 3.1). Ballar serverdagi `MAQSAD_BALL`
 * (`server/src/daf/uebung/punkte.ts`) — `maqsad.test.ts` ularni o'sha fayldan
 * o'qib solishtiradi. `nomi` va `seans` — `msg()` matnlar, `t()` bilan chiziladi.
 */
export const MAQSAD_VARIANTLARI: {
  daraja: MaqsadDarajasi;
  nomi: string;
  ball: number;
  seans: string;
}[] = [
  { daraja: "YENGIL", nomi: msg("Yengil"), ball: 40, seans: msg("≈ yarim seans") },
  { daraja: "ORTA", nomi: msg("O'rta"), ball: 80, seans: msg("≈ bir seans") },
  { daraja: "JIDDIY", nomi: msg("Jiddiy"), ball: 160, seans: msg("≈ ikki seans") },
];

export type MaqsadHolatBelgisi = "jarayon" | "bajarildi" | "bosh";

const SARLAVHA: Record<MaqsadHolatBelgisi, string> = {
  jarayon: msg("Bugungi maqsad"),
  bajarildi: msg("Maqsad bajarildi"),
  bosh: msg("Bugun mashq qolmadi"),
};

/**
 * Halqa kartasi nimani aytadi — serverning `bajarildi`/`bosh` bayroqlaridan.
 * Ball bilan bajarilgan maqsad «Maqsad bajarildi» deydi, `bosh` bo'lsa ham.
 */
export function maqsadKartasi(
  m: Maqsad,
  t: Translate = interpolate,
): {
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
  const sarlavha = SARLAVHA[holat];
  const darajaNomi =
    MAQSAD_VARIANTLARI.find((v) => v.daraja === m.daraja)?.nomi ?? msg("O'rta");
  return {
    holat,
    foiz:
      holat === "jarayon"
        ? Math.min(100, Math.round((m.hozir / m.ball) * 100))
        : 100,
    sarlavha: t(sarlavha),
    ballMatni: t("{n} / {total} ball", { n: m.hozir, total: m.ball }),
    darajaNomi: t(darajaNomi),
  };
}
