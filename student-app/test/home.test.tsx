import { fireEvent, screen } from 'expo-router/testing-library';

import { PENDING, renderSignedIn, serveApi } from './app';

const SCHEDULE = '/student-portal/schedule';
const PROFILE = '/student-portal/profile';

describe('Asosiy', () => {
  it('shows the balance with a way to top it up', async () => {
    serveApi();
    await renderSignedIn('/');
    fireEvent.press(await screen.findByRole('button', { name: "To'ldirish" }));
    expect(screen).toHavePathname('/payments');
  });

  it("lists today's lesson once the schedule has loaded", async () => {
    serveApi();
    await renderSignedIn('/');
    expect(await screen.findByText('A1.2 Kechki')).toBeTruthy();
  });

  it('says there is no lesson today only when the loaded schedule has none', async () => {
    serveApi({ [SCHEDULE]: [] });
    await renderSignedIn('/');
    expect(await screen.findByText("Bugun dars yo'q")).toBeTruthy();
  });

  // Until now a schedule still in flight read as "no lesson today": a student
  // could skip a class on the app's word.
  it('does not claim there is no lesson today while the schedule is loading', async () => {
    serveApi({ [SCHEDULE]: PENDING });
    await renderSignedIn('/');
    await screen.findByText('Aziza Karimova');
    expect(screen.queryByText("Bugun dars yo'q")).toBeNull();
  });

  it('says the schedule failed to load, and loads it again on retry', async () => {
    serveApi({ [SCHEDULE]: new Error('network') });
    await renderSignedIn('/');
    expect(await screen.findByText("Jadvalni yuklab bo'lmadi")).toBeTruthy();
    expect(screen.queryByText("Bugun dars yo'q")).toBeNull();

    serveApi();
    fireEvent.press(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(await screen.findByText('A1.2 Kechki')).toBeTruthy();
  });

  // Until now a failed profile left a dead end: no retry, no pull-to-refresh.
  it('recovers from a failed profile load on retry', async () => {
    serveApi({ [PROFILE]: new Error('network') });
    await renderSignedIn('/');
    const retry = await screen.findByRole('button', { name: 'Qayta urinish' });

    serveApi();
    fireEvent.press(retry);
    expect(await screen.findByText('Aziza Karimova')).toBeTruthy();
  });
});
