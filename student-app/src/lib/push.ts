import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { api } from '@/api/client';

// Foreground behaviour: show a banner + play a sound when a push arrives.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Request notification permission, get the Expo push token, and register it
 * with the backend (POST /notifications/devices). Best-effort — never throws.
 * Only works in a dev/standalone build (not Expo Go on Android SDK 53+).
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      // MAX importance + public lock-screen visibility → heads-up banner, sound,
      // wakes the screen, and shows on the lock screen. (New channel id because
      // Android freezes a channel's importance once created.)
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Bildirishnomalar',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.post('/notifications/devices', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version,
    });
  } catch {
    // push is optional — swallow errors so it never blocks the app
  }
}
