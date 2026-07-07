import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge, Card, EmptyState, FadeIn, IconTile, Screen, ScreenHeader, Text, type BadgeTone, type Tone } from '@/design/components';
import { clay, shadow } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useColors } from '@/design/colors';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────────────────────
// DUMMY resource library — Deutsch A1 materials. Wire to the resources backend later.
// ─────────────────────────────────────────────────────────────────────────────

type ResType = 'pdf' | 'audio' | 'video' | 'book' | 'exercise';

type Resource = {
  id: string;
  title: string;
  subtitle: string; // Uzbek description
  type: ResType;
  meta: string; // size or duration
  isNew?: boolean;
};

const TYPE_META: Record<ResType, { label: string; icon: keyof typeof Ionicons.glyphMap; action: keyof typeof Ionicons.glyphMap; tone: Tone; badge: BadgeTone }> = {
  pdf: { label: 'PDF', icon: 'document-text', action: 'download-outline', tone: 'coral', badge: 'coral' },
  audio: { label: 'Audio', icon: 'headset', action: 'play', tone: 'amber', badge: 'warning' },
  video: { label: 'Video', icon: 'play-circle', action: 'play', tone: 'sky', badge: 'teal' },
  book: { label: 'Kitob', icon: 'book', action: 'download-outline', tone: 'grape', badge: 'neutral' },
  exercise: { label: 'Mashq', icon: 'create', action: 'arrow-forward', tone: 'teal', badge: 'success' },
};

const CATEGORIES = [
  { key: 'all', label: 'Barchasi', types: null as ResType[] | null },
  { key: 'grammar', label: 'Grammatika', types: ['pdf', 'exercise'] as ResType[] },
  { key: 'audio', label: 'Audio', types: ['audio'] as ResType[] },
  { key: 'video', label: 'Video', types: ['video'] as ResType[] },
  { key: 'books', label: 'Kitoblar', types: ['book'] as ResType[] },
] as const;

const RESOURCES: Resource[] = [
  { id: 'r1', title: 'Artikel & Nomen', subtitle: 'A1 grammatika · der/die/das qoidalari', type: 'pdf', meta: '2.4 MB', isNew: true },
  { id: 'r2', title: 'Video: Begrüßung', subtitle: "Tanishuv va o'zini tanishtirish", type: 'video', meta: '12:45', isNew: true },
  { id: 'r3', title: 'Hörübung: Im Restaurant', subtitle: 'Restoranda buyurtma tinglash mashqi', type: 'audio', meta: '8:20' },
  { id: 'r4', title: 'Präsens Konjugation', subtitle: "Fe'llarni tuslash · 15 savol", type: 'exercise', meta: '15 savol' },
  { id: 'r5', title: 'Lehrbuch: Menschen A1.1', subtitle: "To'liq darslik (PDF)", type: 'book', meta: '18 MB' },
  { id: 'r6', title: 'Aussprache: ä ö ü', subtitle: 'Umlaut tovushlari talaffuzi', type: 'audio', meta: '5:10' },
  { id: 'r7', title: 'Video: Zahlen 1–100', subtitle: 'Raqamlarni sanash va yozish', type: 'video', meta: '9:30' },
  { id: 'r8', title: 'Wortliste A1', subtitle: "500 ta asosiy so'z ro'yxati", type: 'pdf', meta: '0.9 MB' },
  { id: 'r9', title: 'Dialog: Beim Arzt', subtitle: 'Shifokorda suhbat · audio dialog', type: 'audio', meta: '6:40' },
  { id: 'r10', title: 'Modalverben Übungen', subtitle: "Modal fe'llar · 12 mashq", type: 'exercise', meta: '12 mashq' },
];

// ─────────────────────────────────────────────────────────────────────────────

/** Teal clay "collection of the week" featured banner. */
function FeaturedBanner() {
  const t = useT();
  return (
    <View className="gap-3.5 overflow-hidden rounded-xl bg-teal-500 p-5" style={{ boxShadow: clay.teal }}>
      <View className="flex-row items-start justify-between">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Ionicons name="sparkles" size={26} color="#FFFFFF" />
        </View>
        <View className="rounded-pill bg-white/20 px-3 py-1">
          <Text className="font-bodyx text-[11px] uppercase tracking-[1px] text-white">{t.resurslar.badgeNew}</Text>
        </View>
      </View>
      <View>
        <Text variant="heading" className="text-white">{t.resurslar.featuredTitle}</Text>
        <Text className="mt-0.5 font-body text-[14px] leading-[20px] text-white/85">{t.resurslar.featuredDesc}</Text>
      </View>
      <Pressable className="active:opacity-80">
        <View className="flex-row items-center gap-1.5 self-start rounded-pill bg-white px-4 py-2">
          <Ionicons name="cloud-download" size={16} color={tokens.color.teal} />
          <Text className="font-bodymd text-[13px] text-teal-700">{t.resurslar.featuredDownload}</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Amber clay "Hörübung" card → the Teil 2: Hören interactive listening exercise. */
function HoerubungCard() {
  const t = useT();
  return (
    <Pressable onPress={() => router.push('/hoeren')} className="active:opacity-95">
      <View className="flex-row items-center gap-3.5 overflow-hidden rounded-xl bg-amber-500 p-5" style={{ boxShadow: clay.amber }}>
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Ionicons name="headset" size={26} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="caps" className="text-white/80">Hörübung · A1</Text>
            <View className="rounded-pill bg-white/25 px-2 py-0.5">
              <Text className="font-bodyx text-[10px] uppercase tracking-[1px] text-white">{t.resurslar.badgeNew}</Text>
            </View>
          </View>
          <Text variant="title" className="mt-0.5 text-white">Teil 2: Hören</Text>
          <Text className="mt-0.5 font-body text-[13px] leading-[18px] text-white/85">{t.resurslar.hoerDesc}</Text>
        </View>
        <View className="h-9 w-9 items-center justify-center rounded-pill bg-white">
          <Ionicons name="play" size={18} color={tokens.color.amber} style={{ marginLeft: 2 }} />
        </View>
      </View>
    </Pressable>
  );
}

/** Horizontal, scrollable category filter pills. */
function CategoryChips({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const t = useT();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
      {CATEGORIES.map((c) => {
        const active = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            className={cn(
              'rounded-pill border px-4 py-2',
              active ? 'border-coral-500 bg-coral-500' : 'border-border bg-surface',
            )}
            style={{ boxShadow: active ? undefined : shadow.xs }}
          >
            <Text className={cn('font-bodymd text-[14px]', active ? 'text-white' : 'text-fg-muted')}>{t.resurslar.cat[c.key]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** One material row: type-tinted icon · title/meta · trailing action. */
function ResourceRow({ resource }: { resource: Resource }) {
  const colors = useColors();
  const t = useT();
  const tm = TYPE_META[resource.type];
  return (
    <Pressable className="active:opacity-90">
      <Card className="flex-row items-center gap-3.5">
        <IconTile icon={tm.icon} tone={tm.tone} size={48} />
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text variant="h3" numberOfLines={1} className="flex-shrink">{resource.title}</Text>
            {resource.isNew ? <Badge label={t.resurslar.badgeNew} tone="coral" /> : null}
          </View>
          <View className="flex-row items-center gap-2">
            <Badge label={t.resurslar.type[resource.type]} tone={tm.badge} />
            <Text variant="muted" className="text-[13px]">{t.resurslar.resMeta[resource.id as keyof typeof t.resurslar.resMeta]}</Text>
          </View>
          <Text variant="muted" className="text-[13px]" numberOfLines={1}>{t.resurslar.resSub[resource.id as keyof typeof t.resurslar.resSub]}</Text>
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-sunk">
          <Ionicons name={tm.action} size={18} color={colors.fgMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function Resurslar() {
  const t = useT();
  const [cat, setCat] = useState<string>('all');
  const active = CATEGORIES.find((c) => c.key === cat)!;
  const list = active.types ? RESOURCES.filter((r) => active.types!.includes(r.type)) : RESOURCES;

  return (
    <Screen>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pb-32">
          <FadeIn index={0}>
            <ScreenHeader title={t.resurslar.title} subtitle={t.resurslar.subtitle} />
          </FadeIn>

          <FadeIn index={1}>
            <FeaturedBanner />
          </FadeIn>

          <FadeIn index={2}>
            <HoerubungCard />
          </FadeIn>

          <FadeIn index={3}>
            <CategoryChips value={cat} onChange={setCat} />
          </FadeIn>

          <FadeIn index={4}>
            <View className="flex-row items-center justify-between px-1">
              <Text variant="title">{t.resurslar.cat[active.key]}</Text>
              <Text variant="muted">{t.resurslar.materialsCount(list.length)}</Text>
            </View>
          </FadeIn>

          {list.length === 0 ? (
            <FadeIn index={5}>
              <View className="pt-8">
                <EmptyState icon="folder-open-outline" title={t.resurslar.noMaterials} description={t.resurslar.noMaterialsDesc} />
              </View>
            </FadeIn>
          ) : (
            <View className="gap-2.5">
              {list.map((r, i) => (
                <FadeIn key={r.id} index={5 + i}>
                  <ResourceRow resource={r} />
                </FadeIn>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
