import { ForbiddenException } from '@nestjs/common';

export const OWN_SIGN_IN_KEYS_MESSAGE =
  "O'z telefon raqamingiz va parolingiz «Profil» sahifasida, joriy parol bilan o'zgartiriladi. O'z loginingizni o'zgartira olmaysiz";

/**
 * Refuses a write that changes the CALLER's own sign-in key through a door
 * that never asks for their password (ADR-0031).
 *
 * `PATCH /users/password` and `PATCH /users/phone` ask for the current
 * password. `PATCH /users/:id` and `PATCH /teachers/:id` do not, so they must
 * not change the caller's own phone, login or password — whatever else they
 * let a caller edit on their own record.
 *
 * Phone and login count only when they differ from what is stored: the
 * employee form re-sends both on every save. A password counts whenever one
 * is sent, exactly as the services write it (`if (dto.password)`).
 */
export function assertNotChangingOwnSignInKeys(
  target: { id: number; phone: string | null; login: string | null },
  callerId: number | undefined,
  dto: { phone?: string; login?: string; password?: string },
): void {
  // An unknown caller is refused, never read as "not yourself" (ADR-0008).
  if (callerId === undefined) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }
  if (target.id !== callerId) return;

  const changesPhone = dto.phone !== undefined && dto.phone !== target.phone;
  const changesLogin = dto.login !== undefined && dto.login !== target.login;
  if (changesPhone || changesLogin || !!dto.password) {
    throw new ForbiddenException(OWN_SIGN_IN_KEYS_MESSAGE);
  }
}
