export const DAFI_HOLATLARI = ["tinch", "salom", "bayram", "oylayapti", "xato"] as const;
export type DafiHolat = (typeof DAFI_HOLATLARI)[number];

/** The rig's own state names (ported from the approved mockup). */
export const RIG_HOLAT: Record<DafiHolat, "idle" | "wave" | "cheer" | "think" | "miss"> = {
  tinch: "idle",
  salom: "wave",
  bayram: "cheer",
  oylayapti: "think",
  xato: "miss",
};

/** Width in px; the height follows (about 0.9 of it). */
export const DAFI_OLCHAM = { sm: 70, md: 96, lg: 240 } as const;
export type DafiOlcham = keyof typeof DAFI_OLCHAM;

/** A wrong answer is the soft "oops", never a buzzer or a frown. */
export function javobHolati(togri: boolean): DafiHolat {
  return togri ? "bayram" : "xato";
}
