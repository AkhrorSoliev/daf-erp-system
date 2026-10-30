import { msg } from "@/i18n/msg";
import type {
  MediaLesson,
  MediaLessonKind,
  MediaLevelCoverage,
  MediaSectionCoverage,
  MediaUnitCoverage,
} from "./media-coverage-types";

/** /media'da nima ochiq: bo'lim materiali yoki seans savollari. */
export type Tanlov = { tur: "bolim"; id: number } | { tur: "seans"; id: number };

/** O'quvchi ilovasidagi seans nomlari bilan bir xil. */
export const SEANS_NOMLARI: Record<MediaLessonKind, string> = {
  SECTION_A: msg("Tanishuv"),
  SECTION_B: msg("Ishlatish"),
  BRIDGE: msg("O'tish sinovi"),
  UNIT_TEST: msg("Yakuniy sinov"),
};

function butunSon(v: string | null): number | null {
  if (!v || !/^\d+$/.test(v)) return null;
  return Number(v);
}

/** Manzildan tanlov. `seans` ham, `bolim` ham bo'lsa — seans. */
export function tanlovniOqi(get: (k: string) => string | null): Tanlov | null {
  const seans = butunSon(get("seans"));
  if (seans !== null) return { tur: "seans", id: seans };
  const bolim = butunSon(get("bolim"));
  if (bolim !== null) return { tur: "bolim", id: bolim };
  return null;
}

export function tanlovParamlari(t: Tanlov): string {
  return `${t.tur}=${t.id}`;
}

function barchaUnitlar(levels: MediaLevelCoverage[]): MediaUnitCoverage[] {
  return levels.flatMap((l) => l.units);
}

export function boshlangichTanlov(levels: MediaLevelCoverage[]): Tanlov | null {
  const unit = barchaUnitlar(levels).find((u) => u.sections.length > 0);
  return unit ? { tur: "bolim", id: unit.sections[0].sectionId } : null;
}

export function bolimJoyi(
  levels: MediaLevelCoverage[],
  sectionId: number,
): { unit: MediaUnitCoverage; section: MediaSectionCoverage } | null {
  for (const unit of barchaUnitlar(levels)) {
    const section = unit.sections.find((s) => s.sectionId === sectionId);
    if (section) return { unit, section };
  }
  return null;
}

export interface SeansJoyi {
  unit: MediaUnitCoverage;
  /** `null` — unit darajasidagi seans (yakuniy sinov). */
  section: MediaSectionCoverage | null;
  lesson: MediaLesson;
}

export function seansJoyi(levels: MediaLevelCoverage[], lessonId: number): SeansJoyi | null {
  for (const unit of barchaUnitlar(levels)) {
    for (const section of unit.sections) {
      const lesson = section.lessons.find((l) => l.id === lessonId);
      if (lesson) return { unit, section, lesson };
    }
    const lesson = unit.unitLessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, section: null, lesson };
  }
  return null;
}

export function tanlovUnitId(levels: MediaLevelCoverage[], tanlov: Tanlov | null): number | null {
  if (!tanlov) return null;
  const joy = tanlov.tur === "bolim" ? bolimJoyi(levels, tanlov.id) : seansJoyi(levels, tanlov.id);
  return joy?.unit.unitId ?? null;
}

/** Bo'limda nechta element ovozsiz va nechta rasm chiziladigan so'z rasmsiz. */
export function kamchilik(s: MediaSectionCoverage): { ovoz: number; rasm: number } {
  const yoq = (c: { total: number; withAudio: number }) => c.total - c.withAudio;
  return {
    ovoz: yoq(s.words) + yoq(s.sentences) + yoq(s.phrases) + yoq(s.dialogLines),
    rasm: s.words.pictureEligible - s.words.withImage,
  };
}
