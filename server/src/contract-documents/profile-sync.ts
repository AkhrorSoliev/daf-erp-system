import type { ContractCustomer } from './contract-fields';

/**
 * What the contract dialog collects that the student's profile also holds
 * (CEO, 10.10.2026): an empty profile field is filled, a different one must be
 * settled by the admin — keep the profile's value or update the profile.
 * The student's own phone is a sign-in key (ADR-0032), so it is compared but
 * never written from here.
 */
export const PROFILE_FIELDS = [
  'passportSeries',
  'address',
  'telegram',
  'parentName',
  'parentPhone',
  'phone',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const WRITABLE_PROFILE_FIELDS = PROFILE_FIELDS.filter(
  (f): f is Exclude<ProfileField, 'phone'> => f !== 'phone',
);

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  passportSeries: 'pasport',
  address: 'manzil',
  telegram: 'telegram',
  parentName: 'ota-ona ismi',
  parentPhone: 'ota-ona telefoni',
  phone: 'telefon',
};

export type StudentProfile = Record<ProfileField, string | null>;

/** The profile fields this customer speaks for, with the contract's values. */
export function profileTargets(
  c: ContractCustomer,
): Partial<Record<ProfileField, string>> {
  const out: Partial<Record<ProfileField, string>> = {};
  const put = (f: ProfileField, v: string | null) => {
    if (v && v.trim()) out[f] = v.trim();
  };
  if (c.kind === 'SELF') {
    put('passportSeries', c.passport);
    put('address', c.address);
    put('telegram', c.telegram);
    put('phone', c.phone);
  } else if (c.kind === 'PARENT') {
    put('parentName', c.fullName);
    put('parentPhone', c.phone);
    put('address', c.address);
  }
  return out;
}

function norm(field: ProfileField, value: string): string {
  const v = value.trim();
  if (field === 'passportSeries') return v.replace(/\s+/g, '').toUpperCase();
  if (field === 'phone' || field === 'parentPhone') {
    return v.replace(/\D/g, '').slice(-9);
  }
  if (field === 'telegram') return v.replace(/^@/, '').toLowerCase();
  return v.replace(/\s+/g, ' ').toLowerCase();
}

export function sameValue(
  field: ProfileField,
  a: string | null,
  b: string | null,
): boolean {
  return norm(field, a ?? '') === norm(field, b ?? '');
}

export interface ProfileSyncPlan {
  /** Profile fields to write now. */
  writes: Partial<Record<ProfileField, string>>;
  /** Differences the admin has not settled. */
  conflicts: ProfileField[];
}

/**
 * `updates` are the fields the admin chose «Yangisi to'g'ri — profilni
 * yangilash» for. A difference not in it is a conflict; so is any difference
 * on the student's own phone.
 */
export function profileSyncPlan(
  customer: ContractCustomer,
  profile: StudentProfile,
  updates: readonly string[] = [],
): ProfileSyncPlan {
  const writes: ProfileSyncPlan['writes'] = {};
  const conflicts: ProfileField[] = [];
  const targets = profileTargets(customer);
  for (const field of PROFILE_FIELDS) {
    const value = targets[field];
    if (value === undefined) continue;
    const current = profile[field];
    if (current && current.trim()) {
      if (sameValue(field, current, value)) continue;
      if (field !== 'phone' && updates.includes(field)) writes[field] = value;
      else conflicts.push(field);
    } else if (field !== 'phone') {
      writes[field] = value;
    }
  }
  return { writes, conflicts };
}

export function conflictMessage(conflicts: ProfileField[]): string {
  const names = conflicts.map((f) => PROFILE_FIELD_LABEL[f]).join(', ');
  const phone = conflicts.includes('phone')
    ? " Telefon raqam profilni tahrirlash orqali o'zgartiriladi."
    : '';
  return `Profildagi ma'lumotdan farq qiladi: ${names}. O'quvchidan qayta so'rab, qaysi biri to'g'riligini tanlang.${phone}`;
}
