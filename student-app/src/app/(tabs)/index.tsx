import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  FadeIn,
  HubCard,
  ListRow,
  LoadingCards,
  ProgressBar,
  Screen,
  SkillBars,
  Text,
  type Skill,
} from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useProfile } from '@/api/queries/use-profile';
import { useAttendanceStats } from '@/api/queries/use-attendance';
import { useSchedule } from '@/api/queries/use-schedule';
import { formatSom } from '@/lib/format';
import { dayLabel } from '@/lib/labels';
import { useT } from '@/i18n';
import { ME_XP, OTHERS, inits } from '@/data/leaderboard';

const DAY_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SEG = { present: tokens.color.success, late: tokens.color.warning, absent: tokens.color.danger, excused: '#9DB0BC' };

// German language-skill gauges. Values are DUMMY until the skills backend lands.
const SKILLS: Skill[] = [
  { label: 'Wortschatz', progress: 72, color: tokens.color.coral },
  { label: 'Schreiben', progress: 45, color: tokens.color.amber },
  { label: 'Lesen', progress: 60, color: tokens.color.teal },
  { label: 'Hören', progress: 38, color: tokens.color.grape },
  { label: 'Grammatik', progress: 55, color: tokens.color.sky },
];

// DUMMY hub-card stats (placeholder until each feature's backend lands).
const DUMMY = {
  notifications: 2,
  jang: { janglar: 12, yutuqlar: 8, maglubiyat: 4 },
  lugat: 148,
};

function percentClass(p: number): string {
  if (p >= 75) return 'text-success';
  if (p >= 50) return 'text-amber-600';
  return 'text-danger';
}

/** Small white clay circle icon button for the header (chat / notifications).
 *  With an unread `badge` it rings (wiggle) and the badge gently pulses. */
function HeaderIconButton({
  icon,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
  onPress?: () => void;
}) {
  const colors = useColors();
  const ring = !!badge;
  return (
    <Pressable
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-pill border border-border bg-surface active:opacity-70"
      style={{ boxShadow: shadow.sm }}
    >
      <MotiView
        style={{ transformOrigin: '50% 0%' }}
        animate={ring ? { rotate: ['0deg', '0deg', '0deg', '0deg', '16deg', '-13deg', '10deg', '-7deg', '4deg', '-2deg', '0deg', '0deg'] } : { rotate: '0deg' }}
        transition={{ type: 'timing', duration: 150, loop: ring, repeatReverse: false }}
      >
        <Ionicons name={icon} size={22} color={colors.fg} />
      </MotiView>
      {badge ? (
        <MotiView
          from={{ scale: 0.85 }}
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ type: 'timing', duration: 1000, loop: true, repeatReverse: false }}
          style={{
            position: 'absolute',
            right: -4,
            top: -4,
            height: 20,
            minWidth: 20,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            backgroundColor: '#FF6B4A',
            paddingHorizontal: 4,
          }}
        >
          <Text className="font-bodyx text-[11px] text-white">{badge}</Text>
        </MotiView>
      ) : null}
    </Pressable>
  );
}

export default function Home() {
  const t = useT();
  const q = useProfile();
  const att = useAttendanceStats();
  const sched = useSchedule();
  const colors = useColors();
  const [animKey, setAnimKey] = useState(0);

  if (q.isLoading) return <Screen><LoadingCards /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen className="justify-center">
        <EmptyState icon="cloud-offline-outline" title={t.common.error} description={t.common.loadFailed} />
      </Screen>
    );
  }

  const p = q.data;
  const inDebt = p.balance < 0;
  const name = `${p.firstName} ${p.lastName}`.trim();
  const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase();
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
              setAnimKey((k) => k + 1);
              q.refetch();
              att.refetch();
              sched.refetch();
            }}
          />
        }
      >
        <View key={animKey} className="gap-4 p-5 pb-32">
          {/* Header: avatar + greeting + chat / notifications */}
          <FadeIn index={0}>
            <View className="flex-row items-center justify-between">
              <Pressable onPress={() => router.push('/profile')} className="flex-1 flex-row items-center gap-3 active:opacity-80">
                <Avatar uri={p.photo} initials={initials} size={46} />
                <View className="flex-1">
                  <Text variant="muted">{t.home.greeting}</Text>
                  <Text variant="title" numberOfLines={1}>{p.firstName || name}!</Text>
                </View>
              </Pressable>
              <View className="flex-row gap-2.5">
                {/* TODO: wire to chat + notifications screens when built */}
                <HeaderIconButton icon="chatbubble-ellipses-outline" onPress={() => {}} />
                <HeaderIconButton icon="notifications-outline" badge={DUMMY.notifications} onPress={() => {}} />
              </View>
            </View>
          </FadeIn>

          {/* Language skills */}
          <FadeIn index={1}>
            <Card className="gap-4">
              <View className="flex-row items-center justify-between">
                <Text variant="title">{t.home.skillsTitle}</Text>
                <Text variant="muted">{t.home.skillsLang}</Text>
              </View>
              <SkillBars skills={SKILLS} />
            </Card>
          </FadeIn>

          {/* Gamified hub cards */}
          <FadeIn index={2}>
            <HubCard title={t.home.battleTitle} icon="flash" tone="grape" onPress={() => router.push('/battle')}>
              <View className="flex-row gap-2">
                {[
                  { label: t.home.battleGames, value: DUMMY.jang.janglar },
                  { label: t.home.battleWins, value: DUMMY.jang.yutuqlar },
                  { label: t.home.battleLosses, value: DUMMY.jang.maglubiyat },
                ].map((c) => (
                  <View key={c.label} className="flex-1 rounded-lg bg-white/15 px-3 py-2">
                    <Text className="font-body text-[12px] text-white/80">{c.label}</Text>
                    <Text variant="num" className="text-[20px] text-white">{c.value}</Text>
                  </View>
                ))}
              </View>
            </HubCard>
          </FadeIn>

          <FadeIn index={3}>
            <HubCard title={t.home.vocabTitle} icon="albums" tone="sky" onPress={() => router.push('/vocabulary')}>
              <View className="self-start rounded-pill bg-white/20 px-3.5 py-1.5">
                <Text className="font-bodymd text-[13px] text-white">{t.home.vocabWords(DUMMY.lugat)}</Text>
              </View>
            </HubCard>
          </FadeIn>

          <FadeIn index={4}>
            <HubCard title={t.home.zoomTitle} subtitle={t.home.zoomSubtitle} icon="videocam" tone="teal">
              <View className="self-start flex-row items-center gap-1.5 rounded-pill bg-white/20 px-3.5 py-1.5">
                <Ionicons name="time-outline" size={14} color="#FFFFFF" />
                <Text className="font-bodymd text-[13px] text-white">{t.home.zoomEvent}</Text>
              </View>
            </HubCard>
          </FadeIn>

          <FadeIn index={5}>
            <HubCard title={t.home.leaderboardTitle} subtitle={t.home.leaderboardSubtitle} icon="trophy" tone="amber" onPress={() => router.push('/leaderboard')}>
              <View className="gap-3">
                {/* top leaders */}
                <View className="flex-row gap-4">
                  {OTHERS.slice(0, 3).map((pl) => (
                    <View key={pl.name} className="items-center gap-1">
                      <Avatar uri={pl.avatar} initials={inits(pl.name)} size={42} />
                      <View className="flex-row items-center gap-0.5 rounded-pill bg-white/90 px-2 py-0.5">
                        <Ionicons name="flash" size={11} color={tokens.color.amber} />
                        <Text className="font-bodyx text-[10px] text-ink-900">{pl.xp}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                {/* my row */}
                <View className="flex-row items-center gap-2.5 rounded-pill bg-white/20 p-1.5">
                  <View className="h-6 w-6 items-center justify-center rounded-pill bg-white/30">
                    <Text variant="num" className="text-[13px] text-white">2</Text>
                  </View>
                  <Avatar uri={p.photo} initials={initials} size={30} />
                  <Text className="flex-1 font-bodymd text-[15px] text-white" numberOfLines={1}>{p.firstName || name}</Text>
                  <View className="flex-row items-center gap-1 rounded-pill bg-white px-2.5 py-1">
                    <Ionicons name="flash" size={14} color={tokens.color.amber} />
                    <Text variant="num" className="text-[14px]">{ME_XP}</Text>
                  </View>
                </View>
              </View>
            </HubCard>
          </FadeIn>

          {/* Today's lessons → full schedule */}
          <FadeIn index={6}>
            <View className="gap-2.5">
              <View className="flex-row items-center justify-between px-1">
                <Text variant="title">{t.home.todayLessons}</Text>
                <Pressable onPress={() => router.push('/schedule')} className="flex-row items-center gap-0.5 active:opacity-70">
                  <Text variant="muted" className="text-coral-600 dark:text-coral-400">{t.home.fullSchedule}</Text>
                  <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
                </Pressable>
              </View>
              {todayLessons.length === 0 ? (
                <Text variant="muted" className="px-1">{t.home.noLessonsToday}</Text>
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
          </FadeIn>

          {/* Attendance summary → full screen */}
          {s ? (
            <FadeIn index={7}>
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
            </FadeIn>
          ) : null}

          {/* Groups */}
          <FadeIn index={8}>
            <View className="gap-2.5">
              <Text variant="title">{t.home.myGroups}</Text>
              {p.groups.length === 0 ? (
                <Text variant="muted" className="px-1">{t.home.noActiveGroups}</Text>
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
          </FadeIn>

          {/* Compact balance → payments */}
          <FadeIn index={9}>
            <Pressable onPress={() => router.push('/payments')} className="active:opacity-90">
              <View className="flex-row items-center justify-between overflow-hidden rounded-xl bg-coral-500 p-4" style={{ boxShadow: clay.coral }}>
                <View>
                  <Text className="font-bodyx text-[11px] uppercase tracking-[1px] text-white/80">{t.home.balance}</Text>
                  <Text variant="num" className="mt-0.5 text-[26px] leading-[30px] text-white">{formatSom(p.balance)}</Text>
                </View>
                <View className="rounded-pill bg-white/20 px-3 py-1.5">
                  <Text className="font-bodymd text-[12px] text-white">{inDebt ? t.home.inDebt : t.home.current}</Text>
                </View>
              </View>
            </Pressable>
          </FadeIn>

          {/* QR check-in */}
          <FadeIn index={10}>
            <Button label={t.home.qrCheckIn} variant="teal" iconBefore="qr-code" onPress={() => router.push('/scan')} />
          </FadeIn>
        </View>
      </ScrollView>
    </Screen>
  );
}
