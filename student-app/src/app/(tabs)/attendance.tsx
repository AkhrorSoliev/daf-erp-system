import { Screen, EmptyState } from '@/design/components';
import { t } from '@/i18n/uz';

export default function Attendance() {
  return (
    <Screen edges={['top']} className="justify-center">
      <EmptyState title={t.placeholders.attendance} description={t.placeholders.comingSoon} />
    </Screen>
  );
}
