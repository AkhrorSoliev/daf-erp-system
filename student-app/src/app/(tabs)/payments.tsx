import { RefreshControl, ScrollView, View } from 'react-native';

import { Card, EmptyState, Loading, Screen, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { usePayments } from '@/api/queries/use-payments';
import { formatDate, formatSom } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/labels';
import { t } from '@/i18n/uz';

export default function Payments() {
  const profile = useProfile();
  const pay = usePayments();

  if (profile.isLoading || pay.isLoading) return <Screen edges={['top']}><Loading /></Screen>;

  const balance = profile.data?.balance ?? 0;
  const payments = pay.data?.payments ?? [];
  const refreshing = profile.isRefetching || pay.isRefetching;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              profile.refetch();
              pay.refetch();
            }}
          />
        }
      >
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.payments}</Text>

          <Card>
            <Text variant="muted">{t.home.balance}</Text>
            <Text variant="heading" className={balance < 0 ? 'mt-1 text-danger' : 'mt-1 text-success'}>
              {formatSom(balance)}
            </Text>
          </Card>

          {/* Online to'lov (Payme/Click) — Phase 2 */}

          <View className="gap-2">
            <Text variant="title">To&apos;lovlar tarixi</Text>
            {payments.length === 0 ? (
              <EmptyState title="To'lovlar yo'q" />
            ) : (
              payments.map((p) => (
                <Card key={p.id} className="flex-row items-center justify-between py-3">
                  <View>
                    <Text variant="label">{formatSom(p.amount)}</Text>
                    <Text variant="muted">
                      {paymentMethodLabel(p.method)} · {formatDate(p.createdAt)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
