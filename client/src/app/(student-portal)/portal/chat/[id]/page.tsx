import { notFound } from "next/navigation";
import { ChatGate } from "@/components/student-portal/chat/chat-gate";
import { ChatThreadPage } from "@/components/student-portal/chat/chat-thread-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <ChatGate>
      <ChatThreadPage id={id} />
    </ChatGate>
  );
}
