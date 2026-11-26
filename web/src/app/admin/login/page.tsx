import type { Metadata } from "next";
import { WorkspaceLogin } from "@/components/workspace-login";
export const metadata: Metadata = {
  title: "平台管理登录",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <WorkspaceLogin surface="platform" />;
}
