import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  assertBranchInScope,
  branchIdWhere,
  requireSingleBranchForWrite,
} from '../common/finance/report-branch-scope';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamPdfService } from './mock-exam-pdf.service';
import { CreateMockExamDto } from './dto/create-mock-exam.dto';
import { UpdateMockExamDto } from './dto/update-mock-exam.dto';
import {
  FormFieldDto,
  MAPS_TO_VALUES,
  TYPES_WITH_OPTIONS,
} from '../custom-forms/dto/form-field.dto';
import { shortId } from '../custom-forms/short-id.util';
import { isValidMockExamStatusTransition } from './mock-exam-status.util';
import {
  sanitizeExamTimes,
  sanitizeOfferedLevels,
} from './mock-exam-pricing.util';

const BOT_PAYLOAD_LENGTH = 10;
const MAX_PAYLOAD_RETRIES = 5;

/**
 * One concrete mock-exam event. CRUD here handles the exam shell only —
 * registration-form schema editing, subject configuration, participant
 * management and result entry live in their own services (Faza 3-7).
 */
@Injectable()
export class MockExamsService {
  private readonly logger = new Logger(MockExamsService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private mockExamPdfService: MockExamPdfService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * KPI roll-up shown on top of the /mock-exams page.
   *
   * Revenue is computed as SUM(participant.feeAmount) over participants
   * where `paid = true` — the fee locked in at registration (after any DaF
   * discount), NOT the exam's current `price`. This keeps the total stable
   * against later price edits and correct for discounted DaF payers. Legacy
   * rows without a `feeAmount` fall back to the current `exam.price`. Free
   * exams contribute zero. We don't write a Transaction row for mock-only
   * payments (per the simple-billing decision), so this sum is the
   * canonical place to read mock revenue.
   */
  async revenueSummary(companyId: number, scope: ReportBranchIds) {
    // Every query here used to be company-blind AND branch-blind — the figure
    // was "every paid mock participant in the database". With a second branch
    // that stops being a rounding difference: Namangan's mock revenue is
    // indistinguishable from Fargona's, and mock money is not written to the
    // ledger (a deliberate decision), so this IS the only place it is counted.
    const companyWhere = companyId != null ? { companyId } : {};
    const examBranchWhere = branchIdWhere(scope);

    const paid = await this.prisma.mockExamParticipant.findMany({
      where: {
        paid: true,
        deletedAt: null,
        ...companyWhere,
        ...(scope == null ? {} : { exam: examBranchWhere }),
      },
      select: { feeAmount: true, exam: { select: { price: true } } },
    });

    const totalRevenue = paid.reduce(
      (sum, p) => sum + (p.feeAmount ?? p.exam.price ?? 0),
      0,
    );

    const totalPaid = paid.length;

    const [totalParticipants, totalExams] = await Promise.all([
      this.prisma.mockExamParticipant.count({
        where: {
          deletedAt: null,
          ...companyWhere,
          ...(scope == null ? {} : { exam: examBranchWhere }),
        },
      }),
      this.prisma.mockExam.count({
        where: { deletedAt: null, ...companyWhere, ...examBranchWhere },
      }),
    ]);

    return {
      totalRevenue,
      totalPaid,
      totalParticipants,
      totalExams,
    };
  }

  /**
   * Every id-addressed exam operation goes through here.
   *
   * `update`, `changeStatus`, `remove`, `regeneratePdf` and `rebroadcastResults`
   * each ran `where: { id, deletedAt: null }` — no company, no branch. The id is
   * a uuid, so this was not trivially guessable, but it made every one of them a
   * cross-tenant write the moment an id leaked: `changeStatus(ANNOUNCED)`
   * broadcasts result PDFs to another company's participants over Telegram.
   *
   * Out of scope reads as 404 rather than 403 — a 403 would confirm the id
   * exists elsewhere.
   */
  private async ensureExamInScope(
    id: string,
    companyId: number,
    scope: ReportBranchIds,
    select?: Prisma.MockExamSelect,
  ) {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id, deletedAt: null, companyId, ...branchIdWhere(scope) },
      ...(select ? { select } : {}),
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }

  /**
   * Flat list of all exams sorted by exam date (most recent first; nulls
   * last). Used by the /mock-exams page table.
   */
  async list(companyId: number, scope: ReportBranchIds) {
    const exams = await this.prisma.mockExam.findMany({
      where: { deletedAt: null, companyId, ...branchIdWhere(scope) },
      orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        section: { select: { id: true, name: true, color: true } },
        _count: {
          select: { participants: { where: { deletedAt: null } } },
        },
      },
    });
    return exams.map((exam) => ({
      ...this.toSummary(exam),
      section: exam.section,
    }));
  }

  /**
   * Board view: every active section with its (active) exams listed. Used
   * by the /mock-exams page to render section cards + their exam cards.
   */
  async board(companyId: number, scope: ReportBranchIds) {
    // Sections stay company-level — they are grouping buckets ("Umumiy"), not
    // per-branch structure like the leads board, whose sections name a specific
    // teacher and time slot. Only the EXAMS inside them are branch-filtered, so
    // a branch with no exams sees the familiar section cards, all empty.
    const sections = await this.prisma.mockExamSection.findMany({
      where: { deletedAt: null, companyId },
      orderBy: { order: 'asc' },
      include: {
        exams: {
          where: { deletedAt: null, companyId, ...branchIdWhere(scope) },
          orderBy: [{ examDate: 'asc' }, { createdAt: 'desc' }],
          include: {
            _count: {
              select: {
                participants: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
    });

    return sections.map((section) => ({
      id: section.id,
      name: section.name,
      color: section.color,
      order: section.order,
      examCount: section.exams.length,
      exams: section.exams.map((e) => this.toSummary(e)),
    }));
  }

  async findOne(id: string, companyId: number, scope: ReportBranchIds) {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id, deletedAt: null, companyId, ...branchIdWhere(scope) },
      include: {
        section: {
          select: { id: true, name: true, color: true },
        },
        subjects: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { participants: { where: { deletedAt: null } } },
        },
      },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return this.toDetail(exam);
  }

  async create(
    dto: CreateMockExamDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('Imtihon nomi bo\'sh bo\'lishi mumkin emas');
    }

    // The venue is now mandatory. It used to default to `null`, and the one
    // exam production carries was created that way — invisible to both branch
    // views once the filter above exists, because an unassigned row belongs to
    // no branch. Better to refuse at creation than to produce another.
    const branchId =
      dto.branchId != null
        ? assertBranchInScope(dto.branchId, scope)
        : requireSingleBranchForWrite(scope, 'Mock imtihon yaratish');

    // Resolve which section this exam belongs to. UI doesn't surface
    // sections right now — the user just creates an exam with a date.
    // Behind the scenes we either reuse whichever section the admin
    // explicitly picked, fall back to the first existing section, or
    // create a default "Umumiy" one if the DB has no sections at all.
    let sectionId = dto.sectionId;
    if (sectionId) {
      const section = await this.prisma.mockExamSection.findFirst({
        where: { id: sectionId, deletedAt: null, companyId },
      });
      if (!section) {
        throw new NotFoundException("Bo'lim topilmadi");
      }
    } else {
      sectionId = await this.resolveDefaultSectionId(userId, companyId);
    }

    // Subjects come from the admin's checkbox/row list at create time
    // (e.g. Hören 30 / Lesen 30 / Schreiben 30 / Sprechen 30). At least
    // one is required — score entry / PDF announce pipelines depend on
    // them. Validate names + dedupe + compute the auto maxScore total.
    const subjectInputs = dto.subjects.map((s, idx) => {
      const name = s.name.trim();
      if (!name) {
        throw new BadRequestException(
          `Bo'lim #${idx + 1} nomi bo'sh bo'lishi mumkin emas`,
        );
      }
      if (!Number.isFinite(s.maxScore) || s.maxScore <= 0) {
        throw new BadRequestException(
          `"${name}" bo'limi balli 0 dan katta bo'lishi kerak`,
        );
      }
      if (
        s.passingScore !== undefined &&
        s.passingScore !== null &&
        s.passingScore > s.maxScore
      ) {
        throw new BadRequestException(
          `"${name}" bo'limining o'tish balli maksimal ballidan katta bo'la olmaydi`,
        );
      }
      return {
        name,
        maxScore: s.maxScore,
        passingScore: s.passingScore ?? null,
      };
    });
    const seenNames = new Set<string>();
    for (const s of subjectInputs) {
      const key = s.name.toLowerCase();
      if (seenNames.has(key)) {
        throw new BadRequestException(
          `Bo'lim nomi takrorlanmasligi kerak: "${s.name}"`,
        );
      }
      seenNames.add(key);
    }
    const subjectsTotal = subjectInputs.reduce(
      (sum, s) => sum + s.maxScore,
      0,
    );

    const effectiveMaxScore = dto.maxScore ?? subjectsTotal;
    if (dto.passingScore !== undefined && dto.passingScore > effectiveMaxScore) {
      throw new BadRequestException(
        "O'tish balli umumiy ballidan katta bo'la olmaydi",
      );
    }

    if (dto.examDate && dto.registrationDeadline) {
      if (new Date(dto.registrationDeadline) > new Date(dto.examDate)) {
        throw new BadRequestException(
          "Ro'yxatga olish muddati imtihon sanasidan keyin bo'la olmaydi",
        );
      }
    }

    const botStartPayload = await this.generateUniquePayload();

    const created = await this.prisma.mockExam.create({
      data: {
        title,
        description: dto.description?.trim() || null,
        // No DRAFT step — exams go live for registration immediately on create.
        // Admin can flip back via the status dropdown if they need to pause.
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId,
        examDate: dto.examDate ? new Date(dto.examDate) : null,
        registrationDeadline: dto.registrationDeadline
          ? new Date(dto.registrationDeadline)
          : null,
        durationMinutes: dto.durationMinutes ?? null,
        // maxScore = sum of subject maxScores by default so percent / total
        // math lines up with what the admin actually configured.
        maxScore: effectiveMaxScore,
        passingScore: dto.passingScore ?? null,
        price: dto.price ?? 0,
        studentPrice: dto.studentPrice ?? null,
        offeredLevels: sanitizeOfferedLevels(dto.offeredLevels),
        examTimes: sanitizeExamTimes(dto.examTimes),
        formFields: this.defaultFormFields(),
        botStartPayload,
        createdById: userId,
        // Stamped explicitly rather than left to the column default: the exam
        // is where mock revenue is attributed, and mock money is deliberately
        // NOT written to the ledger, so this row is the only record of which
        // branch earned it.
        companyId,
        branchId,
        subjects: {
          create: subjectInputs.map((s, idx) => ({
            name: s.name,
            maxScore: s.maxScore,
            passingScore: s.passingScore,
            order: idx,
          })),
        },
      },
      include: {
        section: { select: { id: true, name: true, color: true } },
        subjects: { orderBy: { order: 'asc' } },
        _count: {
          select: { participants: { where: { deletedAt: null } } },
        },
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'MockExam',
      entityId: created.id,
      newValues: {
        title: created.title,
        sectionId: created.sectionId,
        status: created.status,
      },
      changedById: userId,
      companyId,
    });

    return this.toDetail(created);
  }

  async update(
    id: string,
    dto: UpdateMockExamDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = (await this.ensureExamInScope(
      id,
      companyId,
      scope,
    )) as Prisma.MockExamGetPayload<Record<string, never>>;

    // Per product decision (2026-05-26): editing is always open — admins can
    // change the form fields, title, section, etc. at any time. The trade-off
    // is that early participants might have answered an older version of the
    // form; that risk is accepted for the operational flexibility.

    if (dto.sectionId !== undefined) {
      const section = await this.prisma.mockExamSection.findFirst({
        where: { id: dto.sectionId, deletedAt: null, companyId },
      });
      if (!section) {
        throw new NotFoundException('Bo\'lim topilmadi');
      }
    }

    const data: Prisma.MockExamUpdateInput = {};
    if (dto.title !== undefined) {
      const trimmed = dto.title.trim();
      if (!trimmed) {
        throw new BadRequestException(
          "Imtihon nomi bo'sh bo'lishi mumkin emas",
        );
      }
      data.title = trimmed;
    }
    if (dto.sectionId !== undefined) {
      data.section = { connect: { id: dto.sectionId } };
    }
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.examDate !== undefined) {
      data.examDate = dto.examDate ? new Date(dto.examDate) : null;
    }
    if (dto.registrationDeadline !== undefined) {
      data.registrationDeadline = dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : null;
    }
    if (dto.durationMinutes !== undefined) {
      data.durationMinutes = dto.durationMinutes;
    }
    if (dto.maxScore !== undefined) {
      data.maxScore = dto.maxScore;
    }
    if (dto.passingScore !== undefined) {
      data.passingScore = dto.passingScore;
    }
    if (dto.price !== undefined) {
      data.price = dto.price;
    }
    if (dto.studentPrice !== undefined) {
      data.studentPrice = dto.studentPrice;
    }
    if (dto.offeredLevels !== undefined) {
      data.offeredLevels = sanitizeOfferedLevels(dto.offeredLevels);
    }
    if (dto.examTimes !== undefined) {
      data.examTimes = sanitizeExamTimes(dto.examTimes);
    }
    if (dto.formFields !== undefined) {
      this.validateFormFields(dto.formFields);
      // class-transformer + JSON.parse to strip class instances → plain shape.
      data.formFields = JSON.parse(
        JSON.stringify(dto.formFields),
      ) as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Yangilanadigan maydon ko'rsatilmagan");
    }

    // Cross-field validation on the merged future state.
    const nextMaxScore =
      dto.maxScore !== undefined ? dto.maxScore : existing.maxScore;
    const nextPassingScore =
      dto.passingScore !== undefined
        ? dto.passingScore
        : existing.passingScore;
    if (
      nextPassingScore !== null &&
      nextPassingScore !== undefined &&
      nextPassingScore > nextMaxScore
    ) {
      throw new BadRequestException(
        "O'tish balli umumiy ballidan katta bo'la olmaydi",
      );
    }
    const nextExamDate =
      dto.examDate !== undefined
        ? dto.examDate
          ? new Date(dto.examDate)
          : null
        : existing.examDate;
    const nextDeadline =
      dto.registrationDeadline !== undefined
        ? dto.registrationDeadline
          ? new Date(dto.registrationDeadline)
          : null
        : existing.registrationDeadline;
    if (nextExamDate && nextDeadline && nextDeadline > nextExamDate) {
      throw new BadRequestException(
        "Ro'yxatga olish muddati imtihon sanasidan keyin bo'la olmaydi",
      );
    }

    const updated = await this.prisma.mockExam.update({
      where: { id },
      data,
      include: {
        section: { select: { id: true, name: true, color: true } },
        _count: {
          select: { participants: { where: { deletedAt: null } } },
        },
      },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExam',
      entityId: id,
      oldValues: {
        title: existing.title,
        sectionId: existing.sectionId,
        maxScore: existing.maxScore,
      },
      newValues: {
        title: updated.title,
        sectionId: updated.sectionId,
        maxScore: updated.maxScore,
      },
      changedById: userId,
      companyId,
    });

    return this.toDetail(updated);
  }

  async changeStatus(
    id: string,
    nextStatus: MockExamStatus,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = (await this.ensureExamInScope(
      id,
      companyId,
      scope,
    )) as Prisma.MockExamGetPayload<Record<string, never>>;
    if (!isValidMockExamStatusTransition(existing.status, nextStatus)) {
      throw new BadRequestException(
        `${existing.status} → ${nextStatus} o'tish ruxsat etilmagan`,
      );
    }

    // Stamp `announcedAt` / `announcedById` when entering ANNOUNCED — used
    // by the PDF header and the bot delivery flow to find which mocks are
    // ready to view.
    const data: Prisma.MockExamUpdateInput = { status: nextStatus };
    if (
      nextStatus === MockExamStatus.ANNOUNCED &&
      existing.status !== MockExamStatus.ANNOUNCED
    ) {
      data.announcedAt = new Date();
      data.announcedBy = { connect: { id: userId } };
    }

    const updated = await this.prisma.mockExam.update({
      where: { id },
      data,
      include: {
        section: { select: { id: true, name: true, color: true } },
        _count: {
          select: { participants: { where: { deletedAt: null } } },
        },
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'MockExam',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: nextStatus },
      changedById: userId,
      companyId,
    });

    // Regenerate the results PDF on entry to ANNOUNCED, then fire a
    // broadcast event so the Telegram module can push the PDF +
    // per-participant publicId to every registered participant. PDF
    // generation failure is logged but doesn't block the status change —
    // admin can retry from the detail page via `regenerate-pdf`. Broadcast
    // is best-effort: per-participant errors are recorded on the
    // participant row by the listener.
    if (
      nextStatus === MockExamStatus.ANNOUNCED &&
      existing.status !== MockExamStatus.ANNOUNCED
    ) {
      try {
        await this.mockExamPdfService.generate(id);
        this.eventEmitter.emit('mock-exam.announced', { examId: id });
      } catch (err) {
        this.logger.error(
          `Failed to generate results PDF for ${id}: ${(err as Error).message}`,
        );
      }
    }

    return this.toDetail(updated);
  }

  /**
   * Resets `resultSentAt` for every participant in `examId` and re-emits
   * the `mock-exam.announced` event so the Telegram broadcast runs again.
   * Used when admin wants to re-deliver the PDF after fixing scores or
   * after a delivery bug (e.g. wrong filename) without changing status.
   */
  async rebroadcastResults(
    id: string,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    // Scope matters most here: this re-sends result PDFs over Telegram to every
    // participant of the exam, so an unscoped id would message another
    // company's students.
    const exam = (await this.ensureExamInScope(id, companyId, scope, {
      id: true,
      status: true,
    })) as { id: string; status: MockExamStatus };
    if (exam.status !== MockExamStatus.ANNOUNCED) {
      throw new BadRequestException(
        "Qayta yuborish faqat ANNOUNCED holatdagi imtihon uchun mavjud",
      );
    }
    const cleared = await this.prisma.mockExamParticipant.updateMany({
      where: { examId: id, deletedAt: null, resultSentAt: { not: null } },
      data: { resultSentAt: null, resultMessageId: null, resultSendError: null },
    });
    this.eventEmitter.emit('mock-exam.announced', { examId: id });
    this.logger.log(
      `Rebroadcast queued for exam ${id} (reset ${cleared.count} participants)`,
    );
    return { reset: cleared.count };
  }

  /**
   * Forcing a fresh PDF generation — used after the admin edits scores
   * post-announcement (rare, but supported). Idempotent.
   */
  async regeneratePdf(id: string, companyId: number, scope: ReportBranchIds) {
    const exam = (await this.ensureExamInScope(id, companyId, scope, {
      id: true,
      status: true,
    })) as { id: string; status: MockExamStatus };
    if (exam.status !== MockExamStatus.ANNOUNCED) {
      throw new BadRequestException(
        "PDF faqat ANNOUNCED holatdagi imtihon uchun yaratiladi",
      );
    }
    return this.mockExamPdfService.generate(id);
  }

  async remove(
    id: string,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = (await this.ensureExamInScope(
      id,
      companyId,
      scope,
    )) as Prisma.MockExamGetPayload<Record<string, never>>;

    await this.entityHistoryService.recordDelete({
      entityType: 'MockExam',
      entityId: id,
      oldValues: { title: existing.title, status: existing.status },
      changedById: userId,
      companyId,
    });

    await this.prisma.mockExam.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Imtihon o'chirildi" };
  }

  /**
   * Default 3 required fields that every mock exam form starts with: ism,
   * familya, telefon — same shape the Telegram bot scene (Faza 4) will
   * collect first. Admins add extras via the form builder.
   */
  private defaultFormFields(): Prisma.InputJsonValue {
    return [
      {
        id: shortId(8),
        type: 'text',
        label: 'Ismingiz',
        required: true,
        mapsTo: 'firstName',
      },
      {
        id: shortId(8),
        type: 'text',
        label: 'Familyangiz',
        required: true,
        mapsTo: 'lastName',
      },
      {
        id: shortId(8),
        type: 'phone',
        label: 'Telefon raqamingiz',
        required: true,
        mapsTo: 'phone',
      },
    ];
  }

  /**
   * Cross-field validation on the form fields array. Class-validator already
   * enforces each individual field's shape (id, type, label, required, ...);
   * this checks the rules that span multiple fields:
   *   - unique field ids
   *   - select / radio fields have at least one option
   *   - each mapsTo slot (firstName / lastName / phone) appears exactly once
   *     and is bound to a required field of the appropriate type
   */
  private validateFormFields(fields: FormFieldDto[]) {
    const ids = new Set<string>();
    for (const f of fields) {
      if (ids.has(f.id)) {
        throw new BadRequestException(
          "Forma maydonlari id-lari takrorlanmasligi kerak",
        );
      }
      ids.add(f.id);
      if (
        TYPES_WITH_OPTIONS.includes(f.type) &&
        (!f.options || f.options.length === 0)
      ) {
        throw new BadRequestException(
          `"${f.label}" maydoniga kamida bitta variant qo'shing`,
        );
      }
    }

    for (const slot of MAPS_TO_VALUES) {
      const matches = fields.filter((f) => f.mapsTo === slot);
      if (matches.length === 0) {
        throw new BadRequestException(
          `${slot} maydoni majburiy — biror maydonni unga bog'lang`,
        );
      }
      if (matches.length > 1) {
        throw new BadRequestException(
          `${slot} ga faqat bitta maydon bog'lanishi mumkin`,
        );
      }
      const match = matches[0];
      if (!match.required) {
        throw new BadRequestException(
          `${slot} ga bog'langan maydon majburiy bo'lishi kerak`,
        );
      }
      if (slot === 'phone' && match.type !== 'phone') {
        throw new BadRequestException(
          "Telefon maydonining turi 'phone' bo'lishi kerak",
        );
      }
    }
  }

  /**
   * Returns a section id to assign a new exam to when the caller didn't
   * pick one. Picks the first active section by `order`; if no sections
   * exist (fresh install), creates a default "Umumiy" one.
   */
  private async resolveDefaultSectionId(
    userId: number,
    companyId: number,
  ): Promise<string> {
    const first = await this.prisma.mockExamSection.findFirst({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (first) return first.id;

    const created = await this.prisma.mockExamSection.create({
      data: {
        name: 'Umumiy',
        color: null,
        order: 0,
        createdById: userId,
        companyId,
      },
      select: { id: true },
    });
    this.logger.log(`Auto-created default mock exam section: ${created.id}`);
    return created.id;
  }

  private async generateUniquePayload(): Promise<string> {
    for (let attempt = 0; attempt < MAX_PAYLOAD_RETRIES; attempt++) {
      const candidate = shortId(BOT_PAYLOAD_LENGTH);
      const collision = await this.prisma.mockExam.findUnique({
        where: { botStartPayload: candidate },
        select: { id: true },
      });
      if (!collision) return candidate;
    }
    throw new BadRequestException(
      "Bot havolasi uchun unikal kod yaratib bo'lmadi, qaytadan urinib ko'ring",
    );
  }

  private toSummary(exam: {
    id: string;
    title: string;
    description: string | null;
    status: MockExamStatus;
    sectionId: string;
    examDate: Date | null;
    registrationDeadline: Date | null;
    durationMinutes: number | null;
    maxScore: number;
    passingScore: number | null;
    price: number;
    studentPrice: number | null;
    offeredLevels: string[];
    examTimes: string[];
    formFields: Prisma.JsonValue;
    botStartPayload: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { participants: number };
  }) {
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      status: exam.status,
      sectionId: exam.sectionId,
      examDate: exam.examDate,
      registrationDeadline: exam.registrationDeadline,
      durationMinutes: exam.durationMinutes,
      maxScore: exam.maxScore,
      passingScore: exam.passingScore,
      price: exam.price,
      studentPrice: exam.studentPrice,
      offeredLevels: exam.offeredLevels,
      examTimes: exam.examTimes,
      formFields: exam.formFields,
      botStartPayload: exam.botStartPayload,
      participantCount: exam._count.participants,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }

  private toDetail(exam: {
    id: string;
    title: string;
    description: string | null;
    status: MockExamStatus;
    sectionId: string;
    examDate: Date | null;
    registrationDeadline: Date | null;
    durationMinutes: number | null;
    maxScore: number;
    passingScore: number | null;
    price: number;
    studentPrice: number | null;
    offeredLevels: string[];
    examTimes: string[];
    formFields: Prisma.JsonValue;
    botStartPayload: string;
    createdAt: Date;
    updatedAt: Date;
    section: { id: string; name: string; color: string | null };
    subjects?: Array<{
      id: string;
      name: string;
      maxScore: number;
      passingScore?: number | null;
      order: number;
    }>;
    resultsPdfFileKey?: string | null;
    resultsPdfGeneratedAt?: Date | null;
    _count: { participants: number };
  }) {
    return {
      ...this.toSummary(exam),
      section: exam.section,
      subjects: exam.subjects ?? [],
      // Field name on the model is a holdover from when R2 keys were
      // stored; today it's the public URL.
      resultsPdfUrl: exam.resultsPdfFileKey ?? null,
      resultsPdfGeneratedAt: exam.resultsPdfGeneratedAt ?? null,
    };
  }
}
