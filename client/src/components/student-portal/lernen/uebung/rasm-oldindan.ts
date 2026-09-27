import { preload } from "react-dom";
import type { PublicFrage } from "../types";

/**
 * The pictures a question shows: the four options of a picture choice, the
 * one picture of `BILD_TIPPEN`, none otherwise.
 */
export function savolRasmlari(frage: PublicFrage | null | undefined): string[] {
  if (!frage) return [];
  if (frage.format === "BILD_WORT" || frage.format === "AUDIO_BILD") return frage.options;
  return frage.bildUrl ? [frage.bildUrl] : [];
}

/**
 * Starts fetching the next question's pictures while the student answers
 * this one, so on a phone the grid does not appear piece by piece. React
 * dedupes `preload`, so calling it on every render costs nothing.
 */
export function rasmlarniOldindanYukla(frage: PublicFrage | null | undefined): void {
  for (const url of savolRasmlari(frage)) preload(url, { as: "image" });
}
