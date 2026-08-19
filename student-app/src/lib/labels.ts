import type { AttendanceStatus } from '@/api/types';
import type { Dict } from '@/i18n';

/**
 * These helpers take the active dictionary as their first parameter instead
 * of being React hooks — they're called from inside `.map()` callbacks and
 * from module-level arrays (e.g. `schedule.tsx`'s `WEEKDAYS`), where a hook
 * would violate the rules of hooks. Plain functions taking `t` are correct.
 */

export function dayLabel(t: Dict, day: string): string {
  const key = day?.toLowerCase() as keyof Dict['schedule']['weekdays'];
  return t.schedule.weekdays[key] ?? day;
}

export function attStatus(t: Dict): Record<AttendanceStatus, { label: string; tone: string }> {
  return {
    PRESENT: { label: t.attendance.present, tone: 'text-success' },
    LATE: { label: t.attendance.late, tone: 'text-warning' },
    ABSENT: { label: t.attendance.absent, tone: 'text-danger' },
    EXCUSED: { label: t.attendance.excused, tone: 'text-fg-muted' },
  };
}

export function paymentMethodLabel(t: Dict, method: string): string {
  const PAYMENT_METHODS: Record<string, string> = {
    CASH: t.payments.methodCash,
    PAYME: 'Payme',
    CLICK: 'Click',
    UZUM: 'Uzum',
    TRANSFER: t.payments.methodTransfer,
  };
  return PAYMENT_METHODS[method] ?? method;
}
