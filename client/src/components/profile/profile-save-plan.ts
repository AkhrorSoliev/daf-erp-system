/**
 * How the profile drawer's Save splits into requests (ADR-0031).
 *
 * The phone is a sign-in key, so it goes to `PATCH /users/phone` together with
 * the current password; `PATCH /users/profile` takes only name and photo and
 * refuses a phone outright. Kept out of the JSX so the split is tested.
 */
export interface ProfileSaveInput {
  user: { firstName: string; lastName: string; phone: string | null; photo: string | null };
  values: { firstName: string; lastName: string; phone: string; currentPassword: string };
  previewPhoto: string | null;
  photoRemoved: boolean;
}

export interface ProfileSavePlan {
  phone?: { phone: string; currentPassword: string };
  profile?: Record<string, string>;
}

export function isPhoneChanged(stored: string | null | undefined, typed: string): boolean {
  return typed !== (stored ?? "");
}

export function planProfileSave({
  user,
  values,
  previewPhoto,
  photoRemoved,
}: ProfileSaveInput): ProfileSavePlan {
  const plan: ProfileSavePlan = {};

  if (isPhoneChanged(user.phone, values.phone)) {
    plan.phone = { phone: values.phone, currentPassword: values.currentPassword };
  }

  const profile: Record<string, string> = {};
  if (values.firstName !== user.firstName) profile.firstName = values.firstName;
  if (values.lastName !== user.lastName) profile.lastName = values.lastName;
  if (photoRemoved) profile.photo = "";
  else if (previewPhoto && previewPhoto !== user.photo) profile.photo = previewPhoto;
  if (Object.keys(profile).length > 0) plan.profile = profile;

  return plan;
}

/**
 * The toast after a failed Save. The phone step runs first, so a failure can
 * land after the phone is already changed — say so, or the person retries a
 * change that already happened.
 */
export function describeSaveFailure({
  phoneSaved,
  reason,
}: {
  phoneSaved: boolean;
  reason: string;
}): string {
  if (!phoneSaved) return reason;
  return `Telefon raqam saqlandi, lekin qolgan o'zgarishlar saqlanmadi: ${reason}`;
}
