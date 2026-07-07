import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AudioSource } from 'expo-audio';

import { cn } from '@/lib/cn';
import { clay, inset, shadow } from '@/design/shadows';
import { useColors } from '@/design/colors';
import { Text } from './text';

// expo-audio is a NATIVE module. A dev client built before it was added won't
// contain it, and importing throws "Cannot find native module 'ExpoAudio'". Load
// it defensively (like _layout's expo-navigation-bar guard) so the whole app never
// crashes — the player degrades to a disabled state until the dev client is rebuilt.
let ExpoAudio: typeof import('expo-audio') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional guarded native-module load
  ExpoAudio = require('expo-audio');
} catch {
  ExpoAudio = null;
}

export type AudioTone = 'coral' | 'teal' | 'grape' | 'sky' | 'amber';

const TONE: Record<AudioTone, { bg: string; fill: string; clay: any }> = {
  coral: { bg: 'bg-coral-500', fill: '#FF6B4A', clay: clay.coral },
  teal: { bg: 'bg-teal-500', fill: '#14B8AC', clay: clay.teal },
  grape: { bg: 'bg-grape-500', fill: '#8B5CF6', clay: clay.grape },
  sky: { bg: 'bg-sky-500', fill: '#2E97FF', clay: clay.sky },
  amber: { bg: 'bg-amber-500', fill: '#FFB02E', clay: clay.amber },
};

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Shared shell — pill container + play disc + a middle slot + speaker glyph. */
function Shell({
  tone,
  className,
  disc,
  children,
}: {
  tone: AudioTone;
  className?: string;
  disc: React.ReactNode;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View
      className={cn('flex-row items-center gap-3 rounded-pill border border-border bg-surface py-2 pl-2 pr-4', className)}
      style={{ boxShadow: shadow.sm }}
    >
      {disc}
      <View className="flex-1">{children}</View>
      <Ionicons name="volume-medium" size={20} color={colors.fgFaint} />
    </View>
  );
}

/**
 * Lumio audio player — white clay pill with a chunky play/pause disc, a seekable
 * scrubber (tap or drag), and a current/total time readout. Built on expo-audio.
 * Reused by the Hörübung exercise and audio resources.
 */
export function AudioPlayer({
  source,
  tone = 'coral',
  className,
}: {
  source: AudioSource;
  tone?: AudioTone;
  className?: string;
}) {
  if (!ExpoAudio) return <PlayerUnavailable tone={tone} className={className} />;
  return <PlayerLive expo={ExpoAudio} source={source} tone={tone} className={className} />;
}

/** Disabled fallback shown when the native module isn't in the current dev build. */
function PlayerUnavailable({ tone, className }: { tone: AudioTone; className?: string }) {
  const t = TONE[tone];
  return (
    <Shell
      tone={tone}
      className={className}
      disc={
        <View className={cn('h-12 w-12 items-center justify-center rounded-pill opacity-40', t.bg)} style={{ boxShadow: t.clay }}>
          <Ionicons name="play" size={22} color="#FFFFFF" style={{ marginLeft: 2 }} />
        </View>
      }
    >
      <Text variant="muted" className="text-[12px] leading-[16px]">
        Audio uchun ilovani yangilang
      </Text>
    </Shell>
  );
}

/** Live player — only mounted when expo-audio is available (guards hook calls). */
function PlayerLive({
  expo,
  source,
  tone,
  className,
}: {
  expo: NonNullable<typeof ExpoAudio>;
  source: AudioSource;
  tone: AudioTone;
  className?: string;
}) {
  const { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } = expo;
  const t = TONE[tone];
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null); // 0..1 while dragging
  const widthRef = useRef(0);
  const durRef = useRef(0);
  durRef.current = status.duration || 0;

  // Play through the earpiece silent switch (iOS) — playback, not recording.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, [setAudioModeAsync]);

  // Rewind to the start once the clip ends, so the disc shows ▶ again.
  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  const loaded = status.isLoaded && status.duration > 0;
  const played = scrub != null ? scrub : loaded ? Math.min(1, status.currentTime / status.duration) : 0;

  function seekToFrac(frac: number) {
    const clamped = Math.max(0, Math.min(1, frac));
    if (durRef.current > 0) player.seekTo(clamped * durRef.current);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        if (widthRef.current > 0) setScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / widthRef.current)));
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        if (widthRef.current > 0) setScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / widthRef.current)));
      },
      onPanResponderRelease: (e: GestureResponderEvent) => {
        const frac = widthRef.current > 0 ? e.nativeEvent.locationX / widthRef.current : 0;
        seekToFrac(frac);
        setScrub(null);
      },
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;

  const toggle = () => {
    if (!loaded) return;
    if (status.playing) player.pause();
    else {
      if (status.currentTime >= status.duration - 0.05) player.seekTo(0);
      player.play();
    }
  };

  const currentSec = scrub != null ? scrub * status.duration : status.currentTime;

  return (
    <Shell
      tone={tone}
      className={className}
      disc={
        <Pressable onPress={toggle} disabled={!loaded} hitSlop={6} className="active:opacity-90">
          <View
            className={cn('h-12 w-12 items-center justify-center rounded-pill', t.bg, !loaded && 'opacity-60')}
            style={{ boxShadow: t.clay }}
          >
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={22}
              color="#FFFFFF"
              style={status.playing ? undefined : { marginLeft: 2 }}
            />
          </View>
        </Pressable>
      }
    >
      <View className="gap-1.5">
        <View
          className="justify-center"
          style={{ height: 22, marginVertical: -6 }}
          onLayout={(e) => {
            setWidth(e.nativeEvent.layout.width);
            widthRef.current = e.nativeEvent.layout.width;
          }}
          {...pan.panHandlers}
        >
          {/* track well */}
          <View className="h-2 overflow-hidden rounded-pill bg-sunk" style={{ boxShadow: inset.soft }}>
            <View className="h-full rounded-pill" style={{ width: `${played * 100}%`, backgroundColor: t.fill }} />
          </View>
          {/* thumb */}
          {width > 0 ? (
            <View
              pointerEvents="none"
              className="absolute h-4 w-4 rounded-pill border-2 bg-surface"
              style={{ left: Math.max(0, played * width - 8), borderColor: t.fill, boxShadow: shadow.xs }}
            />
          ) : null}
        </View>
        <View className="flex-row justify-between">
          <Text variant="num" className="text-[12px] text-fg-muted">{fmt(currentSec)}</Text>
          <Text variant="num" className="text-[12px] text-fg-faint">{fmt(status.duration)}</Text>
        </View>
      </View>
    </Shell>
  );
}
