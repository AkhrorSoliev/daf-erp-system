"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

const CEO_BD_ONLY_PATHS = ["/payments/expenses", "/payments/salary"];

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);

  // Xarajatlar va Ish haqi sahifalari faqat CEO (1) va Filial direktori (2)
  // uchun — backend'da ham @Roles('CEO', 'Branch Director'). Admin/Kassir
  // linkni ko'rmaydi va bu yerga to'g'ridan-to'g'ri (yoki eski
  // «?tab=markaz» havolasi orqali) kirsa /payments ga qaytariladi.
  const isCeoOrDirector = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const blocked =
    !!user &&
    !isCeoOrDirector &&
    CEO_BD_ONLY_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (blocked) {
      router.replace("/payments");
    }
  }, [blocked, router]);

  if (blocked) {
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
