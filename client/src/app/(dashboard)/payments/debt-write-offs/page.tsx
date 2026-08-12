import { DebtWriteOffsClient } from "@/components/payments/debt-write-offs-client";

// The heading lives here rather than in the client, because that client is
// also a tab on /payments/debt where this title would be the second one on
// screen. Whoever renders it knows what the reader is already looking at.
export default function DebtWriteOffsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Qarz hisobdan chiqarishlar
        </h2>
        <p className="text-sm text-muted-foreground">
          &quot;Yo&apos;qolgan o&apos;quvchi&quot; flow ostida joriy sikldan
          hisobdan chiqarilgan qarzlar jurnali
        </p>
      </header>
      <DebtWriteOffsClient />
    </div>
  );
}
