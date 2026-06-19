import { useEffect } from 'react';
import { Tabs } from 'expo-router';

import { LumioTabBar } from '@/design/components';
import { registerForPush } from '@/lib/push';

export default function TabsLayout() {
  // Register for push once the student is authenticated (tabs mounted).
  useEffect(() => {
    registerForPush();
  }, []);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <LumioTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="attendance" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
