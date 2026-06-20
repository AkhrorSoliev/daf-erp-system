import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, EmptyState, ListRow, LoadingCards, ProgressBar, Screen, ScreenHeader, Text } from '@/design/components';
import { clay } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useProfile } from '@/api/queries/use-profile';
import { useAttendanceStats } from '@/api/queries/use-attendance';
import { useSchedule } from '@/api/queries/use-schedule';
import { formatSom } from '@/lib/format';
import { dayLabel } from '@/lib/labels';
import { t } from '@/i18n/uz';

const DAY_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SEG = { present: tokens.color.success, late: tokens.color.warning, absent: tokens.color.danger, excused: '#9DB0BC' };

function percentClass(p: number): string {
  if (p >= 75) return 'text-success';
  if (p >= 50) return 'text-amber-600';
  return 'text-danger';
}

export default function Home() {
  const q = useProfile();
  const att = useAttendanceStats();
  const sched = useSchedule();
  const colors = useColors();

  if (q.isLoading) return <Screen><LoadingCards /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen className="justify-center">
        <EmptyState icon="cloud-offline-outline" title={t.common.error} description="Ma'lumotni yuklab bo'lmadi" />
      </Screen>
    );
  }

  const p = q.data;
  const inDebt = p.balance < 0;
  const s = att.data;
  const todayKey = DAY_BY_INDEX[new Date().getDay()];
  const todayLessons = (sched.data ?? [])
    .filter((x) => x.exactDays.map((d) => d.toLowerCase()).includes(todayKey))
    .sort((a, b) => (a.lessonStartTime ?? '').localeCompare(b.lessonStartTime ?? ''));

  const refreshing = q.isRefetching || att.isRefetching || sched.isRefetching;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={tokens.color.primary}
            onRefresh={() => {
              q.refetch();
              att.refetch();
              sched.refetch();
            }}
          />
        }
      >
        <View className="gap-4 p-5 pb-32">
          <ScreenHeader subtitle={t.home.greeting} title={`${p.firstName} ${p.lastName}`.trim()} />

          {/* Balance hero */}
          <View className="overflow-hidden rounded-2xl bg-coral-500 p-5" style={{ boxShadow: clay.coral }}>
            <Text className="font-bodyx text-[11px] uppercase tracking-[1px] text-white/80">{t.home.balance}</Text>
            <Text variant="num" className="mt-1 text-[34px] leading-[40px] text-white">{formatSom(p.balance)}</Text>
            <View className="mt-3 self-start rounded-pill bg-white/20 px-3 py-1">
              <Text className="font-bodymd text-[12px] text-white">{inDebt ? 'Qarzdorlik mavjud' : 'Joriy balans'}</Text>
            </View>
          </View>

          <Button label="QR bilan davomatga belgilash" variant="teal" iconBefore="qr-code" onPress={() => router.push('/scan')} />

          {/* Attendance summary → full screen */}
          {s ? (
            <Pressable onPress={() => router.push('/attendance')}>
              <Card className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text variant="title">{t.tabs.attendance}</Text>
                  <View className="flex-row items-center gap-1">
                    <Text variant="num" className={`text-[22px] ${percentClass(s.percentage)}`}>{s.percentage}%</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.fgFaint} />
                  </View>
                </View>
                {s.total > 0 ? (
                  <ProgressBar
                    segments={[
                      { value: s.present, color: SEG.present },
                      { value: s.late, color: SEG.late },
                      { value: s.absent, color: SEG.absent },
                      { value: s.excused, color: SEG.excused },
                    ]}
                  />
                ) : null}
              </Card>
            </Pressable>
          ) : null}

          {/* Today's lessons → full schedule */}
          <View className="gap-2.5">
            <View className="flex-row items-center justify-between px-1">
              <Text variant="title">Bugungi darslar</Text>
              <Pressable onPress={() => router.push('/schedule')} className="flex-row items-center gap-0.5 active:opacity-70">
                <Text variant="muted" className="text-coral-600 dark:text-coral-400">Butun jadval</Text>
                <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
              </Pressable>
            </View>
            {todayLessons.length === 0 ? (
              <Text variant="muted" className="px-1">Bugun dars yo&apos;q</Text>
            ) : (
              todayLessons.map((l) => (
                <Card key={l.groupId} className="flex-row gap-3.5">
                  <View className="w-[58px] items-center rounded-md bg-coral-50 py-2 dark:bg-coral-500/15">
                    <Text variant="num" className="text-[17px] text-coral-600 dark:text-coral-400">{l.lessonStartTime ?? '—'}</Text>
                    {l.lessonEndTime ? <Text variant="muted" className="text-[12px] text-coral-600/70 dark:text-coral-400/70">{l.lessonEndTime}</Text> : null}
                  </View>
                  <View className="flex-1 justify-center gap-0.5">
                    <Text variant="h3">{l.groupName}</Text>
                    {l.courseName ? <Text variant="muted">{l.courseName}</Text> : null}
                  </View>
                </Card>
              ))
            )}
          </View>

          {/* Groups */}
          <View className="gap-2.5">
            <Text variant="title">Guruhlarim</Text>
            {p.groups.length === 0 ? (
              <Text variant="muted" className="px-1">Faol guruh yo&apos;q</Text>
            ) : (
              p.groups.map((g) => (
                <ListRow
                  key={g.id}
                  icon="people"
                  tone="grape"
                  label={g.name}
                  subtitle={[
                    g.course_name,
                    g.exactDays.map(dayLabel).join(', ') + (g.lessonStartTime ? ` · ${g.lessonStartTime}` : ''),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                  chevron={false}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
