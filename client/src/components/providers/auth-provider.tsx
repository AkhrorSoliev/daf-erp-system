"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PermissionsSync } from "./permissions-sync";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { hydrate } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <PermissionsSync />
      {children}
    </>
  );
}
