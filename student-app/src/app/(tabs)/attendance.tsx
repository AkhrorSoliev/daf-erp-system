import { RefreshControl, ScrollView, View } from 'react-native';

import { Card, EmptyState, Loading, Screen, Text } from '@/design/components';
import { useAttendanceHistory, useAttendanceStats } from '@/api/queries/use-attendance';
import { ATT_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { t } from '@/i18n/uz';

export default function Attendance() {
  const stats = useAttendanceStats();
  const history = useAttendanceHistory();

  if (stats.isLoading || history.isLoading) return <Screen edges={['top']}><Loading /></Screen>;
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
            <Card className="gap-2">
              <View className="flex-row items-end justify-between">
                <Text variant="muted">Umumiy davomat</Text>
                <Text variant="heading">{s.percentage}%</Text>
              </View>
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <Text variant="muted">Keldi: {s.present}</Text>
                <Text variant="muted">Kechikdi: {s.late}</Text>
                <Text variant="muted">Kelmadi: {s.absent}</Text>
                <Text variant="muted">Sababli: {s.excused}</Text>
              </View>
            </Card>
          ) : null}

          {groups.map((g) => (
            <View key={g.groupId} className="gap-2">
              <Text variant="title">{g.groupName}</Text>
              {g.records.length === 0 ? (
                <Text variant="muted">Davomat yozuvi yo&apos;q</Text>
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
