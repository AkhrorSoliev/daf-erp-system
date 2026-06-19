/**
 * Crash/error reporting abstraction.
 * Sentry (@sentry/react-native) does not yet officially support Expo SDK 56
 * (getsentry/sentry-react-native#6212). Wire it here once supported — call sites
 * stay unchanged. For now: dev console only.
 */
export const observability = {
  captureError(error: unknown, context?: Record<string, unknown>) {
    if (__DEV__) console.error('[observability]', error, context ?? '');
    // TODO(phase-4): Sentry.captureException(error, { extra: context });
  },
  setUser(_user: { id: number } | null) {
    // TODO(phase-4): Sentry.setUser(_user);
  },
};
