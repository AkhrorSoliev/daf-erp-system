import { ScrollView, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/design/components';
import { useAuth } from '@/auth/auth-store';
import { formatSom } from '@/lib/format';
import { t } from '@/i18n/uz';

export default function Home() {
  const user = useAuth((s) => s.user);

  return (
    <Screen edges={['top']}>
      <ScrollView>
        <View className="gap-4 p-4">
          <View className="gap-1">
            <Text variant="muted">{t.home.greeting}</Text>
            <Text variant="heading">{user ? `${user.firstName} ${user.lastName}`.trim() : 'Talaba'}</Text>
          </View>

          <Card>
            <Text variant="muted">{t.home.balance}</Text>
            <Text variant="heading" className="mt-1">
              {formatSom(user?.balance ?? 0)}
            </Text>
          </Card>

          {/* Phase 0: primitive showcase to confirm NativeWind + tokens render. */}
          <Card className="gap-3">
            <Text variant="title">Dizayn primitive&apos;lari</Text>
            <Button label="Primary" />
            <Button label="Secondary" variant="secondary" />
            <Button label="Ghost" variant="ghost" />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
