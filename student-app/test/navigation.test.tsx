import { DeviceEventEmitter } from 'react-native';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { renderSignedIn, serveApi } from './app';

// The bar's own container carries role="tablist" but, like React Navigation's
// tab bar, is not an accessibility element (that would hide the tabs from
// VoiceOver), so the tabs are queried directly.
function tabs() {
  return screen.getAllByRole('tab');
}

describe('tab bar', () => {
  // Two of the four tabs used to be "Tez orada" placeholders copied from a
  // design kit, while Jadval and To'lovlar sat a level down.
  it('puts the working sections on the tab bar', async () => {
    serveApi();
    await renderSignedIn('/');
    await screen.findAllByRole('tab');
    expect(tabs().map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Asosiy',
      'Jadval',
      "To'lovlar",
      "Ko'proq",
    ]);
  });

  // To'lovlar is a tab with an amount field. On Android the window shrinks for
  // the keyboard, so a floating bar would ride up and cover the Payme / Click
  // buttons while the student types.
  it('steps aside while the keyboard is open', async () => {
    serveApi();
    await renderSignedIn('/payments');
    await screen.findAllByRole('tab');

    // The native keyboard events, as both platforms name them.
    act(() => {
      DeviceEventEmitter.emit('keyboardWillShow', {});
      DeviceEventEmitter.emit('keyboardDidShow', {});
    });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    act(() => {
      DeviceEventEmitter.emit('keyboardWillHide', {});
      DeviceEventEmitter.emit('keyboardDidHide', {});
    });
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('marks the tab of the open screen as selected', async () => {
    serveApi();
    await renderSignedIn('/schedule');
    await screen.findAllByRole('tab');
    const selected = tabs().filter((tab) => tab.props.accessibilityState?.selected);
    expect(selected.map((tab) => tab.props.accessibilityLabel)).toEqual(['Jadval']);
  });
});

describe('back buttons', () => {
  it.each(['/schedule', '/payments'])('%s is a tab, so it has no back button', async (url) => {
    serveApi();
    await renderSignedIn(url);
    await screen.findAllByRole('tab');
    expect(screen.queryByRole('button', { name: 'Orqaga' })).toBeNull();
  });

  it.each(['/attendance', '/profile', '/settings', '/faq', '/about'])(
    '%s is opened from a tab, so it has a back button',
    async (url) => {
      serveApi();
      await renderSignedIn(url);
      expect(await screen.findByRole('button', { name: 'Orqaga' })).toBeTruthy();
    },
  );
});

describe("Ko'proq", () => {
  it('lists Davomat, which no tab reaches, and not To\'lovlar, which is a tab', async () => {
    serveApi();
    await renderSignedIn('/more');
    const attendance = await screen.findByRole('button', { name: 'Davomat' });
    expect(screen.queryByRole('button', { name: "To'lovlar" })).toBeNull();

    fireEvent.press(attendance);
    expect(screen).toHavePathname('/attendance');
  });
});
