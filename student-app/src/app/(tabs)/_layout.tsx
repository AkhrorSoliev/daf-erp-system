import { useEffect } from 'react';
import { Tabs } from 'expo-router';

import { LumioTabBar } from '@/design/components';
import { registerForPush } from '@/lib/push';

export default function TabsLayout() {
  // Register for push once the student is authenticated (tabs mounted).
  useEffect(() => {
    registerForPush();
  }, []);

  // Tabs are the sections a student actually uses. Attendance, profile and
  // settings live one tap deeper, under Ko'proq. Keep this list in step with
  // the tab bar's icon map (LumioTabBar) and `nav` in the i18n dictionaries.
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <LumioTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
