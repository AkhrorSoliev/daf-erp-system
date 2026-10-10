import type { EnrollmentStatus, Prisma } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';
import type { ContractCustomer, ContractFields } from './contract-fields';

const USER_NAME = { select: { firstName: true, lastName: true } } as const;

export const CONTRACT_VIEW_INCLUDE = {
  createdBy: USER_NAME,
  signedBy: USER_NAME,
  cancelledBy: USER_NAME,
  enrollments: {
    where: { deletedAt: null },
    select: { id: true, status: true, group: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.ContractDocumentInclude;

export type ContractWithView = Prisma.ContractDocumentGetPayload<{
  include: typeof CONTRACT_VIEW_INCLUDE;
}>;

export type ContractStatusView = 'UNSIGNED' | 'SIGNED' | 'CANCELLED';

export interface ContractView {
  id: string;
  number: string;
  contractDate: string;
  templateVersion: number;
  status: ContractStatusView;
  createdAt: string;
  createdBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  fields: ContractFields;
  /** Enrollments linked now — a transfer adds the new group's here. */
  links: {
    enrollmentId: string;
    status: EnrollmentStatus;
    groupName: string;
  }[];
}

export interface ContractsList {
  contracts: ContractView[];
  /** ACTIVE/FROZEN monthly courses under no live contract. */
  uncovered: {
    enrollmentId: string;
    status: EnrollmentStatus;
    courseName: string;
    groupName: string;
  }[];
}

export interface ContractPrefill {
  today: string;
  branch: { name: string; missing: string[] };
  student: {
    fullName: string;
    birthDate: string | null;
    isMinor: boolean | null;
    phone: string;
    telegram: string | null;
    passport: string | null;
    address: string | null;
    parentName: string | null;
    parentPhone: string | null;
  };
  lastCustomer: ContractCustomer | null;
  courses: {
    enrollmentId: string;
    status: EnrollmentStatus;
    courseName: string;
    groupName: string;
    contractNumber: string | null;
    monthlyPrice: number;
    discountPercent: number;
    firstPaymentAmount: number;
  }[];
}

const nameOf = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.lastName} ${u.firstName}`.trim() : null;

export function contractStatus(doc: {
  signedAt: Date | null;
  cancelledAt: Date | null;
}): ContractStatusView {
  if (doc.cancelledAt) return 'CANCELLED';
  return doc.signedAt ? 'SIGNED' : 'UNSIGNED';
}

export async function loadContractView(
  db: Pick<Prisma.TransactionClient, 'contractDocument'>,
  id: string,
): Promise<ContractView> {
  const doc = await db.contractDocument.findUniqueOrThrow({
    where: { id },
    include: CONTRACT_VIEW_INCLUDE,
  });
  return toContractView(doc);
}

export function toContractView(doc: ContractWithView): ContractView {
  return {
    id: doc.id,
    number: doc.number,
    contractDate: tashkentDateStr(doc.contractDate),
    templateVersion: doc.templateVersion,
    status: contractStatus(doc),
    createdAt: doc.createdAt.toISOString(),
    createdBy: nameOf(doc.createdBy),
    signedAt: doc.signedAt?.toISOString() ?? null,
    signedBy: nameOf(doc.signedBy),
    cancelledAt: doc.cancelledAt?.toISOString() ?? null,
    cancelledBy: nameOf(doc.cancelledBy),
    cancelReason: doc.cancelReason,
    fields: doc.fields as unknown as ContractFields,
    links: doc.enrollments.map((e) => ({
      enrollmentId: e.id,
      status: e.status,
      groupName: e.group.name,
    })),
  };
}
