import { format } from 'date-fns';

/** Integer so'm with space thousands separators, e.g. -99 999 so'm. Hermes-safe (no Intl). */
export function formatSom(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${abs} so'm`;
}

/** 9-digit local phone -> +998 90 123 45 67. */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').slice(-9);
  if (d.length !== 9) return phone;
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

/** dd.MM.yyyy (server resolves Asia/Tashkent; pass an ISO string or Date). */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return format(date, 'dd.MM.yyyy');
}
