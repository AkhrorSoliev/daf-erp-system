"use client";

import { AiGreeting } from "../ai-greeting";
import { AiModeSelector } from "./ai-mode-selector";
import { AiConversationList } from "./ai-conversation-list";

export function AiChatPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <AiGreeting />
      <AiModeSelector />
      <AiConversationList />
    </div>
  );
}
