import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SalaryConfigService } from './salary-config.service';
import { USER_DEACTIVATED_EVENT } from '../common/events/user-lifecycle.events';
import type { UserDeactivatedEvent } from '../common/events/user-lifecycle.events';

/**
 * Stops payroll for a deactivated employee. On `user.deactivated`, closes their
 * FIXED_MONTHLY salary configs + open versions so the cron no longer pays them
 * (the final partial month still prorates correctly; later months → 0).
 *
 * Decoupled via an event so `UsersService` / `TeachersService` need not import
 * the salary module (no circular dependency). Failures are logged, never
 * thrown — a deactivation must not be blocked by a salary-config hiccup (the
 * `deletedAt` guard in the payroll sweep is the defense-in-depth backstop).
 */
@Injectable()
export class SalaryUserLifecycleListener {
  private readonly logger = new Logger(SalaryUserLifecycleListener.name);

  constructor(private readonly salaryConfig: SalaryConfigService) {}

  @OnEvent(USER_DEACTIVATED_EVENT)
  async handleUserDeactivated(evt: UserDeactivatedEvent): Promise<void> {
    try {
      const closed = await this.salaryConfig.deactivateConfigsForUser(
        evt.userId,
        evt.companyId,
      );
      if (closed > 0) {
        this.logger.log(
          `Closed ${closed} FIXED_MONTHLY salary config(s) for deactivated user ${evt.userId}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to close salary configs for deactivated user ${evt.userId}: ${err?.message ?? err}`,
      );
    }
  }
}
