import type { CustomerDraft } from "./contract-rules";
import type { ContractPrefill } from "./contract-types";

/**
 * Mirror of server/src/contract-documents/profile-sync.ts: which customer
 * field fills which profile field, and when the two disagree. The server
 * re-checks it and refuses an unsettled difference.
 */
export type ProfileField =
  | "passportSeries"
  | "address"
  | "telegram"
  | "parentName"
  | "parentPhone"
  | "phone";

type DraftKey = "passport" | "address" | "telegram" | "fullName" | "phone";
export type StudentProfile = ContractPrefill["student"];

const PROFILE_VALUE: Record<ProfileField, (p: StudentProfile) => string | null> = {
  passportSeries: (p) => p.passport,
  address: (p) => p.address,
  telegram: (p) => p.telegram,
  parentName: (p) => p.parentName,
  parentPhone: (p) => p.parentPhone,
  phone: (p) => p.phone,
};

/** The profile field a customer input speaks for, or null. */
export function profileFieldFor(kind: CustomerDraft["kind"], key: DraftKey): ProfileField | null {
  if (kind === "SELF") {
    if (key === "passport") return "passportSeries";
    if (key === "address") return "address";
    if (key === "telegram") return "telegram";
    if (key === "phone") return "phone";
  }
  if (kind === "PARENT") {
    if (key === "fullName") return "parentName";
    if (key === "phone") return "parentPhone";
    if (key === "address") return "address";
  }
  return null;
}

function norm(field: ProfileField, value: string): string {
  const v = value.trim();
  if (field === "passportSeries") return v.replace(/\s+/g, "").toUpperCase();
  if (field === "phone" || field === "parentPhone") return v.replace(/\D/g, "").slice(-9);
  if (field === "telegram") return v.replace(/^@/, "").toLowerCase();
  return v.replace(/\s+/g, " ").toLowerCase();
}

export interface ProfileConflict {
  field: ProfileField;
  key: DraftKey;
  profileValue: string;
  /** The student's own phone is a sign-in key: never updated from here. */
  writable: boolean;
}

/** The difference under one input, or null. */
export function conflictFor(
  key: DraftKey,
  customer: CustomerDraft,
  profile: StudentProfile | null | undefined,
): ProfileConflict | null {
  if (!profile) return null;
  const field = profileFieldFor(customer.kind, key);
  if (!field) return null;
  const entered = customer[key].trim();
  const current = PROFILE_VALUE[field](profile)?.trim();
  if (!entered || !current) return null;
  if (norm(field, entered) === norm(field, current)) return null;
  return { field, key, profileValue: current, writable: field !== "phone" };
}

const KEYS: DraftKey[] = ["fullName", "passport", "address", "phone", "telegram"];

export function profileConflicts(
  customer: CustomerDraft,
  profile: StudentProfile | null | undefined,
): ProfileConflict[] {
  return KEYS.map((k) => conflictFor(k, customer, profile)).filter(
    (c): c is ProfileConflict => c !== null,
  );
}

/** Differences the admin has not settled yet. */
export function unsettled(conflicts: ProfileConflict[], updates: ProfileField[]): ProfileConflict[] {
  return conflicts.filter((c) => !(c.writable && updates.includes(c.field)));
}

/** What to send: only choices still standing on a current difference. */
export function profileUpdatesBody(
  conflicts: ProfileConflict[],
  updates: ProfileField[],
): ProfileField[] {
  return conflicts.filter((c) => c.writable && updates.includes(c.field)).map((c) => c.field);
}
