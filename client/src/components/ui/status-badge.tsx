"use client";

import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/lib/status-config";

interface StatusBadgeProps {
  entityType: string;
  status: string;
  className?: string;
}

export function StatusBadge({ entityType, status, className }: StatusBadgeProps) {
  const config = getStatusConfig(entityType, status);

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
