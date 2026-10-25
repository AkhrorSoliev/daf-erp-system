import { ChatGate } from "@/components/student-portal/chat/chat-gate";
import { ChatThreadPage } from "@/components/student-portal/chat/chat-thread-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ChatGate>
      <ChatThreadPage id={id} />
    </ChatGate>
  );
}
