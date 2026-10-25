/**
 * Emitted by `removeFromGroup` after its transaction committed, only when
 * contract 6.2 kept the month's money (`DepartureOutcome.withheld`). Read by
 * `TaskAutoService` to open a «Pul ushlab qolindi» task for the branch's
 * administrators: a group MOVE done through «Guruhdan chiqarish» looks exactly
 * like this.
 */
export const DEPARTURE_WITHHELD = 'departure.withheld';

export interface DepartureWithheldPayload {
  companyId: number;
  branchId: number | null;
  studentId: number;
  enrollmentId: string;
  groupName: string;
  /** What a transfer would have given back (the unheld lessons' price). */
  amount: number;
  /** Lessons held through the departure day / covered lessons of the month. */
  held: number;
  covered: number;
  percent: number;
  /** Tashkent 'YYYY-MM-DD' of the departure. */
  departureDay: string;
  reason: string;
}
