"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";

export function AppBreadcrumb() {
  const pathname = usePathname();
  const { names } = useBreadcrumbName();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  // "profile" segment ni o'tkazib yuborish — /students/profile/123 → Bosh sahifa > O'quvchilar > [Ism]
  const filtered = segments.filter((s) => s !== "profile");

  const crumbs = filtered.map((segment, index) => {
    const url = "/" + segments.slice(0, segments.indexOf(segment) + 1).join("/");
    const label = routeLabels[segment] ?? names[segment] ?? segment;
    const isLast = index === filtered.length - 1;

    // profile dan keyingi segment uchun to'liq URL berish
    const actualUrl = isLast && segments.includes("profile")
      ? "/" + segments.join("/")
      : url;

    return { url: actualUrl, label, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Bosh sahifa</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb) => (
          <Fragment key={crumb.url}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.url}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
