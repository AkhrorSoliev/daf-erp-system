import { RefreshControl, ScrollView, View } from 'react-native';

import { Card, EmptyState, Loading, Screen, Text } from '@/design/components';
import { useSchedule } from '@/api/queries/use-schedule';
import { dayLabel } from '@/lib/labels';
import { t } from '@/i18n/uz';

export default function Schedule() {
  const q = useSchedule();

  if (q.isLoading) return <Screen edges={['top']}><Loading /></Screen>;
  if (q.isError) {
    return (
      <Screen edges={['top']} className="justify-center">
        <EmptyState title={t.common.error} />
      </Screen>
    );
  }

  const items = q.data ?? [];

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      >
        <View className="gap-3 p-4">
          <Text variant="heading">{t.tabs.schedule}</Text>
          {items.length === 0 ? (
            <EmptyState title="Jadval bo'sh" description={t.placeholders.comingSoon} />
          ) : (
            items.map((s) => (
              <Card key={s.groupId} className="gap-1">
                <Text variant="label">{s.groupName}</Text>
                {s.courseName ? <Text variant="muted">{s.courseName}</Text> : null}
                <Text variant="body">{s.exactDays.map(dayLabel).join(', ')}</Text>
                {s.lessonStartTime ? (
                  <Text variant="muted">
                    {s.lessonStartTime} – {s.lessonEndTime ?? ''}
                    {s.room ? ` · ${s.room.name}` : ''}
                  </Text>
                ) : null}
                {s.teachers.length ? (
                  <Text variant="muted">{s.teachers.map((tt) => `${tt.firstName} ${tt.lastName}`).join(', ')}</Text>
                ) : null}
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
