import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** A page that used to be a tab of /payments/debt (spec B2a §2.6): the same view, its own title, the way back. */
export function DebtSubpage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <Link href="/payments/debt" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Qarzdorlik
      </Link>
      <h1 className="font-heading text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
