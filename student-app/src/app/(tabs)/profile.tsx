import { View } from 'react-native';

import { Button, EmptyState, Screen } from '@/design/components';
import { useAuth } from '@/auth/auth-store';
import { t } from '@/i18n/uz';

export default function Profile() {
  const signOut = useAuth((s) => s.signOut);

  return (
    <Screen edges={['top']} className="justify-between">
      <View className="flex-1 justify-center">
        <EmptyState title={t.placeholders.profile} description={t.placeholders.comingSoon} />
      </View>
      <View className="p-4">
        <Button label="Chiqish" variant="danger" onPress={signOut} />
      </View>
    </Screen>
  );
}
