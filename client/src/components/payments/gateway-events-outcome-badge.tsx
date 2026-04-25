import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Outcome } from "./gateway-events-helpers";

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (outcome === "success") {
    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300"
      >
        <CheckCircle2 className="size-3 mr-1" />
        Muvaffaqiyatli
      </Badge>
    );
  }
  if (outcome === "pending") {
    return (
      <Badge
        variant="outline"
        className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300"
      >
        <Clock className="size-3 mr-1" />
        Kutilmoqda
      </Badge>
    );
  }
  if (outcome === "rejected") {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300"
      >
        <XCircle className="size-3 mr-1" />
        Xavfsizlik xatosi
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300"
    >
      <XCircle className="size-3 mr-1" />
      Xato
    </Badge>
  );
}
