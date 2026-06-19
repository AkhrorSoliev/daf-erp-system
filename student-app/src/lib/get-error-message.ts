import { isAxiosError } from 'axios';

/** Extract a user-friendly Uzbek message from an API/network error. */
export function getErrorMessage(error: unknown, fallback = 'Xatolik yuz berdi'): string {
  if (isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
    if (error.code === 'ECONNABORTED') return 'Server javob bermadi (timeout)';
    if (!error.response) return "Internet aloqasi yo'q yoki server o'chiq";
  }
  return fallback;
}
