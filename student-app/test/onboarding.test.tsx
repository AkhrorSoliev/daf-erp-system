import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { api } from '@/api/client';
import type { OnboardingStatus } from '@/api/types';
import { maskBirthDate, parseBirthDate } from '@/lib/birth-date';
import { renderSignedIn, serveApi } from './app';

const PHONE = '901234567';
const status = (missing: OnboardingStatus['missing']): OnboardingStatus => ({
  missing,
  phone: PHONE,
  phoneVerified: !missing.includes('PHONE'),
});

// ADR-0039: the app opens only after the phone is proved by SMS and gender and
// birth date are given.
describe('first-run steps', () => {
  it('opens the app when nothing is missing', async () => {
    serveApi();
    await renderSignedIn('/');
    expect(await screen.findByText('Aziza Karimova')).toBeTruthy();
    expect(screen.queryByText("Profilingizni to'ldiring")).toBeNull();
  });

  it('stands in for every screen, deep links included, until the steps are done', async () => {
    serveApi({ '/student-portal/onboarding': status(['PHONE', 'GENDER', 'BIRTH_DATE']) });
    await renderSignedIn('/payments');

    expect(await screen.findByText("Profilingizni to'ldiring")).toBeTruthy();
    expect(screen).toHavePathname('/onboarding');
    expect(screen.getByText('1-qadam / 2')).toBeTruthy();
    // The code goes to the number on the card, shown so the student knows.
    expect(screen.getByText('+998 90 123 45 67 raqamiga 4 xonali kod yuboramiz.')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('proves the phone, then takes gender and birth date, then opens the app', async () => {
    serveApi({ '/student-portal/onboarding': status(['PHONE', 'GENDER', 'BIRTH_DATE']) });
    (api.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url === '/student-portal/onboarding/phone/send-code') {
        return { data: { phone: PHONE, expiresInSec: 300, resendInSec: 60 } };
      }
      if (url === '/student-portal/onboarding/phone/verify') {
        return { data: status(['GENDER', 'BIRTH_DATE']) };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    (api.patch as jest.Mock).mockResolvedValue({ data: status([]) });
    await renderSignedIn('/');

    fireEvent.press(await screen.findByText('Kod yuborish'));
    fireEvent.changeText(await screen.findByPlaceholderText('••••'), '4821');
    await act(async () => {
      fireEvent.press(screen.getByText('Tasdiqlash'));
    });
    expect(api.post).toHaveBeenCalledWith('/student-portal/onboarding/phone/verify', { code: '4821' });

    // Step two of two: the total stays what it was when the screen opened.
    expect(await screen.findByText('2-qadam / 2')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Ayol' }));
    fireEvent.changeText(screen.getByPlaceholderText('KK.OO.YYYY'), '15032004');
    expect(screen.getByDisplayValue('15.03.2004')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Saqlash'));
    });

    expect(api.patch).toHaveBeenCalledWith('/student-portal/onboarding/profile', {
      gender: 'FEMALE',
      dateOfBirth: '2004-03-15',
    });
    expect(await screen.findByText('Aziza Karimova')).toBeTruthy();
    expect(screen.queryByText("Profilingizni to'ldiring")).toBeNull();
  });

  it('asks only for what the card lacks', async () => {
    serveApi({ '/student-portal/onboarding': status(['BIRTH_DATE']) });
    await renderSignedIn('/');

    expect(await screen.findByText('Bir qadam qoldi')).toBeTruthy();
    expect(screen.getByText("Tug'ilgan sanangiz")).toBeTruthy();
    expect(screen.queryByText('Jinsingiz')).toBeNull();
    expect(screen.queryByText('Telefon raqamingizni tasdiqlang')).toBeNull();
  });

  it('shows the server’s reason when the code is wrong', async () => {
    serveApi({ '/student-portal/onboarding': status(['PHONE']) });
    (api.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.endsWith('/send-code')) return { data: { resendInSec: 60 } };
      throw Object.assign(new Error('400'), {
        isAxiosError: true,
        response: { status: 400, data: { message: "Kod noto'g'ri. Qolgan urinishlar: 2" } },
      });
    });
    await renderSignedIn('/');

    fireEvent.press(await screen.findByText('Kod yuborish'));
    fireEvent.changeText(await screen.findByPlaceholderText('••••'), '1111');
    await act(async () => {
      fireEvent.press(screen.getByText('Tasdiqlash'));
    });

    expect(await screen.findByText("Kod noto'g'ri. Qolgan urinishlar: 2")).toBeTruthy();
    expect(screen).toHavePathname('/onboarding');
  });

  // A data requirement, not a security boundary: one failed request must not
  // lock the student out of the whole app.
  it('fails open when the status request fails', async () => {
    serveApi({ '/student-portal/onboarding': new Error('Network Error') });
    await renderSignedIn('/');
    await waitFor(() => expect(screen.getByText('Aziza Karimova')).toBeTruthy());
  });

  it('lets a student who cannot finish sign out', async () => {
    serveApi({ '/student-portal/onboarding': status(['PHONE']) });
    await renderSignedIn('/');

    await act(async () => {
      fireEvent.press(await screen.findByText('Chiqish'));
    });
    expect(await screen.findByText('Telegram orqali kirish')).toBeTruthy();
  });
});

describe('birth date entry', () => {
  it('masks digits into DD.MM.YYYY as they are typed', () => {
    expect(maskBirthDate('1')).toBe('1');
    expect(maskBirthDate('150')).toBe('15.0');
    expect(maskBirthDate('15032004')).toBe('15.03.2004');
    expect(maskBirthDate('15.03.20049')).toBe('15.03.2004');
  });

  it('parses a plausible date and refuses the rest', () => {
    const TODAY = '2026-09-27';
    expect(parseBirthDate('15.03.2004', TODAY)).toEqual({ ok: true, iso: '2004-03-15', age: 22 });
    expect(parseBirthDate('15.03', TODAY)).toEqual({ ok: false, reason: 'format' });
    expect(parseBirthDate('30.02.2010', TODAY)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseBirthDate('01.10.2026', TODAY)).toEqual({ ok: false, reason: 'future' });
    expect(parseBirthDate('01.01.2023', TODAY)).toEqual({ ok: false, reason: 'age' });
  });
});
