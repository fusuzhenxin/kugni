import type { Metadata } from "next";
import { WorkspaceLogin } from "@/components/workspace-login";
export const metadata: Metadata = {
  title: "站长工作台登录",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <WorkspaceLogin surface="publisher" />;
}
