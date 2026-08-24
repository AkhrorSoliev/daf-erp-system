import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Roles allowed to set a student's discount. Deliberately narrower than the
 * route's own `@Roles()`, which includes Administrator.
 */
export const DISCOUNT_ROLES = ['CEO', 'Branch Director'] as const;

/**
 * Guards the one field on `PATCH /students/:id` that moves money BACKWARDS.
 *
 * WHY IT EXISTS: the edit form hides the discount input from anyone who is not
 * a CEO or a Branch Director (`canSetDiscount` in `edit-student-form.tsx`), and
 * that was the ONLY thing enforcing it. The route itself accepts Administrator,
 * and nothing on the server looked at `discountPercent` before applying it — so
 * the restriction lasted exactly as long as the caller used the form.
 *
 * The field is not ordinary data. Changing it runs
 * `applyRetroactiveDiscountAdjustment`, which recomputes EVERY past lesson
 * charge on that student and writes a single signed `DISCOUNT_ADJUSTMENT`. In
 * production it has moved 1 473 807 so'm across 7 students, one of them
 * 449 995 so'm reaching back 41 lessons.
 *
 * PRESENCE is what is checked, not "did the value change". A caller who may not
 * set the discount has no business sending the field at all, and comparing
 * against the stored value would mean loading the student inside a guard —
 * putting the decision one query away from the thing it protects. The web form
 * omits the field entirely for those roles, so nothing legitimate is refused.
 */
@Injectable()
export class DiscountRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      body?: Record<string, unknown>;
      user?: { roles?: string[] };
    }>();

    if (request.body?.discountPercent === undefined) return true;

    const roles = request.user?.roles ?? [];
    const allowed = roles.some((role) =>
      (DISCOUNT_ROLES as readonly string[]).includes(role),
    );
    if (allowed) return true;

    throw new ForbiddenException(
      "Chegirmani faqat CEO yoki filial direktori o'zgartira oladi",
    );
  }
}
