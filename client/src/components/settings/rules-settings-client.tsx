"use client";

import { AbsencePauseSettingsClient } from "./absence-pause-settings-client";
import { DafNormaSettingsClient } from "./daf-norma-settings-client";
import { BarredLessonsSettingsClient } from "./barred-lessons-settings-client";
import { ParticipationSettingsClient } from "./participation-settings-client";
import { SettingsBlockStack, useVisibleBlocks } from "./settings-blocks";

const PARTS = {
  pauza: (
    <div className="space-y-6">
      <AbsencePauseSettingsClient />
      <BarredLessonsSettingsClient />
    </div>
  ),
  daf: <DafNormaSettingsClient />,
  hujjat: <ParticipationSettingsClient />,
};

/** «O'quv qoidalari»: uch kichik sozlama bir sahifada; kimga nima — `settings-nav.ts` da. */
export function RulesSettingsClient() {
  return <SettingsBlockStack ids={useVisibleBlocks("/settings/rules")} parts={PARTS} />;
}
