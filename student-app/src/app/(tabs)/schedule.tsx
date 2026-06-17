import { RefreshControl, ScrollView, View } from 'react-native';

import { Card, EmptyState, LoadingCards, Screen, Text } from '@/design/components';
import { useSchedule } from '@/api/queries/use-schedule';
import { t } from '@/i18n/uz';

const WEEKDAYS = [
  { key: 'monday', label: 'Dushanba' },
  { key: 'tuesday', label: 'Seshanba' },
  { key: 'wednesday', label: 'Chorshanba' },
  { key: 'thursday', label: 'Payshanba' },
  { key: 'friday', label: 'Juma' },
  { key: 'saturday', label: 'Shanba' },
  { key: 'sunday', label: 'Yakshanba' },
] as const;

const DAY_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function Schedule() {
  const q = useSchedule();

  if (q.isLoading) return <Screen edges={['top']}><LoadingCards /></Screen>;
  if (q.isError) {
    return (
      <Screen edges={['top']} className="justify-center">
        <EmptyState title={t.common.error} />
      </Screen>
    );
  }

  const items = q.data ?? [];
  const todayKey = DAY_BY_INDEX[new Date().getDay()];

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      >
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.schedule}</Text>

          {items.length === 0 ? (
            <EmptyState title="Jadval bo'sh" description={t.placeholders.comingSoon} />
          ) : (
            WEEKDAYS.map((day) => {
              const lessons = items
                .filter((s) => s.exactDays.map((d) => d.toLowerCase()).includes(day.key))
                .sort((a, b) => (a.lessonStartTime ?? '').localeCompare(b.lessonStartTime ?? ''));
              const isToday = day.key === todayKey;

              return (
                <View key={day.key} className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <Text variant="title" className={isToday ? 'text-primary' : undefined}>
                      {day.label}
                    </Text>
                    {isToday ? <Text variant="muted">bugun</Text> : null}
                  </View>

                  {lessons.length === 0 ? (
                    <Text variant="muted">Dars yo&apos;q</Text>
                  ) : (
                    lessons.map((s) => (
                      <Card key={`${day.key}-${s.groupId}`} className="flex-row gap-3">
                        <View className="w-16">
                          <Text variant="label">{s.lessonStartTime ?? '—'}</Text>
                          {s.lessonEndTime ? <Text variant="muted">{s.lessonEndTime}</Text> : null}
                        </View>
                        <View className="flex-1 gap-0.5">
                          <Text variant="label">{s.groupName}</Text>
                          {s.courseName ? <Text variant="muted">{s.courseName}</Text> : null}
                          {s.room || s.teachers.length ? (
                            <Text variant="muted">
                              {[s.room?.name, s.teachers.map((tt) => `${tt.firstName} ${tt.lastName}`).join(', ')]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    ))
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
