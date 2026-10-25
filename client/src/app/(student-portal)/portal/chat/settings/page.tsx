import { ChatGate } from "@/components/student-portal/chat/chat-gate";
import { ChatSettingsPage } from "@/components/student-portal/chat/chat-settings-page";

export default function Page() {
  return (
    <ChatGate>
      <ChatSettingsPage />
    </ChatGate>
  );
}
