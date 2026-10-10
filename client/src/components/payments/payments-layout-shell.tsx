"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

// Path prefix -> the role ids that may open it (the backend's @Roles of its endpoints).
const ROLE_GATED_PATHS: { prefix: string; roles: number[] }[] = [
  { prefix: "/payments/expenses", roles: [1, 2] },
  { prefix: "/payments/salary", roles: [1, 2] },
  // «Qaytariladigan pul» and its history: CEO, Branch Director, Administrator, Cashier.
  { prefix: "/payments/refunds", roles: [1, 2, 3, 5] },
];

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);

  // Xarajatlar va Ish haqi sahifalari faqat CEO (1) va Filial direktori (2)
  // uchun — backend'da ham @Roles('CEO', 'Branch Director'). Admin/Kassir
  // linkni ko'rmaydi va bu yerga to'g'ridan-to'g'ri (yoki eski
  // «?tab=markaz» havolasi orqali) kirsa /payments ga qaytariladi. Qaytariladigan
  // pul sahifasi o'qituvchiga yopiq: u yerda har bir so'rov 403 qaytaradi.
  const blocked =
    !!user &&
    ROLE_GATED_PATHS.some(
      (p) => pathname.startsWith(p.prefix) && !user.roles.some((r) => p.roles.includes(r.id)),
    );

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
