import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  shakllantir,
  type JangOverview,
  type JangUnitRow,
} from './daf-media-jang.shape';

export type { JangOverview } from './daf-media-jang.shape';

/**
 * Jang savollarining barchasi — unit bo'yicha, javobi bilan (admin ko'rigi,
 * faqat o'qish). Hamma holatdagi savol keladi: qoralama ham, tasdiqlangan ham.
 */
@Injectable()
export class DafMediaJangService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** `DafMediaInhaltService.mediaUrl` bilan bir xil qoida (R2 ommaviy manzili). */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  async jang(): Promise<JangOverview> {
    // Bitta so'rov: unitlar + savollari (N+1 yo'q).
    const rows = (await this.prisma.dafUnit.findMany({
      // Jang faqat nafaqaga chiqmagan unitlardan o'ynaydi.
      where: { retiredAt: null, battleQuestions: { some: {} } },
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      include: {
        battleQuestions: {
          orderBy: { sourceId: 'asc' },
          select: {
            id: true,
            sourceId: true,
            kind: true,
            prompt: true,
            options: true,
            answer: true,
            akzeptiert: true,
            audioKey: true,
            audioStartMs: true,
            audioEndMs: true,
            status: true,
          },
        },
      },
    })) as unknown as JangUnitRow[];

    return { units: shakllantir(rows, (k) => this.mediaUrl(k)) };
  }
}
