"use client";

import { KpiSettingsClient } from "./kpi-settings-client";
import { LeadOwnershipSettingsClient } from "./lead-ownership-settings-client";
import { SettingsBlockStack, useVisibleBlocks } from "./settings-blocks";

const PARTS = {
  lidlar: <LeadOwnershipSettingsClient />,
  kpi: <KpiSettingsClient />,
};

/** «Lidlar va KPI»: ikkalasini ham faqat CEO o'zgartiradi (`settings-nav.ts`). */
export function LeadsKpiSettingsClient() {
  return <SettingsBlockStack ids={useVisibleBlocks("/settings/leads-kpi")} parts={PARTS} />;
}
