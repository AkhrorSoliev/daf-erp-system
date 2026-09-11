import { LeadStatus, Prisma } from '@prisma/client';

/**
 * Formaga kelgan javob qaysi bosqichda — yagona ta'rif.
 *
 * Har bir javob AYNAN bitta bosqichga tushadi va bosqichlar yig'indisi jami
 * javobga teng. Buni ikki joy biladi: `submissionStage` (bitta qator uchun,
 * xotirada) va `stageWhere` (filtr va sanoq uchun, Prisma so'rovida).
 * `submission-stage.spec.ts` ikkalasini barcha kombinatsiyalarda solishtiradi.
 *
 * Ustuvorlik: o'quvchi bo'ldi → yo'qotildi → aloqada → qo'ng'iroq kutmoqda.
 */
export const SUBMISSION_STAGES = [
  'awaiting',
  'contacted',
  'converted',
  'lost',
] as const;

export type SubmissionStage = (typeof SUBMISSION_STAGES)[number];

export interface StageLeadFacts {
  statusEnum: LeadStatus;
  deletedAt: Date | null;
  calledAt: Date | null;
}

const LOST_STATUSES: LeadStatus[] = [LeadStatus.LOST, LeadStatus.ARCHIVED];
const CONTACTED_STATUSES: LeadStatus[] = [
  LeadStatus.TRIAL,
  LeadStatus.CONTACTED,
];

export function submissionStage(lead: StageLeadFacts | null): SubmissionStage {
  // Lid yo'q — CEO uni arxivdan butunlay o'chirgan (optional FK → SetNull).
  if (!lead) return 'lost';
  if (lead.statusEnum === LeadStatus.CONVERTED) return 'converted';
  if (lead.deletedAt !== null || LOST_STATUSES.includes(lead.statusEnum)) {
    return 'lost';
  }
  if (lead.calledAt !== null || CONTACTED_STATUSES.includes(lead.statusEnum)) {
    return 'contacted';
  }
  return 'awaiting';
}

export function stageWhere(
  stage: SubmissionStage,
): Prisma.CustomFormSubmissionWhereInput {
  switch (stage) {
    case 'converted':
      return { lead: { is: { statusEnum: LeadStatus.CONVERTED } } };
    case 'lost':
      return {
        OR: [
          { leadId: null },
          {
            lead: {
              is: {
                statusEnum: { not: LeadStatus.CONVERTED },
                OR: [
                  { deletedAt: { not: null } },
                  { statusEnum: { in: LOST_STATUSES } },
                ],
              },
            },
          },
        ],
      };
    case 'contacted':
      return {
        lead: {
          is: {
            deletedAt: null,
            statusEnum: { notIn: [LeadStatus.CONVERTED, ...LOST_STATUSES] },
            OR: [
              { calledAt: { not: null } },
              { statusEnum: { in: CONTACTED_STATUSES } },
            ],
          },
        },
      };
    case 'awaiting':
      return {
        lead: {
          is: {
            deletedAt: null,
            calledAt: null,
            statusEnum: {
              notIn: [
                LeadStatus.CONVERTED,
                ...LOST_STATUSES,
                ...CONTACTED_STATUSES,
              ],
            },
          },
        },
      };
  }
}
