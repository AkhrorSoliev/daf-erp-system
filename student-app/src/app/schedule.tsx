import { RefreshControl, ScrollView, View } from 'react-native';

import { Badge, Card, EmptyState, LoadingCards, Screen, StackHeader, Text } from '@/design/components';
import { useColors } from '@/design/colors';
import { useSchedule } from '@/api/queries/use-schedule';
import { useT } from '@/i18n';

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
  const t = useT();
  const q = useSchedule();
  const colors = useColors();

  if (q.isLoading) return <Screen><LoadingCards /></Screen>;
  if (q.isError) {
    return (
      <Screen>
        <StackHeader title={t.tabs.schedule} />
        <EmptyState icon="cloud-offline-outline" title={t.common.error} />
      </Screen>
    );
  }

  const items = q.data ?? [];
  const todayKey = DAY_BY_INDEX[new Date().getDay()];

  return (
    <Screen>
      <StackHeader title={t.tabs.schedule} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.fgMuted} />}
      >
        <View className="gap-5 p-5 pt-2">
          {items.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Jadval bo'sh" description={t.common.comingSoon} />
          ) : (
            WEEKDAYS.map((day) => {
              const lessons = items
                .filter((s) => s.exactDays.map((d) => d.toLowerCase()).includes(day.key))
                .sort((a, b) => (a.lessonStartTime ?? '').localeCompare(b.lessonStartTime ?? ''));
              const isToday = day.key === todayKey;

              return (
                <View key={day.key} className="gap-2.5">
                  <View className="flex-row items-center gap-2 px-1">
                    <Text variant="title" className={isToday ? 'text-coral-500' : undefined}>
                      {day.label}
                    </Text>
                    {isToday ? <Badge label="Bugun" tone="coral" /> : null}
                  </View>

                  {lessons.length === 0 ? (
                    <Text variant="muted" className="px-1">Dars yo&apos;q</Text>
                  ) : (
                    lessons.map((s) => (
                      <Card key={`${day.key}-${s.groupId}`} className="flex-row gap-3.5">
                        <View className="w-[58px] items-center rounded-md bg-coral-50 py-2 dark:bg-coral-500/15">
                          <Text variant="num" className="text-[17px] text-coral-600 dark:text-coral-400">{s.lessonStartTime ?? '—'}</Text>
                          {s.lessonEndTime ? <Text variant="muted" className="text-[12px] text-coral-600/70 dark:text-coral-400/70">{s.lessonEndTime}</Text> : null}
                        </View>
                        <View className="flex-1 justify-center gap-0.5">
                          <Text variant="h3">{s.groupName}</Text>
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
