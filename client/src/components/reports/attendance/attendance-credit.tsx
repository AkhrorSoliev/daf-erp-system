import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { creditText, unchargedText } from "./attendance-format";
import type { CreditResult } from "./attendance-types";

/** Block 3 (spec §4.3): what the excused lessons take off the next bill — an estimate. */
export function AttendanceCredit({ credit, cancelled }: { credit: CreditResult; cancelled: number }) {
  const t = useT();
  const uncharged = credit.enabled ? unchargedText(credit.uncharged, t) : null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">{t("Sababli darslar — pulga ta'siri")}</p>
        <p className="text-sm">{creditText(credit, t)}</p>
        {uncharged && <p className="text-xs text-muted-foreground">{uncharged}</p>}
        {credit.enabled && credit.lessons > 0 && (
          <p className="text-xs text-muted-foreground">{t("Aniq summa keyingi oy hisoblanganda ma'lum bo'ladi.")}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Markaz bekor qilgan darslar bu yerga kirmaydi — ular alohida sanaladi ({n} ta).", { n: formatNumber(cancelled) })}
        </p>
      </CardContent>
    </Card>
  );
}
