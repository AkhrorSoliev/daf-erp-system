"use client";

import { Ban, Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";
import { issuedDay, revokedState } from "./certificate-rules";
import type { IssuedCertificate } from "./certificate-types";

/**
 * The issued documents of one level. A cancelled row keeps its number (struck
 * through), says why, and has no PDF; a standing row has the PDF and, for a
 * caller who may cancel, a ⋯ menu with «Hujjatni bekor qilish».
 */
export function IssuedDocumentsList({
  rows,
  canRevoke,
  onDownload,
  onRevoke,
}: {
  rows: IssuedCertificate[];
  canRevoke: boolean;
  onDownload: (row: IssuedCertificate) => void;
  onRevoke: (row: IssuedCertificate) => void;
}) {
  const t = useT();
  return (
    <ul className="divide-y rounded-md border text-sm">
      {rows.map((row) => {
        const gone = revokedState(row, t);
        return (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className={gone ? "font-medium text-muted-foreground line-through" : "font-medium"}>
              {row.number}
            </span>
            <span className="text-muted-foreground">
              {issuedDay(row.issuedAt)}
              {row.exempt && (
                <>
                  {" · "}
                  {t("istisno bilan")}
                </>
              )}
            </span>
            {gone ? (
              <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {gone.pill}
                </span>
                {gone.day && <span className="text-xs text-muted-foreground">{gone.day}</span>}
                {gone.reasonLine && <span className="text-xs text-muted-foreground">{gone.reasonLine}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onDownload(row)}>
                  <Download className="size-4" />
                  PDF
                </Button>
                {canRevoke && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">{t("Amallar")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                          e.preventDefault();
                          onRevoke(row);
                        }}
                      >
                        <Ban className="mr-2 size-4" />
                        {t("Hujjatni bekor qilish")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
