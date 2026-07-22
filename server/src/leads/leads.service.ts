import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentsService } from '../students/students.service';
import { StudentEnrollmentService } from '../students/student-enrollment.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadDto } from './dto/move-lead.dto';
import { ReorderLeadsDto } from './dto/reorder-leads.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { MarkCalledLeadDto } from './dto/mark-called-lead.dto';
import { RemoveLeadDto } from './dto/remove-lead.dto';

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
    private studentEnrollmentService: StudentEnrollmentService,
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

    // Contact marker filter — leads already called vs not yet called.
    if (query.called === 'true') where.calledAt = { not: null };
    else if (query.called === 'false') where.calledAt = null;

    // Comment-presence filter. Comments are polymorphic (no FK to Lead), so we
    // resolve the set of commented lead ids once and constrain by id. Prisma
    // treats `in: []` as "match none" and `notIn: []` as "match all", which is
    // exactly what we want when no lead has a comment yet.
    if (query.hasComments !== undefined) {
      const commented = await this.prisma.comment.findMany({
        where: { entityType: 'Lead' },
        distinct: ['entityId'],
        select: { entityId: true },
      });
      const ids = commented.map((c) => c.entityId);
      where.id = query.hasComments === 'true' ? { in: ids } : { notIn: ids };
    }

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
      // Converted leads have moved to the students list — hide them from the
      // board section so a converted lead never lingers in the funnel.
      where: {
        sectionId,
        deletedAt: null,
        statusEnum: { not: LeadStatus.CONVERTED },
      },
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

    // Phone-based duplicate guard for the detail drawer: if a live student
    // already has this exact phone, surface them so the admin opens/links the
    // existing account instead of converting the lead into a second account.
    const matchedStudent = await this.prisma.student.findFirst({
      where: { phone: lead.phone, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
      },
    });

    return { ...lead, mockParticipations, matchedStudent };
  }

  /**
   * Leads that were converted into this student — powers the student profile
   * "Lid tarixi" tab. A student can have more than one linked lead (e.g. two
   * leads sharing a phone that were both linked to the same account), so this
   * returns an array. No statusEnum filter: a converted lead is exactly what we
   * want here (the board's `not CONVERTED` filter must NOT be copied). Archived
   * leads are included too — the origin is still part of the student's history.
   */
  async findByStudentId(studentId: number) {
    return this.prisma.lead.findMany({
      where: { convertedStudentId: studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        statusEnum: true,
        createdAt: true,
        statusChangedAt: true,
        deletedAt: true,
        source: { select: { id: true, name: true } },
        section: {
          select: {
            id: true,
            name: true,
            column: { select: { id: true, name: true } },
          },
        },
      },
    });
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
   * Reorders the leads of a single section top-to-bottom. Pure ordering — no
   * history is recorded (matches the section reorder; cross-section moves still
   * go through move(), which does record history).
   */
  async reorder(dto: ReorderLeadsDto) {
    const leads = await this.prisma.lead.findMany({
      where: { sectionId: dto.sectionId, deletedAt: null },
      select: { id: true },
    });
    const ids = new Set(leads.map((l) => l.id));

    for (const id of dto.leadIds) {
      if (!ids.has(id)) {
        throw new BadRequestException('Lid topilmadi');
      }
    }
    if (dto.leadIds.length !== leads.length) {
      throw new BadRequestException(
        'Barcha lidlar tartibda ko‘rsatilishi kerak',
      );
    }

    await this.prisma.$transaction(
      dto.leadIds.map((id, index) =>
        this.prisma.lead.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    return { message: 'Lidlar tartibi yangilandi' };
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

  /**
   * Deleting a lead = marking it LOST. The lead is archived (`deletedAt`) AND
   * flagged `statusEnum = LOST` with a mandatory reason, so the funnel records
   * why it didn't convert. (Section cascade-archival is a separate path in
   * LeadSectionsService and intentionally leaves statusEnum/lostReason
   * untouched — those leads are merely archived, not deliberately lost.)
   * Restorable from the archive — restore resets LOST → NEW and clears the
   * reason (see LeadsArchiveService.restoredStatus).
   */
  async remove(
    id: string,
    dto: RemoveLeadDto,
    companyId: number,
    userId: number,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("Yo'qotilish sababini kiriting");
    }

    const existing = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        sectionId: true,
        statusEnum: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Lid topilmadi');
    }

    await this.prisma.lead.update({
      where: { id },
      data: {
        statusEnum: LeadStatus.LOST,
        status: 'lost',
        lostReason: reason,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: reason,
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Lead',
      entityId: id,
      oldValues: { status: existing.statusEnum },
      newValues: { status: LeadStatus.LOST, lostReason: reason },
      changedById: userId,
      companyId,
    });

    return {
      message: "Lid yo'qotilgan deb belgilandi va arxivga ko'chirildi",
      sectionId: existing.sectionId,
    };
  }

  /**
   * Converts a lead into a real Student. Reuses StudentsService.create (which
   * also provisions the portal login), then flags the lead CONVERTED and links
   * it to the new student. When a `groupId` is supplied, the fresh student is
   * also enrolled into that group (and assigned to the group's branch).
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

    let studentId: number;

    if (dto.existingStudentId) {
      // Link path: this person is already a student (the detail drawer surfaces
      // them via the phone match). Attach the lead to that existing account
      // instead of minting a duplicate — no new Student/portal User is created.
      const existing = await this.prisma.student.findFirst({
        where: { id: dto.existingStudentId, deletedAt: null, companyId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException("Bog'lanadigan o'quvchi topilmadi");
      }
      studentId = existing.id;
    } else {
      // Create path. Guard against a duplicate first: if a live student already
      // holds this phone, refuse to mint a second account and point at the
      // existing one so the admin links instead (the hard one-phone rule).
      const samePhone = await this.prisma.student.findFirst({
        where: { phone: lead.phone, deletedAt: null },
        select: { id: true },
      });
      if (samePhone) {
        throw new BadRequestException(
          `Bu telefon raqam bilan o'quvchi allaqachon mavjud (#${samePhone.id}). Yangi akkaunt yaratilmadi — lidni mavjud o'quvchiga bog'lang.`,
        );
      }

      // If a target group is given, validate it up-front — before creating the
      // student — so a bad group never leaves an orphan student behind. The
      // student is assigned to the group's own branch (a group always lives in
      // exactly one branch), so the group's branch overrides any `branchId`.
      let resolvedBranchId = dto.branchId;
      if (dto.groupId) {
        const group = await this.prisma.group.findFirst({
          where: { id: dto.groupId, deletedAt: null, companyId },
          select: { branchId: true, statusEnum: true },
        });
        if (!group) {
          throw new NotFoundException('Guruh topilmadi');
        }
        const ENROLLABLE_STATUSES = ['ACTIVE', 'FORMING', 'PAUSED'];
        if (!ENROLLABLE_STATUSES.includes(group.statusEnum)) {
          throw new BadRequestException(
            "Tugallangan yoki bekor qilingan guruhga o'quvchi qo'shib bo'lmaydi",
          );
        }
        resolvedBranchId = group.branchId;
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
          branchIds: resolvedBranchId ? [resolvedBranchId] : undefined,
        },
        companyId,
        userId,
      );
      studentId = student.id;

      // Enroll the brand-new student into the chosen group. A fresh student has
      // no existing enrollment, so this is never a transfer — no transfer reason
      // is needed. enrollToGroup re-validates the group + records history.
      if (dto.groupId) {
        await this.studentEnrollmentService.enrollToGroup(
          student.id,
          dto.groupId,
          userId,
          companyId,
          dto.startDate ? { startDate: dto.startDate } : {},
        );
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        statusEnum: LeadStatus.CONVERTED,
        status: 'converted',
        convertedStudentId: studentId,
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

    return { studentId, lead: await this.withCommentCount(updated) };
  }
}
