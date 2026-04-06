"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MOBILE_BREAKPOINT = 768;

export default function PaymentsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT) {
      router.replace("/payments/overview");
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return null;
}
