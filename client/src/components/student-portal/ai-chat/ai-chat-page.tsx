"use client";

import { AiGreeting } from "../ai-greeting";
import { AiModeSelector } from "./ai-mode-selector";
import { AiConversationList } from "./ai-conversation-list";
import { Screen, ScreenHeader } from "../lumio";

export function AiChatPage() {
  return (
    <Screen>
      <ScreenHeader subtitle="Dein KI-Assistent" title="Deutsch Tutor" />
      <AiGreeting />
      <AiModeSelector />
      <AiConversationList />
    </Screen>
  );
}
