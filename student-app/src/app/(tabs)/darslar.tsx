import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge, Card, FadeIn, IconTile, Screen, ScreenHeader, StatChip, Text, type BadgeTone, type Tone } from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────────────────────
// DUMMY course data — Deutsch (A1). Replace with the lessons backend when it lands.
// ─────────────────────────────────────────────────────────────────────────────

type LessonStatus = 'done' | 'active' | 'locked';

type Lesson = {
  id: string;
  no: number;
  title: string; // German lesson title
  subtitle: string; // Uzbek description
  units: number; // sub-lessons
  minutes: number;
  status: LessonStatus;
  progress?: number; // 0–100, only for the active lesson
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
};

type LevelKey = 'A1' | 'A2' | 'B1' | 'B2';

const LEVELS: { key: LevelKey; name: string; unlocked: boolean }[] = [
  { key: 'A1', name: 'Grundstufe', unlocked: true },
  { key: 'A2', name: 'Grundstufe', unlocked: false },
  { key: 'B1', name: 'Mittelstufe', unlocked: false },
  { key: 'B2', name: 'Mittelstufe', unlocked: false },
];

const A1_LESSONS: Lesson[] = [
  { id: 'l1', no: 1, title: 'Begrüßung', subtitle: 'Tanishuv va salomlashish', units: 5, minutes: 20, status: 'done', icon: 'hand-left', tone: 'coral' },
  { id: 'l2', no: 2, title: 'Zahlen & Alphabet', subtitle: 'Raqamlar va alifbo', units: 6, minutes: 25, status: 'done', icon: 'text', tone: 'amber' },
  { id: 'l3', no: 3, title: 'Die Familie', subtitle: "Oila a'zolari", units: 5, minutes: 22, status: 'done', icon: 'people', tone: 'grape' },
  { id: 'l4', no: 4, title: 'Im Café', subtitle: 'Kafe va oziq-ovqat', units: 7, minutes: 28, status: 'done', icon: 'cafe', tone: 'teal' },
  { id: 'l5', no: 5, title: 'Mein Tag', subtitle: 'Kundalik ish-harakatlar', units: 6, minutes: 24, status: 'active', progress: 40, icon: 'sunny', tone: 'coral' },
  { id: 'l6', no: 6, title: 'Einkaufen', subtitle: 'Xarid qilish va narxlar', units: 6, minutes: 26, status: 'locked', icon: 'cart', tone: 'sky' },
  { id: 'l7', no: 7, title: 'Die Wohnung', subtitle: 'Uy va xonalar', units: 5, minutes: 21, status: 'locked', icon: 'home', tone: 'grape' },
  { id: 'l8', no: 8, title: 'Hobbys & Freizeit', subtitle: "Bo'sh vaqt va sevimli mashg'ulotlar", units: 7, minutes: 30, status: 'locked', icon: 'football', tone: 'amber' },
];

const LESSONS: Record<LevelKey, Lesson[]> = { A1: A1_LESSONS, A2: [], B1: [], B2: [] };

// The globally-current lesson (drives the "continue" hero, independent of the tab).
const CURRENT = A1_LESSONS.find((l) => l.status === 'active')!;

const STATS = [
  { key: 'streak', icon: 'flame' as const, tone: 'coral' as const, value: 5, labelKey: 'statStreak' as const },
  { key: 'done', icon: 'checkmark-done' as const, tone: 'teal' as const, value: 12, labelKey: 'statDone' as const },
  { key: 'points', icon: 'flash' as const, tone: 'amber' as const, value: 208, labelKey: 'statPoints' as const },
];

const STATUS_BADGE: Record<LessonStatus, { key: 'badgeDone' | 'badgeActive' | 'badgeLocked'; tone: BadgeTone }> = {
  done: { key: 'badgeDone', tone: 'success' },
  active: { key: 'badgeActive', tone: 'coral' },
  locked: { key: 'badgeLocked', tone: 'neutral' },
};

// ─────────────────────────────────────────────────────────────────────────────

/** Coral clay "continue where you left off" hero. */
function ContinueCard({ lesson }: { lesson: Lesson }) {
  const t = useT();
  return (
    <Pressable className="active:opacity-95">
      <View className="gap-3.5 overflow-hidden rounded-xl bg-coral-500 p-5" style={{ boxShadow: clay.coral }}>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text variant="caps" className="text-white/80">{t.darslar.continue}</Text>
            <Text variant="heading" className="mt-1 text-white">Lektion {lesson.no} · {lesson.title}</Text>
            <Text className="mt-0.5 font-body text-[14px] leading-[20px] text-white/85">{t.darslar.lessonSub[lesson.id as keyof typeof t.darslar.lessonSub]}</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
            <Ionicons name="play" size={24} color="#FFFFFF" />
          </View>
        </View>
        <View className="h-2 overflow-hidden rounded-pill bg-white/25">
          <View className="h-full rounded-pill bg-white" style={{ width: `${lesson.progress ?? 0}%` }} />
        </View>
        <Text className="font-bodymd text-[13px] text-white/90">{t.darslar.continueProgress(lesson.progress ?? 0, lesson.units, Math.round(((lesson.progress ?? 0) / 100) * lesson.units))}</Text>
      </View>
    </Pressable>
  );
}

/** White clay mini stat tile (streak / completed / points). */
function StatCard({ icon, tone, value, label }: { icon: keyof typeof Ionicons.glyphMap; tone: Tone; value: number; label: string }) {
  return (
    <Card className="flex-1 items-center gap-1.5 px-2 py-4">
      <IconTile icon={icon} tone={tone} size={40} />
      <Text variant="num" className="text-[22px]">{value}</Text>
      <Text variant="muted" className="text-[12px]">{label}</Text>
    </Card>
  );
}

/** Grape clay "Hörübung" module card → the Teil 2: Hören listening exercise. */
function HoerubungCard() {
  const t = useT();
  return (
    <Pressable onPress={() => router.push('/hoeren')} className="active:opacity-95">
      <View className="flex-row items-center gap-3.5 overflow-hidden rounded-xl bg-grape-500 p-5" style={{ boxShadow: clay.grape }}>
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Ionicons name="headset" size={26} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text variant="caps" className="text-white/80">Hörübung · A1</Text>
          <Text variant="title" className="mt-0.5 text-white">Teil 2: Hören</Text>
          <Text className="mt-0.5 font-body text-[13px] leading-[18px] text-white/85">{t.darslar.hoerDesc}</Text>
        </View>
        <View className="h-9 w-9 items-center justify-center rounded-pill bg-white">
          <Ionicons name="play" size={18} color={tokens.color.grape} style={{ marginLeft: 2 }} />
        </View>
      </View>
    </Pressable>
  );
}

/** Horizontal level selector (A1 active · A2/B1/B2 gated). */
function LevelTabs({ value, onChange }: { value: LevelKey; onChange: (k: LevelKey) => void }) {
  return (
    <View className="flex-row gap-2.5">
      {LEVELS.map((lv) => {
        const active = lv.key === value;
        return (
          <Pressable
            key={lv.key}
            onPress={() => onChange(lv.key)}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1 rounded-pill border py-2.5',
              active ? 'border-coral-500 bg-coral-500' : 'border-border bg-surface',
            )}
            style={{ boxShadow: active ? undefined : shadow.xs }}
          >
            {!lv.unlocked ? (
              <Ionicons name="lock-closed" size={12} color={active ? '#FFFFFF' : tokens.color.fgFaint} />
            ) : null}
            <Text className={cn('font-displayx text-[16px]', active ? 'text-white' : 'text-fg')}>{lv.key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const NODE: Record<LessonStatus, { bg: string; icon: keyof typeof Ionicons.glyphMap; fg: string }> = {
  done: { bg: tokens.color.success, icon: 'checkmark', fg: '#FFFFFF' },
  active: { bg: tokens.color.coral, icon: 'play', fg: '#FFFFFF' },
  locked: { bg: tokens.color.sunk, icon: 'lock-closed', fg: tokens.color.fgFaint },
};

/** One node on the vertical learning path: status circle + rail + lesson card. */
function LessonNode({ lesson, last }: { lesson: Lesson; last: boolean }) {
  const colors = useColors();
  const t = useT();
  const n = NODE[lesson.status];
  const badge = STATUS_BADGE[lesson.status];
  const locked = lesson.status === 'locked';

  return (
    <View className="flex-row gap-3.5">
      {/* Status node + connecting rail */}
      <View className="w-11 items-center">
        <View className="h-11 w-11 items-center justify-center rounded-pill" style={{ backgroundColor: n.bg, boxShadow: shadow.sm }}>
          <Ionicons name={n.icon} size={20} color={n.fg} />
        </View>
        {!last ? <View className="my-1 w-0.5 flex-1 rounded-pill bg-border" /> : null}
      </View>

      {/* Lesson card */}
      <View className={cn('flex-1', last ? 'pb-0' : 'pb-4')}>
        <Pressable className="active:opacity-90">
          <Card className={cn('gap-2', locked && 'opacity-70')}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text variant="caps" className="text-fg-faint">Lektion {lesson.no}</Text>
                <Text variant="h3" numberOfLines={1}>{lesson.title}</Text>
              </View>
              <Badge label={t.darslar[badge.key]} tone={badge.tone} />
            </View>
            <Text variant="muted">{t.darslar.lessonSub[lesson.id as keyof typeof t.darslar.lessonSub]}</Text>
            <View className="flex-row items-center gap-4 pt-0.5">
              <View className="flex-row items-center gap-1">
                <Ionicons name="albums-outline" size={14} color={colors.fgFaint} />
                <Text variant="muted" className="text-[13px]">{t.darslar.unitsWord(lesson.units)}</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={14} color={colors.fgFaint} />
                <Text variant="muted" className="text-[13px]">{t.darslar.minutesWord(lesson.minutes)}</Text>
              </View>
            </View>
            {lesson.status === 'active' ? (
              <View className="gap-1.5 pt-1">
                <View className="h-2 overflow-hidden rounded-pill bg-sunk">
                  <View className="h-full rounded-pill bg-coral-500" style={{ width: `${lesson.progress ?? 0}%` }} />
                </View>
                <Text variant="muted" className="text-[12px] text-coral-600 dark:text-coral-400">{t.darslar.percentDone(lesson.progress ?? 0)}</Text>
              </View>
            ) : null}
          </Card>
        </Pressable>
      </View>
    </View>
  );
}

/** Shown for a level that isn't unlocked yet. */
function LockedLevel({ level }: { level: LevelKey }) {
  const t = useT();
  const prev = LEVELS[LEVELS.findIndex((l) => l.key === level) - 1]?.key ?? 'A1';
  return (
    <Card className="items-center gap-3 py-9">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-sunk">
        <Ionicons name="lock-closed" size={30} color={tokens.color.fgFaint} />
      </View>
      <Text variant="title">{t.darslar.lockedTitle(level)}</Text>
      <Text variant="muted" className="px-6 text-center">
        {t.darslar.lockedDesc(prev, level)}
      </Text>
    </Card>
  );
}

export default function Darslar() {
  const t = useT();
  const [level, setLevel] = useState<LevelKey>('A1');
  const lessons = LESSONS[level];
  const done = lessons.filter((l) => l.status === 'done').length;
  const meta = LEVELS.find((l) => l.key === level)!;

  return (
    <Screen>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pb-32">
          <FadeIn index={0}>
            <ScreenHeader
              title={t.darslar.title}
              subtitle={t.darslar.subtitle}
              right={<StatChip icon="flame" value={5} color={tokens.color.coral} />}
            />
          </FadeIn>

          <FadeIn index={1}>
            <ContinueCard lesson={CURRENT} />
          </FadeIn>

          <FadeIn index={2}>
            <View className="flex-row gap-3">
              {STATS.map((s) => (
                <StatCard key={s.key} icon={s.icon} tone={s.tone} value={s.value} label={t.darslar[s.labelKey]} />
              ))}
            </View>
          </FadeIn>

          <FadeIn index={3}>
            <HoerubungCard />
          </FadeIn>

          <FadeIn index={4}>
            <LevelTabs value={level} onChange={setLevel} />
          </FadeIn>

          <FadeIn index={5}>
            <View className="flex-row items-center justify-between px-1">
              <Text variant="title">{level} · {meta.name}</Text>
              {meta.unlocked ? (
                <Text variant="muted">{t.darslar.lessonsCount(done, lessons.length)}</Text>
              ) : null}
            </View>
          </FadeIn>

          {meta.unlocked ? (
            <View>
              {lessons.map((l, i) => (
                <FadeIn key={l.id} index={6 + i}>
                  <LessonNode lesson={l} last={i === lessons.length - 1} />
                </FadeIn>
              ))}
            </View>
          ) : (
            <FadeIn index={6}>
              <LockedLevel level={level} />
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
