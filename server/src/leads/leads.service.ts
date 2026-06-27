import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentsService } from '../students/students.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadDto } from './dto/move-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { MarkCalledLeadDto } from './dto/mark-called-lead.dto';

// Compact shape rendered as a card on the board.
const LEAD_CARD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  statusEnum: true,
  order: true,
  createdAt: true,
  calledAt: true,
  source: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private studentsService: StudentsService,
  ) {}

  /**
   * Counts comments per lead in one query. Comments are polymorphic
   * (`entityType`/`entityId`, no FK to Lead), so a Prisma `_count` relation is
   * not available — we group the Comment table instead. Returns a Map keyed by
   * lead id; leads with no comments are simply absent from the map.
   */
  private async commentCountsFor(
    leadIds: string[],
  ): Promise<Map<string, number>> {
    if (leadIds.length === 0) return new Map();
    const grouped = await this.prisma.comment.groupBy({
      by: ['entityId'],
      where: { entityType: 'Lead', entityId: { in: leadIds } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.entityId, g._count._all]));
  }

  /** Attaches `commentCount` to a single card so the board badge stays correct. */
  private async withCommentCount<T extends { id: string }>(
    lead: T,
  ): Promise<T & { commentCount: number }> {
    const counts = await this.commentCountsFor([lead.id]);
    return { ...lead, commentCount: counts.get(lead.id) ?? 0 };
  }

  /** Filtered, paginated flat list of leads — drives the filter view. */
  async findAll(query: LeadQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.LeadWhereInput = { deletedAt: null };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.sectionId) where.sectionId = query.sectionId;
    if (query.columnId) where.section = { columnId: query.columnId };
    if (query.status) where.statusEnum = query.status;

    if (query.startDate || query.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          statusEnum: true,
          createdAt: true,
          source: { select: { id: true, name: true } },
          section: {
            select: {
              id: true,
              name: true,
              column: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /** Leads inside one section, ordered for board display. */
  async getSectionLeads(sectionId: string) {
    const section = await this.prisma.leadSection.findFirst({
      where: { id: sectionId, deletedAt: null },
      select: { id: true },
    });
    if (!section) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const leads = await this.prisma.lead.findMany({
      where: { sectionId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: LEAD_CARD_SELECT,
    });

    const counts = await this.commentCountsFor(leads.map((l) => l.id));
    return leads.map((l) => ({ ...l, commentCount: counts.get(l.id) ?? 0 }));
  }

  /** Full lead detail for the detail drawer. */
  async findOne(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        statusEnum: true,
        convertedStudentId: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        calledAt: true,
        calledBy: { select: { id: true, firstName: true, lastName: true } },
        source: { select: { id: true, name: true } },
        section: {
          select: {
            id: true,
            name: true,
            column: { select: { id: true, name: true, systemKey: true } },
          },
        },
        formSubmissions: {
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            data: true,
            submittedAt: true,
            form: { select: { id: true, title: true, fields: true } },
          },
        },
      },
    });
    if (!lead) {
      throw new NotFoundException('Lid topilmadi');
    }

    // Phone-based marker: surface every mock exam this person also signed
    // up for. The Lead and MockExamParticipant tables have no FK between
    // them — they're separate funnels — but matching by phone lets the
    // sales team see at a glance that a lead has converted interest into a
    // concrete mock signup.
    const mockParticipations = await this.prisma.mockExamParticipant.findMany(
      {
        where: { phone: lead.phone, deletedAt: null },
        orderBy: { registeredAt: 'desc' },
        select: {
          id: true,
          publicId: true,
          paid: true,
          registeredAt: true,
          totalScore: true,
          exam: {
            select: {
              id: true,
              title: true,
              status: true,
              examDate: true,
              section: { select: { name: true, color: true } },
            },
          },
        },
      },
    );

    return { ...lead, mockParticipations };
  }

  /**
   * Lightweight hover preview for a board card — who called and when, plus the
   * most recent comment (author + text + time). Fetched lazily on hover and
   * cached client-side, so it never runs on the initial board/section load and
   * never re-runs while the card stays mounted. Three small indexed reads.
   */
  async getHoverSummary(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        calledAt: true,
        calledBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!lead) {
      throw new NotFoundException('Lid topilmadi');
    }

    const latest = await this.prisma.comment.findFirst({
      where: { entityType: 'Lead', entityId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        content: true,
        createdAt: true,
        isTask: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });

    const fullName = (u: { firstName: string; lastName: string }) =>
      `${u.firstName} ${u.lastName}`.trim();

    return {
      calledAt: lead.calledAt,
      calledBy: lead.calledBy
        ? { id: lead.calledBy.id, name: fullName(lead.calledBy) }
        : null,
      latestComment: latest
        ? {
            authorName: fullName(latest.author),
            content: latest.content,
            createdAt: latest.createdAt,
            isTask: latest.isTask,
          }
        : null,
    };
  }

  // `userId` is nullable because public-form submissions create leads with no
  // authenticated user — the audit row records `changedBy = NULL` (system).
  async create(
    dto: CreateLeadDto,
    companyId: number,
    userId: number | null,
  ) {
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException(
        "Ism va familya bo'sh bo'lishi mumkin emas",
      );
    }

    const section = await this.prisma.leadSection.findFirst({
      where: { id: dto.sectionId, deletedAt: null },
      select: { id: true, column: { select: { systemKey: true } } },
    });
    if (!section) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    if (dto.sourceId) {
      const source = await this.prisma.leadSource.findFirst({
        where: { id: dto.sourceId, deletedAt: null },
        select: { id: true },
      });
      if (!source) {
        throw new NotFoundException('Lid manbasi topilmadi');
      }
    }

    // The board (column/section) is a workflow layer decoupled from the funnel
    // stage — a brand-new lead always starts as NEW regardless of its column.
    const statusEnum = LeadStatus.NEW;

    const maxOrder = await this.prisma.lead.aggregate({
      where: { sectionId: dto.sectionId, deletedAt: null },
      _max: { order: true },
    });

    const created = await this.prisma.lead.create({
      data: {
        firstName,
        lastName,
        phone: dto.phone,
        sectionId: dto.sectionId,
        sourceId: dto.sourceId ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
        statusEnum,
        status: statusEnum.toLowerCase(),
      },
      select: LEAD_CARD_SELECT,
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Lead',
      entityId: created.id,
      newValues: {
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone,
        statusEnum: created.statusEnum,
      },
      changedById: userId ?? undefined,
      companyId,
    });

    // A brand-new lead has no comments and has not been called yet.
    return { ...created, commentCount: 0 };
  }

  /** Edits a lead's own data (name, phone, source). */
  async update(
    id: string,
    dto: UpdateLeadDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    if (!existing) {
      throw new NotFoundException('Lid topilmadi');
    }

    const data: Prisma.LeadUncheckedUpdateInput = {};

    if (dto.firstName !== undefined) {
      const firstName = dto.firstName.trim();
      if (!firstName) {
        throw new BadRequestException("Ism bo'sh bo'lishi mumkin emas");
      }
      data.firstName = firstName;
    }
    if (dto.lastName !== undefined) {
      const lastName = dto.lastName.trim();
      if (!lastName) {
        throw new BadRequestException("Familya bo'sh bo'lishi mumkin emas");
      }
      data.lastName = lastName;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.sourceId !== undefined) {
      if (dto.sourceId) {
        const source = await this.prisma.leadSource.findFirst({
          where: { id: dto.sourceId, deletedAt: null },
          select: { id: true },
        });
        if (!source) {
          throw new NotFoundException('Lid manbasi topilmadi');
        }
      }
      data.sourceId = dto.sourceId || null;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      select: LEAD_CARD_SELECT,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Lead',
      entityId: id,
      oldValues: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        phone: existing.phone,
      },
      newValues: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
      },
      changedById: userId,
      companyId,
    });

    return this.withCommentCount(updated);
  }

  /**
   * Moves a lead to another section (appended to its end). Landing in a fixed
   * column syncs the funnel stage; a custom column leaves statusEnum untouched.
   */
  async move(
    leadId: string,
    dto: MoveLeadDto,
    companyId: number,
    userId: number,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { id: true, sectionId: true, statusEnum: true },
    });
    if (!lead) {
      throw new NotFoundException('Lid topilmadi');
    }

    const section = await this.prisma.leadSection.findFirst({
      where: { id: dto.sectionId, deletedAt: null },
      select: { id: true, column: { select: { systemKey: true } } },
    });
    if (!section) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    // Landing in the fixed NEW column resets the funnel stage; any custom
    // column leaves statusEnum untouched (CONTACTED column was removed).
    const statusEnum =
      section.column.systemKey === 'NEW' ? LeadStatus.NEW : lead.statusEnum;

    const maxOrder = await this.prisma.lead.aggregate({
      where: { sectionId: dto.sectionId, deletedAt: null },
      _max: { order: true },
    });

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        sectionId: dto.sectionId,
        order: (maxOrder._max.order ?? -1) + 1,
        statusEnum,
        status: statusEnum.toLowerCase(),
      },
      select: LEAD_CARD_SELECT,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Lead',
      entityId: leadId,
      oldValues: { sectionId: lead.sectionId, statusEnum: lead.statusEnum },
      newValues: { sectionId: dto.sectionId, statusEnum },
      changedById: userId,
      companyId,
    });

    return this.withCommentCount(updated);
  }

  /**
   * Marks a lead as "called" (or clears it). A lightweight contact marker — it
   * stamps who called and when so the board card can show a phone icon. Setting
   * `called: true` on an already-called lead is idempotent (keeps the original
   * timestamp).
   */
  async markCalled(
    id: string,
    dto: MarkCalledLeadDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, calledAt: true },
    });
    if (!existing) {
      throw new NotFoundException('Lid topilmadi');
    }

    // When already called, leave BOTH calledAt and calledById untouched so the
    // (when, who) pair stays coherent — re-marking must not relabel the caller
    // while keeping the original timestamp.
    const data: Prisma.LeadUncheckedUpdateInput = dto.called
      ? existing.calledAt
        ? {}
        : { calledAt: new Date(), calledById: userId }
      : { calledAt: null, calledById: null };

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      select: LEAD_CARD_SELECT,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Lead',
      entityId: id,
      oldValues: { calledAt: existing.calledAt },
      newValues: { calledAt: updated.calledAt },
      changedById: userId,
      companyId,
    });

    return this.withCommentCount(updated);
  }

  /** Soft-deletes a lead (moves it to the archive — no hard delete). */
  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sectionId: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Lid topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'Lead',
      entityId: id,
      oldValues: {
        firstName: existing.firstName,
        lastName: existing.lastName,
      },
      changedById: userId,
      companyId,
    });

    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Lid arxivga ko'chirildi", sectionId: existing.sectionId };
  }

  /**
   * Converts a lead into a real Student. Reuses StudentsService.create (which
   * also provisions the portal login), then flags the lead CONVERTED and links
   * it to the new student.
   */
  async convert(
    leadId: string,
    dto: ConvertLeadDto,
    companyId: number,
    userId: number,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        gender: true,
        telegram: true,
        parentPhone: true,
        parentName: true,
        statusEnum: true,
        convertedStudentId: true,
      },
    });
    if (!lead) {
      throw new NotFoundException('Lid topilmadi');
    }
    if (lead.convertedStudentId) {
      throw new BadRequestException(
        "Bu lid allaqachon o'quvchiga aylantirilgan",
      );
    }

    const student = await this.studentsService.create(
      {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        gender: lead.gender ?? undefined,
        telegram: lead.telegram ?? undefined,
        parentPhone: lead.parentPhone ?? undefined,
        parentName: lead.parentName ?? undefined,
        branchIds: dto.branchId ? [dto.branchId] : undefined,
      },
      companyId,
      userId,
    );

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        statusEnum: LeadStatus.CONVERTED,
        status: 'converted',
        convertedStudentId: student.id,
        statusChangedAt: new Date(),
        statusChangedById: userId,
      },
      select: LEAD_CARD_SELECT,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Lead',
      entityId: leadId,
      oldValues: { status: lead.statusEnum },
      newValues: { status: LeadStatus.CONVERTED },
      changedById: userId,
      companyId,
    });

    return { studentId: student.id, lead: await this.withCommentCount(updated) };
  }
}
