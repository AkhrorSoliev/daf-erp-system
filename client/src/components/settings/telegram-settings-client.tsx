"use client";

import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { TelegramGroupsClient } from "./telegram-groups-client";
import { TelegramReportSettingsClient } from "./telegram-report/telegram-report-settings-client";
import { SettingsBlockTabs, useVisibleBlocks } from "./settings-blocks";

const PARTS = {
  guruhlar: <TelegramGroupsClient />,
  hisobot: <TelegramReportSettingsClient />,
};

const LABELS = { guruhlar: msg("Guruhlar"), hisobot: msg("Kunlik hisobot") };

/** «Telegram»: guruhlar va hisobot qabul qiluvchilar; hisobot faqat CEO uchun. */
export function TelegramSettingsClient() {
  const t = useT();
  const labels = { guruhlar: t(LABELS.guruhlar), hisobot: t(LABELS.hisobot) };
  return (
    <SettingsBlockTabs ids={useVisibleBlocks("/settings/telegram")} labels={labels} parts={PARTS} />
  );
}
