import { RefreshControl, ScrollView, View } from 'react-native';

import { Card, EmptyState, LoadingCards, Screen, Text } from '@/design/components';
import { useAttendanceHistory, useAttendanceStats } from '@/api/queries/use-attendance';
import { ATT_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n/uz';

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <Text variant="muted">{label}</Text>
    </View>
  );
}

function toneForPercent(p: number): string {
  if (p >= 75) return 'text-success';
  if (p >= 50) return 'text-warning';
  return 'text-danger';
}

export default function Attendance() {
  const stats = useAttendanceStats();
  const history = useAttendanceHistory();

  if (stats.isLoading || history.isLoading) return <Screen edges={['top']}><LoadingCards /></Screen>;
  if (stats.isError) {
    return (
      <Screen edges={['top']} className="justify-center">
        <EmptyState title={t.common.error} />
      </Screen>
    );
  }

  const s = stats.data;
  const groups = history.data ?? [];
  const refreshing = stats.isRefetching || history.isRefetching;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              stats.refetch();
              history.refetch();
            }}
          />
        }
      >
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.attendance}</Text>

          {s ? (
            <Card className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text variant="muted">Umumiy davomat</Text>
                <Text variant="heading" className={toneForPercent(s.percentage)}>
                  {s.percentage}%
                </Text>
              </View>

              {s.total > 0 ? (
                <View className="h-3 flex-row overflow-hidden rounded-full bg-surface">
                  {s.present > 0 ? <View className="bg-success" style={{ flex: s.present }} /> : null}
                  {s.late > 0 ? <View className="bg-warning" style={{ flex: s.late }} /> : null}
                  {s.absent > 0 ? <View className="bg-danger" style={{ flex: s.absent }} /> : null}
                  {s.excused > 0 ? <View className="bg-border" style={{ flex: s.excused }} /> : null}
                </View>
              ) : null}

              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <Legend color="bg-success" label={`Keldi: ${s.present}`} />
                <Legend color="bg-warning" label={`Kechikdi: ${s.late}`} />
                <Legend color="bg-danger" label={`Kelmadi: ${s.absent}`} />
                <Legend color="bg-border" label={`Sababli: ${s.excused}`} />
              </View>
            </Card>
          ) : null}

          {groups.map((g) => (
            <View key={g.groupId} className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text variant="title">{g.groupName}</Text>
                <Text variant="label" className={toneForPercent(g.stats.percentage)}>
                  {g.stats.percentage}%
                </Text>
              </View>
              {g.records.length === 0 ? (
                <Text variant="muted">Yozuv yo&apos;q</Text>
              ) : (
                g.records.slice(0, 20).map((r, i) => (
                  <Card key={`${g.groupId}-${i}`} className="flex-row items-center justify-between py-3">
                    <Text variant="body">{formatDate(r.date)}</Text>
                    <Text variant="label" className={ATT_STATUS[r.status]?.tone}>
                      {ATT_STATUS[r.status]?.label ?? r.status}
                    </Text>
                  </Card>
                ))
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
