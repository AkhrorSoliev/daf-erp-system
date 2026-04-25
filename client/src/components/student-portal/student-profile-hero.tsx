"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, Calendar, MapPin, Wallet } from "lucide-react";
import { format } from "date-fns";
import { formatPhone } from "@/lib/format-utils";

interface StudentProfile {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  balance: number;
  status: string;
  dateOfBirth: string | null;
  address: string | null;
  branches: { id: number; name: string }[];
}

function formatBalance(balance: number) {
  return balance.toLocaleString("en-US");
}

const statusMap: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: "Faol",
    className:
      "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  INACTIVE: {
    label: "Muzlatilgan",
    className:
      "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  GRADUATED: {
    label: "Bitirgan",
    className:
      "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
  },
  EXPELLED: { label: "Chetlatilgan", className: "" },
  ARCHIVED: { label: "Arxivlangan", className: "" },
};

export function StudentProfileHero({ student }: { student: StudentProfile }) {
  const initials = `${student.firstName?.[0] ?? ""}${student.lastName?.[0] ?? ""}`;
  const isPositive = student.balance >= 0;
  const status = statusMap[student.status] ?? {
    label: student.status,
    className: "",
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex flex-col items-center gap-3 text-center md:flex-row md:text-left">
        <Avatar className="size-20">
          <AvatarImage src={student.photo ?? undefined} />
          <AvatarFallback className="text-2xl font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold">{student.firstName} {student.lastName}</h2>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-1">
            <span className="text-sm text-muted-foreground">ID: {student.id}</span>
            <Badge variant="outline" className={status.className || undefined}>
              {status.label}
            </Badge>
            {student.branches.map((b) => (
              <Badge key={b.id} variant="outline" className="text-xs">
                {b.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone className="size-3.5" />
          <span>{formatPhone(student.phone)}</span>
        </div>
        {student.dateOfBirth && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-3.5" />
            <span>{format(new Date(student.dateOfBirth), "dd.MM.yyyy")}</span>
          </div>
        )}
        {student.address && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-3.5" />
            <span>{student.address}</span>
          </div>
        )}
      </div>

      <Separator className="my-4" />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Balans</p>
          <p
            className={`text-lg font-bold ${
              isPositive
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {isPositive ? "" : "-"}{formatBalance(Math.abs(student.balance))} so&apos;m
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/portal/payments">
            <Wallet className="mr-1.5 size-4" />
            To&apos;ldirish
          </Link>
        </Button>
      </div>
    </div>
  );
}
