/**
 * Runtime config. EXPO_PUBLIC_* vars are inlined at build time.
 * See .env / .env.example.
 */
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  /** Deep-link scheme (matches app.json "scheme"); used for payment return URLs. */
  scheme: 'dafstudent',
  /** Telegram bot username for OTP login (without @). */
  botUsername: process.env.EXPO_PUBLIC_TELEGRAM_BOT ?? 'dafzentrum_bot',
} as const;
