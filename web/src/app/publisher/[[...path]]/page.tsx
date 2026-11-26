import type { Metadata } from "next";
import { AdminApp } from "@/components/admin-app";
export const metadata: Metadata = {
  title: "站长推广工作台",
  robots: { index: false, follow: false },
};
export default function PublisherPage() {
  return <AdminApp surface="publisher" />;
}
