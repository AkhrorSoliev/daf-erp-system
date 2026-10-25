import { ChatGate } from "@/components/student-portal/chat/chat-gate";
import { NewChatPage } from "@/components/student-portal/chat/new-chat-page";

export default function Page() {
  return (
    <ChatGate>
      <NewChatPage />
    </ChatGate>
  );
}
