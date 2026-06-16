import { api } from './client';

export type PaymentMethod = 'PAYME' | 'CLICK';

/** POST /api/student-portal/payments/init — returns the provider checkout URL. */
export async function initPayment(method: PaymentMethod, amount: number): Promise<string> {
  const { data } = await api.post('/student-portal/payments/init', { method, amount });
  return data.checkoutUrl as string;
}

export const QUICK_AMOUNTS = [100000, 200000, 300000, 500000, 700000];
export const MIN_PAYMENT = 1000;
