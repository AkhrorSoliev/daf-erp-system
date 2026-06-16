import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Card, Loading, Screen, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { useAuth } from '@/auth/auth-store';
import { formatPhone } from '@/lib/format';
import { t } from '@/i18n/uz';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between border-border py-2.5">
      <Text variant="muted">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

export default function Profile() {
  const q = useProfile();
  const signOut = useAuth((s) => s.signOut);
  const queryClient = useQueryClient();

  if (q.isLoading) return <Screen edges={['top']}><Loading /></Screen>;
  const p = q.data;

  return (
    <Screen edges={['top']}>
      <ScrollView className="flex-1">
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.profile}</Text>
          {p ? (
            <Card>
              <Text variant="title">{`${p.firstName} ${p.lastName}`.trim()}</Text>
              <View className="mt-2">
                <Row label="Telefon" value={formatPhone(p.phone)} />
                <Row label="Login" value={p.login} />
                <Row label="Telegram" value={p.telegram} />
                <Row label="Filial" value={p.branches.map((b) => b.name).join(', ') || null} />
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <View className="p-4">
        <Button
          label="Chiqish"
          variant="danger"
          onPress={async () => {
            await signOut();
            queryClient.clear();
          }}
        />
      </View>
    </Screen>
  );
}
