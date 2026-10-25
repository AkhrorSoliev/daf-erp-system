/** Device setting (not the account): the student's choice for sound effects. */
export const OVOZ_KALITI = "daf.lernen.ovoz";

/** Sound is on until the student switches it off. Storage may be unavailable. */
export function ovozYoqilganmi(): boolean {
  try {
    return localStorage.getItem(OVOZ_KALITI) !== "0";
  } catch {
    return true;
  }
}

export function ovozniSaqla(yoqilgan: boolean): void {
  try {
    localStorage.setItem(OVOZ_KALITI, yoqilgan ? "1" : "0");
  } catch {
    /* private window or blocked storage: the choice just is not remembered */
  }
}
