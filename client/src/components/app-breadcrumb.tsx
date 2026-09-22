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

  // Pass-through segmentlar — o'zi ochiladigan sahifa emas, ID'li haqiqiy
  // sahifaga o'tishdagi oraliq bosqich: /students/profile/123 da "profile",
  // /media/sections/7 da "sections". Breadcrumbda ko'rinmaydi — aks holda
  // mavjud bo'lmagan "/students/profile" yoki "/media/sections" ro'yxatiga
  // havola bo'lib qolardi (ko'rik: "Bo'limlar" degan label 404'ga olib
  // borardi — to'g'ri tuzatish label emas, shu filtr edi).
  const PASS_THROUGH_SEGMENTS = new Set(["profile", "sections"]);
  const filtered = segments.filter((s) => !PASS_THROUGH_SEGMENTS.has(s));

  const crumbs = filtered.map((segment, index) => {
    const url = "/" + segments.slice(0, segments.indexOf(segment) + 1).join("/");
    const label = routeLabels[segment] ?? names[segment] ?? segment;
    const isLast = index === filtered.length - 1;

    // Pass-through segmentdan keyingi so'nggi segment uchun to'liq URL berish
    const actualUrl = isLast && segments.some((s) => PASS_THROUGH_SEGMENTS.has(s))
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
