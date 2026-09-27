import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { OnboardingStatus } from '../types';

export const onboardingKey = ['onboarding'] as const;

/** GET /api/student-portal/onboarding — what the student still owes before the app opens. */
export function useOnboarding(enabled: boolean) {
  return useQuery({
    queryKey: onboardingKey,
    queryFn: async () => (await api.get<OnboardingStatus>('/student-portal/onboarding')).data,
    enabled,
  });
}

export type OnboardingGate = 'loading' | 'required' | 'done';

/**
 * Whether the app opens. FAILS OPEN on a request with no answer (failed or
 * paused): the step is a data requirement, not a security boundary, and one
 * failed request must not lock the student out of the whole app. The query
 * keeps its data once it has some, so a later answer with a missing step
 * still closes the gate.
 */
export function onboardingGate(query: {
  data: OnboardingStatus | undefined;
  isError: boolean;
  isPaused: boolean;
}): OnboardingGate {
  if (query.data) return query.data.missing.length > 0 ? 'required' : 'done';
  if (query.isError || query.isPaused) return 'done';
  return 'loading';
}
