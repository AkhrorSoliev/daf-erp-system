import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { AttendanceGroup, AttendanceStats } from '../types';

/** GET /api/student-portal/attendance/stats */
export function useAttendanceStats() {
  return useQuery({
    queryKey: ['attendance', 'stats'],
    queryFn: async () => (await api.get<AttendanceStats>('/student-portal/attendance/stats')).data,
  });
}

/** GET /api/student-portal/attendance/history */
export function useAttendanceHistory() {
  return useQuery({
    queryKey: ['attendance', 'history'],
    queryFn: async () => (await api.get<AttendanceGroup[]>('/student-portal/attendance/history')).data,
  });
}
