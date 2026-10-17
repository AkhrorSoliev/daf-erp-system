import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { creditText, unchargedText } from "./attendance-format";
import type { CreditResult } from "./attendance-types";

/** Block 3 (spec §4.3): what the excused lessons take off the next bill — an estimate. */
export function AttendanceCredit({ credit, cancelled }: { credit: CreditResult; cancelled: number }) {
  const uncharged = credit.enabled ? unchargedText(credit.uncharged) : null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Sababli darslar — pulga ta&apos;siri</p>
        <p className="text-sm">{creditText(credit)}</p>
        {uncharged && <p className="text-xs text-muted-foreground">{uncharged}</p>}
        {credit.enabled && credit.lessons > 0 && (
          <p className="text-xs text-muted-foreground">Aniq summa keyingi oy hisoblanganda ma&apos;lum bo&apos;ladi.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Markaz bekor qilgan darslar bu yerga kirmaydi — ular alohida sanaladi ({formatNumber(cancelled)} ta).
        </p>
      </CardContent>
    </Card>
  );
}
