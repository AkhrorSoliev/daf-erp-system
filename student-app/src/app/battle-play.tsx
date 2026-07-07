import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EASE, Screen, StackHeader, Text } from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useProfile } from '@/api/queries/use-profile';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

// --- Demo content (dummy questions, mirrors the reference examples) ---
type Question = { hint?: string; answer: string[] };
type Answer = { built: string; correct: boolean; noAnswer: boolean; timedOut: boolean };
const QUESTIONS: Question[] = [
  { hint: 'Ismingiz nima?', answer: ['Wie', 'heißt', 'du?'] },
  { hint: 'Mening ismim Barno', answer: ['Ich', 'heiße', 'Barno'] },
  { hint: 'Men talabaman', answer: ['Ich', 'bin', 'Student'] },
  { hint: 'Salom, men Ahmadman', answer: ['Hallo,', 'ich', 'bin', 'Ahmad'] },
  { hint: "Men O'zbekistondanman", answer: ['Ich', 'komme', 'aus', 'Usbekistan'] },
  { hint: "U har kuni o'qiydi", answer: ['Sie', 'lernt', 'jeden', 'Tag'] },
];
const CONFETTI_COLORS = ['#FF6B4A', '#FFB02E', '#14B8AC', '#8B5CF6', '#2E97FF', '#2BB673'];
const OPPONENT = 'Sevinch Tanieva';
const DURATION = 15; // seconds per question
const LOBBY_COUNT = 5;

type Phase = 'lobby' | 'playing' | 'finished';

function shuffle(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Shuffle the answer for the word bank, ensuring it isn't already the solution. */
function makeBank(answer: string[]): string[] {
  if (answer.length < 2) return [...answer];
  const target = answer.join(' ');
  for (let i = 0; i < 8; i++) {
    const s = shuffle(answer);
    if (s.join(' ') !== target) return s;
  }
  return [...answer].reverse();
}

function WordChip({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="active:opacity-70">
      <View className="rounded-lg border border-border bg-surface px-4 py-2.5" style={{ boxShadow: shadow.xs }}>
        <Text className="font-bodymd text-[16px] text-fg">{label}</Text>
      </View>
    </Pressable>
  );
}

function PlayerRow({
  rank,
  name,
  me,
  photo,
  initials,
  score,
}: {
  rank?: number;
  name: string;
  me?: boolean;
  photo?: string | null;
  initials?: string;
  score?: number;
}) {
  return (
    <View
      className={cn('flex-row items-center gap-4 rounded-2xl p-3.5', me ? 'bg-sky-500' : 'border border-border bg-surface')}
      style={{ boxShadow: me ? clay.sky : shadow.sm }}
    >
      {rank != null ? (
        <Text variant="num" className={cn('w-5 text-center text-[18px]', me ? 'text-white' : 'text-fg')}>{rank}</Text>
      ) : null}
      <Avatar uri={photo} initials={initials} size={46} />
      <Text className={cn('flex-1 font-displaymd text-[19px]', me ? 'text-white' : 'text-fg')} numberOfLines={1}>{name}</Text>
      {score != null ? (
        <Text variant="num" className={cn('text-[22px]', me ? 'text-white' : 'text-fg')}>{score}</Text>
      ) : null}
    </View>
  );
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** DIY confetti — colored bits looping down within the winner card (no native dep). */
function Confetti({ width, height }: { width: number; height: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        x: Math.random() * width,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 1600,
        duration: 1700 + Math.random() * 1600,
        rotate: Math.random() * 720 - 360,
        drift: Math.random() * 44 - 22,
      })),
    [width, height],
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p) => (
        <MotiView
          key={p.id}
          from={{ translateY: -24, translateX: p.x, rotate: '0deg', opacity: 1 }}
          animate={{ translateY: height + 24, translateX: p.x + p.drift, rotate: `${p.rotate}deg`, opacity: 1 }}
          transition={{ type: 'timing', duration: p.duration, delay: p.delay, loop: true, repeatReverse: false }}
          style={{ position: 'absolute', width: p.size, height: p.size * 1.6, borderRadius: 2, backgroundColor: p.color }}
        />
      ))}
    </View>
  );
}

type Stats = { correct: number; wrong: number; star: number; time: string };

function StatPill({
  icon,
  color,
  value,
  you,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string | number;
  you: boolean;
}) {
  return (
    <View className={cn('flex-row items-center gap-1 rounded-pill px-2.5 py-1', you ? 'bg-sky-500' : 'bg-white')} style={{ boxShadow: shadow.xs }}>
      <Ionicons name={icon} size={16} color={color} />
      <Text variant="num" className={cn('text-[15px]', you ? 'text-white' : 'text-ink-900')}>{value}</Text>
    </View>
  );
}

function PlayerResultCard({
  rankLabel,
  name,
  photo,
  initials,
  you,
  winner,
  stats,
}: {
  rankLabel: string;
  name: string;
  photo?: string | null;
  initials?: string;
  you: boolean;
  winner: boolean;
  stats: Stats;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      className={cn('overflow-hidden rounded-2xl p-4', winner ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-danger-50 dark:bg-danger-600/15')}
      style={{ boxShadow: shadow.card }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 gap-2">
          <Text className={cn('font-bodyx text-[13px]', winner ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted')}>{rankLabel}</Text>
          <Text variant="heading" numberOfLines={1}>{name}</Text>
          <View className="flex-row flex-wrap gap-2 pt-1">
            <StatPill icon="checkmark-circle" color={tokens.color.success} value={stats.correct} you={you} />
            <StatPill icon="close-circle" color={tokens.color.danger} value={stats.wrong} you={you} />
            <StatPill icon="star" color={tokens.color.success} value={stats.star} you={you} />
            <StatPill icon="time" color={tokens.color.amber} value={stats.time} you={you} />
          </View>
        </View>
        <Avatar uri={photo} initials={initials} size={82} />
      </View>
      {winner && size ? <Confetti width={size.w} height={size.h} /> : null}
    </View>
  );
}

function ReviewCard({ q, a, hint }: { q: Question; a: Answer; hint: string }) {
  const t = useT();
  const header = hint || q.answer.join(' ');
  const yourAnswer = a.noAnswer ? (a.timedOut ? t.battlePlay.timedOut : t.battlePlay.noAnswer) : a.built;
  return (
    <View className={cn('gap-2 rounded-2xl p-4', a.correct ? 'bg-success-50 dark:bg-success-600/15' : 'bg-danger-50 dark:bg-danger-600/15')}>
      <Text className="font-bodyx text-[16px] text-fg">{header}</Text>
      {a.correct ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={16} color={tokens.color.success} />
          <Text className="font-bodymd text-[15px] text-success-600 dark:text-success-400">{a.built}</Text>
        </View>
      ) : (
        <>
          <Text className="font-bodymd text-[15px] text-fg">
            {t.battlePlay.yourAnswer} <Text className="text-danger">{yourAnswer}</Text>
          </Text>
          <Text className="font-bodymd text-[14px] text-fg">{t.battlePlay.correctAnswer}</Text>
          <View className="flex-row items-center gap-2">
            <Text variant="num" className="text-[15px]">1.</Text>
            <View className="self-start rounded-lg bg-success px-3 py-1.5">
              <Text className="font-bodymd text-[15px] text-white">{q.answer.join(' ')}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function BattlePlay() {
  const t = useT();
  const colors = useColors();
  const profile = useProfile().data;
  const me = profile?.firstName || t.battlePlay.you;
  const myInitials = `${profile?.firstName?.[0] ?? ''}${profile?.lastName?.[0] ?? ''}`.toUpperCase() || 'S';

  const [phase, setPhase] = useState<Phase>('lobby');
  const [count, setCount] = useState(LOBBY_COUNT);

  const [qIndex, setQIndex] = useState(0);
  const [bank, setBank] = useState<string[]>([]);
  const [taken, setTaken] = useState<boolean[]>([]);
  const [built, setBuilt] = useState<number[]>([]);
  const [remaining, setRemaining] = useState(DURATION);
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [opp, setOpp] = useState<Stats>({ correct: 0, wrong: 0, star: 0, time: '0m 0s' });

  const q = QUESTIONS[qIndex];

  // Lobby countdown → start the battle.
  useEffect(() => {
    if (phase !== 'lobby') return;
    if (count <= 0) {
      setPhase('playing');
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count]);

  // Set up a fresh question.
  useEffect(() => {
    if (phase !== 'playing') return;
    const cur = QUESTIONS[qIndex];
    setBank(makeBank(cur.answer));
    setTaken(cur.answer.map(() => false));
    setBuilt([]);
    setResult(null);
    setRemaining(DURATION);
  }, [phase, qIndex]);

  // Per-question timer (runs until answered).
  useEffect(() => {
    if (phase !== 'playing' || result !== null) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 0.1)), 100);
    return () => clearInterval(id);
  }, [phase, qIndex, result]);

  // Time's up → auto-resolve.
  useEffect(() => {
    if (phase === 'playing' && result === null && remaining <= 0) resolve(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  function place(i: number) {
    if (result !== null) return;
    setTaken((t) => t.map((v, idx) => (idx === i ? true : v)));
    setBuilt((b) => [...b, i]);
  }
  function unplace(i: number) {
    if (result !== null) return;
    setTaken((t) => t.map((v, idx) => (idx === i ? false : v)));
    setBuilt((b) => b.filter((x) => x !== i));
  }

  function resolve(byTimeout = false) {
    if (result !== null) return;
    const sentence = built.map((i) => bank[i]).join(' ');
    const ok = sentence === q.answer.join(' ');
    setAnswers((a) => [...a, { built: sentence, correct: ok, noAnswer: built.length === 0, timedOut: byTimeout }]);
    setTotalTime((t) => t + (DURATION - remaining));
    setResult(ok ? 'correct' : 'wrong');
    if (ok) setScore((s) => s + 1);
  }

  function next() {
    if (qIndex + 1 >= QUESTIONS.length) {
      // Dummy opponent stats (no real multiplayer yet).
      const oppCorrect = QUESTIONS.reduce((n) => n + (Math.random() < 0.6 ? 1 : 0), 0);
      const oppTime = QUESTIONS.length * 6 + Math.floor(Math.random() * QUESTIONS.length * 6);
      setOpp({
        correct: oppCorrect,
        wrong: QUESTIONS.length - oppCorrect,
        star: Math.min(oppCorrect, 1 + Math.floor(Math.random() * 2)),
        time: fmtTime(oppTime),
      });
      setPhase('finished');
      return;
    }
    setQIndex((i) => i + 1);
  }

  function restart() {
    setScore(0);
    setAnswers([]);
    setTotalTime(0);
    setOpp({ correct: 0, wrong: 0, star: 0, time: '0m 0s' });
    setQIndex(0);
    setCount(LOBBY_COUNT);
    setResult(null);
    setPhase('lobby');
  }

  // ---------- LOBBY ----------
  if (phase === 'lobby') {
    return (
      <Screen>
        <StackHeader title={t.battlePlay.waitingHeader} />
        <View className="flex-1 p-5 pt-2">
          <View className="gap-3">
            <PlayerRow rank={1} name={me} me photo={profile?.photo} initials={myInitials} />
            <PlayerRow rank={2} name={OPPONENT} initials="ST" />
          </View>
          <View className="flex-1" />
          <View className="items-center gap-4 pb-12">
            <Text variant="heading" className="text-grape-600 dark:text-grape-400">{t.battlePlay.startsIn}</Text>
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-sky-500" style={{ boxShadow: clay.sky }}>
              <Text variant="num" className="text-[30px] text-white">{count}</Text>
            </View>
          </View>
        </View>
      </Screen>
    );
  }

  // ---------- FINISHED ----------
  if (phase === 'finished') {
    let streak = 0;
    let best = 0;
    for (const a of answers) {
      if (a.correct) {
        streak += 1;
        best = Math.max(best, streak);
      } else streak = 0;
    }
    const youStats: Stats = { correct: score, wrong: QUESTIONS.length - score, star: best, time: fmtTime(totalTime) };
    const iWin = score >= opp.correct; // tie → you rank 1

    const youCard = (second: boolean) => (
      <PlayerResultCard rankLabel={second ? t.battlePlay.secondPlace : t.battlePlay.winner} name={me} photo={profile?.photo} initials={myInitials} you winner={!second} stats={youStats} />
    );
    const oppCard = (second: boolean) => (
      <PlayerResultCard rankLabel={second ? t.battlePlay.secondPlace : t.battlePlay.winner} name={OPPONENT} initials="ST" you={false} winner={!second} stats={opp} />
    );

    return (
      <Screen>
        <View className="px-5 pb-2 pt-1">
          <Text variant="heading">{t.battlePlay.resultHeader}</Text>
        </View>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="gap-4 p-5 pt-2">
            {iWin ? youCard(false) : oppCard(false)}
            {iWin ? oppCard(true) : youCard(true)}

            <Text variant="title" className="pt-2">{t.battlePlay.yourAnswers}</Text>
            {answers.map((a, i) => (
              <ReviewCard key={i} q={QUESTIONS[i]} a={a} hint={t.battlePlay.hints[i]} />
            ))}

            <Pressable onPress={restart} className="pt-1 active:opacity-80">
              <Text className="text-center font-bodymd text-[15px] text-grape-600 dark:text-grape-400">{t.battlePlay.replay}</Text>
            </Pressable>
          </View>
        </ScrollView>
        <View className="px-5 pb-2 pt-2">
          <Pressable onPress={() => router.dismissAll()} className="active:opacity-90">
            <View className="h-[58px] items-center justify-center rounded-[26px] bg-sky-500" style={{ boxShadow: clay.sky }}>
              <Text className="font-display text-[18px] text-white">{t.battlePlay.goBack}</Text>
            </View>
          </Pressable>
        </View>
      </Screen>
    );
  }

  // ---------- PLAYING ----------
  const elapsedPct = ((DURATION - remaining) / DURATION) * 100;
  const canCheck = result === null && built.length === bank.length && bank.length > 0;
  const isCorrect = result === 'correct';

  return (
    <Screen>
      {/* timer header */}
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-tint">
          <Ionicons name="chevron-back" size={26} color={colors.fg} />
        </Pressable>
        <View className="h-3 flex-1 overflow-hidden rounded-pill bg-sunk">
          <View className="h-full rounded-pill bg-ink-900 dark:bg-white" style={{ width: `${elapsedPct}%` }} />
        </View>
        <Text variant="num" className="w-12 text-right text-[20px]">{Math.ceil(remaining)} s</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-5 p-5 pt-2">
          <Text variant="heading" className="text-center">{t.battlePlay.buildPrompt}</Text>

          {/* answer area */}
          <View className="rounded-2xl border border-border bg-surface p-4" style={{ boxShadow: shadow.card, minHeight: 176 }}>
            <View className="absolute inset-x-5 bottom-5 top-8 justify-between">
              {[0, 1, 2, 3].map((i) => (
                <View key={i} className="h-px bg-border" />
              ))}
            </View>
            {t.battlePlay.hints[qIndex] ? (
              <Text className="mb-3 text-center font-bodymd text-[18px] text-fg underline">{t.battlePlay.hints[qIndex]}</Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {built.map((i) => (
                <WordChip key={i} label={bank[i]} onPress={() => unplace(i)} />
              ))}
            </View>
          </View>

          {/* word bank */}
          <View className="rounded-2xl border border-border bg-surface p-4" style={{ boxShadow: shadow.sm, minHeight: 92 }}>
            <View className="flex-row flex-wrap items-center justify-center gap-2.5">
              {bank.map((tok, i) =>
                taken[i] ? (
                  <View key={i} className="rounded-lg bg-sunk px-4 py-2.5">
                    <Text className="font-bodymd text-[16px] opacity-0">{tok}</Text>
                  </View>
                ) : (
                  <WordChip key={i} label={tok} onPress={() => place(i)} />
                ),
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Tekshirish */}
      <View className="px-5 pb-2 pt-2">
        <Pressable disabled={!canCheck} onPress={() => resolve(false)} className="active:opacity-90">
          <View
            className={cn('h-[58px] items-center justify-center rounded-[26px]', canCheck ? 'bg-sky-500' : 'bg-sunk')}
            style={canCheck ? { boxShadow: clay.sky } : undefined}
          >
            <Text className={cn('font-display text-[18px]', canCheck ? 'text-white' : 'text-fg-faint')}>{t.battlePlay.check}</Text>
          </View>
        </Pressable>
      </View>

      {/* result overlay */}
      {result ? (
        <View className="absolute inset-0 justify-end">
          <View className="absolute inset-0 bg-black/40" />
          <MotiView
            from={{ translateY: 340 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'timing', duration: 260, easing: EASE }}
            className="gap-4 rounded-t-[28px] bg-surface px-6 pb-9 pt-7"
          >
            <Text variant="display" className={isCorrect ? 'text-success' : 'text-danger'}>
              {isCorrect ? t.battlePlay.correct : t.battlePlay.wrong}
            </Text>
            <View className="items-center py-6">
              <Ionicons
                name={isCorrect ? 'checkmark-sharp' : 'close-sharp'}
                size={120}
                color={isCorrect ? tokens.color.success : tokens.color.danger}
              />
            </View>
            <Pressable onPress={next} className="active:opacity-90">
              <View
                className="h-[60px] items-center justify-center rounded-[26px]"
                style={{ backgroundColor: isCorrect ? tokens.color.success : tokens.color.danger, boxShadow: shadow.md }}
              >
                <Text className="font-display text-[18px]" style={{ color: isCorrect ? tokens.color.fg : '#FFFFFF' }}>
                  {t.battlePlay.continue}
                </Text>
              </View>
            </Pressable>
          </MotiView>
        </View>
      ) : null}
    </Screen>
  );
}
