import { DashboardLayout } from "@/app/dashboard/layout";

export default function FilesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
