import { LeadStatus, Prisma } from '@prisma/client';
import type { EntityHistoryService } from '../common/entity-history';
import type { PrismaService } from '../prisma/prisma.service';
import { LEVEL_TEST_RESULT_LABEL } from './level-test.texts';
import type { CorrectByLevel, LevelTestResult } from './level-test.types';

/** Lid manbasi nomi: admin lid kartasida odam qayerdan kelganini ko'radi. */
export const LEVEL_TEST_SOURCE_NAME = 'Telegram bot — daraja testi';

/** Nechta oxirgi urinishdagi savollar "ko'rilgan" hisoblanadi. */
const SEEN_ATTEMPTS = 10;

export interface BranchChoice {
  id: number;
  name: string;
}

export type LevelTestLeadOutcome =
  | { kind: 'created'; leadId: string }
  | { kind: 'existing'; leadId: string }
  | { kind: 'no-section' };

/** Shu chat avvalgi urinishlarda ko'rgan savollar id'lari. */
export async function seenQuestionIds(
  prisma: Pick<PrismaService, 'levelTestAttempt'>,
  chatId: string,
): Promise<Set<string>> {
  const rows = await prisma.levelTestAttempt.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: SEEN_ATTEMPTS,
    select: { questionIds: true },
  });
  return new Set(rows.flatMap((r) => r.questionIds));
}

export async function saveAttempt(
  prisma: Pick<PrismaService, 'levelTestAttempt'>,
  data: {
    chatId: string;
    questionIds: string[];
    correctByLevel: CorrectByLevel;
    result: LevelTestResult;
    companyId: number;
  },
): Promise<string> {
  const row = await prisma.levelTestAttempt.create({
    data: {
      chatId: data.chatId,
      questionIds: data.questionIds,
      correctByLevel: data.correctByLevel as Prisma.InputJsonObject,
      result: data.result,
      companyId: data.companyId,
    },
    select: { id: true },
  });
  return row.id;
}

/** Odam tanlashi mumkin bo'lgan filiallar: faol, o'chirilmagan. */
export async function branchChoices(
  prisma: Pick<PrismaService, 'branch'>,
  companyId: number,
): Promise<BranchChoice[]> {
  return prisma.branch.findMany({
    where: { companyId, deletedAt: null, status: 'ACTIVE' },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });
}

interface LeadParams {
  attemptId: string;
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number;
  companyId: number;
  result: LevelTestResult;
}

/**
 * Test natijasidan lid: tanlangan filialning "Yangi" ustunidagi birinchi
 * bo'limga. Shu telefonli jonli lid allaqachon bor bo'lsa, ikkinchisi
 * yaratilmaydi — urinish mavjud lidga bog'lanadi.
 *
 * `LeadsService` ni chaqirmaydi: u `TelegramModule` dan import qilinsa halqa
 * yasaydi (qarang: `StudentLeadOriginService`). Lid, uning tarixi va urinishga
 * bog'lanish BITTA tranzaksiyada.
 */
export async function createLeadFromTest(
  prisma: PrismaService,
  history: Pick<EntityHistoryService, 'recordCreate'>,
  p: LeadParams,
): Promise<LevelTestLeadOutcome> {
  const existing = await prisma.lead.findFirst({
    where: { companyId: p.companyId, phone: p.phone, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.levelTestAttempt.update({
      where: { id: p.attemptId },
      data: { leadId: existing.id },
    });
    return { kind: 'existing', leadId: existing.id };
  }

  const section = await prisma.leadSection.findFirst({
    where: {
      companyId: p.companyId,
      deletedAt: null,
      column: { branchId: p.branchId, systemKey: 'NEW', deletedAt: null },
    },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  if (!section) return { kind: 'no-section' };

  const leadId = await prisma.$transaction(async (tx) => {
    const source =
      (await tx.leadSource.findFirst({
        where: {
          name: LEVEL_TEST_SOURCE_NAME,
          deletedAt: null,
          companyId: p.companyId,
        },
        select: { id: true },
      })) ??
      (await tx.leadSource.create({
        data: { name: LEVEL_TEST_SOURCE_NAME, companyId: p.companyId },
        select: { id: true },
      }));

    const maxOrder = await tx.lead.aggregate({
      where: { sectionId: section.id, deletedAt: null },
      _max: { order: true },
    });

    const lead = await tx.lead.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        sectionId: section.id,
        sourceId: source.id,
        order: (maxOrder._max.order ?? -1) + 1,
        statusEnum: LeadStatus.NEW,
        status: 'new',
        companyId: p.companyId,
        branchId: p.branchId,
      },
      select: { id: true },
    });

    await history.recordCreate({
      entityType: 'Lead',
      entityId: lead.id,
      newValues: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        statusEnum: LeadStatus.NEW,
        manba: LEVEL_TEST_SOURCE_NAME,
        darajaTesti: LEVEL_TEST_RESULT_LABEL[p.result],
      },
      companyId: p.companyId,
      tx,
    });

    await tx.levelTestAttempt.update({
      where: { id: p.attemptId },
      data: { leadId: lead.id },
    });
    return lead.id;
  });
  return { kind: 'created', leadId };
}
