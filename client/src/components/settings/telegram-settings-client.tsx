"use client";

import { TelegramGroupsClient } from "./telegram-groups-client";
import { TelegramReportSettingsClient } from "./telegram-report/telegram-report-settings-client";
import { SettingsBlockTabs, useVisibleBlocks } from "./settings-blocks";

const PARTS = {
  guruhlar: <TelegramGroupsClient />,
  hisobot: <TelegramReportSettingsClient />,
};

const LABELS = { guruhlar: "Guruhlar", hisobot: "Kunlik hisobot" };

/** «Telegram»: guruhlar va hisobot qabul qiluvchilar; hisobot faqat CEO uchun. */
export function TelegramSettingsClient() {
  return (
    <SettingsBlockTabs ids={useVisibleBlocks("/settings/telegram")} labels={LABELS} parts={PARTS} />
  );
}
