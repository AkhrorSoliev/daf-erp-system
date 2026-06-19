import type { AttendanceStatus } from '@/api/types';

const DAY_LABELS: Record<string, string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

export function dayLabel(day: string): string {
  return DAY_LABELS[day?.toLowerCase()] ?? day;
}

export const ATT_STATUS: Record<AttendanceStatus, { label: string; tone: string }> = {
  PRESENT: { label: 'Keldi', tone: 'text-success' },
  LATE: { label: 'Kechikdi', tone: 'text-warning' },
  ABSENT: { label: 'Kelmadi', tone: 'text-danger' },
  EXCUSED: { label: 'Sababli', tone: 'text-fg-muted' },
};

const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS[method] ?? method;
}
