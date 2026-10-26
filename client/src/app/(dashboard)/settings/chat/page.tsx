import { Suspense } from "react";
import { ChatSettingsPage } from "@/components/settings/chat/chat-settings-page";

export default function ChatSettingsRoute() {
  return (
    <Suspense>
      <ChatSettingsPage />
    </Suspense>
  );
}
