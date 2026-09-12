import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
import { tashkentRangeFilter } from '../common/date/tashkent';
import { LEAD_LINKED_REASON } from '../leads/leads.service';
import { FormFieldDto, MapsToValue } from './dto/form-field.dto';
import {
  NO_SOURCE_TOKEN,
  SubmissionQueryDto,
} from './dto/submission-query.dto';
import {
  SUBMISSION_STAGES,
  SubmissionStage,
  stageWhere,
  submissionStage,
} from './submission-stage';

/** CSV bitta so'rovda shundan ortiq qatorni olib kelmaydi. */
const EXPORT_LIMIT = 5000;

const ROW_SELECT = {
  id: true,
  submittedAt: true,
  data: true,
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      statusEnum: true,
      deletedAt: true,
      calledAt: true,
      createdAt: true,
      convertedStudentId: true,
      lostReason: true,
      statusChangeReason: true,
      calledBy: { select: { id: true, firstName: true, lastName: true } },
      source: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CustomFormSubmissionSelect;

type SubmissionRecord = Prisma.CustomFormSubmissionGetPayload<{
  select: typeof ROW_SELECT;
}>;
type RecordLead = NonNullable<SubmissionRecord['lead']>;

export type AnswerValue = string | number | boolean;

export interface SubmissionFieldColumn {
  id: string;
  label: string;
  type: FormFieldDto['type'];
  options?: { value: string; label: string }[];
}

export interface SubmissionRow {
  id: string;
  submittedAt: Date;
  data: Record<string, AnswerValue>;
  stage: SubmissionStage;
  isRepeat: boolean;
  /** Formaga yozilgan ism/telefon — lid butunlay o'chirilgan bo'lsa ham qoladi. */
  submitted: { firstName: string; lastName: string; phone: string };
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    statusEnum: RecordLead['statusEnum'];
    archived: boolean;
    calledAt: Date | null;
    calledBy: RecordLead['calledBy'];
    convertedStudentId: number | null;
    lostReason: string | null;
    source: RecordLead['source'];
  } | null;
}

interface ScopedForm {
  allFields: FormFieldDto[];
  /** Jadvalda alohida ustun bo'ladiganlari — ism/familiya/telefondan tashqari. */
  columns: SubmissionFieldColumn[];
}

/**
 * Bitta formaga kelgan javoblar: kim yozildi, qaysi bosqichda, qayerdan keldi.
 *
 * Bosqich `submission-stage.ts` dan olinadi — sanoq ham, filtr ham, qator ham
 * shu bitta ta'rifdan foydalanadi, shuning uchun chip yonidagi son bilan
 * jadvaldagi qatorlar soni ajralib ketmaydi.
 */
@Injectable()
export class CustomFormSubmissionsService {
  constructor(private prisma: PrismaService) {}

  async list(
    formId: string,
    query: SubmissionQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const form = await this.findScopedForm(formId, companyId, scope);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = this.buildWhere(formId, query);

    const [records, total, counts, legacyFields] = await Promise.all([
      this.prisma.customFormSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ROW_SELECT,
      }),
      this.prisma.customFormSubmission.count({ where }),
      this.countForm(formId),
      this.findLegacyFields(formId, form.allFields),
    ]);

    return {
      data: await this.toRows(records, form.allFields, companyId),
      total,
      page,
      pageSize,
      counts,
      fields: form.columns,
      legacyFields,
    };
  }

  async export(
    formId: string,
    query: SubmissionQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const form = await this.findScopedForm(formId, companyId, scope);
    const [records, legacyFields] = await Promise.all([
      this.prisma.customFormSubmission.findMany({
        where: this.buildWhere(formId, query),
        orderBy: { submittedAt: 'desc' },
        take: EXPORT_LIMIT,
        select: ROW_SELECT,
      }),
      this.findLegacyFields(formId, form.allFields),
    ]);
    return {
      data: await this.toRows(records, form.allFields, companyId),
      fields: form.columns,
      legacyFields,
    };
  }

  /** Forma bo'limi → ustun → filial zanjiri `findOne` dagi bilan bir xil. */
  private async findScopedForm(
    formId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<ScopedForm> {
    const form = await this.prisma.customForm.findFirst({
      where: {
        id: formId,
        companyId,
        deletedAt: null,
        section: { column: { ...branchIdWhere(scope) } },
      },
      select: { id: true, fields: true },
    });
    if (!form) {
      throw new NotFoundException('Forma topilmadi');
    }
    const allFields = Array.isArray(form.fields)
      ? (form.fields as unknown as FormFieldDto[])
      : [];
    return {
      allFields,
      columns: allFields
        .filter((f) => !f.mapsTo)
        .map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          ...(f.options ? { options: f.options } : {}),
        })),
    };
  }

  private buildWhere(
    formId: string,
    query: SubmissionQueryDto,
  ): Prisma.CustomFormSubmissionWhereInput {
    const and: Prisma.CustomFormSubmissionWhereInput[] = [];

    if (query.stage) and.push(stageWhere(query.stage));

    if (query.source?.length) {
      const ids = query.source.filter((s) => s !== NO_SOURCE_TOKEN);
      const or: Prisma.CustomFormSubmissionWhereInput[] = [];
      if (ids.length) or.push({ lead: { is: { sourceId: { in: ids } } } });
      if (query.source.includes(NO_SOURCE_TOKEN)) {
        or.push({ leadId: null }, { lead: { is: { sourceId: null } } });
      }
      and.push({ OR: or });
    }

    // Qidiruv: yoki BITTA telefon so'rovi (jadval «+998 XX XXX XX XX»
    // ko'rinishida chiqaradi — shu formatdagi qiymat ko'chirib qo'yilishi
    // kerak), yoki har bir so'z ism/familiya/telefonda bo'lishi shart bo'lgan
    // token'lar («Ali Valiyev» ikkala so'z bo'yicha topiladi).
    const rawSearch = query.search?.trim();
    if (rawSearch) {
      const isPhoneLikeQuery = /^[\d\s+\-()]+$/.test(rawSearch);
      const allDigits = rawSearch.replace(/\D/g, '');
      if (isPhoneLikeQuery && allDigits.length >= 2) {
        and.push({
          lead: {
            is: { phone: { contains: stripLeadingCountryCode(allDigits) } },
          },
        });
      } else {
        const tokens = rawSearch.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const or: Prisma.LeadWhereInput[] = [
            { firstName: { contains: token, mode: 'insensitive' } },
            { lastName: { contains: token, mode: 'insensitive' } },
          ];
          const digits = token.replace(/\D/g, '');
          if (digits.length >= 2) {
            or.push({ phone: { contains: stripLeadingCountryCode(digits) } });
          }
          and.push({ lead: { is: { OR: or } } });
        }
      }
    }

    const range = tashkentRangeFilter(query.startDate, query.endDate);
    return {
      formId,
      ...(range ? { submittedAt: range } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  /** Chip va manba sonlari — doim butun forma bo'yicha, filtrga qaramaydi. */
  private async countForm(formId: string) {
    const [stageTotals, bySource, leadless] = await Promise.all([
      Promise.all(
        SUBMISSION_STAGES.map((stage) =>
          this.prisma.customFormSubmission.count({
            where: { formId, AND: [stageWhere(stage)] },
          }),
        ),
      ),
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where: { formSubmissions: { some: { formId } } },
        _count: { _all: true },
      }),
      this.prisma.customFormSubmission.count({
        where: { formId, leadId: null },
      }),
    ]);

    const stages = Object.fromEntries(
      SUBMISSION_STAGES.map((stage, i) => [stage, stageTotals[i]]),
    ) as Record<SubmissionStage, number>;

    const sourceIds = bySource.flatMap((g) => (g.sourceId ? [g.sourceId] : []));
    const names = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((s) => [s.id, s.name]));

    const sources: { id: string | null; name: string | null; count: number }[] =
      [];
    let unsourced = leadless;
    for (const group of bySource) {
      if (group.sourceId) {
        sources.push({
          id: group.sourceId,
          name: nameById.get(group.sourceId) ?? "Noma'lum manba",
          count: group._count._all,
        });
      } else {
        unsourced += group._count._all;
      }
    }
    if (unsourced > 0) sources.push({ id: null, name: null, count: unsourced });
    sources.sort((a, b) => b.count - a.count);

    return { stages, sources };
  }

  /**
   * Formadan o'chirilgan maydonlarning eski javoblari yo'qolmasin. Nomi endi
   * `CustomForm.fields` da yo'q, shuning uchun raqamlangan umumiy nom.
   */
  private async findLegacyFields(formId: string, allFields: FormFieldDto[]) {
    const known = new Set(allFields.map((f) => f.id));
    const records = await this.prisma.customFormSubmission.findMany({
      where: { formId },
      select: { data: true },
      orderBy: { submittedAt: 'asc' },
    });
    const legacy: string[] = [];
    for (const { data } of records) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      for (const key of Object.keys(data)) {
        if (!known.has(key) && !legacy.includes(key)) legacy.push(key);
      }
    }
    return legacy.map((id, i) => ({
      id,
      label:
        legacy.length === 1
          ? "O'chirilgan maydon"
          : `O'chirilgan maydon ${i + 1}`,
    }));
  }

  private async toRows(
    records: SubmissionRecord[],
    allFields: FormFieldDto[],
    companyId: number,
  ): Promise<SubmissionRow[]> {
    const repeatLeadIds = await this.findRepeatLeadIds(
      records.flatMap((r) => (r.lead ? [r.lead] : [])),
      companyId,
    );
    return records.map((record) => {
      const stage = submissionStage(record.lead);
      const data = toAnswers(record.data);
      const lead = record.lead;
      return {
        id: record.id,
        submittedAt: record.submittedAt,
        data,
        stage,
        isRepeat: lead ? repeatLeadIds.has(lead.id) : false,
        submitted: mappedAnswers(allFields, data),
        lead: lead
          ? {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              phone: lead.phone,
              statusEnum: lead.statusEnum,
              archived: lead.deletedAt !== null,
              calledAt: lead.calledAt,
              calledBy: lead.calledBy,
              convertedStudentId: lead.convertedStudentId,
              lostReason: stage === 'lost' ? lostReasonOf(lead) : null,
              source: lead.source,
            }
          : null,
      };
    });
  }

  /**
   * Shu telefon bu liddan OLDIN boshqa lidda asosiy yoki qo'shimcha raqam
   * sifatida bo'lganmi. Faqat belgi — lid yaratish mantig'i o'zgarmaydi.
   */
  private async findRepeatLeadIds(
    leads: { id: string; phone: string; createdAt: Date }[],
    companyId: number,
  ): Promise<Set<string>> {
    const phones = [...new Set(leads.map((l) => l.phone).filter(Boolean))];
    if (!phones.length) return new Set();
    const others = await this.prisma.lead.findMany({
      where: {
        companyId,
        OR: [{ phone: { in: phones } }, { extraPhone: { in: phones } }],
      },
      select: { id: true, phone: true, extraPhone: true, createdAt: true },
    });
    const repeat = new Set<string>();
    for (const lead of leads) {
      const earlier = others.some(
        (o) =>
          o.id !== lead.id &&
          o.createdAt < lead.createdAt &&
          (o.phone === lead.phone || o.extraPhone === lead.phone),
      );
      if (earlier) repeat.add(lead.id);
    }
    return repeat;
  }
}

/**
 * Stored phones are 9 digits, no `998`. A search query copied straight out
 * of the "+998 XX XXX XX XX" column carries the country code, so a naive
 * digit match against `lead.phone` never hits. Only strip it when the digit
 * count is actually longer than a bare 9-digit number — a short query like
 * "90 123" must never be mistaken for a `998`-prefixed one.
 */
function stripLeadingCountryCode(digits: string): string {
  return digits.length > 9 && digits.startsWith('998')
    ? digits.slice(3)
    : digits;
}

function toAnswers(raw: Prisma.JsonValue): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

function mappedAnswers(
  fields: FormFieldDto[],
  data: Record<string, AnswerValue>,
): SubmissionRow['submitted'] {
  const pick = (slot: MapsToValue) => {
    const field = fields.find((f) => f.mapsTo === slot);
    const value = field ? data[field.id] : undefined;
    return value === undefined ? '' : String(value);
  };
  return {
    firstName: pick('firstName'),
    lastName: pick('lastName'),
    phone: pick('phone'),
  };
}

function lostReasonOf(lead: RecordLead): string | null {
  if (lead.lostReason) return lead.lostReason;
  const reason = lead.statusChangeReason;
  return reason && reason !== LEAD_LINKED_REASON ? reason : null;
}
