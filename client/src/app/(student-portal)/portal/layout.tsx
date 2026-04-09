import { StudentPortalLayout } from "@/components/student-portal/student-portal-layout";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudentPortalLayout>{children}</StudentPortalLayout>;
}
