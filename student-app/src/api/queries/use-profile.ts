import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { Profile } from '../types';

export const profileKey = ['profile'] as const;

/** GET /api/student-portal/profile */
export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async () => (await api.get<Profile>('/student-portal/profile')).data,
  });
}
