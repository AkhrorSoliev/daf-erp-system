"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogCallDialog } from "@/components/outreach/log-call-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useTasks, type TaskDetail, type TaskSource } from "@/hooks/use-tasks";
import { sourceAction, sourceFacts } from "./task-source-rules";

/**
 * Spec screen 10: what a system task is about and the one button that does
 * the job. The facts are read live, so a closed task shows today's picture,
 * not the one it was closed on («Hozirgi holat»). Saving the call closes the
 * task on the server; closing the dialog re-reads the drawer, as the join
 * request panel does after a decision.
 */
export function TaskSourceCard({ task, source }: { task: TaskDetail; source: TaskSource }) {
  const can = usePermissions((s) => s.can);
  const [calling, setCalling] = useState(false);
  const action = sourceAction(task, source, can);
  return (
    <section className="space-y-3 rounded-md border p-3">
      <h4 className="text-xs font-medium text-muted-foreground">Hozirgi holat</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {sourceFacts(source).map((f) => (
          <Fragment key={f.label}>
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0 break-words">{f.value}</dd>
          </Fragment>
        ))}
      </dl>
      {action?.kind === "call" && (
        <>
          <Button size="sm" className="w-full" onClick={() => setCalling(true)}>
            <Phone className="mr-1 size-4" />{action.label}
          </Button>
          <LogCallDialog
            open={calling}
            onOpenChange={(open) => {
              setCalling(open);
              if (!open) void useTasks.getState().reloadDetail(task.id);
            }}
            prefill={action.prefill}
          />
        </>
      )}
      {action?.kind === "lead" && (
        <Button size="sm" className="w-full" asChild>
          <Link href={action.href}><ExternalLink className="mr-1 size-4" />{action.label}</Link>
        </Button>
      )}
    </section>
  );
}
