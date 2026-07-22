"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, GitBranch, Phone, Tag, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/hooks/use-leads-board";

interface LinkedLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  createdAt: string;
  statusChangedAt: string | null;
  deletedAt: string | null;
  source: { id: string; name: string } | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string };
  } | null;
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function StudentLeadTab({ studentId }: { studentId: number }) {
  const [leads, setLeads] = useState<LinkedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    api
      .get<LinkedLead[]>(`/leads/by-student/${studentId}`)
      .then(({ data }) => setLeads(data))
      .catch((error) => {
        toast.error(getErrorMessage(error, "Lid tarixini yuklashda xatolik"));
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <GitBranch className="size-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          Bu o&apos;quvchi lid orqali kelmagan
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {leads.map((lead) => (
        <div key={lead.id} className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {lead.firstName} {lead.lastName}
              </p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {LEAD_STATUS_LABELS[lead.statusEnum] ?? lead.statusEnum}
                {lead.deletedAt ? " · arxiv" : ""}
              </span>
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <InfoRow
                icon={<Phone className="size-3.5" />}
                label="Telefon"
                value={formatPhone(lead.phone)}
              />
              <InfoRow
                icon={<Tag className="size-3.5" />}
                label="Manba"
                value={lead.source?.name ?? "—"}
              />
              <InfoRow
                icon={<GitBranch className="size-3.5" />}
                label="Bo'lim"
                value={
                  lead.section
                    ? `${lead.section.column.name} · ${lead.section.name}`
                    : "—"
                }
              />
              <InfoRow
                icon={<UserCheck className="size-3.5" />}
                label="Yaratilgan"
                value={format(parseISO(lead.createdAt), "dd.MM.yyyy")}
              />
              {lead.statusChangedAt && (
                <InfoRow
                  icon={<CalendarClock className="size-3.5" />}
                  label="Aylantirilgan"
                  value={format(parseISO(lead.statusChangedAt), "dd.MM.yyyy")}
                />
              )}
            </div>
          </div>
          <EntityHistoryTable entityType="Lead" entityId={lead.id} />
        </div>
      ))}
    </div>
  );
}
