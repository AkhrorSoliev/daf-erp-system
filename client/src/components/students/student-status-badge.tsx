import { Badge } from "@/components/ui/badge";

const statusConfig = {
  active: { label: "Faol", variant: "default" as const },
  frozen: { label: "Muzlatilgan", variant: "secondary" as const },
  ungrouped: { label: "Guruhlashtirilmagan", variant: "outline" as const },
};

export function StudentStatusBadge({
  status,
}: {
  status: "active" | "frozen" | "ungrouped";
}) {
  const config = statusConfig[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
