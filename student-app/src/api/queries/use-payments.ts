import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { PaymentHistory } from '../types';

/** GET /api/student-portal/payments */
export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => (await api.get<PaymentHistory>('/student-portal/payments')).data,
  });
}
