import { Screen, EmptyState } from '@/design/components';
import { t } from '@/i18n/uz';

export default function Payments() {
  return (
    <Screen edges={['top']} className="justify-center">
      <EmptyState title={t.placeholders.payments} description={t.placeholders.comingSoon} />
    </Screen>
  );
}
