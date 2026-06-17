import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, EmptyState, LoadingCards, Screen, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { formatSom } from '@/lib/format';
import { dayLabel } from '@/lib/labels';
import { t } from '@/i18n/uz';

export default function Home() {
  const q = useProfile();

  if (q.isLoading) return <Screen edges={['top']}><LoadingCards /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen edges={['top']} className="justify-center">
        <EmptyState title={t.common.error} description="Ma'lumotni yuklab bo'lmadi" />
      </Screen>
    );
  }

  const p = q.data;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      >
        <View className="gap-4 p-4">
          <View className="gap-1">
            <Text variant="muted">{t.home.greeting}</Text>
            <Text variant="heading">{`${p.firstName} ${p.lastName}`.trim()}</Text>
          </View>

          <Card>
            <Text variant="muted">{t.home.balance}</Text>
            <Text variant="heading" className={p.balance < 0 ? 'mt-1 text-danger' : 'mt-1 text-success'}>
              {formatSom(p.balance)}
            </Text>
            {p.balance < 0 ? <Text variant="muted" className="mt-1">Qarzdorlik mavjud</Text> : null}
          </Card>

          <Button label="QR bilan davomatga belgilash" onPress={() => router.push('/scan')} />

          <View className="gap-2">
            <Text variant="title">Guruhlarim</Text>
            {p.groups.length === 0 ? (
              <Text variant="muted">Faol guruh yo&apos;q</Text>
            ) : (
              p.groups.map((g) => (
                <Card key={g.id} className="gap-1">
                  <Text variant="label">{g.name}</Text>
                  {g.course_name ? <Text variant="muted">{g.course_name}</Text> : null}
                  <Text variant="muted">
                    {g.exactDays.map(dayLabel).join(', ')}
                    {g.lessonStartTime ? ` · ${g.lessonStartTime}–${g.lessonEndTime ?? ''}` : ''}
                  </Text>
                  {g.teachers.length ? (
                    <Text variant="muted">
                      O&apos;qituvchi: {g.teachers.map((tt) => `${tt.firstName} ${tt.lastName}`).join(', ')}
                    </Text>
                  ) : null}
                </Card>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
