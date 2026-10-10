/**
 * A salary payment turned PAID — emitted AFTER the commit, once per payment, by
 * the two routes a person uses (single «Berildi» and the month settle). The
 * past-months script (`SalarySettleAllocatedService`) never emits: closing old
 * months must not message staff.
 */
export const SALARY_PAID_EVENT = 'salary.paid';

export interface SalaryPaidPayload {
  salaryPaymentId: string;
  companyId: number;
}
