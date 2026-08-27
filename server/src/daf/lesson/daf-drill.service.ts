import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { buildDrill, type DrillQuestion } from './vocab-drill';

/** Mijozga ketadigan savol — TO'G'RI JAVOBSIZ. */
export interface PublicDrillQuestion {
  index: number;
  kind: DrillQuestion['kind'];
  prompt: string;
  options: string[];
  /** Tinglash savolida: audio manzili va oralig'i. */
  audio: { url: string; startMs: number; endMs: number } | null;
}

export interface DrillCheckResult {
  isCorrect: boolean;
  /** To'g'ri javob — FAQAT javob berilgandan keyin. */
  answer: string;
}

/**
 * Lug'at darsining mashqlari.
 *
 * Savollar har so'rovda QAYTA tug'iladi va bazaga yozilmaydi. Sabab:
 * ular lug'atdan kelib chiqadi, ya'ni lug'at o'zgarganda savol ham
 * o'zgarishi kerak. Saqlangan savol eskirgan tarjima yoki o'chirilgan
 * so'zga ishora qilib qolardi.
 *
 * TO'G'RI JAVOB MIJOZGA YUBORILMAYDI. Tekshiruv `check` da, serverda:
 * savol qayta tug'iladi va berilgan javob solishtiriladi. Shu tufayli
 * javobni brauzerdan ko'rib bo'lmaydi, va uchala klient (web, Android,
 * iOS) bir xil qoidadan foydalanadi.
 */
@Injectable()
export class DafDrillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Savollar barqaror: `seed` bir xil bo'lsa ketma-ketlik ham bir xil.
   *
   * Bu tekshiruv uchun SHART: `check` savolni qayta tug'ib, o'sha
   * o'rindagi javobni oladi. Tasodifiy ketma-ketlikda ikkinchi tug'ilish
   * boshqa savol berardi va har javob xato chiqardi.
   */
  private seeded(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private async questions(lessonId: number): Promise<DrillQuestion[]> {
    const lexemes = await this.prisma.dafLexeme.findMany({
      where: { lessonId },
      select: {
        id: true,
        de: true,
        uz: true,
        audioStartMs: true,
        audioEndMs: true,
      },
      orderBy: { order: 'asc' },
    });

    return buildDrill(lexemes, this.seeded(lessonId));
  }

  /** Darsning savollari — javobsiz. */
  async getDrill(lessonId: number): Promise<PublicDrillQuestion[]> {
    const lesson = await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException('Dars topilmadi');

    const base = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
    const keyByLexeme = new Map(
      (
        await this.prisma.dafLexeme.findMany({
          where: { lessonId },
          select: { id: true, audioKey: true },
        })
      ).map((l) => [l.id, l.audioKey]),
    );

    return (await this.questions(lessonId)).map((q, index) => ({
      index,
      kind: q.kind,
      prompt: q.prompt,
      options: q.options,
      audio:
        q.audio && keyByLexeme.get(q.lexemeId)
          ? {
              url: `${base}/${keyByLexeme.get(q.lexemeId)!}`,
              startMs: q.audio.startMs,
              endMs: q.audio.endMs,
            }
          : null,
    }));
  }

  /**
   * Javobni tekshiradi.
   *
   * Savol qayta tug'iladi — mijoz yuborgan `index` bo'yicha. Mijozdan
   * javobni emas, faqat TANLOVni olamiz; to'g'ri javob serverda qoladi.
   */
  async check(
    lessonId: number,
    index: number,
    given: string,
  ): Promise<DrillCheckResult & { lexemeId: number }> {
    const all = await this.questions(lessonId);
    const q = all[index];
    if (!q) throw new BadRequestException('Bunday savol yo`q');

    return {
      isCorrect: given.trim() === q.answer.trim(),
      answer: q.answer,
      lexemeId: q.lexemeId,
    };
  }
}
