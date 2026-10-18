import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { markedText } from "@/components/payments/debt-history/marked-text";

/** Students who may still come back — shown only when there are any (spec B7a §4.2). */
export function DepartedPending({ count, graceDays }: { count: number; graceDays: { LEFT_GROUP: number; FROZEN: number } }) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <Card className="bg-amber-500/10">
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          <PhoneCall className="size-4" />
          {t("Hali qaytishi mumkin · bugungi holat")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {markedText(
              t("**{n} o'quvchi** — guruhdan chiqqaniga {left} kun yoki muzlatilganiga {frozen} kun to'lmagan. Qaytmasa, «ketgan» hisoblanadi.", {
                n: formatNumber(count),
                left: graceDays.LEFT_GROUP,
                frozen: graceDays.FROZEN,
              }),
            )}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/outreach">{t("Aloqa markaziga")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
