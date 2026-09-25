import { Alert, type AlertButton } from 'react-native';
import { router } from 'expo-router';
import { act, screen, waitFor } from 'expo-router/testing-library';

import { api } from '@/api/client';
import { renderSignedIn, serveApi } from './app';
import { camera } from './mocks/expo-camera';

// The camera is hardware. The mock hands the screen's scan handler to the
// test, which then "shows" the camera a QR code.
jest.mock('expo-camera', () => require('./mocks/expo-camera'));

describe('QR check-in', () => {
  // The moment a student learns the balance is short is the moment they are
  // most ready to pay; the alert used to offer nothing but "OK".
  it('offers a top-up when the balance does not cover the lesson', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (api.post as jest.Mock).mockResolvedValue({
      data: { balanceInsufficient: true, message: 'Dars uchun balansingiz yetmadi' },
    });
    serveApi();
    await renderSignedIn('/');
    await screen.findByText('Aziza Karimova');

    act(() => router.push('/scan'));
    await waitFor(() => expect(camera.onScan).toBeDefined());
    await act(async () => {
      camera.onScan!({ data: JSON.stringify({ t: 'qr-token' }) });
    });

    expect(api.post).toHaveBeenCalledWith('/student-portal/attendance/scan', { token: 'qr-token' });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const [title, message, buttons] = alert.mock.calls[0];
    expect([title, message]).toEqual(['Balans yetarli emas', 'Dars uchun balansingiz yetmadi']);

    const topUp = (buttons as AlertButton[] | undefined)?.find((b) => b.text === "To'ldirish");
    expect(topUp).toBeDefined();
    act(() => topUp!.onPress!());
    expect(screen).toHavePathname('/payments');
  });
});
