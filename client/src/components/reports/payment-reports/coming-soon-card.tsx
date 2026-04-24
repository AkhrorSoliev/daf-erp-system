import type { LucideIcon } from "lucide-react";
import { Clock } from "lucide-react";

interface ComingSoonCardProps {
  icon: LucideIcon;
  label: string;
}

export function ComingSoonCard({ icon: Icon, label }: ComingSoonCardProps) {
  return (
    <div className="flex flex-col rounded-xl border border-dashed bg-muted/30 p-5 h-full">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className="size-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold leading-tight text-muted-foreground/70">
        —
      </p>
      <div className="mt-auto pt-3 flex items-center gap-1.5 text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />
        <span className="text-xs">Tez kunda ishga tushadi</span>
      </div>
    </div>
  );
}
