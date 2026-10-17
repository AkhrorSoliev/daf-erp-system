import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";

/** Students who may still come back — shown only when there are any (spec B7a §4.2). */
export function DepartedPending({ count, graceDays }: { count: number; graceDays: { LEFT_GROUP: number; FROZEN: number } }) {
  if (count <= 0) return null;
  return (
    <Card className="bg-amber-500/10">
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          <PhoneCall />
          Hali qaytishi mumkin · bugungi holat
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <b>{formatNumber(count)} o&apos;quvchi</b> — guruhdan chiqqaniga {graceDays.LEFT_GROUP} kun yoki muzlatilganiga {graceDays.FROZEN} kun
            to&apos;lmagan. Qaytmasa, «ketgan» hisoblanadi.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/outreach">Aloqa markaziga</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
