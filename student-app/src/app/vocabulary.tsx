import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Canvas, Circle, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';

import { Card, Screen, StackHeader, Text } from '@/design/components';
import { tokens } from '@/design/tokens';
import { inset, shadow } from '@/design/shadows';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

// --- DUMMY vocab data (no vocab backend yet) ---
const YANGI_SOZLAR = 12; // words added recently
const BARCHA_SOZLAR = 148; // total words in the student's dictionary
const NEW_COLOR = tokens.color.sky; // "Yangi so'zlar" series
const LEARNING_COLOR = tokens.color.amber; // "O'rganilayotgan so'zlar" series

const PERIODS = ['7 kun', '1 oy', '6 oy', '1 yil'] as const;
type Period = (typeof PERIODS)[number];

// Per-period daily activity (neu = new words, lern = words practised).
const DATA: Record<Period, { neu: number[]; lern: number[] }> = {
  '7 kun': { neu: [2, 0, 3, 1, 4, 0, 2], lern: [5, 6, 4, 8, 7, 9, 6] },
  '1 oy': { neu: [9, 14, 7, 12], lern: [20, 26, 18, 24] },
  '6 oy': { neu: [30, 42, 35, 50, 44, 55], lern: [60, 80, 72, 95, 88, 110] },
  '1 yil': { neu: [120, 150, 135, 180, 165, 210], lern: [200, 260, 240, 300, 280, 340] },
};

function niceCeil(v: number): number {
  if (v <= 10) return Math.max(2, Math.ceil(v / 2) * 2);
  if (v <= 100) return Math.ceil(v / 10) * 10;
  return Math.ceil(v / 50) * 50;
}

/** X-axis labels per period. Weekday/month names come from the active dictionary. */
function xLabels(period: Period, weekday: string[], month: string[], weekLabels: string[]): string[] {
  const today = new Date();
  if (period === '7 kun') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return weekday[d.getDay()];
    });
  }
  if (period === '1 oy') return weekLabels;
  if (period === '6 oy') {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today);
      d.setMonth(today.getMonth() - (5 - i));
      return month[d.getMonth()];
    });
  }
  // 1 yil — bimonthly (6 points) to avoid crowding
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today);
    d.setMonth(today.getMonth() - (10 - i * 2));
    return month[d.getMonth()];
  });
}

/** Soft-tint banner: big Baloo label left, white number chip right. */
function StatBanner({ label, value, bg }: { label: string; value: number; bg: string }) {
  return (
    <View className={cn('flex-row items-center justify-between overflow-hidden rounded-xl p-5', bg)}>
      <Text variant="heading" className="flex-1">{label}</Text>
      <View className="min-w-[64px] items-center rounded-lg bg-surface px-4 py-2.5" style={{ boxShadow: shadow.sm }}>
        <Text variant="num" className="text-[26px]">{value}</Text>
      </View>
    </View>
  );
}

function Segmented({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useT();
  return (
    <View className="flex-row rounded-pill bg-sunk p-1" style={{ boxShadow: inset.soft }}>
      {PERIODS.map((p) => {
        const active = p === value;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            className={cn('flex-1 items-center rounded-pill py-2', active && 'bg-surface')}
            style={active ? { boxShadow: shadow.sm } : undefined}
          >
            <Text className={cn('font-bodymd text-[14px]', active ? 'text-fg' : 'text-fg-muted')}>{t.vocabulary.period[p]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PLOT_H = 180;
const ROWS = 4;

/** Line chart: y-ticks + gridlines (Views) with two Skia series (area + line + points). */
function Chart({ neu, lern, labels, maxY }: { neu: number[]; lern: number[]; labels: string[]; maxY: number }) {
  const [w, setW] = useState(0);
  const ticks = Array.from({ length: ROWS + 1 }, (_, i) => Math.round((maxY * (ROWS - i)) / ROWS)); // top→bottom
  const H = PLOT_H;

  const pointsOf = (vals: number[]) =>
    vals.map((v, i) => ({
      x: vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w,
      y: H - (Math.max(0, v) / maxY) * H,
    }));
  const lineOf = (vals: number[]) => {
    const p = Skia.Path.Make();
    pointsOf(vals).forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)));
    return p;
  };
  const areaOf = (vals: number[]) => {
    const p = lineOf(vals);
    p.lineTo(w, H);
    p.lineTo(0, H);
    p.close();
    return p;
  };

  return (
    <View>
      <View className="flex-row" style={{ height: H }}>
        {/* Y axis labels */}
        <View className="w-6 justify-between">
          {ticks.map((tk, i) => (
            <Text key={i} className="text-right font-body text-[11px] text-fg-faint">{tk}</Text>
          ))}
        </View>

        {/* Plot area */}
        <View className="relative ml-1.5 flex-1" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {/* vertical gridlines */}
          <View className="absolute inset-0 flex-row">
            {labels.map((_, i) => (
              <View key={i} className="flex-1 items-end">
                <View className="h-full w-px bg-border" />
              </View>
            ))}
          </View>
          {/* horizontal gridlines */}
          {ticks.map((_, i) => (
            <View key={i} className="absolute left-0 right-0 h-px bg-border" style={{ top: (H / ROWS) * i }} />
          ))}
          {/* Skia series */}
          {w > 0 ? (
            <Canvas style={{ position: 'absolute', top: 0, left: 0, width: w, height: H }}>
              <Path path={areaOf(lern)}>
                <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['rgba(255,176,46,0.28)', 'rgba(255,176,46,0)']} />
              </Path>
              <Path path={areaOf(neu)}>
                <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['rgba(46,151,255,0.28)', 'rgba(46,151,255,0)']} />
              </Path>
              <Path path={lineOf(lern)} style="stroke" strokeWidth={3} strokeJoin="round" strokeCap="round" color={LEARNING_COLOR} />
              <Path path={lineOf(neu)} style="stroke" strokeWidth={3} strokeJoin="round" strokeCap="round" color={NEW_COLOR} />
              {pointsOf(lern).map((pt, i) => (
                <Circle key={`l${i}`} cx={pt.x} cy={pt.y} r={3.5} color={LEARNING_COLOR} />
              ))}
              {pointsOf(neu).map((pt, i) => (
                <Circle key={`n${i}`} cx={pt.x} cy={pt.y} r={3.5} color={NEW_COLOR} />
              ))}
            </Canvas>
          ) : null}
        </View>
      </View>

      {/* X axis labels */}
      <View className="flex-row pl-[30px] pt-2">
        {labels.map((l, i) => (
          <Text key={i} numberOfLines={1} className="flex-1 text-center font-body text-[11px] text-fg-muted">{l}</Text>
        ))}
      </View>
    </View>
  );
}

function LegendRow({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border py-3">
      <Text variant="num" className="w-9 text-[16px]">{count}</Text>
      <View className="h-6 w-6 rounded-md" style={{ backgroundColor: color }} />
      <Text variant="body" className="flex-1">{label}</Text>
    </View>
  );
}

export default function Vocabulary() {
  const t = useT();
  const [period, setPeriod] = useState<Period>('7 kun');
  const labels = xLabels(period, t.vocabulary.weekday, t.vocabulary.month, t.vocabulary.weekLabels);
  const { neu, lern } = DATA[period];
  const maxY = niceCeil(Math.max(...neu, ...lern, 1));
  const totalNeu = neu.reduce((a, b) => a + b, 0);
  const totalLern = lern.reduce((a, b) => a + b, 0);

  return (
    <Screen>
      <StackHeader title={t.home.vocabTitle} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pt-2">
          <StatBanner label={t.vocabulary.newWords} value={YANGI_SOZLAR} bg="bg-grape-100 dark:bg-grape-500/20" />
          <StatBanner label={t.vocabulary.allWords} value={BARCHA_SOZLAR} bg="bg-amber-50 dark:bg-amber-500/20" />

          <Card className="gap-4">
            <Segmented value={period} onChange={setPeriod} />
            <Chart neu={neu} lern={lern} labels={labels} maxY={maxY} />
            <View className="pt-1">
              <View className="border-b border-border pb-2">
                <Text variant="label">{t.vocabulary.period[period]}</Text>
              </View>
              <LegendRow count={totalNeu} color={NEW_COLOR} label={t.vocabulary.newWords} />
              <LegendRow count={totalLern} color={LEARNING_COLOR} label={t.vocabulary.learningWords} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
