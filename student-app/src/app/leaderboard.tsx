import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Screen, StackHeader, Text } from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useProfile } from '@/api/queries/use-profile';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { buildLeaderboard, inits, MEDAL, type LeaderPlayer } from '@/data/leaderboard';

function Podium({ top3 }: { top3: LeaderPlayer[] }) {
  const t = useT();
  const order = [
    { p: top3[1], place: 2, h: 60 },
    { p: top3[0], place: 1, h: 82 },
    { p: top3[2], place: 3, h: 44 },
  ];
  return (
    <View className="flex-row items-end gap-2">
      {order.map(({ p, place, h }) => (
        <View key={place} className="flex-1 items-center">
          {place === 1 ? <Ionicons name="trophy" size={24} color={MEDAL[0]} /> : null}
          <View style={{ borderWidth: 3, borderColor: MEDAL[place - 1], borderRadius: 999, padding: 2, marginTop: place === 1 ? 2 : 0 }}>
            <Avatar uri={p.avatar} initials={inits(p.name)} size={place === 1 ? 74 : 58} />
          </View>
          {p.me ? (
            <View className="mt-1 rounded-pill bg-sky-500 px-2 py-0.5">
              <Text className="font-bodyx text-[10px] text-white">{t.leaderboard.you}</Text>
            </View>
          ) : null}
          <Text numberOfLines={1} className="mt-1 max-w-full font-bodymd text-[13px] text-fg">{p.name.split(' ')[0]}</Text>
          <View className="mt-0.5 flex-row items-center gap-1">
            <Ionicons name="flash" size={12} color={tokens.color.amber} />
            <Text variant="num" className="text-[13px]">{p.xp}</Text>
          </View>
          <View className="mt-2 w-full items-center justify-center rounded-t-xl" style={{ height: h, backgroundColor: MEDAL[place - 1] + '22' }}>
            <Text variant="num" className="text-[22px]" style={{ color: MEDAL[place - 1] }}>{place}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function RankRow({ rank, player }: { rank: number; player: LeaderPlayer }) {
  const me = !!player.me;
  return (
    <View
      className={cn('flex-row items-center gap-3 rounded-2xl p-3', me ? 'bg-sky-500' : 'border border-border bg-surface')}
      style={{ boxShadow: me ? clay.sky : shadow.sm }}
    >
      <Text variant="num" className={cn('w-7 text-center text-[16px]', me ? 'text-white' : 'text-fg-muted')}>{rank}</Text>
      <Avatar uri={player.avatar} initials={inits(player.name)} size={40} />
      <Text className={cn('flex-1 font-bodymd text-[16px]', me ? 'text-white' : 'text-fg')} numberOfLines={1}>{player.name}</Text>
      <View className={cn('flex-row items-center gap-1 rounded-pill px-2.5 py-1', me ? 'bg-white' : 'bg-amber-50 dark:bg-amber-500/15')}>
        <Ionicons name="flash" size={14} color={tokens.color.amber} />
        <Text variant="num" className={cn('text-[14px]', me ? 'text-ink-900' : 'text-fg')}>{player.xp}</Text>
      </View>
    </View>
  );
}

export default function Leaderboard() {
  const t = useT();
  const profile = useProfile().data;
  const meName = profile?.firstName ? `${profile.firstName} ${profile.lastName ?? ''}`.trim() : t.leaderboard.you;
  const players = buildLeaderboard({ name: meName, avatar: profile?.photo ?? undefined });
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <Screen>
      <StackHeader
        title={t.home.leaderboardTitle}
        right={
          <View className="rounded-pill bg-sunk px-3 py-1">
            <Text variant="muted">{t.leaderboard.thisWeek}</Text>
          </View>
        }
      />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-3 p-5 pt-3">
          <Podium top3={top3} />
          <View className="gap-2.5 pt-2">
            {rest.map((p, i) => (
              <RankRow key={p.name + i} rank={i + 4} player={p} />
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
