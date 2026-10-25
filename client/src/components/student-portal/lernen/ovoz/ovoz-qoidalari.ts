export type OvozHodisa =
  | "bos"
  | "togri"
  | "xato"
  | "unitOchildi"
  | "mukofot"
  | "qulf";

/**
 * Whether an effect may sound. A lesson clip that is playing is never talked
 * over; the reward is the one exception, because the lesson is over by then.
 */
export function ovozChalinsinmi(h: {
  yoqilgan: boolean;
  ijroEtilmoqda: boolean;
  hodisa: OvozHodisa;
}): boolean {
  if (!h.yoqilgan) return false;
  if (h.ijroEtilmoqda && h.hodisa !== "mukofot") return false;
  return true;
}
