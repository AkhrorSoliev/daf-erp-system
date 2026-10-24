import { UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CanLink } from "@/components/shared/can-link";
import { useT } from "@/i18n/context";
import { streakText } from "./attendance-format";

/** «Ketma-ket kelmayotganlar» (spec §4): today's state from the outreach rule, not the period's. */
export function AttendanceStreak({ count }: { count: number }) {
  const t = useT();
  return (
    <Card className="border-warning/40">
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-warning">
          <UserX className="size-4" aria-hidden />
          {t("Ketma-ket kelmayotganlar")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {count > 0 ? streakText(count, t) : t("Hozir 3 va undan ko'p darsga ketma-ket kelmagan o'quvchi yo'q.")}
          </p>
          <CanLink perm="outreach.view" href="/outreach" className="text-sm" linkClassName="font-medium text-primary hover:underline">
            {t("Aloqa markaziga")} →
          </CanLink>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Bu bugungi holat, tanlangan davrga bog'liq emas. Hisob biroz farq qiladi: oldindan aytilgan sababsiz yo'qlik kelmagan hisoblanadi, markaz bekor qilgan darslar ko'rinmaydi, faqat faol o'quvchilar sanaladi.")}
        </p>
      </CardContent>
    </Card>
  );
}
