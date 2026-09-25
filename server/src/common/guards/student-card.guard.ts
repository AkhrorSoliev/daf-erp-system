import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

/**
 * Refuses a request whose token carries no `studentId` (404, like the inline
 * checks in `StudentPortalController`).
 *
 * `@Roles('Student')` proves the caller holds the Student role, not that a
 * student card stands behind the account. Without this guard such a token
 * reaches the handler with `studentId` undefined, and Prisma reads
 * `{ studentId: undefined }` as "no filter": a query meant for one student
 * runs over all of them.
 *
 * Put it AFTER `RolesGuard` in `@UseGuards`, so a staff token still gets 403.
 * On a controller it covers every route, including ones added later — which
 * a per-handler `if (!studentId)` cannot promise.
 */
@Injectable()
export class StudentCardGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { studentId?: unknown } }>();
    const studentId = user?.studentId;
    if (
      typeof studentId !== 'number' ||
      !Number.isInteger(studentId) ||
      studentId <= 0
    ) {
      throw new NotFoundException('Talaba topilmadi');
    }
    return true;
  }
}
