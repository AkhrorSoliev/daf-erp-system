/**
 * Runtime config. EXPO_PUBLIC_* vars are inlined at build time.
 * See .env / .env.example.
 */
// In dev fall back to localhost; in a release build the URL MUST come from the
// EAS env (eas.json) — fail loud rather than silently shipping a localhost build.
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://localhost:4000/api' : undefined);

if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is required in production builds (set it in eas.json env).');
}

export const env = {
  apiUrl,
  /** Deep-link scheme (matches app.json "scheme"); used for payment return URLs. */
  scheme: 'dafstudent',
  /** Telegram bot username for OTP login (without @). */
  botUsername: process.env.EXPO_PUBLIC_TELEGRAM_BOT ?? 'dafzentrum_bot',
} as const;
