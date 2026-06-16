import { Screen, EmptyState } from '@/design/components';
import { t } from '@/i18n/uz';

export default function Schedule() {
  return (
    <Screen edges={['top']} className="justify-center">
      <EmptyState title={t.placeholders.schedule} description={t.placeholders.comingSoon} />
    </Screen>
  );
}
