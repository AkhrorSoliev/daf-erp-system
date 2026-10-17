"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { skinAttribute } from "@/lib/ui-skins";

/**
 * Keeps `<html data-skin>` equal to the signed-in user's design skin
 * (ADR-0097). The inline boot script in `layout.tsx` has already set it from
 * the cookie before first paint; this follows the store afterwards (a skin
 * chosen in the menu, a refreshed session). It does nothing while nobody is
 * signed in: at mount the store is still empty for one tick (`hydrate` runs
 * after this effect), and clearing the attribute then would flash the default.
 * Signing out is a full page load, which starts without the cookie.
 */
export function SkinSync() {
  const signedIn = useAuth((s) => s.user !== null);
  const uiSkin = useAuth((s) => s.user?.uiSkin);

  useEffect(() => {
    if (!signedIn) return;
    const attribute = skinAttribute(uiSkin);
    const root = document.documentElement;
    if (attribute) root.setAttribute("data-skin", attribute);
    else root.removeAttribute("data-skin");
  }, [signedIn, uiSkin]);

  return null;
}
