import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';
import { LeadsService } from '../leads/leads.service';
import type { WebsiteLeadDto } from './website-leads.controller';

/** Har filialdagi o'chirib bo'lmaydigan sayt bo'limi (LeadSection.systemKey). */
export const WEBSITE_SECTION_KEY = 'WEBSITE';
export const WEBSITE_SECTION_NAME = 'Sayt';
const DEFAULT_SOURCE = 'Sayt';

@Injectable()
export class WebsiteLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly leads: LeadsService,
    private readonly history: EntityHistoryService,
  ) {}

  assertKey(given: string | undefined): void {
    const expected = this.config.get<string>('WEBSITE_LEADS_KEY');
    if (!expected)
      throw new ServiceUnavailableException('Sayt lidlari sozlanmagan');
    const a = Buffer.from(given ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
  }

  async create(dto: WebsiteLeadDto): Promise<void> {
    // «+998 90 123 45 67» → oxirgi 9 raqam (lid telefoni shu formatda saqlanadi).
    const phone = dto.phone.replace(/\D/g, '').slice(-9);
    if (phone.length !== 9) {
      throw new BadRequestException("Telefon raqami noto'g'ri");
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new NotFoundException('Filial topilmadi');

    const sectionId = await this.websiteSectionId(branch.id, branch.companyId);
    const sourceId = await this.findOrCreateSource(
      dto.source?.trim() || DEFAULT_SOURCE,
      branch.companyId,
    );

    await this.leads.create(
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone,
        sectionId,
        sourceId,
      },
      branch.companyId,
      { kind: 'public-form' },
    );
  }

  /** Filialning birinchi (tizim «NEW») ustunidagi sayt bo'limi; yo'q bo'lsa yaratadi. */
  private async websiteSectionId(
    branchId: number,
    companyId: number,
  ): Promise<string> {
    const column = await this.prisma.leadColumn.findFirst({
      where: { branchId, companyId, systemKey: 'NEW', deletedAt: null },
      select: { id: true },
    });
    if (!column)
      throw new NotFoundException('Filialda «Yangi» ustuni topilmadi');

    const find = () =>
      this.prisma.leadSection.findFirst({
        where: {
          columnId: column.id,
          systemKey: WEBSITE_SECTION_KEY,
          deletedAt: null,
        },
        select: { id: true },
      });
    const existing = await find();
    if (existing) return existing.id;

    try {
      const created = await this.prisma.leadSection.create({
        data: {
          name: WEBSITE_SECTION_NAME,
          columnId: column.id,
          systemKey: WEBSITE_SECTION_KEY,
          // Eng tepada tursin.
          order: -1,
          companyId,
        },
        select: { id: true },
      });
      await this.history.recordCreate({
        entityType: 'LeadSection',
        entityId: created.id,
        newValues: { name: WEBSITE_SECTION_NAME, columnId: column.id },
        changedById: undefined,
        companyId,
      });
      return created.id;
    } catch (err) {
      // Parallel so'rov bo'limni oldin yaratdi (unique [columnId, systemKey]).
      const raced = await find();
      if (raced) return raced.id;
      throw err;
    }
  }

  private async findOrCreateSource(
    name: string,
    companyId: number,
  ): Promise<string> {
    const existing = await this.prisma.leadSource.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        companyId,
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const maxOrder = await this.prisma.leadSource.aggregate({
      where: { deletedAt: null, companyId },
      _max: { order: true },
    });
    const created = await this.prisma.leadSource.create({
      data: { name, order: (maxOrder._max.order ?? -1) + 1, companyId },
      select: { id: true, name: true },
    });
    await this.history.recordCreate({
      entityType: 'LeadSource',
      entityId: created.id,
      newValues: { name: created.name },
      changedById: undefined,
      companyId,
    });
    return created.id;
  }
}
