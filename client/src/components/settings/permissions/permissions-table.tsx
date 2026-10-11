"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PermissionKey } from "@/lib/permission-keys";
import { cn } from "@/lib/utils";
import { cellState, sectionCount, sectionCountLabel } from "./permissions-model";
import type { CatalogEntry, PermissionsOverview } from "./permissions-types";

type Toggle = (roleId: number, key: PermissionKey, on: boolean) => void;
type Section = PermissionsOverview["sections"][number];

interface PermissionsTableProps {
  overview: PermissionsOverview;
  /** Columns to draw: every editable role on a wide screen, the picked one on a phone. */
  roleIds: number[];
  onToggle: Toggle;
  /** «Boshlang'ich holatga qaytarish» for one role; shown only for a role that differs from the default. */
  onReset: (roleId: number) => void;
  busy: boolean;
}

interface RowContext {
  overview: PermissionsOverview;
  roleIds: number[];
  roleLabels: Map<number, string>;
  cols: CSSProperties;
  onToggle: Toggle;
  busy: boolean;
}

const DANGER_TEXT = {
  money: "Pulni o'zgartiradi",
  irreversible: "Qaytarib bo'lmaydi",
} as const;

function ResetButton({
  roleLabel,
  disabled,
  onClick,
}: {
  roleLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${roleLabel}: boshlang'ich holatga qaytarish`}
      className="h-auto gap-1 px-1.5 py-0.5 text-xs font-normal whitespace-normal text-muted-foreground"
    >
      <RotateCcw className="size-3 shrink-0" />
      Boshlang'ich holatga qaytarish
    </Button>
  );
}

/** Capabilities as rows in collapsible sections, roles as columns (spec §8). Every decision is the model's. */
export function PermissionsTable({
  overview,
  roleIds,
  onToggle,
  onReset,
  busy,
}: PermissionsTableProps) {
  const single = roleIds.length === 1;
  // The reset button shows only when the role has something to reset (spec §8).
  const changed = (roleId: number) =>
    overview.catalog.some((e) => cellState(overview, e.key, roleId).differs);
  const ctx: RowContext = {
    overview,
    roleIds,
    roleLabels: new Map<number, string>(overview.roles.map((r) => [r.id, r.label] as const)),
    // The column count follows the Role rows the server sent, so it is a style, not a class.
    cols: {
      gridTemplateColumns: single
        ? "minmax(0, 1fr) auto"
        : `minmax(0, 1fr) repeat(${roleIds.length}, 7rem)`,
    },
    onToggle,
    busy,
  };

  return (
    <div className={cn(!single && "overflow-x-auto")}>
      <div className={cn("space-y-2", !single && "min-w-[44rem]")}>
        {single ? (
          changed(roleIds[0]) && (
            <div className="flex justify-end">
              <ResetButton
                roleLabel={ctx.roleLabels.get(roleIds[0]) ?? ""}
                disabled={busy}
                onClick={() => onReset(roleIds[0])}
              />
            </div>
          )
        ) : (
          <div
            className="grid items-start gap-x-2 px-3 text-xs font-medium text-muted-foreground"
            style={ctx.cols}
          >
            <span className="pt-1">Imkoniyat</span>
            {roleIds.map((roleId) => (
              <div key={roleId} className="flex flex-col items-center gap-1 text-center">
                <span className="pt-1">{ctx.roleLabels.get(roleId)}</span>
                {changed(roleId) && (
                  <ResetButton
                    roleLabel={ctx.roleLabels.get(roleId) ?? ""}
                    disabled={busy}
                    onClick={() => onReset(roleId)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {overview.sections.map((section) => (
          <PermissionSection key={section.key} section={section} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}

function PermissionSection({ section, ctx }: { section: Section; ctx: RowContext }) {
  const [open, setOpen] = useState(false);
  const entries = ctx.overview.catalog.filter((e) => e.section === section.key);
  if (entries.length === 0) return null;
  const single = ctx.roleIds.length === 1;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="grid w-full items-center gap-x-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/50"
          style={ctx.cols}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
            {section.label}
          </span>
          {ctx.roleIds.map((roleId) => (
            <span
              key={roleId}
              className={cn(
                "text-xs text-muted-foreground tabular-nums",
                single ? "text-right" : "text-center",
              )}
            >
              {sectionCountLabel(sectionCount(ctx.overview, section.key, roleId))}
            </span>
          ))}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {entries.map((entry) => (
            <PermissionRow key={entry.key} entry={entry} ctx={ctx} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PermissionRow({ entry, ctx }: { entry: CatalogEntry; ctx: RowContext }) {
  const single = ctx.roleIds.length === 1;
  // A phone has room for the reason under the label; a wide screen shows it on the lock.
  const phoneLock = single ? cellState(ctx.overview, entry.key, ctx.roleIds[0]).lockReason : null;

  return (
    <div className="grid items-center gap-x-2 px-3 py-2" style={ctx.cols}>
      <div className="min-w-0 pl-6">
        <p className="flex items-start gap-2 text-sm">
          <span>{entry.label}</span>
          {entry.danger && <DangerMark danger={entry.danger} />}
        </p>
        {phoneLock && (
          <p className="mt-0.5 text-xs text-muted-foreground">Berib bo'lmaydi: {phoneLock}</p>
        )}
      </div>
      {ctx.roleIds.map((roleId) => (
        <div key={roleId} className="flex justify-center">
          <PermissionCell entry={entry} roleId={roleId} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

function PermissionCell({
  entry,
  roleId,
  ctx,
}: {
  entry: CatalogEntry;
  roleId: number;
  ctx: RowContext;
}) {
  const state = cellState(ctx.overview, entry.key, roleId);
  const name = `${ctx.roleLabels.get(roleId) ?? ""}: ${entry.label}`;
  if (state.locked) return <LockMark name={name} reason={state.lockReason ?? ""} />;

  return (
    <span className="relative inline-flex items-center">
      <Switch
        checked={state.granted}
        disabled={ctx.busy}
        aria-label={name}
        onCheckedChange={(on) => ctx.onToggle(roleId, entry.key, on)}
      />
      {state.differs && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Boshlang'ich holatdan farq qiladi"
              className="absolute top-1/2 -right-3.5 size-2 -translate-y-1/2 rounded-full bg-yellow-500"
            />
          </TooltipTrigger>
          <TooltipContent>Boshlang'ich holatdan farq qiladi</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** A locked cell. Radix opens a tooltip on hover and focus only; the click handler adds the tap. */
function LockMark({ name, reason }: { name: string; reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${name} — berib bo'lmaydi: ${reason}`}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={(event) => {
            // Radix closes the tooltip on click unless the event is prevented.
            event.preventDefault();
            setOpen(true);
          }}
        >
          <Lock className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Berib bo'lmaydi: {reason}</TooltipContent>
    </Tooltip>
  );
}

function DangerMark({ danger }: { danger: keyof typeof DANGER_TEXT }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={DANGER_TEXT[danger]}
          className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-red-500"
        />
      </TooltipTrigger>
      <TooltipContent>{DANGER_TEXT[danger]}</TooltipContent>
    </Tooltip>
  );
}
