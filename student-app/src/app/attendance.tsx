import { RefreshControl, ScrollView, View } from 'react-native';

import { Badge, Card, EmptyState, LoadingCards, ProgressBar, Screen, StackHeader, Text, type BadgeTone } from '@/design/components';
import { tokens } from '@/design/tokens';
import { useAttendanceHistory, useAttendanceStats } from '@/api/queries/use-attendance';
import { formatDate } from '@/lib/format';
import { attStatus } from '@/lib/labels';
import { useT } from '@/i18n';
import type { AttendanceStatus } from '@/api/types';

// Badge only accepts BadgeTone — attStatus()'s tone is a Tailwind text-color
// class (shared shape with labels.ts), so map status → BadgeTone locally.
const BADGE_TONE: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  EXCUSED: 'neutral',
};

const SEG = { present: tokens.color.success, late: tokens.color.warning, absent: tokens.color.danger, excused: '#9DB0BC' };

function percentClass(p: number): string {
  if (p >= 75) return 'text-success';
  if (p >= 50) return 'text-amber-600';
  return 'text-danger';
}
function percentTone(p: number): BadgeTone {
  if (p >= 75) return 'success';
  if (p >= 50) return 'warning';
  return 'danger';
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text variant="muted">{label}</Text>
    </View>
  );
}

export default function Attendance() {
  const t = useT();
  const stats = useAttendanceStats();
  const history = useAttendanceHistory();

  if (stats.isLoading || history.isLoading) return <Screen><LoadingCards /></Screen>;
  if (stats.isError) {
    return (
      <Screen>
        <StackHeader title={t.tabs.attendance} />
        <EmptyState icon="cloud-offline-outline" title={t.common.error} />
      </Screen>
    );
  }

  const s = stats.data;
  const groups = history.data ?? [];
  const refreshing = stats.isRefetching || history.isRefetching;
  const status = attStatus(t);

  return (
    <Screen>
      <StackHeader title={t.tabs.attendance} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={tokens.color.primary}
            onRefresh={() => {
              stats.refetch();
              history.refetch();
            }}
          />
        }
      >
        <View className="gap-5 p-5 pt-2">
          {s ? (
            <Card className="gap-3.5">
              <View className="flex-row items-center justify-between">
                <Text variant="muted">{t.attendance.total}</Text>
                <Text variant="num" className={`text-[30px] ${percentClass(s.percentage)}`}>{s.percentage}%</Text>
              </View>

              {s.total > 0 ? (
                <ProgressBar
                  segments={[
                    { value: s.present, color: SEG.present },
                    { value: s.late, color: SEG.late },
                    { value: s.absent, color: SEG.absent },
                    { value: s.excused, color: SEG.excused },
                  ]}
                />
              ) : null}

              <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
                <Legend color={SEG.present} label={`${t.attendance.present}: ${s.present}`} />
                <Legend color={SEG.late} label={`${t.attendance.late}: ${s.late}`} />
                <Legend color={SEG.absent} label={`${t.attendance.absent}: ${s.absent}`} />
                <Legend color={SEG.excused} label={`${t.attendance.excused}: ${s.excused}`} />
              </View>
            </Card>
          ) : null}

          {groups.map((g) => (
            <View key={g.groupId} className="gap-2.5">
              <View className="flex-row items-center justify-between px-1">
                <Text variant="title" className="flex-1">{g.groupName}</Text>
                <Badge label={`${g.stats.percentage}%`} tone={percentTone(g.stats.percentage)} />
              </View>
              {g.records.length === 0 ? (
                <Text variant="muted" className="px-1">{t.attendance.noRecords}</Text>
              ) : (
                g.records.slice(0, 20).map((r, i) => (
                  <View
                    key={`${g.groupId}-${i}`}
                    className="flex-row items-center justify-between rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <Text variant="bodyStrong">{formatDate(r.date)}</Text>
                    <Badge label={status[r.status]?.label ?? r.status} tone={BADGE_TONE[r.status] ?? 'neutral'} />
                  </View>
                ))
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
