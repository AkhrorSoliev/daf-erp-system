import { Injectable } from '@nestjs/common';
import type { Frage, FrageFormat } from '../uebung/frage.types';
import { bevorzugteFormate } from '../uebung/kind-formate';
import { UebungService } from '../uebung/uebung.service';

/**
 * Mijozga (CEO/admin ko'rigi) ketadigan savol — TO'G'RI JAVOB BILAN.
 *
 * `PublicFrage`dan (`frage.types.ts`) farqi shu — u o'quvchiga ketadi va
 * javobni ATAYLAB yashiradi. Bu ro'yxat esa "dvigatel qanday savol
 * qurishi mumkin"ni ko'rsatish uchun, o'quvchi hech qachon ko'rmaydi —
 * shuning uchun javobni yashirishning ma'nosi yo'q, aksincha CEO aynan
 * shuni ko'rmoqchi.
 */
export interface VorschauFrage {
  format: FrageFormat;
  itemType: Frage['itemType'];
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  richtig: string;
  titel?: string | null;
  audioUrl: string | null;
  /** `BILD_TIPPEN`: the picture the student types from. */
  bildUrl: string | null;
  /** `UHR_LESEN` / `UHR_TIPPEN`: the clock to draw (`HH:MM`). */
  uhrzeit: string | null;
}

function toVorschau(f: Frage): VorschauFrage {
  return {
    format: f.format,
    itemType: f.itemType,
    itemId: f.itemId,
    prompt: f.prompt,
    hilfe: f.hilfe,
    options: f.options,
    richtig: f.richtig,
    titel: f.titel,
    audioUrl: f.audioUrl,
    bildUrl: f.bildUrl ?? null,
    uhrzeit: f.uhrzeit ?? null,
  };
}

export interface LessonFragen {
  kind: string | null;
  /** Bitta seansda nechta savol beriladi (12, yakuniy sinovda 15). */
  laenge: number;
  /** Shu seans turida oldinroq chiqadigan formatlar. */
  bevorzugt: FrageFormat[];
  fragen: VorschauFrage[];
}

/**
 * Seans sahifasining savollari — dvigatelning O'ZI quradigan nomzodlar
 * (`UebungService.vorschauKandidaten`). Avval bu xizmat dvigatel
 * qoidasining nusxasini saqlardi; nusxa vaqt o'tib farqlanadi.
 */
@Injectable()
export class DafMediaFragenService {
  constructor(private readonly uebung: UebungService) {}

  async lessonFragen(lessonId: number): Promise<LessonFragen> {
    const { kind, laenge, fragen } =
      await this.uebung.vorschauKandidaten(lessonId);
    return {
      kind,
      laenge,
      bevorzugt: bevorzugteFormate(kind),
      fragen: fragen.map(toVorschau),
    };
  }
}
