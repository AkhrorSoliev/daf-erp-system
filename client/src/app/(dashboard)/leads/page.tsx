import { LeadsClient } from "@/components/leads/leads-client";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Lidlar
        </h1>
        <p className="text-muted-foreground">
          Telegram bot orqali ro&apos;yxatdan o&apos;tgan lidlar
        </p>
      </div>
      <LeadsClient />
    </div>
  );
}
