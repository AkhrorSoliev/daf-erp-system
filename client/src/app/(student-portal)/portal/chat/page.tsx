import { ChatGate } from "@/components/student-portal/chat/chat-gate";
import { ChatListPage } from "@/components/student-portal/chat/chat-list-page";

export default function ChatPage() {
  return (
    <ChatGate>
      <ChatListPage />
    </ChatGate>
  );
}
