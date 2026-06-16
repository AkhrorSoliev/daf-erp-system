import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { ScheduleItem } from '../types';

/** GET /api/student-portal/schedule */
export function useSchedule() {
  return useQuery({
    queryKey: ['schedule'],
    queryFn: async () => (await api.get<ScheduleItem[]>('/student-portal/schedule')).data,
  });
}
