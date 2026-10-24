"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useT } from "@/i18n/context";

/**
 * A page that used to be a tab of /payments/debt (spec B2a §2.6): the same view, its own title, the way back.
 * `title` is a `msg()` text from the route page, drawn with `t()`.
 * `PropsWithChildren` (optional children) is what lets `createElement(DebtSubpage, { title }, child)` type-check.
 */
export function DebtSubpage({ title, children }: PropsWithChildren<{ title: string }>) {
  const t = useT();
  return (
    <div className="space-y-4">
      <Link href="/payments/debt" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />
        {t("Qarzdorlik")}
      </Link>
      <h1 className="font-heading text-lg font-semibold tracking-tight">{t(title)}</h1>
      {children}
    </div>
  );
}
