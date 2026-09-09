import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/** Bo'lim so'zi — audio va rasm ikkalasi ham to'liq manzilga aylantirilgan. */
export interface InhaltWort {
  id: number;
  de: string;
  uz: string | null;
  artikel: string | null;
  anzeige: string | null;
  /**
   * `false` — dvigatel bu so'zdan hech qachon savol tuzmaydi va uni
   * chalg'ituvchi sifatida ham ishlatmaydi, lekin kontentning bir qismi:
   * o'chirilmaydi, faqat shu bayroq bilan belgilanadi.
   */
  core: boolean;
  picturable: boolean;
  audioUrl: string | null;
  imageUrl: string | null;
}

/** Gap yoki ibora qatori — ikkalasi ham faqat audio tashiydi. */
export interface InhaltZeile {
  id: number;
  de: string;
  uz: string;
  audioUrl: string | null;
  /** Faqat iboralarda bor — gapda `undefined`. */
  funktion?: string;
  funktionUz?: string;
}

/** Dialog satri — o'z sectionId'siga ega emas, DafDialog orqali keladi. */
export interface InhaltDialogZeile {
  id: number;
  dialogId: number;
  order: number;
  sprecher: string;
  de: string;
  uz: string;
  audioUrl: string | null;
}

export interface SectionInhalt {
  woerter: InhaltWort[];
  saetze: InhaltZeile[];
  phrasen: InhaltZeile[];
  dialogZeilen: InhaltDialogZeile[];
}

/**
 * Bitta bo'limning to'liq materialini qaytaradi — sanoq emas, o'zi.
 *
 * `DafMediaCoverageService` «nechta» degan savolga javob beradi; bu xizmat
 * «nima» degan savolga: admin sahifasi shu ro'yxatni tinglaydi/o'qiydi.
 */
@Injectable()
export class DafMediaInhaltService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * R2 kalitini ommaviy manzilga aylantiradi — `daf-portal-read.service.ts`
   * dagi `mediaUrl` bilan BIR XIL qoida. Uchta joyda uch xil qilish aynan
   * 2026-09-08 dagi xatoni qaytaradi (xom kalit `<audio src>`ga tushib,
   * portalning o'z manziliga nisbatan 404 berdi).
   */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  async inhalt(sectionId: number): Promise<SectionInhalt> {
    const [woerterRows, saetzeRows, phrasenRows, dialogZeilenRows] =
      await Promise.all([
        this.prisma.dafLexeme.findMany({
          where: { sectionId },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            de: true,
            uz: true,
            artikel: true,
            anzeige: true,
            core: true,
            picturable: true,
            audioKey: true,
            imageKey: true,
          },
        }),
        this.prisma.dafSentence.findMany({
          where: { sectionId },
          orderBy: { order: 'asc' },
          select: { id: true, de: true, uz: true, audioKey: true },
        }),
        this.prisma.dafPhrase.findMany({
          where: { sectionId },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            de: true,
            uz: true,
            audioKey: true,
            funktion: true,
            funktionUz: true,
          },
        }),
        // DafDialogLine o'zi sectionId tashimaydi — DafDialog orqali keladi
        // (qarang: daf-media-coverage.service.ts'dagi bir xil izoh).
        this.prisma.dafDialogLine.findMany({
          where: { dialog: { sectionId } },
          orderBy: [{ dialogId: 'asc' }, { order: 'asc' }],
          select: {
            id: true,
            dialogId: true,
            order: true,
            sprecher: true,
            de: true,
            uz: true,
            audioKey: true,
          },
        }),
      ]);

    const woerter: InhaltWort[] = woerterRows.map((w) => ({
      id: w.id,
      de: w.de,
      uz: w.uz,
      artikel: w.artikel,
      anzeige: w.anzeige,
      core: w.core,
      picturable: w.picturable,
      audioUrl: this.mediaUrl(w.audioKey),
      imageUrl: this.mediaUrl(w.imageKey),
    }));

    const saetze: InhaltZeile[] = saetzeRows.map((s) => ({
      id: s.id,
      de: s.de,
      uz: s.uz,
      audioUrl: this.mediaUrl(s.audioKey),
    }));

    const phrasen: InhaltZeile[] = phrasenRows.map((p) => ({
      id: p.id,
      de: p.de,
      uz: p.uz,
      audioUrl: this.mediaUrl(p.audioKey),
      funktion: p.funktion,
      funktionUz: p.funktionUz,
    }));

    const dialogZeilen: InhaltDialogZeile[] = dialogZeilenRows.map((d) => ({
      id: d.id,
      dialogId: d.dialogId,
      order: d.order,
      sprecher: d.sprecher,
      de: d.de,
      uz: d.uz,
      audioUrl: this.mediaUrl(d.audioKey),
    }));

    return { woerter, saetze, phrasen, dialogZeilen };
  }
}
