"use client";

import { AbsencePauseSettingsClient } from "./absence-pause-settings-client";
import { DafNormaSettingsClient } from "./daf-norma-settings-client";
import { ParticipationSettingsClient } from "./participation-settings-client";
import { SettingsBlockStack, useVisibleBlocks } from "./settings-blocks";

const PARTS = {
  pauza: <AbsencePauseSettingsClient />,
  daf: <DafNormaSettingsClient />,
  hujjat: <ParticipationSettingsClient />,
};

/** «O'quv qoidalari»: uch kichik sozlama bir sahifada; kimga nima — `settings-nav.ts` da. */
export function RulesSettingsClient() {
  return <SettingsBlockStack ids={useVisibleBlocks("/settings/rules")} parts={PARTS} />;
}
