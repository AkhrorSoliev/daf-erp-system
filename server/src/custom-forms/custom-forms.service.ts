import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shortId } from './short-id.util';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LeadsService } from '../leads/leads.service';
import { CreateCustomFormDto } from './dto/create-custom-form.dto';
import { UpdateCustomFormDto } from './dto/update-custom-form.dto';
import {
  FIELD_TYPES,
  FormFieldDto,
  MAPS_TO_VALUES,
  MapsToValue,
  TYPES_WITH_OPTIONS,
} from './dto/form-field.dto';
import { SubmitFormDto } from './dto/submit-form.dto';

const SLUG_LENGTH = 10;
const FIELD_ID_LENGTH = 8;

// Shown to submitters after a successful submission. Hard-coded so admins
// can't accidentally ship typos or off-brand wording.
const DEFAULT_SUCCESS_MESSAGE =
  "Ma'lumotlaringiz qabul qilindi. Tez orada siz bilan bog'lanamiz.";

// Public-safe shape — never leaks mapsTo/internal metadata to anonymous users.
type PublicFieldShape = Pick<
  FormFieldDto,
  'id' | 'type' | 'label' | 'required' | 'placeholder' | 'options'
>;

@Injectable()
export class CustomFormsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private leadsService: LeadsService,
  ) {}

  // ── Admin: CRUD ────────────────────────────────────────────────────────────

  async list(companyId: number) {
    const forms = await this.prisma.customForm.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        section: {
          select: {
            id: true,
            name: true,
            column: { select: { id: true, name: true } },
          },
        },
        source: { select: { id: true, name: true } },
        _count: { select: { submissions: true } },
      },
    });

    return forms.map(({ _count, ...rest }) => ({
      ...rest,
      submissionCount: _count.submissions,
    }));
  }

  async findOne(id: string, companyId: number) {
    const form = await this.prisma.customForm.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        sectionId: true,
        sourceId: true,
        fields: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        section: {
          select: {
            id: true,
            name: true,
            column: { select: { id: true, name: true } },
          },
        },
        source: { select: { id: true, name: true } },
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            data: true,
            submittedAt: true,
            lead: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!form) {
      throw new NotFoundException('Forma topilmadi');
    }
    return form;
  }

  async create(
    dto: CreateCustomFormDto,
    companyId: number,
    userId: number,
  ) {
    await this.assertSectionAndSourceExist(dto.sectionId, dto.sourceId);
    const fields = this.normalizeFields(dto.fields);
    this.validateFields(fields);

    const slug = await this.generateUniqueSlug();

    const created = await this.prisma.customForm.create({
      data: {
        slug,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        sectionId: dto.sectionId,
        sourceId: dto.sourceId ?? null,
        fields: fields as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        companyId,
        createdById: userId,
      },
      select: this.adminSelect(),
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'CustomForm',
      entityId: created.id,
      newValues: { title: created.title, slug: created.slug },
      changedById: userId,
      companyId,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateCustomFormDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.customForm.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, title: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException('Forma topilmadi');
    }

    if (dto.sectionId !== undefined || dto.sourceId !== undefined) {
      await this.assertSectionAndSourceExist(
        dto.sectionId,
        dto.sourceId === '' ? undefined : dto.sourceId,
      );
    }

    const data: Prisma.CustomFormUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined)
      data.description = dto.description?.trim() || null;
    if (dto.sectionId !== undefined) data.sectionId = dto.sectionId;
    if (dto.sourceId !== undefined) data.sourceId = dto.sourceId || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.fields !== undefined) {
      const fields = this.normalizeFields(dto.fields);
      this.validateFields(fields);
      data.fields = fields as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.customForm.update({
      where: { id },
      data,
      select: this.adminSelect(),
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'CustomForm',
      entityId: id,
      oldValues: { title: existing.title, isActive: existing.isActive },
      newValues: { title: updated.title, isActive: updated.isActive },
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.customForm.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, title: true, slug: true },
    });
    if (!existing) {
      throw new NotFoundException('Forma topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'CustomForm',
      entityId: id,
      oldValues: { title: existing.title, slug: existing.slug },
      changedById: userId,
      companyId,
    });

    await this.prisma.customForm.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Forma arxivga ko'chirildi" };
  }

  // ── Public: read schema + submit ───────────────────────────────────────────

  async getPublicSchema(slug: string) {
    const form = await this.prisma.customForm.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        fields: true,
      },
    });
    if (!form) {
      throw new NotFoundException('Forma topilmadi');
    }
    const fields = this.parseFields(form.fields);
    const publicFields: PublicFieldShape[] = fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
    }));
    return {
      title: form.title,
      description: form.description,
      fields: publicFields,
    };
  }

  async submit(
    slug: string,
    dto: SubmitFormDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.prisma.customForm.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        sectionId: true,
        sourceId: true,
        fields: true,
      },
    });
    if (!form) {
      throw new NotFoundException('Forma topilmadi');
    }

    const fields = this.parseFields(form.fields);
    const data = dto.data ?? {};
    const cleaned = this.validateSubmissionPayload(fields, data);

    const mapped = this.extractMappedValues(fields, cleaned);
    if (!mapped.firstName || !mapped.lastName || !mapped.phone) {
      // Schema-time validation should have prevented this, but guard
      // against tampered or legacy form schemas.
      throw new BadRequestException("Ism, familya va telefon maydonlari to'liq emas");
    }

    const lead = await this.leadsService.create(
      {
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
        sectionId: form.sectionId,
        sourceId: form.sourceId ?? undefined,
      },
      form.companyId,
      null,
    );

    await this.prisma.customFormSubmission.create({
      data: {
        formId: form.id,
        leadId: lead.id,
        data: cleaned as unknown as Prisma.InputJsonValue,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    return { success: true, message: DEFAULT_SUCCESS_MESSAGE };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private adminSelect() {
    return {
      id: true,
      slug: true,
      title: true,
      description: true,
      sectionId: true,
      sourceId: true,
      fields: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      section: {
        select: {
          id: true,
          name: true,
          column: { select: { id: true, name: true } },
        },
      },
      source: { select: { id: true, name: true } },
    } satisfies Prisma.CustomFormSelect;
  }

  private async assertSectionAndSourceExist(
    sectionId?: string,
    sourceId?: string,
  ) {
    if (sectionId) {
      const section = await this.prisma.leadSection.findFirst({
        where: { id: sectionId, deletedAt: null },
        select: { id: true },
      });
      if (!section) {
        throw new NotFoundException("Bo'lim topilmadi");
      }
    }
    if (sourceId) {
      const source = await this.prisma.leadSource.findFirst({
        where: { id: sourceId, deletedAt: null },
        select: { id: true },
      });
      if (!source) {
        throw new NotFoundException('Lid manbasi topilmadi');
      }
    }
  }

  private normalizeFields(fields: FormFieldDto[]): FormFieldDto[] {
    return fields.map((field) => ({
      ...field,
      id: field.id?.trim() || shortId(FIELD_ID_LENGTH),
      label: field.label.trim(),
      placeholder: field.placeholder?.trim() || undefined,
      options: TYPES_WITH_OPTIONS.includes(field.type)
        ? field.options?.map((o) => ({
            value: o.value.trim(),
            label: o.label.trim(),
          }))
        : undefined,
      mapsTo: field.mapsTo ?? undefined,
    }));
  }

  private validateFields(fields: FormFieldDto[]) {
    if (!fields.length) {
      throw new BadRequestException("Kamida bitta maydon qo'shish kerak");
    }

    const ids = new Set<string>();
    for (const f of fields) {
      if (ids.has(f.id)) {
        throw new BadRequestException("Maydon identifikatorlari takrorlanmasligi kerak");
      }
      ids.add(f.id);

      if (!f.label) {
        throw new BadRequestException("Har bir maydon nomi to'ldirilishi kerak");
      }
      if (TYPES_WITH_OPTIONS.includes(f.type)) {
        if (!f.options?.length) {
          throw new BadRequestException(
            `"${f.label}" maydoni uchun kamida bitta variant qo'shish kerak`,
          );
        }
      }
    }

    // Exactly one mapping per slot, and each mapping must be required.
    const mappingCounts = new Map<MapsToValue, number>();
    for (const slot of MAPS_TO_VALUES) mappingCounts.set(slot, 0);
    for (const f of fields) {
      if (f.mapsTo) {
        mappingCounts.set(f.mapsTo, (mappingCounts.get(f.mapsTo) ?? 0) + 1);
        if (!f.required) {
          throw new BadRequestException(
            `Ism / Familya / Telefon ga bog'langan "${f.label}" maydoni majburiy bo'lishi kerak`,
          );
        }
        if (f.mapsTo === 'phone' && f.type !== 'phone') {
          throw new BadRequestException(
            `Telefon maydonining turi "phone" bo'lishi kerak`,
          );
        }
      }
    }
    for (const [slot, count] of mappingCounts) {
      if (count === 0) {
        throw new BadRequestException(
          `${this.slotLabel(slot)} maydoni majburiy — formaga qo'shing va uni "${this.slotLabel(slot)}" ga bog'lang`,
        );
      }
      if (count > 1) {
        throw new BadRequestException(
          `${this.slotLabel(slot)} ga faqat bitta maydon bog'lanishi mumkin`,
        );
      }
    }
  }

  private slotLabel(slot: MapsToValue): string {
    return slot === 'firstName' ? 'Ism' : slot === 'lastName' ? 'Familya' : 'Telefon';
  }

  private parseFields(raw: Prisma.JsonValue): FormFieldDto[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as FormFieldDto[];
  }

  // Returns a sanitised copy of `data` keyed by valid field IDs.
  private validateSubmissionPayload(
    fields: FormFieldDto[],
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const knownIds = new Set(fields.map((f) => f.id));
    const cleaned: Record<string, unknown> = {};

    for (const field of fields) {
      const raw = data[field.id];
      const value = this.coerceValue(field, raw);
      const provided =
        value !== undefined && value !== null && value !== '';

      if (field.required && !provided) {
        throw new BadRequestException(`"${field.label}" maydoni to'ldirilishi shart`);
      }

      if (!provided) continue;

      // select/radio: value must be one of the configured options.
      if (TYPES_WITH_OPTIONS.includes(field.type)) {
        const allowed = field.options?.map((o) => o.value) ?? [];
        if (!allowed.includes(value as string)) {
          throw new BadRequestException(
            `"${field.label}" uchun noto'g'ri qiymat tanlandi`,
          );
        }
      }

      if (field.type === 'phone') {
        const digits = String(value).replace(/\D/g, '').replace(/^998/, '');
        if (!/^\d{9}$/.test(digits)) {
          throw new BadRequestException(
            `"${field.label}" — telefon raqami 9 raqamdan iborat bo'lishi kerak`,
          );
        }
        cleaned[field.id] = digits;
        continue;
      }

      if (field.type === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
          throw new BadRequestException(
            `"${field.label}" — to'g'ri email kiriting`,
          );
        }
      }

      if (field.type === 'number') {
        const n = Number(value);
        if (Number.isNaN(n)) {
          throw new BadRequestException(
            `"${field.label}" — son kiriting`,
          );
        }
        cleaned[field.id] = n;
        continue;
      }

      cleaned[field.id] = value;
    }

    // Drop unknown extra keys silently — they're not part of the form schema.
    for (const key of Object.keys(data)) {
      if (!knownIds.has(key)) continue;
    }

    return cleaned;
  }

  private coerceValue(field: FormFieldDto, raw: unknown): unknown {
    if (raw === undefined || raw === null) return raw;
    if (field.type === 'checkbox') return Boolean(raw);
    if (typeof raw === 'string') return raw.trim();
    return raw;
  }

  private extractMappedValues(
    fields: FormFieldDto[],
    cleaned: Record<string, unknown>,
  ): { firstName?: string; lastName?: string; phone?: string } {
    const out: { firstName?: string; lastName?: string; phone?: string } = {};
    for (const field of fields) {
      if (!field.mapsTo) continue;
      const value = cleaned[field.id];
      if (value === undefined || value === null) continue;
      out[field.mapsTo] = String(value);
    }
    return out;
  }

  private async generateUniqueSlug(): Promise<string> {
    // Collision is astronomically unlikely (nanoid 10 = ~91 bits), but retry
    // a few times to be safe.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = shortId(SLUG_LENGTH);
      const exists = await this.prisma.customForm.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!exists) return slug;
    }
    throw new BadRequestException("Forma havolasini yaratib bo'lmadi, qaytadan urinib ko'ring");
  }

  // Exposed for tests
  __validateFieldsForTest(fields: FormFieldDto[]) {
    return this.validateFields(fields);
  }

  // Used by FIELD_TYPES re-export in tests.
  static readonly FIELD_TYPES = FIELD_TYPES;
}
