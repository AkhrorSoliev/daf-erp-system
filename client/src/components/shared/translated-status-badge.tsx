"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/context";
import { getStatusConfig } from "@/lib/status-config";

/** Entities whose labels in `status-config.ts` are `msg()` texts that `t` can translate. */
const TRANSLATED_ENTITIES = new Set(["students", "teachers", "users", "groups", "branches"]);

/**
 * A status chip in the page's language (the shared `StatusBadge` of `ui/` stays
 * Uzbek-only). An unknown status falls back to its raw code, which is data and
 * must not go through `t`.
 */
export function TranslatedStatusBadge({ entityType, status, className }: { entityType: string; status: string; className?: string }) {
  const t = useT();
  const config = getStatusConfig(entityType, status);
  const known = TRANSLATED_ENTITIES.has(entityType) && config.label !== status;
  return <Badge variant={config.variant} className={className}>{known ? t(config.label) : config.label}</Badge>;
}
