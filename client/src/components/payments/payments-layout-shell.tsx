"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);

  // Xarajatlar sahifasi faqat CEO (1) va Filial direktori (2) uchun — backend'da
  // ham @Roles('CEO', 'Branch Director'). Admin/Kassir linkni ko'rmaydi va bu yerda
  // to'g'ridan-to'g'ri kirsa /payments ga qaytariladi.
  const canSeeExpenses = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const blockExpenses =
    !!user && pathname.startsWith("/payments/expenses") && !canSeeExpenses;

  useEffect(() => {
    if (blockExpenses) {
      router.replace("/payments");
    }
  }, [blockExpenses, router]);

  if (blockExpenses) {
    return null;
  }

  const isPaymentsRoot = pathname === "/payments" || pathname === "/payments/";

  if (isMobile && isPaymentsRoot) {
    return (
      <div className="space-y-4">
        <PaymentsMobileMenu />
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
