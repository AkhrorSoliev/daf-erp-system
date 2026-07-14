/**
 * Employee lifecycle events. Kept in `common` so emitters (`UsersService`,
 * `TeachersService`) and listeners (e.g. `SalaryUserLifecycleListener`) share
 * the name/payload without importing each other's modules.
 */

/** Fired when an employee is deactivated / terminated / archived. */
export const USER_DEACTIVATED_EVENT = 'user.deactivated';

export interface UserDeactivatedEvent {
  userId: number;
  companyId: number;
}
