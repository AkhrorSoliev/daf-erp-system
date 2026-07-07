import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AudioPlayer, Button, Card, Screen, StackHeader, Text } from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────────────────────
// DUMMY Hörübung — "Teil 2: Hören" (A1 richtig/falsch listening comprehension).
// Each Frage plays an audio clip; the learner decides if the German statement is
// richtig (true) or falsch (false). Clips live in assets/audio. No backend yet.
// ─────────────────────────────────────────────────────────────────────────────

type Choice = 'richtig' | 'falsch';
type Frage = { audio: number; statement: string; correct: Choice; hint: string };

const FRAGEN: Frage[] = [
  {
    audio: require('../../assets/audio/audio-1.mp3'),
    statement: 'Die Frau kauft Brot und Milch im Supermarkt.',
    correct: 'falsch',
    hint: "Ayol do'kondan non va sut sotib oladi.",
  },
  {
    audio: require('../../assets/audio/audio-2.mp3'),
    statement: 'Der Kunde kauft Karten für die Vorstellung um 16.30 Uhr.',
    correct: 'richtig',
    hint: 'Mijoz soat 16:30 dagi tomosha uchun chipta sotib oladi.',
  },
  {
    audio: require('../../assets/audio/audio-3.mp3'),
    statement: 'Das Wetter ist heute sonnig und warm.',
    correct: 'richtig',
    hint: 'Bugun ob-havo quyoshli va issiq.',
  },
  {
    audio: require('../../assets/audio/audio-4.mp3'),
    statement: 'Sie sollen Ihren Freund anrufen.',
    correct: 'falsch',
    hint: "Siz do'stingizga qo'ng'iroq qilishingiz kerak.",
  },
];

const OPTIONS: Choice[] = ['richtig', 'falsch'];

type QState = { sel: Choice | null; solved: boolean; revealed: boolean };
const FRESH: QState = { sel: null, solved: false, revealed: false };

// ─────────────────────────────────────────────────────────────────────────────

/** Green/red/neutral answer row — turns green with a check when correct, red with
 *  a cross when the pick is wrong. */
function OptionRow({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: 'idle' | 'correct' | 'wrong';
  disabled: boolean;
  onPress: () => void;
}) {
  const box = {
    idle: 'border-border bg-sunk',
    correct: 'border-success bg-success-50 dark:bg-success-600/20',
    wrong: 'border-danger bg-danger-50 dark:bg-danger-600/20',
  }[state];
  const txt = {
    idle: 'text-fg',
    correct: 'text-success-600 dark:text-success-400',
    wrong: 'text-danger-600 dark:text-danger-400',
  }[state];
  return (
    <Pressable onPress={onPress} disabled={disabled} className="active:opacity-90">
      <View className={cn('flex-row items-center justify-between rounded-lg border px-4 py-4', box)}>
        <Text className={cn('font-bodymd text-[17px]', txt)}>{label}</Text>
        {state === 'correct' ? <Ionicons name="checkmark-circle" size={22} color={tokens.color.success} /> : null}
        {state === 'wrong' ? <Ionicons name="close-circle" size={22} color={tokens.color.danger} /> : null}
      </View>
    </Pressable>
  );
}

/** Star score pill under the feedback — 1/1 when solved, else 0/1. */
function ScorePill({ scored }: { scored: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5 self-center rounded-pill bg-surface px-4 py-2" style={{ boxShadow: shadow.sm }}>
      <Ionicons name="star" size={16} color={scored ? tokens.color.amber : tokens.color.fgFaint} />
      <Text variant="num" className="text-[16px]">{scored ? '1' : '0'}/1</Text>
    </View>
  );
}

/** Small pill button used for Wiederholen / Lösung anzeigen. */
function ActionButton({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'sky' | 'grape';
  onPress: () => void;
}) {
  const bg = tone === 'sky' ? 'bg-sky-500' : 'bg-grape-500';
  const cl = tone === 'sky' ? clay.sky : clay.grape;
  return (
    <Pressable onPress={onPress} className="active:opacity-90">
      <View className={cn('flex-row items-center gap-2 rounded-pill px-4 py-2.5', bg)} style={{ boxShadow: cl }}>
        <Ionicons name={icon} size={16} color="#FFFFFF" />
        <Text className="font-display text-[14px] text-white">{label}</Text>
      </View>
    </Pressable>
  );
}

/** Header-right running score (solved / total) with a star. */
function HeaderScore({ solved, total }: { solved: number; total: number }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-pill bg-surface px-3 py-1.5" style={{ boxShadow: shadow.sm }}>
      <Ionicons name="star" size={15} color={tokens.color.amber} />
      <Text variant="num" className="text-[15px]">{solved}/{total}</Text>
    </View>
  );
}

/** Zurück · progress dots · Weiter / Yakunlash footer. */
function FooterNav({
  index,
  states,
  onPrev,
  onNext,
  onFinish,
}: {
  index: number;
  states: QState[];
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const total = states.length;
  const first = index === 0;
  const last = index === total - 1;
  return (
    <View className="border-t border-border bg-surface px-5 pb-2 pt-3">
      <View className="flex-row items-center justify-between">
        <Pressable disabled={first} onPress={onPrev} hitSlop={8} className={cn('flex-row items-center gap-1 active:opacity-70', first && 'opacity-30')}>
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
          <Text className="font-bodymd text-[15px] text-fg">Zurück</Text>
        </Pressable>

        <View className="flex-row items-center gap-1.5">
          {states.map((s, i) =>
            i === index ? (
              <View key={i} className="h-2 w-6 rounded-pill bg-coral-500" />
            ) : (
              <View key={i} className={cn('h-2 w-2 rounded-pill', s.solved ? 'bg-success' : 'bg-sunk')} />
            ),
          )}
        </View>

        <Pressable onPress={last ? onFinish : onNext} hitSlop={8} className="flex-row items-center gap-1 active:opacity-70">
          <Text className="font-bodymd text-[15px] text-fg">{last ? t.hoeren.finish : 'Weiter'}</Text>
          <Ionicons name={last ? 'checkmark-done' : 'chevron-forward'} size={20} color={colors.fg} />
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Hoeren() {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<QState[]>(() => FRAGEN.map(() => ({ ...FRESH })));
  const [showHint, setShowHint] = useState(false);
  const [done, setDone] = useState(false);

  const q = FRAGEN[index];
  const cur = states[index];
  const locked = cur.sel != null || cur.revealed;
  const solvedCount = states.filter((s) => s.solved).length;

  function update(i: number, next: QState) {
    setStates((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  }
  function pick(opt: Choice) {
    if (locked) return;
    update(index, { sel: opt, solved: opt === q.correct, revealed: false });
  }
  function go(next: number) {
    setShowHint(false);
    setIndex(next);
  }
  function restart() {
    setStates(FRAGEN.map(() => ({ ...FRESH })));
    setIndex(0);
    setShowHint(false);
    setDone(false);
  }

  function optState(opt: Choice): 'idle' | 'correct' | 'wrong' {
    const isCorrect = opt === q.correct;
    if ((cur.solved || cur.revealed) && isCorrect) return 'correct';
    if (cur.sel === opt && !isCorrect && !cur.solved) return 'wrong';
    return 'idle';
  }

  const feedback: 'idle' | 'correct' | 'wrong' | 'revealed' = cur.solved
    ? 'correct'
    : cur.revealed
      ? 'revealed'
      : cur.sel != null
        ? 'wrong'
        : 'idle';

  // ---------- SUMMARY ----------
  if (done) {
    const pct = Math.round((solvedCount / FRAGEN.length) * 100);
    return (
      <Screen>
        <StackHeader title="Teil 2: Hören" />
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="gap-4 p-5 pt-2">
            <View className="items-center gap-2 overflow-hidden rounded-xl bg-teal-500 p-6" style={{ boxShadow: clay.teal }}>
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
                <Ionicons name="trophy" size={32} color="#FFFFFF" />
              </View>
              <Text variant="heading" className="mt-1 text-white">Übung beendet!</Text>
              <Text variant="num" className="text-[40px] leading-[44px] text-white">{solvedCount}/{FRAGEN.length}</Text>
              <Text className="font-body text-[14px] text-white/85">{t.hoeren.correctPct(pct)}</Text>
            </View>

            <View className="gap-2.5">
              {FRAGEN.map((fq, i) => {
                const ok = states[i].solved;
                return (
                  <Card key={i} className="flex-row items-center gap-3 py-3.5">
                    <View className={cn('h-9 w-9 items-center justify-center rounded-pill', ok ? 'bg-success-50 dark:bg-success-600/20' : 'bg-danger-50 dark:bg-danger-600/20')}>
                      <Ionicons name={ok ? 'checkmark' : 'close'} size={18} color={ok ? tokens.color.success : tokens.color.danger} />
                    </View>
                    <View className="flex-1">
                      <Text variant="caps" className="text-fg-faint">Frage {i + 1}</Text>
                      <Text variant="label" numberOfLines={1}>{fq.statement}</Text>
                    </View>
                    <Text className={cn('font-bodymd text-[13px]', ok ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400')}>{fq.correct}</Text>
                  </Card>
                );
              })}
            </View>

            <Button label={t.hoeren.restart} variant="teal" iconBefore="refresh" onPress={restart} />
            <Button label={t.hoeren.goBack} variant="secondary" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ---------- EXERCISE ----------
  return (
    <Screen>
      <StackHeader title="Teil 2: Hören" right={<HeaderScore solved={solvedCount} total={FRAGEN.length} />} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <View className="gap-4 p-5 pt-1">
          {/* A1 level badge + audio player */}
          <View className="flex-row items-center gap-3 rounded-xl bg-teal-100 p-3.5 dark:bg-teal-500/15">
            <View className="h-14 w-14 items-center justify-center rounded-pill border-2 border-teal-500 bg-surface">
              <Text className="font-displayx text-[18px] text-teal-600 dark:text-teal-300">A1</Text>
            </View>
            <AudioPlayer key={index} source={q.audio} tone="coral" className="flex-1" />
          </View>

          {/* Question */}
          <Card className="gap-4">
            <View className="flex-row items-center justify-between">
              <Text variant="title">Frage {index + 1}</Text>
              <Pressable
                onPress={() => setShowHint((v) => !v)}
                hitSlop={8}
                className={cn('h-9 w-9 items-center justify-center rounded-pill', showHint ? 'bg-sky-600' : 'bg-sky-500')}
                style={{ boxShadow: shadow.sm }}
              >
                <Ionicons name="information" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            <Text variant="h3" className="leading-[26px]">{q.statement}</Text>

            {showHint ? (
              <View className="rounded-lg bg-sky-100 px-3.5 py-3 dark:bg-sky-500/15">
                <Text variant="muted" className="text-sky-700 dark:text-sky-200">{t.hoeren.hints[index]}</Text>
              </View>
            ) : null}

            <View className="gap-3">
              {OPTIONS.map((opt) => (
                <OptionRow key={opt} label={opt} state={optState(opt)} disabled={locked} onPress={() => pick(opt)} />
              ))}
            </View>

            {feedback === 'idle' ? (
              <Text variant="muted" className="text-center leading-[20px]">
                {t.hoeren.instruction}
              </Text>
            ) : (
              <View className="items-center gap-3 pt-1">
                {feedback === 'correct' ? (
                  <Text className="text-center font-displaymd text-[17px] text-success-600 dark:text-success-400">Gut gemacht, weiter so!</Text>
                ) : feedback === 'wrong' ? (
                  <Text className="text-center font-displaymd text-[17px] text-sky-600 dark:text-sky-300">Versuchen Sie es noch einmal.</Text>
                ) : (
                  <Text className="text-center font-displaymd text-[17px] text-fg-muted">Richtige Antwort: {q.correct}</Text>
                )}
                <ScorePill scored={cur.solved} />
                {feedback === 'wrong' ? (
                  <View className="flex-row gap-3 pt-0.5">
                    <ActionButton icon="refresh" label="Wiederholen" tone="sky" onPress={() => update(index, { ...FRESH })} />
                    <ActionButton icon="eye" label="Lösung anzeigen" tone="grape" onPress={() => update(index, { sel: cur.sel, solved: false, revealed: true })} />
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>

      <FooterNav
        index={index}
        states={states}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        onFinish={() => setDone(true)}
      />
    </Screen>
  );
}
