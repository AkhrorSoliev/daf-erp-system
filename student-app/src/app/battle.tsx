import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, IconTile, Screen, StackHeader, Text, type Tone } from '@/design/components';
import { shadow } from '@/design/shadows';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

type BattleKey = 'ai' | 'duel' | 'group';
type LobbyKey = 'grammar' | 'vocab';

const BATTLE_TYPES: {
  key: BattleKey;
  titleKey: 'aiTitle' | 'duelTitle' | 'groupTitle';
  subKey: 'aiSub' | 'duelSub' | 'groupSub';
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}[] = [
  { key: 'ai', titleKey: 'aiTitle', subKey: 'aiSub', icon: 'hardware-chip', tone: 'sky' },
  { key: 'duel', titleKey: 'duelTitle', subKey: 'duelSub', icon: 'flash', tone: 'coral' },
  { key: 'group', titleKey: 'groupTitle', subKey: 'groupSub', icon: 'people', tone: 'teal' },
];

// Lobby (battle topic) — German to match the home skill bars (Grammatik / Wortschatz).
const LOBBY_TYPES: { key: LobbyKey; label: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone }[] = [
  { key: 'grammar', label: 'Grammatik', icon: 'book', tone: 'amber' },
  { key: 'vocab', label: 'Wortschatz', icon: 'albums', tone: 'ink' },
];

/** Selection frame — transparent border by default, grape ring + tint when picked. */
function selectClass(selected: boolean): string {
  return cn(
    'overflow-hidden rounded-xl border-2',
    selected ? 'border-grape-500 bg-grape-100 dark:bg-grape-500/15' : 'border-transparent bg-surface',
  );
}

function BattleTypeCard({
  title,
  subtitle,
  icon,
  tone,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-90">
      <View className={cn('flex-row items-center gap-3 p-4', selectClass(selected))} style={{ boxShadow: shadow.card }}>
        <View className="flex-1 gap-1">
          <Text variant="title">{title}</Text>
          <Text variant="muted">{subtitle}</Text>
        </View>
        <IconTile icon={icon} tone={tone} size={64} />
      </View>
    </Pressable>
  );
}

function LobbyCard({
  label,
  icon,
  tone,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-90">
      <View className={cn('items-center gap-3 p-5', selectClass(selected))} style={{ boxShadow: shadow.sm }}>
        <IconTile icon={icon} tone={tone} size={72} />
        <Text variant="title">{label}</Text>
      </View>
    </Pressable>
  );
}

export default function Battle() {
  const t = useT();
  const [battle, setBattle] = useState<BattleKey>('ai');
  const [lobby, setLobby] = useState<LobbyKey>('grammar');

  function start() {
    router.push({ pathname: '/battle-play', params: { battle, lobby } });
  }

  return (
    <Screen>
      <StackHeader title={t.battle.headerStart} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-3.5 p-5 pt-2">
          <Text variant="title">{t.battle.chooseType}</Text>
          {BATTLE_TYPES.map((b) => (
            <BattleTypeCard
              key={b.key}
              title={t.battle[b.titleKey]}
              subtitle={t.battle[b.subKey]}
              icon={b.icon}
              tone={b.tone}
              selected={battle === b.key}
              onPress={() => setBattle(b.key)}
            />
          ))}

          <Text variant="title" className="mt-2">{t.battle.chooseLobby}</Text>
          <View className="flex-row gap-3.5">
            {LOBBY_TYPES.map((l) => (
              <LobbyCard
                key={l.key}
                label={l.label}
                icon={l.icon}
                tone={l.tone}
                selected={lobby === l.key}
                onPress={() => setLobby(l.key)}
              />
            ))}
          </View>

          <Button label={t.battle.start} variant="grape" size="lg" className="mt-3" onPress={start} />
        </View>
      </ScrollView>
    </Screen>
  );
}
