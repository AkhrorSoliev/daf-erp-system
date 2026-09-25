import path from 'node:path';
import * as SecureStore from 'expo-secure-store';
import { act, renderRouter } from 'expo-router/testing-library';

import { api } from '@/api/client';
import * as fixtures from './fixtures';

/** A reply that never arrives: the request is still in flight. */
export const PENDING = Symbol('pending');

const ROUTES: Record<string, unknown> = {
  '/student-portal/profile': fixtures.profile,
  '/student-portal/attendance/stats': fixtures.attendanceStats,
  '/student-portal/attendance/history': fixtures.attendanceHistory,
  '/student-portal/schedule': [fixtures.lessonToday],
  '/student-portal/payments': fixtures.payments,
};

/**
 * Answers the app's GET requests by URL. An `Error` rejects the request,
 * `PENDING` leaves it unanswered, anything else is the response body.
 */
export function serveApi(overrides: Record<string, unknown> = {}) {
  const routes = { ...ROUTES, ...overrides };
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (!(url in routes)) return Promise.reject(new Error(`No fixture for GET ${url}`));
    const reply = routes[url];
    if (reply === PENDING) return new Promise(() => {});
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ data: reply });
  });
}

/** Renders the real app (src/app) for a student who is already signed in. */
export async function renderSignedIn(initialUrl = '/') {
  await SecureStore.setItemAsync('daf.accessToken', 'test-access-token');
  const result = renderRouter(path.resolve(__dirname, '../src/app'), { initialUrl });
  // The root layout reads the session, theme and language from storage before
  // it shows anything; let those reads settle inside act.
  await act(async () => {});
  return result;
}
