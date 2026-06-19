import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { Button, EmptyState, ListRow, LoadingCards, Screen, ScreenHeader, Text } from '@/design/components';
import { clay } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useProfile } from '@/api/queries/use-profile';
import { formatSom } from '@/lib/format';
import { dayLabel } from '@/lib/labels';
import { t } from '@/i18n/uz';

export default function Home() {
  const q = useProfile();

  if (q.isLoading) return <Screen edges={['top']}><LoadingCards /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen edges={['top']} className="justify-center">
        <EmptyState icon="cloud-offline-outline" title={t.common.error} description="Ma'lumotni yuklab bo'lmadi" />
      </Screen>
    );
  }

  const p = q.data;
  const inDebt = p.balance < 0;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={tokens.color.primary} />
        }
      >
        <View className="gap-4 p-5 pb-32">
          <ScreenHeader subtitle={t.home.greeting} title={`${p.firstName} ${p.lastName}`.trim()} />

          {/* Balance hero — coral clay card */}
          <View className="overflow-hidden rounded-2xl bg-coral-500 p-5" style={{ boxShadow: clay.coral }}>
            <Text className="font-bodyx text-[11px] uppercase tracking-[1px] text-white/80">{t.home.balance}</Text>
            <Text variant="num" className="mt-1 text-[34px] leading-[40px] text-white">
              {formatSom(p.balance)}
            </Text>
            <View className="mt-3 self-start rounded-pill bg-white/20 px-3 py-1">
              <Text className="font-bodymd text-[12px] text-white">{inDebt ? 'Qarzdorlik mavjud' : 'Joriy balans'}</Text>
            </View>
          </View>

          <Button label="QR bilan davomatga belgilash" variant="teal" iconBefore="qr-code" onPress={() => router.push('/scan')} />

          <View className="gap-2.5">
            <Text variant="title">Guruhlarim</Text>
            {p.groups.length === 0 ? (
              <EmptyState icon="people-outline" title="Faol guruh yo'q" />
            ) : (
              p.groups.map((g) => (
                <ListRow
                  key={g.id}
                  icon="people"
                  tone="grape"
                  label={g.name}
                  subtitle={[
                    g.course_name,
                    g.exactDays.map(dayLabel).join(', ') + (g.lessonStartTime ? ` · ${g.lessonStartTime}–${g.lessonEndTime ?? ''}` : ''),
                    g.teachers.length ? "O'qituvchi: " + g.teachers.map((tt) => `${tt.firstName} ${tt.lastName}`).join(', ') : null,
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
