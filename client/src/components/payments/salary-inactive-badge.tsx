"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";

/**
 * "Nofaol" — bo'shatilgan/to'xtatilgan xodim yoki ustoz qatorining belgisi.
 *
 * Ish haqi jadvallari faol emas odamni ko'rsatmaydi — u faqat o'sha oyda hali
 * puli qolgan bo'lsa qoladi (server: `SalaryMonthlyService` Step 5+6 filtri va
 * `SalaryStaffMonthlyService` ning "monthly === 0 && !payment" tashlashi).
 * Shuning uchun bu belgi ko'ringan joyda u doim bitta ma'noni bildiradi:
 * "bu odam endi ishlamaydi, lekin bu oyning puli hali yopilmagan".
 *
 * Ikkala jadvalda bitta komponent — matn ham, izoh ham ikki joyda ayri
 * ketmasligi uchun. `salary-staff-config-list` dagi belgi bilan bir xil so'z
 * ("Nofaol"), chunki u ham xuddi shu holatni bildiradi.
 */
export function SalaryInactiveBadge() {
  const t = useT();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-normal text-muted-foreground"
          >
            {t("Nofaol")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">
          {t(
            "Ishdan bo'shagan. Ro'yxatda turibdi, chunki bu oyning puli hali yopilmagan — yopilgach o'zi tushib qoladi.",
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
