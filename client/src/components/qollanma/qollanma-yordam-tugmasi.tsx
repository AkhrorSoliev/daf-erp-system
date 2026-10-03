"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { sahifalar } from "@/qollanma/sahifalar";
import { sahifalarRolUchun } from "@/qollanma/rol-filtri";
import { sahifalarYolUchun } from "@/qollanma/yol-moslash";
import { QollanmaSheet } from "./qollanma-sheet";

/** Ochiq ERP sahifasiga mos qo'llanma bo'lsa chiqadi; bo'lmasa hech narsa. */
export function QollanmaYordamTugmasi() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const [ochiq, setOchiq] = useState(false);

  if (!user || pathname.startsWith("/qollanma")) return null;
  const mos = sahifalarRolUchun(sahifalarYolUchun(sahifalar, pathname), user.roles.map((r) => r.id));
  if (mos.length === 0) return null;
  const [asosiy, ...boshqalar] = mos;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Shu sahifa bo'yicha qo'llanma" onClick={() => setOchiq(true)}>
            <CircleHelp className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Shu sahifa bo&apos;yicha qo&apos;llanma</TooltipContent>
      </Tooltip>
      <QollanmaSheet ochiq={ochiq} onOchiqChange={setOchiq} sahifa={asosiy} boshqalar={boshqalar} />
    </>
  );
}
